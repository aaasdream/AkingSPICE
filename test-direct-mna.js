/**
 * =================================================================
 *         直接MNA測試 - 繞過高級接口
 * =================================================================
 */

import {
    AkingSPICE,
    VoltageSource,
    Resistor,
    Inductor,
    Capacitor
} from './src/index.js';

async function directMNATest() {
    console.log("=== 直接MNA測試 - 梯形法vs後向歐拉法 ===");
    
    const fr = 70000; // 70kHz
    const timeStep = 1 / (fr * 100); // 100點/週期
    const L_value = 25e-6;
    const C_value = 207e-9;
    const R_value = 11.0;
    const V_amplitude = 100;
    
    console.log(`時間步長: ${(timeStep*1e6).toFixed(3)}μs`);
    
    // 測試1: 後向歐拉法
    console.log("\n--- 後向歐拉法 MNA 矩陣 ---");
    
    const solver1 = new AkingSPICE();
    const voltage1 = new VoltageSource('Vin', ['in', '0'], `SINE(0 ${V_amplitude} ${fr})`);
    const inductor1 = new Inductor('L1', ['in', 'lc_node'], L_value);
    const capacitor1 = new Capacitor('C1', ['lc_node', 'load_node'], C_value);
    const resistor1 = new Resistor('R1', ['load_node', '0'], R_value);
    
    // 手動設置後向歐拉法
    voltage1.initTransient(timeStep, 'backward_euler');
    inductor1.initTransient(timeStep, 'backward_euler');
    capacitor1.initTransient(timeStep, 'backward_euler');
    resistor1.initTransient(timeStep, 'backward_euler');
    
    console.log(`電感等效電阻: ${inductor1.equivalentResistance.toFixed(1)}Ω`);
    console.log(`電容等效電導: ${(capacitor1.equivalentConductance*1e6).toFixed(0)}mS`);
    
    solver1.components = [voltage1, inductor1, capacitor1, resistor1];
    solver1.isInitialized = true;
    
    // 測試2: 梯形法
    console.log("\n--- 梯形法 MNA 矩陣 ---");
    
    const solver2 = new AkingSPICE();
    const voltage2 = new VoltageSource('Vin', ['in', '0'], `SINE(0 ${V_amplitude} ${fr})`);
    const inductor2 = new Inductor('L1', ['in', 'lc_node'], L_value);
    const capacitor2 = new Capacitor('C1', ['lc_node', 'load_node'], C_value);
    const resistor2 = new Resistor('R1', ['load_node', '0'], R_value);
    
    // 手動設置梯形法
    voltage2.initTransient(timeStep, 'trapezoidal');
    inductor2.initTransient(timeStep, 'trapezoidal');
    capacitor2.initTransient(timeStep, 'trapezoidal');
    resistor2.initTransient(timeStep, 'trapezoidal');
    
    console.log(`電感等效電阻: ${inductor2.equivalentResistance.toFixed(1)}Ω`);
    console.log(`電容等效電導: ${(capacitor2.equivalentConductance*1e6).toFixed(0)}mS`);
    
    solver2.components = [voltage2, inductor2, capacitor2, resistor2];
    solver2.isInitialized = true;
    
    // 檢查差異
    const G1 = capacitor1.equivalentConductance;
    const G2 = capacitor2.equivalentConductance;
    const R1 = inductor1.equivalentResistance;
    const R2 = inductor2.equivalentResistance;
    
    console.log(`\n電容電導差異: ${((G2/G1 - 1)*100).toFixed(1)}%`);
    console.log(`電感電阻差異: ${((R2/R1 - 1)*100).toFixed(1)}%`);
    
    // 手動運行幾個時間步來看差異
    console.log("\n--- 手動時間步測試 ---");
    
    const mna1 = solver1.transientAnalysis.mnaBuilder;
    const mna2 = solver2.transientAnalysis.mnaBuilder;
    
    mna1.analyzeCircuit(solver1.components);
    mna2.analyzeCircuit(solver2.components);
    
    // 第一個時間步 (t=0)
    const time = timeStep;
    
    // 電壓源會在MNA構建時自動更新值
    // voltage1.updateValue(time);
    // voltage2.updateValue(time);
    
    console.log(`時間 t=${(time*1e6).toFixed(3)}μs:`);
    // console.log(`電壓源值: ${voltage1.getValue(time).toFixed(3)}V`);
    
    // 構建MNA矩陣
    const {matrix: mat1, rhs: rhs1} = mna1.buildMNAMatrix(solver1.components, time);
    const {matrix: mat2, rhs: rhs2} = mna2.buildMNAMatrix(solver2.components, time);
    
    // 檢查關鍵矩陣元素
    console.log("\n後向歐拉法矩陣對角元素:");
    console.log(`[1,1]: ${mat1.get(1,1).toFixed(6)} (電容+電阻節點)`);
    
    console.log("\n梯形法矩陣對角元素:");
    console.log(`[1,1]: ${mat2.get(1,1).toFixed(6)} (電容+電阻節點)`);
    
    const matDiff = mat2.get(1,1) - mat1.get(1,1);
    console.log(`差異: ${matDiff.toFixed(6)} (應該≈${(G2-G1).toFixed(6)})`);
    
    return {
        euler: { capacitor: capacitor1, inductor: inductor1 },
        trapezoidal: { capacitor: capacitor2, inductor: inductor2 }
    };
}

/**
 * 進行完整的穩態對比
 */
async function fullSteadyStateComparison() {
    console.log("\n=== 完整穩態響應對比 ===");
    
    const fr = 70000;
    const period = 1 / fr;
    const timeStep = period / 100;
    const totalTime = period * 8; // 8個週期
    
    const L_value = 25e-6;
    const C_value = 207e-9;
    const R_value = 11.0;
    const V_amplitude = 100;
    
    // 解析解
    const omega = 2 * Math.PI * fr;
    const XL = omega * L_value;
    const XC = 1 / (omega * C_value);
    const Z = Math.sqrt(R_value**2 + (XL - XC)**2);
    const analytical_gain = R_value / Z;
    const analytical_amplitude = V_amplitude * analytical_gain;
    
    console.log(`解析解增益: ${analytical_gain.toFixed(4)}`);
    console.log(`解析解振幅: ${analytical_amplitude.toFixed(3)}V`);
    
    // 後向歐拉法測試 (不通過runSteppedSimulation)
    console.log("\n--- 直接暫態分析 ---");
    
    const solver = new AkingSPICE();
    
    // 建立元件（梯形法）
    const voltage = new VoltageSource('Vin', ['in', '0'], `SINE(0 ${V_amplitude} ${fr})`);
    const inductor = new Inductor('L1', ['in', 'lc_node'], L_value);
    const capacitor = new Capacitor('C1', ['lc_node', 'load_node'], C_value);
    const resistor = new Resistor('R1', ['load_node', '0'], R_value);
    
    // 設置梯形法
    voltage.initTransient(timeStep, 'trapezoidal');
    inductor.initTransient(timeStep, 'trapezoidal');
    capacitor.initTransient(timeStep, 'trapezoidal');
    resistor.initTransient(timeStep, 'trapezoidal');
    
    const components = [voltage, inductor, capacitor, resistor];
    
    // 直接初始化暫態分析
    solver.transientAnalysis.components = components;
    solver.transientAnalysis.result = new (await import('./src/analysis/transient.js')).TransientResult();
    await solver.transientAnalysis.initialize(components, timeStep, 'trapezoidal');
    
    // 設置時間參數
    solver.transientAnalysis.startTime = 0;
    solver.transientAnalysis.stopTime = totalTime;
    solver.transientAnalysis.timeStep = timeStep;
    
    try {
        // 運行時域循環
        await solver.transientAnalysis.timeLoop();
        
        const result = solver.transientAnalysis.result;
        const voltages = result.nodeVoltages.get('load_node');
        
        if (voltages && voltages.length > 0) {
            // 分析穩態 (後半部分)
            const steadyStart = Math.floor(voltages.length * 0.5);
            const steadyVoltages = voltages.slice(steadyStart);
            
            const vMax = Math.max(...steadyVoltages);
            const vMin = Math.min(...steadyVoltages);
            const amplitude = (vMax - vMin) / 2;
            const gain = amplitude / V_amplitude;
            
            const error = Math.abs(gain - analytical_gain) / analytical_gain * 100;
            
            console.log(`梯形法 - 模擬增益: ${gain.toFixed(4)}`);
            console.log(`梯形法 - 誤差: ${error.toFixed(2)}%`);
            
            return { gain, error, success: true };
        } else {
            console.log("❌ 沒有獲得電壓結果");
            return { success: false };
        }
        
    } catch (error) {
        console.log("❌ 暫態分析失敗:", error.message);
        return { success: false, error: error.message };
    }
}

async function main() {
    const matrixTest = await directMNATest();
    const steadyTest = await fullSteadyStateComparison();
    
    console.log("\n=== 總結 ===");
    if (steadyTest.success && steadyTest.error < 10) {
        console.log("✅ 梯形積分法實現成功!");
    } else {
        console.log("❌ 梯形積分法仍有問題，需要進一步調試");
    }
}

main();