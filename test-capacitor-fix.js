/**
 * 簡單直接的 RLC 諧振測試
 * 專注於驗證電容器符號修正的效果
 */

import { AkingSPICE, Resistor, Capacitor, Inductor, VoltageSource } from './src/index.js';

console.log('=== 電容器符號修正效果驗證 ===\n');

// 創建簡單的串聯RLC電路
const simulation = new AkingSPICE();

// LLC參數
const L = 25e-6;     // 25μH
const C = 207e-9;    // 207nF  
const R = 10;        // 10Ω

// 理論計算
const f_res = 1 / (2 * Math.PI * Math.sqrt(L * C));
const Z0 = Math.sqrt(L / C);
const Q = Z0 / R;

console.log('理論參數:');
console.log(`  L = ${L*1e6}μH`);
console.log(`  C = ${C*1e9}nF`); 
console.log(`  R = ${R}Ω`);
console.log(`  諧振頻率 f_res = ${(f_res/1000).toFixed(1)}kHz`);
console.log(`  特性阻抗 Z0 = ${Z0.toFixed(1)}Ω`);
console.log(`  品質因子 Q = ${Q.toFixed(2)}`);

// 創建電路：V_in - L - C - R - GND
const R1 = new Resistor('R1', ['n1', 'n2'], R);
const L1 = new Inductor('L1', ['vin', 'n1'], L);
const C1 = new Capacitor('C1', ['n1', 'n2'], C);
const V_in = new VoltageSource('V_in', ['vin', '0'], 10, { frequency: f_res }); // 10V @ f_res

// 創建 netlist 字符串 - 串聯 RLC 電路
const netlist = `
* 串聯RLC諧振電路測試
V_in vin 0 SIN(0 10 ${f_res} 0 0)
L1 vin n1 ${L}
C1 n1 n2 ${C}
R1 n2 0 ${R}
.TRAN ${(1/f_res/50)} ${(5/f_res)}
.END
`;

console.log('\n載入netlist...');
const success = simulation.loadNetlist(netlist);
if (!success) {
    throw new Error('Failed to load netlist');
}

console.log('\n=== 在諧振頻率進行測試 ===');

async function runTest() {
try {
    // 進行暫態分析
    const period = 1 / f_res;
    const timeStep = period / 50;  // 每週期50個點
    const duration = 5 * period;   // 5個週期讓其穩定
    
    console.log(`時間步長: ${(timeStep * 1e9).toFixed(1)}ns`);
    console.log(`分析時間: ${(duration * 1e6).toFixed(1)}μs`);
    
    const results = await simulation.runSteppedSimulation(null, {
        stopTime: duration,
        timeStep: timeStep
    });
    
    if (results && results.steps && results.steps.length > 0) {
        // 取最後一個週期的數據
        const steps = results.steps;
        const startIdx = Math.floor(steps.length * 4/5); // 最後20%
        const steadyResults = steps.slice(startIdx);
        
        // 計算輸入和電阻電壓的RMS值
        let V_in_rms = 0;
        let V_R_rms = 0;
        
        for (let i = 0; i < steadyResults.length; i++) {
            const result = steadyResults[i];
            const v_in = result.voltages.get('vin') || 0;
            const v_R = result.voltages.get('n2') || 0;  // 電阻上的電壓
            
            V_in_rms += v_in * v_in;
            V_R_rms += v_R * v_R;
        }
        
        V_in_rms = Math.sqrt(V_in_rms / steadyResults.length);
        V_R_rms = Math.sqrt(V_R_rms / steadyResults.length);
        
        const gain_actual = V_R_rms / V_in_rms;
        
        // 理論增益計算
        // 在諧振頻率，XL = XC，所以總阻抗 = R
        // 電阻上的電壓 = V_in * R / R = V_in
        // 所以理論增益 = 1.0
        const gain_theory = 1.0;
        
        const error = Math.abs(gain_actual - gain_theory) / gain_theory * 100;
        
        console.log('\n結果:');
        console.log(`  輸入電壓RMS: ${V_in_rms.toFixed(3)}V`);
        console.log(`  電阻電壓RMS: ${V_R_rms.toFixed(3)}V`);
        console.log(`  實際增益: ${gain_actual.toFixed(4)}`);
        console.log(`  理論增益: ${gain_theory.toFixed(4)}`);
        console.log(`  誤差: ${error.toFixed(2)}%`);
        
        if (error < 5) {
            console.log('\n🎉 SUCCESS: 電容器符號修正成功！誤差 < 5%');
        } else if (error < 20) {
            console.log('\n✅ GOOD: 電容器符號修正有效，誤差顯著降低');
        } else {
            console.log('\n⚠️  WARNING: 仍有較大誤差，可能還有其他問題');
        }
        
    } else {
        console.log('❌ ERROR: 暫態分析失敗');
    }
    
} catch (error) {
    console.log(`❌ ERROR: ${error.message}`);
}
}

runTest();