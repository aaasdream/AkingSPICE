/**
 * 快速調試腳本 - 測試電壓源和DC分析
 */

import { 
    VoltageSource,
    Resistor,
    AkingSPICE
} from './src/index.js';

// 測試電壓源
console.log('=== 測試電壓源 ===');
const vsource = new VoltageSource('V1', ['vin', 'gnd'], 'DC 12');
console.log(`名稱: ${vsource.name}`);
console.log(`類型: ${vsource.type}`);
console.log(`值: ${vsource.value}`);
console.log(`源配置:`, vsource.sourceConfig);
console.log(`原始源: ${vsource.rawSource}`);

// 測試DC分析
console.log('\n=== 測試DC分析 ===');
const solver = new AkingSPICE();
const components = [
    new VoltageSource('V1', ['vin', 'gnd'], 12),
    new Resistor('R1', ['vin', 'vout'], 1000),
    new Resistor('R2', ['vout', 'gnd'], 2000)
];

solver.components = components;
try {
    const result = await solver.runDCMCPAnalysis();
    console.log('DC分析結果:');
    console.log('  節點電壓:');
    for (let [node, voltage] of result.nodeVoltages) {
        console.log(`    ${node}: ${voltage}V`);
    }
} catch (error) {
    console.error('DC分析失敗:', error.message);
}