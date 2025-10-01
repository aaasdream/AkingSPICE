/**
 * 強欠阻尼RLC電路測試
 * 使用更小的電阻來確保明顯的振盪
 */

import { ExplicitStateSolver } from '../src/core/explicit-state-solver.js';
import { VoltageSource } from '../src/components/sources.js';
import { Resistor } from '../src/components/resistor.js';
import { Capacitor } from '../src/components/capacitor.js';
import { Inductor } from '../src/components/inductor.js';

async function testStrongUnderdamped() {
    console.log('🌊 測試強欠阻尼RLC電路 - 明顯振盪測試');
    
    // 強欠阻尼電路：R=2Ω, L=1mH, C=10µF
    // 阻尼比會非常小，應該產生強烈振盪
    const R = 2;       // 非常小的電阻
    const L = 1e-3;    // 1mH
    const C = 10e-6;   // 10µF
    const Vstep = 12;  // 12V階躍
    
    // 計算理論參數
    const omega0 = 1 / Math.sqrt(L * C);
    const zeta = R / 2 * Math.sqrt(C / L);
    const f0 = omega0 / (2 * Math.PI);
    const omega_d = omega0 * Math.sqrt(1 - zeta * zeta);
    const fd = omega_d / (2 * Math.PI);
    const Q = 1 / (2 * zeta);
    
    console.log(`\n電路參數：R=${R}Ω, L=${L*1e3}mH, C=${C*1e6}µF`);
    console.log(`理論參數：`);
    console.log(`  自然頻率 f0 = ${f0.toFixed(1)} Hz (${omega0.toFixed(0)} rad/s)`);
    console.log(`  阻尼比 ζ = ${zeta.toFixed(3)} ${zeta < 1 ? '(強欠阻尼 - 高Q值振盪)' : '(過阻尼)'}`);
    console.log(`  阻尼振盪頻率 fd = ${fd.toFixed(1)} Hz`);
    console.log(`  品質因子 Q = ${Q.toFixed(1)} (Q > 0.5 表示明顯振盪)`);
    console.log(`  預期超調量: ${(Math.exp(-Math.PI * zeta / Math.sqrt(1 - zeta*zeta)) * 100).toFixed(1)}%`);
    
    // 建立電路
    const components = [
        new VoltageSource('V1', ['vin', 'gnd'], Vstep),
        new Resistor('R1', ['vin', 'n1'], R),
        new Inductor('L1', ['n1', 'n2'], L, { ic: 0 }),
        new Capacitor('C1', ['n2', 'gnd'], C, { ic: 0 })
    ];
    
    const solver = new ExplicitStateSolver();
    await solver.initialize(components, 0.2e-6, { debug: false }); // 0.2µs更小的時間步長
    
    console.log('\n開始強欠阻尼RLC仿真...');
    
    const results = [];
    const totalSteps = 800; // 運行更久以看到完整振盪
    let maxVoltage = 0;
    let overshoot = 0;
    
    for (let step = 0; step < totalSteps; step++) {
        const result = solver.step();
        const time = result.time;
        const vcap = result.stateVariables.get('C1') || 0;
        const il = result.stateVariables.get('L1') || 0;
        
        // 跟蹤最大電壓（超調量）
        if (vcap > maxVoltage) {
            maxVoltage = vcap;
            overshoot = ((maxVoltage - Vstep) / Vstep) * 100;
        }
        
        // 計算欠阻尼理論解
        const alpha = zeta * omega0;
        const exponential_term = Math.exp(-alpha * time);
        const cos_term = Math.cos(omega_d * time);
        const sin_term = Math.sin(omega_d * time);
        const vcap_theory = Vstep * (1 - exponential_term * (cos_term + (alpha / omega_d) * sin_term));
        
        results.push({
            time: time * 1e6, // 轉換為µs
            vcap: vcap,
            vcap_theory: vcap_theory,
            il: il,
            error: Math.abs(vcap - vcap_theory)
        });
        
        // 每20步記錄一次
        if (step % 20 === 0) {
            const error_percent = (Math.abs(vcap - vcap_theory) / Vstep) * 100;
            console.log(`t=${(time*1e6).toFixed(1)}µs: Vc=${vcap.toFixed(4)}V (理論=${vcap_theory.toFixed(4)}V), Il=${il.toFixed(6)}A, 誤差=${error_percent.toFixed(3)}%`);
        }
    }
    
    solver.destroy();
    
    // 分析振盪特性
    const maxError = Math.max(...results.map(r => r.error / Vstep * 100));
    const avgError = results.reduce((sum, r) => sum + r.error / Vstep * 100, 0) / results.length;
    
    // 尋找峰值和谷值
    let peaks = [];
    let valleys = [];
    
    for (let i = 2; i < results.length - 2; i++) {
        // 峰值檢測（局部最大值）
        if (results[i].vcap > results[i-1].vcap && 
            results[i].vcap > results[i+1].vcap && 
            results[i].vcap > results[i-2].vcap && 
            results[i].vcap > results[i+2].vcap) {
            peaks.push({
                time: results[i].time,
                voltage: results[i].vcap,
                theory: results[i].vcap_theory
            });
        }
        
        // 谷值檢測（局部最小值）
        if (results[i].vcap < results[i-1].vcap && 
            results[i].vcap < results[i+1].vcap && 
            results[i].vcap < results[i-2].vcap && 
            results[i].vcap < results[i+2].vcap) {
            valleys.push({
                time: results[i].time,
                voltage: results[i].vcap,
                theory: results[i].vcap_theory
            });
        }
    }
    
    console.log('\n📊 振盪分析結果：');
    console.log(`  最大誤差: ${maxError.toFixed(3)}%`);
    console.log(`  平均誤差: ${avgError.toFixed(3)}%`);
    console.log(`  最大電壓: ${maxVoltage.toFixed(4)}V (超調量: ${overshoot.toFixed(1)}%)`);
    console.log(`  檢測到 ${peaks.length} 個峰值, ${valleys.length} 個谷值`);
    
    // 顯示前幾個峰值和谷值
    const displayCount = Math.min(3, peaks.length);
    for (let i = 0; i < displayCount; i++) {
        const peak = peaks[i];
        const error = Math.abs(peak.voltage - peak.theory) / Vstep * 100;
        console.log(`    峰值 ${i+1}: t=${peak.time.toFixed(1)}µs, V=${peak.voltage.toFixed(4)}V (理論=${peak.theory.toFixed(4)}V), 誤差=${error.toFixed(3)}%`);
    }
    
    for (let i = 0; i < Math.min(3, valleys.length); i++) {
        const valley = valleys[i];
        const error = Math.abs(valley.voltage - valley.theory) / Vstep * 100;
        console.log(`    谷值 ${i+1}: t=${valley.time.toFixed(1)}µs, V=${valley.voltage.toFixed(4)}V (理論=${valley.theory.toFixed(4)}V), 誤差=${error.toFixed(3)}%`);
    }
    
    // 頻率分析
    if (peaks.length >= 2) {
        const periods = [];
        for (let i = 1; i < peaks.length; i++) {
            periods.push(peaks[i].time - peaks[i-1].time);
        }
        const avgPeriod = periods.reduce((sum, p) => sum + p, 0) / periods.length;
        const measuredFreq = 1000000 / avgPeriod; // 轉換為Hz
        const freqError = Math.abs(measuredFreq - fd) / fd * 100;
        
        console.log(`\n🎯 振盪頻率驗證:`);
        console.log(`  測量頻率: ${measuredFreq.toFixed(1)} Hz`);
        console.log(`  理論頻率: ${fd.toFixed(1)} Hz`);
        console.log(`  頻率誤差: ${freqError.toFixed(2)}%`);
        console.log(`  平均週期: ${avgPeriod.toFixed(1)}µs`);
    }
    
    // 評估結果
    const hasOscillation = peaks.length > 0 && valleys.length > 0;
    const goodAccuracy = maxError < 5;
    
    if (hasOscillation && goodAccuracy) {
        console.log(`\n🎉 強欠阻尼RLC電路測試成功！求解器正確模擬了振盪行為！`);
    } else if (hasOscillation) {
        console.log(`\n✅ 檢測到振盪，但精度需要改進`);
    } else {
        console.log(`\n⚠️ 未檢測到預期的振盪行為，可能需要更小的時間步長或不同的參數`);
    }
    
    return results;
}

// 運行測試
testStrongUnderdamped()
    .catch(error => {
        console.error('❌ 強欠阻尼RLC測試失敗:', error.message);
        console.error(error.stack);
    });