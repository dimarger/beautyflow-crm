# Billing Integration

This module is intentionally not wired into files outside billing ownership.
No commands, migrations, tests, or live Stripe calls were executed during implementation.

## Required wiring

1. Install the real `stripe` Node SDK with `npm install stripe`. Commit the resolved
   dependency and lockfile. The implementation targets modern Stripe types with
   subscription-item `current_period_start/end` and invoice
   `parent.subscription_details.subscription`. It uses the SDK default API version,
   not a guessed version string. Configure the webhook endpoint to the same API
   version used by the installed SDK.
2. Run `npx prisma migrate dev --name billing` in development and commit its generated
   migration. Deploy it with the normal migration pipeline; run `npx prisma generate`.
   Apply `prisma/billing.sql` after the migration and existing `prisma/rls.sql`, as the
   migration role. Audit duplicate non-null provider customer IDs before applying
   the unique index. The application DB role must not own tables or bypass RLS.
3. Import `BillingModule` from `./billing/billing.module` in `AppModule` and add it
   to `imports`. Keep the existing global JWT, Tenant, and Roles guards in that order.
4. In `main.ts`, pass `{ rawBody: true }` as the third argument of
   `NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(...), ...)`.
   Do not replace the Fastify JSON parser or reconstruct JSON for signature checking.
5. Import `BillingModule` in each CRM feature module and apply
   `@UseGuards(SubscriptionGuard)` to authenticated CRM controllers alongside
   `@TenantRequired()`. Do not attach this guard to billing/auth or the webhook:
   expired customers must still be able to pay. No role, including SUPERADMIN,
   bypasses this guard. Public booking needs a separate explicit subscription check
   after its trusted slug-to-tenant resolution, because it has no TenantGuard context.
6. Configure the environment values below and populate each sellable Plan's unique
   `stripePriceId`. Prices must be active, single-quantity licensed recurring prices
   matching the plan currency, minor-unit price and month/year interval. Do not delete
   historical plans/prices: webhook reconciliation needs their mapping.
7. Run `npm run build` and `npm test -- --runInBand` after installing dependencies and
   regenerating Prisma. Exercise the Stripe CLI/test-mode checklist below before launch.

## Environment and Stripe setup

- `STRIPE_SECRET_KEY`: server-side secret for the relevant Stripe account/mode.
- `STRIPE_WEBHOOK_SECRET`: signing secret for this endpoint (Stripe CLI uses its own).
- `BILLING_RETURN_URL`: fixed frontend billing URL, HTTPS except localhost. No client redirect URLs.
- `STRIPE_PORTAL_CONFIGURATION_ID`: explicit Portal configuration allowing payment
  method updates, invoice history, and cancellation. Disable subscription/price
  changes in Portal; use this API's mapped-price plan-change endpoint instead.
- Set the webhook URL to `/v1/billing/webhook`, with events
  `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
  `invoice.paid`, `invoice.payment_failed`, `customer.subscription.created`,
  `customer.subscription.updated`, and `customer.subscription.deleted`.
- Disable automatic customer/subscription creation outside this flow for CRM tenants.
  Never allow clients or unrelated integrations to write the routing metadata.
- Preserve an appropriate body-size limit and arrange webhook rate limits so legitimate
  Stripe retry bursts are not blocked by the application's global throttler.

## API

All routes except webhook require JWT, `x-tenant-id`, and actual active OWNER
membership. The service independently checks membership, so the existing RolesGuard's
SUPERADMIN bypass does not grant billing access.

- `GET /v1/billing/subscription`: latest local subscription and plan.
- `POST /v1/billing/checkout`: `{ "planId": "uuid", "requestId": "uuid" }`.
  Reuse requestId for retries; use a new one for a new action. Returns `{ url }`.
  An existing open checkout is reused (including its original plan); finish or expire
  that session before choosing a different plan. Checkout does not grant access.
- `POST /v1/billing/change-plan`: same body; Stripe computes and invoices prorations
  for upgrades and downgrades. `pending_if_incomplete` keeps unpaid changes pending.
  Returns `{ pending: true }`; refresh local state after webhook delivery. Credits
  follow Stripe rules, not locally calculated refunds. Do not retry with a new ID
  after an ambiguous provider/network outcome until the existing operation is checked.
- `POST /v1/billing/portal`: returns a short-lived provider URL for payment-method
  management/cancellation. Do not log or share the URL.
- `GET /v1/billing/invoices`: authorized Stripe invoice summaries and hosted/PDF URLs,
  grouped by persisted billing customer. Bounded to the latest 20 billing accounts,
  100 invoices per account; `hasMore` exposes truncation. Use Portal for older history.
  URLs are sensitive bearer links. Invoices remain authoritative in Stripe; this
  implementation does not populate the existing local Invoice model.
- `POST /v1/billing/webhook`: public only at authentication level. Requires the exact
  raw Buffer and verified `stripe-signature`. Invalid signatures return 400;
  processing/provider/DB failures return non-2xx for Stripe retry.

## Consistency and scope

Server-created subscription metadata identifies the tenant and local subscription.
It is only a routing hint: webhook processing requires the persisted local row,
customer ID and, once bound, exact subscription ID. A new billing lifecycle gets a
new local row/customer, keeping historical subscriptions bound to their original row.
Local trials can be converted in-place. Metadata-free subscriptions from other
products are ignored; known metadata with binding failures raises an error.

Handled events are deduplicated by the existing `(provider, providerEventId)` unique
constraint. PaymentLog insertion and entitlement update commit atomically. Logs store
minimal event identity/state, not complete sensitive webhook payloads. Non-payment
subscription events use the existing PAYMENT_CREATED enum as a synchronization
record; `payload.eventType` identifies the real event. Ignored events are not logged.

Per-tenant PostgreSQL row locks precede authoritative Stripe reads, preventing stale
event payloads from overwriting newer state. Stripe calls are never inside the
retrying `withTenant` helper. Non-retrying transactions with provider calls intentionally
hold a connection/tenant lock; monitor timeout/connection pressure. SDK retries use
idempotency keys for checkout/customer/plan-change mutations. A DB rollback cannot
undo a provider mutation; retry the same request ID and rely on webhook reconciliation.
Stripe retains idempotency keys for a limited time: investigate ambiguous customer
creation failures before replaying them after that retention window.

ACTIVE/TRIALING require unexpired provider periods. PAST_DUE gets at most seven days
from first observation, additionally capped at period-end plus seven days. Its saved
deadline never increases while past due, even across different failed-event IDs.
Recovery clears grace. Cancelled, unpaid, incomplete, expired and paused states deny
CRM access. Subscription cancellation at period end preserves ACTIVE access until
the valid expiry; actual deletion revokes it. No trial is invented by checkout.

This narrow implementation has no scheduled reconciliation worker. Monitor failed
webhooks and replay them from Stripe; add a periodic authoritative reconciliation
job before relying on recovery from outages longer than Stripe's retry window.
Existing manually provisioned Stripe subscriptions must be explicitly backfilled
with audited customer/subscription bindings and server metadata before rollout.

## Verification checklist

- Checkout, successful payment, trial, unpaid/incomplete checkout, and cancellation.
- Signed raw payload succeeds; changed bytes/missing signature fail; no JWT needed.
- Duplicate event ID adds one log only; concurrent distinct events cannot regress state.
- Out-of-order paid/failed/updated/deleted events resolve to current Stripe state.
- Distinct failed events and repeated deliveries do not extend the grace deadline.
- Unpaid upgrade does not activate its plan; successful proration updates after webhook.
- Another tenant/customer/subscription ID cannot yield Portal or invoice URLs.
- Non-owner and SUPERADMIN-without-owner-membership cannot use billing routes.
- Expired subscribers cannot use CRM but can reach checkout/Portal/invoices.
- Inject DB rollback after Stripe mutation, retry with the same request ID, verify
  no double subscription or proration; exercise concurrent checkout requests.

Included unit tests cover access policy, absence of an admin bypass, raw-body/signature
failure paths, modern invoice routing, authoritative state, deduplication and customer
binding. Database, real cryptographic signatures, concurrency and live provider
integration tests still need a runnable test environment.
