/**
 * =================================================================
 *      動態變壓器驗證套件 - 診斷互感、匝比與相位
 * =================================================================
 * 目的:
 * 1. 在瞬態模擬中驗證 MultiWindingTransformer 的電壓變換比。
 * 2. 驗證正、負耦合係數 (k) 是否能產生正確的同相/反相輸出電壓。
 * 3. 驗證 MNA 矩陣中互感項的動態行為是否符合物理定律。
 */

import {
    AkingSPICE, VoltageSource, Resistor,
    MultiWindingTransformer
} from './src/index.js';

// --- 沿用之前的微型測試框架 ---
class AkingSPICETestRunner {
    constructor() { this.suites = []; this.stats = { passes: 0, fails: 0, total: 0 }; }
    addSuite(name, testFunc) { this.suites.push({ name, testFunc }); }
    async run() {
        console.log("🚀 開始執行 AkingSPICE 動態變壓器驗證套件...");
        for (const suite of this.suites) {
            console.log(`\n--- 🧪 測試套件: ${suite.name} ---`);
            try { await suite.testFunc(this); } catch (error) { this.fail(`[套件執行失敗] ${suite.name}`, error); }
        }
        this.summary();
    }
    async test(name, testFunc) {
        this.stats.total++;
        try { await testFunc(); this.stats.passes++; console.log(`  ✅ [通過] ${name}`); }
        catch (error) { this.stats.fails++; console.log(`  ❌ [失敗] ${name}`); console.error(`      └─> 錯誤: ${error.stack}`); }
    }
    fail(name, error) { this.stats.total++; this.stats.fails++; console.log(`  ❌ [失敗] ${name}`); console.error(`      └─> 錯誤: ${error.stack}`); }
    summary() {
        console.log("\n==================== 動態變壓器測試總結 ====================");
        if (this.stats.fails === 0) { console.log("🎉 恭喜！MultiWindingTransformer 的動態行為驗證通過！"); }
        else { console.log(`⚠️ 注意！發現 ${this.stats.fails} 個失敗的測試。請檢查日誌。`); }
        console.log("==========================================================");
    }
    assertCloseTo(actual, expected, tolerance, message) { if (Math.abs(actual - expected) > tolerance) { throw new Error(`${message} | 預期: ${expected} (±${tolerance}), 實際: ${actual.toFixed(3)}`); } }
    assertTrue(value, message) { if (value !== true) { throw new Error(`${message} | 實際: ${value}`); } }
}

/**
 * 測試套件：動態變壓器驗證
 */
async function testDynamicTransformer(runner) {
    const solver = new AkingSPICE();

    // --- 電路參數 ---
    const p = {
        V_pri_peak: 100,      // 一次側輸入電壓峰值
        frequency: 1000,      // 測試頻率 1kHz
        Lm: 50e-6,            // 磁化電感 50μH
        turns_ratio: 6,       // 匝數比
        R_load: 10,           // 次級負載電阻
    };
    p.L_sec = p.Lm / (p.turns_ratio ** 2); // 1.389μH
    p.V_sec_peak_theory = p.V_pri_peak / p.turns_ratio; // 16.67V

    await runner.test("變壓器匝數比和相位關係的動態驗證", async () => {
        solver.reset();

        const transformer = new MultiWindingTransformer('T1', {
            windings: [
                { name: 'primary', nodes: ['pri_in', '0'], inductance: p.Lm },
                { name: 'sec_a', nodes: ['sec_a_out', '0'], inductance: p.L_sec }, // 同相繞組
                { name: 'sec_b', nodes: ['sec_b_out', '0'], inductance: p.L_sec }  // 反相繞組
            ],
            couplingMatrix: [
                [1.0, 0.98, -0.98],  // pri-sec_a 正耦合, pri-sec_b 負耦合
                [0.98, 1.0, -0.95],
                [-0.98, -0.95, 1.0]
            ]
        });

        solver.addComponents([
            new VoltageSource('Vin', ['pri_in', '0'], `SINE(0 ${p.V_pri_peak} ${p.frequency})`),
            transformer,
            new Resistor('R_load_a', ['sec_a_out', '0'], p.R_load),
            new Resistor('R_load_b', ['sec_b_out', '0'], p.R_load)
        ]);
        solver.isInitialized = true;

        const period = 1 / p.frequency;
        const results = await solver.runSteppedSimulation(() => ({}), {
            stopTime: 5 * period,       // 模擬5個週期以達到穩態
            timeStep: period / 100      // 每個週期100個點
        });

        // --- 分析結果 (取最後一個週期) ---
        const lastCycleSteps = results.steps.slice(-101);
        const v_pri = lastCycleSteps.map(s => s.nodeVoltages['pri_in']);
        const v_sec_a = lastCycleSteps.map(s => s.nodeVoltages['sec_a_out']);
        const v_sec_b = lastCycleSteps.map(s => s.nodeVoltages['sec_b_out']);

        const v_pri_peak = Math.max(...v_pri);
        const v_sec_a_peak = Math.max(...v_sec_a);
        const v_sec_b_peak = Math.max(...v_sec_b); // 峰值是正的

        // 1. 驗證匝數比
        console.log(`  一次側峰值電壓: ${v_pri_peak.toFixed(2)}V`);
        console.log(`  二次側(A)峰值電壓: ${v_sec_a_peak.toFixed(2)}V (理論值: ${p.V_sec_peak_theory.toFixed(2)}V)`);
        console.log(`  二次側(B)峰值電壓: ${v_sec_b_peak.toFixed(2)}V (理論值: ${p.V_sec_peak_theory.toFixed(2)}V)`);
        runner.assertCloseTo(v_sec_a_peak, p.V_sec_peak_theory, 1.0, "同相繞組 (sec_a) 的峰值電壓應符合匝數比");
        runner.assertCloseTo(v_sec_b_peak, p.V_sec_peak_theory, 1.0, "反相繞組 (sec_b) 的峰值電壓應符合匝數比");

        // 2. 驗證相位關係
        // 找到一次側電壓達到峰值的索引
        const pri_peak_index = v_pri.indexOf(v_pri_peak);
        
        // 檢查 sec_a 在相同索引處是否也接近峰值 (同相)
        const v_sec_a_at_peak = v_sec_a[pri_peak_index];
        console.log(`  一次側達峰值時, V(sec_a) = ${v_sec_a_at_peak.toFixed(2)}V`);
        runner.assertTrue(v_sec_a_at_peak > v_sec_a_peak * 0.95, "同相繞組 (sec_a) 應與一次側同相");

        // 檢查 sec_b 在相同索引處是否接近谷值 (反相)
        const v_sec_b_at_peak = v_sec_b[pri_peak_index];
        console.log(`  一次側達峰值時, V(sec_b) = ${v_sec_b_at_peak.toFixed(2)}V`);
        runner.assertTrue(v_sec_b_at_peak < -v_sec_b_peak * 0.95, "反相繞組 (sec_b) 應與一次側反相");
    });
}

// --- 主執行函數 ---
async function main() {
    const runner = new AkingSPICETestRunner();
    runner.addSuite("動態變壓器模型驗證", testDynamicTransformer);
    await runner.run();
    process.exit(runner.stats.fails > 0 ? 1 : 0);
}

main();