// Test controller behavior separately
import { LLCController } from './llc_controller.js';

console.log('🧪 Testing LLC Controller...');

const controller = new LLCController({
    vRef: 48.0,
    nominalFreq: 200e3,
    minFreq: 100e3,
    maxFreq: 400e3,
    kp: 1e3,
    ki: 5e2,
    deadTime: 100e-9
});

// Test controller for a few time steps
for (let step = 0; step < 10; step++) {
    const time = step * 1e-6; // 1µs steps
    const vout = 0; // Start with 0V output
    
    const gateStates = controller.update(vout, time);
    console.log(`Step ${step}: t=${(time*1e6).toFixed(1)}µs, VOUT=${vout.toFixed(3)}V, M_H=${gateStates['M_H']}, M_L=${gateStates['M_L']}`);
}

console.log('\n🧪 Controller test complete.');