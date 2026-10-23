import { useCallback, useEffect, useRef, useState } from 'react';

export async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, init);
  if (!res.ok) {
    let msg = `Error ${res.status}`;
    try { msg = (await res.json()).error || msg; } catch { /* sin cuerpo */ }
    throw new Error(msg);
  }
  return res.json();
}

export function qs(params: Record<string, string | number | undefined | null | false>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '' && v !== false) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

export interface ApiState<T> { data: T | null; error: string | null; loading: boolean; reload: () => void }

/** Carga una URL de la API; se recarga si cambia `url` y, opcionalmente, cada `refreshMs`. */
export function useApi<T = any>(url: string | null, refreshMs?: number): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!url);
  const seq = useRef(0);

  const load = useCallback((silent: boolean) => {
    if (!url) return;
    const my = ++seq.current;
    if (!silent) setLoading(true);
    api<T>(url)
      .then((d) => { if (my === seq.current) { setData(d); setError(null); } })
      .catch((e: Error) => { if (my === seq.current) setError(e.message); })
      .finally(() => { if (my === seq.current) setLoading(false); });
  }, [url]);

  useEffect(() => {
    if (!url) { setData(null); setLoading(false); return; }
    load(false);
    if (!refreshMs) return;
    const t = setInterval(() => load(true), refreshMs);
    return () => clearInterval(t);
  }, [url, refreshMs, load]);

  return { data, error, loading, reload: () => load(false) };
}
