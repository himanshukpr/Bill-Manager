import { Type } from 'class-transformer';
import { IsNumber, IsOptional, Min } from 'class-validator';

export class UpdateHouseBalanceDto {
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    previousBalance?: number;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    currentBalance?: number;
}