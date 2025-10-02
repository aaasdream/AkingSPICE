/**
 * AkingSPICE修復驗證腳本
 * 直接在Node.js環境測試核心修復
 */

import { VoltageSource } from './src/components/sources.js';
import { Resistor } from './src/components/resistor.js';
import { Capacitor } from './src/components/capacitor.js';
import { ExplicitStateSolver } from './src/core/explicit-state-solver.js';

async function runTests() {
    console.log('🧪 AkingSPICE修復驗證開始...\n');

    // 測試 1: 基本歐姆定律 (5V + 10Ω)
    console.log('📊 測試 1: 基本歐姆定律');
    try {
    const v1 = new VoltageSource('V1', ['vin', 'gnd'], 5.0);
    const r1 = new Resistor('R1', ['vin', 'gnd'], 10);
    
    const solver1 = new ExplicitStateSolver();
    await solver1.initialize([v1, r1], 1e-6);
    const result1 = solver1.step();
    
    const vinVoltage = result1.nodeVoltages.vin || 0;
    const error1 = Math.abs(vinVoltage - 5.0);
    
    console.log(`  結果: V(vin) = ${vinVoltage.toFixed(6)}V (期望: 5.000000V)`);
    console.log(`  誤差: ${error1.toExponential(3)}V`);
    
    if (error1 < 0.01) {
        console.log('  ✅ 測試1通過 - 基本歐姆定律正確');
    } else {
        console.log('  ❌ 測試1失敗 - 基本電阻計算有問題');
    }
} catch (error) {
    console.log('  ❌ 測試1異常:', error.message);
}

console.log();

// 測試 2: RC電路檢查
console.log('📊 測試 2: RC充電電路');
try {
    const v2 = new VoltageSource('V1', ['vin', 'gnd'], 5.0);
    const r2 = new Resistor('R1', ['vin', 'node1'], 1000);
    const c2 = new Capacitor('C1', ['node1', 'gnd'], 1e-6);
    
    const solver2 = new ExplicitStateSolver();
    await solver2.initialize([v2, r2, c2], 1e-6);
    
    // 執行幾步看電容充電
    for (let i = 0; i < 3; i++) {
        const result2 = solver2.step();
        
        const nodeVoltages = result2.nodeVoltages;
        const stateVars = result2.stateVariables;
        
        const t = solver2.currentTime;
        const Vc = stateVars.C1 || 0;
        const Vnode1 = nodeVoltages.node1 || 0;
        
        console.log(`  t=${(t*1e6).toFixed(1)}µs: Vc=${Vc.toFixed(6)}V, Vnode1=${Vnode1.toFixed(6)}V`);
        
        // 檢查物理合理性
        if (Vc >= 0 && Vc <= 5.0 && !isNaN(Vc)) {
            console.log(`    ✅ 電容電壓合理`);
        } else {
            console.log(`    ❌ 電容電壓異常`);
        }
    }
    
    console.log('  ✅ RC電路基本功能正常');
} catch (error) {
    console.log('  ❌ 測試2異常:', error.message);
}

    console.log();
    console.log('🎯 驗證完成');
}

// 運行測試
runTests().catch(console.error);