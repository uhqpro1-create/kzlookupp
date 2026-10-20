@echo off
title OsSearch - Local Launcher
set CLS=
cls
echo [!] Verification des dependances...
if not exist node_modules (
    echo [!] node_modules manquant. Installation en cours...
    call npm install
)

echo.
echo [1] Demarrer le Serveur + Bot + Ouvrir le site (http://localhost:26005)
echo [2] Demarrer le Serveur Web (Seul)
echo [3] Demarrer le Bot Discord (Seul)
echo [4] Installer/Mettre a jour les dependances
echo [5] Quitter
echo.
set /p opt="Selectionnez une option : "

if "%opt%"=="1" (
    echo [+] Lancement du Serveur et du Bot...
    start cmd /k "title OsSearch-WEB && npm run dev"
    start cmd /k "title OsSearch-BOT && npm run bot"
    echo [+] Ouverture du site dans le navigateur...
    timeout /t 3 /nobreak >nul
    start http://localhost:26005
    exit
)
if "%opt%"=="2" (
    echo [+] Lancement du Serveur Web...
    start http://localhost:26005
    npm run dev
    pause
)
if "%opt%"=="3" (
    echo [+] Lancement du Bot Discord...
    npm run bot
    pause
)
if "%opt%"=="4" (
    echo [+] Installation des dependances...
    call npm install
    echo [+] Termine.
    pause
    goto cls
)
if "%opt%"=="5" exit

goto cls
