/**
 * 基於同倫延拓理論的 DC 工作點求解器
 * Homotopy Continuation Method for DC Operating Point Analysis
 * 
 * 理論基礎: 微分拓撲學中的隱函數定理
 * 優勢: 全局收斂保證、自適應步長、統一處理各種非線性元件
 */

import { Vector, Matrix, LUSolver } from './linalg.js';

/**
 * 同倫延拓 DC 求解器
 * 使用預測-校正算法追蹤解路徑 H(x,λ) = λF(x) + (1-λ)G(x) = 0
 */
export class HomotopyDCSolver {
    constructor(options = {}) {
        // 同倫參數控制
        this.lambdaStart = 0.0;
        this.lambdaEnd = 1.0;
        this.lambdaSteps = options.lambdaSteps || 50;
        this.minStepSize = options.minStepSize || 1e-4;
        this.maxStepSize = options.maxStepSize || 0.1;
        
        // 收斂控制
        this.tolerance = options.tolerance || 1e-6;
        this.maxIterations = options.maxIterations || 50;
        this.maxCorrectorIterations = options.maxCorrectorIterations || 10;
        
        // 自適應控制參數
        this.contractionFactor = options.contractionFactor || 0.5;
        this.expansionFactor = options.expansionFactor || 1.3;
        this.minCorrectorIterations = 3;
        this.maxCorrectorIterations = 8;
        
        this.debug = options.debug || false;
        
        // 統計信息
        this.stats = {
            totalSteps: 0,
            successfulSteps: 0,
            failedSteps: 0,
            stepSizeReductions: 0,
            averageStepSize: 0
        };
    }

    /**
     * 核心同倫函數: H(x, λ) = λF(x) + (1-λ)G(x)
     * 
     * @param {Vector} x - 當前解向量
     * @param {number} lambda - 同倫參數 [0,1]
     * @param {Function} F - 原始非線性系統殘差函數
     * @param {Function} G - 簡化系統殘差函數
     * @returns {Vector} H(x,λ) 殘差向量
     */
    homotopyFunction(x, lambda, F, G) {
        const Fx = F(x);
        const Gx = G(x);
        
        // H(x,λ) = λF(x) + (1-λ)G(x)
        return Fx.scale(lambda).add(Gx.scale(1 - lambda));
    }

    /**
     * 同倫函數的雅可比矩陣: ∂H/∂x = λ∂F/∂x + (1-λ)∂G/∂x
     * 
     * @param {Vector} x - 當前解向量
     * @param {number} lambda - 同倫參數
     * @param {Function} JF - 原始系統雅可比函數
     * @param {Function} JG - 簡化系統雅可比函數
     * @returns {Matrix} 同倫雅可比矩陣
     */
    homotopyJacobian(x, lambda, JF, JG) {
        const JFx = JF(x);
        const JGx = JG(x);
        
        // 創建組合雅可比矩陣
        const J = Matrix.zeros(JFx.rows, JFx.cols);
        
        for (let i = 0; i < JFx.rows; i++) {
            for (let j = 0; j < JFx.cols; j++) {
                const value = lambda * JFx.get(i, j) + (1 - lambda) * JGx.get(i, j);
                J.set(i, j, value);
            }
        }
        
        return J;
    }

    /**
     * 預測-校正算法 (Predictor-Corrector Algorithm)
     * 數值分析中路徑追蹤的黃金標準
     * 
     * @param {Vector} x_current - 當前解
     * @param {number} lambda_current - 當前同倫參數
     * @param {number} deltaLambda - 步長
     * @param {Function} F - 原始系統
     * @param {Function} G - 簡化系統
     * @param {Function} JF - 原始系統雅可比
     * @param {Function} JG - 簡化系統雅可比
     * @returns {Object} {x, lambda, converged, correctorIterations}
     */
    predictorCorrectorStep(x_current, lambda_current, deltaLambda, F, G, JF, JG) {
        // === 預測步 (Predictor) ===
        // 計算切向量 dx/dλ = -[∂H/∂x]⁻¹ · (∂H/∂λ)
        
        const J_current = this.homotopyJacobian(x_current, lambda_current, JF, JG);
        const Fx = F(x_current);
        const Gx = G(x_current);
        const dH_dlambda = Fx.subtract(Gx);  // ∂H/∂λ = F(x) - G(x)
        
        try {
            // 求解線性系統: J · (dx/dλ) = -dH/dλ
            const tangent = LUSolver.solve(J_current, dH_dlambda.scale(-1));
            
            // 預測下一個點
            const lambda_predicted = lambda_current + deltaLambda;
            const x_predicted = x_current.add(tangent.scale(deltaLambda));
            
            // === 校正步 (Corrector) ===
            // 使用 Newton 法將預測點校正到解曲線上
            let x_corrected = x_predicted.clone();
            let converged = false;
            let correctorIterations = 0;
            
            for (let iter = 0; iter < this.maxCorrectorIterations; iter++) {
                correctorIterations = iter + 1;
                
                const H = this.homotopyFunction(x_corrected, lambda_predicted, F, G);
                const residualNorm = this.vectorNorm(H);
                
                if (residualNorm < this.tolerance) {
                    converged = true;
                    break;
                }
                
                // 檢查發散
                if (residualNorm > 1e10) {
                    if (this.debug) {
                        console.warn(`  校正步發散: ||H|| = ${residualNorm.toExponential(2)}`);
                    }
                    break;
                }
                
                const J = this.homotopyJacobian(x_corrected, lambda_predicted, JF, JG);
                const delta = LUSolver.solve(J, H.scale(-1));
                
                // 阻尼牛頓步驟 (防止震盪)
                const dampingFactor = this.computeDampingFactor(residualNorm, iter);
                x_corrected = x_corrected.add(delta.scale(dampingFactor));
            }
            
            return {
                x: x_corrected,
                lambda: lambda_predicted,
                converged: converged,
                correctorIterations: correctorIterations
            };
            
        } catch (error) {
            if (this.debug) {
                console.warn(`  預測步失敗: ${error.message}`);
            }
            return {
                x: x_current,
                lambda: lambda_current,
                converged: false,
                correctorIterations: 0
            };
        }
    }

    /**
     * 計算校正步的阻尼因子
     * 基於殘差範數和迭代次數調整牛頓步驟大小
     */
    computeDampingFactor(residualNorm, iteration) {
        if (residualNorm < 1e-3) return 1.0;  // 接近收斂，無需阻尼
        if (iteration < 2) return 1.0;        // 前幾步保持全步長
        if (residualNorm > 10) return 0.5;    // 大殘差，強阻尼
        return 0.8;  // 溫和阻尼
    }

    /**
     * 自適應步長控制
     * 基於校正步收斂性能調整 λ 步長
     * 
     * @param {number} currentStepSize - 當前步長
     * @param {number} correctorIterations - 校正步迭代次數
     * @param {boolean} converged - 是否收斂
     * @returns {number} 新的步長
     */
    adaptiveStepSize(currentStepSize, correctorIterations, converged) {
        if (!converged) {
            // 校正失敗，大幅減小步長
            return Math.max(currentStepSize * 0.25, this.minStepSize);
        }
        
        if (correctorIterations <= this.minCorrectorIterations) {
            // 收斂很快，可以增大步長
            return Math.min(currentStepSize * this.expansionFactor, this.maxStepSize);
        } else if (correctorIterations >= this.maxCorrectorIterations - 1) {
            // 收斂較慢，減小步長
            return Math.max(currentStepSize * this.contractionFactor, this.minStepSize);
        }
        
        // 收斂適中，保持當前步長
        return currentStepSize;
    }

    /**
     * 主求解函數
     * 從簡化系統的解開始，追蹤同倫路徑到原始系統
     * 
     * @param {Object} originalSystem - {residual: Function, jacobian: Function}
     * @param {Object} simplifiedSystem - {residual: Function, jacobian: Function}
     * @param {Vector} x0 - 簡化系統的已知解
     * @returns {Object} 求解結果
     */
    solve(originalSystem, simplifiedSystem, x0) {
        if (this.debug) {
            console.log('🔬 開始同倫延拓 DC 分析');
            console.log(`  初始解範數: ${this.vectorNorm(x0).toExponential(3)}`);
            console.log(`  容差: ${this.tolerance.toExponential(2)}`);
        }

        // 重置統計
        this.stats = {
            totalSteps: 0,
            successfulSteps: 0,
            failedSteps: 0,
            stepSizeReductions: 0,
            averageStepSize: 0
        };

        // 驗證初始解
        const G_initial = simplifiedSystem.residual(x0);
        const initialResidual = this.vectorNorm(G_initial);
        
        if (initialResidual > this.tolerance * 100) {
            console.warn(`⚠️  初始解殘差較大: ${initialResidual.toExponential(3)}`);
        }

        // 路徑追蹤數據
        const solutionPath = [{
            lambda: this.lambdaStart, 
            x: x0.clone(), 
            residualNorm: initialResidual
        }];
        
        let x_current = x0.clone();
        let lambda_current = this.lambdaStart;
        let stepSize = this.maxStepSize;
        let consecutiveFailures = 0;
        const maxConsecutiveFailures = 5;
        
        // === 主循環: 從 λ=0 追蹤到 λ=1 ===
        while (lambda_current < this.lambdaEnd - 1e-10) {
            this.stats.totalSteps++;
            
            // 計算本步的 Δλ
            const remainingDistance = this.lambdaEnd - lambda_current;
            const deltaLambda = Math.min(stepSize, remainingDistance);
            
            // 預測-校正步
            const result = this.predictorCorrectorStep(
                x_current, 
                lambda_current, 
                deltaLambda,
                originalSystem.residual, 
                simplifiedSystem.residual,
                originalSystem.jacobian,
                simplifiedSystem.jacobian
            );
            
            if (!result.converged) {
                this.stats.failedSteps++;
                consecutiveFailures++;
                
                if (this.debug) {
                    console.warn(`  λ=${lambda_current.toFixed(4)} 校正未收斂，縮小步長`);
                }
                
                // 縮小步長重試
                stepSize = this.adaptiveStepSize(stepSize, 0, false);
                this.stats.stepSizeReductions++;
                
                if (stepSize < this.minStepSize || consecutiveFailures >= maxConsecutiveFailures) {
                    return {
                        converged: false,
                        solution: x_current,
                        path: solutionPath,
                        stats: this.stats,
                        error: stepSize < this.minStepSize ? 
                            'Step size too small' : 
                            'Too many consecutive failures'
                    };
                }
                continue;
            }
            
            // 成功步驟
            this.stats.successfulSteps++;
            consecutiveFailures = 0;
            
            // 更新當前點
            x_current = result.x;
            lambda_current = result.lambda;
            
            // 計算當前點的原始系統殘差
            const F_current = originalSystem.residual(x_current);
            const currentResidualNorm = this.vectorNorm(F_current);
            
            solutionPath.push({
                lambda: lambda_current,
                x: x_current.clone(),
                residualNorm: currentResidualNorm
            });
            
            if (this.debug && this.stats.totalSteps % 10 === 0) {
                console.log(`  λ=${lambda_current.toFixed(4)}, ||F(x)||=${currentResidualNorm.toExponential(2)}, step=${stepSize.toFixed(4)}`);
            }
            
            // 自適應調整步長
            stepSize = this.adaptiveStepSize(stepSize, result.correctorIterations, true);
        }
        
        // 計算統計信息
        this.stats.averageStepSize = this.stats.totalSteps > 0 ? 
            (this.lambdaEnd - this.lambdaStart) / this.stats.totalSteps : 0;
        
        // === 最終校正 ===
        // 確保 λ=1 時精確滿足 F(x)=0
        let x_final = x_current.clone();
        let finalIterations = 0;
        
        for (let iter = 0; iter < this.maxIterations; iter++) {
            finalIterations = iter + 1;
            
            const residual = originalSystem.residual(x_final);
            const residualNorm = this.vectorNorm(residual);
            
            if (residualNorm < this.tolerance) {
                if (this.debug) {
                    console.log(`✅ 同倫延拓成功收斂!`);
                    console.log(`  最終殘差: ${residualNorm.toExponential(3)}`);
                    console.log(`  總步數: ${this.stats.totalSteps}, 成功率: ${(this.stats.successfulSteps/this.stats.totalSteps*100).toFixed(1)}%`);
                }
                return {
                    converged: true,
                    solution: x_final,
                    path: solutionPath,
                    stats: this.stats,
                    finalIterations: finalIterations,
                    finalResidualNorm: residualNorm
                };
            }
            
            const jacobian = originalSystem.jacobian(x_final);
            const delta = LUSolver.solve(jacobian, residual.scale(-1));
            x_final = x_final.add(delta);
        }
        
        // 最終校正失敗
        const finalResidual = this.vectorNorm(originalSystem.residual(x_final));
        console.error(`❌ 最終校正未收斂: ||F|| = ${finalResidual.toExponential(3)}`);
        
        return {
            converged: false,
            solution: x_final,
            path: solutionPath,
            stats: this.stats,
            finalIterations: finalIterations,
            finalResidualNorm: finalResidual,
            error: 'Final Newton correction did not converge'
        };
    }

    /**
     * 計算向量的歐幾里得範數
     */
    vectorNorm(vector) {
        let sum = 0;
        for (let i = 0; i < vector.size; i++) {
            const val = vector.get(i);
            sum += val * val;
        }
        return Math.sqrt(sum);
    }

    /**
     * 獲取求解統計信息
     */
    getStatistics() {
        return {
            ...this.stats,
            successRate: this.stats.totalSteps > 0 ? 
                this.stats.successfulSteps / this.stats.totalSteps : 0,
            averageStepSize: this.stats.averageStepSize
        };
    }
}

/**
 * 創建配置好的同倫 DC 求解器
 * 針對 SPICE 電路分析優化的參數設定
 */
export function createHomotopyDCSolver(options = {}) {
    const defaultOptions = {
        tolerance: 1e-6,        // 與 SPICE 標準相近
        maxIterations: 100,     // 更多迭代次數
        maxStepSize: 0.05,      // 較小的初始步長，更穩定
        minStepSize: 1e-5,      // 最小步長
        contractionFactor: 0.5, // 步長縮小因子
        expansionFactor: 1.2,   // 步長放大因子
        debug: false
    };
    
    return new HomotopyDCSolver({ ...defaultOptions, ...options });
}

export default HomotopyDCSolver;