@echo off
title myEggs - corrigir estrutura de pastas
cd /d "%~dp0"

if not exist ".git" (
    echo *** Rode este arquivo dentro da pasta myEggs ^(a mesma do subir-github.bat^). ***
    pause
    exit /b 1
)

echo [1/3] Restaurando arquivos que sumiram ^(versao do ultimo envio, sem alteracao^)...
git checkout -- frontend/index.html frontend/manifest.webmanifest frontend/assets/icons frontend/assets/lizards-games.png frontend/assets/sprites/ovo.png frontend/assets/sprites/alvo.png frontend/assets/sprites/alvo_acertado.png
if errorlevel 1 (
    echo *** Falhou ao restaurar. Nada foi apagado. Me mande a mensagem acima. ***
    pause
    exit /b 1
)

echo [2/3] Removendo as copias soltas fora do lugar...
if exist "frontend\ovo.png" del /q "frontend\ovo.png"
if exist "frontend\alvo.png" del /q "frontend\alvo.png"
if exist "frontend\alvo_acertado.png" del /q "frontend\alvo_acertado.png"
if exist "frontend\lizards-games.png" del /q "frontend\lizards-games.png"
if exist "frontend\icons" rmdir /s /q "frontend\icons"
if exist "{backend,frontend" rmdir /s /q "{backend,frontend"

echo [3/3] Situacao final ^(o esperado esta abaixo^):
echo.
git status --short
echo.
echo ------------------------------------------------
echo  Esperado: linhas M em config, game, style e sw ^(e talvez subir-github.bat, so quebra de linha^),
echo  1 linha D ^(eggs_03.mp3^) e 5 linhas ?? ^(eggs_06,
echo  eggs_07, aviao, figurante_dir, figurante_esq^).
echo  Se bater, rode o subir-github.bat.
echo ------------------------------------------------
pause
