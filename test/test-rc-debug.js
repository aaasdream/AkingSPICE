import { ExplicitStateSolver } from '../src/core/explicit-state-solver.js';
import { VoltageSource } from '../src/components/sources.js';
import { Resistor } from '../src/components/resistor.js';
import { Capacitor } from '../src/components/capacitor.js';

async function debugRCCircuit() {
    console.log('🔍 RC電路調試測試');

    const components = [
        new VoltageSource('V1', ['in', 'gnd'], 'SINE(0 5 1000)'),
        new Resistor('R1', ['in', 'out'], 1000),
        new Capacitor('C1', ['out', 'gnd'], 100e-6, { ic: 0 })
    ];

    console.log('\n📋 元件檢查:');
    for (const comp of components) {
        console.log(`  ${comp.name}: type=${comp.type}, isStateVariable=${comp.isStateVariable()}`);
        if (comp.isStateVariable()) {
            console.log(`    - 狀態變量類型: ${comp.getStateVariableType()}`);
            console.log(`    - 初始值: ${comp.getInitialStateValue()}`);
        }
    }

    console.log('\n🔧 初始化求解器...');
    const solver = new ExplicitStateSolver();
    const timeStep = 1e-5; // 10 μs

    await solver.initialize(components, timeStep, { debug: true });
    
    console.log('\n📊 電路預處理結果:');
    console.log(`  節點數: ${solver.nodeCount}`);
    console.log(`  狀態變量數: ${solver.stateCount}`);
    
    if (solver.circuitData && solver.circuitData.stateVariables) {
        console.log('  狀態變量詳情:');
        for (let i = 0; i < solver.circuitData.stateVariables.length; i++) {
            const sv = solver.circuitData.stateVariables[i];
            console.log(`    [${i}] ${sv.componentName}: ${sv.type}, 初始值=${sv.initialValue}`);
        }
    }

    // 運行一小段仿真
    console.log('\n⏱️ 運行短時間仿真...');
    const results = await solver.run(0, 0.001); // 1ms

    console.log(`\n📈 結果統計:`);
    console.log(`  時間步數: ${results.timeVector.length}`);
    console.log(`  狀態變量名: ${Array.from(results.stateVariables.keys()).join(', ')}`);
    
    for (const [name, values] of results.stateVariables) {
        console.log(`  ${name}: 初始=${values[0]?.toFixed(6)}, 最終=${values[values.length-1]?.toFixed(6)}`);
    }
}

debugRCCircuit().catch(console.error);