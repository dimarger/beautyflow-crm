import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BillingModule } from '../billing/billing.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';

@Module({
  imports: [ConfigModule, PrismaModule, BillingModule],
  controllers: [AccountController],
  providers: [AccountService],
})
export class AccountModule {}
