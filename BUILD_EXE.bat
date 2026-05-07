@echo off
title IG Tracker — Build EXE
color 0A
echo.
echo  =============================================
echo   IG Tracker — Compilation en .exe
echo  =============================================
echo.

echo  [..] Installation de PyInstaller...
pip install pyinstaller --quiet

echo  [..] Installation des dependances...
pip install -r requirements_desktop.txt --quiet

echo  [..] Compilation en cours (peut prendre 1-2 minutes)...
pyinstaller --onefile --windowed --name "IG Tracker" --icon=NONE app.py

echo.
echo  [OK] EXE genere dans le dossier dist/
echo  [OK] Fichier : dist\IG Tracker.exe
echo.
pause
