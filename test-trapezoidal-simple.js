/**
 * =================================================================
 *         簡化版積分方法對比測試 - 直接修改AkingSPICE
 * =================================================================
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

const fr = 1 / (2 * Math.PI * Math.sqrt(TEST_PARAMS.L * TEST_PARAMS.C));

/**
 * 解析解計算
 */
function getAnalyticalSolution() {
    const omega = 2 * Math.PI * fr;
    const XL = omega * TEST_PARAMS.L;
    const XC = 1 / (omega * TEST_PARAMS.C);
    const Z_magnitude = Math.sqrt(TEST_PARAMS.R**2 + (XL - XC)**2);
    const gain = TEST_PARAMS.R / Z_magnitude;
    const amplitude = TEST_PARAMS.Vin * gain;
    
    return { amplitude, gain, impedance: Z_magnitude };
}

/**
 * 測試梯形法的基本實現 - 直接修改組件
 */
async function testTrapezoidalBasic() {
    console.log("=== 梯形積分法基本測試 ===");
    
    const analytical = getAnalyticalSolution();
    console.log(`解析解 - 增益: ${analytical.gain.toFixed(4)}, 振幅: ${analytical.amplitude.toFixed(3)}V`);
    
    // 測試後向歐拉法 (現有實現)
    console.log("\n--- 後向歐拉法 ---");
    const solver1 = new AkingSPICE();
    solver1.components = [
        new VoltageSource('Vin', ['in', '0'], `SINE(0 ${TEST_PARAMS.Vin} ${fr})`),
        new Inductor('L1', ['in', 'lc_node'], TEST_PARAMS.L),
        new Capacitor('C1', ['lc_node', 'load_node'], TEST_PARAMS.C),
        new Resistor('R1', ['load_node', '0'], TEST_PARAMS.R)
    ];
    solver1.isInitialized = true;
    
    const period = 1 / fr;
    const timeStep = period / 100;
    const simTime = period * 10;
    
    const result1 = await solver1.runSteppedSimulation(() => ({}), {
        stopTime: simTime,
        timeStep: timeStep
    });
    
    if (result1 && result1.steps.length > 0) {
        const steadyStart = Math.floor(result1.steps.length * 0.5);
        const steadySteps = result1.steps.slice(steadyStart);
        const v_load = steadySteps.map(s => s.nodeVoltages['load_node']);
        const amplitude1 = (Math.max(...v_load) - Math.min(...v_load)) / 2;
        const gain1 = amplitude1 / TEST_PARAMS.Vin;
        const error1 = Math.abs(gain1 - analytical.gain) / analytical.gain * 100;
        
        console.log(`模擬增益: ${gain1.toFixed(4)}`);
        console.log(`誤差: ${error1.toFixed(2)}%`);
    }
    
    // 手動創建梯形法組件進行測試
    console.log("\n--- 梯形法測試 (手動實現) ---");
    
    // 創建修改後的組件
    const solver2 = new AkingSPICE();
    
    // 創建組件並手動設置梯形法
    const inductor = new Inductor('L1', ['in', 'lc_node'], TEST_PARAMS.L);
    const capacitor = new Capacitor('C1', ['lc_node', 'load_node'], TEST_PARAMS.C);
    const resistor = new Resistor('R1', ['load_node', '0'], TEST_PARAMS.R);
    const voltage = new VoltageSource('Vin', ['in', '0'], `SINE(0 ${TEST_PARAMS.Vin} ${fr})`);
    
    // 手動初始化梯形法
    inductor.initTransient(timeStep, 'trapezoidal');
    capacitor.initTransient(timeStep, 'trapezoidal');
    resistor.initTransient(timeStep, 'trapezoidal');
    voltage.initTransient(timeStep, 'trapezoidal');
    
    solver2.components = [voltage, inductor, capacitor, resistor];
    solver2.isInitialized = true;
    
    try {
        const result2 = await solver2.runSteppedSimulation(() => ({}), {
            stopTime: simTime,
            timeStep: timeStep
        });
        
        if (result2 && result2.steps.length > 0) {
            const steadyStart = Math.floor(result2.steps.length * 0.5);
            const steadySteps = result2.steps.slice(steadyStart);
            const v_load = steadySteps.map(s => s.nodeVoltages['load_node']);
            const amplitude2 = (Math.max(...v_load) - Math.min(...v_load)) / 2;
            const gain2 = amplitude2 / TEST_PARAMS.Vin;
            const error2 = Math.abs(gain2 - analytical.gain) / analytical.gain * 100;
            
            console.log(`模擬增益: ${gain2.toFixed(4)}`);
            console.log(`誤差: ${error2.toFixed(2)}%`);
            
            // 計算改進
            const prevError = 34.45; // 從之前測試得知的後向歐拉誤差
            const improvement = prevError - error2;
            console.log(`相對改進: ${improvement > 0 ? '+' : ''}${improvement.toFixed(1)}%`);
            
            return { success: true, error: error2 };
        } else {
            console.log("❌ 梯形法模擬失敗 - 無結果");
            return { success: false };
        }
    } catch (error) {
        console.log(`❌ 梯形法模擬失敗: ${error.message}`);
        return { success: false, error: error.message };
    }
}

/**
 * 驗證伴隨模型參數計算
 */
function verifyCompanionModels() {
    console.log("\n=== 驗證伴隨模型參數 ===");
    
    const timeStep = 1e-6; // 1μs
    const L = TEST_PARAMS.L;
    const C = TEST_PARAMS.C;
    
    console.log("後向歐拉法參數:");
    console.log(`  電感等效電阻: R_eq = L/h = ${(L/timeStep).toFixed(1)}Ω`);
    console.log(`  電容等效電導: G_eq = C/h = ${(C/timeStep*1e6).toFixed(3)}mS`);
    
    console.log("\n梯形法參數:");
    console.log(`  電感等效電阻: R_eq = 2L/h = ${(2*L/timeStep).toFixed(1)}Ω`);
    console.log(`  電容等效電導: G_eq = 2C/h = ${(2*C/timeStep*1e6).toFixed(3)}mS`);
    
    console.log("\n理論對比:");
    console.log(`  特性阻抗 Z0 = ${Math.sqrt(L/C).toFixed(1)}Ω`);
    console.log(`  諧振頻率 = ${(fr/1000).toFixed(1)}kHz`);
}

/**
 * 主函數
 */
async function main() {
    console.log("=================================================================");
    console.log("         梯形積分法實現驗證測試");
    console.log("=================================================================");
    
    verifyCompanionModels();
    
    const result = await testTrapezoidalBasic();
    
    console.log("\n=== 測試結論 ===");
    if (result.success) {
        if (result.error < 10) {
            console.log("✅ 梯形積分法實現成功，精度顯著改善！");
        } else if (result.error < 25) {
            console.log("🟡 梯形積分法有改善，但仍需進一步優化");
        } else {
            console.log("❌ 梯形積分法未達到預期改善");
        }
    } else {
        console.log("❌ 梯形積分法實現存在問題，需要調試");
    }
}

main();