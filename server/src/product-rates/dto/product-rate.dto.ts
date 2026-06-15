import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateProductRateDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  unit?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  rate: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateProductRateDto extends PartialType(CreateProductRateDto) {}

export class ReorderProductRatesDto {
  @IsArray()
  @IsInt({ each: true })
  ids: number[];
}

