# Cómo dejar StatBet en internet (siempre encendida)

Meta: que tu página tenga una dirección web (por ejemplo `https://statbet.onrender.com`) que cualquiera pueda abrir **aunque tu PC esté apagado**, y que siga descargando partidos y guardando datos sola.

Necesitas dos cuentas gratis (las creas tú, yo no puedo crearlas por ti): **GitHub** (guarda el código) y **Render** (lo mantiene encendido). Render cobra por tener la web siempre encendida con un disco para la base de datos: en el momento de escribir esto, el plan más bajo ronda los 7 USD al mes más unos centavos por el disco. Confirma el precio actual en https://render.com/pricing antes de pagar.

## Paso 1 — Subir el código a GitHub

1. Entra a https://github.com y crea tu cuenta (o inicia sesión).
2. Arriba a la derecha pulsa **+** → **New repository**.
3. Nombre: `statbet`. Elige **Public** (o Private si no quieres que vean el código). Pulsa **Create repository**.
4. En la página que aparece pulsa el enlace **uploading an existing file**.
5. Abre la carpeta **`statbet-para-github`** (está en `C:\Users\Public\Documents\`). Selecciona **todo lo que hay dentro** y arrástralo a la ventana del navegador. Espera a que termine de subir.
6. Abajo pulsa **Commit changes**.

> No subas la carpeta `statbet` de trabajo: tiene `node_modules` y la base de datos (miles de archivos y 120 MB). La carpeta `statbet-para-github` ya está limpia.

## Paso 2 — Publicarla en Render

1. Entra a https://render.com y crea tu cuenta con el botón **Sign in with GitHub**.
2. Pulsa **New +** → **Blueprint**.
3. Elige tu repositorio `statbet` (te pedirá permiso para verlo: acéptalo).
4. Render lee el archivo `render.yaml` y te muestra el servicio **statbet** con un disco de 2 GB. Si te pide una clave `GEMINI_API_KEY`, pégala (opcional; si no la tienes, déjala vacía).
5. Pulsa **Apply** / **Deploy**. Render te pedirá una tarjeta para el plan de pago. Ese paso lo haces tú.
6. Espera 5–10 minutos. Cuando diga **Live**, arriba verás tu dirección, algo como `https://statbet-xxxx.onrender.com`. **Esa es la dirección que compartes.**

La primera vez, el servidor baja solo los últimos 30 días de partidos (tarda unos minutos y la web ya responde mientras tanto). Desde ahí sigue funcionando 24 horas: descarga partidos en vivo, guarda estadísticas y la base de datos crece.

## Paso 3 — Cuando cambies algo
Si subes archivos nuevos a GitHub, Render se actualiza solo. La base de datos vive en el disco de Render y no se borra al actualizar.

## ¿Y los datos que ya tengo en mi PC?
Tu historial local (`data\statbet.db`) no viaja solo. No hace falta: el servidor reconstruye los últimos 30 días. Si quieres llevarte el historial completo, dímelo y lo preparamos aparte.

## Alternativa: Fly.io
También está lista la configuración `fly.toml` (servidor en Bogotá). Requiere instalar su programa `flyctl` y escribir comandos; Render es más fácil.

## Seguridad básica ya incluida
- La consola SQL está apagada por defecto (solo se activa con `ENABLE_SQL_CONSOLE=true`).
- Límite de peticiones por IP y cabeceras de seguridad.
- La clave de Gemini va en las variables de Render, nunca dentro del código.
