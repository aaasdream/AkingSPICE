/**
 * 增強型暫態分析 (Enhanced Transient Analysis)
 * 
 * 特點：
 * 1. 支持線性和非線性元件的統一處理
 * 2. 基於Newton-Raphson迭代的時間步求解
 * 3. 自動檢測並選擇合適的求解方法
 * 4. 向後兼容傳統線性分析
 * 
 * 這個分析器統一了線性和非線性暫態分析，消除了模型選擇的困惑
 */

import { Matrix, Vector, LUSolver } from '../core/linalg.js';
import { MNABuilder } from '../core/mna.js';
import { TransientResult } from './transient.js';

/**
 * 增強型暫態分析器
 * 自動處理線性和非線性元件的混合電路
 */
export class EnhancedTransientAnalysis {
    constructor(options = {}) {
        this.mnaBuilder = new MNABuilder({ debug: options.debug });
        this.components = [];
        this.result = null;
        
        // 分析參數
        this.timeStep = options.timeStep || 1e-6;     // 預設時間步長: 1µs
        this.startTime = options.startTime || 0;      // 開始時間
        this.stopTime = options.stopTime || 1e-3;     // 結束時間: 1ms
        this.maxTimeStep = options.maxTimeStep || 1e-6; // 最大時間步長
        this.minTimeStep = options.minTimeStep || 1e-12; // 最小時間步長
        
        // Newton-Raphson 參數
        this.maxNewtonIterations = options.maxNewtonIterations || 50;
        this.newtonTolerance = options.newtonTolerance || 1e-9;
        this.dampingFactor = options.dampingFactor || 1.0;
        
        // 數值參數  
        this.reltol = options.reltol || 1e-9;         // 相對誤差容限
        this.abstol = options.abstol || 1e-12;        // 絕對誤差容限
        
        // 分析控制
        this.debug = options.debug || false;
        this.progressCallback = options.progressCallback;
        
        // 元件分類
        this.linearComponents = [];
        this.nonlinearComponents = [];
        this.hasNonlinearComponents = false;
        
        // 統計信息
        this.stats = {
            totalSteps: 0,
            newtonIterations: 0,
            matrixFactorizations: 0,
            convergenceFailures: 0
        };
    }

    /**
     * 運行暫態分析
     * @param {BaseComponent[]} components 電路元件列表
     * @param {Object} params 分析參數
     * @returns {TransientResult} 分析結果
     */
    async analyze(components, params = {}) {
        const startTime = performance.now();
        
        // 設置參數
        this.setParameters(params);
        this.components = components;
        
        if (this.debug) {
            console.log('🔄 開始增強型暫態分析');
            console.log(`  時間範圍: ${this.startTime}s → ${this.stopTime}s`);
            console.log(`  時間步長: ${this.timeStep}s`);
            console.log(`  元件數量: ${components.length}`);
        }

        // 分析電路組成
        this.analyzeCircuitComposition();
        
        // 初始化結果對象
        this.result = new TransientResult();
        this.result.analysisInfo = {
            method: this.hasNonlinearComponents ? 'Newton-Raphson' : 'Linear',
            startTime: this.startTime,
            stopTime: this.stopTime,
            timeStep: this.timeStep,
            maxNewtonIterations: this.maxNewtonIterations
        };

        // 計算初始條件 (DC工作點)
        await this.computeInitialConditions();

        // 執行時域迴圈
        await this.timeLoop();

        // 記錄統計信息
        const endTime = performance.now();
        this.result.analysisInfo.executionTime = endTime - startTime;
        this.result.analysisInfo.statistics = { ...this.stats };

        if (this.debug) {
            this.printStatistics();
        }

        return this.result;
    }

    /**
     * 分析電路組成
     */
    analyzeCircuitComposition() {
        this.linearComponents = [];
        this.nonlinearComponents = [];
        
        for (const component of this.components) {
            if (component.isNonlinear || component.stampResidual) {
                this.nonlinearComponents.push(component);
            } else {
                this.linearComponents.push(component);
            }
        }
        
        this.hasNonlinearComponents = this.nonlinearComponents.length > 0;
        
        if (this.debug) {
            console.log(`  📊 電路組成分析:`);
            console.log(`     線性元件: ${this.linearComponents.length}`);
            console.log(`     非線性元件: ${this.nonlinearComponents.length}`);
            console.log(`     分析方法: ${this.hasNonlinearComponents ? 'Newton-Raphson' : 'Direct Linear'}`);
        }
    }

    /**
     * 計算初始條件
     */
    async computeInitialConditions() {
        if (this.debug) {
            console.log('🔍 計算初始條件...');
        }

        // 為反應元件設置初始條件
        for (const component of this.components) {
            if (component.setInitialConditions) {
                component.setInitialConditions();
            }
        }

        // 如果有非線性元件，需要求解DC工作點
        if (this.hasNonlinearComponents) {
            await this.solveDCOperatingPoint();
        } else {
            // 純線性電路，使用簡化初始條件
            const initialVoltages = new Map();
            const initialCurrents = new Map();
            this.result.addTimePoint(this.startTime, initialVoltages, initialCurrents);
        }
    }

    /**
     * 求解DC工作點 (非線性電路)
     */
    async solveDCOperatingPoint() {
        // 創建DC版本的元件 (電感短路，電容開路)
        const dcComponents = this.createDCEquivalentComponents();
        
        // 使用Newton-Raphson求解DC非線性方程
        const dcSolution = await this.solveNonlinearSystem(dcComponents, 0, true);
        
        if (dcSolution.converged) {
            // 將DC結果應用到初始條件
            this.applyDCResults(dcSolution);
            this.result.addTimePoint(this.startTime, dcSolution.nodeVoltages, dcSolution.branchCurrents);
        } else {
            console.warn('⚠️ DC工作點求解失敗，使用零初始條件');
            const initialVoltages = new Map();
            const initialCurrents = new Map();
            this.result.addTimePoint(this.startTime, initialVoltages, initialCurrents);
        }
    }

    /**
     * 主時域迴圈
     */
    async timeLoop() {
        let currentTime = this.startTime + this.timeStep;
        let stepCount = 0;
        const totalSteps = Math.ceil((this.stopTime - this.startTime) / this.timeStep);

        while (currentTime <= this.stopTime) {
            stepCount++;
            this.stats.totalSteps++;

            try {
                // 執行一個時間步
                await this.singleTimeStep(currentTime);

                // 進度回調
                if (this.progressCallback) {
                    const progress = stepCount / totalSteps;
                    this.progressCallback(progress, currentTime, stepCount);
                }

                // 調試輸出
                if (this.debug && stepCount % 100 === 0) {
                    console.log(`Step ${stepCount}/${totalSteps}, time=${(currentTime * 1e6).toFixed(2)}µs`);
                }

                currentTime += this.timeStep;

            } catch (error) {
                console.error(`Time step failed at t=${currentTime}s:`, error);
                throw error;
            }
        }
    }

    /**
     * 執行單個時間步
     * @param {number} time 當前時間
     */
    async singleTimeStep(time) {
        if (this.hasNonlinearComponents) {
            // 使用Newton-Raphson迭代求解
            const solution = await this.solveNonlinearSystem(this.components, time, false);
            
            if (solution.converged) {
                // 更新元件歷史狀態
                this.updateComponentHistory(solution.nodeVoltages, solution.branchCurrents);
                
                // 保存結果
                this.result.addTimePoint(time, solution.nodeVoltages, solution.branchCurrents);
            } else {
                throw new Error(`Newton-Raphson convergence failed at t=${time}s`);
            }
        } else {
            // 純線性系統，直接求解
            await this.singleLinearTimeStep(time);
        }
    }

    /**
     * 執行線性時間步 (純線性電路)
     */
    async singleLinearTimeStep(time) {
        // 更新所有元件的伴隨模型
        for (const component of this.components) {
            if (component.updateCompanionModel) {
                component.updateCompanionModel();
            }
        }

        // 建立MNA矩陣
        const { matrix, rhs } = this.mnaBuilder.buildMNAMatrix(this.components, time);
        this.stats.matrixFactorizations++;

        // 求解線性方程組
        const solution = LUSolver.solve(matrix, rhs);

        // 提取結果
        const nodeVoltages = this.mnaBuilder.extractNodeVoltages(solution);
        const branchCurrents = this.mnaBuilder.extractVoltageSourceCurrents(solution);

        // 更新元件歷史
        this.updateComponentHistory(nodeVoltages, branchCurrents);

        // 保存結果
        this.result.addTimePoint(time, nodeVoltages, branchCurrents);
    }

    /**
     * 求解非線性系統 (Newton-Raphson)
     * @param {BaseComponent[]} components 元件列表
     * @param {number} time 時間
     * @param {boolean} isDC 是否為DC分析
     * @returns {Object} 求解結果
     */
    async solveNonlinearSystem(components, time, isDC = false) {
        // 獲取上一時間步的解作為初始猜測
        let solution = this.getInitialGuess();
        
        let iteration = 0;
        let converged = false;
        let residualNorm = Infinity;

        while (iteration < this.maxNewtonIterations && !converged) {
            iteration++;
            this.stats.newtonIterations++;

            // 建立Jacobian矩陣和殘差向量
            const { jacobian, residual } = this.buildJacobianSystem(components, solution, time, isDC);
            this.stats.matrixFactorizations++;

            // 計算殘差範數
            residualNorm = this.calculateResidualNorm(residual);

            // 檢查收斂
            if (residualNorm < this.newtonTolerance) {
                converged = true;
                break;
            }

            // 求解Newton步長
            const delta = LUSolver.solve(jacobian, residual.scale(-1));

            // 應用阻尼
            const dampedDelta = delta.scale(this.dampingFactor);

            // 更新解
            solution = solution.add(dampedDelta);

            if (this.debug && iteration % 5 === 0) {
                console.log(`  Newton iteration ${iteration}: residual = ${residualNorm.toExponential(3)}`);
            }
        }

        if (!converged) {
            this.stats.convergenceFailures++;
            console.warn(`⚠️ Newton-Raphson failed to converge at t=${time}s after ${iteration} iterations`);
        }

        // 提取節點電壓和支路電流
        const nodeVoltages = this.mnaBuilder.extractNodeVoltages(solution);
        const branchCurrents = this.mnaBuilder.extractVoltageSourceCurrents(solution);

        return {
            converged,
            iterations: iteration,
            residualNorm,
            solution,
            nodeVoltages,
            branchCurrents
        };
    }

    /**
     * 建立Jacobian系統
     */
    buildJacobianSystem(components, solution, time, isDC) {
        // 初始化線性部分
        this.mnaBuilder.analyzeCircuit(components);
        const matrixSize = this.mnaBuilder.matrixSize;
        
        const jacobian = Matrix.zeros(matrixSize, matrixSize);
        const residual = Vector.zeros(matrixSize);

        // 處理線性元件
        for (const component of this.linearComponents) {
            if (!isDC || (component.type !== 'L' && component.type !== 'C')) {
                component.stamp(jacobian, residual, this.mnaBuilder.nodeMap, 
                              this.mnaBuilder.voltageSourceMap, time);
            }
        }

        // 處理非線性元件
        for (const component of this.nonlinearComponents) {
            if (component.stampJacobian && component.stampResidual) {
                component.stampJacobian(jacobian, solution, this.mnaBuilder.nodeMap);
                component.stampResidual(residual, solution, this.mnaBuilder.nodeMap);
            }
        }

        return { jacobian, residual };
    }

    // 輔助方法...
    getInitialGuess() {
        const size = this.mnaBuilder.matrixSize;
        return Vector.zeros(size);
    }

    calculateResidualNorm(residual) {
        return residual.norm();
    }

    createDCEquivalentComponents() {
        // 簡化實現：對於DC分析，忽略電容和電感
        return this.components.filter(c => c.type !== 'L' && c.type !== 'C');
    }

    applyDCResults(dcSolution) {
        // 將DC結果應用到反應元件的初始條件
        // 這裡可以擴展以支持更複雜的初始條件設置
    }

    updateComponentHistory(nodeVoltages, branchCurrents) {
        for (const component of this.components) {
            component.updateHistory(nodeVoltages, branchCurrents);
        }
    }

    setParameters(params) {
        if (params.timeStep !== undefined) this.timeStep = params.timeStep;
        if (params.startTime !== undefined) this.startTime = params.startTime;
        if (params.stopTime !== undefined) this.stopTime = params.stopTime;
        if (params.maxNewtonIterations !== undefined) this.maxNewtonIterations = params.maxNewtonIterations;
        if (params.newtonTolerance !== undefined) this.newtonTolerance = params.newtonTolerance;
    }

    setDebug(enabled) {
        this.debug = enabled;
        this.mnaBuilder.debug = enabled;
    }

    printStatistics() {
        console.log('📊 暫態分析統計:');
        console.log(`   總時間步數: ${this.stats.totalSteps}`);
        console.log(`   Newton迭代: ${this.stats.newtonIterations}`);
        console.log(`   矩陣分解: ${this.stats.matrixFactorizations}`);
        console.log(`   收斂失敗: ${this.stats.convergenceFailures}`);
        console.log(`   平均Newton迭代/步: ${(this.stats.newtonIterations / this.stats.totalSteps).toFixed(2)}`);
    }
}

/**
 * 創建增強型暫態分析器的工廠函數
 */
export function createEnhancedTransientAnalysis(options = {}) {
    return new EnhancedTransientAnalysis(options);
}