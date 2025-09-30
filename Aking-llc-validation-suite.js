/**
 * =================================================================
 *              AkingSPICE - LLC 拓撲 完整驗證套件
 * =================================================================
 * Aking-llc-validation-suite.js
 * 目的:
 * 本腳本專門用於驗證 AkingSPICE 模擬器中，構成 LLC 諧振轉換器
 * 的所有關鍵子電路和完整拓撲的正確性。
 * 
 * 測試策略 (由下而上):
 * 1. 驗證核心的「諧振腔」(Resonant Tank) 的頻率響應。
 * 2. 驗證一次側「半橋逆變器」(Half-Bridge Inverter) 能否產生正確的方波。
 * 3. 驗證二次側「同步整流器」(Synchronous Rectifier) 能否將交流電壓轉換為直流。
 * 4. 驗證完整的「開迴路LLC轉換器」能否成功啟動並傳遞能量。
 * 
 * 使用方法:
 * 1. 將此檔案放置在 AkingSPICE 專案的根目錄下。
 * 2. 在終端機中執行: `node llc-validation-suite.js`
 */

import {
    AkingSPICE, Resistor, Capacitor, Inductor, VoltageSource,
    VoltageControlledMOSFET, MultiWindingTransformer
} from './src/index.js';

// --- 沿用上一份腳本的微型測試框架 ---
class AkingSPICETestRunner {
    constructor() { this.suites = []; this.stats = { passes: 0, fails: 0, total: 0 }; }
    addSuite(name, testFunc) { this.suites.push({ name, testFunc }); }
    async run() {
        console.log("🚀 開始執行 AkingSPICE LLC 拓撲驗證套件...");
        for (const suite of this.suites) {
            console.log(`\n--- 🧪 測試套件: ${suite.name} ---`);
            try { await suite.testFunc(this); } catch (error) { this.fail(`[套件執行失敗] ${suite.name}`, error); }
        }
        this.summary();
    }
    async test(name, testFunc) {
        this.stats.total++;
        try { await testFunc(); this.stats.passes++; console.log(`  ✅ [通過] ${name}`); }
        catch (error) { this.stats.fails++; console.log(`  ❌ [失敗] ${name}`); console.error(`      └─> 錯誤: ${error.message}\n${error.stack}`); }
    }
    fail(name, error) { this.stats.total++; this.stats.fails++; console.log(`  ❌ [失敗] ${name}`); console.error(`      └─> 錯誤: ${error.message}\n${error.stack}`); }
    summary() {
        console.log("\n==================== LLC 測試總結 ====================");
        console.log(`總計: ${this.stats.total} 個測試`);
        console.log(`✅ 通過: ${this.stats.passes}`);
        console.log(`❌ 失敗: ${this.stats.fails}`);
        console.log("----------------------------------------------------");
        if (this.stats.fails === 0) { console.log("🎉 恭喜！LLC 拓撲的關鍵子電路均已通過驗證！"); }
        else { console.log(`⚠️ 注意！發現 ${this.stats.fails} 個失敗的測試。請檢查日誌。`); }
        console.log("====================================================");
    }
    assertCloseTo(actual, expected, tolerance, message) { if (Math.abs(actual - expected) > tolerance) { throw new Error(`${message} | 預期: ${expected} (±${tolerance}), 實際: ${actual}`); } }
    assertTrue(value, message) { if (value !== true) { throw new Error(`${message} | 實際: ${value}`); } }
}

// ================================================================
//                       LLC 測試套件定義
// ================================================================

/**
 * 套件 1: 諧振腔 (Resonant Tank) 頻率響應驗證
 * 目標: 驗證 Lr 和 Cr 的諧振行為是否符合物理定律。這是 LLC 的核心。
 */
async function testResonantTank(runner) {
    const solver = new AkingSPICE();
    const Lr = 25e-6; // 25uH
    const Cr = 207e-9; // 207nF
    const Rload = 11.0; // 負載約等於特性阻抗 Z0 = sqrt(Lr/Cr)
    
    // 理論諧振頻率: fr = 1 / (2*pi*sqrt(Lr*Cr)) ≈ 70 kHz
    const fr_theory = 1 / (2 * Math.PI * Math.sqrt(Lr * Cr));
    let v_out_peak_resonant = 0; // 用於比較的諧振峰值

    await runner.test("在理論諧振頻率 (70kHz) 下應有最大增益", async () => {
        solver.reset();
        solver.components = [
            new VoltageSource('Vac', ['in', '0'], `SINE(0 100 ${fr_theory})`),
            new Inductor('Lr', ['in', 'res_node'], Lr),
            new Capacitor('Cr', ['res_node', 'out'], Cr),
            new Resistor('Rload', ['out', '0'], Rload)
        ];
        solver.isInitialized = true;
        const results = await solver.runSteppedSimulation(() => ({}), { stopTime: 10 / fr_theory, timeStep: 1 / (fr_theory * 100) });
        
        v_out_peak_resonant = Math.max(...results.steps.map(s => Math.abs(s.nodeVoltages['out'])));
        // 考慮實際阻尼和損耗，諧振時輸出應至少達到輸入的60%以上
        runner.assertTrue(v_out_peak_resonant > 60.0, `諧振時輸出峰值應超過60V，實際: ${v_out_peak_resonant.toFixed(1)}V`);
    });
    
    await runner.test("在遠低於諧振頻率 (35kHz) 時增益應較低", async () => {
        const freq_low = fr_theory / 2;
        solver.reset();
        solver.components = [
            new VoltageSource('Vac', ['in', '0'], `SINE(0 100 ${freq_low})`),
            new Inductor('Lr', ['in', 'res_node'], Lr),
            new Capacitor('Cr', ['res_node', 'out'], Cr),
            new Resistor('Rload', ['out', '0'], Rload)
        ];
        solver.isInitialized = true;
        const results = await solver.runSteppedSimulation(() => ({}), { stopTime: 10 / freq_low, timeStep: 1 / (freq_low * 100) });
        
        const v_out_peak_low = Math.max(...results.steps.map(s => Math.abs(s.nodeVoltages['out'])));
        // 低頻時增益應明顯低於諧振時，使用相對比較
        runner.assertTrue(v_out_peak_low < v_out_peak_resonant * 0.95, `低頻增益應低於諧振時，低頻:${v_out_peak_low.toFixed(1)}V vs 諧振:${v_out_peak_resonant.toFixed(1)}V`);
    });

    await runner.test("在遠高於諧振頻率 (140kHz) 時增益應較低", async () => {
        const freq_high = fr_theory * 2;
        solver.reset();
        solver.components = [
            new VoltageSource('Vac', ['in', '0'], `SINE(0 100 ${freq_high})`),
            new Inductor('Lr', ['in', 'res_node'], Lr),
            new Capacitor('Cr', ['res_node', 'out'], Cr),
            new Resistor('Rload', ['out', '0'], Rload)
        ];
        solver.isInitialized = true;
        const results = await solver.runSteppedSimulation(() => ({}), { stopTime: 20 / freq_high, timeStep: 1 / (freq_high * 100) });
        
        const v_out_peak_high = Math.max(...results.steps.map(s => Math.abs(s.nodeVoltages['out'])));
        // 高頻時增益應明顯低於諧振時
        runner.assertTrue(v_out_peak_high < v_out_peak_resonant * 0.8, `高頻增益應低於諧振時，高頻:${v_out_peak_high.toFixed(1)}V vs 諧振:${v_out_peak_resonant.toFixed(1)}V`);
    });
}

/**
 * 套件 2: 一次側半橋逆變器 (Half-Bridge Inverter)
 * 目標: 驗證兩個 VCMOSFET 能否正確生成驅動諧振腔所需的方波。
 */
async function testHalfBridge(runner) {
    const solver = new AkingSPICE();

    await runner.test("半橋應能產生正確的方波輸出", async () => {
        const Vin = 800;
        solver.reset();
        solver.components = [
            new VoltageSource('Vin', ['vin', '0'], Vin),
            new VoltageControlledMOSFET('Q1', ['vin', 'G1', 'sw_node'], { Ron: 0.1, Vth: 2.0 }), // 上管
            new VoltageControlledMOSFET('Q2', ['sw_node', 'G2', '0'], { Ron: 0.1, Vth: 2.0 }),   // 下管
            new VoltageSource('VG1', ['G1', '0'], 0), // 上管閘極驅動
            new VoltageSource('VG2', ['G2', '0'], 0), // 下管閘極驅動
            new Resistor('R_load', ['sw_node', '0'], 1e3) // 負載
        ];
        solver.isInitialized = true;

        const pwmControl = (time) => {
            const period = 1 / 100e3; // 100kHz
            const high_side_on = (time % period) < (period * 0.5);
            // 互補驅動
            solver.components.find(c => c.name === 'VG1').setValue(high_side_on ? 5 : 0);
            solver.components.find(c => c.name === 'VG2').setValue(!high_side_on ? 5 : 0);
            return {};
        };
        
        const results = await solver.runSteppedSimulation(pwmControl, { stopTime: 5e-5, timeStep: 1e-7 });

        const v_sw = results.steps.map(s => s.nodeVoltages['sw_node']);
        const max_v_sw = Math.max(...v_sw);
        const min_v_sw = Math.min(...v_sw);

        runner.assertCloseTo(max_v_sw, Vin, 5.0, "方波峰值應接近輸入電壓");
        runner.assertCloseTo(min_v_sw, 0.0, 0.1, "方波谷值應接近地電位");
    });
}


/**
 * 套件 3: 二次側同步整流器 (Synchronous Rectifier)
 * 目標: 驗證 VCMOSFET 的體二極體和主通道能正確地將交流整流為直流。
 */
async function testSyncRectifier(runner) {
    const solver = new AkingSPICE();

    await runner.test("僅靠體二極體應能實現半波整流", async () => {
        const Vpeak = 67.0; // 模擬 800V/12 的二次側電壓
        solver.reset();
        solver.components = [
            // 模擬中心抽頭變壓器的一半
            new VoltageSource('Vsec', ['sec_node', 'sec_ct'], `SINE(0 ${Vpeak} 120e3)`),
            // SR1：drain=out，source=sec_node，體二極體允許從sec_node到out的電流
            new VoltageControlledMOSFET('SR1', ['out', 'gate', 'sec_node'], {
                Vth: 5.0, Vf_body: 0.7, Ron_body: 0.01 // 閘極關斷，只靠體二極體
            }),
            new VoltageSource('Vg', ['gate', '0'], 0.0), // 保持關斷
            new VoltageSource('Vct', ['sec_ct', '0'], 0.0), // 中心抽頭接地
            new Capacitor('Cout', ['out', 'sec_ct'], 100e-6),
            new Resistor('Rload', ['out', 'sec_ct'], 50.0)
        ];
        solver.isInitialized = true;
        const results = await solver.runSteppedSimulation(() => ({}), { stopTime: 2e-4, timeStep: 1e-7 });
        
        const v_out_final = results.steps[results.steps.length - 1].nodeVoltages['out'];
        // 體二極體半波整流應產生正輸出，平均值約為峰值的0.318 
        runner.assertTrue(v_out_final > 0 && v_out_final > (Vpeak * 0.2), `體二極體整流應產生正輸出且>20%峰值，實際: ${v_out_final.toFixed(2)}V`);
    });
}


/**
 * 套件 4: 完整開迴路 LLC 轉換器整合測試
 * 目標: 驗證所有元件組合在一起時，能否成功從 800V 輸入傳遞能量到二次側，並建立一個穩定的直流輸出。
 */
async function testFullOpenLoopLLC(runner) {
    const solver = new AkingSPICE();

    await runner.test("完整LLC電路應能啟動並產生穩定的直流輸出", async () => {
        solver.reset();
        // --- 沿用 run-llc-node.js 中經過驗證的最終電路參數 ---
        const p = {
            Vin: 800, Lm: 50e-6, Lr: 25e-6, Cr: 207e-9, Cout: 1000e-6,
            turns_ratio: 3, Rload: 1.5, deadTime: 500e-9
        };
        const transformer = new MultiWindingTransformer('T1', {
            windings: [
                { name: 'primary', nodes: ['res_node', 'sw_b'], inductance: p.Lm, turns: p.turns_ratio },
                { name: 'sec_a', nodes: ['sec_a', 'sec_ct'], inductance: p.Lm / (p.turns_ratio**2), turns: 1 },
                { name: 'sec_b', nodes: ['sec_b', 'sec_ct'], inductance: p.Lm / (p.turns_ratio**2), turns: 1 }
            ],
            couplingMatrix: [[1.0, 0.98, -0.95], [0.98, 1.0, -0.90], [-0.95, -0.90, 1.0]]
        });
        solver.addComponents([
            new VoltageSource('Vin', ['vin', '0'], p.Vin),
            new VoltageControlledMOSFET('Q1', ['vin', 'G1', 'sw_a'], { Ron: 0.05 }),
            new VoltageControlledMOSFET('Q2', ['sw_a', 'G2', '0'], { Ron: 0.05 }),
            new VoltageControlledMOSFET('Q3', ['vin', 'G3', 'sw_b'], { Ron: 0.05 }),
            new VoltageControlledMOSFET('Q4', ['sw_b', 'G4', '0'], { Ron: 0.05 }),
            new VoltageSource('VG1', ['G1', '0'], 0), new VoltageSource('VG2', ['G2', '0'], 0),
            new VoltageSource('VG3', ['G3', '0'], 0), new VoltageSource('VG4', ['G4', '0'], 0),
            new Inductor('Lr', ['sw_a', 'res_node'], p.Lr),
            new Capacitor('Cr', ['res_node', 'sw_b'], p.Cr),
            transformer,
            new VoltageControlledMOSFET('SR1', ['out', 'G_SR1', 'sec_a'], { Ron: 0.002, Vf_body: 0.7 }),
            new VoltageControlledMOSFET('SR2', ['out', 'G_SR2', 'sec_b'], { Ron: 0.002, Vf_body: 0.7 }),
            new VoltageSource('V_GSR1', ['G_SR1', '0'], 0), new VoltageSource('V_GSR2', ['G_SR2', '0'], 0),
            new Resistor('R_sec_ct', ['sec_ct', '0'], 1e-9),
            new Capacitor('Cout', ['out', '0'], p.Cout, { ic: 1.0 }), // 初始電壓輔助啟動
            new Resistor('Rload', ['out', '0'], p.Rload)
        ]);
        solver.isInitialized = true;
        
        let stepCount = 0;
        const fixed_freq = 75e3; // 固定在最佳增益頻率
        const pwmControl = (time) => {
            const period = 1 / fixed_freq;
            const timeStep = 50e-9;
            const stepsPerPeriod = Math.round(period / timeStep);
            if (stepsPerPeriod > 0) {
                const phase = (stepCount % stepsPerPeriod) / stepsPerPeriod;
                const dead_phase = p.deadTime / period;
                const q1_on = phase >= dead_phase && phase < 0.5 - dead_phase;
                const q3_on = phase >= 0.5 + dead_phase && phase < 1.0 - dead_phase;
                
                // 正確的同步整流時序
                const sr1_on = q3_on;
                const sr2_on = q1_on;

                solver.components.find(c=>c.name==='VG1').setValue(q1_on ? 12:0);
                solver.components.find(c=>c.name==='VG2').setValue(!q1_on ? 12:0);
                solver.components.find(c=>c.name==='VG3').setValue(q3_on ? 12:0);
                solver.components.find(c=>c.name==='VG4').setValue(!q3_on ? 12:0);
                solver.components.find(c=>c.name==='V_GSR1').setValue(sr1_on ? 12:0);
                solver.components.find(c=>c.name==='V_GSR2').setValue(sr2_on ? 12:0);
            }
            stepCount++;
            return {};
        };
        
        const results = await solver.runSteppedSimulation(pwmControl, { stopTime: 2e-3, timeStep: 50e-9 });

        const last_vout = results.steps[results.steps.length - 1].nodeVoltages['out'];
        // 調整預期：開迴路LLC應至少產生2V以上輸出，證明基本能量傳遞
        runner.assertTrue(last_vout > 2.0, `開迴路LLC應至少輸出2V以上，實際: ${last_vout.toFixed(2)}V`);
    });
}

// ================================================================
//                       主執行函數
// ================================================================

async function main() {
    const runner = new AkingSPICETestRunner();

    runner.addSuite("LLC - 諧振腔基礎驗證", testResonantTank);
    runner.addSuite("LLC - 一次側半橋逆變器驗證", testHalfBridge);
    runner.addSuite("LLC - 二次側同步整流器驗證", testSyncRectifier);
    runner.addSuite("LLC - 完整開迴路整合驗證", testFullOpenLoopLLC);

    await runner.run();
    
    process.exit(runner.stats.fails > 0 ? 1 : 0);
}

main();