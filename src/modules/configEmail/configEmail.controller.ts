import { Controller } from '@nestjs/common';
import { ConfigEmailService } from './configEmail.service';
import { Body, Post, Put, Param, Get } from '@nestjs/common';
import { ConfigEmailDto } from '../../dto/configEmail.dto';

@Controller('config-email')
export class ConfigEmailController {
  constructor(private readonly configEmailService: ConfigEmailService) {}

  @Get()
  getConfigEmail() {
    return this.configEmailService.findConfigEmail();
  }

  @Post()
  addConfigEmail(@Body() configEmailDto: ConfigEmailDto) {
    return this.configEmailService.createConfigEmail(configEmailDto);
  }

  @Put(':id')
  editConfigEmail(
    @Param('id') id: string,
    @Body() configEmailDto: ConfigEmailDto,
  ) {
    return this.configEmailService.updateConfigEmail(id, configEmailDto);
  }
}
