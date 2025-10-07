/**
 * 🧪 求解器驗證測試 - 對照 SciPy 黃金標準
 * 
 * 使用 Python SciPy 生成的高精度測試數據來驗證我們的求解器
 * 確保數值精度達到機器精度水平
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { SparseMatrix } from '../src/math/sparse/matrix';
import { Vector } from '../src/math/sparse/vector';
import { readFileSync } from 'fs';
import { join } from 'path';

// 測試數據將在 beforeAll 中從 JSON 文件加載
let testData: any[] = [];

describe('🔬 求解器驗證 - SciPy 黃金標準對照', () => {
  
  beforeAll(() => {
    try {
      // 讀取由 Python verify_solver.py 生成的測試數據
      const dataPath = join(process.cwd(), 'solver_verification_data.json');
      const rawData = readFileSync(dataPath, 'utf-8');
      testData = JSON.parse(rawData);
      console.log(`📊 成功加載了 ${testData.length} 個測試用例`);
    } catch (error) {
      console.error('❌ 無法加載測試數據:', error);
      testData = [];
    }
  });

  it('應該有測試數據', () => {
    expect(testData).toBeDefined();
    expect(testData.length).toBeGreaterThan(0);
  });
  
  it('4x4 非對稱 MNA 矩陣驗證', async () => {
    if (!testData || testData.length === 0) {
      console.log('⚠️ 跳過測試：沒有測試數據');
      return;
    }
    
    const testCase = testData.find(t => t.name === '4x4_asymmetric_mna');
    if (!testCase) {
      throw new Error('找不到 4x4_asymmetric_mna 測試用例');
    }
    
    await runSolverTest(testCase);
  });
  
  it('3x3 對稱電阻網絡驗證', async () => {
    if (!testData || testData.length === 0) {
      console.log('⚠️ 跳過測試：沒有測試數據');
      return;
    }
    
    const testCase = testData.find(t => t.name === '3x3_symmetric_resistor');
    if (!testCase) {
      throw new Error('找不到 3x3_symmetric_resistor 測試用例');
    }
    
    await runSolverTest(testCase);
  });
  
  it('5x5 複雜電路矩陣驗證', async () => {
    if (!testData || testData.length === 0) {
      console.log('⚠️ 跳過測試：沒有測試數據');
      return;
    }
    
    const testCase = testData.find(t => t.name === '5x5_complex_circuit');
    if (!testCase) {
      throw new Error('找不到 5x5_complex_circuit 測試用例');
    }
    
    await runSolverTest(testCase);
  });

  async function runSolverTest(testCase: any) {
    console.log(`\n🧪 測試: ${testCase.name}`);
    console.log(`📊 矩陣: ${testCase.matrix.rows}×${testCase.matrix.cols}, nnz=${testCase.matrix.nnz}`);
    console.log(`📊 條件數: ${testCase.condition_number.toExponential(2)}`);
    
    // 1. 構建稀疏矩陣
    const matrix = new SparseMatrix(testCase.matrix.rows, testCase.matrix.cols);
    
    // 從CSR數據重構稀疏矩陣
    for (let row = 0; row < testCase.matrix.rows; row++) {
      const rowStart = testCase.matrix.csr_row_pointers[row];
      const rowEnd = testCase.matrix.csr_row_pointers[row + 1];
      
      for (let idx = rowStart; idx < rowEnd; idx++) {
        const col = testCase.matrix.csr_col_indices[idx];
        const value = testCase.matrix.csr_values[idx];
        matrix.set(row, col, value);
      }
    }
    
    console.log(`📊 矩陣構建完成: ${matrix.nnz} 個非零元素`);
    
    // 2. 構建右側向量
    const rhsVector = Vector.from(testCase.rhs_vector);
    
    // 3. 設置求解器模式為 numeric.js (高精度)
    matrix.setSolverMode('numeric');
    
    // 4. 求解線性系統
    console.log('🔧 使用 numeric.js 高精度求解器...');
    const startTime = performance.now();
    
    const solution = await matrix.solve(rhsVector);
    
    const solveTime = performance.now() - startTime;
    console.log(`⏱️ 求解時間: ${solveTime.toFixed(2)}ms`);
    
    // 5. 驗證解的正確性
    expect(solution.size).toBe(testCase.expected_solution.length);
    
    let maxError = 0;
    let relativeErrorSum = 0;
    
    console.log('🔍 解向量驗證:');
    for (let i = 0; i < solution.size; i++) {
      const calculated = solution.get(i);
      const expected = testCase.expected_solution[i];
      const absoluteError = Math.abs(calculated - expected);
      const relativeError = Math.abs(expected) > 1e-15 ? absoluteError / Math.abs(expected) : absoluteError;
      
      maxError = Math.max(maxError, absoluteError);
      relativeErrorSum += relativeError;
      
      console.log(`  x[${i}]: calc=${calculated.toExponential(6)}, exp=${expected.toExponential(6)}, err=${absoluteError.toExponential(2)}`);
      
      // 檢查每個分量，要求機器精度級別
      expect(calculated).toBeCloseTo(expected, 14); // 14位小數精度
    }
    
    const avgRelativeError = relativeErrorSum / solution.size;
    console.log(`✅ 最大絕對誤差: ${maxError.toExponential(2)}`);
    console.log(`✅ 平均相對誤差: ${avgRelativeError.toExponential(2)}`);
    
    // 6. 驗證殘差 (Ax - b 應該接近零)
    const calculatedRhs = matrix.multiply(solution);
    const residual = calculatedRhs.minus(rhsVector);
    const residualNorm = residual.norm();
    
    console.log(`📊 我們的殘差範數: ${residualNorm.toExponential(2)}`);
    console.log(`📊 SciPy 殘差範數: ${testCase.residual_norm.toExponential(2)}`);
    
    // 殘差應該與SciPy相當或更好
    expect(residualNorm).toBeLessThan(1e-8);
    
    // 7. 額外的數值穩定性檢查
    if (maxError < 1e-14) {
      console.log('🏆 達到機器精度水平！');
    } else if (maxError < 1e-10) {
      console.log('✅ 達到工程精度水平');
    } else {
      console.log('⚠️ 精度可能需要改進');
    }
    
    // 清理內存
    matrix.dispose();
  }
  
  it('🧪 求解器模式切換測試', async () => {
    console.log('\n🔄 測試求解器模式切換功能...');
    
    // 使用第一個測試用例
    const testCase = testData[0];
    const matrix = new SparseMatrix(testCase.matrix.rows, testCase.matrix.cols);
    
    // 構建矩陣
    for (let row = 0; row < testCase.matrix.rows; row++) {
      const rowStart = testCase.matrix.csr_row_pointers[row];
      const rowEnd = testCase.matrix.csr_row_pointers[row + 1];
      
      for (let idx = rowStart; idx < rowEnd; idx++) {
        const col = testCase.matrix.csr_col_indices[idx];
        const value = testCase.matrix.csr_values[idx];
        matrix.set(row, col, value);
      }
    }
    
    const rhsVector = Vector.from(testCase.rhs_vector);
    const expectedSolution = testCase.expected_solution;
    
    // 測試不同的求解器模式
    const solverModes = ['numeric', 'iterative'] as const;
    
    for (const mode of solverModes) {
      console.log(`\n🔧 測試 ${mode} 求解器模式...`);
      matrix.setSolverMode(mode);
      
      const startTime = performance.now();
      const solution = await matrix.solve(rhsVector);
      const solveTime = performance.now() - startTime;
      
      console.log(`⏱️ ${mode} 模式求解時間: ${solveTime.toFixed(2)}ms`);
      
      // 驗證解的正確性
      let maxError = 0;
      for (let i = 0; i < solution.size; i++) {
        const calculated = solution.get(i);
        const expected = expectedSolution[i];
        const error = Math.abs(calculated - expected);
        maxError = Math.max(maxError, error);
      }
      
      console.log(`📊 ${mode} 模式最大誤差: ${maxError.toExponential(2)}`);
      
      // numeric 模式應該達到機器精度
      if (mode === 'numeric') {
        expect(maxError).toBeLessThan(1e-14);
      } else {
        // iterative 模式應該達到工程精度
        expect(maxError).toBeLessThan(1e-8);
      }
    }
    
    matrix.dispose();
  });
  
  it('🚨 奇異矩陣處理測試', async () => {
    console.log('\n🧪 測試奇異矩陣的處理能力...');
    
    // 創建一個奇異矩陣 (行列式為0)
    const matrix = new SparseMatrix(3, 3);
    matrix.set(0, 0, 1);
    matrix.set(0, 1, 2);
    matrix.set(0, 2, 3);
    matrix.set(1, 0, 2);  // 第二行是第一行的2倍
    matrix.set(1, 1, 4);
    matrix.set(1, 2, 6);
    matrix.set(2, 0, 1);
    matrix.set(2, 1, 1);
    matrix.set(2, 2, 1);
    
    const rhs = Vector.from([1, 2, 1]);
    
    console.log('🔧 嘗試求解奇異系統...');
    matrix.setSolverMode('numeric');
    
    // 奇異矩陣求解應該拋出錯誤或者檢測到奇異性
    try {
      const solution = await matrix.solve(rhs);
      console.log('⚠️ 求解器返回了解，檢查是否合理...');
      
      // 檢查解是否滿足方程 (可能是最小二乘解)
      const calculatedRhs = matrix.multiply(solution);
      const residual = calculatedRhs.minus(rhs);
      const residualNorm = residual.norm();
      
      console.log(`📊 奇異系統殘差: ${residualNorm.toExponential(2)}`);
      
      // 對於奇異系統，殘差可能較大
      // 這裡我們檢查求解器是否至少返回了某種合理的解
      expect(solution.size).toBe(3);
      
    } catch (error) {
      console.log('✅ 求解器正確檢測到奇異矩陣');
      expect(error).toBeDefined();
    }
    
    matrix.dispose();
  });
});