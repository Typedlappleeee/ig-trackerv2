@echo off
title IG Tracker — Build EXE
color 0A
echo.
echo  =============================================
echo   IG Tracker — Compilation en .exe
echo  =============================================
echo.

echo  [1/4] Installation des dependances...
pip install pyinstaller pillow httpx[socks] groq tkinterdnd2 --quiet

echo  [2/4] Generation de l'icone...
python make_icon.py
if not exist icon.ico (
    echo  [WARN] Icone non generee, compilation sans icone
    set ICON_FLAG=--icon=NONE
) else (
    set ICON_FLAG=--icon=icon.ico
)

echo  [3/4] Compilation en cours (1-2 minutes)...
pyinstaller ^
  --onefile ^
  --windowed ^
  --name "IG Tracker" ^
  %ICON_FLAG% ^
  --add-data "bank.json;." ^
  --add-data "data.json;." ^
  --add-data "config.json;." ^
  --hidden-import=PIL ^
  --hidden-import=PIL._imagingtk ^
  --hidden-import=PIL.ImageFont ^
  --hidden-import=groq ^
  --hidden-import=tkinterdnd2 ^
  app.py

echo.
if exist "dist\IG Tracker.exe" (
    echo  [OK] EXE genere avec succes !
    echo  [OK] Fichier : dist\IG Tracker.exe
    echo.
    echo  Pour distribuer, copie uniquement : dist\IG Tracker.exe
    echo  Les fichiers .json seront crees automatiquement au premier lancement.
) else (
    echo  [ERREUR] La compilation a echoue. Verifie les logs ci-dessus.
)
echo.

rem == Pour signer l'exe (requiert un certificat code-signing) ==
rem == Decommenter et adapter si tu as signtool.exe + un certificat ==
rem signtool sign /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 ^
rem   /f "ton_certificat.pfx" /p "mot_de_passe" "dist\IG Tracker.exe"
rem echo [OK] EXE signe.

pause
