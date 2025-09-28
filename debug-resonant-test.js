/**
 * 測試基本的LRC諧振電路
 * 目標：驗證fr = 1/(2π√LC)
 */

import { AkingSPICE, VoltageSource, Inductor, Capacitor, Resistor } from './src/index.js';

console.log('🔧 基本LRC諧振電路測試');

// 創建電路
const spice = new AkingSPICE();

// 基本LRC串聯諧振電路
// Vin -> Lr -> Cr -> Vout
const components = [
    new VoltageSource('V1', ['vin', '0'], 100, {type: 'SIN', frequency: 70000, amplitude: 100}), // 70kHz, 100V
    new Inductor('Lr', ['vin', 'vres'], 25e-6),     // 25µH 諧振電感
    new Capacitor('Cr', ['vres', '0'], 207e-9),     // 207nF 諧振電容
    new Resistor('Rload', ['vres', '0'], 11.0),     // 11Ω 阻抗匹配負載
];

// 添加元件到電路
for (const component of components) {
    spice.addComponent(component);
}

console.log('📋 電路設置:');
console.log('- Lr = 25µH');
console.log('- Cr = 207nF');
console.log('- Rload = 11Ω (理論阻抗匹配)');
console.log('- 理論諧振頻率 fr = 1/(2π√LC) = 70kHz');
console.log('- 理論特性阻抗 Z0 = √(L/C) = 11.0Ω');

// 計算理論值
const Lr = 25e-6;
const Cr = 207e-9;
const fr_theory = 1 / (2 * Math.PI * Math.sqrt(Lr * Cr));
const Z0_theory = Math.sqrt(Lr / Cr);

console.log(`\n📊 理論計算:`);
console.log(`- fr = ${(fr_theory/1000).toFixed(1)}kHz`);
console.log(`- Z0 = ${Z0_theory.toFixed(1)}Ω`);

// 頻率掃描測試
const frequencies = [60000, 65000, 70000, 75000, 80000]; // 60-80kHz
console.log('\n🔍 頻率掃描測試 (簡化為暫態分析):');

for (let freq of frequencies) {
    console.log(`\n測試頻率: ${(freq/1000).toFixed(1)}kHz`);
    
    // 重新建立電路 (因為需要改變頻率)
    const testSpice = new AkingSPICE();
    const testComponents = [
        new VoltageSource('V1', ['vin', '0'], 100, {type: 'SIN', frequency: freq, amplitude: 100}),
        new Inductor('Lr', ['vin', 'vres'], 25e-6),
        new Capacitor('Cr', ['vres', '0'], 207e-9),
        new Resistor('Rload', ['vres', '0'], 11.0),
    ];
    
    // 添加元件到電路
    for (const component of testComponents) {
        testSpice.addComponent(component);
    }
    
    try {
        // 進行暫態分析
        const result = testSpice.analyzeTransient({
            startTime: 0,
            stopTime: 20e-6,  // 20µs
            timeStep: 0.1e-6,  // 0.1µs
            maxTimeStep: 0.1e-6
        });
        
        if (result && result.nodeVoltages) {
            // 分析穩態響應 (後10µs)
            const steadyStartIndex = Math.floor(result.time.length * 0.5);
            let maxVout = 0, maxCurrent = 0;
            
            for (let i = steadyStartIndex; i < result.time.length; i++) {
                const vout = Math.abs(result.nodeVoltages.get('vres')[i] || 0);
                const current = Math.abs(result.branchCurrents.get('Lr')[i] || 0);
                
                if (vout > maxVout) maxVout = vout;
                if (current > maxCurrent) maxCurrent = current;
            }
            
            // 計算阻抗 Z = V/I
            const impedance = maxCurrent !== 0 ? (maxVout / maxCurrent) : Infinity;
            
            console.log(`  結果: Vout=${maxVout.toFixed(2)}V, I=${maxCurrent.toFixed(3)}A, Z=${impedance.toFixed(1)}Ω`);
            
            // 檢查是否接近理論諧振點
            if (Math.abs(freq - fr_theory) < 1000) {
                console.log(`    ⭐ 接近理論諧振頻率! Z應該≈${Z0_theory.toFixed(1)}Ω`);
                const error = Math.abs(impedance - Z0_theory) / Z0_theory * 100;
                console.log(`    阻抗誤差: ${error.toFixed(1)}%`);
            }
        } else {
            console.log(`  失敗: 無法獲得結果`);
        }
        
    } catch (error) {
        console.log(`  分析失敗: ${error.message}`);
    }
}

// 暫態分析測試 (70kHz正弦波)
console.log('\n🔍 詳細暫態分析測試 (70kHz):');
try {
    // 重新設置為70kHz正弦波
    const detailedSpice = new AkingSPICE();
    const detailedComponents = [
        new VoltageSource('V1', ['vin', '0'], 100, {type: 'SIN', frequency: 70000, amplitude: 100}),
        new Inductor('Lr', ['vin', 'vres'], 25e-6),
        new Capacitor('Cr', ['vres', '0'], 207e-9),
        new Resistor('Rload', ['vres', '0'], 11.0),
    ];
    
    // 添加元件
    for (const component of detailedComponents) {
        detailedSpice.addComponent(component);
    }
    
    const transientResult = detailedSpice.analyzeTransient({
        startTime: 0,
        stopTime: 100e-6,  // 100µs (7個週期)
        timeStep: 0.1e-6,  // 0.1µs
        maxTimeStep: 0.1e-6
    });
    
    if (transientResult && transientResult.nodeVoltages) {
        // 分析穩態響應 (後50µs)
        const steadyStartIndex = Math.floor(transientResult.time.length * 0.5);
        let maxVout = 0, maxCurrent = 0;
        
        for (let i = steadyStartIndex; i < transientResult.time.length; i++) {
            const vout = Math.abs(transientResult.nodeVoltages.get('vres')[i] || 0);
            const current = Math.abs(transientResult.branchCurrents.get('Lr')[i] || 0);
            
            if (vout > maxVout) maxVout = vout;
            if (current > maxCurrent) maxCurrent = current;
        }
        
        console.log(`- 穩態輸出電壓峰值: ${maxVout.toFixed(2)}V`);
        console.log(`- 穩態電流峰值: ${maxCurrent.toFixed(3)}A`);
        console.log(`- 實際阻抗: ${(maxVout/maxCurrent).toFixed(1)}Ω`);
        console.log(`- 理論阻抗: ${Z0_theory.toFixed(1)}Ω`);
        
        const impedanceError = Math.abs((maxVout/maxCurrent) - Z0_theory) / Z0_theory * 100;
        console.log(`- 阻抗誤差: ${impedanceError.toFixed(1)}%`);
        
        if (impedanceError < 10) {
            console.log('✅ LRC諧振電路工作正常');
        } else {
            console.log('❌ LRC諧振電路存在問題');
        }
    }
    
} catch (error) {
    console.log(`暫態分析失敗: ${error.message}`);
}

console.log('\n📋 測試完成');