/**
 * 專門針對二極體 LCP 問題的診斷
 */

console.log('🔍 二極體 LCP 問題深度診斷');

try {
    const { NetlistParser } = await import('./src/parser/netlist.js');
    const { DC_MCP_Solver } = await import('./src/analysis/dc_mcp_solver.js');
    
    console.log('\n1. 測試最基本的二極體正向偏置');
    
    // 強制正向偏置（應該導通）
    const forwardBiasCircuit = `
VIN 1 0 DC 5V
D1 1 2 Vf=0.7 Ron=10m
R1 2 0 1k
.END
`;

    let parser = new NetlistParser();
    let circuit = parser.parse(forwardBiasCircuit);
    
    console.log('   元件列表:');
    circuit.components.forEach((comp, i) => {
        console.log(`     ${i+1}. ${comp.name}: ${comp.constructor.name}`);
        if (comp.name === 'D1') {
            console.log(`        Vf=${comp.Vf}V, Ron=${comp.Ron}Ω`);
            console.log(`        節點: [${comp.nodes.join(', ')}] (陽極→陰極)`);
        }
    });
    
    const dcSolver = new DC_MCP_Solver();
    dcSolver.setDebug(true);
    
    try {
        const result = await dcSolver.solve(circuit.components);
        console.log('   ✅ 正向偏置二極體求解成功');
        console.log(`     V(1)=${result.nodeVoltages.get('1') || 'N/A'}V`);
        console.log(`     V(2)=${result.nodeVoltages.get('2') || 'N/A'}V`);
        console.log(`     Vd = V(1)-V(2) = ${(result.nodeVoltages.get('1') || 0) - (result.nodeVoltages.get('2') || 0)}V`);
    } catch (error) {
        console.log(`   ❌ 正向偏置失敗: ${error.message}`);
    }
    
    console.log('\n2. 測試反向偏置二極體');
    
    const reverseBiasCircuit = `
VIN 1 0 DC 0.5V
D1 1 2 Vf=0.7 Ron=10m  
R1 2 0 1k
.END
`;

    parser = new NetlistParser();
    circuit = parser.parse(reverseBiasCircuit);
    
    try {
        const result = await dcSolver.solve(circuit.components);
        console.log('   ✅ 反向偏置二極體求解成功');
        console.log(`     V(1)=${result.nodeVoltages.get('1') || 'N/A'}V`);
        console.log(`     V(2)=${result.nodeVoltages.get('2') || 'N/A'}V`);
        console.log(`     Vd = V(1)-V(2) = ${(result.nodeVoltages.get('1') || 0) - (result.nodeVoltages.get('2') || 0)}V`);
    } catch (error) {
        console.log(`   ❌ 反向偏置失敗: ${error.message}`);
    }
    
    console.log('\n3. 測試零偏置（邊界情況）');
    
    const zeroBiasCircuit = `
D1 1 0 Vf=0.7 Ron=10m
R1 1 0 1k
.END
`;

    parser = new NetlistParser();
    circuit = parser.parse(zeroBiasCircuit);
    
    try {
        const result = await dcSolver.solve(circuit.components);
        console.log('   ✅ 零偏置二極體求解成功');
        console.log(`     V(1)=${result.nodeVoltages.get('1') || 'N/A'}V`);
    } catch (error) {
        console.log(`   ❌ 零偏置失敗: ${error.message}`);
    }
    
    console.log('\n4. 檢查二極體 LCP 數學模型');
    
    // 手動檢查二極體的互補條件
    console.log('   理論檢查:');
    console.log('   二極體 LCP: w = Vd - Ron*Id - Vf');
    console.log('   互補條件: w ≥ 0, Id ≥ 0, w*Id = 0');
    console.log('');
    console.log('   情況 1: 正向導通 (Vd > Vf)');
    console.log('     應該有: Id > 0, w = 0');
    console.log('     即: Vd = Vf + Ron*Id');
    console.log('');
    console.log('   情況 2: 反向截止 (Vd < Vf)');  
    console.log('     應該有: Id = 0, w > 0');
    console.log('     即: w = Vd - Vf > 0');
    
    // 測試手動構造的 LCP 問題
    console.log('\n5. 檢查 LCP 求解器本身');
    
    const { LCPSolver } = await import('./src/core/mcp_solver.js');
    
    // 簡單的 1x1 LCP: w = 1*z + 1, w⊥z
    // 解應該是 z=0, w=1
    console.log('   測試 1x1 LCP: w = z + 1, w⊥z');
    
    const M1 = [[1]];
    const q1 = [1];
    
    const lcpSolver = new LCPSolver();
    try {
        const solution1 = lcpSolver.solve(M1, q1);
        console.log(`   ✅ 1x1 LCP 成功: z=${solution1.z}, w=${solution1.w}`);
    } catch (error) {
        console.log(`   ❌ 1x1 LCP 失敗: ${error.message}`);
    }
    
    // 測試二極體類型的 LCP: w = -z - 0.7, w⊥z
    // 這個問題應該無解（w<0 違反約束）
    console.log('   測試二極體類型 LCP: w = -z - 0.7, w⊥z');
    
    const M2 = [[-1]];
    const q2 = [-0.7];
    
    try {
        const solution2 = lcpSolver.solve(M2, q2);
        console.log(`   結果: z=${solution2.z}, w=${solution2.w}`);
    } catch (error) {
        console.log(`   ❌ 二極體 LCP 失敗: ${error.message}`);
        console.log('   這是預期的，因為該問題無解');
    }
    
} catch (error) {
    console.error('❌ 診斷失敗:', error.message);
    console.error(error.stack);
}

console.log('\n診斷完成！');