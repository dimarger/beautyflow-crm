import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { PrismaModule } from '../prisma/prisma.module';
import { BillingController, BillingWebhookController } from './billing.controller';
import { BillingService } from './billing.service';
import { SubscriptionGuard } from './subscription.guard';

@Module({
  imports: [PrismaModule],
  controllers: [BillingController, BillingWebhookController],
  providers: [
    { provide: Stripe, inject: [ConfigService], useFactory: (config: ConfigService) =>
      new Stripe(config.getOrThrow<string>('STRIPE_SECRET_KEY'), { maxNetworkRetries: 2, timeout: 10_000 }) },
    BillingService,
    SubscriptionGuard,
  ],
  exports: [SubscriptionGuard, BillingService],
})
export class BillingModule {}
