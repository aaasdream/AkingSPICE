/**
 * 性能基準測試
 * 
 * 測試 AkingSPICE 的執行效率和記憶體使用情況
 */

import { describe, it, assert } from './framework/TestFramework.js';
import { 
    AkingSPICE,
    StepwiseSimulator,
    Resistor,
    Capacitor,
    Inductor,
    VoltageSource,
    MCPDiode,
    MCPMOSFET
} from '../src/index.js';

// 性能測量工具
class PerformanceProfiler {
    constructor() {
        this.measurements = {};
    }

    startTimer(name) {
        this.measurements[name] = {
            startTime: performance.now(),
            startMemory: this.getMemoryUsage()
        };
    }

    stopTimer(name) {
        if (!this.measurements[name]) {
            throw new Error(`Timer '${name}' was not started`);
        }

        const measurement = this.measurements[name];
        measurement.endTime = performance.now();
        measurement.endMemory = this.getMemoryUsage();
        measurement.duration = measurement.endTime - measurement.startTime;
        measurement.memoryDelta = measurement.endMemory - measurement.startMemory;

        return measurement;
    }

    getMemoryUsage() {
        // 在 Node.js 環境中獲取記憶體使用情況
        if (typeof process !== 'undefined' && process.memoryUsage) {
            const mem = process.memoryUsage();
            return mem.heapUsed / 1024 / 1024; // MB
        }
        return 0;
    }

    getResults(name) {
        return this.measurements[name];
    }

    printSummary() {
        console.log('\n📊 性能測試總結:');
        console.log('='.repeat(70));
        console.log('測試項目'.padEnd(30) + '執行時間'.padEnd(15) + '記憶體變化');
        console.log('='.repeat(70));

        for (const [name, measurement] of Object.entries(this.measurements)) {
            if (measurement.duration !== undefined) {
                const timeStr = `${measurement.duration.toFixed(2)}ms`.padEnd(15);
                const memStr = `${measurement.memoryDelta.toFixed(2)}MB`;
                console.log(`${name.padEnd(30)}${timeStr}${memStr}`);
            }
        }
        console.log('='.repeat(70));
    }
}

// ==================== 基本組件性能測試 ====================
describe('基本組件性能測試', () => {

    it('應該高效創建大量組件', async () => {
        const profiler = new PerformanceProfiler();
        
        profiler.startTimer('創建1000個電阻');
        const resistors = [];
        for (let i = 0; i < 1000; i++) {
            resistors.push(new Resistor(`R${i}`, ['n1', 'n2'], 1000 + i));
        }
        const resistorResult = profiler.stopTimer('創建1000個電阻');
        
        profiler.startTimer('創建1000個電容');
        const capacitors = [];
        for (let i = 0; i < 1000; i++) {
            capacitors.push(new Capacitor(`C${i}`, ['n1', 'n2'], 1e-6 * (i + 1)));
        }
        const capacitorResult = profiler.stopTimer('創建1000個電容');
        
        // 性能斷言
        assert.isTrue(resistorResult.duration < 100, '1000個電阻創建應該在100ms內');
        assert.isTrue(capacitorResult.duration < 100, '1000個電容創建應該在100ms內');
        assert.equal(resistors.length, 1000, '應該創建1000個電阻');
        assert.equal(capacitors.length, 1000, '應該創建1000個電容');
        
        profiler.printSummary();
    });

});

// ==================== DC 分析性能測試 ====================
describe('DC 分析性能測試', () => {

    it('應該高效求解小型 DC 電路', async () => {
        const profiler = new PerformanceProfiler();
        const solver = new AkingSPICE();
        
        // 創建 10 節點電阻網路
        const components = [
            new VoltageSource('V1', ['n0', 'gnd'], 10)
        ];
        
        // 添加電阻鏈
        for (let i = 0; i < 9; i++) {
            components.push(new Resistor(`R${i}`, [`n${i}`, `n${i+1}`], 100 * (i + 1)));
        }
        components.push(new Resistor('Rload', ['n9', 'gnd'], 1000));
        
        solver.components = components;
        
        profiler.startTimer('10節點DC分析');
        const result = await solver.runDCMCPAnalysis();
        const dcResult = profiler.stopTimer('10節點DC分析');
        
        assert.exists(result, 'DC 分析結果應該存在');
        assert.isTrue(dcResult.duration < 50, '10節點DC分析應該在50ms內');
        assert.mapHasKey(result.nodeVoltages, 'n0', '應該有 n0 節點電壓');
        assert.mapHasKey(result.nodeVoltages, 'n9', '應該有 n9 節點電壓');
        
        profiler.printSummary();
    });

    it('應該高效求解中型 DC 電路 (50節點)', async () => {
        const profiler = new PerformanceProfiler();
        const solver = new AkingSPICE();
        
        // 創建 50 節點網格電路
        const components = [
            new VoltageSource('V1', ['n0_0', 'gnd'], 15),
            new VoltageSource('V2', ['n9_9', 'gnd'], -15)
        ];
        
        // 10x10 電阻網格
        for (let i = 0; i < 10; i++) {
            for (let j = 0; j < 10; j++) {
                const nodeName = `n${i}_${j}`;
                
                // 水平連接
                if (j < 9) {
                    components.push(new Resistor(`Rh_${i}_${j}`, [nodeName, `n${i}_${j+1}`], 100));
                }
                
                // 垂直連接
                if (i < 9) {
                    components.push(new Resistor(`Rv_${i}_${j}`, [nodeName, `n${i+1}_${j}`], 100));
                }
            }
        }
        
        solver.components = components;
        
        profiler.startTimer('50節點DC分析');
        const result = await solver.runDCMCPAnalysis();
        const dcResult = profiler.stopTimer('50節點DC分析');
        
        assert.exists(result, 'DC 分析結果應該存在');
        assert.isTrue(dcResult.duration < 200, '50節點DC分析應該在200ms內');
        assert.isTrue(result.nodeVoltages.size >= 40, '應該有足夠的節點電壓');
        
        profiler.printSummary();
    });

});

// ==================== 瞬態分析性能測試 ====================
describe('瞬態分析性能測試', () => {

    it('應該高效執行短時間瞬態分析', async () => {
        const profiler = new PerformanceProfiler();
        const simulator = new StepwiseSimulator({ debug: false });
        
        // 創建 RC 電路
        const components = [
            new VoltageSource('V1', ['vin', 'gnd'], 10),
            new Resistor('R1', ['vin', 'vout'], 1000),
            new Capacitor('C1', ['vout', 'gnd'], 1e-6, { ic: 0 })
        ];
        
        profiler.startTimer('RC瞬態初始化');
        await simulator.initialize(components, {
            startTime: 0,
            stopTime: 10e-6,  // 10μs
            timeStep: 0.1e-6  // 0.1μs, 100個時間步
        });
        const initResult = profiler.stopTimer('RC瞬態初始化');
        
        profiler.startTimer('RC瞬態仿真');
        await simulator.runSteps();
        const simResult = profiler.stopTimer('RC瞬態仿真');
        
        const stats = simulator.getStatistics();
        
        assert.isTrue(initResult.duration < 20, '瞬態初始化應該在20ms內');
        assert.isTrue(simResult.duration < 100, '100步瞬態仿真應該在100ms內');
        assert.equal(stats.stepCount, 100, '應該完成100個時間步');
        assert.equal(stats.progress, 100, '進度應該為100%');
        
        profiler.printSummary();
    });

    it('應該高效執行長時間瞬態分析', async () => {
        const profiler = new PerformanceProfiler();
        const simulator = new StepwiseSimulator({ debug: false });
        
        // 創建 RLC 電路
        const components = [
            new VoltageSource('V1', ['vin', 'gnd'], 'PULSE(0 5 1e-6 1e-9 1e-9 50e-6 100e-6)'),
            new Resistor('R1', ['vin', 'vrlc'], 50),
            new Inductor('L1', ['vrlc', 'vlc'], 100e-6, { ic: 0 }),
            new Capacitor('C1', ['vlc', 'gnd'], 10e-9, { ic: 0 })
        ];
        
        await simulator.initialize(components, {
            startTime: 0,
            stopTime: 1e-3,   // 1ms
            timeStep: 1e-6    // 1μs, 1000個時間步
        });
        
        profiler.startTimer('RLC長時間仿真');
        let stepCount = 0;
        while (!simulator.isCompleted && stepCount < 1000) {
            await simulator.stepForward();
            stepCount++;
            
            // 每100步報告一次進度
            if (stepCount % 100 === 0 && stepCount <= 500) {
                const stats = simulator.getStatistics();
                console.log(`  進度: ${stepCount}/1000 步 (${stats.progress.toFixed(1)}%)`);
            }
        }
        const longSimResult = profiler.stopTimer('RLC長時間仿真');
        
        assert.isTrue(stepCount >= 100, '應該執行至少100個時間步');
        assert.isTrue(longSimResult.duration < 2000, '1000步瞬態仿真應該在2秒內');
        
        // 計算平均每步時間
        const avgTimePerStep = longSimResult.duration / stepCount;
        assert.isTrue(avgTimePerStep < 2, '平均每步應該在2ms內');
        
        console.log(`  平均每步時間: ${avgTimePerStep.toFixed(2)}ms`);
        profiler.printSummary();
    });

});

// ==================== MCP 組件性能測試 ====================
describe('MCP 組件性能測試', () => {

    it('應該高效處理 MCP 二極管切換', async () => {
        const profiler = new PerformanceProfiler();
        const simulator = new StepwiseSimulator({ debug: false });
        
        // 創建二極管切換電路
        const components = [
            new VoltageSource('V1', ['vin', 'gnd'], 'SIN(0 5 1000)'), // 1kHz 正弦波
            new Resistor('R1', ['vin', 'anode'], 100),
            new MCPDiode('D1', ['anode', 'vout'], { Vf: 0.7, Ron: 0.01 }),
            new Resistor('Rload', ['vout', 'gnd'], 1000)
        ];
        
        profiler.startTimer('MCP二極管仿真');
        await simulator.initialize(components, {
            startTime: 0,
            stopTime: 5e-3,   // 5ms (5個週期)
            timeStep: 10e-6   // 10μs (每週期50個點)
        });
        
        let stateChanges = 0;
        let lastDiodeState = null;
        
        while (!simulator.isCompleted) {
            const result = await simulator.stepForward();
            if (result.success) {
                const diodeComponent = simulator.components.find(c => c.name === 'D1');
                if (diodeComponent && diodeComponent.diodeState !== lastDiodeState) {
                    stateChanges++;
                    lastDiodeState = diodeComponent.diodeState;
                }
            }
        }
        
        const mcpResult = profiler.stopTimer('MCP二極管仿真');
        
        assert.isTrue(mcpResult.duration < 500, 'MCP二極管仿真應該在500ms內');
        assert.isTrue(stateChanges > 5, '應該有多次狀態切換');
        
        console.log(`  狀態切換次數: ${stateChanges}`);
        profiler.printSummary();
    });

    it('應該高效處理 MCP MOSFET PWM 控制', async () => {
        const profiler = new PerformanceProfiler();
        const simulator = new StepwiseSimulator({ debug: false });
        
        // 創建 MOSFET PWM 電路
        const components = [
            new VoltageSource('Vdd', ['vdd', 'gnd'], 12),
            new MCPMOSFET('M1', ['vdd', 'vout', 'gate'], {
                Ron: 0.01,
                Vth: 2.0,
                type: 'NMOS',
                controlMode: 'external'
            }),
            new Inductor('L1', ['vout', 'vlout'], 100e-6, { ic: 0 }),
            new Resistor('Rload', ['vlout', 'gnd'], 10)
        ];
        
        profiler.startTimer('MCP_MOSFET_PWM仿真');
        await simulator.initialize(components, {
            startTime: 0,
            stopTime: 100e-6,  // 100μs
            timeStep: 1e-6     // 1μs
        });
        
        // PWM 控制: 10μs 週期, 50% 佔空比
        const pwmPeriod = 10e-6;
        const dutyCycle = 0.5;
        let switchOperations = 0;
        
        while (!simulator.isCompleted) {
            const result = await simulator.stepForward();
            if (result.success) {
                const phase = (result.time % pwmPeriod) / pwmPeriod;
                const shouldBeOn = phase < dutyCycle;
                
                const currentState = simulator.components.find(c => c.name === 'M1').gateState;
                const targetState = shouldBeOn ? 'ON' : 'OFF';
                
                if (currentState !== targetState) {
                    simulator.modifyComponent('M1', { gateState: targetState });
                    switchOperations++;
                }
            }
        }
        
        const pwmResult = profiler.stopTimer('MCP_MOSFET_PWM仿真');
        
        assert.isTrue(pwmResult.duration < 300, 'MCP MOSFET PWM 仿真應該在300ms內');
        assert.isTrue(switchOperations > 10, '應該有多次開關操作');
        
        console.log(`  開關操作次數: ${switchOperations}`);
        profiler.printSummary();
    });

});

// ==================== 記憶體使用測試 ====================
describe('記憶體使用測試', () => {

    it('應該合理管理記憶體', async () => {
        const profiler = new PerformanceProfiler();
        
        profiler.startTimer('記憶體壓力測試');
        
        // 創建多個仿真實例
        const simulators = [];
        for (let i = 0; i < 10; i++) {
            const simulator = new StepwiseSimulator({ debug: false });
            const components = [
                new VoltageSource('V1', ['vin', 'gnd'], 5 + i),
                new Resistor('R1', ['vin', 'vout'], 1000 * (i + 1)),
                new Capacitor('C1', ['vout', 'gnd'], 1e-6, { ic: 0 })
            ];
            
            await simulator.initialize(components, {
                startTime: 0,
                stopTime: 10e-6,
                timeStep: 1e-6
            });
            
            // 執行幾步仿真
            for (let step = 0; step < 10; step++) {
                await simulator.stepForward();
            }
            
            simulators.push(simulator);
        }
        
        const memoryResult = profiler.stopTimer('記憶體壓力測試');
        
        assert.equal(simulators.length, 10, '應該創建10個仿真器');
        assert.isTrue(memoryResult.memoryDelta < 50, '記憶體增長應該小於50MB');
        
        console.log(`  創建的仿真器數量: ${simulators.length}`);
        profiler.printSummary();
    });

});

// ==================== 擴展性測試 ====================
describe('擴展性測試', () => {

    it('應該支持大電路仿真', async () => {
        const profiler = new PerformanceProfiler();
        const solver = new AkingSPICE();
        
        // 創建大型電阻網路 (20x20 = 400 個節點)
        const components = [
            new VoltageSource('V1', ['corner1', 'gnd'], 10),
            new VoltageSource('V2', ['corner2', 'gnd'], -10)
        ];
        
        profiler.startTimer('大電路構建');
        
        // 創建 20x20 網格
        for (let i = 0; i < 20; i++) {
            for (let j = 0; j < 20; j++) {
                const nodeName = `grid_${i}_${j}`;
                
                // 水平連接
                if (j < 19) {
                    const nextNode = `grid_${i}_${j+1}`;
                    components.push(new Resistor(`Rh_${i}_${j}`, [nodeName, nextNode], 10));
                }
                
                // 垂直連接  
                if (i < 19) {
                    const nextNode = `grid_${i+1}_${j}`;
                    components.push(new Resistor(`Rv_${i}_${j}`, [nodeName, nextNode], 10));
                }
            }
        }
        
        // 邊界條件
        components[0].nodes = ['grid_0_0', 'gnd'];    // V1 連接到左上角
        components[1].nodes = ['grid_19_19', 'gnd'];  // V2 連接到右下角
        
        const buildResult = profiler.stopTimer('大電路構建');
        
        solver.components = components;
        
        profiler.startTimer('大電路DC分析');
        const result = await solver.runDCMCPAnalysis();
        const analysisResult = profiler.stopTimer('大電路DC分析');
        
        assert.isTrue(buildResult.duration < 100, '大電路構建應該在100ms內');
        assert.isTrue(analysisResult.duration < 1000, '大電路DC分析應該在1秒內');
        assert.exists(result, 'DC 分析結果應該存在');
        assert.isTrue(result.nodeVoltages.size > 100, '應該有大量節點電壓');
        
        console.log(`  總組件數: ${components.length}`);
        console.log(`  節點電壓數: ${result.nodeVoltages.size}`);
        profiler.printSummary();
    });

});

console.log('⚡ 性能基準測試已載入完成');