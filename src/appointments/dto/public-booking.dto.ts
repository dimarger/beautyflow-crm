import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsEmail, IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';

export class PublicBookingDto {
  @ApiProperty()
  @IsString()
  @Length(2, 80)
  firstName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 80)
  lastName?: string;

  @ApiProperty({ example: '+79991234567' })
  @Matches(/^\+[1-9]\d{7,14}$/)
  phone!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty()
  @IsUUID()
  staffId!: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsUUID('4', { each: true })
  serviceIds!: string[];

  @ApiProperty()
  @IsDateString()
  startsAt!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 1000)
  clientComment?: string;
}
