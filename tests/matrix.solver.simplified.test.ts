/**
 * 🧪 稀疏矩陣求解器驗證測試
 * 
 * 使用 Python SciPy 生成的黃金標準數據來驗證
 * TypeScript 求解器的正確性
 */

import { describe, it, beforeAll, expect } from 'vitest';
import { SparseMatrix } from '../src/math/sparse/matrix';
import { Vector } from '../src/math/sparse/vector';
import * as fs from 'fs';
import * as path from 'path';

// 導入 Python 生成的驗證數據
interface SolverTestCase {
  name: string;
  matrix: {
    rows: number;
    cols: number;
    nnz: number;
    csr_values: number[];
    csr_col_indices: number[];
    csr_row_pointers: number[];
    dense_matrix: number[][];
  };
  rhs_vector: number[];
  expected_solution: number[];
  residual_norm: number;
  condition_number: number;
}

describe('🔬 SparseMatrix Solver Verification', () => {
  let testCases: SolverTestCase[] = [];

  beforeAll(() => {
    try {
      // 讀取 Python 生成的驗證數據
      const dataPath = path.join(process.cwd(), 'solver_verification_data.json');
      console.log(`📁 嘗試讀取數據文件: ${dataPath}`);
      
      if (!fs.existsSync(dataPath)) {
        throw new Error(`數據文件不存在: ${dataPath}`);
      }
      
      const jsonData = fs.readFileSync(dataPath, 'utf8');
      testCases = JSON.parse(jsonData);
      
      console.log(`📊 成功加載了 ${testCases.length} 個測試用例`);
    } catch (error) {
      console.error('❌ 無法加載測試數據:', error);
      testCases = [];
    }
  });

  describe('📈 numeric.js 求解器測試', () => {
    it('應該有測試用例數據', () => {
      expect(testCases).toBeDefined();
      expect(testCases.length).toBeGreaterThan(0);
    });

    it('應該正確求解第一個測試用例', () => {
      if (!testCases || testCases.length === 0) {
        console.log('⚠️ 跳過測試：沒有測試數據');
        return;
      }

      const testCase = testCases[0]!;
      console.log(`\n🧮 測試用例: ${testCase.name}`);
      console.log(`📊 矩陣大小: ${testCase.matrix.rows}x${testCase.matrix.cols}, nnz: ${testCase.matrix.nnz}`);
      console.log(`📊 條件數: ${testCase.condition_number.toExponential(2)}`);
      
      // 1. 從測試數據構建 SparseMatrix
      const matrix = new SparseMatrix(testCase.matrix.rows, testCase.matrix.cols);
      
      // 直接設置內部數據 (這是測試特有的方法)
      (matrix as any)._values = [...testCase.matrix.csr_values];
      (matrix as any)._colIndices = [...testCase.matrix.csr_col_indices];
      (matrix as any)._rowPointers = [...testCase.matrix.csr_row_pointers];
      
      // 確保使用 numeric 求解器
      matrix.setSolverMode('numeric');
      
      // 2. 構建右側向量
      const b = Vector.from(testCase.rhs_vector);
      
      // 3. 求解
      console.log('🚀 開始求解...');
      const startTime = performance.now();
      
      const x = matrix.solve(b);
      
      const endTime = performance.now();
      const solveTime = endTime - startTime;
      console.log(`⏱️ 求解時間: ${solveTime.toFixed(2)} ms`);
      
      // 4. 驗證解的正確性
      expect(x.size).toBe(testCase.expected_solution.length);
      
      console.log('📊 解向量比較:');
      let maxError = 0;
      for (let i = 0; i < x.size; i++) {
        const calculated = x.get(i);
        const expected = testCase.expected_solution[i]!;
        const error = Math.abs(calculated - expected);
        
        maxError = Math.max(maxError, error);
        
        console.log(`  x[${i}]: 計算值 ${calculated.toFixed(8)}, 期望值 ${expected.toFixed(8)}, 誤差 ${error.toExponential(2)}`);
        
        // 使用相對誤差檢查，考慮到浮點數精度
        expect(calculated).toBeCloseTo(expected, 6);
      }
      
      console.log(`✅ 最大誤差: ${maxError.toExponential(2)}`);
      
      // 5. 驗證殘差
      const calculatedResidual = matrix.multiply(x).minus(b);
      const residualNorm = calculatedResidual.norm();
      
      console.log(`📊 計算殘差範數: ${residualNorm.toExponential(2)}`);
      console.log(`📊 期望殘差範數: ${testCase.residual_norm.toExponential(2)}`);
      
      // 殘差應該很小
      expect(residualNorm).toBeLessThan(1e-6);
      
      // 釋放資源
      matrix.dispose();
    });

    it('應該正確求解所有測試用例', () => {
      if (!testCases || testCases.length === 0) {
        console.log('⚠️ 跳過測試：沒有測試數據');
        return;
      }

      testCases.forEach((testCase, index) => {
        console.log(`\n🧮 測試用例 ${index + 1}: ${testCase.name}`);
        
        // 構建矩陣
        const matrix = new SparseMatrix(testCase.matrix.rows, testCase.matrix.cols);
        (matrix as any)._values = [...testCase.matrix.csr_values];
        (matrix as any)._colIndices = [...testCase.matrix.csr_col_indices];
        (matrix as any)._rowPointers = [...testCase.matrix.csr_row_pointers];
        
        matrix.setSolverMode('numeric');
        const b = Vector.from(testCase.rhs_vector);
        
        // 求解
        const x = matrix.solve(b);
        
        // 快速驗證
        expect(x.size).toBe(testCase.expected_solution.length);
        
        let maxError = 0;
        for (let i = 0; i < x.size; i++) {
          const error = Math.abs(x.get(i) - testCase.expected_solution[i]!);
          maxError = Math.max(maxError, error);
        }
        
        console.log(`✅ ${testCase.name} 最大誤差: ${maxError.toExponential(2)}`);
        expect(maxError).toBeLessThan(1e-6);
        
        matrix.dispose();
      });
    });
  });

  describe('🔄 迭代求解器測試', () => {
    it('應該使用迭代方法求解', () => {
      if (!testCases || testCases.length === 0) {
        console.log('⚠️ 跳過測試：沒有測試數據');
        return;
      }

      const testCase = testCases[1]!; // 使用第二個測試用例(對稱矩陣)
      console.log(`\n🔄 迭代測試: ${testCase.name}`);
      
      // 構建矩陣
      const matrix = new SparseMatrix(testCase.matrix.rows, testCase.matrix.cols);
      (matrix as any)._values = [...testCase.matrix.csr_values];
      (matrix as any)._colIndices = [...testCase.matrix.csr_col_indices];
      (matrix as any)._rowPointers = [...testCase.matrix.csr_row_pointers];
      
      // 使用迭代求解器
      matrix.setSolverMode('iterative');
      const b = Vector.from(testCase.rhs_vector);
      
      console.log('🔄 開始迭代求解...');
      const startTime = performance.now();
      
      const x = matrix.solve(b);
      
      const endTime = performance.now();
      const solveTime = endTime - startTime;
      console.log(`⏱️ 迭代求解時間: ${solveTime.toFixed(2)} ms`);
      
      // 驗證 (迭代求解器誤差可能稍大)
      let maxError = 0;
      for (let i = 0; i < x.size; i++) {
        const calculated = x.get(i);
        const expected = testCase.expected_solution[i]!;
        const error = Math.abs(calculated - expected);
        maxError = Math.max(maxError, error);
        
        // 迭代求解器允許較大的誤差
        expect(calculated).toBeCloseTo(expected, 4);
      }
      
      console.log(`✅ 迭代求解最大誤差: ${maxError.toExponential(2)}`);
      
      // 驗證殘差
      const calculatedResidual = matrix.multiply(x).minus(b);
      const residualNorm = calculatedResidual.norm();
      
      console.log(`📊 迭代殘差範數: ${residualNorm.toExponential(2)}`);
      expect(residualNorm).toBeLessThan(1e-4);
      
      matrix.dispose();
    });
  });

  describe('🔧 矩陣構建測試', () => {
    it('應該正確處理稀疏矩陣的設置和獲取', () => {
      if (!testCases || testCases.length === 0) {
        console.log('⚠️ 跳過測試：沒有測試數據');
        return;
      }

      const testCase = testCases[1]!; // 使用對稱矩陣測試用例
      console.log(`\n🔧 矩陣構建測試: ${testCase.name}`);
      
      const matrix = new SparseMatrix(testCase.matrix.rows, testCase.matrix.cols);
      
      // 逐個設置元素 (模擬電路戳印過程)
      const denseMatrix = testCase.matrix.dense_matrix;
      for (let i = 0; i < testCase.matrix.rows; i++) {
        for (let j = 0; j < testCase.matrix.cols; j++) {
          const value = denseMatrix[i]![j]!;
          if (Math.abs(value) > 1e-15) {
            matrix.set(i, j, value);
          }
        }
      }
      
      // 驗證矩陣元素
      for (let i = 0; i < testCase.matrix.rows; i++) {
        for (let j = 0; j < testCase.matrix.cols; j++) {
          const expected = denseMatrix[i]![j]!;
          const actual = matrix.get(i, j);
          expect(actual).toBeCloseTo(expected, 10);
        }
      }
      
      // 驗證矩陣信息
      const info = matrix.getInfo();
      expect(info.rows).toBe(testCase.matrix.rows);
      expect(info.cols).toBe(testCase.matrix.cols);
      expect(info.nnz).toBe(testCase.matrix.nnz);
      
      console.log(`✅ 矩陣構建驗證完成: ${info.rows}x${info.cols}, nnz=${info.nnz}`);
      
      matrix.dispose();
    });
  });
});