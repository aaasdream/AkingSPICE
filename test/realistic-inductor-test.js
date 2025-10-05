/**
 * 物理真實的電感電流變化測試
 * 檢查合理的 di/dt 值下的 BDF2 伴隨模型
 */

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔬 物理真實的電感電流變化測試');
console.log('========================================');

/**
 * 計算給定電路參數下的合理電流變化率
 */
function calculateReasonableDiDt() {
    const L = 150e-6;  // 150µH
    const V_in = 24;   // 24V 輸入電壓
    const V_out = 12;  // 12V 輸出電壓 (50% duty cycle)
    const R_load = 2;  // 2Ω 負載
    
    // Buck converter 的電感電壓在開關時刻
    // 開關導通: v_L = V_in - V_out = 24 - 12 = 12V
    // 開關關斷: v_L = -V_out = -12V
    
    // 電感電流變化率: di/dt = v_L / L
    const di_dt_on = (V_in - V_out) / L;   // 開關導通時
    const di_dt_off = -V_out / L;          // 開關關斷時
    
    console.log(`Buck 轉換器參數分析:`);
    console.log(`L = ${L*1e6}µH, V_in = ${V_in}V, V_out = ${V_out}V`);
    console.log(`開關導通時 di/dt = ${(di_dt_on/1e6).toFixed(2)} A/µs`);
    console.log(`開關關斷時 di/dt = ${(di_dt_off/1e6).toFixed(2)} A/µs`);
    
    return { di_dt_on, di_dt_off };
}

/**
 * 生成物理真實的電感電流序列
 */
function generateRealisticCurrentSequence() {
    const rates = calculateReasonableDiDt();
    const h = 1e-6; // 1µs 時間步長
    
    // 每步的電流變化 (基於真實的 di/dt)
    const di_on = rates.di_dt_on * h;   // 開關導通時每步電流增加
    const di_off = rates.di_dt_off * h; // 開關關斷時每步電流減少
    
    console.log(`\n每時間步電流變化:`);
    console.log(`導通時 Δi = ${di_on.toFixed(6)}A/步`);
    console.log(`關斷時 Δi = ${di_off.toFixed(6)}A/步`);
    
    // 生成一個開關週期的電流序列
    let current = 5.0; // 起始電流 5A
    const sequence = [current];
    
    // 模擬 10µs 導通 + 10µs 關斷
    for (let i = 0; i < 10; i++) {
        current += di_on;  // 導通階段
        sequence.push(current);
    }
    for (let i = 0; i < 10; i++) {
        current += di_off; // 關斷階段
        sequence.push(current);
    }
    
    return sequence;
}

/**
 * 測試物理真實的電感伴隨模型
 */
async function testRealisticInductorModel() {
    // Import the inductor class
    const { Inductor } = await import('../src/components/inductor.js');
    
    console.log('\n⚡ 測試物理真實的電感伴隨模型');
    
    const inductor = new Inductor('L1', ['n1', 'n2'], '150u');
    inductor.resistance = 0.15;
    
    const L = 150e-6;
    const h = 1e-6;
    
    const currentSequence = generateRealisticCurrentSequence();
    
    console.log('\n物理真實電流序列測試:');
    console.log('step |   i_n    | i_nm1  | i_nm2  |   Req   |    Veq    | 物理意義');
    console.log('-----|----------|--------|--------|---------|-----------|----------');
    
    for (let step = 0; step < Math.min(currentSequence.length, 15); step++) {
        const current = currentSequence[step];
        
        if (step > 0) {
            const prevCurrent = currentSequence[step - 1];
            inductor.previousValues.set('current', prevCurrent);
            if (step > 1) {
                const prevPrevCurrent = currentSequence[step - 2];
                inductor.previousValues.set('current_prev', prevPrevCurrent);
            }
        }
        
        inductor.updateCompanionModel(h, step + 1);
        
        const i_nm1 = inductor.previousValues.get('current') || 0;
        const i_nm2 = inductor.previousValues.get('current_prev') || 0;
        
        // 判斷物理意義
        let phase = step < 10 ? '導通' : '關斷';
        
        console.log(`${step.toString().padStart(4)} | ${current.toFixed(6)} | ${i_nm1.toFixed(4)} | ${i_nm2.toFixed(4)} | ${inductor.equivalentResistance.toFixed(1).padStart(7)} | ${inductor.equivalentVoltageSource.toFixed(3).padStart(9)} | ${phase}`);
        
        // 檢查是否合理 (Veq 應該在幾伏特範圍內)
        if (Math.abs(inductor.equivalentVoltageSource) > 50) {
            console.log(`⚠️ Veq 異常大: ${inductor.equivalentVoltageSource}V`);
        }
    }
    
    // 計算理論上的最大 Veq
    console.log('\n📊 理論分析:');
    const max_di = Math.max(...currentSequence.map((curr, i) => 
        i > 0 ? Math.abs(curr - currentSequence[i-1]) : 0
    ));
    const theoretical_max_veq = L * 2 * max_di / h; // 近似值
    console.log(`最大電流變化: ${max_di.toFixed(6)}A/步`);
    console.log(`理論最大 |Veq|: ${theoretical_max_veq.toFixed(3)}V`);
}

// 運行測試
calculateReasonableDiDt();
testRealisticInductorModel().then(() => {
    console.log('\n🎯 物理測試完成');
});