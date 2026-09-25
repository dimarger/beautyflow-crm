import { Transform } from 'class-transformer';
import { ArrayUnique, IsArray, IsString, IsTimeZone, IsUUID, Length, ValidateIf } from 'class-validator';

export class UpdateSalonDto {
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @Length(1, 200)
  name?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @IsTimeZone()
  timezone?: string;
}

export class CreateStaffDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @Length(1, 120)
  displayName!: string;

  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  serviceIds!: string[];
}
