
/**
 * 測試增強的 MCP 求解器
 */

console.log('🧪 測試增強的 MCP 求解器');

try {
    const { createLCPSolver } = await import('./src/core/mcp_solver.js');
    
    // 測試 1: 使用增強 QP 求解器
    console.log('\n=== 測試 1: 增強 QP 求解器 ===');
    
    const solver = createLCPSolver({ 
        forceQP: true,  // 強制使用 QP
        debug: true 
    });
    
    // 創建一個具有挑戰性的 LCP 問題
    const { Matrix, Vector } = await import('./src/core/linalg.js');
    
    const M = new Matrix([
        [2.1, -1.0],
        [-1.0, 2.1]
    ]);
    
    const q = new Vector([-1.0, -1.0]);
    
    console.log('求解 LCP: w = Mz + q, w ≥ 0, z ≥ 0, w\'z = 0');
    console.log('M =', M.data);
    console.log('q =', q.data);
    
    const result = solver.solve(M, q);
    
    console.log('\n結果:');
    console.log('  收斂:', result.converged);
    console.log('  方法:', result.method);
    console.log('  迭代次數:', result.iterations);
    console.log('  z =', result.z?.map(x => x.toFixed(6)) || 'null');
    console.log('  w =', result.w?.map(x => x.toFixed(6)) || 'null');
    
    if (result.residualNorm !== undefined) {
        console.log('  殘差範數:', result.residualNorm.toExponential(3));
    }
    
    // 驗證解的正確性
    if (result.z && result.w) {
        const complementarity = result.z.reduce((sum, zi, i) => sum + zi * result.w[i], 0);
        console.log('  互補性 (w\'z):', complementarity.toExponential(6));
        
        const feasible = result.z.every(zi => zi >= -1e-10) && result.w.every(wi => wi >= -1e-10);
        console.log('  可行性:', feasible ? '✅' : '❌');
        
        if (feasible && Math.abs(complementarity) < 1e-8) {
            console.log('  ✅ 解驗證通過');
        } else {
            console.log('  ⚠️ 解可能不準確');
        }
    }
    
    console.log('\n測試完成！');
    
} catch (error) {
    console.error('❌ 測試失敗:', error.message);
    console.error(error.stack);
}