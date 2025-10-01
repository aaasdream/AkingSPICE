/**
 * Diode 元件模型 (理想二極體模型)
 * 
 * 特點：
 * - 基於電壓控制的開關模型
 * - 包含順向偏壓電壓 (Vf) 和導通電阻 (Ron)
 * - 適用於整流電路、續流二極體等應用
 * - 自動根據陽極-陰極電壓決定導通狀態
 */

import { BaseComponent } from './base.js';

/**
 * 理想二極體模型
 * 
 * 這個模型實現了：
 * 1. 當 Va > Vk + Vf 時二極體導通 (低電阻)
 * 2. 當 Va <= Vk + Vf 時二極體截止 (高電阻)  
 * 3. 支援快速狀態切換和非線性分析
 */
export class Diode extends BaseComponent {
    /**
     * @param {string} name 二極體名稱 (如 'D1', 'CR1')
     * @param {string[]} nodes 連接節點 [anode, cathode]
     * @param {Object} params 參數 {Vf, Ron, Roff}
     */
    constructor(name, nodes, params = {}) {
        super(name, 'D', nodes, 0, params);
        
        if (nodes.length < 2) {
            throw new Error(`Diode ${name} must have 2 nodes: [anode, cathode]`);
        }
        
        // 二極體參數 - 安全地解析參數，如果解析失敗使用默認值
        this.Vf = this.safeParseValue(params.Vf, 0.7);        // 順向偏壓電壓 (默認 0.7V)
        this.Ron = this.safeParseValue(params.Ron, 0.01);     // 導通電阻 (默認 10mΩ)
        this.Roff = this.safeParseValue(params.Roff, 1e6);    // 截止電阻 (默認 1MΩ)
        
        // 節點分配
        this.anode = nodes[0];      // 陽極
        this.cathode = nodes[1];    // 陰極
        
        // 狀態追蹤
        this.isForwardBiased = false;   // 是否順向偏壓
        this.anodeCathodeVoltage = 0;   // 陽極-陰極電壓
        this.current = 0;               // 通過電流
        
        // 初始化參數驗證
        this.validate();
    }

    /**
     * 安全地解析數值參數，如果失敗則返回默認值
     * @param {*} value 要解析的值
     * @param {number} defaultValue 默認值
     * @returns {number} 解析後的數值或默認值
     */
    safeParseValue(value, defaultValue) {
        try {
            if (value === undefined || value === null) {
                return defaultValue;
            }
            return this.parseValue(value);
        } catch (error) {
            return defaultValue;
        }
    }

    /**
     * 驗證二極體參數
     */
    validate() {
        if (this.Ron <= 0) {
            throw new Error(`Diode ${this.name}: Ron must be positive`);
        }
        if (this.Roff <= this.Ron) {
            throw new Error(`Diode ${this.name}: Roff must be greater than Ron`);
        }
        if (this.Vf < 0) {
            throw new Error(`Diode ${this.name}: Forward voltage Vf must be non-negative`);
        }
    }

    /**
     * 計算二極體的等效電阻
     * @param {number} vak 陽極-陰極電壓 (V)
     * @returns {number} 等效電阻 (歐姆)
     */
    getEquivalentResistance(vak) {
        // 二極體導通條件：Va > Vk + Vf，即 vak > Vf
        this.isForwardBiased = vak > this.Vf;
        return this.isForwardBiased ? this.Ron : this.Roff;
    }

    /**
     * 檢查二極體是否處於導通狀態
     * @returns {boolean}
     */
    isOn() {
        return this.isForwardBiased;
    }

    /**
     * 獲取二極體壓降 (包含順向偏壓電壓)
     * @returns {number} 實際壓降 (V)
     */
    getVoltageDrop() {
        if (this.isForwardBiased) {
            // 導通時：壓降 = Vf + I * Ron
            return this.Vf + this.current * this.Ron;
        } else {
            // 截止時：壓降等於陽極-陰極電壓
            return this.anodeCathodeVoltage;
        }
    }

    /**
     * 為 MNA 分析提供印花 (stamping) 支援
     * 注意：這是一個非線性元件，需要在每次迭代中更新
     * 
     * @param {Matrix} matrix MNA 矩陣
     * @param {Vector} rhs 右側向量  
     * @param {Map} nodeMap 節點映射
     * @param {Map} voltageSourceMap 電壓源映射
     * @param {number} time 當前時間
     */
    stamp(matrix, rhs, nodeMap, voltageSourceMap, time) {
        // 獲取節點索引，接地節點返回 -1
        const anodeIndex = this.anode === '0' || this.anode === 'gnd' ? -1 : nodeMap.get(this.anode);
        const cathodeIndex = this.cathode === '0' || this.cathode === 'gnd' ? -1 : nodeMap.get(this.cathode);
        
        if (anodeIndex === undefined || cathodeIndex === undefined) {
            throw new Error(`Diode ${this.name}: Node mapping not found (anode: ${this.anode}, cathode: ${this.cathode})`);
        }

        // 獲取當前陽極-陰極電壓 (初始化時為0)
        let vak = 0;
        if (this.anodeCathodeVoltage !== undefined) {
            vak = this.anodeCathodeVoltage;
        }

        const resistance = this.getEquivalentResistance(vak);
        const conductance = 1 / resistance;
        
        if (Math.abs(vak) > 0.1) {
            console.log(`  [${this.name}] 印花: VAK=${vak.toFixed(3)}V, R=${resistance.toExponential(2)}Ω, G=${conductance.toExponential(2)}S, 狀態=${this.isForwardBiased ? 'ON' : 'OFF'}`);
        }

        // 印花導納矩陣 (類似電阻的印花方式)
        // 接地節點 (index = -1) 不需要印花到矩陣中
        if (anodeIndex >= 0) {
            matrix.addAt(anodeIndex, anodeIndex, conductance);
            if (cathodeIndex >= 0) {
                matrix.addAt(anodeIndex, cathodeIndex, -conductance);
            }
        }
        
        if (cathodeIndex >= 0) {
            matrix.addAt(cathodeIndex, cathodeIndex, conductance);
            if (anodeIndex >= 0) {
                matrix.addAt(cathodeIndex, anodeIndex, -conductance);
            }
        }

        // 如果二極體導通，需要在 RHS 向量中添加順向偏壓的影響
        if (this.isForwardBiased) {
            const currentSource = this.Vf / resistance;  // 等效電流源
            console.log(`  [${this.name}] 順向偏壓電流源: ${currentSource.toExponential(3)}A`);
            
            if (anodeIndex >= 0) {
                rhs[anodeIndex] += -currentSource;
            }
            if (cathodeIndex >= 0) {
                rhs[cathodeIndex] += currentSource;
            }
        }
    }

    /**
     * 更新元件狀態 (在每個時間步後調用)
     * 統一接口，與 ExplicitStateSolver 配合使用
     * @param {Map<string, number>} nodeVoltages 節點電壓映射
     * @param {Array<number>} solutionVector 解向量  
     * @param {number} timeStep 時間步長
     * @param {number} currentTime 當前時間
     * @param {Map<string, number>} nodeMap 節點映射
     * @param {Matrix} gMatrix G矩陣
     */
    updateState(nodeVoltages, solutionVector, timeStep, currentTime, nodeMap, gMatrix) {
        // 獲取陽極和陰極電壓
        const anodeVoltage = nodeVoltages.get(this.anode) || 0;
        const cathodeVoltage = nodeVoltages.get(this.cathode) || 0;
        const vak = anodeVoltage - cathodeVoltage;
        
        // 計算通過二極體的電流
        const resistance = this.getEquivalentResistance(vak);
        const current = vak / resistance;
        
        // 更新內部狀態
        this.anodeCathodeVoltage = vak;
        this.current = current;
        this.isForwardBiased = vak > this.Vf;
        
        // 調試輸出
        if (Math.abs(vak) > 0.1 || this.isForwardBiased) {
            console.log(`  [${this.name}] updateState: 陽極=${anodeVoltage.toFixed(3)}V, 陰極=${cathodeVoltage.toFixed(3)}V`);
            console.log(`  [${this.name}] updateState: VAK=${vak.toFixed(3)}V, 電流=${current.toFixed(6)}A, 狀態=${this.isForwardBiased ? 'ON' : 'OFF'}`);
        }
    }

    /**
     * 更新元件狀態 (舊版接口，保持向後兼容)
     * @param {number} vak 陽極-陰極電壓
     * @param {number} iak 陽極到陰極電流
     */
    updateStateOld(vak, iak) {
        this.anodeCathodeVoltage = vak;
        this.current = iak;
        
        // 更新導通狀態
        this.isForwardBiased = vak > this.Vf;
    }

    /**
     * 更新歷史狀態 (在每個時間步結束時調用)
     * @param {Map<string, number>} nodeVoltages 節點電壓
     * @param {Map<string, number>} branchCurrents 支路電流
     */
    updateHistory(nodeVoltages, branchCurrents) {
        // 調用基類方法
        super.updateHistory(nodeVoltages, branchCurrents);
        
        // 計算陽極-陰極電壓
        const anodeVoltage = nodeVoltages.get(this.anode) || 0;
        const cathodeVoltage = nodeVoltages.get(this.cathode) || 0;
        const vak = anodeVoltage - cathodeVoltage;
        
        // 計算電流 (使用歐姆定律)
        const resistance = this.getEquivalentResistance(vak);
        const current = vak / resistance;
        
        // 更新狀態
        this.updateState(vak, current);
    }

    /**
     * 檢查是否需要電流變數 (對於理想二極體，通常不需要)
     * @returns {boolean}
     */
    needsCurrentVariable() {
        return false;
    }

    /**
     * 獲取元件資訊字串
     * @returns {string}
     */
    toString() {
        return `${this.name} (Diode): A=${this.anode} K=${this.cathode}, ` +
               `State=${this.isForwardBiased ? 'ON' : 'OFF'}, Vf=${this.Vf}V, Ron=${this.Ron}Ω`;
    }

    /**
     * 獲取詳細的工作狀態
     * @returns {Object}
     */
    getOperatingStatus() {
        return {
            name: this.name,
            type: 'Diode',
            state: this.isForwardBiased ? 'ON' : 'OFF',
            anodeCathodeVoltage: this.anodeCathodeVoltage,
            current: this.current,
            voltageDrop: this.getVoltageDrop(),
            currentResistance: this.getEquivalentResistance(this.anodeCathodeVoltage),
            isForwardBiased: this.isForwardBiased
        };
    }

    /**
     * 序列化為 JSON
     * @returns {Object}
     */
    toJSON() {
        return {
            ...super.toJSON(),
            Vf: this.Vf,
            Ron: this.Ron,
            Roff: this.Roff,
            operatingStatus: this.getOperatingStatus()
        };
    }

    /**
     * 復製二極體
     * @returns {Diode}
     */
    clone() {
        return new Diode(this.name, this.nodes, {
            Vf: this.Vf,
            Ron: this.Ron,
            Roff: this.Roff
        });
    }
}