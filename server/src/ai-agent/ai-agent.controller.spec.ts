import { INestApplication, NotFoundException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { of } from 'rxjs';
import request from 'supertest';
import { AiAgentController } from './ai-agent.controller';
import { AgentService } from './services/agent/agent.service';
import { ChatSessionService } from './services/chat/chat-session.service';
import { MemoryService } from './services/memory/memory.service';
import { TtsService } from './services/tts/tts.service';

// Checks the transport only: @Sse with a POST method option must accept a JSON body and stream frames.
describe('AiAgentController POST chat/stream (SSE)', () => {
  let app: INestApplication;
  const chatStream = vi.fn(async (_userId: string, _dto: unknown) =>
    of({ data: '{"type":"text","content":"hi"}' }, { data: '{"type":"done"}' }),
  );

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AiAgentController],
      providers: [
        { provide: AgentService, useValue: { chatStream } },
        { provide: MemoryService, useValue: {} },
        { provide: TtsService, useValue: {} },
        { provide: ChatSessionService, useValue: {} },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    // The spec has no JwtAuthGuard: set req.user the way the guard would
    app.use((req: any, _res: any, next: () => void) => {
      req.user = { userId: 'user-1' };
      next();
    });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(() => app.close());

  it('streams data frames for a POST with a JSON body', async () => {
    const res = await request(app.getHttpServer())
      .post('/ai-agent/chat/stream')
      .send({ message: 'xin chào' });

    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.text).toContain('data: {"type":"text","content":"hi"}');
    expect(res.text).toContain('data: {"type":"done"}');
    expect(chatStream.mock.calls[0][0]).toBe('user-1');
    expect(chatStream.mock.calls[0][1]).toMatchObject({ message: 'xin chào' });
  });

  it('rejects a body without a message and a sessionId that is not a UUID', async () => {
    await request(app.getHttpServer())
      .post('/ai-agent/chat/stream')
      .send({})
      .expect(400);
    await request(app.getHttpServer())
      .post('/ai-agent/chat/stream')
      .send({ message: 'x', sessionId: 'not-a-uuid' })
      .expect(400);
  });

  it('answers HTTP 404 when chatStream rejects (unknown or foreign session)', async () => {
    chatStream.mockRejectedValueOnce(new NotFoundException('Không tìm thấy phiên chat'));

    const res = await request(app.getHttpServer())
      .post('/ai-agent/chat/stream')
      .send({ message: 'x', sessionId: '11111111-1111-4111-8111-111111111111' })
      .expect(404);

    expect(res.headers['content-type']).toContain('application/json');
  });

  it('is not registered as GET any more', async () => {
    await request(app.getHttpServer()).get('/ai-agent/chat/stream').expect(404);
  });
});
