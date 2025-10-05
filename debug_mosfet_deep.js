// 🔧 MOSFET Stamp 深度調試

import AkingSPICE from './src/index.js';

// 創建一個僅包含 MOSFET 的測試電路
const testNetlist = `
* 簡單 MOSFET 測試電路
VDC vin 0 DC 12
M1 out vin 0 M_MCP Ron=0.1 Vth=1.0
R1 out 0 10
.END
`;

console.log('🔧 開始 MOSFET stamp 深度調試...\n');

try {
    const circuit = new AkingSPICE();
    console.log('Loading netlist...');
    circuit.loadNetlist(testNetlist);
    
    // 獲取 MOSFET 組件
    const mosfet = circuit.components.find(c => c.name === 'M1');
    console.log('\n📋 MOSFET 狀態檢查:');
    console.log(`  名稱: ${mosfet.name}`);
    console.log(`  類型: ${mosfet.constructor.name}`);
    console.log(`  節點: D=${mosfet.drainNode}, G=${mosfet.gateNode}, S=${mosfet.sourceNode}`);
    console.log(`  參數: Ron=${mosfet.Ron}, Vth=${mosfet.Vth}`);
    console.log(`  閘極狀態: gateState=${mosfet.gateState}, gateVoltage=${mosfet.gateVoltage}`);
    
    // 直接嘗試 DC-MCP 分析，並在 DC-MCP 求解器中捕獲錯誤
    console.log('\n🔍 嘗試 DC-MCP 分析...');
    
    try {
        // 創建 DC-MCP 求解器並開啟調試
        const DC_MCP_Solver = (await import('./src/analysis/dc_mcp_solver.js')).default;
        const dcSolver = new DC_MCP_Solver();
        dcSolver.debug = true;  // 開啟求解器調試
        
        const result = dcSolver.solve(circuit.components, circuit.nodeMap);
        console.log('✅ DC-MCP 分析成功:', result);
        
    } catch (dcError) {
        console.log('❌ DC-MCP 分析失敗:', dcError.message);
        
        // 如果失敗，嘗試直接檢查 MNA 建構過程
        console.log('\n🔍 檢查 MNA 建構過程...');
        
        const MNA_LCP_Builder = (await import('./src/analysis/transient_mcp.js')).MNA_LCP_Builder;
        const builder = new MNA_LCP_Builder();
        builder.debug = true;  // 開啟建構器調試
        
        try {
            const mnaResult = builder.buildMNA_LCP_System(circuit.components, circuit.nodeMap, 0);
            console.log('MNA 系統建構成功');
        } catch (mnaError) {
            console.log('MNA 系統建構失敗:', mnaError.message);
        }
    }
    
} catch (error) {
    console.error('❌ 總體錯誤:', error.message);
    console.error('詳細堆疊:', error.stack);
}