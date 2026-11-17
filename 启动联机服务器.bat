@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul || (echo 未检测到 Node.js，请先安装：https://nodejs.org & pause & exit /b)
echo 正在启动 PYRAMID CHAOS 联机服务器...
node server.js
pause
