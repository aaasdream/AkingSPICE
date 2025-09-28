/**
 * 🔬 超簡化的體二極體測試
 * 直接測試二極體最基本的行為：導通時限制電壓
 */

import { 
    AkingSPICE,
    VoltageSource, 
    Resistor, 
    VoltageControlledMOSFET 
} from './src/index.js';

async function runSimpleTest() {
    console.log('--- Ultra-Simple MOSFET Body Diode Test ---');
    
    const solver = new AkingSPICE();
    solver.setDebug(true);

    try {
        solver.reset();

        // 最簡化電路：只有電壓源、電阻和MOSFET
        solver.components = [
            // 5V 電壓源  
            new VoltageSource('V1', ['anode', '0'], 5.0),
            
            // 串聯電阻
            new Resistor('R1', ['anode', 'cathode'], 100),
            
            // MOSFET作為體二極體：源極接cathode，汲極接地，閘極接地
            // 這樣配置下，如果體二極體工作，電流應該從cathode流向地
            new VoltageControlledMOSFET('M1', ['0', '0', 'cathode'], { 
                Ron: 1e6, Roff: 1e6,  // 通道完全關閉
                Vf_body: 0.7, Ron_body: 0.01,
                Vth: 10.0  // 高閾值確保通道不會意外導通
            })
        ];
        
        solver.isInitialized = true;
        console.log('✅ Ultra-simple circuit built.');

        // 運行 DC 分析
        const dcResults = await solver.runAnalysis('.op');
        
        const V_anode = dcResults.nodeVoltages.get('anode') || 0;
        const V_cathode = dcResults.nodeVoltages.get('cathode') || 0;
        
        console.log(`\n結果分析：`);
        console.log(`- Anode (5V source):    ${V_anode.toFixed(3)} V`);
        console.log(`- Cathode (body diode): ${V_cathode.toFixed(3)} V`);
        console.log(`- Voltage drop across R1: ${(V_anode - V_cathode).toFixed(3)} V`);
        console.log(`- Current through R1: ${((V_anode - V_cathode) / 100 * 1000).toFixed(1)} mA`);
        
        // 理論分析：
        // 如果體二極體工作正常，cathode 應該約為 0.7V
        // 電阻上的電壓：5V - 0.7V = 4.3V
        // 電流：4.3V / 100Ω = 43mA
        
        const expectedVcathode = 0.7;
        const expectedCurrent = (5.0 - 0.7) / 100 * 1000; // 43mA
        const actualCurrent = (V_anode - V_cathode) / 100 * 1000;
        
        console.log(`\n預期：`);
        console.log(`- Cathode 電壓: ${expectedVcathode} V`);
        console.log(`- 電流: ${expectedCurrent} mA`);
        
        const voltageError = Math.abs(V_cathode - expectedVcathode) / expectedVcathode * 100;
        const currentError = Math.abs(actualCurrent - expectedCurrent) / expectedCurrent * 100;
        
        console.log(`\n誤差：`);
        console.log(`- 電壓誤差: ${voltageError.toFixed(1)} %`);
        console.log(`- 電流誤差: ${currentError.toFixed(1)} %`);
        
        if (voltageError < 10 && currentError < 10) {
            console.log('\n✅ SUCCESS: Body diode is working correctly!');
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

runSimpleTest();