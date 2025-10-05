// 🔧 測試原始 Buck 轉換器網表

import AkingSPICE from './src/index.js';
import fs from 'fs';

console.log('🔧 測試原始 Buck 轉換器網表...\n');

try {
    // 讀取原始網表
    const netlist = fs.readFileSync('buck_converter_netlist.spice', 'utf8');
    console.log('📄 原始網表內容:');
    console.log(netlist);
    
    await (async () => {
        const circuit = new AkingSPICE();
        console.log('Loading netlist...');
        circuit.loadNetlist(netlist);
        
        console.log('\n📋 電路檢查:');
        console.log('組件數:', circuit.components.length);
        for (const comp of circuit.components) {
            if (comp.constructor.name === 'MOSFET_MCP') {
                console.log(`  ${comp.name}: MOSFET (${comp.drainNode}-${comp.gateNode}-${comp.sourceNode})`);
            } else if (comp.constructor.name === 'Diode_MCP') {
                console.log(`  ${comp.name}: Diode (${comp.nodes[0]}->${comp.nodes[1]})`);
            } else {
                console.log(`  ${comp.name}: ${comp.constructor.name}`);
            }
        }
        
        // 嘗試 DC 分析
        console.log('\n🔍 嘗試 DC-MCP 分析...');
        const dcResult = await circuit.runDCMCPAnalysis();
        
        if (dcResult && dcResult.converged) {
            console.log('✅ DC 分析成功!');
            console.log('節點電壓:');
            for (const [node, voltage] of dcResult.nodeVoltages) {
                console.log(`  ${node}: ${voltage.toFixed(3)}V`);
            }
        } else {
            console.log('⚠️ DC 分析失敗，但嘗試瞬態分析...');
        }
        
        // 嘗試瞬態分析
        console.log('\n🔍 嘗試瞬態分析...');
        const transientResult = circuit.runAnalysis('.TRAN 1u 10u');
        console.log('瞬態分析結果:', transientResult ? '成功' : '失敗');
        
    })();
    
} catch (error) {
    console.error('❌ 錯誤:', error.message);
}