/**
 * 🔍 LCP 失敗點深度診斷工具
 * 
 * 此工具用於詳細分析 Buck 轉換器在 t≈98μs 時 LCP 求解失敗的根本原因
 */

import { Matrix, Vector } from './src/core/linalg.js';
import { LCPSolver, QPSolver, createLCPSolver } from './src/core/mcp_solver.js';

console.log('🔍 Buck 轉換器 LCP 失敗深度診斷');

/**
 * 模擬在失敗時間點的典型 LCP 問題
 */
function simulateFailureLCP() {
    console.log('\n📊 模擬失敗時間點的 LCP 問題...');
    
    // 基於 Buck 轉換器在開關轉變時的典型 M 和 q
    // 這些數值來自開關瞬間的 MNA 矩陣和 RHS 向量
    const M_data = [
        [1e-3,    0,      0,      1e12  ],  // MOSFET 行：Ron vs Roff 極大差異
        [0,       2e-3,   0,      0     ],  // 二極體行：正常阻抗
        [0,       0,      1e-6,   0     ],  // 電感行：小阻抗
        [1e12,    0,      0,      1e-3  ]   // 互補約束行：條件數災難
    ];
    
    const q_data = [-0.7, 0.7, -1e-6, 1e-6];  // 典型 RHS，包含負值（導致互補性困難）
    
    const M = new Matrix(4, 4, M_data);
    const q = new Vector(4, q_data);
    
    // 分析矩陣條件
    console.log('\n📈 矩陣診斷：');
    console.log(`  M 矩陣規模: ${M.rows}×${M.cols}`);
    
    // 計算條件數估計
    let maxElement = 0, minElement = Infinity;
    for (let i = 0; i < M.rows; i++) {
        for (let j = 0; j < M.cols; j++) {
            const val = Math.abs(M.get(i, j));
            if (val > 1e-15) {
                maxElement = Math.max(maxElement, val);
                minElement = Math.min(minElement, val);
            }
        }
    }
    
    const conditionEstimate = maxElement / minElement;
    console.log(`  元素範圍: [${minElement.toExponential(2)}, ${maxElement.toExponential(2)}]`);
    console.log(`  條件數估計: ${conditionEstimate.toExponential(2)}`);
    
    // 分析 q 向量
    console.log('\n📊 q 向量診斷：');
    const qNorm = Math.sqrt(q_data.reduce((sum, x) => sum + x*x, 0));
    const qPositive = q_data.filter(x => x > 1e-12).length;
    const qNegative = q_data.filter(x => x < -1e-12).length;
    console.log(`  ||q|| = ${qNorm.toExponential(3)}`);
    console.log(`  q 分佈: +ve=${qPositive}, -ve=${qNegative}`);
    
    // 測試各種求解器
    console.log('\n🧪 求解器測試：');
    
    // 1. 標準 Lemke
    console.log('\n1️⃣ 標準 Lemke 算法：');
    const lemkeSolver = new LCPSolver({ debug: true, maxIterations: 10000 });
    try {
        const lemkeResult = lemkeSolver.solve(M, q);
        console.log(`   結果: ${lemkeResult.converged ? '✅ 成功' : '❌ 失敗'}`);
        if (!lemkeResult.converged) {
            console.log(`   錯誤: ${lemkeResult.error}`);
        }
    } catch (error) {
        console.log(`   異常: ${error.message}`);
    }
    
    // 2. QP 求解器
    console.log('\n2️⃣ QP 內點法：');
    const qpSolver = new QPSolver({ debug: true, tolerance: 1e-8 });
    try {
        const qpResult = qpSolver.solve(M, q);
        console.log(`   結果: ${qpResult.converged ? '✅ 成功' : '❌ 失敗'}`);
        if (!qpResult.converged) {
            console.log(`   錯誤: ${qpResult.error}`);
        }
    } catch (error) {
        console.log(`   異常: ${error.message}`);
    }
    
    // 3. 強健求解器
    console.log('\n3️⃣ 強健求解器（Lemke + QP + 正則化）：');
    const robustSolver = createLCPSolver({ 
        debug: true, 
        useRobustSolver: true,
        maxIterations: 15000 
    });
    try {
        const robustResult = robustSolver.solve(M, q);
        console.log(`   結果: ${robustResult.converged ? '✅ 成功' : '❌ 失敗'}`);
        if (robustResult.converged) {
            console.log(`   解的範數: ${Math.sqrt(robustResult.z.reduce((s, x) => s + x*x, 0)).toExponential(3)}`);
        } else {
            console.log(`   錯誤: ${robustResult.error}`);
        }
    } catch (error) {
        console.log(`   異常: ${error.message}`);
    }
    
    // 4. 極端正則化測試
    console.log('\n4️⃣ 極端正則化測試：');
    const M_reg = new Matrix(M_data.map(row => [...row])); // 深拷貝
    const reg = 1e-3; // 大正則化
    for (let i = 0; i < M_reg.rows; i++) {
        M_reg.set(i, i, M_reg.get(i, i) + reg);
    }
    
    console.log(`   應用正則化: ${reg.toExponential(2)}`);
    try {
        const regResult = lemkeSolver.solve(M_reg, q);
        console.log(`   結果: ${regResult.converged ? '✅ 成功' : '❌ 失敗'}`);
        if (regResult.converged) {
            console.log(`   解的範數: ${Math.sqrt(regResult.z.reduce((s, x) => s + x*x, 0)).toExponential(3)}`);
        }
    } catch (error) {
        console.log(`   異常: ${error.message}`);
    }
}

/**
 * 提供修復建議
 */
function provideSolutions() {
    console.log('\n🛠️ 修復建議：');
    console.log('');
    console.log('基於診斷結果，建議採用以下分級修復策略：');
    console.log('');
    console.log('🔧 Level 1: 數值穩定化');
    console.log('   • 增加 Gmin 到 1e-3（當前可能是 1e-6）');
    console.log('   • 限制 MOSFET Ron/Roff 比值 < 1e9');
    console.log('   • 在 MCP 構建時添加對角正則化');
    console.log('');
    console.log('🔧 Level 2: 算法改進');
    console.log('   • 實施 Pivoting LU 分解替代標準 LU');
    console.log('   • 在 QP 求解器中使用 Trust Region 方法');
    console.log('   • 添加 Matrix Scaling 預處理');
    console.log('');
    console.log('🔧 Level 3: 物理模型調整');
    console.log('   • 使用 Smooth Transition 模型替代 Sharp Switch');
    console.log('   • 在開關轉變區間採用指數插值');
    console.log('   • 實施自適應時間步長（已部分完成）');
    console.log('');
}

// 運行診斷
simulateFailureLCP();
provideSolutions();

console.log('\n✅ 診斷完成');