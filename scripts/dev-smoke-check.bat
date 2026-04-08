@echo off
setlocal EnableExtensions
REM 저장소 루트 = 이 배치 파일의 상위 폴더 (scripts\..)
set "ROOT=%~dp0.."

echo == [1/3] Backend: python -m pytest -q ==
pushd "%ROOT%\backend" || exit /b 1
python -m pytest -q
if errorlevel 1 popd & exit /b 1
popd

echo.
echo == [2/3] Frontend: npm test ==
pushd "%ROOT%\frontend" || exit /b 1
call npm test
if errorlevel 1 popd & exit /b 1

echo.
echo == [3/3] Frontend: npm run build ==
call npm run build
if errorlevel 1 popd & exit /b 1
popd

echo.
echo All automated checks finished successfully.
exit /b 0
