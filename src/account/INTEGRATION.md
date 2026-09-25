# Account Module

Only `src/account/**` is owned by this implementation. No schema migration is needed.

## Wiring

In `src/app.module.ts`, import `AccountModule` from `./account/account.module` and add it to the existing module `imports` array. AccountModule imports BillingModule and uses the existing global JWT, tenant and role guards, just like BillingController. Every handler also calls `BillingService.ownerTenant`, so a platform administrator without an active OWNER membership does not bypass owner authorization.

BillingModule's existing Stripe dependency and configuration must be installed/configured by the integration owner. Set `PUBLIC_SIGNUP_URL=https://your-public-host/signup` in the runtime environment. HTTPS is required except for HTTP localhost. Missing or invalid signup configuration returns 503 only from the referral endpoint, not from profile/staff reads.

## Routes

- `GET /v1/account/salon`: `{ id, name, slug, timezone, currency }`.
- `PATCH /v1/account/salon`: accepts one or both of `name` (trimmed, 1-200 characters) and `timezone` (IANA zone); returns the same salon shape. Empty patches and null fields are invalid. The global whitelist rejects other fields, including currency and slug; neither is mutable.
- `GET /v1/account/staff`: array of `{ id, displayName, status, services: [{ service: { id, name } }] }`.
- `POST /v1/account/staff`: `{ displayName, serviceIds }`; trimmed name is 1-120 characters, serviceIds is an array of unique UUIDs (empty allowed). All services must belong to this tenant and be active. Returns the staff shape above with HTTP 201.
- `GET /v1/account/referral`: `{ code, url }`; code is the existing tenant UUID. The configured signup URL retains its other query parameters and gets `ref=<tenant UUID>`.

Only staff creation uses SubscriptionGuard. Salon reads/updates, staff reads and referral access remain available after subscription expiry, subject to the existing tenant and owner guards. Creation additionally checks the latest subscription using `subscriptionAllowsAccess` inside the tenant-row-locked transaction, matching billing's current-subscription ordering. All staff rows, including inactive staff, count toward staffLimit. Limit exhaustion returns 409; missing/expired entitlement returns 403.

The tenant lock serializes account staff creation with other creators using this lock and billing's entitlement updates. Future staff creation/reactivation paths must use the same locking/limit convention. Staff and explicit StaffService inserts share one tenant-scoped transaction, so failures roll back the entire creation. There are no nested tenant relation writes.

## Frontend Contract Note

The current `web/app/page.tsx` SalonForm submits `currency` and presents it as editable. That request receives 400 under the intentionally strict name/timezone-only PATCH contract, even if currency is unchanged. The frontend owner must omit currency from PATCH and render it read-only. Web files were not changed here. Staff and referral response shapes match `web/lib/api.ts` and `web/app/page.tsx`.

## Referral Scope

This endpoint only generates a stable, unique invitation link. The code remains stable across salon name/slug changes; the complete URL depends on PUBLIC_SIGNUP_URL. The UUID is public referral identity, not an authentication secret. No referral attribution, signup processing, bonus awards, credits, payouts or discount application is implemented.

## Verification

No tests or builds were executed for this implementation. Integration verification should cover active-owner authorization (including non-owner platform admins), immutable fields, invalid/null timezone and names, cross-tenant service IDs, rollback, concurrent staff creation at the limit, expired/latest subscriptions, and stable referral output with existing URL query parameters.
