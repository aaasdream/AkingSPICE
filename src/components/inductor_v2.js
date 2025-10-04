/**
 * 電感元件模型 v2.0 - 自適應步長版
 * 實現線性電感的所有功能，包括暫態分析的伴隨模型和LTE計算
 * 🔥 新增支持自適應步長控制和本地截斷誤差估算
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
        
        // 互感相關
        this.coupledInductors = new Map(); // 耦合電感 (名稱 -> 互感係數)
        
        // 🔥 新增: 儲存導數歷史，用於 LTE 計算
        this.previous_didt = 0;
        this.integrationMethod = 'trapezoidal'; // 預設使用梯形法
        this.currentTimeStep = 0;
        
        // 伴隨模型參數 (電感需要電流變數)
        this.equivalentResistance = 0;
        this.equivalentVoltageSource = 0;
        this.needsCurrentVar = true; // 電感需要電流變數
        
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
     * 電感是否需要電流變數
     * @returns {boolean} 總是返回 true
     */
    needsCurrentVariable() {
        return true;
    }

    /**
     * 🔥 新增: 計算本地截斷誤差 (LTE)
     * 使用二階導數的近似來估算梯形法產生的電流誤差
     * LTE ≈ (h^3 / 12) * d³i/dt³ ≈ (h/6) * (di/dt_n - di/dt_{n-1})
     * @param {number} currentCurrent 當前計算出的電流
     * @param {number} h 當前時間步長
     * @returns {number} 估算的電流誤差
     */
    calculateLTE(h) {
        if (h <= 0) return 0;
        
        // 獲取當前和前一個電流值
        const currentCurrent = this.previousValues.get('current') || this.ic || 0;
        const previousCurrent = this.previousValues.get('current_prev') || this.ic || 0;
        
        // 如果沒有歷史數據，返回較小的誤差
        if (this.previous_didt === 0 || this.previous_didt === undefined) return 1e-12;

        // 計算當前時間步的電流導數
        const current_didt = (currentCurrent - previousCurrent) / h;

        // 估算 LTE (梯形法的誤差公式)
        // 對於電感器，我們關心的是電流誤差
        const lte = (h / 6.0) * Math.abs(current_didt - this.previous_didt);

        return isNaN(lte) ? 1e-12 : lte;
    }

    /**
     * 計算電感電壓 v = L * di/dt
     * @param {number} currentCurrent 當前電流
     * @param {number} previousCurrent 上一步電流
     * @param {number} h 時間步長
     * @returns {number} 電壓 (伏特)
     */
    getVoltage(currentCurrent, previousCurrent, h) {
        if (h <= 0) return 0; // DC 或無效步長
        const L = this.getInductance();
        
        if (this.integrationMethod === 'trapezoidal') {
            // 梯形法電壓計算: v = L * (i_n - i_{n-1}) / h + R * i_n
            return L * (currentCurrent - previousCurrent) / h + this.resistance * currentCurrent;
        } else {
            // 後向歐拉法
            return L * (currentCurrent - previousCurrent) / h + this.resistance * currentCurrent;
        }
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

        const L = this.getInductance();
        this.currentTimeStep = h;
        
        if (this.integrationMethod === 'trapezoidal') {
            // 梯形法伴隨模型:
            // v_n = Req * i_n + Veq
            // Req = 2L/h + R_parasitic
            // Veq = - ( (2L/h)*i_{n-1} + v_{n-1} )
            const Req = (2 * L / h) + this.resistance;
            const previousCurrent = this.previousValues.get('current') || this.ic || 0;
            const previousVoltage = this.previousValues.get('voltage') || 0;
            const Veq = -((2 * L / h) * previousCurrent + previousVoltage);

            this.equivalentResistance = Req;
            this.equivalentVoltageSource = Veq;
        } else {
            // 後向歐拉法 (向後兼容)
            // v_n = (L/h + R) * i_n - (L/h) * i_{n-1}
            const Req = (L / h) + this.resistance;
            const previousCurrent = this.previousValues.get('current') || this.ic || 0;
            const Veq = -(L / h) * previousCurrent;

            this.equivalentResistance = Req;
            this.equivalentVoltageSource = Veq;
        }
    }

    /**
     * 更新元件歷史狀態 (當一個時間步被接受後調用)
     * 🔥 v2.0 修改: 添加步長參數和導數歷史更新
     * @param {Map<string, number>} nodeVoltages 節點電壓
     * @param {Map<string, number>} branchCurrents 支路電流
     * @param {string} currentVarName 電流變數的名稱 (例如 'L1')
     * @param {number} h 當前時間步長
     */
    updateHistory(nodeVoltages, branchCurrents, currentVarName, h) {
        const current = branchCurrents.get(currentVarName || this.name) || 0;
        const previousCurrent = this.previousValues.get('current') || this.ic || 0;

        // 更新並儲存當前的導數和狀態值
        this.previous_didt = (h > 0) ? (current - previousCurrent) / h : 0;
        this.previousValues.set('current', current);
        
        const voltage = this.getVoltage(nodeVoltages);
        this.previousValues.set('voltage', voltage);

        this.operatingPoint.current = current;
        this.operatingPoint.voltage = voltage;
        this.operatingPoint.power = voltage * current;
        
        // 調用父類的歷史更新
        super.updateHistory(nodeVoltages, branchCurrents);
    }

    /**
     * 獲取電感器兩端電壓
     * @param {Map<string, number>} nodeVoltages 節點電壓
     * @returns {number} 電感器兩端電壓
     */
    getVoltage(nodeVoltages) {
        const v1 = nodeVoltages.get(this.nodes[0]) || 0;
        const v2 = nodeVoltages.get(this.nodes[1]) || 0;
        return v1 - v2;
    }

    /**
     * 添加耦合電感
     * @param {string} inductorName 耦合電感名稱
     * @param {number} mutualInductance 互感係數 (亨利)
     */
    addCoupledInductor(inductorName, mutualInductance) {
        this.coupledInductors.set(inductorName, mutualInductance);
    }

    /**
     * 計算儲存的磁場能量
     * @param {number} current 電流值
     * @returns {number} 儲存能量 (焦耳)
     */
    getStoredEnergy(current) {
        const L = this.getInductance();
        return 0.5 * L * current * current;
    }

    /**
     * 檢查是否超過額定電流
     * @param {number} current 電流值
     * @returns {boolean} 是否過流
     */
    isOverCurrent(current) {
        return Math.abs(current) > this.currentRating;
    }

    /**
     * 初始化暫態分析
     * @param {number} timeStep 時間步長
     * @param {string} method 積分方法
     */
    initTransient(timeStep, method = 'trapezoidal') {
        this.timeStep = timeStep;
        this.integrationMethod = method;
        this.previousValues.set('current', this.ic || 0);
        this.previousValues.set('voltage', 0);
        this.previous_didt = 0;
        
        // 初始化伴隨模型
        this.updateCompanionModel(timeStep);
    }

    /**
     * MNA矩陣印花 (DC分析)
     */
    stampDC(matrix, rhs, nodeMap, voltageSourceMap) {
        // DC分析中，電感等效為短路 (零電阻)
        const n1Index = nodeMap.get(this.nodes[0]);
        const n2Index = nodeMap.get(this.nodes[1]);
        const currentIndex = voltageSourceMap.get(this.name);
        
        if (currentIndex !== undefined) {
            // 電壓約束: V(n1) - V(n2) = 0 (短路)
            if (n1Index !== undefined) {
                matrix.set(currentIndex, n1Index, 1);
                matrix.set(n1Index, currentIndex, 1);
            }
            if (n2Index !== undefined) {
                matrix.set(currentIndex, n2Index, -1);
                matrix.set(n2Index, currentIndex, -1);
            }
            // 電壓源值設為0 (短路)
            rhs.set(currentIndex, 0);
        }
    }

    /**
     * MNA矩陣印花 (暫態分析)
     */
    stamp(matrix, rhs, nodeMap, voltageSourceMap, time) {
        const n1Index = nodeMap.get(this.nodes[0]);
        const n2Index = nodeMap.get(this.nodes[1]);
        const currentIndex = voltageSourceMap.get(this.name);
        
        if (currentIndex !== undefined) {
            // 電感的伴隨模型: v = Req * i + Veq
            if (n1Index !== undefined) {
                matrix.set(currentIndex, n1Index, 1);
                matrix.set(n1Index, currentIndex, 1);
            }
            if (n2Index !== undefined) {
                matrix.set(currentIndex, n2Index, -1);
                matrix.set(n2Index, currentIndex, -1);
            }
            
            // 添加等效電阻和電壓源
            matrix.addAt(currentIndex, currentIndex, -this.equivalentResistance);
            rhs.addAt(currentIndex, this.equivalentVoltageSource);
        }
    }

    /**
     * 獲取電感器詳細資訊
     */
    getInfo(current = null) {
        const info = {
            ...super.toJSON(),
            actualInductance: this.getInductance(),
            ic: this.ic,
            resistance: this.resistance,
            integrationMethod: this.integrationMethod,
            currentTimeStep: this.currentTimeStep,
            previousDidt: this.previous_didt,
            equivalentResistance: this.equivalentResistance,
            equivalentVoltageSource: this.equivalentVoltageSource,
            coupledInductors: Object.fromEntries(this.coupledInductors),
            operatingPoint: { ...this.operatingPoint }
        };
        
        if (current !== null) {
            info.storedEnergy = this.getStoredEnergy(current);
            info.overCurrent = this.isOverCurrent(current);
        }
        
        return info;
    }

    /**
     * 驗證電感器參數
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
        
        const resistanceStr = this.resistance > 0 ? ` (R=${this.resistance}Ω)` : '';
        return `${this.name}: ${inductanceStr}${resistanceStr} (${this.nodes[0]} → ${this.nodes[1]}) [${this.integrationMethod}]`;
    }
}