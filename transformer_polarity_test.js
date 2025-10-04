#!/usr/bin/env node

/**
 * 變壓器極性診斷工具
 * 專門測試 MultiWindingTransformer 的 DOT 標記和極性
 * 目標：理解 SEC_DOT 和 SEC_NO_DOT 相對於初級的相位關係
 */

const path = require('path');
const srcDir = path.join(__dirname, 'src');

// 導入必要組件
const { VoltageSource } = require(path.join(srcDir, 'components/sources.js'));
const { Resistor } = require(path.join(srcDir, 'components/resistor.js'));
const { MultiWindingTransformer } = require(path.join(srcDir, 'components/transformer.js'));
const { MCPTransientAnalysis } = require(path.join(srcDir, 'analysis/transient_mcp.js'));

console.log('🔍 === 變壓器極性診斷工具 ===');
console.log('測試目標：理解 MultiWindingTransformer 的 DOT 標記含義');

// === 簡單變壓器測試電路 ===
const TEST_VOLTAGE = 100;    // 100V 測試電壓
const TURNS_RATIO = 4;       // 4:1 變壓比  
const TEST_FREQ = 1000;      // 1kHz 測試頻率（低頻便於觀察）

console.log(`\n=== 測試條件 ===`);
console.log(`初級電壓: ${TEST_VOLTAGE}V`);
console.log(`變壓比: ${TURNS_RATIO}:1`);
console.log(`測試頻率: ${TEST_FREQ}Hz`);

// 計算次級電感值
const Lm_primary = 1000e-6;  // 1mH 初級電感
const Lm_secondary = Lm_primary / (TURNS_RATIO * TURNS_RATIO); // 次級電感

console.log(`初級電感: ${(Lm_primary*1e3).toFixed(1)}mH`);
console.log(`次級電感: ${(Lm_secondary*1e6).toFixed(0)}μH`);

// === 測試電路組件 ===
const components = [
    // 1. 正弦波電壓源（便於觀察相位關係）
    new VoltageSource('V_TEST', ['PRIMARY_IN', 'GND'], 'SINE(0 10 1000)'),
    
    // 2. 測試變壓器
    new MultiWindingTransformer('T_TEST', {
        windings: [
            { 
                name: 'primary', 
                nodes: ['PRIMARY_IN', 'GND'], 
                inductance: Lm_primary
            },
            { 
                name: 'secondary', 
                nodes: ['SEC_DOT', 'SEC_NO_DOT'], 
                inductance: Lm_secondary
            }
        ],
        couplingMatrix: [
            [1.0, 0.99],    // 99% 耦合
            [0.99, 1.0]
        ]
    }),
    
    // 3. 次級負載（高阻抗，主要測量電壓）
    new Resistor('R_LOAD_DOT', ['SEC_DOT', 'GND'], 10000),      // 10kΩ
    new Resistor('R_LOAD_NO_DOT', ['SEC_NO_DOT', 'GND'], 10000) // 10kΩ
];

console.log(`\n=== 電路組成 ===`);
console.log(`組件數量: ${components.length}`);
console.log('1. V_TEST: 正弦波電壓源');
console.log('2. T_TEST: MultiWindingTransformer');  
console.log('3. R_LOAD_DOT: SEC_DOT 負載電阻');
console.log('4. R_LOAD_NO_DOT: SEC_NO_DOT 負載電阻');

// === 執行診斷仿真 ===
(async () => {
try {
    console.log(`\n=== 開始變壓器極性測試 ===`);
    
    // 創建分析器
    const analyzer = new MCPTransientAnalysis({
        debug: false,
        gmin: 1e-9,
        lcpDebug: false
    });
    
    // 仿真配置：觀察3個完整週期
    const config = {
        startTime: 0,
        stopTime: 3 / TEST_FREQ,    // 3個週期
        timeStep: 1 / (TEST_FREQ * 100), // 每週期100個點
        maxIterations: 100,
        tolerance: 1e-9
    };
    
    console.log(`仿真時間: ${(config.stopTime*1000).toFixed(1)}ms`);
    console.log(`時間步長: ${(config.timeStep*1e6).toFixed(1)}μs`);
    console.log(`預計步數: ${Math.floor(config.stopTime/config.timeStep)}`);
    
    const startTime = Date.now();
    
    // 執行仿真
    const results = await analyzer.run(components, config);
    
    const endTime = Date.now();
    const runtime = (endTime - startTime) / 1000;
    
    console.log(`\n✅ 仿真完成!`);
    console.log(`運行時間: ${runtime.toFixed(3)}s`);
    console.log(`實際步數: ${results?.timeVector?.length || 'N/A'}`);
    
    // === 極性分析 ===
    if (results && results.nodeVoltages && results.timeVector) {
        
        console.log(`\n📊 可用節點:`);
        const nodes = Array.from(results.nodeVoltages.keys());
        nodes.forEach(node => console.log(`  - ${node}`));
        
        const timeArray = results.timeVector;
        const primaryVoltages = results.nodeVoltages.get('PRIMARY_IN') || [];
        const secDotVoltages = results.nodeVoltages.get('SEC_DOT') || [];
        const secNoDotVoltages = results.nodeVoltages.get('SEC_NO_DOT') || [];
        
        if (primaryVoltages.length > 0 && secDotVoltages.length > 0) {
            
            // 分析穩態（後半段數據）
            const steadyStartIdx = Math.floor(timeArray.length * 0.5);
            const steadyPrimary = primaryVoltages.slice(steadyStartIdx);
            const steadySecDot = secDotVoltages.slice(steadyStartIdx);
            const steadySecNoDot = secNoDotVoltages.slice(steadyStartIdx);
            
            // 找到峰值和相位
            const primaryMax = Math.max(...steadyPrimary.map(v => Math.abs(v)));
            const secDotMax = Math.max(...steadySecDot.map(v => Math.abs(v)));
            const secNoDotMax = Math.max(...steadySecNoDot.map(v => Math.abs(v)));
            
            console.log(`\n🔍 === 極性診斷結果 ===`);
            console.log(`初級電壓峰值: ${primaryMax.toFixed(2)}V`);
            console.log(`SEC_DOT 峰值: ${secDotMax.toFixed(2)}V`);
            console.log(`SEC_NO_DOT 峰值: ${secNoDotMax.toFixed(2)}V`);
            
            // 計算實際變壓比
            const actualRatio = primaryMax / secDotMax;
            console.log(`實際變壓比: ${actualRatio.toFixed(2)}:1`);
            
            // 分析最後幾個時間點的瞬時值來判斷相位關係
            const lastIdx = steadyPrimary.length - 1;
            const primaryLast = steadyPrimary[lastIdx];
            const secDotLast = steadySecDot[lastIdx];
            const secNoDotLast = steadySecNoDot[lastIdx];
            
            console.log(`\n📈 === 瞬時值分析 ===`);
            console.log(`初級瞬時值: ${primaryLast.toFixed(3)}V`);
            console.log(`SEC_DOT 瞬時值: ${secDotLast.toFixed(3)}V`);
            console.log(`SEC_NO_DOT 瞬時值: ${secNoDotLast.toFixed(3)}V`);
            
            // 判斷極性關係
            const primarySign = Math.sign(primaryLast);
            const secDotSign = Math.sign(secDotLast);
            const secNoDotSign = Math.sign(secNoDotLast);
            
            console.log(`\n🎯 === 極性關係判斷 ===`);
            
            if (primarySign === secDotSign) {
                console.log(`✅ SEC_DOT 與初級 同相 (DOT端為正極性)`);
            } else {
                console.log(`❌ SEC_DOT 與初級 反相`);
            }
            
            if (primarySign === secNoDotSign) {
                console.log(`❌ SEC_NO_DOT 與初級 同相`);
            } else {
                console.log(`✅ SEC_NO_DOT 與初級 反相 (NO_DOT端為負極性)`);
            }
            
            // 差分電壓分析
            const secDiffVoltage = secDotLast - secNoDotLast;
            console.log(`SEC_DOT - SEC_NO_DOT = ${secDiffVoltage.toFixed(3)}V`);
            
            console.log(`\n🔧 === 整流電路建議 ===`);
            if (secDiffVoltage > 0) {
                console.log('對於正輸出電壓，應該：');
                console.log('- 二極體 D1: SEC_DOT → OUTPUT_POSITIVE');  
                console.log('- 二極體 D2: SEC_NO_DOT → OUTPUT_POSITIVE');
                console.log('- 中心抽頭應該連接到 OUTPUT_NEGATIVE');
            } else {
                console.log('檢測到異常極性，需要調整變壓器連接');
            }
            
        } else {
            console.log(`❌ 無法獲取足夠的電壓數據進行分析`);
        }
        
    } else {
        console.log(`❌ 仿真結果異常`);
    }
    
} catch (error) {
    console.error(`❌ 測試失敗:`, error.message);
    console.error(error.stack);
}

console.log(`\n🎉 === 變壓器極性診斷完成 ===`);
})();