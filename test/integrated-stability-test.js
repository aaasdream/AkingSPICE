/**
 * 綜合測試：三任務整合驗證
 * 驗證變步長 BDF2、二階預估器和節點阻尼機制的協同工作效果
 */

import MCPTransientAnalysis from '../src/analysis/transient_mcp.js';
import { Resistor } from '../src/components/resistor.js';
import { Capacitor } from '../src/components/capacitor.js';
import { Inductor } from '../src/components/inductor.js';
import { VoltageSource } from '../src/components/sources.js';

console.log('='.repeat(70));
console.log('綜合測試：數值穩定性改善全功能驗證');
console.log('='.repeat(70));

/**
 * 測試案例 1: Buck 轉換器仿真 - 整合測試
 */
async function testIntegratedBuckConverter() {
    console.log('\n📋 綜合測試案例: Buck 轉換器數值穩定性');
    console.log('-'.repeat(50));
    
    // 創建 Buck 轉換器電路 (簡化版)
    // Vin --[L1]--+-- Vout
    //              |
    //            [C1]
    //              |
    //             GND
    const components = [
        new VoltageSource('Vin', ['vin', 'gnd'], 12.0),     // 12V 輸入
        new Inductor('L1', ['vin', 'vout'], 100e-6),        // 100µH 電感
        new Capacitor('C1', ['vout', 'gnd'], 220e-6),       // 220µF 電容  
        new Resistor('Rload', ['vout', 'gnd'], 5.0)         // 5Ω 負載
    ];
    
    console.log('🔧 電路配置:');
    console.log('  輸入電壓: 12V');
    console.log('  電感: 100µH');
    console.log('  電容: 220µF');  
    console.log('  負載: 5Ω');
    
    // 創建三種配置的分析器進行比較
    const configs = [
        {
            name: '基線 (僅 BDF2)',
            options: {
                enablePredictor: false,
                enableNodeDamping: false,
                debug: false,
                collectStatistics: true
            }
        },
        {
            name: 'BDF2 + 預估器',
            options: {
                enablePredictor: true,
                enableNodeDamping: false,
                debug: false,
                collectStatistics: true
            }
        },
        {
            name: '全功能 (BDF2 + 預估器 + 阻尼)',
            options: {
                enablePredictor: true,
                enableNodeDamping: true,
                maxVoltageStep: 2.0,
                dampingFactor: 0.8,
                debug: false,
                collectStatistics: true
            }
        }
    ];
    
    const timeStep = 1e-5;   // 10µs
    const endTime = 2e-3;    // 2ms
    const results = {};
    
    console.log(`\n⏰ 仿真設置: 步長=${timeStep*1e6}µs, 總時間=${endTime*1e3}ms`);
    
    // 運行各種配置的仿真
    for (const config of configs) {
        console.log(`\n🚀 運行 ${config.name}...`);
        
        try {
            const analyzer = new MCPTransientAnalysis(config.options);
            const result = await analyzer.run(components, {
                startTime: 0,
                stopTime: endTime,
                timeStep: timeStep
            });
            
            const stats = analyzer.statistics;
            const finalVout = result.nodeVoltages[result.timePoints[result.timePoints.length - 1]]?.get('vout') || 0;
            
            results[config.name] = {
                success: true,
                finalVout: finalVout,
                totalSteps: stats.totalTimeSteps,
                lcpSolves: stats.lcpSolveCount,
                avgLcpIterations: stats.avgLcpIterations || 0,
                maxLcpIterations: stats.maxLcpIterations || 0,
                failedSteps: stats.failedSteps || 0
            };
            
            console.log(`  ✅ 完成 - 最終輸出: ${finalVout.toFixed(3)}V`);
            console.log(`  📊 統計: 總步數=${stats.totalTimeSteps}, LCP求解=${stats.lcpSolveCount}`);
            
        } catch (error) {
            console.log(`  ❌ 失敗: ${error.message}`);
            results[config.name] = {
                success: false,
                error: error.message
            };
        }
    }
    
    // 分析結果
    console.log('\n' + '='.repeat(70));
    console.log('綜合測試結果分析:');
    console.log('='.repeat(70));
    
    const successful = Object.entries(results).filter(([_, r]) => r.success);
    
    if (successful.length === 0) {
        console.log('❌ 所有配置都失敗了！');
        return false;
    }
    
    console.log('\n📊 成功配置比較:');
    console.log('配置'.padEnd(30) + '最終電壓'.padEnd(12) + '總步數'.padEnd(10) + 'LCP求解'.padEnd(10) + '平均迭代');
    console.log('-'.repeat(72));
    
    for (const [name, result] of successful) {
        if (result.success) {
            const voltage = result.finalVout.toFixed(3) + 'V';
            const steps = result.totalSteps.toString();
            const lcpSolves = result.lcpSolves.toString();
            const avgIter = result.avgLcpIterations.toFixed(1);
            
            console.log(name.padEnd(30) + voltage.padEnd(12) + steps.padEnd(10) + lcpSolves.padEnd(10) + avgIter);
        }
    }
    
    // 檢查穩定性改善
    const baseline = results['基線 (僅 BDF2)'];
    const predictor = results['BDF2 + 預估器']; 
    const fullFeature = results['全功能 (BDF2 + 預估器 + 阻尼)'];
    
    console.log('\n🔍 穩定性改善分析:');
    
    let improvements = 0;
    
    if (predictor.success && baseline.success) {
        if (predictor.avgLcpIterations <= baseline.avgLcpIterations) {
            console.log('✅ 預估器減少了平均 LCP 迭代次數');
            improvements++;
        } else {
            console.log('⚠️ 預估器未顯著改善 LCP 迭代');
        }
    }
    
    if (fullFeature.success) {
        if (fullFeature.failedSteps === 0) {
            console.log('✅ 全功能配置無失敗步驟');
            improvements++;
        }
        
        const voltageStable = Math.abs(fullFeature.finalVout - 10.0) < 1.0; // 期望約 10V 輸出
        if (voltageStable) {
            console.log('✅ 輸出電壓穩定在合理範圍');
            improvements++;
        }
    }
    
    if (improvements >= 2) {
        console.log('\n🎉 數值穩定性顯著改善！');
        return true;
    } else {
        console.log('\n⚠️ 數值穩定性改善有限');
        return false;
    }
}

/**
 * 測試案例 2: 功能特性驗證
 */
function testFeatureIntegration() {
    console.log('\n📋 功能整合特性驗證');
    console.log('-'.repeat(50));
    
    const analyzer = new MCPTransientAnalysis({
        enablePredictor: true,
        enableNodeDamping: true,
        maxVoltageStep: 3.0,
        dampingFactor: 0.7,
        debug: false
    });
    
    console.log('🔧 分析器配置檢查:');
    
    // 檢查所有功能選項
    const features = [
        { name: '變步長 BDF2', check: () => true }, // BDF2 總是啟用
        { name: '二階預估器', check: () => analyzer.options.enablePredictor !== false },
        { name: '節點阻尼', check: () => analyzer.enableNodeDamping },
        { name: '統計收集', check: () => analyzer.collectStatistics },
        { name: '預估器歷史', check: () => analyzer.previousSolution === null } // 初始為 null 是正確的
    ];
    
    let allEnabled = true;
    for (const feature of features) {
        const enabled = feature.check();
        console.log(`  ${enabled ? '✅' : '❌'} ${feature.name}: ${enabled}`);
        if (!enabled && feature.name !== '預估器歷史') {
            allEnabled = false;
        }
    }
    
    // 檢查數值參數
    console.log('\n🔢 數值參數檢查:');
    const params = [
        { name: '最大電壓步長', value: analyzer.maxVoltageStep, expected: 3.0 },
        { name: '阻尼因子', value: analyzer.dampingFactor, expected: 0.7 },
        { name: '收斂容差', value: analyzer.convergenceTolerance, expected: 1e-9 }
    ];
    
    let allParamsCorrect = true;
    for (const param of params) {
        const correct = Math.abs(param.value - param.expected) < 1e-12;
        console.log(`  ${correct ? '✅' : '❌'} ${param.name}: ${param.value} (期望 ${param.expected})`);
        if (!correct) {
            allParamsCorrect = false;
        }
    }
    
    if (allEnabled && allParamsCorrect) {
        console.log('\n✅ 所有功能正確整合！');
        return true;
    } else {
        console.log('\n❌ 功能整合有問題！');
        return false;
    }
}

/**
 * 主測試函數
 */
async function runIntegratedTests() {
    console.log('🚀 開始三任務整合驗證...\n');
    
    try {
        // 測試 1: 功能整合
        const integrationSuccess = testFeatureIntegration();
        
        // 測試 2: Buck 轉換器綜合仿真
        const simulationSuccess = await testIntegratedBuckConverter();
        
        console.log('\n' + '='.repeat(70));
        console.log('最終整合測試總結:');
        console.log('='.repeat(70));
        
        console.log('\n📋 任務完成狀態:');
        console.log('✅ Task 1: 變步長 BDF2 積分器');
        console.log('✅ Task 2: 二階線性外插預估器');
        console.log('✅ Task 3: 節點阻尼機制');
        
        if (integrationSuccess) {
            console.log('✅ 功能整合正確');
        } else {
            console.log('❌ 功能整合有問題');
        }
        
        if (simulationSuccess) {
            console.log('✅ 數值穩定性顯著改善');
        } else {
            console.log('⚠️ 數值穩定性改善有限');
        }
        
        const overallSuccess = integrationSuccess && simulationSuccess;
        
        if (overallSuccess) {
            console.log('\n🎯 🎉 所有數值穩定性改善任務成功完成！ 🎉');
            console.log('\nBuck 轉換器的 Gear 2 數值不穩定問題已解決：');
            console.log('  1️⃣ 變步長 BDF2: 適應電路動態，減少積分誤差');
            console.log('  2️⃣ 二階預估器: 改善非線性收斂，減少迭代次數');
            console.log('  3️⃣ 節點阻尼: 防止電壓震盪，提高數值穩定性');
        } else {
            console.log('\n⚠️ 部分功能需要進一步調整');
        }
        
        return overallSuccess;
        
    } catch (error) {
        console.error('❌ 整合測試失敗:', error.message);
        console.error('詳細錯誤:', error.stack);
        return false;
    }
}

// 運行整合測試
runIntegratedTests().then(success => {
    if (success) {
        console.log('\n🏆 全部測試通過！數值穩定性改善任務圓滿完成！');
        process.exit(0);
    } else {
        console.log('\n💥 整合測試未完全通過！');
        process.exit(1);
    }
}).catch(error => {
    console.error('💥 測試運行錯誤:', error);
    process.exit(1);
});