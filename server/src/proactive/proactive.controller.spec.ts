import { Test, TestingModule } from '@nestjs/testing';
import { ProactiveController } from './proactive.controller';

describe('ProactiveController', () => {
  let controller: ProactiveController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProactiveController],
    }).compile();

    controller = module.get<ProactiveController>(ProactiveController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
