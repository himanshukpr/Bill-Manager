import { IsString, IsOptional, IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';

export class CreateHouseDto {
  @IsString()
  houseNo: string;

  @IsOptional()
  @IsString()
  area?: string;

  @IsString()
  phoneNo: string;

  @IsOptional()
  @IsString()
  alternativePhone?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  rate1Type?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  rate1?: number;

  @IsOptional()
  @IsString()
  rate2Type?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  rate2?: number;
}

export class UpdateHouseDto extends PartialType(CreateHouseDto) {}

export class UpdateHouseLocationDto {
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude: number;

  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude: number;
}
