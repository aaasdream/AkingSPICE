/**
 * 驗證CPU線性求解結果
 * 
 * 目的：確認原始診斷測試中的期望值是否正確
 */

// 手動求解線性方程組以驗證期望值
console.log('🔍 手動線性方程組求解驗證');
console.log('============================================================');

// 系統方程：G * v = rhs
// [[1e6, -1e-3], [-1e-3, 1e6]] * [v0, v1] = [1e7, 0]

const G = [[1e6, -1e-3], [-1e-3, 1e6]];
const rhs = [1e7, 0];

console.log('線性系統:');
console.log(`G矩陣:`);
console.log(`  [${G[0][0].toExponential(3)}, ${G[0][1].toExponential(3)}]`);
console.log(`  [${G[1][0].toExponential(3)}, ${G[1][1].toExponential(3)}]`);
console.log(`RHS向量: [${rhs[0].toExponential(3)}, ${rhs[1]}]`);

console.log('\n🧮 解法1: 克拉默法則 (Cramer\'s Rule)');

// 計算行列式
const det_G = G[0][0] * G[1][1] - G[0][1] * G[1][0];
console.log(`det(G) = ${det_G.toExponential(6)}`);

// v0 = det([[rhs[0], G[0][1]], [rhs[1], G[1][1]]]) / det(G)
const det_v0 = rhs[0] * G[1][1] - G[0][1] * rhs[1];
const v0 = det_v0 / det_G;

// v1 = det([[G[0][0], rhs[0]], [G[1][0], rhs[1]]]) / det(G)  
const det_v1 = G[0][0] * rhs[1] - rhs[0] * G[1][0];
const v1 = det_v1 / det_G;

console.log(`v0 = ${det_v0.toExponential(6)} / ${det_G.toExponential(6)} = ${v0.toFixed(9)}`);
console.log(`v1 = ${det_v1.toExponential(6)} / ${det_G.toExponential(6)} = ${v1.toFixed(9)}`);

console.log('\n🧮 解法2: 消元法驗證');

// 方程1: 1e6*v0 - 1e-3*v1 = 1e7  ... (1)
// 方程2: -1e-3*v0 + 1e6*v1 = 0     ... (2)

// 從方程2解出 v1: v1 = 1e-3*v0 / 1e6 = 1e-9*v0
console.log('從方程2: v1 = 1e-9 * v0');

// 代入方程1: 1e6*v0 - 1e-3*(1e-9*v0) = 1e7
// 1e6*v0 - 1e-12*v0 = 1e7
// v0*(1e6 - 1e-12) ≈ v0*1e6 = 1e7
// v0 = 10

const v0_elim = 1e7 / 1e6;
const v1_elim = 1e-9 * v0_elim;

console.log(`v0 = ${v0_elim.toFixed(9)}`);
console.log(`v1 = ${v1_elim.toExponential(9)}`);

console.log('\n🔬 驗證解的正確性');

// 檢驗：G * [v0, v1] = rhs
const verify1 = G[0][0] * v0 + G[0][1] * v1;
const verify2 = G[1][0] * v0 + G[1][1] * v1;

console.log(`驗證方程1: ${G[0][0].toExponential(3)}*${v0.toFixed(6)} + ${G[0][1].toExponential(3)}*${v1.toExponential(6)} = ${verify1.toExponential(6)}`);
console.log(`期望值1: ${rhs[0].toExponential(6)}, 誤差: ${Math.abs(verify1 - rhs[0]).toExponential(3)}`);

console.log(`驗證方程2: ${G[1][0].toExponential(3)}*${v0.toFixed(6)} + ${G[1][1].toExponential(3)}*${v1.toExponential(6)} = ${verify2.toExponential(6)}`);
console.log(`期望值2: ${rhs[1]}, 誤差: ${Math.abs(verify2 - rhs[1]).toExponential(3)}`);

console.log('\n📊 總結');
console.log('========================================');
console.log(`✅ 正確解: v = [${v0.toFixed(6)}, ${v1.toExponential(6)}]`);
console.log(`❌ 診斷測試中的錯誤期望值: [10, 6.666667]`);
console.log('');
console.log('🎯 結論: WebGPU 和手動Jacobi迭代都是正確的！');
console.log('       問題在於診斷測試使用了錯誤的期望值');
console.log('       節點1的正確值應該是 ~1e-8，不是 6.666667');