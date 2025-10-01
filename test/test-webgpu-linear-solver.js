/**
 * WebGPU 線性求解器獨立測試
 * 
 * 目的：驗證 WebGPU 求解器的基本功能
 * 測試案例：簡單 2x2 矩陣求解
 * 
 * 問題背景：
 * 診斷測試發現GPU線性求解器返回零向量 [0,0] 而非正確解 [10V, 6.67V]
 * 需要隔離測試WebGPU線性求解核心功能
 */

import { WebGPUSolver } from '../src/core/webgpu-solver.js';

async function testWebGPULinearSolver() {
    console.log('🚀 WebGPU 線性求解器獨立測試');
    console.log('============================================================');
    
    try {
        // 1. 創建WebGPU求解器
        console.log('⚡ 初始化WebGPU求解器...');
        const solver = new WebGPUSolver({ debug: true });
        await solver.initialize();
        
        // 2. 設置測試矩陣 (來自診斷測試)
        // G矩陣 = [[1e6, -1e-3], [-1e-3, 1e6]]
        // RHS = [1e7, 0]
        // 理論解 = [10.000000, 6.666667]
        
        const testMatrix = [
            [1e6, -1e-3],
            [-1e-3, 1e6]
        ];
        
        const testRHS = [1e7, 0];
        const expectedSolution = [10.000000, 6.666667];
        
        console.log('\n📊 測試問題設置:');
        console.log('G矩陣:');
        console.log(`  [${testMatrix[0][0].toExponential(3)}, ${testMatrix[0][1].toExponential(3)}]`);
        console.log(`  [${testMatrix[1][0].toExponential(3)}, ${testMatrix[1][1].toExponential(3)}]`);
        console.log(`RHS向量: [${testRHS[0].toExponential(3)}, ${testRHS[1]}]`);
        console.log(`期望解: [${expectedSolution[0]}, ${expectedSolution[1]}]`);
        
        // 3. 手動設置電路數據 (不通過預處理器)
        const circuitData = {
            nodeCount: 2,
            stateCount: 0,
            gMatrix: {
                getDenseMatrix: () => testMatrix
            },
            initialStateVector: []
        };
        
        console.log('\n🔧 設置GPU電路數據...');
        solver.setupCircuit(circuitData);
        
        // 4. 測試線性求解
        console.log('\n⚙️ 執行GPU線性求解...');
        const startTime = performance.now();
        const solution = await solver.solveLinearSystem(testRHS);
        const solveTime = performance.now() - startTime;
        
        console.log(`✅ GPU求解完成 (${solveTime.toFixed(2)}ms)`);
        console.log(`GPU解向量: [${solution[0]}, ${solution[1]}]`);
        
        // 5. 計算誤差
        const error0 = Math.abs((solution[0] - expectedSolution[0]) / expectedSolution[0]) * 100;
        const error1 = Math.abs((solution[1] - expectedSolution[1]) / expectedSolution[1]) * 100;
        const maxError = Math.max(error0, error1);
        
        console.log('\n📈 精度分析:');
        console.log(`  節點0: GPU=${solution[0].toFixed(6)}, 期望=${expectedSolution[0]}, 誤差=${error0.toFixed(3)}%`);
        console.log(`  節點1: GPU=${solution[1].toFixed(6)}, 期望=${expectedSolution[1]}, 誤差=${error1.toFixed(3)}%`);
        console.log(`  最大誤差: ${maxError.toFixed(3)}%`);
        
        // 6. 測試結果評估
        let testStatus;
        if (maxError < 0.1) {
            testStatus = '✅ 優秀 (誤差 < 0.1%)';
        } else if (maxError < 1.0) {
            testStatus = '✅ 良好 (誤差 < 1%)';
        } else if (maxError < 10.0) {
            testStatus = '⚠️ 可接受 (誤差 < 10%)';
        } else if (maxError < 50.0) {
            testStatus = '❌ 需改進 (誤差 > 10%)';
        } else {
            testStatus = '❌ 失敗 (誤差 > 50%)';
        }
        
        console.log(`\n🎯 測試結果: ${testStatus}`);
        
        // 7. 驗證矩陣乘法 (A * x ≈ b)
        console.log('\n🔬 驗證矩陣乘法 Ax = b:');
        const verification = [
            testMatrix[0][0] * solution[0] + testMatrix[0][1] * solution[1],
            testMatrix[1][0] * solution[0] + testMatrix[1][1] * solution[1]
        ];
        
        const verifyError0 = Math.abs(verification[0] - testRHS[0]) / Math.abs(testRHS[0]) * 100;
        const verifyError1 = Math.abs(verification[1] - testRHS[1]) / Math.max(Math.abs(testRHS[1]), 1e-10) * 100;
        
        console.log(`  Ax[0] = ${verification[0].toExponential(3)}, b[0] = ${testRHS[0].toExponential(3)}, 誤差=${verifyError0.toFixed(3)}%`);
        console.log(`  Ax[1] = ${verification[1].toExponential(3)}, b[1] = ${testRHS[1]}, 誤差=${verifyError1.toFixed(3)}%`);
        
        // 8. 性能統計
        console.log('\n📊 性能統計:');
        console.log(`  GPU求解時間: ${solveTime.toFixed(2)}ms`);
        console.log(`  總迭代次數: ${solver.stats.totalIterations}`);
        console.log(`  平均迭代: ${solver.stats.averageIterations.toFixed(1)}`);
        
        // 清理資源
        solver.destroy();
        
        return {
            success: maxError < 50.0,
            maxError: maxError,
            solution: solution,
            expected: expectedSolution,
            verificationError: Math.max(verifyError0, verifyError1)
        };
        
    } catch (error) {
        console.error('❌ WebGPU測試失敗:', error);
        console.error('錯誤詳情:', error.stack);
        return {
            success: false,
            error: error.message
        };
    }
}

// 高級調試模式：測試不同矩陣條件數
async function testMatrixConditions() {
    console.log('\n🔬 高級測試：不同矩陣條件數');
    console.log('============================================================');
    
    const testCases = [
        {
            name: '良態矩陣 (condition number ≈ 1)',
            matrix: [[2, 1], [1, 2]],
            rhs: [3, 3],
            expected: [1, 1]
        },
        {
            name: '病態矩陣 (condition number ≈ 10^9)',
            matrix: [[1e6, -1e-3], [-1e-3, 1e6]],
            rhs: [1e7, 0],
            expected: [10.000000, 6.666667]
        },
        {
            name: '對角優勢矩陣',
            matrix: [[5, 1], [2, 6]],
            rhs: [6, 8],
            expected: [1, 1]
        }
    ];
    
    for (const testCase of testCases) {
        console.log(`\n⚡ 測試: ${testCase.name}`);
        
        try {
            const solver = new WebGPUSolver({ debug: false });
            await solver.initialize();
            
            const circuitData = {
                nodeCount: 2,
                stateCount: 0,
                gMatrix: {
                    getDenseMatrix: () => testCase.matrix
                },
                initialStateVector: []
            };
            
            solver.setupCircuit(circuitData);
            const solution = await solver.solveLinearSystem(testCase.rhs);
            
            const error0 = Math.abs((solution[0] - testCase.expected[0]) / testCase.expected[0]) * 100;
            const error1 = Math.abs((solution[1] - testCase.expected[1]) / testCase.expected[1]) * 100;
            const maxError = Math.max(error0, error1);
            
            console.log(`   GPU解: [${solution[0].toFixed(6)}, ${solution[1].toFixed(6)}]`);
            console.log(`   期望解: [${testCase.expected[0]}, ${testCase.expected[1]}]`);
            console.log(`   最大誤差: ${maxError.toFixed(3)}%`);
            
            solver.destroy();
            
        } catch (error) {
            console.error(`   ❌ 測試失敗: ${error.message}`);
        }
    }
}

// 執行測試
async function main() {
    const basicResult = await testWebGPULinearSolver();
    
    if (basicResult.success) {
        await testMatrixConditions();
    } else {
        console.log('\n❌ 基本測試失敗，跳過高級測試');
    }
}

// 運行測試
main().catch(error => {
    console.error('測試執行失敗:', error);
});