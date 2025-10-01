/**
 * 測試修正後的顯式狀態求解器
 * 驗證新的KCL方法是否正確計算電容電流
 */

import { ExplicitStateSolver } from '../src/core/explicit-state-solver.js';
import { VoltageSource } from '../src/components/sources.js';
import { Resistor } from '../src/components/resistor.js';
import { Capacitor } from '../src/components/capacitor.js';
import { Inductor } from '../src/components/inductor.js';

/**
 * 測試簡單RC電路：V1(12V) -> R1(1kΩ) -> C1(1µF) -> GND
 */
async function testSimpleRC() {
    console.log('\n=== 測試修正後的RC充電電路 ===');
    
    // 建立電路：12V -> 1kΩ -> 1µF -> GND
    const components = [
        new VoltageSource('V1', ['vin', 'gnd'], 12.0),  // 12V電壓源
        new Resistor('R1', ['vin', 'n1'], 1000),         // 1kΩ電阻
        new Capacitor('C1', ['n1', 'gnd'], 1e-6, { ic: 0 }) // 1µF電容，初始電壓0V
    ];
    
    // 初始化求解器
    const solver = new ExplicitStateSolver();
    await solver.initialize(components, 1e-6, { debug: true });  // 1µs時間步長
    
    console.log('\n初始化完成，開始仿真...');
    
    // 模擬前幾個時間步
    const results = [];
    for (let i = 0; i < 10; i++) {
        const result = solver.step();
        results.push(result);
        
        const time = result.time * 1e6; // 轉換為微秒
        const vcap = result.stateVariables.get('C1') || 0;
        const vn1 = result.nodeVoltages.get('n1') || 0;
        
        console.log(`t=${time.toFixed(1)}µs: Vc=${vcap.toFixed(6)}V, Vn1=${vn1.toFixed(6)}V`);
    }
    
    // 驗證理論值
    console.log('\n=== 理論驗證 ===');
    const R = 1000; // 1kΩ  
    const C = 1e-6; // 1µF
    const tau = R * C; // 時間常數 = 1ms = 1000µs
    const Vin = 12; // 12V
    
    console.log(`時間常數 τ = RC = ${tau * 1e6}µs`);
    
    for (let i = 0; i < results.length; i++) {
        const t = results[i].time;
        const vcap_measured = results[i].stateVariables.get('C1') || 0;
        
        // 理論值：Vc(t) = Vin * (1 - exp(-t/τ))
        const vcap_theory = Vin * (1 - Math.exp(-t / tau));
        const error = Math.abs(vcap_measured - vcap_theory);
        const error_percent = (error / Vin) * 100;
        
        console.log(`t=${(t*1e6).toFixed(1)}µs: 測量=${vcap_measured.toFixed(6)}V, 理論=${vcap_theory.toFixed(6)}V, 誤差=${error_percent.toFixed(2)}%`);
    }
    
    // 清理
    solver.destroy();
    return results;
}

/**
 * 測試RLC電路：V1(12V) -> R1(100Ω) -> L1(1mH) -> C1(10µF) -> GND
 */
async function testRLC() {
    console.log('\n=== 測試RLC電路 ===');
    
    const components = [
        new VoltageSource('V1', ['vin', 'gnd'], 12.0),
        new Resistor('R1', ['vin', 'n1'], 100),           // 100Ω
        new Inductor('L1', ['n1', 'n2'], 1e-3),          // 1mH 
        new Capacitor('C1', ['n2', 'gnd'], 10e-6, { ic: 0 }) // 10µF
    ];
    
    const solver = new ExplicitStateSolver();
    await solver.initialize(components, 0.1e-6, { debug: true }); // 0.1µs時間步長（更小步長）
    
    console.log('RLC電路初始化完成，運行10個時間步...');
    
    for (let i = 0; i < 10; i++) {
        const result = solver.step();
        const time = result.time * 1e6;
        const vcap = result.stateVariables.get('C1') || 0;
        const il = result.stateVariables.get('L1') || 0;
        
        console.log(`t=${time.toFixed(2)}µs: Vc=${vcap.toFixed(4)}V, Il=${il.toFixed(6)}A`);
    }
    
    solver.destroy();
}

/**
 * 主測試函數
 */
async function runTests() {
    try {
        console.log('🧪 開始測試修正後的顯式狀態求解器...');
        
        // 測試RC電路
        await testSimpleRC();
        
        // 測試RLC電路（需要確保Inductor有updateState方法）
        // await testRLC();
        
        console.log('\n✅ 所有測試完成！');
        
    } catch (error) {
        console.error('❌ 測試失敗:', error);
        console.error(error.stack);
    }
}

// 運行測試
if (import.meta.url === new URL(process.argv[1], 'file:').href) {
    runTests();
}

// 也可以直接運行（如果作為模組導入）
runTests();

export { testSimpleRC, testRLC };