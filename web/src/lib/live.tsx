import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api } from './api';
import { usePrefs } from './prefs';
import type { MatchLite } from '../components/ui';

export type LiveMatch = MatchLite & { lastEvents: { clock: string | null; type: string | null; text: string | null; teamId: string | null; playerName: string | null; scoring: number }[] };
interface Toast { id: number; kind: 'goal' | 'final' | 'start'; title: string; body: string; matchId: string }
interface LiveCtx {
  matches: LiveMatch[]; liveCount: number; lastCycle: string | null; error: boolean;
  flash: Record<string, number>; notify: boolean; setNotify: (v: boolean) => void; notifySupported: boolean;
}
const Ctx = createContext<LiveCtx | null>(null);
const LOW_SCORING = new Set(['football', 'hockey', 'baseball', 'tennis']);

export function LiveProvider({ children }: { children: ReactNode }) {
  const { isFav } = usePrefs();
  const [matches, setMatches] = useState<LiveMatch[]>([]);
  const [lastCycle, setLastCycle] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [flash, setFlash] = useState<Record<string, number>>({});
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [notify, setNotifyState] = useState<boolean>(() => { try { return localStorage.getItem('sb_notify') === '1'; } catch { return false; } });
  const prev = useRef<Map<string, LiveMatch> | null>(null);
  const seq = useRef(0);
  const favRef = useRef(isFav); favRef.current = isFav;
  const notifyRef = useRef(notify); notifyRef.current = notify;
  const notifySupported = typeof window !== 'undefined' && 'Notification' in window;

  const setNotify = useCallback((v: boolean) => {
    if (v && notifySupported && Notification.permission === 'default') Notification.requestPermission().then((p) => { const on = p === 'granted'; setNotifyState(on); try { localStorage.setItem('sb_notify', on ? '1' : '0'); } catch { /* */ } });
    else { setNotifyState(v); try { localStorage.setItem('sb_notify', v ? '1' : '0'); } catch { /* */ } }
  }, [notifySupported]);

  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = ++seq.current;
    setToasts((x) => [...x.slice(-3), { ...t, id }]);
    setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), 8000);
    if (notifyRef.current && notifySupported && Notification.permission === 'granted') { try { new Notification(t.title, { body: t.body }); } catch { /* */ } }
  }, [notifySupported]);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (document.hidden && prev.current) return; // pestaña oculta: se pone al día al volver
      try {
        const d = await api<{ matches: LiveMatch[]; lastCycle: string | null }>('/live');
        if (!alive) return;
        const list = d.matches ?? [];
        const old = prev.current;
        if (old) {
          const fl: Record<string, number> = {};
          for (const m of list) {
            const o = old.get(m.id);
            if (!o) { if (m.status === 'live') push({ kind: 'start', title: 'Empieza', body: `${m.homeName} vs ${m.awayName}`, matchId: m.id }); continue; }
            if ((m.homeScore !== o.homeScore || m.awayScore !== o.awayScore) && m.status === 'live') {
              fl[m.id] = Date.now();
              if (LOW_SCORING.has(m.sportId) || favRef.current(m.id)) {
                const scorer = m.lastEvents.find((e) => e.scoring)?.playerName;
                push({ kind: 'goal', title: `${m.sportId === 'football' || m.sportId === 'hockey' ? '¡GOL!' : 'Marcador'} ${m.homeScore}–${m.awayScore}`, body: `${m.homeName} vs ${m.awayName}${scorer ? ` · ${scorer}` : ''}`, matchId: m.id });
              }
            }
            if (o.status === 'live' && m.status === 'final') push({ kind: 'final', title: `Final ${m.homeScore}–${m.awayScore}`, body: `${m.homeName} vs ${m.awayName}`, matchId: m.id });
          }
          if (Object.keys(fl).length) { setFlash((f) => ({ ...f, ...fl })); setTimeout(() => setFlash((f) => { const n = { ...f }; for (const k of Object.keys(fl)) if (n[k] === fl[k]) delete n[k]; return n; }), 4500); }
        }
        prev.current = new Map(list.map((m) => [m.id, m]));
        setMatches(list); setLastCycle(d.lastCycle); setError(false);
      } catch { if (alive) setError(true); }
    };
    tick();
    const t = setInterval(tick, 15_000);
    const vis = () => { if (!document.hidden) tick(); };
    document.addEventListener('visibilitychange', vis);
    return () => { alive = false; clearInterval(t); document.removeEventListener('visibilitychange', vis); };
  }, [push]);

  const value = useMemo<LiveCtx>(() => ({ matches, liveCount: matches.filter((m) => m.status === 'live').length, lastCycle, error, flash, notify, setNotify, notifySupported }), [matches, lastCycle, error, flash, notify, setNotify, notifySupported]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <Link key={t.id} to={`/vivo?id=${encodeURIComponent(t.matchId)}`} className={`toast ${t.kind}`}>
            <b>{t.title}</b><span>{t.body}</span>
          </Link>
        ))}
      </div>
    </Ctx.Provider>
  );
}
export function useLive(): LiveCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('LiveProvider ausente');
  return c;
}
