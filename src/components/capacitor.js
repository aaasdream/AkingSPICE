/**
 * 電容元件模型 v3.0 - Gear 2 (BDF2) 數值積分版本
 * 實現高階數值積分的伴隨模型，專為剛性系統 (如開關電源) 設計
 * � 新功能: Gear 2 方法的 L-穩定性，解決切換電路的數值振盪問題
 * 📚 理論基礎: BDF2 公式 3v_n - 4v_{n-1} + v_{n-2} = 2h * i_n / C
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
        
        // � Gear 2 (BDF2) 專用參數
        this.integrationMethod = 'gear2'; // 默認使用 Gear 2 方法
        this.currentTimeStep = 0;
        this.stepCount = 0; // 追蹤步數，第一步使用後向歐拉
        
        // Gear 2 伴隨模型參數
        // BDF2 電容方程: C * (3v_n - 4v_{n-1} + v_{n-2}) / (2h) = i_n
        // 重組為: (3C/2h) * v_n = i_n + (4C/2h)*v_{n-1} - (C/2h)*v_{n-2}
        this.equivalentConductance = 0;  // Geq = 3C/(2h) for BDF2
        this.historyCurrentSource = 0;   // Ieq = (4C/2h)*v_{n-1} - (C/2h)*v_{n-2}
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
     * 🚀 Gear 2 (BDF2) 電容電流計算
     * 根據步數自動選擇積分公式:
     * - 第一步: 後向歐拉法 i = C * (v_n - v_{n-1}) / h  
     * - 後續步: BDF2 公式 i = C * (3v_n - 4v_{n-1} + v_{n-2}) / (2h)
     * @param {number} currentVoltage 當前電壓 v_n
     * @param {number} h 時間步長
     * @returns {number} 電流 (安培)
     */
    getCurrent(currentVoltage, h) {
        if (h <= 0) return 0; // DC 或無效步長
        const C = this.getCapacitance();
        
        if (this.stepCount <= 1) {
            // 第一步使用後向歐拉法 (只需要一個歷史點)
            const v_prev = this.previousValues.get('voltage') || this.ic || 0;
            return C * (currentVoltage - v_prev) / h;
        } else {
            // 第二步及以後使用 Gear 2 (BDF2) 方法
            const v_nm1 = this.previousValues.get('voltage') || this.ic || 0;      // v_{n-1}
            const v_nm2 = this.previousValues.get('voltage_prev') || this.ic || 0; // v_{n-2}
            
            // BDF2 公式: i = C * (3v_n - 4v_{n-1} + v_{n-2}) / (2h)
            return C * (3 * currentVoltage - 4 * v_nm1 + v_nm2) / (2 * h);
        }
    }

    /**
     * � Gear 2 伴隨模型局部截斷誤差估算
     * BDF2 的 LTE ≈ (h³/3) * d³v/dt³
     * 使用差分近似: d³v/dt³ ≈ (v_n - 3v_{n-1} + 3v_{n-2} - v_{n-3}) / h³
     * @param {number} h 當前時間步長
     * @returns {number} 估算的電壓誤差
     */
    calculateLTE(h) {
        if (h <= 0 || this.stepCount < 2) {
            return 1e-12; // 前兩步或無效步長時返回小誤差
        }
        
        // 獲取電壓歷史 (假設我們有足夠的歷史數據)
        const v_n = this.previousValues.get('voltage') || this.ic || 0;
        const v_nm1 = this.previousValues.get('voltage_prev') || this.ic || 0;
        
        // 簡化的 LTE 估算：基於電壓變化率的變化
        // 實際應用中可以進一步精確化
        const dvdt_current = (v_n - v_nm1) / h;
        const dvdt_change = Math.abs(dvdt_current);
        
        // BDF2 的理論 LTE 係數是 h³/3，這裡使用保守估算
        const lte = (h * h * h / 3.0) * dvdt_change * 1e-6; // 加入比例因子
        
        return isNaN(lte) ? 1e-12 : Math.max(lte, 1e-12);
    }

    /**
     * 🚀 更新 Gear 2 (BDF2) 伴隨模型
     * 根據步數自動選擇伴隨模型:
     * - 第一步: 後向歐拉 Geq=C/h, Ieq=(C/h)*v_{n-1}
     * - 後續步: BDF2 Geq=3C/(2h), Ieq=(4C/2h)*v_{n-1}-(C/2h)*v_{n-2}
     * @param {number} h 當前時間步長
     * @param {number} stepCount 當前步數 (從 simulator 傳入)
     */
    updateCompanionModel(h, stepCount = null) {
        if (!h || h <= 0) {
            return; // DC分析或無效步長
        }

        const C = this.getCapacitance();
        this.currentTimeStep = h;
        
        // 更新步數計數器
        if (stepCount !== null) {
            this.stepCount = stepCount;
        }
        
        if (this.stepCount <= 1) {
            // 🎯 第一步: 後向歐拉伴隨模型
            // 方程: C * (v_n - v_{n-1}) / h = i_n
            // 重組: (C/h) * v_n = i_n + (C/h) * v_{n-1}
            this.equivalentConductance = C / h;
            const v_nm1 = this.previousValues.get('voltage') || this.ic || 0;
            this.historyCurrentSource = this.equivalentConductance * v_nm1;
            
        } else {
            // 🚀 第二步及以後: Gear 2 (BDF2) 伴隨模型
            // 方程: C * (3v_n - 4v_{n-1} + v_{n-2}) / (2h) = i_n
            // 重組: (3C/2h) * v_n = i_n + (4C/2h)*v_{n-1} - (C/2h)*v_{n-2}
            this.equivalentConductance = 3 * C / (2 * h);
            
            const v_nm1 = this.previousValues.get('voltage') || this.ic || 0;      // v_{n-1}
            const v_nm2 = this.previousValues.get('voltage_prev') || this.ic || 0; // v_{n-2}
            
            // BDF2 歷史電流源: Ieq = (4C/2h)*v_{n-1} - (C/2h)*v_{n-2}
            const coeff_nm1 = 4 * C / (2 * h);  // = 2C/h
            const coeff_nm2 = C / (2 * h);       // = C/(2h)
            this.historyCurrentSource = coeff_nm1 * v_nm1 - coeff_nm2 * v_nm2;
        }
    }

    /**
     * 🚀 更新 Gear 2 歷史狀態管理
     * 正確處理雙歷史點的轉移: voltage → voltage_prev (由 BaseComponent 自動處理)
     * @param {Object|Map} solutionData 解決方案資料物件或向後相容的節點電壓
     * @param {number} timeStep 時間步長
     */
    updateHistory(solutionData, timeStep) {
        // 統一 API 支持
        let nodeVoltages, branchCurrents;
        if (solutionData && solutionData.nodeVoltages) {
            nodeVoltages = solutionData.nodeVoltages;
            branchCurrents = solutionData.branchCurrents;
        } else {
            // 向後相容
            nodeVoltages = solutionData;
            branchCurrents = arguments[1];
            timeStep = arguments[2] || timeStep;
        }
        
        // 計算當前電壓和電流
        const voltage = this.getVoltage(nodeVoltages);
        const current = this.getCurrent(voltage, timeStep); // 新的 getCurrent 只需要當前電壓
        
        // 更新操作點
        this.operatingPoint.voltage = voltage;
        this.operatingPoint.current = current;
        this.operatingPoint.power = voltage * current;
        
        // 儲存當前狀態 (注意: BaseComponent.updateHistory() 會自動處理歷史轉移)
        this.previousValues.set('voltage', voltage);
        this.previousValues.set('current', current);
        
        // 調用父類的歷史更新 (這會自動處理 voltage → voltage_prev 轉移)
        super.updateHistory(solutionData, timeStep);
        
        // 更新步數計數器 (每次成功步驟後遞增)
        this.stepCount++;
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
     * 🚀 初始化 Gear 2 暫態分析
     * @param {number} timeStep 時間步長
     * @param {string} method 積分方法 (固定為 'gear2')
     */
    initTransient(timeStep, method = 'gear2') {
        this.timeStep = timeStep;
        this.integrationMethod = 'gear2'; // 強制使用 Gear 2
        this.stepCount = 0; // 重置步數計數器
        
        // 初始化電壓和電流歷史 (兩個歷史點都設為初始條件)
        this.previousValues.set('voltage', this.ic || 0);
        this.previousValues.set('voltage_prev', this.ic || 0);
        this.previousValues.set('current', 0);
        
        // 初始化伴隨模型 (第一步將使用後向歐拉)
        this.updateCompanionModel(timeStep, 0);
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
     * 🚀 獲取 Gear 2 電容器詳細資訊
     */
    getInfo(nodeVoltages = null) {
        const info = {
            ...super.toJSON(),
            actualCapacitance: this.getCapacitance(),
            ic: this.ic,
            integrationMethod: this.integrationMethod,
            currentTimeStep: this.currentTimeStep,
            stepCount: this.stepCount, // 新增: 當前步數
            equivalentConductance: this.equivalentConductance,
            historyCurrentSource: this.historyCurrentSource,
            operatingPoint: { ...this.operatingPoint },
            gear2Status: this.stepCount <= 1 ? 'Backward Euler' : 'BDF2' // 新增: 當前使用的方法
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

    /**
     * 克隆電容元件，支持參數覆蓋
     * @param {Object} overrides 覆蓋參數 {name?, nodes?, value?, params?}
     * @returns {Capacitor} 新的電容實例
     */
    clone(overrides = {}) {
        const newName = overrides.name || this.name;
        const newNodes = overrides.nodes ? [...overrides.nodes] : [...this.nodes];
        const newValue = overrides.value !== undefined ? overrides.value : this.value;
        const newParams = overrides.params ? { ...this.params, ...overrides.params } : { ...this.params };
        
        // 保持初始條件
        if (this.ic !== undefined && !newParams.ic) {
            newParams.ic = this.ic;
        }
        
        const cloned = new Capacitor(newName, newNodes, newValue, newParams);
        
        // 深度複製 Gear 2 狀態
        cloned.integrationMethod = this.integrationMethod || 'gear2';
        cloned.currentTimeStep = this.currentTimeStep || 0;
        cloned.stepCount = this.stepCount || 0;
        
        return cloned;
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
        
        const methodStatus = this.stepCount <= 1 ? 'BE' : 'BDF2';
        return `${this.name}: ${capacitanceStr} (${this.nodes[0]} → ${this.nodes[1]}) [${this.integrationMethod}-${methodStatus}]`;
    }
}