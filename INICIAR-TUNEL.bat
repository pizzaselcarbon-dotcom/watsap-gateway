@echo off
chcp 65001 >nul
title Tunel de WhatsApp (no cierres esta ventana)
cd /d "%~dp0"
if not exist cloudflared.exe (
  echo Falta cloudflared.exe en esta carpeta.
  echo Descargalo de: https://github.com/cloudflare/cloudflared/releases/latest
  echo Busca el archivo  cloudflared-windows-amd64.exe , ponlo aqui y renombralo a  cloudflared.exe
  pause
  exit /b
)
echo.
echo Busca abajo la direccion que termina en  .trycloudflare.com  y copiala al POS ^(Ajustes ^> Conexion directa de WhatsApp^).
echo Esa direccion cambia cada vez que reinicias este tunel.
echo.
cloudflared.exe tunnel --url http://localhost:3000
pause
