// 步驟2：變壓器深度分析 - 簡化版
import {
    VoltageSource, Resistor, Inductor,
    createMCPTransientAnalysis
} from './src/index.js';

async function analyzeTransformer() {
    console.log("🔧 步驟2：變壓器深度分析");

    // 測試A：正常極性
    console.log("\n🔍 測試A：正常極性配置");
    const componentsA = [];
    
    // 理想DC電壓源
    componentsA.push(new VoltageSource('V_DC', ['VIN', 'GND'], 900));
    
    // 變壓器 - 正常極性
    const L_primary = new Inductor('L_pri', ['VIN', 'GND'], 500e-6, 0);
    const L_sec1 = new Inductor('L_sec1', ['SEC_P', 'CENTER'], 2000e-6, 0);  
    const L_sec2 = new Inductor('L_sec2', ['CENTER', 'SEC_N'], 2000e-6, 0);
    
    L_primary.addCoupling(L_sec1, 353.518e-6, 1);    // 正耦合
    L_primary.addCoupling(L_sec2, 353.518e-6, 1);    // 正耦合
    L_sec1.addCoupling(L_sec2, -500e-6, 1);          // 中心抽頭負耦合
    
    componentsA.push(L_primary, L_sec1, L_sec2);
    
    // 簡單負載
    componentsA.push(new Resistor('R_load', ['SEC_P', 'SEC_N'], 100));
    
    // 執行瞬態分析 - 只1步
    const analysisA = createMCPTransientAnalysis(componentsA, {
        startTime: 0,
        stopTime: 1e-6,
        timeStep: 1e-6,
        maxSteps: 1
    });
    
    try {
        const resultA = await analysisA.run();
        const finalA = resultA.getFinalState();
        
        console.log("📊 正極性結果:");
        console.log(`VIN: ${finalA.voltages.get('VIN')?.toFixed(3)}V`);
        console.log(`SEC_P: ${finalA.voltages.get('SEC_P')?.toFixed(3)}V`);
        console.log(`SEC_N: ${finalA.voltages.get('SEC_N')?.toFixed(3)}V`);
        console.log(`CENTER: ${finalA.voltages.get('CENTER')?.toFixed(3)}V`);
        const diffA = (finalA.voltages.get('SEC_P') || 0) - (finalA.voltages.get('SEC_N') || 0);
        console.log(`次級差壓: ${diffA.toFixed(3)}V`);
        
    } catch (errA) {
        console.log(`❌ 正極性測試失敗: ${errA.message}`);
    }

    // 測試B：反向極性
    console.log("\n🔄 測試B：反向極性配置");
    const componentsB = [];
    
    componentsB.push(new VoltageSource('V_DC', ['VIN', 'GND'], 900));
    
    const L_primary_B = new Inductor('L_pri', ['VIN', 'GND'], 500e-6, 0);
    const L_sec1_B = new Inductor('L_sec1', ['SEC_P', 'CENTER'], 2000e-6, 0);
    const L_sec2_B = new Inductor('L_sec2', ['CENTER', 'SEC_N'], 2000e-6, 0);
    
    L_primary_B.addCoupling(L_sec1_B, 353.518e-6, -1);   // 負耦合
    L_primary_B.addCoupling(L_sec2_B, 353.518e-6, -1);   // 負耦合  
    L_sec1_B.addCoupling(L_sec2_B, -500e-6, 1);
    
    componentsB.push(L_primary_B, L_sec1_B, L_sec2_B);
    componentsB.push(new Resistor('R_load', ['SEC_P', 'SEC_N'], 100));
    
    const analysisB = createMCPTransientAnalysis(componentsB, {
        startTime: 0,
        stopTime: 1e-6, 
        timeStep: 1e-6,
        maxSteps: 1
    });
    
    try {
        const resultB = await analysisB.run();
        const finalB = resultB.getFinalState();
        
        console.log("📊 反極性結果:");
        const diffB = (finalB.voltages.get('SEC_P') || 0) - (finalB.voltages.get('SEC_N') || 0);
        console.log(`次級差壓: ${diffB.toFixed(3)}V`);
        
    } catch (errB) {
        console.log(`❌ 反極性測試失敗: ${errB.message}`);
    }

    console.log("\n✅ 步驟2分析完成");
}

analyzeTransformer();