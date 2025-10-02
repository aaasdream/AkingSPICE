/**
 * Newton-Raphson 非線性求解器
 * 
 * 實現用於隱式 MNA 求解器的牛頓法，支持真正的非線性元件
 * 
 * 核心算法：
 * 1. 計算殘差向量 f(x) = G*x + I(x) - Is
 * 2. 計算雅可比矩陣 J = ∂f/∂x = G + ∂I/∂x
 * 3. 求解 J * Δx = -f(x)
 * 4. 更新 x_new = x_old + Δx
 * 5. 重複直到收斂
 */

import { Matrix, Vector, LUSolver, NumericalUtils } from '../core/linalg.js';

/**
 * Newton-Raphson 求解器配置
 */
class NewtonRaphsonConfig {
    constructor() {
        this.maxIterations = 100;           // 最大迭代次數
        this.absoluteTolerance = 1e-12;     // 絕對收斂容差
        this.relativeTolerance = 1e-9;      // 相對收斂容差
        this.voltageTolerance = 1e-6;       // 電壓收斂容差 (V)
        this.currentTolerance = 1e-9;       // 電流收斂容差 (A)
        this.dampingFactor = 1.0;           // 阻尼因子 (1.0 = 無阻尼)
        this.minDampingFactor = 0.1;        // 最小阻尼因子
        this.adaptiveDamping = true;        // 自適應阻尼
        this.debug = false;                 // 調試模式
    }
}

/**
 * Newton-Raphson 求解結果
 */
export class NewtonRaphsonResult {
    constructor() {
        this.converged = false;             // 是否收斂
        this.iterations = 0;                // 迭代次數
        this.finalError = Infinity;         // 最終誤差
        this.solution = null;               // 解向量
        this.jacobianConditionNumber = 1.0; // 雅可比矩陣條件數
        this.dampingUsed = 1.0;             // 實際使用的阻尼因子
        this.failureReason = '';            // 失敗原因
        this.convergenceHistory = [];       // 收斂歷史
    }
}

/**
 * Newton-Raphson 非線性求解器
 */
export class NewtonRaphsonSolver {
    constructor(config = new NewtonRaphsonConfig()) {
        this.config = config;
        
        // 求解統計
        this.stats = {
            totalIterations: 0,
            totalSolves: 0,
            successfulSolves: 0,
            averageIterations: 0,
            worstCaseIterations: 0
        };
    }
    
    /**
     * 求解非線性系統 f(x) = 0
     * 
     * @param {Function} residualFunction 殘差函數 f(x) -> Vector
     * @param {Function} jacobianFunction 雅可比函數 J(x) -> Matrix
     * @param {Vector} initialGuess 初始猜測
     * @param {Object} context 額外上下文信息
     * @returns {NewtonRaphsonResult} 求解結果
     */
    solve(residualFunction, jacobianFunction, initialGuess, context = {}) {
        const result = new NewtonRaphsonResult();
        
        if (this.config.debug) {
            console.log('🔧 開始 Newton-Raphson 迭代求解...');
        }
        
        // 初始化
        let x = initialGuess.clone();
        let dampingFactor = this.config.dampingFactor;
        let previousError = Infinity;
        
        this.stats.totalSolves++;
        
        try {
            for (let iter = 0; iter < this.config.maxIterations; iter++) {
                // 計算殘差向量 f(x)
                const residual = residualFunction(x, context);
                
                // 計算雅可比矩陣 J(x) = ∂f/∂x
                const jacobian = jacobianFunction(x, context);
                
                // 檢查收斂性
                const currentError = residual.norm();
                const converged = this.checkConvergence(x, residual, iter);
                
                if (this.config.debug) {
                    console.log(`  迭代 ${iter}: 誤差 = ${currentError.toExponential(3)}, 阻尼 = ${dampingFactor.toFixed(3)}`);
                }
                
                result.convergenceHistory.push({
                    iteration: iter,
                    error: currentError,
                    dampingFactor: dampingFactor
                });
                
                if (converged) {
                    result.converged = true;
                    result.iterations = iter;
                    result.finalError = currentError;
                    result.solution = x;
                    result.dampingUsed = dampingFactor;
                    
                    this.stats.successfulSolves++;
                    this.stats.totalIterations += iter;
                    this.stats.averageIterations = this.stats.totalIterations / this.stats.successfulSolves;
                    this.stats.worstCaseIterations = Math.max(this.stats.worstCaseIterations, iter);
                    
                    if (this.config.debug) {
                        console.log(`✅ Newton-Raphson 收斂，迭代 ${iter} 次，最終誤差 ${currentError.toExponential(3)}`);
                    }
                    
                    return result;
                }
                
                // 求解 J * Δx = -f(x)
                const negativeResidual = residual.scale(-1);
                let delta;
                
                try {
                    delta = LUSolver.solve(jacobian, negativeResidual);
                    
                    // 估算條件數
                    result.jacobianConditionNumber = LUSolver.estimateConditionNumber(jacobian);
                    
                } catch (error) {
                    result.failureReason = `雅可比矩陣求解失敗: ${error.message}`;
                    break;
                }
                
                // 自適應阻尼
                if (this.config.adaptiveDamping) {
                    dampingFactor = this.adaptDampingFactor(currentError, previousError, dampingFactor, iter);
                }
                
                // 更新解：x_new = x_old + damping * Δx
                const dampedDelta = delta.scale(dampingFactor);
                x = x.add(dampedDelta);
                
                previousError = currentError;
                result.iterations = iter + 1;
            }
            
            // 未收斂
            result.converged = false;
            result.finalError = previousError;
            result.failureReason = `超過最大迭代次數 ${this.config.maxIterations}`;
            
            if (this.config.debug) {
                console.log(`❌ Newton-Raphson 未收斂，最大迭代次數已達到`);
            }
            
        } catch (error) {
            result.converged = false;
            result.failureReason = `Newton-Raphson 求解異常: ${error.message}`;
            
            if (this.config.debug) {
                console.error('💥 Newton-Raphson 求解異常:', error);
            }
        }
        
        return result;
    }
    
    /**
     * 檢查收斂性
     * @param {Vector} x 當前解
     * @param {Vector} residual 殘差向量
     * @param {number} iteration 當前迭代次數
     * @returns {boolean} 是否收斂
     */
    checkConvergence(x, residual, iteration) {
        // 絕對誤差檢查
        const absoluteError = residual.norm();
        if (absoluteError < this.config.absoluteTolerance) {
            return true;
        }
        
        // 相對誤差檢查
        const solutionNorm = x.norm();
        if (solutionNorm > 0) {
            const relativeError = absoluteError / solutionNorm;
            if (relativeError < this.config.relativeTolerance) {
                return true;
            }
        }
        
        // 元素級別的收斂檢查
        let voltageConverged = true;
        let currentConverged = true;
        
        for (let i = 0; i < residual.size; i++) {
            const residualValue = Math.abs(residual.get(i));
            
            // 假設前 N 個變量是電壓，其餘是電流
            // 這需要根據具體的變量排列進行調整
            if (residualValue > this.config.voltageTolerance) {
                voltageConverged = false;
            }
            
            if (residualValue > this.config.currentTolerance) {
                currentConverged = false;
            }
        }
        
        return voltageConverged && currentConverged;
    }
    
    /**
     * 自適應阻尼因子調整
     * @param {number} currentError 當前誤差
     * @param {number} previousError 前一次誤差
     * @param {number} currentDamping 當前阻尼因子
     * @param {number} iteration 迭代次數
     * @returns {number} 調整後的阻尼因子
     */
    adaptDampingFactor(currentError, previousError, currentDamping, iteration) {
        if (iteration === 0) {
            return currentDamping;
        }
        
        // 如果誤差增加，減少阻尼因子
        if (currentError > previousError) {
            const newDamping = Math.max(currentDamping * 0.5, this.config.minDampingFactor);
            return newDamping;
        }
        
        // 如果誤差顯著減少，可以嘗試增加阻尼因子
        if (currentError < 0.5 * previousError && currentDamping < 1.0) {
            const newDamping = Math.min(currentDamping * 1.2, 1.0);
            return newDamping;
        }
        
        return currentDamping;
    }
    
    /**
     * 設置配置
     * @param {NewtonRaphsonConfig} config 新配置
     */
    setConfig(config) {
        this.config = { ...this.config, ...config };
    }
    
    /**
     * 獲取求解統計信息
     * @returns {Object} 統計信息
     */
    getStatistics() {
        return { ...this.stats };
    }
    
    /**
     * 重置統計信息
     */
    resetStatistics() {
        this.stats = {
            totalIterations: 0,
            totalSolves: 0,
            successfulSolves: 0,
            averageIterations: 0,
            worstCaseIterations: 0
        };
    }
}

/**
 * 工廠函數：創建適用於 SPICE 的 Newton-Raphson 求解器
 * @param {Object} options 選項
 * @returns {NewtonRaphsonSolver} 配置好的求解器
 */
export function createSPICENewtonSolver(options = {}) {
    const config = new NewtonRaphsonConfig();
    
    // SPICE 特定的默認配置
    config.maxIterations = options.maxIterations || 50;
    config.absoluteTolerance = options.absTol || 1e-12;
    config.relativeTolerance = options.relTol || 1e-9;
    config.voltageTolerance = options.vntol || 1e-6;    // 1μV
    config.currentTolerance = options.abstol || 1e-12;   // 1pA
    config.dampingFactor = options.damping || 1.0;
    config.adaptiveDamping = options.adaptiveDamping !== false;
    config.debug = options.debug || false;
    
    return new NewtonRaphsonSolver(config);
}

export { NewtonRaphsonConfig };