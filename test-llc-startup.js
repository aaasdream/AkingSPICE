/**
 * 🚀 LLC 啟動測試 - 使用強制初始條件嘗試啟動
 */

import { 
    AkingSPICE,
    VoltageSource, 
    Resistor, 
    Inductor, 
    Capacitor,
    VoltageControlledMOSFET,
    MultiWindingTransformer 
} from './src/index.js';

async function testLLCStartup() {
    console.log('🚀 LLC 啟動測試...\n');
    
    const solver = new AkingSPICE();
    solver.setDebug(false);

    const p = {
        Vin: 800, Vout_target: 48, Pout: 2000,
        Lm: 180e-6, Lr: 25e-6, Cr: 47e-9, Cout: 1000e-6,
        turns_ratio: 12, deadTime: 500e-9, coupling_k: 0.99
    };
    p.Rload = (p.Vout_target ** 2) / p.Pout;

    const transformer = new MultiWindingTransformer('T1', {
        windings: [
            { name: 'primary', nodes: ['res_node', 'sw_b'], inductance: p.Lm, turns: p.turns_ratio },
            { name: 'sec_a', nodes: ['sec_a', 'sec_ct'], inductance: p.Lm / (p.turns_ratio**2), turns: 1 },
            { name: 'sec_b', nodes: ['sec_b', 'sec_ct'], inductance: p.Lm / (p.turns_ratio**2), turns: 1 }
        ],
        couplingMatrix: [
            [1.0, p.coupling_k, p.coupling_k],
            [p.coupling_k, 1.0, 0.98],
            [p.coupling_k, 0.98, 1.0]
        ]
    });

    solver.components = [
        new VoltageSource('Vin', ['vin', '0'], p.Vin),
        new VoltageControlledMOSFET('Q1', ['vin', 'G1', 'sw_a'], { Ron: 0.05, Roff: 1e7, Vth: 1.0 }),
        new VoltageControlledMOSFET('Q2', ['sw_a', 'G2', '0'], { Ron: 0.05, Roff: 1e7, Vth: 1.0 }),
        new VoltageControlledMOSFET('Q3', ['vin', 'G3', 'sw_b'], { Ron: 0.05, Roff: 1e7, Vth: 1.0 }),
        new VoltageControlledMOSFET('Q4', ['sw_b', 'G4', '0'], { Ron: 0.05, Roff: 1e7, Vth: 1.0 }),
        new VoltageSource('VG1', ['G1', '0'], 0), 
        new VoltageSource('VG2', ['G2', '0'], 0),
        new VoltageSource('VG3', ['G3', '0'], 0), 
        new VoltageSource('VG4', ['G4', '0'], 0),
        new Inductor('Lr', ['sw_a', 'res_node'], p.Lr),
        new Capacitor('Cr', ['res_node', 'sw_b'], p.Cr),
        
        transformer,
        
        new VoltageControlledMOSFET('SR1', ['out', 'G_SR1', 'sec_a'], { Ron: 0.002, Roff: 1e6, Vth: 1.0 }),
        new VoltageControlledMOSFET('SR2', ['out', 'G_SR2', 'sec_b'], { Ron: 0.002, Roff: 1e6, Vth: 1.0 }),
        new VoltageSource('V_GSR1', ['G_SR1', '0'], 0),
        new VoltageSource('V_GSR2', ['G_SR2', '0'], 0),
        new Resistor('R_sec_ct', ['sec_ct', '0'], 1e-9),
        new Capacitor('Cout', ['out', '0'], p.Cout),
        new Resistor('Rload', ['out', '0'], p.Rload),
        new Resistor('R_DC_SWA', ['sw_a', '0'], 10e6),
        new Resistor('R_DC_SWB', ['sw_b', '0'], 10e6),
        new Resistor('R_DC_RES', ['res_node', '0'], 10e6),
        new Resistor('R_DC_OUT', ['out', '0'], 10e6),
        new Resistor('R_DC_SECA', ['sec_a', '0'], 10e6),
        new Resistor('R_DC_SECB', ['sec_b', '0'], 10e6)
    ];

    solver.isInitialized = true;

    console.log('📋 啟動步進式瞬時分析...');
    await solver.initSteppedTransient({ 
        stopTime: 1e-3,  // 1ms
        timeStep: 10e-9  // 10ns
    });

    console.log('🔄 運行幾個切換週期...');
    let stepCount = 0;
    let lastVout = 0;
    const freq = 150e3;  // 150kHz
    const period = 1 / freq;
    const deadTime = 100e-9;
    
    while (stepCount < 1000 && !solver.isFinished()) {
        const time = solver.getCurrentTime();
        
        // 簡單的開關時序
        const phase = (time % period) / period;
        const dead_phase = deadTime / period;
        
        const q1_on = phase >= dead_phase && phase < 0.5 - dead_phase;
        const q3_on = phase >= 0.5 + dead_phase && phase < 1.0 - dead_phase;
        const sr1_on = q1_on;
        const sr2_on = q3_on;

        const controlInputs = {
            'G1': q1_on ? 15 : 0,   // 高電壓確保導通
            'G2': q1_on ? 0 : 15,
            'G3': q3_on ? 15 : 0,
            'G4': q3_on ? 0 : 15,
            'G_SR1': sr1_on ? 15 : 0,
            'G_SR2': sr2_on ? 15 : 0
        };

        const stepResult = solver.step(controlInputs);
        
        if (stepResult && stepResult.nodeVoltages) {
            lastVout = stepResult.nodeVoltages['out'] || 0;
            
            if (stepCount % 100 === 0) {
                console.log(`   t=${(time*1e6).toFixed(2)}µs, Vout=${lastVout.toFixed(3)}V, Phase=${phase.toFixed(2)}, Q1=${q1_on?'ON':'OFF'}, Q3=${q3_on?'ON':'OFF'}`);
            }
        }
        stepCount++;
    }

    console.log(`\n🎯 測試完成！最終輸出電壓: ${lastVout.toFixed(3)}V`);
    if (Math.abs(lastVout) > 1) {
        console.log('✅ 電路成功啟動！');
    } else {
        console.log('❌ 電路尚未成功啟動，需要進一步調試。');
    }
}

// 執行測試
testLLCStartup();