import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';

export class RecordPaymentDto {
  @Type(() => Number)
  @IsInt()
  houseId: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsArray()
  @Type(() => Number)
  billIds?: number[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discount?: number;
}

export class UpdatePreviousBalanceDto {
  @Type(() => Number)
  @IsNumber()
  previousBalance: number;
}

export class UpdateCurrentBalanceDto {
  @Type(() => Number)
  @IsNumber()
  currentBalance: number;
}
