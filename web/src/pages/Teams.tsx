import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { qs, useApi } from '../lib/api';
import { fmt, pct, SPORT_NAMES, statLabel } from '../lib/format';
import { Empty, ErrorBox, Form, Loading, Logo, MatchRow, type MatchLite } from '../components/ui';

export function TeamsPage() {
  const [text, setText] = useState('');
  const [sport, setSport] = useState('');
  const sports = useApi<any[]>('/sports');
  const res = useApi<any[]>(`/teams${qs({ q: text, sport, limit: 200 })}`);
  return (
    <div className="stack-lg">
      <div><h1>Equipos y jugadores individuales</h1><p className="muted">Todos los que han aparecido en los partidos guardados.</p></div>
      <div className="row wrap">
        <input type="search" placeholder="Buscar por nombre" value={text} onChange={(e) => setText(e.target.value)} aria-label="Buscar equipo" />
        <select value={sport} onChange={(e) => setSport(e.target.value)} aria-label="Deporte"><option value="">Todos los deportes</option>{(sports.data ?? []).map((s) => <option key={s.id} value={s.id}>{SPORT_NAMES[s.id] ?? s.name}</option>)}</select>
      </div>
      {res.loading && !res.data ? <Loading /> : res.error ? <ErrorBox error={res.error} /> : !res.data?.length ? <div className="card"><Empty>No hay equipos que coincidan.</Empty></div> : (
        <div className="grid gauto">
          {res.data.map((t) => (
            <Link key={t.id} to={`/equipo/${encodeURIComponent(t.id)}`} className="card row" style={{ textDecoration: 'none' }}>
              <Logo src={t.logo} name={t.name} /><div><b>{t.name}</b><div className="muted small">{SPORT_NAMES[t.sportId]}{t.country ? ` · ${t.country}` : ''}</div></div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

const RecordRow = ({ label, r }: { label: string; r: any }) => (
  <tr><td>{label}</td><td className="num">{r.played}</td><td className="num">{r.w}</td><td className="num">{r.d}</td><td className="num">{r.l}</td><td className="num">{r.gf}</td><td className="num">{r.ga}</td><td className="num">{r.played ? fmt(r.gf / r.played, 2) : '—'}</td><td className="num">{r.played ? fmt(r.ga / r.played, 2) : '—'}</td></tr>
);

export function TeamPage() {
  const { id } = useParams();
  const res = useApi<any>(`/teams/${encodeURIComponent(id!)}`);
  if (res.loading && !res.data) return <Loading rows={6} />;
  if (res.error) return <ErrorBox error={res.error} />;
  const d = res.data;
  if (!d) return null;
  const { team, record, ratings, statAverages, recent, upcoming, roster } = d;
  const formItems = record.form.map((f: any) => ({ result: f.result, score: f.score, opponent: f.opponent }));
  return (
    <div className="stack-lg">
      <div className="row"><Logo src={team.logo} name={team.name} color={team.color} size="lg" />
        <div><h1>{team.name}</h1><p className="muted">{SPORT_NAMES[team.sportId]}{team.country ? ` · ${team.country}` : ''} · {d.leagues.map((l: any) => l.name).join(', ') || 'sin liga'}</p></div></div>

      {record.total.played === 0 ? <div className="card"><Empty>Aún no hay partidos terminados de este equipo en la base de datos.</Empty></div> : (
        <div className="grid g2" style={{ alignItems: 'start' }}>
          <div className="card stack">
            <h2>Balance (partidos guardados)</h2>
            <div className="tablewrap"><table className="t"><thead><tr><th></th><th className="num">PJ</th><th className="num">G</th><th className="num">E</th><th className="num">P</th><th className="num">GF</th><th className="num">GC</th><th className="num">GF/p</th><th className="num">GC/p</th></tr></thead>
              <tbody><RecordRow label="Total" r={record.total} /><RecordRow label="Local" r={record.home} /><RecordRow label="Visitante" r={record.away} /></tbody></table></div>
            <div className="row between"><span>Últimos {formItems.length}</span><Form items={formItems} /></div>
            {record.rates && <p className="small muted">Más de 2,5: {pct(record.rates.over25Pct)} · Ambos marcan: {pct(record.rates.bttsPct)} · Portería a cero: {pct(record.rates.cleanSheetPct)} (sobre {record.rates.n} partidos)</p>}
          </div>
          <div className="card stack">
            <h2>Fuerza (Elo)</h2>
            {ratings.length === 0 ? <Empty>Sin datos suficientes.</Empty> : ratings.map((r: any) => (
              <div key={r.leagueId} className="row between"><span>{r.leagueName}</span><span><b>{r.rating}</b> <span className="muted small">· puesto {r.rank} de {r.of} · {r.games} partidos</span></span></div>
            ))}
            <p className="muted small">El Elo es una medida relativa calculada con los partidos guardados; con pocos partidos es poco fiable. <Link to="/analisis?vista=elo">Cómo se evalúa</Link>.</p>
          </div>
        </div>
      )}

      {statAverages.length > 0 && (
        <div className="card"><h2>Promedio por partido</h2>
          <div className="grid gauto">{statAverages.slice(0, 18).map((s: any) => <div key={s.key} className="kpi"><div className="v">{fmt(s.avg, s.avg >= 100 ? 0 : 1)}</div><div className="l">{statLabel(s.key, s.label)} · {s.games} p.</div></div>)}</div></div>
      )}

      <div className="grid g2" style={{ alignItems: 'start' }}>
        <div className="card flat"><div className="league-head">Últimos partidos</div>{recent.length ? recent.map((m: MatchLite) => <MatchRow key={m.id} m={m} showDate />) : <Empty>Sin partidos.</Empty>}</div>
        <div className="card flat"><div className="league-head">Próximos partidos</div>{upcoming.length ? upcoming.map((m: MatchLite) => <MatchRow key={m.id} m={m} showDate />) : <Empty>No hay próximos partidos en la base.</Empty>}</div>
      </div>

      {roster.length > 0 && (
        <div className="card"><h2>Plantilla vista en los partidos guardados</h2>
          <div className="tablewrap"><table className="t"><thead><tr><th>Jugador</th><th>Pos</th><th className="num">Partidos</th><th className="num">Titular</th></tr></thead>
            <tbody>{roster.map((p: any) => <tr key={p.id}><td><Link to={`/jugador/${encodeURIComponent(p.id)}`}>{p.name}</Link></td><td className="muted">{p.position ?? '—'}</td><td className="num">{p.games}</td><td className="num">{p.starts}</td></tr>)}</tbody></table></div></div>
      )}
    </div>
  );
}
