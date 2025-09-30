/**
 * GPU加速顯式狀態更新求解器測試
 * 驗證WebGPU集成和電路仿真性能
 */

import { GPUExplicitStateSolver } from '../src/core/gpu-explicit-solver.js';
import { VoltageSource } from '../src/components/sources.js';
import { Resistor } from '../src/components/resistor.js';
import { Capacitor } from '../src/components/capacitor.js';

async function testGPUExplicitSolver() {
    console.log('🔥 GPU加速顯式狀態更新求解器測試\n');
    
    try {
        // 測試1: RC電路GPU仿真
        console.log('=== 測試1: RC電路GPU仿真 ===');
        await testRCCircuitGPU();
        
        // 測試2: 性能基準測試
        console.log('\n=== 測試2: GPU vs CPU性能對比 ===');
        await performanceComparison();
        
        // 測試3: 大規模電路測試
        console.log('\n=== 測試3: 大規模電路GPU加速 ===');
        await largeCircuitTest();
        
        console.log('\n✅ GPU加速求解器測試完成！');
        
    } catch (error) {
        console.error('\n❌ GPU求解器測試失敗:', error.message);
        console.error('詳細錯誤:', error);
        process.exit(1);
    }
}

/**
 * RC電路GPU仿真測試
 */
async function testRCCircuitGPU() {
    // 創建RC電路組件
    const components = [
        new VoltageSource('V1', ['vin', 'gnd'], 5.0),        // 5V電壓源
        new Resistor('R1', ['vin', 'node1'], 1000),          // 1kΩ電阻
        new Capacitor('C1', ['node1', 'gnd'], 1e-6),         // 1μF電容
    ];
    
    console.log('電路: V1(5V) -> R1(1kΩ) -> C1(1μF) -> GND');
    
    // 初始化GPU求解器
    const gpuSolver = new GPUExplicitStateSolver({
        debug: true,
        timeStep: 1e-6,
        solverMaxIterations: 1000,
        solverTolerance: 1e-9,
    });
    
    try {
        // 初始化
        console.log('初始化GPU求解器...');
        await gpuSolver.initialize(components, 1e-6);
        
        // 運行仿真
        console.log('開始GPU仿真...');
        const gpuResults = await gpuSolver.runTransientAnalysis(0, 1e-3, 1e-6); // 1ms仿真
        
        // 驗證結果
        console.log('\n=== GPU仿真結果驗證 ===');
        const finalResult = gpuResults.results[gpuResults.results.length - 1];
        const finalCapVoltage = finalResult.stateVector[0]; // 電容電壓
        
        // 理論值: Vc(t) = V * (1 - e^(-t/RC))
        // 在 t=1ms, τ=RC=1ms 時: Vc = 5 * (1 - e^(-1)) ≈ 3.16V
        const theoreticalFinal = 5.0 * (1 - Math.exp(-1));
        const error = Math.abs(finalCapVoltage - theoreticalFinal) / theoreticalFinal * 100;
        
        console.log(`總時間步數: ${gpuResults.totalSteps}`);
        console.log(`實際仿真時間: ${gpuResults.stats.totalSimulationTime.toFixed(2)}ms`);
        console.log(`最終電容電壓: ${finalCapVoltage.toFixed(4)}V`);
        console.log(`理論值: ${theoreticalFinal.toFixed(4)}V`);
        console.log(`誤差: ${error.toFixed(2)}%`);
        
        // GPU性能統計
        console.log('\n=== GPU性能統計 ===');
        const stats = gpuResults.stats;
        console.log(`GPU求解次數: ${stats.totalGPUSolves}`);
        console.log(`平均GPU時間: ${stats.avgGPUTime.toFixed(3)}ms`);
        console.log(`平均狀態更新時間: ${stats.avgStateUpdateTime.toFixed(3)}ms`);
        
        if (error < 5) {
            console.log('✅ RC電路GPU仿真正確');
        } else {
            throw new Error(`GPU仿真誤差過大: ${error.toFixed(2)}%`);
        }
        
    } finally {
        gpuSolver.destroy();
    }
}

/**
 * GPU vs CPU性能對比
 */
async function performanceComparison() {
    console.log('創建性能測試電路...');
    
    // 創建相同的RC電路
    const components = [
        new VoltageSource('V1', ['vin', 'gnd'], 5.0),
        new Resistor('R1', ['vin', 'node1'], 1000),
        new Capacitor('C1', ['node1', 'gnd'], 1e-6),
    ];
    
    const timeStep = 1e-6;
    const simTime = 1e-4; // 100μs仿真
    const expectedSteps = Math.ceil(simTime / timeStep);
    
    console.log(`測試參數: ${simTime*1e6}μs 仿真, ${timeStep*1e6}μs 步長, ~${expectedSteps} 步`);
    
    // GPU測試
    console.log('\n1. GPU性能測試...');
    const gpuSolver = new GPUExplicitStateSolver({
        debug: false,
        timeStep: timeStep,
    });
    
    try {
        await gpuSolver.initialize(components, timeStep);
        
        const gpuStartTime = performance.now();
        const gpuResults = await gpuSolver.runTransientAnalysis(0, simTime, timeStep);
        const gpuTime = performance.now() - gpuStartTime;
        
        console.log(`   GPU總時間: ${gpuTime.toFixed(2)}ms`);
        console.log(`   GPU步數: ${gpuResults.totalSteps}`);
        console.log(`   GPU步速: ${(gpuResults.totalSteps / gpuTime * 1000).toFixed(0)} 步/秒`);
        
        const gpuStats = gpuResults.stats;
        console.log(`   平均GPU求解: ${gpuStats.avgGPUTime.toFixed(3)}ms/步`);
        console.log(`   平均狀態更新: ${gpuStats.avgStateUpdateTime.toFixed(3)}ms/步`);
        
        // 暫時沒有CPU版本對比，顯示GPU baseline
        console.log('\n✅ GPU性能基準建立');
        
        return {
            gpuTime,
            gpuSteps: gpuResults.totalSteps,
            gpuStepsPerSecond: gpuResults.totalSteps / gpuTime * 1000,
        };
        
    } finally {
        gpuSolver.destroy();
    }
}

/**
 * 大規模電路GPU加速測試
 */
async function largeCircuitTest() {
    console.log('創建大規模RC電路 (10個RC節點)...');
    
    // 創建10段RC梯形電路
    const components = [];
    
    // 電壓源
    components.push(new VoltageSource('V1', ['vin', 'gnd'], 10.0));
    
    // 10段RC電路
    for (let i = 0; i < 10; i++) {
        const nodeIn = i === 0 ? 'vin' : `node${i}`;
        const nodeOut = `node${i+1}`;
        
        components.push(new Resistor(`R${i+1}`, [nodeIn, nodeOut], 100)); // 100Ω
        components.push(new Capacitor(`C${i+1}`, [nodeOut, 'gnd'], 1e-7)); // 0.1μF
    }
    
    console.log(`電路規模: ${components.length} 組件, ~${10+1} 節點, 10 狀態變量`);
    
    // 初始化GPU求解器
    const gpuSolver = new GPUExplicitStateSolver({
        debug: false,
        timeStep: 1e-7, // 更小的時間步
        solverMaxIterations: 2000,
    });
    
    try {
        console.log('初始化大規模電路...');
        await gpuSolver.initialize(components, 1e-7);
        
        console.log('開始大規模GPU仿真...');
        const startTime = performance.now();
        const results = await gpuSolver.runTransientAnalysis(0, 1e-5, 1e-7); // 10μs仿真
        const totalTime = performance.now() - startTime;
        
        console.log('\n=== 大規模電路結果 ===');
        console.log(`總仿真時間: ${totalTime.toFixed(2)}ms`);
        console.log(`總時間步數: ${results.totalSteps}`);
        console.log(`仿真速度: ${(results.totalSteps / totalTime * 1000).toFixed(0)} 步/秒`);
        
        const finalState = results.results[results.results.length - 1];
        console.log('最終狀態變量 (前5個):');
        for (let i = 0; i < Math.min(5, finalState.stateVector.length); i++) {
            console.log(`   C${i+1}: ${finalState.stateVector[i].toFixed(4)}V`);
        }
        
        const stats = results.stats;
        console.log(`平均GPU求解時間: ${stats.avgGPUTime.toFixed(3)}ms`);
        console.log(`GPU加速效果: 展示中等規模電路的並行處理能力`);
        
        console.log('✅ 大規模電路GPU測試完成');
        
    } finally {
        gpuSolver.destroy();
    }
}

// 運行測試
testGPUExplicitSolver().catch(console.error);