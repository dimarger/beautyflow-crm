-- Apply after the initial Prisma migration. The application role must not own
-- these tables and must not have BYPASSRLS, otherwise PostgreSQL can bypass RLS.

CREATE OR REPLACE FUNCTION app_current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid
$$;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'tenant_memberships', 'customers', 'staff', 'staff_work_periods', 'services', 'staff_services',
    'appointments', 'appointment_items', 'subscriptions', 'invoices', 'payment_logs'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING ("tenantId" = app_current_tenant_id()) WITH CHECK ("tenantId" = app_current_tenant_id())',
      table_name
    );
  END LOOP;
END
$$;

ALTER TABLE appointments
  DROP CONSTRAINT IF EXISTS appointments_valid_interval,
  ADD CONSTRAINT appointments_valid_interval CHECK ("endsAt" > "startsAt");
ALTER TABLE staff_work_periods
  DROP CONSTRAINT IF EXISTS staff_work_periods_valid_interval,
  ADD CONSTRAINT staff_work_periods_valid_interval CHECK ("endsAt" > "startsAt");
ALTER TABLE services
  DROP CONSTRAINT IF EXISTS services_valid_values,
  ADD CONSTRAINT services_valid_values CHECK ("durationMin" > 0 AND "priceMinor" >= 0);
ALTER TABLE appointment_items
  DROP CONSTRAINT IF EXISTS appointment_items_valid_values,
  ADD CONSTRAINT appointment_items_valid_values CHECK ("durationMin" > 0 AND "priceMinor" >= 0);

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_one_current_per_tenant
  ON subscriptions ("tenantId")
  WHERE status IN ('TRIALING', 'ACTIVE', 'PAST_DUE');

CREATE OR REPLACE FUNCTION reject_payment_log_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'payment_logs are append-only';
END
$$;

DROP TRIGGER IF EXISTS payment_logs_append_only ON payment_logs;
CREATE TRIGGER payment_logs_append_only
BEFORE UPDATE OR DELETE ON payment_logs
FOR EACH ROW EXECUTE FUNCTION reject_payment_log_mutation();

-- Tenant identity (id, slug, status) and plans are global catalog data needed
-- to resolve public booking URLs. Mutations remain restricted by the API role.
-- Sensitive salon-owned rows are covered by the policies above.
