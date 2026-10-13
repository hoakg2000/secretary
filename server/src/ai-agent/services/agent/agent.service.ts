import { FunctionDeclaration, GoogleGenAI, Type } from '@google/genai';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { Observable, Subject } from 'rxjs';
import {
  AI_TOOL_METADATA_KEY,
  AiToolOptions,
} from '../../../common/decorators/ai-tool.decorator';
import { PrismaService } from '../../../prisma/prisma.service';
import { ChatStreamDto } from '../../dto/chat-stream.dto';

interface DiscoveredTool {
  definition: FunctionDeclaration;
  instance: any;
  methodName: string;
}

@Injectable()
export class AgentService implements OnModuleInit {
  private readonly logger = new Logger(AgentService.name);
  private readonly ai: GoogleGenAI;
  private readonly toolsMap = new Map<string, DiscoveredTool>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly discoveryService: DiscoveryService,
    private readonly metadataScanner: MetadataScanner,
    private readonly reflector: Reflector,
  ) {
    this.ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY || '',
    });
  }

  /**
   * Tự động quét và đăng ký tất cả các hàm có gắn @AiTool() khi ứng dụng khởi chạy
   */
  onModuleInit() {
    this.discoverAiTools();
  }

  private discoverAiTools() {
    const providers = this.discoveryService.getProviders();

    for (const wrapper of providers) {
      const { instance } = wrapper;
      if (!instance || typeof instance !== 'object') continue;

      const prototype = Object.getPrototypeOf(instance);
      const methodNames = this.metadataScanner.getAllMethodNames(prototype);

      for (const methodName of methodNames) {
        const method = instance[methodName];
        const metadata: AiToolOptions = this.reflector.get(
          AI_TOOL_METADATA_KEY,
          method,
        );

        if (metadata && metadata.name) {
          const properties: Record<string, any> = {};
          const required: string[] = [];

          if (metadata.parameters) {
            for (const [key, param] of Object.entries(metadata.parameters)) {
              properties[key] = {
                type: param.type.toUpperCase() as Type,
                description: param.description,
                enum: param.enum,
              };
              if (param.required) {
                required.push(key);
              }
            }
          }

          const functionDeclaration: FunctionDeclaration = {
            name: metadata.name,
            description: metadata.description,
            parameters: {
              type: Type.OBJECT,
              properties,
              required,
            },
          };

          this.toolsMap.set(metadata.name, {
            definition: functionDeclaration,
            instance,
            methodName,
          });

          this.logger.log(`[AgentService] Đã đăng ký AiTool: ${metadata.name}`);
        }
      }
    }
  }

  /**
   * Lấy Persona / System Prompt của Active Character
   */
  private async getSystemPrompt(characterId?: string): Promise<string> {
    const character = characterId
      ? await this.prisma.character.findUnique({
          where: { id: characterId },
          include: { personas: true },
        })
      : await this.prisma.character.findFirst({
          where: { isActive: true },
          include: { personas: true },
        });

    if (!character || character.personas.length === 0) {
      return 'Bạn là một Trợ lý AI cá nhân hóa thông minh, lịch sự và chu đáo.';
    }

    const personaTexts = character.personas
      .map((p) => `[${p.type}]: ${p.value}`)
      .join('\n');

    return `Tên nhân vật: ${character.name}\n${personaTexts}`;
  }

  /**
   * Stream câu trả lời qua SSE kết hợp vòng lặp Function Calling
   */
  chatStream(dto: ChatStreamDto): Observable<{ data: string }> {
    const subject = new Subject<{ data: string }>();

    (async () => {
      try {
        const systemPrompt = await this.getSystemPrompt(dto.characterId);
        const functionDeclarations = Array.from(this.toolsMap.values()).map(
          (t) => t.definition,
        );

        // Khởi tạo Chat Session với Gemini Model
        const chat = this.ai.chats.create({
          model: 'gemini-2.5-flash',
          config: {
            systemInstruction: systemPrompt,
            tools:
              functionDeclarations.length > 0
                ? [{ functionDeclarations }]
                : undefined,
          },
        });

        let response = await chat.sendMessage({ message: dto.message });

        // Vòng lặp ReAct / Tool Calling Loop
        while (response.functionCalls && response.functionCalls.length > 0) {
          for (const call of response.functionCalls) {
            const toolName = call.name;
            if (!toolName) continue; // Kiểm tra bảo vệ tránh lỗi undefined string

            const tool = this.toolsMap.get(toolName);

            if (tool) {
              subject.next({
                data: JSON.stringify({
                  type: 'tool_call',
                  tool: call.name,
                  args: call.args,
                }),
              });

              // Thực thi phương thức AiTool tương ứng
              const toolResult = await tool.instance[tool.methodName](
                call.args,
              );

              subject.next({
                data: JSON.stringify({
                  type: 'tool_result',
                  tool: call.name,
                  result: toolResult,
                }),
              });

              // Gửi kết quả Tool về lại cho LLM với đúng định dạng SendMessageParameters
              response = await chat.sendMessage({
                message: [
                  {
                    functionResponse: {
                      name: call.name,
                      response: { result: toolResult },
                    },
                  },
                ],
              });
            }
          }
        }

        // Trả về câu trả lời hoàn chỉnh dạng text stream cho Client
        if (response.text) {
          subject.next({
            data: JSON.stringify({
              type: 'text',
              content: response.text,
            }),
          });
        }

        subject.next({ data: JSON.stringify({ type: 'done' }) });
        subject.complete();
      } catch (error: any) {
        this.logger.error('Lỗi trong quá trình ChatStream:', error);
        subject.next({
          data: JSON.stringify({
            type: 'error',
            message: error.message || 'Đã xảy ra lỗi khi xử lý chat AI',
          }),
        });
        subject.complete();
      }
    })();

    return subject.asObservable();
  }
}
