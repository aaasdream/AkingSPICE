/**
 * BDF2 係數測試 - 檢查變步長 BDF2 係數計算
 */

console.log('🧮 測試 BDF2 係數計算');
console.log('==================================================');

// 測試 1: 等步長情況 (h_n = h_{n-1} = h)
console.log('\n📐 測試 1: 等步長情況');
const h = 1e-6;
const h_n = h;
const h_nm1 = h;

const alpha = (2 * h_n + h_nm1) / (h_n * (h_n + h_nm1));
const beta = -(h_n + h_nm1) / (h_n * h_nm1);
const gamma = h_n / (h_nm1 * (h_n + h_nm1));

console.log(`h_n = ${h_n}, h_{n-1} = ${h_nm1}`);
console.log(`α = ${alpha} (理論值: 3/2 = 1.5)`);
console.log(`β = ${beta} (理論值: -2)`);
console.log(`γ = ${gamma} (理論值: 1/2 = 0.5)`);

// 檢查係數和 (應該為 0)
const sum = alpha + beta + gamma;
console.log(`α + β + γ = ${sum} (應該接近 0)`);

// 測試 2: 變步長情況
console.log('\n📐 測試 2: 變步長情況 (h_n = 2*h_{n-1})');
const h_n2 = 2e-6;
const h_nm1_2 = 1e-6;

const alpha2 = (2 * h_n2 + h_nm1_2) / (h_n2 * (h_n2 + h_nm1_2));
const beta2 = -(h_n2 + h_nm1_2) / (h_n2 * h_nm1_2);
const gamma2 = h_n2 / (h_nm1_2 * (h_n2 + h_nm1_2));

console.log(`h_n = ${h_n2}, h_{n-1} = ${h_nm1_2}`);
console.log(`α = ${alpha2}`);
console.log(`β = ${beta2}`);
console.log(`γ = ${gamma2}`);

// 檢查係數和
const sum2 = alpha2 + beta2 + gamma2;
console.log(`α + β + γ = ${sum2} (應該接近 0)`);

// 測試 3: 數值穩定性檢查
console.log('\n🔬 測試 3: 電感伴隨模型穩定性');

// 假設電感值和歷史電流
const L = 150e-6; // 150 µH
const R = 0;      // 無電阻

// 測試步長
const h_test = 1e-6;
const R_eq = R + L * (3/2) / h_test; // 等步長 BDF2: α = 3/2
console.log(`R_eq = R + L*α/h = ${R} + ${L} * 1.5 / ${h_test} = ${R_eq} Ω`);

// 測試歷史電流項對穩定性的影響
const i_nm1 = 1.0; // 1A
const i_nm2 = 0.5; // 0.5A

const V_eq_be = (L / h_test) * i_nm1; // 後向歐拉
const V_eq_bdf2 = L * (-2 * i_nm1 + 0.5 * i_nm2); // BDF2 等步長

console.log(`\n後向歐拉 V_eq = ${V_eq_be} V`);
console.log(`BDF2 V_eq = ${V_eq_bdf2} V`);

// 穩定性分析：放大因子
console.log(`\n🔍 穩定性分析:`);
console.log(`R_eq = ${R_eq} Ω (很大，有利於穩定性)`);
console.log(`V_eq 歷史項能否導致振盪？`);

// 如果電流從正變負，V_eq 的符號變化
const i_osc1 = 1e6;   // 1MA
const i_osc2 = -1e6;  // -1MA
const V_eq_osc = L * (beta * i_osc1 + gamma * i_osc2);
console.log(`振盪情況: i_{n-1}=${i_osc1}, i_{n-2}=${i_osc2}`);
console.log(`V_eq = ${V_eq_osc} V (極大值可能導致數值問題)`);

console.log('\n✅ BDF2 係數測試完成');