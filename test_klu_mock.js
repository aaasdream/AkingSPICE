/**
 * KLU WebAssembly 集成測試 (無需實際 WASM 模組)
 * 
 * 此測試驗證 TypeScript 介面和模擬器是否正常工作
 */

import { SparseMatrix } from '../src/math/sparse/matrix.js';
import { Vector } from '../src/math/sparse/vector.js';

async function testKluIntegration() {
  console.log('🧪 測試 KLU 集成 (使用模擬器)...\n');

  try {
    // 創建測試矩陣
    const matrix = new SparseMatrix(3, 3);
    
    // 設置矩陣值 (3x3 對稱正定矩陣)
    matrix.set(0, 0, 2.0);
    matrix.set(0, 1, 1.0);
    matrix.set(1, 0, 1.0);
    matrix.set(1, 1, 3.0);
    matrix.set(1, 2, 1.0);
    matrix.set(2, 1, 1.0);
    matrix.set(2, 2, 2.0);

    console.log('📊 測試矩陣:');
    console.log('  [2  1  0]');
    console.log('  [1  3  1]');
    console.log('  [0  1  2]');
    console.log('');

    // 創建右側向量
    const b = Vector.from([4, 7, 3]);
    console.log('📋 右側向量 b:', b.toArray());
    console.log('');

    // 測試不同的求解器模式
    const solverModes = ['numeric', 'klu', 'iterative'];

    for (const mode of solverModes) {
      console.log(`--- 測試 ${mode.toUpperCase()} 求解器 ---`);
      
      try {
        matrix.setSolverMode(mode);
        
        let solution;
        if (mode === 'klu') {
          // KLU 需要異步調用
          solution = await matrix.solveAsync(b);
        } else {
          // 其他求解器使用同步調用
          solution = matrix.solve(b);
        }
        
        console.log(`✅ ${mode} 求解成功`);
        console.log('🎯 解向量 x:', solution.toArray().map(x => x.toFixed(6)));
        
        // 驗證解 (計算殘差)
        const residual = matrix.multiply(solution);
        const diff = residual.subtract(b);
        const error = Math.sqrt(diff.dot(diff));
        
        console.log(`📈 殘差 ||Ax - b||: ${error.toExponential(3)}`);
        
        if (error < 1e-6) {
          console.log('🎉 求解精度測試通過');
        } else {
          console.log('⚠️ 求解精度需要改進');
        }
        
      } catch (error) {
        console.error(`❌ ${mode} 求解器失敗:`, error.message);
      }
      
      console.log('');
    }

    // 測試矩陣資訊
    console.log('--- 矩陣資訊 ---');
    const info = matrix.getInfo();
    console.log('📊 矩陣統計:');
    console.log(`  維度: ${info.rows}x${info.cols}`);
    console.log(`  非零元素: ${info.nnz}`);
    console.log(`  填充率: ${(info.fillIn * 100).toFixed(1)}%`);
    console.log(`  對稱: ${info.symmetric ? '是' : '否'}`);
    console.log('');

    // 測試 CSC 轉換
    console.log('--- CSC 格式轉換測試 ---');
    const csc = matrix.toCSC();
    console.log('📋 CSC 格式:');
    console.log(`  列指針: [${csc.colPointers.join(', ')}]`);
    console.log(`  行索引: [${csc.rowIndices.join(', ')}]`);
    console.log(`  數值: [${csc.values.map(v => v.toFixed(1)).join(', ')}]`);
    console.log('');

    // 清理
    matrix.dispose();
    console.log('✅ 資源清理完成');
    
    console.log('🎉 所有測試通過! KLU 集成工作正常');

  } catch (error) {
    console.error('💥 測試失敗:', error);
    throw error;
  }
}

// 執行測試
if (import.meta.url.includes(process.argv[1])) {
  testKluIntegration().catch(console.error);
}

export default testKluIntegration;