/** Ejecuta UNA consulta de solo lectura en un hilo aparte, para poder abortarla si tarda demasiado. */
import { parentPort, workerData } from 'node:worker_threads';
import { openDb } from './db.ts';

const { file, query, maxRows } = workerData as { file: string; query: string; maxRows: number };
try {
  const db = openDb(file, { readonly: true });
  const stmt = db.prepare(`SELECT * FROM (${query.replace(/;\s*$/, '')}) LIMIT ${maxRows + 1}`);
  const rows = stmt.raw(false).all() as Record<string, unknown>[];
  const columns = stmt.columns().map((c) => c.name);
  parentPort?.postMessage({ ok: true, columns, rows: rows.slice(0, maxRows), truncated: rows.length > maxRows });
} catch (e) {
  parentPort?.postMessage({ ok: false, error: e instanceof Error ? e.message : String(e) });
}
