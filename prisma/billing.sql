-- Apply after the Prisma migration and rls.sql, using the migration role.
-- A customer must never be shared by tenants. This implementation reuses one
-- customer per billing lifecycle, with a new customer after terminal cancellation.
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_billing_customer_unique
  ON subscriptions ("providerCustomerId") WHERE "providerCustomerId" IS NOT NULL;
ALTER TABLE subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_bounded_grace,
  ADD CONSTRAINT subscriptions_bounded_grace CHECK (
    "graceEndsAt" IS NULL OR "graceEndsAt" <= "currentPeriodEnd" + interval '7 days'
  );
