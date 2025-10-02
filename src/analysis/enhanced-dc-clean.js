/**
 * 增強型 DC 分析器 - 整合同倫延拓與 Newton-Raphson 方法
 */

import { Matrix, Vector, LUSolver } from '../core/linalg.js';
import { MNABuilder } from '../core/mna.js';
import { NewtonRaphsonSolver, createSPICENewtonSolver } from '../core/newton-raphson-solver.js';
import { HomotopyDCSolver, createHomotopyDCSolver } from '../core/homotopy-dc-solver.js';

/**
 * 增強型 DC 分析結果
 */
export class EnhancedDCResult {
    constructor() {
        this.nodeVoltages = new Map();
        this.branchCurrents = new Map();
        this.componentPower = new Map();
        this.totalPower = 0;
        this.converged = false;
        
        // Newton-Raphson 統計
        this.newtonStats = {
            iterations: 0,
            finalError: Infinity,
            convergenceHistory: [],
            jacobianConditionNumber: 1.0,
            dampingUsed: 1.0
        };
        
        this.analysisInfo = {};
    }
    
    setNewtonStatistics(result) {
        this.newtonStats.iterations = result.iterations;
        this.newtonStats.finalError = result.finalError;
        this.newtonStats.convergenceHistory = result.convergenceHistory;
        this.newtonStats.jacobianConditionNumber = result.jacobianConditionNumber;
        this.newtonStats.dampingUsed = result.dampingUsed;
    }
}

/**
 * 增強型 DC 分析器
 */
export class EnhancedDCAnalysis {
    constructor() {
        this.mnaBuilder = new MNABuilder();
        this.newtonSolver = createSPICENewtonSolver({
            maxIterations: 100,
            vntol: 1e-6,
            abstol: 1e-12,
            reltol: 1e-9,
            debug: false
        });
        
        // 同倫延拓求解器 - 數學嚴格的全局收斂方法
        this.homotopySolver = createHomotopyDCSolver({
            tolerance: 1e-6,
            maxIterations: 100,
            maxStepSize: 0.1,
            minStepSize: 1e-5,
            debug: false
        });
        
        this.linearComponents = [];
        this.nonlinearComponents = [];
        this.debug = false;
        
        this.options = {
            maxIterations: 100,
            useHomotopyContinuation: true,  // 默認使用同倫延拓
            useNewtonRaphson: false,        // 備用方法
            initialGuessStrategy: 'linear'
        };
    }
    
    async analyze(components, options = {}) {
        const result = new EnhancedDCResult();
        
        Object.assign(this.options, options);
        this.newtonSolver.setConfig({ debug: this.debug });
        
        if (this.debug) {
            console.log('🔧 開始增強型 DC 分析...');
        }
        
        try {
            this.classifyComponents(components);
            
            this.mnaBuilder.reset();
            this.mnaBuilder.analyzeCircuit(components);
            
            if (this.nonlinearComponents.length === 0) {
                return await this.solveLinearDC(components, result);
            } else {
                return await this.solveNonlinearDC(components, result);
            }
            
        } catch (error) {
            result.converged = false;
            result.analysisInfo.error = error.message;
            
            if (this.debug) {
                console.error('❌ DC 分析失敗:', error);
            }
            
            return result;
        }
    }
    
    classifyComponents(components) {
        this.linearComponents = [];
        this.nonlinearComponents = [];
        
        for (const component of components) {
            if (typeof component.stampJacobian === 'function' && 
                typeof component.stampResidual === 'function') {
                this.nonlinearComponents.push(component);
            } else {
                this.linearComponents.push(component);
            }
        }
        
        if (this.debug) {
            console.log(`  線性元件: ${this.linearComponents.length}, 非線性元件: ${this.nonlinearComponents.length}`);
        }
    }
    
    async solveLinearDC(components, result) {
        if (this.debug) {
            console.log('  📐 求解線性 DC 電路...');
        }
        
        const { matrix, rhs } = this.mnaBuilder.buildMNAMatrix(components, 0);
        const solution = LUSolver.solve(matrix, rhs);
        
        result.nodeVoltages = this.mnaBuilder.extractNodeVoltages(solution);
        result.branchCurrents = this.mnaBuilder.extractVoltageSourceCurrents(solution);
        result.converged = true;
        
        this.calculatePower(components, result);
        
        if (this.debug) {
            console.log('  ✅ 線性 DC 分析完成');
        }
        
        return result;
    }
    
    async solveNonlinearDC(components, result) {
        if (this.debug) {
            console.log('  🔬 求解非線性 DC 電路...');
        }
        
        const nodeMap = this.mnaBuilder.getNodeMap();
        const matrixSize = this.mnaBuilder.getMatrixSize();
        
        // 優先使用同倫延拓方法
        if (this.options.useHomotopyContinuation) {
            const homotopyResult = await this.solveWithHomotopyContinuation(components, result, matrixSize, nodeMap);
            if (homotopyResult.converged) {
                return homotopyResult;
            }
            
            if (this.debug) {
                console.log('  ⚠️  同倫延拓失敗，回退到 Newton-Raphson...');
            }
        }
        
        // 備用: Newton-Raphson 方法
        if (this.options.useNewtonRaphson) {
            return await this.solveWithNewtonRaphson(components, result, matrixSize, nodeMap);
        }
        
        result.converged = false;
        result.analysisInfo.error = '所有非線性求解方法都失敗';
        return result;
    }
    
    async solveWithHomotopyContinuation(components, result, matrixSize, nodeMap) {
        if (this.debug) {
            console.log('    🧮 使用同倫延拓方法求解...');
        }
        
        // 設置同倫求解器調試模式
        this.homotopySolver.debug = this.debug;
        
        try {
            // === 定義原始非線性系統 F(x) ===
            const originalSystem = {
                residual: (x) => {
                    return this.computeResidual(x, components, nodeMap, matrixSize);
                },
                
                jacobian: (x) => {
                    return this.computeJacobian(x, components, nodeMap, matrixSize);
                }
            };
            
            // === 定義簡化線性系統 G(x) ===
            const simplifiedSystem = {
                residual: (x) => {
                    return this.computeLinearizedResidual(x, components, nodeMap, matrixSize);
                },
                
                jacobian: (x) => {
                    return this.computeLinearizedJacobian(x, components, nodeMap, matrixSize);
                }
            };
            
            // === 求解簡化系統獲得初始解 ===
            const x0 = this.generateLinearInitialGuess(matrixSize);
            
            // === 執行同倫延拓求解 ===
            const homotopyResult = this.homotopySolver.solve(originalSystem, simplifiedSystem, x0);
            
            if (homotopyResult.converged) {
                result.converged = true;
                result.nodeVoltages = this.mnaBuilder.extractNodeVoltages(homotopyResult.solution);
                result.branchCurrents = this.mnaBuilder.extractVoltageSourceCurrents(homotopyResult.solution);
                
                // 設置同倫統計信息
                result.newtonStats.iterations = homotopyResult.stats.totalSteps;
                result.newtonStats.finalError = homotopyResult.finalResidualNorm;
                result.newtonStats.convergenceHistory = homotopyResult.path.map(p => p.residualNorm);
                
                this.calculatePower(components, result);
                
                if (this.debug) {
                    const stats = homotopyResult.stats;
                    console.log(`    ✅ 同倫延拓收斂，${stats.totalSteps} 步，成功率 ${(stats.successRate*100).toFixed(1)}%`);
                    console.log(`       最終殘差: ${homotopyResult.finalResidualNorm.toExponential(3)}`);
                }
            } else {
                result.converged = false;
                result.analysisInfo.error = `同倫延拓未收斂: ${homotopyResult.error}`;
                
                if (this.debug) {
                    console.log(`    ❌ 同倫延拓未收斂: ${homotopyResult.error}`);
                }
            }
            
        } catch (error) {
            result.converged = false;
            result.analysisInfo.error = `同倫延拓執行失敗: ${error.message}`;
            
            if (this.debug) {
                console.error(`    ❌ 同倫延拓執行失敗:`, error);
            }
        }
        
        return result;
    }
    
    computeResidual(x, components, nodeMap, matrixSize) {
        const residual = Vector.zeros(matrixSize);
        
        const { matrix, rhs } = this.mnaBuilder.buildMNAMatrix(this.linearComponents, 0);
        
        for (let i = 0; i < matrixSize; i++) {
            let linearContribution = -rhs.get(i);
            
            for (let j = 0; j < matrixSize; j++) {
                linearContribution += matrix.get(i, j) * x.get(j);
            }
            
            residual.set(i, linearContribution);
        }
        
        for (const component of this.nonlinearComponents) {
            component.stampResidual(residual, x, nodeMap);
        }
        
        return residual;
    }
    
    computeJacobian(x, components, nodeMap, matrixSize) {
        const jacobian = Matrix.zeros(matrixSize, matrixSize);
        
        const { matrix, rhs } = this.mnaBuilder.buildMNAMatrix(this.linearComponents, 0);
        
        for (let i = 0; i < matrixSize; i++) {
            for (let j = 0; j < matrixSize; j++) {
                jacobian.set(i, j, matrix.get(i, j));
            }
        }
        
        for (const component of this.nonlinearComponents) {
            component.stampJacobian(jacobian, x, nodeMap);
        }
        
        return jacobian;
    }
    
    /**
     * 計算線性化殘差函數 (同倫延拓用)
     */
    computeLinearizedResidual(x, components, nodeMap, matrixSize) {
        const residual = Vector.zeros(matrixSize);
        
        // 線性部分
        const { matrix, rhs } = this.mnaBuilder.buildMNAMatrix(this.linearComponents, 0);
        
        for (let i = 0; i < matrixSize; i++) {
            let sum = -rhs.get(i);
            for (let j = 0; j < matrixSize; j++) {
                sum += matrix.get(i, j) * x.get(j);
            }
            residual.set(i, sum);
        }
        
        // 非線性元件線性化為 1Ω 電阻
        for (const component of this.nonlinearComponents) {
            if (component.constructor.name === 'NonlinearDiode') {
                const node1Name = component.nodes[0];
                const node2Name = component.nodes[1];
                
                const node1Index = nodeMap.get(node1Name);
                const node2Index = nodeMap.get(node2Name);
                
                const conductance = 1.0; // 1S
                
                if (node1Index !== undefined && node1Index >= 0) {
                    const v1 = x.get(node1Index);
                    const v2 = (node2Index !== undefined && node2Index >= 0) ? x.get(node2Index) : 0;
                    const current = conductance * (v1 - v2);
                    
                    residual.set(node1Index, residual.get(node1Index) + current);
                    
                    if (node2Index !== undefined && node2Index >= 0) {
                        residual.set(node2Index, residual.get(node2Index) - current);
                    }
                }
            }
        }
        
        return residual;
    }
    
    /**
     * 計算線性化雅可比矩陣
     */
    computeLinearizedJacobian(x, components, nodeMap, matrixSize) {
        const jacobian = Matrix.zeros(matrixSize, matrixSize);
        
        // 線性部分
        const { matrix } = this.mnaBuilder.buildMNAMatrix(this.linearComponents, 0);
        for (let i = 0; i < matrixSize; i++) {
            for (let j = 0; j < matrixSize; j++) {
                jacobian.set(i, j, matrix.get(i, j));
            }
        }
        
        // 非線性元件線性化
        for (const component of this.nonlinearComponents) {
            if (component.constructor.name === 'NonlinearDiode') {
                const node1Name = component.nodes[0];
                const node2Name = component.nodes[1];
                
                const node1Index = nodeMap.get(node1Name);
                const node2Index = nodeMap.get(node2Name);
                
                const conductance = 1.0; // 1S
                
                if (node1Index !== undefined && node1Index >= 0) {
                    jacobian.set(node1Index, node1Index, 
                        jacobian.get(node1Index, node1Index) + conductance);
                    
                    if (node2Index !== undefined && node2Index >= 0) {
                        jacobian.set(node1Index, node2Index,
                            jacobian.get(node1Index, node2Index) - conductance);
                        jacobian.set(node2Index, node1Index,
                            jacobian.get(node2Index, node1Index) - conductance);
                        jacobian.set(node2Index, node2Index,
                            jacobian.get(node2Index, node2Index) + conductance);
                    }
                }
            }
        }
        
        return jacobian;
    }
    
    /**
     * 生成線性初始解
     */
    generateLinearInitialGuess(matrixSize) {
        try {
            const linearJacobian = this.computeLinearizedJacobian(Vector.zeros(matrixSize), [], this.mnaBuilder.getNodeMap(), matrixSize);
            const linearResidual = this.computeLinearizedResidual(Vector.zeros(matrixSize), [], this.mnaBuilder.getNodeMap(), matrixSize);
            
            return LUSolver.solve(linearJacobian, linearResidual.scale(-1));
            
        } catch (error) {
            if (this.debug) {
                console.log('  ⚠️  線性系統求解失敗，使用零向量');
            }
            return Vector.zeros(matrixSize);
        }
    }

    calculatePower(components, result) {
        result.totalPower = 0;
        
        for (const component of components) {
            let power = 0;
            
            try {
                if (component.calculatePower) {
                    power = component.calculatePower(result.nodeVoltages, result.branchCurrents);
                }
                
                result.componentPower.set(component.name, power);
                result.totalPower += power;
                
            } catch (error) {
                result.componentPower.set(component.name, 0);
            }
        }
    }
    
    setDebug(enabled) {
        this.debug = enabled;
        this.newtonSolver.setConfig({ debug: enabled });
        this.homotopySolver.debug = enabled;
    }
}

export default EnhancedDCAnalysis;