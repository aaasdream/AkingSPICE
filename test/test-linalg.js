/**
 * 線性代數模組測試
 */

import { Matrix, Vector, LUSolver } from '../src/core/linalg.js';

export async function runLinAlgTests(ctx) {
    
    await ctx.test('Matrix creation and basic operations', () => {
        const m = new Matrix(3, 3);
        ctx.assert.equal(m.rows, 3);
        ctx.assert.equal(m.cols, 3);
        ctx.assert.equal(m.get(0, 0), 0);
        
        m.set(0, 0, 5);
        ctx.assert.equal(m.get(0, 0), 5);
        
        m.addAt(0, 0, 3);
        ctx.assert.equal(m.get(0, 0), 8);
    });
    
    await ctx.test('Matrix identity creation', () => {
        const I = Matrix.identity(3);
        ctx.assert.equal(I.get(0, 0), 1);
        ctx.assert.equal(I.get(1, 1), 1);
        ctx.assert.equal(I.get(2, 2), 1);
        ctx.assert.equal(I.get(0, 1), 0);
        ctx.assert.equal(I.get(1, 0), 0);
    });
    
    await ctx.test('Vector creation and operations', () => {
        const v = new Vector(3);
        ctx.assert.equal(v.size, 3);
        ctx.assert.equal(v.get(0), 0);
        
        v.set(0, 10);
        ctx.assert.equal(v.get(0), 10);
        
        v.addAt(0, 5);
        ctx.assert.equal(v.get(0), 15);
    });
    
    await ctx.test('LU solver - simple 2x2 system', () => {
        // 測試系統: [2 1; 1 2] * [x; y] = [3; 3]
        // 解應該是 [1; 1]
        const A = new Matrix(2, 2);
        A.set(0, 0, 2); A.set(0, 1, 1);
        A.set(1, 0, 1); A.set(1, 1, 2);
        
        const b = new Vector(2);
        b.set(0, 3); b.set(1, 3);
        
        const x = LUSolver.solve(A, b);
        
        ctx.assert.closeTo(x.get(0), 1, 1e-10);
        ctx.assert.closeTo(x.get(1), 1, 1e-10);
    });
    
    await ctx.test('LU solver - 3x3 system', () => {
        // 測試系統: 
        // [1 2 3; 2 5 3; 1 0 8] * [x; y; z] = [8; 15; 9]
        // 解應該是 [1; 2; 1]
        const A = new Matrix(3, 3);
        A.set(0, 0, 1); A.set(0, 1, 2); A.set(0, 2, 3);
        A.set(1, 0, 2); A.set(1, 1, 5); A.set(1, 2, 3);
        A.set(2, 0, 1); A.set(2, 1, 0); A.set(2, 2, 8);
        
        const b = new Vector(3);
        b.set(0, 8); b.set(1, 15); b.set(2, 9);
        
        const x = LUSolver.solve(A, b);
        
        ctx.assert.closeTo(x.get(0), 1, 1e-10);
        ctx.assert.closeTo(x.get(1), 2, 1e-10);
        ctx.assert.closeTo(x.get(2), 1, 1e-10);
    });
    
    await ctx.test('Matrix bounds checking', () => {
        const m = new Matrix(2, 2);
        
        ctx.assert.throws(() => m.get(-1, 0));
        ctx.assert.throws(() => m.get(0, -1));
        ctx.assert.throws(() => m.get(2, 0));
        ctx.assert.throws(() => m.get(0, 2));
        ctx.assert.throws(() => m.set(2, 0, 1));
    });
    
    await ctx.test('Vector bounds checking', () => {
        const v = new Vector(3);
        
        ctx.assert.throws(() => v.get(-1));
        ctx.assert.throws(() => v.get(3));
        ctx.assert.throws(() => v.set(-1, 1));
        ctx.assert.throws(() => v.set(3, 1));
    });
    
    await ctx.test('Singular matrix detection', () => {
        // 創建奇異矩陣
        const A = new Matrix(2, 2);
        A.set(0, 0, 1); A.set(0, 1, 2);
        A.set(1, 0, 2); A.set(1, 1, 4); // 第二行是第一行的2倍
        
        const b = new Vector(2);
        b.set(0, 1); b.set(1, 2);
        
        ctx.assert.throws(() => LUSolver.solve(A, b));
    });
}