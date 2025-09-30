/**
 * =================================================================
 *             梯形積分法 (Trapezoidal Rule) 實現
 * =================================================================
 * 
 * 目標: 實現梯形積分法來取代後向歐拉法，減少諧振系統中的數值阻尼
 * 
 * 梯形法優勢:
 * 1. 二階精度 (vs 後向歐拉的一階精度)
 * 2. 在諧振系統中數值阻尼更小
 * 3. 對高Q系統更穩定
 */

import { Matrix, Vector } from './linalg.js';

/**
 * 梯形積分法伴隨模型
 * 
 * 電容: i_c = C/h * (v_n - v_n-1) + i_hist
 * 其中梯形法: i_hist = C/(2h) * (v_n + v_n-1) - i_n-1
 * 
 * 電感: v_L = L/h * (i_n - i_n-1) + v_hist  
 * 其中梯形法: v_hist = L/(2h) * (i_n + i_n-1) - v_n-1
 */

/**
 * 修正的電容類 - 使用梯形積分法
 */
export class TrapezoidalCapacitor {
    constructor(name, nodes, value, options = {}) {
        this.name = name;
        this.nodes = nodes;
        this.value = value;
        this.ic = options.ic || 0; // 初始電壓
        
        // 數值積分參數
        this.timeStep = null;
        this.equivalentConductance = 0;
        this.historyCurrentSource = 0;
        
        // 歷史狀態 (梯形法需要兩個歷史點)
        this.previousVoltage = this.ic;
        this.previousCurrent = 0;
        this.currentVoltage = this.ic;
        this.currentCurrent = 0;
        
        // 調試信息
        this.operatingPoint = { voltage: 0, current: 0, power: 0 };
    }

    /**
     * 初始化暫態分析 - 梯形法
     */
    initTransient(timeStep) {
        this.timeStep = timeStep;
        const C = this.value;
        
        // 梯形法等效電導: G_eq = 2C/h
        this.equivalentConductance = 2 * C / timeStep;
        
        // 初始化歷史項
        this.previousVoltage = this.ic;
        this.previousCurrent = 0;
        this.updateCompanionModel();
    }

    /**
     * 更新伴隨模型 - 梯形法實現
     */
    updateCompanionModel() {
        if (!this.timeStep) return;
        
        const C = this.value;
        const h = this.timeStep;
        
        // 梯形法歷史電流源: I_hist = 2C/h * v_n-1 + i_n-1
        this.historyCurrentSource = (2 * C / h) * this.previousVoltage + this.previousCurrent;
    }

    /**
     * 計算電容電流 - 梯形法
     */
    getCurrent(nodeVoltages) {
        const voltage = this.getVoltage(nodeVoltages);
        
        if (!this.timeStep) {
            // DC分析
            return 0;
        }
        
        const C = this.value;
        const h = this.timeStep;
        
        // 梯形法: i_n = 2C/h * (v_n - v_n-1) - i_n-1
        const current = (2 * C / h) * (voltage - this.previousVoltage) - this.previousCurrent;
        
        this.currentVoltage = voltage;
        this.currentCurrent = current;
        this.operatingPoint.current = current;
        
        return current;
    }

    /**
     * 獲取電壓
     */
    getVoltage(nodeVoltages) {
        const v1 = nodeVoltages.get(this.nodes[0]) || 0;
        const v2 = nodeVoltages.get(this.nodes[1]) || 0;
        return v1 - v2;
    }

    /**
     * 更新歷史狀態
     */
    updateHistory(nodeVoltages, branchCurrents) {
        this.previousVoltage = this.currentVoltage;
        this.previousCurrent = this.currentCurrent;
        
        // 為下一步準備伴隨模型
        this.updateCompanionModel();
    }

    /**
     * MNA矩陣貢獻
     */
    stampMNA(mnaBuilder) {
        const nodeIndex1 = mnaBuilder.getNodeIndex(this.nodes[0]);
        const nodeIndex2 = mnaBuilder.getNodeIndex(this.nodes[1]);
        
        if (nodeIndex1 >= 0) {
            // G_eq 項
            mnaBuilder.matrix.addToElement(nodeIndex1, nodeIndex1, this.equivalentConductance);
            // I_hist 項
            mnaBuilder.rhs.addToElement(nodeIndex1, this.historyCurrentSource);
            
            if (nodeIndex2 >= 0) {
                mnaBuilder.matrix.addToElement(nodeIndex1, nodeIndex2, -this.equivalentConductance);
                mnaBuilder.matrix.addToElement(nodeIndex2, nodeIndex1, -this.equivalentConductance);
                mnaBuilder.matrix.addToElement(nodeIndex2, nodeIndex2, this.equivalentConductance);
                mnaBuilder.rhs.addToElement(nodeIndex2, -this.historyCurrentSource);
            }
        }
    }

    // 為了兼容性保留的屬性和方法
    get type() { return 'C'; }
    needsCurrentVariable() { return false; }
}

/**
 * 修正的電感類 - 使用梯形積分法
 */
export class TrapezoidalInductor {
    constructor(name, nodes, value, options = {}) {
        this.name = name;
        this.nodes = nodes;
        this.value = value;
        this.ic = options.ic || 0; // 初始電流
        this.resistance = options.Rs || 0; // 寄生電阻
        
        // 數值積分參數
        this.timeStep = null;
        this.equivalentResistance = 0;
        this.historyVoltageSource = 0;
        
        // 歷史狀態
        this.previousCurrent = this.ic;
        this.previousVoltage = 0;
        this.currentCurrent = this.ic;
        this.currentVoltage = 0;
        
        // 調試信息
        this.operatingPoint = { voltage: 0, current: 0, power: 0 };
    }

    /**
     * 初始化暫態分析 - 梯形法
     */
    initTransient(timeStep) {
        this.timeStep = timeStep;
        const L = this.value;
        
        // 梯形法等效電阻: R_eq = 2L/h + Rs
        this.equivalentResistance = 2 * L / timeStep + this.resistance;
        
        // 初始化歷史項
        this.previousCurrent = this.ic;
        this.previousVoltage = this.ic * this.resistance; // 初始時僅寄生電阻壓降
        this.updateCompanionModel();
    }

    /**
     * 更新伴隨模型 - 梯形法實現
     */
    updateCompanionModel() {
        if (!this.timeStep) return;
        
        const L = this.value;
        const h = this.timeStep;
        
        // 梯形法歷史電壓源: V_hist = 2L/h * i_n-1 + v_n-1
        this.historyVoltageSource = (2 * L / h) * this.previousCurrent + this.previousVoltage;
    }

    /**
     * 計算電感電壓 - 梯形法
     */
    getVoltageFromCurrent(current) {
        if (!this.timeStep) {
            // DC分析
            return current * this.resistance;
        }
        
        const L = this.value;
        const h = this.timeStep;
        
        // 梯形法: v_n = 2L/h * (i_n - i_n-1) - v_n-1 + Rs * i_n
        const inductiveVoltage = (2 * L / h) * (current - this.previousCurrent) - this.previousVoltage;
        const totalVoltage = inductiveVoltage + this.resistance * current;
        
        this.currentCurrent = current;
        this.currentVoltage = totalVoltage;
        this.operatingPoint.voltage = totalVoltage;
        this.operatingPoint.current = current;
        
        return totalVoltage;
    }

    /**
     * 更新歷史狀態
     */
    updateHistory(nodeVoltages, branchCurrents) {
        const current = branchCurrents.get(this.name) || 0;
        const voltage = this.getVoltageFromCurrent(current);
        
        this.previousCurrent = this.currentCurrent;
        this.previousVoltage = this.currentVoltage;
        
        // 為下一步準備伴隨模型
        this.updateCompanionModel();
        
        this.operatingPoint.power = voltage * current;
    }

    /**
     * MNA矩陣貢獻 (電感需要電流變數)
     */
    stampMNA(mnaBuilder) {
        const nodeIndex1 = mnaBuilder.getNodeIndex(this.nodes[0]);
        const nodeIndex2 = mnaBuilder.getNodeIndex(this.nodes[1]);
        const currentVarIndex = mnaBuilder.addCurrentVariable(this.name);
        
        // 電壓方程: V1 - V2 = R_eq * I + V_hist
        if (nodeIndex1 >= 0) {
            mnaBuilder.matrix.setElement(currentVarIndex, nodeIndex1, 1);
        }
        if (nodeIndex2 >= 0) {
            mnaBuilder.matrix.setElement(currentVarIndex, nodeIndex2, -1);
        }
        
        mnaBuilder.matrix.setElement(currentVarIndex, currentVarIndex, -this.equivalentResistance);
        mnaBuilder.rhs.setElement(currentVarIndex, -this.historyVoltageSource);
        
        // 電流方程: KCL
        if (nodeIndex1 >= 0) {
            mnaBuilder.matrix.setElement(nodeIndex1, currentVarIndex, 1);
        }
        if (nodeIndex2 >= 0) {
            mnaBuilder.matrix.setElement(nodeIndex2, currentVarIndex, -1);
        }
    }

    // 為了兼容性保留的屬性和方法
    get type() { return 'L'; }
    needsCurrentVariable() { return true; }
}

/**
 * 梯形法測試函數
 */
export async function testTrapezoidalMethod() {
    console.log("=== 梯形積分法測試 ===");
    
    // 這裡可以添加具體的測試邏輯
    // 比較梯形法和後向歐拉法的精度差異
    
    console.log("梯形法實現完成，準備進行精度對比測試...");
}