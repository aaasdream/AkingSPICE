/**
 * 🧪 KLU 集成測試 - 簡單驗證
 * 測試新的異步 SparseMatrix.solve() 方法
 */

import { SparseMatrix } from '../src/math/sparse/matrix.js';
import { Vector } from '../src/math/sparse/vector.js';

async function testKLUIntegration() {
  console.log('🚀 開始測試 KLU 集成...');
  
  try {
    // 創建一個簡單的 3x3 測試矩陣
    const matrix = new SparseMatrix(3, 3);
    
    // 設置一個對角主導矩陣
    matrix.set(0, 0, 2.0);
    matrix.set(0, 1, -1.0);
    matrix.set(1, 0, -1.0);
    matrix.set(1, 1, 2.0);
    matrix.set(1, 2, -1.0);
    matrix.set(2, 1, -1.0);
    matrix.set(2, 2, 2.0);
    
    // 創建右側向量
    const rhs = Vector.from([1.0, 2.0, 3.0]);
    
    console.log('📊 測試矩陣:');
    console.log('   大小:', matrix.rows, 'x', matrix.cols);
    console.log('   非零元素:', matrix.nnz);
    
    // 測試異步求解
    console.log('🧮 調用異步求解器...');
    const startTime = performance.now();
    const solution = await matrix.solve(rhs);
    const solveTime = performance.now() - startTime;
    
    console.log('✅ 求解完成!');
    console.log('   求解時間:', solveTime.toFixed(2), 'ms');
    console.log('   解向量大小:', solution.size);
    console.log('   解:', [solution.get(0), solution.get(1), solution.get(2)]);
    
    // 驗證解的合理性 (簡單檢查)
    const residual = matrix.multiply(solution);
    let maxError = 0;
    for (let i = 0; i < rhs.size; i++) {
      const error = Math.abs(residual.get(i) - rhs.get(i));
      maxError = Math.max(maxError, error);
    }
    
    console.log('   最大殘差:', maxError.toExponential(2));
    
    if (maxError < 1e-6) {
      console.log('🎉 測試通過 - KLU 集成架構正常工作!');
    } else {
      console.log('⚠️ 解精度較低，可能需要改進求解器');
    }
    
    // 測試資源清理
    matrix.dispose();
    console.log('♻️ 資源清理完成');
    
  } catch (error) {
    console.error('❌ 測試失敗:', error);
  }
}

// 運行測試
testKLUIntegration();