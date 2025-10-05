// 🔧 MOSFET Stamp 調試

import AkingSPICE from './src/index.js';

// 創建一個僅包含 MOSFET 的測試電路
const testNetlist = `
* 簡單 MOSFET 測試電路
VDC vin 0 DC 12
M1 out vin 0 M_MCP Ron=0.1 Vth=1.0
R1 out 0 10
.END
`;

console.log('🔧 開始 MOSFET stamp 調試...\n');

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
    
    // 手動運行一次 DC 分析，檢查 stamp 過程
    console.log('\n🔍 嘗試 DC-MCP 分析...');
    
    // 強制開啟調試信息
    console.log('🔧 強制開啟調試模式...');
    // 注意：調試模式需要在運行分析前設置
    
    const result = circuit.runDCMCPAnalysis();
    
} catch (error) {
    console.error('❌ 錯誤:', error.message);
    console.error('詳細堆疊:', error.stack);
}