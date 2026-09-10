@echo off
REM Script batch para criar atalho na área de trabalho
REM Uso: criar-atalho.bat [dev]

setlocal enabledelayedexpansion

if "%1"=="dev" (
    echo Criando atalho em modo DEV...
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0criar-atalho.ps1" -Dev
) else (
    echo Criando atalho em modo PRODUCAO...
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0criar-atalho.ps1"
)

if %errorlevel% equ 0 (
    echo.
    echo Atalho criado com sucesso!
    pause
) else (
    echo.
    echo Erro ao criar atalho. Verifique as mensagens acima.
    pause
)
