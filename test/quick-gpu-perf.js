/**
 * 快速GPU性能測試
 * 專注於優化性能瓶頸
 */

import { GPUExplicitStateSolver } from '../src/core/gpu-explicit-solver.js';
import { VoltageSource } from '../src/components/sources.js';
import { Resistor } from '../src/components/resistor.js';
import { Capacitor } from '../src/components/capacitor.js';

async function quickPerformanceTest() {
    console.log('⚡ 快速GPU性能測試\n');
    
    try {
        // 創建簡單RC電路
        const components = [
            new VoltageSource('V1', ['vin', 'gnd'], 5.0),
            new Resistor('R1', ['vin', 'node1'], 1000),
            new Capacitor('C1', ['node1', 'gnd'], 1e-6),
        ];
        
        console.log('初始化GPU求解器...');
        const gpuSolver = new GPUExplicitStateSolver({
            debug: false, // 關閉調試以提升性能
            timeStep: 1e-6,
            solverMaxIterations: 100, // 減少迭代次數
        });
        
        await gpuSolver.initialize(components, 1e-6);
        
        console.log('測試單步求解性能...');
        
        // 測試10個時間步的性能
        const stepTimes = [];
        for (let i = 0; i < 10; i++) {
            const stepStartTime = performance.now();
            await gpuSolver.solveTimeStep();
            const stepTime = performance.now() - stepStartTime;
            stepTimes.push(stepTime);
            
            if (i < 3) {
                console.log(`  步驟 ${i+1}: ${stepTime.toFixed(2)}ms`);
            }
        }
        
        const avgStepTime = stepTimes.reduce((a, b) => a + b, 0) / stepTimes.length;
        const stepsPerSecond = 1000 / avgStepTime;
        
        console.log(`\n=== 性能統計 ===`);
        console.log(`平均步長時間: ${avgStepTime.toFixed(2)}ms`);
        console.log(`理論步速: ${stepsPerSecond.toFixed(0)} 步/秒`);
        console.log(`1000步預計時間: ${avgStepTime}s`);
        
        // 檢查GPU統計
        const stats = gpuSolver.getStats();
        console.log(`GPU平均時間: ${stats.avgGPUTime.toFixed(2)}ms`);
        console.log(`狀態更新平均時間: ${stats.avgStateUpdateTime.toFixed(2)}ms`);
        
        if (stats.webgpuStats) {
            console.log(`WebGPU總時間: ${stats.webgpuStats.totalGPUTime.toFixed(2)}ms`);
            console.log(`WebGPU總迭代: ${stats.webgpuStats.totalIterations}`);
        }
        
        // 性能建議
        if (avgStepTime > 10) {
            console.log('\n⚠️  性能警告: 步長時間過長');
            console.log('可能原因:');
            console.log('- GPU求解器迭代次數過多');
            console.log('- CPU-GPU數據傳輸開銷');
            console.log('- 等待GPU完成的同步開銷');
        } else {
            console.log('\n✅ 性能正常');
        }
        
        gpuSolver.destroy();
        console.log('\n✅ 快速性能測試完成');
        
    } catch (error) {
        console.error('\n❌ 性能測試失敗:', error.message);
    }
}

// 運行快速測試
quickPerformanceTest().catch(console.error);