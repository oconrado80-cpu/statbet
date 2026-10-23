import type { DB } from '../db.ts';
import { getMeta } from '../db.ts';
import { Ingestor } from './ingest.ts';

/** Arranca la recolección automática dentro del mismo proceso del servidor web. */
export function startScheduler(db: DB): Ingestor {
  const ing = new Ingestor(db);
  const log = (m: string) => console.log(`[ingest] ${m}`);
  const safe = (name: string, fn: () => Promise<unknown>) => () => {
    fn().catch((e) => console.error(`[ingest] ${name} falló:`, e));
  };

  const backfillDays = Number(process.env.BACKFILL_DAYS ?? 21);
  const needsBackfill = !getMeta(db, 'backfill_done_at') && backfillDays > 0;

  // Primera vez: historial inicial en segundo plano (el sitio ya responde mientras tanto).
  if (needsBackfill) {
    log(`Primera ejecución: cargando los últimos ${backfillDays} días en segundo plano…`);
    ing.backfill(backfillDays, { onProgress: log }).then(() => log('Carga inicial terminada.')).catch((e) => console.error('[ingest] backfill falló:', e));
  } else {
    safe('sweep', () => ing.sweep())();
  }

  setInterval(safe('live', () => ing.liveCycle()), Number(process.env.LIVE_INTERVAL_MS || 30_000));
  setInterval(safe('sweep', () => ing.sweep()), Number(process.env.SWEEP_INTERVAL_MS || 30 * 60_000));
  setInterval(safe('standings', () => ing.standingsAll()), 6 * 3600_000);
  return ing;
}
