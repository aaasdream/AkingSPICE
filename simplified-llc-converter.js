/**
 * =================================================================
 *        用簡單電阻分壓替代變壓器的LLC轉換器
 * =================================================================
 * 
 * 由於MultiWindingTransformer有矩陣奇異問題，用簡單方法替代
 */

import { AkingSPICE, VoltageSource, Inductor, Capacitor, Resistor, VoltageControlledMOSFET as VCMOSFET } from './src/index.js';

class SimplifiedLLCConverter {
    async testVariousTransformRatios() {
        console.log("🔧 測試不同變壓比的簡化LLC轉換器...\n");
        
        // 測試不同的變壓比
        const transformRatios = [
            { name: "1:8變比 (目標50V)", R1: 1.0, R2: 0.125 },
            { name: "1:6變比 (目標67V)", R1: 1.0, R2: 0.167 },
            { name: "1:4變比 (目標100V)", R1: 1.0, R2: 0.25 },
            { name: "1:2變比 (目標200V)", R1: 1.0, R2: 0.5 }
        ];
        
        for (const ratio of transformRatios) {
            await this.testSimplifiedLLC(ratio);
        }
    }

    async testSimplifiedLLC(transformConfig) {
        console.log(`\n📊 ${transformConfig.name}:`);
        
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
            
            // LLC諧振電路
            new Inductor('Llr', ['bridge', 'cr_a'], 25e-6),
            new Capacitor('Cr', ['cr_a', 'cr_b'], 207e-9),
            new Inductor('Lm', ['cr_b', '0'], 200e-6),
            
            // 簡化變壓器 (電阻分壓)
            new Resistor('R_primary', ['cr_b', 'transform_mid'], transformConfig.R1),
            new Resistor('R_secondary', ['transform_mid', '0'], transformConfig.R2),
            
            // 整流+濾波 (理想二極體用電阻)
            new Resistor('R_rectifier', ['transform_mid', 'dc_out'], 0.01), // 理想整流
            new Capacitor('Cout', ['dc_out', '0'], 470e-6),
            new Resistor('Rload', ['dc_out', '0'], 2.4) // 48V/20A負載
        ];
        
        try {
            solver.isInitialized = true;
            
            const results = await solver.runSteppedSimulation(() => ({}), {
                stopTime: period * 25,
                timeStep: timeStep
            });
            
            this.analyzeLLCPerformance(results, transformConfig.name);
            
        } catch (error) {
            console.log(`❌ 模擬失敗: ${error.message}`);
        }
    }

    analyzeLLCPerformance(results, configName) {
        const steadyStart = Math.floor(results.steps.length * 0.7);
        const steadySteps = results.steps.slice(steadyStart);
        
        // 關鍵節點分析
        const keyNodes = ['bridge', 'cr_a', 'cr_b', 'transform_mid', 'dc_out'];
        const nodeStats = {};
        
        for (const node of keyNodes) {
            const voltages = steadySteps.map(s => s.nodeVoltages[node] || 0);
            if (voltages.some(v => Math.abs(v) > 0.001)) {
                const avg = voltages.reduce((a,b) => a+b, 0) / voltages.length;
                const peak = Math.max(...voltages.map(Math.abs));
                const min = Math.min(...voltages);
                const max = Math.max(...voltages);
                const ripple = max - min;
                
                nodeStats[node] = { avg, peak, min, max, ripple };
            }
        }
        
        // 顯示結果
        for (const [node, stats] of Object.entries(nodeStats)) {
            console.log(`  ${node}: 平均=${stats.avg.toFixed(2)}V, 峰值=${stats.peak.toFixed(1)}V, 紋波=${stats.ripple.toFixed(2)}V`);
        }
        
        // 性能評估
        const dcOutput = nodeStats['dc_out'];
        if (dcOutput) {
            const efficiency = this.estimateEfficiency(dcOutput.avg, nodeStats);
            const gain = dcOutput.avg / 400 * 100;
            
            console.log(`  📈 轉換增益: ${gain.toFixed(1)}%`);
            console.log(`  ⚡ 估計效率: ${efficiency.toFixed(1)}%`);
            
            if (dcOutput.avg > 40) {
                console.log(`  🎯 非常接近48V目標！`);
            } else if (dcOutput.avg > 20) {
                console.log(`  🟡 輸出電壓良好，可進一步優化`);
            } else if (dcOutput.avg > 5) {
                console.log(`  🟠 有輸出但偏低，檢查參數`);
            } else {
                console.log(`  ❌ 輸出電壓太低`);
            }
        }
        
        // 諧振分析
        this.analyzeResonance(nodeStats);
    }

    estimateEfficiency(outputVoltage, nodeStats) {
        // 簡化效率估計：輸出功率 / 輸入功率估計
        const outputPower = Math.pow(outputVoltage, 2) / 2.4; // P = V²/R
        
        // 估計諧振電流損耗 (非常粗略)
        const resonantPower = nodeStats['cr_a'] ? Math.pow(nodeStats['cr_a'].peak, 2) / 1000 : 0;
        const totalPower = outputPower + resonantPower;
        
        return totalPower > 0 ? (outputPower / totalPower * 100) : 0;
    }

    analyzeResonance(nodeStats) {
        const crb = nodeStats['cr_b'];
        if (crb) {
            // Q係數估計 (諧振放大倍數)
            const qEstimate = crb.peak / 400; // 相對於輸入電壓
            console.log(`  🔄 諧振Q係數: ${qEstimate.toFixed(2)}`);
            
            if (qEstimate > 1.5) {
                console.log(`    ✅ 優秀的諧振性能`);
            } else if (qEstimate > 1.0) {
                console.log(`    🟡 良好的諧振性能`);  
            } else if (qEstimate > 0.5) {
                console.log(`    🟠 中等諧振性能`);
            } else {
                console.log(`    ❌ 諧振性能不佳`);
            }
        }
    }

    async runOptimizationTest() {
        console.log("=== 簡化LLC轉換器優化測試 ===\n");
        await this.testVariousTransformRatios();
        
        console.log("\n📝 總結建議:");
        console.log("1. 選擇產生最佳48V輸出的變壓比");  
        console.log("2. 如果需要更高Q係數，考慮減少電阻損耗");
        console.log("3. 測試不同頻率找到最佳工作點");
    }
}

async function main() {
    const converter = new SimplifiedLLCConverter();
    await converter.runOptimizationTest();
}

main();