@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Digest 沉淀 - 本地启动器

echo ============================================
echo    Digest 沉淀 - 本地启动器
echo ============================================
echo.
echo  正在启动本地服务器并打开浏览器...
echo  关闭本窗口即可停止服务器。
echo.

rem 2 秒后自动打开浏览器（给服务器留出启动时间）
start "" /b cmd /c "timeout /t 2 >nul & start "" http://127.0.0.1:5180/"

rem 优先用 python，找不到再尝试 py 启动器
where python >nul 2>nul
if %errorlevel%==0 (
    python -m http.server 5180
) else (
    where py >nul 2>nul
    if %errorlevel%==0 (
        py -m http.server 5180
    ) else (
        echo.
        echo [错误] 未检测到 Python。请先安装 Python 3，或改用其它本地服务器。
        echo 安装地址：https://www.python.org/downloads/
        echo.
        pause
    )
)
