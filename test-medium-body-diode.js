/**
 * 🔬 中等複雜度的體二極體測試
 * 逐步接近原始複雜電路的拓撲
 */

import { 
    AkingSPICE,
    VoltageSource, 
    Resistor, 
    VoltageControlledMOSFET 
} from './src/index.js';

async function runMediumTest() {
    console.log('--- Medium Complexity MOSFET Body Diode Test ---');
    
    const solver = new AkingSPICE();
    solver.setDebug(false);

    try {
        solver.reset();

        // 模擬原始電路的拓撲：雙電阻分壓 + 體二極體
        solver.components = [
            // +5V 電壓源（正極接pos_node，負極接地）
            new VoltageSource('Vpos', ['pos_node', '0'], 5.0),
            
            // 上電阻（從正極到測量點）
            new Resistor('R1', ['pos_node', 'measure_node'], 100),
            
            // 下電阻（從測量點到MOSFET源極）
            new Resistor('R2', ['measure_node', 'mosfet_source'], 100),
            
            // MOSFET：汲極接地，源極接R2，閘極接地
            // 這樣配置下，如果 Vsource > 0V，體二極體可能導通
            new VoltageControlledMOSFET('M1', ['0', '0', 'mosfet_source'], { 
                Ron: 1e6, Roff: 1e6,
                Vf_body: 0.7, Ron_body: 0.01,
                Vth: 10.0
            })
        ];
        
        solver.isInitialized = true;
        console.log('✅ Medium complexity circuit built.');

        const dcResults = await solver.runAnalysis('.op');
        
        const V_pos = dcResults.nodeVoltages.get('pos_node') || 0;
        const V_measure = dcResults.nodeVoltages.get('measure_node') || 0;
        const V_mosfet_source = dcResults.nodeVoltages.get('mosfet_source') || 0;
        
        console.log(`\n電壓分佈：`);
        console.log(`- Positive terminal:  ${V_pos.toFixed(3)} V`);
        console.log(`- Measure point:      ${V_measure.toFixed(3)} V`);
        console.log(`- MOSFET source:      ${V_mosfet_source.toFixed(3)} V`);
        console.log(`- Ground (drain):     0.000 V`);
        
        const Vds = 0 - V_mosfet_source; // 汲極接地，源極為 V_mosfet_source
        const bodyDiodeVoltage = V_mosfet_source - 0; // 體二極體電壓：源極到汲極
        const current_R1 = (V_pos - V_measure) / 100 * 1000; // mA
        const current_R2 = (V_measure - V_mosfet_source) / 100 * 1000; // mA
        
        console.log(`\n電路分析：`);
        console.log(`- Vds (Drain-Source):     ${Vds.toFixed(3)} V`);
        console.log(`- Body Diode Voltage:     ${bodyDiodeVoltage.toFixed(3)} V`);
        console.log(`- Current through R1:     ${current_R1.toFixed(1)} mA`);
        console.log(`- Current through R2:     ${current_R2.toFixed(1)} mA`);
        
        // 檢查是否符合體二極體行為
        const bodyDiodeExpected = bodyDiodeVoltage > 0.65 && bodyDiodeVoltage < 0.75;
        const currentConsistent = Math.abs(current_R1 - current_R2) < 1; // 1mA 誤差內
        
        console.log(`\n檢驗結果：`);
        console.log(`- Body diode voltage OK:  ${bodyDiodeExpected ? '✅' : '❌'} (0.65V < ${bodyDiodeVoltage.toFixed(3)}V < 0.75V)`);
        console.log(`- Current consistency:    ${currentConsistent ? '✅' : '❌'} (${Math.abs(current_R1 - current_R2).toFixed(1)}mA difference)`);
        
        if (bodyDiodeExpected && currentConsistent) {
            console.log('\n✅ SUCCESS: Body diode working correctly in medium complexity circuit!');
            return true;
        } else {
            console.log('\n❌ FAILURE: Body diode behavior incorrect.');
            return false;
        }

    } catch (error) {
        console.error('❌ Error:', error);
        return false;
    }
}

runMediumTest();