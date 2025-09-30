/**
 * =================================================================
 *      🎯 LLC 除錯實驗 C: 開迴路頻率掃描以尋找增益峰值
 * =================================================================
 * 目的:
 * 1. 系統性地掃描一系列開關頻率，找到 LLC 電路的電壓增益峰值點。
 * 2. 繪製出 "電壓增益 vs. 頻率" 曲線的關鍵數據點。
 * 3. 為後續的閉迴路控制器設計，提供目標工作頻率的依據。
 *
 * 實驗設置:
 * - 電路: 沿用實驗 B 的成功電路 (二極體整流，輕負載 Rload=50Ω)。
 * - 掃描範圍: 從 20kHz 到 120kHz，步進 10kHz。
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

// --- 掃描配置 ---
const FREQUENCY_SWEEP_CONFIG = {
    startFreq: 20e3,  // 20 kHz
    stopFreq:  120e3, // 120 kHz
    steps:     11,    // 掃描點數 (20, 30, ..., 120)
};

async function main() {
    console.log('=================================================================');
    console.log('    🧪 LLC 除錯實驗 C: 開迴路頻率掃描');
    console.log('=================================================================');

    const frequenciesToTest = generateFrequencySteps(FREQUENCY_SWEEP_CONFIG);
    const results = [];

    console.log(`\n將要掃描 ${frequenciesToTest.length} 個頻率點:`);
    console.log(frequenciesToTest.map(f => `${f / 1000}kHz`).join(', '));

    for (const freq of frequenciesToTest) {
        console.log(`\n------------------ 掃描頻率: ${freq / 1000} kHz ------------------`);
        try {
            const avg_vout = await runSingleFrequencySimulation(freq);
            if (avg_vout !== null) {
                results.push({ frequency: freq, vout: avg_vout });
                console.log(`✅ ${freq / 1000} kHz -> 平均輸出電壓: ${avg_vout.toFixed(3)} V`);
            } else {
                 results.push({ frequency: freq, vout: 0 });
            }
        } catch (error) {
            console.error(`❌ 在 ${freq / 1000} kHz 掃描時發生錯誤: ${error.message}`);
            results.push({ frequency: freq, vout: -1 }); // -1 表示錯誤
        }
    }

    // --- 分析並打印最終報告 ---
    analyzeSweepResults(results);
}

function generateFrequencySteps({ startFreq, stopFreq, steps }) {
    if (steps <= 1) return [startFreq];
    const stepSize = (stopFreq - startFreq) / (steps - 1);
    return Array.from({ length: steps }, (_, i) => startFreq + i * stepSize);
}

async function runSingleFrequencySimulation(frequency) {
    const solver = new AkingSPICE();
    solver.setDebug(false);

    // 建立電路 (與實驗 B 相同)
    const circuitParams = buildLLCWithLightLoad(solver);

    const period = 1.0 / frequency;
    const timeStep = period / 20;   // 每個週期 20 個點
    const simTime = period * 100;    // 模擬 100 個週期以確保穩態

    await solver.initSteppedTransient({ stopTime: simTime, timeStep: timeStep });

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

    const simResults = await solver.runSteppedSimulation(pwmControl, { stopTime: simTime, timeStep: timeStep });

    if (!simResults || simResults.steps.length === 0) return null;

    // 計算穩態平均輸出電壓 (後 50% 數據)
    const analysisStartIndex = Math.floor(simResults.steps.length * 0.5);
    const steadySteps = simResults.steps.slice(analysisStartIndex);
    const v_out = steadySteps.map(s => s.nodeVoltages['out']);
    return v_out.reduce((sum, v) => sum + v, 0) / v_out.length;
}


function buildLLCWithLightLoad(solver) {
    // 參數與實驗 B 完全相同
    const p = { Vin: 400, Lm: 200e-6, Lr: 25e-6, Cr: 207e-9, Cout: 1000e-6, turns_ratio: 0.5, deadTime: 500e-9, Rload: 50.0 };
    const transformer = new MultiWindingTransformer('T1', {
        windings: [
            { name: 'primary', nodes: ['res_node', 'sw_b'], inductance: p.Lm, turns: 1 },
            { name: 'sec_a', nodes: ['sec_a', 'sec_ct'], inductance: p.Lm * (p.turns_ratio ** 2), turns: p.turns_ratio },
            { name: 'sec_b', nodes: ['sec_b', 'sec_ct'], inductance: p.Lm * (p.turns_ratio ** 2), turns: p.turns_ratio }
        ],
        couplingMatrix: [[1.0, 0.98, -0.95], [0.98, 1.0, -0.90], [-0.95, -0.90, 1.0]]
    });
    solver.addComponents([
        new VoltageSource('Vin', ['vin', '0'], p.Vin),
        new VoltageControlledMOSFET('Q1', ['vin', 'G1', 'sw_a'], { Ron: 0.05 }), new VoltageControlledMOSFET('Q2', ['sw_a', 'G2', '0'], { Ron: 0.05 }),
        new VoltageControlledMOSFET('Q3', ['vin', 'G3', 'sw_b'], { Ron: 0.05 }), new VoltageControlledMOSFET('Q4', ['sw_b', 'G4', '0'], { Ron: 0.05 }),
        new VoltageSource('VG1', ['G1', '0'], 0), new VoltageSource('VG2', ['G2', '0'], 0),
        new VoltageSource('VG3', ['G3', '0'], 0), new VoltageSource('VG4', ['G4', '0'], 0),
        new Inductor('Lr', ['sw_a', 'res_node'], p.Lr), new Capacitor('Cr', ['res_node', 'sw_b'], p.Cr),
        transformer,
        new Diode('D1', ['sec_a', 'out'], { Vf: 0.7, Ron: 0.005 }), new Diode('D2', ['sec_b', 'out'], { Vf: 0.7, Ron: 0.005 }),
        new Resistor('R_sec_ct', ['sec_ct', '0'], 1e-9),
        new Capacitor('Cout', ['out', '0'], p.Cout, { ic: 0.1 }),
        new Resistor('Rload', ['out', '0'], p.Rload)
    ]);
    solver.isInitialized = true;
    return p;
}

function analyzeSweepResults(results) {
    const Lr = 25e-6;
    const Cr = 207e-9;
    const theoretical_fr = 1 / (2 * Math.PI * Math.sqrt(Lr * Cr));

    console.log('\n\n==================== 📈 頻率掃描最終報告 📈 ====================');
    console.log(`理論諧振頻率 (fr): ${(theoretical_fr / 1000).toFixed(1)} kHz`);
    console.log('-----------------------------------------------------------------');
    console.log('  頻率 (kHz)   |   平均輸出電壓 (V)');
    console.log('----------------|----------------------');

    let bestResult = { frequency: 0, vout: -Infinity };

    for (const result of results) {
        if (result.vout > bestResult.vout) {
            bestResult = result;
        }
        const freqStr = (result.frequency / 1000).toFixed(1).padStart(14);
        const voutStr = result.vout.toFixed(3).padStart(20);
        console.log(`${freqStr} | ${voutStr}`);
    }

    console.log('=================================================================\n');

    if (bestResult.vout > 0) {
        console.log('🏆🏆🏆 最佳增益點已找到！ 🏆🏆🏆');
        console.log(`  ➡️ 最佳工作頻率: ${(bestResult.frequency / 1000).toFixed(1)} kHz`);
        console.log(`  ➡️ 最高輸出電壓: ${bestResult.vout.toFixed(3)} V`);
        
        const deviation = Math.abs(bestResult.frequency - theoretical_fr) / theoretical_fr * 100;
        console.log(`  (此頻率與理論諧振點 ${ (theoretical_fr/1000).toFixed(1) }kHz 偏差 ${deviation.toFixed(1)}%)`);

        console.log('\n下一步建議:');
        console.log('  1. 使用這個最佳頻率作為你的閉迴路控制器的中心目標頻率。');
        console.log('  2. 根據這個最高電壓，重新計算所需的變壓器匝數比以達到 48V。');
        console.log('     - 新匝數比 n ≈ (最高輸出電壓) / 48V');
        
    } else {
        console.log('❌❌❌ 掃描失敗或未找到有效增益點。❌❌❌');
        console.log('所有頻率下的輸出電壓均未超過 0V。');
        console.log('這意味著電路可能存在比頻率失配更根本的問題。');
        console.log('建議重新檢查變壓器模型和二極體整流部分的連接。');
    }
    console.log('=================================================================\n');
}

// --- 執行主函數 ---
main();