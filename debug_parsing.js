// 專門調試 MOSFET 和 PWM 解析
import { NetlistParser } from './src/parser/netlist.js';

const testLine = "M1 2 0 3 Ron=50m Vth=2V type=NMOS";
const pwmLine = "VDRIVE 3 0 PULSE 0 15 0 10n 10n 5u 10u";

console.log('🔍 專項調試：MOSFET 和 PWM 解析');

const parser = new NetlistParser();

console.log('\n1. 測試 MOSFET 解析:');
console.log(`   輸入行: "${testLine}"`);

try {
    const tokens = testLine.split(/\s+/);
    console.log(`   分割標記: [${tokens.join(', ')}]`);
    console.log(`   標記數量: ${tokens.length}`);
    
    const mosfet = parser.parseMOSFET(tokens);
    console.log(`   ✅ 解析成功: ${mosfet.constructor.name}`);
    console.log(`   名稱: ${mosfet.name}`);
    console.log(`   節點: [${mosfet.nodes.join(', ')}] (數量: ${mosfet.nodes.length})`);
    console.log(`   參數: Ron=${mosfet.Ron}, Vth=${mosfet.Vth}, type=${mosfet.type}`);
    console.log(`   詳細拓撲:`);
    console.log(`     Drain: ${mosfet.nodes[0]}`);
    console.log(`     Source: ${mosfet.nodes[1]}`);
    console.log(`     Gate: ${mosfet.nodes[2]}`);
    
} catch (error) {
    console.log(`   ❌ 解析失敗: ${error.message}`);
}

console.log('\n2. 測試 PWM 電壓源解析:');
console.log(`   輸入行: "${pwmLine}"`);

try {
    const tokens = pwmLine.split(/\s+/);
    console.log(`   分割標記: [${tokens.join(', ')}]`);
    console.log(`   標記數量: ${tokens.length}`);
    
    const vSource = parser.parseVoltageSource(tokens);
    console.log(`   ✅ 解析成功: ${vSource.constructor.name}`);
    console.log(`   名稱: ${vSource.name}`);
    console.log(`   節點: [${vSource.nodes.join(', ')}]`);
    console.log(`   波形類型: ${vSource.waveform ? vSource.waveform.type : '未知'}`);
    
    console.log(`   sourceConfig:`, vSource.sourceConfig);
    
    if (vSource.sourceConfig && vSource.sourceConfig.type === 'PULSE') {
        const p = vSource.sourceConfig;
        console.log(`   PWM 參數:`);
        console.log(`     V1: ${p.v1}V, V2: ${p.v2}V`);
        console.log(`     週期: ${p.per}s, 脈波寬度: ${p.pw}s`);
        console.log(`     頻率: ${(1/p.per).toFixed(0)}Hz, 工作週期: ${(p.pw/p.per*100).toFixed(1)}%`);
    }
    
} catch (error) {
    console.log(`   ❌ 解析失敗: ${error.message}`);
}

console.log('\n3. 完整網表測試:');
const miniNetlist = `
VIN 1 0 DC 24V
M1 2 0 3 Ron=50m Vth=2V type=NMOS
VDRIVE 3 0 PULSE 0 15 0 10n 10n 5u 10u
`;

try {
    const result = parser.parse(miniNetlist);
    console.log(`   ✅ 完整網表解析成功，${result.components.length} 個組件`);
    
    result.components.forEach((comp, i) => {
        console.log(`   [${i+1}] ${comp.constructor.name}: ${comp.name}`);
        console.log(`       節點: [${comp.nodes.join(', ')}]`);
        
        if (comp.constructor.name === 'MOSFET_MCP') {
            console.log(`       Gate 節點: ${comp.nodes[2]}`);
        }
        
        if (comp.constructor.name === 'VoltageSource' && comp.waveform) {
            console.log(`       波形: ${comp.waveform.type}`);
        }
    });
    
} catch (error) {
    console.log(`   ❌ 完整解析失敗: ${error.message}`);
}