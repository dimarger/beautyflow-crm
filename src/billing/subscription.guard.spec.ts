import { subscriptionAllowsAccess, SubscriptionGuard } from './subscription.guard';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

describe('subscriptionAllowsAccess', () => {
  const now = new Date('2026-09-25T12:00:00Z');
  const future = new Date('2026-09-26T12:00:00Z');

  it.each(['ACTIVE', 'TRIALING'] as const)('requires unexpired %s entitlement', (status) => {
    expect(subscriptionAllowsAccess({ status, currentPeriodEnd: future, graceEndsAt: null }, now)).toBe(true);
    expect(subscriptionAllowsAccess({ status, currentPeriodEnd: now, graceEndsAt: null }, now)).toBe(false);
  });

  it('requires a persisted and bounded past-due grace deadline', () => {
    expect(subscriptionAllowsAccess({ status: 'PAST_DUE', currentPeriodEnd: now, graceEndsAt: null }, now)).toBe(false);
    expect(subscriptionAllowsAccess({ status: 'PAST_DUE', currentPeriodEnd: now, graceEndsAt: future }, now)).toBe(true);
    expect(subscriptionAllowsAccess({ status: 'PAST_DUE', currentPeriodEnd: now, graceEndsAt: now }, now)).toBe(false);
    expect(subscriptionAllowsAccess({
      status: 'PAST_DUE', currentPeriodEnd: new Date('2026-09-18T12:00:00Z'), graceEndsAt: future,
    }, now)).toBe(false);
  });

  it.each(['CANCELLED', 'EXPIRED'] as const)('never admits %s even with future dates', (status) => {
    expect(subscriptionAllowsAccess({ status, currentPeriodEnd: future, graceEndsAt: future }, now)).toBe(false);
  });

  it('does not bypass gating for platform administrators', async () => {
    const prisma = { withTenant: jest.fn().mockResolvedValue([]) } as unknown as PrismaService;
    const context = { switchToHttp: () => ({ getRequest: () => ({
      tenantId: 'tenant', user: { platformRole: 'SUPERADMIN' },
    }) }) } as unknown as ExecutionContext;
    await expect(new SubscriptionGuard(prisma).canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
