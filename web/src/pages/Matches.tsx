import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LayoutGrid, Rows3, Star } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { qs, useApi } from '../lib/api';
import { fromInputDate, localDayRange, toInputDate, SPORT_NAMES } from '../lib/format';
import { usePrefs } from '../lib/prefs';
import { Empty, ErrorBox, Loading, MatchGroups, Seg } from '../components/ui';
import { Hero, Highlights, MatchCard, type MatchCardData } from '../components/home';

const SPORT_COLORS: Record<string, string> = { football: '#00e0ff', basketball: '#f59e0b', tennis: '#22c55e', nfl: '#a78bfa', baseball: '#f43f5e', hockey: '#60a5fa' };

function Trends() {
  const t = useApi<{ days: number; rows: any[] }>('/analytics/trends?days=14', 300_000);
  const { perDay, perSport } = useMemo(() => {
    const rows = t.data?.rows ?? [];
    const days = [...new Set(rows.map((r) => r.day))].sort();
    const sports = [...new Set(rows.map((r) => r.sportId as string))];
    const perDay = days.map((d) => { const o: Record<string, any> = { day: d.slice(5) }; for (const s of sports) o[s] = rows.find((r) => r.day === d && r.sportId === s)?.n ?? 0; return o; });
    const perSport = days.map((d) => { const o: Record<string, any> = { day: d.slice(5) }; for (const s of sports) { const r = rows.find((x) => x.day === d && x.sportId === s); o[s] = r ? Math.round(r.avgTotal * 10) / 10 : null; } return o; });
    return { perDay, perSport: { data: perSport, sports } };
  }, [t.data]);
  if (!t.data || t.data.rows.length === 0) return null;
  const sports = perSport.sports;
  const tip = { contentStyle: { background: '#15151d', border: '1px solid #24242f', borderRadius: 10, color: '#f2f2f7' } };
  return (
    <section>
      <div className="sec-h"><h2>Tendencias de los últimos 14 días</h2><span className="footnote">Calculado con los partidos finalizados guardados</span></div>
      <div className="trend">
        <div className="card"><h3>Partidos finalizados por día</h3>
          <div className="chartbox"><ResponsiveContainer><BarChart data={perDay}><CartesianGrid stroke="#24242f" vertical={false} /><XAxis dataKey="day" stroke="#8d8da3" fontSize={11} /><YAxis stroke="#8d8da3" fontSize={11} allowDecimals={false} /><Tooltip {...tip} /><Legend formatter={(v) => SPORT_NAMES[v] ?? v} />
            {sports.map((s) => <Bar key={s} dataKey={s} stackId="a" fill={SPORT_COLORS[s] ?? '#8d8da3'} name={s} />)}</BarChart></ResponsiveContainer></div></div>
        <div className="card"><h3>Goles / puntos por partido (media)</h3>
          <div className="chartbox"><ResponsiveContainer><LineChart data={perSport.data}><CartesianGrid stroke="#24242f" vertical={false} /><XAxis dataKey="day" stroke="#8d8da3" fontSize={11} /><YAxis stroke="#8d8da3" fontSize={11} scale="log" domain={['auto', 'auto']} allowDecimals /><Tooltip {...tip} /><Legend formatter={(v) => SPORT_NAMES[v] ?? v} />
            {sports.map((s) => <Line key={s} dataKey={s} stroke={SPORT_COLORS[s] ?? '#8d8da3'} strokeWidth={2} dot={false} connectNulls name={s} />)}</LineChart></ResponsiveContainer></div>
          <p className="footnote">Escala logarítmica: así conviven goles (≈2–3) y puntos de baloncesto (≈220).</p></div>
      </div>
    </section>
  );
}

export default function Matches() {
  const [sp, setSp] = useSearchParams();
  const { isFav, favorites } = usePrefs();
  const dateStr = sp.get('fecha') || toInputDate(new Date());
  const sport = sp.get('deporte') || '';
  const league = sp.get('liga') || '';
  const status = sp.get('estado') || '';
  const text = sp.get('q') || '';
  const favOnly = sp.get('fav') === '1';
  const view = sp.get('vista') === 'tabla' ? 'tabla' : 'tarjetas';
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); setSp(n, { replace: true }); };

  const day = fromInputDate(dateStr);
  const { from, to } = localDayRange(day);
  const live = status === 'live';
  const url = live ? `/matches${qs({ status: 'live', sport, league, limit: 500 })}` : `/matches${qs({ from, to, sport, league, status, limit: 1000 })}`;
  const res = useApi<MatchCardData[]>(url, 30_000);
  const meta = useApi<any>('/meta', 60_000);
  const hl = useApi<MatchCardData[]>('/highlights', 60_000);

  const shift = (d: number) => { const n = new Date(day); n.setDate(n.getDate() + d); set('fecha', toInputDate(n)); };
  const today = toInputDate(new Date());

  const list = useMemo(() => {
    const t = text.trim().toLowerCase();
    return (res.data ?? []).filter((m) => (!favOnly || isFav(m.id)) && (!t || m.homeName.toLowerCase().includes(t) || m.awayName.toLowerCase().includes(t) || m.leagueName.toLowerCase().includes(t)));
  }, [res.data, text, favOnly, favorites]);

  const c = meta.data?.counts;
  const showHl = !sport && !league && !text && !favOnly;

  return (
    <div className="stack-lg" style={{ minWidth: 0 }}>
      <Hero sport={sport} counts={c ? { live: c.live, finished: c.finished, matches: c.matches, players: c.players } : null} />
      {showHl && hl.data && <Highlights items={hl.data} />}

      <section className="stack">
        <div className="row wrap between">
          <div>
            <h2>{favOnly ? 'Tus favoritos' : live ? 'Partidos en vivo' : 'Partidos'}</h2>
            <p className="muted small">{live ? 'Todos los que se están jugando ahora' : day.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}{sport ? ` · ${SPORT_NAMES[sport] ?? sport}` : ''}</p>
          </div>
          <div className="row wrap">
            <button className="btn" onClick={() => shift(-1)} aria-label="Día anterior">‹</button>
            <input type="date" value={dateStr} onChange={(e) => e.target.value && set('fecha', e.target.value)} aria-label="Fecha" />
            <button className="btn" onClick={() => shift(1)} aria-label="Día siguiente">›</button>
            {dateStr !== today && <button className="btn" onClick={() => set('fecha', '')}>Hoy</button>}
          </div>
        </div>
        <div className="row wrap">
          <Seg label="Estado" value={status || 'all'} onChange={(v) => set('estado', v === 'all' ? '' : v)}
            options={[{ id: 'all', label: 'Todos' }, { id: 'live', label: `En vivo${c?.live ? ` (${c.live})` : ''}` }, { id: 'scheduled', label: 'Próximos' }, { id: 'final', label: 'Finalizados' }]} />
          <input type="search" placeholder="Filtrar por equipo o liga" value={text} onChange={(e) => set('q', e.target.value)} aria-label="Filtrar" />
          <button className="btn" aria-pressed={favOnly} onClick={() => set('fav', favOnly ? '' : '1')} style={favOnly ? { borderColor: 'var(--away)', color: 'var(--away)' } : undefined}><Star size={14} fill={favOnly ? 'currentColor' : 'none'} /> Favoritos</button>
          <div className="viewtog" style={{ marginLeft: 'auto' }}>
            <button aria-pressed={view === 'tarjetas'} onClick={() => set('vista', '')} aria-label="Ver como tarjetas"><LayoutGrid size={16} /></button>
            <button aria-pressed={view === 'tabla'} onClick={() => set('vista', 'tabla')} aria-label="Ver como tabla"><Rows3 size={16} /></button>
          </div>
        </div>

        {res.loading && !res.data ? <Loading rows={5} /> : res.error ? <ErrorBox error={res.error} /> : list.length === 0 ? (
          <div className="card"><Empty>
            {favOnly ? 'Aún no tienes favoritos: pulsa la estrella de un partido para guardarlo aquí.'
              : c?.matches === 0 ? 'La base de datos todavía está vacía. La primera carga de partidos se hace en segundo plano al iniciar el servidor; vuelve en unos minutos.'
              : 'No hay partidos con estos filtros en la base de datos. Prueba otra fecha o quita algún filtro.'}
          </Empty></div>
        ) : view === 'tabla' ? <MatchGroups matches={list} showDate={live} />
          : <div className="mgrid">{list.map((m) => <MatchCard key={m.id} m={m} />)}</div>}
      </section>

      <Trends />
    </div>
  );
}
