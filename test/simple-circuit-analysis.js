/**
 * Buck 轉換器電路分析 - 簡化版本
 */

console.log('Buck Converter Circuit Analysis');
console.log('========================================');

/**
 * 檢查數值參數是否合理
 */
function checkNumericalParameters() {
    console.log('\nChecking Numerical Parameters:');
    
    const L = 150e-6; // H
    const R = 2; // Ω
    const h = 1e-6; // s
    const V_in = 24; // V
    
    // BDF2 係數計算
    const alpha = 1.5; // equal step BDF2
    const R_eq = R + L * alpha / h;
    
    console.log(`Time step: ${(h*1e6).toFixed(1)}µs`);
    console.log(`Inductance: ${(L*1e6).toFixed(0)}µH`);
    console.log(`Resistance: ${R}Ω`);
    console.log(`Equivalent resistance: ${R_eq.toFixed(1)}Ω`);
    
    // 檢查條件數
    const condition_ratio = R_eq / R;
    console.log(`Req/R ratio: ${condition_ratio.toFixed(1)}`);
    
    if (condition_ratio > 1000) {
        console.log('⚠️ Equivalent resistance much larger than original - may cause stiffness');
    } else {
        console.log('✅ Equivalent resistance ratio reasonable');
    }
    
    // 檢查時間步長相對於時間常數
    const tau = L / R;
    const step_ratio = h / tau;
    console.log(`Time step/tau ratio: ${step_ratio.toFixed(4)}`);
    console.log(`Time constant tau = ${(tau*1e6).toFixed(1)}µs`);
    
    if (step_ratio > 0.1) {
        console.log('⚠️ Time step relatively large - may affect accuracy');
    } else {
        console.log('✅ Time step reasonable relative to time constant');
    }
    
    // 檢查電感電壓
    const max_di_dt = V_in / L; // 最大 di/dt 當 vL = Vin
    const max_di_per_step = max_di_dt * h;
    console.log(`Max di/dt: ${(max_di_dt/1e6).toFixed(2)} A/µs`);
    console.log(`Max current change per step: ${max_di_per_step.toFixed(4)}A`);
    
    return { L, R, h, V_in, tau, R_eq };
}

/**
 * 模擬簡化的電路響應
 */
function simulateSimplifiedResponse() {
    console.log('\nSimulating Simplified Circuit Response:');
    
    const L = 150e-6;
    const R = 2;
    const V_in = 24;
    const h = 1e-6;
    const I_ic = 2.4;
    
    // 解析解: I(t) = V/R * (1 - exp(-t/τ)) + I_ic * exp(-t/τ)
    const tau = L / R;
    const I_final = V_in / R; // Final steady-state current
    
    console.log(`Initial current: ${I_ic}A`);
    console.log(`Final steady-state current: ${I_final}A`);
    
    console.log('\nTime | Exact   | BE      | BDF2    | BE Error | BDF2 Error');
    console.log('-----|---------|---------|---------|----------|------------');
    
    let i_be = I_ic;      // Backward Euler
    let i_bdf2_nm1 = I_ic; // BDF2 history
    let i_bdf2 = I_ic;     // BDF2 current
    
    for (let step = 0; step < 15; step++) {
        const t = step * h;
        
        // 解析解
        const i_exact = I_final * (1 - Math.exp(-t/tau)) + I_ic * Math.exp(-t/tau);
        
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
        
        console.log(`${(t*1e6).toFixed(1).padStart(4)} | ${i_exact.toFixed(5)} | ${i_be.toFixed(5)} | ${i_bdf2.toFixed(5)} | ${error_be.toFixed(6).padStart(8)} | ${error_bdf2.toFixed(6).padStart(10)}`);
        
        // 檢查穩定性
        if (i_be > I_final * 2 || i_bdf2 > I_final * 2) {
            console.log(`⚠️ Numerical instability at step ${step}`);
            break;
        }
        
        if (i_be < 0 || i_bdf2 < 0) {
            console.log(`⚠️ Negative current at step ${step}`);
            break;
        }
    }
}

/**
 * 分析為什麼實際電路會發散
 */
function analyzeDivergenceCauses() {
    console.log('\nAnalyzing Potential Divergence Causes:');
    console.log('=====================================');
    
    console.log('\n1. Circuit Setup Issues:');
    console.log('   - Check if initial conditions are reasonable');
    console.log('   - Verify component values are realistic');
    console.log('   - Ensure proper grounding and connectivity');
    
    console.log('\n2. Numerical Method Issues:');
    console.log('   - BDF2 equivalent voltage sources may be too large');
    console.log('   - Time step may be too large for circuit dynamics');
    console.log('   - Matrix conditioning may be poor');
    
    console.log('\n3. MCP Solver Issues:');
    console.log('   - Nonlinear solver may not converge');
    console.log('   - Predictor may provide poor initial guess');
    console.log('   - Node damping may be insufficient');
    
    const params = checkNumericalParameters();
    
    // Specific checks for Buck converter
    console.log('\n4. Buck Converter Specific Checks:');
    const switching_period = 20e-6; // 20µs assumed
    const step_per_period = switching_period / params.h;
    console.log(`   - Switching period: ${(switching_period*1e6).toFixed(0)}µs`);
    console.log(`   - Steps per switching period: ${step_per_period.toFixed(0)}`);
    
    if (step_per_period < 10) {
        console.log('   ⚠️ Too few steps per switching period - may miss dynamics');
    } else {
        console.log('   ✅ Adequate time resolution for switching');
    }
    
    // Check BDF2 equivalent source magnitude
    const typical_current_change = 0.08; // A per step (from physical analysis)
    const beta = -2, gamma = 0.5;
    const typical_veq = params.L * (beta * 5 + gamma * 5) / params.h; // Assuming ~5A current
    console.log(`   - Typical BDF2 Veq magnitude: ${Math.abs(typical_veq).toFixed(0)}V`);
    
    if (Math.abs(typical_veq) > 100) {
        console.log('   ⚠️ BDF2 equivalent sources very large - likely cause of divergence!');
        console.log('   → Problem: Current values too large for this time step');
        console.log('   → Solution: Reduce time step OR use smaller initial currents');
    } else {
        console.log('   ✅ BDF2 equivalent sources reasonable');
    }
}

// Run analysis
checkNumericalParameters();
simulateSimplifiedResponse();
analyzeDivergenceCauses();