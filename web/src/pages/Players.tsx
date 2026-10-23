import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { qs, useApi } from '../lib/api';
import { dateOf, fmt, SPORT_NAMES, statLabel } from '../lib/format';
import { Empty, ErrorBox, Loading, Logo, Seg } from '../components/ui';

function Leaders() {
  const leagues = useApi<any[]>('/leagues');
  const [league, setLeague] = useState('');
  const [key, setKey] = useState('');
  const [mode, setMode] = useState<'total' | 'avg'>('total');
  const withBox = (leagues.data ?? []).filter((l) => l.withBoxscore > 0);
  useEffect(() => { if (!league && withBox.length) setLeague(withBox[0].id); }, [withBox.length]);
  const keys = useApi<any[]>(league ? `/stat-keys?league=${encodeURIComponent(league)}` : null);
  const options = useMemo(() => (keys.data ?? []).map((k) => ({ ...k, id: `${k.grp}|${k.key}` })), [keys.data]);
  useEffect(() => {
    if (!options.length) return;
    if (!options.find((o) => o.id === key)) setKey((options.find((o) => ['totalGoals', 'points'].includes(o.key)) ?? options[0]).id);
  }, [options]);
  const [grp, k] = key.split('|');
  const res = useApi<any>(league && key ? `/leaders${qs({ league, key: k, grp, mode, limit: 25 })}` : null);

  return (
    <div className="card stack">
      <h2>Líderes por estadística</h2>
      {withBox.length === 0 ? <Empty>Todavía no hay boxscores guardados. Cuando se descarguen los primeros partidos terminados aparecerán aquí los líderes.</Empty> : (
        <>
          <div className="row wrap">
            <label className="field"><span>Liga</span><select value={league} onChange={(e) => setLeague(e.target.value)}>{withBox.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.country})</option>)}</select></label>
            <label className="field"><span>Estadística</span><select value={key} onChange={(e) => setKey(e.target.value)}>{options.map((o) => <option key={o.id} value={o.id}>{statLabel(o.key, o.label)}{o.grp ? ` (${o.grp})` : ''}</option>)}</select></label>
            <div className="field"><span>Ordenar por</span><Seg label="Modo" value={mode} onChange={setMode} options={[{ id: 'total', label: 'Total' }, { id: 'avg', label: 'Promedio' }]} /></div>
          </div>
          {res.loading && !res.data ? <Loading rows={3} /> : res.error ? <ErrorBox error={res.error} /> : (
            <div className="tablewrap"><table className="t"><thead><tr><th>#</th><th>Jugador</th><th>Equipo</th><th className="num">Partidos</th><th className="num">Total</th><th className="num">Promedio</th><th className="num">Mejor partido</th></tr></thead>
              <tbody>{(res.data?.rows ?? []).map((r: any, i: number) => (
                <tr key={r.id}><td className="muted">{i + 1}</td><td><Link to={`/jugador/${encodeURIComponent(r.id)}`}>{r.name}</Link></td><td>{r.teamName ?? '—'}</td><td className="num">{r.games}</td><td className="num"><b>{fmt(r.total, Number.isInteger(r.total) ? 0 : 1)}</b></td><td className="num">{fmt(r.avg, 2)}</td><td className="num">{fmt(r.best, 0)}</td></tr>
              ))}</tbody></table></div>
          )}
          {mode === 'avg' && <p className="muted small">El promedio exige un mínimo de {res.data?.minGames ?? 5} partidos para que una sola actuación no domine el ranking.</p>}
        </>
      )}
    </div>
  );
}

export function PlayersPage() {
  const [text, setText] = useState('');
  const [sport, setSport] = useState('');
  const sports = useApi<any[]>('/sports');
  const res = useApi<any[]>(`/players${qs({ q: text, sport, limit: 60 })}`);
  return (
    <div className="stack-lg">
      <div><h1>Jugadores</h1><p className="muted">Cada partido terminado añade apariciones y estadísticas individuales.</p></div>
      <Leaders />
      <div className="card stack">
        <h2>Buscar jugador</h2>
        <div className="row wrap">
          <input type="search" placeholder="Nombre del jugador" value={text} onChange={(e) => setText(e.target.value)} aria-label="Nombre del jugador" />
          <select value={sport} onChange={(e) => setSport(e.target.value)} aria-label="Deporte"><option value="">Todos los deportes</option>{(sports.data ?? []).map((s) => <option key={s.id} value={s.id}>{SPORT_NAMES[s.id] ?? s.name}</option>)}</select>
        </div>
        {res.loading && !res.data ? <Loading rows={3} /> : !res.data?.length ? <Empty>No hay jugadores que coincidan.</Empty> : (
          <div className="tablewrap"><table className="t"><thead><tr><th>Jugador</th><th>Equipo</th><th>Pos</th><th className="num">Partidos</th></tr></thead>
            <tbody>{res.data.map((p) => <tr key={p.id}><td><Link to={`/jugador/${encodeURIComponent(p.id)}`}>{p.name}</Link></td><td>{p.teamName ? <Link to={`/equipo/${encodeURIComponent(p.teamId)}`}>{p.teamName}</Link> : '—'}</td><td className="muted">{p.position ?? '—'}</td><td className="num">{p.games}</td></tr>)}</tbody></table></div>
        )}
      </div>
    </div>
  );
}

export function PlayerPage() {
  const { id } = useParams();
  const res = useApi<any>(`/players/${encodeURIComponent(id!)}`);
  const [key, setKey] = useState('');
  const d = res.data;
  const chartKeys = useMemo(() => (d?.totals ?? []).filter((t: any) => t.games >= 3).sort((a: any, b: any) => b.games - a.games), [d]);
  useEffect(() => { if (chartKeys.length && !chartKeys.find((t: any) => t.key === key)) setKey((chartKeys.find((t: any) => ['totalGoals', 'points'].includes(t.key)) ?? chartKeys[0]).key); }, [chartKeys]);
  if (res.loading && !d) return <Loading rows={6} />;
  if (res.error) return <ErrorBox error={res.error} />;
  if (!d) return null;
  const p = d.player;
  const series = [...d.log].reverse().filter((l: any) => l.stats[key] !== undefined && l.stats[key] !== null).map((l: any) => ({ fecha: dateOf(l.date).replace(/ \d{4}$/, ''), valor: l.stats[key], rival: `${l.homeName} ${l.hs}-${l.aws} ${l.awayName}` }));
  return (
    <div className="stack-lg">
      <div className="row"><Logo src={p.headshot} name={p.name} size="lg" /><div><h1>{p.name}</h1><p className="muted">{p.position ?? 'Posición no indicada'} · {p.teamName ? <Link to={`/equipo/${encodeURIComponent(p.teamId)}`}>{p.teamName}</Link> : 'sin equipo'} · {d.games} {d.games === 1 ? 'partido' : 'partidos'} en la base</p></div></div>
      {d.totals.length === 0 ? <div className="card"><Empty>Este jugador aún no tiene estadísticas guardadas.</Empty></div> : (
        <>
          <div className="card"><h2>Acumulado y promedios</h2>
            <div className="tablewrap"><table className="t"><thead><tr><th>Estadística</th><th className="num">Partidos con dato</th><th className="num">Total</th><th className="num">Promedio</th><th className="num">Máximo</th></tr></thead>
              <tbody>{d.totals.map((t: any) => <tr key={`${t.grp}|${t.key}`}><td>{statLabel(t.key, t.label)}{t.grp ? <span className="muted small"> ({t.grp})</span> : null}</td><td className="num">{t.games}</td><td className="num">{fmt(t.total, Number.isInteger(t.total) ? 0 : 1)}</td><td className="num">{fmt(t.avg, 2)}</td><td className="num">{fmt(t.max, 0)}</td></tr>)}</tbody></table></div></div>
          {chartKeys.length > 0 && (
            <div className="card stack"><div className="row wrap between"><h2>Partido a partido</h2>
              <select value={key} onChange={(e) => setKey(e.target.value)} aria-label="Estadística a graficar">{chartKeys.map((t: any) => <option key={`${t.grp}${t.key}`} value={t.key}>{statLabel(t.key, t.label)}</option>)}</select></div>
              <div style={{ height: 240 }} role="img" aria-label={`Gráfico de ${statLabel(key)} por partido`}>
                <ResponsiveContainer><BarChart data={series}><CartesianGrid stroke="var(--line)" vertical={false} /><XAxis dataKey="fecha" tick={{ fill: 'var(--muted)', fontSize: 12 }} /><YAxis tick={{ fill: 'var(--muted)', fontSize: 12 }} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8 }} formatter={(v: any) => [v, statLabel(key)]} labelFormatter={(_, pl: any) => pl?.[0]?.payload?.rival ?? ''} />
                  <Bar dataKey="valor" fill="var(--accent)" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div></div>
          )}
        </>
      )}
      <div className="card flat"><div className="league-head">Últimos partidos jugados</div>
        {d.log.length === 0 ? <Empty>Sin apariciones registradas.</Empty> : <div className="tablewrap"><table className="t"><tbody>{d.log.map((l: any) => <tr key={l.matchId}><td className="muted">{dateOf(l.date)}</td><td><Link to={`/partido/${encodeURIComponent(l.matchId)}`}>{l.homeName} {l.hs} – {l.aws} {l.awayName}</Link></td><td className="muted">{l.starter ? 'Titular' : 'Suplente'}</td></tr>)}</tbody></table></div>}</div>
    </div>
  );
}
