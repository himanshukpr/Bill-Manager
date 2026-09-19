import {
  IsString,
  IsOptional,
  IsNumber,
  IsInt,
  IsBoolean,
  IsUUID,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';

export class CreateCashHouseDto {
  @IsString()
  houseNo: string;

  @IsOptional()
  @IsString()
  area?: string;

  @IsOptional()
  @IsString()
  phoneNo?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  position?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  previousBalance?: number;
}

export class UpdateCashHouseDto extends PartialType(CreateCashHouseDto) {
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  active?: boolean;
}

export class ReorderCashHousesDto {
  @IsInt({ each: true })
  ids: number[];
}
