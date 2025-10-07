
// 🧪 自動生成的 KLU 求解器驗證測試
// 基於 SciPy 黃金標準生成
// 
// 生成命令: python verify_solver.py

import { SparseMatrix } from './matrix';
import { Vector } from './vector';

describe('KLU Solver Integration Tests', () => {
    // 浮點數比較容差
    const TOLERANCE = 1e-10;
    

    it('should solve small_rc_circuit correctly compared to SciPy', async () => {
        console.log('🧪 測試案例: small_rc_circuit');
        
        // 1. 測試數據 (來自 Python/SciPy)
        const rows = 4;
        const cols = 4;
        const csr_values = [10.0, -1.0, 1.0, -2.0, 15.0, -3.0, -4.0, 20.0, -5.0, 2.0, -6.0, 12.0];
        const csr_col_indices = [0, 1, 3, 0, 1, 2, 1, 2, 3, 0, 2, 3];
        const csr_row_pointers = [0, 3, 6, 9, 12];
        
        const b_values = [1.0, 2.0, 3.0, 4.0];
        const expected_x_values = [0.07288449660284127, 0.20506485484867204, 0.31006794317479924, 0.47621988882025945];
        
        // 2. 構建 SparseMatrix
        const matrix = new SparseMatrix(rows, cols);
        
        // 直接設置 CSR 數據 (測試專用)
        (matrix as any)._values = csr_values;
        (matrix as any)._colIndices = csr_col_indices;
        (matrix as any)._rowPointers = csr_row_pointers;
        
        const b = Vector.from(b_values);
        
        // 3. 求解
        console.log('🔧 調用 KLU 求解器...');
        const start_time = performance.now();
        const calculated_x = await matrix.solve(b);
        const solve_time = performance.now() - start_time;
        
        console.log(`⚡ 求解時間: ${solve_time.toFixed(2)} ms`);
        
        // 4. 驗證結果
        expect(calculated_x.size).toBe(expected_x_values.length);
        
        let max_error = 0;
        for (let i = 0; i < calculated_x.size; i++) {
            const calculated = calculated_x.get(i);
            const expected = expected_x_values[i];
            const error = Math.abs(calculated - expected);
            max_error = Math.max(max_error, error);
            
            expect(calculated).toBeCloseTo(expected, 8);
        }
        
        console.log(`✅ 最大誤差: ${max_error.toExponential(2)}`);
        console.log(`📊 條件數: 2.92e+00`);
        
        // 5. 清理資源
        matrix.dispose();
    });

    it('should solve buck_converter correctly compared to SciPy', async () => {
        console.log('🧪 測試案例: buck_converter');
        
        // 1. 測試數據 (來自 Python/SciPy)
        const rows = 8;
        const cols = 8;
        const csr_values = [15.0, -5.0, 1.0, -5.0, 25.0, -8.0, 1.0, -8.0, 30.0, -10.0, 1.0, -10.0, 20.0, 1.0, 1.0, 1.0, 1.0, 1.0];
        const csr_col_indices = [0, 1, 4, 0, 1, 2, 5, 1, 2, 3, 6, 2, 3, 7, 0, 1, 2, 3];
        const csr_row_pointers = [0, 3, 7, 11, 14, 15, 16, 17, 18];
        
        const b_values = [0.0, 0.0, 0.0, 0.0, 12.0, 0.0, 0.0, 0.0];
        const expected_x_values = [12.0, -0.0, -0.0, 0.0, -180.0, 60.0, 0.0, 0.0];
        
        // 2. 構建 SparseMatrix
        const matrix = new SparseMatrix(rows, cols);
        
        // 直接設置 CSR 數據 (測試專用)
        (matrix as any)._values = csr_values;
        (matrix as any)._colIndices = csr_col_indices;
        (matrix as any)._rowPointers = csr_row_pointers;
        
        const b = Vector.from(b_values);
        
        // 3. 求解
        console.log('🔧 調用 KLU 求解器...');
        const start_time = performance.now();
        const calculated_x = await matrix.solve(b);
        const solve_time = performance.now() - start_time;
        
        console.log(`⚡ 求解時間: ${solve_time.toFixed(2)} ms`);
        
        // 4. 驗證結果
        expect(calculated_x.size).toBe(expected_x_values.length);
        
        let max_error = 0;
        for (let i = 0; i < calculated_x.size; i++) {
            const calculated = calculated_x.get(i);
            const expected = expected_x_values[i];
            const error = Math.abs(calculated - expected);
            max_error = Math.max(max_error, error);
            
            expect(calculated).toBeCloseTo(expected, 8);
        }
        
        console.log(`✅ 最大誤差: ${max_error.toExponential(2)}`);
        console.log(`📊 條件數: 1.58e+03`);
        
        // 5. 清理資源
        matrix.dispose();
    });

    it('should solve complex_power_electronics correctly compared to SciPy', async () => {
        console.log('🧪 測試案例: complex_power_electronics');
        
        // 1. 測試數據 (來自 Python/SciPy)
        const rows = 16;
        const cols = 16;
        const csr_values = [10.0, -1.0, -0.5, -0.8, 12.0, -1.5, -1.2000000000000002, 14.0, -2.0, -1.6, 16.0, -2.5, -2.0, 18.0, -3.0, -0.5, -2.4000000000000004, 20.0, -3.5, -2.8000000000000003, 22.0, -4.0, -3.2, 24.0, -4.5, -0.3, -3.6, 26.0, -5.0, -4.0, 28.0, -5.5, -4.4, 30.0, -6.0, -4.800000000000001, 32.0, -6.5, -0.3, -5.2, 34.0, -7.0, -5.6000000000000005, 36.0, -7.5, -6.0, 38.0, -8.0, -6.4, 40.0];
        const csr_col_indices = [0, 1, 8, 0, 1, 2, 1, 2, 3, 2, 3, 4, 3, 4, 5, 12, 4, 5, 6, 5, 6, 7, 6, 7, 8, 0, 7, 8, 9, 8, 9, 10, 9, 10, 11, 10, 11, 12, 4, 11, 12, 13, 12, 13, 14, 13, 14, 15, 14, 15];
        const csr_row_pointers = [0, 3, 6, 9, 12, 16, 19, 22, 25, 29, 32, 35, 38, 42, 45, 48, 50];
        
        const b_values = [12.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, -5.0];
        const expected_x_values = [1.2088949539077525, 0.08150418632878233, 0.007289515212790687, 0.0021240946922653887, 0.008928916294312444, 0.052357633567647895, 0.007349506356173762, 0.0037719414616021536, 0.014890705497487921, 0.0021821735001184687, 0.0002796429115209883, -0.00020204600914860207, -0.0012011935797009248, -0.006066945335793206, -0.0282244464056307, -0.1295159114249009];
        
        // 2. 構建 SparseMatrix
        const matrix = new SparseMatrix(rows, cols);
        
        // 直接設置 CSR 數據 (測試專用)
        (matrix as any)._values = csr_values;
        (matrix as any)._colIndices = csr_col_indices;
        (matrix as any)._rowPointers = csr_row_pointers;
        
        const b = Vector.from(b_values);
        
        // 3. 求解
        console.log('🔧 調用 KLU 求解器...');
        const start_time = performance.now();
        const calculated_x = await matrix.solve(b);
        const solve_time = performance.now() - start_time;
        
        console.log(`⚡ 求解時間: ${solve_time.toFixed(2)} ms`);
        
        // 4. 驗證結果
        expect(calculated_x.size).toBe(expected_x_values.length);
        
        let max_error = 0;
        for (let i = 0; i < calculated_x.size; i++) {
            const calculated = calculated_x.get(i);
            const expected = expected_x_values[i];
            const error = Math.abs(calculated - expected);
            max_error = Math.max(max_error, error);
            
            expect(calculated).toBeCloseTo(expected, 8);
        }
        
        console.log(`✅ 最大誤差: ${max_error.toExponential(2)}`);
        console.log(`📊 條件數: 5.09e+00`);
        
        // 5. 清理資源
        matrix.dispose();
    });

    
    it('should handle matrix reuse efficiently', async () => {
        // 測試矩陣重用 - 第二次求解應該更快 (已分解)
        const matrix = new SparseMatrix(4, 4);
        
        // 使用第一個測試案例的數據
        const test_data = [10.0, -1.0, 1.0, -2.0, 15.0, -3.0, -4.0, 20.0, -5.0, 2.0, -6.0, 12.0];
        (matrix as any)._values = [10.0, -1.0, 1.0, -2.0, 15.0, -3.0, -4.0, 20.0, -5.0, 2.0, -6.0, 12.0];
        (matrix as any)._colIndices = [0, 1, 3, 0, 1, 2, 1, 2, 3, 0, 2, 3];
        (matrix as any)._rowPointers = [0, 3, 6, 9, 12];
        
        const b1 = Vector.from([1.0, 2.0, 3.0, 4.0]);
        const b2 = Vector.from([2.0, 4.0, 6.0, 8.0]);  // 不同的 RHS
        
        // 第一次求解 (包含分解時間)
        const start1 = performance.now();
        await matrix.solve(b1);
        const time1 = performance.now() - start1;
        
        // 第二次求解 (應該重用分解)
        const start2 = performance.now();
        await matrix.solve(b2);
        const time2 = performance.now() - start2;
        
        console.log(`⚡ 首次求解: ${time1.toFixed(2)} ms (包含分解)`);
        console.log(`⚡ 重用求解: ${time2.toFixed(2)} ms (僅求解)`);
        
        // 第二次求解應該明顯更快
        expect(time2).toBeLessThan(time1 * 0.8);
        
        matrix.dispose();
    });
    
    it('should throw error for singular matrix', async () => {
        // 測試奇異矩陣處理
        const matrix = new SparseMatrix(3, 3);
        
        // 創建一個奇異矩陣 (第三行是前兩行的線性組合)
        matrix.set(0, 0, 1);  matrix.set(0, 1, 2);  matrix.set(0, 2, 3);
        matrix.set(1, 0, 4);  matrix.set(1, 1, 5);  matrix.set(1, 2, 6);
        matrix.set(2, 0, 5);  matrix.set(2, 1, 7);  matrix.set(2, 2, 9);  // = row0 + row1
        
        const b = Vector.from([1, 2, 3]);
        
        await expect(matrix.solve(b)).rejects.toThrow();
        
        matrix.dispose();
    });
});
