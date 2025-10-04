/**
 * Newton-Raphson增強暫態分析 v2.0
 * 在原有TransientAnalysis基礎上添加非線性求解能力
 */

import { Matrix, Vector, LUSolver } from '../core/linalg.js';
import { MNABuilder } from '../core/mna.js';
import { TransientAnalysis, TransientResult } from './transient.js';

/**
 * 支持Newton-Raphson的增強暫態分析器
 */
export class NewtonRaphsonTransientAnalysis extends TransientAnalysis {
    constructor(options = {}) {
        super(options);
        
        // Newton-Raphson參數
        this.maxNewtonIterations = options.maxNewtonIterations || 50;
        this.newtonTolerance = options.newtonTolerance || 1e-9;
        this.dampingFactor = options.dampingFactor || 1.0;
        
        if (this.debug) {
            console.log('🔧 Newton-Raphson暫態分析器初始化');
            console.log(`  Newton參數: max_iter=${this.maxNewtonIterations}, tol=${this.newtonTolerance}`);
        }
    }

    /**
     * 檢測電路是否包含非線性元件
     */
    hasNonlinearComponents() {
        return this.components.some(c => c.isNonlinear || c.stampResidual || c.stampJacobian);
    }

    /**
     * 重載單個時間步方法以支持Newton-Raphson
     */
    async singleTimeStep(time) {
        if (this.hasNonlinearComponents()) {
            await this.singleNonlinearTimeStep(time);
        } else {
            await this.singleLinearTimeStep(time);
        }
    }

    /**
     * 線性時間步（調用父類方法）
     */
    async singleLinearTimeStep(time) {
        // 更新所有元件的伴隨模型
        for (const component of this.components) {
            if (typeof component.updateCompanionModel === 'function') {
                component.updateCompanionModel();
            }
        }
        
        // 建立當前時間點的MNA矩陣
        const { matrix, rhs } = this.mnaBuilder.buildMNAMatrix(this.components, time);
        
        // 求解線性方程組
        const solution = LUSolver.solve(matrix, rhs);
        
        // 提取節點電壓和支路電流
        const nodeVoltages = this.mnaBuilder.extractNodeVoltages(solution);
        const branchCurrents = this.mnaBuilder.extractVoltageSourceCurrents(solution);
        
        // 更新所有元件的歷史狀態
        for (const component of this.components) {
            component.updateHistory(nodeVoltages, branchCurrents);
        }
        
        // 保存結果
        this.result.addTimePoint(time, nodeVoltages, branchCurrents);
    }

    /**
     * 非線性時間步（Newton-Raphson迭代）
     */
    async singleNonlinearTimeStep(time) {
        // 獲取初始猜測
        let solution = this.getInitialGuess();
        
        let iteration = 0;
        let converged = false;

        while (iteration < this.maxNewtonIterations && !converged) {
            iteration++;

            // 更新伴隨模型
            for (const component of this.components) {
                if (typeof component.updateCompanionModel === 'function') {
                    component.updateCompanionModel();
                }
            }

            // 建立非線性系統
            const { jacobian, residual } = this.buildNonlinearSystem(solution, time);

            // 檢查收斂
            const residualNorm = this.computeNorm(residual);
            if (residualNorm < this.newtonTolerance) {
                converged = true;
                break;
            }

            // Newton步驟: J * delta = -F
            const negResidual = this.scaleVector(residual, -1);
            const delta = LUSolver.solve(jacobian, negResidual);

            // 阻尼更新
            const dampedDelta = this.scaleVector(delta, this.dampingFactor);
            solution = this.addVectors(solution, dampedDelta);

            if (this.debug && iteration % 10 === 0) {
                console.log(`  Newton iteration ${iteration}: residual = ${residualNorm.toExponential(3)}`);
            }
        }

        if (!converged) {
            throw new Error(`Newton-Raphson failed to converge at t=${time}s after ${iteration} iterations`);
        }

        // 提取結果
        const nodeVoltages = this.mnaBuilder.extractNodeVoltages(solution);
        const branchCurrents = this.mnaBuilder.extractVoltageSourceCurrents(solution);

        // 更新元件歷史
        for (const component of this.components) {
            component.updateHistory(nodeVoltages, branchCurrents);
        }

        // 保存結果
        this.result.addTimePoint(time, nodeVoltages, branchCurrents);

        if (this.debug && iteration > 20) {
            console.log(`⚡ Newton converged in ${iteration} iterations at t=${(time * 1e6).toFixed(2)}µs`);
        }
    }

    /**
     * 建立非線性系統
     */
    buildNonlinearSystem(solution, time) {
        // 建立基本線性系統
        const { matrix, rhs } = this.mnaBuilder.buildMNAMatrix(this.components, time);
        
        // 複製為Jacobian
        const jacobian = matrix.clone();
        const residual = Vector.zeros(matrix.rows);

        // 處理非線性元件
        for (const component of this.components) {
            if (component.stampJacobian && component.stampResidual) {
                component.stampJacobian(jacobian, solution, this.mnaBuilder.nodeMap, time);
                component.stampResidual(residual, solution, this.mnaBuilder.nodeMap, time);
            }
        }

        // 添加線性殘差 F = Ax - b
        for (let i = 0; i < matrix.rows; i++) {
            let linearRes = 0;
            for (let j = 0; j < matrix.cols; j++) {
                linearRes += matrix.get(i, j) * solution.get(j);
            }
            linearRes -= rhs.get(i);
            residual.set(i, residual.get(i) + linearRes);
        }

        return { jacobian, residual };
    }

    /**
     * 獲取初始猜測
     */
    getInitialGuess() {
        this.mnaBuilder.analyzeCircuit(this.components);
        const matrixSize = this.mnaBuilder.matrixSize;
        
        // 如果有上一時間步結果，使用作為初始猜測
        if (this.result && this.result.timePoints && this.result.timePoints.length > 0) {
            const lastPoint = this.result.timePoints[this.result.timePoints.length - 1];
            const guess = Vector.zeros(matrixSize);
            
            // 填充節點電壓
            if (lastPoint.nodeVoltages) {
                for (const [nodeId, voltage] of lastPoint.nodeVoltages) {
                    const nodeIndex = this.mnaBuilder.nodeMap.get(nodeId);
                    if (nodeIndex !== undefined && nodeIndex < matrixSize) {
                        guess.set(nodeIndex, voltage);
                    }
                }
            }
            
            // 填充電壓源電流
            if (lastPoint.branchCurrents) {
                let vsIndex = this.mnaBuilder.nodeCount;
                for (const [sourceId, current] of lastPoint.branchCurrents) {
                    if (vsIndex < matrixSize) {
                        guess.set(vsIndex, current);
                        vsIndex++;
                    }
                }
            }
            
            return guess;
        }
        
        return Vector.zeros(matrixSize);
    }

    /**
     * 計算向量範數
     */
    computeNorm(vector) {
        let sum = 0;
        for (let i = 0; i < vector.size; i++) {
            sum += vector.get(i) * vector.get(i);
        }
        return Math.sqrt(sum);
    }

    /**
     * 向量縮放
     */
    scaleVector(vector, scale) {
        const result = Vector.zeros(vector.size);
        for (let i = 0; i < vector.size; i++) {
            result.set(i, vector.get(i) * scale);
        }
        return result;
    }

    /**
     * 向量相加
     */
    addVectors(v1, v2) {
        if (v1.size !== v2.size) {
            throw new Error('Vector size mismatch');
        }
        const result = Vector.zeros(v1.size);
        for (let i = 0; i < v1.size; i++) {
            result.set(i, v1.get(i) + v2.get(i));
        }
        return result;
    }
}

/**
 * 工廠函數
 */
export function createNewtonRaphsonTransientAnalysis(options = {}) {
    return new NewtonRaphsonTransientAnalysis(options);
}