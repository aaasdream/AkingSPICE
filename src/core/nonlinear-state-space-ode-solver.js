/**
 * 非線性狀態空間ODE求解器
 * 
 * 擴展線性狀態空間求解器，添加牛頓-拉夫遜迭代能力：
 * - 每個時間步內的非線性方程組求解
 * - 自適應步長控制
 * - 數值穩定性保護
 * 
 * 數學框架：
 * 混合微分代數方程組：
 * C * dx/dt = f(x, u, t) + g(x, u, t)
 * 其中 g(x, u, t) 是非線性項
 * 
 * 隱式積分：
 * C * (x_{n+1} - x_n)/h = f(x_{n+1}, u_{n+1}, t_{n+1}) + g(x_{n+1}, u_{n+1}, t_{n+1})
 * 
 * 牛頓迭代：
 * [C/h - ∂f/∂x - ∂g/∂x] * Δx = residual
 */

import { Matrix, Vector } from './linalg.js';
import { StateSpaceODESolver, GPUMatrixOps, ODEIntegrator } from './state-space-ode-solver.js';
import { NonlinearStateSpaceMatrices } from './nonlinear-state-space-compiler.js';

/**
 * 牛頓-拉夫遜求解器
 */
class NewtonRaphsonSolver {
    constructor() {
        // 迭代參數
        this.maxIterations = 10;
        this.tolerance = 1e-9;
        this.dampingFactor = 1.0;
        this.minDampingFactor = 0.1;
        
        // 工作向量
        this.residualVector = null;
        this.deltaVector = null;
        this.jacobianMatrix = null;
        
        // 統計信息
        this.stats = {
            totalIterations: 0,
            totalConvergedSteps: 0,
            totalFailedSteps: 0,
            averageIterationsPerStep: 0,
            maxIterationsInStep: 0
        };
    }
    
    /**
     * 初始化求解器
     */
    initialize(systemSize, options = {}) {
        this.maxIterations = options.maxIterations || 10;
        this.tolerance = options.tolerance || 1e-9;
        this.dampingFactor = options.dampingFactor || 1.0;
        
        // 分配工作向量和矩陣
        this.residualVector = new Float32Array(systemSize);
        this.deltaVector = new Float32Array(systemSize);
        this.jacobianMatrix = Matrix.zeros(systemSize, systemSize);
        
        console.log(`🔧 Newton-Raphson 求解器初始化: 系統維度=${systemSize}, 最大迭代=${this.maxIterations}, 容忍度=${this.tolerance}`);
    }
    
    /**
     * 求解非線性方程組 F(x) = 0
     * @param {Function} residualFunction 殘差函數 F(x)
     * @param {Function} jacobianFunction 雅可比函數 ∂F/∂x
     * @param {Float32Array} initialGuess 初始猜測 x0
     * @param {Object} context 上下文信息 (時間、輸入等)
     * @returns {Object} {converged, iterations, finalResidual, solution}
     */
    solve(residualFunction, jacobianFunction, initialGuess, context = {}) {
        const n = initialGuess.length;
        const currentX = new Float32Array(initialGuess);
        
        let iteration = 0;
        let converged = false;
        let currentDamping = this.dampingFactor;
        
        // 主迭代循環
        while (iteration < this.maxIterations && !converged) {
            // 計算殘差向量 F(x)
            const residual = residualFunction(currentX, context);
            const residualNorm = this.vectorNorm(residual);
            
            if (residualNorm < this.tolerance) {
                converged = true;
                break;
            }
            
            // 計算雅可比矩陣 ∂F/∂x
            const jacobian = jacobianFunction(currentX, context);
            
            try {
                // 求解線性方程組: J * Δx = -F
                this.residualVector.set(residual);
                for (let i = 0; i < n; i++) {
                    this.residualVector[i] = -this.residualVector[i];
                }
                
                // 使用 LU 分解求解 (簡化實現)
                const deltaX = this.solveLU(jacobian, this.residualVector);
                
                // 阻尼牛頓步
                let stepAccepted = false;
                let tempDamping = currentDamping;
                
                while (!stepAccepted && tempDamping >= this.minDampingFactor) {
                    // 嘗試步長
                    const newX = new Float32Array(n);
                    for (let i = 0; i < n; i++) {
                        newX[i] = currentX[i] + tempDamping * deltaX[i];
                    }
                    
                    // 檢查新點的殘差
                    const newResidual = residualFunction(newX, context);
                    const newResidualNorm = this.vectorNorm(newResidual);
                    
                    // 接受步長條件：殘差減小
                    if (newResidualNorm < residualNorm * (1 - 0.1 * tempDamping)) {
                        currentX.set(newX);
                        stepAccepted = true;
                        currentDamping = Math.min(this.dampingFactor, tempDamping * 1.2);
                    } else {
                        tempDamping *= 0.5; // 減半步長
                    }
                }
                
                if (!stepAccepted) {
                    console.warn(`⚠️  Newton-Raphson: 步長搜索失敗，迭代=${iteration}`);
                    break;
                }
                
            } catch (error) {
                console.warn(`⚠️  Newton-Raphson: 雅可比矩陣奇異，迭代=${iteration}`);
                break;
            }
            
            iteration++;
        }
        
        // 更新統計信息
        this.stats.totalIterations += iteration;
        this.stats.maxIterationsInStep = Math.max(this.stats.maxIterationsInStep, iteration);
        
        if (converged) {
            this.stats.totalConvergedSteps++;
        } else {
            this.stats.totalFailedSteps++;
        }
        
        const totalSteps = this.stats.totalConvergedSteps + this.stats.totalFailedSteps;
        this.stats.averageIterationsPerStep = totalSteps > 0 ? this.stats.totalIterations / totalSteps : 0;
        
        const finalResidual = residualFunction(currentX, context);
        
        return {
            converged: converged,
            iterations: iteration,
            finalResidualNorm: this.vectorNorm(finalResidual),
            solution: currentX,
            dampingUsed: currentDamping
        };
    }
    
    /**
     * 計算向量的2範數
     */
    vectorNorm(vector) {
        let sum = 0;
        for (let i = 0; i < vector.length; i++) {
            sum += vector[i] * vector[i];
        }
        return Math.sqrt(sum);
    }
    
    /**
     * LU分解求解線性方程組 (簡化實現)
     */
    solveLU(matrix, rhs) {
        const n = rhs.length;
        const solution = new Float32Array(n);
        
        // 這裡應該使用真正的 LU 分解
        // 暫時使用簡化的高斯消元法
        return this.gaussElimination(matrix, rhs);
    }
    
    /**
     * 高斯消元法 (基本實現)
     */
    gaussElimination(matrix, rhs) {
        const n = rhs.length;
        const A = matrix.clone(); // 避免修改原矩陣
        const b = new Float32Array(rhs);
        
        // 前向消元
        for (let k = 0; k < n - 1; k++) {
            // 尋找主元
            let maxRow = k;
            for (let i = k + 1; i < n; i++) {
                if (Math.abs(A.get(i, k)) > Math.abs(A.get(maxRow, k))) {
                    maxRow = i;
                }
            }
            
            // 交換行
            if (maxRow !== k) {
                for (let j = 0; j < n; j++) {
                    const temp = A.get(k, j);
                    A.set(k, j, A.get(maxRow, j));
                    A.set(maxRow, j, temp);
                }
                const tempB = b[k];
                b[k] = b[maxRow];
                b[maxRow] = tempB;
            }
            
            // 檢查奇異性
            if (Math.abs(A.get(k, k)) < 1e-14) {
                throw new Error('矩陣奇異，無法求解');
            }
            
            // 消元
            for (let i = k + 1; i < n; i++) {
                const factor = A.get(i, k) / A.get(k, k);
                for (let j = k; j < n; j++) {
                    A.set(i, j, A.get(i, j) - factor * A.get(k, j));
                }
                b[i] -= factor * b[k];
            }
        }
        
        // 回代
        const x = new Float32Array(n);
        for (let i = n - 1; i >= 0; i--) {
            let sum = b[i];
            for (let j = i + 1; j < n; j++) {
                sum -= A.get(i, j) * x[j];
            }
            x[i] = sum / A.get(i, i);
        }
        
        return x;
    }
    
    /**
     * 獲取統計信息
     */
    getStats() {
        return { ...this.stats };
    }
    
    /**
     * 重置統計信息
     */
    resetStats() {
        this.stats = {
            totalIterations: 0,
            totalConvergedSteps: 0,
            totalFailedSteps: 0,
            averageIterationsPerStep: 0,
            maxIterationsInStep: 0
        };
    }
}

/**
 * 非線性狀態空間ODE求解器
 */
export class NonlinearStateSpaceODESolver extends StateSpaceODESolver {
    constructor() {
        super();
        
        // Newton-Raphson 求解器
        this.newtonSolver = new NewtonRaphsonSolver();
        
        // 非線性相關
        this.nonlinearMatrices = null;
        this.isNonlinear = false;
        
        // 積分方法 (非線性系統需要隱式方法)
        this.integrationMethod = 'implicit_euler'; // 'implicit_euler', 'bdf2'
        
        // 工作向量
        this.previousStateVector = null;
        this.predictor = null;
    }
    
    /**
     * 初始化求解器
     */
    async initialize(matrices, options = {}) {
        // 檢查是否為非線性矩陣
        this.isNonlinear = matrices instanceof NonlinearStateSpaceMatrices;
        
        if (this.isNonlinear) {
            this.nonlinearMatrices = matrices;
            console.log('🚀 初始化非線性狀態空間ODE求解器...');
            console.log(`   非線性元件: ${matrices.nonlinearComponents.length}個`);
            
            // 初始化 Newton-Raphson 求解器
            this.newtonSolver.initialize(matrices.numStates, {
                maxIterations: options.newtonMaxIterations || 10,
                tolerance: options.newtonTolerance || 1e-9,
                dampingFactor: options.newtonDamping || 0.7
            });
        } else {
            console.log('🚀 使用線性狀態空間求解器...');
        }
        
        // 調用父類初始化
        await super.initialize(matrices, options);
        
        // 分配工作向量
        if (this.isNonlinear) {
            this.previousStateVector = new Float32Array(this.stateVector.length);
            this.predictor = new Float32Array(this.stateVector.length);
        }
        
        console.log('✅ 非線性求解器初始化完成');
    }
    
    /**
     * 執行單步積分 (包含非線性求解)
     */
    step(timeStep) {
        if (!this.isNonlinear) {
            // 線性系統：使用父類方法
            return super.step(timeStep);
        }
        
        // 非線性系統：使用隱式積分 + Newton-Raphson
        return this.implicitStep(timeStep);
    }
    
    /**
     * 隱式積分步 (Backward Euler + Newton-Raphson)
     */
    implicitStep(h) {
        const startTime = performance.now();
        
        // 保存前一步狀態
        this.previousStateVector.set(this.stateVector);
        const t_new = this.currentTime + h;
        
        // 更新輸入向量
        this.updateInputs(t_new);
        
        // 預測器：使用顯式 Euler 作為初始猜測
        this.computePredictor(h);
        
        // 定義殘差函數 F(x) = 0
        const residualFunction = (x, context) => {
            return this.computeResidual(x, context.h, context.t);
        };
        
        // 定義雅可比函數 ∂F/∂x
        const jacobianFunction = (x, context) => {
            return this.computeJacobian(x, context.h, context.t);
        };
        
        // Newton-Raphson 求解
        const result = this.newtonSolver.solve(
            residualFunction,
            jacobianFunction,
            this.predictor,
            { h: h, t: t_new }
        );
        
        if (result.converged) {
            // 更新狀態向量
            this.stateVector.set(result.solution);
            this.currentTime = t_new;
            
            // 更新輸出
            this.updateOutputVector();
            
            // 統計信息
            const stepTime = performance.now() - startTime;
            this.updateStepStats(stepTime, result.iterations);
        } else {
            console.warn(`⚠️  非線性求解失敗 t=${this.currentTime.toFixed(6)}, 迭代=${result.iterations}, 殘差=${result.finalResidualNorm.toExponential(3)}`);
            
            // 降級到較小步長或線性近似
            return this.fallbackStep(h * 0.5);
        }
        
        return this.getCurrentStepResult();
    }
    
    /**
     * 計算預測器 (顯式 Euler)
     */
    computePredictor(h) {
        // x_pred = x_old + h * f(x_old, u_old, t_old)
        const derivative = this.computeDerivative(this.stateVector, this.currentTime);
        
        for (let i = 0; i < this.stateVector.length; i++) {
            this.predictor[i] = this.previousStateVector[i] + h * derivative[i];
        }
    }
    
    /**
     * 計算殘差向量 F(x) = x - x_old - h * f(x, u, t)
     */
    computeResidual(x, h, t) {
        const n = x.length;
        const residual = new Float32Array(n);
        
        // 計算 f(x, u, t) = A*x + B*u + g(x, u)
        const derivative = this.computeDerivative(x, t);
        
        // 殘差: F(x) = x - x_old - h * f(x, u, t)
        for (let i = 0; i < n; i++) {
            residual[i] = x[i] - this.previousStateVector[i] - h * derivative[i];
        }
        
        return residual;
    }
    
    /**
     * 計算雅可比矩陣 ∂F/∂x = I - h * (A + ∂g/∂x)
     */
    computeJacobian(x, h, t) {
        const n = x.length;
        const jacobian = Matrix.zeros(n, n);
        
        // 線性部分: I - h * A
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                if (i === j) {
                    jacobian.set(i, j, 1.0 - h * this.nonlinearMatrices.A.get(i, j));
                } else {
                    jacobian.set(i, j, -h * this.nonlinearMatrices.A.get(i, j));
                }
            }
        }
        
        // 非線性部分: -h * ∂g/∂x
        this.addNonlinearJacobian(jacobian, x, h);
        
        return jacobian;
    }
    
    /**
     * 計算導數 dx/dt = A*x + B*u + g(x, u)
     */
    computeDerivative(x, t) {
        const n = x.length;
        const derivative = new Float32Array(n);
        
        // 線性部分: A*x + B*u
        this.gpuOps.gemv(
            this.nonlinearMatrices.A,
            x,
            derivative,
            1.0, 0.0
        );
        
        if (this.nonlinearMatrices.numInputs > 0) {
            const temp = new Float32Array(n);
            this.gpuOps.gemv(
                this.nonlinearMatrices.B,
                this.inputVector,
                temp,
                1.0, 0.0
            );
            
            for (let i = 0; i < n; i++) {
                derivative[i] += temp[i];
            }
        }
        
        // 非線性部分: g(x, u)
        this.addNonlinearTerms(derivative, x);
        
        return derivative;
    }
    
    /**
     * 添加非線性項到導數
     */
    addNonlinearTerms(derivative, x) {
        // 更新工作點
        const nodeVoltages = this.computeNodeVoltages(x);
        this.nonlinearMatrices.updateWorkingPoint(x, this.inputVector, nodeVoltages);
        
        // 評估非線性向量
        const nlVector = this.nonlinearMatrices.evaluateNonlinearVector();
        
        // 添加到導數中
        for (let i = 0; i < derivative.length; i++) {
            derivative[i] += nlVector[i];
        }
    }
    
    /**
     * 添加非線性雅可比到總雅可比矩陣
     */
    addNonlinearJacobian(jacobian, x, h) {
        // 更新工作點
        const nodeVoltages = this.computeNodeVoltages(x);
        this.nonlinearMatrices.updateWorkingPoint(x, this.inputVector, nodeVoltages);
        
        // 評估狀態雅可比
        const stateJacobian = this.nonlinearMatrices.evaluateStateJacobian();
        
        // 添加 -h * ∂g/∂x 到雅可比矩陣
        for (let i = 0; i < jacobian.rows; i++) {
            for (let j = 0; j < jacobian.cols; j++) {
                const value = jacobian.get(i, j) - h * stateJacobian.get(i, j);
                jacobian.set(i, j, value);
            }
        }
    }
    
    /**
     * 計算節點電壓 (從狀態向量推導)
     */
    computeNodeVoltages(stateVector) {
        const nodeVoltages = new Map();
        
        // 簡化實現：假設狀態變量直接對應節點電壓
        for (let i = 0; i < this.nonlinearMatrices.nodeNames.length; i++) {
            const nodeName = this.nonlinearMatrices.nodeNames[i];
            const voltage = i < stateVector.length ? stateVector[i] : 0;
            nodeVoltages.set(nodeName, voltage);
        }
        
        return nodeVoltages;
    }
    
    /**
     * 回退步長策略
     */
    fallbackStep(reducedH) {
        if (reducedH < 1e-12) {
            throw new Error('時間步長過小，無法收斂');
        }
        
        console.warn(`⚠️  回退到更小步長: ${reducedH.toExponential(3)}`);
        return this.implicitStep(reducedH);
    }
    
    /**
     * 獲取統計信息
     */
    getStats() {
        const baseStats = super.getStats();
        const newtonStats = this.newtonSolver.getStats();
        
        return {
            ...baseStats,
            isNonlinear: this.isNonlinear,
            newton: newtonStats
        };
    }
}

/**
 * 工廠函數：創建非線性狀態空間求解器
 */
export async function createNonlinearStateSpaceSolver(components, options = {}) {
    console.log('🏭 創建非線性狀態空間求解器...');
    
    // 編譯電路 (自動檢測線性/非線性)
    const { NonlinearStateSpaceCompiler } = await import('./nonlinear-state-space-compiler.js');
    const compiler = new NonlinearStateSpaceCompiler();
    
    if (options.debug) {
        compiler.setDebug(true);
    }
    
    const matrices = await compiler.compile(components, {
        includeNodeVoltages: true,
        nonlinear: options.nonlinear || {},
        debug: options.debug || false
    });
    
    // 創建求解器
    const solver = new NonlinearStateSpaceODESolver();
    
    await solver.initialize(matrices, {
        integrationMethod: options.integrationMethod || 'implicit_euler',
        newtonMaxIterations: options.newtonMaxIterations || 10,
        newtonTolerance: options.newtonTolerance || 1e-9,
        debug: options.debug || false
    });
    
    console.log('🎯 非線性狀態空間求解器創建完成！');
    
    return solver;
}