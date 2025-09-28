/**
 * 🔍 LLC 電路調試腳本 - 檢查初始狀態和節點電壓
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

async function debugLLCCircuit() {
    console.log('🔍 LLC 電路調試...\n');
    
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
        new VoltageControlledMOSFET('Q1', ['vin', 'G1', 'sw_a'], { Ron: 0.05, Roff: 1e7 }),
        new VoltageControlledMOSFET('Q2', ['sw_a', 'G2', '0'], { Ron: 0.05, Roff: 1e7 }),
        new VoltageControlledMOSFET('Q3', ['vin', 'G3', 'sw_b'], { Ron: 0.05, Roff: 1e7 }),
        new VoltageControlledMOSFET('Q4', ['sw_b', 'G4', '0'], { Ron: 0.05, Roff: 1e7 }),
        new VoltageSource('VG1', ['G1', '0'], 10), // 🔥 初始打開 Q1
        new VoltageSource('VG2', ['G2', '0'], 0),
        new VoltageSource('VG3', ['G3', '0'], 0), 
        new VoltageSource('VG4', ['G4', '0'], 10), // 🔥 初始打開 Q4
        new Inductor('Lr', ['sw_a', 'res_node'], p.Lr),
        new Capacitor('Cr', ['res_node', 'sw_b'], p.Cr),
        
        transformer,
        
        new VoltageControlledMOSFET('SR1', ['out', 'G_SR1', 'sec_a'], { Ron: 0.002, Roff: 1e6 }),
        new VoltageControlledMOSFET('SR2', ['out', 'G_SR2', 'sec_b'], { Ron: 0.002, Roff: 1e6 }),
        new VoltageSource('V_GSR1', ['G_SR1', '0'], 10), // 🔥 初始打開 SR1
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

    console.log('📊 電路統計:');
    const circuitInfo = solver.getCircuitInfo();
    console.log(`   - 組件數量: ${circuitInfo.componentCount}`);
    console.log(`   - 節點數量: ${circuitInfo.nodeList.length}`);
    console.log(`   - 節點列表: ${circuitInfo.nodeList.join(', ')}`);

    // 檢查變壓器展開後的實際組件
    console.log('\n🔧 實際組件列表:');
    solver.components.forEach((comp, i) => {
        console.log(`   ${i+1}. ${comp.toString()}`);
    });

    console.log('\n📋 執行 DC 分析 (初始開關狀態)...');
    const dcResult = await solver.runDCAnalysis();
    
    if (dcResult && dcResult.converged) {
        console.log('✅ DC 分析成功完成!');
        
        console.log('\n🔍 關鍵節點電壓:');
        const keyNodes = ['vin', 'sw_a', 'sw_b', 'res_node', 'sec_a', 'sec_b', 'sec_ct', 'out'];
        keyNodes.forEach(node => {
            try {
                const voltage = dcResult.getNodeVoltage(node);
                console.log(`   V(${node}): ${voltage.toFixed(3)}V`);
            } catch(e) {
                console.log(`   V(${node}): N/A`);
            }
        });

        console.log('\n⚡ 關鍵支路電流:');
        const keyComponents = ['Vin', 'Q1', 'Q4', 'Lr', 'SR1', 'T1_primary', 'T1_sec_a'];
        keyComponents.forEach(compName => {
            try {
                const current = dcResult.getBranchCurrent(compName);
                console.log(`   I(${compName}): ${(current * 1000).toFixed(3)}mA`);
            } catch(e) {
                console.log(`   I(${compName}): N/A`);
            }
        });

    } else {
        console.error('❌ DC 分析失敗');
        if (dcResult && dcResult.analysisInfo && dcResult.analysisInfo.error) {
            console.error('   錯誤信息:', dcResult.analysisInfo.error);
        }
    }

    console.log('\n🎯 調試完成！');
}

// 執行調試
debugLLCCircuit();