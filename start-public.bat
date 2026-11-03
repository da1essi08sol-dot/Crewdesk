@echo off
title Crewdesk public link
where cloudflared >nul 2>nul || (echo cloudflared is not installed. Run:  winget install --id Cloudflare.cloudflared & pause & exit /b)
echo Keep this window open. Send your crew the https://....trycloudflare.com link shown below.
cloudflared tunnel --url http://localhost:3000
pause
