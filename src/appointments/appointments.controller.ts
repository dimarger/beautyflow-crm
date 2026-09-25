import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { TenantRole } from '@prisma/client';
import { Throttle } from '@nestjs/throttler';
import { RequestContext } from '../auth/auth.types';
import { CurrentContext } from '../auth/decorators/current-context.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { TenantRequired } from '../auth/decorators/tenant-required.decorator';
import { SubscriptionGuard } from '../billing/subscription.guard';
import { AppointmentsService } from './appointments.service';
import { CalendarQueryDto } from './dto/calendar-query.dto';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentStatusDto } from './dto/update-status.dto';

@ApiTags('appointments')
@ApiBearerAuth()
@ApiHeader({ name: 'x-tenant-id', required: true })
@TenantRequired()
@UseGuards(SubscriptionGuard)
@Controller()
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Get('calendar')
  calendar(@CurrentContext() context: RequestContext, @Query() query: CalendarQueryDto) {
    return this.appointments.calendar(context.tenantId!, context.user, context.tenantRole, query);
  }

  @Roles(TenantRole.OWNER, TenantRole.ADMIN)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('appointments')
  create(@CurrentContext() context: RequestContext, @Body() dto: CreateAppointmentDto) {
    return this.appointments.create(context.tenantId!, dto);
  }

  @Get('appointments/:id')
  findOne(@CurrentContext() context: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.appointments.findOne(context.tenantId!, id, context.user, context.tenantRole);
  }

  @Patch('appointments/:id/status')
  updateStatus(
    @CurrentContext() context: RequestContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAppointmentStatusDto,
  ) {
    return this.appointments.updateStatus(context.tenantId!, id, dto.status, context.user, context.tenantRole);
  }
}
