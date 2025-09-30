/**
 * 測試批處理優化GPU求解器
 */

import { BatchGPUExplicitSolver } from '../src/core/batch-gpu-solver.js';
import { VoltageSource } from '../src/components/sources.js';
import { Resistor } from '../src/components/resistor.js';
import { Capacitor } from '../src/components/capacitor.js';

async function testBatchOptimization() {
    console.log('🚀 測試批處理GPU優化\n');
    
    try {
        const components = [
            new VoltageSource('V1', ['vin', 'gnd'], 5.0),
            new Resistor('R1', ['vin', 'node1'], 1000),
            new Capacitor('C1', ['node1', 'gnd'], 1e-6),
        ];
        
        console.log('初始化批處理GPU求解器...');
        const batchSolver = new BatchGPUExplicitSolver({
            debug: false,
            timeStep: 1e-6,
            batchSize: 50, // 較大的批處理
            solverMaxIterations: 25, // 更少的迭代
            fastMode: true,
        });
        
        await batchSolver.initialize(components, 1e-6);
        
        console.log('運行優化仿真...');
        const results = await batchSolver.runOptimizedTransientAnalysis(0, 1e-4, 1e-6); // 100μs
        
        console.log('\n=== 優化結果 ===');
        const finalResult = results.results[results.results.length - 1];
        console.log(`最終電容電壓: ${finalResult.stateVector[0].toFixed(4)}V`);
        console.log(`優化步速: ${results.optimizedStepsPerSecond.toFixed(0)} 步/秒`);
        
        // 理論值檢驗
        const t = 1e-4; // 100μs
        const tau = 1000 * 1e-6; // RC = 1ms
        const theoretical = 5.0 * (1 - Math.exp(-t / tau));
        const error = Math.abs(finalResult.stateVector[0] - theoretical) / theoretical * 100;
        
        console.log(`理論值: ${theoretical.toFixed(4)}V, 誤差: ${error.toFixed(2)}%`);
        
        if (error < 10 && results.optimizedStepsPerSecond > 100) {
            console.log('✅ 批處理優化成功');
        } else {
            console.log('⚠️ 優化效果有限');
        }
        
        batchSolver.destroy();
        
    } catch (error) {
        console.error('❌ 批處理測試失敗:', error.message);
        console.error('詳細:', error);
    }
}

testBatchOptimization().catch(console.error);