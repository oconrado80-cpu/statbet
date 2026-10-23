import { useMemo, useState } from 'react';
import { PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { Sparkles } from 'lucide-react';
import { FlowChart } from '../components/flow';
import { usePrefs } from '../lib/prefs';
import { Link, useParams } from 'react-router-dom';
import { useApi } from '../lib/api';
import { dateTimeOf, eventName, fmt, mlToProb, pct, showOdds, statLabel, STATUS_NAMES } from '../lib/format';
import { CompareBar, Empty, ErrorBox, Form, Loading, Logo, Seg, StatCell, Tabs } from '../components/ui';

const PRIORITY = ['minutes', 'points', 'totalGoals', 'goalAssists', 'rebounds', 'assists', 'totalShots', 'shotsOnTarget', 'steals', 'blocks', 'turnovers', 'fieldGoalsMade', 'fieldGoalsAttempted', 'yellowCards', 'redCards', 'saves', 'goalsConceded', 'foulsCommitted', 'plusMinus'];
const prio = (k: string) => { const i = PRIORITY.indexOf(k); return i === -1 ? 99 : i; };

function PlayersTable({ players, teamId }: { players: any[]; teamId: string }) {
  const mine = players.filter((p) => p.teamId === teamId);
  const groups = new Map<string, any[]>();
  for (const p of mine) for (const g of new Set<string>(p.stats.map((s: any) => s.grp))) (groups.get(g) ?? groups.set(g, []).get(g)!).push(p);
  if (!mine.length) return <Empty>Sin estadísticas de jugadores para este equipo.</Empty>;
  return (
    <div className="stack">
      {[...groups.entries()].map(([grp, rows]) => {
        const keys = new Map<string, string | null>();
        rows.forEach((p) => p.stats.filter((s: any) => s.grp === grp).forEach((s: any) => keys.set(s.key, s.label)));
        const cols = [...keys.keys()].sort((a, b) => prio(a) - prio(b) || a.localeCompare(b)).slice(0, 10);
        return (
          <div key={grp} className="tablewrap">
            {grp && <h3 style={{ margin: '4px 0 6px', textTransform: 'capitalize' }}>{grp}</h3>}
            <table className="t">
              <thead><tr><th>Jugador</th><th>Pos</th>{cols.map((c) => <th key={c} className="num" title={statLabel(c, keys.get(c))}>{statLabel(c, keys.get(c)).slice(0, 14)}</th>)}</tr></thead>
              <tbody>
                {rows.map((p) => {
                  const by = new Map(p.stats.filter((s: any) => s.grp === grp).map((s: any) => [s.key, s]));
                  return (
                    <tr key={p.id}>
                      <td><Link to={`/jugador/${encodeURIComponent(p.id)}`}>{p.name}</Link>{p.starter && <span className="muted small"> · titular</span>}</td>
                      <td className="muted">{p.position ?? '—'}</td>
                      {cols.map((c) => { const s: any = by.get(c); return <td key={c} className="num">{s ? <StatCell v={s.value} d={s.display} /> : '—'}</td>; })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

function Odds({ odds, home, away }: { odds: any[]; home: string; away: string }) {
  const { oddsFormat: f, setOddsFormat } = usePrefs();
  if (!odds.length) return <Empty>ESPN no ha publicado cuotas para este partido. No se muestran cuotas inventadas ni de otras casas.</Empty>;
  const last = odds[odds.length - 1], first = odds[0];
  const rows: [string, number | null, number | null][] = [[home, last.homeMl, first.homeMl], ['Empate', last.drawMl, first.drawMl], [away, last.awayMl, first.awayMl]];
  return (
    <div className="stack">
      <div className="row wrap between">
        <p className="muted small">Fuente: {last.provider ?? 'ESPN'} (un solo proveedor) · {odds.length} {odds.length === 1 ? 'registro' : 'registros'} guardados · último {dateTimeOf(last.capturedAt)}</p>
        <Seg label="Formato de cuotas" value={f} onChange={setOddsFormat} options={[{ id: 'decimal', label: 'Decimal' }, { id: 'fractional', label: 'Fraccionaria' }, { id: 'american', label: 'Americana' }]} />
      </div>
      <div className="tablewrap"><table className="t">
        <thead><tr><th>Resultado</th><th className="num">Cuota</th><th className="num">Prob. implícita</th><th className="num">Primera cuota guardada</th></tr></thead>
        <tbody>{rows.filter(([, v]) => v !== null).map(([n, v, v0]) => (
          <tr key={n}><td>{n}</td><td className="num">{showOdds(v, f)}</td><td className="num">{pct(mlToProb(v!) * 100, 1)}</td><td className="num muted">{showOdds(v0, f)}</td></tr>
        ))}</tbody>
      </table></div>
      {(last.spread !== null || last.total !== null) && <p className="small">{last.spread !== null && <>Hándicap: <b>{last.spread}</b> · </>}{last.total !== null && <>Total: <b>{last.total}</b></>}</p>}
      {odds.length > 1 && <p className="small muted">Movimiento: la cuota del local pasó de {showOdds(first.homeMl, f)} a {showOdds(last.homeMl, f)} desde que se empezó a guardar.</p>}
      <p className="muted small">La probabilidad implícita incluye el margen de la casa (la suma supera el 100 %). Es un dato de mercado, no una predicción de este sitio. Esta web no compara casas de apuestas: solo muestra lo que publica ESPN.</p>
    </div>
  );
}

function Prediction({ p, match }: { p: any; match: any }) {
  const bt = useApi<any>(`/analytics/backtest?league=${encodeURIComponent(match.leagueId)}`);
  if (!p?.available) return <Empty>{p?.reason ?? 'Sin predicción disponible.'}</Empty>;
  return (
    <div className="stack">
      <div>
        <h3 style={{ marginBottom: 8 }}>{p.model === 'poisson' ? 'Probabilidad del modelo de goles (Poisson)' : 'Probabilidad del modelo Elo'}</h3>
        {p.model === 'poisson' ? (
          <div className="probbar" role="img" aria-label={`Local ${pct(p.pHome * 100)}, empate ${pct(p.pDraw * 100)}, visitante ${pct(p.pAway * 100)}`}>
            <div className="h" style={{ width: `${p.pHome * 100}%` }}>{pct(p.pHome * 100)}</div><div className="d" style={{ width: `${p.pDraw * 100}%` }}>{pct(p.pDraw * 100)}</div><div className="a" style={{ width: `${p.pAway * 100}%` }}>{pct(p.pAway * 100)}</div>
          </div>
        ) : (
          <div className="probbar"><div className="h" style={{ width: `${p.pHome * 100}%` }}>{pct(p.pHome * 100)}</div><div className="a" style={{ width: `${p.pAway * 100}%` }}>{pct(p.pAway * 100)}</div></div>
        )}
        <div className="row between small muted" style={{ marginTop: 4 }}><span>{match.homeName}</span>{p.model === 'poisson' && <span>Empate</span>}<span>{match.awayName}</span></div>
      </div>
      {p.model === 'poisson' && (
        <div className="grid g3">
          <div className="kpi"><div className="v">{fmt(p.lambdaHome, 2)} – {fmt(p.lambdaAway, 2)}</div><div className="l">Goles esperados por el modelo</div></div>
          <div className="kpi"><div className="v">{pct(p.pOver25 * 100)}</div><div className="l">Más de 2,5 goles</div></div>
          <div className="kpi"><div className="v">{pct(p.pBtts * 100)}</div><div className="l">Ambos marcan</div></div>
        </div>
      )}
      {p.model === 'elo' && <p className="small">Rating Elo: {match.homeName} <b>{p.ratingHome}</b> ({p.gamesHome} partidos) · {match.awayName} <b>{p.ratingAway}</b> ({p.gamesAway} partidos).</p>}
      {p.caution && <div className="notice">{p.caution}</div>}
      {bt.data && (
        <div className={`notice ${bt.data.paired?.significant && bt.data.paired.meanDiff < 0 ? 'info' : ''}`}>
          <b>¿Se puede confiar en este modelo?</b> {bt.data.verdict} <Link to={`/analisis?liga=${encodeURIComponent(match.leagueId)}&vista=modelo`}>Ver la evaluación completa</Link>
        </div>
      )}
      <p className="muted small">Calculado solo con partidos de esta liga anteriores a este encuentro ({p.sample} en la base). No usa lesiones, alineaciones ni cuotas.</p>
    </div>
  );
}


/** Reparte a los titulares en líneas según la formación ("4-3-3"). Devuelve null si no hay datos suficientes. */
function layoutLines(formation: string | null, starters: any[]): any[][] | null {
  if (!formation) return null;
  const parts = formation.split('-').map(Number);
  if (parts.some((n) => !Number.isFinite(n) || n <= 0)) return null;
  const withPlace = starters.filter((p) => p.formationPlace).sort((a, b) => a.formationPlace - b.formationPlace);
  if (withPlace.length !== 1 + parts.reduce((a, b) => a + b, 0)) return null;
  const lines: any[][] = [[withPlace[0]]];
  let k = 1;
  for (const n of parts) { lines.push(withPlace.slice(k, k + n)); k += n; }
  return lines;
}

function Pitch({ name, color, formation, players }: { name: string; color: string | null; formation: string | null; players: any[] }) {
  const starters = players.filter((p) => p.starter);
  const bench = players.filter((p) => !p.starter);
  const lines = layoutLines(formation, starters);
  const col = color ? `#${color.replace('#', '')}` : '#3b82f6';
  const short = (n: string) => { const w = n.split(' '); return w.length > 1 ? `${w[0][0]}. ${w.slice(1).join(' ')}` : n; };
  return (
    <div className="card stack">
      <div className="row between"><h3>{name}</h3>{formation && <span className="chip">{formation}</span>}</div>
      {lines ? (
        <div className="pitch" aria-label={`Alineación de ${name}`}>
          <i className="box t" /><i className="box b" />
          {lines.map((line, i) => (
            <div className="ln" key={i} style={{ top: `${90 - i * (78 / (lines.length - 1))}%` }}>
              {line.map((p) => (
                <Link key={p.id} to={`/jugador/${encodeURIComponent(p.id)}`} className="pp" style={{ textDecoration: 'none' }}>
                  <span className="dot" style={{ background: col }}>{p.jersey ?? ''}</span>
                  <span className="nm">{short(p.name)}</span>
                </Link>
              ))}
            </div>
          ))}
        </div>
      ) : starters.length ? (
        <div><p className="muted small" style={{ marginBottom: 6 }}>{formation ? 'ESPN no indicó la posición exacta de cada titular; se muestra la lista.' : 'Titulares'}</p>
          <ul style={{ margin: 0, paddingLeft: 18 }}>{starters.map((p) => <li key={p.id}><Link to={`/jugador/${encodeURIComponent(p.id)}`}>{p.jersey ? `${p.jersey} · ` : ''}{p.name}</Link> <span className="muted">{p.position ?? ''}</span></li>)}</ul></div>
      ) : <Empty>Sin alineación publicada.</Empty>}
      {bench.length > 0 && <div><h3 style={{ fontSize: '.85rem', color: 'var(--muted)' }}>Suplentes que jugaron</h3><p className="small">{bench.map((p) => `${p.jersey ? p.jersey + ' ' : ''}${p.name}`).join(' · ')}</p></div>}
    </div>
  );
}

function StatsTab({ teamStats, m }: { teamStats: any[]; m: any }) {
  const radar = useMemo(() => teamStats
    .filter((s) => s.home?.value != null && s.away?.value != null && s.home.value + s.away.value > 0 && !/Pct|%/.test(s.key) && s.key !== 'minutes')
    .slice(0, 8)
    .map((s) => { const t = s.home.value + s.away.value; return { stat: statLabel(s.key, s.label).slice(0, 16), [m.homeName]: Math.round((s.home.value / t) * 100), [m.awayName]: Math.round((s.away.value / t) * 100) }; }), [teamStats, m]);
  if (!teamStats.length) return <Empty>{m.status === 'scheduled' ? 'El partido no ha empezado.' : 'ESPN no ha publicado estadísticas de equipo para este partido (todavía).'}</Empty>;
  return (
    <div className="grid g2" style={{ alignItems: 'start' }}>
      <div className="card">
        <h2 style={{ marginBottom: 6 }}>Estadísticas del partido</h2>
        <div className="row between small" style={{ fontWeight: 700 }}><span style={{ color: 'var(--home)' }}>{m.homeName}</span><span style={{ color: 'var(--away)' }}>{m.awayName}</span></div>
        {teamStats.map((s: any) => <CompareBar key={s.key} label={statLabel(s.key, s.label)} home={s.home?.value ?? null} away={s.away?.value ?? null} homeText={s.home?.display ?? undefined} awayText={s.away?.display ?? undefined} />)}
      </div>
      {radar.length >= 3 && (
        <div className="card">
          <h2>Perfil del partido</h2>
          <p className="muted small">Cada eje es el porcentaje del total que se llevó cada equipo en esa estadística (50 % = igualdad).</p>
          <div style={{ height: 320 }}><ResponsiveContainer><RadarChart data={radar} outerRadius="72%">
            <PolarGrid stroke="#24242f" /><PolarAngleAxis dataKey="stat" tick={{ fill: '#8d8da3', fontSize: 11 }} />
            <Radar name={m.homeName} dataKey={m.homeName} stroke="#00e0ff" fill="#00e0ff" fillOpacity={0.3} />
            <Radar name={m.awayName} dataKey={m.awayName} stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.25} />
            <Legend /><Tooltip contentStyle={{ background: '#15151d', border: '1px solid #24242f', borderRadius: 10, color: '#f2f2f7' }} />
          </RadarChart></ResponsiveContainer></div>
        </div>
      )}
    </div>
  );
}

function StandingsTab({ m }: { m: any }) {
  const res = useApi<any>(`/standings?league=${encodeURIComponent(m.leagueId)}`);
  if (res.loading) return <Loading rows={4} />;
  const groups: any[] = res.data?.groups ?? [];
  const mine = groups.filter((g) => g.teams.some((t: any) => t.teamId === m.homeId || t.teamId === m.awayId));
  if (!mine.length) return <Empty>Esta competición no tiene clasificación guardada (o los equipos no aparecen en ella).</Empty>;
  const COLS = ['gamesPlayed', 'wins', 'ties', 'losses', 'pointsFor', 'pointsAgainst', 'pointDifferential', 'winPercent', 'points'];
  return (
    <div className="stack">
      {mine.map((g) => {
        const present = COLS.filter((c) => g.teams.some((t: any) => t.stats[c] !== undefined && t.stats[c] !== ''));
        return (
          <div className="tablewrap" key={g.name}>
            {g.name && <h3 style={{ marginBottom: 6 }}>{g.name}</h3>}
            <table className="t"><thead><tr><th>#</th><th>Equipo</th>{present.map((c) => <th key={c} className="num">{statLabel(c)}</th>)}</tr></thead>
              <tbody>{g.teams.map((t: any) => {
                const hi = t.teamId === m.homeId ? 'var(--home)' : t.teamId === m.awayId ? 'var(--away)' : null;
                return <tr key={t.teamId} style={hi ? { background: 'rgba(255,255,255,.04)', boxShadow: `inset 3px 0 0 ${hi}` } : undefined}>
                  <td className="muted">{t.rank}</td><td><Link to={`/equipo/${encodeURIComponent(t.teamId)}`} className="row"><Logo src={t.logo} name={t.name} /><span style={hi ? { fontWeight: 800 } : undefined}>{t.name}</span></Link></td>
                  {present.map((c) => { const v = t.stats[c]; return <td key={c} className="num">{typeof v === 'number' ? (c === 'winPercent' ? fmt(v, 3) : Number.isInteger(v) ? v : fmt(v, 1)) : v ?? '—'}</td>; })}</tr>;
              })}</tbody></table>
          </div>
        );
      })}
      <p className="muted small">Tabla tal como la publica ESPN; los dos equipos del partido están resaltados.</p>
    </div>
  );
}

function InjuriesTab({ injuries, m }: { injuries: any[]; m: any }) {
  if (!injuries.length) return <Empty>ESPN no lista lesionados ni bajas para este partido (o no hay ninguna). No se rellena con suposiciones.</Empty>;
  return (
    <div className="grid g2" style={{ alignItems: 'start' }}>
      {[[m.homeId, m.homeName], [m.awayId, m.awayName]].map(([tid, name]) => {
        const rows = injuries.filter((i) => i.teamId === tid);
        return (
          <div className="card" key={tid}><h3 style={{ marginBottom: 8 }}>{name}</h3>
            {rows.length === 0 ? <p className="muted small">Sin bajas listadas.</p> : (
              <table className="t"><thead><tr><th>Jugador</th><th>Pos</th><th>Estado</th><th>Detalle</th></tr></thead>
                <tbody>{rows.map((i, k) => <tr key={k}><td>{i.name}</td><td className="muted">{i.position ?? '—'}</td>
                  <td><span className={`sevchip ${/out|baja|doubt/i.test(i.status ?? '') ? 'out' : 'dtd'}`}>{i.status ?? '—'}</span></td><td className="muted">{i.detail ?? ''}</td></tr>)}</tbody></table>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function MatchDetail() {
  const { id } = useParams();
  const { setAiOpen } = usePrefs();
  const res = useApi<any>(`/matches/${encodeURIComponent(id!)}`, 15_000);
  const [tab, setTab] = useState('resumen');
  if (res.loading && !res.data) return <Loading rows={6} />;
  if (res.error) return <ErrorBox error={res.error} />;
  if (!res.data) return null;
  const d = res.data;
  const m = d.match, prediction = d.prediction;
  const teamStats: any[] = d.teamStats ?? [], events: any[] = d.events ?? [], players: any[] = d.players ?? [], lineups: any[] = d.lineups ?? [], injuries: any[] = d.injuries ?? [], odds: any[] = d.odds ?? [];
  const form = d.form ?? { home: [], away: [] };
  const h2h = d.h2h ?? { n: 0, matches: [] };
  const played = m.homeScore !== null && m.awayScore !== null;
  const hasLine = m.homeLine && m.awayLine;
  const formation = (tid: string) => lineups.find((l: any) => l.teamId === tid)?.formation ?? null;
  const facts: [string, string][] = ([
    ['Inicio', dateTimeOf(m.startTime)], ['Estadio', m.venue ? `${m.venue}${m.city ? `, ${m.city}` : ''}` : ''], ['Asistencia', m.attendance ? m.attendance.toLocaleString('es-ES') : ''],
    ['Fase', m.stage ?? ''], ['Temporada', m.season ? String(m.season) : ''], ['Sede neutral', m.neutral ? 'Sí' : ''],
  ] as [string, string][]).filter(([, v]) => v);

  return (
    <div className="stack-lg">
      <div className="card flat">
        <div className="league-head"><Link to={`/tablas?league=${encodeURIComponent(m.leagueId)}`}>{m.leagueName}</Link>{m.stage && <span className="muted small">{m.stage}</span>}
          <span style={{ marginLeft: 'auto' }} className={`chip ${m.status === 'live' ? 'live' : ''}`}>{m.status === 'live' ? (m.statusDetail || 'En vivo') : STATUS_NAMES[m.status] ?? m.status}</span></div>
        <div className="hero-score">
          <Link to={`/equipo/${encodeURIComponent(m.homeId)}`} className="tm" style={{ textDecoration: 'none' }}><Logo src={m.homeLogo} name={m.homeName} color={m.homeColor} size="lg" />{m.homeName}</Link>
          <div className="big">{played ? <>{m.homeScore} – {m.awayScore}</> : <span className="muted" style={{ fontSize: '0.5em' }}>{dateTimeOf(m.startTime)}</span>}
            <small>{played ? dateTimeOf(m.startTime) : ''}</small></div>
          <Link to={`/equipo/${encodeURIComponent(m.awayId)}`} className="tm" style={{ textDecoration: 'none' }}><Logo src={m.awayLogo} name={m.awayName} color={m.awayColor} size="lg" />{m.awayName}</Link>
        </div>
        {hasLine && (
          <div className="tablewrap" style={{ borderTop: '1px solid var(--line)' }}><table className="t"><thead><tr><th>{m.sportId === 'tennis' ? 'Sets' : 'Periodo'}</th>{m.homeLine.map((_: number, i: number) => <th key={i} className="num">{i + 1}</th>)}</tr></thead>
            <tbody><tr><td>{m.homeName}</td>{m.homeLine.map((v: number, i: number) => <td key={i} className="num">{v}</td>)}</tr><tr><td>{m.awayName}</td>{m.awayLine.map((v: number, i: number) => <td key={i} className="num">{v}</td>)}</tr></tbody></table></div>
        )}
        <div className="row wrap small muted" style={{ padding: '10px 16px', borderTop: '1px solid var(--line)' }}>
          {m.venue && <span>{m.venue}{m.city ? `, ${m.city}` : ''}</span>}{m.attendance && <span>· {m.attendance.toLocaleString('es-ES')} espectadores</span>}
          <span style={{ marginLeft: 'auto' }}>{m.hasBoxscore ? 'Boxscore completo guardado' : m.status === 'final' ? 'Boxscore pendiente de descarga' : ''}</span>
          <button className="iconbtn ai" onClick={() => setAiOpen(true)}><Sparkles size={14} /> Analizar con IA</button>
        </div>
      </div>

      <Tabs value={tab} onChange={setTab} tabs={[
        { id: 'resumen', label: 'Resumen' }, { id: 'stats', label: 'Estadísticas' }, { id: 'jugadores', label: 'Jugadores' }, { id: 'alineaciones', label: 'Alineaciones' },
        { id: 'lesiones', label: `Lesiones${injuries.length ? ` (${injuries.length})` : ''}` }, { id: 'previa', label: 'Forma y H2H' }, { id: 'tabla', label: 'Clasificación' },
        { id: 'cuotas', label: 'Cuotas' }, { id: 'modelo', label: 'Predicción' },
      ]} />

      {tab === 'resumen' && (
        <div className="grid g2" style={{ alignItems: 'start' }}>
          <div className="stack">
            <div className="card"><h2 style={{ marginBottom: 10 }}>Datos del partido</h2>
              <div className="facts">{facts.map(([k, v]) => <div className="fact" key={k}><span>{k}</span><b>{v}</b></div>)}</div></div>
            {events.some((e: any) => e.scoring) && <div className="card"><h3 style={{ marginBottom: 8 }}>Flujo del partido</h3><FlowChart events={events} homeId={m.homeId} homeName={m.homeName} awayName={m.awayName} football={m.sportId === 'football'} /></div>}
            {prediction?.available && (
              <div className="card"><h3 style={{ marginBottom: 8 }}>Lo que dice el modelo</h3>
                <div className="probbar">{prediction.model === 'poisson' ? <><div className="h" style={{ width: `${prediction.pHome * 100}%` }}>{pct(prediction.pHome * 100)}</div><div className="d" style={{ width: `${prediction.pDraw * 100}%` }}>{pct(prediction.pDraw * 100)}</div><div className="a" style={{ width: `${prediction.pAway * 100}%` }}>{pct(prediction.pAway * 100)}</div></> : <><div className="h" style={{ width: `${prediction.pHome * 100}%` }}>{pct(prediction.pHome * 100)}</div><div className="a" style={{ width: `${prediction.pAway * 100}%` }}>{pct(prediction.pAway * 100)}</div></>}</div>
                <p className="footnote" style={{ marginTop: 6 }}>Estimación simple; mira la pestaña Predicción para ver si el modelo merece confianza.</p></div>
            )}
          </div>
          <div className="card">
            <h2 style={{ marginBottom: 6 }}>Cronología</h2>
            {events.length === 0 ? <Empty>Sin eventos registrados.</Empty> : (
              <ol className="timeline">
                {events.map((e: any, i: number) => (
                  <li key={i} style={{ fontWeight: e.scoring ? 700 : 400 }}>
                    <span className="muted">{e.clock ?? ''}</span>
                    <span className="dotc" style={{ background: e.teamId === m.homeId ? 'var(--home)' : e.teamId === m.awayId ? 'var(--away)' : 'var(--muted)' }} />
                    <span>{eventName(e.type)}{e.playerName ? ` — ${e.playerName}` : ''}{!e.playerName && e.text ? ` — ${e.text}` : ''}</span>
                    {e.homeScore !== null && e.awayScore !== null ? <span className="muted">{e.homeScore}-{e.awayScore}</span> : <span />}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}

      {tab === 'stats' && <StatsTab teamStats={teamStats} m={m} />}

      {tab === 'jugadores' && (
        <div className="stack">
          {players.length === 0 ? <div className="card"><Empty>Todavía no hay estadísticas de jugadores para este partido.</Empty></div> : [m.homeId, m.awayId].map((tid, i) => (
            <div className="card" key={tid}><h2 style={{ color: i === 0 ? 'var(--home)' : 'var(--away)', marginBottom: 8 }}>{i === 0 ? m.homeName : m.awayName}</h2><PlayersTable players={players} teamId={tid} /></div>
          ))}
        </div>
      )}

      {tab === 'alineaciones' && (
        players.length === 0 ? <div className="card"><Empty>{m.status === 'scheduled' ? 'Las alineaciones aparecen cuando ESPN las publica, poco antes del inicio.' : 'ESPN no publicó alineaciones para este partido.'}</Empty></div> : (
          <div className="grid g2" style={{ alignItems: 'start' }}>
            <Pitch name={m.homeName} color={m.homeColor} formation={formation(m.homeId)} players={players.filter((p: any) => p.teamId === m.homeId)} />
            <Pitch name={m.awayName} color={m.awayColor} formation={formation(m.awayId)} players={players.filter((p: any) => p.teamId === m.awayId)} />
          </div>
        )
      )}

      {tab === 'lesiones' && <div className="stack"><InjuriesTab injuries={injuries} m={m} /></div>}

      {tab === 'previa' && (
        <div className="grid g2" style={{ alignItems: 'start' }}>
          <div className="card stack">
            <h2>Forma antes del partido</h2>
            {[[m.homeName, form.home], [m.awayName, form.away]].map(([name, f]: any) => (
              <div key={name}><div className="row between"><b>{name}</b><Form items={f} /></div>
                <ul className="small muted" style={{ margin: '6px 0 0', paddingLeft: 18 }}>{f.slice(0, 5).map((x: any) => <li key={x.matchId}><Link to={`/partido/${encodeURIComponent(x.matchId)}`}>{x.score}</Link> vs {x.opponent} ({x.home ? 'local' : 'visitante'})</li>)}</ul></div>
            ))}
            <p className="muted small">Solo cuenta partidos que ya están guardados en la base de datos; con poca historia, la forma es parcial.</p>
          </div>
          <div className="card stack">
            <h2>Enfrentamientos directos</h2>
            {h2h.n === 0 ? <Empty>No hay enfrentamientos previos entre estos equipos en la base de datos.</Empty> : (
              <>
                <div className="grid g3 center">
                  <div className="kpi"><div className="v" style={{ color: 'var(--home)' }}>{h2h.aWins}</div><div className="l">{m.homeName}</div></div>
                  <div className="kpi"><div className="v">{h2h.draws}</div><div className="l">Empates</div></div>
                  <div className="kpi"><div className="v" style={{ color: 'var(--away)' }}>{h2h.bWins}</div><div className="l">{m.awayName}</div></div>
                </div>
                <p className="small">Promedio de {fmt(h2h.avgTotal, 1)} goles/puntos por partido en {h2h.n} {h2h.n === 1 ? 'duelo' : 'duelos'}.</p>
                <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{h2h.matches.map((x: any) => <li key={x.id}><Link to={`/partido/${encodeURIComponent(x.id)}`}>{dateTimeOf(x.start_time).split(' · ')[0]}: {x.hs}-{x.aws}</Link></li>)}</ul>
              </>
            )}
          </div>
        </div>
      )}

      {tab === 'tabla' && <div className="card"><StandingsTab m={m} /></div>}
      {tab === 'modelo' && <div className="card"><Prediction p={prediction} match={m} /></div>}
      {tab === 'cuotas' && <div className="card"><Odds odds={odds} home={m.homeName} away={m.awayName} /></div>}
    </div>
  );
}
