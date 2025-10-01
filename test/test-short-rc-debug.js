import { ExplicitStateSolver } from '../src/core/explicit-state-solver.js';
import { VoltageSource } from '../src/components/sources.js';
import { Resistor } from '../src/components/resistor.js';
import { Capacitor } from '../src/components/capacitor.js';

async function shortRCDebug() {
    console.log('🔍 短RC電路調試');

    const components = [
        new VoltageSource('V1', ['in', 'gnd'], 'SINE(0 5 1000)'),
        new Resistor('R1', ['in', 'out'], 1000),
        new Capacitor('C1', ['out', 'gnd'], 100e-6, { ic: 0 })
    ];

    const solver = new ExplicitStateSolver();
    const timeStep = 1e-5;

    await solver.initialize(components, timeStep, { debug: false });
    
    console.log('運行2個時間步來調試...');
    const results = await solver.run(0, 2e-5); // 只運行2個時間步
}

shortRCDebug().catch(console.error);