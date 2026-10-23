import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { SPORT_NAMES, timeOf, dateTimeOf, fmt, statLabel } from '../lib/format';

export function Loading({ rows = 4 }: { rows?: number }) {
  return (
    <div className="card" aria-busy="true" aria-label="Cargando">
      {Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton" style={{ margin: '12px 0', width: `${90 - i * 12}%` }} />)}
    </div>
  );
}

export function ErrorBox({ error }: { error: string }) {
  return <div className="notice bad" role="alert">No se pudo cargar: {error}</div>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Logo({ src, name, color, size }: { src?: string | null; name: string; color?: string | null; size?: 'lg' }) {
  const [broken, setBroken] = useState(false);
  if (src && !broken) return <img className={`logo ${size ?? ''}`} src={src} alt="" loading="lazy" onError={() => setBroken(true)} referrerPolicy="no-referrer" />;
  return <span className={`logo ph ${size ?? ''}`} style={{ background: color ? `#${color.replace('#', '')}` : undefined }} aria-hidden>{name.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 3).toUpperCase()}</span>;
}

export function Form({ items }: { items: { result: 'W' | 'D' | 'L'; score?: string; opponent?: string }[] }) {
  if (!items.length) return <span className="muted small">sin partidos previos en la base</span>;
  return (
    <span className="form" aria-label={`Últimos resultados: ${items.map((i) => i.result).join(' ')}`}>
      {items.map((f, i) => <b key={i} className={f.result} title={f.opponent ? `${f.score} vs ${f.opponent}` : undefined}>{f.result === 'W' ? 'G' : f.result === 'D' ? 'E' : 'P'}</b>)}
    </span>
  );
}

export function Tabs({ tabs, value, onChange }: { tabs: { id: string; label: string }[]; value: string; onChange: (id: string) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}>{t.label}</button>)}
    </div>
  );
}

export function Seg<T extends string>({ options, value, onChange, label }: { options: { id: T; label: string }[]; value: T; onChange: (v: T) => void; label?: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => <button key={o.id} aria-pressed={value === o.id} onClick={() => onChange(o.id)}>{o.label}</button>)}
    </div>
  );
}

export interface MatchLite {
  id: string; leagueId: string; leagueName: string; sportId: string; startTime: string; status: string; statusDetail: string | null; clock: string | null;
  homeId: string; homeName: string; homeLogo: string | null; homeColor: string | null; awayId: string; awayName: string; awayLogo: string | null; awayColor: string | null;
  homeScore: number | null; awayScore: number | null; winner: string | null; hasBoxscore?: boolean;
}

export function statusText(m: MatchLite): { text: string; live: boolean } {
  if (m.status === 'live') return { text: m.statusDetail || m.clock || 'En vivo', live: true };
  if (m.status === 'final') return { text: 'Final', live: false };
  if (m.status === 'postponed') return { text: 'Aplazado', live: false };
  if (m.status === 'cancelled') return { text: 'Cancelado', live: false };
  return { text: timeOf(m.startTime), live: false };
}

export function MatchRow({ m, showDate }: { m: MatchLite; showDate?: boolean }) {
  const st = statusText(m);
  const played = m.homeScore !== null && m.awayScore !== null;
  return (
    <Link to={`/partido/${encodeURIComponent(m.id)}`} className="mrow">
      <span className={`st ${st.live ? 'live' : ''}`}>{showDate && !st.live ? new Date(m.startTime).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : st.text}</span>
      <span className={`tm ${m.winner === 'home' ? 'win' : ''}`}><Logo src={m.homeLogo} name={m.homeName} color={m.homeColor} /><span>{m.homeName}</span></span>
      <span className={`score ${played ? '' : 'pending'}`}>{played ? `${m.homeScore} – ${m.awayScore}` : 'vs'}</span>
      <span className={`tm away ${m.winner === 'away' ? 'win' : ''}`}><Logo src={m.awayLogo} name={m.awayName} color={m.awayColor} /><span>{m.awayName}</span></span>
    </Link>
  );
}

export function MatchGroups({ matches, showDate }: { matches: MatchLite[]; showDate?: boolean }) {
  const groups = new Map<string, MatchLite[]>();
  for (const m of matches) (groups.get(m.leagueId) ?? groups.set(m.leagueId, []).get(m.leagueId)!).push(m);
  return (
    <div className="stack">
      {[...groups.entries()].map(([id, list]) => (
        <section key={id} className="card flat">
          <div className="league-head"><Link to={`/tablas?league=${encodeURIComponent(id)}`}>{list[0].leagueName}</Link><span className="chip">{SPORT_NAMES[list[0].sportId] ?? list[0].sportId}</span></div>
          {list.map((m) => <MatchRow key={m.id} m={m} showDate={showDate} />)}
        </section>
      ))}
    </div>
  );
}

/** Barra comparativa local vs visitante. */
export function CompareBar({ label, home, away, homeText, awayText }: { label: string; home: number | null; away: number | null; homeText?: string; awayText?: string }) {
  const h = home ?? 0, a = away ?? 0;
  const total = h + a;
  const hp = total > 0 ? (h / total) * 100 : 50;
  return (
    <div className="cmp">
      <div className="lab">{label}</div>
      <div className="v">{homeText ?? fmt(home, Number.isInteger(h) ? 0 : 1)}</div>
      <div className="bar" role="img" aria-label={`${label}: ${homeText ?? home} frente a ${awayText ?? away}`}>
        <i style={{ width: `calc(${hp}% - 1px)` }} /><i style={{ width: `calc(${100 - hp}% - 1px)` }} />
      </div>
      <div className="v">{awayText ?? fmt(away, Number.isInteger(a) ? 0 : 1)}</div>
    </div>
  );
}

export function StatCell({ v, d }: { v: number | null; d?: string | null }) {
  if (v === null || v === undefined) return <>{d ?? '—'}</>;
  return <>{Number.isInteger(v) ? v : fmt(v, 1)}</>;
}

export function Select<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (v: T) => void; options: { id: T; label: string }[] }) {
  return (
    <label className="field"><span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </label>
  );
}

export { statLabel, dateTimeOf };
