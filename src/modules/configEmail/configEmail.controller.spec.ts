import { Test, TestingModule } from '@nestjs/testing';
import { ConfigEmailController } from './configEmail.controller';

describe('ConfigEmailController', () => {
  let controller: ConfigEmailController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ConfigEmailController],
    }).compile();

    controller = module.get<ConfigEmailController>(ConfigEmailController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
