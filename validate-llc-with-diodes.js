/**
 * =================================================================
 *      🎯 LLC 除錯實驗 A: 使用二極體驗證二次側整流
 * =================================================================
 * 目的:
 * 1. 移除所有主動控制的同步整流 (SR) MOSFET，排除控制時序錯誤的可能性。
 * 2. 使用被動的二極體 (Diode) 進行整流。二極體會根據物理電壓自動開關，
 *    如果電路物理上正確，必然能產生正的直流輸出。
 * 3. 在開迴路 (固定頻率) 下運行，以隔離控制器變數。
 *
 * 預期結果:
 * - 如果成功: Vout 應穩定在一個正的直流電壓。這證明一次側和變壓器工作正常，
 *             問題根源 100% 在於之前的 SR 控制邏輯。
 * - 如果失敗: Vout 仍為 0V 或震盪。這意味著問題更深層，可能在於變壓器
 *             模型與整流負載的交互或數值穩定性。
 */

import {
    AkingSPICE,
    VoltageSource,
    Resistor,
    Inductor,
    Capacitor,
    VoltageControlledMOSFET,
    MultiWindingTransformer,
    Diode  // 確保 Diode 元件已從 index.js 導出
} from './src/index.js';

async function main() {
    console.log('=================================================================');
    console.log('    🧪 LLC 除錯實驗 A: 使用二極體進行被動整流');
    console.log('=================================================================');

    const solver = new AkingSPICE();
    solver.setDebug(false);

    try {
        // --- 1. 建立電路 ---
        console.log('\n[1] 建立帶有二極體整流的 LLC 電路...');
        const circuitParams = buildLLCWithDiodes(solver);
        console.log('✅ 電路建立完成。');

        // --- 2. 模擬參數設定 ---
        const fixed_freq = 22e3; // 🔥 使用固定的開迴路頻率 (理論諧振點附近)
        const period = 1.0 / fixed_freq;
        const timeStep = period / 20;   // 最佳時間步長
        const simTime = period * 200;    // 模擬 200 個週期以確保穩態

        console.log(`\n[2] 模擬參數設定:`);
        console.log(`    - 開關頻率: ${fixed_freq / 1000} kHz (開迴路)`);
        console.log(`    - 時間步長: ${(timeStep * 1e9).toFixed(1)} ns`);
        console.log(`    - 模擬時間: ${(simTime * 1000).toFixed(1)} ms`);

        await solver.initSteppedTransient({ stopTime: simTime, timeStep: timeStep });
        console.log('✅ 模擬器初始化完成。');

        // --- 3. PWM 控制邏輯 (僅一次側) ---
        const pwmControl = (time) => {
            const phase = (time % period) / period;
            const dead_phase = circuitParams.deadTime / period;
            const q1_on = phase >= dead_phase && phase < 0.5 - dead_phase;
            const q3_on = phase >= 0.5 + dead_phase && phase < 1.0 - dead_phase;

            return {
                'VG1': q1_on ? 12 : 0, 'VG2': !q1_on ? 12 : 0,
                'VG3': q3_on ? 12 : 0, 'VG4': !q3_on ? 12 : 0,
            };
        };

        // --- 4. 執行模擬 ---
        console.log('\n[3] 開始執行瞬態模擬...');
        const startTime = Date.now();
        const results = await solver.runSteppedSimulation(pwmControl, { stopTime: simTime, timeStep: timeStep });
        const endTime = Date.now();
        console.log(`✅ 模擬完成，耗時 ${((endTime - startTime) / 1000).toFixed(2)} 秒。`);

        // --- 5. 分析結果 ---
        console.log('\n[4] 分析模擬結果...');
        analyzeDiodeRectifierResults(results, circuitParams);

    } catch (error) {
        console.error('\n\n❌ 實驗 A 執行失敗:', error);
        console.error('Stack trace:', error.stack);
        process.exit(1);
    }
}

function buildLLCWithDiodes(solver) {
    // 使用與之前失敗案例相同的參數，以進行精確對比
    const p = {
        Vin: 400,
        Lm: 200e-6, Lr: 25e-6, Cr: 207e-9,
        Cout: 1000e-6,
        turns_ratio: 0.5,
        deadTime: 500e-9,
        Rload: 1.0
    };

    const transformer = new MultiWindingTransformer('T1', {
        windings: [
            { name: 'primary', nodes: ['res_node', 'sw_b'], inductance: p.Lm, turns: 1 },
            { name: 'sec_a', nodes: ['sec_a', 'sec_ct'], inductance: p.Lm * (p.turns_ratio ** 2), turns: p.turns_ratio },
            { name: 'sec_b', nodes: ['sec_b', 'sec_ct'], inductance: p.Lm * (p.turns_ratio ** 2), turns: p.turns_ratio }
        ],
        couplingMatrix: [[1.0, 0.98, -0.95], [0.98, 1.0, -0.90], [-0.95, -0.90, 1.0]]
    });

    solver.addComponents([
        // --- 一次側 (與之前完全相同) ---
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

        // --- 🔥 關鍵修改：二次側使用二極體整流 ---
        // 移除了 SR1, SR2, SR3 及其驅動源
        new Diode('D1', ['sec_a', 'out'], { Vf: 0.7, Ron: 0.005 }), // 陽極 -> 陰極
        new Diode('D2', ['sec_b', 'out'], { Vf: 0.7, Ron: 0.005 }), // 陽極 -> 陰極

        // --- 輸出電路 (中心抽頭接地) ---
        new Resistor('R_sec_ct', ['sec_ct', '0'], 1e-9), // 中心抽頭接地
        new Capacitor('Cout', ['out', '0'], p.Cout, { ic: 0.1 }), // 輸出電容 (從 out 到地)
        new Resistor('Rload', ['out', '0'], p.Rload)      // 負載 (從 out 到地)
    ]);
    solver.isInitialized = true;
    return p;
}

function analyzeDiodeRectifierResults(results, params) {
    if (!results || results.steps.length === 0) {
        console.error('❌ 分析失敗：模擬沒有產生任何數據點。');
        return;
    }

    // --- 提取穩態數據 (取模擬的後 50%) ---
    const analysisStartIndex = Math.floor(results.steps.length * 0.5);
    const steadySteps = results.steps.slice(analysisStartIndex);

    const v_out = steadySteps.map(s => s.nodeVoltages['out']);
    const v_sec_a = steadySteps.map(s => s.nodeVoltages['sec_a']);
    const v_sec_b = steadySteps.map(s => s.nodeVoltages['sec_b']);
    const i_d1 = steadySteps.map(s => s.componentStates?.['D1']?.current || 0);
    const i_d2 = steadySteps.map(s => s.componentStates?.['D2']?.current || 0);

    const avg_vout = v_out.reduce((sum, v) => sum + v, 0) / v_out.length;
    const max_vout = Math.max(...v_out);
    const min_vout = Math.min(...v_out);
    const ripple = max_vout - min_vout;

    console.log('\n==================== 實驗 A 結果分析 ====================');
    console.log(`平均輸出電壓 (Vout_avg): ${avg_vout.toFixed(3)} V`);
    console.log(`輸出電壓範圍: ${min_vout.toFixed(3)} V to ${max_vout.toFixed(3)} V`);
    console.log(`輸出電壓漣波 (Ripple): ${ripple.toFixed(3)} V`);
    console.log(`---------------------------------------------------------`);

    // --- 判斷實驗是否成功 ---
    if (avg_vout > 1.0 && min_vout >= -0.5) {
        console.log('✅✅✅ 實驗成功！✅✅✅');
        console.log('觀察到穩定且為正的直流輸出電壓。');
        console.log('這強烈證明：');
        console.log('  1. 一次側半橋、諧振腔和變壓器工作正常，能夠傳遞能量。');
        console.log('  2. 二次側的電壓極性足以驅動整流器。');
        console.log('  ➡️ 根本問題幾乎可以肯定是出在「同步整流的控制時序」上。');

        // --- 額外診斷 ---
        const v_sec_a_peak = Math.max(...v_sec_a.map(Math.abs));
        const v_sec_b_peak = Math.max(...v_sec_b.map(Math.abs));
        console.log(`\n進一步診斷:`);
        console.log(`  - 變壓器次級繞組 A 峰值電壓: ${v_sec_a_peak.toFixed(2)} V`);
        console.log(`  - 變壓器次級繞組 B 峰值電壓: ${v_sec_b_peak.toFixed(2)} V`);
        console.log(`  - 估計的直流輸出應約為: (Peak * 2/π) - Vf ≈ ${((v_sec_a_peak * 2 / Math.PI) - 0.7).toFixed(2)} V`);
        console.log(`  - 這與實際平均值 ${avg_vout.toFixed(2)}V 是否接近?`);

    } else if (avg_vout < -0.5) {
        console.log('❌❌❌ 實驗失敗 - 輸出為負電壓！❌❌❌');
        console.log('這意味著電路連接或變壓器繞組極性可能存在嚴重問題。');
        console.log('請檢查：');
        console.log('  1. 二極體的方向是否接反 (應該是 sec_a/sec_b -> out)。');
        console.log('  2. 變壓器的耦合矩陣是否導致了意外的相位反轉。');

    } else {
        console.log('❌❌❌ 實驗失敗 - 輸出電壓接近於零或劇烈震盪。❌❌❌');
        console.log('這意味著問題可能比 SR 控制更深層。');
        console.log('請檢查：');
        console.log('  1. 諧振參數 (L, C) 與開關頻率是否嚴重失配，導致無法建立諧振。');
        console.log('  2. 變壓器模型在帶上整流負載後，是否出現了數值不穩定問題。');
        console.log('  3. 電路中是否存在浮動節點或缺少直流路徑。');
    }
    console.log('========================================================\n');
}


// --- 執行主函數 ---
main();