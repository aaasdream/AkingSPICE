/**
 * 電容元件模型
 * 實現線性電容的所有功能，包括暫態分析的伴隨模型
 */

import { LinearTwoTerminal } from './base.js';

export class Capacitor extends LinearTwoTerminal {
    /**
     * @param {string} name 電容名稱 (如 'C1')
     * @param {string[]} nodes 連接節點 [n1, n2]
     * @param {number|string} capacitance 電容值 (法拉)
     * @param {Object} params 額外參數
     */
    constructor(name, nodes, capacitance, params = {}) {
        super(name, 'C', nodes, capacitance, params);
        
        // 電容特定參數
        this.ic = params.ic || 0;        // 初始電壓 (V)
        this.tc1 = params.tc1 || 0;      // 一次溫度係數
        this.tc2 = params.tc2 || 0;      // 二次溫度係數
        this.tnom = params.tnom || 27;   // 標稱溫度 (°C)
        this.voltageRating = params.voltage || Infinity; // 額定電壓 (V)
        
        // 計算溫度修正後的電容值
        this.updateTemperatureCoefficient();
        
        // 顯式方法相關 - 電容被視為電壓源
        this.largeAdmittance = 1e3;  // 降低大導納以避免數值問題（從1e6降到1e3）
    }

    /**
     * 根據溫度更新電容值
     */
    updateTemperatureCoefficient() {
        const deltaT = this.temperature - this.tnom;
        const tempFactor = 1 + this.tc1 * deltaT + this.tc2 * deltaT * deltaT;
        this.actualValue = this.value * tempFactor;
    }

    /**
     * 獲取當前工作溫度下的電容值
     * @returns {number} 實際電容值 (法拉)
     */
    getCapacitance() {
        return this.actualValue || this.value;
    }

    // ==================== 顯式狀態更新法接口 ====================
    
    /**
     * 電容預處理 - 註冊為狀態變量並添加到G矩陣
     * 在顯式方法中，電容被建模為理想電壓源 (值 = Vc(t))
     * @param {CircuitPreprocessor} preprocessor 預處理器
     */
    preprocess(preprocessor) {
        // 獲取節點索引
        this.node1Idx = preprocessor.getNodeIndex(this.nodes[0]);
        this.node2Idx = preprocessor.getNodeIndex(this.nodes[1]);
        
        // 註冊為狀態變量 (電壓類型)
        // 這將在 identifyStateVariables 階段完成，這裡只記錄索引
        this.componentData = {
            node1: this.node1Idx,
            node2: this.node2Idx,
            capacitance: this.getCapacitance(),
            initialVoltage: this.ic
        };
        
        // 電容被建模為理想電壓源，使用大導納近似
        // 這會在G矩陣中添加: G[i,i] += G_large, G[j,j] += G_large, G[i,j] -= G_large, G[j,i] -= G_large
        if (this.node1Idx >= 0) {
            preprocessor.addConductance(this.node1Idx, this.node1Idx, this.largeAdmittance);
            if (this.node2Idx >= 0) {
                preprocessor.addConductance(this.node1Idx, this.node2Idx, -this.largeAdmittance);
            }
        }
        
        if (this.node2Idx >= 0) {
            preprocessor.addConductance(this.node2Idx, this.node2Idx, this.largeAdmittance);
            if (this.node1Idx >= 0) {
                preprocessor.addConductance(this.node2Idx, this.node1Idx, -this.largeAdmittance);
            }
        }
    }

    /**
     * 更新RHS向量 - 電容作為電壓源的貢獻
     * 電容電壓源方程: V_node1 - V_node2 = Vc(t)
     * 轉換為電流源: I = G_large * Vc(t)
     * @param {Float32Array} rhsVector RHS向量
     * @param {Float32Array} stateVector 狀態向量 [Vc1, Vc2, ...]
     * @param {number} time 當前時間
     * @param {object} componentData 組件數據
     */
    updateRHS(rhsVector, stateVector, time, componentData) {
        if (!componentData) return;
        
        // 獲取當前電容電壓 (狀態變量)
        const stateIndex = componentData.stateIndex;
        if (stateIndex === undefined || !stateVector) return;
        
        const currentVc = stateVector[stateIndex] || 0;
        
        // 電壓源的等效電流源貢獻: I = G_large * Vc
        const currentContribution = this.largeAdmittance * currentVc;
        
        // 添加到RHS: I流入正端，流出負端
        if (this.node1Idx >= 0) {
            rhsVector[this.node1Idx] += currentContribution;
        }
        if (this.node2Idx >= 0) {
            rhsVector[this.node2Idx] -= currentContribution;
        }
    }

    /**
     * 更新電容狀態變數 - 顯式積分法
     * 計算 dVc/dt = Ic/C 並更新電容電壓
     * @param {Map} nodeVoltageMap 節點電壓映射
     * @param {Float32Array} solutionVector 解向量
     * @param {number} dt 時間步長
     * @param {number} currentTime 當前時間
     * @param {Map} nodeMap 節點映射
     * @param {Matrix} gMatrix G矩陣
     */
    updateState(nodeVoltageMap, solutionVector, dt, currentTime, nodeMap, gMatrix) {
        // 由於顯式求解器的調用約定與我們需要的不一致，
        // 電容的狀態更新由求解器的備用路徑處理。
        // 這個方法只是為了標記電容有updateState能力，實際不做任何事情。
    }

    /**
     * 計算電容電流 i = C * dv/dt
     * @param {Map<string, number>} nodeVoltages 節點電壓
     * @returns {number} 電流 (安培)，正值表示從n1流向n2
     */
    getCurrent(nodeVoltages) {
        const currentVoltage = this.getVoltage(nodeVoltages);
        
        if (!this.timeStep) {
            // DC分析：電容視為開路
            this.operatingPoint.current = 0;
            return 0;
        }
        
        const previousVoltage = this.previousValues.get('voltage') || 0;
        const previousCurrent = this.previousValues.get('current') || 0;
        const C = this.getCapacitance();
        
        let current;
        if (this.integrationMethod === 'trapezoidal') {
            // 梯形法：i_n = 2C/h * (v_n - v_n-1) - i_n-1
            current = (2 * C / this.timeStep) * (currentVoltage - previousVoltage) - previousCurrent;
        } else {
            // 後向歐拉法：i = C * (v(t) - v(t-h)) / h
            current = C * (currentVoltage - previousVoltage) / this.timeStep;
        }
        
        this.operatingPoint.current = current;
        return current;
    }

    /**
     * 計算存儲的能量 E = 0.5 * C * V²
     * @param {Map<string, number>} nodeVoltages 節點電壓
     * @returns {number} 能量 (焦耳)
     */
    getStoredEnergy(nodeVoltages) {
        const voltage = this.getVoltage(nodeVoltages);
        const C = this.getCapacitance();
        return 0.5 * C * voltage * voltage;
    }

    /**
     * 更新歷史狀態
     * @param {Map<string, number>} nodeVoltages 節點電壓
     * @param {Map<string, number>} branchCurrents 支路電流
     */
    updateHistory(nodeVoltages, branchCurrents) {
        super.updateHistory(nodeVoltages, branchCurrents);
        
        const voltage = this.getVoltage(nodeVoltages);
        const current = this.getCurrent(nodeVoltages);
        
        // 🔥 關鍵修正：先為下一個時間步準備伴隨模型（基於當前歷史值）
        this.updateCompanionModel();
        
        // 然後更新歷史值為當前值
        this.previousValues.set('voltage', voltage);
        this.previousValues.set('current', current);
        
        // 計算功耗 (對理想電容應該為0，但實際中可能有數值誤差)
        this.operatingPoint.power = voltage * current;
    }

    /**
     * 檢查是否超過電壓額定值
     * @param {Map<string, number>} nodeVoltages 節點電壓
     * @returns {boolean} 如果超過額定電壓返回true
     */
    isOverVoltage(nodeVoltages) {
        const voltage = Math.abs(this.getVoltage(nodeVoltages));
        return voltage > this.voltageRating;
    }

    /**
     * 獲取電容器資訊
     * @param {Map<string, number>} nodeVoltages 節點電壓
     * @returns {Object} 詳細信息
     */
    getInfo(nodeVoltages = null) {
        const info = {
            ...super.toJSON(),
            actualCapacitance: this.getCapacitance(),
            ic: this.ic,
            tc1: this.tc1,
            tc2: this.tc2,
            voltageRating: this.voltageRating,
            operatingPoint: { ...this.operatingPoint }
        };
        
        if (nodeVoltages) {
            info.storedEnergy = this.getStoredEnergy(nodeVoltages);
            info.overVoltage = this.isOverVoltage(nodeVoltages);
        }
        
        if (this.timeStep) {
            info.equivalentConductance = this.equivalentConductance;
            info.historyCurrentSource = this.historyCurrentSource;
        }
        
        return info;
    }

    /**
     * 驗證電容器參數
     * @returns {boolean}
     */
    isValid() {
        return super.isValid() && this.value > 0;
    }

    toString() {
        const capacitance = this.getCapacitance();
        let capacitanceStr;
        
        // 格式化電容值顯示
        if (capacitance >= 1e-3) {
            capacitanceStr = `${(capacitance * 1e3).toFixed(2)}mF`;
        } else if (capacitance >= 1e-6) {
            capacitanceStr = `${(capacitance * 1e6).toFixed(2)}µF`;
        } else if (capacitance >= 1e-9) {
            capacitanceStr = `${(capacitance * 1e9).toFixed(2)}nF`;
        } else if (capacitance >= 1e-12) {
            capacitanceStr = `${(capacitance * 1e12).toFixed(2)}pF`;
        } else {
            capacitanceStr = `${capacitance.toExponential(2)}F`;
        }
        
        let result = `${this.name}: ${this.nodes[0]}-${this.nodes[1]} ${capacitanceStr}`;
        if (this.ic !== 0) {
            result += ` IC=${this.ic}V`;
        }
        return result;
    }
}

/**
 * 可變電容 (變容二極體或可調電容) 模型
 */
export class VariableCapacitor extends Capacitor {
    /**
     * @param {string} name 可變電容名稱
     * @param {string[]} nodes 連接節點 [n1, n2]
     * @param {number} minCapacitance 最小電容值
     * @param {number} maxCapacitance 最大電容值
     * @param {number} controlValue 控制值 (0-1 或電壓值)
     * @param {Object} params 額外參數
     */
    constructor(name, nodes, minCapacitance, maxCapacitance, controlValue = 0.5, params = {}) {
        const averageCapacitance = (minCapacitance + maxCapacitance) / 2;
        super(name, nodes, averageCapacitance, params);
        
        this.type = 'VCAP';
        this.minCapacitance = minCapacitance;
        this.maxCapacitance = maxCapacitance;
        this.controlValue = controlValue;
        this.controlType = params.controlType || 'linear'; // 'linear' 或 'voltage'
    }

    /**
     * 根據控制值計算當前電容值
     * @returns {number} 當前電容值
     */
    getCapacitance() {
        let ratio;
        
        if (this.controlType === 'voltage') {
            // 基於電壓的控制 (如變容二極體)
            const Vj = this.controlValue; // 反向偏壓
            const C0 = this.maxCapacitance; // 零偏壓時的電容
            const Vbi = 0.7; // 內建電位 (V)
            const m = 0.5; // 分級係數
            
            // 變容二極體方程式: C = C0 / (1 - Vj/Vbi)^m
            if (Vj < Vbi) {
                ratio = C0 / Math.pow(1 - Vj/Vbi, m);
                ratio = Math.max(this.minCapacitance, Math.min(this.maxCapacitance, ratio));
            } else {
                ratio = this.minCapacitance;
            }
        } else {
            // 線性控制 (如可調電容)
            const normalizedControl = Math.max(0, Math.min(1, this.controlValue));
            ratio = this.minCapacitance + normalizedControl * (this.maxCapacitance - this.minCapacitance);
        }
        
        // 應用溫度係數
        const deltaT = this.temperature - this.tnom;
        const tempFactor = 1 + this.tc1 * deltaT + this.tc2 * deltaT * deltaT;
        
        return ratio * tempFactor;
    }

    /**
     * 設置控制值
     * @param {number} value 控制值
     */
    setControlValue(value) {
        this.controlValue = value;
    }

    toString() {
        const capacitance = this.getCapacitance();
        const minCap = this.minCapacitance * 1e12;
        const maxCap = this.maxCapacitance * 1e12;
        const currentCap = capacitance * 1e12;
        
        return `${this.name}: ${this.nodes[0]}-${this.nodes[1]} ${currentCap.toFixed(2)}pF (${minCap.toFixed(0)}-${maxCap.toFixed(0)}pF, ctrl=${this.controlValue})`;
    }
}