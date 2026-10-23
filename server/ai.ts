/**
 * Analista de StatBet. Responde SOLO con lo que hay en la base de datos:
 *  1) busca equipos/partido mencionados en la pregunta,
 *  2) arma un bloque de datos reales (balance, forma, Elo, promedios, H2H, predicción del modelo),
 *  3) si hay GEMINI_API_KEY se lo pasa a Gemini con instrucciones estrictas de no inventar;
 *     si no hay clave (o falla), devuelve ese mismo bloque de datos ya redactado.
 */
import { GoogleGenAI } from '@google/genai';
import type { DB } from './db.ts';
import { headToHead, leagueElo, predictMatch, teamRecord, teamStatAverages } from './analytics/stats.ts';
import { statEs } from './aiLabels.ts';

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, ' ');
const STOP = new Set(['para', 'como', 'cual', 'cuales', 'esta', 'este', 'esto', 'partido', 'partidos', 'hoy', 'vivo', 'quien', 'gana', 'ganar', 'sobre', 'entre', 'contra', 'analisis', 'analiza', 'dime', 'del', 'los', 'las', 'que', 'con', 'una', 'por', 'mas', 'menos', 'goles', 'equipo', 'liga', 'jugador']);

interface TeamRow { id: string; name: string; sport_id: string }
interface MatchRow {
  id: string; league_id: string; sport_id: string; start_time: string; status: string; status_detail: string | null;
  home_team_id: string; away_team_id: string; home_score: number | null; away_score: number | null; hn: string; an: string; ln: string;
}

const MATCH_SQL = `SELECT m.id, m.league_id, m.sport_id, m.start_time, m.status, m.status_detail, m.home_team_id, m.away_team_id, m.home_score, m.away_score,
  th.name hn, ta.name an, l.name ln FROM matches m JOIN teams th ON th.id = m.home_team_id JOIN teams ta ON ta.id = m.away_team_id JOIN leagues l ON l.id = m.league_id`;

const fmtMatch = (m: MatchRow) => {
  const when = new Date(m.start_time).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  const score = m.home_score !== null ? `${m.home_score}-${m.away_score}` : 'vs';
  const st = m.status === 'live' ? `EN VIVO ${m.status_detail ?? ''}` : m.status === 'final' ? 'final' : m.status === 'scheduled' ? 'programado' : m.status;
  return `${m.hn} ${score} ${m.an} (${m.ln}, ${st}, ${when})`;
};

function findTeams(db: DB, message: string): TeamRow[] {
  const words = [...new Set(norm(message).split(/\s+/).filter((w) => w.length >= 4 && !STOP.has(w)))].slice(0, 8);
  const score = new Map<string, { t: TeamRow; s: number }>();
  for (const w of words) {
    const rows = db.prepare('SELECT id, name, sport_id FROM teams WHERE name LIKE ? LIMIT 12').all(`%${w}%`) as TeamRow[];
    for (const t of rows) {
      // Los equipos con más partidos en la base pesan más (evita homónimos sin datos)
      const e = score.get(t.id) ?? { t, s: 0 };
      e.s += 1;
      score.set(t.id, e);
    }
  }
  const games = (id: string) => (db.prepare('SELECT COUNT(*) n FROM matches WHERE home_team_id = ? OR away_team_id = ?').get(id, id) as { n: number }).n;
  return [...score.values()]
    .filter((e) => norm(e.t.name).split(/\s+/).some((p) => words.includes(p)) || words.some((w) => norm(e.t.name).includes(w)))
    .sort((a, b) => b.s - a.s || games(b.t.id) - games(a.t.id))
    .slice(0, 2).map((e) => e.t);
}

function teamBlock(db: DB, t: TeamRow): string {
  const rec = teamRecord(db, t.id);
  const lines: string[] = [`## ${t.name}`];
  if (rec.total.played === 0) {
    lines.push('Sin partidos terminados en la base de datos.');
  } else {
    const x = rec.total;
    lines.push(`Balance en la base (${x.played} partidos): ${x.w}G-${x.d}E-${x.l}P, ${(x.gf / x.played).toFixed(2)} a favor y ${(x.ga / x.played).toFixed(2)} en contra por partido.`);
    lines.push(`Local: ${rec.home.w}G-${rec.home.d}E-${rec.home.l}P (${rec.home.played}) · Visitante: ${rec.away.w}G-${rec.away.d}E-${rec.away.l}P (${rec.away.played}).`);
    lines.push(`Forma reciente (más nuevo primero): ${rec.form.slice(0, 5).map((f) => `${f.result === 'W' ? 'G' : f.result === 'D' ? 'E' : 'P'} ${f.score} vs ${f.opponent}`).join('; ')}.`);
    if (rec.rates) lines.push(`Más de 2,5 en ${rec.rates.over25Pct.toFixed(0)} % · ambos marcan ${rec.rates.bttsPct.toFixed(0)} % · portería a cero ${rec.rates.cleanSheetPct.toFixed(0)} %.`);
  }
  const lg = db.prepare(`SELECT league_id FROM matches WHERE home_team_id = @t OR away_team_id = @t ORDER BY start_time DESC LIMIT 1`).get({ t: t.id }) as { league_id: string } | undefined;
  if (lg) {
    const elo = leagueElo(db, lg.league_id);
    const row = elo.rows.find((r) => r.teamId === t.id);
    if (row) lines.push(`Elo (${lg.league_id}): ${row.rating}, puesto ${row.rank} de ${elo.rows.length}, con ${row.games} partidos.`);
  }
  const avgs = teamStatAverages(db, t.id).slice(0, 6);
  if (avgs.length) lines.push(`Promedios por partido: ${avgs.map((a) => `${statEs(a.key, a.label)} ${a.avg.toFixed(1)} (${a.games} p.)`).join('; ')}.`);
  const next = db.prepare(`${MATCH_SQL} WHERE (m.home_team_id = @t OR m.away_team_id = @t) AND m.status IN ('scheduled','live') ORDER BY m.start_time LIMIT 1`).get({ t: t.id }) as MatchRow | undefined;
  if (next) lines.push(`Próximo/actual: ${fmtMatch(next)}.`);
  return lines.join('\n');
}

function matchBlock(db: DB, m: MatchRow): string {
  const lines = [`## Partido: ${fmtMatch(m)}`];
  const ts = db.prepare('SELECT t.name team, s.key, s.label, s.display FROM team_match_stats s JOIN teams t ON t.id = s.team_id WHERE s.match_id = ? ORDER BY s.key').all(m.id) as { team: string; key: string; label: string | null; display: string | null }[];
  if (ts.length) {
    const byKey = new Map<string, string[]>();
    for (const r of ts) (byKey.get(statEs(r.key, r.label)) ?? byKey.set(statEs(r.key, r.label), []).get(statEs(r.key, r.label)!)!).push(`${r.team} ${r.display}`);
    lines.push('Estadísticas del partido: ' + [...byKey.entries()].map(([k, v]) => `${k}: ${v.join(' / ')}`).join('; ') + '.');
  } else lines.push('No hay estadísticas de equipo guardadas para este partido.');
  const odds = db.prepare('SELECT provider, home_ml, away_ml, draw_ml, spread, total FROM odds_snapshots WHERE match_id = ? ORDER BY id DESC LIMIT 1').get(m.id) as Record<string, any> | undefined;
  if (odds) lines.push(`Cuotas publicadas por ${odds.provider ?? 'ESPN'} (moneyline americano): local ${odds.home_ml ?? '—'}, empate ${odds.draw_ml ?? '—'}, visita ${odds.away_ml ?? '—'}; hándicap ${odds.spread ?? '—'}; total ${odds.total ?? '—'}.`);
  const inj = db.prepare('SELECT player_name, status, detail FROM injuries WHERE match_id = ?').all(m.id) as { player_name: string; status: string | null; detail: string | null }[];
  if (inj.length) lines.push(`Lesionados listados: ${inj.map((i) => `${i.player_name} (${[i.status, i.detail].filter(Boolean).join(', ')})`).join('; ')}.`);
  const p: any = predictMatch(db, m.id);
  if (p?.available) {
    lines.push(p.model === 'poisson'
      ? `Modelo de goles (Poisson, ${p.sample} partidos previos de la liga): local ${(p.pHome * 100).toFixed(0)} %, empate ${(p.pDraw * 100).toFixed(0)} %, visita ${(p.pAway * 100).toFixed(0)} %; goles esperados ${p.lambdaHome.toFixed(2)}-${p.lambdaAway.toFixed(2)}; más de 2,5: ${(p.pOver25 * 100).toFixed(0)} %; ambos marcan ${(p.pBtts * 100).toFixed(0)} %.${p.caution ? ' Aviso: ' + p.caution : ''}`
      : `Modelo Elo (${p.sample} partidos previos): local ${(p.pHome * 100).toFixed(0)} %, visita ${(p.pAway * 100).toFixed(0)} %.${p.caution ? ' Aviso: ' + p.caution : ''}`);
    lines.push('Estas probabilidades son estimaciones de un modelo simple sin lesiones ni alineaciones; no son garantías.');
  } else if (p) lines.push(`Predicción no disponible: ${p.reason}`);
  return lines.join('\n');
}

export function buildContext(db: DB, message: string, matchId?: string): { text: string; found: boolean } {
  const parts: string[] = [];
  let found = false;
  if (matchId) {
    const m = db.prepare(`${MATCH_SQL} WHERE m.id = ?`).get(matchId) as MatchRow | undefined;
    if (m) {
      parts.push(matchBlock(db, m));
      parts.push(teamBlock(db, { id: m.home_team_id, name: m.hn, sport_id: m.sport_id }), teamBlock(db, { id: m.away_team_id, name: m.an, sport_id: m.sport_id }));
      const h = headToHead(db, m.home_team_id, m.away_team_id, 5);
      if (h.n) parts.push(`## Enfrentamientos directos guardados (${h.n}): ${m.hn} ${h.aWins} · empates ${h.draws} · ${m.an} ${h.bWins}; total medio ${h.avgTotal?.toFixed(1)}.`);
      found = true;
    }
  }
  if (!found) {
    const teams = findTeams(db, message);
    for (const t of teams) { parts.push(teamBlock(db, t)); found = true; }
    if (teams.length === 2) {
      const h = headToHead(db, teams[0].id, teams[1].id, 5);
      parts.push(h.n ? `## Enfrentamientos directos guardados (${h.n}): ${teams[0].name} ${h.aWins} · empates ${h.draws} · ${teams[1].name} ${h.bWins}.` : '## No hay enfrentamientos directos guardados entre estos equipos.');
      const upcoming = db.prepare(`${MATCH_SQL} WHERE m.status IN ('scheduled','live') AND ((m.home_team_id = @a AND m.away_team_id = @b) OR (m.home_team_id = @b AND m.away_team_id = @a)) ORDER BY m.start_time LIMIT 1`).get({ a: teams[0].id, b: teams[1].id }) as MatchRow | undefined;
      if (upcoming) parts.push(matchBlock(db, upcoming));
    }
  }
  if (/hoy|vivo|jornada|resultados|ahora|partidos/i.test(message) || !found) {
    const now = Date.now();
    const rows = db.prepare(`${MATCH_SQL} WHERE m.status = 'live' OR m.start_time BETWEEN ? AND ? ORDER BY CASE m.status WHEN 'live' THEN 0 ELSE 1 END, m.start_time LIMIT 25`)
      .all(new Date(now - 12 * 3600e3).toISOString(), new Date(now + 24 * 3600e3).toISOString()) as MatchRow[];
    parts.push(rows.length ? `## Partidos en vivo y de hoy en la base (${rows.length})\n` + rows.map((m) => `- ${fmtMatch(m)}`).join('\n') : '## No hay partidos en vivo ni cercanos en la base de datos ahora mismo.');
    found = found || rows.length > 0;
  }
  const c = db.prepare("SELECT (SELECT COUNT(*) FROM matches WHERE status='final') f, (SELECT COUNT(*) FROM players) p").get() as { f: number; p: number };
  parts.push(`(La base contiene ${c.f} partidos terminados y ${c.p} jugadores.)`);
  return { text: parts.join('\n\n'), found };
}

const SYSTEM = `Eres el analista de StatBet. Responde en español, claro y breve (máximo ~180 palabras), con tono profesional.
REGLAS ESTRICTAS:
- Usa ÚNICAMENTE los datos del bloque DATOS. Si algo no está ahí, di que no está en la base de datos; no lo completes con tu conocimiento ni con suposiciones.
- No inventes xG, lesiones, alineaciones, cuotas ni resultados. Las cuotas, si aparecen, vienen de un solo proveedor.
- Las probabilidades del modelo son estimaciones; menciona el tamaño de muestra o los avisos cuando existan. Nunca prometas que una apuesta ganará ni recomiendes cantidades de dinero.
- Si la muestra es pequeña (pocos partidos), dilo.`;

let client: GoogleGenAI | null = null;

export async function answerQuestion(db: DB, message: string, matchId?: string): Promise<{ reply: string; source: 'gemini' | 'database'; note?: string }> {
  const ctx = buildContext(db, message, matchId);
  const key = process.env.GEMINI_API_KEY;
  const fallback = (note: string) => ({
    reply: `${ctx.found ? 'Esto es lo que hay en la base de datos sobre tu consulta:' : 'No encontré ese equipo o partido en la base de datos. Esto es lo que sí hay:'}\n\n${ctx.text}`,
    source: 'database' as const,
    note,
  });
  if (!key || key === 'MY_GEMINI_API_KEY') return fallback('Para respuestas redactadas por IA, define GEMINI_API_KEY en el archivo .env. Mientras tanto se muestran los datos tal cual.');
  client ??= new GoogleGenAI({ apiKey: key });
  const models = (process.env.GEMINI_MODEL || 'gemini-flash-latest,gemini-3.1-flash-lite').split(',').map((s) => s.trim()).filter(Boolean);
  for (const model of models) {
    try {
      const r = await client.models.generateContent({
        model,
        contents: `DATOS:\n${ctx.text}\n\nPREGUNTA DEL USUARIO:\n${message}`,
        config: { systemInstruction: SYSTEM, temperature: 0.3 },
      });
      if (r.text) return { reply: r.text, source: 'gemini' };
    } catch (e) {
      console.warn(`[ai] ${model} falló:`, e instanceof Error ? e.message : e);
    }
  }
  return fallback('No se pudo consultar a Gemini; se muestran los datos de la base.');
}
