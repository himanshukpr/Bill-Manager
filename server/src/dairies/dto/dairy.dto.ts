import {
  IsString,
  IsNotEmpty,
  IsEmail,
  IsOptional,
  MinLength,
  IsNumber,
  IsDateString,
  ValidateNested,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';

export class BillItemCategoryPatternDto {
  @IsString()
  @IsNotEmpty()
  pattern: string;
}

export class BillItemCategoryDto {
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BillItemCategoryPatternDto)
  @IsOptional()
  patterns?: BillItemCategoryPatternDto[];
}

export class UpdateDairySettingsDto {
  @IsOptional()
  evaluateByAmount?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BillItemCategoryDto)
  @IsOptional()
  billItemCategories?: BillItemCategoryDto[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  dedicatedItemNames?: string[];
}

export class CreateDairyDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  ownerName?: string;

  @IsDateString()
  @IsOptional()
  planExpiry?: string;

  @IsNumber()
  @IsOptional()
  maxHouses?: number;
}

export class UpdateDairyDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  ownerName?: string;

  @IsOptional()
  isActive?: boolean;

  @IsDateString()
  @IsOptional()
  planExpiry?: string | null;

  @IsNumber()
  @IsOptional()
  maxHouses?: number | null;
}
