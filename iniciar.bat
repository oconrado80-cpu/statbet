@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo === StatBet ===
where node >nul 2>nul || (echo Instala Node.js 20 o superior desde https://nodejs.org y vuelve a abrir este archivo. & pause & exit /b 1)
echo Cerrando versiones anteriores de StatBet si las hay...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000 " ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>nul
echo Preparando (la primera vez tarda unos minutos)...
call npm install || (pause & exit /b 1)
call npm run build || (pause & exit /b 1)
echo.
echo Iniciando en http://localhost:3000  (cierra esta ventana para apagarlo)
echo La primera vez descarga los ultimos 21 dias de partidos en segundo plano.
start "" cmd /c "timeout /t 8 /nobreak >nul & start http://localhost:3000"
call npm start
pause
