@echo off
setlocal
set "BACKEND=%~dp0backend_NeuroRobi-main\neurorobi_backend"
set "FRONTEND=%~dp0fronted_NeuroRobi-main\neurorobi_fronted"

if not exist "%BACKEND%\.env" (
    echo Configura primero el archivo .env del backend. Consulta README.md.
    exit /b 1
)
if not exist "%BACKEND%\dist\services\api-gateway\index.js" (
    echo Prepara primero el backend. Consulta README.md.
    exit /b 1
)
if not exist "%FRONTEND%\node_modules\.bin\vite.cmd" (
    echo Instala primero las dependencias del frontend. Consulta README.md.
    exit /b 1
)

curl.exe -fsS http://127.0.0.1:3001/health >nul 2>&1
if errorlevel 1 start "NeuroRobi Backend" /D "%BACKEND%" cmd /k npm.cmd run start:prod

echo Esperando al backend de NeuroRobi...
for /l %%I in (1,1,30) do (
    curl.exe -fsS --connect-timeout 1 --max-time 2 http://127.0.0.1:3001/health >nul 2>&1
    if not errorlevel 1 goto backend_ready
    ping.exe -n 2 127.0.0.1 >nul
)
echo El backend no responde en el puerto 3001. Revisa la ventana NeuroRobi Backend.
exit /b 1

:backend_ready
set "VITE_API_URL=http://127.0.0.1:3001"
set "VITE_WS_URL=http://127.0.0.1:3001"
curl.exe -fsS http://127.0.0.1:5173/ >nul 2>&1
if errorlevel 1 (
    start "NeuroRobi Frontend" /D "%FRONTEND%" cmd /k npm.cmd run dev -- --host 127.0.0.1 --strictPort --open
) else (
    start "" "http://127.0.0.1:5173/"
)
