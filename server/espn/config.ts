/**
 * Catálogo de ligas que se ingieren. Todas usan los endpoints públicos (no oficiales) de ESPN:
 *   https://site.api.espn.com/apis/site/v2/sports/{sport}/{league}/scoreboard
 *   https://site.api.espn.com/apis/site/v2/sports/{sport}/{league}/summary?event={id}
 *   https://site.api.espn.com/apis/v2/sports/{sport}/{league}/standings
 *
 * ESPN no ofrece una API pública documentada ni garantías de estabilidad: si un campo cambia,
 * el parser lo registra en `ingest_log` y, como se guarda el JSON original, se puede re-procesar
 * con `npm run reparse` sin volver a descargar.
 */
export interface LeagueConfig {
  id: string;
  sportId: string;
  espnSport: string;
  espnLeague: string;
  name: string;
  country: string;
  kind: 'team' | 'individual';
  hasDetails: boolean;
}

export const SPORTS: Record<string, string> = {
  football: 'Fútbol',
  basketball: 'Baloncesto',
  nfl: 'Fútbol americano',
  baseball: 'Béisbol',
  hockey: 'Hockey sobre hielo',
  tennis: 'Tenis',
};

const soccer = (espnLeague: string, name: string, country: string): LeagueConfig => ({
  id: espnLeague,
  sportId: 'football',
  espnSport: 'soccer',
  espnLeague,
  name,
  country,
  kind: 'team',
  hasDetails: true,
});

export const LEAGUES: LeagueConfig[] = [
  // Fútbol — Sudamérica
  soccer('conmebol.libertadores', 'Copa Libertadores', 'Sudamérica'),
  soccer('conmebol.sudamericana', 'Copa Sudamericana', 'Sudamérica'),
  soccer('col.1', 'Liga BetPlay', 'Colombia'),
  soccer('arg.1', 'Liga Profesional', 'Argentina'),
  soccer('bra.1', 'Brasileirão Série A', 'Brasil'),
  soccer('chi.1', 'Primera División', 'Chile'),
  soccer('uru.1', 'Primera División', 'Uruguay'),
  // Fútbol — Norteamérica
  soccer('usa.1', 'MLS', 'Estados Unidos'),
  soccer('mex.1', 'Liga MX', 'México'),
  // Fútbol — Europa
  soccer('uefa.champions', 'UEFA Champions League', 'Europa'),
  soccer('uefa.europa', 'UEFA Europa League', 'Europa'),
  soccer('eng.1', 'Premier League', 'Inglaterra'),
  soccer('esp.1', 'LaLiga', 'España'),
  soccer('ita.1', 'Serie A', 'Italia'),
  soccer('ger.1', 'Bundesliga', 'Alemania'),
  soccer('fra.1', 'Ligue 1', 'Francia'),
  soccer('ned.1', 'Eredivisie', 'Países Bajos'),
  soccer('por.1', 'Primeira Liga', 'Portugal'),
  // Otros deportes
  { id: 'nba', sportId: 'basketball', espnSport: 'basketball', espnLeague: 'nba', name: 'NBA', country: 'Estados Unidos', kind: 'team', hasDetails: true },
  { id: 'wnba', sportId: 'basketball', espnSport: 'basketball', espnLeague: 'wnba', name: 'WNBA', country: 'Estados Unidos', kind: 'team', hasDetails: true },
  { id: 'nfl', sportId: 'nfl', espnSport: 'football', espnLeague: 'nfl', name: 'NFL', country: 'Estados Unidos', kind: 'team', hasDetails: true },
  { id: 'mlb', sportId: 'baseball', espnSport: 'baseball', espnLeague: 'mlb', name: 'MLB', country: 'Estados Unidos', kind: 'team', hasDetails: true },
  { id: 'nhl', sportId: 'hockey', espnSport: 'hockey', espnLeague: 'nhl', name: 'NHL', country: 'Estados Unidos / Canadá', kind: 'team', hasDetails: true },
  { id: 'atp', sportId: 'tennis', espnSport: 'tennis', espnLeague: 'atp', name: 'ATP Tour', country: 'Internacional', kind: 'individual', hasDetails: false },
  { id: 'wta', sportId: 'tennis', espnSport: 'tennis', espnLeague: 'wta', name: 'WTA Tour', country: 'Internacional', kind: 'individual', hasDetails: false },
];

export function activeLeagues(): LeagueConfig[] {
  const filter = (process.env.LEAGUES || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!filter.length) return LEAGUES;
  return LEAGUES.filter((l) => filter.includes(l.id));
}

const BASE = process.env.ESPN_BASE || 'https://site.api.espn.com';

export const urls = {
  scoreboard: (l: LeagueConfig, dates: string) =>
    `${BASE}/apis/site/v2/sports/${l.espnSport}/${l.espnLeague}/scoreboard?dates=${dates}&limit=400`,
  summary: (l: LeagueConfig, eventId: string) =>
    `${BASE}/apis/site/v2/sports/${l.espnSport}/${l.espnLeague}/summary?event=${eventId}`,
  standings: (l: LeagueConfig) => `${BASE}/apis/v2/sports/${l.espnSport}/${l.espnLeague}/standings`,
};
