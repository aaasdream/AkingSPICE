/**
 * =================================================================
 *                  LLC轉換器優化時間步長測試
 * =================================================================
 * 
 * 發現：RLC最佳時間步長是20步/週期，而不是500步/週期
 * 重新測試LLC轉換器在正確時間步長下的性能
 */

import { AkingSPICE, VoltageSource, Inductor, Capacitor, Resistor, VoltageControlledMOSFET as VCMOSFET, MultiWindingTransformer as Transformer } from './src/index.js';

class OptimizedLLCTester {
    constructor() {
        this.results = [];
    }

    async testOptimizedLLC() {
        console.log("🔧 用正確時間步長重新測試LLC轉換器...\n");
        
        // 測試不同開關頻率，但用正確的時間步長設置
        const frequencies = [35000, 50000, 70000, 90000]; // Hz
        
        for (const freq of frequencies) {
            await this.runLLCTest(freq);
        }
    }

    async runLLCTest(frequency) {
        console.log(`\n📊 測試開關頻率: ${frequency/1000}kHz`);
        
        const solver = new AkingSPICE();
        const period = 1.0 / frequency;
        const dutyCycle = 0.5;
        
        // LLC參數
        const Llr = 25e-6;  // 諧振電感
        const Cr = 207e-9;  // 諧振電容  
        const Lm = 200e-6;  // 勵磁電感
        const Rload = 2.4;  // 48V/20A = 2.4Ω
        
        // 使用**最佳時間步長設置**：每週期20步
        const timeStep = period / 20; // 不是100步，而是20步！
        
        console.log(`  時間步長: ${(timeStep*1e6).toFixed(2)}μs (每週期20步)`);
        
        solver.components = [
            // 輸入電壓
            new VoltageSource('Vin', ['vin', '0'], 400),
            
            // 諧振電路  
            new Inductor('Llr', ['sw', 'cr_a'], Llr),
            new Capacitor('Cr', ['cr_a', 'cr_b'], Cr),
            new Inductor('Lm', ['cr_b', 'sw_neg'], Lm), // 勵磁電感
            
            // 變壓器 (1:3 匝數比，降壓)
            new Transformer('T1', {
                windings: [
                    { name: 'primary', nodes: ['cr_b', 'sw_neg'], inductance: 200e-6, resistance: 0.01 },
                    { name: 'secondary_a', nodes: ['sec_a', 'sec_center'], inductance: 200e-6/9, resistance: 0.005 },
                    { name: 'secondary_b', nodes: ['sec_b', 'sec_center'], inductance: 200e-6/9, resistance: 0.005 }
                ],
                couplingMatrix: [
                    [1.0, 0.98, 0.98],
                    [0.98, 1.0, 0.95], 
                    [0.98, 0.95, 1.0]
                ]
            }),
            
            // 同步整流器MOSFET (用導通電阻模擬)
            new VCMOSFET('Q3', ['sec_a', 'sec_center', '0'], {
                Vgs: function(t) { 
                    const phase = (t * frequency) % 1;
                    return (phase < dutyCycle) ? 0 : 15; // 互補導通
                },
                Vth: 3,
                Ron: 0.01
            }),
            new VCMOSFET('Q4', ['sec_b', 'sec_center', '0'], {
                Vgs: function(t) {
                    const phase = (t * frequency) % 1;  
                    return (phase < dutyCycle) ? 15 : 0;
                },
                Vth: 3,
                Ron: 0.01
            }),
            
            // 輸出濾波
            new Capacitor('Cout', ['sec_center', 'vout'], 470e-6),
            new Resistor('Rload', ['vout', '0'], Rload),
            
            // 半橋驅動
            new VCMOSFET('Q1', ['vin', 'sw', '0'], {
                Vgs: function(t) {
                    const phase = (t * frequency) % 1;
                    return (phase < dutyCycle) ? 15 : 0;
                },
                Vth: 3,
                Ron: 0.05
            }),
            new VCMOSFET('Q2', ['sw', '0', '0'], {
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
            
            // 使用優化的時間步長進行模擬
            const results = await solver.runSteppedSimulation(() => ({}), {
                stopTime: period * 20,  // 20個週期確保穩態
                timeStep: timeStep
            });
            
            // 分析最後50%的穩態數據
            const steadyStart = Math.floor(results.steps.length * 0.5);
            const steadySteps = results.steps.slice(steadyStart);
            
            // 輸出電壓分析
            const outputVoltages = steadySteps.map(step => step.nodeVoltages['vout'] || 0);
            const avgOutput = outputVoltages.reduce((a,b) => a+b, 0) / outputVoltages.length;
            const minOutput = Math.min(...outputVoltages);
            const maxOutput = Math.max(...outputVoltages);
            const ripple = maxOutput - minOutput;
            
            // 諧振電流分析 (通過電感電壓計算)
            const resonantCurrents = [];
            for (let i = 1; i < steadySteps.length; i++) {
                const vL = (steadySteps[i].nodeVoltages['sw'] || 0) - (steadySteps[i].nodeVoltages['cr_a'] || 0);
                const dt = steadySteps[i].time - steadySteps[i-1].time;
                const di = vL * dt / Llr;
                resonantCurrents.push(di);
            }
            const avgResonantCurrent = resonantCurrents.reduce((a,b) => a+b, 0) / resonantCurrents.length;
            const maxResonantCurrent = Math.max(...resonantCurrents.map(Math.abs));
            
            // 計算增益
            const gain = avgOutput / 400; // Vout/Vin
            const efficiency = (avgOutput * avgOutput / Rload) / (400 * Math.abs(avgResonantCurrent)) * 100;
            
            console.log(`  輸出電壓: 平均=${avgOutput.toFixed(2)}V, 紋波=${ripple.toFixed(3)}V`);
            console.log(`  轉換增益: ${(gain*100).toFixed(1)}% (目標12% for 48V)`);
            console.log(`  諧振電流: 平均=${avgResonantCurrent.toFixed(3)}A, 峰值=${maxResonantCurrent.toFixed(3)}A`);
            console.log(`  估計效率: ${efficiency.toFixed(1)}%`);
            
            // 檢查是否接近目標
            if (avgOutput > 40) {
                console.log(`  ✅ 接近48V目標！`);
            } else if (avgOutput > 20) {
                console.log(`  🟡 輸出電壓提升中...`);
            } else {
                console.log(`  ❌ 輸出電壓仍然太低`);
            }
            
            this.results.push({
                frequency: frequency,
                outputVoltage: avgOutput,
                gain: gain,
                ripple: ripple,
                resonantCurrent: maxResonantCurrent
            });
            
        } catch (error) {
            console.log(`  ❌ 模擬失敗: ${error.message}`);
        }
    }

    printSummary() {
        console.log("\n📈 優化結果總結:");
        console.log("頻率\t輸出電壓\t增益\t紋波\t諧振電流");
        this.results.forEach(r => {
            console.log(`${r.frequency/1000}kHz\t${r.outputVoltage.toFixed(2)}V\t\t${(r.gain*100).toFixed(1)}%\t${r.ripple.toFixed(3)}V\t${r.resonantCurrent.toFixed(3)}A`);
        });
    }
}

async function main() {
    const tester = new OptimizedLLCTester();
    await tester.testOptimizedLLC();
    tester.printSummary();
}

main();