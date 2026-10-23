import { useEffect, useState } from 'react';
import { api, qs, useApi } from '../lib/api';
import { ago, dateTimeOf, SPORT_NAMES } from '../lib/format';
import { Empty, ErrorBox, Loading, Tabs } from '../components/ui';

const DESCRIPTIONS: Record<string, string> = {
  matches: 'Un partido por fila: equipos, marcador, estado, sede.', teams: 'Equipos (y tenistas).', players: 'Jugadores vistos en algún boxscore.',
  team_match_stats: 'Estadísticas de cada equipo en cada partido (posesión, tiros, rebotes…).', player_match_stats: 'Estadísticas de cada jugador en cada partido.',
  appearances: 'Quién jugó cada partido.', match_events: 'Goles, tarjetas y jugadas clave.', standings: 'Última clasificación descargada.',
  odds_snapshots: 'Cuotas publicadas por ESPN cada vez que cambian.', leagues: 'Ligas que se siguen.', sports: 'Deportes.', ingest_log: 'Registro técnico de las descargas.',
};

function Coverage() {
  const meta = useApi<any>('/meta', 30_000);
  const leagues = useApi<any[]>('/leagues');
  if (meta.loading && !meta.data) return <Loading />;
  if (meta.error) return <ErrorBox error={meta.error} />;
  const m = meta.data;
  const kpi = (v: number, l: string) => <div className="card kpi" key={l}><div className="v">{v.toLocaleString('es-ES')}</div><div className="l">{l}</div></div>;
  return (
    <div className="stack-lg">
      <div className="grid g4">
        {kpi(m.counts.matches, 'Partidos guardados')}{kpi(m.counts.withBoxscore, 'Con boxscore completo')}{kpi(m.counts.players, 'Jugadores')}{kpi(m.counts.playerStats + m.counts.teamStats, 'Datos estadísticos')}
      </div>
      <div className="card stack">
        <h2>Estado de la recolección</h2>
        <p className="small">Historial: {m.firstMatch ? `${dateTimeOf(m.firstMatch).split(' · ')[0]} → ${dateTimeOf(m.lastMatch).split(' · ')[0]}` : 'vacío'} · Último ciclo en vivo: {ago(m.lastLiveCycle)} · Último barrido: {ago(m.lastSweep)} · Últimas 24 h: {m.ingest24h.ok} descargas correctas, <b style={{ color: m.ingest24h.failed ? 'var(--bad)' : undefined }}>{m.ingest24h.failed} con error</b>.</p>
        <p className="muted small">Cada partido terminado se guarda con su boxscore. La base crece sola: cuantos más días lleve funcionando el servidor, más profundo será el análisis.</p>
      </div>
      <div className="card flat"><div className="league-head">Cobertura por liga</div>
        <div className="tablewrap"><table className="t"><thead><tr><th>Liga</th><th>Deporte</th><th className="num">Partidos</th><th className="num">Terminados</th><th className="num">Con boxscore</th><th>Último partido</th></tr></thead>
          <tbody>{(leagues.data ?? []).map((l) => <tr key={l.id}><td>{l.name} <span className="muted small">{l.country}</span></td><td className="muted">{SPORT_NAMES[l.sportId]}</td><td className="num">{l.matches}</td><td className="num">{l.finished ?? 0}</td><td className="num">{l.hasDetails ? l.withBoxscore ?? 0 : <span className="muted" title="La fuente no publica boxscore de este deporte">n/d</span>}</td><td className="muted">{l.lastMatch ? dateTimeOf(l.lastMatch).split(' · ')[0] : '—'}</td></tr>)}</tbody></table></div></div>
    </div>
  );
}

function Explorer() {
  const tables = useApi<any[]>('/data/tables');
  const [table, setTable] = useState('matches');
  const [offset, setOffset] = useState(0);
  const [order, setOrder] = useState('');
  const [dir, setDir] = useState<'asc' | 'desc'>('asc');
  const [filter, setFilter] = useState<{ col: string; val: string }>({ col: '', val: '' });
  const LIMIT = 50;
  const f: Record<string, string> = filter.col && filter.val ? { [`f_${filter.col}__like`]: filter.val } : {};
  const query = qs({ limit: LIMIT, offset, order, dir, ...f });
  const res = useApi<any>(`/data/${table}${query}`);
  useEffect(() => { setOffset(0); setOrder(''); setFilter({ col: '', val: '' }); }, [table]);
  const cur = tables.data?.find((t) => t.name === table);
  const exportUrl = (fmt: string) => `/api/data/${table}/export.${fmt}${qs({ order, dir, ...f })}`;
  return (
    <div className="stack">
      <div className="row wrap">
        <label className="field"><span>Tabla</span><select value={table} onChange={(e) => setTable(e.target.value)}>{(tables.data ?? []).map((t) => <option key={t.name} value={t.name}>{t.name} ({t.rows.toLocaleString('es-ES')})</option>)}</select></label>
        <label className="field"><span>Filtrar columna</span><select value={filter.col} onChange={(e) => setFilter({ col: e.target.value, val: '' })}><option value="">—</option>{(cur?.columns ?? []).map((c: any) => <option key={c.name}>{c.name}</option>)}</select></label>
        <label className="field"><span>Contiene</span><input type="search" value={filter.val} disabled={!filter.col} onChange={(e) => { setFilter({ ...filter, val: e.target.value }); setOffset(0); }} /></label>
        <div className="row" style={{ marginLeft: 'auto', marginTop: 16 }}><a className="btn" href={exportUrl('csv')} download>Descargar CSV</a><a className="btn" href={exportUrl('json')} download>Descargar JSON</a></div>
      </div>
      <p className="muted small">{DESCRIPTIONS[table]} El CSV abre directo en Excel, Python (pandas) o R, con los mismos filtros que ves.</p>
      {res.loading && !res.data ? <Loading /> : res.error ? <ErrorBox error={res.error} /> : (
        <div className="card flat">
          <div className="tablewrap" style={{ maxHeight: 520 }}><table className="t"><thead><tr>{res.data.columns.map((c: string) => <th key={c}><button onClick={() => { if (order === c) setDir(dir === 'asc' ? 'desc' : 'asc'); else { setOrder(c); setDir('asc'); } setOffset(0); }}>{c}{order === c ? (dir === 'asc' ? ' ▲' : ' ▼') : ''}</button></th>)}</tr></thead>
            <tbody>{res.data.rows.length === 0 ? <tr><td colSpan={res.data.columns.length}><Empty>Sin filas con este filtro.</Empty></td></tr> : res.data.rows.map((r: any, i: number) => <tr key={i}>{res.data.columns.map((c: string) => <td key={c} style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r[c] === null ? <span className="muted">—</span> : String(r[c])}</td>)}</tr>)}</tbody></table></div>
          <div className="row between" style={{ padding: 10, borderTop: '1px solid var(--line)' }}>
            <span className="small muted">{res.data.total.toLocaleString('es-ES')} filas · mostrando {Math.min(offset + 1, res.data.total)}–{Math.min(offset + LIMIT, res.data.total)}</span>
            <span className="row"><button className="btn" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - LIMIT))}>Anterior</button><button className="btn" disabled={offset + LIMIT >= res.data.total} onClick={() => setOffset(offset + LIMIT)}>Siguiente</button></span>
          </div>
        </div>
      )}
    </div>
  );
}

const EXAMPLES: [string, string][] = [
  ['Máximos goleadores guardados', `SELECT p.name, t.name AS equipo, SUM(s.value) AS goles, COUNT(*) AS partidos\nFROM player_match_stats s JOIN players p ON p.id = s.player_id LEFT JOIN teams t ON t.id = p.team_id\nWHERE s.key = 'totalGoals' GROUP BY p.id ORDER BY goles DESC LIMIT 20`],
  ['Goles por partido por liga', `SELECT league_id, COUNT(*) AS partidos, ROUND(AVG(home_score + away_score), 2) AS total_medio\nFROM matches WHERE status = 'final' GROUP BY league_id ORDER BY partidos DESC`],
  ['Victorias de local por mes', `SELECT substr(start_time, 1, 7) AS mes, COUNT(*) AS partidos, ROUND(100.0 * SUM(winner = 'home') / COUNT(*), 1) AS pct_local\nFROM matches WHERE status = 'final' GROUP BY mes ORDER BY mes`],
];

function SqlConsole() {
  const [q, setQ] = useState(EXAMPLES[0][1]);
  const [out, setOut] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try { setOut(await api('/sql', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: q }) })); }
    catch (e) { setOut({ ok: false, error: (e as Error).message }); }
    setBusy(false);
  };
  return (
    <div className="stack">
      <p className="muted small">Solo lectura (SELECT / WITH), máximo 1.000 filas y 5 segundos por consulta.</p>
      <div className="row wrap">{EXAMPLES.map(([n, s]) => <button key={n} className="btn" onClick={() => setQ(s)}>{n}</button>)}</div>
      <textarea rows={7} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Consulta SQL" spellCheck={false} />
      <div><button className="btn primary" onClick={run} disabled={busy}>{busy ? 'Ejecutando…' : 'Ejecutar consulta'}</button></div>
      {out && (out.ok ? (
        <div className="card flat"><div className="tablewrap" style={{ maxHeight: 420 }}><table className="t"><thead><tr>{out.columns.map((c: string) => <th key={c}>{c}</th>)}</tr></thead><tbody>{out.rows.map((r: any, i: number) => <tr key={i}>{out.columns.map((c: string) => <td key={c}>{r[c] === null ? '—' : String(r[c])}</td>)}</tr>)}</tbody></table></div>
          <div className="small muted" style={{ padding: 10 }}>{out.rows.length} filas{out.truncated ? ' (resultado recortado a 1.000)' : ''}</div></div>
      ) : <div className="notice bad" role="alert">{out.error}</div>)}
    </div>
  );
}

function Log() {
  const res = useApi<any[]>('/ingest-log?errors=1', 30_000);
  if (res.loading && !res.data) return <Loading />;
  if (!res.data?.length) return <div className="card"><Empty>No hay errores de descarga registrados.</Empty></div>;
  return <div className="card flat"><div className="tablewrap"><table className="t"><thead><tr><th>Cuándo</th><th>Tipo</th><th>Objetivo</th><th>Error</th></tr></thead><tbody>{res.data.map((r, i) => <tr key={i}><td className="muted">{ago(r.ts)}</td><td>{r.kind}</td><td>{r.target}</td><td style={{ whiteSpace: 'normal' }}>{r.error}</td></tr>)}</tbody></table></div></div>;
}

export default function DataPage() {
  const meta = useApi<any>('/meta');
  const [tab, setTab] = useState('cobertura');
  const tabs = [{ id: 'cobertura', label: 'Cobertura' }, { id: 'tablas', label: 'Explorar tablas' }, ...(meta.data?.sqlConsole ? [{ id: 'sql', label: 'Consola SQL' }] : []), { id: 'errores', label: 'Errores de descarga' }];
  return (
    <div className="stack-lg">
      <div><h1>Base de datos</h1><p className="muted">Todo lo que se ha descargado, tal cual. Explora las tablas, descárgalas o consúltalas con SQL para hacer tu propio análisis.</p></div>
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === 'cobertura' && <Coverage />}{tab === 'tablas' && <Explorer />}{tab === 'sql' && <SqlConsole />}{tab === 'errores' && <Log />}
    </div>
  );
}
