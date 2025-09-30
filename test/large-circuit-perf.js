/**
 * 大規模電路性能測試框架
 * 生成複雜電路並測試GPU vs CPU性能
 */

import { BatchGPUExplicitSolver } from '../src/core/batch-gpu-solver.js';
import { ExplicitStateSolver } from '../src/core/explicit-state-solver.js';
import { VoltageSource, CurrentSource } from '../src/components/sources.js';
import { Resistor } from '../src/components/resistor.js';
import { Capacitor } from '../src/components/capacitor.js';
import { Inductor } from '../src/components/inductor.js';

/**
 * 電路生成器 - 創建不同規模和拓撲的測試電路
 */
class CircuitGenerator {
    /**
     * 生成RC梯形濾波器 (多級低通濾波)
     * @param {number} stages 級數
     * @param {number} baseR 基礎電阻值 (Ω)
     * @param {number} baseC 基礎電容值 (F)
     */
    static createRCLadder(stages, baseR = 100, baseC = 1e-9) {
        const components = [];
        
        // 輸入電壓源
        components.push(new VoltageSource('Vin', ['in', 'gnd'], 10.0));
        
        // RC梯形結構
        for (let i = 0; i < stages; i++) {
            const nodeIn = i === 0 ? 'in' : `n${i}`;
            const nodeOut = `n${i+1}`;
            
            // 串聯電阻
            components.push(new Resistor(`R${i+1}`, [nodeIn, nodeOut], baseR * (1 + Math.random() * 0.2))); // ±10%容差
            
            // 並聯電容到地
            components.push(new Capacitor(`C${i+1}`, [nodeOut, 'gnd'], baseC * (1 + Math.random() * 0.1))); // ±5%容差
        }
        
        // 輸出負載電阻
        components.push(new Resistor('Rload', [`n${stages}`, 'gnd'], baseR * 10));
        
        return {
            components,
            description: `${stages}級RC梯形濾波器`,
            nodeCount: stages + 2, // in, gnd, n1...nN
            stateVariableCount: stages, // 每個電容一個狀態變量
        };
    }

    /**
     * 生成RLC振盪電路網絡
     * @param {number} oscillators 振盪器數量
     * @param {number} couplingStrength 耦合強度 (0-1)
     */
    static createCoupledRLC(oscillators, couplingStrength = 0.1) {
        const components = [];
        const baseR = 10; // 10Ω
        const baseL = 1e-6; // 1μH  
        const baseC = 1e-9; // 1nF
        
        // 激勵源
        components.push(new VoltageSource('Vdrive', ['drive', 'gnd'], 5.0));
        components.push(new Resistor('Rdrive', ['drive', 'n0_L'], baseR));
        
        // 獨立RLC振盪器
        for (let i = 0; i < oscillators; i++) {
            const nodeL = `n${i}_L`;
            const nodeC = `n${i}_C`;
            
            // L-C串聯諧振器
            components.push(new Inductor(`L${i}`, [i === 0 ? nodeL : `n${i-1}_couple`, nodeC], baseL));
            components.push(new Capacitor(`C${i}`, [nodeC, 'gnd'], baseC));
            components.push(new Resistor(`R${i}`, [nodeC, 'gnd'], baseR * 100)); // 阻尼電阻
            
            // 耦合到下一個振盪器
            if (i < oscillators - 1) {
                const couplingR = baseR / couplingStrength;
                components.push(new Resistor(`Rcoup${i}`, [nodeC, `n${i}_couple`], couplingR));
            }
        }
        
        return {
            components,
            description: `${oscillators}個耦合RLC振盪器`,
            nodeCount: oscillators * 2 + 3, // 每個RLC 2個節點 + drive, gnd, 耦合點
            stateVariableCount: oscillators * 2, // 每個L和C各一個狀態變量
        };
    }

    /**
     * 生成開關電源模型 (Buck轉換器)
     * @param {number} stages 功率級數
     */
    static createSwitchingPowerSupply(stages) {
        const components = [];
        
        // 輸入電源
        components.push(new VoltageSource('Vin', ['vin', 'gnd'], 12.0));
        components.push(new Resistor('Rin', ['vin', 'sw_in'], 0.1)); // ESR
        
        // 多級Buck轉換器
        for (let i = 0; i < stages; i++) {
            const nodeIn = i === 0 ? 'sw_in' : `buck${i}_out`;
            const nodeSw = `buck${i+1}_sw`;
            const nodeOut = `buck${i+1}_out`;
            
            // 開關網絡 (簡化為電阻模型)
            components.push(new Resistor(`Rsw${i+1}`, [nodeIn, nodeSw], 0.05)); // 開關導通電阻
            
            // LC濾波器
            components.push(new Inductor(`L${i+1}`, [nodeSw, nodeOut], 10e-6)); // 10μH
            components.push(new Capacitor(`C${i+1}`, [nodeOut, 'gnd'], 100e-6)); // 100μF
            
            // 負載電阻
            components.push(new Resistor(`Rload${i+1}`, [nodeOut, 'gnd'], 1.0)); // 1Ω負載
        }
        
        return {
            components,
            description: `${stages}級開關電源 (Buck轉換器)`,
            nodeCount: stages * 3 + 2, // 每級3個節點 + vin, gnd
            stateVariableCount: stages * 2, // 每個L和C各一個狀態變量
        };
    }

    /**
     * 生成複雜模擬電路 (運放網絡)
     * @param {number} opamps 運放數量
     */
    static createAnalogCircuit(opamps) {
        const components = [];
        
        // 信號源
        components.push(new VoltageSource('Vsig', ['sig', 'gnd'], 1.0)); // 1V信號
        components.push(new Resistor('Rsig', ['sig', 'amp0_in'], 1000)); // 信號源內阻
        
        // 多級放大器鏈
        for (let i = 0; i < opamps; i++) {
            const nodeIn = `amp${i}_in`;
            const nodeOut = `amp${i}_out`;
            const nodeFb = `amp${i}_fb`;
            
            // 運放輸入網絡
            components.push(new Resistor(`Rin${i}`, [nodeIn, 'gnd'], 1e6)); // 輸入阻抗
            components.push(new Capacitor(`Cin${i}`, [nodeIn, 'gnd'], 10e-12)); // 輸入電容
            
            // 運放輸出 (簡化為受控源)
            components.push(new Resistor(`Ramp${i}`, [nodeIn, nodeOut], 1)); // 理想增益=1的跟隨器
            
            // 反饋網絡
            components.push(new Resistor(`Rfb${i}`, [nodeOut, nodeFb], 10000)); // 反饋電阻
            components.push(new Capacitor(`Cfb${i}`, [nodeFb, 'gnd'], 1e-12)); // 反饋電容
            
            // 連接到下一級
            if (i < opamps - 1) {
                components.push(new Resistor(`Rcoup${i}`, [nodeOut, `amp${i+1}_in`], 1000));
                components.push(new Capacitor(`Ccoup${i}`, [`amp${i+1}_in`, 'gnd'], 100e-12)); // 耦合電容
            }
        }
        
        // 輸出負載
        const finalOut = `amp${opamps-1}_out`;
        components.push(new Resistor('Rout', [finalOut, 'gnd'], 1000));
        components.push(new Capacitor('Cout', [finalOut, 'gnd'], 1e-9));
        
        return {
            components,
            description: `${opamps}級模擬放大器`,
            nodeCount: opamps * 3 + 2, // 每個運放3個節點 + sig, gnd
            stateVariableCount: (opamps + 1) * 2 + (opamps - 1), // 輸入電容 + 反饋電容 + 耦合電容
        };
    }
}

/**
 * 性能測試套件
 */
class PerformanceTestSuite {
    constructor() {
        this.results = [];
    }

    /**
     * 執行單個電路的性能測試
     */
    async runSingleTest(circuit, testName, simTime = 1e-5, timeStep = 1e-7) {
        console.log(`\n🔬 測試: ${testName}`);
        console.log(`   電路: ${circuit.description}`);
        console.log(`   規模: ${circuit.nodeCount} 節點, ${circuit.stateVariableCount} 狀態變量`);
        console.log(`   仿真: ${simTime * 1e6}μs, 步長 ${timeStep * 1e6}μs`);
        
        const expectedSteps = Math.ceil(simTime / timeStep);
        console.log(`   預計步數: ${expectedSteps}`);
        
        // GPU測試
        console.log('\n   🚀 GPU測試...');
        const gpuResult = await this.runGPUTest(circuit.components, simTime, timeStep);
        
        // CPU測試 (如果電路不太大)
        let cpuResult = null;
        if (circuit.nodeCount <= 50) {
            console.log('\n   💻 CPU測試...');
            cpuResult = await this.runCPUTest(circuit.components, simTime, timeStep);
        } else {
            console.log('\n   💻 CPU測試: 跳過 (電路過大)');
        }
        
        // 結果分析
        const result = this.analyzeResults(circuit, gpuResult, cpuResult, testName);
        this.results.push(result);
        
        return result;
    }

    /**
     * GPU性能測試
     */
    async runGPUTest(components, simTime, timeStep) {
        const solver = new BatchGPUExplicitSolver({
            debug: false,
            timeStep: timeStep,
            batchSize: 100,
            solverMaxIterations: 30,
        });
        
        try {
            const initStart = performance.now();
            await solver.initialize(components, timeStep);
            const initTime = performance.now() - initStart;
            
            const simStart = performance.now();
            const results = await solver.runOptimizedTransientAnalysis(0, simTime, timeStep);
            const simTime_ms = performance.now() - simStart;
            
            return {
                success: true,
                initTime,
                simulationTime: simTime_ms,
                steps: results.totalSteps,
                stepsPerSecond: results.optimizedStepsPerSecond,
                finalState: results.results[results.results.length - 1],
                stats: results.stats,
            };
            
        } catch (error) {
            return {
                success: false,
                error: error.message,
            };
        } finally {
            solver.destroy();
        }
    }

    /**
     * CPU性能測試
     */
    async runCPUTest(components, simTime, timeStep) {
        const solver = new ExplicitStateSolver({
            debug: false,
            solverMaxIterations: 30,
            solverTolerance: 1e-6,
        });
        
        try {
            const initStart = performance.now();
            await solver.initialize(components, timeStep);
            const initTime = performance.now() - initStart;
            
            const simStart = performance.now();
            const results = await solver.run(0, simTime);
            const simTime_ms = performance.now() - simStart;
            
            return {
                success: true,
                initTime,
                simulationTime: simTime_ms,
                steps: results.timeVector.length,
                stepsPerSecond: results.timeVector.length / simTime_ms * 1000,
                finalState: results.timeVector[results.timeVector.length - 1],
                stats: results.stats,
            };
            
        } catch (error) {
            return {
                success: false,
                error: error.message,
            };
        }
    }

    /**
     * 分析測試結果
     */
    analyzeResults(circuit, gpuResult, cpuResult, testName) {
        const result = {
            testName,
            circuit: {
                description: circuit.description,
                nodeCount: circuit.nodeCount,
                stateCount: circuit.stateVariableCount,
                componentCount: circuit.components.length,
            },
            gpu: gpuResult,
            cpu: cpuResult,
            comparison: null,
        };
        
        // 性能對比
        if (gpuResult.success && cpuResult && cpuResult.success) {
            const speedup = cpuResult.stepsPerSecond > 0 ? 
                gpuResult.stepsPerSecond / cpuResult.stepsPerSecond : 0;
            
            result.comparison = {
                speedup: speedup,
                gpuAdvantage: speedup > 1,
                gpuFaster: gpuResult.simulationTime < cpuResult.simulationTime,
                efficiency: speedup / circuit.nodeCount, // 每節點的加速效果
            };
            
            console.log(`\n   📊 性能對比:`);
            console.log(`      GPU: ${gpuResult.stepsPerSecond.toFixed(0)} 步/秒, ${gpuResult.simulationTime.toFixed(2)}ms`);
            console.log(`      CPU: ${cpuResult.stepsPerSecond.toFixed(0)} 步/秒, ${cpuResult.simulationTime.toFixed(2)}ms`);
            console.log(`      加速比: ${speedup.toFixed(2)}x ${speedup > 1 ? '🚀' : '🐌'}`);
            console.log(`      效率: ${result.comparison.efficiency.toFixed(3)} (加速比/節點)`);
            
        } else {
            console.log(`\n   📊 結果:`);
            if (gpuResult.success) {
                console.log(`      GPU: ${gpuResult.stepsPerSecond.toFixed(0)} 步/秒 ✅`);
            } else {
                console.log(`      GPU: 失敗 ❌ (${gpuResult.error})`);
            }
            
            if (cpuResult) {
                if (cpuResult.success) {
                    console.log(`      CPU: ${cpuResult.stepsPerSecond.toFixed(0)} 步/秒 ✅`);
                } else {
                    console.log(`      CPU: 失敗 ❌ (${cpuResult.error})`);
                }
            }
        }
        
        return result;
    }

    /**
     * 生成性能報告
     */
    generateReport() {
        console.log('\n' + '='.repeat(80));
        console.log('📊 大規模電路GPU加速性能報告');
        console.log('='.repeat(80));
        
        const successful = this.results.filter(r => r.gpu.success);
        const withComparison = successful.filter(r => r.comparison);
        
        console.log(`\n總測試數: ${this.results.length}`);
        console.log(`成功測試: ${successful.length}`);
        console.log(`GPU vs CPU對比: ${withComparison.length}`);
        
        if (withComparison.length > 0) {
            const avgSpeedup = withComparison.reduce((sum, r) => sum + r.comparison.speedup, 0) / withComparison.length;
            const maxSpeedup = Math.max(...withComparison.map(r => r.comparison.speedup));
            const minSpeedup = Math.min(...withComparison.map(r => r.comparison.speedup));
            
            console.log(`\n🚀 GPU加速效果:`);
            console.log(`   平均加速比: ${avgSpeedup.toFixed(2)}x`);
            console.log(`   最大加速比: ${maxSpeedup.toFixed(2)}x`);
            console.log(`   最小加速比: ${minSpeedup.toFixed(2)}x`);
            
            const gpuWins = withComparison.filter(r => r.comparison.speedup > 1).length;
            console.log(`   GPU勝出: ${gpuWins}/${withComparison.length} (${(gpuWins/withComparison.length*100).toFixed(1)}%)`);
        }
        
        console.log(`\n📈 性能詳細:`);
        successful.forEach(result => {
            const gpu = result.gpu;
            const perf = `${gpu.stepsPerSecond.toFixed(0)} 步/秒`;
            const speedup = result.comparison ? ` (${result.comparison.speedup.toFixed(1)}x)` : '';
            console.log(`   ${result.testName}: ${perf}${speedup}`);
        });
        
        return {
            totalTests: this.results.length,
            successfulTests: successful.length,
            averageSpeedup: withComparison.length > 0 ? 
                withComparison.reduce((sum, r) => sum + r.comparison.speedup, 0) / withComparison.length : 0,
            results: this.results,
        };
    }
}

export { CircuitGenerator, PerformanceTestSuite };