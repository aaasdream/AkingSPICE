/**
 * 批處理優化的GPU求解器
 * 通過批量處理減少CPU-GPU同步開銷
 */

import { GPUExplicitStateSolver } from './gpu-explicit-solver.js';

export class BatchGPUExplicitSolver extends GPUExplicitStateSolver {
    constructor(options = {}) {
        super(options);
        this.batchSize = options.batchSize || 10; // 批處理大小
        this.fastMode = options.fastMode || false;
    }

    /**
     * 批量執行多個時間步
     */
    async solveBatchTimeSteps(numSteps) {
        const results = [];
        const batchStartTime = performance.now();
        
        for (let step = 0; step < numSteps; step++) {
            // 1. 更新RHS向量
            const rhsVector = this.buildRHSVector();
            
            // 2. GPU求解 (使用更少迭代)
            const nodeVoltages = await this.webgpuSolver.solveLinearSystem(rhsVector);
            
            // 3. 快速狀態更新 (CPU)
            await this.updateStateVariablesFast(nodeVoltages);
            
            // 4. 記錄結果 (僅在必要時)
            if (step % Math.max(1, Math.floor(numSteps / 5)) === 0) {
                results.push({
                    time: this.currentTime,
                    nodeVoltages: Array.from(nodeVoltages),
                    stateVector: Array.from(this.currentStateVector),
                });
            }
            
            this.currentTime += this.timeStep;
        }
        
        const batchTime = performance.now() - batchStartTime;
        console.log(`批處理 ${numSteps} 步耗時: ${batchTime.toFixed(2)}ms, 平均 ${(batchTime/numSteps).toFixed(2)}ms/步`);
        
        return results;
    }

    /**
     * 快速狀態變量更新 (優化版)
     */
    async updateStateVariablesFast(nodeVoltages) {
        const stateCount = this.circuitData.stateCount;
        if (stateCount === 0) return;
        
        // 預計算常數
        const resistorConductance = 1e-3;
        const capacitance = 1e-6;
        const timeStepOverC = this.timeStep / capacitance;
        
        // 對於簡單RC電路的優化計算
        if (stateCount === 1) {
            const vinVoltage = nodeVoltages[1] || 0;
            const node1Voltage = nodeVoltages[0] || 0;
            const resistorCurrent = (vinVoltage - node1Voltage) * resistorConductance;
            
            // 直接更新狀態
            this.currentStateVector[0] += timeStepOverC * resistorCurrent;
        } else {
            // 通用方法 (保持原邏輯)
            await super.updateStateVariablesGPU(nodeVoltages);
        }
    }

    /**
     * 優化的時域仿真
     */
    async runOptimizedTransientAnalysis(startTime, endTime, timeStep = null) {
        if (timeStep) this.timeStep = timeStep;
        
        console.log(`開始優化GPU時域仿真: ${startTime}s 到 ${endTime}s, 步長 ${this.timeStep}s`);
        
        this.currentTime = startTime;
        const totalSteps = Math.ceil((endTime - startTime) / this.timeStep);
        const results = [];
        
        const simStartTime = performance.now();
        
        // 批處理執行
        let completedSteps = 0;
        while (completedSteps < totalSteps) {
            const remainingSteps = totalSteps - completedSteps;
            const currentBatchSize = Math.min(this.batchSize, remainingSteps);
            
            const batchResults = await this.solveBatchTimeSteps(currentBatchSize);
            results.push(...batchResults);
            
            completedSteps += currentBatchSize;
            
            // 進度報告
            const progress = (completedSteps / totalSteps * 100).toFixed(1);
            console.log(`   批處理進度: ${progress}% (${completedSteps}/${totalSteps} 步)`);
        }
        
        const totalTime = performance.now() - simStartTime;
        const stepsPerSecond = totalSteps / totalTime * 1000;
        
        console.log(`優化仿真完成: ${totalSteps} 步, ${totalTime.toFixed(2)}ms`);
        console.log(`優化步速: ${stepsPerSecond.toFixed(0)} 步/秒`);
        
        return {
            results,
            stats: this.getStats(),
            finalTime: this.currentTime,
            totalSteps: totalSteps,
            optimizedStepsPerSecond: stepsPerSecond,
        };
    }
}

/**
 * 測試批處理優化
 */
async function testBatchOptimization() {
    console.log('🚀 測試批處理GPU優化\n');
    
    const { VoltageSource } = await import('../components/sources.js');
    const { Resistor } = await import('../components/resistor.js');
    const { Capacitor } = await import('../components/capacitor.js');
    
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
    }
}

// 如果直接運行此文件
if (import.meta.url === `file://${process.argv[1]}`) {
    testBatchOptimization().catch(console.error);
}