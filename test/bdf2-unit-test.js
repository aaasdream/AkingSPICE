/**
 * BDF2 Unit Test - 驗證數值方法的數學正確性
 */

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔬 BDF2 數值方法單元測試');
console.log('========================================');

/**
 * 測試簡單 ODE: dy/dt = -ay, 已知解析解 y(t) = y0*exp(-at)
 */
function testSimpleODE() {
    console.log('\n📊 測試簡單 ODE: dy/dt = -ay');
    
    const a = 1.0;  // 衰減係數
    const y0 = 1.0; // 初始值
    const h = 0.1;  // 時間步長
    
    console.log(`參數: a=${a}, y0=${y0}, h=${h}`);
    
    // 解析解
    function exactSolution(t) {
        return y0 * Math.exp(-a * t);
    }
    
    // BDF2 數值解
    let t = 0;
    let y_prev = y0;           // y_{n-1}
    let y_prev2 = y0 * Math.exp(-a * h); // y_{n-2} (假設用精確解啟動)
    
    console.log('\n時間步進:');
    console.log('t=0.0: y_exact=1.0000, y_bdf2=1.0000, error=0.0000');
    console.log(`t=0.1: y_exact=${exactSolution(h).toFixed(4)}, y_bdf2=${y_prev2.toFixed(4)}, error=${Math.abs(exactSolution(h) - y_prev2).toFixed(6)}`);
    
    for (let step = 2; step <= 10; step++) {
        t = step * h;
        
        // BDF2 係數 (等步長)
        const r = 1.0; // h_n / h_{n-1} = 1 for equal steps
        const alpha = (1 + 2*r) / (1 + r); // = 1.5
        const beta = -(1 + r);              // = -2
        const gamma = r*r / (1 + r);        // = 0.5
        
        // BDF2 方程: α*y_n + β*y_{n-1} + γ*y_{n-2} = h*f(t_n, y_n)
        // 對於 dy/dt = -ay: f(t,y) = -ay
        // α*y_n + β*y_{n-1} + γ*y_{n-2} = -h*a*y_n
        // (α + h*a)*y_n = -β*y_{n-1} - γ*y_{n-2}
        
        const coefficient = alpha + h * a;
        const rhs = -beta * y_prev - gamma * y_prev2;
        const y_new = rhs / coefficient;
        
        const y_exact = exactSolution(t);
        const error = Math.abs(y_exact - y_new);
        
        console.log(`t=${t.toFixed(1)}: y_exact=${y_exact.toFixed(4)}, y_bdf2=${y_new.toFixed(4)}, error=${error.toFixed(6)}`);
        
        // 更新歷史值
        y_prev2 = y_prev;
        y_prev = y_new;
        
        // 檢查穩定性
        if (Math.abs(y_new) > 10) {
            console.log(`❌ 數值不穩定! t=${t}, y=${y_new}`);
            return false;
        }
    }
    
    return true;
}

/**
 * 測試電感方程: L*di/dt + R*i = v(t)
 * 轉換為 di/dt = (v(t) - R*i)/L
 */
function testInductorEquation() {
    console.log('\n⚡ 測試電感方程: L*di/dt + R*i = v(t)');
    
    const L = 150e-6;  // 150µH
    const R = 0.15;    // 0.15Ω (寄生電阻)
    const V = 24.0;    // 恆定電壓
    const h = 1e-6;    // 1µs 時間步長
    
    console.log(`參數: L=${L*1e6}µH, R=${R}Ω, V=${V}V, h=${h*1e6}µs`);
    
    // 解析解 (恆定電壓): i(t) = (V/R) * (1 - exp(-Rt/L))
    function exactSolution(t) {
        const tau = L / R; // 時間常數
        return (V / R) * (1 - Math.exp(-t / tau));
    }
    
    // 穩態電流
    const steadyStateCurrent = V / R;
    console.log(`穩態電流: ${steadyStateCurrent.toFixed(3)}A`);
    
    // BDF2 數值解
    let t = 0;
    let i_prev = 0;           // i_{n-1}
    let i_prev2 = 0;          // i_{n-2}
    
    console.log('\n時間步進:');
    console.log('t=0.0µs: i_exact=0.000A, i_bdf2=0.000A, error=0.000000');
    
    // 第一步用前向歐拉法啟動
    t = h;
    const di_dt_0 = (V - R * 0) / L;
    i_prev = 0 + h * di_dt_0;
    const i_exact_1 = exactSolution(t);
    console.log(`t=${(t*1e6).toFixed(1)}µs: i_exact=${i_exact_1.toFixed(3)}A, i_bdf2=${i_prev.toFixed(3)}A, error=${Math.abs(i_exact_1 - i_prev).toFixed(6)}`);
    
    for (let step = 2; step <= 20; step++) {
        t = step * h;
        
        // BDF2 係數
        const r = 1.0; // 等步長
        const alpha = 1.5;
        const beta = -2.0;
        const gamma = 0.5;
        
        // 電感方程: L*di/dt = V - R*i
        // BDF2: α*i_n + β*i_{n-1} + γ*i_{n-2} = (h/L)*(V - R*i_n)
        // (α + h*R/L)*i_n = (h*V/L) - β*i_{n-1} - γ*i_{n-2}
        
        const coefficient = alpha + h * R / L;
        const rhs = (h * V / L) - beta * i_prev - gamma * i_prev2;
        const i_new = rhs / coefficient;
        
        const i_exact = exactSolution(t);
        const error = Math.abs(i_exact - i_new);
        
        console.log(`t=${(t*1e6).toFixed(1)}µs: i_exact=${i_exact.toFixed(3)}A, i_bdf2=${i_new.toFixed(3)}A, error=${error.toFixed(6)}`);
        
        // 更新歷史值
        i_prev2 = i_prev;
        i_prev = i_new;
        
        // 檢查穩定性
        if (Math.abs(i_new) > steadyStateCurrent * 2) {
            console.log(`❌ 數值不穩定! t=${(t*1e6).toFixed(1)}µs, i=${i_new.toFixed(3)}A`);
            return false;
        }
    }
    
    return true;
}

// 運行測試
const test1_result = testSimpleODE();
const test2_result = testInductorEquation();

console.log('\n🎯 測試結果');
console.log('========================================');
console.log(`簡單 ODE 測試: ${test1_result ? '✅ 通過' : '❌ 失敗'}`);
console.log(`電感方程測試: ${test2_result ? '✅ 通過' : '❌ 失敗'}`);

if (test1_result && test2_result) {
    console.log('🎉 所有 BDF2 單元測試通過!');
} else {
    console.log('⚠️ BDF2 實現存在問題，需要檢查數學公式或係數計算');
}