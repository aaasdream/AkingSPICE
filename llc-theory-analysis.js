// 簡化的諧振電流理論驗證
import fs from 'fs';

console.log("=== LLC諧振電流理論分析 ===");

// LLC參數
const p = {
    Vin: 800,
    Lr: 25e-6,      // 25μH 諧振電感
    Cr: 207e-9,     // 207nF 諧振電容
    Lm: 50e-6,      // 50μH 磁化電感
    turns_ratio: 6,  // 6:1 匝比
    Rload: 1.5      // 1.5Ω 負載（二次側）
};

console.log("=== 基本參數 ===");
console.log(`輸入電壓: ${p.Vin}V`);
console.log(`諧振電感: ${p.Lr*1e6}μH`);
console.log(`諧振電容: ${p.Cr*1e9}nF`);
console.log(`磁化電感: ${p.Lm*1e6}μH`);
console.log(`變壓器匝比: ${p.turns_ratio}:1`);
console.log(`二次側負載: ${p.Rload}Ω`);

// 計算諧振網路參數
const fr = 1 / (2 * Math.PI * Math.sqrt(p.Lr * p.Cr));
const Z0 = Math.sqrt(p.Lr / p.Cr);
const wr = 2 * Math.PI * fr;

console.log("\n=== 諧振網路分析 ===");
console.log(`諧振頻率 fr = ${(fr/1000).toFixed(1)}kHz`);
console.log(`諧振角頻率 ωr = ${(wr/1000).toFixed(0)}k rad/s`);
console.log(`特性阻抗 Z0 = ${Z0.toFixed(1)}Ω`);

// 計算負載影響
const R_reflected = p.Rload * p.turns_ratio * p.turns_ratio;
const Q_load = R_reflected / Z0;

console.log("\n=== 負載分析 ===");
console.log(`反射到一次側的負載: ${R_reflected}Ω`);
console.log(`負載品質因子 Q = R_ref/Z0 = ${Q_load.toFixed(1)}`);

// 在LLC轉換器中，有效負載還包括磁化電感的並聯效應
const Z_Lm_at_fr = wr * p.Lm;  // 磁化電感在諧振頻率的阻抗
const R_parallel = (R_reflected * Z_Lm_at_fr) / (R_reflected + Z_Lm_at_fr);

console.log(`磁化電感阻抗 @fr: ${(Z_Lm_at_fr/1000).toFixed(1)}kΩ`);
console.log(`並聯後的等效負載: ${R_parallel.toFixed(1)}Ω`);

// 諧振電流計算
console.log("\n=== 諧振電流理論計算 ===");

// 方法1：基本諧振電路理論
const I_basic = p.Vin / Z0;
console.log(`基本理論 I = V/Z0 = ${I_basic.toFixed(1)}A`);

// 方法2：考慮負載阻尼
const I_with_load = p.Vin / Math.sqrt(Z0*Z0 + (Z0*Z0/(4*Q_load*Q_load)));
console.log(`考慮負載阻尼 I = ${I_with_load.toFixed(1)}A`);

// 方法3：LLC特定分析 - 輕負載情況
const I_light_load = p.Vin / R_reflected;
console.log(`輕負載近似 I ≈ V/R_ref = ${I_light_load.toFixed(3)}A`);

// 方法4：準確的LLC諧振分析
// 在LLC轉換器中，一次側電感 = Lr + Lm（磁化電感與負載串聯時）
const L_total = p.Lr + p.Lm;
const fr_corrected = 1 / (2 * Math.PI * Math.sqrt(L_total * p.Cr));
const Z0_corrected = Math.sqrt(L_total / p.Cr);

console.log("\n=== 修正的LLC分析 ===");
console.log(`總一次側電感: ${(L_total*1e6).toFixed(1)}μH`);
console.log(`修正諧振頻率: ${(fr_corrected/1000).toFixed(1)}kHz`);
console.log(`修正特性阻抗: ${Z0_corrected.toFixed(1)}Ω`);

const I_corrected = p.Vin / Z0_corrected;
console.log(`修正理論電流: ${I_corrected.toFixed(1)}A`);

// 實際觀察值比較
const I_observed = 0.26;  // 從仿真中觀察到的值
console.log("\n=== 理論vs實際比較 ===");
console.log(`實際觀察電流: ${I_observed}A`);
console.log(`基本理論誤差: ${((I_basic/I_observed - 1)*100).toFixed(0)}%`);
console.log(`輕負載理論誤差: ${((I_light_load/I_observed - 1)*100).toFixed(0)}%`);
console.log(`修正理論誤差: ${((I_corrected/I_observed - 1)*100).toFixed(0)}%`);

// 診斷結論
console.log("\n=== 診斷結論 ===");
if (Math.abs(I_light_load - I_observed) < 0.05) {
    console.log("✓ 輕負載理論與實際值匹配 - 這表示負載確實限制了電流");
    console.log("✓ LLC轉換器在極輕負載下，電流主要由負載決定，而非諧振特性");
    console.log("✓ 要增加諧振電流，需要：1)降低負載阻抗，或2)增加驅動電壓");
} else if (Math.abs(I_corrected - I_observed) < 5) {
    console.log("✓ 修正理論與實際值匹配 - MNA實現基本正確");
    console.log("✓ 問題可能在變壓器耦合或控制策略");
} else {
    console.log("✗ 所有理論值都與實際值不匹配");
    console.log("✗ 可能問題：MNA實現錯誤、元件模型錯誤、或仿真參數問題");
}

// 改進建議
console.log("\n=== 改進建議 ===");
console.log("1. 負載調整：將二次側負載降至0.3Ω，使反射負載≈10Ω≈Z0");
console.log("2. 頻率調整：在較低於諧振頻率處操作，利用感性特性增加電流");
console.log("3. 控制策略：增加功率傳輸，可能需要更積極的控制策略");
console.log("4. 變壓器檢查：驗證互感計算和MNA印花是否正確");