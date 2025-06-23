import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  Get,
  Query,
  UseGuards,
  Param,
  Body,
  Res,
  Put,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import * as XLSX from 'xlsx';
import { TransactionsService } from './transactions.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { Response } from 'express';
import { GetUser } from 'src/auth/get-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionService: TransactionsService) {}

  @Post('upload-ipcas')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads',
        filename: (req, file, callback) => {
          const filename = `${Date.now()}${extname(file.originalname)}`;
          callback(null, filename);
        },
      }),
      fileFilter: (req, file, callback) => {
        if (!file.originalname.match(/\.(xlsx|xls)$/)) {
          return callback(
            new BadRequestException('Only Excel files are allowed'),
            false,
          );
        }
        callback(null, true);
      },
    }),
  )
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const workbook = XLSX.readFile(file.path, {
      cellDates: true,
      dateNF: 'dd/mm/yyyy',
    });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawData = XLSX.utils.sheet_to_json(sheet);

    const count = await this.transactionService.importFromExcel(rawData);

    return { message: 'Imported', count };
  }

  @Get()
  async findAll(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('search') search: string,
  ) {
    const pageNumber = parseInt(page) || 1;
    const limitNumber = parseInt(limit) || 10;
    return this.transactionService.findAllPaginated(
      pageNumber,
      limitNumber,
      search,
    );
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return this.transactionService.findById(+id);
  }

  @Get('status/:status')
  async findByStatus(
    @Param('status') status: 'Chưa bổ sung' | 'Quá hạn' | 'Đã bổ sung',
    @Query('page') page: string,
    @Query('limit') limit: string,
  ) {
    if (!['Chưa bổ sung', 'Quá hạn', 'Đã bổ sung'].includes(status)) {
      throw new BadRequestException('Invalid status');
    }
    const pageNumber = parseInt(page) || 1;
    const limitNumber = parseInt(limit) || 10;
    return this.transactionService.findByStatus(
      status,
      pageNumber,
      limitNumber,
    );
  }

  @Get('report/:status')
  async exportReport(
    @Param('status') status: 'Chưa bổ sung' | 'Quá hạn',
    @Res() res: Response,
  ) {
    if (!['Chưa bổ sung', 'Quá hạn'].includes(status)) {
      throw new BadRequestException('Invalid status');
    }

    const buffer = await this.transactionService.exportToExcel(status);

    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename=report-${status}-${Date.now()}.xlsx`,
    });

    res.send(buffer);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() updateData: { status?: string; note?: string },
    @GetUser() user: { id: number; fullName: string },
  ) {
    return this.transactionService.updateCustomer(+id, updateData, user);
  }
}
