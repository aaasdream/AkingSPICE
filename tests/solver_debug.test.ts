/**
 * 🔧 求解器調試測試
 */

import { describe, it, expect } from 'vitest';
import { SparseMatrix } from '../src/math/sparse/matrix';
import { Vector } from '../src/math/sparse/vector';

describe('🔧 求解器調試', () => {
  
  it('🧪 簡單2x2矩陣測試', async () => {
    console.log('\n🔧 調試: 簡單2x2矩陣');
    
    // 創建一個簡單的2x2矩陣 [[2, 1], [1, 2]]
    const matrix = new SparseMatrix(2, 2);
    matrix.set(0, 0, 2);
    matrix.set(0, 1, 1);
    matrix.set(1, 0, 1);
    matrix.set(1, 1, 2);
    
    console.log('矩陣構建完成');
    
    // 檢查矩陣內容
    console.log('矩陣元素檢查:');
    console.log(`A[0,0] = ${matrix.get(0, 0)}`);
    console.log(`A[0,1] = ${matrix.get(0, 1)}`);
    console.log(`A[1,0] = ${matrix.get(1, 0)}`);
    console.log(`A[1,1] = ${matrix.get(1, 1)}`);
    
    // 轉換為稠密格式檢查
    const dense = matrix.toDense();
    console.log('稠密矩陣:', dense);
    
    // 設置右側向量 [3, 4]
    const rhs = Vector.from([3, 4]);
    console.log('右側向量:', rhs.toArray());
    
    // 理論解: [[2,1],[1,2]] * [x1,x2] = [3,4]
    // 解: x1 = 2/3, x2 = 5/3
    
    matrix.setSolverMode('numeric');
    
    try {
      const solution = await matrix.solve(rhs);
      console.log('解向量:', solution.toArray());
      
      // 驗證解
      const calculatedRhs = matrix.multiply(solution);
      console.log('計算的RHS:', calculatedRhs.toArray());
      
      const residual = calculatedRhs.minus(rhs);
      console.log('殘差:', residual.toArray());
      console.log('殘差範數:', residual.norm());
      
    } catch (error) {
      console.error('求解失敗:', error);
      throw error;
    }
    
    matrix.dispose();
  });
  
  it('🧪 CSR格式重構測試', async () => {
    console.log('\n🔧 調試: CSR格式重構');
    
    // 使用測試數據中的第一個3x3矩陣
    const testCase = {
      "matrix": {
        "rows": 3,
        "cols": 3,
        "nnz": 9,
        "csr_values": [3.0, -1.0, -1.0, -1.0, 3.0, -1.0, -1.0, -1.0, 3.0],
        "csr_col_indices": [0, 1, 2, 0, 1, 2, 0, 1, 2],
        "csr_row_pointers": [0, 3, 6, 9]
      },
      "rhs_vector": [1.0, 0.0, 1.0],
      "expected_solution": [0.5, 0.0, 0.5]
    };
    
    console.log('原始CSR數據:');
    console.log('values:', testCase.matrix.csr_values);
    console.log('col_indices:', testCase.matrix.csr_col_indices);
    console.log('row_pointers:', testCase.matrix.csr_row_pointers);
    
    const matrix = new SparseMatrix(testCase.matrix.rows, testCase.matrix.cols);
    
    // 從CSR數據重構矩陣
    for (let row = 0; row < testCase.matrix.rows; row++) {
      const rowStart = testCase.matrix.csr_row_pointers[row];
      const rowEnd = testCase.matrix.csr_row_pointers[row + 1];
      
      console.log(`處理第${row}行: start=${rowStart}, end=${rowEnd}`);
      
      for (let idx = rowStart; idx < rowEnd; idx++) {
        const col = testCase.matrix.csr_col_indices[idx];
        const value = testCase.matrix.csr_values[idx];
        console.log(`  設置 A[${row},${col}] = ${value}`);
        matrix.set(row, col, value);
      }
    }
    
    // 檢查重構的矩陣
    console.log('\n重構後的矩陣檢查:');
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        console.log(`A[${i},${j}] = ${matrix.get(i, j)}`);
      }
    }
    
    // 轉換為稠密格式檢查
    const dense = matrix.toDense();
    console.log('稠密矩陣:', dense);
    
    const rhs = Vector.from(testCase.rhs_vector);
    console.log('右側向量:', rhs.toArray());
    
    matrix.setSolverMode('numeric');
    
    try {
      const solution = await matrix.solve(rhs);
      console.log('計算的解:', solution.toArray());
      console.log('期望的解:', testCase.expected_solution);
      
      // 檢查每個分量
      for (let i = 0; i < solution.size; i++) {
        const calc = solution.get(i);
        const exp = testCase.expected_solution[i];
        const err = Math.abs(calc - exp);
        console.log(`x[${i}]: calc=${calc}, exp=${exp}, err=${err}`);
      }
      
    } catch (error) {
      console.error('求解失敗:', error);
      throw error;
    }
    
    matrix.dispose();
  });
  
});