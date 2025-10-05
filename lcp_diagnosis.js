/**
 * Buck 轉換器 LCP 問題診斷腳本
 * 專門診斷 "無界射線" 錯誤的根因
 */

console.log('🔍 Buck 轉換器 LCP 問題診斷');

try {
    // 導入必要模組
    const { NetlistParser } = await import('./src/parser/netlist.js');
    const { DC_MCP_Solver } = await import('./src/analysis/dc_mcp_solver.js');
    
    // 測試不同的簡化電路
    console.log('\n1. 測試最簡電路 - 只有電阻');
    
    const simpleCircuit = `
VIN 1 0 DC 24V
R1 1 0 5
.END
`;

    let parser = new NetlistParser();
    let circuit = parser.parse(simpleCircuit);
    
    let dcSolver = new DC_MCP_Solver();
    try {
        let result = await dcSolver.solve(circuit.components);
        console.log('   ✅ 簡單電路求解成功');
        console.log(`   節點1電壓: ${result.nodeVoltages.get('1') || 'N/A'}V`);
    } catch (error) {
        console.log(`   ❌ 簡單電路求解失敗: ${error.message}`);
    }
    
    console.log('\n2. 測試 RC 電路');
    
    const rcCircuit = `
VIN 1 0 DC 24V
R1 1 2 1k
C1 2 0 100uF IC=0
.END
`;

    parser = new NetlistParser();
    circuit = parser.parse(rcCircuit);
    
    dcSolver = new DC_MCP_Solver();
    try {
        let result = await dcSolver.solve(circuit.components);
        console.log('   ✅ RC 電路求解成功');
        console.log(`   節點1電壓: ${result.nodeVoltages.get('1') || 'N/A'}V`);
        console.log(`   節點2電壓: ${result.nodeVoltages.get('2') || 'N/A'}V`);
    } catch (error) {
        console.log(`   ❌ RC 電路求解失敗: ${error.message}`);
    }
    
    console.log('\n3. 測試只有 MOSFET 的電路');
    
    const mosfetCircuit = `
VIN 1 0 DC 24V
M1 1 2 0 NMOS Ron=10m Vth=2V
R1 2 0 5
.END
`;

    parser = new NetlistParser();
    circuit = parser.parse(mosfetCircuit);
    
    dcSolver = new DC_MCP_Solver();
    try {
        let result = await dcSolver.solve(circuit.components);
        console.log('   ✅ MOSFET 電路求解成功');
        console.log(`   節點1電壓: ${result.nodeVoltages.get('1') || 'N/A'}V`);
        console.log(`   節點2電壓: ${result.nodeVoltages.get('2') || 'N/A'}V`);
    } catch (error) {
        console.log(`   ❌ MOSFET 電路求解失敗: ${error.message}`);
    }
    
    console.log('\n4. 測試只有二極體的電路');
    
    const diodeCircuit = `
VIN 1 0 DC 24V
D1 1 2 Vf=0.7 Ron=10m
R1 2 0 5
.END
`;

    parser = new NetlistParser();
    circuit = parser.parse(diodeCircuit);
    
    dcSolver = new DC_MCP_Solver();
    try {
        let result = await dcSolver.solve(circuit.components);
        console.log('   ✅ 二極體電路求解成功');
        console.log(`   節點1電壓: ${result.nodeVoltages.get('1') || 'N/A'}V`);
        console.log(`   節點2電壓: ${result.nodeVoltages.get('2') || 'N/A'}V`);
    } catch (error) {
        console.log(`   ❌ 二極體電路求解失敗: ${error.message}`);
    }
    
    console.log('\n5. 測試 MOSFET + 二極體（無電感電容）');
    
    const switchCircuit = `
VIN 1 0 DC 24V
M1 1 2 3 NMOS Ron=10m Vth=2V
D1 0 2 Vf=0.7 Ron=10m
R1 2 0 5
VDRIVE 3 0 DC 15V
.END
`;

    parser = new NetlistParser();
    circuit = parser.parse(switchCircuit);
    
    dcSolver = new DC_MCP_Solver();
    try {
        let result = await dcSolver.solve(circuit.components);
        console.log('   ✅ 開關電路求解成功');
        console.log(`   節點1電壓: ${result.nodeVoltages.get('1') || 'N/A'}V`);
        console.log(`   節點2電壓: ${result.nodeVoltages.get('2') || 'N/A'}V`);
        console.log(`   節點3電壓: ${result.nodeVoltages.get('3') || 'N/A'}V`);
        
        // 檢查元件狀態
        console.log('\n   元件狀態:');
        circuit.components.forEach(comp => {
            if (comp.name === 'M1') {
                const op = comp.getOperatingPoint ? comp.getOperatingPoint() : { gateState: 'unknown' };
                console.log(`     MOSFET M1: ${op.gateState ? 'ON' : 'OFF'}`);
            }
            if (comp.name === 'D1') {
                const op = comp.getOperatingPoint ? comp.getOperatingPoint() : { state: 'unknown' };
                console.log(`     二極體 D1: ${op.state || op.conducting ? '導通' : '截止'}`);
            }
        });
        
    } catch (error) {
        console.log(`   ❌ 開關電路求解失敗: ${error.message}`);
    }
    
    console.log('\n6. 測試加入電感（無電容）');
    
    const inductorCircuit = `
VIN 1 0 DC 24V
M1 1 2 3 NMOS Ron=10m Vth=2V
D1 0 2 Vf=0.7 Ron=10m
L1 2 4 100uH IC=0
R1 4 0 5
VDRIVE 3 0 DC 15V
.END
`;

    parser = new NetlistParser();
    circuit = parser.parse(inductorCircuit);
    
    dcSolver = new DC_MCP_Solver();
    try {
        let result = await dcSolver.solve(circuit.components);
        console.log('   ✅ 含電感電路求解成功');
        console.log(`   節點2電壓: ${result.nodeVoltages.get('2') || 'N/A'}V`);
        console.log(`   節點4電壓: ${result.nodeVoltages.get('4') || 'N/A'}V`);
    } catch (error) {
        console.log(`   ❌ 含電感電路求解失敗: ${error.message}`);
    }
    
    console.log('\n7. 測試完整 Buck 電路');
    
    const fullBuckCircuit = `
VIN 1 0 DC 24V
M1 1 2 3 NMOS Ron=10m Vth=2V
D1 0 2 Vf=0.7 Ron=10m
L1 2 4 100uH IC=0
C1 4 0 220uF IC=0
RLOAD 4 0 5
VDRIVE 3 0 DC 15V
.END
`;

    parser = new NetlistParser();
    circuit = parser.parse(fullBuckCircuit);
    
    console.log(`   元件數量: ${circuit.components.length}`);
    circuit.components.forEach((comp, i) => {
        console.log(`     ${i+1}. ${comp.name} (${comp.constructor.name}) - 節點: [${comp.nodes.join(', ')}]`);
    });
    
    dcSolver = new DC_MCP_Solver();
    dcSolver.setDebug(true); // 開啟詳細調試
    
    try {
        let result = await dcSolver.solve(circuit.components);
        console.log('   ✅ 完整 Buck 電路求解成功');
        console.log(`   節點1電壓: ${result.nodeVoltages.get('1') || 'N/A'}V`);
        console.log(`   節點2電壓: ${result.nodeVoltages.get('2') || 'N/A'}V`);
        console.log(`   節點3電壓: ${result.nodeVoltages.get('3') || 'N/A'}V`);
        console.log(`   節點4電壓: ${result.nodeVoltages.get('4') || 'N/A'}V`);
    } catch (error) {
        console.log(`   ❌ 完整 Buck 電路求解失敗: ${error.message}`);
    }
    
    console.log('\n8. 檢查可能的問題:');
    
    // 檢查節點連接
    const nodeConnections = new Map();
    for (const component of circuit.components) {
        for (const node of component.nodes) {
            nodeConnections.set(node, (nodeConnections.get(node) || 0) + 1);
        }
        // 特別檢查 MOSFET 的 gate 節點
        if (component.gateNode) {
            nodeConnections.set(component.gateNode, (nodeConnections.get(component.gateNode) || 0) + 1);
        }
    }
    
    console.log('   節點連接統計:');
    for (const [node, count] of nodeConnections) {
        const status = count === 1 ? '⚠️  單一連接' : count > 4 ? '⚠️  過多連接' : '✅ 正常';
        console.log(`     節點 ${node}: ${count} 個連接 ${status}`);
    }
    
    // 檢查是否有浮動節點
    const floatingNodes = [];
    for (const [node, count] of nodeConnections) {
        if (count === 1 && node !== '0') {
            floatingNodes.push(node);
        }
    }
    
    if (floatingNodes.length > 0) {
        console.log(`   ⚠️  浮動節點: ${floatingNodes.join(', ')}`);
    }
    
    // 檢查元件參數
    console.log('\n   元件參數檢查:');
    circuit.components.forEach(comp => {
        if (comp.value === 0) {
            console.log(`     ⚠️  ${comp.name}: 零值可能導致奇異矩陣`);
        }
        if (comp.Ron && comp.Ron === 0) {
            console.log(`     ⚠️  ${comp.name}: 零電阻可能導致奇異矩陣`);
        }
        if (comp.value && Math.abs(comp.value) > 1e12) {
            console.log(`     ⚠️  ${comp.name}: 極大值可能導致數值問題`);
        }
    });
    
} catch (error) {
    console.error('❌ 診斷失敗:', error.message);
    console.error(error.stack);
}

console.log('\n診斷完成！');