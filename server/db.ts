import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export type DB = Database.Database;

export const DEFAULT_DB_PATH = process.env.DB_PATH || path.resolve('data', 'statbet.db');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sports (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS leagues (
  id          TEXT PRIMARY KEY,           -- nuestro id, p.ej. 'eng.1'
  sport_id    TEXT NOT NULL REFERENCES sports(id),
  name        TEXT NOT NULL,
  country     TEXT,
  kind        TEXT NOT NULL DEFAULT 'team', -- 'team' | 'individual'
  has_details INTEGER NOT NULL DEFAULT 1    -- ¿ESPN publica boxscore por partido?
);

-- "teams" también guarda tenistas (kind = 'individual') para poder reutilizar todo el modelo.
CREATE TABLE IF NOT EXISTS teams (
  id           TEXT PRIMARY KEY,           -- '<sport>:<espn_id>'
  sport_id     TEXT NOT NULL REFERENCES sports(id),
  espn_id      TEXT NOT NULL,
  name         TEXT NOT NULL,
  short_name   TEXT,
  abbreviation TEXT,
  logo         TEXT,
  color        TEXT,
  country      TEXT,
  kind         TEXT NOT NULL DEFAULT 'team',
  updated_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_teams_sport ON teams(sport_id);
CREATE INDEX IF NOT EXISTS idx_teams_name  ON teams(name COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS players (
  id         TEXT PRIMARY KEY,             -- '<sport>:<espn_id>'
  sport_id   TEXT NOT NULL REFERENCES sports(id),
  espn_id    TEXT NOT NULL,
  name       TEXT NOT NULL,
  short_name TEXT,
  position   TEXT,
  jersey     TEXT,
  headshot   TEXT,
  team_id    TEXT,                          -- último equipo visto
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_players_sport ON players(sport_id);
CREATE INDEX IF NOT EXISTS idx_players_name  ON players(name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_players_team  ON players(team_id);

CREATE TABLE IF NOT EXISTS matches (
  id              TEXT PRIMARY KEY,         -- '<league>:<espn_event_id>'
  league_id       TEXT NOT NULL REFERENCES leagues(id),
  sport_id        TEXT NOT NULL REFERENCES sports(id),
  espn_id         TEXT NOT NULL,
  season          INTEGER,
  stage           TEXT,
  start_time      TEXT NOT NULL,            -- ISO 8601 UTC
  status          TEXT NOT NULL,            -- scheduled | live | final | postponed | cancelled
  status_detail   TEXT,
  clock           TEXT,
  period          INTEGER,
  home_team_id    TEXT NOT NULL REFERENCES teams(id),
  away_team_id    TEXT NOT NULL REFERENCES teams(id),
  home_score      INTEGER,
  away_score      INTEGER,
  home_line       TEXT,                     -- JSON: puntos por periodo/set
  away_line       TEXT,
  winner          TEXT,                     -- home | away | draw | NULL
  venue           TEXT,
  city            TEXT,
  attendance      INTEGER,
  neutral_site    INTEGER NOT NULL DEFAULT 0,
  detail_fetched_at TEXT,                   -- última vez que se bajó el boxscore
  detail_final    INTEGER NOT NULL DEFAULT 0, -- 1 = boxscore completo bajado con el partido ya terminado
  detail_attempts INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  UNIQUE (league_id, espn_id)
);
CREATE INDEX IF NOT EXISTS idx_matches_time   ON matches(start_time);
CREATE INDEX IF NOT EXISTS idx_matches_league ON matches(league_id, start_time);
CREATE INDEX IF NOT EXISTS idx_matches_home   ON matches(home_team_id, start_time);
CREATE INDEX IF NOT EXISTS idx_matches_away   ON matches(away_team_id, start_time);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status, start_time);

-- Estadísticas por equipo y partido (formato largo: sirve para cualquier deporte).
CREATE TABLE IF NOT EXISTS team_match_stats (
  match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  team_id  TEXT NOT NULL REFERENCES teams(id),
  key      TEXT NOT NULL,
  label    TEXT,
  value    REAL,
  display  TEXT,
  PRIMARY KEY (match_id, team_id, key)
);
CREATE INDEX IF NOT EXISTS idx_tms_key ON team_match_stats(key);

-- Quién jugó cada partido.
CREATE TABLE IF NOT EXISTS appearances (
  match_id  TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES players(id),
  team_id   TEXT NOT NULL REFERENCES teams(id),
  starter   INTEGER,
  position  TEXT,
  jersey    TEXT,
  formation_place INTEGER,                   -- puesto en la formación (1 = portero) si la fuente lo da
  PRIMARY KEY (match_id, player_id)
);

-- Formación táctica usada por cada equipo en un partido (si ESPN la publica).
CREATE TABLE IF NOT EXISTS lineups (
  match_id  TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  team_id   TEXT NOT NULL REFERENCES teams(id),
  formation TEXT,
  PRIMARY KEY (match_id, team_id)
);

-- Lesionados / sancionados que ESPN lista en el partido (si los lista).
CREATE TABLE IF NOT EXISTS injuries (
  match_id    TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  team_id     TEXT NOT NULL REFERENCES teams(id),
  player_id   TEXT,
  player_name TEXT NOT NULL,
  position    TEXT,
  status      TEXT,
  detail      TEXT,
  PRIMARY KEY (match_id, team_id, player_name)
);
CREATE INDEX IF NOT EXISTS idx_app_player ON appearances(player_id);

-- Estadísticas por jugador y partido.
CREATE TABLE IF NOT EXISTS player_match_stats (
  match_id  TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES players(id),
  team_id   TEXT NOT NULL REFERENCES teams(id),
  grp       TEXT NOT NULL DEFAULT '',        -- grupo (NFL: passing/rushing..., MLB: batting/pitching)
  key       TEXT NOT NULL,
  label     TEXT,
  value     REAL,
  display   TEXT,
  PRIMARY KEY (match_id, player_id, grp, key)
);
CREATE INDEX IF NOT EXISTS idx_pms_player ON player_match_stats(player_id);
CREATE INDEX IF NOT EXISTS idx_pms_key    ON player_match_stats(key, grp);

CREATE TABLE IF NOT EXISTS match_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id    TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  seq         INTEGER NOT NULL,
  clock       TEXT,
  period      INTEGER,
  type        TEXT,
  text        TEXT,
  team_id     TEXT,
  player_id   TEXT,
  player_name TEXT,
  scoring     INTEGER NOT NULL DEFAULT 0,
  home_score  INTEGER,
  away_score  INTEGER
);
CREATE INDEX IF NOT EXISTS idx_events_match ON match_events(match_id, seq);

CREATE TABLE IF NOT EXISTS standings (
  league_id  TEXT NOT NULL REFERENCES leagues(id),
  season     INTEGER NOT NULL,
  grp        TEXT NOT NULL DEFAULT '',
  team_id    TEXT NOT NULL REFERENCES teams(id),
  rank       INTEGER,
  stats      TEXT NOT NULL,                  -- JSON { clave: valor }
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (league_id, season, grp, team_id)
);

-- Cuotas SOLO si ESPN las publica; se guarda un registro cada vez que cambian.
CREATE TABLE IF NOT EXISTS odds_snapshots (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id    TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  provider    TEXT,
  captured_at TEXT NOT NULL,
  home_ml     REAL,                           -- moneyline en formato americano
  away_ml     REAL,
  draw_ml     REAL,
  spread      REAL,
  total       REAL,
  details     TEXT
);
CREATE INDEX IF NOT EXISTS idx_odds_match ON odds_snapshots(match_id, captured_at);

-- Respuestas originales de ESPN (gzip) para poder re-procesar sin volver a descargar.
CREATE TABLE IF NOT EXISTS raw_payloads (
  kind       TEXT NOT NULL,                   -- scoreboard | summary | standings
  key        TEXT NOT NULL,
  league_id  TEXT,
  fetched_at TEXT NOT NULL,
  body       BLOB NOT NULL,
  PRIMARY KEY (kind, key)
);

CREATE TABLE IF NOT EXISTS ingest_log (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  ts      TEXT NOT NULL,
  kind    TEXT NOT NULL,
  target  TEXT,
  ok      INTEGER NOT NULL,
  rows    INTEGER,
  ms      INTEGER,
  error   TEXT
);
CREATE INDEX IF NOT EXISTS idx_log_ts ON ingest_log(ts);

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);
`;

export function openDb(file: string = DEFAULT_DB_PATH, opts: { readonly?: boolean } = {}): DB {
  if (file !== ':memory:' && !opts.readonly) fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file, { readonly: !!opts.readonly });
  if (opts.readonly) {
    db.pragma('query_only = ON');
    return db;
  }
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.exec(SCHEMA);
  // Migración para bases creadas con versiones anteriores
  const cols = db.prepare('PRAGMA table_info(appearances)').all() as { name: string }[];
  if (!cols.some((c) => c.name === 'formation_place')) db.exec('ALTER TABLE appearances ADD COLUMN formation_place INTEGER');
  return db;
}

export function getMeta(db: DB, key: string): string | null {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setMeta(db: DB, key: string, value: string): void {
  db.prepare(
    'INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run(key, value);
}
