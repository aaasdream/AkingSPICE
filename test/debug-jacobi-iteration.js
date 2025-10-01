/**
 * WebGPU Jacobi 迭代調試工具
 * 
 * 目的：詳細追蹤 GPU 求解過程，找出節點1計算錯誤的根本原因
 * 方法：逐步驗證矩陣上傳、緩衝區綁定、迭代計算過程
 */

import { WebGPUSolver } from '../src/core/webgpu-solver.js';

async function debugJacobiIteration() {
    console.log('🔬 WebGPU Jacobi 迭代詳細調試');
    console.log('============================================================');
    
    try {
        // 1. 創建求解器
        const solver = new WebGPUSolver({ debug: true, maxIterations: 10 });
        await solver.initialize();
        
        // 2. 設置測試數據
        const testMatrix = [
            [1e6, -1e-3],
            [-1e-3, 1e6]
        ];
        const testRHS = [1e7, 0];
        
        console.log('\n📋 測試數據驗證:');
        console.log('原始矩陣:');
        console.log(`  G[0,0] = ${testMatrix[0][0]}, G[0,1] = ${testMatrix[0][1]}`);
        console.log(`  G[1,0] = ${testMatrix[1][0]}, G[1,1] = ${testMatrix[1][1]}`);
        console.log(`RHS: [${testRHS[0]}, ${testRHS[1]}]`);
        
        // 3. 手動驗證扁平化矩陣
        const flatMatrix = testMatrix.flat();
        console.log(`\n扁平化矩陣 (row-major): [${flatMatrix.join(', ')}]`);
        
        // 4. 手動計算理論 Jacobi 迭代
        console.log('\n🧮 手動 Jacobi 迭代驗證:');
        
        let x_old = [0, 0]; // 初始猜測
        for (let iter = 0; iter < 5; iter++) {
            const x_new = [0, 0];
            
            // 節點0: x_new[0] = (rhs[0] - G[0,1]*x_old[1]) / G[0,0]
            x_new[0] = (testRHS[0] - testMatrix[0][1] * x_old[1]) / testMatrix[0][0];
            
            // 節點1: x_new[1] = (rhs[1] - G[1,0]*x_old[0]) / G[1,1] 
            x_new[1] = (testRHS[1] - testMatrix[1][0] * x_old[0]) / testMatrix[1][1];
            
            console.log(`  迭代${iter}: x_old=[${x_old[0].toFixed(6)}, ${x_old[1].toFixed(6)}] -> x_new=[${x_new[0].toFixed(6)}, ${x_new[1].toFixed(6)}]`);
            
            x_old = [...x_new]; // 更新
        }
        
        console.log(`\n📊 手動計算收斂解: [${x_old[0].toFixed(6)}, ${x_old[1].toFixed(6)}]`);
        
        // 5. 設置 GPU 電路數據並求解
        const circuitData = {
            nodeCount: 2,
            stateCount: 0,
            gMatrix: {
                getDenseMatrix: () => testMatrix
            },
            initialStateVector: []
        };
        
        solver.setupCircuit(circuitData);
        
        console.log('\n⚙️ GPU 求解過程:');
        const gpuSolution = await solver.solveLinearSystem(testRHS);
        
        console.log(`GPU最終解: [${gpuSolution[0].toFixed(6)}, ${gpuSolution[1].toFixed(6)}]`);
        
        // 6. 對比分析
        console.log('\n📈 手動 vs GPU 對比:');
        const error0 = Math.abs(gpuSolution[0] - x_old[0]);
        const error1 = Math.abs(gpuSolution[1] - x_old[1]);
        
        console.log(`  節點0: 手動=${x_old[0].toFixed(6)}, GPU=${gpuSolution[0].toFixed(6)}, 差異=${error0.toExponential(3)}`);
        console.log(`  節點1: 手動=${x_old[1].toFixed(6)}, GPU=${gpuSolution[1].toFixed(6)}, 差異=${error1.toExponential(3)}`);
        
        // 7. 矩陣元素驗證
        console.log('\n🔍 矩陣元素詳細檢查:');
        console.log('預期矩陣索引映射:');
        console.log('  G[0,0] (idx=0): 1e6');
        console.log('  G[0,1] (idx=1): -1e-3');  
        console.log('  G[1,0] (idx=2): -1e-3');
        console.log('  G[1,1] (idx=3): 1e6');
        
        // 8. 診斷可能的問題
        if (Math.abs(error1) > 1e-6) {
            console.log('\n❌ 發現問題！節點1計算錯誤，可能原因:');
            console.log('   1. 矩陣索引計算錯誤 (row * node_count + col)');
            console.log('   2. 緩衝區數據傳輸錯誤');
            console.log('   3. WGSL 浮點運算精度問題');
            console.log('   4. 迭代次數不足或發散');
        } else {
            console.log('\n✅ GPU 計算與手動計算一致！');
        }
        
        solver.destroy();
        
    } catch (error) {
        console.error('❌ 調試失敗:', error);
        console.error(error.stack);
    }
}

// 專門測試 WGSL 矩陣索引計算
async function testMatrixIndexing() {
    console.log('\n🎯 WGSL 矩陣索引測試');
    console.log('============================================================');
    
    // 驗證 row-major 索引公式: matrix_idx = row * node_count + col
    const nodeCount = 2;
    console.log(`節點數: ${nodeCount}`);
    console.log('索引映射:');
    
    for (let row = 0; row < nodeCount; row++) {
        for (let col = 0; col < nodeCount; col++) {
            const idx = row * nodeCount + col;
            console.log(`  G[${row},${col}] -> 扁平索引 ${idx}`);
        }
    }
    
    // 測試具體數值
    const matrix = [[1e6, -1e-3], [-1e-3, 1e6]];
    const flat = matrix.flat();
    
    console.log('\n數值對照:');
    for (let i = 0; i < flat.length; i++) {
        const row = Math.floor(i / nodeCount);
        const col = i % nodeCount;
        console.log(`  扁平[${i}] = ${flat[i]} = G[${row},${col}]`);
    }
}

// 執行調試
async function main() {
    await debugJacobiIteration();
    await testMatrixIndexing();
}

main().catch(error => {
    console.error('調試失敗:', error);
});