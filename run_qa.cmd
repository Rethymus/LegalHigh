@echo off
REM ============================================================
REM LegalHigh long-cycle QA gates (docs/plan/v3 polish plan, section 1.2;
REM gate 6 motion probe added 2026-09-06 per docs/plan v4 Apple polish plan)
REM gate 7 a11y probe added 2026-09-13 per docs/plan v5 roadmap (S2-T3, WCAG 2.2 AA subset)
REM Prereq: dev servers running (uvicorn :8000 + vite :5173) for gates 5-6.
REM         For the sweep, start uvicorn with LH_ADMIN_TOKEN + LH_ADMIN_PRINCIPAL set,
REM         and export the same LH_ADMIN_TOKEN so qa_shots can inject it (sensitive
REM         endpoints fail closed 503 without it - by design, not a tool defect).
REM Usage:  run_qa.cmd        run all 7 gates
REM         run_qa.cmd fast   skip visual sweep and motion probe (run the other four gates)
REM NOTE: keep this file ASCII-only; cmd.exe parses batch files in the ANSI codepage.
REM ============================================================
setlocal
cd /d %~dp0
set FAILED=0

echo [1/7] server pytest ...
cd server
.venv\Scripts\python.exe -m pytest tests -q
if errorlevel 1 set FAILED=1
cd ..

echo [2/7] web tsc + vite build ...
cd web
call npm run build
if errorlevel 1 set FAILED=1

echo [3/7] data-discipline grep gate ...
node scripts/qa_gates.mjs
if errorlevel 1 set FAILED=1

echo [4/7] WCAG contrast audit (tokens from global.css, --strict) ...
node scripts/qa_contrast.mjs --strict
if errorlevel 1 set FAILED=1

if /i "%1"=="fast" goto :summary
echo [5/7] read-only visual sweep (--strict; needs ports 8000/5173 up) ...
node scripts/qa_shots.mjs --strict
if errorlevel 1 set FAILED=1

echo [6/7] motion behavior probe (spring physics in headless Chrome; needs vite up) ...
node scripts/qa_motion.mjs --strict
if errorlevel 1 set FAILED=1

echo [7/7] a11y behavior probe (WCAG 2.2 AA subset: target size / focus not obscured; needs vite up) ...
node scripts/qa_a11y.mjs --strict
if errorlevel 1 set FAILED=1

:summary
cd /d %~dp0
if %FAILED%==1 (
  echo.
  echo QA GATE FAILED
  exit /b 1
)
echo.
if /i "%1"=="fast" (
  echo FAST QA GATES PASSED ^(VISUAL SWEEP AND MOTION PROBE NOT RUN^)
) else (
  echo ALL QA GATES PASSED
)
endlocal
