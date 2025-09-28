/**
 * =================================================================
 *              驗證時間步長對LLC性能的影響
 * =================================================================
 * 
 * 用之前能工作的LLC電路，但改用20步/週期的最佳時間步長
 */

import { AkingSPICE, VoltageSource, Inductor, Capacitor, Resistor, VoltageControlledMOSFET as VCMOSFET } from './src/index.js';

class TimeStepValidation {
    async testLLCTimeStep() {
        console.log("🔧 驗證時間步長優化對LLC轉換器的影響...\n");
        
        // 使用之前驗證過的LLC參數
        const frequency = 35000; // Hz
        const period = 1.0 / frequency;
        
        // 測試兩種時間步長設置
        const timeStepConfigs = [
            { name: "傳統設置 (100步/週期)", stepsPerCycle: 100 },
            { name: "優化設置 (20步/週期)", stepsPerCycle: 20 }
        ];
        
        for (const config of timeStepConfigs) {
            console.log(`\n📊 ${config.name}`);
            await this.runLLCWithTimeStep(frequency, period, config.stepsPerCycle);
        }
    }

    async runLLCWithTimeStep(frequency, period, stepsPerCycle) {
        const timeStep = period / stepsPerCycle;
        console.log(`  時間步長: ${(timeStep*1e6).toFixed(2)}μs`);
        
        const solver = new AkingSPICE();
        const dutyCycle = 0.5;
        
        // 基本諧振電路測試 (先不用變壓器)
        solver.components = [
            // 輸入電壓
            new VoltageSource('Vin', ['vin', '0'], 400),
            
            // 諧振電路
            new Inductor('Llr', ['sw', 'cr_a'], 25e-6),
            new Capacitor('Cr', ['cr_a', 'cr_b'], 207e-9),
            new Resistor('Rresonant', ['cr_b', 'sw_neg'], 10), // 諧振迴路負載
            
            // 半橋開關
            new VCMOSFET('Q1', ['vin', 'sw', '0'], {
                Vgs: function(t) {
                    const phase = (t * frequency) % 1;
                    return (phase < dutyCycle) ? 15 : 0;
                },
                Vth: 3,
                Ron: 0.05
            }),
            new VCMOSFET('Q2', ['sw', 'sw_neg', '0'], {
                Vgs: function(t) {
                    const phase = (t * frequency) % 1;
                    return (phase < dutyCycle) ? 0 : 15;
                },
                Vth: 3,
                Ron: 0.05
            })
        ];

        try {
            solver.isInitialized = true;
            
            const results = await solver.runSteppedSimulation(() => ({}), {
                stopTime: period * 20,
                timeStep: timeStep
            });
            
            // 分析穩態結果
            const steadyStart = Math.floor(results.steps.length * 0.6);
            const steadySteps = results.steps.slice(steadyStart);
            
            const outputVoltages = steadySteps.map(step => step.nodeVoltages['cr_b'] || 0);
            const avgOutput = outputVoltages.reduce((a,b) => a+b, 0) / outputVoltages.length;
            const minOutput = Math.min(...outputVoltages);
            const maxOutput = Math.max(...outputVoltages);
            
            const resonantNode = steadySteps.map(step => step.nodeVoltages['cr_a'] || 0);
            const avgResonant = resonantNode.reduce((a,b) => a+b, 0) / resonantNode.length;
            const maxResonant = Math.max(...resonantNode.map(Math.abs));
            
            console.log(`  諧振節點cr_b: 平均=${avgOutput.toFixed(3)}V, 範圍=${minOutput.toFixed(3)}V~${maxOutput.toFixed(3)}V`);
            console.log(`  諧振節點cr_a: 平均=${avgResonant.toFixed(3)}V, 峰值=${maxResonant.toFixed(3)}V`);
            
            // 分析諧振特性
            this.analyzeResonantBehavior(steadySteps, frequency);
            
        } catch (error) {
            console.log(`  ❌ 模擬失敗: ${error.message}`);
        }
    }

    analyzeResonantBehavior(steps, frequency) {
        // 計算諧振電流 (通過電感電壓)
        const currentEstimates = [];
        for (let i = 1; i < steps.length; i++) {
            const vL = (steps[i].nodeVoltages['sw'] || 0) - (steps[i].nodeVoltages['cr_a'] || 0);
            const dt = steps[i].time - steps[i-1].time;
            if (dt > 0) {
                const di = vL * dt / (25e-6); // Llr = 25μH
                currentEstimates.push(di);
            }
        }
        
        if (currentEstimates.length > 0) {
            const avgCurrent = currentEstimates.reduce((a,b) => a+b, 0) / currentEstimates.length;
            const maxCurrent = Math.max(...currentEstimates.map(Math.abs));
            console.log(`  諧振電流: 平均=${avgCurrent.toFixed(4)}A, 峰值=${maxCurrent.toFixed(4)}A`);
            
            // 檢查諧振頻率是否接近理論值
            const fr_theory = 1 / (2 * Math.PI * Math.sqrt(25e-6 * 207e-9));
            const ratio = frequency / fr_theory;
            console.log(`  頻率比: f/fr = ${ratio.toFixed(3)} (理論諧振=${(fr_theory/1000).toFixed(1)}kHz)`);
        }
    }
}

async function main() {
    const validator = new TimeStepValidation();
    await validator.testLLCTimeStep();
}

main();