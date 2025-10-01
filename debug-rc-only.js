/**
 * 專門調試RC電路的程序
 * 分析為什麼電容電壓線性增長而不是指數增長
 */

import { 
    ExplicitStateSolver, 
    VoltageSource, 
    Resistor, 
    Capacitor 
} from './lib-dist/AkingSPICE.es.js';

console.log('🔬 RC 電路專項調試');
console.log('=' .repeat(50));

// 創建簡單RC電路：5V → 1kΩ → 1μF
const components = [
    new VoltageSource('V1', ['vin', 'gnd'], 5.0),
    new Resistor('R1', ['vin', 'vout'], 1000),      // 1kΩ
    new Capacitor('C1', ['vout', 'gnd'], 1e-6, { ic: 0 })  // 1μF
];

console.log('📋 電路元件:');
components.forEach(comp => console.log(`  ${comp.toString()}`));

// 理論分析
const R = 1000, C = 1e-6, V0 = 5.0;
const tau = R * C;  // 時間常數
console.log(`\n📐 理論計算:`);
console.log(`  τ = RC = ${tau*1000}ms`);
console.log(`  Vc(∞) = ${V0}V`);

// 創建求解器
const solver = new ExplicitStateSolver();
solver.setDebug(true);

try {
    console.log(`\n🔄 初始化求解器...`);
    const startTime = performance.now();
    await solver.initialize(components, 1e-5); // 10μs 時間步
    console.log(`✅ 初始化完成，耗時: ${(performance.now() - startTime).toFixed(1)}ms`);

    console.log(`\n🔍 詳細分析前5個時間步:`);
    
    for (let i = 0; i < 10; i++) {
        const result = await solver.step();
        const t = result.time * 1000; // 轉為ms
        const Vc = result.nodeVoltages.vout;
        
        // 理論值
        const Vc_theory = V0 * (1 - Math.exp(-result.time / tau));
        const error = Math.abs(Vc - Vc_theory);
        const errorPercent = (error / V0) * 100;
        
        console.log(`步驟 ${i}: t=${t.toFixed(3)}ms, Vc=${Vc.toFixed(6)}V, 理論=${Vc_theory.toFixed(6)}V, 誤差=${errorPercent.toFixed(2)}%`);
        
        // 如果誤差太大，停止
        if (errorPercent > 50) {
            console.log(`⚠️ 誤差過大，停止分析`);
            break;
        }
    }
    
    console.log(`\n🧪 長期行為測試 (100步):`);
    for (let i = 0; i < 90; i++) {
        await solver.step(); // 執行剩餘的步驟
    }
    
    const finalResult = await solver.step();
    const finalTime = finalResult.time * 1000;
    const finalVc = finalResult.nodeVoltages.vout;
    const finalTheory = V0 * (1 - Math.exp(-finalResult.time / tau));
    const finalError = Math.abs(finalVc - finalTheory);
    const finalErrorPercent = (finalError / V0) * 100;
    
    console.log(`最終: t=${finalTime.toFixed(3)}ms, Vc=${finalVc.toFixed(6)}V, 理論=${finalTheory.toFixed(6)}V, 誤差=${finalErrorPercent.toFixed(2)}%`);
    
    if (finalErrorPercent < 5) {
        console.log(`✅ RC電路行為正確！`);
    } else {
        console.log(`❌ RC電路行為異常！`);
    }

} catch (error) {
    console.error('❌ 測試失敗:', error.message);
    console.error(error.stack);
}