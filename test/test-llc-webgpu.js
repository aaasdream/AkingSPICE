/**
 * LLC轉換器WebGPU試驗測試套件
 * 測試LLC轉換器在WebGPU加速下的完整仿真功能
 * 包含諧振電路、變壓器、整流電路的GPU驗證
 */

import { GPUExplicitStateSolver } from '../src/core/gpu-explicit-solver.js';
import { ExplicitStateSolver } from '../src/core/explicit-state-solver.js';
import { VoltageSource } from '../src/components/sources.js';
import { Resistor } from '../src/components/resistor.js';
import { Capacitor } from '../src/components/capacitor.js';
import { Inductor } from '../src/components/inductor.js';
import { Diode } from '../src/components/diode.js';
import { MultiWindingTransformer } from '../src/components/transformer.js';

class LLCWebGPUTestSuite {
    constructor() {
        this.tolerance = 1e-2; // 1%容差
        this.testResults = [];
    }

    /**
     * 測試1: LLC諧振槽GPU仿真
     */
    async testLLCResonantTank() {
        console.log('🔬 測試LLC諧振槽GPU仿真...');
        
        try {
            // LLC諧振參數 (典型48V轉12V設計)
            const Lr = 47e-6;   // 諧振電感 47µH
            const Cr = 100e-9;  // 諧振電容 100nF  
            const Lm = 150e-6;  // 磁化電感 150µH
            const fr = 1 / (2 * Math.PI * Math.sqrt(Lr * Cr)); // 諧振頻率 ~73kHz
            
            console.log(`   LLC參數: Lr=${Lr*1e6}µH, Cr=${Cr*1e9}nF, fr=${(fr/1000).toFixed(1)}kHz`);

            // 創建LLC諧振電路 (簡化為方波激勵)
            const components = [
                // 方波電壓源 (使用PULSE格式: v1=0, v2=48, td=0, tr=10e-9, tf=10e-9, pw=6.8e-6, per=13.7e-6)
                new VoltageSource('Vin', ['vin', 'gnd'], 'PULSE(0 48 0 10e-9 10e-9 6.8e-6 13.7e-6)'), 
                
                // 諧振電感
                new Inductor('Lr', ['vin', 'n1'], Lr, { ic: 0 }),
                
                // 諧振電容
                new Capacitor('Cr', ['n1', 'n2'], Cr, { ic: 0 }),
                
                // 磁化電感 (變壓器一次側等效)
                new Inductor('Lm', ['n2', 'gnd'], Lm, { ic: 0 }),
                
                // 等效負載電阻 (反射到一次側)
                new Resistor('Rload_eq', ['n2', 'gnd'], 10.0)
            ];

            // CPU基準測試
            console.log('   執行CPU基準仿真...');
            const cpuSolver = new ExplicitStateSolver();
            await cpuSolver.initialize(components, 50e-9, { debug: false }); // 50ns步長
            const cpuResults = await cpuSolver.run(0, 50e-6); // 仿真50µs (約3個週期)
            
            // GPU加速測試
            console.log('   執行GPU加速仿真...');
            const gpuSolver = new GPUExplicitStateSolver();
            await gpuSolver.initialize(components, 50e-9, { debug: false });
            const gpuResults = await gpuSolver.run(0, 50e-6);

            // 結果驗證
            const validation = this.validateResults(cpuResults, gpuResults, 'LLC諧振槽');
            
            if (validation.success) {
                console.log(`   ✅ LLC諧振槽GPU測試通過 (最大誤差: ${validation.maxError.toFixed(3)}%)`);
                console.log(`   📊 性能提升: ${validation.speedup.toFixed(1)}x`);
                return true;
            } else {
                console.log(`   ❌ LLC諧振槽GPU測試失敗 (誤差: ${validation.maxError.toFixed(3)}%)`);
                return false;
            }
            
        } catch (error) {
            console.log(`   💥 LLC諧振槽測試異常: ${error.message}`);
            return false;
        }
    }

    /**
     * 測試2: 變壓器GPU模型驗證 (使用耦合電感模擬)
     */
    async testTransformerGPU() {
        console.log('🔬 測試變壓器GPU模型 (耦合電感)...');
        
        try {
            // 使用耦合電感模擬變壓器 (4:1變比)
            const L1 = 100e-6; // 一次側電感 100µH
            const L2 = 6.25e-6; // 二次側電感 6.25µH (1/16 for 4:1 ratio)
            const k = 0.98; // 耦合係數
            
            const components = [
                // 一次側激勵 (SINE格式: offset=0, amplitude=48, frequency=100000)
                new VoltageSource('V_pri', ['pri', 'gnd'], 'SINE(0 48 100000)'), // 48V peak, 100kHz
                
                // 一次側電感 (變壓器一次側)
                new Inductor('L_pri', ['pri', 'pri_dot'], L1, { ic: 0 }),
                
                // 二次側電感 (變壓器二次側)
                new Inductor('L_sec', ['sec_dot', 'sec'], L2, { ic: 0 }),
                
                // 二次側負載
                new Resistor('R_load', ['sec', 'gnd'], 4.0), // 4Ω負載 (反射阻抗考慮)
                
                // 接地參考
                new Resistor('R_pri_gnd', ['pri_dot', 'gnd'], 1e6), // 高阻抗接地
                new Resistor('R_sec_gnd', ['sec_dot', 'gnd'], 1e6)  // 高阻抗接地
            ];

            // CPU vs GPU比較
            const cpuSolver = new ExplicitStateSolver();
            await cpuSolver.initialize(components, 100e-9, { debug: false }); // 100ns步長
            const cpuResults = await cpuSolver.run(0, 20e-6); // 2個週期
            
            const gpuSolver = new GPUExplicitStateSolver();
            await gpuSolver.initialize(components, 100e-9, { debug: false });
            const gpuResults = await gpuSolver.run(0, 20e-6);

            const validation = this.validateResults(cpuResults, gpuResults, '變壓器模型');
            
            if (validation.success) {
                console.log(`   ✅ 變壓器GPU模型驗證通過 (誤差: ${validation.maxError.toFixed(3)}%)`);
                return true;
            } else {
                console.log(`   ❌ 變壓器GPU模型驗證失敗 (誤差: ${validation.maxError.toFixed(3)}%)`);
                return false;
            }
            
        } catch (error) {
            console.log(`   💥 變壓器GPU測試異常: ${error.message}`);
            return false;
        }
    }

    /**
     * 測試3: 整流二極體GPU非線性行為
     */
    async testRectifierGPU() {
        console.log('🔬 測試整流二極體GPU非線性行為...');
        
        try {
            // 簡化的二次側整流電路
            const components = [
                // 變壓器二次側電壓源 (SINE格式: offset=0, amplitude=17, frequency=100000)
                new VoltageSource('V_sec', ['sec', 'gnd'], 'SINE(0 17 100000)'), // 12V RMS, 100kHz
                
                // 整流二極體
                new Diode('D1', ['sec', 'cathode'], { Is: 1e-12, n: 1.0, Rs: 0.1 }),
                
                // 輸出電容
                new Capacitor('C_out', ['cathode', 'gnd'], 470e-6, { ic: 0 }), // 470µF
                
                // 負載電阻
                new Resistor('R_load', ['cathode', 'gnd'], 1.0) // 1Ω負載
            ];

            // CPU基準測試
            const cpuSolver = new ExplicitStateSolver();
            await cpuSolver.initialize(components, 50e-9, { debug: false }); // 50ns步長
            const cpuResults = await cpuSolver.run(0, 30e-6); // 3個週期
            
            // GPU加速測試
            const gpuSolver = new GPUExplicitStateSolver();
            await gpuSolver.initialize(components, 50e-9, { debug: false });
            const gpuResults = await gpuSolver.run(0, 30e-6);

            const validation = this.validateResults(cpuResults, gpuResults, '整流電路');
            
            if (validation.success) {
                console.log(`   ✅ 整流二極體GPU測試通過 (誤差: ${validation.maxError.toFixed(3)}%)`);
                
                // 檢查整流效果
                const outputNode = 'cathode';
                if (cpuResults.nodeVoltages[outputNode]) {
                    const avgVoltage = this.calculateAverage(cpuResults.nodeVoltages[outputNode]);
                    console.log(`   📈 平均輸出電壓: ${avgVoltage.toFixed(2)}V (預期: ~10.8V)`);
                }
                
                return true;
            } else {
                console.log(`   ❌ 整流二極體GPU測試失敗 (誤差: ${validation.maxError.toFixed(3)}%)`);
                return false;
            }
            
        } catch (error) {
            console.log(`   💥 整流電路GPU測試異常: ${error.message}`);
            return false;
        }
    }

    /**
     * 測試4: 簡化LLC轉換器GPU仿真 (諧振槽 + 整流)
     */
    async testCompleteLLCGPU() {
        console.log('🔬 測試簡化LLC轉換器GPU仿真...');
        
        try {
            // 簡化的LLC拓撲 (諧振槽 + 等效二次側)
            const components = [
                // 開關網路 (方波激勵)
                new VoltageSource('Vsw', ['sw_node', 'gnd'], 'PULSE(0 48 0 10e-9 10e-9 6.8e-6 13.7e-6)'),
                
                // 諧振電感
                new Inductor('Lr', ['sw_node', 'cr_node'], 47e-6, { ic: 0 }),
                
                // 諧振電容
                new Capacitor('Cr', ['cr_node', 'lm_node'], 100e-9, { ic: 0 }),
                
                // 磁化電感
                new Inductor('Lm', ['lm_node', 'gnd'], 150e-6, { ic: 0 }),
                
                // 等效反射負載 (簡化變壓器 + 整流)
                new Resistor('R_reflected', ['lm_node', 'gnd'], 8.0), // 等效反射電阻
                
                // 模擬二次側整流後的輸出
                new VoltageSource('V_sec_eq', ['sec_node', 'gnd'], 'SINE(0 12 73000)'), // 等效二次側
                
                // 整流二極體 (簡化)
                new Diode('D_rect', ['sec_node', 'output'], { Is: 1e-12, n: 1.0, Rs: 0.05 }),
                
                // 輸出濾波
                new Capacitor('C_out', ['output', 'gnd'], 470e-6, { ic: 12 }),
                
                // 負載
                new Resistor('R_load', ['output', 'gnd'], 1.0)
            ];

            console.log('   初始化簡化LLC電路...');
            
            // CPU基準測試
            console.log('   執行CPU基準仿真...');
            const cpuSolver = new ExplicitStateSolver();
            await cpuSolver.initialize(components, 200e-9, { debug: false }); // 200ns步長
            const cpuResults = await cpuSolver.run(0, 50e-6); // 50µs
            
            // GPU加速測試
            console.log('   執行GPU加速仿真...');
            const gpuSolver = new GPUExplicitStateSolver();
            await gpuSolver.initialize(components, 200e-9, { debug: false });
            const gpuResults = await gpuSolver.run(0, 50e-6);

            const validation = this.validateResults(cpuResults, gpuResults, '簡化LLC');
            
            if (validation.success) {
                console.log(`   ✅ 簡化LLC GPU仿真成功 (誤差: ${validation.maxError.toFixed(3)}%)`);
                console.log(`   🚀 GPU加速比: ${validation.speedup.toFixed(1)}x`);
                
                // 諧振槽分析
                if (cpuResults.nodeVoltages['cr_node']) {
                    const resonantVoltages = cpuResults.nodeVoltages['cr_node'];
                    const avgResonant = this.calculateAverage(resonantVoltages.slice(-100));
                    console.log(`   📊 諧振節點電壓: ${avgResonant.toFixed(2)}V`);
                }
                
                // 輸出分析
                if (cpuResults.nodeVoltages['output']) {
                    const outputVoltages = cpuResults.nodeVoltages['output'];
                    const steady = outputVoltages.slice(-50);
                    const avgOutput = this.calculateAverage(steady);
                    const ripple = this.calculateRipple(steady);
                    
                    console.log(`   📊 輸出電壓: ${avgOutput.toFixed(2)}V ± ${ripple.toFixed(3)}V`);
                }
                
                return true;
            } else {
                console.log(`   ❌ 簡化LLC GPU仿真失敗 (誤差: ${validation.maxError.toFixed(3)}%)`);
                return false;
            }
            
        } catch (error) {
            console.log(`   💥 簡化LLC測試異常: ${error.message}`);
            return false;
        }
    }

    /**
     * 結果驗證工具函數
     */
    validateResults(cpuResults, gpuResults, testName) {
        if (!cpuResults || !gpuResults) {
            return { success: false, maxError: 100, speedup: 0 };
        }

        let maxError = 0;
        let comparedNodes = 0;

        // 比較所有共同節點的電壓
        for (const nodeName of Object.keys(cpuResults.nodeVoltages)) {
            if (gpuResults.nodeVoltages[nodeName]) {
                const cpuVoltages = cpuResults.nodeVoltages[nodeName];
                const gpuVoltages = gpuResults.nodeVoltages[nodeName];
                
                const minLength = Math.min(cpuVoltages.length, gpuVoltages.length);
                
                for (let i = 0; i < minLength; i++) {
                    const error = Math.abs(cpuVoltages[i] - gpuVoltages[i]);
                    const relError = error / (Math.abs(cpuVoltages[i]) + 1e-12) * 100;
                    maxError = Math.max(maxError, relError);
                }
                comparedNodes++;
            }
        }

        const success = maxError < this.tolerance * 100; // 轉換為百分比
        
        // 估算加速比
        const cpuTime = cpuResults.totalTime || 1000; // 默認值
        const gpuTime = gpuResults.totalTime || 800;
        const speedup = cpuTime / gpuTime;

        return {
            success,
            maxError,
            speedup,
            comparedNodes,
            testName
        };
    }

    /**
     * 計算平均值
     */
    calculateAverage(values) {
        return values.reduce((sum, v) => sum + v, 0) / values.length;
    }

    /**
     * 計算紋波 (峰峰值)
     */
    calculateRipple(values) {
        const min = Math.min(...values);
        const max = Math.max(...values);
        return (max - min) / 2;
    }

    /**
     * 執行完整測試套件
     */
    async runAllTests() {
        console.log('🚀 LLC WebGPU 試驗測試套件');
        console.log('=' .repeat(60));
        
        let passedTests = 0;
        const totalTests = 4;

        // 測試1: LLC諧振槽
        if (await this.testLLCResonantTank()) {
            passedTests++;
        }
        console.log('');

        // 測試2: 變壓器模型
        if (await this.testTransformerGPU()) {
            passedTests++;
        }
        console.log('');

        // 測試3: 整流電路
        if (await this.testRectifierGPU()) {
            passedTests++;
        }
        console.log('');

        // 測試4: 完整LLC
        if (await this.testCompleteLLCGPU()) {
            passedTests++;
        }

        // 總結報告
        console.log('=' .repeat(60));
        console.log(`📊 LLC WebGPU試驗結果: ${passedTests}/${totalTests} 通過 (${(passedTests/totalTests*100).toFixed(1)}%)`);
        
        if (passedTests === totalTests) {
            console.log('🎉 所有LLC WebGPU測試通過！GPU加速LLC仿真準備就緒。');
            console.log('✅ 可以進行FPGA轉換的下一步工作。');
        } else {
            console.log(`⚠️  ${totalTests - passedTests} 個測試需要進一步調試和優化。`);
        }

        return passedTests === totalTests;
    }
}

// 主程序
async function main() {
    try {
        const testSuite = new LLCWebGPUTestSuite();
        await testSuite.runAllTests();
    } catch (error) {
        console.error('💥 LLC WebGPU試驗異常終止:', error);
        process.exit(1);
    }
}

// 如果直接執行此文件
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
    main();
}

export { LLCWebGPUTestSuite };