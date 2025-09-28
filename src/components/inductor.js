/**
 * 電感元件模型
 * 實現線性電感的所有功能，包括暫態分析的伴隨模型
 */

import { LinearTwoTerminal } from './base.js';

export class Inductor extends LinearTwoTerminal {
    /**
     * @param {string} name 電感名稱 (如 'L1')
     * @param {string[]} nodes 連接節點 [n1, n2]
     * @param {number|string} inductance 電感值 (亨利)
     * @param {Object} params 額外參數
     */
    constructor(name, nodes, inductance, params = {}) {
        super(name, 'L', nodes, inductance, params);
        
        // 電感特定參數
        this.ic = params.ic || 0;        // 初始電流 (A)
        this.resistance = params.r || 0; // 寄生電阻 (Ω)
        this.tc1 = params.tc1 || 0;      // 一次溫度係數
        this.tc2 = params.tc2 || 0;      // 二次溫度係數
        this.tnom = params.tnom || 27;   // 標稱溫度 (°C)
        this.currentRating = params.current || Infinity; // 額定電流 (A)
        
        // 暫態分析相關
        this.equivalentResistance = 0;   // 等效電阻 R_eq = L/h
        this.historyVoltageSource = 0;   // 歷史電壓源 V_hist
        
        // 電感需要電流變數
        this.needsCurrentVar = true;
        
        // 🔥 新增：用於儲存耦合資訊
        this.couplings = null;
        
        // 計算溫度修正後的電感值
        this.updateTemperatureCoefficient();
    }

    /**
     * 根據溫度更新電感值
     */
    updateTemperatureCoefficient() {
        const deltaT = this.temperature - this.tnom;
        const tempFactor = 1 + this.tc1 * deltaT + this.tc2 * deltaT * deltaT;
        this.actualValue = this.value * tempFactor;
    }

    /**
     * 獲取當前工作溫度下的電感值
     * @returns {number} 實際電感值 (亨利)
     */
    getInductance() {
        return this.actualValue || this.value;
    }

    /**
     * 檢查此元件是否需要額外的電流變數
     * @returns {boolean}
     */
    needsCurrentVariable() {
        return true;
    }

    /**
     * 初始化暫態分析
     * @param {number} timeStep 時間步長
     */
    initTransient(timeStep) {
        super.initTransient(timeStep);
        
        const L = this.getInductance();
        this.equivalentResistance = L / timeStep;
        
        // 初始條件：設置初始電流
        this.previousValues.set('current', this.ic);
        this.historyVoltageSource = this.equivalentResistance * this.ic;
    }

    /**
     * 計算伴隨模型的歷史項
     * 電感的伴隨模型：v_L(t) = R_eq * i(t) + V_hist
     * 其中 R_eq = L/h, V_hist = R_eq * i(t-h)
     */
    updateCompanionModel() {
        if (!this.timeStep) return;
        
        const previousCurrent = this.previousValues.get('current') || 0;
        this.historyVoltageSource = this.equivalentResistance * previousCurrent;
        this.historyTerm = previousCurrent; // 用於MNA矩陣
    }

    /**
     * 計算電感電壓 v = L * di/dt
     * @param {number} current 當前電流
     * @returns {number} 電壓 (伏特)
     */
    getVoltageFromCurrent(current) {
        if (!this.timeStep) {
            // DC分析：電感視為短路 (忽略寄生電阻)
            return current * this.resistance;
        }
        
        const previousCurrent = this.previousValues.get('current') || 0;
        const L = this.getInductance();
        
        // 數值微分：v = L * (i(t) - i(t-h)) / h + R * i(t)
        const diDt = (current - previousCurrent) / this.timeStep;
        const voltage = L * diDt + this.resistance * current;
        
        this.operatingPoint.current = current;
        this.operatingPoint.voltage = voltage;
        
        return voltage;
    }

    /**
     * 計算存儲的磁能 E = 0.5 * L * I²
     * @param {number} current 電流
     * @returns {number} 能量 (焦耳)
     */
    getStoredEnergy(current) {
        const L = this.getInductance();
        return 0.5 * L * current * current;
    }

    /**
     * 更新歷史狀態
     * @param {Map<string, number>} nodeVoltages 節點電壓
     * @param {Map<string, number>} branchCurrents 支路電流
     */
    updateHistory(nodeVoltages, branchCurrents) {
        super.updateHistory(nodeVoltages, branchCurrents);
        
        const current = branchCurrents.get(this.name) || 0;
        const voltage = this.getVoltageFromCurrent(current);
        
        // 🔥 關鍵修正：先為下一個時間步準備伴隨模型（基於當前歷史值）
        this.updateCompanionModel();
        
        // 然後更新歷史值為當前值
        this.previousValues.set('current', current);
        this.previousValues.set('voltage', voltage);
        
        // 計算功耗 (理想電感功耗為0，但可能有寄生電阻)
        this.operatingPoint.power = voltage * current;
    }

    /**
     * 檢查是否超過電流額定值
     * @param {number} current 電流
     * @returns {boolean} 如果超過額定電流返回true
     */
    isOverCurrent(current) {
        return Math.abs(current) > this.currentRating;
    }

    /**
     * 獲取電感器資訊
     * @param {number} current 當前電流
     * @returns {Object} 詳細信息
     */
    getInfo(current = null) {
        const info = {
            ...super.toJSON(),
            actualInductance: this.getInductance(),
            ic: this.ic,
            resistance: this.resistance,
            tc1: this.tc1,
            tc2: this.tc2,
            currentRating: this.currentRating,
            operatingPoint: { ...this.operatingPoint }
        };
        
        if (current !== null) {
            info.storedEnergy = this.getStoredEnergy(current);
            info.overCurrent = this.isOverCurrent(current);
        }
        
        if (this.timeStep) {
            info.equivalentResistance = this.equivalentResistance;
            info.historyVoltageSource = this.historyVoltageSource;
        }
        
        return info;
    }

    /**
     * 驗證電感器參數
     * @returns {boolean}
     */
    isValid() {
        return super.isValid() && this.value > 0;
    }

    toString() {
        const inductance = this.getInductance();
        let inductanceStr;
        
        // 格式化電感值顯示
        if (inductance >= 1) {
            inductanceStr = `${inductance.toFixed(3)}H`;
        } else if (inductance >= 1e-3) {
            inductanceStr = `${(inductance * 1e3).toFixed(2)}mH`;
        } else if (inductance >= 1e-6) {
            inductanceStr = `${(inductance * 1e6).toFixed(2)}µH`;
        } else if (inductance >= 1e-9) {
            inductanceStr = `${(inductance * 1e9).toFixed(2)}nH`;
        } else {
            inductanceStr = `${inductance.toExponential(2)}H`;
        }
        
        let result = `${this.name}: ${this.nodes[0]}-${this.nodes[1]} ${inductanceStr}`;
        
        if (this.resistance > 0) {
            result += ` R=${this.resistance}Ω`;
        }
        
        if (this.ic !== 0) {
            result += ` IC=${this.ic}A`;
        }
        
        return result;
    }
}

/**
 * 耦合電感 (變壓器) 模型
 */
export class CoupledInductor {
    /**
     * @param {string} name 耦合電感名稱
     * @param {Inductor} L1 第一個電感
     * @param {Inductor} L2 第二個電感  
     * @param {number} couplingFactor 耦合係數 k (0 < k ≤ 1)
     * @param {Object} params 額外參數
     */
    constructor(name, L1, L2, couplingFactor, params = {}) {
        this.name = name;
        this.type = 'K';
        this.L1 = L1;
        this.L2 = L2;
        this.k = Math.max(0, Math.min(1, couplingFactor)); // 限制在0-1範圍
        this.params = params;
        
        // 計算互感 M = k * sqrt(L1 * L2)
        this.mutualInductance = this.k * Math.sqrt(L1.getInductance() * L2.getInductance());
        
        // 極性 (dot convention)
        this.dotNodes = params.dotNodes || [L1.nodes[0], L2.nodes[0]];
    }

    /**
     * 獲取互感值
     * @returns {number} 互感 (亨利)
     */
    getMutualInductance() {
        // 重新計算，因為電感值可能改變
        return this.k * Math.sqrt(this.L1.getInductance() * this.L2.getInductance());
    }

    /**
     * 獲取耦合電感資訊
     * @returns {Object} 詳細信息
     */
    getInfo() {
        return {
            name: this.name,
            type: this.type,
            L1: this.L1.name,
            L2: this.L2.name,
            couplingFactor: this.k,
            mutualInductance: this.getMutualInductance(),
            dotNodes: this.dotNodes,
            L1_inductance: this.L1.getInductance(),
            L2_inductance: this.L2.getInductance()
        };
    }

    toString() {
        const M = this.getMutualInductance();
        return `${this.name}: ${this.L1.name}-${this.L2.name} k=${this.k} M=${(M * 1e6).toFixed(2)}µH`;
    }
}

/**
 * 可變電感 (可調電感或電感器) 模型
 */
export class VariableInductor extends Inductor {
    /**
     * @param {string} name 可變電感名稱
     * @param {string[]} nodes 連接節點 [n1, n2]
     * @param {number} minInductance 最小電感值
     * @param {number} maxInductance 最大電感值
     * @param {number} controlValue 控制值 (0-1)
     * @param {Object} params 額外參數
     */
    constructor(name, nodes, minInductance, maxInductance, controlValue = 0.5, params = {}) {
        const averageInductance = (minInductance + maxInductance) / 2;
        super(name, nodes, averageInductance, params);
        
        this.type = 'VIND';
        this.minInductance = minInductance;
        this.maxInductance = maxInductance;
        this.controlValue = Math.max(0, Math.min(1, controlValue)); // 限制在0-1範圍
    }

    /**
     * 根據控制值計算當前電感值
     * @returns {number} 當前電感值
     */
    getInductance() {
        const baseInductance = this.minInductance + 
            this.controlValue * (this.maxInductance - this.minInductance);
        
        // 應用溫度係數
        const deltaT = this.temperature - this.tnom;
        const tempFactor = 1 + this.tc1 * deltaT + this.tc2 * deltaT * deltaT;
        
        return baseInductance * tempFactor;
    }

    /**
     * 設置控制值
     * @param {number} value 控制值 (0-1)
     */
    setControlValue(value) {
        this.controlValue = Math.max(0, Math.min(1, value));
    }

    toString() {
        const inductance = this.getInductance();
        const minInd = this.minInductance * 1e6;
        const maxInd = this.maxInductance * 1e6;
        const currentInd = inductance * 1e6;
        
        return `${this.name}: ${this.nodes[0]}-${this.nodes[1]} ${currentInd.toFixed(2)}µH (${minInd.toFixed(0)}-${maxInd.toFixed(0)}µH, ctrl=${(this.controlValue * 100).toFixed(1)}%)`;
    }
}