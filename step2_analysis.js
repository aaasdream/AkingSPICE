// 步驟2：最簡變壓器診斷 - 直接打印耦合矩陣分析
console.log("🔧 步驟2：變壓器耦合矩陣分析");

console.log("\n📊 LLC原始耦合矩陣:");
const originalMatrix = [
    [1.0, 0.9999, 0.9999],
    [0.9999, 1.0, -1.0], 
    [0.9999, -1.0, 1.0]
];

console.log("Primary-Sec1 耦合: +0.9999 (強正耦合)");
console.log("Primary-Sec2 耦合: +0.9999 (強正耦合)"); 
console.log("Sec1-Sec2 耦合: -1.0 (完美反耦合 - 中心抽頭)");

console.log("\n🔍 理論變壓分析:");
const L_pri = 500e-6;    // 500µH
const L_sec = 2000e-6;   // 2000µH each
const turns_ratio = Math.sqrt(L_sec / L_pri);
console.log(`匝比 n = √(L_sec/L_pri) = √(${L_sec*1e6}µH/${L_pri*1e6}µH) = ${turns_ratio.toFixed(2)}:1`);

console.log("\n⚡ 變壓器DC響應預測:");
console.log("如果VIN = 900V DC:");
console.log(`理論次級電壓 = 900V × ${turns_ratio.toFixed(2)} = ${(900 * turns_ratio).toFixed(0)}V`);
console.log("但是DC變壓器不應該有輸出 (除非有激磁電感路徑)");

console.log("\n🎯 步驟1失效原因分析:");
console.log("❌ 即使0.9mA一次側電流，次級仍為pA級");
console.log("❌ 這表明耦合機制完全失效");
console.log("");
console.log("🔍 可能原因:");
console.log("1. 耦合矩陣計算錯誤");
console.log("2. MNA處理互感項時出錯");  
console.log("3. 舒爾補化簡破壞了耦合關係");
console.log("4. 數值精度問題 (1e-12A vs 1e-6A 相差6個數量級)");

console.log("\n📋 建議步驟3測試:");
console.log("- 增大gmin從1e-9到1e-6"); 
console.log("- 使用較大時間步長減少數值誤差");
console.log("- 簡化為單匝變壓器測試基本耦合");

console.log("\n✅ 步驟2診斷完成");