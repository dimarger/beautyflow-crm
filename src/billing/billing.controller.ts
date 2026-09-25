import { Body, Controller, Get, HttpCode, Post, RawBodyRequest, Req } from '@nestjs/common';
import { TenantRole } from '@prisma/client';
import { FastifyRequest } from 'fastify';
import { RequestContext } from '../auth/auth.types';
import { CurrentContext } from '../auth/decorators/current-context.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { TenantRequired } from '../auth/decorators/tenant-required.decorator';
import { BillingService } from './billing.service';
import { PlanChangeDto } from './billing.dto';

@Controller('billing')
@TenantRequired()
@Roles(TenantRole.OWNER)
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('subscription')
  async subscription(@CurrentContext() context: RequestContext) {
    return this.billing.subscription(await this.billing.ownerTenant(context));
  }

  @Get('plans')
  async plans(@CurrentContext() context: RequestContext) {
    await this.billing.ownerTenant(context);
    return this.billing.plans();
  }

  @Post('checkout')
  async checkout(@CurrentContext() context: RequestContext, @Body() dto: PlanChangeDto) {
    return this.billing.checkout(await this.billing.ownerTenant(context), dto);
  }

  @Post('change-plan')
  async changePlan(@CurrentContext() context: RequestContext, @Body() dto: PlanChangeDto) {
    return this.billing.changePlan(await this.billing.ownerTenant(context), dto);
  }

  @Post('portal')
  async portal(@CurrentContext() context: RequestContext) {
    return this.billing.portal(await this.billing.ownerTenant(context));
  }

  @Get('invoices')
  async invoices(@CurrentContext() context: RequestContext) {
    return this.billing.invoices(await this.billing.ownerTenant(context));
  }
}

// Separate controller: the public webhook inherits neither tenant nor role metadata.
@Controller('billing')
export class BillingWebhookController {
  constructor(private readonly billing: BillingService) {}

  @Public()
  @Post('webhook')
  @HttpCode(200)
  webhook(@Req() request: RawBodyRequest<FastifyRequest>) {
    return this.billing.webhook(request.rawBody, request.headers['stripe-signature']);
  }
}
