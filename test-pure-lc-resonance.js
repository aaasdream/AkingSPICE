// 測試純LC諧振網路，排除變壓器影響
import { AkingSPICE } from './src/index.js';
import { VoltageSource } from './src/components/sources.js';
import { Inductor } from './src/components/inductor.js';
import { Capacitor } from './src/components/capacitor.js';
import { Resistor } from './src/components/resistor.js';
import { VoltageControlledMOSFET } from './src/components/vcmosfet.js';

console.log("=== 純LC諧振網路測試 ===");

const solver = new AkingSPICE();

// LLC參數
const p = {
    Vin: 800,
    Lr: 25e-6,    // 25μH 諧振電感
    Cr: 207e-9,   // 207nF 諧振電容
    Rtest: 50     // 50Ω 測試負載（接近Z0=11Ω的5倍）
};

console.log(`諧振參數:`);
const fr = 1 / (2 * Math.PI * Math.sqrt(p.Lr * p.Cr));
const Z0 = Math.sqrt(p.Lr / p.Cr);
console.log(`- 諧振頻率 fr = ${(fr/1000).toFixed(1)}kHz`);
console.log(`- 特性阻抗 Z0 = ${Z0.toFixed(1)}Ω`);
console.log(`- 測試負載 R = ${p.Rtest}Ω (${(p.Rtest/Z0).toFixed(1)}×Z0)`);

console.log("\n測試1: DC分析（純諧振網路）");
console.log("----------------------------------------");

// 建立純LC諧振電路：Vin -> Lr -> Cr -> Rtest -> GND
solver.components = [
    new VoltageSource('Vin', ['vin', '0'], p.Vin),           // 800V輸入
    new Inductor('Lr', ['vin', 'lc_node'], p.Lr),          // 諧振電感
    new Capacitor('Cr', ['lc_node', 'out'], p.Cr),         // 諧振電容
    new Resistor('Rtest', ['out', '0'], p.Rtest)            // 測試負載
];

try {
    const dcResult = await solver.runDCAnalysis();
    
    console.log("DC解:");
    console.log(`V(vin) = ${dcResult.nodeVoltages.get('vin')?.toFixed(3)}V`);
    console.log(`V(lc_node) = ${dcResult.nodeVoltages.get('lc_node')?.toFixed(3)}V`);
    console.log(`V(out) = ${dcResult.nodeVoltages.get('out')?.toFixed(3)}V`);
    
    // DC情況下：電感=短路，電容=開路
    // 所以 V(lc_node) = V(vin) = 800V, V(out) = 0V
    console.log("DC理論值: V(lc_node)=800V, V(out)=0V");
    
} catch (error) {
    console.error("DC分析失敗:", error.message);
}

console.log("\n測試2: 瞬態分析（方波驅動）");
console.log("----------------------------------------");

// 重新配置為方波驅動的LC諧振電路
solver.components = [
    new VoltageControlledMOSFET('Q1', ['vin', 'G1', 'sw_node'], { Ron: 0.05, Roff: 1e7 }),  // 上橋MOSFET
    new VoltageControlledMOSFET('Q2', ['0', 'G2', 'sw_node'], { Ron: 0.05, Roff: 1e7 }),    // 下橋MOSFET
    new VoltageSource('Vin', ['vin', '0'], p.Vin),           // 800V母線
    new VoltageSource('VG1', ['G1', '0'], 0),               // Q1門極控制
    new VoltageSource('VG2', ['G2', '0'], 0),               // Q2門極控制
    
    new Inductor('Lr', ['sw_node', 'lc_node'], p.Lr),      // 諧振電感
    new Capacitor('Cr', ['lc_node', 'out'], p.Cr),         // 諧振電容  
    new Resistor('Rtest', ['out', '0'], p.Rtest)            // 測試負載
];

try {
    const transientCommand = '.tran 2n 50u';  // 2ns步長，50μs仿真時間
    const transientResult = await solver.runTransientAnalysis(transientCommand);

    console.log("瞬態分析設置:");
    console.log(`- 仿真時間: 50μs`);
    console.log(`- 時間步長: 2ns`);
    console.log(`- 方波頻率: 將設為${(fr/1000).toFixed(1)}kHz（諧振頻率）`);

    // 在瞬態過程中應用75kHz方波控制
    let step = 0;
    const controllerUpdateInterval = 1000; // 每1000步更新一次控制
    
    for (const result of transientResult) {
        step++;
        
        // 75kHz方波控制 (周期 = 13.33μs)
        if (step % controllerUpdateInterval === 0) {
            const t = step * 2e-9; // 當前時間
            const T = 1 / 75000;    // 75kHz周期
            const duty = 0.5;       // 50%占空比
            
            const phase = (t % T) / T;
            const q1_on = phase < duty;
            
            // 更新門極驅動
            const vg1 = solver.components.find(c => c.name === 'VG1');
            const vg2 = solver.components.find(c => c.name === 'VG2');
            
            if (vg1 && vg2) {
                vg1.voltage = q1_on ? 12 : 0;
                vg2.voltage = q1_on ? 0 : 12;
            }
            
            // 讀取關鍵電壓和電流
            if (step % (controllerUpdateInterval * 5) === 0) { // 每5000步打印一次
                const V_lc = result.nodeVoltages.get('lc_node') || 0;
                const V_out = result.nodeVoltages.get('out') || 0;
                const V_sw = result.nodeVoltages.get('sw_node') || 0;
                
                // 嘗試讀取諧振電感電流
                const lr_component = solver.components.find(c => c.name === 'Lr');
                let I_lr = "N/A";
                if (lr_component && lr_component.getCurrent) {
                    try {
                        I_lr = lr_component.getCurrent().toFixed(3) + "A";
                    } catch (e) {
                        I_lr = "Error";
                    }
                }
                
                console.log(`t=${(t*1e6).toFixed(1)}μs: V_sw=${V_sw.toFixed(1)}V, V_lc=${V_lc.toFixed(1)}V, V_out=${V_out.toFixed(3)}V, I(Lr)=${I_lr}, Q1=${q1_on?'ON':'OFF'}`);
            }
        }
        
        if (step >= 20000) break; // 限制仿真步數
    }

} catch (error) {
    console.error("瞬態分析失敗:", error.message);
}

console.log("\n測試3: 理論計算驗證");
console.log("----------------------------------------");

// 計算期望的諧振電流
const Vamp = p.Vin;  // 方波幅度
const Q = p.Rtest / Z0;  // 品質因子
console.log(`品質因子 Q = R/Z0 = ${Q.toFixed(1)}`);

// 在諧振頻率下，LC諧振電路的電流幅度約為 V/Z0 * (1/damping_factor)
const expected_I_peak = Vamp / Z0;  // 理想情況下的峰值電流
console.log(`理論峰值電流 I_peak ≈ V/Z0 = ${expected_I_peak.toFixed(1)}A`);

// 考慮阻尼效應
const damped_I_peak = expected_I_peak / (1 + 1/(2*Q));
console.log(`考慮阻尼的電流 I_damped ≈ ${damped_I_peak.toFixed(1)}A`);

console.log("\n如果純LC網路的電流遠低於理論值，問題在MNA實現；");
console.log("如果純LC網路正常，問題在變壓器耦合。");