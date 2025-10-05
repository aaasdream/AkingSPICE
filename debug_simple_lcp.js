// 🔧 最簡單的 LCP 測試 - 只有一個二極管

import AkingSPICE from './src/index.js';

// 創建一個僅包含二極管的測試電路
const testNetlist = `
* 簡單二極管測試電路
VDC vin 0 DC 5
D1 vin 0 D_MCP Vf=0.7 Ron=0.01
.END
`;

console.log('🔧 開始最簡單的 LCP 測試...\n');

try {
    await (async () => {
        const circuit = new AkingSPICE();
    console.log('Loading netlist...');
    circuit.loadNetlist(testNetlist);
    
    console.log('\n📋 電路檢查:');
    console.log('組件數:', circuit.components.length);
    for (const comp of circuit.components) {
        console.log(`  ${comp.name}: ${comp.constructor.name}`);
        if (comp.constructor.name === 'Diode_MCP') {
            console.log(`    節點: ${comp.nodes[0]} -> ${comp.nodes[1]}`);
            console.log(`    參數: Vf=${comp.Vf}, Ron=${comp.Ron}`);
        }
    }
    
    // 嘗試 DC 分析
    console.log('\n🔍 嘗試 DC-MCP 分析...');
    const result = await circuit.runDCMCPAnalysis();
    
    if (result && result.converged) {
        console.log('✅ DC 分析成功!');
        console.log('節點電壓:');
        for (const [node, voltage] of result.nodeVoltages) {
            console.log(`  ${node}: ${voltage.toFixed(3)}V`);
        }
        console.log('支路電流:');
        for (const [branch, current] of result.branchCurrents) {
            console.log(`  ${branch}: ${current.toFixed(3)}A`);
        }
    } else {
        console.log('❌ DC 分析失敗:', result);
    }
    })();
    
} catch (error) {
    console.error('❌ 錯誤:', error.message);
    console.error('詳細堆疊:', error.stack);
}