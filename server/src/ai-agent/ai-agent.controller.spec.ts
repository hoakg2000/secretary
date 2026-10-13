import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { of } from 'rxjs';
import request from 'supertest';
import { AiAgentController } from './ai-agent.controller';
import { AgentService } from './services/agent/agent.service';
import { MemoryService } from './services/memory/memory.service';
import { TtsService } from './services/tts/tts.service';

// Checks the transport only: @Sse with a POST method option must accept a JSON body and stream frames.
describe('AiAgentController POST chat/stream (SSE)', () => {
  let app: INestApplication;
  const chatStream = vi.fn((_dto: unknown) =>
    of({ data: '{"type":"text","content":"hi"}' }, { data: '{"type":"done"}' }),
  );

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AiAgentController],
      providers: [
        { provide: AgentService, useValue: { chatStream } },
        { provide: MemoryService, useValue: {} },
        { provide: TtsService, useValue: {} },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(() => app.close());

  it('streams data frames for a POST with a JSON body', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/ai-agent/chat/stream')
      .send({ message: 'xin chào', history: [{ role: 'user', text: 'Tên tôi là Hoa' }] });

    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.text).toContain('data: {"type":"text","content":"hi"}');
    expect(res.text).toContain('data: {"type":"done"}');
    expect(chatStream.mock.calls[0][0]).toMatchObject({ message: 'xin chào' });
  });

  it('rejects a body without a message and an oversized history', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/ai-agent/chat/stream')
      .send({})
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/ai-agent/chat/stream')
      .send({ message: 'x', history: Array(21).fill({ role: 'user', text: 'a' }) })
      .expect(400);
  });

  it('is not registered as GET any more', async () => {
    await request(app.getHttpServer()).get('/api/v1/ai-agent/chat/stream').expect(404);
  });
});
