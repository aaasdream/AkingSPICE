/**
 * CPU vs GPU 模擬差異系統診斷測試套件
 * 逐步分析各個階段的差異來源
 */

import { GPUExplicitStateSolver } from '../src/core/gpu-explicit-solver.js';
import { ExplicitStateSolver } from '../src/core/explicit-state-solver.js';
import { VoltageSource } from '../src/components/sources.js';
import { Resistor } from '../src/components/resistor.js';
import { Capacitor } from '../src/components/capacitor.js';
import { Inductor } from '../src/components/inductor.js';

class CPUGPUDiagnosticSuite {
    constructor() {
        this.tolerance = 1e-6; // 非常嚴格的容差
        this.results = [];
    }

    /**
     * 診斷1: 電路預處理階段比較
     */
    async diagnosePreprocessing() {
        console.log('\n🔬 診斷1: 電路預處理階段比較');
        console.log('='.repeat(50));
        
        const components = [
            new VoltageSource('V1', ['in', 'gnd'], 'DC(5)'),
            new Resistor('R1', ['in', 'out'], 1000),
            new Capacitor('C1', ['out', 'gnd'], 1e-6, { ic: 0 })
        ];

        // CPU預處理
        console.log('CPU預處理:');
        const cpuSolver = new ExplicitStateSolver();
        await cpuSolver.initialize(components, 1e-5, { debug: true });
        
        const cpuCircuitData = cpuSolver.circuitData;
        console.log('  節點數:', cpuCircuitData.nodeCount);
        console.log('  狀態變量數:', cpuCircuitData.stateCount);
        console.log('  G矩陣非零元素數:', cpuSolver.gMatrix ? cpuSolver.gMatrix.nnz : 'N/A');
        
        if (cpuSolver.gMatrix) {
            console.log('  G矩陣:');
            for (let i = 0; i < cpuCircuitData.nodeCount; i++) {
                const row = [];
                for (let j = 0; j < cpuCircuitData.nodeCount; j++) {
                    row.push(cpuSolver.gMatrix.get(i, j).toExponential(3));
                }
                console.log(`    [${row.join(', ')}]`);
            }
        }

        // GPU預處理
        console.log('\nGPU預處理:');
        const gpuSolver = new GPUExplicitStateSolver();
        await gpuSolver.initialize(components, 1e-5, { debug: true });
        
        const gpuCircuitData = gpuSolver.circuitData;
        console.log('  節點數:', gpuCircuitData.nodeCount);
        console.log('  狀態變量數:', gpuCircuitData.stateCount);

        // 比較
        const nodeCountMatch = cpuCircuitData.nodeCount === gpuCircuitData.nodeCount;
        const stateCountMatch = cpuCircuitData.stateCount === gpuCircuitData.stateCount;
        
        console.log('\n📊 預處理比較結果:');
        console.log(`  節點數匹配: ${nodeCountMatch ? '✅' : '❌'}`);
        console.log(`  狀態變量數匹配: ${stateCountMatch ? '✅' : '❌'}`);
        
        return nodeCountMatch && stateCountMatch;
    }

    /**
     * 診斷2: 線性方程求解比較
     */
    async diagnoseLinearSolver() {
        console.log('\n🔬 診斷2: 線性方程求解比較');
        console.log('='.repeat(50));
        
        // 簡單的純電阻電路
        const components = [
            new VoltageSource('V1', ['in', 'gnd'], 'DC(10)'),
            new Resistor('R1', ['in', 'mid'], 1000),
            new Resistor('R2', ['mid', 'gnd'], 2000)
        ];

        // CPU求解
        console.log('CPU線性求解:');
        const cpuSolver = new ExplicitStateSolver();
        await cpuSolver.initialize(components, 1e-5, { debug: false });
        
        // 手動觸發一次線性求解
        const cpuResult = cpuSolver.step();
        console.log('  節點電壓:', Array.from(cpuSolver.solutionVector).map(v => v.toFixed(6)));

        // GPU求解
        console.log('\nGPU線性求解:');
        const gpuSolver = new GPUExplicitStateSolver();
        await gpuSolver.initialize(components, 1e-5, { debug: true });
        
        const gpuResult = await gpuSolver.step();
        
        // GPU返回的是對象格式 {節點名: 電壓值}，需要轉換為數組
        const gpuVoltagesArray = [];
        if (gpuResult.nodeVoltages && typeof gpuResult.nodeVoltages === 'object') {
            const nodeNames = Object.keys(gpuResult.nodeVoltages);
            console.log('  節點映射:', nodeNames);
            for (const nodeName of nodeNames) {
                gpuVoltagesArray.push(gpuResult.nodeVoltages[nodeName]);
            }
            console.log('  節點電壓:', gpuVoltagesArray.map(v => v.toFixed(6)));
        } else {
            console.log('  節點電壓: []');
        }

        // 比較
        console.log('\n📊 線性求解比較:');
        let maxError = 0;
        for (let i = 0; i < cpuSolver.solutionVector.length; i++) {
            const cpuV = cpuSolver.solutionVector[i];
            const gpuV = gpuVoltagesArray[i] || 0;
            const error = Math.abs(cpuV - gpuV);
            const relError = error / (Math.abs(cpuV) + 1e-12) * 100;
            maxError = Math.max(maxError, relError);
            
            console.log(`  節點${i}: CPU=${cpuV.toFixed(6)}V, GPU=${gpuV.toFixed(6)}V, 誤差=${relError.toFixed(3)}%`);
        }
        
        return maxError < 0.1; // 0.1%容差
    }

    /**
     * 診斷3: 狀態變量更新比較
     */
    async diagnoseStateUpdate() {
        console.log('\n🔬 診斷3: 狀態變量更新比較');
        console.log('='.repeat(50));
        
        const components = [
            new VoltageSource('V1', ['in', 'gnd'], 'DC(5)'),
            new Resistor('R1', ['in', 'out'], 1000),
            new Capacitor('C1', ['out', 'gnd'], 1e-6, { ic: 0 })
        ];

        // CPU狀態更新
        console.log('CPU狀態更新:');
        const cpuSolver = new ExplicitStateSolver();
        await cpuSolver.initialize(components, 1e-5, { debug: false });
        
        // 執行幾個時間步並記錄狀態
        const cpuStates = [];
        for (let i = 0; i < 5; i++) {
            const result = cpuSolver.step();
            cpuStates.push({
                time: cpuSolver.currentTime,
                nodeVoltages: Array.from(cpuSolver.solutionVector),
                stateVector: Array.from(cpuSolver.stateVector)
            });
            console.log(`  t=${cpuSolver.currentTime.toExponential(2)}: Vc=${cpuSolver.stateVector[0].toFixed(6)}V`);
        }

        // GPU狀態更新
        console.log('\nGPU狀態更新:');
        const gpuSolver = new GPUExplicitStateSolver();
        await gpuSolver.initialize(components, 1e-5, { debug: false });
        
        const gpuStates = [];
        for (let i = 0; i < 5; i++) {
            const result = await gpuSolver.step();
            
            // 處理nodeVoltages可能是對象的情況
            let nodeVoltagesArray = [];
            if (result.nodeVoltages && typeof result.nodeVoltages === 'object' && !Array.isArray(result.nodeVoltages)) {
                nodeVoltagesArray = Object.values(result.nodeVoltages);
            } else if (Array.isArray(result.nodeVoltages)) {
                nodeVoltagesArray = result.nodeVoltages;
            }
            
            gpuStates.push({
                time: gpuSolver.currentTime,
                nodeVoltages: nodeVoltagesArray,
                stateVector: Array.from(result.stateVector)
            });
            console.log(`  t=${gpuSolver.currentTime.toExponential(2)}: Vc=${result.stateVector[0].toFixed(6)}V`);
        }

        // 比較狀態演化
        console.log('\n📊 狀態更新比較:');
        let maxStateError = 0;
        for (let i = 0; i < cpuStates.length; i++) {
            const cpuVc = cpuStates[i].stateVector[0];
            const gpuVc = gpuStates[i].stateVector[0];
            const error = Math.abs(cpuVc - gpuVc);
            const relError = error / (Math.abs(cpuVc) + 1e-12) * 100;
            maxStateError = Math.max(maxStateError, relError);
            
            console.log(`  步驟${i}: CPU=${cpuVc.toFixed(6)}V, GPU=${gpuVc.toFixed(6)}V, 誤差=${relError.toFixed(3)}%`);
        }
        
        return maxStateError < 1.0; // 1%容差
    }

    /**
     * 診斷4: 時間步長敏感性測試
     */
    async diagnoseTimeStepSensitivity() {
        console.log('\n🔬 診斷4: 時間步長敏感性測試');
        console.log('='.repeat(50));
        
        const components = [
            new VoltageSource('V1', ['in', 'gnd'], 'DC(5)'),
            new Resistor('R1', ['in', 'out'], 1000),
            new Capacitor('C1', ['out', 'gnd'], 1e-6, { ic: 0 })
        ];

        const timeSteps = [1e-3, 1e-4, 1e-5, 1e-6]; // 不同的時間步長
        const simulationTime = 1e-3; // 1ms模擬時間
        
        console.log('測試不同時間步長下的收斂性:');
        
        for (const dt of timeSteps) {
            console.log(`\n⏱️ 時間步長: ${dt.toExponential(0)}`);
            
            // CPU測試
            const cpuSolver = new ExplicitStateSolver();
            await cpuSolver.initialize(components, dt, { debug: false });
            const cpuResults = await cpuSolver.run(0, simulationTime);
            const cpuFinalVc = cpuResults.nodeVoltages['out']?.slice(-1)[0] || 0;
            
            // GPU測試
            const gpuSolver = new GPUExplicitStateSolver();
            await gpuSolver.initialize(components, dt, { debug: false });
            const gpuResults = await gpuSolver.run(0, simulationTime);
            const gpuFinalVc = gpuResults.nodeVoltages['out']?.slice(-1)[0] || 0;
            
            // 理論值 (RC充電)
            const tau = 1000 * 1e-6; // RC = 1ms
            const theoretical = 5 * (1 - Math.exp(-simulationTime / tau));
            
            const cpuError = Math.abs(cpuFinalVc - theoretical) / theoretical * 100;
            const gpuError = Math.abs(gpuFinalVc - theoretical) / theoretical * 100;
            const diffError = Math.abs(cpuFinalVc - gpuFinalVc) / Math.abs(cpuFinalVc) * 100;
            
            console.log(`  理論值: ${theoretical.toFixed(6)}V`);
            console.log(`  CPU: ${cpuFinalVc.toFixed(6)}V (誤差: ${cpuError.toFixed(3)}%)`);
            console.log(`  GPU: ${gpuFinalVc.toFixed(6)}V (誤差: ${gpuError.toFixed(3)}%)`);
            console.log(`  CPU-GPU差異: ${diffError.toFixed(3)}%`);
        }
        
        return true;
    }

    /**
     * 診斷5: 數值精度比較
     */
    async diagnoseNumericalPrecision() {
        console.log('\n🔬 診斷5: 數值精度比較');
        console.log('='.repeat(50));
        
        // 測試極小和極大的參數值
        const testCases = [
            { R: 1e3, C: 1e-6, label: '標準RC' },
            { R: 1e6, C: 1e-9, label: '高阻小容' },
            { R: 1e1, C: 1e-3, label: '低阻大容' },
            { R: 1e9, C: 1e-12, label: '極值參數' }
        ];
        
        for (const testCase of testCases) {
            console.log(`\n🧪 ${testCase.label} (R=${testCase.R.toExponential(0)}Ω, C=${testCase.C.toExponential(0)}F):`);
            
            const components = [
                new VoltageSource('V1', ['in', 'gnd'], 'DC(1)'),
                new Resistor('R1', ['in', 'out'], testCase.R),
                new Capacitor('C1', ['out', 'gnd'], testCase.C, { ic: 0 })
            ];
            
            const tau = testCase.R * testCase.C;
            const dt = tau / 1000; // 時間步長為時間常數的1/1000
            const simTime = tau * 2; // 模擬2個時間常數
            
            try {
                // CPU測試
                const cpuSolver = new ExplicitStateSolver();
                await cpuSolver.initialize(components, dt, { debug: false });
                const cpuResults = await cpuSolver.run(0, simTime);
                const cpuFinalVc = cpuResults.nodeVoltages['out']?.slice(-1)[0] || 0;
                
                // GPU測試
                const gpuSolver = new GPUExplicitStateSolver();
                await gpuSolver.initialize(components, dt, { debug: false });
                const gpuResults = await gpuSolver.run(0, simTime);
                const gpuFinalVc = gpuResults.nodeVoltages['out']?.slice(-1)[0] || 0;
                
                // 理論值 (2τ時約86.47%)
                const theoretical = 1 * (1 - Math.exp(-2));
                
                const cpuError = Math.abs(cpuFinalVc - theoretical) / theoretical * 100;
                const gpuError = Math.abs(gpuFinalVc - theoretical) / theoretical * 100;
                const diffError = Math.abs(cpuFinalVc - gpuFinalVc) / Math.abs(cpuFinalVc + 1e-15) * 100;
                
                console.log(`  時間常數: ${tau.toExponential(2)}s`);
                console.log(`  理論值: ${theoretical.toFixed(6)}V`);
                console.log(`  CPU: ${cpuFinalVc.toExponential(6)}V (誤差: ${cpuError.toFixed(3)}%)`);
                console.log(`  GPU: ${gpuFinalVc.toExponential(6)}V (誤差: ${gpuError.toFixed(3)}%)`);
                console.log(`  CPU-GPU差異: ${diffError.toFixed(3)}%`);
                
            } catch (error) {
                console.log(`  ❌ 測試失敗: ${error.message}`);
            }
        }
        
        return true;
    }

    /**
     * 診斷6: 內存精度與浮點運算比較
     */
    async diagnoseFloatingPointPrecision() {
        console.log('\n🔬 診斷6: 內存精度與浮點運算比較');
        console.log('='.repeat(50));
        
        // 檢查CPU使用的數據類型
        console.log('CPU求解器精度分析:');
        const cpuSolver = new ExplicitStateSolver();
        console.log(`  stateVector類型: ${cpuSolver.stateVector?.constructor.name || 'undefined'}`);
        console.log(`  solutionVector類型: ${cpuSolver.solutionVector?.constructor.name || 'undefined'}`);
        
        // 檢查GPU使用的數據類型 (從WebGPU規範)
        console.log('\nGPU求解器精度分析:');
        console.log('  WebGPU f32類型: 32位單精度浮點');
        console.log('  JavaScript Number: 64位雙精度浮點');
        console.log('  精度差異: 可能是主要誤差來源');
        
        // 精度測試: 累積誤差
        console.log('\n🧮 累積誤差測試:');
        
        // 測試大量小數操作的累積誤差
        let sum64 = 0.0; // JavaScript 64位
        let sum32 = new Float32Array(1); // 模擬32位
        sum32[0] = 0.0;
        
        const iterations = 100000;
        const increment = 0.000001; // 很小的增量
        
        for (let i = 0; i < iterations; i++) {
            sum64 += increment;
            sum32[0] += increment;
        }
        
        const expected = iterations * increment;
        const error64 = Math.abs(sum64 - expected) / expected * 100;
        const error32 = Math.abs(sum32[0] - expected) / expected * 100;
        
        console.log(`  預期值: ${expected.toFixed(6)}`);
        console.log(`  64位累積: ${sum64.toFixed(6)} (誤差: ${error64.toExponential(3)}%)`);
        console.log(`  32位累積: ${sum32[0].toFixed(6)} (誤差: ${error32.toExponential(3)}%)`);
        console.log(`  精度差異: ${Math.abs(sum64 - sum32[0]).toExponential(3)}`);
        
        return true;
    }

    /**
     * 執行完整診斷套件
     */
    async runCompleteDiagnostics() {
        console.log('🚀 CPU vs GPU 模擬差異系統診斷');
        console.log('='.repeat(60));
        console.log('正在系統性分析各階段差異來源...\n');
        
        const tests = [
            { name: '電路預處理', fn: () => this.diagnosePreprocessing() },
            { name: '線性方程求解', fn: () => this.diagnoseLinearSolver() },
            { name: '狀態變量更新', fn: () => this.diagnoseStateUpdate() },
            { name: '時間步長敏感性', fn: () => this.diagnoseTimeStepSensitivity() },
            { name: '數值精度', fn: () => this.diagnoseNumericalPrecision() },
            { name: '浮點運算精度', fn: () => this.diagnoseFloatingPointPrecision() }
        ];
        
        const results = [];
        
        for (const test of tests) {
            try {
                const passed = await test.fn();
                results.push({ name: test.name, passed, error: null });
                console.log(`\n${test.name}: ${passed ? '✅ 通過' : '❌ 需關注'}`);
            } catch (error) {
                results.push({ name: test.name, passed: false, error: error.message });
                console.log(`\n${test.name}: ❌ 異常 - ${error.message}`);
            }
        }
        
        // 總結報告
        console.log('\n' + '='.repeat(60));
        console.log('📋 CPU vs GPU 差異診斷總結報告');
        console.log('='.repeat(60));
        
        const passedTests = results.filter(r => r.passed).length;
        console.log(`通過測試: ${passedTests}/${results.length}`);
        
        console.log('\n🔍 主要發現:');
        results.forEach(result => {
            const status = result.passed ? '✅' : '❌';
            console.log(`  ${status} ${result.name}`);
            if (result.error) {
                console.log(`      錯誤: ${result.error}`);
            }
        });
        
        console.log('\n💡 建議解決方案:');
        console.log('  1. 檢查GPU求解器的浮點精度設置');
        console.log('  2. 統一CPU和GPU的數值算法實現');
        console.log('  3. 調整時間步長和收斂條件');
        console.log('  4. 考慮使用雙精度WebGPU擴展');
        console.log('  5. 實施更嚴格的數值驗證機制');
        
        return results;
    }
}

// 主程序
async function main() {
    try {
        const diagnostics = new CPUGPUDiagnosticSuite();
        await diagnostics.runCompleteDiagnostics();
    } catch (error) {
        console.error('💥 診斷程序異常終止:', error);
        process.exit(1);
    }
}

if (import.meta.url.includes('cpu-gpu-diagnostics.js')) {
    main();
}

export { CPUGPUDiagnosticSuite };