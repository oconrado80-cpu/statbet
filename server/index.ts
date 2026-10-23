import 'dotenv/config';
import express from 'express';
import compression from 'compression';
import helmet from 'helmet';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DEFAULT_DB_PATH, openDb } from './db.ts';
import { ensureCatalog } from './ingest/store.ts';
import { startScheduler } from './ingest/scheduler.ts';
import { buildApi } from './api.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const isProd = process.env.NODE_ENV === 'production';

const db = openDb();
ensureCatalog(db);

const app = express();
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false })); // el front carga logos de ESPN desde otros dominios
app.use(compression());
app.get('/healthz', (_req, res) => { try { db.prepare('SELECT 1').get(); res.type('text').send('ok'); } catch { res.status(500).type('text').send('db error'); } });

// Límite de peticiones por IP (en memoria; suficiente para una instancia)
const hits = new Map<string, { n: number; reset: number }>();
app.use('/api', (req, res, next) => {
  const heavy = /\/export\.|\/sql$|\/ai\/chat$/.test(req.path);
  const limit = heavy ? 10 : Number(process.env.RATE_LIMIT_PER_MIN || 240);
  const key = `${req.ip}:${heavy ? 'h' : 'n'}`;
  const now = Date.now();
  const h = hits.get(key);
  if (!h || h.reset < now) hits.set(key, { n: 1, reset: now + 60_000 });
  else if (++h.n > limit) return res.status(429).json({ error: 'Demasiadas peticiones, espera un minuto.' });
  if (hits.size > 10_000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  next();
});

app.use('/api', buildApi(db, { dbFile: DEFAULT_DB_PATH }));
app.use('/api', (_req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

const dist = path.resolve(__dirname, '..', 'web', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { maxAge: isProd ? '1h' : 0, index: false }));
  app.get('/{*splat}', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
} else {
  app.get('/', (_req, res) => res.type('text').send('API de StatBet activa. Frontend sin compilar: ejecuta `npm run build` (o `npm run dev` para desarrollo).'));
}

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err?.status !== 404) console.error(err);
  res.status(err?.status || 500).json({ error: err?.status === 404 ? err.message : 'Error interno' });
});

app.listen(PORT, () => {
  console.log(`StatBet escuchando en http://localhost:${PORT}  (db: ${DEFAULT_DB_PATH})`);
  if (process.env.INGEST !== 'off') startScheduler(db);
  else console.log('Recolección automática desactivada (INGEST=off).');
});
