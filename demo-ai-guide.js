/**
 * JSSolver-PE 演示範例
 * 展示如何使用 AI 使用指南建立電路
 */

import { JSSolverPE, Resistor, Capacitor, Inductor, VoltageSource, MOSFET } from './src/index.js';

// 演示 1: 簡單 RC 電路（驗證基本功能）
async function demo1_RC_Circuit() {
    console.log('\n=== 演示 1: RC 電路 ===');
    
    const solver = new JSSolverPE();
    solver.setDebug(true);
    
    // 重置解算器
    solver.reset();
    
    // 建立 RC 電路
    solver.components = [
        new VoltageSource('VIN', ['input', '0'], 5.0),      // 5V 電源
        new Resistor('R1', ['input', 'output'], 1000),      // 1kΩ 電阻
        new Capacitor('C1', ['output', '0'], 1e-6)          // 1μF 電容
    ];
    solver.isInitialized = true;
    
    // 驗證電路
    const validation = solver.validateCircuit();
    console.log('電路驗證:', validation.valid ? '通過' : '失敗');
    if (!validation.valid) {
        console.error('問題:', validation.issues);
        return;
    }
    
    try {
        // DC 分析
        const dcResult = await solver.runDCAnalysis();
        console.log('DC 分析結果:');
        console.log(`  輸入電壓: ${dcResult.nodeVoltages.get('input')?.toFixed(3)} V`);
        console.log(`  輸出電壓: ${dcResult.nodeVoltages.get('output')?.toFixed(3)} V`);
        console.log(`  收斂狀態: ${dcResult.converged ? '成功' : '失敗'}`);
        
        // 暫態分析
        const tranResult = await solver.runTransientAnalysis('.tran 1us 1ms');
        console.log(`暫態分析: ${tranResult.timeVector?.length || 0} 個時間點`);
        
    } catch (error) {
        console.error('分析失敗:', error.message);
    }
}

// 演示 2: Buck 轉換器（遵循 AI 指南）
async function demo2_BuckConverter() {
    console.log('\n=== 演示 2: Buck 轉換器 ===');
    
    const solver = new JSSolverPE();
    solver.setDebug(false);  // 減少輸出
    
    // 重置解算器
    solver.reset();
    
    // 遵循 AI 指南建立 Buck 電路
    const components = [
        new VoltageSource('VIN', ['vin', '0'], 12.0),           // 12V 輸入
        new MOSFET('MSW', ['vin', 'sw'], {                      // 主開關
            Ron: 0.01,      // 10mΩ 導通電阻
            Roff: 1e6       // 1MΩ 關閉電阻
        }),
        new Inductor('L1', ['sw', 'out'], 100e-6),              // 100μH 電感
        new Capacitor('C1', ['out', '0'], 220e-6),              // 220μF 電容
        new Resistor('RLOAD', ['out', '0'], 5.0)                // 5Ω 負載
    ];
    
    solver.components = components;
    solver.isInitialized = true;
    
    // 驗證電路
    const validation = solver.validateCircuit();
    console.log('Buck 電路驗證:', validation.valid ? '通過' : '失敗');
    
    if (validation.warnings.length > 0) {
        console.log('警告:', validation.warnings);
    }
    
    if (!validation.valid) {
        console.error('問題:', validation.issues);
        return;
    }
    
    try {
        console.log('開始步進式 PWM 控制模擬...');
        
        // 初始化步進式暫態分析
        await solver.initSteppedTransient({
            startTime: 0,
            stopTime: 1e-3,     // 1ms
            timeStep: 1e-6,     // 1μs
            maxIterations: 10
        });
        
        // PWM 控制邏輯 (100kHz, 50% 占空比)
        const frequency = 100e3;    // 100kHz
        const dutyCycle = 0.5;      // 50%
        const period = 1 / frequency;
        
        const results = [];
        let stepCount = 0;
        
        while (!solver.isFinished() && stepCount < 100) { // 限制步數防止無限迴圈
            const time = solver.getCurrentTime();
            const pwmState = (time % period) < (period * dutyCycle);
            
            // 執行一步
            const stepResult = solver.step({'MSW': pwmState});
            
            if (stepResult) {
                results.push({
                    time: time * 1000,  // 轉為 ms
                    outputVoltage: stepResult.nodeVoltages['out'] || 0,
                    pwmState: pwmState ? 1 : 0
                });
            }
            
            stepCount++;
        }
        
        console.log(`完成 ${stepCount} 個模擬步驟`);
        
        // 計算平均輸出電壓
        const avgOutput = results.reduce((sum, r) => sum + r.outputVoltage, 0) / results.length;
        const theoretical = 12.0 * dutyCycle; // 理論值
        const error = Math.abs(avgOutput - theoretical) / theoretical * 100;
        
        console.log('=== 結果分析 ===');
        console.log(`平均輸出電壓: ${avgOutput.toFixed(3)} V`);
        console.log(`理論輸出電壓: ${theoretical.toFixed(3)} V`);
        console.log(`誤差: ${error.toFixed(2)}%`);
        console.log(`解算器準確性: ${error < 5 ? '✅ 優秀' : error < 15 ? '⚠️ 可接受' : '❌ 需調整'}`);
        
        return { avgOutput, theoretical, error, stepCount };
        
    } catch (error) {
        console.error('Buck 轉換器模擬失敗:', error.message);
        console.error('錯誤詳情:', error);
    }
}

// 演示 3: 解算器能力測試
async function demo3_SolverCapabilityTest() {
    console.log('\n=== 演示 3: 解算器能力測試 ===');
    
    // 顯示版本信息
    console.log('JSSolver-PE 版本信息:');
    const versionInfo = JSSolverPE.getVersionInfo();
    console.log(`  名稱: ${versionInfo.name} v${versionInfo.version}`);
    console.log(`  功能: ${versionInfo.features.length} 項功能`);
    
    // 測試不同電路複雜度
    const testCases = [
        { name: 'RC', components: 3, expected: 'fast' },
        { name: 'RLC', components: 4, expected: 'fast' },
        { name: 'Buck', components: 5, expected: 'medium' }
    ];
    
    for (const testCase of testCases) {
        console.log(`\n測試 ${testCase.name} 電路...`);
        
        if (testCase.name === 'Buck') {
            const result = await demo2_BuckConverter();
            if (result) {
                console.log(`  性能: ${result.stepCount} 步驟完成`);
                console.log(`  準確性: ${result.error.toFixed(2)}% 誤差`);
            }
        }
        // 可以添加其他測試用例...
    }
}

// 主執行函數
async function runAllDemos() {
    console.log('JSSolver-PE AI 指南演示');
    console.log('========================');
    
    try {
        await demo1_RC_Circuit();
        await demo2_BuckConverter();
        await demo3_SolverCapabilityTest();
        
        console.log('\n✅ 所有演示完成');
        
    } catch (error) {
        console.error('演示執行失敗:', error);
    }
}

// 如果直接執行此文件
if (typeof window === 'undefined') {
    // Node.js 環境
    runAllDemos();
} else {
    // 瀏覽器環境 - 將函數暴露到全局
    window.JSSpiceDemo = {
        demo1_RC_Circuit,
        demo2_BuckConverter,
        demo3_SolverCapabilityTest,
        runAllDemos
    };
    console.log('演示函數已準備好。請在控制台執行: JSSpiceDemo.runAllDemos()');
}