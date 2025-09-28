/**
 * =================================================================
 *          修正LLC拓樸 - Lm勵磁電感正確並聯
 * =================================================================
 * 
 * 關鍵發現：Lm不應該接地，應該與變壓器一次側並聯！
 */

import { AkingSPICE, VoltageSource, Inductor, Capacitor, Resistor, VoltageControlledMOSFET as VCMOSFET } from './src/index.js';

class CorrectedLLCConverter {
    async testCorrectedTopology() {
        console.log("🔧 測試修正後的LLC拓樸 (Lm並聯變壓器一次側)...\n");
        
        const frequency = 35000; // 35kHz
        const period = 1.0 / frequency;
        const timeStep = period / 20; // 最佳時間步長
        const dutyCycle = 0.5;
        
        const solver = new AkingSPICE();
        
        solver.components = [
            // 400V輸入
            new VoltageSource('Vin', ['vin', '0'], 400),
            
            // 閘極驅動
            new VoltageSource('Vg1', ['g1', '0'], `PULSE(0 15 0 1e-9 1e-9 ${period*dutyCycle} ${period})`),
            new VoltageSource('Vg2', ['g2', '0'], `PULSE(15 0 0 1e-9 1e-9 ${period*dutyCycle} ${period})`),
            
            // VCMOSFET半橋
            new VCMOSFET('Q1', ['vin', 'g1', 'bridge'], { Vth: 3, Ron: 0.05 }),
            new VCMOSFET('Q2', ['bridge', 'g2', '0'], { Vth: 3, Ron: 0.05 }),
            
            // LLC諧振電路 - 正確拓樸！
            new Inductor('Llr', ['bridge', 'cr_a'], 25e-6),       // 諧振電感
            new Capacitor('Cr', ['cr_a', 'primary_top'], 207e-9), // 諧振電容
            
            // 勵磁電感Lm並聯在變壓器一次側 (primary_top to primary_bottom)
            new Inductor('Lm', ['primary_top', 'primary_bottom'], 200e-6),
            
            // 簡化變壓器 (1:6變比)
            new Resistor('R_transform_primary', ['primary_top', 'primary_bottom'], 1.0),
            new Resistor('R_transform_secondary', ['secondary_out', '0'], 0.167), // 1/6變比
            
            // 變壓器耦合用電壓控制源模擬
            // 簡化: secondary_out = (primary_top - primary_bottom) / 6
            new VoltageSource('V_coupled', ['secondary_out', '0'], 'DC(0)'), // 臨時
            
            // 理想整流+濾波
            new Resistor('R_rectifier', ['secondary_out', 'dc_out'], 0.01),
            new Capacitor('Cout', ['dc_out', '0'], 470e-6),
            new Resistor('Rload', ['dc_out', '0'], 2.4),
            
            // primary_bottom連到0V參考點  
            new Resistor('R_ref', ['primary_bottom', '0'], 1e6) // 高阻抗參考
        ];
        
        try {
            solver.isInitialized = true;
            
            const results = await solver.runSteppedSimulation(() => ({}), {
                stopTime: period * 25,
                timeStep: timeStep
            });
            
            this.analyzeCorrectedLLC(results);
            
        } catch (error) {
            console.log(`❌ 修正拓樸模擬失敗: ${error.message}`);
            
            // 強制進入更簡單的版本
        }
        
        // 總是執行簡單版本進行對比
        await this.testSimplestCorrectLLC();
    }

    async testSimplestCorrectLLC() {
        console.log("\n🔧 最簡LLC拓樸測試 (只有諧振電路)...\n");
        
        const frequency = 35000;
        const period = 1.0 / frequency;
        const timeStep = period / 20;
        const dutyCycle = 0.5;
        
        const solver = new AkingSPICE();
        
        solver.components = [
            new VoltageSource('Vin', ['vin', '0'], 400),
            new VoltageSource('Vg1', ['g1', '0'], `PULSE(0 15 0 1e-9 1e-9 ${period*dutyCycle} ${period})`),
            new VoltageSource('Vg2', ['g2', '0'], `PULSE(15 0 0 1e-9 1e-9 ${period*dutyCycle} ${period})`),
            
            new VCMOSFET('Q1', ['vin', 'g1', 'bridge'], { Vth: 3, Ron: 0.05 }),
            new VCMOSFET('Q2', ['bridge', 'g2', '0'], { Vth: 3, Ron: 0.05 }),
            
            // 正確的LLC拓樸：Llr → Cr → Lm並聯負載
            new Inductor('Llr', ['bridge', 'cr_a'], 25e-6),
            new Capacitor('Cr', ['cr_a', 'cr_b'], 207e-9),
            
            // Lm並聯在負載上 (模擬變壓器一次側效果)
            new Inductor('Lm', ['cr_b', '0'], 200e-6),     // 勵磁電感
            new Resistor('Rload_equivalent', ['cr_b', '0'], 10), // 等效負載
        ];
        
        solver.isInitialized = true;
        
        const results = await solver.runSteppedSimulation(() => ({}), {
            stopTime: period * 25,
            timeStep: timeStep
        });
        
        this.analyzeCorrectedLLC(results, true);
    }

    analyzeCorrectedLLC(results, isSimplest = false) {
        console.log(`📊 ${isSimplest ? '最簡' : '修正'}LLC拓樸分析結果:`);
        
        const steadyStart = Math.floor(results.steps.length * 0.7);
        const steadySteps = results.steps.slice(steadyStart);
        
        // 關鍵節點
        const keyNodes = ['bridge', 'cr_a', 'cr_b', 'primary_top', 'secondary_out', 'dc_out'];
        
        for (const node of keyNodes) {
            const voltages = steadySteps.map(s => s.nodeVoltages[node] || 0);
            if (voltages.some(v => Math.abs(v) > 0.1)) {
                const avg = voltages.reduce((a,b) => a+b, 0) / voltages.length;
                const peak = Math.max(...voltages.map(Math.abs));
                
                console.log(`  ${node}: 平均=${avg.toFixed(2)}V, 峰值=${peak.toFixed(1)}V`);
            }
        }
        
        // 諧振分析  
        const crb_voltages = steadySteps.map(s => s.nodeVoltages['cr_b'] || 0);
        const crb_peak = Math.max(...crb_voltages.map(Math.abs));
        const Q_estimate = crb_peak / 400; // 相對輸入電壓的放大
        
        console.log(`\n🔍 諧振特性:`);
        console.log(`  Q係數估計: ${Q_estimate.toFixed(2)}`);
        
        if (Q_estimate > 1.0) {
            console.log(`  ✅ 諧振放大正常！`);
        } else if (Q_estimate > 0.5) {
            console.log(`  🟡 諧振放大中等`);
        } else {
            console.log(`  ❌ 諧振放大不足`);
        }
        
        // 與之前對比
        console.log(`\n📈 與之前對比:`);
        console.log(`  之前Q係數: 0.04 (極差)`);
        console.log(`  修正後Q係數: ${Q_estimate.toFixed(2)}`);
        
        if (Q_estimate > 0.04 * 5) {
            console.log(`  🎯 顯著改善！提升${(Q_estimate/0.04).toFixed(1)}倍`);
        }
    }

    async runTopologyTest() {
        console.log("=== LLC拓樸修正測試 ===\n");
        
        console.log("問題診斷:");
        console.log("❌ 之前: Lm直接接地 → 短路諧振電路");
        console.log("✅ 修正: Lm並聯變壓器一次側 → 正確LLC\n");
        
        await this.testCorrectedTopology();
    }
}

async function main() {
    const converter = new CorrectedLLCConverter();
    await converter.runTopologyTest();
}

main();