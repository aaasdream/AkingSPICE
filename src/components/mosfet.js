/**
 * MOSFET 元件模型 (專為電力電子控制模擬設計)
 * 
 * 特點：
 * - 外部可控的 ON/OFF 狀態 (不依賴 Vgs)
 * - 內建體二極體模型
 * - 適用於 PWM 控制系統模擬
 */

import { BaseComponent } from './base.js';

/**
 * 理想 MOSFET 開關模型
 * 
 * 這個模型專為電力電子控制模擬設計，重點是：
 * 1. 開關狀態由外部控制器決定，而不是 Vgs
 * 2. 包含並聯的體二極體
 * 3. 支援快速狀態切換
 */
export class MOSFET extends BaseComponent {
    /**
     * @param {string} name MOSFET名稱 (如 'M1', 'Q1')
     * @param {string[]} nodes 連接節點 [drain, source, gate] (gate節點在此模型中僅用於標識)
     * @param {Object} params 參數 {Ron, Roff, Vf_diode, Von_diode}
     */
    constructor(name, nodes, params = {}) {
        // 對於 MNA 分析，MOSFET 只需要2個節點 (drain, source)
        // gate 節點僅用於模型內部管理，不參與矩陣構建
        const mnaNodes = nodes.length >= 3 ? [nodes[0], nodes[1]] : nodes;
        super(name, 'M', mnaNodes, 0, params);
        
        if (nodes.length < 2) {
            throw new Error(`MOSFET ${name} must have at least 2 nodes: [drain, source], optional gate`);
        }
        
        // MOSFET 開關參數 - 使用 BaseComponent 的 parseValue 方法解析工程記號
        this.Ron = this.parseValue(params.Ron) || 1e-3;        // 導通電阻 (默認 1mΩ)
        this.Roff = this.parseValue(params.Roff) || 1e6;       // 關斷電阻 (默認 1MΩ，不要太大)
        
        // 體二極體參數
        this.Vf_diode = this.parseValue(params.Vf_diode) || 0.7;     // 二極體順向電壓 (默認 0.7V)
        this.Von_diode = this.parseValue(params.Von_diode) || 0.001;  // 二極體導通電阻 (默認 1mΩ)
        this.Roff_diode = this.parseValue(params.Roff_diode) || 1e6; // 二極體反向電阻 (默認 1MΩ)
        
        // 控制狀態
        this.gateState = false; // false = OFF, true = ON
        this.isExtControlled = true; // 標記這是外部控制的開關
        
        // 節點分配
        this.drain = nodes[0];
        this.source = nodes[1]; 
        this.gate = nodes[2] || null;   // 可選的gate節點，僅用於標識
        
        // 狀態追蹤
        this.mosfetCurrent = 0;
        this.diodeCurrent = 0;
        this.totalCurrent = 0;
        this.drainSourceVoltage = 0;
    }

    /**
     * 設置 MOSFET 開關狀態 (外部控制接口)
     * @param {boolean} state true = ON, false = OFF
     */
    setGateState(state) {
        this.gateState = Boolean(state);
    }

    /**
     * 獲取當前開關狀態
     * @returns {boolean}
     */
    getGateState() {
        return this.gateState;
    }

    /**
     * 計算 MOSFET 通道的等效電阻
     * @returns {number} 等效電阻 (歐姆)
     */
    getMOSFETResistance() {
        return this.gateState ? this.Ron : this.Roff;
    }

    /**
     * 計算體二極體的等效電阻
     * @param {number} vds Drain-Source 電壓 (V)
     * @returns {number} 等效電阻 (歐姆)
     */
    getBodyDiodeResistance(vds) {
        // 體二極體：當 Vs > Vd + Vf 時導通 (即 vds < -Vf)
        const isDiodeForward = vds < -this.Vf_diode;
        return isDiodeForward ? this.Von_diode : this.Roff_diode;
    }

    /**
     * 計算總的等效電阻 (MOSFET 通道與體二極體並聯)
     * @param {number} vds Drain-Source 電壓 (V)
     * @returns {number} 等效電阻 (歐姆)
     */
    getEquivalentResistance(vds) {
        const rMosfet = this.getMOSFETResistance();
        const rDiode = this.getBodyDiodeResistance(vds);
        
        // 並聯電阻計算: 1/Rtotal = 1/R1 + 1/R2
        const rTotal = 1 / (1/rMosfet + 1/rDiode);
        return rTotal;
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
        const drainIndex = this.drain === '0' || this.drain === 'gnd' ? -1 : nodeMap.get(this.drain);
        const sourceIndex = this.source === '0' || this.source === 'gnd' ? -1 : nodeMap.get(this.source);
        
        if (drainIndex === undefined || sourceIndex === undefined) {
            throw new Error(`MOSFET ${this.name}: Node mapping not found (drain: ${this.drain}, source: ${this.source})`);
        }

        // 獲取當前 Drain-Source 電壓 (初始化時為0)
        let vds = 0;
        if (this.drainSourceVoltage !== undefined) {
            vds = this.drainSourceVoltage;
        }

        const resistance = this.getEquivalentResistance(vds);
        const conductance = 1 / resistance;

        // 印花導納矩陣 (類似電阻的印花方式)
        // 接地節點 (index = -1) 不需要印花到矩陣中
        if (drainIndex >= 0) {
            matrix.addAt(drainIndex, drainIndex, conductance);
            if (sourceIndex >= 0) {
                matrix.addAt(drainIndex, sourceIndex, -conductance);
            }
        }
        
        if (sourceIndex >= 0) {
            matrix.addAt(sourceIndex, sourceIndex, conductance);
            if (drainIndex >= 0) {
                matrix.addAt(sourceIndex, drainIndex, -conductance);
            }
        }
    }

    /**
     * 更新元件狀態 (在每個時間步後調用)
     * @param {number} vds Drain-Source 電壓
     * @param {number} ids Drain-Source 電流
     */
    updateState(vds, ids) {
        this.drainSourceVoltage = vds;
        this.totalCurrent = ids;
        
        // 估算通道電流和二極體電流的分配
        const rMosfet = this.getMOSFETResistance();
        const rDiode = this.getBodyDiodeResistance(vds);
        const rTotal = this.getEquivalentResistance(vds);
        
        // 電流分配 (基於並聯電阻的電流分割)
        this.mosfetCurrent = ids * (rTotal / rMosfet);
        this.diodeCurrent = ids * (rTotal / rDiode);
    }

    /**
     * 檢查是否需要電流變數 (對於理想開關，通常不需要)
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
        const gateInfo = this.gate ? ` G=${this.gate}` : ' (Ext. Control)';
        return `${this.name} (MOSFET): D=${this.drain} S=${this.source}${gateInfo}, ` +
               `State=${this.gateState ? 'ON' : 'OFF'}, Ron=${this.Ron}Ω, Roff=${this.Roff}Ω`;
    }

    /**
     * 獲取詳細的工作狀態
     * @returns {Object}
     */
    getOperatingStatus() {
        return {
            name: this.name,
            type: 'MOSFET',
            gateState: this.gateState ? 'ON' : 'OFF',
            drainSourceVoltage: this.drainSourceVoltage,
            totalCurrent: this.totalCurrent,
            mosfetCurrent: this.mosfetCurrent,
            diodeCurrent: this.diodeCurrent,
            currentResistance: this.getEquivalentResistance(this.drainSourceVoltage),
            bodyDiodeActive: this.drainSourceVoltage < -this.Vf_diode
        };
    }

    /**
     * 序列化為 JSON
     * @returns {Object}
     */
    toJSON() {
        return {
            ...super.toJSON(),
            gateState: this.gateState,
            Ron: this.Ron,
            Roff: this.Roff,
            Vf_diode: this.Vf_diode,
            Von_diode: this.Von_diode,
            operatingStatus: this.getOperatingStatus()
        };
    }

    /**
     * 復製 MOSFET
     * @returns {MOSFET}
     */
    clone() {
        const cloned = new MOSFET(this.name, this.nodes, {
            Ron: this.Ron,
            Roff: this.Roff,
            Vf_diode: this.Vf_diode,
            Von_diode: this.Von_diode,
            Roff_diode: this.Roff_diode
        });
        cloned.setGateState(this.gateState);
        return cloned;
    }
}