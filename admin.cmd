@echo off
rem 双击这个 = 起管理端（http://localhost:4321/keystatic），起好了自动开浏览器。
rem 已经有一台在跑而且探着是好的就直接复用，不重起；坏了会告诉你是哪一种坏。
rem 要强制重来（杀掉旧的 + 删依赖缓存）双击 admin-restart.cmd。
rem
rem ⚠ 关掉这个窗口未必等于停掉服务：astro 在某些情况下会自己转后台常驻。
rem   屏幕最后一行会说清楚是哪一种。后台那一档要停就跑：pnpm exec astro dev stop
chcp 65001 >nul
cd /d "%~dp0"
call pnpm admin %*
echo.
pause
