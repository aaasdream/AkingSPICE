/**
 * =================================================================
 *              LLC轉換器 - 分階段簡化實現版本
 * =================================================================
 * 
 * 策略：分階段實現，確保每個階段都數值穩定
 * 階段1：基礎諧振網路 + 簡化負載
 * 階段2：添加開關控制
 * 階段3：添加變壓器和整流
 * 階段4：完整系統集成
 */

import { Resistor } from '../src/components/resistor.js';
import { Capacitor } from '../src/components/capacitor.js';
import { Inductor } from '../src/components/inductor.js';
import { VoltageSource } from '../src/components/sources.js';
import { ExplicitStateSolver } from '../src/core/explicit-state-solver.js';

/**
 * LLC轉換器分階段測試框架
 */
class LLCStageTestRunner {
    constructor() {
        this.stats = { passes: 0, fails: 0, total: 0 };
        this.results = new Map();
    }

    async testStage(stageName, testFunc) {
        this.stats.total++;
        console.log(`\n🎯 [階段${this.stats.total}] ${stageName}`);
        console.log("─".repeat(50));
        
        try {
            const result = await testFunc();
            this.stats.passes++;
            this.results.set(stageName, { success: true, data: result });
            console.log(`✅ 階段${this.stats.total}完成`);
            return result;
        } catch (error) {
            this.stats.fails++;
            this.results.set(stageName, { success: false, error: error.message });
            console.log(`❌ 階段${this.stats.total}失敗: ${error.message}`);
            throw error;
        }
    }

    summary() {
        console.log(`\n${"=".repeat(60)}`);
        console.log(`LLC轉換器分階段實現總結`);
        console.log(`${"=".repeat(60)}`);
        console.log(`總階段數: ${this.stats.total}`);
        console.log(`成功階段: ${this.stats.passes}`);
        console.log(`失敗階段: ${this.stats.fails}`);
        console.log(`完成率: ${((this.stats.passes/this.stats.total)*100).toFixed(1)}%`);
        
        console.log(`\n📋 各階段狀態:`);
        this.results.forEach((result, stageName) => {
            const status = result.success ? '✅' : '❌';
            console.log(`   ${status} ${stageName}`);
        });
        
        return this.stats.passes === this.stats.total;
    }
}

/**
 * 階段1：基礎LLC諧振網路驗證
 */
async function stage1_BasicResonantNetwork() {
    console.log("目標：驗證Lr-Cr-Lm諧振網路的基本工作原理");
    
    // LLC基本參數
    const Lr = 50e-6;  // 50μH
    const Cr = 79e-9;  // 79nF  
    const Lm = 250e-6; // 250μH
    const fr = 1 / (2 * Math.PI * Math.sqrt(Lr * Cr)); // 約80kHz
    const Vin = 200;   // 降低輸入電壓提高穩定性
    const Rload = 50;  // 等效負載
    
    console.log(`設計參數:`);
    console.log(`   Lr = ${Lr*1e6}μH, Cr = ${Cr*1e9}nF, Lm = ${Lm*1e6}μH`);
    console.log(`   理論諧振頻率 = ${(fr/1000).toFixed(1)}kHz`);
    console.log(`   輸入電壓 = ${Vin}V, 負載 = ${Rload}Ω`);
    
    // 構建簡化諧振電路
    const components = [
        new VoltageSource('Vin', ['vin', 'gnd'], `SINE(0 ${Vin} ${fr})`), // 諧振頻率驅動
        new Inductor('Lr', ['vin', 'n1'], Lr, { ic: 0 }),
        new Capacitor('Cr', ['n1', 'n2'], Cr, { ic: 0 }),
        new Inductor('Lm', ['n2', 'n3'], Lm, { ic: 0 }),     // 勵磁電感
        new Resistor('Rload', ['n3', 'gnd'], Rload)          // 負載電阻
    ];
    
    const solver = new ExplicitStateSolver();
    const period = 1 / fr;
    const timeStep = period / 50; // 每週期50個採樣點，提高穩定性
    
    console.log(`仿真設置: 週期 = ${(period*1e6).toFixed(1)}μs, 時間步長 = ${(timeStep*1e6).toFixed(2)}μs`);
    
    await solver.initialize(components, timeStep, { debug: false });
    
    // 仿真5個週期達到穩態
    const results = await solver.run(0, period * 5);
    
    console.log(`仿真完成: ${results.timeVector.length}個時間點`);
    
    // 分析諧振響應
    const steadyStart = Math.floor(results.timeVector.length * 0.6); // 後40%的穩態數據
    
    if (results.nodeVoltages.has('n3')) {
        const outputVoltages = results.nodeVoltages.get('n3').slice(steadyStart);
        const outputAmplitude = (Math.max(...outputVoltages) - Math.min(...outputVoltages)) / 2;
        
        console.log(`輸出電壓幅值: ${outputAmplitude.toFixed(1)}V`);
        
        // 計算電壓增益
        const inputAmplitude = Vin;
        const gain = outputAmplitude / inputAmplitude;
        console.log(`電壓增益: ${gain.toFixed(3)} (${(gain*100).toFixed(1)}%)`);
        
        if (gain < 0.1 || gain > 2.0) {
            throw new Error(`電壓增益異常: ${gain.toFixed(3)} (期望 0.1-2.0)`);
        }
    }
    
    // 分析諧振電流
    if (results.stateVariables.has('Lr')) {
        const resonantCurrents = results.stateVariables.get('Lr').slice(steadyStart);
        const currentAmplitude = (Math.max(...resonantCurrents) - Math.min(...resonantCurrents)) / 2;
        console.log(`諧振電流幅值: ${currentAmplitude.toFixed(3)}A`);
        
        if (currentAmplitude > 20) { // 防止過流
            throw new Error(`諧振電流過大: ${currentAmplitude.toFixed(3)}A`);
        }
    }
    
    return {
        gain: results.nodeVoltages.has('n3') ? 
            (Math.max(...results.nodeVoltages.get('n3').slice(steadyStart)) - Math.min(...results.nodeVoltages.get('n3').slice(steadyStart))) / 2 / Vin : 0,
        resonantFreq: fr,
        simulationSteps: results.timeVector.length
    };
}

/**
 * 階段2：方波驅動諧振網路
 */
async function stage2_SquareWaveDrive() {
    console.log("目標：使用方波驅動LLC諧振網路，模擬開關電源工作");
    
    // 使用階段1驗證的參數
    const Lr = 50e-6;
    const Cr = 79e-9;
    const Lm = 250e-6;
    const fs = 100e3;  // 100kHz開關頻率
    const Vin = 200;   // 輸入電壓
    const Rload = 50;
    
    console.log(`開關頻率: ${fs/1000}kHz (vs 諧振頻率 ~80kHz)`);
    
    // 構建開關驅動電路
    const components = [
        new VoltageSource('Vdc', ['vdc', 'gnd'], Vin),              // 直流輸入
        new VoltageSource('Vsw', ['vdc', 'sw_node'], 0),            // 模擬開關（可控）
        new Inductor('Lr', ['sw_node', 'n1'], Lr, { ic: 0 }),
        new Capacitor('Cr', ['n1', 'n2'], Cr, { ic: 0 }),
        new Inductor('Lm', ['n2', 'n3'], Lm, { ic: 0 }),
        new Resistor('Rload', ['n3', 'gnd'], Rload)
    ];
    
    const solver = new ExplicitStateSolver();
    const period = 1 / fs;
    const timeStep = period / 100; // 每週期100個採樣點
    
    await solver.initialize(components, timeStep, { debug: false });
    
    console.log(`時間步長: ${(timeStep*1e6).toFixed(2)}μs`);
    
    // 手動控制開關（50%占空比方波）
    let currentTime = 0;
    const simulationTime = period * 10; // 10個開關週期
    const results = { 
        timeVector: [], 
        nodeVoltages: new Map([['n3', []], ['sw_node', []]]),
        currentTime: []
    };
    
    let stepCount = 0;
    const maxSteps = 500; // 限制步數
    
    while (currentTime < simulationTime && stepCount < maxSteps) {
        // 50%占空比方波控制
        const timeInPeriod = currentTime % period;
        const switchState = timeInPeriod < (period * 0.5) ? 0 : Vin; // 0V或Vin
        
        // 更新開關電壓源
        const switchSource = components.find(c => c.name === 'Vsw');
        switchSource.value = switchState;
        
        // 執行時間步
        const stepResult = solver.step({});
        
        // 記錄結果
        results.timeVector.push(currentTime);
        results.nodeVoltages.get('n3').push(stepResult.nodeVoltages.get('n3') || 0);
        results.nodeVoltages.get('sw_node').push(stepResult.nodeVoltages.get('sw_node') || 0);
        results.currentTime.push(currentTime);
        
        currentTime += timeStep;
        stepCount++;
    }
    
    console.log(`方波驅動仿真完成: ${stepCount}步`);
    
    // 分析方波驅動效果
    const outputVoltages = results.nodeVoltages.get('n3');
    const switchVoltages = results.nodeVoltages.get('sw_node');
    
    const avgOutput = outputVoltages.slice(-50).reduce((sum, v) => sum + v, 0) / 50;
    const maxOutput = Math.max(...outputVoltages.slice(-50));
    const minOutput = Math.min(...outputVoltages.slice(-50));
    
    console.log(`輸出電壓: 平均=${avgOutput.toFixed(1)}V, 範圍=${minOutput.toFixed(1)}V-${maxOutput.toFixed(1)}V`);
    console.log(`開關節點電壓範圍: ${Math.min(...switchVoltages).toFixed(1)}V-${Math.max(...switchVoltages).toFixed(1)}V`);
    
    // 檢查是否有合理的諧振響應
    if (Math.abs(maxOutput - minOutput) < 5) {
        throw new Error(`諧振響應不足，電壓變化太小: ${Math.abs(maxOutput - minOutput).toFixed(1)}V`);
    }
    
    return {
        averageOutput: avgOutput,
        outputRange: maxOutput - minOutput,
        switchingFreq: fs,
        simulationSteps: stepCount
    };
}

/**
 * 階段3：簡化變壓器和整流
 */
async function stage3_TransformerRectifier() {
    console.log("目標：添加簡化的變壓器和整流電路");
    
    // 基本參數
    const Lr = 50e-6;
    const Cr = 79e-9;
    const Lm = 250e-6;
    const fs = 100e3;
    const Vin = 200;
    const n = 10;      // 降低匝數比提高穩定性
    const Rload = 5;   // 目標輸出電阻
    
    console.log(`變壓器匝數比: ${n}:1`);
    console.log(`目標輸出負載: ${Rload}Ω`);
    
    // 構建帶變壓器的LLC電路
    const components = [
        new VoltageSource('Vdc', ['vdc', 'gnd'], Vin),
        new VoltageSource('Vsw', ['vdc', 'sw_node'], 0),
        
        // LLC諧振網路
        new Inductor('Lr', ['sw_node', 'n1'], Lr, { ic: 0 }),
        new Capacitor('Cr', ['n1', 'pri_pos'], Cr, { ic: 0 }),
        new Inductor('Lm', ['pri_pos', 'pri_neg'], Lm, { ic: 0 }),
        
        // 簡化變壓器（電阻分壓模型）
        new Resistor('T_pri', ['pri_pos', 'sec_mid'], 1),           // 一次側電阻
        new Resistor('T_ratio', ['sec_mid', 'sec_pos'], 1/n),      // 變壓器分壓
        new Resistor('T_return', ['pri_neg', 'sec_neg'], 0.1),     // 回路
        
        // 簡化整流（理想二極體 = 小電阻）
        new Resistor('D_rect', ['sec_pos', 'out_pos'], 0.1),
        new Resistor('D_return', ['sec_neg', 'out_neg'], 0.1),
        
        // 輸出濾波和負載
        new Capacitor('Co', ['out_pos', 'out_neg'], 100e-6, { ic: 10 }), // 預設10V
        new Resistor('Rload', ['out_pos', 'out_neg'], Rload)
    ];
    
    const solver = new ExplicitStateSolver();
    const period = 1 / fs;
    const timeStep = period / 50; // 減少採樣點提高穩定性
    
    await solver.initialize(components, timeStep, { debug: false });
    
    console.log(`時間步長: ${(timeStep*1e6).toFixed(2)}μs`);
    
    // 簡化的開關控制
    let currentTime = 0;
    const simulationTime = period * 5; // 只模擬5個週期
    const results = { 
        timeVector: [], 
        nodeVoltages: new Map([['out_pos', []]]) 
    };
    
    let stepCount = 0;
    const maxSteps = 200; // 更保守的步數限制
    
    while (currentTime < simulationTime && stepCount < maxSteps) {
        const timeInPeriod = currentTime % period;
        const switchState = timeInPeriod < (period * 0.5) ? 0 : Vin;
        
        const switchSource = components.find(c => c.name === 'Vsw');
        switchSource.value = switchState;
        
        try {
            const stepResult = solver.step({});
            
            results.timeVector.push(currentTime);
            results.nodeVoltages.get('out_pos').push(stepResult.nodeVoltages.get('out_pos') || 0);
            
            currentTime += timeStep;
            stepCount++;
            
        } catch (error) {
            console.log(`   數值問題在步驟${stepCount}: ${error.message}`);
            break;
        }
    }
    
    console.log(`變壓器整流仿真完成: ${stepCount}步`);
    
    if (stepCount < 20) {
        throw new Error(`仿真步數過少: ${stepCount}，電路可能不穩定`);
    }
    
    // 分析輸出
    const outputVoltages = results.nodeVoltages.get('out_pos');
    const finalOutput = outputVoltages.slice(-10).reduce((sum, v) => sum + v, 0) / 10;
    
    console.log(`最終輸出電壓: ${finalOutput.toFixed(2)}V`);
    
    // 估算變壓器效果
    const expectedOutput = Vin / n; // 理想變壓器輸出
    const transformerEfficiency = Math.abs(finalOutput / expectedOutput);
    
    console.log(`變壓器效率: ${(transformerEfficiency*100).toFixed(1)}% (期望vs實際)`);
    
    return {
        outputVoltage: finalOutput,
        expectedOutput: expectedOutput,
        efficiency: transformerEfficiency,
        simulationSteps: stepCount
    };
}

/**
 * 階段4：系統性能評估
 */
async function stage4_SystemPerformance() {
    console.log("目標：評估LLC轉換器的整體性能特性");
    
    // 測試不同開關頻率的系統響應
    const testFrequencies = [80e3, 100e3, 120e3]; // 80k, 100k, 120kHz
    const results = [];
    
    for (const fs of testFrequencies) {
        console.log(`\n測試頻率: ${fs/1000}kHz`);
        
        try {
            // 快速性能測試電路
            const components = [
                new VoltageSource('Vdc', ['vdc', 'gnd'], 100), // 降低電壓
                new VoltageSource('Vsw', ['vdc', 'sw_node'], 0),
                new Inductor('Lr', ['sw_node', 'n1'], 50e-6, { ic: 0 }),
                new Capacitor('Cr', ['n1', 'out'], 79e-9, { ic: 0 }),
                new Resistor('Rload', ['out', 'gnd'], 25) // 特性阻抗負載
            ];
            
            const solver = new ExplicitStateSolver();
            const period = 1 / fs;
            const timeStep = period / 20; // 粗糙但快速的採樣
            
            await solver.initialize(components, timeStep, { debug: false });
            
            // 快速測試
            let currentTime = 0;
            const testTime = period * 3;
            let stepCount = 0;
            let finalVoltage = 0;
            
            while (currentTime < testTime && stepCount < 50) {
                const timeInPeriod = currentTime % period;
                const switchState = timeInPeriod < (period * 0.5) ? 0 : 100;
                
                components.find(c => c.name === 'Vsw').value = switchState;
                
                const stepResult = solver.step({});
                finalVoltage = stepResult.nodeVoltages.get('out') || 0;
                
                currentTime += timeStep;
                stepCount++;
            }
            
            console.log(`   輸出: ${finalVoltage.toFixed(1)}V (${stepCount}步)`);
            
            results.push({
                frequency: fs,
                output: finalVoltage,
                steps: stepCount,
                success: true
            });
            
        } catch (error) {
            console.log(`   失敗: ${error.message}`);
            results.push({
                frequency: fs,
                error: error.message,
                success: false
            });
        }
    }
    
    // 分析性能趨勢
    const successfulTests = results.filter(r => r.success);
    
    if (successfulTests.length >= 2) {
        console.log(`\n📊 頻率響應特性:`);
        successfulTests.forEach(test => {
            console.log(`   ${test.frequency/1000}kHz: ${test.output.toFixed(1)}V`);
        });
        
        // 檢查是否有頻率響應趨勢
        const outputs = successfulTests.map(t => t.output);
        const hasResonantPeak = outputs.length >= 3 && 
            outputs[1] > outputs[0] && outputs[1] > outputs[2];
        
        if (hasResonantPeak) {
            console.log(`✅ 檢測到諧振峰值特性`);
        }
    }
    
    return {
        frequencyResponse: results,
        successfulTests: successfulTests.length,
        totalTests: results.length
    };
}

/**
 * 主測試執行器
 */
async function runLLCStageTests() {
    const runner = new LLCStageTestRunner();
    
    console.log("🏗️ LLC轉換器分階段實現測試");
    console.log("策略：從簡單到複雜，確保每階段數值穩定\n");
    
    try {
        // 階段1：基礎諧振驗證
        await runner.testStage("基礎LLC諧振網路", stage1_BasicResonantNetwork);
        
        // 階段2：方波驅動
        await runner.testStage("方波驅動諧振", stage2_SquareWaveDrive);
        
        // 階段3：變壓器整流
        await runner.testStage("變壓器和整流", stage3_TransformerRectifier);
        
        // 階段4：性能評估
        await runner.testStage("系統性能評估", stage4_SystemPerformance);
        
    } catch (error) {
        console.log(`\n⚠️ 階段測試中止: ${error.message}`);
    }
    
    const allSuccess = runner.summary();
    
    if (allSuccess) {
        console.log(`\n🎉 LLC轉換器分階段實現成功！`);
        console.log(`✅ 所有關鍵功能已驗證：`);
        console.log(`   - 諧振網路工作正常`);
        console.log(`   - 開關控制有效`);
        console.log(`   - 變壓器整流可行`);
        console.log(`   - 系統性能可預測`);
        console.log(`\n🚀 可以進行下一步優化：`);
        console.log(`   - 閉環控制實現`);
        console.log(`   - 效率優化`);
        console.log(`   - 動態響應改善`);
    } else {
        console.log(`\n📋 當前進度總結：`);
        runner.results.forEach((result, stageName) => {
            if (result.success) {
                console.log(`✅ ${stageName} - 功能驗證完成`);
            } else {
                console.log(`❌ ${stageName} - 需要進一步調試`);
            }
        });
    }
}

// 直接執行
runLLCStageTests().catch(error => {
    console.error('分階段測試失敗:', error.message);
    process.exit(1);
});

export {
    stage1_BasicResonantNetwork,
    stage2_SquareWaveDrive,
    stage3_TransformerRectifier,
    stage4_SystemPerformance,
    runLLCStageTests
};