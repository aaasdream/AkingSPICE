// 步驟3快速測試：修改gmin值
// 基於llc_simulation_step1.js，只測試不同gmin值

import {
    VoltageSource, Resistor, Capacitor, Inductor,
    createMCPDiode, MultiWindingTransformer,
    createMCPTransientAnalysis, TransientResult
} from './src/index.js';

async function testGminValues() {
    console.log('🔧 步驟3：gmin值影響測試');
    
    const gminValues = [1e-9, 1e-7, 1e-6, 1e-5];
    
    for (const gmin of gminValues) {
        console.log(`\n🔍 測試 gmin = ${gmin.toExponential(0)}`);
        
        // 創建簡化電路
        const components = [
            new VoltageSource('V_HB_Driver', ['SW_MID', 'GND'], 
                {type: 'PULSE', vLow: 0, vHigh: 900, frequency: 200e3, dutyCycle: 0.5}),
            
            new Inductor('Lr', ['SW_MID', 'RES'], 27e-6, 0),
            new Capacitor('Cr', ['RES', 'PRI_POS'], 47e-9, 100),
        ];
        
        // 變壓器
        const transformer = new MultiWindingTransformer('T1', {
            windings: [
                { name: 'primary', nodes: ['PRI_POS', 'SW_MID'], inductance: 500e-6 },
                { name: 'secondary', nodes: ['SEC_POS', '0'], inductance: 1000e-6 },
                { name: 'secondary2', nodes: ['0', 'SEC_NEG'], inductance: 1000e-6 }
            ],
            couplingMatrix: [[1.0, 0.999, 0.999], [0.999, 1.0, -1.0], [0.999, -1.0, 1.0]]
        });
        
        components.push(transformer);
        
        // 整流器和負載  
        components.push(createMCPDiode('D1', ['SEC_POS', 'VOUT']));
        components.push(createMCPDiode('D2', ['SEC_NEG', 'VOUT'])); 
        components.push(new Capacitor('Co', ['VOUT', 'GND'], 470e-6, 0));
        components.push(new Resistor('R_Load', ['VOUT', 'GND'], 2.5));
        
        try {
            const mcpSolver = createMCPTransientAnalysis({ debug: false, gmin });
            const result = new TransientResult();
            
            // 只運行5步快速測試
            for (let step = 0; step < 5; step++) {
                const currentTime = step * 2e-7;
                
                const stepResult = await mcpSolver.solveStep(components, currentTime, 2e-7, result);
                
                if (step === 4) {  // 最後一步
                    const vout = stepResult.voltages.get('VOUT') || 0;
                    const secPos = stepResult.voltages.get('SEC_POS') || 0;
                    const secNeg = stepResult.voltages.get('SEC_NEG') || 0;
                    
                    console.log(`  VOUT: ${vout.toFixed(3)}V`);
                    console.log(`  SEC差壓: ${(secPos - secNeg).toFixed(3)}V`);
                    
                    if (Math.abs(vout) > 0.1) {
                        console.log(`  ✅ gmin=${gmin.toExponential(0)} 成功產生輸出`);
                    } else {
                        console.log(`  ❌ gmin=${gmin.toExponential(0)} 仍無輸出`);
                    }
                }
            }
            
        } catch (err) {
            console.log(`  ❌ gmin=${gmin.toExponential(0)} 求解失敗: ${err.message}`);
        }
    }
    
    console.log('\n✅ gmin測試完成');
}

testGminValues();