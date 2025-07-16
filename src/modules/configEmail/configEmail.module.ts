import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigEmail } from '../../entities/configEmail.entity';
import { ConfigEmailService } from './configEmail.service';
import { ConfigEmailController } from './configEmail.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ConfigEmail])],
  providers: [ConfigEmailService],
  controllers: [ConfigEmailController],
  exports: [ConfigEmailService],
})
export class ConfigEmailModule {}