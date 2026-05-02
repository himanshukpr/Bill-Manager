import {
    IsArray,
    IsBoolean,
    IsDateString,
    IsIn,
    IsNumber,
    IsOptional,
    IsString,
    Min,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class DeliveryItemDto {
    @IsString()
    milkType!: string;

    @Type(() => Number)
    @IsNumber()
    @Min(0)
    qty!: number;

    @Type(() => Number)
    @IsNumber()
    @Min(0)
    rate!: number;

    @Type(() => Number)
    @IsNumber()
    @Min(0)
    amount!: number;
}

export class CreateDeliveryLogDto {
    @Type(() => Number)
    @IsNumber()
    @Min(1)
    houseId!: number;

    @IsIn(['morning', 'evening', 'shop'])
    shift!: 'morning' | 'evening' | 'shop';

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => DeliveryItemDto)
    items!: DeliveryItemDto[];

    @IsOptional()
    @IsString()
    note?: string;

    @IsOptional()
    @IsBoolean()
    billGenerated?: boolean;

    @IsOptional()
    @IsDateString()
    deliveredAt?: string;
}

export class UpdateDeliveryLogDto {
    @IsArray()
    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => DeliveryItemDto)
    items?: DeliveryItemDto[];

    @IsOptional()
    @IsString()
    note?: string;

    @IsOptional()
    @IsBoolean()
    billGenerated?: boolean;
}
