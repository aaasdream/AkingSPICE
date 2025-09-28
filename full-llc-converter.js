/**
 * =================================================================
 *           完整LLC轉換器：添加變壓器和整流器達到48V
 * =================================================================
 * 
 * 基於成功的VCMOSFET半橋，添加變壓器和整流器實現完整LLC
 */

import { AkingSPICE, VoltageSource, Inductor, Capacitor, Resistor, VoltageControlledMOSFET as VCMOSFET, MultiWindingTransformer as Transformer, Diode } from './src/index.js';

class FullLLCConverter {
    async testFullLLC() {
        console.log("🚀 完整LLC轉換器測試 (目標48V輸出)...\n");
        
        const frequency = 35000; // 35kHz (低於諧振頻率，提高增益)
        const period = 1.0 / frequency;
        const timeStep = period / 20; // 最佳時間步長
        const dutyCycle = 0.5;
        
        const solver = new AkingSPICE();
        
        solver.components = [
            // 400V輸入電壓
            new VoltageSource('Vin', ['vin', '0'], 400),
            
            // 閘極驅動信號
            new VoltageSource('Vg1', ['g1', '0'], `PULSE(0 15 0 1e-9 1e-9 ${period*dutyCycle} ${period})`),
            new VoltageSource('Vg2', ['g2', '0'], `PULSE(15 0 0 1e-9 1e-9 ${period*dutyCycle} ${period})`),
            
            // VCMOSFET半橋
            new VCMOSFET('Q1', ['vin', 'g1', 'bridge'], {
                Vth: 3,
                Ron: 0.05,
                modelType: 'NMOS'
            }),
            new VCMOSFET('Q2', ['bridge', 'g2', '0'], {
                Vth: 3, 
                Ron: 0.05,
                modelType: 'NMOS'
            }),
            
            // LLC諧振電路
            new Inductor('Llr', ['bridge', 'cr_a'], 25e-6),      // 諧振電感
            new Capacitor('Cr', ['cr_a', 'cr_b'], 207e-9),        // 諧振電容
            new Inductor('Lm', ['cr_b', '0'], 200e-6),           // 勵磁電感
            
            // 變壓器 (1:6變比，從400V降到~67V，整流後48V)
            new Transformer('T1', {
                windings: [
                    { name: 'primary', nodes: ['cr_b', '0'], inductance: 200e-6, resistance: 0.02 },
                    { name: 'sec_a', nodes: ['sec_a', 'sec_center'], inductance: 200e-6/36, resistance: 0.01 },
                    { name: 'sec_b', nodes: ['sec_b', 'sec_center'], inductance: 200e-6/36, resistance: 0.01 }
                ],
                couplingMatrix: [
                    [1.0, 0.95, 0.95],  // 主繞組
                    [0.95, 1.0, 0.90],  // 次繞組A
                    [0.95, 0.90, 1.0]   // 次繞組B
                ]
            }),
            
            // 同步整流器 (用低電阻模擬理想整流)
            new Resistor('Rect_A', ['sec_a', 'rect_out'], 0.01),  // 理想整流器
            new Resistor('Rect_B', ['sec_b', 'rect_out'], 0.01),
            
            // 輸出濾波
            new Capacitor('Cout', ['rect_out', 'sec_center'], 470e-6), // 輸出濾波電容
            new Resistor('Rload', ['rect_out', 'sec_center'], 2.4)     // 48V/20A = 2.4Ω
        ];
        
        try {
            solver.isInitialized = true;
            
            console.log("開始全功率LLC模擬...");
            const results = await solver.runSteppedSimulation(() => ({}), {
                stopTime: period * 30,  // 較長時間確保穩態
                timeStep: timeStep
            });
            
            this.analyzeFullLLCResults(results, frequency);
            
        } catch (error) {
            console.log(`❌ 完整LLC模擬失敗: ${error.message}`);
            
            // 嘗試簡化版本
            console.log("\n🔧 嘗試簡化變壓器版本...");
            await this.testSimplifiedTransformer(frequency, period, dutyCycle, timeStep);
        }
    }

    async testSimplifiedTransformer(frequency, period, dutyCycle, timeStep) {
        const solver = new AkingSPICE();
        
        solver.components = [
            new VoltageSource('Vin', ['vin', '0'], 400),
            new VoltageSource('Vg1', ['g1', '0'], `PULSE(0 15 0 1e-9 1e-9 ${period*dutyCycle} ${period})`),
            new VoltageSource('Vg2', ['g2', '0'], `PULSE(15 0 0 1e-9 1e-9 ${period*dutyCycle} ${period})`),
            
            new VCMOSFET('Q1', ['vin', 'g1', 'bridge'], { Vth: 3, Ron: 0.05 }),
            new VCMOSFET('Q2', ['bridge', 'g2', '0'], { Vth: 3, Ron: 0.05 }),
            
            new Inductor('Llr', ['bridge', 'cr_a'], 25e-6),
            new Capacitor('Cr', ['cr_a', 'cr_b'], 207e-9),
            new Inductor('Lm', ['cr_b', '0'], 200e-6),
            
            // 理想變壓器用電阻分壓模擬
            new Resistor('R_transform_high', ['cr_b', 'transform_mid'], 0.1),
            new Resistor('R_transform_low', ['transform_mid', '0'], 1.0),
            
            // 簡單整流+濾波
            new Capacitor('Cout', ['transform_mid', '0'], 470e-6),
            new Resistor('Rload', ['transform_mid', '0'], 2.4)
        ];
        
        solver.isInitialized = true;
        
        const results = await solver.runSteppedSimulation(() => ({}), {
            stopTime: period * 20,
            timeStep: timeStep
        });
        
        this.analyzeFullLLCResults(results, frequency, true);
    }

    analyzeFullLLCResults(results, frequency, isSimplified = false) {
        console.log(`\n📊 ${isSimplified ? '簡化' : '完整'}LLC轉換器分析結果:`);
        
        const steadyStart = Math.floor(results.steps.length * 0.6);
        const steadySteps = results.steps.slice(steadyStart);
        
        // 分析關鍵節點
        const analysisNodes = ['bridge', 'cr_a', 'cr_b', 'rect_out', 'sec_center', 'transform_mid'];
        
        for (const node of analysisNodes) {
            const nodeVoltages = steadySteps.map(s => s.nodeVoltages[node] || 0);
            if (nodeVoltages.some(v => Math.abs(v) > 0.1)) {
                const avg = nodeVoltages.reduce((a,b) => a+b, 0) / nodeVoltages.length;
                const peak = Math.max(...nodeVoltages.map(Math.abs));
                const min = Math.min(...nodeVoltages);
                const max = Math.max(...nodeVoltages);
                
                console.log(`  ${node}: 平均=${avg.toFixed(2)}V, 峰值=${peak.toFixed(1)}V, 範圍=${min.toFixed(1)}V~${max.toFixed(1)}V`);
                
                // 檢查是否接近48V目標
                if (node.includes('rect_out') || node.includes('transform_mid')) {
                    if (avg > 40) {
                        console.log(`    🎯 接近48V目標！增益=${(avg/400*100).toFixed(1)}%`);
                    } else if (avg > 20) {
                        console.log(`    🟡 輸出電壓中等，需要調整變比或頻率`);
                    } else if (avg > 1) {
                        console.log(`    🟠 輸出電壓偏低，檢查變壓器耦合`);
                    } else {
                        console.log(`    ❌ 輸出電壓太低`);
                    }
                }
            }
        }
        
        // 諧振特性分析
        this.analyzeResonantPerformance(steadySteps, frequency);
    }

    analyzeResonantPerformance(steps, frequency) {
        console.log(`\n🔍 諧振特性分析:`);
        
        // 理論諧振頻率
        const L = 25e-6;
        const C = 207e-9; 
        const fr = 1 / (2 * Math.PI * Math.sqrt(L * C));
        const ratio = frequency / fr;
        
        console.log(`  操作頻率: ${frequency/1000}kHz`);
        console.log(`  諧振頻率: ${(fr/1000).toFixed(1)}kHz`);
        console.log(`  頻率比: ${ratio.toFixed(3)} (${ratio < 1 ? '提升增益' : '降低增益'})`);
        
        // 檢查諧振品質
        const cr_a = steps.map(s => s.nodeVoltages['cr_a'] || 0);
        const cr_b = steps.map(s => s.nodeVoltages['cr_b'] || 0);
        
        const qFactor_estimate = Math.max(...cr_a.map(Math.abs)) / 400; // 相對於輸入電壓的放大倍數
        console.log(`  品質係數估計: ${qFactor_estimate.toFixed(2)} (理想>1.0)`);
        
        if (qFactor_estimate > 1.2) {
            console.log(`  ✅ 良好的諧振放大效果`);
        } else if (qFactor_estimate > 0.8) {
            console.log(`  🟡 中等諧振效果，可接受`);
        } else {
            console.log(`  ❌ 諧振效果不佳，檢查參數`);
        }
    }
}

async function main() {
    const llcConverter = new FullLLCConverter();
    await llcConverter.testFullLLC();
}

main();