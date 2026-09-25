# BeautyFlow CRM MVP: technical specification

## 1. Scope

The first stage delivers the backend foundation for a multi-tenant beauty salon CRM:

- tenants and tenant membership;
- global users and platform/tenant roles;
- staff, services, customers and appointments;
- plans, subscriptions, invoices and immutable payment logs;
- JWT authentication, role checks, tenant isolation and rate limiting;
- REST endpoints for salon calendars and public booking.

The frontend is intentionally outside this stage. Next.js can consume the documented REST API.

## 2. Stack

- Runtime: Node.js 22, TypeScript 5.
- API: NestJS 11 with Fastify.
- Database: PostgreSQL 16.
- ORM and migrations: Prisma 6.
- Authentication: short-lived JWT access tokens; refresh sessions are the next auth increment.
- Edge protection: Cloudflare WAF and rate limiting in production, NestJS throttling as application-level defense.
- API contract: REST, OpenAPI/Swagger at `/docs` outside production.

## 3. Architecture

The API is a modular monolith. Modules own a coherent domain but share one deployment and one PostgreSQL database:

- `auth`: credentials and access token issuance;
- `tenancy`: current tenant resolution and membership authorization;
- `catalog`: services and staff;
- `appointments`: private calendar and public booking;
- `billing`: schema in MVP, provider integration in the next increment;
- `prisma`: database access and tenant-scoped transactions.

Microservices are not justified at MVP scale. Domain boundaries and immutable payment/event records preserve an extraction path later.

## 4. Multi-tenancy and authorization

### Identity model

`User` is global. Access to a salon is represented by `TenantMembership`, which carries one tenant role:

- `OWNER`: all salon settings, billing and operational data;
- `ADMIN`: staff, services, customers, calendar and reporting;
- `MASTER`: own profile/calendar and assigned appointments;
- `SUPERADMIN` is a platform role on `User`, not a tenant role.

### Isolation layers

1. `JwtAuthGuard` validates the bearer token.
2. `TenantGuard` requires a UUID `x-tenant-id` header and verifies an active membership. Superadmins may select any tenant explicitly.
3. Controllers never accept `tenantId` in request bodies. It comes from the verified request context.
4. Every repository query includes `tenantId`, including lookups by record ID.
5. `PrismaService.withTenant` sets `app.tenant_id` inside a transaction.
6. PostgreSQL RLS policies use `current_setting('app.tenant_id')` as defense in depth.
7. Composite tenant-aware foreign keys prevent records from referencing another tenant.

No endpoint may fall back to a default tenant. Missing tenant context fails closed.

## 5. Scheduling invariants

- Timestamps are stored as `timestamptz`/UTC. The tenant timezone is applied at API/UI boundaries.
- `endsAt` must be later than `startsAt`.
- A staff member must be active and assigned to every selected service.
- Appointment creation runs in a serializable transaction and takes a PostgreSQL transaction advisory lock for the staff member.
- Overlap is rejected for active statuses. Cancelled/no-show appointments do not block a slot.
- Service name, duration and price are copied to `AppointmentItem` so historical revenue is stable when the catalog changes.
- Public booking creates `PENDING`; authenticated staff may create `CONFIRMED`.
- Status transitions are validated by the domain service.

## 6. Billing invariants

- A tenant has at most one current `TRIALING`, `ACTIVE` or `PAST_DUE` subscription.
- Plan pricing is snapshotted on invoices in minor currency units.
- Provider callbacks must be idempotent by `(provider, providerEventId)`.
- `PaymentLog` is append-only and stores sanitized provider metadata, never card details.
- Invoice numbers are unique per tenant.

## 7. Rate limiting

Application defaults are 120 requests/minute per tracker. Stricter endpoint limits:

- login: 5/minute;
- public availability: 30/minute;
- public booking: 10/minute;
- authenticated appointment writes: 30/minute.

The application limiter is not a DDoS solution. Production must put Cloudflare/CDN/WAF in front, hide the origin, use managed bot rules and apply edge limits by IP, account and route. For horizontal API scaling, replace in-memory throttler storage with Redis.

## 8. API conventions

- Prefix: `/v1`.
- Authentication: `Authorization: Bearer <jwt>`.
- Tenant context: `x-tenant-id: <uuid>` on private tenant endpoints.
- IDs: UUID.
- Money: integer minor units plus ISO currency.
- Errors: NestJS HTTP error envelope for MVP; adopt RFC 9457 before public integrations.
- Idempotency: required for public booking and payment mutations in the next increment.

## 9. Initial REST endpoints

### Authentication

- `POST /v1/auth/login`
- `GET /v1/auth/me`

### Services and staff

- `GET /v1/services`
- `POST /v1/services`
- `PATCH /v1/services/:id`
- `GET /v1/staff`
- `GET /v1/staff/:staffId/work-periods?from=<ISO>&to=<ISO>`
- `POST /v1/staff/:staffId/work-periods`

### Private calendar

- `GET /v1/calendar?from=<ISO>&to=<ISO>&staffId=<uuid?>`
- `POST /v1/appointments`
- `GET /v1/appointments/:id`
- `PATCH /v1/appointments/:id/status`

### Public booking

- `GET /v1/public/:tenantSlug/services`
- `GET /v1/public/:tenantSlug/availability?serviceIds=<uuid,...>&from=<ISO>&to=<ISO>&staffId=<uuid?>`
- `POST /v1/public/:tenantSlug/appointments`

## 10. Operational baseline

- Run at least two stateless API instances behind a load balancer.
- Use managed PostgreSQL Multi-AZ and PgBouncer in transaction mode.
- Enable PITR with RPO <= 15 minutes and test restores monthly; core API RTO target <= 2 hours.
- Emit structured logs with request ID, user ID and tenant ID, but no secrets or raw personal data.
- Track p95 latency, 5xx rate, database saturation, failed booking attempts and payment webhook failures.
- Apply expand/migrate/contract database changes and deploy backward-compatible API versions.
