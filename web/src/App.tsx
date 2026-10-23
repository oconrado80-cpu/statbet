import { useEffect, useMemo, useState } from 'react';
import { NavLink, Route, Routes, Link, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { Search, Sparkles, Star } from 'lucide-react';
import { useApi } from './lib/api';
import { ago, SPORT_NAMES, type OddsFormat } from './lib/format';
import { usePrefs } from './lib/prefs';
import AiDrawer from './components/AiDrawer';
import Matches from './pages/Matches';
import MatchDetail from './pages/MatchDetail';
import { TeamsPage, TeamPage } from './pages/Teams';
import { PlayersPage, PlayerPage } from './pages/Players';
import Standings from './pages/Standings';
import Analysis from './pages/Analysis';
import DataPage from './pages/Data';
import Live from './pages/Live';
import LiveTicker from './components/LiveTicker';
import Boundary from './components/Boundary';
import { useLive } from './lib/live';

const NAV = [
  ['/', 'Partidos'], ['/vivo', 'En vivo'], ['/tablas', 'Clasificación'], ['/equipos', 'Equipos'], ['/jugadores', 'Jugadores'], ['/analisis', 'Análisis'], ['/datos', 'Base de datos'],
] as const;

function Sidebar() {
  const [sp, setSp] = useSearchParams();
  const leagues = useApi<any[]>('/leagues', 120_000);
  const sport = sp.get('deporte') || '', league = sp.get('liga') || '';
  const bySport = useMemo(() => {
    const m = new Map<string, { n: number; leagues: any[] }>();
    for (const l of leagues.data ?? []) { const e = m.get(l.sportId) ?? { n: 0, leagues: [] }; e.n += l.matches ?? 0; e.leagues.push(l); m.set(l.sportId, e); }
    return [...m.entries()].filter(([, v]) => v.n > 0 || true);
  }, [leagues.data]);
  const pick = (s: string, l = '') => { const n = new URLSearchParams(sp); s ? n.set('deporte', s) : n.delete('deporte'); l ? n.set('liga', l) : n.delete('liga'); setSp(n); };
  return (
    <nav className="side" aria-label="Deportes">
      <h4>Deportes</h4>
      <div>
        <button className={`sp ${!sport ? 'on' : ''}`} onClick={() => pick('')}>Todos</button>
        {bySport.map(([id, v]) => (
          <div key={id}>
            <button className={`sp ${sport === id ? 'on' : ''}`} onClick={() => pick(id)}>{SPORT_NAMES[id] ?? id}<span className="c">{v.n.toLocaleString('es-ES')}</span></button>
            {sport === id && v.leagues.map((l) => <button key={l.id} className={`lg ${league === l.id ? 'on' : ''}`} onClick={() => pick(id, league === l.id ? '' : l.id)}>{l.name}</button>)}
          </div>
        ))}
      </div>
    </nav>
  );
}

function Header() {
  const nav = useNavigate();
  const { favorites, oddsFormat, setOddsFormat, setAiOpen } = usePrefs();
  const [q, setQ] = useState('');
  const { liveCount } = useLive();
  return (
    <header className="topbar">
      <div className="shell">
        <Link to="/" className="brand" style={{ textDecoration: 'none' }}><i />StatBet</Link>
        <nav className="main" aria-label="Secciones">
          {NAV.map(([to, label]) => <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>{to === '/vivo' && liveCount > 0 && <i className="livedot" style={{ marginRight: 6 }} />}{label}</NavLink>)}
        </nav>
        <form className="hsearch" role="search" onSubmit={(e) => { e.preventDefault(); nav(q.trim() ? `/?q=${encodeURIComponent(q.trim())}` : '/'); }}>
          <Search size={15} />
          <input type="search" placeholder="Buscar equipo o liga" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar" />
        </form>
        <select aria-label="Formato de cuotas" value={oddsFormat} onChange={(e) => setOddsFormat(e.target.value as OddsFormat)} style={{ borderRadius: 999, minHeight: 36 }}>
          <option value="decimal">Cuotas 1.85</option><option value="fractional">Cuotas 5/6</option><option value="american">Cuotas −120</option>
        </select>
        <button className="iconbtn" onClick={() => nav('/?fav=1')} aria-label="Favoritos"><Star size={15} />{favorites.length > 0 && <span className="n">{favorites.length}</span>}</button>
        <button className="iconbtn ai" onClick={() => setAiOpen(true)}><Sparkles size={15} /><span>Analista IA</span></button>
      </div>
    </header>
  );
}

export default function App() {
  const meta = useApi<any>('/meta', 60_000);
  const loc = useLocation();
  const home = loc.pathname === '/';
  useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname]);
  const routes = (
    <Routes>
      <Route path="/" element={<Matches />} />
      <Route path="/vivo" element={<Live />} />
      <Route path="/partido/:id" element={<MatchDetail />} />
      <Route path="/tablas" element={<Standings />} />
      <Route path="/equipos" element={<TeamsPage />} />
      <Route path="/equipo/:id" element={<TeamPage />} />
      <Route path="/jugadores" element={<PlayersPage />} />
      <Route path="/jugador/:id" element={<PlayerPage />} />
      <Route path="/analisis" element={<Analysis />} />
      <Route path="/datos" element={<DataPage />} />
      <Route path="*" element={<div className="empty">Esta página no existe. <Link to="/">Volver a los partidos</Link></div>} />
    </Routes>
  );
  return (
    <>
      {meta.data?.dataset === 'synthetic' && (
        <div className="banner-synth" role="status">Datos de prueba generados al azar: no son partidos reales. Sirven solo para probar la web sin conexión.</div>
      )}
      <Header />
      <LiveTicker />
      <main className="page">
        <div className="shell">
          <div className="mobnav">{NAV.map(([to, label]) => <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>{label}</NavLink>)}</div>
          <Boundary resetKey={loc.pathname}>{home ? <div className="frame"><Sidebar />{routes}</div> : routes}</Boundary>
        </div>
      </main>
      <AiDrawer />
      <footer className="foot">
        <div className="shell stack">
          <p>
            Los marcadores y estadísticas se descargan de las fuentes públicas de ESPN y se guardan tal cual en la base de datos; lo que la fuente no publica queda vacío, nunca se estima.
            {meta.data && <> Última actualización de partidos: {ago(meta.data.lastLiveCycle ?? meta.data.lastSweep)}.</>}
          </p>
          <p>Las cuotas aparecen solo cuando ESPN las publica y son informativas. Esta web no acepta apuestas ni dinero. Los modelos son de referencia y se evalúan en la pestaña Análisis: apostar conlleva riesgo de pérdida.</p>
        </div>
      </footer>
    </>
  );
}
