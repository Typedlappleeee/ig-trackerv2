@echo off
title IG Tracker
color 0A
echo.
echo  =============================================
echo   IG Tracker — Lancement direct
echo  =============================================
echo.

echo  [..] Verification de Python...
python --version >nul 2>&1
if errorlevel 1 (
    echo  [ERREUR] Python n'est pas installe ou pas dans le PATH.
    echo  Telecharge Python sur https://www.python.org/downloads/
    pause
    exit /b 1
)

echo  [..] Installation des dependances...
pip install -r requirements_desktop.txt --quiet

echo  [OK] Lancement de l'application...
echo.
python app.py

pause
