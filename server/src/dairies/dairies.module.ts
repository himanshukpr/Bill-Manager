import { Module } from '@nestjs/common';
import { DairiesController } from './dairies.controller';
import { DairiesService } from './dairies.service';

@Module({
  controllers: [DairiesController],
  providers: [DairiesService],
  exports: [DairiesService],
})
export class DairiesModule {}
