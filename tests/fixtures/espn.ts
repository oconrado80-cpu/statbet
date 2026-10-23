/**
 * FIXTURES DE PRUEBA con la misma forma que las respuestas públicas de ESPN.
 * Los valores son inventados y se usan SOLO en tests: nunca se escriben en la base de datos real.
 */
export const soccerScoreboard = {
  leagues: [{ id: '700', season: { year: 2026 } }],
  events: [
    {
      id: '1001',
      date: '2026-10-17T14:00Z',
      season: { year: 2026, slug: 'regular-season' },
      competitions: [
        {
          id: '1001',
          date: '2026-10-17T14:00Z',
          attendance: 52000,
          neutralSite: false,
          venue: { fullName: 'Estadio Uno', address: { city: 'Ciudad Uno' } },
          status: { displayClock: "90'+4'", period: 2, type: { name: 'STATUS_FULL_TIME', state: 'post', completed: true, detail: 'FT' } },
          competitors: [
            { homeAway: 'home', winner: true, score: '2', team: { id: '11', displayName: 'Club Alfa', shortDisplayName: 'Alfa', abbreviation: 'ALF', color: 'ff0000', logo: 'https://x/alfa.png' } },
            { homeAway: 'away', winner: false, score: '1', team: { id: '22', displayName: 'Club Beta', shortDisplayName: 'Beta', abbreviation: 'BET', color: '0000ff' } },
          ],
          details: [
            { type: { text: 'Goal' }, clock: { displayValue: "12'" }, team: { id: '11' }, scoringPlay: true, athletesInvolved: [{ id: '501', displayName: 'Juan Pérez' }] },
            { type: { text: 'Yellow Card' }, clock: { displayValue: "40'" }, team: { id: '22' }, yellowCard: true, athletesInvolved: [{ id: '601', displayName: 'Luis Gómez' }] },
            { type: { text: 'Goal' }, clock: { displayValue: "77'" }, team: { id: '22' }, scoringPlay: true, athletesInvolved: [{ id: '602', displayName: 'Mario Ruiz' }] },
            { type: { text: 'Goal' }, clock: { displayValue: "88'" }, team: { id: '11' }, scoringPlay: true, penaltyKick: true, athletesInvolved: [{ id: '501', displayName: 'Juan Pérez' }] },
          ],
        },
      ],
    },
    {
      id: '1002',
      date: '2026-10-25T19:30Z',
      competitions: [
        {
          id: '1002',
          date: '2026-10-25T19:30Z',
          venue: { fullName: 'Estadio Dos' },
          status: { type: { name: 'STATUS_SCHEDULED', state: 'pre', completed: false } },
          competitors: [
            { homeAway: 'home', score: '0', team: { id: '22', displayName: 'Club Beta' } },
            { homeAway: 'away', score: '0', team: { id: '33', displayName: 'Club Gamma' } },
          ],
          odds: [{ provider: { name: 'DraftKings' }, details: 'BET -120', overUnder: 2.5, homeTeamOdds: { moneyLine: -120 }, awayTeamOdds: { moneyLine: 300 }, drawOdds: { moneyLine: 240 } }],
        },
      ],
    },
    { id: '1003', competitions: [] }, // evento roto: debe contarse como "skipped"
  ],
};

export const soccerSummary = {
  boxscore: {
    teams: [
      { homeAway: 'home', team: { id: '11', displayName: 'Club Alfa' }, statistics: [
        { name: 'possessionPct', displayValue: '58.3', label: 'Possession' },
        { name: 'totalShots', displayValue: '14', label: 'Shots' },
        { name: 'shotsOnTarget', displayValue: '6', label: 'Shots on Target' },
        { name: 'wonCorners', displayValue: '7', label: 'Corners' },
      ] },
      { homeAway: 'away', team: { id: '22', displayName: 'Club Beta' }, statistics: [
        { name: 'possessionPct', displayValue: '41.7' },
        { name: 'totalShots', displayValue: '9' },
        { name: 'shotsOnTarget', displayValue: '3' },
        { name: 'wonCorners', displayValue: '2' },
      ] },
    ],
  },
  rosters: [
    { homeAway: 'home', formation: '4-3-3', team: { id: '11', displayName: 'Club Alfa' }, roster: [
      { athlete: { id: '501', displayName: 'Juan Pérez' }, starter: true, formationPlace: 9, jersey: '9', position: { abbreviation: 'F' }, stats: [
        { name: 'appearances', value: 1, displayValue: '1' }, { name: 'totalGoals', value: 2, displayValue: '2' }, { name: 'totalShots', value: 5, displayValue: '5' }, { name: 'shotsOnTarget', value: 3, displayValue: '3' },
      ] },
      { athlete: { id: '599', displayName: 'Suplente Nunca Entró' }, starter: false, jersey: '30', position: { abbreviation: 'G' }, stats: [{ name: 'appearances', value: 0, displayValue: '0' }] },
    ] },
    { homeAway: 'away', team: { id: '22', displayName: 'Club Beta' }, roster: [
      { athlete: { id: '602', displayName: 'Mario Ruiz' }, starter: false, subbedIn: { clock: { displayValue: "60'" } }, jersey: '11', position: { abbreviation: 'M' }, stats: [{ name: 'appearances', value: 1, displayValue: '1' }, { name: 'totalGoals', value: 1, displayValue: '1' }] },
    ] },
  ],
  keyEvents: [
    { type: { text: 'Goal' }, shortText: 'Gol de Juan Pérez', period: { number: 1 }, clock: { displayValue: "12'" }, scoringPlay: true, team: { id: '11' }, participants: [{ athlete: { id: '501', displayName: 'Juan Pérez' } }] },
    { type: { text: 'Yellow Card' }, period: { number: 1 }, clock: { displayValue: "40'" }, team: { id: '22' }, participants: [{ athlete: { id: '601', displayName: 'Luis Gómez' } }] },
  ],
  injuries: [{ team: { id: '11' }, injuries: [{ athlete: { id: '777', displayName: 'Lesionado Uno', position: { abbreviation: 'D' } }, status: 'Out', details: { detail: 'Rodilla' } }] }],
  gameInfo: { attendance: 52000, venue: { fullName: 'Estadio Uno', address: { city: 'Ciudad Uno' } } },
};

export const nbaSummary = {
  boxscore: {
    teams: [
      { team: { id: '13', displayName: 'Los Angeles Lakers' }, statistics: [{ name: 'fieldGoalPct', displayValue: '47.5' }, { name: 'fieldGoalsMade-fieldGoalsAttempted', displayValue: '42-88', label: 'FG' }, { name: 'totalRebounds', displayValue: '45' }] },
      { team: { id: '2', displayName: 'Boston Celtics' }, statistics: [{ name: 'fieldGoalPct', displayValue: '44.0' }, { name: 'totalRebounds', displayValue: '41' }] },
    ],
    players: [
      { team: { id: '13', displayName: 'Los Angeles Lakers' }, statistics: [{
        keys: ['minutes', 'fieldGoalsMade-fieldGoalsAttempted', 'points', 'rebounds', 'assists', 'plusMinus'],
        labels: ['MIN', 'FG', 'PTS', 'REB', 'AST', '+/-'],
        athletes: [
          { athlete: { id: '3', displayName: 'Jugador Uno', position: { abbreviation: 'SF' }, jersey: '23' }, starter: true, stats: ['36', '11-20', '30', '8', '9', '+7'] },
          { athlete: { id: '4', displayName: 'Jugador Dos' }, starter: false, didNotPlay: true, reason: 'COACH', stats: [] },
        ],
      }] },
    ],
  },
  scoringPlays: [{ type: { text: 'Made Shot' }, text: 'Jugador Uno hace un triple', period: { number: 1 }, clock: { displayValue: '10:45' }, team: { id: '13' }, homeScore: 3, awayScore: 0 }],
  pickcenter: [{ provider: { name: 'ESPN BET' }, details: 'LAL -3.5', spread: -3.5, overUnder: 224.5, homeTeamOdds: { moneyLine: -150 }, awayTeamOdds: { moneyLine: 130 } }],
};

export const tennisScoreboard = {
  events: [
    {
      id: 'T1', name: 'Torneo de Prueba', date: '2026-10-20T10:00Z',
      groupings: [{ competitions: [
        { id: 'C1', date: '2026-10-20T10:00Z', round: { displayName: 'Round of 16' }, venue: { court: 'Court 1', fullName: 'Ciudad Test' },
          status: { type: { name: 'STATUS_FINAL', state: 'post', completed: true } },
          competitors: [
            { id: '900', order: 1, winner: true, athlete: { displayName: 'Ana Tenista', flag: { alt: 'Spain' } }, linescores: [{ value: 6 }, { value: 3 }, { value: 7 }] },
            { id: '901', order: 2, winner: false, athlete: { displayName: 'Bea Raqueta', flag: { alt: 'France' } }, linescores: [{ value: 4 }, { value: 6 }, { value: 5 }] },
          ] },
      ] }],
    },
  ],
};

export const standingsJson = {
  children: [
    { name: 'Tabla General', standings: { season: 2026, entries: [
      { team: { id: '11', displayName: 'Club Alfa' }, stats: [{ name: 'rank', value: 1 }, { name: 'gamesPlayed', value: 10 }, { name: 'points', value: 25 }, { name: 'pointDifferential', value: 12, displayValue: '+12' }] },
      { team: { id: '22', displayName: 'Club Beta' }, stats: [{ name: 'rank', value: 2 }, { name: 'gamesPlayed', value: 10 }, { name: 'points', value: 20 }] },
    ] } },
  ],
};
