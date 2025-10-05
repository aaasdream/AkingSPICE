// 調試連接和 PWM 信號
import { NetlistParser } from './src/parser/netlist.js';
import { MCPTransientAnalysis } from './src/analysis/transient_mcp.js';

// 標準 Buck 轉換器網表
const standardBuckNetlist = `
* Buck Converter Debug

VIN 1 0 DC 24V
M1 2 0 3 Ron=50m Vth=2V type=NMOS
D1 0 2 Vf=0.7V Ron=10m
L1 2 4 100uH
C1 4 0 220uF
RLOAD 4 0 5
VDRIVE 3 0 PULSE 0 15 0 10n 10n 5u 10u
`;

console.log('🔍 調試 Buck 轉換器連接和信號');

async function main() {
try {
    // 解析網表
    console.log('\n1. 解析網表...');
    const parser = new NetlistParser();
    const result = parser.parse(standardBuckNetlist);
    
    if (result.errors && result.errors.length > 0) {
        console.log('❌ 解析錯誤:');
        result.errors.forEach(error => console.log(`  ${error}`));
        process.exit(1);
    }
    
    console.log('✅ 網表解析成功');
    console.log(`   組件數: ${result.components.length}`);
    
    // 收集所有節點
    const nodes = new Set();
    result.components.forEach(comp => {
        if (comp.nodes) {
            comp.nodes.forEach(node => nodes.add(node));
        }
    });
    console.log(`   節點數: ${nodes.size}`);
    
    // 詳細顯示所有組件
    console.log('\n2. 組件詳情:');
    result.components.forEach((comp, index) => {
        console.log(`  [${index+1}] ${comp.constructor.name}: ${comp.name}`);
        if (comp.nodes) {
            console.log(`      節點: [${comp.nodes.join(', ')}]`);
        }
        if (comp.constructor.name === 'MOSFET_MCP') {
            console.log(`      參數: Ron=${comp.Ron}, Vth=${comp.Vth}, type=${comp.channelType}`);
            console.log(`      拓撲: Drain=${comp.drainNode}, Source=${comp.sourceNode}, Gate=${comp.gateNode}`);
        }
        if (comp.constructor.name === 'VoltageSource' && comp.name === 'VDRIVE') {
            console.log(`      PWM: ${comp.sourceConfig ? comp.sourceConfig.type : 'DC'}`);
            if (comp.sourceConfig && comp.sourceConfig.type === 'PULSE') {
                const p = comp.sourceConfig;
                console.log(`      參數: V1=${p.v1}V, V2=${p.v2}V, period=${(p.per*1e6).toFixed(1)}μs, width=${(p.pw*1e6).toFixed(1)}μs`);
                console.log(`      頻率: ${(1/p.per/1000).toFixed(0)}kHz, 工作週期: ${(p.pw/p.per*100).toFixed(1)}%`);
            }
        }
    });
    
    // 創建仿真
    console.log('\n3. 運行短時間仿真 (觀察前幾個週期)...');
    const analysis = new MCPTransientAnalysis(result.components, nodes);
    
    // PWM 週期是 10μs，運行 50μs (5個週期)
    const timeStep = 1e-6;  // 1μs
    const endTime = 50e-6;  // 50μs
    
    console.log(`   時間步長: ${timeStep*1e6}μs`);
    console.log(`   結束時間: ${endTime*1e6}μs`);
    console.log(`   預期步數: ${Math.ceil(endTime/timeStep)}`);
    
    const transientResult = await analysis.run(result.components, {
        timeStep: timeStep,
        endTime: endTime,
        maxTimeStep: timeStep * 2,
        minTimeStep: timeStep / 10,
        absoluteTolerance: 1e-12,
        relativeTolerance: 1e-6
    });
    
    console.log('✅ 仿真完成');
    console.log(`   實際步數: ${transientResult.timeVector.length}`);
    
    // 分析關鍵時刻的電壓
    console.log('\n4. 關鍵時刻電壓分析:');
    const times = transientResult.timeVector;
    const voltageMatrix = transientResult.voltageMatrix;
    const nodeNames = Array.from(nodes);
    
    // 找到對應的節點索引
    const gateNodeIndex = nodeNames.indexOf('3');
    const drainNodeIndex = nodeNames.indexOf('2'); 
    const outputNodeIndex = nodeNames.indexOf('4');
    
    console.log(`   Gate 節點(3) 索引: ${gateNodeIndex}`);
    console.log(`   Drain 節點(2) 索引: ${drainNodeIndex}`); 
    console.log(`   Output 節點(4) 索引: ${outputNodeIndex}`);
    
    // 檢查前幾個時間點的電壓
    for (let i = 0; i < Math.min(10, times.length); i++) {
        const t = times[i] * 1e6; // 轉換為 μs
        const vGate = gateNodeIndex >= 0 ? voltageMatrix[gateNodeIndex][i] : 'N/A';
        const vDrain = drainNodeIndex >= 0 ? voltageMatrix[drainNodeIndex][i] : 'N/A';
        const vOutput = outputNodeIndex >= 0 ? voltageMatrix[outputNodeIndex][i] : 'N/A';
        
        console.log(`   t=${t.toFixed(1)}μs: Vgate=${vGate}, Vdrain=${vDrain}, Vout=${vOutput}`);
    }
    
    // 檢查中間時刻
    console.log('\n   中間時刻:');
    const midIndex = Math.floor(times.length / 2);
    if (midIndex < times.length) {
        const t = times[midIndex] * 1e6;
        const vGate = gateNodeIndex >= 0 ? voltageMatrix[gateNodeIndex][midIndex] : 'N/A';
        const vDrain = drainNodeIndex >= 0 ? voltageMatrix[drainNodeIndex][midIndex] : 'N/A';
        const vOutput = outputNodeIndex >= 0 ? voltageMatrix[outputNodeIndex][midIndex] : 'N/A';
        
        console.log(`   t=${t.toFixed(1)}μs: Vgate=${vGate}, Vdrain=${vDrain}, Vout=${vOutput}`);
    }
    
    // 檢查最後幾個時刻
    console.log('\n   最後時刻:');
    for (let i = Math.max(0, times.length - 3); i < times.length; i++) {
        const t = times[i] * 1e6;
        const vGate = gateNodeIndex >= 0 ? voltageMatrix[gateNodeIndex][i] : 'N/A';
        const vDrain = drainNodeIndex >= 0 ? voltageMatrix[drainNodeIndex][i] : 'N/A';
        const vOutput = outputNodeIndex >= 0 ? voltageMatrix[outputNodeIndex][i] : 'N/A';
        
        console.log(`   t=${t.toFixed(1)}μs: Vgate=${vGate}, Vdrain=${vDrain}, Vout=${vOutput}`);
    }

} catch (error) {
    console.log('❌ 錯誤:', error.message);
    console.log('堆疊:', error.stack);
}