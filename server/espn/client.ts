/** Cliente HTTP educado con ESPN: concurrencia limitada, espaciado entre llamadas, reintentos y timeout. */

const MAX_CONCURRENCY = Number(process.env.ESPN_CONCURRENCY || 4);
const MIN_GAP_MS = Number(process.env.ESPN_MIN_GAP_MS || 120);
const TIMEOUT_MS = 15000;

let active = 0;
let lastStart = 0;
const waiters: (() => void)[] = [];

async function acquire(): Promise<void> {
  if (active >= MAX_CONCURRENCY) await new Promise<void>((res) => waiters.push(res));
  active++;
  const wait = lastStart + MIN_GAP_MS - Date.now();
  lastStart = Math.max(Date.now(), lastStart + MIN_GAP_MS);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

function release(): void {
  active--;
  waiters.shift()?.();
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, url: string) {
    super(`HTTP ${status} en ${url}`);
    this.status = status;
  }
}

export async function fetchJson<T = unknown>(url: string, retries = 2): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    await acquire();
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      try {
        const res = await fetch(url, {
          signal: ctrl.signal,
          headers: { 'User-Agent': 'Mozilla/5.0 (StatBet data collector)', Accept: 'application/json' },
        });
        if (!res.ok) throw new HttpError(res.status, url);
        return (await res.json()) as T;
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      lastErr = err;
      // 4xx (salvo 429) no se arreglan reintentando
      if (err instanceof HttpError && err.status >= 400 && err.status < 500 && err.status !== 429) break;
    } finally {
      release();
    }
    await new Promise((r) => setTimeout(r, 600 * 2 ** attempt));
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
