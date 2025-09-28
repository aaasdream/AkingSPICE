/**
 * =================================================================
 *            診斷變壓器耦合問題 - LLC轉換器調試
 * =================================================================
 * 
 * 檢查為什麼完整LLC的變壓器輸出為0V
 */

import { AkingSPICE, VoltageSource, Inductor, Capacitor, Resistor, VoltageControlledMOSFET as VCMOSFET, MultiWindingTransformer as Transformer } from './src/index.js';

class TransformerDiagnosis {
    async testBasicTransformer() {
        console.log("🔬 測試基本變壓器功能...\n");
        
        const frequency = 1000; // 1kHz測試頻率
        const solver = new AkingSPICE();
        
        solver.components = [
            // 簡單正弦波輸入
            new VoltageSource('Vin', ['primary_in', '0'], `SINE(0 100 ${frequency})`),
            
            // 基本變壓器
            new Transformer('T1', {
                windings: [
                    { name: 'primary', nodes: ['primary_in', '0'], inductance: 1e-3, resistance: 0.1 },
                    { name: 'secondary', nodes: ['sec_out', '0'], inductance: 1e-3/4, resistance: 0.05 }
                ],
                couplingMatrix: [
                    [1.0, 0.98],
                    [0.98, 1.0]
                ]
            }),
            
            // 次級負載
            new Resistor('Rload', ['sec_out', '0'], 10)
        ];
        
        solver.isInitialized = true;
        
        const period = 1.0 / frequency;
        const results = await solver.runSteppedSimulation(() => ({}), {
            stopTime: period * 5,
            timeStep: period / 100
        });
        
        this.analyzeTransformerResults(results, "基本變壓器測試");
    }

    async testLLCTransformerIsolation() {
        console.log("\n🔬 測試LLC變壓器節點隔離...\n");
        
        const solver = new AkingSPICE();
        const frequency = 35000;
        const period = 1.0 / frequency;
        
        solver.components = [
            // 直接對變壓器一次側加電壓
            new VoltageSource('Vprimary', ['primary_a', 'primary_b'], `SINE(0 50 ${frequency})`),
            
            // 與LLC相同的變壓器配置
            new Transformer('T1', {
                windings: [
                    { name: 'primary', nodes: ['primary_a', 'primary_b'], inductance: 200e-6, resistance: 0.02 },
                    { name: 'sec_a', nodes: ['sec_a', 'sec_center'], inductance: 200e-6/36, resistance: 0.01 },
                    { name: 'sec_b', nodes: ['sec_b', 'sec_center'], inductance: 200e-6/36, resistance: 0.01 }
                ],
                couplingMatrix: [
                    [1.0, 0.95, 0.95],
                    [0.95, 1.0, 0.90],
                    [0.95, 0.90, 1.0]
                ]
            }),
            
            // 次級負載
            new Resistor('Rload_a', ['sec_a', 'sec_center'], 10),
            new Resistor('Rload_b', ['sec_b', 'sec_center'], 10)
        ];
        
        solver.isInitialized = true;
        
        const results = await solver.runSteppedSimulation(() => ({}), {
            stopTime: period * 10,
            timeStep: period / 50
        });
        
        this.analyzeTransformerResults(results, "LLC變壓器隔離測試");
    }

    async testCoupledInductors() {
        console.log("\n🔬 測試耦合電感替代方案...\n");
        
        const solver = new AkingSPICE();
        const frequency = 35000;
        const period = 1.0 / frequency;
        
        // 用直流電壓源測試
        solver.components = [
            new VoltageSource('Vin', ['in', '0'], `PULSE(0 100 0 1e-9 1e-9 ${period*0.5} ${period})`),
            
            // 用電阻分壓模擬理想變壓器
            new Resistor('R_primary', ['in', 'mid'], 1.0),    // 一次側"阻抗"
            new Resistor('R_secondary', ['mid', 'out'], 0.16), // 1:6變比 -> 阻抗1:36
            
            new Resistor('Rload', ['out', '0'], 10)
        ];
        
        solver.isInitialized = true;
        
        const results = await solver.runSteppedSimulation(() => ({}), {
            stopTime: period * 10,
            timeStep: period / 20
        });
        
        this.analyzeTransformerResults(results, "電阻分壓模擬變壓器");
    }

    analyzeTransformerResults(results, testName) {
        console.log(`📊 ${testName} 結果:`);
        
        const steadyStart = Math.floor(results.steps.length * 0.5);
        const steadySteps = results.steps.slice(steadyStart);
        
        // 檢查所有節點
        const allNodes = new Set();
        steadySteps.forEach(step => {
            Object.keys(step.nodeVoltages).forEach(node => allNodes.add(node));
        });
        
        console.log(`  檢測到 ${allNodes.size} 個節點:`);
        
        for (const node of Array.from(allNodes).sort()) {
            const voltages = steadySteps.map(s => s.nodeVoltages[node] || 0);
            const avg = voltages.reduce((a,b) => a+b, 0) / voltages.length;
            const peak = Math.max(...voltages.map(Math.abs));
            
            if (peak > 0.01) { // 只顯示有意義的電壓
                console.log(`    ${node}: 平均=${avg.toFixed(2)}V, 峰值=${peak.toFixed(1)}V`);
                
                // 分析變壓器功能
                if (node.includes('sec') || node.includes('out')) {
                    if (peak > 10) {
                        console.log(`      ✅ 變壓器有輸出響應`);
                    } else if (peak > 1) {
                        console.log(`      🟡 變壓器輸出較弱`);
                    } else {
                        console.log(`      ❌ 變壓器幾乎無輸出`);
                    }
                }
            }
        }
    }

    async runDiagnosticSuite() {
        console.log("=== 變壓器診斷測試套件 ===\n");
        
        try {
            await this.testBasicTransformer();
            await this.testLLCTransformerIsolation();
            await this.testCoupledInductors();
        } catch (error) {
            console.log(`❌ 診斷測試失敗: ${error.message}`);
        }
    }
}

async function main() {
    const diagnosis = new TransformerDiagnosis();
    await diagnosis.runDiagnosticSuite();
}

main();