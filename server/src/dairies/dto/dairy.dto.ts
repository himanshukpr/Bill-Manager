import {
  IsString,
  IsNotEmpty,
  IsEmail,
  IsOptional,
  MinLength,
  IsNumber,
  IsDateString,
} from 'class-validator';

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

export class UpdateDairySettingsDto {
  @IsOptional()
  evaluateByAmount?: boolean;
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
