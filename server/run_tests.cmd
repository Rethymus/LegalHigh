@echo off
rem LegalHigh 测试统一入口（锁定 server/.venv，消除裸 Python 缺依赖的入口歧义）
cd /d "%~dp0"
.venv\Scripts\python.exe -m pytest tests %*
