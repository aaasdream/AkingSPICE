/**
 * 電感 BDF2 伴隨模型診斷測試
 * 檢查伴隨模型係數是否合理
 */

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import the inductor class
import { Inductor } from '../src/components/inductor.js';

console.log('🔍 電感 BDF2 伴隨模型診斷測試');
console.log('========================================');

function testInductorCompanionModel() {
    console.log('\n⚡ 測試電感伴隨模型係數');
    
    // 創建電感 (Buck converter parameters)
    const inductor = new Inductor('L1', ['n1', 'n2'], '150u');
    inductor.resistance = 0.15;     // 0.15Ω ESR
    
    const L = 150e-6;
    const R = 0.15;
    const h = 1e-6;  // 1µs time step
    
    console.log(`電感參數: L=${L*1e6}µH, R=${R}Ω, h=${h*1e6}µs`);
    
    // 模擬合理的電流值變化 (Buck converter typical current: 0-10A)
    const currentSequence = [0, 2, 4, 6, 8, 7, 5, 3, 1, 2, 4, 6, 8, 9, 8, 6];
    
    console.log('\n時間步進分析:');
    console.log('step | i_n | i_nm1 | i_nm2 |   Req   |   Veq   | α    | β    | γ');
    console.log('-----|-----|-------|-------|---------|---------|------|------|------');
    
    for (let step = 0; step < currentSequence.length; step++) {
        const current = currentSequence[step];
        
        // 更新電感的電流歷史
        if (step > 0) {
            const prevCurrent = currentSequence[step - 1];
            inductor.previousValues.set('current', prevCurrent);
            if (step > 1) {
                const prevPrevCurrent = currentSequence[step - 2];
                inductor.previousValues.set('current_prev', prevPrevCurrent);
            }
        }
        
        // 調用更新伴隨模型 (模擬 BDF2)
        inductor.updateCompanionModel(h, step + 1);
        
        const i_nm1 = inductor.previousValues.get('current') || 0;
        const i_nm2 = inductor.previousValues.get('current_prev') || 0;
        
        // 計算理論係數 (驗證用)
        let alpha, beta, gamma;
        if (step <= 0) {
            // Backward Euler
            alpha = 1.0;
            beta = -1.0;
            gamma = 0.0;
        } else {
            // BDF2 (equal step)
            const r = 1.0; // h_n/h_{n-1} = 1 for equal steps
            alpha = (1 + 2*r) / (1 + r);  // = 1.5
            beta = -(1 + r);               // = -2
            gamma = (r * r) / (1 + r);     // = 0.5
        }
        
        // 理論等效電阻和電壓源
        const expectedReq = R + L * alpha / h;
        const expectedVeq = L * (beta * i_nm1 + gamma * i_nm2) / h;
        
        console.log(`${step.toString().padStart(4)} | ${current.toFixed(1).padStart(3)} | ${i_nm1.toFixed(1).padStart(5)} | ${i_nm2.toFixed(1).padStart(5)} | ${inductor.equivalentResistance.toFixed(1).padStart(7)} | ${inductor.equivalentVoltageSource.toFixed(1).padStart(7)} | ${alpha.toFixed(2).padStart(4)} | ${beta.toFixed(2).padStart(4)} | ${gamma.toFixed(2).padStart(4)}`);
        
        // 檢查係數是否合理
        if (Math.abs(inductor.equivalentResistance - expectedReq) > 1e-10) {
            console.log(`❌ Req 不匹配! 預期=${expectedReq}, 實際=${inductor.equivalentResistance}`);
        }
        if (Math.abs(inductor.equivalentVoltageSource - expectedVeq) > 1e-10) {
            console.log(`❌ Veq 不匹配! 預期=${expectedVeq}, 實際=${inductor.equivalentVoltageSource}`);
        }
        
        // 檢查數值穩定性
        if (Math.abs(inductor.equivalentVoltageSource) > 1000) {
            console.log(`⚠️ Veq 值過大: ${inductor.equivalentVoltageSource}`);
        }
    }
}

/**
 * 測試伴隨模型在大電流時的行為
 */
function testLargeCurrentBehavior() {
    console.log('\n🚨 測試大電流下的伴隨模型行為');
    
    const inductor = new Inductor('L1', ['n1', 'n2'], '150u');
    inductor.resistance = 0.15;
    
    const h = 1e-6;
    
    // 模擬電流快速增長的情況 (模擬數值不穩定)
    const largeCurrens = [0, 1, 3, 7, 15, 30, 50, 75, 100];
    
    console.log('電流增長測試:');
    for (let i = 0; i < largeCurrens.length; i++) {
        const current = largeCurrens[i];
        
        if (i > 0) {
            inductor.previousValues.set('current', largeCurrens[i-1]);
            if (i > 1) {
                inductor.previousValues.set('current_prev', largeCurrens[i-2]);
            }
        }
        
        inductor.updateCompanionModel(h, i + 1);
        
        const ratio = Math.abs(inductor.equivalentVoltageSource / current);
        console.log(`i=${current.toString().padStart(3)}A: Req=${inductor.equivalentResistance.toFixed(1)}, Veq=${inductor.equivalentVoltageSource.toFixed(1)}, Veq/i=${ratio.toFixed(1)}`);
        
        if (ratio > 1000) {
            console.log(`⚠️ Veq/i 比值過大，可能導致數值不穩定`);
        }
    }
}

// 運行測試
testInductorCompanionModel();
testLargeCurrentBehavior();

console.log('\n🎯 診斷完成');
console.log('========================================');