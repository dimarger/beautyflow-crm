import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { TenantRole } from '@prisma/client';
import { RequestContext } from '../auth/auth.types';
import { CurrentContext } from '../auth/decorators/current-context.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { TenantRequired } from '../auth/decorators/tenant-required.decorator';
import { BillingService } from '../billing/billing.service';
import { SubscriptionGuard } from '../billing/subscription.guard';
import { CreateStaffDto, UpdateSalonDto } from './account.dto';
import { AccountService } from './account.service';

@Controller('account')
@TenantRequired()
@Roles(TenantRole.OWNER)
export class AccountController {
  constructor(private readonly account: AccountService, private readonly billing: BillingService) {}

  @Get('salon')
  async salon(@CurrentContext() context: RequestContext) {
    return this.account.salon(await this.billing.ownerTenant(context));
  }

  @Patch('salon')
  async updateSalon(@CurrentContext() context: RequestContext, @Body() dto: UpdateSalonDto) {
    return this.account.updateSalon(await this.billing.ownerTenant(context), dto);
  }

  @Get('staff')
  async staff(@CurrentContext() context: RequestContext) {
    return this.account.staff(await this.billing.ownerTenant(context));
  }

  @Post('staff')
  @UseGuards(SubscriptionGuard)
  async createStaff(@CurrentContext() context: RequestContext, @Body() dto: CreateStaffDto) {
    return this.account.createStaff(await this.billing.ownerTenant(context), dto);
  }

  @Get('referral')
  async referral(@CurrentContext() context: RequestContext) {
    return this.account.referral(await this.billing.ownerTenant(context));
  }
}
