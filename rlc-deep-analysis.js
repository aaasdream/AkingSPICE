/**
 * =================================================================
 *              深入分析RLC頻率響應異常問題
 * =================================================================
 * 
 * 發現：理論增益0.5187 vs 模擬增益0.6314，誤差21.7%
 * 這可能解釋LLC轉換器中諧振特性不明顯的根本原因
 */

import { AkingSPICE, Resistor, Capacitor, Inductor, VoltageSource } from './src/index.js';

class RLCAnalysisRunner {
    constructor() {
        this.results = [];
    }

    async analyzeRLCProblem() {
        console.log("🔬 深入分析RLC頻率響應異常...\n");
        
        // 使用相同的參數
        const L = 25e-6; // 25μH
        const C = 207e-9; // 207nF  
        const R = 10; // 10Ω
        
        const fr = 1 / (2 * Math.PI * Math.sqrt(L * C)); // 諧振頻率
        console.log(`諧振頻率: ${(fr/1000).toFixed(1)}kHz`);
        
        // 分析不同模擬時間的影響
        await this.testSimulationTime(L, C, R, fr/2); // 使用35kHz測試
        
        // 分析不同時間步長的影響
        await this.testTimeStepEffect(L, C, R, fr/2);
        
        // 直接測試阻抗計算
        await this.testImpedanceCalculation(L, C, R, fr/2);
        
        // 測試是否是穩態問題
        await this.testSteadyStateReaching(L, C, R, fr/2);
    }

    async testSimulationTime(L, C, R, testFreq) {
        console.log("\n📊 測試不同模擬時間長度的影響:");
        const solver = new AkingSPICE();
        const period = 1 / testFreq;
        
        const simTimes = [5, 10, 20, 50]; // 模擬週期數
        
        for (const cycles of simTimes) {
            solver.reset();
            solver.components = [
                new VoltageSource('V1', ['in', '0'], `SINE(0 10 ${testFreq})`),
                new Inductor('L1', ['in', 'n1'], L),
                new Capacitor('C1', ['n1', 'out'], C),
                new Resistor('R1', ['out', '0'], R)
            ];
            solver.isInitialized = true;
            
            const results = await solver.runSteppedSimulation(() => ({}), {
                stopTime: period * cycles,
                timeStep: period / 100
            });
            
            // 分析最後20%的數據
            const steadyStart = Math.floor(results.steps.length * 0.8);
            const steadyVoltages = results.steps.slice(steadyStart).map(s => s.nodeVoltages['out']);
            const outputAmplitude = (Math.max(...steadyVoltages) - Math.min(...steadyVoltages)) / 2;
            const gain = outputAmplitude / 10.0;
            
            console.log(`  ${cycles}週期: 增益=${gain.toFixed(4)}, 振幅=${outputAmplitude.toFixed(3)}V`);
        }
    }

    async testTimeStepEffect(L, C, R, testFreq) {
        console.log("\n⏰ 測試不同時間步長的影響:");
        const solver = new AkingSPICE();
        const period = 1 / testFreq;
        
        const stepsPerCycle = [20, 50, 100, 200, 500]; // 每週期的時間步數
        
        for (const steps of stepsPerCycle) {
            solver.reset();
            solver.components = [
                new VoltageSource('V1', ['in', '0'], `SINE(0 10 ${testFreq})`),
                new Inductor('L1', ['in', 'n1'], L),
                new Capacitor('C1', ['n1', 'out'], C),
                new Resistor('R1', ['out', '0'], R)
            ];
            solver.isInitialized = true;
            
            const timeStep = period / steps;
            const results = await solver.runSteppedSimulation(() => ({}), {
                stopTime: period * 20, // 固定20週期
                timeStep: timeStep
            });
            
            const steadyStart = Math.floor(results.steps.length * 0.8);
            const steadyVoltages = results.steps.slice(steadyStart).map(s => s.nodeVoltages['out']);
            const outputAmplitude = (Math.max(...steadyVoltages) - Math.min(...steadyVoltages)) / 2;
            const gain = outputAmplitude / 10.0;
            
            console.log(`  ${steps}步/週期: 增益=${gain.toFixed(4)}, 時間步=${(timeStep*1e6).toFixed(3)}μs`);
        }
    }

    async testImpedanceCalculation(L, C, R, testFreq) {
        console.log("\n🧮 直接測試阻抗計算:");
        
        const omega = 2 * Math.PI * testFreq;
        const XL = omega * L;
        const XC = 1 / (omega * C);
        const Z_total = Math.sqrt(R*R + (XL - XC)*(XL - XC));
        const theoreticalGain = R / Z_total;
        
        console.log(`  頻率: ${(testFreq/1000).toFixed(1)}kHz`);
        console.log(`  ω = ${omega.toFixed(0)} rad/s`);
        console.log(`  XL = ${XL.toFixed(3)}Ω`);
        console.log(`  XC = ${XC.toFixed(3)}Ω`);
        console.log(`  X = XL - XC = ${(XL-XC).toFixed(3)}Ω`);
        console.log(`  |Z| = √(R² + X²) = √(${R}² + ${(XL-XC).toFixed(3)}²) = ${Z_total.toFixed(3)}Ω`);
        console.log(`  理論增益 = R/|Z| = ${R}/${Z_total.toFixed(3)} = ${theoreticalGain.toFixed(4)}`);
        
        // 現在用最精確的設置模擬
        const solver = new AkingSPICE();
        solver.reset();
        solver.components = [
            new VoltageSource('V1', ['in', '0'], `SINE(0 10 ${testFreq})`),
            new Inductor('L1', ['in', 'n1'], L),
            new Capacitor('C1', ['n1', 'out'], C),
            new Resistor('R1', ['out', '0'], R)
        ];
        solver.isInitialized = true;
        
        const period = 1 / testFreq;
        const results = await solver.runSteppedSimulation(() => ({}), {
            stopTime: period * 50, // 長時間確保穩態
            timeStep: period / 500  // 高精度
        });
        
        const steadyStart = Math.floor(results.steps.length * 0.9); // 用最後10%
        const steadyVoltages = results.steps.slice(steadyStart).map(s => s.nodeVoltages['out']);
        const outputAmplitude = (Math.max(...steadyVoltages) - Math.min(...steadyVoltages)) / 2;
        const simulatedGain = outputAmplitude / 10.0;
        
        const error = Math.abs(simulatedGain - theoreticalGain) / theoreticalGain * 100;
        
        console.log(`  高精度模擬增益 = ${simulatedGain.toFixed(4)}`);
        console.log(`  誤差 = ${error.toFixed(2)}%`);
        
        // 分析中間節點電壓
        const n1Voltages = results.steps.slice(steadyStart).map(s => s.nodeVoltages['n1']);
        const n1Amplitude = (Math.max(...n1Voltages) - Math.min(...n1Voltages)) / 2;
        console.log(`  中間節點n1振幅 = ${n1Amplitude.toFixed(3)}V`);
        
        // 檢查相位關係
        console.log("\n📐 相位分析:");
        const inputPhase = this.findPhase(results.steps.slice(steadyStart).map(s => 10 * Math.sin(2*Math.PI*testFreq*s.time)));
        const outputPhase = this.findPhase(steadyVoltages);
        const phaseShift = outputPhase - inputPhase;
        console.log(`  相位偏移 = ${phaseShift.toFixed(1)}°`);
        
        // 理論相位偏移
        const theoreticalPhase = -Math.atan2(XL - XC, R) * 180 / Math.PI;
        console.log(`  理論相位偏移 = ${theoreticalPhase.toFixed(1)}°`);
    }

    findPhase(voltages) {
        // 簡化相位檢測：找第一個正向過零點
        for (let i = 1; i < voltages.length; i++) {
            if (voltages[i-1] <= 0 && voltages[i] > 0) {
                return (i / voltages.length) * 360; // 轉換為度
            }
        }
        return 0;
    }

    async testSteadyStateReaching(L, C, R, testFreq) {
        console.log("\n⏳ 測試穩態到達時間:");
        const solver = new AkingSPICE();
        const period = 1 / testFreq;
        
        solver.reset();
        solver.components = [
            new VoltageSource('V1', ['in', '0'], `SINE(0 10 ${testFreq})`),
            new Inductor('L1', ['in', 'n1'], L),
            new Capacitor('C1', ['n1', 'out'], C),
            new Resistor('R1', ['out', '0'], R)
        ];
        solver.isInitialized = true;
        
        const results = await solver.runSteppedSimulation(() => ({}), {
            stopTime: period * 100, // 很長時間
            timeStep: period / 200
        });
        
        // 分析增益收斂過程
        const windowSize = Math.floor(results.steps.length / 10); // 10個時間窗口
        console.log("  時間窗口增益變化:");
        
        for (let i = 0; i < 10; i++) {
            const start = i * windowSize;
            const end = (i + 1) * windowSize;
            const windowVoltages = results.steps.slice(start, end).map(s => s.nodeVoltages['out']);
            const amplitude = (Math.max(...windowVoltages) - Math.min(...windowVoltages)) / 2;
            const gain = amplitude / 10.0;
            const timePoint = results.steps[start].time;
            
            console.log(`    t=${(timePoint*1000).toFixed(1)}ms: 增益=${gain.toFixed(4)} (${(timePoint/period).toFixed(1)}週期)`);
        }
    }
}

async function main() {
    const analyzer = new RLCAnalysisRunner();
    await analyzer.analyzeRLCProblem();
}

main();