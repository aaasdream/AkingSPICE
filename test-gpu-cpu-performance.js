/**
 * GPU vs CPU 性能對比測試
 * 測試相同電路在 GPU 和 CPU 求解器上的性能差異
 */

import { 
    ExplicitStateSolver,      // CPU 求解器
    GPUExplicitStateSolver,   // GPU 求解器
    VoltageSource, 
    Resistor, 
    Capacitor, 
    Inductor 
} from './lib-dist/AkingSPICE.es.js';

console.log('🚀 GPU vs CPU 性能對比測試');
console.log('=' .repeat(60));

// 測試電路配置
const TEST_CIRCUITS = {
    rc_small: {
        name: 'RC電路 (小規模)',
        description: '5V → 1kΩ → 1μF',
        components: () => [
            new VoltageSource('V1', ['vin', 'gnd'], 5.0),
            new Resistor('R1', ['vin', 'vout'], 1000),
            new Capacitor('C1', ['vout', 'gnd'], 1e-6, { ic: 0 })
        ],
        outputNode: 'vout',
        timeStep: 1e-6,     // 1μs
        testTime: 5e-3,     // 5ms
        expectedSteps: 5000
    },

    rlc_medium: {
        name: 'RLC電路 (中等規模)',
        description: '12V → 50Ω → 100μH → 1μF',
        components: () => [
            new VoltageSource('V1', ['vin', 'gnd'], 12.0),
            new Resistor('R1', ['vin', 'n1'], 50),
            new Inductor('L1', ['n1', 'n2'], 100e-6),
            new Capacitor('C1', ['n2', 'gnd'], 1e-6)
        ],
        outputNode: 'n2',
        timeStep: 0.5e-6,   // 0.5μs
        testTime: 2e-3,     // 2ms
        expectedSteps: 4000
    },

    multi_rlc: {
        name: '多級RLC電路 (大規模)',
        description: '複雜多節點電路',
        components: () => [
            new VoltageSource('V1', ['vin', 'gnd'], 10.0),
            // 第一級 RLC
            new Resistor('R1', ['vin', 'n1'], 100),
            new Inductor('L1', ['n1', 'n2'], 50e-6),
            new Capacitor('C1', ['n2', 'gnd'], 0.5e-6),
            // 第二級 RLC
            new Resistor('R2', ['n2', 'n3'], 200),
            new Inductor('L2', ['n3', 'n4'], 75e-6),
            new Capacitor('C2', ['n4', 'gnd'], 0.8e-6),
            // 第三級 RLC
            new Resistor('R3', ['n4', 'n5'], 150),
            new Inductor('L3', ['n5', 'vout'], 60e-6),
            new Capacitor('C3', ['vout', 'gnd'], 1.2e-6)
        ],
        outputNode: 'vout',
        timeStep: 0.2e-6,   // 0.2μs  
        testTime: 1e-3,     // 1ms
        expectedSteps: 5000
    }
};

/**
 * 測試單個求解器的性能
 */
async function testSolver(solverName, SolverClass, components, config, iterations = 3) {
    console.log(`\n🔧 測試 ${solverName} 求解器`);
    console.log(`📋 電路: ${config.description}`);
    console.log(`⏱️  步長: ${(config.timeStep * 1e6).toFixed(1)}μs, 時間: ${(config.testTime * 1000).toFixed(1)}ms, 步數: ${config.expectedSteps}`);
    
    const results = [];
    
    for (let i = 0; i < iterations; i++) {
        const solver = new SolverClass();
        
        try {
            // 初始化
            const initStart = performance.now();
            await solver.initialize(components(), config.timeStep);
            const initTime = performance.now() - initStart;
            
            // 執行仿真
            const simStart = performance.now();
            const simResult = await solver.run(0, config.testTime);
            const simTime = performance.now() - simStart;
            
            // 計算性能指標
            const totalTime = initTime + simTime;
            const stepsPerSecond = config.expectedSteps / (simTime / 1000);
            
            // 獲取最終電壓 - 兩個求解器返回格式不同
            let finalVoltage = 0;
            if (simResult.nodeVoltages && simResult.nodeVoltages[config.outputNode]) {
                const voltageData = simResult.nodeVoltages[config.outputNode];
                if (Array.isArray(voltageData)) {
                    // CPU 求解器返回數組
                    finalVoltage = voltageData[voltageData.length - 1];
                } else {
                    // GPU 求解器返回單個值
                    finalVoltage = voltageData;
                }
            }
                
            results.push({
                iteration: i + 1,
                initTime,
                simTime, 
                totalTime,
                stepsPerSecond,
                finalVoltage,
                success: true
            });
            
            console.log(`  第${i+1}次: 初始化${initTime.toFixed(1)}ms + 仿真${simTime.toFixed(1)}ms = 總計${totalTime.toFixed(1)}ms`);
            console.log(`         性能: ${Math.round(stepsPerSecond).toLocaleString()} 步/秒, 最終電壓: ${finalVoltage.toFixed(4)}V`);
            
        } catch (error) {
            console.log(`  第${i+1}次: ❌ 失敗 - ${error.message}`);
            results.push({
                iteration: i + 1,
                error: error.message,
                success: false
            });
        }
    }
    
    // 計算統計結果
    const successfulResults = results.filter(r => r.success);
    if (successfulResults.length === 0) {
        return { 
            solverName, 
            success: false, 
            error: '所有測試都失敗了' 
        };
    }
    
    const avgInitTime = successfulResults.reduce((sum, r) => sum + r.initTime, 0) / successfulResults.length;
    const avgSimTime = successfulResults.reduce((sum, r) => sum + r.simTime, 0) / successfulResults.length;
    const avgTotalTime = successfulResults.reduce((sum, r) => sum + r.totalTime, 0) / successfulResults.length;
    const avgStepsPerSecond = successfulResults.reduce((sum, r) => sum + r.stepsPerSecond, 0) / successfulResults.length;
    const avgFinalVoltage = successfulResults.reduce((sum, r) => sum + r.finalVoltage, 0) / successfulResults.length;
    
    console.log(`📊 平均結果: 初始化${avgInitTime.toFixed(1)}ms + 仿真${avgSimTime.toFixed(1)}ms = 總計${avgTotalTime.toFixed(1)}ms`);
    console.log(`📈 平均性能: ${Math.round(avgStepsPerSecond).toLocaleString()} 步/秒`);
    console.log(`🎯 平均電壓: ${avgFinalVoltage.toFixed(4)}V`);
    
    return {
        solverName,
        success: true,
        avgInitTime,
        avgSimTime,
        avgTotalTime,
        avgStepsPerSecond,
        avgFinalVoltage,
        successRate: successfulResults.length / results.length * 100
    };
}

/**
 * 對比兩個求解器的性能
 */
function compareResults(cpuResult, gpuResult) {
    if (!cpuResult.success && !gpuResult.success) {
        console.log('❌ 兩個求解器都失敗了');
        return;
    }
    
    if (!cpuResult.success) {
        console.log('❌ CPU求解器失敗，無法對比');
        return;
    }
    
    if (!gpuResult.success) {
        console.log('❌ GPU求解器失敗，無法對比');
        return;
    }
    
    console.log('\n📊 性能對比結果');
    console.log('-' .repeat(50));
    
    // 速度對比
    const speedRatio = gpuResult.avgStepsPerSecond / cpuResult.avgStepsPerSecond;
    console.log(`🚀 仿真性能:`);
    console.log(`   CPU: ${Math.round(cpuResult.avgStepsPerSecond).toLocaleString()} 步/秒`);
    console.log(`   GPU: ${Math.round(gpuResult.avgStepsPerSecond).toLocaleString()} 步/秒`);
    
    if (speedRatio > 1.1) {
        console.log(`   🎉 GPU比CPU快 ${speedRatio.toFixed(1)}x`);
    } else if (speedRatio < 0.9) {
        console.log(`   ⚠️  GPU比CPU慢 ${(1/speedRatio).toFixed(1)}x`);
    } else {
        console.log(`   ⚖️  性能相近 (差異 ${Math.abs(speedRatio - 1) * 100}.toFixed(1)%)`);
    }
    
    // 初始化時間對比
    const initRatio = cpuResult.avgInitTime / gpuResult.avgInitTime;
    console.log(`\n⏱️  初始化時間:`);
    console.log(`   CPU: ${cpuResult.avgInitTime.toFixed(1)}ms`);
    console.log(`   GPU: ${gpuResult.avgInitTime.toFixed(1)}ms`);
    
    if (initRatio > 1.1) {
        console.log(`   🎉 GPU初始化更快 ${initRatio.toFixed(1)}x`);
    } else if (initRatio < 0.9) {
        console.log(`   ⚠️  GPU初始化更慢 ${(1/initRatio).toFixed(1)}x`);
    } else {
        console.log(`   ⚖️  初始化時間相近`);
    }
    
    // 精度對比
    const voltageError = Math.abs(gpuResult.avgFinalVoltage - cpuResult.avgFinalVoltage);
    const voltageErrorPercent = voltageError / Math.max(Math.abs(cpuResult.avgFinalVoltage), 1e-10) * 100;
    
    console.log(`\n🎯 精度對比:`);
    console.log(`   CPU最終電壓: ${cpuResult.avgFinalVoltage.toFixed(6)}V`);
    console.log(`   GPU最終電壓: ${gpuResult.avgFinalVoltage.toFixed(6)}V`);
    console.log(`   絕對誤差: ${voltageError.toFixed(6)}V`);
    console.log(`   相對誤差: ${voltageErrorPercent.toFixed(3)}%`);
    
    if (voltageErrorPercent < 0.1) {
        console.log(`   ✅ 精度優秀 (< 0.1%)`);
    } else if (voltageErrorPercent < 1.0) {
        console.log(`   ✅ 精度良好 (< 1%)`);
    } else if (voltageErrorPercent < 5.0) {
        console.log(`   ⚠️  精度一般 (< 5%)`);
    } else {
        console.log(`   ❌ 精度較差 (> 5%)`);
    }
    
    return {
        speedRatio,
        initRatio,
        voltageError,
        voltageErrorPercent
    };
}

/**
 * 主測試函數
 */
async function runPerformanceTests() {
    console.log(`🔬 開始GPU vs CPU性能對比測試`);
    console.log(`測試電路數量: ${Object.keys(TEST_CIRCUITS).length}`);
    
    const allResults = {};
    
    for (const [circuitName, config] of Object.entries(TEST_CIRCUITS)) {
        console.log('\n' + '=' .repeat(60));
        console.log(`🧪 測試電路: ${config.name}`);
        
        // 測試CPU求解器
        const cpuResult = await testSolver('CPU', ExplicitStateSolver, config.components, config);
        
        // 測試GPU求解器  
        const gpuResult = await testSolver('GPU', GPUExplicitStateSolver, config.components, config);
        
        // 對比結果
        const comparison = compareResults(cpuResult, gpuResult);
        
        allResults[circuitName] = {
            config,
            cpuResult,
            gpuResult,
            comparison
        };
    }
    
    // 總結報告
    console.log('\n' + '=' .repeat(60));
    console.log('📋 總結報告');
    console.log('=' .repeat(60));
    
    for (const [circuitName, result] of Object.entries(allResults)) {
        console.log(`${result.config.name}:`);
        
        if (result.cpuResult.success && result.gpuResult.success) {
            const speedup = result.comparison.speedRatio;
            const accuracy = result.comparison.voltageErrorPercent;
            
            console.log(`  性能: GPU ${speedup > 1 ? '🚀' : speedup > 0.8 ? '⚖️' : '🐌'} ${speedup.toFixed(1)}x`);
            console.log(`  精度: ${accuracy < 1 ? '✅' : accuracy < 5 ? '⚠️' : '❌'} ${accuracy.toFixed(2)}%誤差`);
            console.log(`  CPU: ${Math.round(result.cpuResult.avgStepsPerSecond).toLocaleString()} 步/秒`);
            console.log(`  GPU: ${Math.round(result.gpuResult.avgStepsPerSecond).toLocaleString()} 步/秒`);
        } else {
            console.log(`  狀態: ${result.cpuResult.success ? '✅CPU' : '❌CPU'} | ${result.gpuResult.success ? '✅GPU' : '❌GPU'}`);
        }
        console.log('');
    }
    
    // 最終建議
    const successfulComparisons = Object.values(allResults).filter(r => 
        r.cpuResult.success && r.gpuResult.success && r.comparison
    );
    
    if (successfulComparisons.length > 0) {
        const avgSpeedup = successfulComparisons.reduce((sum, r) => sum + r.comparison.speedRatio, 0) / successfulComparisons.length;
        const avgAccuracy = successfulComparisons.reduce((sum, r) => sum + r.comparison.voltageErrorPercent, 0) / successfulComparisons.length;
        
        console.log(`🎯 總體評估:`);
        console.log(`   平均GPU加速比: ${avgSpeedup.toFixed(2)}x`);
        console.log(`   平均精度誤差: ${avgAccuracy.toFixed(2)}%`);
        
        if (avgSpeedup > 2 && avgAccuracy < 1) {
            console.log(`   💎 推薦使用GPU求解器 - 高性能且高精度`);
        } else if (avgSpeedup > 1.5) {
            console.log(`   🚀 建議使用GPU求解器 - 性能提升顯著`);
        } else if (avgSpeedup > 0.8) {
            console.log(`   ⚖️  CPU和GPU性能相近 - 可根據場景選擇`);
        } else {
            console.log(`   🔄 建議使用CPU求解器 - 更穩定可靠`);
        }
    }
}

// 執行測試
runPerformanceTests().catch(error => {
    console.error('❌ 測試過程中發生錯誤:', error.message);
    console.error(error.stack);
});