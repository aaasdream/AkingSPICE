/**
 * 簡化的RLC測試
 */

import { ExplicitStateSolver } from '../src/core/explicit-state-solver.js';
import { VoltageSource } from '../src/components/sources.js';
import { Resistor } from '../src/components/resistor.js';
import { Capacitor } from '../src/components/capacitor.js';
import { Inductor } from '../src/components/inductor.js';

async function testSimpleRLC() {
    console.log('\n=== 測試簡單RLC電路 ===');
    
    // 欠阻尼RLC電路: R=50Ω, L=1mH, C=10µF
    const components = [
        new VoltageSource('V1', ['vin', 'gnd'], 12.0),
        new Resistor('R1', ['vin', 'n1'], 50),           // 50Ω
        new Inductor('L1', ['n1', 'n2'], 1e-3, { ic: 0 }), // 1mH，初始電流0A
        new Capacitor('C1', ['n2', 'gnd'], 10e-6, { ic: 0 }) // 10µF，初始電壓0V
    ];
    
    // 計算理論參數
    const R = 50, L = 1e-3, C = 10e-6;
    const omega0 = 1 / Math.sqrt(L * C);  // 自然頻率
    const zeta = R / 2 * Math.sqrt(C / L); // 阻尼比
    const f0 = omega0 / (2 * Math.PI);
    
    console.log(`理論參數：f0=${f0.toFixed(0)}Hz, ζ=${zeta.toFixed(3)}, 阻尼類型=${zeta < 1 ? '欠阻尼' : zeta > 1 ? '過阻尼' : '臨界阻尼'}`);
    
    const solver = new ExplicitStateSolver();
    await solver.initialize(components, 1e-6, { debug: false }); // 1µs時間步長
    
    console.log('開始RLC仿真...');
    
    for (let i = 0; i < 20; i++) {
        const result = solver.step();
        const time = result.time * 1e6; // 轉換為微秒
        const vcap = result.stateVariables.get('C1') || 0;
        const il = result.stateVariables.get('L1') || 0;
        
        console.log(`t=${time.toFixed(1)}µs: Vc=${vcap.toFixed(4)}V, Il=${il.toFixed(6)}A`);
    }
    
    solver.destroy();
}

// 運行測試
testSimpleRLC()
    .then(() => console.log('✅ RLC測試完成'))
    .catch(error => {
        console.error('❌ RLC測試失敗:', error.message);
        console.error(error.stack);
    });