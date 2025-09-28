/**
 * =================================================================
 *               基於工作半橋電路的LLC轉換器構建
 * =================================================================
 * 
 * 基於驗證成功的半橋諧振電路，逐步添加LLC功能
 */

import { AkingSPICE, VoltageSource, Inductor, Capacitor, Resistor, VoltageControlledMOSFET as VCMOSFET } from './src/index.js';

class WorkingLLCBuilder {
    constructor() {
        this.results = [];
    }

    async buildLLCStep1() {
        console.log("🔧 Step 1: 驗證PULSE電壓源的LLC基礎電路...\n");
        
        const frequency = 35000; // 35kHz (低於諧振頻率70kHz)
        const period = 1.0 / frequency;
        const timeStep = period / 20; // 用最佳時間步長！
        
        const solver = new AkingSPICE();
        
        solver.components = [
            // PULSE半橋電壓源 (模擬MOSFET對)
            new VoltageSource('Vbridge', ['bridge', '0'], `PULSE(0 400 0 1e-9 1e-9 ${period*0.5} ${period})`),
            
            // LLC諧振電路
            new Inductor('Llr', ['bridge', 'cr_a'], 25e-6),    // 諧振電感
            new Capacitor('Cr', ['cr_a', 'cr_b'], 207e-9),      // 諧振電容  
            new Inductor('Lm', ['cr_b', '0'], 200e-6),          // 勵磁電感 (到地)
            
            // 簡單整流+濾波 (模擬變壓器+整流器)
            new Resistor('Rtransform', ['cr_b', 'transformed'], 0.1), // 模擬變壓器阻抗
            new VoltageSource('Vrectifier', ['rectified', '0'], 'DC(0)'), // 簡化整流器
            
            // 輸出濾波
            new Capacitor('Cout', ['rectified', '0'], 470e-6),
            new Resistor('Rload', ['rectified', '0'], 2.4)       // 48V/20A = 2.4Ω
        ];
        
        solver.isInitialized = true;
        
        const results = await solver.runSteppedSimulation(() => ({}), {
            stopTime: period * 20,
            timeStep: timeStep
        });
        
        this.analyzeResults(results, "PULSE半橋LLC");
        return results;
    }

    async buildLLCStep2() {
        console.log("\n🔧 Step 2: 用VCMOSFET替換PULSE電壓源...\n");
        
        const frequency = 35000;
        const period = 1.0 / frequency;
        const timeStep = period / 20;
        const dutyCycle = 0.5;
        
        const solver = new AkingSPICE();
        
        solver.components = [
            // 輸入電壓
            new VoltageSource('Vin', ['vin', '0'], 400),
            
            // 閘極驅動信號 (用PULSE電壓源)
            new VoltageSource('Vg1', ['g1', '0'], `PULSE(0 15 0 1e-9 1e-9 ${period*dutyCycle} ${period})`),
            new VoltageSource('Vg2', ['g2', '0'], `PULSE(15 0 0 1e-9 1e-9 ${period*dutyCycle} ${period})`), // 互補
            
            // VCMOSFET半橋 (用靜態參數)
            new VCMOSFET('Q1', ['vin', 'g1', 'bridge'], { // drain, gate, source
                Vth: 3,
                Ron: 0.05,
                modelType: 'NMOS'
            }),
            new VCMOSFET('Q2', ['bridge', 'g2', '0'], { // drain, gate, source
                Vth: 3,
                Ron: 0.05,
                modelType: 'NMOS'
            }),
            
            // LLC諧振電路 (相同配置)
            new Inductor('Llr', ['bridge', 'cr_a'], 25e-6),
            new Capacitor('Cr', ['cr_a', 'cr_b'], 207e-9),
            new Inductor('Lm', ['cr_b', '0'], 200e-6),
            
            // 簡化輸出 (先確保MOSFET工作)
            new Resistor('Rload_simple', ['cr_b', '0'], 10)
        ];
        
        solver.isInitialized = true;
        
        try {
            const results = await solver.runSteppedSimulation(() => ({}), {
                stopTime: period * 20,
                timeStep: timeStep
            });
            
            this.analyzeResults(results, "VCMOSFET半橋LLC");
            return results;
        } catch (error) {
            console.log(`❌ VCMOSFET模擬失敗: ${error.message}`);
            return null;
        }
    }

    analyzeResults(results, testName) {
        console.log(`📊 ${testName} 分析結果:`);
        
        const steadyStart = Math.floor(results.steps.length * 0.6);
        const steadySteps = results.steps.slice(steadyStart);
        
        // 分析所有關鍵節點
        const bridgeVoltages = steadySteps.map(s => s.nodeVoltages['bridge'] || 0);
        const cr_a_Voltages = steadySteps.map(s => s.nodeVoltages['cr_a'] || 0);
        const cr_b_Voltages = steadySteps.map(s => s.nodeVoltages['cr_b'] || 0);
        
        const bridgeAvg = bridgeVoltages.reduce((a,b) => a+b, 0) / bridgeVoltages.length;
        const bridgePeak = Math.max(...bridgeVoltages.map(Math.abs));
        
        const cr_a_Peak = Math.max(...cr_a_Voltages.map(Math.abs));
        const cr_b_Avg = cr_b_Voltages.reduce((a,b) => a+b, 0) / cr_b_Voltages.length;
        const cr_b_Peak = Math.max(...cr_b_Voltages.map(Math.abs));
        
        console.log(`  橋接電壓: 平均=${bridgeAvg.toFixed(1)}V, 峰值=${bridgePeak.toFixed(1)}V`);
        console.log(`  諧振節點cr_a峰值: ${cr_a_Peak.toFixed(1)}V`);
        console.log(`  輸出cr_b: 平均=${cr_b_Avg.toFixed(1)}V, 峰值=${cr_b_Peak.toFixed(1)}V`);
        
        // 檢查輸出檢測器
        const outputNodes = ['rectified', 'transformed'];
        for (const node of outputNodes) {
            const nodeVoltages = steadySteps.map(s => s.nodeVoltages[node] || 0);
            if (nodeVoltages.some(v => Math.abs(v) > 0.1)) {
                const nodeAvg = nodeVoltages.reduce((a,b) => a+b, 0) / nodeVoltages.length;
                const nodePeak = Math.max(...nodeVoltages.map(Math.abs));
                console.log(`  ${node}節點: 平均=${nodeAvg.toFixed(1)}V, 峰值=${nodePeak.toFixed(1)}V`);
            }
        }
        
        // 評估LLC性能
        if (cr_b_Peak > 10) {
            console.log(`  ✅ LLC諧振電路有響應！`);
            if (cr_b_Avg > 1) {
                console.log(`  ✅ 有DC輸出分量！`);
            }
        } else {
            console.log(`  ❌ LLC諧振電路響應微弱`);
        }
    }

    async runFullTest() {
        console.log("=== 逐步構建工作的LLC轉換器 ===\n");
        
        // Step 1: 驗證PULSE電壓源版本
        const step1Results = await this.buildLLCStep1();
        
        // Step 2: 嘗試VCMOSFET版本
        const step2Results = await this.buildLLCStep2();
        
        // 總結
        console.log("\n📈 總結:");
        if (step1Results && step2Results) {
            console.log("✅ 兩種驅動方式都工作正常，可以進入變壓器階段");
        } else if (step1Results) {
            console.log("🟡 PULSE驅動工作，VCMOSFET需要調試");
        } else {
            console.log("❌ 基礎LLC電路有問題");
        }
    }
}

async function main() {
    const builder = new WorkingLLCBuilder();
    await builder.runFullTest();
}

main();