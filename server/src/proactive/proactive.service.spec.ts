import { Test, TestingModule } from '@nestjs/testing';
import { ProactiveService } from './proactive.service';

describe('ProactiveService', () => {
  let service: ProactiveService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ProactiveService],
    }).compile();

    service = module.get<ProactiveService>(ProactiveService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
