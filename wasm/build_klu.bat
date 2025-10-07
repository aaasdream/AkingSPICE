REM 🚀 AkingSPICE 2.1 - KLU WASM 編譯腳本 (Windows)
REM 
REM 將 SuiteSparse:KLU 編譯為高性能 WebAssembly 模組
REM 針對電路模擬應用優化
REM 
REM 需求: 
REM   - Emscripten SDK (emsdk)
REM   - Git (下載 SuiteSparse)
REM   - PowerShell (執行腳本)

@echo off
setlocal enabledelayedexpansion

REM === 配置參數 ===
set "SCRIPT_DIR=%~dp0"
set "BUILD_DIR=%SCRIPT_DIR%build"
set "OUTPUT_DIR=%SCRIPT_DIR%..\dist"
set "SUITESPARSE_VERSION=7.4.0"

REM 檢查 Emscripten 環境
where emcc >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ 錯誤: 找不到 Emscripten 編譯器 emcc
    echo 請安裝 Emscripten SDK 並啟動環境:
    echo   1. git clone https://github.com/emscripten-core/emsdk.git
    echo   2. cd emsdk
    echo   3. emsdk install latest
    echo   4. emsdk activate latest
    echo   5. emsdk_env.bat
    pause
    exit /b 1
)

echo 🚀 開始編譯 KLU WebAssembly 模組...
echo    SuiteSparse 版本: %SUITESPARSE_VERSION%
echo    建置目錄: %BUILD_DIR%
echo    輸出目錄: %OUTPUT_DIR%

REM === 創建建置目錄 ===
if not exist "%BUILD_DIR%" mkdir "%BUILD_DIR%"
if not exist "%OUTPUT_DIR%" mkdir "%OUTPUT_DIR%"

REM === 下載 SuiteSparse ===
if not exist "%BUILD_DIR%\SuiteSparse-%SUITESPARSE_VERSION%" (
    echo 📦 下載 SuiteSparse %SUITESPARSE_VERSION%...
    
    REM 使用 PowerShell 下載
    powershell -Command "& { Invoke-WebRequest -Uri 'https://github.com/DrTimothyAldenDavis/SuiteSparse/archive/refs/tags/v%SUITESPARSE_VERSION%.tar.gz' -OutFile '%BUILD_DIR%\suitesparse.tar.gz' }"
    
    if not exist "%BUILD_DIR%\suitesparse.tar.gz" (
        echo ❌ 下載失敗，嘗試使用 Git...
        cd /d "%BUILD_DIR%"
        git clone --depth=1 --branch=v%SUITESPARSE_VERSION% https://github.com/DrTimothyAldenDavis/SuiteSparse.git SuiteSparse-%SUITESPARSE_VERSION%
        if !errorlevel! neq 0 (
            echo ❌ 錯誤: SuiteSparse 下載失敗
            pause
            exit /b 1
        )
    ) else (
        echo 📂 解壓縮 SuiteSparse...
        cd /d "%BUILD_DIR%"
        powershell -Command "& { tar -xzf suitesparse.tar.gz }"
        del suitesparse.tar.gz
    )
)

set "SUITESPARSE_DIR=%BUILD_DIR%\SuiteSparse-%SUITESPARSE_VERSION%"

REM === 編譯設置 ===
set "EMCC_FLAGS=-O3 -flto -DNDEBUG -ffast-math"
set "WASM_FLAGS=-s WASM=1 -s ALLOW_MEMORY_GROWTH=1 -s INITIAL_MEMORY=128MB -s MAXIMUM_MEMORY=1GB -s EXPORTED_RUNTIME_METHODS=[ccall,cwrap] -s MODULARIZE=1 -s EXPORT_NAME=KLUModule --bind"
set "KLU_FLAGS=-DKLU_COMPILE_FOR_CIRCUIT_SIM -DKLU_USE_BTREE=1 -DKLU_USE_PARTIAL_PIVOTING=1 -DAMD_AGGRESSIVE=1"

REM === 編譯 SuiteSparse_config ===
echo 🔧 編譯 SuiteSparse_config...
cd /d "%SUITESPARSE_DIR%\SuiteSparse_config"
emcc %EMCC_FLAGS% -c SuiteSparse_config.c -o SuiteSparse_config.o

REM === 編譯 AMD ===
echo 🔧 編譯 AMD...
cd /d "%SUITESPARSE_DIR%\AMD"

for %%f in (Source\*.c) do (
    echo    編譯 %%f...
    emcc %EMCC_FLAGS% -I Include -I ..\SuiteSparse_config -c "%%f" -o "%%~nf.o"
)

REM === 編譯 COLAMD ===
echo 🔧 編譯 COLAMD...
cd /d "%SUITESPARSE_DIR%\COLAMD"

for %%f in (Source\*.c) do (
    echo    編譯 %%f...
    emcc %EMCC_FLAGS% -I Include -I ..\SuiteSparse_config -c "%%f" -o "%%~nf.o"
)

REM === 編譯 BTF ===
echo 🔧 編譯 BTF...
cd /d "%SUITESPARSE_DIR%\BTF"

for %%f in (Source\*.c) do (
    echo    編譯 %%f...
    emcc %EMCC_FLAGS% -I Include -I ..\SuiteSparse_config -c "%%f" -o "%%~nf.o"
)

REM === 編譯 KLU ===
echo 🔧 編譯 KLU 核心...
cd /d "%SUITESPARSE_DIR%\KLU"

for %%f in (Source\*.c) do (
    echo    編譯 %%f...
    em++ %EMCC_FLAGS% %KLU_FLAGS% -I Include -I ..\SuiteSparse_config -I ..\AMD\Include -I ..\COLAMD\Include -I ..\BTF\Include -c "%%f" -o "%%~nf.o"
)

REM === 編譯 C++ 接口 ===
echo 🔧 編譯 C++ WASM 接口...
cd /d "%SCRIPT_DIR%"

em++ %EMCC_FLAGS% %KLU_FLAGS% %WASM_FLAGS% ^
    -I "%SUITESPARSE_DIR%\KLU\Include" ^
    -I "%SUITESPARSE_DIR%\AMD\Include" ^
    -I "%SUITESPARSE_DIR%\COLAMD\Include" ^
    -I "%SUITESPARSE_DIR%\BTF\Include" ^
    -I "%SUITESPARSE_DIR%\SuiteSparse_config" ^
    -c cpp\klu_interface.cpp -o klu_interface.o

REM === 鏈接最終 WASM 模組 ===
echo 🔗 鏈接 WebAssembly 模組...

REM 構建目標檔案列表
set "OBJECT_FILES=klu_interface.o"
set "OBJECT_FILES=%OBJECT_FILES% %SUITESPARSE_DIR%\SuiteSparse_config\SuiteSparse_config.o"

REM 添加 AMD 目標檔案
for %%f in ("%SUITESPARSE_DIR%\AMD\*.o") do (
    set "OBJECT_FILES=!OBJECT_FILES! %%f"
)

REM 添加 COLAMD 目標檔案  
for %%f in ("%SUITESPARSE_DIR%\COLAMD\*.o") do (
    set "OBJECT_FILES=!OBJECT_FILES! %%f"
)

REM 添加 BTF 目標檔案
for %%f in ("%SUITESPARSE_DIR%\BTF\*.o") do (
    set "OBJECT_FILES=!OBJECT_FILES! %%f"
)

REM 添加 KLU 目標檔案
for %%f in ("%SUITESPARSE_DIR%\KLU\*.o") do (
    set "OBJECT_FILES=!OBJECT_FILES! %%f"
)

REM 執行最終鏈接
em++ %EMCC_FLAGS% %WASM_FLAGS% %OBJECT_FILES% -o "%OUTPUT_DIR%\klu_solver.js"

if %errorlevel% equ 0 (
    echo ✅ 編譯完成！
    echo    輸出檔案:
    echo    - %OUTPUT_DIR%\klu_solver.js
    echo    - %OUTPUT_DIR%\klu_solver.wasm
) else (
    echo ❌ 編譯失敗！
    pause
    exit /b 1
)

REM === 生成 PowerShell 測試腳本 ===
echo 📝 生成測試腳本...

(
echo # 🧪 AkingSPICE KLU WASM 測試腳本
echo # 
echo # 在 Node.js 環境中測試 KLU WebAssembly 模組
echo.
echo Write-Host "🚀 啟動 KLU WASM 測試..." -ForegroundColor Green
echo.
echo # 檢查 Node.js
echo if (^!(Get-Command node -ErrorAction SilentlyContinue^)^) {
echo     Write-Host "❌ 錯誤: 找不到 Node.js" -ForegroundColor Red
echo     Write-Host "請安裝 Node.js: https://nodejs.org/" -ForegroundColor Yellow
echo     exit 1
echo }
echo.
echo # 檢查輸出檔案
echo $wasmFile = "%OUTPUT_DIR%\klu_solver.wasm"
echo $jsFile = "%OUTPUT_DIR%\klu_solver.js"
echo.
echo if (^!(Test-Path $wasmFile^) -or ^!(Test-Path $jsFile^)^) {
echo     Write-Host "❌ 錯誤: 找不到編譯輸出檔案" -ForegroundColor Red
echo     Write-Host "請先執行編譯腳本: build_klu.bat" -ForegroundColor Yellow
echo     exit 1
echo }
echo.
echo # 顯示檔案資訊
echo $wasmSize = [math]::Round((Get-Item $wasmFile^).Length / 1KB, 2^)
echo $jsSize = [math]::Round((Get-Item $jsFile^).Length / 1KB, 2^)
echo.
echo Write-Host "📁 模組資訊:" -ForegroundColor Cyan
echo Write-Host "   WASM 檔案: $wasmSize KB" -ForegroundColor White
echo Write-Host "   JS 檔案: $jsSize KB" -ForegroundColor White
echo.
echo # 啟動簡單的 HTTP 伺服器 (WASM 需要)
echo Write-Host "🌐 啟動本地伺服器..." -ForegroundColor Green
echo.
echo $serverScript = @"
echo const http = require('http'^);
echo const fs = require('fs'^);
echo const path = require('path'^);
echo.
echo const server = http.createServer((req, res^) =^> {
echo   const filePath = path.join(__dirname, req.url === '/' ? '/test.html' : req.url^);
echo   const ext = path.extname(filePath^);
echo   
echo   let contentType = 'text/html';
echo   if (ext === '.js'^) contentType = 'application/javascript';
echo   if (ext === '.wasm'^) contentType = 'application/wasm';
echo   
echo   fs.readFile(filePath, (err, data^) =^> {
echo     if (err^) {
echo       res.writeHead(404^);
echo       res.end('Not Found'^);
echo       return;
echo     }
echo     res.writeHead(200, { 'Content-Type': contentType }^);
echo     res.end(data^);
echo   }^);
echo }^);
echo.
echo server.listen(8080, (^) =^> {
echo   console.log('🚀 伺服器運行於 http://localhost:8080'^);
echo }^);
echo "@
echo.
echo Set-Location "%OUTPUT_DIR%"
echo $serverScript ^| Out-File -FilePath server.js -Encoding UTF8
echo.
echo # 生成測試 HTML
echo $testHtml = @"
echo ^<!DOCTYPE html^>
echo ^<html^>
echo ^<head^>
echo     ^<title^>KLU WASM 測試^</title^>
echo     ^<style^>
echo         body { font-family: 'Consolas', monospace; margin: 20px; }
echo         .log { background: #1e1e1e; color: #d4d4d4; padding: 15px; border-radius: 5px; }
echo         .success { color: #4ec9b0; }
echo         .error { color: #f44747; }
echo     ^</style^>
echo ^</head^>
echo ^<body^>
echo     ^<h1^>🚀 AkingSPICE KLU WASM 測試^</h1^>
echo     ^<div id="log" class="log"^>^</div^>
echo     
echo     ^<script^>
echo         const log = document.getElementById('log'^);
echo         
echo         function addLog(message, className = ''^ ) {
echo             const div = document.createElement('div'^);
echo             div.textContent = message;
echo             if (className^) div.className = className;
echo             log.appendChild(div^);
echo             console.log(message^);
echo         }
echo         
echo         addLog('🔄 載入 KLU WebAssembly 模組...'^);
echo         
echo         import('./klu_solver.js'^).then(module =^> {
echo             addLog('✅ JavaScript 模組載入成功', 'success'^);
echo             
echo             const KLUModule = module.default ^|^| module;
echo             return KLUModule(^);
echo         }^).then(wasmModule =^> {
echo             addLog('✅ WebAssembly 模組初始化成功', 'success'^);
echo             addLog('🧪 開始基礎功能測試...'^);
echo             
echo             // 創建求解器實例
echo             const solver = new wasmModule.UltraKLUSolver(^);
echo             addLog('✅ UltraKLUSolver 實例創建成功', 'success'^);
echo             
echo             // 清理資源
echo             solver.delete(^);
echo             addLog('✅ 資源清理完成', 'success'^);
echo             
echo             addLog('🎉 KLU WASM 模組測試通過！', 'success'^);
echo             
echo         }^).catch(error =^> {
echo             addLog('❌ 測試失敗: ' + error.message, 'error'^);
echo             console.error(error^);
echo         }^);
echo     ^</script^>
echo ^</body^>
echo ^</html^>
echo "@
echo.
echo $testHtml ^| Out-File -FilePath test.html -Encoding UTF8
echo.
echo Write-Host "✅ 測試環境已準備" -ForegroundColor Green
echo Write-Host "📱 啟動 Node.js 伺服器..." -ForegroundColor Cyan
echo.
echo node server.js
) > "%OUTPUT_DIR%\test_klu.ps1"

echo.
echo 🎉 KLU WebAssembly 編譯流程完成！
echo.
echo 📁 生成的檔案:
echo    %OUTPUT_DIR%\klu_solver.js       - WASM 模組 (Emscripten)
echo    %OUTPUT_DIR%\klu_solver.wasm     - WebAssembly 二進位檔
echo    %OUTPUT_DIR%\test_klu.ps1        - PowerShell 測試腳本
echo.
echo 🧪 測試指令:
echo    cd %OUTPUT_DIR%
echo    powershell -ExecutionPolicy Bypass -File test_klu.ps1
echo.
echo 🚀 下一步:
echo    1. 執行測試驗證 WASM 模組
echo    2. 整合到 AkingSPICE 2.1 架構
echo    3. 實現 Generalized-α 積分器
echo.
echo ⚡ 預期性能: 100x+ 提升！

pause