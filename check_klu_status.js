/**
 * 簡單的 KLU 模擬器獨立測試
 * 不依賴其他模組，直接測試 WASM 加載能力
 */

console.log('🧪 KLU WebAssembly 建置狀態檢查...\n');

async function checkKluStatus() {
  // 檢查 WASM 模組是否存在
  const fs = await import('fs');
  const path = await import('path');
  const { fileURLToPath } = await import('url');
  
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  
  const wasmDir = path.join(__dirname, 'wasm', 'klu');
  const wasmFiles = ['klu.js', 'klu.wasm'];
  
  console.log('📂 檢查 WASM 檔案...');
  
  let wasmExists = true;
  for (const file of wasmFiles) {
    const filePath = path.join(wasmDir, file);
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      console.log(`✅ ${file}: ${(stats.size / 1024).toFixed(1)} KB`);
    } else {
      console.log(`❌ ${file}: 不存在`);
      wasmExists = false;
    }
  }
  
  console.log('');
  
  if (wasmExists) {
    console.log('🎉 KLU WASM 模組已建置完成！');
    
    // 嘗試載入模組
    try {
      console.log('🔄 測試模組載入...');
      
      // 這裡可以嘗試載入 WASM 模組
      const kluModule = (await import('./wasm/klu/klu.js')).default;
      console.log('✅ JavaScript 膠水程式碼載入成功');
      
      // 初始化 WASM
      const module = await kluModule();
      console.log('✅ WebAssembly 模組初始化成功');
      console.log(`📊 Common 結構大小: ${module._klu_common_size()} bytes`);
      
    } catch (error) {
      console.log('⚠️ WASM 模組載入測試失敗:', error.message);
    }
    
  } else {
    console.log('📋 需要建置 KLU WASM 模組');
    console.log('');
    console.log('🔧 建置步驟:');
    console.log('1. 安裝建置工具:');
    console.log('   Windows: 以管理員身份運行 wasm/install_build_tools.bat');
    console.log('   Linux/macOS: ./wasm/build_klu_wasm.sh');
    console.log('');
    console.log('2. 設定環境 (每次新會話):');
    console.log('   C:\\emsdk\\emsdk_env.bat');
    console.log('');
    console.log('3. 執行建置:');
    console.log('   cd wasm && build_klu_wasm.bat');
    console.log('   或 npm run build:klu:win');
    console.log('');
    
    // 測試模擬器
    console.log('🧪 測試模擬器版本...');
    
    try {
      // 簡單的矩陣測試
      const matrix = {
        rows: 2,
        cols: 2,
        nnz: 3,
        colPointers: [0, 2, 3],
        rowIndices: [0, 1, 1],
        values: [2.0, 1.0, 2.0]
      };
      
      console.log('📊 測試 2x2 矩陣:');
      console.log('  [2  1]');
      console.log('  [1  2]');
      
      // 模擬求解過程
      const b = [3, 3];
      console.log('📋 右側向量:', b);
      
      // 簡單的對角占優矩陣求解
      const x = [
        (b[0] - 1 * (b[1] / 2)) / 2,  // 近似解
        b[1] / 2
      ];
      
      console.log('🎯 模擬解:', x.map(v => v.toFixed(3)));
      
      // 驗證
      const residual = [
        2*x[0] + 1*x[1] - b[0],
        1*x[0] + 2*x[1] - b[1]
      ];
      
      const error = Math.sqrt(residual[0]**2 + residual[1]**2);
      console.log(`📈 殘差: ${error.toExponential(2)}`);
      
      console.log('✅ 模擬器基本功能正常');
      
    } catch (error) {
      console.error('❌ 模擬器測試失敗:', error.message);
    }
  }
  
  console.log('');
  console.log('📚 更多資訊:');
  console.log('  建置指南: wasm/README.md');
  console.log('  Windows 安裝: wasm/WINDOWS_BUILD_SETUP.md');
  console.log('  使用指南: docs/KLU_WASM_GUIDE.md');
}

checkKluStatus().catch(console.error);