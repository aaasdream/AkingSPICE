/**
 * 電感元件模型 v3.0 - Gear 2 (BDF2) 數值積分版本
 * 實現高階數值積分的伴隨模型，專為剛性系統 (如開關電源) 設計
 * � 新功能: Gear 2 方法的 L-穩定性，解決切換電路的數值振盪問題
 * 📚 理論基礎: BDF2 公式 L * (3i_n - 4i_{n-1} + i_{n-2}) / (2h) = v_n
 * ⚠️  符號注意: 電感電壓 v = L * di/dt，電流是積分變數
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
        
        // � Gear 2 (BDF2) 專用參數
        this.integrationMethod = 'gear2'; // 默認使用 Gear 2 方法
        this.currentTimeStep = 0;
        this.stepCount = 0; // 追蹤步數，第一步使用後向歐拉
        
        // Gear 2 伴隨模型參數 (電感需要電流變數)
        // BDF2 電感方程: L * (3i_n - 4i_{n-1} + i_{n-2}) / (2h) + R*i_n = v_n
        // 重組為: (3L/2h + R) * i_n = v_n + (4L/2h)*i_{n-1} - (L/2h)*i_{n-2}
        this.equivalentResistance = 0;     // Req = 3L/(2h) + R for BDF2
        this.equivalentVoltageSource = 0;  // Veq = (4L/2h)*i_{n-1} - (L/2h)*i_{n-2}
        this.needsCurrentVar = true;       // 電感需要電流變數
        
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
     * � Gear 2 伴隨模型局部截斷誤差估算
     * BDF2 的 LTE ≈ (h³/3) * d³i/dt³ (電流誤差)
     * 使用差分近似: d³i/dt³ ≈ (i_n - 3i_{n-1} + 3i_{n-2} - i_{n-3}) / h³
     * @param {number} h 當前時間步長
     * @returns {number} 估算的電流誤差
     */
    calculateLTE(h) {
        if (h <= 0 || this.stepCount < 2) {
            return 1e-12; // 前兩步或無效步長時返回小誤差
        }
        
        // 獲取電流歷史 (假設我們有足夠的歷史數據)
        const i_n = this.previousValues.get('current') || this.ic || 0;
        const i_nm1 = this.previousValues.get('current_prev') || this.ic || 0;
        
        // 簡化的 LTE 估算：基於電流變化率的變化
        // 實際應用中可以進一步精確化
        const didt_current = (i_n - i_nm1) / h;
        const didt_change = Math.abs(didt_current);
        
        // BDF2 的理論 LTE 係數是 h³/3，這裡使用保守估算
        const lte = (h * h * h / 3.0) * didt_change * 1e-6; // 加入比例因子
        
        return isNaN(lte) ? 1e-12 : Math.max(lte, 1e-12);
    }

    /**
     * 🚀 Gear 2 (BDF2) 電感電壓計算
     * 根據步數自動選擇積分公式:
     * - 第一步: 後向歐拉法 v = L * (i_n - i_{n-1}) / h + R * i_n
     * - 後續步: BDF2 公式 v = L * (3i_n - 4i_{n-1} + i_{n-2}) / (2h) + R * i_n
     * @param {number} currentCurrent 當前電流 i_n
     * @param {number} h 時間步長
     * @returns {number} 電壓 (伏特)
     */
    getVoltage(currentCurrent, h) {
        if (h <= 0) return this.resistance * currentCurrent; // DC 時只有電阻壓降
        const L = this.getInductance();
        
        let inductiveVoltage;
        
        if (this.stepCount <= 1) {
            // 第一步使用後向歐拉法 (只需要一個歷史點)
            const i_prev = this.previousValues.get('current') || this.ic || 0;
            inductiveVoltage = L * (currentCurrent - i_prev) / h;
        } else {
            // 第二步及以後使用 Gear 2 (BDF2) 方法
            const i_nm1 = this.previousValues.get('current') || this.ic || 0;      // i_{n-1}
            const i_nm2 = this.previousValues.get('current_prev') || this.ic || 0; // i_{n-2}
            
            // BDF2 公式: v_L = L * (3i_n - 4i_{n-1} + i_{n-2}) / (2h)
            inductiveVoltage = L * (3 * currentCurrent - 4 * i_nm1 + i_nm2) / (2 * h);
        }
        
        // 總電壓 = 感應電壓 + 電阻壓降
        return inductiveVoltage + this.resistance * currentCurrent;
    }

    /**
     * 🚀 更新 Gear 2 (BDF2) 伴隨模型  
     * ⚠️ 符號重要: 電感電壓方程 v_n = L*di/dt + R*i_n
     * 根據步數自動選擇伴隨模型:
     * - 第一步: 後向歐拉 v_n = (L/h + R)*i_n - (L/h)*i_{n-1}
     * - 後續步: BDF2 v_n = (3L/2h + R)*i_n - (4L/2h)*i_{n-1} + (L/2h)*i_{n-2}
     * @param {number} h 當前時間步長
     * @param {number} stepCount 當前步數 (從 simulator 傳入)
     */
    updateCompanionModel(h, stepCount = null) {
        console.log(`� Inductor_v3.updateCompanionModel called: name=${this.name}, h=${h}, stepCount=${stepCount}`);
        
        if (!h || h <= 0) {
            console.log(`  ⚠️ Skipping update, invalid h=${h}`);
            return; // DC analysis or invalid step
        }

        const L = this.getInductance();
        this.currentTimeStep = h;
        this.timeStep = h;  // Also set timeStep for MNA compatibility
        
        // 更新步數計數器
        if (stepCount !== null) {
            this.stepCount = stepCount;
        }
        
        if (this.stepCount <= 1) {
            // 🎯 第一步: 後向歐拉伴隨模型
            // 方程: L * (i_n - i_{n-1}) / h + R * i_n = v_n
            // 重組: (L/h + R) * i_n = v_n + (L/h) * i_{n-1}
            this.equivalentResistance = (L / h) + this.resistance;
            const i_nm1 = this.previousValues.get('current') || this.ic || 0;
            this.equivalentVoltageSource = -(L / h) * i_nm1;
            
            console.log(`  📐 BE模式: Req=${this.equivalentResistance}, Veq=${this.equivalentVoltageSource}`);
            
        } else {
            // 🚀 第二步及以後: Gear 2 (BDF2) 伴隨模型
            // 方程: L * (3i_n - 4i_{n-1} + i_{n-2}) / (2h) + R * i_n = v_n
            // 重組: (3L/2h + R) * i_n = v_n + (4L/2h)*i_{n-1} - (L/2h)*i_{n-2}
            this.equivalentResistance = (3 * L / (2 * h)) + this.resistance;
            
            const i_nm1 = this.previousValues.get('current') || this.ic || 0;      // i_{n-1}
            const i_nm2 = this.previousValues.get('current_prev') || this.ic || 0; // i_{n-2}
            
            // 🔥 關鍵修正：BDF2 等效電壓源 Veq = (4L/2h)*i_{n-1} - (L/2h)*i_{n-2}
            const coeff_nm1 = 4 * L / (2 * h);  // = 2L/h
            const coeff_nm2 = L / (2 * h);       // = L/(2h)
            this.equivalentVoltageSource = coeff_nm1 * i_nm1 - coeff_nm2 * i_nm2;
            
            console.log(`  🚀 BDF2模式: Req=${this.equivalentResistance}, Veq=${this.equivalentVoltageSource} (i_nm1=${i_nm1}, i_nm2=${i_nm2})`);
        }
    }

    /**
     * 🚀 更新 Gear 2 歷史狀態管理
     * 正確處理雙歷史點的轉移: current → current_prev
     * @param {Object|Map} solutionData 解決方案資料物件或向後相容的節點電壓
     * @param {number} timeStep 時間步長
     */
    updateHistory(solutionData, timeStep) {
        // 統一 API 支持
        let nodeVoltages, branchCurrents, currentVarName;
        if (solutionData && solutionData.nodeVoltages) {
            nodeVoltages = solutionData.nodeVoltages;
            branchCurrents = solutionData.branchCurrents;
            currentVarName = this.name; // 使用元件名稱作為電流變數名
        } else {
            // 向後相容
            nodeVoltages = solutionData;
            branchCurrents = arguments[1];
            currentVarName = arguments[2] || this.name;
            timeStep = arguments[3] || timeStep;
        }
        
        // 🔥 關鍵修正：在獲取新電流之前，手動轉移歷史電流
        // 將 'current' -> 'current_prev'
        if (this.previousValues.has('current')) {
            this.previousValues.set('current_prev', this.previousValues.get('current'));
        }

        const h = timeStep; // 向後相容變數名
        const current = branchCurrents.get(currentVarName || this.name) || 0;
        
        // 計算電壓 (使用新的 Gear 2 getVoltage 方法)
        const voltage = this.getVoltage(nodeVoltages);
        
        // 簡化調試信息 - 只在電流非零或變壓器電感時報告
        if (Math.abs(current) > 1e-12 || this.name.includes('T1')) {
            console.log(`🚀 [${this.name}] Gear2 updateHistory: current=${current.toExponential(3)}A, voltage=${voltage.toFixed(3)}V, stepCount=${this.stepCount}`);
        }

        // 更新操作點
        this.operatingPoint.current = current;
        this.operatingPoint.voltage = voltage;
        this.operatingPoint.power = voltage * current;
        
        // 儲存當前狀態 (注意: BaseComponent.updateHistory() 會自動處理歷史轉移)
        this.previousValues.set('current', current);
        this.previousValues.set('voltage', voltage);
        
        // 調用父類的歷史更新 (這會自動處理 current → current_prev 轉移)
        super.updateHistory(solutionData, timeStep);
        
        // 更新步數計數器 (每次成功步驟後遞增)
        this.stepCount++;
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
     * 🚀 初始化 Gear 2 暫態分析
     * @param {number} timeStep 時間步長
     * @param {string} method 積分方法 (固定為 'gear2')
     */
    initTransient(timeStep, method = 'gear2') {
        this.timeStep = timeStep;
        this.integrationMethod = 'gear2'; // 強制使用 Gear 2
        this.stepCount = 0; // 重置步數計數器
        
        // 初始化電流和電壓歷史 (兩個歷史點都設為初始條件)
        this.previousValues.set('current', this.ic || 0);
        this.previousValues.set('current_prev', this.ic || 0);
        this.previousValues.set('voltage', 0);
        
        // 初始化伴隨模型 (第一步將使用後向歐拉)
        this.updateCompanionModel(timeStep, 0);
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
        
        console.log(`🔵 [${this.name}] stamp called: currentIndex=${currentIndex}, couplings=${this.couplings ? this.couplings.length : 'undefined'}`);
        
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
            
            // 添加等效電阻和電壓源 (自感部分)
            matrix.addAt(currentIndex, currentIndex, -this.equivalentResistance);
            rhs.addAt(currentIndex, this.equivalentVoltageSource);

            // ==================== 🔥 新增代碼開始 🔥 ====================
            // 處理互感 (Coupling) - 變壓器耦合邏輯
            // 變壓器的電壓方程: V_L1 = L1*di1/dt + M*di2/dt
            console.log(`🔍 [${this.name}] Checking couplings: exists=${!!this.couplings}, count=${this.couplings ? this.couplings.length : 0}`);
            if (this.couplings) {
                const h = this.currentTimeStep; // time step
                console.log(`🔧 [${this.name}] Processing mutual inductance: h=${h}, coupling count=${this.couplings.length}`);
                if (!h || h <= 0) {
                    console.log(`⚠️ [${this.name}] Invalid time step, skipping mutual inductance`);
                    return; // Cannot process mutual inductance in DC analysis
                }

                for (const coupling of this.couplings) {
                    const otherInductor = coupling.inductor;
                    const M = coupling.mutualInductance;
                    
                    const otherCurrIndex = voltageSourceMap.get(otherInductor.name);
                    console.log(`🔗 [${this.name}] 處理與 ${otherInductor.name} 的耦合: M=${M*1e6}µH, otherIdx=${otherCurrIndex}`);
                    
                    if (otherCurrIndex === undefined) {
                        console.warn(`❌ [MNA] 耦合電感 ${otherInductor.name} 的電流變數未找到 (for ${this.name})`);
                        continue;
                    }

                    // 互感項的伴隨模型貢獻: V_M = M * dI_other/dt
                    // 離散化後約等於: M/h * (I_other_n - I_other_{n-1})
                    // 這會在電壓方程中增加兩個部分：
                    // 1. 對 MNA 矩陣的貢獻: - (M/h) * I_other_n
                    // 2. 對 RHS 向量的貢獻: + (M/h) * I_other_{n-1}

                    const mutualCoeff = -M / h;
                    console.log(`🧮 [${this.name}] 互感係數: -M/h = ${mutualCoeff} (添加到 matrix[${currentIndex}][${otherCurrIndex}])`);

                    // 1. 修改 MNA 矩陣：增加對另一個電感電流的依賴
                    matrix.addAt(currentIndex, otherCurrIndex, mutualCoeff);

                    // 2. 修改 RHS 向量：加入歷史項的貢獻
                    const otherPreviousCurrent = otherInductor.previousValues.get('current') || otherInductor.ic || 0;
                    const rhsContribution = (M / h) * otherPreviousCurrent;
                    console.log(`📊 [${this.name}] RHS 歷史項: (M/h)*I_prev = ${rhsContribution} (I_prev=${otherPreviousCurrent})`);
                    rhs.addAt(currentIndex, rhsContribution);
                }
            }
            // ==================== 🔥 新增代碼結束 🔥 ====================
        }
    }

    /**
     * 🚀 獲取 Gear 2 電感器詳細資訊
     */
    getInfo(current = null) {
        const info = {
            ...super.toJSON(),
            actualInductance: this.getInductance(),
            ic: this.ic,
            resistance: this.resistance,
            integrationMethod: this.integrationMethod,
            currentTimeStep: this.currentTimeStep,
            stepCount: this.stepCount, // 新增: 當前步數
            equivalentResistance: this.equivalentResistance,
            equivalentVoltageSource: this.equivalentVoltageSource,
            coupledInductors: Object.fromEntries(this.coupledInductors),
            operatingPoint: { ...this.operatingPoint },
            gear2Status: this.stepCount <= 1 ? 'Backward Euler' : 'BDF2' // 新增: 當前使用的方法
        };
        
        if (current !== null) {
            info.storedEnergy = this.getStoredEnergy(current);
            info.overCurrent = this.isOverCurrent(current);
        }
        
        return info;
    }

    /**
     * 克隆電感元件，支持參數覆蓋
     * @param {Object} overrides 覆蓋參數 {name?, nodes?, value?, params?}
     * @returns {Inductor} 新的電感實例
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
        
        const cloned = new Inductor(newName, newNodes, newValue, newParams);
        
        // 深度複製 Gear 2 狀態
        cloned.integrationMethod = this.integrationMethod || 'gear2';
        cloned.currentTimeStep = this.currentTimeStep || 0;
        cloned.stepCount = this.stepCount || 0;
        cloned.resistance = this.resistance || 0;
        
        // 複製耦合信息（深度複製）
        if (this.couplings && this.couplings.length > 0) {
            cloned.couplings = this.couplings.map(coupling => ({
                inductor: coupling.inductor, // 注意：這裡可能需要額外處理
                mutualInductance: coupling.mutualInductance,
                polaritySign: coupling.polaritySign
            }));
        }
        
        return cloned;
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
        const methodStatus = this.stepCount <= 1 ? 'BE' : 'BDF2';
        return `${this.name}: ${inductanceStr}${resistanceStr} (${this.nodes[0]} → ${this.nodes[1]}) [${this.integrationMethod}-${methodStatus}]`;
    }
}