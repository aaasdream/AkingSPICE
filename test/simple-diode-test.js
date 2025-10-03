#!/usr/bin/env node

/**
 * 簡化二極體測試 - 只有電壓源和二極體
 */

import { AkingSPICE } from '../src/index.js';
import { VoltageSource, Diode } from '../src/index.js';

console.log('🔬 簡化二極體測試\n');

async function testSimpleDiode() {
    const solver = new AkingSPICE();
    solver.setDebug(true);
    
    // 最簡單的二極體電路：電壓源 - 二極體 - 接地
    const components = [
        new VoltageSource('V1', ['anode', 'gnd'], 5),
        new Diode('D1', ['anode', 'cathode'])
    ];
    
    console.log('簡化電路:');
    components.forEach(comp => {
        console.log(`  ${comp.toString()}`);
        solver.addComponent(comp);
    });
    
    console.log('\n開始分析...');
    const result = await solver.runDCAnalysis();
    
    console.log('\n結果:');
    console.log(`  收斂: ${result.converged}`);
    
    if (result.converged) {
        console.log('\n節點電壓:');
        for (const [node, voltage] of result.nodeVoltages) {
            console.log(`  ${node}: ${voltage.toFixed(6)}V`);
        }
        
        const v_anode = result.nodeVoltages.get('anode') || 0;
        const v_cathode = result.nodeVoltages.get('cathode') || 0;
        const v_diode = v_anode - v_cathode;
        
        console.log(`\n二極體電壓: ${v_diode.toFixed(6)}V`);
        
        // 檢查二極體
        const diode = components.find(c => c.name === 'D1');
        console.log(`二極體導通: ${diode.isForwardBiased}`);
        console.log(`二極體電流: ${diode.current?.toFixed(6) || 'N/A'}A`);
    }
}

await testSimpleDiode();