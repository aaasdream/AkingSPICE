/**
 * RLC電路全面頻率響應測試
 * 測試不同阻尼比例下的RLC電路暫態響應
 * 包括：欠阻尼、臨界阻尼、過阻尼情況
 */

import { ExplicitStateSolver } from '../src/core/explicit-state-solver.js';
import { VoltageSource } from '../src/components/sources.js';
import { Resistor } from '../src/components/resistor.js';
import { Capacitor } from '../src/components/capacitor.js';
import { Inductor } from '../src/components/inductor.js';

/**
 * 測試RLC串聯電路的暫態響應
 * 電路：V1(階躍) -> R -> L -> C -> GND
 */
class RLCFrequencyTester {
    constructor() {
        this.testResults = [];
    }

    /**
     * 計算RLC電路的理論參數
     */
    calculateTheoryParams(R, L, C) {
        const omega0 = 1 / Math.sqrt(L * C);  // 無阻尼自然頻率 (rad/s)
        const f0 = omega0 / (2 * Math.PI);    // 無阻尼自然頻率 (Hz)
        const zeta = R / 2 * Math.sqrt(C / L); // 阻尼比
        const Q = 1 / (2 * zeta);             // 品質因子
        
        let damping_type = '';
        let omega_d = 0;  // 阻尼振盪頻率
        
        if (zeta < 1) {
            damping_type = '欠阻尼 (Underdamped)';
            omega_d = omega0 * Math.sqrt(1 - zeta * zeta);
        } else if (zeta === 1) {
            damping_type = '臨界阻尼 (Critically Damped)';
        } else {
            damping_type = '過阻尼 (Overdamped)';
        }
        
        return {
            omega0,
            f0,
            zeta,
            Q,
            damping_type,
            omega_d,
            fd: omega_d / (2 * Math.PI)  // 阻尼振盪頻率 (Hz)
        };
    }

    /**
     * 欠阻尼RLC電路理論解
     * Vc(t) = Vfinal * (1 - e^(-zeta*omega0*t) * (cos(omega_d*t) + (zeta*omega0/omega_d)*sin(omega_d*t)))
     */
    calculateUnderdampedResponse(t, Vfinal, omega0, zeta) {
        const omega_d = omega0 * Math.sqrt(1 - zeta * zeta);
        const alpha = zeta * omega0;
        
        const exponential_term = Math.exp(-alpha * t);
        const cos_term = Math.cos(omega_d * t);
        const sin_term = Math.sin(omega_d * t);
        
        return Vfinal * (1 - exponential_term * (cos_term + (alpha / omega_d) * sin_term));
    }

    /**
     * 臨界阻尼RLC電路理論解
     * Vc(t) = Vfinal * (1 - e^(-omega0*t) * (1 + omega0*t))
     */
    calculateCriticallyDampedResponse(t, Vfinal, omega0) {
        const exponential_term = Math.exp(-omega0 * t);
        return Vfinal * (1 - exponential_term * (1 + omega0 * t));
    }

    /**
     * 過阻尼RLC電路理論解
     * Vc(t) = Vfinal * (1 - e^(-alpha*t) * (A*e^(beta*t) + B*e^(-beta*t)))
     * 其中 alpha = zeta*omega0, beta = omega0*sqrt(zeta^2 - 1)
     */
    calculateOverdampedResponse(t, Vfinal, omega0, zeta) {
        const alpha = zeta * omega0;
        const beta = omega0 * Math.sqrt(zeta * zeta - 1);
        const r1 = -alpha + beta;  // 特徵根1
        const r2 = -alpha - beta;  // 特徵根2
        
        // 初始條件：Vc(0) = 0, dVc/dt(0) = 0
        // 求解係數 A 和 B
        const A = -r2 / (r1 - r2);
        const B = r1 / (r1 - r2);
        
        return Vfinal * (1 - A * Math.exp(r1 * t) - B * Math.exp(r2 * t));
    }

    /**
     * 測試特定RLC參數的電路
     */
    async testRLCCircuit(R, L, C, Vstep = 12.0, testDuration = 1e-4, timeStep = 1e-7) {
        console.log(`\n=== 測試RLC電路：R=${R}Ω, L=${L*1e3}mH, C=${C*1e6}µF ===`);
        
        // 計算理論參數
        const theory = this.calculateTheoryParams(R, L, C);
        console.log(`理論參數：`);
        console.log(`  自然頻率 f0 = ${theory.f0.toFixed(2)} Hz (${theory.omega0.toFixed(0)} rad/s)`);
        console.log(`  阻尼比 ζ = ${theory.zeta.toFixed(3)}`);
        console.log(`  品質因子 Q = ${theory.Q.toFixed(2)}`);
        console.log(`  ${theory.damping_type}`);
        if (theory.omega_d > 0) {
            console.log(`  阻尼振盪頻率 fd = ${theory.fd.toFixed(2)} Hz`);
        }

        // 建立電路
        const components = [
            new VoltageSource('V1', ['vin', 'gnd'], Vstep),
            new Resistor('R1', ['vin', 'n1'], R),
            new Inductor('L1', ['n1', 'n2'], L, { ic: 0 }),      // 初始電流 0A
            new Capacitor('C1', ['n2', 'gnd'], C, { ic: 0 })     // 初始電壓 0V
        ];

        // 初始化求解器
        const solver = new ExplicitStateSolver();
        await solver.initialize(components, timeStep, { debug: false });

        console.log(`開始仿真：持續時間 ${testDuration*1e6}µs，時間步長 ${timeStep*1e6}µs`);

        // 仿真
        const results = [];
        const totalSteps = Math.floor(testDuration / timeStep);
        const logInterval = Math.floor(totalSteps / 20); // 記錄20個點
        
        for (let step = 0; step < totalSteps; step++) {
            const result = solver.step();
            
            if (step % logInterval === 0) {
                const time = result.time;
                const vcap = result.stateVariables.get('C1') || 0;
                const il = result.stateVariables.get('L1') || 0;
                
                // 計算理論值
                let vcap_theory = 0;
                if (theory.zeta < 1) {
                    vcap_theory = this.calculateUnderdampedResponse(time, Vstep, theory.omega0, theory.zeta);
                } else if (theory.zeta === 1) {
                    vcap_theory = this.calculateCriticallyDampedResponse(time, Vstep, theory.omega0);
                } else {
                    vcap_theory = this.calculateOverdampedResponse(time, Vstep, theory.omega0, theory.zeta);
                }
                
                const error = Math.abs(vcap - vcap_theory);
                const error_percent = (error / Vstep) * 100;
                
                results.push({
                    time: time,
                    vcap_measured: vcap,
                    vcap_theory: vcap_theory,
                    il_measured: il,
                    error: error,
                    error_percent: error_percent
                });
                
                if (results.length <= 10) { // 只打印前10個點
                    console.log(`t=${(time*1e6).toFixed(2)}µs: Vc=${vcap.toFixed(4)}V (理論=${vcap_theory.toFixed(4)}V), Il=${il.toFixed(6)}A, 誤差=${error_percent.toFixed(3)}%`);
                }
            }
        }

        solver.destroy();

        // 分析結果
        const maxError = Math.max(...results.map(r => r.error_percent));
        const avgError = results.reduce((sum, r) => sum + r.error_percent, 0) / results.length;
        
        console.log(`\n結果分析：`);
        console.log(`  最大誤差: ${maxError.toFixed(3)}%`);
        console.log(`  平均誤差: ${avgError.toFixed(3)}%`);
        console.log(`  最終電容電壓: ${results[results.length-1].vcap_measured.toFixed(4)}V (理論=${Vstep.toFixed(4)}V)`);
        
        const testResult = {
            params: { R, L, C, Vstep },
            theory: theory,
            results: results,
            metrics: {
                maxError: maxError,
                avgError: avgError,
                finalVoltage: results[results.length-1].vcap_measured
            }
        };
        
        this.testResults.push(testResult);
        return testResult;
    }

    /**
     * 運行全面的RLC測試套件
     */
    async runFullTestSuite() {
        console.log('🧪 開始RLC電路頻率響應全面測試...\n');

        // 測試1：欠阻尼電路 (ζ ≈ 0.2, 高Q值，明顯振盪)
        await this.testRLCCircuit(
            50,      // R = 50Ω
            1e-3,    // L = 1mH  
            10e-6,   // C = 10µF
            12.0,    // 12V階躍
            200e-6,  // 200µs測試時間
            0.5e-6   // 0.5µs時間步長
        );

        // 測試2：臨界阻尼電路 (ζ ≈ 1)
        await this.testRLCCircuit(
            200,     // R = 200Ω (調整以接近臨界阻尼)
            1e-3,    // L = 1mH
            10e-6,   // C = 10µF  
            12.0,
            200e-6,
            0.5e-6
        );

        // 測試3：過阻尼電路 (ζ > 1, 無振盪)
        await this.testRLCCircuit(
            500,     // R = 500Ω
            1e-3,    // L = 1mH
            10e-6,   // C = 10µF
            12.0,
            200e-6,
            0.5e-6
        );

        // 測試4：高頻RLC (更小的L和C值)
        await this.testRLCCircuit(
            100,     // R = 100Ω
            100e-6,  // L = 100µH
            1e-6,    // C = 1µF
            5.0,     // 5V階躍
            50e-6,   // 50µs測試時間
            0.1e-6   // 0.1µs時間步長
        );

        // 測試5：低頻RLC (更大的L和C值) 
        await this.testRLCCircuit(
            200,     // R = 200Ω
            10e-3,   // L = 10mH
            100e-6,  // C = 100µF
            10.0,    // 10V階躍
            2e-3,    // 2ms測試時間
            5e-6     // 5µs時間步長
        );

        this.printSummary();
    }

    /**
     * 打印測試總結
     */
    printSummary() {
        console.log('\n' + '='.repeat(60));
        console.log('📊 RLC電路測試總結');
        console.log('='.repeat(60));

        for (let i = 0; i < this.testResults.length; i++) {
            const test = this.testResults[i];
            const { R, L, C } = test.params;
            
            console.log(`\n測試 ${i+1}: R=${R}Ω, L=${L*1e3}mH, C=${C*1e6}µF`);
            console.log(`  阻尼類型: ${test.theory.damping_type}`);
            console.log(`  阻尼比 ζ = ${test.theory.zeta.toFixed(3)}, 品質因子 Q = ${test.theory.Q.toFixed(2)}`);
            console.log(`  最大誤差: ${test.metrics.maxError.toFixed(3)}%`);
            console.log(`  平均誤差: ${test.metrics.avgError.toFixed(3)}%`);
            
            // 評估測試結果
            let status = '✅ 優秀';
            if (test.metrics.maxError > 5) {
                status = '❌ 需要改進';
            } else if (test.metrics.maxError > 2) {
                status = '⚠️ 可接受';
            }
            console.log(`  測試結果: ${status}`);
        }

        // 整體統計
        const overallMaxError = Math.max(...this.testResults.map(t => t.metrics.maxError));
        const overallAvgError = this.testResults.reduce((sum, t) => sum + t.metrics.avgError, 0) / this.testResults.length;
        
        console.log(`\n整體測試統計:`);
        console.log(`  所有測試的最大誤差: ${overallMaxError.toFixed(3)}%`);
        console.log(`  所有測試的平均誤差: ${overallAvgError.toFixed(3)}%`);
        
        if (overallMaxError < 2) {
            console.log(`  🎉 修正後的求解器性能優異！`);
        } else if (overallMaxError < 5) {
            console.log(`  ✅ 修正後的求解器性能良好！`);
        } else {
            console.log(`  ⚠️ 求解器需要進一步優化`);
        }
    }
}

/**
 * 主測試函數
 */
async function runRLCFrequencyTests() {
    try {
        const tester = new RLCFrequencyTester();
        await tester.runFullTestSuite();
        
    } catch (error) {
        console.error('❌ RLC頻率測試失敗:', error.message);
        console.error(error.stack);
    }
}

// 運行測試
runRLCFrequencyTests();  // 直接運行

export { RLCFrequencyTester, runRLCFrequencyTests };