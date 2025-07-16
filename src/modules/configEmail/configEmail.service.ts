import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigEmailDto } from 'src/dto/configEmail.dto';
import { ConfigEmail } from 'src/entities/configEmail.entity';
import { Repository } from 'typeorm';

@Injectable()
export class ConfigEmailService {
  constructor(
    @InjectRepository(ConfigEmail)
    private configEmailRepository: Repository<ConfigEmail>,
  ) {}

  async findConfigEmail(): Promise<{ data: ConfigEmail[] }> {
    const result = await this.configEmailRepository.find();
    return {
      data: result,
    };
  }

  async createConfigEmail(dto: ConfigEmailDto): Promise<{ data: ConfigEmail }> {
    const configEmail = this.configEmailRepository.create(dto);
    const saveConfig = await this.configEmailRepository.save(configEmail);
    return {
      data: saveConfig,
    };
  }

  async updateConfigEmail(
    id: string,
    dto: ConfigEmailDto,
  ): Promise<{ data: ConfigEmail | null }> {
    await this.configEmailRepository.update(id, dto);
    const updatedConfig = await this.configEmailRepository.findOneBy({ id });
    return {
      data: updatedConfig,
    };
  }
}
