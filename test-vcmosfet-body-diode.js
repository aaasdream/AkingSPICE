/**
 * 🔬 VoltageControlledMOSFET 體二極體專門測試
 * 
 * 目的：在最簡化的電路中，專門驗證 MOSFET 的體二極體功能
 * 這是解決同步整流問題的關鍵單元測試
 */

import { 
    AkingSPICE,
    VoltageSource, 
    Resistor, 
    VoltageControlledMOSFET 
} from './src/index.js';

async function runBodyDiodeTest() {
    console.log('--- VoltageControlledMOSFET Body Diode Unit Test ---');
    
    const solver = new AkingSPICE();
    solver.setDebug(false);

    try {
        solver.reset();

        // 極簡化的體二極體測試電路
        // 測試場景：反向偏壓下的體二極體導通
        solver.components = [
            // 在源極施加正電壓（相對於汲極），測試體二極體導通
            new VoltageSource('Vsource', ['source_node', 'drain_node'], 5.0), // Vs = +5V, Vd = 0V
            
            // MOSFET：閘極接地確保通道關閉，只測試體二極體
            new VoltageControlledMOSFET('M1', ['drain_node', 'gate_node', 'source_node'], { 
                Ron: 0.1, Roff: 1e6, 
                Vf_body: 0.7, Ron_body: 0.01, // 體二極體：Vf=0.7V, Ron=0.01Ω
                Vth: 2.0 // 閾值電壓 2V，確保 Vgs=0 時通道關閉
            }),
            
            // 閘極電壓源：0V 確保 MOSFET 通道完全關閉
            new VoltageSource('Vgate', ['gate_node', '0'], 0.0),
            
            // 限流電阻，防止過大電流
            new Resistor('Rlimit', ['source_node', 'measure_node'], 100), // 100Ω
            
            // 測量點到地的電阻（模擬負載）
            new Resistor('Rload', ['measure_node', 'drain_node'], 100), // 100Ω
            
            // DC 偏置電阻
            new Resistor('R_DC_D', ['drain_node', '0'], 10e6),
            new Resistor('R_DC_S', ['source_node', '0'], 10e6),
            new Resistor('R_DC_M', ['measure_node', '0'], 10e6)
        ];
        
        solver.isInitialized = true;
        console.log('✅ Test circuit built successfully.');

        // 執行 DC 分析
        console.log('\n[1] Running DC Analysis...');
        const dcResults = await solver.runAnalysis('.op');
        
        console.log('\n[2] Analyzing DC Results...');
        const V_source = dcResults.nodeVoltages.get('source_node') || 0;
        const V_drain = dcResults.nodeVoltages.get('drain_node') || 0;
        const V_measure = dcResults.nodeVoltages.get('measure_node') || 0;
        const V_gate = dcResults.nodeVoltages.get('gate_node') || 0;
        
        // 計算關鍵參數
        const Vds = V_drain - V_source; // Drain-Source 電壓
        const Vgs = V_gate - V_source;  // Gate-Source 電壓
        const bodyDiodeVoltage = V_source - V_drain; // 體二極體上的電壓 (Source -> Drain)
        
        console.log(`    - Source Voltage (Vs):     ${V_source.toFixed(3)} V`);
        console.log(`    - Drain Voltage (Vd):      ${V_drain.toFixed(3)} V`);
        console.log(`    - Measure Point Voltage:   ${V_measure.toFixed(3)} V`);
        console.log(`    - Gate Voltage (Vg):       ${V_gate.toFixed(3)} V`);
        console.log(`    - Vds (Drain-Source):      ${Vds.toFixed(3)} V`);
        console.log(`    - Vgs (Gate-Source):       ${Vgs.toFixed(3)} V`);
        console.log(`    - Body Diode Voltage:      ${bodyDiodeVoltage.toFixed(3)} V`);
        
        // 理論分析：體二極體應該導通
        const expectedBodyDiodeOn = bodyDiodeVoltage > 0.7;
        console.log(`    - Expected Body Diode:     ${expectedBodyDiodeOn ? 'ON' : 'OFF'} (Vf = 0.7V)`);
        
        // 如果體二極體導通，電路應該有電流流動
        // 理論電路：5V -> 100Ω -> BodyDiode(0.7V) -> 100Ω -> 0V
        // 總電阻：200Ω + 0.01Ω ≈ 200Ω
        // 有效電壓：5V - 0.7V = 4.3V
        // 預期電流：4.3V / 200Ω = 21.5mA
        // 預期 Vdrain：0V + 21.5mA * 100Ω = 2.15V
        
        if (expectedBodyDiodeOn) {
            const expectedCurrent = (5.0 - 0.7) / 200; // 21.5mA
            const expectedVdrain = expectedCurrent * 100; // 2.15V
            const actualCurrent = (V_measure - V_drain) / 100; // 通過下電阻的電流
            
            console.log(`    - Expected Current:        ${(expectedCurrent * 1000).toFixed(1)} mA`);
            console.log(`    - Expected Drain Voltage:  ${expectedVdrain.toFixed(3)} V`);
            console.log(`    - Actual Current:          ${(actualCurrent * 1000).toFixed(1)} mA`);
            
            const currentError = Math.abs(actualCurrent - expectedCurrent) / expectedCurrent * 100;
            const voltageError = Math.abs(V_drain - expectedVdrain) / expectedVdrain * 100;
            
            console.log(`    - Current Error:           ${currentError.toFixed(1)} %`);
            console.log(`    - Voltage Error:           ${voltageError.toFixed(1)} %`);
            
            if (currentError < 10 && voltageError < 10) {
                console.log('\n✅ SUCCESS: MOSFET body diode is working correctly!');
                return true;
            } else {
                console.error('\n❌ FAILURE: MOSFET body diode current/voltage does not match theory.');
                return false;
            }
        } else {
            // 體二極體不應該導通，電流應該接近零
            const actualCurrent = Math.abs((V_measure - V_drain) / 100);
            console.log(`    - Actual Current:          ${(actualCurrent * 1e6).toFixed(1)} μA`);
            
            if (actualCurrent < 1e-6) {
                console.log('\n✅ SUCCESS: MOSFET body diode correctly OFF.');
                return true;
            } else {
                console.error('\n❌ FAILURE: MOSFET body diode should be OFF but current detected.');
                return false;
            }
        }

    } catch (error) {
        console.error('\n\n❌ An error occurred during the test:', error);
        return false;
    }
}

// 同時執行一個反向測試（體二極體應該不導通）
async function runReverseBodyDiodeTest() {
    console.log('\n--- Reverse Bias Test (Body Diode Should Be OFF) ---');
    
    const solver = new AkingSPICE();
    solver.setDebug(false);

    try {
        solver.reset();

        // 反向偏壓測試：汲極電壓高於源極
        solver.components = [
            // 在汲極施加正電壓，源極接地
            new VoltageSource('Vdrain', ['drain_node', '0'], 5.0), // Vd = +5V, Vs = 0V
            
            // MOSFET：閘極接地確保通道關閉
            new VoltageControlledMOSFET('M1', ['drain_node', 'gate_node', 'source_node'], { 
                Ron: 0.1, Roff: 1e6, 
                Vf_body: 0.7, Ron_body: 0.01,
                Vth: 2.0
            }),
            
            // 閘極接地
            new VoltageSource('Vgate', ['gate_node', '0'], 0.0),
            
            // 測試電阻
            new Resistor('Rtest', ['source_node', '0'], 1000),
            
            // DC 偏置
            new Resistor('R_DC_D', ['drain_node', '0'], 10e6),
            new Resistor('R_DC_S', ['source_node', '0'], 10e6)
        ];
        
        solver.isInitialized = true;
        console.log('✅ Reverse test circuit built successfully.');

        const dcResults = await solver.runAnalysis('.op');
        
        const V_source = dcResults.nodeVoltages.get('source_node') || 0;
        const V_drain = dcResults.nodeVoltages.get('drain_node') || 0;
        const current = Math.abs(V_source / 1000); // 通過測試電阻的電流
        
        console.log(`    - Drain Voltage:    ${V_drain.toFixed(3)} V`);
        console.log(`    - Source Voltage:   ${V_source.toFixed(3)} V`);
        console.log(`    - Leakage Current:  ${(current * 1e6).toFixed(1)} μA`);
        
        if (current < 1e-6) {
            console.log('✅ SUCCESS: Body diode correctly blocks reverse current.');
            return true;
        } else {
            console.error('❌ FAILURE: Unexpected reverse current detected.');
            return false;
        }

    } catch (error) {
        console.error('\n❌ An error occurred during reverse test:', error);
        return false;
    }
}

async function main() {
    const test1 = await runBodyDiodeTest();
    const test2 = await runReverseBodyDiodeTest();
    
    if (test1 && test2) {
        console.log('\n🎉 ALL TESTS PASSED: VoltageControlledMOSFET body diode is fully functional!');
    } else {
        console.log('\n⚠️  SOME TESTS FAILED: VoltageControlledMOSFET body diode needs debugging.');
    }
}

main();