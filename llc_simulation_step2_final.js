// 步驟2：變壓器深度分析 - 使用MultiWindingTransformer
import {
    VoltageSource, Resistor, 
    MultiWindingTransformer,
    createMCPTransientAnalysis
} from './src/index.js';

async function analyzeTransformer() {
    console.log("🔧 步驟2：變壓器深度分析");

    // 測試A：正常極性耦合矩陣
    console.log("\n🔍 測試A：正常極性配置");
    
    const components = [];
    components.push(new VoltageSource('V_DC', ['VIN', 'GND'], 900));
    
    // 變壓器 - 正常極性矩陣
    const transformer = new MultiWindingTransformer('T1', {
        windings: [
            { name: 'primary', nodes: ['VIN', 'GND'], inductance: 500e-6 },
            { name: 'sec1', nodes: ['SEC_P', 'CENTER'], inductance: 2000e-6 },
            { name: 'sec2', nodes: ['CENTER', 'SEC_N'], inductance: 2000e-6 }
        ],
        couplingMatrix: [
            [1.0, 0.999, 0.999],    // primary耦合
            [0.999, 1.0, -1.0],     // sec1耦合
            [0.999, -1.0, 1.0]      // sec2耦合
        ]
    });
    
    components.push(transformer);
    components.push(new Resistor('R_load', ['SEC_P', 'SEC_N'], 100));
    
    // DC測試 - 只執行1步
    const analysis = createMCPTransientAnalysis({ debug: false, gmin: 1e-9 });
    
    try {
        const result = await analysis.runTransient(components, {
            startTime: 0,
            stopTime: 1e-7,
            timeStep: 1e-7,
            maxSteps: 1
        });
        
        const states = result.getAllStates();
        if (states.length > 0) {
            const final = states[states.length - 1];
            
            console.log("📊 正極性結果:");
            console.log(`VIN: ${final.voltages.get('VIN')?.toFixed(3)}V`);
            console.log(`SEC_P: ${final.voltages.get('SEC_P')?.toFixed(3)}V`);
            console.log(`SEC_N: ${final.voltages.get('SEC_N')?.toFixed(3)}V`);
            console.log(`CENTER: ${final.voltages.get('CENTER')?.toFixed(3)}V`);
            
            const secDiff = (final.voltages.get('SEC_P') || 0) - (final.voltages.get('SEC_N') || 0);
            console.log(`次級差壓: ${secDiff.toFixed(3)}V`);
            
            if (Math.abs(secDiff) > 1) {
                console.log("✅ 變壓器耦合正常工作");
            } else {
                console.log("❌ 變壓器耦合失效");
            }
        }
        
    } catch (err) {
        console.log(`❌ 測試失敗: ${err.message}`);
    }

    // 測試B：反極性耦合矩陣  
    console.log("\n🔄 測試B：反極性配置");
    
    const componentsB = [];
    componentsB.push(new VoltageSource('V_DC', ['VIN', 'GND'], 900));
    
    const transformerB = new MultiWindingTransformer('T1', {
        windings: [
            { name: 'primary', nodes: ['VIN', 'GND'], inductance: 500e-6 },
            { name: 'sec1', nodes: ['SEC_P', 'CENTER'], inductance: 2000e-6 },
            { name: 'sec2', nodes: ['CENTER', 'SEC_N'], inductance: 2000e-6 }
        ],
        couplingMatrix: [
            [1.0, -0.999, -0.999],   // primary負耦合
            [-0.999, 1.0, -1.0],     // sec1負耦合
            [-0.999, -1.0, 1.0]      // sec2負耦合
        ]
    });
    
    componentsB.push(transformerB);
    componentsB.push(new Resistor('R_load', ['SEC_P', 'SEC_N'], 100));
    
    try {
        const resultB = await analysis.runTransient(componentsB, {
            startTime: 0,
            stopTime: 1e-7,
            timeStep: 1e-7,
            maxSteps: 1
        });
        
        const statesB = resultB.getAllStates();
        if (statesB.length > 0) {
            const finalB = statesB[statesB.length - 1];
            const secDiffB = (finalB.voltages.get('SEC_P') || 0) - (finalB.voltages.get('SEC_N') || 0);
            console.log(`反極性次級差壓: ${secDiffB.toFixed(3)}V`);
        }
        
    } catch (errB) {
        console.log(`❌ 反極性測試失敗: ${errB.message}`);
    }

    console.log("\n✅ 步驟2完成 - 極性診斷結果已輸出");
}

analyzeTransformer();