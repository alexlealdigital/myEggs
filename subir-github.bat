@echo off
setlocal EnableDelayedExpansion
title myEggs - subir para o GitHub
cd /d "%~dp0"

set "REPO=https://github.com/alexlealdigital/myEggs.git"

echo ================================================
echo  myEggs - enviando para o GitHub
echo  Pasta: %CD%
echo ================================================
echo.

where git >nul 2>&1
if errorlevel 1 (
    echo *** Git nao encontrado. Instale em https://git-scm.com e rode de novo. ***
    pause
    exit /b 1
)

git config user.email >nul 2>&1
if errorlevel 1 (
    echo *** Git sem identidade configurada. Rode uma vez no CMD: ***
    echo     git config --global user.name "Alex Leal"
    echo     git config --global user.email "seu-email@exemplo.com"
    pause
    exit /b 1
)

if exist "backend\.env" (
    echo Aviso: backend\.env existe e NAO sera enviado ^(esta no .gitignore^).
    echo.
)

echo [1/4] Conferindo o repositorio local...
if not exist ".git" (
    git init
    git branch -M main
)
git remote get-url origin >nul 2>&1
if errorlevel 1 (
    git remote add origin %REPO%
) else (
    git remote set-url origin %REPO%
)
echo OK.
echo.

echo [2/4] Atualizando a versao do cache do PWA...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$f='frontend\sw.js'; $s=[IO.File]::ReadAllText($f); $v='myeggs-' + (Get-Date -Format 'yyyyMMdd-HHmmss'); $s=[regex]::Replace($s,'myeggs-v[0-9A-Za-z-]*|myeggs-[0-9]{8}-[0-9]{6}',$v); [IO.File]::WriteAllText($f,$s,(New-Object Text.UTF8Encoding($false))); Write-Host ('Versao: ' + $v)"
echo.

echo [3/4] Registrando as mudancas...
set "MSG="
set /p "MSG=Mensagem do commit (Enter = padrao): "
if "!MSG!"=="" set "MSG=atualizacao myEggs %date% %time:~0,5%"
git add -A
git commit -m "!MSG!"
if errorlevel 1 echo ^(Nada novo para commitar - seguindo para o push.^)
echo.

echo [4/4] Enviando para o GitHub...
git push -u origin main
if errorlevel 1 (
    echo.
    echo *** O push foi recusado. ***
    echo Normalmente acontece quando o repositorio no GitHub tem arquivos
    echo que nao estao aqui ^(ex.: README criado pelo site^).
    choice /c SN /m "Sobrescrever o GitHub com esta pasta (push --force)"
    if errorlevel 2 goto fim
    git push -u origin main --force
)

:fim
echo.
echo ================================================
echo  CONCLUIDO. Confira acima: o push deve terminar
echo  com "main -> main". Render e Netlify publicam
echo  sozinhos em 1-3 minutos.
echo ================================================
pause
