/**
 * 電容元件模型 v2.0 - 自適應步長版
 * 實現線性電容的所有功能，包括暫態分析的伴隨模型和LTE計算
 * 🔥 新增支持自適應步長控制和本地截斷誤差估算
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
        
        // 🔥 新增: 儲存導數歷史，用於 LTE 計算
        this.previous_dvdt = 0;
        this.integrationMethod = 'trapezoidal'; // 預設使用梯形法
        this.currentTimeStep = 0;
        
        // 伴隨模型參數
        this.equivalentConductance = 0;
        this.historyCurrentSource = 0;
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

    /**
     * 計算電容電流 i = C * dv/dt
     * @param {number} currentVoltage 當前電壓
     * @param {number} previousVoltage 上一步電壓  
     * @param {number} h 時間步長
     * @returns {number} 電流 (安培)
     */
    getCurrent(currentVoltage, previousVoltage, h) {
        if (h <= 0) return 0; // DC 或無效步長
        const C = this.getCapacitance();
        
        if (this.integrationMethod === 'trapezoidal') {
            // 梯形法電流計算: i = C * (v_n - v_{n-1}) / h
            return C * (currentVoltage - previousVoltage) / h;
        } else {
            // 後向歐拉法
            return C * (currentVoltage - previousVoltage) / h;
        }
    }

    /**
     * 🔥 新增: 計算本地截斷誤差 (LTE)
     * 使用二階導數的近似來估算梯形法產生的誤差
     * LTE ≈ (h^3 / 12) * d³v/dt³ ≈ (h/6) * (dv/dt_n - dv/dt_{n-1})
     * @param {number} h 當前時間步長
     * @returns {number} 估算的電壓誤差
     */
    calculateLTE(h) {
        if (h <= 0) return 0;
        
        // 獲取當前和前一個電壓值
        const currentVoltage = this.previousValues.get('voltage') || this.ic || 0;
        const previousVoltage = this.previousValues.get('voltage_prev') || this.ic || 0;
        
        // 如果沒有歷史數據，返回較小的誤差
        if (this.previous_dvdt === 0 || this.previous_dvdt === undefined) return 1e-12;
        
        // 計算當前時間步的電壓導數
        const current_dvdt = (currentVoltage - previousVoltage) / h;
        
        // 估算 LTE (梯形法的誤差公式)
        // 對於電容器，我們關心的是電壓誤差
        const lte = (h / 6.0) * Math.abs(current_dvdt - this.previous_dvdt);
        
        return isNaN(lte) ? 1e-12 : lte;
    }

    /**
     * 更新伴隨模型 (用於暫態分析)
     * 🔥 v2.0 修改: 支持可變步長和不同積分方法
     * @param {number} h 當前時間步長
     */
    updateCompanionModel(h) {
        if (!h || h <= 0) {
            return; // DC分析或無效步長
        }

        const C = this.getCapacitance();
        this.currentTimeStep = h;
        
        if (this.integrationMethod === 'trapezoidal') {
            // 梯形法伴隨模型: Geq = 2*C/h, Ieq = (2*C/h)*v_{n-1} + i_{n-1}
            const Geq = 2 * C / h;
            const previousVoltage = this.previousValues.get('voltage') || this.ic || 0;
            const previousCurrent = this.previousValues.get('current') || 0;
            const Ieq = Geq * previousVoltage + previousCurrent;
            
            this.equivalentConductance = Geq;
            this.historyCurrentSource = Ieq;
        } else {
            // 後向歐拉法 (向後兼容)
            this.equivalentConductance = C / h;
            const previousVoltage = this.previousValues.get('voltage') || this.ic || 0;
            this.historyCurrentSource = this.equivalentConductance * previousVoltage;
        }
    }

    /**
     * 更新元件歷史狀態 (當一個時間步被接受後調用)
     * 🔥 v2.0 修改: 添加步長參數和導數歷史更新
     * @param {Map<string, number>} nodeVoltages 節點電壓
     * @param {Map<string, number>} branchCurrents 支路電流
     * @param {number} h 當前時間步長
     */
    updateHistory(nodeVoltages, branchCurrents, h) {
        const voltage = this.getVoltage(nodeVoltages);
        const previousVoltage = this.previousValues.get('voltage') || this.ic || 0;
        
        // 更新並儲存當前的導數和狀態值
        this.previous_dvdt = (h > 0) ? (voltage - previousVoltage) / h : 0;
        this.previousValues.set('voltage', voltage);

        const current = this.getCurrent(voltage, previousVoltage, h);
        this.previousValues.set('current', current);
        
        this.operatingPoint.voltage = voltage;
        this.operatingPoint.current = current;
        this.operatingPoint.power = voltage * current;
        
        // 調用父類的歷史更新
        super.updateHistory(nodeVoltages, branchCurrents);
    }

    /**
     * MNA矩陣印花 (用於暫態分析)
     */
    stamp(matrix, rhs, nodeMap, voltageSourceMap, time) {
        const n1Index = nodeMap.get(this.nodes[0]);
        const n2Index = nodeMap.get(this.nodes[1]);
        
        if (n1Index !== undefined) {
            matrix.addAt(n1Index, n1Index, this.equivalentConductance);
            rhs.addAt(n1Index, this.historyCurrentSource);
            
            if (n2Index !== undefined) {
                matrix.addAt(n1Index, n2Index, -this.equivalentConductance);
                matrix.addAt(n2Index, n1Index, -this.equivalentConductance);
                matrix.addAt(n2Index, n2Index, this.equivalentConductance);
                rhs.addAt(n2Index, -this.historyCurrentSource);
            }
        }
    }

    /**
     * 初始化暫態分析
     * @param {number} timeStep 時間步長
     * @param {string} method 積分方法
     */
    initTransient(timeStep, method = 'trapezoidal') {
        this.timeStep = timeStep;
        this.integrationMethod = method;
        this.previousValues.set('voltage', this.ic || 0);
        this.previousValues.set('current', 0);
        this.previous_dvdt = 0;
        
        // 初始化伴隨模型
        this.updateCompanionModel(timeStep);
    }

    /**
     * 獲取電容器電壓
     * @param {Map<string, number>} nodeVoltages 節點電壓
     * @returns {number} 電容器兩端電壓
     */
    getVoltage(nodeVoltages) {
        const v1 = nodeVoltages.get(this.nodes[0]) || 0;
        const v2 = nodeVoltages.get(this.nodes[1]) || 0;
        return v1 - v2;
    }

    /**
     * 計算儲存的能量
     * @param {Map<string, number>} nodeVoltages 節點電壓
     * @returns {number} 儲存能量 (焦耳)
     */
    getStoredEnergy(nodeVoltages) {
        const voltage = this.getVoltage(nodeVoltages);
        const C = this.getCapacitance();
        return 0.5 * C * voltage * voltage;
    }

    /**
     * 檢查是否超過額定電壓
     * @param {Map<string, number>} nodeVoltages 節點電壓
     * @returns {boolean} 是否超壓
     */
    isOverVoltage(nodeVoltages) {
        const voltage = Math.abs(this.getVoltage(nodeVoltages));
        return voltage > this.voltageRating;
    }

    /**
     * 獲取電容器詳細資訊
     */
    getInfo(nodeVoltages = null) {
        const info = {
            ...super.toJSON(),
            actualCapacitance: this.getCapacitance(),
            ic: this.ic,
            integrationMethod: this.integrationMethod,
            currentTimeStep: this.currentTimeStep,
            previousDvdt: this.previous_dvdt,
            equivalentConductance: this.equivalentConductance,
            historyCurrentSource: this.historyCurrentSource,
            operatingPoint: { ...this.operatingPoint }
        };
        
        if (nodeVoltages) {
            info.storedEnergy = this.getStoredEnergy(nodeVoltages);
            info.overVoltage = this.isOverVoltage(nodeVoltages);
        }
        
        return info;
    }

    /**
     * 驗證電容器參數
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
        
        return `${this.name}: ${capacitanceStr} (${this.nodes[0]} → ${this.nodes[1]}) [${this.integrationMethod}]`;
    }
}