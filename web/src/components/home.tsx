import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Star } from 'lucide-react';
import { Logo, statusText, type MatchLite } from './ui';
import { THEMES, themeOf } from '../lib/themes';
import { mlToProb, showOdds } from '../lib/format';
import { usePrefs } from '../lib/prefs';

export type MatchCardData = MatchLite & { oddsHome?: number | null; oddsDraw?: number | null; oddsAway?: number | null; stage?: string | null };

export function Hero({ sport, counts }: { sport: string; counts: { live: number; finished: number; matches: number; players: number } | null }) {
  const t = themeOf(sport);
  const [a, b] = t.title.split(t.accent);
  return (
    <section className="hero" aria-label="Portada">
      <img src={t.img} alt="" />
      <div className="in">
        <div>
          <h1>{a}<em>{t.accent}</em>{b}</h1>
          <p className="tag">{t.tagline}</p>
        </div>
        {counts && (
          <div className="kpis">
            <div className={`k ${counts.live ? 'live' : ''}`}><b>{counts.live}</b><span>en vivo ahora</span></div>
            <div className="k"><b>{counts.finished.toLocaleString('es-ES')}</b><span>partidos finalizados</span></div>
            <div className="k"><b>{counts.players.toLocaleString('es-ES')}</b><span>jugadores guardados</span></div>
          </div>
        )}
      </div>
    </section>
  );
}

export function FavStar({ id, inline }: { id: string; inline?: boolean }) {
  const { isFav, toggleFav } = usePrefs();
  const on = isFav(id);
  return (
    <button className={`star ${on ? 'on' : ''} ${inline ? 'inl' : ''}`} aria-pressed={on} aria-label={on ? 'Quitar de favoritos' : 'Añadir a favoritos'}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleFav(id); }}>
      <Star size={17} fill={on ? 'currentColor' : 'none'} />
    </button>
  );
}

export function Highlights({ items }: { items: MatchCardData[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const go = (d: number) => ref.current?.scrollBy({ left: d * 360, behavior: 'smooth' });
  if (!items.length) return null;
  return (
    <section>
      <div className="sec-h">
        <h2>Destacados</h2>
        <div className="carbtn">
          <button className="iconbtn" onClick={() => go(-1)} aria-label="Anterior"><ChevronLeft size={16} /></button>
          <button className="iconbtn" onClick={() => go(1)} aria-label="Siguiente"><ChevronRight size={16} /></button>
        </div>
      </div>
      <div className="carousel" ref={ref}>
        {items.map((m) => {
          const st = statusText(m);
          const played = m.homeScore !== null && m.awayScore !== null;
          return (
            <Link key={m.id} to={`/partido/${encodeURIComponent(m.id)}`} className="hl">
              <img src={(THEMES[m.sportId] ?? THEMES['']).img} alt="" loading="lazy" />
              <div className="top"><span>{m.leagueName}</span><span className={`chip ${st.live ? 'live' : ''}`}>{st.live ? st.text : st.text}</span></div>
              <div className="vs">
                <div className="tm"><Logo src={m.homeLogo} name={m.homeName} color={m.homeColor} size="lg" />{m.homeName}</div>
                <div className="sc">{played ? `${m.homeScore}–${m.awayScore}` : 'vs'}</div>
                <div className="tm"><Logo src={m.awayLogo} name={m.awayName} color={m.awayColor} size="lg" />{m.awayName}</div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

/** Probabilidad implícita normalizada de las cuotas publicadas por ESPN (si existen). */
export function impliedProbs(m: MatchCardData): { h: number; d: number; a: number } | null {
  if (m.oddsHome == null || m.oddsAway == null) return null;
  const h = mlToProb(m.oddsHome), a = mlToProb(m.oddsAway), d = m.oddsDraw != null ? mlToProb(m.oddsDraw) : 0;
  const s = h + a + d;
  return { h: h / s, d: d / s, a: a / s };
}

export function MatchCard({ m }: { m: MatchCardData }) {
  const { oddsFormat } = usePrefs();
  const st = statusText(m);
  const played = m.homeScore !== null && m.awayScore !== null;
  const p = impliedProbs(m);
  return (
    <Link to={`/partido/${encodeURIComponent(m.id)}`} className={`mcard ${st.live ? 'live' : ''}`}>
      <FavStar id={m.id} />
      <div className="mh"><span className="lg">{m.leagueName}</span><span className={`chip ${st.live ? 'live' : ''}`}>{st.text}</span></div>
      <div className={`tr ${m.winner === 'home' ? 'win' : m.winner === 'away' ? 'lose' : ''}`}><Logo src={m.homeLogo} name={m.homeName} color={m.homeColor} /><span className="nm">{m.homeName}</span><span className="sc">{played ? m.homeScore : ''}</span></div>
      <div className={`tr ${m.winner === 'away' ? 'win' : m.winner === 'home' ? 'lose' : ''}`}><Logo src={m.awayLogo} name={m.awayName} color={m.awayColor} /><span className="nm">{m.awayName}</span><span className="sc">{played ? m.awayScore : ''}</span></div>
      {p && m.status !== 'final' && (
        <div className="mf">
          <span>Mercado (ESPN) · probabilidad implícita</span>
          <div className="mbar"><i className="h" style={{ width: `${p.h * 100}%` }} />{p.d > 0 && <i className="d" style={{ width: `${p.d * 100}%` }} />}<i className="a" style={{ width: `${p.a * 100}%` }} /></div>
          <div className="mbar-l"><span style={{ color: 'var(--home)' }}>{showOdds(m.oddsHome, oddsFormat)}</span>{m.oddsDraw != null && <span>{showOdds(m.oddsDraw, oddsFormat)}</span>}<span style={{ color: 'var(--away)' }}>{showOdds(m.oddsAway, oddsFormat)}</span></div>
        </div>
      )}
      {!p && m.status === 'final' && !m.hasBoxscore && <div className="mf">Estadísticas detalladas pendientes</div>}
    </Link>
  );
}
