/**
 * Uso:
 *   npm run backfill -- --days 60            Carga histórica de los últimos 60 días (todas las ligas)
 *   npm run backfill -- --days 30 --no-details   Solo marcadores (sin boxscores)
 *   npm run ingest -- sweep                  Un barrido (ayer → +3 días)
 *   npm run ingest -- details                Baja los boxscores pendientes
 *   npm run ingest -- standings              Actualiza clasificaciones
 *   npm run reparse                          Re-procesa los JSON guardados (sin red)
 * Variables: LEAGUES=eng.1,nba  (limita las ligas), DB_PATH=./data/statbet.db
 */
import { openDb } from '../db.ts';
import { Ingestor } from './ingest.ts';

const args = process.argv.slice(2);
const cmd = args[0] ?? 'sweep';
const flag = (name: string) => args.includes(`--${name}`);
const opt = (name: string, def: number) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? Number(args[i + 1]) : def;
};

const db = openDb();
const ing = new Ingestor(db);
const say = (m: string) => console.log(m);

async function main() {
  switch (cmd) {
    case 'backfill':
      await ing.backfill(opt('days', 30), { details: !flag('no-details'), onProgress: say });
      break;
    case 'sweep':
      await ing.sweep();
      break;
    case 'live':
      await ing.liveCycle();
      break;
    case 'details': {
      const n = await ing.detailBacklog(opt('limit', 200));
      say(`Boxscores guardados: ${n}`);
      break;
    }
    case 'standings':
      await ing.standingsAll();
      break;
    case 'reparse':
      await ing.reparse(say);
      break;
    default:
      console.error(`Comando desconocido: ${cmd}`);
      process.exit(1);
  }
  const fails = db.prepare("SELECT target, error FROM ingest_log WHERE ok = 0 ORDER BY id DESC LIMIT 5").all() as { target: string; error: string }[];
  const stats = db.prepare('SELECT (SELECT COUNT(*) FROM matches) matches, (SELECT COUNT(*) FROM players) players, (SELECT COUNT(*) FROM player_match_stats) player_stats').get();
  say(`Base de datos: ${JSON.stringify(stats)}`);
  if (fails.length) {
    say('Últimos errores:');
    for (const f of fails) say(`  - ${f.target}: ${f.error}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.close());
