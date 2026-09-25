import { IsUUID } from 'class-validator';

export class PlanChangeDto {
  @IsUUID()
  planId!: string;

  @IsUUID()
  requestId!: string;
}
