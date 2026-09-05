@echo off
rem LegalHigh test entrypoint. Keep this batch file ASCII-only for cmd.exe.
cd /d "%~dp0"
.venv\Scripts\python.exe -m pytest tests %*
