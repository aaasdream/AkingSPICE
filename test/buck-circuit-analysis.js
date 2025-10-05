/**
 * Buck 轉換器電路分析 - 檢查電路設置是否合理
 */

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__dirname);

import { NetlistParser } from '../src/parser/netlist.js';
import { MCPTransientAnalysis } from '../src/analysis/transient_mcp.js';

console.log('🔍 Buck 轉換器電路分析');
console.log('========================================');

/**
 * 分析 Buck 轉換器的 DC 工作點
 */
async function analyzeDCOperatingPoint() {
    console.log('\n📊 分析 DC 工作點');
    
    // Buck converter netlist
    const netlist = `
    Buck Converter with Gear 2 BDF
    
    V1 vin 0 24
    L1 vin vout 150u
    R1 vout 0 2
    
    .ic L1 2.4
    .tran 1u 50u
    `;

    try {
        const parser = new NetlistParser();
        const circuit = parser.parse(netlist);
        
        console.log('電路元件:');
        circuit.components.forEach(comp => {
            console.log(`  ${comp.name}: ${comp.type} ${comp.nodes.join(' ')} ${comp.rawValue || ''}`);
        });
        
        console.log('\n分析指令:');
        circuit.analyses.forEach(analysis => {
            console.log(`  ${analysis.type}: ${JSON.stringify(analysis.params)}`);
        });
        
        console.log('\n初始條件:');
        Object.entries(circuit.initialConditions).forEach(([name, value]) => {
            console.log(`  ${name}: ${value}A`);
        });
        
        // 理論分析
        console.log('\n🧮 理論分析:');
        const V_in = 24; // V
        const L = 150e-6; // H
        const R = 2; // Ω
        const I_dc = V_in / R; // DC current without inductor
        
        console.log(`輸入電壓: ${V_in}V`);
        console.log(`負載電阻: ${R}Ω`);
        console.log(`電感值: ${L*1e6}µH`);
        console.log(`理論 DC 電流: ${I_dc}A`);
        console.log(`初始電流設定: 2.4A`);
        
        // 時間常數
        const tau = L / R;
        console.log(`時間常數 τ = L/R = ${tau*1e6:.1f}µs`);
        
        // 電流上升時間 (0 到 63% 的最終值)
        const rise_time = tau;
        console.log(`電流上升時間: ${rise_time*1e6:.1f}µs`);
        
        return circuit;
        
    } catch (error) {
        console.error('電路分析失敗:', error);
        return null;
    }
}

/**
 * 檢查數值參數是否合理
 */
function checkNumericalParameters() {
    console.log('\n🔧 檢查數值參數');
    
    const L = 150e-6; // H
    const R = 2; // Ω
    const h = 1e-6; // s
    const V_in = 24; // V
    
    // BDF2 係數計算
    const alpha = 1.5; // equal step BDF2
    const R_eq = R + L * alpha / h;
    
    console.log(`時間步長: ${h*1e6}µs`);
    console.log(`電感: ${L*1e6}µH`);
    console.log(`電阻: ${R}Ω`);
    console.log(`等效電阻: ${R_eq.toFixed(1)}Ω`);
    
    // 檢查條件數
    const condition_ratio = R_eq / R;
    console.log(`等效電阻/原電阻比: ${condition_ratio.toFixed(1)}`);
    
    if (condition_ratio > 1000) {
        console.log('⚠️ 等效電阻遠大於原電阻，可能導致數值剛性');
    } else {
        console.log('✅ 等效電阻比值合理');
    }
    
    // 檢查時間步長相對於時間常數
    const tau = L / R;
    const step_ratio = h / tau;
    console.log(`時間步長/時間常數比: ${step_ratio.toFixed(4)}`);
    
    if (step_ratio > 0.1) {
        console.log('⚠️ 時間步長較大，可能影響精度');
    } else {
        console.log('✅ 時間步長相對合理');
    }
    
    // 檢查電感電壓
    const max_di_dt = V_in / L; // 最大 di/dt 當 vL = Vin
    const max_di_per_step = max_di_dt * h;
    console.log(`最大 di/dt: ${max_di_dt/1e6:.2f} A/µs`);
    console.log(`每步最大電流變化: ${max_di_per_step:.4f}A`);
}

/**
 * 模擬簡化的電路響應
 */
function simulateSimplifiedResponse() {
    console.log('\n⚡ 模擬簡化的電路響應');
    
    const L = 150e-6;
    const R = 2;
    const V_in = 24;
    const h = 1e-6;
    const I_ic = 2.4;
    
    // 解析解: I(t) = V/R * (1 - exp(-t/τ)) + I_ic * exp(-t/τ)
    // 其中 τ = L/R
    const tau = L / R;
    
    console.log('時間 | 解析解 | 數值解 (BE) | 數值解 (BDF2) | 誤差');
    console.log('-----|--------|-------------|---------------|------');
    
    let i_be = I_ic;      // Backward Euler
    let i_bdf2_nm1 = I_ic; // BDF2 history
    let i_bdf2 = I_ic;     // BDF2 current
    
    for (let step = 0; step < 10; step++) {
        const t = step * h;
        
        // 解析解
        const i_exact = (V_in/R) * (1 - Math.exp(-t/tau)) + I_ic * Math.exp(-t/tau);
        
        // Backward Euler: (L/h + R)*I_n = L*I_{n-1}/h + V
        const i_be_new = (L*i_be/h + V_in) / (L/h + R);
        i_be = i_be_new;
        
        // BDF2: (1.5*L/h + R)*I_n = 2*L*I_{n-1}/h - 0.5*L*I_{n-2}/h + V
        let i_bdf2_new;
        if (step === 0) {
            i_bdf2_new = i_be_new; // First step use BE
        } else {
            i_bdf2_new = (2*L*i_bdf2/h - 0.5*L*i_bdf2_nm1/h + V_in) / (1.5*L/h + R);
        }
        
        // Update BDF2 history
        i_bdf2_nm1 = i_bdf2;
        i_bdf2 = i_bdf2_new;
        
        const error_be = Math.abs(i_be - i_exact);
        const error_bdf2 = Math.abs(i_bdf2 - i_exact);
        
        console.log(`${(t*1e6).toFixed(1).padStart(4)} | ${i_exact.toFixed(4)} | ${i_be.toFixed(4).padStart(11)} | ${i_bdf2.toFixed(4).padStart(13)} | BE:${error_be.toFixed(6)} BDF2:${error_bdf2.toFixed(6)}`);
        
        // 檢查穩定性
        if (i_be > V_in/R * 2 || i_bdf2 > V_in/R * 2) {
            console.log(`⚠️ 數值不穩定在第 ${step} 步`);
            break;
        }
    }
}

// 執行分析
analyzeDCOperatingPoint();
checkNumericalParameters();
simulateSimplifiedResponse();