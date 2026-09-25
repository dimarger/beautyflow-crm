import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { TenantRole } from '@prisma/client';
import { RequestContext } from '../auth/auth.types';
import { CurrentContext } from '../auth/decorators/current-context.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { TenantRequired } from '../auth/decorators/tenant-required.decorator';
import { SubscriptionGuard } from '../billing/subscription.guard';
import { CatalogService } from './catalog.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { CreateWorkPeriodDto } from './dto/create-work-period.dto';

@ApiTags('catalog')
@ApiBearerAuth()
@ApiHeader({ name: 'x-tenant-id', required: true })
@TenantRequired()
@UseGuards(SubscriptionGuard)
@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('services')
  listServices(@CurrentContext() context: RequestContext) {
    return this.catalog.listServices(context.tenantId!);
  }

  @Roles(TenantRole.OWNER, TenantRole.ADMIN)
  @Post('services')
  createService(@CurrentContext() context: RequestContext, @Body() dto: CreateServiceDto) {
    return this.catalog.createService(context.tenantId!, dto);
  }

  @Roles(TenantRole.OWNER, TenantRole.ADMIN)
  @Patch('services/:id')
  updateService(
    @CurrentContext() context: RequestContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateServiceDto,
  ) {
    return this.catalog.updateService(context.tenantId!, id, dto);
  }

  @Roles(TenantRole.OWNER, TenantRole.ADMIN)
  @Get('staff')
  listStaff(@CurrentContext() context: RequestContext) {
    return this.catalog.listStaff(context.tenantId!);
  }

  @Roles(TenantRole.OWNER, TenantRole.ADMIN)
  @Get('staff/:staffId/work-periods')
  listWorkPeriods(
    @CurrentContext() context: RequestContext,
    @Param('staffId', ParseUUIDPipe) staffId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.catalog.listWorkPeriods(context.tenantId!, staffId, new Date(from), new Date(to));
  }

  @Roles(TenantRole.OWNER, TenantRole.ADMIN)
  @Post('staff/:staffId/work-periods')
  createWorkPeriod(
    @CurrentContext() context: RequestContext,
    @Param('staffId', ParseUUIDPipe) staffId: string,
    @Body() dto: CreateWorkPeriodDto,
  ) {
    return this.catalog.createWorkPeriod(context.tenantId!, staffId, dto);
  }
}
