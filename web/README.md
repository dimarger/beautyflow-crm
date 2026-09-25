# BeautyFlow Owner Web

Standalone Next.js App Router application. All application files and package configuration live in `web/`; no root workspace changes are required. Russian interface, system fonts, no external images or demo data.

## Local Development

Requires Node.js 20.9+ and the running Nest API.

1. Install dependencies from this directory with `npm install`.
2. Set `NEXT_PUBLIC_API_URL` in `web/.env.local`, using `.env.example` as the reference. Supply the origin, such as `http://localhost:3001`, without `/v1`.
3. Run `npm run dev` from `web/` and open `http://localhost:3000`.
4. Enter a real owner's email, password and tenant UUID. No accounts are created by this application.

Validation commands: `npm run typecheck` and `npm run build`. They have not been executed during implementation. No lockfile was generated because dependencies were not installed.

The API's `CORS_ORIGINS` must include the web origin. Production requires HTTPS. `NEXT_PUBLIC_API_URL` is public configuration, not a secret, and is embedded at build time. Never place Stripe keys or JWT signing secrets in web environment variables.

## Authentication

`POST /v1/auth/login` receives exactly `{ email, password }`, not `tenantId`. The returned `accessToken` is held in React memory. Subsequent requests carry `Authorization: Bearer ...` and `x-tenant-id`. No token is stored in localStorage, sessionStorage, cookies, URLs or files. HTTP 401 clears the session. Logout unmounts the dashboard and aborts in-flight reads/actions. Reloading or returning from the payment provider requires logging in again; this is intentional. No refresh-token contract exists in the inspected backend.

## Existing API Contracts

- `GET /v1/billing/subscription`: subscription or `null`, including `plan`, provider IDs, period dates, status, grace period and `cancelAtPeriodEnd`.
- `POST /v1/billing/checkout`: `{ planId, requestId }`, both UUIDs; response `{ url }`.
- `POST /v1/billing/change-plan`: the same body; response `{ pending: true }`. The UI waits for backend/webhook truth, never optimistically replaces the subscription. An uncertain retry of the same operation reuses its in-memory request UUID.
- `POST /v1/billing/portal`: no body; response `{ url }`. Cancellation is performed in this portal because the inspected controller has no cancellation endpoint. The Stripe portal configuration must permit cancellation.
- `GET /v1/billing/invoices`: `{ accounts: [{ customerId, hasMore, invoices: [{ id, number, status, currency, totalMinor, amountPaidMinor, createdAt, hostedUrl, pdfUrl }] }], accountLimit }`. Invoice rows are deduplicated across accounts. PDF/hosted links only appear when returned by the server. API history limits are disclosed.
- `GET /v1/services`: service array; active services are offered when creating staff.
- `GET /v1/staff/:id/work-periods?from=<ISO>&to=<ISO>`: array of work periods. Both bounds are supplied, with an exclusive end date.
- `POST /v1/staff/:id/work-periods`: `{ type: 'WORKING' | 'TIME_OFF', startsAt, endsAt, note }`. Browser-local date/time inputs are converted to UTC ISO strings. The browser timezone is explicitly shown; times are not silently interpreted as the salon timezone.

Billing contracts were read from `src/billing/billing.controller.ts`, `billing.service.ts`, `billing.dto.ts`; authentication and work periods from their current controllers, DTOs and services. Plan/tenant fields follow `prisma/schema.prisma`.

## Forthcoming Contracts / Assumptions

These are integration assumptions, not claims that the inspected server already implements them. HTTP errors, including 404, remain visible with retry controls; no fallback mock data is used.

- **Plan listing:** `GET /v1/billing/plans` is assumed because no plan-list endpoint was present when inspected. Expected direct array: `{ id, name, priceMinor, currency, interval: 'MONTH' | 'YEAR', staffLimit, isActive }[]`. There are no hardcoded prices or plan IDs. Backend must expose the list of eligible plans; until it does, plan selection is unavailable. Stripe price IDs need not be exposed to the browser.
- **Salon:** user-specified `GET/PATCH /v1/account/salon`. GET is assumed to return `{ id, name, slug, timezone, currency }`; PATCH sends exactly `{ name, timezone, currency }`. `slug` is read-only. No invented address/phone fields are sent. PATCH is followed by a fresh GET rather than an optimistic success state.
- **Staff:** user-specified `GET/POST /v1/account/staff`. GET is assumed to return a direct array using the existing catalog staff shape: `{ id, displayName, status, services?: [{ service: { id, name } }] }[]`. POST sends exactly `{ displayName, serviceIds }`; the staff list is re-fetched after a successful response. An empty service selection sends `[]`.
- **Referral:** user-specified `GET /v1/account/referral`, returning `{ code, url }`. No made-up referral benefits or earnings are displayed.

## Payment Semantics

The displayed date is the server's `currentPeriodEnd`, labelled as a period boundary rather than a guaranteed debit date. Trial end, cancellation and grace status are distinguished. Plan changes can invoice prorations immediately; confirmation explains this before submitting. Provider redirects never imply success. Use "Обновить статус" after provider synchronization. Cancelled subscriptions can start checkout; unresolved provider subscriptions use the portal when changing is not permitted.

Payment/referral/document URLs accept HTTPS or localhost HTTP only. New tabs use `noopener noreferrer`. Requests omit browser credentials and disable fetch caching. Network/HTTP/timeout failures are exposed per section, and one unavailable forthcoming endpoint does not block the rest of the dashboard. There is no automatic retry of mutations.

## Manual Verification Checklist

- Check login failures, valid owner login, invalid tenant/403, rate limiting, expiry/401, logout, and refresh losing the session.
- Confirm actual plans, null/existing subscriptions, failed checkout, pending change, portal cancellation and webhook-updated state. After a change, verify the current plan remains the backend's plan until synchronization.
- Confirm grouped invoices, absent PDF URLs, empty history and `hasMore` notices.
- Exercise profile PATCH, staff creation with service IDs, empty lists, endpoint 404s, and per-section retry.
- Exercise work-period range boundaries, UTC conversion, `TIME_OFF`, invalid end times and overlap conflicts.
- Test keyboard navigation, form labels, focus indicators, live errors, reduced motion, clipboard failure, and 360px/desktop layouts in a real browser.

Responsive CSS is implemented, but no browser, typecheck or production build validation is claimed.
