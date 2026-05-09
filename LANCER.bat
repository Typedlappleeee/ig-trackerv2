@echo off
title IG Tracker
color 0A
echo.
echo  =============================================
echo   IG Tracker -- Lancement direct
echo  =============================================
echo.

echo  [..] Verification de Python...

:: Essaie py (launcher Windows), puis python, puis python3
set PYTHON=
py --version >nul 2>&1
if not errorlevel 1 (set PYTHON=py & goto :found)
python --version >nul 2>&1
if not errorlevel 1 (set PYTHON=python & goto :found)
python3 --version >nul 2>&1
if not errorlevel 1 (set PYTHON=python3 & goto :found)

echo  [ERREUR] Python n'est pas installe ou pas dans le PATH.
echo  Telecharge Python sur https://www.python.org/downloads/
echo  Important : coche "Add Python to PATH" pendant l'installation !
pause
exit /b 1

:found
echo  [OK] Python trouve : %PYTHON%
echo.

echo  [..] Installation des dependances...
%PYTHON% -m pip install -r requirements_desktop.txt --quiet

echo  [OK] Lancement de l'application...
echo.
%PYTHON% app.py

pause
