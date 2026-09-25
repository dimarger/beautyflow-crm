# BeautyFlow CRM

**RU:** BeautyFlow CRM — портфолио-проект multi-tenant SaaS CRM для салонов красоты: онлайн-запись, рабочий календарь мастеров, биллинг, кабинет владельца, суперадмин и инфраструктурный контур защиты.

**EN:** BeautyFlow CRM is a portfolio-grade multi-tenant SaaS CRM for beauty salons: online booking, staff calendar, billing, owner dashboard, superadmin console, and production-oriented security infrastructure.

## Демо-модули / Demo Modules

- Продающий SaaS landing page с Hero, ROI-калькулятором, pricing table, отзывами и FAQ.
- Mobile-first public booking widget: филиал, услуга, мастер, слот, контакты и SMS/WhatsApp confirmation flow.
- CRM calendar: day/week view, staff columns, booking statuses, quick appointment modal.
- Owner dashboard: daily revenue, utilization, new clients, no-show rate, subscription, invoices, referrals.
- Superadmin panel: tenant overview, platform KPIs, analytics, security events, Cloudflare/DDoS posture.
- SEO: metadata, Open Graph, Twitter cards, dynamic `sitemap.xml`, dynamic `robots.txt`.
- Production packaging: Docker Compose, Nginx reverse proxy, Redis, PostgreSQL, Cloudflare WAF guide.

## Архитектура системы / System Architecture

```text
Client Browser
  |
  | HTTPS, cached static assets, WAF, bot checks
  v
Cloudflare Edge
  |
  | rate limits, managed challenges, DDoS mitigation
  v
Nginx Reverse Proxy
  |-- /                 -> Next.js Frontend
  |-- /_next/static/*   -> cached frontend assets
  |-- /api/v1/*         -> NestJS Backend
  |-- /api/v1/auth/*    -> strict login rate limits
  |-- /api/v1/public-booking/* -> public booking limits
  v
NestJS API
  |-- JWT auth + x-tenant-id guard
  |-- billing, account, catalog, appointments
  |-- Prisma ORM
  v
PostgreSQL + RLS policies

Redis is included as a production-ready shared cache/rate-limit building block.
```

## Стек технологий / Tech Stack

- Frontend: Next.js 15, React 19, TypeScript, App Router, CSS design system.
- Backend: NestJS 11, Fastify, TypeScript, Swagger, ValidationPipe.
- Database: PostgreSQL 16, Prisma 6, tenant-aware queries, optional PostgreSQL RLS.
- Billing: Stripe-oriented subscription models and billing flows.
- Infrastructure: Docker Compose, Nginx, Redis, Cloudflare WAF/DDoS rules.
- Security: JWT, tenant membership checks, request validation, Helmet, CORS allowlist, edge and origin rate limits.

## Бизнес-метрики проекта / Business Metrics

BeautyFlow is designed around measurable salon outcomes:

- 37% lower no-show rate through reminders and confirmation flows.
- 2.4 hours saved per day for administrators through self-service booking and quick calendar actions.
- 98% of client bookings can be completed without a phone call.
- Owner dashboard tracks daily revenue, staff utilization, new clients, cancellation/no-show rate, MRR and invoice history.
- Superadmin panel tracks platform MRR, active tenants, API p95 latency and blocked threats.

These numbers are demo/product metrics for the portfolio UI. Production metrics must be connected to real analytics events before commercial use.

## Quick Start: Docker One Click

1. Copy environment file:

```bash
cp .env.example .env
```

2. Edit `.env` and replace at minimum:

```bash
JWT_ACCESS_SECRET=use-a-real-random-secret-with-32-plus-characters
STRIPE_SECRET_KEY=sk_test_or_live_value
STRIPE_WEBHOOK_SECRET=whsec_value
STRIPE_PORTAL_CONFIGURATION_ID=bpc_value
NEXT_PUBLIC_SITE_URL=http://localhost
NEXT_PUBLIC_API_URL=http://localhost/api
```

3. Start the full stack:

```bash
docker compose up --build
```

The demo compose uses `DATABASE_BOOTSTRAP=push` because this repository does not include a committed Prisma migration chain yet. For production, create and review migrations, then switch to `DATABASE_BOOTSTRAP=migrate`.

4. Open:

- Frontend: `http://localhost`
- Backend through proxy: `http://localhost/api/v1`
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`

## Quick Start: Local Development

Backend:

```bash
npm install
npm run prisma:generate
npm run prisma:migrate -- --name init
npm run prisma:seed
npm run start:dev
```

Frontend:

```bash
cd web
npm install
npm run dev
```

Open `http://localhost:3000`. For local API access set `web/.env.local`:

```bash
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

## SEO and Marketing Landing

The landing page is implemented in `web/app/page.tsx` and includes:

- Hero section with a premium SaaS offer and calendar demo preview.
- Interactive ROI calculator for salon owners.
- Pricing table with monthly/yearly toggle and 20% annual discount.
- Mobile-first public booking widget.
- FAQ and salon owner testimonials.
- Superadmin/security showcase for portfolio depth.

SEO files:

- `web/app/layout.tsx`: title, description, keywords, Open Graph, Twitter cards, canonical URL.
- `web/app/sitemap.ts`: dynamic sitemap generation.
- `web/app/robots.ts`: dynamic robots rules and sitemap pointer.

Set `NEXT_PUBLIC_SITE_URL` in production so canonical, sitemap and robots URLs point to the real domain.

## Security and Multi-Tenancy

BeautyFlow is built with tenant isolation as a first-class concern:

- Private endpoints require JWT authentication and `x-tenant-id`.
- Tenant membership is checked before accessing tenant-owned resources.
- DTO validation rejects unexpected fields and prevents client-controlled tenant injection.
- Prisma queries are scoped by `tenantId`.
- PostgreSQL RLS scripts are included in `prisma/rls.sql` as a second isolation boundary.
- JWT secrets are validated and placeholder secrets are rejected.
- Helmet and strict CORS origins are enabled on the backend.
- Nginx applies origin-side request limits for login, public booking and API bursts.
- Cloudflare WAF guidance covers bot challenges, cache bypass for private APIs, and DDoS runbook actions.

Important production note: origin rate limits are not a substitute for edge DDoS protection. Use Cloudflare or another edge provider in front of Nginx.

## Infrastructure Files

- `docker-compose.yml`: full stack with frontend, backend, PostgreSQL, Redis and Nginx.
- `docker/backend.Dockerfile`: NestJS image with Prisma generation and configurable database bootstrap. Default `DATABASE_BOOTSTRAP=push` is for demo compose; use `DATABASE_BOOTSTRAP=migrate` only after reviewed migrations are committed.
- `docker/frontend.Dockerfile`: Next.js production image.
- `infra/nginx/nginx.conf`: global Nginx tuning, gzip, connection limits and rate-limit zones.
- `infra/nginx/conf.d/beautyflow.conf`: frontend/API routing, cache headers and endpoint-specific throttling.
- `infra/nginx/conf.d/proxy-api.inc`: shared API proxy headers and no-store policy.
- `infra/cloudflare-waf.md`: Cloudflare cache, WAF, rate-limit and DDoS runbook configuration.

## API Overview

- `POST /v1/auth/login`: owner/admin authentication.
- `GET /v1/services`: active salon services.
- `GET /v1/appointments/calendar`: calendar data by range.
- `POST /v1/appointments`: create appointment.
- `GET /v1/billing/subscription`: current subscription.
- `POST /v1/billing/checkout`: start checkout.
- `POST /v1/billing/change-plan`: request plan change with proration handled by provider/webhook.
- `GET /v1/billing/invoices`: invoice history and PDF links.
- `GET/PATCH /v1/account/salon`: owner salon settings.
- `GET/POST /v1/account/staff`: team management.

## Verification

Recommended checks before deployment:

```bash
npm run prisma:generate
npm run build
npm test -- --runInBand
cd web
npm run typecheck
npm run build
```

Docker smoke test:

```bash
docker compose up --build
curl http://localhost/healthz
curl http://localhost/robots.txt
curl http://localhost/sitemap.xml
```

No terminal execution was available in the agent environment, so these commands were not run during this implementation pass.

## Production Checklist

- Replace all placeholder secrets in `.env`.
- Use strong PostgreSQL passwords and private networking.
- Apply and review Prisma migrations before launch.
- Apply `prisma/rls.sql` through an administrative database connection if RLS is enabled.
- Configure Stripe webhook signing secret and portal configuration.
- Put Cloudflare in front of Nginx. The local compose file exposes HTTP for one-click demo; production should add an origin certificate and HTTPS listener before enabling TLS `Full (strict)`.
- Configure Cloudflare WAF/rate-limit rules from `infra/cloudflare-waf.md`.
- Restrict `/docs` and any internal tools in production.
- Add centralized logs, metrics and alerting for API latency, 5xx, auth failures, booking failures and payment webhooks.

---

# BeautyFlow CRM English Summary

BeautyFlow CRM is a complete SaaS showcase for the beauty industry. It demonstrates product thinking, frontend UI/UX, backend architecture, multi-tenancy, billing workflows and production deployment practices in one repository.

The project is suitable for portfolio presentation because it covers the full SaaS lifecycle: acquisition landing page, client booking, daily operations calendar, owner dashboard, subscription management, platform administration and edge security.

Run the full stack with `docker compose up --build`, then open `http://localhost`.
