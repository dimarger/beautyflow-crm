import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, SubscriptionStatus } from '@prisma/client';
import Stripe from 'stripe';
import { RequestContext } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { PlanChangeDto } from './billing.dto';

const idOf = (value: string | { id: string } | null | undefined) =>
  typeof value === 'string' ? value : value?.id;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: Stripe,
    private readonly config: ConfigService,
  ) {}

  async ownerTenant(context: RequestContext): Promise<string> {
    if (!context.tenantId) throw new ForbiddenException('Tenant context required');
    const membership = await this.prisma.withTenant(context.tenantId, (tx) =>
      tx.tenantMembership.findUnique({
        where: { tenantId_userId: { tenantId: context.tenantId!, userId: context.user.id } },
      }),
    );
    if (membership?.role !== 'OWNER' || membership.status !== 'ACTIVE') {
      throw new ForbiddenException('Active tenant owner membership required');
    }
    return context.tenantId;
  }

  // Deliberately NOT withTenant: provider calls must never be replayed by DB retries.
  // Lock before reading Stripe so concurrent webhooks cannot commit stale snapshots.
  private locked<T>(tenantId: string, operation: (tx: Prisma.TransactionClient) => Promise<T>) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      await tx.$queryRaw`SELECT id FROM tenants WHERE id = ${tenantId}::uuid FOR UPDATE`;
      return operation(tx);
    }, { timeout: 60_000, maxWait: 10_000 });
  }

  private returnUrl(): string {
    const url = new URL(this.config.getOrThrow<string>('BILLING_RETURN_URL'));
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === 'localhost')) {
      throw new Error('BILLING_RETURN_URL must use HTTPS (except localhost)');
    }
    return url.toString();
  }

  subscription(tenantId: string) {
    return this.prisma.withTenant(tenantId, (tx) => tx.subscription.findFirst({
      where: { tenantId }, orderBy: { createdAt: 'desc' }, include: { plan: true },
    }));
  }

  plans() {
    return this.prisma.plan.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true, priceMinor: true, currency: true, interval: true, staffLimit: true, features: true, isActive: true },
      orderBy: [{ priceMinor: 'asc' }, { name: 'asc' }],
    });
  }

  private async price(tx: Prisma.TransactionClient, planId: string) {
    const plan = await tx.plan.findFirst({ where: { id: planId, isActive: true } });
    if (!plan?.stripePriceId) throw new BadRequestException('Plan is not available for billing');
    const price = await this.stripe.prices.retrieve(plan.stripePriceId);
    if (!price.active || price.type !== 'recurring' || price.recurring?.interval_count !== 1 ||
      price.recurring.interval !== (plan.interval === 'MONTH' ? 'month' : 'year') ||
      price.currency.toUpperCase() !== plan.currency || price.unit_amount !== plan.priceMinor ||
      price.recurring.usage_type !== 'licensed') {
      throw new ConflictException('Stripe price does not match the configured plan');
    }
    return plan.stripePriceId;
  }

  async checkout(tenantId: string, dto: PlanChangeDto) {
    // Persist a stable local identity before any external side effect.
    const local = await this.locked(tenantId, async (tx) => {
      const existing = await tx.subscription.findFirst({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
      if (existing && (!existing.providerSubscriptionId || ['ACTIVE', 'TRIALING', 'PAST_DUE'].includes(existing.status))) {
        return existing;
      }
      if (existing?.providerSubscriptionId) {
        const previous = await this.stripe.subscriptions.retrieve(existing.providerSubscriptionId);
        if (!['canceled', 'incomplete_expired'].includes(previous.status)) {
          throw new ConflictException('Resolve the existing subscription in the billing portal');
        }
      }
      const plan = await tx.plan.findFirst({ where: { id: dto.planId, isActive: true, stripePriceId: { not: null } } });
      if (!plan) throw new BadRequestException('Plan is not available for billing');
      return tx.subscription.create({ data: {
        tenantId, planId: plan.id, status: 'EXPIRED', currentPeriodStart: new Date(), currentPeriodEnd: new Date(),
      } });
    });
    if (!local.providerCustomerId) {
      const customer = await this.stripe.customers.create({
        metadata: { tenantId, localSubscriptionId: local.id },
      }, { idempotencyKey: `customer:${local.id}` });
      await this.prisma.withTenant(tenantId, (tx) => tx.subscription.update({
        where: { id: local.id }, data: { providerCustomerId: customer.id },
      }));
    }
    return this.locked(tenantId, async (tx) => {
      const row = await tx.subscription.findUniqueOrThrow({ where: { id: local.id } });
      if (row.providerSubscriptionId) throw new ConflictException('Use change-plan or the billing portal');
      const customer = row.providerCustomerId!;
      const subscriptions = await this.stripe.subscriptions.list({ customer, status: 'all', limit: 100 });
      if (subscriptions.data.some((sub) => !['canceled', 'incomplete_expired'].includes(sub.status))) {
        throw new ConflictException('A provider subscription already exists; wait for webhook synchronization');
      }
      const sessions = await this.stripe.checkout.sessions.list({ customer, status: 'open', limit: 100 });
      if (sessions.data.length) return { url: sessions.data[0].url };
      const price = await this.price(tx, dto.planId);
      const metadata = { tenantId, localSubscriptionId: row.id };
      const session = await this.stripe.checkout.sessions.create({
        mode: 'subscription', customer, line_items: [{ price, quantity: 1 }],
        metadata, subscription_data: { metadata },
        success_url: this.returnUrl(), cancel_url: this.returnUrl(),
      }, { idempotencyKey: `checkout:${row.id}:${dto.requestId}` });
      return { url: session.url };
    });
  }

  async changePlan(tenantId: string, dto: PlanChangeDto) {
    return this.locked(tenantId, async (tx) => {
      const row = await tx.subscription.findFirst({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
      if (!row?.providerSubscriptionId) throw new ConflictException('No provider subscription');
      const price = await this.price(tx, dto.planId);
      const current = await this.stripe.subscriptions.retrieve(row.providerSubscriptionId);
      if (!['active', 'trialing'].includes(current.status) || current.items.data.length !== 1 ||
        idOf(current.customer) !== row.providerCustomerId || current.pending_update) {
        throw new ConflictException('Subscription cannot be changed in its current state');
      }
      await this.stripe.subscriptions.update(current.id, {
        items: [{ id: current.items.data[0].id, price, quantity: 1 }],
        proration_behavior: 'always_invoice', payment_behavior: 'pending_if_incomplete',
      }, { idempotencyKey: `change:${row.id}:${dto.requestId}` });
      // Webhooks reconcile local entitlement; never grant a plan from the request.
      return { pending: true };
    });
  }

  async portal(tenantId: string) {
    const row = await this.subscription(tenantId);
    if (!row?.providerCustomerId) throw new ConflictException('No billing customer');
    const session = await this.stripe.billingPortal.sessions.create({
      customer: row.providerCustomerId, return_url: this.returnUrl(),
      configuration: this.config.getOrThrow<string>('STRIPE_PORTAL_CONFIGURATION_ID'),
    });
    return { url: session.url };
  }

  async invoices(tenantId: string) {
    const rows = await this.prisma.withTenant(tenantId, (tx) => tx.subscription.findMany({
      where: { tenantId, providerCustomerId: { not: null } }, orderBy: { createdAt: 'desc' }, take: 20,
    }));
    const results = await Promise.all(rows.map(async (row) => {
      const page = await this.stripe.invoices.list({ customer: row.providerCustomerId!, limit: 100 });
      return { customerId: row.providerCustomerId, hasMore: page.has_more, invoices: page.data.map((invoice) => ({
        id: invoice.id, number: invoice.number, status: invoice.status,
        currency: invoice.currency, totalMinor: invoice.total, amountPaidMinor: invoice.amount_paid,
        createdAt: new Date(invoice.created * 1000), hostedUrl: invoice.hosted_invoice_url, pdfUrl: invoice.invoice_pdf,
      })) };
    }));
    return { accounts: results, accountLimit: 20 };
  }

  async webhook(rawBody: Buffer | undefined, signature: string | string[] | undefined) {
    if (!rawBody || typeof signature !== 'string') throw new BadRequestException('Raw body and Stripe signature required');
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature,
        this.config.getOrThrow<string>('STRIPE_WEBHOOK_SECRET'));
    } catch {
      throw new BadRequestException('Invalid Stripe signature');
    }
    let subscriptionId: string | undefined;
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === 'subscription') subscriptionId = idOf(session.subscription);
    } else if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed') {
      const invoice = event.data.object as Stripe.Invoice;
      subscriptionId = idOf(invoice.parent?.subscription_details?.subscription);
    } else if (['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'].includes(event.type)) {
      subscriptionId = (event.data.object as Stripe.Subscription).id;
    } else {
      return { received: true, ignored: true };
    }
    if (!subscriptionId) return { received: true, ignored: true };

    // Metadata is only a routing hint from an authenticated provider object.
    // The transaction must also match our pre-persisted customer and local ID.
    const hint = await this.stripe.subscriptions.retrieve(subscriptionId);
    const { tenantId, localSubscriptionId } = hint.metadata;
    if (!uuid.test(tenantId ?? '') || !uuid.test(localSubscriptionId ?? '')) {
      return { received: true, ignored: true };
    }
    return this.locked(tenantId, async (tx) => {
      const row = await tx.subscription.findFirst({ where: { id: localSubscriptionId, tenantId } });
      if (!row || !row.providerCustomerId || row.providerCustomerId !== idOf(hint.customer) ||
        (row.providerSubscriptionId && row.providerSubscriptionId !== subscriptionId)) {
        throw new ConflictException('Stripe subscription binding mismatch');
      }
      const logged = await tx.paymentLog.findUnique({
        where: { provider_providerEventId: { provider: 'stripe', providerEventId: event.id } },
      });
      if (logged) return { received: true, duplicate: true };
      const sub = await this.stripe.subscriptions.retrieve(subscriptionId!);
      if (idOf(sub.customer) !== row.providerCustomerId || sub.metadata.tenantId !== tenantId ||
        sub.metadata.localSubscriptionId !== row.id) throw new ConflictException('Stripe metadata binding mismatch');
      const item = sub.items.data[0];
      if (sub.items.data.length !== 1 || item.quantity !== 1) throw new ConflictException('Unsupported subscription items');
      const plan = await tx.plan.findUnique({ where: { stripePriceId: item.price.id } });
      if (!plan) throw new ConflictException('Unknown subscription price');
      const statuses: Record<Stripe.Subscription.Status, SubscriptionStatus> = {
        active: 'ACTIVE', trialing: 'TRIALING', past_due: 'PAST_DUE', canceled: 'CANCELLED',
        unpaid: 'EXPIRED', incomplete: 'EXPIRED', incomplete_expired: 'EXPIRED', paused: 'EXPIRED',
      };
      const status = statuses[sub.status];
      const currentPeriodStart = new Date(item.current_period_start * 1000);
      const currentPeriodEnd = new Date((sub.status === 'trialing' && sub.trial_end
        ? Math.min(sub.trial_end, item.current_period_end) : item.current_period_end) * 1000);
      if (!Number.isFinite(currentPeriodEnd.getTime()) || !Number.isFinite(currentPeriodStart.getTime())) {
        throw new ConflictException('Missing Stripe subscription period');
      }
      // Fixed provider-period anchor; retries and distinct failure events cannot extend grace.
      const bound = new Date(Math.min(currentPeriodEnd.getTime(), Date.now()) + 7 * 86400_000);
      const graceEndsAt = status === 'PAST_DUE'
        ? new Date(Math.min(bound.getTime(), row.graceEndsAt?.getTime() ?? bound.getTime())) : null;
      await tx.subscription.update({ where: { id: row.id }, data: {
        providerSubscriptionId: sub.id, planId: plan.id, status, currentPeriodStart, currentPeriodEnd,
        graceEndsAt, cancelAtPeriodEnd: sub.cancel_at_period_end,
      } });
      await tx.paymentLog.create({ data: {
        tenantId, provider: 'stripe', providerEventId: event.id,
        type: event.type === 'invoice.paid' ? 'PAYMENT_SUCCEEDED'
          : event.type === 'invoice.payment_failed' ? 'PAYMENT_FAILED' : 'PAYMENT_CREATED',
        payload: { eventType: event.type, subscriptionId: sub.id, status: sub.status },
        occurredAt: new Date(event.created * 1000),
      } });
      return { received: true };
    });
  }
}
