/**
 * 簡單的 LU 分解測試
 */

import { Matrix, Vector, LUSolver } from './src/core/linalg.js';

console.log('=== LU Solver Debug Test ===');

// 測試 3x3 系統，重新設定正確的矩陣
// 使用 x=1, y=2, z=1 構造方程組
// Row 0: 1*1 + 2*2 + 3*1 = 8  => A[0] = [1, 2, 3], b[0] = 8
// Row 1: 2*1 + 5*2 + 3*1 = 15 => A[1] = [2, 5, 3], b[1] = 15  
// Row 2: 1*1 + 0*2 + 8*1 = 9  => A[2] = [1, 0, 8], b[2] = 9

const A = new Matrix(3, 3);
A.set(0, 0, 1); A.set(0, 1, 2); A.set(0, 2, 3);
A.set(1, 0, 2); A.set(1, 1, 5); A.set(1, 2, 3);
A.set(2, 0, 1); A.set(2, 1, 0); A.set(2, 2, 8);

console.log('原始矩陣 A:');
A.print();

const b = new Vector(3);
b.set(0, 8); b.set(1, 15); b.set(2, 9);

console.log('右手邊向量 b:');
b.print();

// 驗證方程組：手工計算
console.log('\n手工驗證:');
console.log('x=1, y=2, z=1:');
console.log('Row 0: 1*1 + 2*2 + 3*1 =', 1*1 + 2*2 + 3*1, '(should be 8)');
console.log('Row 1: 2*1 + 5*2 + 3*1 =', 2*1 + 5*2 + 3*1, '(should be 15)');
console.log('Row 2: 1*1 + 0*2 + 8*1 =', 1*1 + 0*2 + 8*1, '(should be 9)');

try {
    const x = LUSolver.solve(A, b);
    
    console.log('\n計算得到的解:');
    x.print();
    
    console.log('\n元素值:');
    console.log('x[0] =', x.get(0));
    console.log('x[1] =', x.get(1));
    console.log('x[2] =', x.get(2));
    
} catch (error) {
    console.error('LU求解失敗:', error.message);
}