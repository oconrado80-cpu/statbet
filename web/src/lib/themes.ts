/** Imágenes y textos de portada por deporte (las imágenes son las del diseño original). */
export interface SportTheme { img: string; title: string; accent: string; tagline: string }
export const THEMES: Record<string, SportTheme> = {
  '': { img: '/img/stadium.jpg', title: 'Todo el deporte, en datos', accent: 'en datos', tagline: 'Marcadores, estadísticas de equipos y jugadores y cuotas publicadas, guardados cada día en una base de datos que puedes explorar.' },
  football: { img: '/img/football.jpg', title: 'Fútbol: cada gol, cada dato', accent: 'cada dato', tagline: 'Posesión, tiros, tarjetas y alineaciones de las ligas que seguimos, partido a partido.' },
  basketball: { img: '/img/basketball.jpg', title: 'Baloncesto: la cancha en números', accent: 'en números', tagline: 'Boxscores completos, rebotes, asistencias y rendimiento de cada jugador.' },
  tennis: { img: '/img/tennis.jpg', title: 'Tenis: set a set', accent: 'set a set', tagline: 'Resultados por sets y torneos de ATP y WTA, tal como se publican.' },
  nfl: { img: '/img/nfl.jpg', title: 'Fútbol americano: yarda a yarda', accent: 'yarda a yarda', tagline: 'Marcadores, estadísticas de equipo y clasificaciones de la NFL.' },
  baseball: { img: '/img/stadium.jpg', title: 'Béisbol: entrada por entrada', accent: 'entrada por entrada', tagline: 'Líneas por entradas, estadísticas y clasificaciones de las Grandes Ligas.' },
  hockey: { img: '/img/night.jpg', title: 'Hockey: periodo a periodo', accent: 'periodo a periodo', tagline: 'Resultados y estadísticas de la NHL guardados día a día.' },
};
export const themeOf = (sport: string) => THEMES[sport] ?? THEMES[''];
