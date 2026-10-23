import { Link } from 'react-router-dom';
import { useLive } from '../lib/live';
import { Logo, statusText } from './ui';

export default function LiveTicker() {
  const { matches, flash } = useLive();
  const live = matches.filter((m) => m.status === 'live');
  if (!live.length) return null;
  return (
    <div className="ticker" role="region" aria-label="Partidos en vivo">
      <Link to="/vivo" className="tk-lead"><i className="livedot" /> EN VIVO <b>{live.length}</b></Link>
      <div className="tk-scroll">
        {live.map((m) => (
          <Link key={m.id} to={`/vivo?id=${encodeURIComponent(m.id)}`} className={`tk ${flash[m.id] ? 'flash' : ''}`}>
            <span className="tk-min">{statusText(m).text}</span>
            <Logo src={m.homeLogo} name={m.homeName} color={m.homeColor} /><b>{m.homeScore ?? 0}</b>
            <span className="muted">–</span>
            <b>{m.awayScore ?? 0}</b><Logo src={m.awayLogo} name={m.awayName} color={m.awayColor} />
            <span className="tk-n">{m.homeName} · {m.awayName}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
