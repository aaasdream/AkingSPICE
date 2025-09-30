/**
 * =================================================================
 *           數值積分方法精度分析 - 後向歐拉法 vs 解析解
 * =================================================================
 * 
 * 目標: 對比後向歐拉法在LC/LCR諧振電路中的精度
 * 方法: 使用已知解析解的簡單電路進行對比測試
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
const wr = 2 * Math.PI * fr;
const Z0 = Math.sqrt(TEST_PARAMS.L / TEST_PARAMS.C);
const Q = Z0 / TEST_PARAMS.R;

console.log("=== 理論參數 ===");
console.log(`諧振頻率: ${(fr/1000).toFixed(1)}kHz`);
console.log(`特性阻抗: ${Z0.toFixed(1)}Ω`);
console.log(`品質因子: ${Q.toFixed(2)}`);

/**
 * 解析解：LCR串聯諧振電路的穩態響應
 * 對於 V_in = V0 * sin(ωt)，負載電壓為：
 * V_load(t) = V0 * R/|Z| * sin(ωt + φ)
 * 其中 |Z| = sqrt(R² + (ωL - 1/(ωC))²)
 */
function getAnalyticalSolution(frequency, time_points) {
    const omega = 2 * Math.PI * frequency;
    const XL = omega * TEST_PARAMS.L;
    const XC = 1 / (omega * TEST_PARAMS.C);
    const Z_magnitude = Math.sqrt(TEST_PARAMS.R**2 + (XL - XC)**2);
    const amplitude = TEST_PARAMS.Vin * TEST_PARAMS.R / Z_magnitude;
    
    const phase = Math.atan2(XL - XC, TEST_PARAMS.R);
    
    const voltages = time_points.map(t => 
        amplitude * Math.sin(omega * t + phase)
    );
    
    return {
        amplitude: amplitude,
        phase: phase,
        voltages: voltages,
        impedance: Z_magnitude,
        gain: TEST_PARAMS.R / Z_magnitude
    };
}

/**
 * 測試不同時間步長下的精度
 */
async function testTimeStepAccuracy() {
    console.log("\n=== 測試不同時間步長的精度 ===");
    
    const test_freq = fr; // 在諧振頻率測試
    const period = 1 / test_freq;
    const sim_time = period * 10; // 模擬10個週期
    
    // 不同的時間步長 (以每週期採樣點數表示)
    const samples_per_cycle = [10, 20, 50, 100, 200];
    
    // 獲取解析解 (高精度參考)
    const fine_time_points = Array.from({length: 2000}, (_, i) => i * sim_time / 2000);
    const analytical = getAnalyticalSolution(test_freq, fine_time_points);
    
    console.log(`解析解振幅: ${analytical.amplitude.toFixed(3)}V`);
    console.log(`解析解增益: ${analytical.gain.toFixed(4)}`);
    
    const results = [];
    
    for (const spc of samples_per_cycle) {
        const timeStep = period / spc;
        console.log(`\n--- 時間步長: ${(timeStep*1e6).toFixed(3)}μs (${spc}點/週期) ---`);
        
        // AkingSPICE 模擬
        const solver = new AkingSPICE();
        solver.components = [
            new VoltageSource('Vin', ['in', '0'], `SINE(0 ${TEST_PARAMS.Vin} ${test_freq})`),
            new Inductor('L1', ['in', 'lc_node'], TEST_PARAMS.L),
            new Capacitor('C1', ['lc_node', 'load_node'], TEST_PARAMS.C),
            new Resistor('R1', ['load_node', '0'], TEST_PARAMS.R)
        ];
        solver.isInitialized = true;
        
        const sim_results = await solver.runSteppedSimulation(() => ({}), {
            stopTime: sim_time,
            timeStep: timeStep
        });
        
        if (!sim_results || sim_results.steps.length === 0) {
            console.log("❌ 模擬失敗");
            continue;
        }
        
        // 分析穩態結果 (最後5個週期)
        const steadyStart = Math.floor(sim_results.steps.length * 0.5);
        const steadySteps = sim_results.steps.slice(steadyStart);
        const v_load_sim = steadySteps.map(s => s.nodeVoltages['load_node']);
        const times_sim = steadySteps.map((_, i) => (steadyStart + i) * timeStep);
        
        // 計算模擬振幅
        const v_max = Math.max(...v_load_sim);
        const v_min = Math.min(...v_load_sim);
        const sim_amplitude = (v_max - v_min) / 2;
        const sim_gain = sim_amplitude / TEST_PARAMS.Vin;
        
        // 計算誤差
        const amplitude_error = Math.abs(sim_amplitude - analytical.amplitude) / analytical.amplitude * 100;
        const gain_error = Math.abs(sim_gain - analytical.gain) / analytical.gain * 100;
        
        console.log(`模擬振幅: ${sim_amplitude.toFixed(3)}V`);
        console.log(`模擬增益: ${sim_gain.toFixed(4)}`);
        console.log(`振幅誤差: ${amplitude_error.toFixed(2)}%`);
        console.log(`增益誤差: ${gain_error.toFixed(2)}%`);
        
        // 計算均方根誤差 (對穩態波形)
        let mse = 0;
        let compare_points = 0;
        for (let i = 0; i < v_load_sim.length; i += 5) { // 每5個點採樣一次避免過密
            const sim_t = times_sim[i];
            const analytical_v = analytical.amplitude * Math.sin(2 * Math.PI * test_freq * sim_t + analytical.phase);
            mse += (v_load_sim[i] - analytical_v) ** 2;
            compare_points++;
        }
        const rmse = Math.sqrt(mse / compare_points);
        const rmse_percent = rmse / analytical.amplitude * 100;
        
        console.log(`波形RMSE: ${rmse.toFixed(4)}V (${rmse_percent.toFixed(2)}%)`);
        
        results.push({
            samples_per_cycle: spc,
            timeStep: timeStep,
            sim_amplitude,
            sim_gain,
            amplitude_error,
            gain_error,
            rmse_percent
        });
    }
    
    // 總結分析
    console.log("\n=== 精度分析總結 ===");
    console.log("步長/週期  |  振幅誤差%  |  增益誤差%  |  波形RMSE%");
    console.log("-----------|-------------|-------------|----------");
    for (const r of results) {
        const spc_str = r.samples_per_cycle.toString().padStart(9);
        const amp_err_str = r.amplitude_error.toFixed(2).padStart(10);
        const gain_err_str = r.gain_error.toFixed(2).padStart(10);
        const rmse_str = r.rmse_percent.toFixed(2).padStart(9);
        console.log(`${spc_str} | ${amp_err_str} | ${gain_err_str} | ${rmse_str}`);
    }
    
    // 找出最佳精度
    const best_result = results.reduce((best, current) => 
        current.gain_error < best.gain_error ? current : best
    );
    
    console.log(`\n最佳精度配置: ${best_result.samples_per_cycle}點/週期`);
    console.log(`對應時間步長: ${(best_result.timeStep*1e6).toFixed(3)}μs`);
    console.log(`增益誤差: ${best_result.gain_error.toFixed(2)}%`);
    
    return results;
}

/**
 * 測試不同頻率下的精度變化
 */
async function testFrequencyDependentAccuracy() {
    console.log("\n=== 測試頻率相關精度變化 ===");
    
    const test_frequencies = [fr * 0.5, fr * 0.8, fr, fr * 1.2, fr * 1.5];
    const fixed_timeStep = 1 / (fr * 100); // 固定100點/諧振週期
    
    console.log(`固定時間步長: ${(fixed_timeStep*1e6).toFixed(3)}μs`);
    
    const freq_results = [];
    
    for (const f of test_frequencies) {
        const freq_ratio = f / fr;
        console.log(`\n--- 測試頻率: ${(f/1000).toFixed(1)}kHz (${(freq_ratio*100).toFixed(0)}% fr) ---`);
        
        // 解析解
        const period = 1 / f;
        const sim_time = period * 8;
        const analytical_time = Array.from({length: 1000}, (_, i) => i * sim_time / 1000);
        const analytical = getAnalyticalSolution(f, analytical_time);
        
        // 數值模擬
        const solver = new AkingSPICE();
        solver.components = [
            new VoltageSource('Vin', ['in', '0'], `SINE(0 ${TEST_PARAMS.Vin} ${f})`),
            new Inductor('L1', ['in', 'lc_node'], TEST_PARAMS.L),
            new Capacitor('C1', ['lc_node', 'load_node'], TEST_PARAMS.C),
            new Resistor('R1', ['load_node', '0'], TEST_PARAMS.R)
        ];
        solver.isInitialized = true;
        
        const sim_results = await solver.runSteppedSimulation(() => ({}), {
            stopTime: sim_time,
            timeStep: fixed_timeStep
        });
        
        if (!sim_results || sim_results.steps.length === 0) continue;
        
        // 分析結果
        const steadyStart = Math.floor(sim_results.steps.length * 0.5);
        const steadySteps = sim_results.steps.slice(steadyStart);
        const v_load_sim = steadySteps.map(s => s.nodeVoltages['load_node']);
        
        const sim_amplitude = (Math.max(...v_load_sim) - Math.min(...v_load_sim)) / 2;
        const sim_gain = sim_amplitude / TEST_PARAMS.Vin;
        
        const gain_error = Math.abs(sim_gain - analytical.gain) / analytical.gain * 100;
        
        console.log(`解析增益: ${analytical.gain.toFixed(4)}`);
        console.log(`模擬增益: ${sim_gain.toFixed(4)}`);
        console.log(`增益誤差: ${gain_error.toFixed(2)}%`);
        
        freq_results.push({
            frequency: f,
            freq_ratio,
            analytical_gain: analytical.gain,
            sim_gain,
            gain_error
        });
    }
    
    // 總結頻率精度分析
    console.log("\n=== 頻率精度分析總結 ===");
    console.log("頻率比  |  解析增益  |  模擬增益  |  誤差%");
    console.log("--------|------------|------------|-------");
    for (const r of freq_results) {
        const ratio_str = r.freq_ratio.toFixed(2).padStart(6);
        const ana_str = r.analytical_gain.toFixed(4).padStart(9);
        const sim_str = r.sim_gain.toFixed(4).padStart(9);
        const err_str = r.gain_error.toFixed(2).padStart(5);
        console.log(`${ratio_str} | ${ana_str} | ${sim_str} | ${err_str}`);
    }
    
    return freq_results;
}

/**
 * 主函數
 */
async function main() {
    console.log("=================================================================");
    console.log("         數值積分方法精度分析 - 後向歐拉法診斷");
    console.log("=================================================================");
    
    try {
        const timestep_results = await testTimeStepAccuracy();
        const frequency_results = await testFrequencyDependentAccuracy();
        
        console.log("\n=== 診斷結論 ===");
        
        // 檢查是否有系統性偏差
        const typical_error = timestep_results[timestep_results.length - 1]?.gain_error || 0;
        
        if (typical_error > 10) {
            console.log("❌ 檢測到嚴重系統性誤差 (>10%)");
            console.log("可能原因:");
            console.log("  1. 後向歐拉法在諧振系統中引入過多數值阻尼");
            console.log("  2. 伴隨模型參數計算錯誤");
            console.log("  3. MNA矩陣求解精度不足");
            
            console.log("\n建議解決方案:");
            console.log("  1. 嘗試梯形積分法 (Trapezoidal Rule) 減少數值阻尼");
            console.log("  2. 檢查電感電容的伴隨模型實現");
            console.log("  3. 增加求解器的數值精度");
            
        } else if (typical_error > 5) {
            console.log("⚠️  檢測到中等精度問題 (5-10%)");
            console.log("建議調整時間步長或使用更精確的積分方法");
            
        } else {
            console.log("✅ 數值精度可接受 (<5%)");
        }
        
    } catch (error) {
        console.error("測試過程中發生錯誤:", error.message);
    }
}

// 運行測試
main();