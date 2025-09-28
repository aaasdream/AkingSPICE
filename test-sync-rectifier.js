/**
 * 🔬 同步整流驗證腳本
 * 
 * 目的：在最簡化的電路中，驗證 VoltageControlledMOSFET 
 * 是否能正確地進行同步整流功能。
 */

import { 
    AkingSPICE,
    VoltageSource, 
    Resistor, 
    Capacitor,
    VoltageControlledMOSFET 
} from './src/index.js';

async function runSyncRectifierTest() {
    console.log('--- AkingSPICE Synchronous Rectifier Test ---');
    
    const solver = new AkingSPICE();
    solver.setDebug(false);

    try {
        solver.reset();

        // 簡化的同步整流測試電路
        solver.components = [
            // 模擬變壓器二次側的交流電壓源 - 修正：相對於地的交流源
            new VoltageSource('Vsec', ['sec_node', '0'], 'SINE(0 67 120e3)'), // 67V, 120kHz
            
            // 同步整流 MOSFET（體二極體模式）
            // 修正配置：Drain=out, Source=sec_node，體二極體方向正確
            new VoltageControlledMOSFET('SR1', ['out', 'G_SR1', 'sec_node'], { 
                Ron: 0.002, Roff: 1e6, Vf_body: 0.7, Ron_body: 0.01 
            }),
            
            // 閘極控制（永遠關閉，僅使用體二極體）
            new VoltageSource('V_GSR1', ['G_SR1', '0'], 0),
            
            // 輸出電容和負載
            new Capacitor('Cout', ['out', '0'], 100e-6),
            new Resistor('Rload', ['out', '0'], 1.15), // 48V^2 / 2000W ≈ 1.15Ω
            
            // DC 偏置電阻
            new Resistor('R_DC_OUT', ['out', '0'], 10e6),
            new Resistor('R_DC_SEC', ['sec_node', '0'], 10e6)
        ];
        
        solver.isInitialized = true;
        console.log('✅ Test circuit built successfully.');

        // 執行暫態分析
        console.log('\n[1] Running Transient Analysis...');
        const results = await solver.runSteppedSimulation(() => ({}), {
            stopTime: 1 / 120e3 * 20, // 模擬 20 個週期（更長的時間）
            timeStep: 1 / 120e3 / 200 // 每個週期 200 個點
        });
        
        console.log(`Simulation completed with ${results.steps.length} steps.`);

        // --- 2. 分析結果 ---
        console.log('\n[2] Analyzing Results...');
        if (!results.steps || results.steps.length < 100) {
            throw new Error("Simulation produced too few results to analyze.");
        }

        let max_output_voltage = 0;
        let avg_output_voltage = 0;
        let max_sec_voltage = 0;

        // 分析後半段（穩態）
        const steadyStart = Math.floor(results.steps.length / 2);
        const steadySteps = results.steps.slice(steadyStart);
        
        // 調試前5個穩態步驟
        console.log('\nDebugging first 5 steady-state steps:');
        for (let i = 0; i < Math.min(5, steadySteps.length); i++) {
            const step = steadySteps[i];
            const v_out = step.nodeVoltages['out'] || 0;
            const v_sec = step.nodeVoltages['sec_node'] || 0;
            const time_ms = (step.time * 1e6).toFixed(1);
            console.log(`  t=${time_ms}μs: V_sec=${v_sec.toFixed(3)}V, V_out=${v_out.toFixed(3)}V`);
        }

        for (const step of steadySteps) {
            const v_out = step.nodeVoltages['out'] || 0;
            const v_sec = step.nodeVoltages['sec_node'] || 0;
            
            if (v_out > max_output_voltage) {
                max_output_voltage = v_out;
            }
            if (Math.abs(v_sec) > max_sec_voltage) {
                max_sec_voltage = Math.abs(v_sec);
            }
            avg_output_voltage += v_out;
        }
        
        avg_output_voltage /= steadySteps.length;

        console.log(`    - Maximum Output Voltage: ${max_output_voltage.toFixed(2)} V`);
        console.log(`    - Average Output Voltage: ${avg_output_voltage.toFixed(2)} V`);
        console.log(`    - Maximum Secondary Voltage: ${max_sec_voltage.toFixed(2)} V`);
        console.log(`    - Expected DC Output:     ~42-45 V (for half-wave rectification)`);

        if (avg_output_voltage > 10) {
            console.log('\n✅ SUCCESS: Synchronous rectifier is working!');
        } else {
            console.error('\n❌ FAILURE: Synchronous rectifier is NOT working.');
        }

    } catch (error) {
        console.error('\n\n❌ An error occurred during the test:', error);
    }
}

runSyncRectifierTest();