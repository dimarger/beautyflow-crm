import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WorkPeriodType } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, Length } from 'class-validator';

export class CreateWorkPeriodDto {
  @ApiProperty({ enum: WorkPeriodType })
  @IsEnum(WorkPeriodType)
  type!: WorkPeriodType;

  @ApiProperty()
  @IsDateString()
  startsAt!: string;

  @ApiProperty()
  @IsDateString()
  endsAt!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 200)
  note?: string;
}
