import { BadRequestException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from './billing.service';

describe('BillingService webhook', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const localSubscriptionId = '22222222-2222-4222-8222-222222222222';

  function setup() {
    const row = { id: localSubscriptionId, tenantId, providerCustomerId: 'cus_1', providerSubscriptionId: 'sub_1', graceEndsAt: null };
    const tx = {
      $executeRaw: jest.fn(), $queryRaw: jest.fn(),
      subscription: { findFirst: jest.fn().mockResolvedValue(row), update: jest.fn() },
      paymentLog: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
      plan: { findUnique: jest.fn().mockResolvedValue({ id: 'plan' }) },
    };
    const stripe = {
      webhooks: { constructEvent: jest.fn().mockReturnValue({
        id: 'evt_1', type: 'invoice.payment_failed', created: 1700000000,
        data: { object: { parent: { subscription_details: { subscription: 'sub_1' } } } },
      }) },
      subscriptions: { retrieve: jest.fn().mockResolvedValue({
        id: 'sub_1', customer: 'cus_1', metadata: { tenantId, localSubscriptionId },
        status: 'active', cancel_at_period_end: false,
        items: { data: [{ quantity: 1, price: { id: 'price_1' }, current_period_start: 1700000000, current_period_end: 1702592000 }] },
      }) },
    };
    const prisma = { $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)) };
    const service = new BillingService(prisma as unknown as PrismaService, stripe as unknown as Stripe,
      { getOrThrow: () => 'secret' } as unknown as ConfigService);
    return { service, tx, stripe };
  }

  it('requires raw bytes and a valid signature', async () => {
    const { service, stripe } = setup();
    await expect(service.webhook(undefined, 'signature')).rejects.toBeInstanceOf(BadRequestException);
    stripe.webhooks.constructEvent.mockImplementation(() => { throw new Error('bad signature'); });
    await expect(service.webhook(Buffer.from('{}'), 'bad')).rejects.toBeInstanceOf(BadRequestException);
    expect(stripe.subscriptions.retrieve).not.toHaveBeenCalled();
  });

  it('uses modern invoice subscription routing and authoritative state, not failed-event state', async () => {
    const { service, tx, stripe } = setup();
    await service.webhook(Buffer.from('{}'), 'signature');
    expect(stripe.subscriptions.retrieve).toHaveBeenCalledWith('sub_1');
    expect(tx.subscription.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'ACTIVE', graceEndsAt: null }),
    }));
    expect(tx.paymentLog.create).toHaveBeenCalledTimes(1);
  });

  it('does not update or append a second log for a duplicate event', async () => {
    const { service, tx } = setup();
    tx.paymentLog.findUnique.mockResolvedValue({ id: 'logged' });
    await expect(service.webhook(Buffer.from('{}'), 'signature')).resolves.toEqual({ received: true, duplicate: true });
    expect(tx.subscription.update).not.toHaveBeenCalled();
    expect(tx.paymentLog.create).not.toHaveBeenCalled();
  });

  it('rejects metadata routing with a mismatched persisted customer', async () => {
    const { service, tx } = setup();
    tx.subscription.findFirst.mockResolvedValue({
      id: localSubscriptionId, tenantId, providerCustomerId: 'cus_other', providerSubscriptionId: 'sub_1', graceEndsAt: null,
    });
    await expect(service.webhook(Buffer.from('{}'), 'signature')).rejects.toBeInstanceOf(ConflictException);
    expect(tx.subscription.update).not.toHaveBeenCalled();
  });
});
