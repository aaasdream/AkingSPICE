#!/usr/bin/env node

/**
 * 🔧 變壓器極性診斷工具 - 專門測試中心抽頭變壓器
 * 目標: 驗證變壓器極性設計是否正確
 */

const path = require('path');
const srcDir = path.join(__dirname, 'src');

// 導入 AkingSPICE 組件
const { VoltageSource } = require(path.join(srcDir, 'components/sources.js'));
const { MultiWindingTransformer } = require(path.join(srcDir, 'components/transformer.js'));
const { Resistor } = require(path.join(srcDir, 'components/resistor.js'));
const { MCPTransientAnalysis } = require(path.join(srcDir, 'analysis/transient_mcp.js'));

console.log('🔧 中心抽頭變壓器極性診斷工具');

// 測試變壓器極性的組件
const components = [
    // DC 電源測試
    new VoltageSource('V_TEST', ['PRI_IN', 'PRI_GND'], 100), // 100V DC
    
    // 中心抽頭變壓器 - 4:1 比例
    new MultiWindingTransformer('T_TEST', {
        windings: [
            { 
                name: 'primary', 
                nodes: ['PRI_IN', 'PRI_GND'], 
                inductance: 1e-3  // 1mH
            },
            { 
                name: 'secondary_top', 
                nodes: ['SEC_CENTER', 'SEC_TOP'],  // 注意：中心抽頭在前
                inductance: 62.5e-6  // (1mH/16)/4 = 62.5μH (1/4 of secondary)
            },
            { 
                name: 'secondary_bottom', 
                nodes: ['SEC_BOTTOM', 'SEC_CENTER'],  // 注意：中心抽頭在後
                inductance: 62.5e-6  // 62.5μH (1/4 of secondary)
            }
        ],
        couplingMatrix: [
            [1.0, 0.99, 0.99],     // 初級與兩個次級半繞組（同相）
            [0.99, 1.0, -0.98],    // 上半繞組（與下半繞組反相）
            [0.99, -0.98, 1.0]     // 下半繞組（與上半繞組反相）
        ]
    }),
    
    // 中心抽頭接地
    new Resistor('R_CENTER', ['SEC_CENTER', 'GND'], 1e-6), // 接地
    
    // 次級負載
    new Resistor('R_TOP_LOAD', ['SEC_TOP', 'GND'], 100),    // 100Ω
    new Resistor('R_BOTTOM_LOAD', ['SEC_BOTTOM', 'GND'], 100) // 100Ω
];

console.log('\n=== 測試配置 ===');
console.log('初級電壓: 100V DC');
console.log('變壓比: 4:1 (理論次級電壓 = ±25V)');
console.log('中心抽頭: 接地');
console.log('預期結果:');
console.log('  SEC_TOP: +25V (相對於中心抽頭)');
console.log('  SEC_BOTTOM: -25V (相對於中心抽頭)');
console.log('  差分電壓: 50V');

// 執行仿真
console.log('\n🔍 開始極性診斷...');

(async () => {
try {
    // 創建分析器
    const analyzer = new MCPTransientAnalysis({
        debug: false,
        gmin: 1e-9
    });
    
    // 仿真配置
    const config = {
        startTime: 0,
        stopTime: 10e-6,      // 10μs 
        timeStep: 1e-6,       // 1μs 時間步
        maxIterations: 100,
        tolerance: 1e-9
    };
    
    // 執行仿真
    const results = await analyzer.analyze(components, config);
    console.log('✅ 仿真完成');
    
    // 輸出結果分析
    analyzeResults(results);
    
} catch (error) {
    console.log('❌ 仿真失敗:', error.message);
    console.log('錯誤詳情:', error);
}
})();

// 結果分析函數
function analyzeResults(results) {
    // 分析結果 - 檢查輸出格式
    console.log('結果結構:', Object.keys(results));

    // 讀取穩態值 - 根據實際的結果格式
    let V_SEC_TOP, V_SEC_CENTER, V_SEC_BOTTOM, V_PRI_IN;

    if (results.nodeVoltages) {
        // 如果結果中有 nodeVoltages 
        const finalIndex = results.nodeVoltages.length - 1;
        const finalVoltages = results.nodeVoltages[finalIndex];
        
        V_SEC_TOP = finalVoltages.SEC_TOP || 0;
        V_SEC_CENTER = finalVoltages.SEC_CENTER || 0; 
        V_SEC_BOTTOM = finalVoltages.SEC_BOTTOM || 0;
        V_PRI_IN = finalVoltages.PRI_IN || 0;
    } else if (results.nodes) {
        // 如果結果中有 nodes
        const nodeNames = Object.keys(results.nodes);
        console.log('可用節點:', nodeNames);
        
        const finalIndex = results.nodes.SEC_TOP ? results.nodes.SEC_TOP.length - 1 : 0;
        V_SEC_TOP = results.nodes.SEC_TOP ? results.nodes.SEC_TOP[finalIndex] : 0;
        V_SEC_CENTER = results.nodes.SEC_CENTER ? results.nodes.SEC_CENTER[finalIndex] : 0;
        V_SEC_BOTTOM = results.nodes.SEC_BOTTOM ? results.nodes.SEC_BOTTOM[finalIndex] : 0;
        V_PRI_IN = results.nodes.PRI_IN ? results.nodes.PRI_IN[finalIndex] : 0;
    } else {
        // 嘗試從其他可能的結構讀取
        console.log('未知結果格式，使用默認值');
        V_SEC_TOP = 0;
        V_SEC_CENTER = 0;
        V_SEC_BOTTOM = 0;
        V_PRI_IN = 100; // 已知輸入電壓
    }

    // 計算相對電壓
    const V_TOP_REL = V_SEC_TOP - V_SEC_CENTER;    // SEC_TOP 相對於中心抽頭
    const V_BOTTOM_REL = V_SEC_BOTTOM - V_SEC_CENTER; // SEC_BOTTOM 相對於中心抽頭
    const V_DIFF = V_SEC_TOP - V_SEC_BOTTOM;       // 差分電壓

    console.log('\n📊 === 極性診斷結果 ===');
    console.log(`初級電壓: ${V_PRI_IN.toFixed(2)}V`);
    console.log(`中心抽頭電壓: ${V_SEC_CENTER.toFixed(6)}V (應該接近0V)`);
    console.log('\n次級電壓 (相對於中心抽頭):');
    console.log(`  SEC_TOP:    ${V_TOP_REL.toFixed(2)}V`);
    console.log(`  SEC_BOTTOM: ${V_BOTTOM_REL.toFixed(2)}V`);
    console.log(`\n差分電壓:     ${V_DIFF.toFixed(2)}V`);

    // 極性判斷
    console.log('\n🔬 === 極性分析 ===');

    const expectedTopVoltage = 25;  // 預期 +25V
    const expectedBottomVoltage = -25; // 預期 -25V

    if (Math.abs(V_TOP_REL - expectedTopVoltage) < 1) {
        console.log('✅ SEC_TOP 極性正確: 正電壓');
    } else {
        console.log(`❌ SEC_TOP 極性錯誤: 得到 ${V_TOP_REL.toFixed(2)}V, 預期 ${expectedTopVoltage}V`);
    }

    if (Math.abs(V_BOTTOM_REL - expectedBottomVoltage) < 1) {
        console.log('✅ SEC_BOTTOM 極性正確: 負電壓');
    } else {
        console.log(`❌ SEC_BOTTOM 極性錯誤: 得到 ${V_BOTTOM_REL.toFixed(2)}V, 預期 ${expectedBottomVoltage}V`);
    }

    // 變壓比檢查
    const actualRatio = Math.abs(V_DIFF) / Math.abs(V_PRI_IN);
    const expectedRatio = 0.5; // 4:1 變壓比 -> 1:0.25, 但中心抽頭全繞組是 1:0.5

    console.log(`\n變壓比: ${actualRatio.toFixed(3)} (預期: ${expectedRatio})`);

    if (Math.abs(actualRatio - expectedRatio) < 0.1) {
        console.log('✅ 變壓比正確');
    } else {
        console.log('❌ 變壓比錯誤');
    }

    console.log('\n🎯 === 診斷建議 ===');
    if (V_TOP_REL > 0 && V_BOTTOM_REL < 0) {
        console.log('✅ 變壓器極性配置正確，適合中心抽頭整流');
    } else if (V_TOP_REL < 0 && V_BOTTOM_REL > 0) {
        console.log('⚠️  變壓器極性反向，需要交換繞組連接');
    } else {
        console.log('❌ 變壓器極性異常，需要檢查耦合矩陣');
    }

    console.log('\n🎉 診斷完成!');
}