/**
 * =================================================================
 *         梯形積分法 vs 後向歐拉法 - 精度對比測試
 * =================================================================
 * 
 * 目標: 對比兩種積分方法在LLC諧振電路中的精度差異
 */

import {
    AkingSPICE,
    VoltageSource,
    Resistor,
    Inductor,
    Capacitor
} from './src/index.js';

// 測試參數
const TEST_PARAMS = {
    L: 25e-6,       // 25μH 電感
    C: 207e-9,      // 207nF 電容  
    R: 11.0,        // 11Ω 電阻
    Vin: 100,       // 100V 輸入振幅
};

// 理論計算
const fr = 1 / (2 * Math.PI * Math.sqrt(TEST_PARAMS.L * TEST_PARAMS.C));
const Z0 = Math.sqrt(TEST_PARAMS.L / TEST_PARAMS.C);
const Q = Z0 / TEST_PARAMS.R;

console.log("=== 積分方法對比測試 ===");
console.log(`諧振頻率: ${(fr/1000).toFixed(1)}kHz`);
console.log(`特性阻抗: ${Z0.toFixed(1)}Ω`);
console.log(`品質因子: ${Q.toFixed(2)}`);

/**
 * 使用指定積分方法運行模擬
 */
async function runSimulationWithMethod(method, timeStep) {
    // 修改AkingSPICE的步進模擬以支持積分方法選項
    const solver = new AkingSPICE();
    
    // 手動設置組件並指定積分方法
    const components = [
        new VoltageSource('Vin', ['in', '0'], `SINE(0 ${TEST_PARAMS.Vin} ${fr})`),
        new Inductor('L1', ['in', 'lc_node'], TEST_PARAMS.L),
        new Capacitor('C1', ['lc_node', 'load_node'], TEST_PARAMS.C),
        new Resistor('R1', ['load_node', '0'], TEST_PARAMS.R)
    ];
    
    // 手動初始化暫態分析
    solver.transientAnalysis.components = components;
    solver.transientAnalysis.debug = false;
    
    const period = 1 / fr;
    const simTime = period * 10;
    
    try {
        // 使用新的初始化方法
        await solver.transientAnalysis.initialize(components, timeStep, method);
        
        // 運行時域循環
        solver.transientAnalysis.startTime = 0;
        solver.transientAnalysis.stopTime = simTime;
        solver.transientAnalysis.timeStep = timeStep;
        
        await solver.transientAnalysis.timeLoop();
        solver.transientAnalysis.finalize();
        
        const result = solver.transientAnalysis.result;
        
        // 分析穩態結果
        const totalSteps = result.timeVector.length;
        const steadyStart = Math.floor(totalSteps * 0.5);
        const steadyTimes = result.timeVector.slice(steadyStart);
        const steadyVoltages = result.nodeVoltages.get('load_node').slice(steadyStart);
        
        // 計算振幅
        const vMax = Math.max(...steadyVoltages);
        const vMin = Math.min(...steadyVoltages);
        const amplitude = (vMax - vMin) / 2;
        const gain = amplitude / TEST_PARAMS.Vin;
        
        return {
            method: method,
            amplitude: amplitude,
            gain: gain,
            timePoints: totalSteps,
            success: true
        };
        
    } catch (error) {
        console.error(`${method}方法模擬失敗:`, error.message);
        return {
            method: method,
            amplitude: 0,
            gain: 0,
            timePoints: 0,
            success: false,
            error: error.message
        };
    }
}

/**
 * 解析解計算
 */
function getAnalyticalSolution(frequency) {
    const omega = 2 * Math.PI * frequency;
    const XL = omega * TEST_PARAMS.L;
    const XC = 1 / (omega * TEST_PARAMS.C);
    const Z_magnitude = Math.sqrt(TEST_PARAMS.R**2 + (XL - XC)**2);
    const gain = TEST_PARAMS.R / Z_magnitude;
    const amplitude = TEST_PARAMS.Vin * gain;
    
    return { amplitude, gain, impedance: Z_magnitude };
}

/**
 * 主要對比測試
 */
async function compareIntegrationMethods() {
    console.log("\n=== 積分方法精度對比 ===");
    
    // 測試不同時間步長
    const period = 1 / fr;
    const timeSteps = [
        { label: "50點/週期", value: period / 50 },
        { label: "100點/週期", value: period / 100 },
        { label: "200點/週期", value: period / 200 }
    ];
    
    // 解析解
    const analytical = getAnalyticalSolution(fr);
    console.log(`\n解析解 - 增益: ${analytical.gain.toFixed(4)}, 振幅: ${analytical.amplitude.toFixed(3)}V`);
    
    console.log("\n時間步長配置 | 後向歐拉法 | 梯形法 | 改進量");
    console.log("------------|------------|--------|--------");
    
    const results = [];
    
    for (const ts of timeSteps) {
        console.log(`\n測試: ${ts.label} (${(ts.value*1e6).toFixed(3)}μs)`);
        
        // 後向歐拉法
        const eulerResult = await runSimulationWithMethod('backward_euler', ts.value);
        await new Promise(resolve => setTimeout(resolve, 100)); // 小延遲避免衝突
        
        // 梯形法
        const trapResult = await runSimulationWithMethod('trapezoidal', ts.value);
        await new Promise(resolve => setTimeout(resolve, 100)); // 小延遲避免衝突
        
        if (eulerResult.success && trapResult.success) {
            const eulerError = Math.abs(eulerResult.gain - analytical.gain) / analytical.gain * 100;
            const trapError = Math.abs(trapResult.gain - analytical.gain) / analytical.gain * 100;
            const improvement = ((eulerError - trapError) / eulerError * 100);
            
            console.log(`${ts.label.padEnd(12)} | ${eulerError.toFixed(2)}%`.padEnd(11) + 
                       ` | ${trapError.toFixed(2)}%`.padEnd(7) + 
                       ` | ${improvement > 0 ? '+' : ''}${improvement.toFixed(1)}%`);
            
            results.push({
                timeStep: ts,
                euler: eulerResult,
                trapezoidal: trapResult,
                eulerError: eulerError,
                trapError: trapError,
                improvement: improvement
            });
        } else {
            console.log(`${ts.label}: 模擬失敗`);
            if (!eulerResult.success) console.log(`  - 後向歐拉法: ${eulerResult.error}`);
            if (!trapResult.success) console.log(`  - 梯形法: ${trapResult.error}`);
        }
    }
    
    return results;
}

/**
 * 頻率響應對比
 */
async function compareFrequencyResponse() {
    console.log("\n=== 頻率響應精度對比 ===");
    
    const testFreqs = [fr * 0.5, fr * 0.8, fr, fr * 1.2, fr * 1.5];
    const fixedTimeStep = 1 / (fr * 100); // 固定100點/諧振週期
    
    console.log("頻率比 | 解析增益 | 後向歐拉 | 梯形法 | 改進");
    console.log("-------|----------|----------|--------|------");
    
    for (const testFreq of testFreqs) {
        const freqRatio = testFreq / fr;
        const analytical = getAnalyticalSolution(testFreq);
        
        // 為每個頻率創建新的電路
        const period = 1 / testFreq;
        const simTime = period * 8;
        
        // 後向歐拉法測試
        const solver1 = new AkingSPICE();
        const components1 = [
            new VoltageSource('Vin', ['in', '0'], `SINE(0 ${TEST_PARAMS.Vin} ${testFreq})`),
            new Inductor('L1', ['in', 'lc_node'], TEST_PARAMS.L),
            new Capacitor('C1', ['lc_node', 'load_node'], TEST_PARAMS.C),
            new Resistor('R1', ['load_node', '0'], TEST_PARAMS.R)
        ];
        
        const eulerResult = await runSimulationWithMethod('backward_euler', fixedTimeStep);
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const trapResult = await runSimulationWithMethod('trapezoidal', fixedTimeStep);
        await new Promise(resolve => setTimeout(resolve, 100));
        
        if (eulerResult.success && trapResult.success) {
            const eulerError = Math.abs(eulerResult.gain - analytical.gain) / analytical.gain * 100;
            const trapError = Math.abs(trapResult.gain - analytical.gain) / analytical.gain * 100;
            const improvement = eulerError - trapError;
            
            console.log(`${freqRatio.toFixed(2).padStart(5)} | ${analytical.gain.toFixed(4).padStart(8)} | ${eulerError.toFixed(2)}%`.padStart(8) + 
                       ` | ${trapError.toFixed(2)}%`.padStart(6) + ` | ${improvement > 0 ? '+' : ''}${improvement.toFixed(1)}%`);
        }
    }
}

/**
 * 主函數
 */
async function main() {
    console.log("=================================================================");
    console.log("           梯形積分法 vs 後向歐拉法 - 精度對比測試");
    console.log("=================================================================");
    
    try {
        const timeStepResults = await compareIntegrationMethods();
        await compareFrequencyResponse();
        
        // 總結
        console.log("\n=== 測試總結 ===");
        
        if (timeStepResults.length > 0) {
            const avgImprovement = timeStepResults.reduce((sum, r) => sum + r.improvement, 0) / timeStepResults.length;
            
            if (avgImprovement > 10) {
                console.log("✅ 梯形積分法顯著改善了精度!");
                console.log(`平均精度提升: ${avgImprovement.toFixed(1)}%`);
                console.log("建議：將梯形法設為LLC模擬的默認積分方法");
            } else if (avgImprovement > 0) {
                console.log("🟡 梯形積分法有適度改善");
                console.log(`平均精度提升: ${avgImprovement.toFixed(1)}%`);
            } else {
                console.log("❌ 梯形積分法未帶來預期改善");
                console.log("可能需要檢查實現或嘗試其他數值方法");
            }
        }
        
    } catch (error) {
        console.error("測試過程中發生錯誤:", error.message);
    }
}

// 運行測試
main();