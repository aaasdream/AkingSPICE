/**
 * =================================================================
 *      基於工作諧振電路(Q=0.28)的48V輸出LLC轉換器
 * =================================================================
 * 
 * 成功基礎：Q係數從0.04提升到0.28 (7.1倍改善)
 * 目標：在此基礎上實現48V輸出
 */

import { AkingSPICE, VoltageSource, Inductor, Capacitor, Resistor, VoltageControlledMOSFET as VCMOSFET } from './src/index.js';

class Working48VLLC {
    async testMultipleApproaches() {
        console.log("🚀 基於工作諧振電路實現48V輸出...\n");
        
        // 測試多種方法達到48V
        const approaches = [
            { name: "方法1: 電阻分壓變壓器", method: "resistive" },
            { name: "方法2: 提高開關頻率", method: "frequency" },
            { name: "方法3: 調整諧振參數", method: "resonant" }
        ];
        
        for (const approach of approaches) {
            console.log(`\n📊 ${approach.name}:`);
            await this.testApproach(approach.method);
        }
    }

    async testApproach(method) {
        const baseFreq = 35000;
        let frequency, L, C, transformRatio;
        
        switch (method) {
            case "resistive":
                frequency = baseFreq;
                L = 25e-6;
                C = 207e-9;
                transformRatio = { R1: 0.1, R2: 2.0 }; // 1:20變比嘗試放大
                break;
            case "frequency":
                frequency = 25000; // 降低到25kHz，更遠離諧振頻率
                L = 25e-6;
                C = 207e-9;
                transformRatio = { R1: 0.5, R2: 1.0 }; // 1:2變比
                break;
            case "resonant":
                frequency = baseFreq;
                L = 50e-6; // 增加電感提高Q
                C = 100e-9; // 減少電容
                transformRatio = { R1: 1.0, R2: 1.0 }; // 1:1無變壓
                break;
        }
        
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
            
            // 基於成功的諧振拓樸
            new Inductor('Llr', ['bridge', 'cr_a'], L),
            new Capacitor('Cr', ['cr_a', 'cr_b'], C),
            new Inductor('Lm', ['cr_b', '0'], 200e-6), // 勵磁電感
            
            // 變壓器模擬
            new Resistor('R_transform_1', ['cr_b', 'transform_mid'], transformRatio.R1),
            new Resistor('R_transform_2', ['transform_mid', '0'], transformRatio.R2),
            
            // 整流+濾波
            new Resistor('R_diode', ['transform_mid', 'rect_pos'], 0.05), // 理想二極體
            new Resistor('R_diode_return', ['0', 'rect_neg'], 1e6), // 反向高阻
            
            new Capacitor('Cout', ['rect_pos', 'rect_neg'], 470e-6),
            new Resistor('Rload', ['rect_pos', 'rect_neg'], 2.4) // 48V/20A
        ];
        
        try {
            solver.isInitialized = true;
            
            const results = await solver.runSteppedSimulation(() => ({}), {
                stopTime: period * 30,
                timeStep: timeStep
            });
            
            this.analyzeOutputPerformance(results, method, frequency);
            
        } catch (error) {
            console.log(`❌ ${method}方法失敗: ${error.message}`);
        }
    }

    analyzeOutputPerformance(results, method, frequency) {
        const steadyStart = Math.floor(results.steps.length * 0.7);
        const steadySteps = results.steps.slice(steadyStart);
        
        // 分析所有關鍵節點
        const keyNodes = ['bridge', 'cr_a', 'cr_b', 'transform_mid', 'rect_pos'];
        const nodeData = {};
        
        for (const node of keyNodes) {
            const voltages = steadySteps.map(s => s.nodeVoltages[node] || 0);
            if (voltages.some(v => Math.abs(v) > 0.01)) {
                const avg = voltages.reduce((a,b) => a+b, 0) / voltages.length;
                const peak = Math.max(...voltages.map(Math.abs));
                const min = Math.min(...voltages);
                const max = Math.max(...voltages);
                
                nodeData[node] = { avg, peak, min, max };
                console.log(`  ${node}: 平均=${avg.toFixed(2)}V, 峰值=${peak.toFixed(1)}V`);
            }
        }
        
        // 重點關注輸出
        const outputNode = nodeData['rect_pos'];
        if (outputNode) {
            const outputVoltage = outputNode.avg;
            const gain = outputVoltage / 400 * 100;
            
            console.log(`  🎯 輸出電壓: ${outputVoltage.toFixed(2)}V`);
            console.log(`  📈 轉換增益: ${gain.toFixed(1)}%`);
            
            // 48V目標評估
            const error_48V = Math.abs(outputVoltage - 48) / 48 * 100;
            
            if (outputVoltage > 45 && outputVoltage < 52) {
                console.log(`  ✅ 非常接近48V！誤差${error_48V.toFixed(1)}%`);
            } else if (outputVoltage > 35 && outputVoltage < 65) {
                console.log(`  🟡 在可接受範圍內，可微調`);
            } else if (outputVoltage > 10) {
                console.log(`  🟠 有意義的輸出，需要調整變比`);
            } else {
                console.log(`  ❌ 輸出仍然太低`);
            }
        }
        
        // 諧振分析
        const resonantNode = nodeData['cr_b'];
        if (resonantNode) {
            const Q_factor = resonantNode.peak / 400;
            console.log(`  🔄 Q係數: ${Q_factor.toFixed(3)}`);
            
            // 與基準比較
            if (Q_factor >= 0.28) {
                console.log(`    ✅ 保持或改善了諧振性能`);
            } else {
                console.log(`    🟠 諧振性能略有下降`);
            }
        }
        
        // 頻率分析
        const fr_theory = 1 / (2 * Math.PI * Math.sqrt(25e-6 * 207e-9)); // 理論諧振頻率
        const freq_ratio = frequency / fr_theory;
        console.log(`  ⚡ 頻率比f/fr: ${freq_ratio.toFixed(3)}`);
    }

    async runOutputOptimization() {
        console.log("=== 48V輸出優化測試 ===\n");
        
        console.log("✅ 成功基礎：Q係數 0.04 → 0.28 (7.1倍改善)");
        console.log("🎯 目標：實現48V穩定輸出\n");
        
        await this.testMultipleApproaches();
        
        console.log("\n📝 下一步策略:");
        console.log("1. 選擇最接近48V的方法進行精細調整");
        console.log("2. 如果都不夠，考慮更極端的變壓比");
        console.log("3. 可能需要多級變壓或諧振參數最佳化");
    }
}

async function main() {
    const converter = new Working48VLLC();
    await converter.runOutputOptimization();
}

main();