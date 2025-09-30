/**
 * WebGPU線性求解器測試
 * 驗證GPU加速的電路仿真能力
 */

import { createWebGPUSolver } from '../src/core/webgpu-solver.js';

async function testWebGPULinearSolver() {
    console.log('🚀 WebGPU線性求解器測試\n');
    
    try {
        // 創建WebGPU求解器
        console.log('1. 初始化WebGPU求解器...');
        const solver = await createWebGPUSolver({
            debug: true,
            maxIterations: 100,
            tolerance: 1e-9
        });
        
        // 測試簡單的2x2線性系統
        console.log('\n2. 測試2x2線性系統求解...');
        await testSimpleLinearSystem(solver);
        
        // 測試RC電路的GPU求解
        console.log('\n3. 測試RC電路GPU求解...');
        await testRCCircuitGPU(solver);
        
        // 性能測試
        console.log('\n4. GPU vs CPU性能對比...');
        await performanceBenchmark(solver);
        
        // 清理
        solver.destroy();
        console.log('\n✅ WebGPU線性求解器測試完成！');
        
    } catch (error) {
        console.error('\n❌ WebGPU求解器測試失敗:', error.message);
        console.error('詳細錯誤:', error);
        process.exit(1);
    }
}

/**
 * 測試簡單2x2線性系統: 
 * [2 1] [x]   [5]
 * [1 3] [y] = [6]
 * 解: x=1, y=3
 */
async function testSimpleLinearSystem(solver) {
    // 模擬電路數據
    const mockCircuitData = {
        nodeCount: 2,
        stateCount: 0,
        gMatrix: {
            getDenseMatrix: () => [
                [2.0, 1.0],
                [1.0, 3.0]
            ]
        },
        initialStateVector: []
    };
    
    // 設置電路
    solver.setupCircuit(mockCircuitData);
    
    // RHS向量
    const rhsVector = [5.0, 6.0];
    
    // 求解
    const solution = await solver.solveLinearSystem(rhsVector);
    
    console.log('   RHS向量:', rhsVector);
    console.log('   GPU解:', Array.from(solution).map(x => x.toFixed(6)));
    console.log('   理論解: [1.800000, 1.400000]');
    
    // 驗證解的精度 (正確解: x=1.8, y=1.4)
    const expectedSolution = [1.8, 1.4];
    let maxError = 0;
    for (let i = 0; i < solution.length; i++) {
        const error = Math.abs(solution[i] - expectedSolution[i]);
        maxError = Math.max(maxError, error);
    }
    
    console.log(`   最大誤差: ${maxError.toExponential(3)}`);
    
    if (maxError < 1e-3) {
        console.log('   ✅ 線性系統求解正確');
    } else {
        throw new Error(`線性系統求解誤差過大: ${maxError}`);
    }
}

/**
 * 測試RC電路的GPU求解
 */
async function testRCCircuitGPU(solver) {
    // RC電路的G矩陣 (來自之前的測試)
    const mockRCCircuitData = {
        nodeCount: 2,
        stateCount: 1,
        gMatrix: {
            getDenseMatrix: () => [
                [1.000e6, -1.000e-3],  // node1: 大導納 - 電阻導納
                [-1.000e-3, 1.000e6]   // vin: -電阻導納 + 大導納
            ]
        },
        initialStateVector: [0.0] // 電容初始電壓
    };
    
    solver.setupCircuit(mockRCCircuitData);
    
    // 測試多個時間點的RHS向量
    const testCases = [
        { rhs: [0, 5000000], name: 't=0, Vc=0V' },
        { rhs: [2500, 5000000], name: 't=1μs, Vc=2.5V' },
        { rhs: [5000, 5000000], name: 't=2μs, Vc=5V' }
    ];
    
    for (const testCase of testCases) {
        const solution = await solver.solveLinearSystem(testCase.rhs);
        
        console.log(`   ${testCase.name}:`);
        console.log(`     節點電壓: [${solution[0].toExponential(3)}, ${solution[1].toFixed(1)}]V`);
        
        // 驗證vin節點應該接近5V
        if (Math.abs(solution[1] - 5.0) > 0.1) {
            throw new Error(`vin節點電壓不正確: ${solution[1]}V`);
        }
    }
    
    console.log('   ✅ RC電路GPU求解正確');
}

/**
 * GPU vs CPU性能對比
 */
async function performanceBenchmark(solver) {
    console.log('   執行性能基準測試...');
    
    // 創建較大的線性系統 (100x100)
    const size = 100;
    const largeCircuitData = {
        nodeCount: size,
        stateCount: 0,
        gMatrix: {
            getDenseMatrix: () => {
                // 創建對角佔優矩陣
                const matrix = [];
                for (let i = 0; i < size; i++) {
                    const row = new Array(size).fill(0);
                    row[i] = 10.0; // 對角線
                    if (i > 0) row[i-1] = -1.0;
                    if (i < size-1) row[i+1] = -1.0;
                    matrix.push(row);
                }
                return matrix;
            }
        },
        initialStateVector: []
    };
    
    solver.setupCircuit(largeCircuitData);
    
    // 隨機RHS向量
    const largeRHS = new Array(size).fill(0).map(() => Math.random() * 10);
    
    // GPU求解時間測試
    const gpuStartTime = performance.now();
    await solver.solveLinearSystem(largeRHS);
    const gpuTime = performance.now() - gpuStartTime;
    
    console.log(`   GPU求解時間 (${size}x${size}): ${gpuTime.toFixed(2)}ms`);
    
    // 獲取性能統計
    const stats = solver.getStats();
    console.log(`   GPU迭代次數: ${stats.totalIterations}`);
    console.log(`   平均GPU時間: ${stats.totalGPUTime.toFixed(2)}ms`);
    
    console.log('   ✅ 性能測試完成');
}

// 運行測試
testWebGPULinearSolver().catch(console.error);