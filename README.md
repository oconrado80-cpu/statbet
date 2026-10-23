# StatBet

Base de datos deportiva que **se alimenta sola** y una web pública para consultarla y analizarla.

- **Recolecta datos reales** de las fuentes públicas de ESPN (fútbol de 18 ligas, NBA, WNBA, NFL, MLB, NHL, ATP/WTA): marcadores, estadísticas de equipo y de jugador por partido, eventos, clasificaciones y cuotas (solo si ESPN las publica).
- **Los guarda** en SQLite y los acumula día tras día (partido terminado → boxscore completo guardado una vez).
- **La web** (React) permite ver partidos, fichas, equipos, jugadores, clasificaciones, análisis y **explorar/descargar la base de datos** (CSV/JSON) o consultarla con SQL.
- **Análisis con honestidad**: Elo y Poisson calculados con tus datos, y una prueba *walk-forward* que dice si el modelo gana a una línea base ingenua (con intervalo de confianza). Si no gana, la web lo dice.

> **Qué cambió respecto a la versión anterior:** la versión original inventaba xG, posesión, tiros, córners, H2H, forma, alineaciones, cuotas de varias casas y goleadores a partir del marcador. Todo eso se eliminó. Ahora solo se muestra lo que la fuente publica; lo demás queda vacío.

## Arrancar

```bash
npm install
npm run build        # compila la web
npm start            # http://localhost:3000
```

La primera vez, el servidor carga en segundo plano los últimos 21 días (`BACKFILL_DAYS`) y descarga los boxscores. Después se actualiza solo: cada 60 s los partidos en vivo, cada 30 min un barrido, cada 6 h las clasificaciones.

Historial más largo (recomendado, hazlo una vez):

```bash
npm run backfill -- --days 120
```

Desarrollo (API en :3000 + web con recarga en :5173): `npm run dev`.
Ver la web sin internet con datos **sintéticos** (llevan aviso permanente): `npm run demo-data && DB_PATH=data/demo.db INGEST=off npm start`.

## Publicarla para que entre cualquiera

Necesita un servidor que esté **encendido siempre** (para seguir recolectando) y un **disco persistente** (la base es un archivo SQLite). Con el `Dockerfile` incluido sirve cualquier plataforma que ejecute contenedores (Render, Railway, Fly.io, un VPS):

1. Sube el proyecto a GitHub y crea un servicio desde el repositorio (Docker).
2. Monta un disco/volumen en `/data` (la variable `DB_PATH` ya apunta a `/data/statbet.db`).
3. Variables recomendadas: `TRUST_PROXY=1`, `BACKFILL_DAYS=30`. Opcional: `ENABLE_SQL_CONSOLE=true`.
4. Plataformas gratuitas que duermen el servicio **dejan huecos** en la recolección: usa un plan siempre activo.

Una instancia sirve de sobra para miles de visitas (SQLite en modo WAL, respuestas en caché, límite de peticiones por IP). No ejecutes varias instancias sobre la misma base.

## Estructura

```
server/
  espn/        config (ligas), client (HTTP educado), parse (JSON→filas, funciones puras)
  ingest/      store (upserts), ingest (backfill / en vivo / barrido), scheduler, cli
  analytics/   models (Elo, Poisson, backtest), stats (resúmenes, equipos, H2H)
  api.ts       API REST   ·   index.ts  servidor   ·   sqlWorker.ts  consola SQL con timeout
web/src/       React: pages/ (Partidos, Ficha, Equipos, Jugadores, Clasificación, Análisis, Datos)
tests/         parser, ingesta con fetch simulado y modelos (npm test)
scripts/       make-test-db.ts (datos sintéticos para pruebas)
```

Tablas principales: `matches`, `teams`, `players`, `team_match_stats`, `player_match_stats` (formato largo `clave/valor`, válido para cualquier deporte), `appearances`, `match_events`, `standings`, `odds_snapshots`, `raw_payloads` (JSON original comprimido), `ingest_log`.

## Límites que conviene conocer

- ESPN **no tiene API pública documentada**: puede cambiar sin aviso. Los errores quedan en la pestaña *Base de datos → Errores de descarga*, y como se guarda el JSON original, tras corregir `server/espn/parse.ts` se re-procesa sin red con `npm run reparse`. Revisa los términos de uso de ESPN antes de un uso comercial; para producción seria conviene un proveedor con licencia (el parser está aislado en un archivo para cambiarlo).
- Tenis: solo marcadores y sets (ESPN no publica boxscore). Otros deportes: lo que ESPN incluya en cada boxscore.
- No hay xG real, lesiones ni alineaciones previas: no se inventan. Añadirlos requiere otra fuente.
- Cuotas: solo el proveedor que ESPN muestre, sin comparador multi-casa.
- Los modelos usan únicamente resultados guardados. Con pocas semanas de datos, sus conclusiones son frágiles: la pestaña *Evaluar modelo* avisa del tamaño de muestra.

## Windows

Instala Node.js 20+ y haz doble clic en `iniciar.bat`: instala, compila, abre el navegador en http://localhost:3000 y deja corriendo la recolección mientras la ventana esté abierta.

## Analista de IA (opcional)

El botón **Analista IA** responde preguntas usando solo los datos de la base. Sin clave, muestra los datos tal cual; con una clave gratuita de Gemini
(https://aistudio.google.com/apikey) los redacta. Copia `.env.example` a `.env`, pega la clave en `GEMINI_API_KEY=` y reinicia.

## Publicar en internet
Mira `PUBLICAR.md` (guía paso a paso con Render; también hay `fly.toml` para Fly.io).
