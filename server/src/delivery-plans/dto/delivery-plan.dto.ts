import { Type } from 'class-transformer';
import { IsNumber, IsString, Min } from 'class-validator';

export class CreateDeliveryPlanDto {
  @IsString()
  product_name!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  quantity_per_go!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  number_of_goes!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  total_quantity!: number;
}