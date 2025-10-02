/**
 * 增強型 DC 分析器 - 支持 Newton-Raphson 非線性求解
 * 
 * 整合了 Newton-Raphson 求解器來處理真正的非線性元件，如：
 * - 非線性二極體 (Shockley 方程)
 * - 非線性 MOSFET
 * - 其他指數型或超越函數元件
 * 
 * 核心改進：
 * 1. 使用殘差-雅可比形式：J * Δx = -f(x)
 * 2. 支持自適應阻尼和收斂監控
 * 3. 專業級 SPICE 兼容的收斂標準
 */

import { Matrix, Vector, LUSolver } from '../core/linalg.js';
import { MNABuilder } from '../core/mna.js';
import { NewtonRaphsonSolver, createSPICENewtonSolver } from '../core/newton-raphson-solver.js';

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
    
    /**
     * 設置 Newton-Raphson 統計信息
     */
    setNewtonStatistics(result) {
        this.newtonStats.iterations = result.iterations;
        this.newtonStats.finalError = result.finalError;
        this.newtonStats.convergenceHistory = result.convergenceHistory;
        this.newtonStats.jacobianConditionNumber = result.jacobianConditionNumber;
        this.newtonStats.dampingUsed = result.dampingUsed;
    }
}

/**
 * 增強型 DC 分析器 - Newton-Raphson 非線性求解
 */
export class EnhancedDCAnalysis {
    constructor() {
        this.mnaBuilder = new MNABuilder();
        this.newtonSolver = createSPICENewtonSolver({
            maxIterations: 100,
            vntol: 1e-6,     // 電壓容差 1μV
            abstol: 1e-12,   // 電流容差 1pA
            reltol: 1e-9,    // 相對容差
            debug: false
        });
        
        // 組件分類
        this.linearComponents = [];
        this.nonlinearComponents = [];
        
        this.debug = false;
        
        // 分析選項
        this.options = {
            maxIterations: 100,
            useNewtonRaphson: true,
            initialGuessStrategy: 'zeros', // 'zeros' | 'linear' | 'previous'
            enableDamping: true,
            enablePivoting: true
        };
    }
    
    /**
     * 執行增強型 DC 分析
     * @param {BaseComponent[]} components 電路元件列表
     * @param {Object} options 分析選項
     * @returns {EnhancedDCResult} 分析結果
     */
    async analyze(components, options = {}) {
        const result = new EnhancedDCResult();
        
        // 合併選項
        Object.assign(this.options, options);
        this.newtonSolver.setConfig({ debug: this.debug });
        
        if (this.debug) {
            console.log('🔧 開始增強型 DC 分析 (Newton-Raphson)...');
        }
        
        try {
            // 元件分類
            this.classifyComponents(components);
            
            // 初始化 MNA 建構器
            this.mnaBuilder.reset();
            this.mnaBuilder.analyzeCircuit(components);
            
            // 檢查是否需要非線性求解
            if (this.nonlinearComponents.length === 0) {
                // 純線性電路，使用標準 MNA
                return await this.solveLinearDC(components, result);
            } else {
                // 非線性電路，使用 Newton-Raphson
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
    
    /**
     * 分類線性和非線性元件
     */
    classifyComponents(components) {
        this.linearComponents = [];
        this.nonlinearComponents = [];
        
        for (const component of components) {
            // 檢查元件是否有 stampJacobian 和 stampResidual 方法
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
    
    /**
     * 求解純線性 DC 電路
     */
    async solveLinearDC(components, result) {
        if (this.debug) {
            console.log('  📐 求解線性 DC 電路...');
        }
        
        // 建立標準 MNA 矩陣
        const { matrix, rhs } = this.mnaBuilder.buildMNAMatrix(components, 0);
        
        // 求解線性系統
        const solution = LUSolver.solve(matrix, rhs);
        
        // 提取結果
        result.nodeVoltages = this.mnaBuilder.extractNodeVoltages(solution);
        result.branchCurrents = this.mnaBuilder.extractVoltageSourceCurrents(solution);
        result.converged = true;
        
        // 計算功耗
        this.calculatePower(components, result);
        
        if (this.debug) {
            console.log('  ✅ 線性 DC 分析完成');
        }
        
        return result;
    }
    
    /**
     * 求解非線性 DC 電路 - Newton-Raphson 方法
     */
    async solveNonlinearDC(components, result) {
        if (this.debug) {
            console.log('  🔬 求解非線性 DC 電路 (Newton-Raphson)...');
        }
        
        // 獲取節點映射
        const nodeMap = this.mnaBuilder.getNodeMap();
        const matrixSize = this.mnaBuilder.getMatrixSize();
        
        // 初始猜測
        const initialGuess = this.generateInitialGuess(matrixSize);\n        \n        // 定義殘差函數 f(x)\n        const residualFunction = (x, context) => {\n            return this.computeResidual(x, components, nodeMap, matrixSize);\n        };\n        \n        // 定義雅可比函數 J(x) = ∂f/∂x\n        const jacobianFunction = (x, context) => {\n            return this.computeJacobian(x, components, nodeMap, matrixSize);\n        };\n        \n        // Newton-Raphson 求解\n        const newtonResult = this.newtonSolver.solve(\n            residualFunction,\n            jacobianFunction,\n            initialGuess,\n            { components, nodeMap }\n        );\n        \n        // 設置結果\n        result.converged = newtonResult.converged;\n        result.setNewtonStatistics(newtonResult);\n        \n        if (newtonResult.converged) {\n            // 提取節點電壓和支路電流\n            result.nodeVoltages = this.mnaBuilder.extractNodeVoltages(newtonResult.solution);\n            result.branchCurrents = this.mnaBuilder.extractVoltageSourceCurrents(newtonResult.solution);\n            \n            // 計算功耗\n            this.calculatePower(components, result);\n            \n            if (this.debug) {\n                console.log(`  ✅ Newton-Raphson 收斂，${newtonResult.iterations} 次迭代`);\n                console.log(`     最終誤差: ${newtonResult.finalError.toExponential(3)}`);\n            }\n        } else {\n            result.analysisInfo.error = `Newton-Raphson 未收斂: ${newtonResult.failureReason}`;\n            \n            if (this.debug) {\n                console.log(`  ❌ Newton-Raphson 未收斂: ${newtonResult.failureReason}`);\n            }\n        }\n        \n        return result;\n    }\n    \n    /**\n     * 計算殘差向量 f(x)\n     */\n    computeResidual(x, components, nodeMap, matrixSize) {\n        // 初始化殘差向量\n        const residual = Vector.zeros(matrixSize);\n        \n        // 線性元件的貢獻 (標準 MNA)\n        const { matrix, rhs } = this.mnaBuilder.buildMNAMatrix(this.linearComponents, 0);\n        \n        // 線性項: G * x - I_source\n        for (let i = 0; i < matrixSize; i++) {\n            let linearContribution = -rhs.get(i); // 右手邊 (源項)\n            \n            for (let j = 0; j < matrixSize; j++) {\n                linearContribution += matrix.get(i, j) * x.get(j);\n            }\n            \n            residual.set(i, linearContribution);\n        }\n        \n        // 非線性元件的貢獻\n        for (const component of this.nonlinearComponents) {\n            component.stampResidual(residual, x, nodeMap);\n        }\n        \n        return residual;\n    }\n    \n    /**\n     * 計算雅可比矩陣 J(x) = ∂f/∂x\n     */\n    computeJacobian(x, components, nodeMap, matrixSize) {\n        // 初始化雅可比矩陣\n        const jacobian = Matrix.zeros(matrixSize, matrixSize);\n        \n        // 線性元件的貢獻 (就是 G 矩陣)\n        const { matrix, rhs } = this.mnaBuilder.buildMNAMatrix(this.linearComponents, 0);\n        \n        for (let i = 0; i < matrixSize; i++) {\n            for (let j = 0; j < matrixSize; j++) {\n                jacobian.set(i, j, matrix.get(i, j));\n            }\n        }\n        \n        // 非線性元件的小信號貢獻\n        for (const component of this.nonlinearComponents) {\n            component.stampJacobian(jacobian, x, nodeMap);\n        }\n        \n        return jacobian;\n    }\n    \n    /**\n     * 生成初始猜測\n     */\n    generateInitialGuess(matrixSize) {\n        switch (this.options.initialGuessStrategy) {\n            case 'zeros':\n                return Vector.zeros(matrixSize);\n                \n            case 'linear':\n                // 首先求解線性化電路作為初始猜測\n                try {\n                    const { matrix, rhs } = this.mnaBuilder.buildMNAMatrix(this.linearComponents, 0);\n                    return LUSolver.solve(matrix, rhs);\n                } catch {\n                    return Vector.zeros(matrixSize);\n                }\n                \n            case 'previous':\n                // 使用之前的解作為初始猜測 (在參數掃描中有用)\n                return this.previousSolution || Vector.zeros(matrixSize);\n                \n            default:\n                return Vector.zeros(matrixSize);\n        }\n    }\n    \n    /**\n     * 計算元件功耗\n     */\n    calculatePower(components, result) {\n        result.totalPower = 0;\n        \n        for (const component of components) {\n            let power = 0;\n            \n            try {\n                if (component.calculatePower) {\n                    power = component.calculatePower(result.nodeVoltages, result.branchCurrents);\n                }\n                \n                result.componentPower.set(component.name, power);\n                result.totalPower += power;\n                \n            } catch (error) {\n                // 忽略功耗計算錯誤\n                result.componentPower.set(component.name, 0);\n            }\n        }\n    }\n    \n    /**\n     * 設置調試模式\n     */\n    setDebug(enabled) {\n        this.debug = enabled;\n        this.newtonSolver.setConfig({ debug: enabled });\n    }\n    \n    /**\n     * 獲取分析統計信息\n     */\n    getStatistics() {\n        return {\n            newtonSolver: this.newtonSolver.getStatistics(),\n            componentCounts: {\n                linear: this.linearComponents.length,\n                nonlinear: this.nonlinearComponents.length\n            }\n        };\n    }\n}"}