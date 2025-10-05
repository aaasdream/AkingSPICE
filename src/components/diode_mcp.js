/**
 * 基於混合互補問題 (MCP) 的二極管模型
 * 
 * 與傳統等效電阻方法不同，此模型使用互補約束精確描述二極管的開關特性：
 * 
 * 互補條件：
 * 0 ≤ (Vd - Vf)  ⊥  Id ≥ 0
 * 
 * 含義：
 * - 如果 Vd < Vf (反向偏置)，則 Id = 0 (截止)
 * - 如果 Id > 0 (正向電流)，則 Vd = Vf + Ron*Id (導通)
 * 
 * 這種建模方式消除了傳統方法的數值振盪問題
 */

import { BaseComponent } from './base.js';
import { Matrix, Vector } from '../core/linalg.js';

export class Diode_MCP extends BaseComponent {
    constructor(name, nodes, params = {}) {
        super(name, 'D_MCP', nodes, 0, params);
        
        // 物理參數
        this.Vf = params.Vf || 0.7;           // 導通電壓 (V)
        this.Ron = params.Ron || 1e-3;        // 導通電阻 (Ω) 
        this.Isat = params.Isat || 1e-12;     // 反向飽和電流 (A)
        this.n = params.n || 1.0;             // 理想因子
        
        // 數值參數
        this.minConductance = 1e-12;          // 最小電導，避免奇異性
        
        // 狀態變量
        this.currentState = 'unknown';         // 'forward', 'reverse', 'unknown'
        this.previousCurrent = 0;
        this.previousVoltage = 0;
        
        // MCP 相關變量索引 (由 MNA-LCP 建構器設置)
        this.currentVarIndex = -1;
        this.complementarityIndex = -1;
        
        if (params.debug) {
            console.log(`📟 創建 MCP 二極管 ${name}: Vf=${this.Vf}V, Ron=${this.Ron}Ω`);
        }
    }

    /**
     * 預先註冊 MCP 變量和約束
     * 在矩陣初始化之前調用
     * 
     * @param {MNA_LCP_Builder} mnaBuilder - MNA-LCP 建構器
     */
    registerVariables(mnaBuilder) {
        // 註冊二極管電流變量 (純 LCP 變量)
        this.currentVarIndex = mnaBuilder.addExtraVariable(`${this.name}_Id`);
        
        // 註冊互補約束 (LCP 變量的約束來自互補條件，不需要 MNA 方程)
        this.complementarityIndex = mnaBuilder.addComplementarityEquation();
        
        if (mnaBuilder.debug) {
            console.log(`    📝 ${this.name}: 電流變量索引 ${this.currentVarIndex}, LCP 約束索引 ${this.complementarityIndex}`);
        }
    }

    /**
     * 為 MNA-LCP 系統貢獻互補約束
     * 這是 MCP 方法的核心：定義互補條件而不是等效電阻
     * 
     * @param {MNA_LCP_Builder} mnaBuilder - 擴展的 MNA 建構器
     * @param {number} time - 當前時間 (瞬態分析用)
     */
    getLCPContribution(mnaBuilder, time) {
        const n1 = mnaBuilder.getNodeIndex(this.nodes[0]); // 陽極
        const n2 = mnaBuilder.getNodeIndex(this.nodes[1]); // 陰極
        
        // === 步驟 1：電流對 KCL 的貢獻 ===
        // Id 從陽極流向陰極
        if (n1 >= 0) {
            mnaBuilder.addToMatrix(n1, this.currentVarIndex, 1.0);  // +Id 離開陽極
        }
        if (n2 >= 0) {
            mnaBuilder.addToMatrix(n2, this.currentVarIndex, -1.0); // -Id 進入陰極
        }

        // === 步驟 2：LCP 變量通過互補約束定義 ===
        // 二極管電流 Id 是純 LCP 變量，其值由互補條件確定
        // 不需要在 MNA 系統中添加額外約束

        // === 步驟 3：定義互補約束 ===
        // w = Vd - Ron*Id - Vf
        // 互補條件：w ≥ 0, Id ≥ 0, w*Id = 0
        
        if (n1 >= 0) {
            mnaBuilder.setLCPMatrix(this.complementarityIndex, n1, 1.0);    // +Vd項
        }
        if (n2 >= 0) {
            mnaBuilder.setLCPMatrix(this.complementarityIndex, n2, -1.0);   // -Vs項 
        }
        
        // 電流的影響：w = ... - Ron*Id
        mnaBuilder.setLCPMatrix(this.complementarityIndex, this.currentVarIndex, -this.Ron);
        
        // 常數項：-Vf
        mnaBuilder.setLCPVector(this.complementarityIndex, -this.Vf);
        
        // === 步驟 4：建立互補映射 ===
        // 將 w[complementarityIndex] 與 z[currentVarIndex] 關聯
        mnaBuilder.mapLCPVariable(this.complementarityIndex, this.currentVarIndex);
        
        if (mnaBuilder.debug) {
            console.log(`  🔗 ${this.name}: w[${this.complementarityIndex}] ⊥ Id[${this.currentVarIndex}]`);
        }
    }

    /**
     * 傳統 MNA 方法的替代實現 (用於比較測試)
     * 使用平滑函數近似互補條件
     */
    getLCPContributionSmooth(mnaBuilder, time, smoothingParam = 1e-6) {
        const n1 = mnaBuilder.getNodeIndex(this.nodes[0]);
        const n2 = mnaBuilder.getNodeIndex(this.nodes[1]);
        
        // 使用平滑最小函數：min(a,b) ≈ (a+b)/2 - √((a-b)²+ε)/2
        // 對於二極管：Id = max(0, (Vd-Vf)/Ron) ≈ smooth function
        
        this.currentVarIndex = mnaBuilder.addExtraVariable(`${this.name}_Id_smooth`);
        
        // 添加非線性方程：Id - smooth_max(0, (Vd-Vf)/Ron) = 0
        // 這需要雅可比矩陣，比純 LCP 複雜
        
        // 簡化實現：使用線性化的互補約束
        const eqIndex = mnaBuilder.addEquation();
        
        if (n1 >= 0) mnaBuilder.addToMatrix(eqIndex, n1, 1.0/this.Ron);
        if (n2 >= 0) mnaBuilder.addToMatrix(eqIndex, n2, -1.0/this.Ron);
        mnaBuilder.addToMatrix(eqIndex, this.currentVarIndex, -1.0);
        mnaBuilder.addToRHS(eqIndex, this.Vf/this.Ron);
        
        // KCL 貢獻同上...
        if (n1 >= 0) mnaBuilder.addToMatrix(n1, this.currentVarIndex, 1.0);
        if (n2 >= 0) mnaBuilder.addToMatrix(n2, this.currentVarIndex, -1.0);
    }

    /**
     * 計算二極管在給定電壓下的電流 (解析解，用於驗證)
     */
    computeAnalyticalCurrent(voltage) {
        if (voltage >= this.Vf) {
            // 正向偏置：導通狀態
            return (voltage - this.Vf) / this.Ron;
        } else {
            // 反向偏置：截止狀態 
            return 0.0;
        }
    }

    /**
     * 計算二極管功耗
     */
    calculatePower(nodeVoltages, branchCurrents) {
        const v1 = nodeVoltages.get(this.nodes[0]) || 0;
        const v2 = nodeVoltages.get(this.nodes[1]) || 0;
        const vd = v1 - v2;
        
        // 從 LCP 解中獲取電流
        let current = 0;
        if (this.currentVarIndex >= 0 && branchCurrents.has(this.currentVarIndex)) {
            current = branchCurrents.get(this.currentVarIndex);
        }
        
        return vd * current;
    }

    /**
     * 更新狀態歷史 (瞬態分析用)
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
        }
        
        const v1 = nodeVoltages.get(this.nodes[0]) || 0;
        const v2 = nodeVoltages.get(this.nodes[1]) || 0;
        
        this.previousVoltage = v1 - v2;
        
        if (this.currentVarIndex >= 0 && branchCurrents.has(this.currentVarIndex)) {
            this.previousCurrent = branchCurrents.get(this.currentVarIndex);
        }
        
        // 更新狀態
        if (this.previousCurrent > 1e-12) {
            this.currentState = 'forward';
        } else if (this.previousVoltage < this.Vf - 1e-6) {
            this.currentState = 'reverse';
        } else {
            this.currentState = 'boundary'; // 邊界狀態
        }
    }

    /**
     * 獲取二極管的運行狀態信息
     */
    getOperatingPoint() {
        return {
            name: this.name,
            type: 'Diode_MCP',
            voltage: this.previousVoltage,
            current: this.previousCurrent,
            power: this.previousVoltage * this.previousCurrent,
            state: this.currentState,
            forwardBiased: this.currentState === 'forward',
            conducting: Math.abs(this.previousCurrent) > 1e-12
        };
    }

    /**
     * 為調試輸出格式化的狀態字符串
     */
    toString() {
        return `${this.name}(MCP): Vd=${this.previousVoltage.toFixed(3)}V, ` +
               `Id=${this.previousCurrent.toExponential(3)}A, ` +
               `State=${this.currentState}`;
    }

    /**
     * 克隆 MCP 二極管元件，支持參數覆蓋
     * @param {Object} overrides 覆蓋參數 {name?, nodes?, params?}
     * @returns {Diode_MCP} 新的 MCP 二極管實例
     */
    clone(overrides = {}) {
        const newName = overrides.name || this.name;
        const newNodes = overrides.nodes ? [...overrides.nodes] : [...this.nodes];
        const newParams = overrides.params ? { ...this.params, ...overrides.params } : { ...this.params };
        
        const cloned = new Diode_MCP(newName, newNodes, newParams);
        
        // 深度複製 MCP 狀態
        cloned.Vf = this.Vf;
        cloned.Ron = this.Ron;
        cloned.currentState = this.currentState;
        cloned.previousVoltage = this.previousVoltage;
        cloned.previousCurrent = this.previousCurrent;
        
        return cloned;
    }

    /**
     * 驗證互補條件是否滿足 (用於調試)
     * 
     * @param {number} voltage - 二極管電壓 
     * @param {number} current - 二極管電流
     * @returns {Object} 驗證結果
     */
    static verifyComplementarity(voltage, current, Vf, Ron, tolerance = 1e-10) {
        // 檢查非負性
        const currentNonNeg = current >= -tolerance;
        
        // 檢查互補條件
        const w = voltage - Ron * current - Vf;  // w = Vd - Ron*Id - Vf
        const wNonNeg = w >= -tolerance;
        const complementarity = Math.abs(w * current);
        
        return {
            valid: currentNonNeg && wNonNeg && complementarity < tolerance,
            currentNonNeg,
            wNonNeg,
            w,
            complementarity,
            tolerance
        };
    }
}

/**
 * 創建預配置的 MCP 二極管
 */
export function createMCPDiode(name, anode, cathode, params = {}) {
    const defaultParams = {
        Vf: 0.7,      // 硅二極管典型導通電壓
        Ron: 1e-3,    // 1mΩ 導通電阻
        debug: false
    };

    return new Diode_MCP(name, [anode, cathode], { ...defaultParams, ...params });
}

/**
 * 快速二極管 (快恢復二極管)
 */
export function createFastRecoveryDiode(name, anode, cathode, params = {}) {
    const fastParams = {
        Vf: 0.8,      // 稍高的導通電壓
        Ron: 5e-4,    // 更低的導通電阻
        ...params
    };

    return new Diode_MCP(name, [anode, cathode], fastParams);
}

/**
 * 肖特基二極管
 */
export function createSchottkyDiode(name, anode, cathode, params = {}) {
    const schottkyParams = {
        Vf: 0.3,      // 低導通電壓
        Ron: 2e-3,    // 中等導通電阻
        ...params
    };

    return new Diode_MCP(name, [anode, cathode], schottkyParams);
}

export default Diode_MCP;