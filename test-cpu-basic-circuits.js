/**
 * Node.js CPU 求解器基礎電路測試
 * 測試 RC、RL、RLC 電路的求解準確性和性能
 */

import { 
    ExplicitStateSolver, 
    VoltageSource, 
    Resistor, 
    Capacitor, 
    Inductor 
} from './lib-dist/AkingSPICE.es.js';

console.log('🔬 AkingSPICE CPU 求解器基礎電路測試');
console.log('=' .repeat(60));

// 測試配置
const TEST_CONFIGS = {
    rc: {
        name: 'RC充電電路',
        description: '5V → 1kΩ → 1μF',
        components: () => [
            new VoltageSource('V1', ['vin', 'gnd'], 5.0),
            new Resistor('R1', ['vin', 'vout'], 1000),
            new Capacitor('C1', ['vout', 'gnd'], 1e-6, { ic: 0 })
        ],
        expectedFinal: 5.0,
        outputNode: 'vout',
        timeConstant: 1e-3, // τ = RC = 1000 * 1e-6 = 1ms
        testTime: 5e-3,     // 5ms = 5τ
        timeStep: 10e-6     // 10μs
    },
    
    rl: {
        name: 'RL充電電路',
        description: '10V → 100Ω → 1mH',
        components: () => [
            new VoltageSource('V1', ['vin', 'gnd'], 10.0),
            new Resistor('R1', ['vin', 'vout'], 100),
            new Inductor('L1', ['vout', 'gnd'], 1e-3, { ic: 0 })
        ],
        expectedFinal: 0.0,  // RL電路穩態時電感電壓為0V（短路）
        outputNode: 'vout', 
        timeConstant: 1e-5, // τ = L/R = 1e-3/100 = 10μs
        testTime: 50e-6,    // 50μs = 5τ
        timeStep: 100e-9    // 100ns
    },
    
    rlc: {
        name: 'RLC電路',
        description: '12V → 50Ω → 100μH → 1μF',
        components: () => [
            new VoltageSource('V1', ['vin', 'gnd'], 12.0),
            new Resistor('R1', ['vin', 'n1'], 50),
            new Inductor('L1', ['n1', 'vout'], 100e-6),
            new Capacitor('C1', ['vout', 'gnd'], 1e-6, { ic: 0 })
        ],
        expectedFinal: 12.0,
        outputNode: 'vout',
        testTime: 1e-3,     // 1ms
        timeStep: 1e-6      // 1μs
    }
};

// 執行單個電路測試
async function testCircuit(configName, config) {
    console.log(`\n🧪 測試 ${config.name}`);
    console.log(`📋 電路: ${config.description}`);
    console.log(`⏱️  測試時間: ${config.testTime*1000}ms, 步長: ${config.timeStep*1e6}μs`);
    
    try {
        // 創建求解器
        const solver = new ExplicitStateSolver({
            debug: false,
            integrationMethod: 'forward_euler',
            solverMaxIterations: 2000,
            solverTolerance: 1e-6
        });
        
        // 創建電路組件
        const components = config.components();
        console.log(`🔧 創建了 ${components.length} 個組件`);
        
        // 初始化求解器
        console.log('🔄 初始化求解器...');
        const initStart = performance.now();
        await solver.initialize(components, config.timeStep);
        const initTime = performance.now() - initStart;
        console.log(`✅ 初始化完成，耗時: ${initTime.toFixed(1)}ms`);
        
        // 執行模擬
        const totalSteps = Math.floor(config.testTime / config.timeStep);
        console.log(`⚡ 開始模擬 ${totalSteps} 步...`);
        
        const results = [];
        const startTime = performance.now();
        let errorCount = 0;
        
        for (let i = 0; i < totalSteps; i++) {
            try {
                const stepResult = await solver.step();
                const time = i * config.timeStep;
                
                if (stepResult && stepResult.nodeVoltages) {
                    const voltage = stepResult.nodeVoltages[config.outputNode] || 0;
                    results.push({ time, voltage });
                    
                    // 記錄關鍵時間點
                    if (i % Math.floor(totalSteps / 10) === 0) {
                        console.log(`  步驟 ${i}/${totalSteps}: t=${(time*1000).toFixed(2)}ms, V=${voltage.toFixed(4)}V`);
                    }
                } else {
                    errorCount++;
                    if (errorCount < 5) {
                        console.log(`⚠️  步驟 ${i}: 無效結果`);
                    }
                }
            } catch (stepError) {
                errorCount++;
                if (errorCount < 5) {
                    console.log(`❌ 步驟 ${i}: ${stepError.message}`);
                }
            }
        }
        
        const simTime = performance.now() - startTime;
        const performance_rate = totalSteps / simTime * 1000;
        
        // 分析結果
        console.log(`\n📊 模擬結果分析:`);
        console.log(`   ⏱️  模擬時間: ${simTime.toFixed(1)}ms`);
        console.log(`   ⚡ 性能: ${performance_rate.toFixed(0)} 步/秒`);
        console.log(`   📈 有效數據點: ${results.length}/${totalSteps}`);
        console.log(`   ❌ 錯誤次數: ${errorCount}`);
        
        if (results.length > 0) {
            const finalVoltage = results[results.length - 1].voltage;
            const initialVoltage = results[0].voltage;
            const maxVoltage = Math.max(...results.map(r => r.voltage));
            const minVoltage = Math.min(...results.map(r => r.voltage));
            
            console.log(`   📈 電壓範圍: ${minVoltage.toFixed(4)}V → ${maxVoltage.toFixed(4)}V`);
            console.log(`   🎯 初始電壓: ${initialVoltage.toFixed(4)}V`);
            console.log(`   🏁 最終電壓: ${finalVoltage.toFixed(4)}V`);
            console.log(`   🎯 預期電壓: ${config.expectedFinal.toFixed(4)}V`);
            
            const error = Math.abs(finalVoltage - config.expectedFinal);
            
            // 處理除零情況：當預期值為0時，使用絕對誤差判斷
            let errorPercent;
            let errorThreshold;
            
            if (Math.abs(config.expectedFinal) < 1e-10) {
                // 預期值接近0，使用絕對誤差（單位：V）
                errorPercent = error; 
                errorThreshold = 0.1;  // 0.1V 絕對誤差閾值
                console.log(`   📊 絕對誤差: ${error.toFixed(4)}V`);
                console.log(`   📊 誤差評估: ${error.toFixed(4)}V (絕對誤差模式)`);
            } else {
                // 正常情況，使用相對誤差（百分比）
                errorPercent = (error / Math.abs(config.expectedFinal) * 100);
                errorThreshold = 5;    // 5% 相對誤差閾值
                console.log(`   📊 絕對誤差: ${error.toFixed(4)}V`);
                console.log(`   📊 相對誤差: ${errorPercent.toFixed(2)}%`);
            }
            
            // 判斷測試結果
            if (errorPercent < errorThreshold) {
                console.log(`   ✅ 測試通過 (誤差 < ${errorThreshold}${Math.abs(config.expectedFinal) < 1e-10 ? 'V' : '%'})`);
            } else if (errorPercent < errorThreshold * 4) {
                console.log(`   ⚠️  測試警告 (誤差 ${errorThreshold}-${errorThreshold*4}${Math.abs(config.expectedFinal) < 1e-10 ? 'V' : '%'})`);
            } else {
                console.log(`   ❌ 測試失敗 (誤差 > ${errorThreshold*4}${Math.abs(config.expectedFinal) < 1e-10 ? 'V' : '%'})`);
            }
            
            // RC 電路特殊檢查
            if (configName === 'rc' && config.timeConstant) {
                const tau = config.timeConstant;
                const time_1tau = Math.floor(tau / config.timeStep);
                const time_3tau = Math.floor(3 * tau / config.timeStep);
                
                if (time_1tau < results.length) {
                    const v_1tau = results[time_1tau].voltage;
                    const expected_1tau = config.expectedFinal * (1 - Math.exp(-1)); // ≈ 63.2%
                    console.log(`   📐 1τ時電壓: ${v_1tau.toFixed(4)}V (預期: ${expected_1tau.toFixed(4)}V)`);
                }
                
                if (time_3tau < results.length) {
                    const v_3tau = results[time_3tau].voltage;
                    const expected_3tau = config.expectedFinal * (1 - Math.exp(-3)); // ≈ 95%
                    console.log(`   📐 3τ時電壓: ${v_3tau.toFixed(4)}V (預期: ${expected_3tau.toFixed(4)}V)`);
                }
            }
            
            return {
                success: errorPercent < (Math.abs(config.expectedFinal) < 1e-10 ? 0.4 : 20), // 動態閾值
                errorPercent,
                performance: performance_rate,
                dataPoints: results.length,
                errorCount,
                results: results.slice(0, 10) // 只保留前10個點以節省內存
            };
        } else {
            console.log(`   ❌ 沒有有效的模擬數據`);
            return { success: false, errorPercent: 100 };
        }
        
    } catch (error) {
        console.log(`❌ 測試失敗: ${error.message}`);
        console.log(`   錯誤堆疊: ${error.stack}`);
        return { success: false, error: error.message };
    }
}

// 主測試函數
async function runAllTests() {
    console.log('🚀 開始 CPU 求解器基礎電路測試\n');
    
    const testResults = {};
    
    // 依序測試每個電路
    for (const [configName, config] of Object.entries(TEST_CONFIGS)) {
        try {
            testResults[configName] = await testCircuit(configName, config);
        } catch (error) {
            console.log(`❌ 測試 ${configName} 時發生嚴重錯誤: ${error.message}`);
            testResults[configName] = { success: false, error: error.message };
        }
    }
    
    // 總結報告
    console.log('\n' + '='.repeat(60));
    console.log('📋 測試總結報告');
    console.log('='.repeat(60));
    
    let totalTests = 0;
    let passedTests = 0;
    let totalPerformance = 0;
    
    for (const [name, result] of Object.entries(testResults)) {
        totalTests++;
        const status = result.success ? '✅ 通過' : '❌ 失敗';
        const perf = result.performance ? `${result.performance.toFixed(0)} 步/秒` : 'N/A';
        const error = result.errorPercent ? `${result.errorPercent.toFixed(2)}%` : 'N/A';
        
        console.log(`${name.toUpperCase().padEnd(4)} | ${status} | 誤差: ${error.padEnd(8)} | 性能: ${perf}`);
        
        if (result.success) {
            passedTests++;
            if (result.performance) {
                totalPerformance += result.performance;
            }
        }
    }
    
    console.log('-'.repeat(60));
    console.log(`總計: ${passedTests}/${totalTests} 通過`);
    if (passedTests > 0) {
        console.log(`平均性能: ${(totalPerformance / passedTests).toFixed(0)} 步/秒`);
    }
    
    if (passedTests === totalTests) {
        console.log('🎉 所有測試通過！CPU 求解器工作正常');
    } else {
        console.log('⚠️  部分測試失敗，需要進一步調查');
    }
    
    return testResults;
}

// 執行測試
runAllTests().catch(error => {
    console.error('💥 測試過程中發生致命錯誤:', error);
    process.exit(1);
});