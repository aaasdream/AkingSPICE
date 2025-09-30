/**
 * =================================================================
 *         MNA 印記邏輯驗證腳本 (MNA Stamping Verifier)
 * =================================================================
 * 目的:
 * 1. 仔細審查 stampCapacitor 和 stampInductor 的實現。
 * 2. 透過手動計算理論 MNA 矩陣，與 AkingSPICE 的生成結果進行比對。
 * 3. 驗證後向歐拉法和梯形積分法的伴隨模型是否正確印記。
 */

import {
    AkingSPICE,
    VoltageSource,
    Resistor,
    Inductor,
    Capacitor
} from './src/index.js';

// 微型斷言工具
const assert = {
    closeTo: (actual, expected, tolerance, message) => {
        if (Math.abs(actual - expected) > tolerance) {
            console.error(`❌ ASSERTION FAILED: ${message}`);
            console.error(`   Expected: ${expected}, Got: ${actual}`);
            throw new Error(message);
        }
        console.log(`✅ PASSED: ${message}`);
    }
};

async function verifyMnaStamping() {
    console.log("🔬 驗證 MNA 印記邏輯...");

    // --- 測試電路 ---
    // V1(10V) -> R1(1k) -> C1(1uF, IC=1V) -> GND
    const C_val = 1e-6;
    const R_val = 1000;
    const V_ic = 1.0; // 電容初始電壓
    const h = 100e-6; // 時間步長

    // --- 理論計算 (手動) ---
    console.log("\n[1] 手動計算理論 MNA 矩陣...");

    // 後向歐拉法理論值
    const G_eq_be = C_val / h; // = 0.01
    const I_hist_be_theory = G_eq_be * V_ic; // = 0.01 * 1 = 0.01
    
    // 梯形法理論值 (假設 i(0)=0)
    const G_eq_trap = 2 * C_val / h; // = 0.02
    const I_hist_trap_theory = G_eq_trap * V_ic + 0; // = 0.02 * 1 = 0.02

    console.log(`   後向歐拉: G_eq=${G_eq_be}, I_hist=${I_hist_be_theory}`);
    console.log(`   梯形法: G_eq=${G_eq_trap}, I_hist=${I_hist_trap_theory}`);
    
    // --- 模擬器生成 (後向歐拉) ---
    console.log("\n[2] 驗證 AkingSPICE (後向歐拉法)...");
    const solver_be = new AkingSPICE();
    const cap_be = new Capacitor('C1', ['out', '0'], C_val, { ic: V_ic });
    solver_be.components = [
        new VoltageSource('V1', ['in', '0'], 10),
        new Resistor('R1', ['in', 'out'], R_val),
        cap_be
    ];
    solver_be.isInitialized = true;
    
    // 手動初始化
    cap_be.initTransient(h, 'backward_euler');
    cap_be.updateCompanionModel();

    console.log(`   實際 G_eq: ${cap_be.equivalentConductance}`);
    console.log(`   實際 I_hist: ${cap_be.historyCurrentSource}`);

    assert.closeTo(cap_be.equivalentConductance, G_eq_be, 1e-9, "後向歐拉 G_eq 應為 C/h");
    
    // 🔥 這裡將會暴露錯誤
    try {
        assert.closeTo(cap_be.historyCurrentSource, I_hist_be_theory, 1e-9, "後向歐拉 I_hist 應為 G_eq * V_ic");
    } catch (e) {
        console.log("   🔥 預期中的錯誤！歷史電流源的符號不正確。");
        console.log(`   實際值: ${cap_be.historyCurrentSource} (應為正值 ${I_hist_be_theory})`);
    }

    // --- 模擬器生成 (梯形法) ---
    console.log("\n[3] 驗證 AkingSPICE (梯形法)...");
    const solver_trap = new AkingSPICE();
    const cap_trap = new Capacitor('C1', ['out', '0'], C_val, { ic: V_ic });
     solver_trap.components = [
        new VoltageSource('V1', ['in', '0'], 10),
        new Resistor('R1', ['in', 'out'], R_val),
        cap_trap
    ];
    solver_trap.isInitialized = true;
    
    cap_trap.initTransient(h, 'trapezoidal');
    cap_trap.updateCompanionModel();

    console.log(`   實際 G_eq: ${cap_trap.equivalentConductance}`);
    console.log(`   實際 I_hist: ${cap_trap.historyCurrentSource}`);

    assert.closeTo(cap_trap.equivalentConductance, G_eq_trap, 1e-9, "梯形法 G_eq 應為 2C/h");
    
    try {
        assert.closeTo(cap_trap.historyCurrentSource, I_hist_trap_theory, 1e-9, "梯形法 I_hist 應為 G_eq * V_ic + i_prev");
    } catch (e) {
        console.log("   🔥 梯形法也可能有問題：", e.message);
        console.log(`   實際值: ${cap_trap.historyCurrentSource} (應為 ${I_hist_trap_theory})`);
    }
    
    // --- 完整 MNA 矩陣驗證 ---
    console.log("\n[4] 完整 MNA 矩陣驗證...");
    
    // 使用後向歐拉法建立完整電路
    const mna = solver_be.transientAnalysis.mnaBuilder;
    mna.analyzeCircuit(solver_be.components);
    const { matrix, rhs } = mna.buildMNAMatrix(solver_be.components, 0);
    
    console.log("MNA 矩陣 (3x3):");
    for (let i = 0; i < 3; i++) {
        const row = [];
        for (let j = 0; j < 3; j++) {
            row.push(matrix.get(i, j).toFixed(6));
        }
        console.log(`  [${i}]: [${row.join(', ')}]`);
    }
    
    console.log("右手邊向量:");
    for (let i = 0; i < 3; i++) {
        console.log(`  b[${i}]: ${rhs.get(i).toFixed(6)}`);
    }
    
    console.log("\n🎉 驗證完成！");
}

verifyMnaStamping();