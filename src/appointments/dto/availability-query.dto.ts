import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsOptional, IsUUID } from 'class-validator';

export class AvailabilityQueryDto {
  @ApiProperty()
  @IsDateString()
  from!: string;

  @ApiProperty()
  @IsDateString()
  to!: string;

  @ApiProperty({ type: [String], description: 'Repeat serviceIds or pass a comma-separated list' })
  @Transform(({ value }) => {
    const values = Array.isArray(value) ? value : String(value).split(',');
    return values.map((item) => String(item).trim()).filter(Boolean);
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsUUID('4', { each: true })
  serviceIds!: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  staffId?: string;
}
