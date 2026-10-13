import { Test } from '@nestjs/testing';
import { AppModule } from './app.module';

// Resolves the whole dependency graph (no DB/Redis calls: lifecycle hooks are not run).
describe('AppModule', () => {
  it('wires every provider', async () => {
    process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/db';
    process.env.JWT_SECRET ??= 'a'.repeat(32);
    process.env.JWT_REFRESH_SECRET ??= 'b'.repeat(32);
    process.env.REDIS_HOST ??= 'localhost';
    process.env.REDIS_PORT ??= '6379';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    expect(moduleRef).toBeDefined();
    await moduleRef.close();
  });
});
