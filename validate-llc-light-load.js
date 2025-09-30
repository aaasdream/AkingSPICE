/**
 * =================================================================
 *      🎯 LLC 除錯實驗 B: 輕負載下的二極體整流驗證
 * =================================================================
 * 目的:
 * 1. 驗證 "重載拉低電壓" (Loading Effect) 的猜想。
 * 2. 通過將負載電阻從 1.0Ω (重載) 增加到 50.0Ω (輕載)，觀察輸出電壓
 *    是否會顯著回升。
 *
 * 預期結果:
 * - 如果成功: Vout_avg 應大幅提升 (例如，達到數十伏)。這將證明之前的
 *             低輸出是由於嚴重的阻抗失配導致的。
 * - 如果失敗: Vout_avg 仍然很低。這意味著問題可能不完全是負載效應，
 *             可能還存在其他數值或模型上的問題。
 */

import {
    AkingSPICE,
    VoltageSource,
    Resistor,
    Inductor,
    Capacitor,
    VoltageControlledMOSFET,
    MultiWindingTransformer,
    Diode
} from './src/index.js';

async function main() {
    console.log('=================================================================');
    console.log('    🧪 LLC 除錯實驗 B: 輕負載下的被動整流');
    console.log('=================================================================');

    const solver = new AkingSPICE();
    solver.setDebug(false);

    try {
        // --- 1. 建立電路 (使用輕負載) ---
        console.log('\n[1] 建立帶有二極體整流和 *輕負載* 的 LLC 電路...');
        const circuitParams = buildLLCWithLightLoad(solver);
        console.log('✅ 電路建立完成。');

        // --- 2. 模擬參數設定 (與之前相同) ---
        const fixed_freq = 22e3;
        const period = 1.0 / fixed_freq;
        const timeStep = period / 20;
        const simTime = period * 200;

        console.log(`\n[2] 模擬參數設定 (與實驗 A 相同):`);
        console.log(`    - 開關頻率: ${fixed_freq / 1000} kHz`);

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
        analyzeLightLoadResults(results, circuitParams);

    } catch (error) {
        console.error('\n\n❌ 實驗 B 執行失敗:', error);
        console.error('Stack trace:', error.stack);
        process.exit(1);
    }
}

function buildLLCWithLightLoad(solver) {
    const p = {
        Vin: 400,
        Lm: 200e-6, Lr: 25e-6, Cr: 207e-9,
        Cout: 1000e-6,
        turns_ratio: 0.5,
        deadTime: 500e-9,
        // 🔥🔥🔥 唯一的關鍵修改 🔥🔥🔥
        Rload: 50.0 // 從 1.0Ω 增加到 50.0Ω
    };
    
    console.log(`    - 特性阻抗 Z0 ≈ 11.0 Ω`);
    console.log(`    - 負載電阻 Rload = ${p.Rload} Ω`);
    const R_reflected = p.Rload * (p.turns_ratio ** 2);
    console.log(`    - 反射到一次側的負載 R_reflected ≈ ${R_reflected.toFixed(1)} Ω`);
    console.log(`    - 阻抗匹配情況: ${R_reflected > 5.0 ? '✅ 較好的匹配 (R_reflected 接近 Z0)' : '⚠️ 仍然失配'}`);


    const transformer = new MultiWindingTransformer('T1', {
        windings: [
            { name: 'primary', nodes: ['res_node', 'sw_b'], inductance: p.Lm, turns: 1 },
            { name: 'sec_a', nodes: ['sec_a', 'sec_ct'], inductance: p.Lm * (p.turns_ratio ** 2), turns: p.turns_ratio },
            { name: 'sec_b', nodes: ['sec_b', 'sec_ct'], inductance: p.Lm * (p.turns_ratio ** 2), turns: p.turns_ratio }
        ],
        couplingMatrix: [[1.0, 0.98, -0.95], [0.98, 1.0, -0.90], [-0.95, -0.90, 1.0]]
    });

    solver.addComponents([
        // 一次側 (與實驗 A 完全相同)
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

        // 二次側 (與實驗 A 完全相同)
        new Diode('D1', ['sec_a', 'out'], { Vf: 0.7, Ron: 0.005 }),
        new Diode('D2', ['sec_b', 'out'], { Vf: 0.7, Ron: 0.005 }),
        
        // 輸出電路 (僅 Rload 改變)
        new Resistor('R_sec_ct', ['sec_ct', '0'], 1e-9),
        new Capacitor('Cout', ['out', '0'], p.Cout, { ic: 0.1 }),
        new Resistor('Rload', ['out', '0'], p.Rload) // 使用新的輕負載值
    ]);
    solver.isInitialized = true;
    return p;
}

function analyzeLightLoadResults(results, params) {
    if (!results || results.steps.length === 0) {
        console.error('❌ 分析失敗：模擬沒有產生任何數據點。');
        return;
    }

    const analysisStartIndex = Math.floor(results.steps.length * 0.5);
    const steadySteps = results.steps.slice(analysisStartIndex);
    const v_out = steadySteps.map(s => s.nodeVoltages['out']);
    const avg_vout = v_out.reduce((sum, v) => sum + v, 0) / v_out.length;

    console.log('\n==================== 實驗 B 結果分析 ====================');
    console.log(`實驗 A (重載 R=1.0Ω) 結果: Vout_avg ≈ 1.50 V`);
    console.log(`實驗 B (輕載 R=50.0Ω) 結果: Vout_avg = ${avg_vout.toFixed(3)} V`);
    console.log(`---------------------------------------------------------`);
    
    // --- 判斷實驗是否成功 ---
    if (avg_vout > 10.0) {
        const improvement = avg_vout / 1.50;
        console.log(`✅✅✅ 實驗成功！電壓顯著提升！✅✅✅`);
        console.log(`輸出電壓提升了 ${improvement.toFixed(1)} 倍。`);
        console.log('這強烈證明：');
        console.log('  ➡️ 「重載導致的阻抗失配」是之前輸出電壓被極度拉低的主要原因。');
        console.log('  ➡️ 你的諧振腔和變壓器在較輕負載下，確實能夠產生很高的電壓。');

        const v_sec_a = steadySteps.map(s => s.nodeVoltages['sec_a']);
        const v_sec_a_peak = Math.max(...v_sec_a.map(Math.abs));
        const theoretical_output = (v_sec_a_peak * 2 / Math.PI) - 0.7;
        
        console.log(`\n進一步診斷:`);
        console.log(`  - 輕載下次級峰值電壓: ${v_sec_a_peak.toFixed(2)} V`);
        console.log(`  - 理論直流輸出約為: ${theoretical_output.toFixed(2)} V`);
        console.log(`  - 這與實際平均值 ${avg_vout.toFixed(2)}V 吻合度如何?`);
        
    } else {
        console.log('❌❌❌ 實驗結果不符合預期。❌❌❌');
        console.log(`輸出電壓 ${avg_vout.toFixed(3)}V 並未顯著高於重載時的 1.5V。`);
        console.log('這意味著除了負載效應外，可能還存在其他問題：');
        console.log('  1. 諧振參數與開關頻率的組合可能處於一個非常低的增益點。');
        console.log('  2. 變壓器模型的實現中可能存在隱藏的損耗或數值問題。');
        console.log('  ➡️ 建議下一步：進行開關頻率掃描，以找到電路的增益峰值。');
    }
    console.log('========================================================\n');
}

// --- 執行主函數 ---
main();