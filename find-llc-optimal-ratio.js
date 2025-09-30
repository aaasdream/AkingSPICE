/**
 * =================================================================
 *      🎯 LLC 除错最终章: 降压变压器实现电压突破
 * =================================================================
 * 最终猜想:
 * 在 30kHz 这个特殊的工作点，降低匝数比 n (即使用降压变压器)，
 * 会减轻对谐振腔的负载效应，从而让系统工作在更高的增益区，
 * 最终获得远高于之前的输出电压。
 *
 * 实验设置:
 * - 开关频率: 30 kHz (固定)。
 * - 电路: 二极管整流，轻负载 Rload=50Ω。
 * - 扫描范围: 匝数比从 1.0 向下扫描到 0.1。
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

// --- 扫描配置 ---
const RATIO_SWEEP_CONFIG = {
    startRatio: 0.23,
    stopRatio: 0.21,
    steps: 100, // 1.0, 0.9, 0.8, ..., 0.1
};
const FIXED_FREQUENCY = 30000; // 30 kHz, 我们已知的最佳频率

async function main() {
    console.log('=================================================================');
    console.log('    🧪 LLC 最终突破实验: 降压匝数比扫描 (在 30kHz)');
    console.log('=================================================================');

    const ratiosToTest = generateRatioSteps(RATIO_SWEEP_CONFIG);
    const results = [];

    console.log(`\n将要扫描 ${ratiosToTest.length} 个降压匝数比:`);
    console.log(ratiosToTest.map(r => r.toFixed(2)).join(', '));

    for (const ratio of ratiosToTest) {
        console.log(`\n------------------ 扫描匝数比: ${ratio.toFixed(2)} ------------------`);
        try {
            const avg_vout = await runSingleRatioSimulation(FIXED_FREQUENCY, ratio);
            if (avg_vout !== null) {
                results.push({ ratio: ratio, vout: avg_vout });
                console.log(`✅ 匝数比 ${ratio.toFixed(2)} -> 平均输出电压: ${avg_vout.toFixed(3)} V`);
            } else {
                results.push({ ratio: ratio, vout: 0 });
            }
        } catch (error) {
            console.error(`❌ 在匝数比 ${ratio.toFixed(2)} 扫描时发生错误: ${error.message}`);
            results.push({ ratio: ratio, vout: -1 });
        }
    }

    // --- 分析并打印最终报告 ---
    analyzeFinalSweepResults(results);
}

function generateRatioSteps({ startRatio, stopRatio, steps }) {
    if (steps <= 1) return [startRatio];
    const stepSize = (stopRatio - startRatio) / (steps - 1);
    return Array.from({ length: steps }, (_, i) => startRatio + i * stepSize);
}

async function runSingleRatioSimulation(frequency, turns_ratio) {
    const solver = new AkingSPICE();
    solver.setDebug(false);

    const circuitParams = buildLLCWithDynamicRatio(solver, turns_ratio);
    const period = 1.0 / frequency;
    const timeStep = period / 20;
    const simTime = period * 100;

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

    const analysisStartIndex = Math.floor(simResults.steps.length * 0.5);
    const steadySteps = simResults.steps.slice(analysisStartIndex);
    const v_out = steadySteps.map(s => s.nodeVoltages['out']);
    return v_out.reduce((sum, v) => sum + v, 0) / v_out.length;
}

function buildLLCWithDynamicRatio(solver, turns_ratio) {
    const p = { Vin: 400, Lm: 200e-6, Lr: 25e-6, Cr: 207e-9, Cout: 1000e-6, deadTime: 500e-9, Rload: 50.0 };
    p.turns_ratio = turns_ratio;
    
    // 动态计算反射负载，以供观察
    const R_reflected = p.Rload / (p.turns_ratio ** 2);
    console.log(`    - 反射负载 R_reflected ≈ ${R_reflected.toFixed(1)} Ω (Z0≈11Ω)`);

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

function analyzeFinalSweepResults(results) {
    const TARGET_VOLTAGE = 48.0;

    console.log('\n\n==================== 📈 最终突破扫描报告 📈 ====================');
    console.log(`固定开关频率: ${FIXED_FREQUENCY / 1000} kHz`);
    console.log('-----------------------------------------------------------------');
    console.log('  匝数比 (n)  |   平均输出电압 (V) |   与 48V 的误差');
    console.log('----------------|----------------------|-----------------');

    let bestResult = { ratio: 0, vout: -Infinity, error: Infinity };
    let achievedTarget = false;

    for (const result of results) {
        const errorPercent = Math.abs(result.vout - TARGET_VOLTAGE) / TARGET_VOLTAGE * 100;
        if (errorPercent < bestResult.error) {
            bestResult = { ...result, error: errorPercent };
        }
        if (result.vout >= TARGET_VOLTAGE * 0.95 && result.vout <= TARGET_VOLTAGE * 1.05) {
             achievedTarget = true;
        }
        const ratioStr = result.ratio.toFixed(2).padStart(14);
        const voutStr = result.vout.toFixed(3).padStart(20);
        const errorStr = `${errorPercent.toFixed(1)}%`.padStart(15);
        console.log(`${ratioStr} | ${voutStr} | ${errorStr}`);
    }

    console.log('=================================================================\n');

    if (achievedTarget) {
        console.log('🎉🎉🎉 最终突破！我们成功达到了 48V 输出目标！ 🎉🎉🎉');
        console.log(`  ➡️ 最佳匝数比 (n): ${bestResult.ratio.toFixed(2)}`);
        console.log(`  ➡️ 对应输出电压: ${bestResult.vout.toFixed(3)} V`);
        console.log(`  ➡️ 与 48V 目标的最小误差: ${bestResult.error.toFixed(1)}%`);
        console.log('\n恭喜！你的 AkingSPICE 模拟器已经完全具备了模拟复杂 LLC 转换器的能力！');
        console.log('下一步就是整合同步整流和闭环控制，去实现一个完整的、可调节的电源模型！');

    } else if (bestResult.vout > 6.371) { // 检查电压是否比 n=1.0 时有显著提高
        console.log('🏆🏆🏆 重大进展！方向完全正确！ 🏆🏆🏆');
        console.log('降压变压器确实获得了更高的输出电压！');
        console.log(`  ➡️ 最佳匝数比 (n): ${bestResult.ratio.toFixed(2)} 产生了最高 ${bestResult.vout.toFixed(2)}V 的输出。`);
        console.log('虽然还未达到 48V，但我们已经找到了正确的路径。');
        console.log('\n下一步建议:');
        console.log(`  1. 继续向更低的匝数比扫描 (例如 0.05)。`);
        console.log(`  2. 微调开关频率，可能 30kHz 并非在所有匝数比下都是最优解。`);

    } else {
        console.log('❌❌❌ 实验失败，最终猜想未被证实。❌❌❌');
        console.log('输出电压并未随着匝数比的降低而显著升高。');
        console.log('这表明电路中存在一个我们尚未理解的、更根本的限制因素。');
        console.log('这可能与 Lm 的值、死区时间的设置或更深层次的数值稳定性问题有关。');
    }
    console.log('=================================================================\n');
}

// --- 执行主函数 ---
main();