import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { GeocodingController } from './geocoding.controller';
import { GeocodingService } from './geocoding.service';

@Module({
  imports: [HttpModule],
  controllers: [GeocodingController],
  providers: [GeocodingService],
})
export class GeocodingModule {}
