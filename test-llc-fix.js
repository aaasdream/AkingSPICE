import AkingSPICE from './src/index.js';

/**
 * 直接驗證修正後的LLC電路仿真
 * 檢查電容器符號修正是否解決了理論vs實際的差異
 */

console.log('=== LLC電路修正驗證 ===\n');

// LLC參數
const L_res = 25e-6;  // 諧振電感 25μH
const C_res = 207e-9; // 諧振電容 207nF
const L_mag = 50e-6;  // 磁化電感 50μH
const turns = 6;      // 變壓器匝比 6:1
const R_load = 1.5;   // 二次側負載 1.5Ω

// 理論計算
const f_res = 1 / (2 * Math.PI * Math.sqrt(L_res * C_res));
const Z0 = Math.sqrt(L_res / C_res);
const omega_res = 2 * Math.PI * f_res;
const R_reflected = turns * turns * R_load;

console.log('理論參數:');
console.log(`  諧振頻率: ${(f_res/1000).toFixed(1)}kHz`);
console.log(`  特性阻抗: ${Z0.toFixed(1)}Ω`);
console.log(`  反射負載: ${R_reflected.toFixed(1)}Ω`);

// 創建簡化的LLC電路進行測試
const circuit = new AkingSPICE();

// 添加節點和元件
circuit.addElement('V_in', 'voltage', { n1: 'vin', n2: '0', dc: 400, ac: 400 });
circuit.addElement('L_res', 'inductor', { n1: 'vin', n2: 'node_1', value: L_res });
circuit.addElement('C_res', 'capacitor', { n1: 'node_1', n2: 'node_2', value: C_res });
circuit.addElement('L_mag', 'inductor', { n1: 'node_1', n2: '0', value: L_mag });

// 添加反射負載
const R_eq = R_reflected;
circuit.addElement('R_load', 'resistor', { n1: 'node_2', n2: '0', value: R_eq });

console.log('\n=== 在諧振頻率進行AC分析 ===');

// AC分析在諧振頻率
const acResults = circuit.ac([f_res]);
const result = acResults[0];

console.log(`頻率: ${(result.frequency/1000).toFixed(1)}kHz`);

// 分析各元件電流
const V_in = result.voltages.get('vin');
const V_node1 = result.voltages.get('node_1');
const V_node2 = result.voltages.get('node_2');

console.log('\n節點電壓:');
console.log(`  V_in: ${V_in ? V_in.magnitude.toFixed(2) : 'N/A'}V ∠${V_in ? (V_in.phase*180/Math.PI).toFixed(1) : 'N/A'}°`);
console.log(`  V_node1: ${V_node1 ? V_node1.magnitude.toFixed(2) : 'N/A'}V ∠${V_node1 ? (V_node1.phase*180/Math.PI).toFixed(1) : 'N/A'}°`);
console.log(`  V_node2: ${V_node2 ? V_node2.magnitude.toFixed(2) : 'N/A'}V ∠${V_node2 ? (V_node2.phase*180/Math.PI).toFixed(1) : 'N/A'}°`);

// 計算理論電流
const I_theory_basic = 400 / Z0;  // 基本理論: V/Z0
const I_theory_damped = 400 / Math.sqrt(Z0*Z0 + (R_eq*Z0/(R_eq+Z0))**2); // 考慮阻尼
const gain_theory = V_node2 ? V_node2.magnitude / V_in.magnitude : 0;

console.log('\n理論vs實際比較:');
console.log(`  理論電壓增益: 1.0 (諧振時)`);
console.log(`  實際電壓增益: ${gain_theory.toFixed(4)}`);
console.log(`  誤差: ${(Math.abs(1.0 - gain_theory) * 100).toFixed(2)}%`);

// 檢查各元件的行為
console.log('\n=== 元件行為分析 ===');

// 電感電壓 = jωL * I
const omega = 2 * Math.PI * f_res;
const XL_res = omega * L_res;
const XC_res = 1 / (omega * C_res);
const XL_mag = omega * L_mag;

console.log(`諧振電感阻抗 XL_res: ${XL_res.toFixed(2)}Ω`);
console.log(`諧振電容阻抗 XC_res: ${XC_res.toFixed(2)}Ω`);
console.log(`磁化電感阻抗 XL_mag: ${XL_mag.toFixed(2)}Ω`);
console.log(`理論上 XL_res = XC_res: ${Math.abs(XL_res - XC_res) < 0.1 ? '✓' : '✗'}`);

// 測試暫態響應
console.log('\n=== 暫態分析測試 ===');
try {
    // 設置暫態分析參數
    const period = 1/f_res;
    const timeStep = period / 100;  // 每個週期100個點
    const duration = 5 * period;    // 分析5個週期
    
    console.log(`分析時間: ${(duration*1e6).toFixed(1)}μs`);
    console.log(`時間步長: ${(timeStep*1e9).toFixed(1)}ns`);
    
    // 暫態分析
    const transientResults = circuit.transient(timeStep, duration);
    
    if (transientResults && transientResults.length > 0) {
        const lastResult = transientResults[transientResults.length - 1];
        const steadyStateGain = lastResult.voltages.get('node_2') / lastResult.voltages.get('vin');
        
        console.log(`穩態電壓增益: ${steadyStateGain.toFixed(4)}`);
        console.log(`與AC分析比較: ${Math.abs(steadyStateGain - gain_theory) < 0.01 ? '✓一致' : '✗不一致'}`);
    }
} catch (error) {
    console.log(`暫態分析錯誤: ${error.message}`);
}

console.log('\n=== 修正效果評估 ===');
if (Math.abs(1.0 - gain_theory) < 0.05) {
    console.log('🎉 SUCCESS: 電容器符號修正成功！諧振增益接近理論值1.0');
} else {
    console.log(`⚠️  WARNING: 仍有${(Math.abs(1.0 - gain_theory) * 100).toFixed(1)}%誤差，可能還有其他問題`);
}