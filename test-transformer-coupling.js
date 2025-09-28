/**
 * 🔬 變壓器耦合驗證腳本
 * 
 * 目的：在最簡化的電路中，驗證 MultiWindingTransformer 
 * 是否能正確地將電壓從一次側耦合到二次側。
 */

import { 
    AkingSPICE,
    VoltageSource, 
    Resistor, 
    MultiWindingTransformer 
} from './src/index.js';

async function runTransformerTest() {
    console.log('--- AkingSPICE Transformer Coupling Test ---');
    
    const solver = new AkingSPICE();
    solver.setDebug(false);
    
    const TURNS_RATIO = 12;

    try {
        solver.reset();

        const transformer = new MultiWindingTransformer('T1', {
            windings: [
                { name: 'primary', nodes: ['p1', '0'], inductance: 180e-6, turns: TURNS_RATIO },
                { name: 'secondary', nodes: ['s1', '0'], inductance: 180e-6 / (TURNS_RATIO**2), turns: 1 }
            ],
            couplingMatrix: [[1.0, 0.999], [0.999, 1.0]] // 接近理想耦合
        });

        solver.components = [
            // 在一次側施加一個 800V, 120kHz 的正弦波
            new VoltageSource('Vin', ['p1', '0'], 'SINE(0 800 120e3)'),
            
            // 添加變壓器分解出的耦合電感
            ...transformer.getComponents(),
            
            // 在二次側接上負載電阻
            new Resistor('Rload', ['s1', '0'], 50)
        ];
        
        solver.isInitialized = true;
        console.log('✅ Test circuit built successfully.');

        // 執行暫態分析
        console.log('\n[1] Running Transient Analysis...');
        const results = await solver.runSteppedSimulation(() => ({}), {
            stopTime: 1 / 120e3 * 5, // 模擬 5 個週期
            timeStep: 1 / 120e3 / 100 // 每個週期 100 個點
        });
        
        console.log(`Simulation completed with ${results.steps.length} steps.`);

        // --- 2. 分析結果 ---
        console.log('\n[2] Analyzing Results...');
        if (!results.steps || results.steps.length < 10) {
            throw new Error("Simulation produced too few results to analyze.");
        }

        let peak_primary_voltage = 0;
        let peak_secondary_voltage = 0;

        for (const step of results.steps) {
            const v_p = step.nodeVoltages['p1'] || 0;
            const v_s = step.nodeVoltages['s1'] || 0;
            if (Math.abs(v_p) > Math.abs(peak_primary_voltage)) {
                peak_primary_voltage = v_p;
            }
            if (Math.abs(v_s) > Math.abs(peak_secondary_voltage)) {
                peak_secondary_voltage = v_s;
            }
        }
        
        // 🔥 修正：關注電壓幅度而不是極性
        const primary_amplitude = Math.abs(peak_primary_voltage);
        const secondary_amplitude = Math.abs(peak_secondary_voltage);
        const expected_secondary_amplitude = primary_amplitude / TURNS_RATIO;
        const actual_ratio = primary_amplitude / secondary_amplitude;
        const error = Math.abs(expected_secondary_amplitude - secondary_amplitude) / expected_secondary_amplitude * 100;

        console.log(`    - Peak Primary Voltage:   ${peak_primary_voltage.toFixed(2)} V`);
        console.log(`    - Peak Secondary Voltage: ${peak_secondary_voltage.toFixed(2)} V`);
        console.log(`    - Primary Amplitude:      ${primary_amplitude.toFixed(2)} V`);
        console.log(`    - Secondary Amplitude:    ${secondary_amplitude.toFixed(2)} V`);
        console.log(`    - Expected Secondary Amp: ~${expected_secondary_amplitude.toFixed(2)} V`);
        console.log(`    - Measured Turns Ratio:   ~${actual_ratio.toFixed(2)} : 1`);
        console.log(`    - Voltage Error:          ${error.toFixed(2)} %`);

        if (error < 5) {
            console.log('\n✅ SUCCESS: Transformer coupling is working correctly!');
        } else {
            console.error('\n❌ FAILURE: Transformer coupling is NOT working as expected.');
        }

    } catch (error) {
        console.error('\n\n❌ An error occurred during the test:', error);
    }
}

runTransformerTest();