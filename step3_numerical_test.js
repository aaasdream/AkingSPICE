// 步驟3：求解器數值問題測試
// 測試不同gmin值和時間步長對變壓器耦合的影響

import {
    VoltageSource, Resistor,
    MultiWindingTransformer,
    createMCPTransientAnalysis
} from './src/index.js';

async function testNumericalIssues() {
    console.log("🔧 步驟3：求解器數值問題測試");
    
    // 測試配置
    const testConfigs = [
        { gmin: 1e-9, timeStep: 2e-7, name: "原始配置" },
        { gmin: 1e-6, timeStep: 2e-7, name: "大gmin" },
        { gmin: 1e-6, timeStep: 1e-6, name: "大gmin+大步長" },
        { gmin: 1e-7, timeStep: 1e-6, name: "中gmin+大步長" }
    ];
    
    for (const config of testConfigs) {
        console.log(`\n🔍 測試: ${config.name} (gmin=${config.gmin}, dt=${config.timeStep})`);
        
        const components = [];
        
        // 理想DC電壓源  
        components.push(new VoltageSource('V_DC', ['VIN', 'GND'], 100)); // 降低到100V減少數值問題
        
        // 簡化變壓器 1:1匝比
        const transformer = new MultiWindingTransformer('T1', {
            windings: [
                { name: 'primary', nodes: ['VIN', 'GND'], inductance: 1000e-6 },      // 1mH
                { name: 'secondary', nodes: ['VOUT', 'GND'], inductance: 1000e-6 }    // 1mH, 1:1匝比
            ],
            couplingMatrix: [
                [1.0, 0.99],    // 簡化耦合
                [0.99, 1.0]
            ]
        });
        
        components.push(transformer);
        components.push(new Resistor('R_load', ['VOUT', 'GND'], 100));
        
        try {
            // 使用指定的gmin值
            const analysis = createMCPTransientAnalysis({ 
                debug: false, 
                gmin: config.gmin 
            });
            
            // 執行2步測試
            const result = await analysis.runTransient(components, {
                startTime: 0,
                stopTime: config.timeStep * 2,
                timeStep: config.timeStep,
                maxSteps: 2
            });
            
            const states = result.getAllStates();
            if (states.length >= 2) {
                const step1 = states[1];  // 第二步結果
                
                const vinVoltage = step1.voltages.get('VIN') || 0;
                const voutVoltage = step1.voltages.get('VOUT') || 0;
                
                console.log(`  VIN: ${vinVoltage.toFixed(3)}V, VOUT: ${voutVoltage.toFixed(6)}V`);
                
                // 檢查變壓器電流
                const primaryCurrent = step1.currents?.get('T1_primary') || 0;
                const secondaryCurrent = step1.currents?.get('T1_secondary') || 0;
                
                console.log(`  一次側電流: ${primaryCurrent.toExponential(3)}A`);
                console.log(`  次級電流: ${secondaryCurrent.toExponential(3)}A`);
                
                // 耦合效率評估
                const currentRatio = Math.abs(secondaryCurrent / primaryCurrent);
                if (currentRatio > 0.1) {
                    console.log(`  ✅ 耦合良好，電流比: ${currentRatio.toFixed(3)}`);
                } else {
                    console.log(`  ❌ 耦合失效，電流比: ${currentRatio.toExponential(2)}`);
                }
                
                if (Math.abs(voutVoltage) > 1) {
                    console.log(`  ✅ 電壓傳輸成功`);
                } else {
                    console.log(`  ❌ 電壓傳輸失敗`);
                }
            }
            
        } catch (err) {
            console.log(`  ❌ 測試失敗: ${err.message}`);
        }
    }
    
    console.log("\n🎯 最佳配置建議:");
    console.log("如果大gmin+大步長能改善耦合，則確認為數值問題");
    console.log("如果所有配置都失敗，則可能是MNA互感實現錯誤");
    
    console.log("\n✅ 步驟3測試完成");
}

testNumericalIssues();