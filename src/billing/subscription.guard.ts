import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { SubscriptionStatus } from '@prisma/client';
import { RequestContext } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';

export function subscriptionAllowsAccess(
  subscription: { status: SubscriptionStatus; currentPeriodEnd: Date; graceEndsAt: Date | null },
  now = new Date(),
): boolean {
  if (subscription.status === 'ACTIVE' || subscription.status === 'TRIALING') {
    return subscription.currentPeriodEnd > now;
  }
  return subscription.status === 'PAST_DUE' && subscription.graceEndsAt !== null &&
    subscription.graceEndsAt > now &&
    now.getTime() < subscription.currentPeriodEnd.getTime() + 7 * 86400_000;
}

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { tenantId } = context.switchToHttp().getRequest<RequestContext>();
    if (!tenantId) throw new ForbiddenException('Tenant context required');
    const subscriptions = await this.prisma.withTenant(tenantId, (tx) =>
      tx.subscription.findMany({ where: { tenantId, status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] } } }),
    );
    if (!subscriptions.some((subscription) => subscriptionAllowsAccess(subscription))) {
      throw new ForbiddenException('An active subscription is required');
    }
    return true;
  }
}
