import { IsEnum, IsInt, IsOptional, IsString, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';
import { Shift } from '@prisma/client';
import { PartialType } from '@nestjs/mapped-types';

export class CreateHouseConfigDto {
  @IsInt()
  @Type(() => Number)
  houseId: number;

  @IsEnum(Shift)
  shift: Shift;

  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  position?: number;

  @IsOptional()
  @IsString()
  dailyAlerts?: string;
}

export class UpdateHouseConfigDto extends PartialType(CreateHouseConfigDto) {}

export class ReorderConfigDto {
  @IsInt({ each: true })
  @Type(() => Number)
  orderedIds: number[]; // HouseConfig IDs in the desired order
}
