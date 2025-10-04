// 步驟2：變壓器深度分析
// 專門檢查變壓器耦合機制和極性問題

import {
    VoltageSource, Resistor, Capacitor, Inductor,
    createMCPDiode, MultiWindingTransformer,
    createMCPTransientAnalysis, TransientResult
} from './src/index.js';

console.log("🔧 步驟2：變壓器深度分析開始");

// 創建簡化電路組件列表
const components = [];

// 理想電壓源直接驅動變壓器一次側
circuit.addVoltageSource('V_Primary', 'PRI_POS', 'GND', 900); // 固定900V DC

// 變壓器組件 - 詳細極性檢查
const T1_primary = new AkingSPICE.Inductor('T1_primary', 'PRI_POS', 'GND', 500e-6);
const T1_secondary = new AkingSPICE.Inductor('T1_secondary', 'SEC_POS', 'CENTER', 2000e-6);
const T1_secondary2 = new AkingSPICE.Inductor('T1_secondary2', 'CENTER', 'SEC_NEG', 2000e-6);

// 測試不同極性配置
console.log("🔍 測試極性配置 A：正常極性");
T1_primary.addCoupling(T1_secondary, 353.518e-6, 1);    // 正極性
T1_primary.addCoupling(T1_secondary2, 353.518e-6, 1);   // 正極性  
T1_secondary.addCoupling(T1_secondary2, -500e-6, 1);    // 中心抽頭負耦合

circuit.addComponent(T1_primary);
circuit.addComponent(T1_secondary);
circuit.addComponent(T1_secondary2);

// 簡化負載：只用電阻
circuit.addResistor('R_Load', 'SEC_POS', 'SEC_NEG', 100); // 100歐姆

// DC分析
console.log("⚡ 執行DC分析...");
const dcAnalysis = new AkingSPICE.DCAnalysis(circuit);
const dcResult = dcAnalysis.solve();

console.log("\n📊 DC分析結果:");
console.log(`一次側電壓 PRI_POS: ${dcResult.voltages.get('PRI_POS')?.toFixed(3)}V`);
console.log(`次級電壓 SEC_POS: ${dcResult.voltages.get('SEC_POS')?.toFixed(3)}V`);
console.log(`次級電壓 SEC_NEG: ${dcResult.voltages.get('SEC_NEG')?.toFixed(3)}V`);
console.log(`中心點電壓 CENTER: ${dcResult.voltages.get('CENTER')?.toFixed(3)}V`);
console.log(`次級差壓 (SEC_POS-SEC_NEG): ${(dcResult.voltages.get('SEC_POS') - dcResult.voltages.get('SEC_NEG'))?.toFixed(3)}V`);

// 檢查電流
console.log("\n🔍 電流分析:");
const components = circuit.getComponents();
components.forEach(comp => {
    if (comp.constructor.name === 'Inductor') {
        console.log(`${comp.name}: 電流 = ${comp.current?.toExponential(3) || 'N/A'}A`);
    }
});

// 測試變壓器參數
console.log("\n🔧 變壓器參數驗證:");
console.log(`一次側電感: ${T1_primary.inductance * 1e6}µH`);
console.log(`次級電感: ${T1_secondary.inductance * 1e6}µH`);
console.log(`理論變壓比: ${Math.sqrt(T1_secondary.inductance / T1_primary.inductance).toFixed(2)}:1`);

// 極性測試B：反向極性
console.log("\n🔄 測試極性配置 B：反向極性");
const circuit2 = new AkingSPICE.Circuit();
circuit2.addVoltageSource('V_Primary', 'PRI_POS', 'GND', 900);

const T2_primary = new AkingSPICE.Inductor('T2_primary', 'PRI_POS', 'GND', 500e-6);
const T2_secondary = new AkingSPICE.Inductor('T2_secondary', 'SEC_POS', 'CENTER', 2000e-6);
const T2_secondary2 = new AkingSPICE.Inductor('T2_secondary2', 'CENTER', 'SEC_NEG', 2000e-6);

// 嘗試反向極性
T2_primary.addCoupling(T2_secondary, 353.518e-6, -1);   // 負極性
T2_primary.addCoupling(T2_secondary2, 353.518e-6, -1);  // 負極性
T2_secondary.addCoupling(T2_secondary2, -500e-6, 1);

circuit2.addComponent(T2_primary);
circuit2.addComponent(T2_secondary);
circuit2.addComponent(T2_secondary2);
circuit2.addResistor('R_Load', 'SEC_POS', 'SEC_NEG', 100);

const dcAnalysis2 = new AkingSPICE.DCAnalysis(circuit2);
const dcResult2 = dcAnalysis2.solve();

console.log("\n📊 反向極性結果:");
console.log(`次級差壓 (SEC_POS-SEC_NEG): ${(dcResult2.voltages.get('SEC_POS') - dcResult2.voltages.get('SEC_NEG'))?.toFixed(3)}V`);

console.log("\n✅ 步驟2變壓器分析完成");