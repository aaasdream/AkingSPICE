/**
 * 直流分析 (DC Analysis) 實現
 * 
 * 用於求解電路的直流工作點，是暫態分析的初始條件
 */

import { Matrix, Vector, LUSolver } from '../core/linalg.js';
import { MNABuilder } from '../core/mna.js';

/**
 * DC分析結果類
 */
export class DCResult {
    constructor() {
        this.nodeVoltages = new Map();
        this.branchCurrents = new Map();
        this.componentPower = new Map();
        this.totalPower = 0;
        this.analysisInfo = {};
        this.converged = false;
    }

    /**
     * 獲取節點電壓
     * @param {string} nodeName 節點名稱
     * @returns {number} 電壓值
     */
    getNodeVoltage(nodeName) {
        return this.nodeVoltages.get(nodeName) || 0;
    }

    /**
     * 獲取支路電流
     * @param {string} branchName 支路名稱
     * @returns {number} 電流值
     */
    getBranchCurrent(branchName) {
        return this.branchCurrents.get(branchName) || 0;
    }

    /**
     * 計算元件功耗
     * @param {BaseComponent[]} components 元件列表
     */
    calculatePower(components) {
        this.totalPower = 0;
        
        for (const component of components) {
            let power = 0;
            
            if (component.type === 'R') {
                // 電阻功耗: P = V² / R
                const voltage = component.getVoltage(this.nodeVoltages);
                power = voltage * voltage / component.getResistance();
                
            } else if (component.type === 'V') {
                // 電壓源功耗: P = V * I
                const voltage = component.getValue();
                const current = this.getBranchCurrent(component.name);
                power = -voltage * current; // 負號表示電壓源提供功率
                
            } else if (component.type === 'I') {
                // 電流源功耗: P = V * I
                const voltage = component.getVoltage(this.nodeVoltages);
                const current = component.getValue();
                power = -voltage * current; // 負號表示電流源提供功率
            }
            
            this.componentPower.set(component.name, power);
            this.totalPower += Math.abs(power);
        }
    }

    /**
     * 獲取分析摘要
     * @returns {Object} 摘要信息
     */
    getSummary() {
        const nodeCount = this.nodeVoltages.size;
        const branchCount = this.branchCurrents.size;
        
        return {
            ...this.analysisInfo,
            converged: this.converged,
            nodeCount,
            branchCount,
            totalPower: this.totalPower,
            nodes: Array.from(this.nodeVoltages.keys()),
            branches: Array.from(this.branchCurrents.keys())
        };
    }
}

/**
 * DC分析引擎
 */
export class DCAnalysis {
    constructor() {
        this.mnaBuilder = new MNABuilder();
        this.debug = false;
    }

    /**
     * 執行DC分析
     * @param {BaseComponent[]} components 電路元件列表
     * @param {Object} options 分析選項
     * @returns {DCResult} DC分析結果
     */
    async run(components, options = {}) {
        this.debug = options.debug || false;
        const result = new DCResult();
        
        try {
            if (this.debug) {
                console.log('Starting DC analysis...');
            }
            
            // 分析電路拓撲
            this.mnaBuilder.analyzeCircuit(components);
            
            // 建立MNA矩陣 (t=0，所有動態元件使用DC行為)
            const { matrix, rhs } = this.mnaBuilder.buildMNAMatrix(components, 0);
            
            if (this.debug) {
                console.log('MNA Matrix built');
                this.mnaBuilder.printMNAMatrix();
            }
            
            // 求解線性方程組
            const solution = LUSolver.solve(matrix, rhs);
            
            // 提取結果
            result.nodeVoltages = this.mnaBuilder.extractNodeVoltages(solution);
            result.branchCurrents = this.mnaBuilder.extractVoltageSourceCurrents(solution);
            result.converged = true;
            
            // 計算功耗
            result.calculatePower(components);
            
            // 設置分析信息
            result.analysisInfo = {
                method: 'Modified Nodal Analysis',
                matrixSize: this.mnaBuilder.matrixSize,
                nodeCount: this.mnaBuilder.nodeCount,
                voltageSourceCount: this.mnaBuilder.voltageSourceCount,
                matrixCondition: this.estimateCondition(matrix)
            };
            
            if (this.debug) {
                this.printResults(result);
            }
            
            return result;
            
        } catch (error) {
            console.error('DC analysis failed:', error);
            result.converged = false;
            result.analysisInfo.error = error.message;
            return result;
        }
    }

    /**
     * 估算矩陣條件數
     * @param {Matrix} matrix MNA矩陣
     * @returns {number} 條件數估計值
     */
    estimateCondition(matrix) {
        try {
            return LUSolver.estimateConditionNumber(matrix);
        } catch (error) {
            return Infinity;
        }
    }

    /**
     * 打印DC分析結果
     * @param {DCResult} result DC分析結果
     */
    printResults(result) {
        console.log('\\n=== DC Analysis Results ===');
        
        console.log('\\nNode Voltages:');
        for (const [node, voltage] of result.nodeVoltages) {
            if (Math.abs(voltage) < 1e-12) {
                console.log(`  V(${node}) = 0V`);
            } else if (Math.abs(voltage) >= 1000) {
                console.log(`  V(${node}) = ${(voltage / 1000).toFixed(3)}kV`);
            } else if (Math.abs(voltage) >= 1) {
                console.log(`  V(${node}) = ${voltage.toFixed(6)}V`);
            } else if (Math.abs(voltage) >= 1e-3) {
                console.log(`  V(${node}) = ${(voltage * 1000).toFixed(3)}mV`);
            } else if (Math.abs(voltage) >= 1e-6) {
                console.log(`  V(${node}) = ${(voltage * 1e6).toFixed(3)}µV`);
            } else {
                console.log(`  V(${node}) = ${voltage.toExponential(3)}V`);
            }
        }
        
        console.log('\\nBranch Currents:');
        for (const [branch, current] of result.branchCurrents) {
            if (Math.abs(current) < 1e-12) {
                console.log(`  I(${branch}) = 0A`);
            } else if (Math.abs(current) >= 1) {
                console.log(`  I(${branch}) = ${current.toFixed(6)}A`);
            } else if (Math.abs(current) >= 1e-3) {
                console.log(`  I(${branch}) = ${(current * 1000).toFixed(3)}mA`);
            } else if (Math.abs(current) >= 1e-6) {
                console.log(`  I(${branch}) = ${(current * 1e6).toFixed(3)}µA`);
            } else if (Math.abs(current) >= 1e-9) {
                console.log(`  I(${branch}) = ${(current * 1e9).toFixed(3)}nA`);
            } else {
                console.log(`  I(${branch}) = ${current.toExponential(3)}A`);
            }
        }
        
        console.log('\\nComponent Power:');
        let totalSupplied = 0;
        let totalDissipated = 0;
        
        for (const [component, power] of result.componentPower) {
            if (power < 0) {
                totalSupplied += Math.abs(power);
                console.log(`  P(${component}) = ${Math.abs(power).toFixed(6)}W (supplied)`);
            } else if (power > 1e-12) {
                totalDissipated += power;
                console.log(`  P(${component}) = ${power.toFixed(6)}W (dissipated)`);
            }
        }
        
        console.log(`\\nPower Balance:`);
        console.log(`  Total Supplied: ${totalSupplied.toFixed(6)}W`);
        console.log(`  Total Dissipated: ${totalDissipated.toFixed(6)}W`);
        console.log(`  Balance Error: ${Math.abs(totalSupplied - totalDissipated).toFixed(9)}W`);
        
        const info = result.getSummary();
        console.log(`\\nMatrix Info: ${info.matrixSize}×${info.matrixSize}, condition ≈ ${info.matrixCondition.toExponential(2)}`);
        console.log('===========================\\n');
    }

    /**
     * 設置調試模式
     * @param {boolean} enabled 是否啟用調試
     */
    setDebug(enabled) {
        this.debug = enabled;
    }
}