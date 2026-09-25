const PLACEHOLDER_SECRET = 'replace-with-at-least-32-random-characters';

export function validateEnvironment(input: Record<string, unknown>): Record<string, unknown> {
  const required = [
    'DATABASE_URL', 'DIRECT_DATABASE_URL', 'JWT_ACCESS_SECRET', 'CORS_ORIGINS',
    'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'BILLING_RETURN_URL',
    'STRIPE_PORTAL_CONFIGURATION_ID', 'PUBLIC_SIGNUP_URL',
  ];
  for (const key of required) {
    if (typeof input[key] !== 'string' || !input[key]) throw new Error(`${key} is required`);
  }
  const secret = input.JWT_ACCESS_SECRET as string;
  if (secret.length < 32 || secret === PLACEHOLDER_SECRET) {
    throw new Error('JWT_ACCESS_SECRET must be a non-placeholder secret of at least 32 characters');
  }
  const port = Number(input.PORT ?? 3001);
  const ttl = Number(input.JWT_ACCESS_TTL_SECONDS ?? 900);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT is invalid');
  if (!Number.isInteger(ttl) || ttl < 60 || ttl > 86_400) throw new Error('JWT_ACCESS_TTL_SECONDS is invalid');
  return { ...input, PORT: port, JWT_ACCESS_TTL_SECONDS: ttl };
}
