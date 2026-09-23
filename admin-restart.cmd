@echo off
rem 双击这个 = 强制重起管理端：杀掉端口 4321 上那台（只杀本项目的 astro dev）、
rem 删掉 node_modules/.vite、重新起一台。后台白屏、或者新建的稿子页面上不出现，用这个。
rem 端口上趴着的不是本项目的进程时它**不动手**，只把 PID 印出来让你自己决定。
rem
rem ⚠ 关掉这个窗口未必等于停掉服务：astro 在某些情况下会自己转后台常驻。
rem   屏幕最后一行会说清楚是哪一种。后台那一档要停就跑：pnpm exec astro dev stop
chcp 65001 >nul
cd /d "%~dp0"
call pnpm admin:restart %*
echo.
pause
