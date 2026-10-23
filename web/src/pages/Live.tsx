import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Bell, BellOff } from 'lucide-react';
import { useApi } from '../lib/api';
import { useLive, type LiveMatch } from '../lib/live';
import { eventName, ago, statLabel, SPORT_NAMES } from '../lib/format';
import { CompareBar, Empty, Logo, statusText } from '../components/ui';
import { FlowChart } from '../components/flow';
import { FavStar } from '../components/home';

function LiveRow({ m, on, flashing, onPick }: { m: LiveMatch; on: boolean; flashing: boolean; onPick: () => void }) {
  const st = statusText(m);
  const played = m.homeScore !== null && m.awayScore !== null;
  const last = m.lastEvents.find((e) => e.scoring);
  return (
    <button className={`lrow ${on ? 'on' : ''} ${flashing ? 'flash' : ''} ${m.status === 'live' ? 'islive' : ''}`} onClick={onPick}>
      <span className={`lmin ${st.live ? 'live' : ''}`}>{st.live && <i className="livedot" />}{m.status === 'final' ? 'FIN' : st.text}</span>
      <span className="lteams">
        <span className={`lt ${m.winner === 'home' ? 'w' : ''}`}><Logo src={m.homeLogo} name={m.homeName} color={m.homeColor} /><span>{m.homeName}</span></span>
        <span className={`lt ${m.winner === 'away' ? 'w' : ''}`}><Logo src={m.awayLogo} name={m.awayName} color={m.awayColor} /><span>{m.awayName}</span></span>
      </span>
      <span className="lscore"><b>{played ? m.homeScore : '–'}</b><b>{played ? m.awayScore : '–'}</b></span>
      {last && m.status === 'live' && <span className="llast">{last.clock} {last.playerName ?? eventName(last.type)}</span>}
    </button>
  );
}

function Panel({ id }: { id: string }) {
  const res = useApi<any>(`/matches/${encodeURIComponent(id)}`, 15_000);
  const { flash } = useLive();
  if (!res.data) return <div className="card"><div className="skeleton" style={{ height: 120 }} /></div>;
  const { match: m, teamStats, events } = res.data;
  const st = statusText(m);
  const played = m.homeScore !== null && m.awayScore !== null;
  const feed = [...(events ?? [])].reverse();
  return (
    <div className="stack">
      <div className={`card lpanel ${flash[m.id] ? 'flash' : ''}`}>
        <div className="row between small muted"><span>{m.leagueName}{m.stage ? ` · ${m.stage}` : ''}</span><span className={`chip ${st.live ? 'live' : ''}`}>{m.status === 'final' ? 'Finalizado' : st.text}</span></div>
        <div className="hero-score" style={{ padding: '14px 0' }}>
          <Link to={`/equipo/${encodeURIComponent(m.homeId)}`} className="tm" style={{ textDecoration: 'none' }}><Logo src={m.homeLogo} name={m.homeName} color={m.homeColor} size="lg" />{m.homeName}</Link>
          <div className="big">{played ? <>{m.homeScore} – {m.awayScore}</> : 'vs'}</div>
          <Link to={`/equipo/${encodeURIComponent(m.awayId)}`} className="tm" style={{ textDecoration: 'none' }}><Logo src={m.awayLogo} name={m.awayName} color={m.awayColor} size="lg" />{m.awayName}</Link>
        </div>
        <div className="row wrap"><Link className="btn primary" to={`/partido/${encodeURIComponent(m.id)}`}>Ficha completa del partido</Link><FavStar id={m.id} inline /></div>
      </div>

      <div className="card"><h3 style={{ marginBottom: 8 }}>Flujo del partido</h3>
        <FlowChart events={events ?? []} homeId={m.homeId} homeName={m.homeName} awayName={m.awayName} football={m.sportId === 'football'} /></div>

      <div className="grid g2" style={{ alignItems: 'start' }}>
        <div className="card"><h3 style={{ marginBottom: 6 }}>Jugada a jugada</h3>
          {feed.length === 0 ? <Empty>ESPN aún no ha publicado eventos de este partido.</Empty> : (
            <ol className="timeline">{feed.slice(0, 25).map((e: any, i: number) => (
              <li key={i} style={{ fontWeight: e.scoring ? 700 : 400 }}><span className="muted">{e.clock ?? ''}</span>
                <span className="dotc" style={{ background: e.teamId === m.homeId ? 'var(--home)' : e.teamId === m.awayId ? 'var(--away)' : 'var(--muted)' }} />
                <span>{eventName(e.type)}{e.playerName ? ` — ${e.playerName}` : e.text ? ` — ${e.text}` : ''}</span>
                {e.homeScore != null && e.awayScore != null ? <span className="muted">{e.homeScore}-{e.awayScore}</span> : <span />}</li>))}</ol>)}
        </div>
        <div className="card"><h3 style={{ marginBottom: 6 }}>Estadísticas en directo</h3>
          {teamStats.length === 0 ? <Empty>Sin estadísticas publicadas todavía.</Empty> : teamStats.slice(0, 8).map((s: any) => (
            <CompareBar key={s.key} label={statLabel(s.key, s.label)} home={s.home?.value ?? null} away={s.away?.value ?? null} homeText={s.home?.display ?? undefined} awayText={s.away?.display ?? undefined} />))}
        </div>
      </div>
    </div>
  );
}

export default function Live() {
  const { matches, liveCount, lastCycle, error, flash, notify, setNotify, notifySupported } = useLive();
  const [sp, setSp] = useSearchParams();
  const sel = sp.get('id') || matches.find((m) => m.status === 'live')?.id || matches[0]?.id || '';
  const groups = useMemo(() => {
    const g = new Map<string, LiveMatch[]>();
    for (const m of matches) (g.get(m.leagueName) ?? g.set(m.leagueName, []).get(m.leagueName)!).push(m);
    return [...g.entries()];
  }, [matches]);
  return (
    <div className="stack-lg">
      <div className="row wrap between">
        <div>
          <h1 className="row"><i className="livedot" style={{ width: 12, height: 12 }} /> Centro en vivo</h1>
          <p className="muted small">{liveCount} {liveCount === 1 ? 'partido en juego' : 'partidos en juego'} · la pantalla se actualiza sola cada 15 s · datos de ESPN guardados {ago(lastCycle)}{error && ' · sin conexión con el servidor, reintentando…'}</p>
        </div>
        {notifySupported && <button className="btn" aria-pressed={notify} onClick={() => setNotify(!notify)} style={notify ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}>{notify ? <Bell size={15} /> : <BellOff size={15} />} Avisos de gol {notify ? 'activados' : 'desactivados'}</button>}
      </div>
      {matches.length === 0 ? <div className="card"><Empty>No hay partidos en juego ni terminados en las últimas 3 horas. Cuando empiece alguno aparecerá aquí automáticamente.</Empty></div> : (
        <div className="livegrid">
          <div className="llist">
            {groups.map(([league, list]) => (
              <section key={league}><h4 className="lleague">{league} <span className="chip">{SPORT_NAMES[list[0].sportId] ?? ''}</span></h4>
                {list.map((m) => <LiveRow key={m.id} m={m} on={m.id === sel} flashing={!!flash[m.id]} onPick={() => { const n = new URLSearchParams(sp); n.set('id', m.id); setSp(n, { replace: true }); }} />)}
              </section>
            ))}
          </div>
          <div className="lpane">{sel && <Panel key={sel} id={sel} />}</div>
        </div>
      )}
    </div>
  );
}
