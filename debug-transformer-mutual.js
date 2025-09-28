// 診斷變壓器互感計算和MNA實現
import { MultiWindingTransformer } from './src/components/transformer.js';

console.log("=== LLC變壓器互感診斷 ===");

// 創建LLC變壓器配置 - 使用正確的格式
const llcTransformer = new MultiWindingTransformer('T1', {
    windings: [
        { name: 'primary', nodes: ['p.pri', 'p.pri2'], inductance: 50e-6, turns: 6 },    // 一次側磁化電感 50μH
        { name: 'sec_a', nodes: ['p.sec1', 'p.sec_ct'], inductance: 1.39e-6, turns: 1 }, // 二次側電感 1.39μH (50μH/36)
        { name: 'sec_b', nodes: ['p.sec2', 'p.sec_ct'], inductance: 1.39e-6, turns: 1 }  // 二次側電感 1.39μH (50μH/36)
    ],
    couplingMatrix: [
        [1.0, 0.98, -0.95],      // 一次側與sec_a耦合，與sec_b反向耦合
        [0.98, 1.0, -0.90],      // sec_a與sec_b反向耦合  
        [-0.95, -0.90, 1.0]      // sec_b與其他反向，係數較小確保穩定性
    ]
});

// 設置耦合矩陣 - 與LLC電路相同
const couplingMatrix = [
    [1.0, 0.98, -0.95],
    [0.98, 1.0, -0.90],
    [-0.95, -0.90, 1.0]
];

// 計算互感矩陣
const mutualMatrix = llcTransformer.calculateMutualInductanceMatrix(couplingMatrix);

console.log("互感矩陣計算結果:");
console.log("L11 (一次側自感):", (mutualMatrix[0][0] * 1e6).toFixed(1), "μH");
console.log("L22 (sec_a自感):", (mutualMatrix[1][1] * 1e6).toFixed(3), "μH");  
console.log("L33 (sec_b自感):", (mutualMatrix[2][2] * 1e6).toFixed(3), "μH");
console.log("M12 (一次→sec_a互感):", (mutualMatrix[0][1] * 1e6).toFixed(3), "μH");
console.log("M13 (一次→sec_b互感):", (mutualMatrix[0][2] * 1e6).toFixed(3), "μH");
console.log("M21 (sec_a→一次互感):", (mutualMatrix[1][0] * 1e6).toFixed(3), "μH");
console.log("M31 (sec_b→一次互感):", (mutualMatrix[2][0] * 1e6).toFixed(3), "μH");

// 計算耦合係數
const L1 = mutualMatrix[0][0];
const L2 = mutualMatrix[1][1];
const L3 = mutualMatrix[2][2];
const M12 = mutualMatrix[0][1];
const M13 = mutualMatrix[0][2];
const M21 = mutualMatrix[1][0];
const M31 = mutualMatrix[2][0];

console.log("\n耦合係數驗證:");
const k12_calculated = M12 / Math.sqrt(L1 * L2);
const k13_calculated = M13 / Math.sqrt(L1 * L3);
const k21_calculated = M21 / Math.sqrt(L1 * L2);
const k31_calculated = M31 / Math.sqrt(L1 * L3);
console.log("k12 (計算值):", k12_calculated.toFixed(3));
console.log("k13 (計算值):", k13_calculated.toFixed(3));
console.log("k21 (計算值):", k21_calculated.toFixed(3));
console.log("k31 (計算值):", k31_calculated.toFixed(3));
console.log("k12 (原始值):", couplingMatrix[0][1]);
console.log("k13 (原始值):", couplingMatrix[0][2]);
console.log("k21 (原始值):", couplingMatrix[1][0]);
console.log("k31 (原始值):", couplingMatrix[2][0]);

// 檢查互感的對稱性
console.log("\n互感對稱性檢查:");
console.log("M12 = M21?", Math.abs(M12 - M21) < 1e-12 ? "✓" : "✗");
console.log("M13 = M31?", Math.abs(M13 - M31) < 1e-12 ? "✓" : "✗");
console.log("M12:", M12);
console.log("M21:", M21);
console.log("M13:", M13);
console.log("M31:", M31);

// 分析負值耦合的影響
console.log("\n負值耦合分析:");
console.log("couplingMatrix[0][2] = -0.95 意味著:");
console.log("- 一次側電流變化時，在sec_b感應出相位相反的電壓");
console.log("- couplingMatrix[2][0] = -0.95 意味著:");
console.log("- sec_b電流變化時，在一次側感應出相位相反的電壓");
console.log("- 這是全橋整流器中心抽頭變壓器的正常行為");
console.log("- 但在MNA中，互感項使用 -M/h，所以負耦合變成正項");

// 理論驗證：6:1匝比的期望值
const turns_ratio = 6;
const expected_L2 = L1 / (turns_ratio * turns_ratio);
const actual_ratio = Math.sqrt(L1 / L2);

console.log("\n匝比驗證:");
console.log("預期二次側電感:", (expected_L2 * 1e6).toFixed(3), "μH");
console.log("實際sec_a電感:", (L2 * 1e6).toFixed(3), "μH");
console.log("實際sec_b電感:", (L3 * 1e6).toFixed(3), "μH");
console.log("計算匝比(sec_a):", actual_ratio.toFixed(1));
console.log("目標匝比:", turns_ratio);

// MNA影響分析
console.log("\nMNA矩陣影響分析:");
console.log("在瞬態分析中，互感項為: -M/h");
console.log("M12 =", (M12 * 1e6).toFixed(3), "μH (正值)");
console.log("M13 =", (M13 * 1e6).toFixed(3), "μH (負值)");
console.log("M21 =", (M21 * 1e6).toFixed(3), "μH (正值)");
console.log("M31 =", (M31 * 1e6).toFixed(3), "μH (負值)");
console.log("假設時間步長 h = 1e-8s：");
const h = 1e-8;
console.log("一次側對sec_a MNA項 (-M12/h):", (-M12/h).toFixed(0));
console.log("一次側對sec_b MNA項 (-M13/h):", (-M13/h).toFixed(0));
console.log("sec_a對一次側MNA項 (-M21/h):", (-M21/h).toFixed(0));
console.log("sec_b對一次側MNA項 (-M31/h):", (-M31/h).toFixed(0));