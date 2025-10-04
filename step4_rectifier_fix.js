// 步驟4：整流器診斷和阻抗匹配修復
// 已確認變壓器耦合工作(gmin=1e-6)，現在查看次級電壓和整流問題

import {
    VoltageSource, Resistor, Capacitor, Inductor,
    createMCPDiode, MultiWindingTransformer,
    createMCPTransientAnalysis, TransientResult
} from './src/index.js';

async function step4RectifierAnalysis() {
    console.log('🔧 步驟4：整流器和阻抗匹配修復');
    
    // 使用修復後的數值配置
    const components = [
        new VoltageSource('V_HB_Driver', ['SW_MID', 'GND'], 
            {type: 'PULSE', vLow: 0, vHigh: 900, frequency: 200e3, dutyCycle: 0.5}),
        
        new Inductor('Lr', ['SW_MID', 'RES'], 27e-6, 0),
        new Capacitor('Cr', ['RES', 'PRI_POS'], 47e-9, 100),
    ];
    
    // 測試1：調整變壓器匝比改善阻抗匹配
    console.log('\n🔍 測試1：優化匝比 1:1 (原為1:2)');
    
    const transformer1 = new MultiWindingTransformer('T1', {
        windings: [
            { name: 'primary', nodes: ['PRI_POS', 'SW_MID'], inductance: 1000e-6 },    // 1mH
            { name: 'secondary', nodes: ['SEC_POS', '0'], inductance: 1000e-6 },        // 1mH，1:1匝比
            { name: 'secondary2', nodes: ['0', 'SEC_NEG'], inductance: 1000e-6 }       // 1mH
        ],
        couplingMatrix: [[1.0, 0.999, 0.999], [0.999, 1.0, -1.0], [0.999, -1.0, 1.0]]
    });
    
    components.push(transformer1);
    
    // 簡化整流器和負載
    components.push(createMCPDiode('D1', ['SEC_POS', 'VOUT']));
    components.push(createMCPDiode('D2', ['SEC_NEG', 'VOUT']));
    components.push(new Capacitor('Co', ['VOUT', 'GND'], 100e-6, 0));  // 減小輸出電容
    components.push(new Resistor('R_Load', ['VOUT', 'GND'], 50));       // 增大負載阻抗
    
    try {
        const mcpSolver = createMCPTransientAnalysis({ debug: false, gmin: 1e-6 });  // 使用修復的gmin
        const result = new TransientResult();
        
        console.log('⚡ 執行5步快速測試...');
        
        for (let step = 0; step < 5; step++) {
            const currentTime = step * 1e-6;  // 使用較大時間步長
            
            const stepResult = await mcpSolver.solveStep(components, currentTime, 1e-6, result);
            
            if (step === 4) {
                const vout = stepResult.voltages.get('VOUT') || 0;
                const secPos = stepResult.voltages.get('SEC_POS') || 0;
                const secNeg = stepResult.voltages.get('SEC_NEG') || 0;
                const priPos = stepResult.voltages.get('PRI_POS') || 0;
                
                console.log(`📊 1:1匝比結果:`);
                console.log(`  一次側電壓: ${priPos.toFixed(3)}V`);
                console.log(`  次級電壓 SEC_POS: ${secPos.toFixed(3)}V`);
                console.log(`  次級電壓 SEC_NEG: ${secNeg.toFixed(3)}V`);
                console.log(`  次級差壓: ${(secPos - secNeg).toFixed(3)}V`);
                console.log(`  輸出電壓 VOUT: ${vout.toFixed(3)}V`);
                
                if (Math.abs(vout) > 0.1) {
                    console.log(`  ✅ 1:1匝比成功產生輸出！`);
                } else if (Math.abs(secPos - secNeg) > 0.1) {
                    console.log(`  ⚠️ 有次級電壓但無輸出，整流器問題`);
                } else {
                    console.log(`  ❌ 仍無有效電壓傳輸`);
                }
            }
        }
        
    } catch (err) {
        console.log(`❌ 1:1匝比測試失敗: ${err.message}`);
    }
    
    // 測試2：去除二極管，直接測試變壓器電壓傳輸
    console.log('\n🔍 測試2：去除整流器，直接測量次級電壓');
    
    const components2 = [
        new VoltageSource('V_HB_Driver', ['SW_MID', 'GND'], 
            {type: 'PULSE', vLow: 0, vHigh: 100, frequency: 200e3, dutyCycle: 0.5}),  // 降低驅動電壓
            
        new Inductor('Lr', ['SW_MID', 'RES'], 50e-6, 0),
        new Capacitor('Cr', ['RES', 'PRI_POS'], 100e-9, 50),
    ];
    
    const transformer2 = new MultiWindingTransformer('T1', {
        windings: [
            { name: 'primary', nodes: ['PRI_POS', 'SW_MID'], inductance: 500e-6 },
            { name: 'secondary', nodes: ['SEC_POS', 'SEC_NEG'], inductance: 500e-6 }   // 單繞組次級
        ],
        couplingMatrix: [[1.0, 0.99], [0.99, 1.0]]  // 簡化耦合
    });
    
    components2.push(transformer2);
    components2.push(new Resistor('R_Load', ['SEC_POS', 'SEC_NEG'], 100));  // 直接連接負載
    
    try {
        const mcpSolver2 = createMCPTransientAnalysis({ debug: false, gmin: 1e-6 });
        const result2 = new TransientResult();
        
        for (let step = 0; step < 3; step++) {
            const currentTime = step * 1e-6;
            
            const stepResult = await mcpSolver2.solveStep(components2, currentTime, 1e-6, result2);
            
            if (step === 2) {
                const secPos = stepResult.voltages.get('SEC_POS') || 0;
                const secNeg = stepResult.voltages.get('SEC_NEG') || 0;
                const secDiff = secPos - secNeg;
                
                console.log(`📊 簡化變壓器結果:`);
                console.log(`  次級差壓: ${secDiff.toFixed(3)}V`);
                
                if (Math.abs(secDiff) > 1) {
                    console.log(`  ✅ 變壓器電壓傳輸正常`);
                } else {
                    console.log(`  ❌ 變壓器電壓傳輸不足`);
                }
            }
        }
        
    } catch (err) {
        console.log(`❌ 簡化測試失敗: ${err.message}`);
    }
    
    console.log('\n🎯 步驟4診斷結論:');
    console.log('- 如果1:1匝比產生輸出，則原匝比不當');
    console.log('- 如果簡化變壓器有電壓，則整流器配置有問題');
    console.log('- 如果都沒輸出，則需要進一步增大gmin或調整參數');
    
    console.log('\n✅ 步驟4完成');
}

step4RectifierAnalysis();