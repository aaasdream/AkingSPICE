/**
 * =================================================================
 *        診斷LLC諧振節點電壓 - 評估48V輸出潛力
 * =================================================================
 * 
 * 直接從cr_b諧振節點測量，計算理論輸出能力
 */

import { AkingSPICE, VoltageSource, Inductor, Capacitor, Resistor, VoltageControlledMOSFET as VCMOSFET } from './src/index.js';

class ResonantVoltageDiagnosis {
    async testResonantOutputPotential() {
        console.log("🔬 診斷LLC諧振節點輸出潛力...\n");
        
        // 測試不同頻率下的諧振響應
        const frequencies = [20000, 25000, 30000, 35000, 40000, 50000]; // 20-50kHz
        
        for (const freq of frequencies) {
            await this.testFrequencyResponse(freq);
        }
    }

    async testFrequencyResponse(frequency) {
        console.log(`📊 測試頻率: ${frequency/1000}kHz`);
        
        const period = 1.0 / frequency;
        const timeStep = period / 20; // 最佳時間步長
        const dutyCycle = 0.5;
        
        const solver = new AkingSPICE();
        
        solver.components = [
            new VoltageSource('Vin', ['vin', '0'], 400),
            new VoltageSource('Vg1', ['g1', '0'], `PULSE(0 15 0 1e-9 1e-9 ${period*dutyCycle} ${period})`),
            new VoltageSource('Vg2', ['g2', '0'], `PULSE(15 0 0 1e-9 1e-9 ${period*dutyCycle} ${period})`),
            
            new VCMOSFET('Q1', ['vin', 'g1', 'bridge'], { Vth: 3, Ron: 0.05 }),
            new VCMOSFET('Q2', ['bridge', 'g2', '0'], { Vth: 3, Ron: 0.05 }),
            
            // 成功的LLC諧振拓樸
            new Inductor('Llr', ['bridge', 'cr_a'], 25e-6),
            new Capacitor('Cr', ['cr_a', 'cr_b'], 207e-9),
            new Inductor('Lm', ['cr_b', '0'], 200e-6), // 並聯負載
            
            // 多個測試負載
            new Resistor('Rload_light', ['cr_b', '0'], 100),  // 輕負載
            new Resistor('Rload_heavy', ['cr_b', '0'], 5)     // 重負載並聯
        ];
        
        try {
            solver.isInitialized = true;
            
            const results = await solver.runSteppedSimulation(() => ({}), {
                stopTime: period * 25,
                timeStep: timeStep
            });
            
            this.analyzeResonantPotential(results, frequency);
            
        } catch (error) {
            console.log(`❌ ${frequency/1000}kHz測試失敗: ${error.message}`);
        }
    }

    analyzeResonantPotential(results, frequency) {
        const steadyStart = Math.floor(results.steps.length * 0.7);
        const steadySteps = results.steps.slice(steadyStart);
        
        // 分析諧振節點電壓
        const cr_b_voltages = steadySteps.map(s => s.nodeVoltages['cr_b'] || 0);
        const cr_a_voltages = steadySteps.map(s => s.nodeVoltages['cr_a'] || 0);
        const bridge_voltages = steadySteps.map(s => s.nodeVoltages['bridge'] || 0);
        
        const cr_b_avg = cr_b_voltages.reduce((a,b) => a+b, 0) / cr_b_voltages.length;
        const cr_b_rms = Math.sqrt(cr_b_voltages.reduce((a,b) => a + b*b, 0) / cr_b_voltages.length);
        const cr_b_peak = Math.max(...cr_b_voltages.map(Math.abs));
        
        // 理論48V輸出評估
        console.log(`  諧振節點cr_b: 平均=${cr_b_avg.toFixed(2)}V, RMS=${cr_b_rms.toFixed(2)}V, 峰值=${cr_b_peak.toFixed(1)}V`);
        
        // 不同變壓比下的理論輸出
        const transformRatios = [2, 4, 6, 8, 10];
        console.log(`  理論48V輸出所需變壓比:`);
        
        for (const ratio of transformRatios) {
            const theoretical_output = cr_b_rms / ratio * 0.9; // 0.9是整流效率估計
            const error_48V = Math.abs(theoretical_output - 48) / 48 * 100;
            
            if (theoretical_output > 45 && theoretical_output < 52) {
                console.log(`    1:${ratio} → ${theoretical_output.toFixed(1)}V ✅ 誤差${error_48V.toFixed(1)}%`);
            } else if (theoretical_output > 30 && theoretical_output < 70) {
                console.log(`    1:${ratio} → ${theoretical_output.toFixed(1)}V 🟡`);
            } else {
                console.log(`    1:${ratio} → ${theoretical_output.toFixed(1)}V`);
            }
        }
        
        // Q係數和效率評估
        const Q_factor = cr_b_peak / 400; // 相對輸入的放大
        const fr_theory = 1 / (2 * Math.PI * Math.sqrt(25e-6 * 207e-9));
        const freq_ratio = frequency / fr_theory;
        
        console.log(`  Q係數: ${Q_factor.toFixed(3)}, 頻率比: ${freq_ratio.toFixed(3)}`);
        
        // 最佳評估
        if (Q_factor > 0.3) {
            console.log(`  ✅ 諧振性能良好，有48V輸出潛力`);
        } else if (Q_factor > 0.1) {
            console.log(`  🟡 諧振性能中等，可能需要優化`);
        } else {
            console.log(`  ❌ 諧振性能不足`);
        }
        console.log(); // 空行分隔
    }

    async runResonantDiagnosis() {
        console.log("=== LLC諧振節點診斷 ===\n");
        
        console.log("目標：找到最佳頻率和變壓比實現48V輸出");
        console.log("方法：直接測量諧振節點電壓，計算理論輸出\n");
        
        await this.testResonantOutputPotential();
        
        console.log("📈 分析建議:");
        console.log("1. 選擇Q係數最高的頻率");
        console.log("2. 選擇最接近48V的變壓比");
        console.log("3. 實現該變壓比的物理電路");
    }
}

async function main() {
    const diagnosis = new ResonantVoltageDiagnosis();
    await diagnosis.runResonantDiagnosis();
}

main();