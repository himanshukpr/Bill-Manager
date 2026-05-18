import { IsInt, IsOptional, IsString } from 'class-validator'

export class ClosePeriodDto {
  @IsInt()
  houseId!: number

  @IsString()
  fromDate!: string

  @IsString()
  toDate!: string

  @IsOptional()
  @IsString()
  note?: string

  @IsOptional()
  amount?: number
}
