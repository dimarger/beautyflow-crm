import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class CreateServiceDto {
  @ApiProperty({ example: 'Женская стрижка' })
  @IsString()
  @Length(2, 120)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 1000)
  description?: string;

  @ApiProperty({ example: 60 })
  @IsInt()
  @Min(5)
  @Max(720)
  durationMin!: number;

  @ApiProperty({ example: 250000, description: 'Minor currency units: 2500.00 RUB' })
  @IsInt()
  @Min(0)
  @Max(2147483647)
  priceMinor!: number;
}
