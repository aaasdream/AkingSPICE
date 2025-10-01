/**
 * 迷你二極體測試 - 只測試 1 個週期，專注於狀態更新
 */

import { Resistor } from '../src/components/resistor.js';
import { VoltageSource } from '../src/components/sources.js';
import { Diode } from '../src/components/diode.js';
import { ExplicitStateSolver } from '../src/core/explicit-state-solver.js';

async function testMiniDiode() {
    console.log('Mini Diode Test');
    
    const components = [
        new VoltageSource('V1', ['ac', 'gnd'], 'SINE(0 10 1000)'), // 1kHz, 10V峰值
        new Diode('D1', ['ac', 'dc']),
        new Resistor('R1', ['dc', 'gnd'], 1000)
    ];
    
    const solver = new ExplicitStateSolver();
    const period = 1 / 1000;
    const timeStep = period / 20; // 每週期20個採樣點
    
    await solver.initialize(components, timeStep, { debug: false });
    
    // 只模擬5個時間步驟
    for (let step = 0; step < 5; step++) {
        const result = solver.step({});
        
        const acVoltage = result.nodeVoltages.get('ac') || 0;
        const dcVoltage = result.nodeVoltages.get('dc') || 0;
        
        console.log(`Step ${step}: t=${solver.currentTime.toExponential(3)}s, AC=${acVoltage.toFixed(3)}V, DC=${dcVoltage.toFixed(3)}V`);
    }
}

testMiniDiode().catch(error => {
    console.error('Error:', error);
});