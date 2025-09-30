/**
 * =================================================================
 *         最終對比測試 - 後向歐拉 vs 梯形積分
 * =================================================================
 */

import {
    AkingSPICE,
    VoltageSource,
    Resistor,
    Inductor,
    Capacitor
} from './src/index.js';

async function finalComparison() {
    console.log("=== 最終積分方法對比測試 ===");
    
    const fr = 70000; // 70kHz
    const period = 1 / fr;
    const timeStep = period / 100; // 100點/週期
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
    
    console.log(`理論諧振頻率: ${(fr/1000).toFixed(1)}kHz`);
    console.log(`解析解增益: ${analytical_gain.toFixed(4)}`);
    console.log(`解析解振幅: ${analytical_amplitude.toFixed(3)}V`);
    
    const results = [];
    
    // 測試兩種方法
    for (const method of ['backward_euler', 'trapezoidal']) {
        console.log(`\n--- ${method === 'backward_euler' ? '後向歐拉法' : '梯形積分法'} ---`);
        
        const solver = new AkingSPICE();
        
        // 建立元件
        const voltage = new VoltageSource('Vin', ['in', '0'], `SINE(0 ${V_amplitude} ${fr})`);
        const inductor = new Inductor('L1', ['in', 'lc_node'], L_value);
        const capacitor = new Capacitor('C1', ['lc_node', 'load_node'], C_value);
        const resistor = new Resistor('R1', ['load_node', '0'], R_value);
        
        // 設置積分方法
        voltage.initTransient(timeStep, method);
        inductor.initTransient(timeStep, method);
        capacitor.initTransient(timeStep, method);
        resistor.initTransient(timeStep, method);
        
        console.log(`電感等效電阻: ${inductor.equivalentResistance.toFixed(1)}Ω`);
        console.log(`電容等效電導: ${(capacitor.equivalentConductance*1e6).toFixed(0)}mS`);
        
        const components = [voltage, inductor, capacitor, resistor];
        
        try {
            // 初始化暫態分析
            const { TransientResult } = await import('./src/analysis/transient.js');
            solver.transientAnalysis.components = components;
            solver.transientAnalysis.result = new TransientResult();
            await solver.transientAnalysis.initialize(components, timeStep, method);
            
            // 設置時間參數
            solver.transientAnalysis.startTime = 0;
            solver.transientAnalysis.stopTime = totalTime;
            solver.transientAnalysis.timeStep = timeStep;
            
            // 運行時域循環
            await solver.transientAnalysis.timeLoop();
            
            const result = solver.transientAnalysis.result;
            const voltages = result.nodeVoltages.get('load_node');
            
            if (voltages && voltages.length > 0) {
                // 分析穩態 (後半部分)
                const steadyStart = Math.floor(voltages.length * 0.6);
                const steadyVoltages = voltages.slice(steadyStart);
                
                const vMax = Math.max(...steadyVoltages);
                const vMin = Math.min(...steadyVoltages);
                const amplitude = (vMax - vMin) / 2;
                const gain = amplitude / V_amplitude;
                
                const error = Math.abs(gain - analytical_gain) / analytical_gain * 100;
                
                console.log(`模擬增益: ${gain.toFixed(4)}`);
                console.log(`振幅: ${amplitude.toFixed(3)}V`);
                console.log(`誤差: ${error.toFixed(2)}%`);
                
                results.push({
                    method: method,
                    gain: gain,
                    amplitude: amplitude,
                    error: error,
                    success: true
                });
                
            } else {
                console.log("❌ 沒有獲得電壓結果");
                results.push({ method: method, success: false });
            }
            
        } catch (error) {
            console.log("❌ 分析失敗:", error.message);
            results.push({ method: method, success: false, error: error.message });
        }
    }
    
    // 對比結果
    console.log("\n=== 方法對比總結 ===");
    console.log("方法         | 增益     | 誤差     | 改進");
    console.log("-------------|----------|----------|--------");
    
    let improvement = null;
    if (results.length >= 2 && results[0].success && results[1].success) {
        const eulerError = results[0].error;
        const trapError = results[1].error;
        improvement = eulerError - trapError;
        
        console.log(`後向歐拉法   | ${results[0].gain.toFixed(4)} | ${eulerError.toFixed(2)}% | -`);
        console.log(`梯形積分法   | ${results[1].gain.toFixed(4)} | ${trapError.toFixed(2)}% | ${improvement > 0 ? '+' : ''}${improvement.toFixed(1)}%`);
    }
    
    console.log("\n=== 最終結論 ===");
    if (improvement !== null) {
        if (improvement > 5) {
            console.log("✅ 梯形積分法顯著改善了精度!");
            console.log(`精度提升: ${improvement.toFixed(1)}%`);
        } else if (improvement > 0) {
            console.log("🟡 梯形積分法有輕微改善");
            console.log(`精度提升: ${improvement.toFixed(1)}%`);
        } else {
            console.log("❌ 梯形積分法沒有改善精度");
            console.log("可能的原因:");
            console.log("  1. 實現中仍有數值誤差");
            console.log("  2. 需要調整時間步長");
            console.log("  3. 諧振系統需要特殊處理");
        }
        
        if (results[1].error < 10) {
            console.log("\n✅ 整體精度已達到可接受水平 (<10%)");
        } else {
            console.log("\n⚠️ 整體精度仍需改進 (>10%)");
        }
        
    } else {
        console.log("❌ 測試失敗，無法進行比較");
    }
    
    return results;
}

// 運行測試
finalComparison();