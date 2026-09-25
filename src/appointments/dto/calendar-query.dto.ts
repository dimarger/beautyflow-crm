import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class CalendarQueryDto {
  @ApiProperty({ example: '2026-09-25T00:00:00.000Z' })
  @IsDateString()
  from!: string;

  @ApiProperty({ example: '2026-09-26T00:00:00.000Z' })
  @IsDateString()
  to!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  staffId?: string;
}
