import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Bar, BarChart, ReferenceLine, Scatter, ComposedChart } from 'recharts';
import { qs, useApi } from '../lib/api';
import { fmt, pct, SPORT_NAMES, statLabel } from '../lib/format';
import { CompareBar, Empty, ErrorBox, Form, Loading, Logo, Tabs } from '../components/ui';

const axis = { tick: { fill: 'var(--muted)', fontSize: 12 } } as const;
const tip = { contentStyle: { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8 } } as const;

function Summary({ league }: { league: string }) {
  const s = useApi<any>(`/analytics/summary?league=${encodeURIComponent(league)}`);
  const all = useApi<any[]>('/analytics/summary-all');
  if (s.loading && !s.data) return <Loading />;
  if (s.error) return <ErrorBox error={s.error} />;
  const d = s.data;
  if (!d || d.matches === 0) return <div className="card"><Empty>Aún no hay partidos terminados de esta liga.</Empty></div>;
  const goalSport = d.avgTotal < 12;
  return (
    <div className="stack-lg">
      {d.matches < 100 && <div className="notice">Solo hay {d.matches} partidos terminados de esta liga. Los porcentajes con muestras pequeñas oscilan mucho: no los tomes como tendencias estables.</div>}
      <div className="grid g4">
        <div className="card kpi"><div className="v">{d.matches}</div><div className="l">Partidos terminados · {d.teams} equipos</div></div>
        <div className="card kpi"><div className="v">{fmt(d.avgTotal, 2)}</div><div className="l">{goalSport ? 'Goles' : 'Puntos'} por partido ({fmt(d.avgHome, 2)} local · {fmt(d.avgAway, 2)} visita)</div></div>
        <div className="card kpi"><div className="v">{pct(d.homeWinPct)}</div><div className="l">Gana el local{d.drawPct > 0 ? ` · empates ${pct(d.drawPct)} · visita ${pct(d.awayWinPct)}` : ` · visita ${pct(d.awayWinPct)}`}</div></div>
        {goalSport ? <div className="card kpi"><div className="v">{pct(d.bttsPct)}</div><div className="l">Ambos equipos marcan · portería a cero {pct(d.cleanSheetPct)}</div></div> : <div className="card kpi"><div className="v">{pct(d.over[1]?.pct)}</div><div className="l">Más de {d.over[1]?.line} puntos totales</div></div>}
      </div>
      <div className="grid g2" style={{ alignItems: 'start' }}>
        <div className="card"><h2>Más de X {goalSport ? 'goles' : 'puntos'}</h2>
          <div className="tablewrap"><table className="t"><thead><tr><th>Línea</th><th className="num">% de partidos</th></tr></thead><tbody>{d.over.map((o: any) => <tr key={o.line}><td>Más de {o.line}</td><td className="num">{pct(o.pct, 1)}</td></tr>)}</tbody></table></div></div>
        <div className="card"><h2>Evolución mensual</h2>
          {d.byMonth.length < 2 ? <Empty>Hacen falta al menos dos meses de datos para ver la evolución.</Empty> : (
            <div style={{ height: 230 }} role="img" aria-label="Promedio mensual de goles o puntos"><ResponsiveContainer><LineChart data={d.byMonth}><CartesianGrid stroke="var(--line)" vertical={false} /><XAxis dataKey="month" {...axis} /><YAxis {...axis} domain={['auto', 'auto']} /><Tooltip {...tip} formatter={(v: any) => fmt(v, 2)} /><Line dataKey="avgTotal" name="Promedio total" stroke="var(--accent)" strokeWidth={2.5} dot={{ r: 3 }} /></LineChart></ResponsiveContainer></div>)}
        </div>
      </div>
      <div className="card"><h2>Ventaja de local por liga</h2><p className="muted small" style={{ marginBottom: 8 }}>Porcentaje de partidos ganados por el local y tamaño de la muestra. Un número alto con pocos partidos no significa nada todavía.</p>
        <div className="tablewrap"><table className="t"><thead><tr><th>Liga</th><th>Deporte</th><th className="num">Partidos</th><th className="num">Local gana</th><th className="num">Empate</th><th className="num">Total medio</th></tr></thead>
          <tbody>{(all.data ?? []).map((x) => <tr key={x.leagueId}><td><Link to={`/analisis?liga=${encodeURIComponent(x.leagueId)}`}>{x.name}</Link></td><td className="muted">{SPORT_NAMES[x.sportId]}</td><td className="num">{x.matches}</td><td className="num">{pct(x.homeWinPct, 1)}</td><td className="num">{x.drawPct ? pct(x.drawPct, 1) : '—'}</td><td className="num">{fmt(x.avgTotal, 2)}</td></tr>)}</tbody></table></div></div>
    </div>
  );
}

function Elo({ league }: { league: string }) {
  const [k, setK] = useState('');
  const [hfa, setHfa] = useState('');
  const [margin, setMargin] = useState(false);
  const res = useApi<any>(`/analytics/elo${qs({ league, k, hfa, margin: margin ? 1 : '' })}`);
  return (
    <div className="stack">
      <div className="card row wrap">
        <label className="field"><span>K (velocidad de ajuste)</span><input type="number" min={1} max={100} placeholder={String(res.data?.params.k ?? '')} value={k} onChange={(e) => setK(e.target.value)} /></label>
        <label className="field"><span>Ventaja de local (puntos Elo)</span><input type="number" min={0} max={200} placeholder={String(res.data?.params.hfa ?? '')} value={hfa} onChange={(e) => setHfa(e.target.value)} /></label>
        <label className="row small" style={{ marginTop: 18 }}><input type="checkbox" checked={margin} onChange={(e) => setMargin(e.target.checked)} /> Ponderar por diferencia de marcador</label>
      </div>
      {res.loading && !res.data ? <Loading /> : res.error ? <ErrorBox error={res.error} /> : !res.data?.rows.length ? <div className="card"><Empty>Sin partidos terminados para calcular ratings.</Empty></div> : (
        <div className="card flat"><div className="tablewrap"><table className="t"><thead><tr><th>#</th><th>Equipo</th><th className="num">Elo</th><th className="num">Partidos</th></tr></thead>
          <tbody>{res.data.rows.map((r: any) => <tr key={r.teamId}><td className="muted">{r.rank}</td><td><Link to={`/equipo/${encodeURIComponent(r.teamId)}`} className="row"><Logo src={r.logo} name={r.name} /><span>{r.name}</span></Link></td><td className="num"><b>{r.rating}</b></td><td className="num">{r.games}</td></tr>)}</tbody></table></div></div>
      )}
      <p className="muted small">Todos los equipos empiezan en 1500 y el rating se ajusta partido a partido con los resultados guardados. No hay arrastre entre temporadas ni se considera lesiones o plantilla. Mira la pestaña “Evaluar modelo” para saber si este tipo de rating predice mejor que el azar en esta liga.</p>
    </div>
  );
}

function ModelEval({ league, sport }: { league: string; sport: string }) {
  const [k, setK] = useState('');
  const [hfa, setHfa] = useState('');
  const [prior, setPrior] = useState('');
  const [margin, setMargin] = useState(false);
  const res = useApi<any>(`/analytics/backtest${qs({ league, k, hfa, prior, margin: margin ? 1 : '' })}`);
  if (res.loading && !res.data) return <Loading />;
  if (res.error) return <ErrorBox error={res.error} />;
  const d = res.data;
  const good = d.paired?.significant && d.paired.meanDiff < 0;
  const bad = d.paired?.significant && d.paired.meanDiff > 0;
  return (
    <div className="stack">
      <div className="card stack">
        <h2>{d.model === 'poisson' ? 'Modelo de goles (Poisson) frente a la línea base' : 'Modelo Elo frente a la línea base'}</h2>
        <p className="small muted">Prueba “caminando hacia adelante”: para cada partido, el modelo solo conoce lo ocurrido antes. La línea base es lo más simple posible: la frecuencia histórica de resultados de la propia liga. Si el modelo no le gana, no aporta nada.</p>
        <div className={`notice ${good ? 'info' : bad ? 'bad' : ''}`} role="status"><b>Conclusión: </b>{d.verdict}</div>
        <div className="row wrap">
          {d.model === 'elo' ? <>
            <label className="field"><span>K</span><input type="number" placeholder={String(d.params.k)} value={k} onChange={(e) => setK(e.target.value)} style={{ width: 90 }} /></label>
            <label className="field"><span>Ventaja de local</span><input type="number" placeholder={String(d.params.hfa)} value={hfa} onChange={(e) => setHfa(e.target.value)} style={{ width: 110 }} /></label>
            <label className="row small" style={{ marginTop: 18 }}><input type="checkbox" checked={margin} onChange={(e) => setMargin(e.target.checked)} /> Ponderar por diferencia de marcador</label>
          </> : <label className="field"><span>Peso del prior (partidos)</span><input type="number" placeholder={String(d.params.prior)} value={prior} onChange={(e) => setPrior(e.target.value)} style={{ width: 120 }} /></label>}
        </div>
        <p className="muted small">Cambiar parámetros hasta que el resultado salga bien sobre estos mismos datos es una forma de engañarse (sobreajuste). Si ajustas, guarda aparte los partidos más recientes para confirmar.</p>
      </div>
      {d.metrics && (
        <div className="card"><div className="tablewrap"><table className="t"><thead><tr><th></th><th className="num">Log-loss (menor = mejor)</th><th className="num">Brier (menor = mejor)</th><th className="num">Acierto</th></tr></thead>
          <tbody><tr><td><b>Modelo</b></td><td className="num">{fmt(d.metrics.logLoss, 3)}</td><td className="num">{fmt(d.metrics.brier, 3)}</td><td className="num">{pct(d.metrics.accuracy * 100, 1)}</td></tr>
            <tr><td>Línea base</td><td className="num">{fmt(d.baseline.logLoss, 3)}</td><td className="num">{fmt(d.baseline.brier, 3)}</td><td className="num">{pct(d.baseline.accuracy * 100, 1)}</td></tr></tbody></table></div>
          <p className="small" style={{ marginTop: 10 }}>{d.evaluated} partidos evaluados de {d.matchesInLeague}{d.skippedDraws ? ` (${d.skippedDraws} empates excluidos por ser un modelo de dos resultados)` : ''}. Diferencia media de log-loss: <b>{fmt(d.paired.meanDiff, 3)}</b> por partido, intervalo 95 % [{fmt(d.paired.ci95[0], 3)} ; {fmt(d.paired.ci95[1], 3)}]. {d.paired.significant ? 'El intervalo no incluye 0.' : 'El intervalo incluye 0: la diferencia podría ser casualidad.'}</p>
        </div>
      )}
      {d.calibration.length > 0 && (
        <div className="card"><h2>Calibración (victoria local)</h2><p className="muted small" style={{ marginBottom: 6 }}>Si el modelo dice “60 %”, ¿gana el local el 60 % de las veces? Los puntos deberían estar sobre la diagonal.</p>
          <div style={{ height: 280 }} role="img" aria-label="Probabilidad predicha frente a frecuencia observada"><ResponsiveContainer><ComposedChart data={d.calibration.map((c: any) => ({ ...c, predicted: c.predicted * 100, observed: c.observed * 100 }))}><CartesianGrid stroke="var(--line)" /><XAxis type="number" dataKey="predicted" domain={[0, 100]} unit="%" {...axis} name="Predicho" /><YAxis type="number" domain={[0, 100]} unit="%" {...axis} name="Observado" /><Tooltip {...tip} formatter={(v: any) => `${fmt(v, 1)} %`} /><ReferenceLine segment={[{ x: 0, y: 0 }, { x: 100, y: 100 }]} stroke="var(--muted)" strokeDasharray="4 4" /><Scatter dataKey="observed" fill="var(--accent)" name="Observado" /></ComposedChart></ResponsiveContainer></div>
          <div className="tablewrap"><table className="t"><thead><tr><th>Tramo</th><th className="num">Partidos</th><th className="num">Predicho</th><th className="num">Observado</th></tr></thead><tbody>{d.calibration.map((c: any) => <tr key={c.bin}><td>{c.bin}</td><td className="num">{c.n}</td><td className="num">{pct(c.predicted * 100, 1)}</td><td className="num">{pct(c.observed * 100, 1)}</td></tr>)}</tbody></table></div>
        </div>
      )}
    </div>
  );
}

function Compare({ league }: { league: string }) {
  const teams = useApi<any[]>(`/teams${qs({ league, limit: 500 })}`);
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  useEffect(() => { setA(''); setB(''); }, [league]);
  const ta = useApi<any>(a ? `/teams/${encodeURIComponent(a)}` : null);
  const tb = useApi<any>(b ? `/teams/${encodeURIComponent(b)}` : null);
  const h = useApi<any>(a && b ? `/analytics/h2h?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}` : null);
  const opts = teams.data ?? [];
  const avgMap = (t: any) => new Map<string, any>((t?.statAverages ?? []).map((s: any) => [s.key, s]));
  const keys = ta.data && tb.data ? [...avgMap(ta.data).keys()].filter((k) => avgMap(tb.data).has(k)).slice(0, 12) : [];
  return (
    <div className="stack">
      <div className="card row wrap">
        {[[a, setA, 'Equipo A'], [b, setB, 'Equipo B']].map(([v, set, label]: any) => (
          <label key={label} className="field"><span>{label}</span><select value={v} onChange={(e) => set(e.target.value)}><option value="">Elegir…</option>{opts.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        ))}
      </div>
      {!a || !b ? <div className="card"><Empty>Elige dos equipos para compararlos con los partidos guardados.</Empty></div> : ta.data && tb.data && (
        <>
          <div className="grid g2">
            {[ta.data, tb.data].map((t: any, i: number) => (
              <div className="card stack" key={t.team.id}><h2 style={{ color: i === 0 ? 'var(--home)' : 'var(--away)' }}>{t.team.name}</h2>
                <div className="row between"><span>Forma</span><Form items={t.record.form.slice(0, 5).map((f: any) => ({ result: f.result, score: f.score, opponent: f.opponent }))} /></div>
                <p className="small">{t.record.total.w}G-{t.record.total.d}E-{t.record.total.l}P · {fmt(t.record.total.played ? t.record.total.gf / t.record.total.played : null, 2)} a favor / {fmt(t.record.total.played ? t.record.total.ga / t.record.total.played : null, 2)} en contra por partido</p>
                {t.ratings.filter((r: any) => r.leagueId === league).map((r: any) => <p key={r.leagueId} className="small">Elo <b>{r.rating}</b> (puesto {r.rank} de {r.of})</p>)}
              </div>
            ))}
          </div>
          {keys.length > 0 && <div className="card"><h2>Promedios por partido</h2>{keys.map((k) => { const x = avgMap(ta.data).get(k), y = avgMap(tb.data).get(k); return <CompareBar key={k} label={statLabel(k, x.label)} home={x.avg} away={y.avg} homeText={fmt(x.avg, 1)} awayText={fmt(y.avg, 1)} />; })}</div>}
          <div className="card"><h2>Enfrentamientos directos</h2>{h.data?.n ? <p>{ta.data.team.name} <b>{h.data.aWins}</b> · empates <b>{h.data.draws}</b> · {tb.data.team.name} <b>{h.data.bWins}</b> (en {h.data.n} partidos guardados; total medio {fmt(h.data.avgTotal, 1)})</p> : <Empty>No hay duelos directos guardados.</Empty>}</div>
        </>
      )}
    </div>
  );
}

export default function Analysis() {
  const leagues = useApi<any[]>('/leagues');
  const [sp, setSp] = useSearchParams();
  const list = (leagues.data ?? []).filter((l) => l.finished > 0);
  const league = sp.get('liga') || list[0]?.id || '';
  const view = sp.get('vista') || 'resumen';
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); n.set(k, v); setSp(n, { replace: true }); };
  const cur = list.find((l) => l.id === league);
  return (
    <div className="stack-lg">
      <div className="row wrap between"><div><h1>Análisis</h1><p className="muted">Calculado en vivo con los partidos que hay en la base de datos.</p></div>
        <select value={league} onChange={(e) => set('liga', e.target.value)} aria-label="Liga">{list.map((l) => <option key={l.id} value={l.id}>{l.name} — {l.country} ({l.finished})</option>)}</select></div>
      {leagues.loading && !leagues.data ? <Loading /> : !list.length ? <div className="card"><Empty>Todavía no hay partidos terminados. El análisis se activa solo cuando la base de datos reciba resultados.</Empty></div> : (
        <>
          <Tabs value={view} onChange={(v) => set('vista', v)} tabs={[{ id: 'resumen', label: 'Resumen de liga' }, { id: 'elo', label: 'Ranking Elo' }, { id: 'modelo', label: 'Evaluar modelo' }, { id: 'comparar', label: 'Comparar equipos' }]} />
          {view === 'resumen' && <Summary league={league} />}
          {view === 'elo' && <Elo league={league} />}
          {view === 'modelo' && <ModelEval league={league} sport={cur?.sportId} />}
          {view === 'comparar' && <Compare league={league} />}
        </>
      )}
    </div>
  );
}
void BarChart; void Bar; void Legend;
