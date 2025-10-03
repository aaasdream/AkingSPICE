/**
 * Diode 元件模型 (簡化的指數二極體模型)
 * 
 * 使用 Shockley 方程的線性化近似：
 * I = Is * (exp(V/(n*Vt)) - 1) ≈ G * (V - Vf) for V > Vf
 * 其中：Is = 反向飽和電流，n = 理想性因子，Vt = 熱電壓
 */

import { BaseComponent } from './base.js';

/**
 * 簡化二極體模型
 * 
 * 模型特點：
 * 1. V > Vf 時：線性導通，I = (V - Vf) / Rs
 * 2. V <= Vf 時：截止，I ≈ 0 (使用高電阻)
 * 3. 適合 DC 和暫態分析
 */
export class Diode extends BaseComponent {
    /**
     * @param {string} name 二極體名稱
     * @param {string[]} nodes 連接節點 [anode, cathode]
     * @param {Object} params 參數 {Vf, Rs, Is}
     */
    constructor(name, nodes, params = {}) {
        super(name, 'D', nodes, 0, params);
        
        if (nodes.length < 2) {
            throw new Error(`Diode ${name} must have 2 nodes: [anode, cathode]`);
        }
        
        // 二極體參數
        this.Vf = this.safeParseValue(params.Vf, 0.7);        // 順向偏壓電壓 (V)
        this.Rs = this.safeParseValue(params.Rs, 10);         // 串聯電阻 (Ω)
        this.Is = this.safeParseValue(params.Is, 1e-12);      // 反向飽和電流 (A)
        this.Roff = 1e9;  // 截止時的高電阻
        
        // 節點分配
        this.anode = nodes[0];
        this.cathode = nodes[1];
        
        // 狀態
        this.isForwardBiased = false;
        this.anodeCathodeVoltage = 0;
        this.current = 0;
        
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
        if (this.Rs <= 0) {
            throw new Error(`Diode ${this.name}: Series resistance Rs must be positive`);
        }
        if (this.Vf < 0) {
            throw new Error(`Diode ${this.name}: Forward voltage Vf must be non-negative`);
        }
        if (this.Is <= 0) {
            throw new Error(`Diode ${this.name}: Saturation current Is must be positive`);
        }
    }

    /**
     * 計算二極體的動態電阻 (小訊號電阻)
     * @param {number} vd 二極體電壓 (V)
     * @returns {number} 動態電阻 (Ω)
     */
    getDynamicResistance(vd) {
        if (vd > this.Vf - 0.1) {  // 接近或超過順向偏壓
            this.isForwardBiased = true;
            // 導通區域的動態電阻：rd = Rs + Vt/Id
            // 簡化為：rd ≈ Rs (忽略熱電壓項)
            return this.Rs;
        } else {
            this.isForwardBiased = false;
            // 截止區域：使用高電阻
            return this.Roff;
        }
    }

    /**
     * 檢查二極體是否處於導通狀態
     * @returns {boolean}
     */
    isOn() {
        return this.isForwardBiased;
    }

    /**
     * 計算二極體電流 (使用線性化的 Shockley 方程)
     * @param {number} vd 二極體電壓 (V)
     * @returns {number} 二極體電流 (A)
     */
    getDiodeCurrent(vd) {
        if (vd > this.Vf - 0.1) {
            // 順向導通：I = (V - Vf) / Rs
            return (vd - this.Vf) / this.Rs;
        } else {
            // 截止：I ≈ -Is (反向飽和電流)
            return -this.Is;
        }
    }

    /**
     * MNA 印花方法 - 使用伴隨模型 (Companion Model)
     * 
     * 二極體的 Norton 等效模型：
     * Geq = 1/Rd (動態電導)
     * Ieq = Id - Vd*Geq (等效電流源)
     */
    stamp(matrix, rhs, nodeMap, voltageSourceMap, time) {
        const anodeIndex = this.anode === '0' || this.anode === 'gnd' ? -1 : nodeMap.get(this.anode);
        const cathodeIndex = this.cathode === '0' || this.cathode === 'gnd' ? -1 : nodeMap.get(this.cathode);
        
        if (anodeIndex === undefined || cathodeIndex === undefined) {
            throw new Error(`Diode ${this.name}: Node mapping not found`);
        }

        // 使用前一次迭代的電壓值
        let vd = this.anodeCathodeVoltage || 0;
        
        // 計算動態電阻和電流
        const rd = this.getDynamicResistance(vd);
        const id = this.getDiodeCurrent(vd);
        const gd = 1 / rd;
        
        // Norton 等效電流源：Ieq = Id - Vd * Gd
        const ieq = id - vd * gd;
        
        // 印花電導矩陣
        if (anodeIndex >= 0) {
            matrix.addAt(anodeIndex, anodeIndex, gd);
            if (cathodeIndex >= 0) {
                matrix.addAt(anodeIndex, cathodeIndex, -gd);
            }
        }
        
        if (cathodeIndex >= 0) {
            matrix.addAt(cathodeIndex, cathodeIndex, gd);
            if (anodeIndex >= 0) {
                matrix.addAt(cathodeIndex, anodeIndex, -gd);
            }
        }

        // 印花等效電流源
        if (Math.abs(ieq) > 1e-15) {  // 避免數值雜訊
            if (anodeIndex >= 0) {
                rhs[anodeIndex] += ieq;
            }
            if (cathodeIndex >= 0) {
                rhs[cathodeIndex] += -ieq;
            }
        }
        
        // 除錯輸出
        if (Math.abs(vd) > 0.01 || Math.abs(ieq) > 1e-9) {
            console.log(`  [${this.name}] Vd=${vd.toFixed(3)}V, Id=${id.toExponential(2)}A, Rd=${rd.toFixed(1)}Ω, Ieq=${ieq.toExponential(2)}A`);
        }
    }





    /**
     * 更新歷史狀態
     */
    updateHistory(nodeVoltages, branchCurrents) {
        super.updateHistory(nodeVoltages, branchCurrents);
        
        // 計算二極體電壓
        const anodeV = nodeVoltages.get(this.anode) || 0;
        const cathodeV = nodeVoltages.get(this.cathode) || 0;
        const vd = anodeV - cathodeV;
        
        // 計算二極體電流
        const id = this.getDiodeCurrent(vd);
        
        // 更新狀態
        this.updateState(vd, id);
    }

    /**
     * 更新二極體狀態
     */
    updateState(voltage, current) {
        this.anodeCathodeVoltage = voltage;
        this.current = current;
        this.isForwardBiased = voltage > this.Vf - 0.1;
    }

    /**
     * 計算殘差向量 - 簡化的二極體伴隨模型
     * 使用 Norton 等效：Geq * V - Ieq = 0
     */
    stampResidual(residual, nodeVoltages, nodeMap) {
        const anodeIndex = this.anode === '0' || this.anode === 'gnd' ? -1 : nodeMap.get(this.anode);
        const cathodeIndex = this.cathode === '0' || this.cathode === 'gnd' ? -1 : nodeMap.get(this.cathode);
        
        if (anodeIndex === undefined || cathodeIndex === undefined) return;
        
        // 提取節點電壓
        const anodeV = (anodeIndex >= 0) ? nodeVoltages.get(anodeIndex) : 0;
        const cathodeV = (cathodeIndex >= 0) ? nodeVoltages.get(cathodeIndex) : 0;
        const vd = anodeV - cathodeV;
        
        // Norton 等效模型
        const gd = this.getDynamicConductance(vd);
        const ieq = this.getEquivalentCurrent(vd);
        
        // 殘差：I_node = G * V - I_eq
        const currentResidual = gd * vd - ieq;
        
        console.log(`  [${this.name}] Residual: Vd=${vd.toFixed(3)}V, Gd=${gd.toExponential(2)}S, Ieq=${ieq.toExponential(2)}A, Residual=${currentResidual.toExponential(2)}A`);
        
        // 印花到殘差向量
        if (anodeIndex >= 0) {
            residual.set(anodeIndex, residual.get(anodeIndex) + currentResidual);
        }
        if (cathodeIndex >= 0) {
            residual.set(cathodeIndex, residual.get(cathodeIndex) - currentResidual);
        }
    }

    /**
     * 計算雅可比矩陣 - 對殘差關於電壓的偏導數
     * ∂(G*V - Ieq)/∂V = G + V*∂G/∂V - ∂Ieq/∂V ≈ G (簡化)
     */
    stampJacobian(jacobian, nodeVoltages, nodeMap) {
        const anodeIndex = this.anode === '0' || this.anode === 'gnd' ? -1 : nodeMap.get(this.anode);
        const cathodeIndex = this.cathode === '0' || this.cathode === 'gnd' ? -1 : nodeMap.get(this.cathode);
        
        if (anodeIndex === undefined || cathodeIndex === undefined) return;
        
        // 提取當前電壓
        const anodeV = (anodeIndex >= 0) ? nodeVoltages.get(anodeIndex) : 0;
        const cathodeV = (cathodeIndex >= 0) ? nodeVoltages.get(cathodeIndex) : 0; 
        const vd = anodeV - cathodeV;
        
        // 雅可比項：∂residual/∂V ≈ G
        const gd = this.getDynamicConductance(vd);
        
        // 印花雅可比矩陣
        if (anodeIndex >= 0) {
            jacobian.addAt(anodeIndex, anodeIndex, gd);
            if (cathodeIndex >= 0) {
                jacobian.addAt(anodeIndex, cathodeIndex, -gd);
            }
        }
        
        if (cathodeIndex >= 0) {
            jacobian.addAt(cathodeIndex, cathodeIndex, gd);
            if (anodeIndex >= 0) {
                jacobian.addAt(cathodeIndex, anodeIndex, -gd);
            }
        }
    }

    /**
     * 計算動態電導 (∂I/∂V)
     */
    getDynamicConductance(vd) {
        if (vd > this.Vf - 0.1) {
            // 導通區域：gd = 1/Rs
            return 1 / this.Rs;
        } else {
            // 截止區域：gd = 1/Roff
            return 1 / this.Roff;
        }
    }

    /**
     * 計算 Norton 等效電流源
     * Ieq = Id - Vd*Gd (使前一次迭代的電流線性化)
     */
    getEquivalentCurrent(vd) {
        const id = this.getDiodeCurrent(vd);
        const gd = this.getDynamicConductance(vd);
        return id - vd * gd;
    }

    /**
     * 檢查是否需要電流變數
     */
    needsCurrentVariable() {
        return false;
    }

    /**
     * 獲取元件資訊字串
     */
    toString() {
        return `${this.name} (Diode): A=${this.anode} K=${this.cathode}, ` +
               `State=${this.isForwardBiased ? 'ON' : 'OFF'}, Vf=${this.Vf}V, Rs=${this.Rs}Ω`;
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