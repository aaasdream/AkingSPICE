// 最終診斷：無二極管變壓器電壓測試
// 直接測量次級電壓，確認變壓器能否產生足夠電壓

import {
    VoltageSource, Resistor, Capacitor, Inductor,
    MultiWindingTransformer,
    createMCPTransientAnalysis, TransientResult
} from './src/index.js';

async function finalDiagnosticTest() {
    console.log('🔬 最終診斷：無二極管變壓器電壓測試');
    
    // 使用已優化的配置
    const components = [
        // 理想PULSE電壓源
        new VoltageSource('V_HB_Driver', ['SW_MID', 'GND'], 
            {type: 'PULSE', vLow: 0, vHigh: 900, frequency: 200e3, dutyCycle: 0.5}),
        
        // 諧振電路
        new Inductor('Lr', ['SW_MID', 'RES'], 27e-6, 0),
        new Capacitor('Cr', ['RES', 'PRI_POS'], 47e-9, 100),
    ];
    
    // 優化的1:1匝比變壓器
    const transformer = new MultiWindingTransformer('T1', {
        windings: [
            { name: 'primary', nodes: ['PRI_POS', 'SW_MID'], inductance: 1000e-6 },
            { name: 'secondary', nodes: ['SEC_POS', 'SEC_NEG'], inductance: 1000e-6 }  // 單繞組次級
        ],
        couplingMatrix: [[1.0, 0.999], [0.999, 1.0]]  // 強耦合
    });
    
    components.push(transformer);
    
    // 直接負載（無二極管）
    components.push(new Resistor('R_Load', ['SEC_POS', 'SEC_NEG'], 50));
    
    try {
        console.log('⚡ 執行無二極管電壓測試...');
        
        // 使用優化的求解器設置
        const mcpSolver = createMCPTransientAnalysis({ debug: false, gmin: 1e-6 });
        const result = new TransientResult();
        
        let maxSecVoltage = 0;
        let voltageHistory = [];
        
        // 運行更多步驟觀察電壓變化
        for (let step = 0; step < 20; step++) {
            const currentTime = step * 2e-7;
            
            const stepResult = await mcpSolver.solveStep(components, currentTime, 2e-7, result);
            
            const secPos = stepResult.voltages.get('SEC_POS') || 0;
            const secNeg = stepResult.voltages.get('SEC_NEG') || 0;
            const secVoltage = secPos - secNeg;
            const priPos = stepResult.voltages.get('PRI_POS') || 0;
            const swMid = stepResult.voltages.get('SW_MID') || 0;
            const priVoltage = priPos - swMid;
            
            voltageHistory.push({
                step,
                time: currentTime * 1e6,  // µs
                priVoltage,
                secVoltage
            });
            
            if (Math.abs(secVoltage) > Math.abs(maxSecVoltage)) {
                maxSecVoltage = secVoltage;
            }
            
            // 每5步報告一次
            if (step % 5 === 0 || step === 19) {
                console.log(`📊 步驟${step}: t=${(currentTime*1e6).toFixed(2)}µs`);
                console.log(`  一次側電壓: ${priVoltage.toFixed(3)}V`);
                console.log(`  次級電壓: ${secVoltage.toFixed(3)}V`);
                console.log(`  電壓傳輸比: ${priVoltage !== 0 ? (secVoltage/priVoltage).toFixed(3) : 'N/A'}`);
            }
        }
        
        console.log('\n📈 診斷結果分析:');
        console.log(`🔍 最大次級電壓: ${maxSecVoltage.toFixed(3)}V`);
        
        if (Math.abs(maxSecVoltage) > 10) {
            console.log('✅ 變壓器電壓傳輸正常！次級電壓足夠');
            console.log('➡️ 問題確定在二極管導通條件或整流器配置');
            
            // 計算理論二極管導通需求
            console.log('\n🔋 二極管導通分析:');
            console.log(`理論導通電壓 (Si): ~0.7V`);
            console.log(`實際次級電壓: ${Math.abs(maxSecVoltage).toFixed(3)}V`);
            
            if (Math.abs(maxSecVoltage) > 0.7) {
                console.log('✅ 電壓足夠導通二極管，問題可能在整流器拓撲');
            } else {
                console.log('❌ 電壓不足導通二極管，需要提升變壓器電壓');
            }
            
        } else if (Math.abs(maxSecVoltage) > 0.1) {
            console.log('⚠️ 變壓器有微弱電壓傳輸，但不足驅動整流器');
            console.log('建議: 增加驅動電壓或優化變壓器參數');
            
        } else {
            console.log('❌ 變壓器電壓傳輸失敗，可能仍有耦合問題');
        }
        
        // 顯示電壓波形概要
        console.log('\n📊 電壓波形概要:');
        const nonZeroVoltages = voltageHistory.filter(h => Math.abs(h.secVoltage) > 0.001);
        if (nonZeroVoltages.length > 0) {
            console.log(`有效電壓變化: ${nonZeroVoltages.length}/20 步`);
            console.log(`電壓範圍: ${Math.min(...nonZeroVoltages.map(h => h.secVoltage)).toFixed(3)}V 到 ${Math.max(...nonZeroVoltages.map(h => h.secVoltage)).toFixed(3)}V`);
        } else {
            console.log('無有效電壓變化檢測到');
        }
        
    } catch (err) {
        console.log(`❌ 最終診斷測試失敗: ${err.message}`);
    }
    
    console.log('\n🎯 LLC轉換器問題診斷完成');
    console.log('📋 建議修復方案:');
    console.log('1. 如電壓足夠: 檢查二極管模型和整流器連接');
    console.log('2. 如電壓不足: 增加驅動電壓或調整變壓器匝比');
    console.log('3. 如無電壓: 進一步優化數值參數或檢查電路拓撲');
    
    console.log('\n✅ 診斷測試完成');
}

finalDiagnosticTest();