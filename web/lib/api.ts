export type Session = { token: string; tenantId: string; expire: () => void };

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function request<T>(
  session: Session | null,
  path: string,
  options: { method?: 'GET' | 'POST' | 'PATCH'; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const base = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, '');
  if (!base) throw new Error('Не задан NEXT_PUBLIC_API_URL. Укажите адрес API в настройках приложения.');
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) controller.abort();
  const timeout = setTimeout(abort, 75_000);
  try {
    const response = await fetch(`${base}/v1${path}`, {
      method: options.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(session ? { Authorization: `Bearer ${session.token}`, 'x-tenant-id': session.tenantId } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: 'omit',
      cache: 'no-store',
      signal: controller.signal,
    });
    const text = await response.text();
    let data: unknown;
    let validJson = false;
    try { data = JSON.parse(text); validJson = true; } catch { data = null; }
    if (!response.ok) {
      if (response.status === 401 && session && !controller.signal.aborted) session.expire();
      const message = data && typeof data === 'object' && 'message' in data ? data.message : null;
      const detail = Array.isArray(message) ? message.join('; ') : typeof message === 'string' ? message : '';
      const friendly: Record<number, string> = {
        401: session ? 'Сессия истекла. Войдите снова.' : 'Проверьте почту и пароль.',
        403: 'Нет доступа. Нужна активная роль владельца этого салона.',
        404: 'Маршрут или запись пока недоступны на сервере.',
        409: 'Действие конфликтует с текущим состоянием. Обновите данные.',
        429: 'Слишком много запросов. Попробуйте немного позже.',
      };
      throw new ApiError(`${friendly[response.status] ?? 'API не выполнил запрос.'} ${detail} (HTTP ${response.status})`, response.status);
    }
    if (!validJson && response.status !== 204) throw new Error('API вернул ответ не в формате JSON.');
    return data as T;
  } catch (error) {
    if (controller.signal.aborted && !options.signal?.aborted) {
      throw new Error('Сервер не ответил вовремя. Результат действия неизвестен; обновите данные перед повтором.');
    }
    if (error instanceof TypeError) throw new Error('Не удалось связаться с API. Проверьте соединение, адрес сервера и CORS.');
    throw error;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abort);
  }
}

export function safeUrl(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || (url.protocol === 'http:' && url.hostname === 'localhost') ? url.href : undefined;
  } catch { return undefined; }
}

export type Plan = { id: string; name: string; priceMinor: number; currency: string; interval: 'MONTH' | 'YEAR'; staffLimit: number; isActive: boolean; stripePriceId?: string | null };
export type Subscription = { id: string; planId: string; plan: Plan; status: string; currentPeriodEnd: string; cancelAtPeriodEnd: boolean; graceEndsAt: string | null; providerSubscriptionId: string | null; providerCustomerId: string | null };
export type Invoice = { id: string; number: string | null; status: string | null; currency: string; totalMinor: number; amountPaidMinor: number; createdAt: string; hostedUrl: string | null; pdfUrl: string | null };
export type Invoices = { accounts: { customerId: string; hasMore: boolean; invoices: Invoice[] }[]; accountLimit: number };
export type Salon = { id: string; name: string; slug: string; timezone: string; currency: string };
export type Service = { id: string; name: string; isActive: boolean };
export type Staff = { id: string; displayName: string; status: string; services?: { service: { id: string; name: string } }[] };
export type WorkPeriod = { id: string; type: 'WORKING' | 'TIME_OFF'; startsAt: string; endsAt: string; note: string | null };
