import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { AppointmentsService } from './appointments.service';
import { PublicBookingDto } from './dto/public-booking.dto';
import { AvailabilityQueryDto } from './dto/availability-query.dto';

@Public()
@ApiTags('public booking')
@Controller('public/:tenantSlug')
export class PublicBookingController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Get('services')
  services(@Param('tenantSlug') tenantSlug: string) {
    return this.appointments.publicServices(tenantSlug);
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('availability')
  availability(@Param('tenantSlug') tenantSlug: string, @Query() query: AvailabilityQueryDto) {
    return this.appointments.publicAvailability(tenantSlug, query);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('appointments')
  book(@Param('tenantSlug') tenantSlug: string, @Body() dto: PublicBookingDto) {
    return this.appointments.publicBook(tenantSlug, dto);
  }
}
