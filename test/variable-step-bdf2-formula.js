/**
 * 變步長 BDF2 公式推導和驗證
 * 
 * 標準 BDF2 (等步長): (3y_n - 4y_{n-1} + y_{n-2})/(2h) = y'_n
 * 
 * 變步長 BDF2: 設 r = h_n/h_{n-1}，則：
 * α*y_n + β*y_{n-1} + γ*y_{n-2} = y'_n * h_n
 * 
 * 其中:
 * α = (1 + 2r)/(1 + r)
 * β = -(1 + r)
 * γ = r²/(1 + r)
 */

console.log('📚 變步長 BDF2 公式推導驗證');
console.log('============================================');

// 測試 1: 等步長情況 (r = 1)
console.log('\n測試 1: 等步長 (r = h_n/h_{n-1} = 1)');
const r1 = 1;
const alpha1 = (1 + 2*r1) / (1 + r1);
const beta1 = -(1 + r1);
const gamma1 = (r1 * r1) / (1 + r1);

console.log(`r = ${r1}`);
console.log(`α = ${alpha1} (期望: 3/2 = 1.5)`);
console.log(`β = ${beta1} (期望: -2)`);
console.log(`γ = ${gamma1} (期望: 1/2 = 0.5)`);

// 驗證：對於等步長，應該得到標準 BDF2 係數
console.log(`標準檢查: α=${alpha1}, β=${beta1}, γ=${gamma1}`);
console.log(`是否匹配標準 BDF2? α=1.5: ${Math.abs(alpha1 - 1.5) < 1e-10}, β=-2: ${Math.abs(beta1 + 2) < 1e-10}, γ=0.5: ${Math.abs(gamma1 - 0.5) < 1e-10}`);

// 測試 2: 變步長情況 (r = 2)
console.log('\n測試 2: 變步長 (r = 2, 即 h_n = 2*h_{n-1})');
const r2 = 2;
const alpha2 = (1 + 2*r2) / (1 + r2);
const beta2 = -(1 + r2);
const gamma2 = (r2 * r2) / (1 + r2);

console.log(`r = ${r2}`);
console.log(`α = ${alpha2}`);
console.log(`β = ${beta2}`);
console.log(`γ = ${gamma2}`);

// 測試 3: 轉換為電感方程
console.log('\n測試 3: 電感方程中的應用');
console.log('電感方程: v = L * di/dt + R * i');
console.log('BDF2 近似: di/dt ≈ (α*i_n + β*i_{n-1} + γ*i_{n-2}) / h_n');

const L = 150e-6; // 150 µH
const R = 0;      // 無電阻
const h_n = 1e-6; // 1 µs

console.log(`\n等步長情況 (r=1):`);
// v = R*i_n + L*(α*i_n + β*i_{n-1} + γ*i_{n-2})/h_n
// v = (R + L*α/h_n)*i_n + L*(β*i_{n-1} + γ*i_{n-2})/h_n
const R_eq1 = R + L * alpha1 / h_n;
console.log(`R_eq = R + L*α/h_n = ${R} + ${L} * ${alpha1} / ${h_n} = ${R_eq1} Ω`);

console.log(`\n變步長情況 (r=2):`);
const h_n_var = 2e-6; // 當前步長
const R_eq2 = R + L * alpha2 / h_n_var;
console.log(`R_eq = R + L*α/h_n = ${R} + ${L} * ${alpha2} / ${h_n_var} = ${R_eq2} Ω`);

console.log('\n✅ 變步長 BDF2 公式驗證完成');