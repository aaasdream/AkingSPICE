/**
 * =================================================================
 *              LLC 理論與模擬一致性檢驗工具
 * =================================================================
 * 
 * 目標: 創建最簡單的LLC諧振電路，逐步驗證理論計算與模擬的一致性
 */

import {
    AkingSPICE,
    VoltageSource,
    Resistor,
    Inductor,
    Capacitor
} from './src/index.js';

// 標準LLC參數
const LLC_PARAMS = {
    Lr: 25e-6,      // 25μH 諧振電感
    Cr: 207e-9,     // 207nF 諧振電容
    R_load: 11.0    // 11Ω 負載 = 特性阻抗
};

/**
 * 測試1: 純LC諧振電路 (無負載)
 */
async function testPureLCResonance() {
    console.log("=== 測試1: 純LC諧振電路 (無負載) ===");
    
    // 理論計算
    const fr = 1 / (2 * Math.PI * Math.sqrt(LLC_PARAMS.Lr * LLC_PARAMS.Cr));
    const Z0 = Math.sqrt(LLC_PARAMS.Lr / LLC_PARAMS.Cr);
    const wr = 2 * Math.PI * fr;
    
    console.log(`理論諧振頻率: ${(fr/1000).toFixed(1)}kHz`);
    console.log(`理論特性阻抗: ${Z0.toFixed(1)}Ω`);
    
    // 建立純LC電路
    const solver = new AkingSPICE();
    solver.components = [
        new VoltageSource('Vac', ['in', '0'], `SINE(0 100 ${fr})`),
        new Inductor('Lr', ['in', 'lc_node'], LLC_PARAMS.Lr),
        new Capacitor('Cr', ['lc_node', '0'], LLC_PARAMS.Cr),
        new Resistor('R_tiny', ['lc_node', '0'], 1e6) // 極小阻抗避免開路
    ];
    solver.isInitialized = true;
    
    // 模擬諧振
    const period = 1 / fr;
    const results = await solver.runSteppedSimulation(() => ({}), {
        stopTime: period * 20,  // 20個週期達穩態
        timeStep: period / 100
    });
    
    if (!results || results.steps.length === 0) {
        console.log("❌ 模擬失敗");
        return;
    }
    
    // 分析穩態響應
    const steadyStart = Math.floor(results.steps.length * 0.8);
    const steadySteps = results.steps.slice(steadyStart);
    const v_lc = steadySteps.map(s => s.nodeVoltages['lc_node']);
    
    const v_lc_max = Math.max(...v_lc);
    const v_lc_min = Math.min(...v_lc);
    const v_lc_amplitude = (v_lc_max - v_lc_min) / 2;
    
    console.log(`模擬LC節點振幅: ${v_lc_amplitude.toFixed(1)}V`);
    console.log(`理論無阻尼時應接近無限大，實際受數值阻尼限制`);
    
    // 檢查相位關係 (LC諧振時電感電容電壓相位相反)
    const phase_shift_samples = 5;
    console.log(`LC諧振品質檢查: 振幅 > 50V 表示接近理想諧振`);
    console.log(v_lc_amplitude > 50 ? "✅ 純LC諧振正常" : "❌ LC諧振異常");
}

/**
 * 測試2: LCR阻尼諧振電路
 */
async function testLCRDampedResonance() {
    console.log("\n=== 測試2: LCR阻尼諧振電路 ===");
    
    const fr = 1 / (2 * Math.PI * Math.sqrt(LLC_PARAMS.Lr * LLC_PARAMS.Cr));
    const Z0 = Math.sqrt(LLC_PARAMS.Lr / LLC_PARAMS.Cr);
    
    console.log(`理論諧振頻率: ${(fr/1000).toFixed(1)}kHz`);
    console.log(`理論特性阻抗: ${Z0.toFixed(1)}Ω`);
    console.log(`負載阻抗: ${LLC_PARAMS.R_load}Ω (匹配Z0)`);
    
    const solver = new AkingSPICE();
    solver.components = [
        new VoltageSource('Vac', ['in', '0'], `SINE(0 100 ${fr})`),
        new Inductor('Lr', ['in', 'lcr_node'], LLC_PARAMS.Lr),
        new Capacitor('Cr', ['lcr_node', 'load_node'], LLC_PARAMS.Cr),
        new Resistor('Rload', ['load_node', '0'], LLC_PARAMS.R_load)
    ];
    solver.isInitialized = true;
    
    const period = 1 / fr;
    const results = await solver.runSteppedSimulation(() => ({}), {
        stopTime: period * 15,
        timeStep: period / 100
    });
    
    if (!results || results.steps.length === 0) {
        console.log("❌ 模擬失敗");
        return;
    }
    
    // 分析穩態響應
    const steadyStart = Math.floor(results.steps.length * 0.8);
    const steadySteps = results.steps.slice(steadyStart);
    const v_load = steadySteps.map(s => s.nodeVoltages['load_node']);
    
    const v_load_max = Math.max(...v_load);
    const v_load_min = Math.min(...v_load);
    const v_load_amplitude = (v_load_max - v_load_min) / 2;
    
    // 理論計算：諧振時阻抗 = R_load，電壓分壓比 = R/(R+0) = 1 (理想情況)
    // 實際上 Z_total = sqrt(R^2 + (wL - 1/wC)^2) = R (諧振時)
    const theoretical_gain = LLC_PARAMS.R_load / LLC_PARAMS.R_load; // = 1
    const theoretical_v_load = 100 * theoretical_gain; // 100V輸入振幅
    
    console.log(`理論負載電壓振幅: ${theoretical_v_load.toFixed(1)}V`);
    console.log(`模擬負載電壓振幅: ${v_load_amplitude.toFixed(1)}V`);
    
    const voltage_error = Math.abs(v_load_amplitude - theoretical_v_load) / theoretical_v_load * 100;
    console.log(`電壓誤差: ${voltage_error.toFixed(1)}%`);
    
    console.log(voltage_error < 5 ? "✅ LCR諧振一致性良好" : "❌ LCR諧振存在誤差");
    
    return { theoretical: theoretical_v_load, simulated: v_load_amplitude, error: voltage_error };
}

/**
 * 測試3: 不同頻率下的增益特性
 */
async function testFrequencyGainCharacteristics() {
    console.log("\n=== 測試3: 頻率增益特性驗證 ===");
    
    const fr = 1 / (2 * Math.PI * Math.sqrt(LLC_PARAMS.Lr * LLC_PARAMS.Cr));
    const test_frequencies = [fr * 0.5, fr, fr * 1.5]; // 50%, 100%, 150% 諧振頻率
    
    const results = [];
    
    for (const f of test_frequencies) {
        const omega = 2 * Math.PI * f;
        const XL = omega * LLC_PARAMS.Lr;
        const XC = 1 / (omega * LLC_PARAMS.Cr);
        const Z_total = Math.sqrt(LLC_PARAMS.R_load**2 + (XL - XC)**2);
        const theoretical_gain = LLC_PARAMS.R_load / Z_total;
        
        console.log(`\n頻率: ${(f/1000).toFixed(1)}kHz (${(f/fr*100).toFixed(0)}% fr)`);
        console.log(`  XL=${XL.toFixed(2)}Ω, XC=${XC.toFixed(2)}Ω, Z_total=${Z_total.toFixed(2)}Ω`);
        console.log(`  理論增益: ${theoretical_gain.toFixed(3)}`);
        
        // 模擬
        const solver = new AkingSPICE();
        solver.components = [
            new VoltageSource('Vac', ['in', '0'], `SINE(0 100 ${f})`),
            new Inductor('Lr', ['in', 'lcr_node'], LLC_PARAMS.Lr),
            new Capacitor('Cr', ['lcr_node', 'load_node'], LLC_PARAMS.Cr),
            new Resistor('Rload', ['load_node', '0'], LLC_PARAMS.R_load)
        ];
        solver.isInitialized = true;
        
        const period = 1 / f;
        const sim_results = await solver.runSteppedSimulation(() => ({}), {
            stopTime: period * 10,
            timeStep: period / 50
        });
        
        if (sim_results && sim_results.steps.length > 0) {
            const steadyStart = Math.floor(sim_results.steps.length * 0.8);
            const steadySteps = sim_results.steps.slice(steadyStart);
            const v_load = steadySteps.map(s => s.nodeVoltages['load_node']);
            const v_load_amplitude = (Math.max(...v_load) - Math.min(...v_load)) / 2;
            const simulated_gain = v_load_amplitude / 100.0; // 輸入100V振幅
            
            const gain_error = Math.abs(simulated_gain - theoretical_gain) / theoretical_gain * 100;
            
            console.log(`  模擬增益: ${simulated_gain.toFixed(3)}`);
            console.log(`  增益誤差: ${gain_error.toFixed(1)}%`);
            
            results.push({
                frequency: f,
                freq_ratio: f/fr,
                theoretical_gain,
                simulated_gain,
                error: gain_error
            });
        }
    }
    
    // 驗證諧振特性：fr處增益應該最高
    const resonant_result = results.find(r => Math.abs(r.freq_ratio - 1.0) < 0.01);
    const other_results = results.filter(r => Math.abs(r.freq_ratio - 1.0) >= 0.01);
    
    if (resonant_result && other_results.length > 0) {
        const resonant_gain = resonant_result.simulated_gain;
        const max_other_gain = Math.max(...other_results.map(r => r.simulated_gain));
        
        console.log(`\n諧振特性檢查:`);
        console.log(`  諧振頻率增益: ${resonant_gain.toFixed(3)}`);
        console.log(`  其他頻率最大增益: ${max_other_gain.toFixed(3)}`);
        
        if (resonant_gain > max_other_gain) {
            console.log("✅ 諧振特性正確 - 諧振頻率處增益最高");
        } else {
            console.log("❌ 諧振特性異常 - 諧振頻率處增益不是最高");
        }
    }
    
    return results;
}

/**
 * 主函數
 */
async function main() {
    console.log("=================================================================");
    console.log("           LLC 理論與模擬一致性檢驗開始");
    console.log("=================================================================");
    
    try {
        await testPureLCResonance();
        await testLCRDampedResonance();
        await testFrequencyGainCharacteristics();
        
        console.log("\n=================================================================");
        console.log("           LLC 理論一致性檢驗完成");
        console.log("=================================================================");
        
    } catch (error) {
        console.error("測試過程中發生錯誤:", error.message);
    }
}

// 運行測試
main();