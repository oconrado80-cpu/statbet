import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApi } from '../lib/api';
import { ago, fmt, statLabel } from '../lib/format';
import { Empty, ErrorBox, Loading, Logo } from '../components/ui';

const COLS = ['gamesPlayed', 'wins', 'ties', 'losses', 'pointsFor', 'pointsAgainst', 'pointDifferential', 'winPercent', 'points'];

export default function Standings() {
  const leagues = useApi<any[]>('/leagues');
  const [sp, setSp] = useSearchParams();
  const league = sp.get('league') || '';
  const list = (leagues.data ?? []).filter((l) => l.kind === 'team');
  useEffect(() => { if (!league && list.length) { const withData = list.find((l) => l.finished > 0) ?? list[0]; setSp({ league: withData.id }, { replace: true }); } }, [list.length]);
  const res = useApi<any>(league ? `/standings?league=${encodeURIComponent(league)}` : null);
  const groups: any[] = res.data?.groups ?? [];
  const present = COLS.filter((c) => groups.some((g) => g.teams.some((t: any) => t.stats[c] !== undefined && t.stats[c] !== '')));

  return (
    <div className="stack-lg">
      <div className="row wrap between"><div><h1>Clasificación</h1><p className="muted">{res.data?.season ? `Temporada ${res.data.season} · actualizada ${ago(res.data.fetchedAt)}` : 'Tal como la publica la fuente'}</p></div>
        <select value={league} onChange={(e) => setSp({ league: e.target.value })} aria-label="Liga">{list.map((l) => <option key={l.id} value={l.id}>{l.name} — {l.country}</option>)}</select></div>
      {res.loading && !res.data ? <Loading /> : res.error ? <ErrorBox error={res.error} /> : groups.length === 0 ? <div className="card"><Empty>Esta liga no tiene tabla guardada todavía (o no usa clasificación, como los torneos por eliminación).</Empty></div> :
        groups.map((g) => (
          <div className="card flat" key={g.name}>
            {g.name && <div className="league-head">{g.name}</div>}
            <div className="tablewrap"><table className="t"><thead><tr><th>#</th><th>Equipo</th>{present.map((c) => <th key={c} className="num" title={c}>{statLabel(c)}</th>)}</tr></thead>
              <tbody>{g.teams.map((t: any) => (
                <tr key={t.teamId}><td className="muted">{t.rank}</td><td><Link to={`/equipo/${encodeURIComponent(t.teamId)}`} className="row"><Logo src={t.logo} name={t.name} /><span>{t.name}</span></Link></td>
                  {present.map((c) => { const v = t.stats[c]; return <td key={c} className="num">{typeof v === 'number' ? (c === 'winPercent' ? fmt(v, 3) : Number.isInteger(v) ? (c === 'pointDifferential' && v > 0 ? `+${v}` : v) : fmt(v, 1)) : v ?? '—'}</td>; })}</tr>
              ))}</tbody></table></div>
          </div>
        ))}
    </div>
  );
}
