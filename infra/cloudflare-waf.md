# Cloudflare WAF and DDoS Configuration

Use Cloudflare as the public edge in front of Nginx. The local Docker Compose demo exposes HTTP for one-click startup. In production, add an origin certificate and HTTPS listener, keep TLS in `Full (strict)` mode, and expose only `80/443` on the origin.

## DNS and TLS

- `beautyflow.example.com` proxied through Cloudflare.
- SSL/TLS mode: `Full (strict)`.
- Always Use HTTPS: enabled.
- HTTP Strict Transport Security: enabled after certificates are validated.
- Minimum TLS version: `1.2` or higher.

## Cache Rules

1. Static Next.js assets
   - Expression: `http.request.uri.path starts_with "/_next/static/"`
   - Action: cache eligible content.
   - Edge TTL: 1 year.
   - Browser TTL: 1 year.

2. Public marketing page
   - Expression: `http.request.uri.path eq "/" or http.request.uri.path in {"/sitemap.xml" "/robots.txt"}`
   - Action: cache eligible content.
   - Edge TTL: 10 minutes.
   - Respect origin headers.

3. API and account data
   - Expression: `http.request.uri.path starts_with "/api/"`
   - Action: bypass cache.
   - Reason: tenant-scoped private data and mutation endpoints must never be cached at the edge.

## WAF Custom Rules

1. Block obvious malicious probes
   - Expression: `(http.request.uri.path contains "../") or (http.request.uri.query contains "<script") or (http.request.uri.query contains "union select")`
   - Action: block.

2. Challenge low-reputation bots on dynamic routes
   - Expression: `(http.request.uri.path starts_with "/api/" or http.request.uri.path eq "/") and cf.bot_management.score lt 20`
   - Action: managed challenge.

3. Protect owner/admin endpoints
   - Expression: `http.request.uri.path starts_with "/api/v1/billing" or http.request.uri.path starts_with "/api/v1/account"`
   - Action: managed challenge when `cf.threat_score gt 20`.

4. Lock down internal docs in production
   - Expression: `http.request.uri.path starts_with "/docs"`
   - Action: block, or allowlist office/VPN IPs only.

## Rate Limiting Rules

1. Login brute-force protection
   - Expression: `http.request.uri.path eq "/api/v1/auth/login" and http.request.method eq "POST"`
   - Threshold: 5 requests per minute per IP.
   - Mitigation: block for 10 minutes.

2. Public booking abuse protection
   - Expression: `http.request.uri.path starts_with "/api/v1/public-booking" and http.request.method in {"POST" "PATCH"}`
   - Threshold: 30 requests per minute per IP.
   - Mitigation: managed challenge.

3. API burst control
   - Expression: `http.request.uri.path starts_with "/api/"`
   - Threshold: 300 requests per 5 minutes per IP.
   - Mitigation: throttle or challenge.

4. Expensive exports and invoices
   - Expression: `(http.request.uri.path contains "/invoices" or http.request.uri.path contains "/export") and http.request.method eq "GET"`
   - Threshold: 20 requests per 10 minutes per IP.
   - Mitigation: managed challenge.

## DDoS Runbook

1. Turn on `Under Attack Mode` for the zone.
2. Raise security level to `High`.
3. Temporarily challenge all `/api/` traffic except trusted office/VPN IPs if API saturation continues.
4. Keep `/api/v1/auth/login` and public booking behind the strictest rate limits.
5. Review Firewall Events, top ASNs, top countries, and bot scores before adding long-lived blocks.
6. Keep Nginx limits enabled as an origin-side backstop; Cloudflare should absorb volume before traffic reaches the origin.
