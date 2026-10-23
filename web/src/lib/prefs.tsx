import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { OddsFormat } from './format';

interface Prefs {
  oddsFormat: OddsFormat; setOddsFormat: (f: OddsFormat) => void;
  favorites: string[]; isFav: (id: string) => boolean; toggleFav: (id: string) => void;
  aiOpen: boolean; setAiOpen: (v: boolean) => void;
}
const Ctx = createContext<Prefs | null>(null);

const read = <T,>(key: string, fallback: T): T => { try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; } };
const write = (key: string, v: unknown) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* sin almacenamiento */ } };

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [oddsFormat, setOF] = useState<OddsFormat>(() => read<OddsFormat>('sb_odds', 'decimal'));
  const [favorites, setFav] = useState<string[]>(() => read<string[]>('sb_favs', []));
  const [aiOpen, setAiOpen] = useState(false);
  useEffect(() => write('sb_odds', oddsFormat), [oddsFormat]);
  useEffect(() => write('sb_favs', favorites), [favorites]);
  const toggleFav = useCallback((id: string) => setFav((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id])), []);
  const value = useMemo<Prefs>(() => ({
    oddsFormat, setOddsFormat: setOF, favorites, toggleFav, isFav: (id) => favorites.includes(id), aiOpen, setAiOpen,
  }), [oddsFormat, favorites, toggleFav, aiOpen]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export function usePrefs(): Prefs {
  const c = useContext(Ctx);
  if (!c) throw new Error('PrefsProvider ausente');
  return c;
}
