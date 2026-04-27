import {
    IsArray,
    IsBoolean,
    IsIn,
    IsNumber,
    IsOptional,
    IsString,
    Min,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class DeliveryItemDto {
    @IsIn(['buffalo', 'cow'])
    milkType: 'buffalo' | 'cow';

    @Type(() => Number)
    @IsNumber()
    @Min(0)
    qty: number;

    @Type(() => Number)
    @IsNumber()
    @Min(0)
    rate: number;

    @Type(() => Number)
    @IsNumber()
    @Min(0)
    amount: number;
}

export class CreateDeliveryLogDto {
    @Type(() => Number)
    @IsNumber()
    @Min(1)
    houseId: number;

    @IsIn(['morning', 'evening'])
    shift: 'morning' | 'evening';

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => DeliveryItemDto)
    items: DeliveryItemDto[];

    @IsOptional()
    @IsString()
    note?: string;

    @IsOptional()
    @IsBoolean()
    billGenerated?: boolean;
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
