@echo off
chcp 65001 >nul
title WhatsApp del POS (no cierres esta ventana)
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Falta instalar Node.js. Descargalo de https://nodejs.org ^(version LTS^), instalalo y vuelve a abrir este archivo.
  pause
  exit /b
)
if not exist config.json (
  echo Falta el archivo config.json. Copia config.ejemplo.json como config.json y editalo.
  pause
  exit /b
)
if not exist node_modules (
  echo Instalando por primera vez, espera un momento...
  call npm install --omit=dev --no-audit --no-fund
)
:inicio
echo.
echo === Servicio iniciado %date% %time% ===
node index.js
echo El servicio se detuvo. Reiniciando en 10 segundos... ^(cierra esta ventana para salir^)
timeout /t 10 >nul
goto inicio
