/**
 * 欠阻尼RLC電路測試
 * 專門測試振盪響應
 */

import { ExplicitStateSolver } from '../src/core/explicit-state-solver.js';
import { VoltageSource } from '../src/components/sources.js';
import { Resistor } from '../src/components/resistor.js';
import { Capacitor } from '../src/components/capacitor.js';
import { Inductor } from '../src/components/inductor.js';

async function testUnderdampedRLC() {
    console.log('🌊 測試欠阻尼RLC電路 - 振盪響應測試');
    
    // 欠阻尼電路：R=10Ω, L=1mH, C=10µF
    // 這應該產生明顯的振盪
    const R = 10;      // 很小的電阻
    const L = 1e-3;    // 1mH
    const C = 10e-6;   // 10µF
    const Vstep = 12;  // 12V階躍
    
    // 計算理論參數
    const omega0 = 1 / Math.sqrt(L * C);
    const zeta = R / 2 * Math.sqrt(C / L);
    const f0 = omega0 / (2 * Math.PI);
    const omega_d = omega0 * Math.sqrt(1 - zeta * zeta);
    const fd = omega_d / (2 * Math.PI);
    
    console.log(`\n電路參數：R=${R}Ω, L=${L*1e3}mH, C=${C*1e6}µF`);
    console.log(`理論參數：`);
    console.log(`  自然頻率 f0 = ${f0.toFixed(1)} Hz (${omega0.toFixed(0)} rad/s)`);
    console.log(`  阻尼比 ζ = ${zeta.toFixed(3)} ${zeta < 1 ? '(欠阻尼 - 會振盪)' : '(過阻尼 - 不會振盪)'}`);
    console.log(`  阻尼振盪頻率 fd = ${fd.toFixed(1)} Hz`);
    console.log(`  品質因子 Q = ${(1/(2*zeta)).toFixed(1)}`);
    
    // 建立電路
    const components = [
        new VoltageSource('V1', ['vin', 'gnd'], Vstep),
        new Resistor('R1', ['vin', 'n1'], R),
        new Inductor('L1', ['n1', 'n2'], L, { ic: 0 }),
        new Capacitor('C1', ['n2', 'gnd'], C, { ic: 0 })
    ];
    
    const solver = new ExplicitStateSolver();
    await solver.initialize(components, 0.5e-6, { debug: false }); // 0.5µs時間步長
    
    console.log('\n開始欠阻尼RLC仿真...');
    
    const results = [];
    const totalSteps = 400; // 運行400步 = 200µs
    
    for (let step = 0; step < totalSteps; step++) {
        const result = solver.step();
        const time = result.time;
        const vcap = result.stateVariables.get('C1') || 0;
        const il = result.stateVariables.get('L1') || 0;
        
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
        
        // 每10步記錄一次
        if (step % 10 === 0) {
            const error_percent = (Math.abs(vcap - vcap_theory) / Vstep) * 100;
            console.log(`t=${(time*1e6).toFixed(1)}µs: Vc=${vcap.toFixed(4)}V (理論=${vcap_theory.toFixed(4)}V), Il=${il.toFixed(6)}A, 誤差=${error_percent.toFixed(3)}%`);
        }
    }
    
    solver.destroy();
    
    // 分析振盪特性
    const maxError = Math.max(...results.map(r => r.error / Vstep * 100));
    const avgError = results.reduce((sum, r) => sum + r.error / Vstep * 100, 0) / results.length;
    
    // 尋找峰值（振盪的最大值）
    let peaks = [];
    for (let i = 1; i < results.length - 1; i++) {
        if (results[i].vcap > results[i-1].vcap && results[i].vcap > results[i+1].vcap) {
            peaks.push({
                time: results[i].time,
                voltage: results[i].vcap,
                theory: results[i].vcap_theory
            });
        }
    }
    
    console.log('\n📊 振盪分析結果：');
    console.log(`  最大誤差: ${maxError.toFixed(3)}%`);
    console.log(`  平均誤差: ${avgError.toFixed(3)}%`);
    console.log(`  檢測到 ${peaks.length} 個振盪峰值:`);
    
    peaks.forEach((peak, i) => {
        const error = Math.abs(peak.voltage - peak.theory) / Vstep * 100;
        console.log(`    峰值 ${i+1}: t=${peak.time.toFixed(1)}µs, V=${peak.voltage.toFixed(4)}V (理論=${peak.theory.toFixed(4)}V), 誤差=${error.toFixed(3)}%`);
    });
    
    if (peaks.length >= 2) {
        const period_measured = (peaks[1].time - peaks[0].time) * 2; // 相鄰峰值間隔的2倍是週期
        const period_theory = 1000000 / fd; // 理論週期 (µs)
        const period_error = Math.abs(period_measured - period_theory) / period_theory * 100;
        
        console.log(`\n🎯 振盪頻率驗證:`);
        console.log(`  測量週期: ${period_measured.toFixed(1)}µs`);
        console.log(`  理論週期: ${period_theory.toFixed(1)}µs`);
        console.log(`  頻率誤差: ${period_error.toFixed(2)}%`);
    }
    
    // 評估結果
    if (maxError < 2) {
        console.log(`\n🎉 欠阻尼RLC電路測試成功！求解器正確模擬了振盪行為！`);
    } else if (maxError < 5) {
        console.log(`\n✅ 欠阻尼RLC電路測試通過，性能良好！`);
    } else {
        console.log(`\n⚠️ 欠阻尼RLC電路需要進一步優化`);
    }
    
    return results;
}

// 運行測試
testUnderdampedRLC()
    .catch(error => {
        console.error('❌ 欠阻尼RLC測試失敗:', error.message);
        console.error(error.stack);
    });