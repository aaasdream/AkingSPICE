// LLC諧振電流與變壓器互感相位關係診斷
import fs from 'fs';
import { AkingSPICE } from './src/index.js';
import { VoltageSource } from './src/components/sources.js';
import { Inductor } from './src/components/inductor.js';
import { Capacitor } from './src/components/capacitor.js';
import { Resistor } from './src/components/resistor.js';
import { VoltageControlledMOSFET } from './src/components/vcmosfet.js';
import { MultiWindingTransformer } from './src/components/transformer.js';

console.log("=== LLC諧振電流與變壓器互感相位診斷 ===");

// 創建簡化的LLC諧振網路測試
const solver = new AkingSPICE();

// 參數
const p = {
    Vin: 800,
    Lr: 25e-6,
    Cr: 207e-9,
    Lm: 50e-6,
    turns_ratio: 6,
    Rload: 100
};

console.log("測試1: 純諧振網路（無變壓器）");
console.log("----------------------------------------");

// 添加純諧振電路元件（不含變壓器）
solver.components = [
    new VoltageSource('Vin', ['vin', '0'], p.Vin),
    new Inductor('Lr', ['vin', 'res_node'], p.Lr),
    new Capacitor('Cr', ['res_node', 'tank_out'], p.Cr),
    new Resistor('Rtest', ['tank_out', '0'], 50)  // 測試負載50Ω (接近Z0)
];

try {
    // DC分析
    const dcResult = solver.solveDC();
    console.log("DC解:");
    console.log("V(res_node):", dcResult.nodeVoltages.get('res_node')?.toFixed(3));
    console.log("V(tank_out):", dcResult.nodeVoltages.get('tank_out')?.toFixed(3));
    
    // 諧振頻率計算
    const fr = 1 / (2 * Math.PI * Math.sqrt(p.Lr * p.Cr));
    const Z0 = Math.sqrt(p.Lr / p.Cr);
    console.log(`\n理論諧振頻率: ${(fr/1000).toFixed(1)}kHz`);
    console.log(`特性阻抗 Z0: ${Z0.toFixed(1)}Ω`);

} catch (error) {
    console.error("純諧振網路測試失敗:", error.message);
}

console.log("\n測試2: 帶變壓器的諧振網路");
console.log("----------------------------------------");

// 重置並添加帶變壓器的電路
solver.components = [
    new VoltageSource('Vin', ['vin', '0'], p.Vin),
    new Inductor('Lr', ['vin', 'res_node'], p.Lr),
    new Capacitor('Cr', ['res_node', 'sw_b'], p.Cr),
];

// 添加變壓器（使用LLC電路的實際配置）
const transformer = new MultiWindingTransformer('T1', {
    windings: [
        { name: 'primary', nodes: ['res_node', 'sw_b'], inductance: p.Lm, turns: p.turns_ratio },
        { name: 'sec_a', nodes: ['sec_a', 'sec_ct'], inductance: p.Lm / (p.turns_ratio**2), turns: 1 },
        { name: 'sec_b', nodes: ['sec_b', 'sec_ct'], inductance: p.Lm / (p.turns_ratio**2), turns: 1 }
    ],
    couplingMatrix: [
        [1.0, 0.98, -0.95],      // 一次側與sec_a耦合，與sec_b反向耦合
        [0.98, 1.0, -0.90],      // sec_a與sec_b反向耦合
        [-0.95, -0.90, 1.0]      // sec_b與其他反向，係數較小確保穩定性
    ]
});

solver.components.push(transformer);

// 添加二次側負載
solver.components.push(new Resistor('Rload_a', ['sec_a', 'sec_ct'], p.Rload));
solver.components.push(new Resistor('Rload_b', ['sec_b', 'sec_ct'], p.Rload));

try {
    // DC分析
    const dcResult2 = solver.solveDC();
    console.log("DC解（帶變壓器）:");
    console.log("V(res_node):", dcResult2.nodeVoltages.get('res_node')?.toFixed(3));
    console.log("V(sw_b):", dcResult2.nodeVoltages.get('sw_b')?.toFixed(3));
    console.log("V(sec_a):", dcResult2.nodeVoltages.get('sec_a')?.toFixed(3));
    console.log("V(sec_b):", dcResult2.nodeVoltages.get('sec_b')?.toFixed(3));

    // 檢查變壓器中的元件
    console.log("\n變壓器內部元件分析:");
    const inductors = transformer.inductors;
    console.log("電感數量:", inductors.length);
    
    for (let i = 0; i < inductors.length; i++) {
        const L = inductors[i];
        console.log(`電感${i+1} (${L.name}):`, 
                   `L=${(L.getInductance()*1e6).toFixed(1)}μH,`,
                   `節點=[${L.nodes.join(', ')}]`);
        
        // 檢查耦合
        if (L.couplings) {
            console.log(`  耦合數量: ${L.couplings.length}`);
            for (const coupling of L.couplings) {
                console.log(`    與 ${coupling.inductor.name}: M=${(coupling.mutualInductance*1e6).toFixed(3)}μH`);
            }
        }
    }

} catch (error) {
    console.error("帶變壓器測試失敗:", error.message);
}

console.log("\n測試3: 檢查變壓器耦合對諧振的影響");
console.log("----------------------------------------");

// 計算等效一次側電感
const L_primary = p.Lm;  // 變壓器一次側磁化電感
const L_total_primary = p.Lr + L_primary;  // 總一次側電感
console.log(`外部諧振電感 Lr: ${(p.Lr*1e6).toFixed(1)}μH`);
console.log(`變壓器磁化電感 Lm: ${(L_primary*1e6).toFixed(1)}μH`);  
console.log(`總一次側電感: ${(L_total_primary*1e6).toFixed(1)}μH`);

// 計算反射負載對諧振的影響
const n = p.turns_ratio;
const R_reflected = p.Rload * n * n;  // 反射到一次側的負載
console.log(`\n負載分析:`);
console.log(`二次側負載: ${p.Rload}Ω`);
console.log(`反射到一次側: ${R_reflected}Ω`);
console.log(`與特性阻抗比值: ${(R_reflected/11.0).toFixed(1)} (>> 1 表示輕負載)`);

// 如果負載太輕，諧振電流可能很小
console.log(`\n負載影響分析:`);
console.log(`如果 R_reflected >> Z0，則諧振電流 ≈ Vin / R_reflected`);
console.log(`預期諧振電流: ${(p.Vin / R_reflected * 1000).toFixed(1)}mA`);
console.log(`這可能解釋了為什麼諧振電流很小！`);

// 建議的負載修正
const optimal_R_reflected = 11 * 5;  // 5倍特性阻抗，適中負載  
const optimal_R_secondary = optimal_R_reflected / (n * n);
console.log(`\n建議的負載調整:`);
console.log(`建議反射負載: ${optimal_R_reflected}Ω (5×Z0)`);
console.log(`建議二次側負載: ${optimal_R_secondary.toFixed(1)}Ω`);
console.log(`預期諧振電流: ${(p.Vin / optimal_R_reflected * 1000).toFixed(0)}mA`);