/**
 * 電壓控制 MOSFET 模型 - 基於閘極電壓自動決定導通狀態
 * 
 * 特點：
 * - 基於 Vgs 閾值電壓自動切換導通狀態
 * - 支援線性區和飽和區模型
 * - 包含體二極體和寄生電容
 * - 適用於閘極驅動電路分析
 */

import { BaseComponent } from './base.js';

/**
 * 電壓控制 MOSFET
 * 
 * 這個模型實現了：
 * 1. 根據 Vgs 自動決定 ON/OFF 狀態
 * 2. 閾值電壓 (Vth) 和跨導 (gm) 特性
 * 3. 線性區和飽和區行為
 * 4. 寄生效應（體二極體、電容）
 */
export class VoltageControlledMOSFET extends BaseComponent {
    /**
     * @param {string} name MOSFET名稱 (如 'M1', 'Q1')
     * @param {string[]} nodes 連接節點 [drain, gate, source] 或 [drain, gate, source, bulk]
     * @param {Object} params MOSFET參數
     * @param {Object} modelParams 額外模型參數
     * 
     * 主要參數：
     * - Vth: 閾值電壓 (V)
     * - Kp: 跨導參數 (A/V²)
     * - W/L: 寬長比
     * - Ron: 導通電阻 (Ω)
     * - Vf_body: 體二極體順向電壓 (V)
     */
    constructor(name, nodes, params = {}, modelParams = {}) {
        super(name, 'VM', nodes, 0, { ...params, ...modelParams });
        
        if (nodes.length < 3 || nodes.length > 4) {
            throw new Error(`VoltageControlledMOSFET ${name} must have 3 or 4 nodes: [drain, gate, source] or [drain, gate, source, bulk]`);
        }
        
        // 節點分配
        this.drain = nodes[0];
        this.gate = nodes[1];
        this.source = nodes[2];
        this.bulk = nodes[3] || nodes[2]; // 如果沒有指定 bulk，預設接 source
        
        // MOSFET 基本參數
        this.Vth = this.safeParseValue(params.Vth, 2.0);        // 閾值電壓 (V)
        this.Kp = this.safeParseValue(params.Kp, 100e-6);      // 跨導參數 (A/V²)
        this.W = this.safeParseValue(params.W, 100e-6);        // 通道寬度 (m)
        this.L = this.safeParseValue(params.L, 10e-6);         // 通道長度 (m)
        this.lambda = this.safeParseValue(params.lambda, 0);   // 通道長度調制參數 (V⁻¹)
        
        // 寄生參數
        this.Ron = this.safeParseValue(params.Ron, 0.1);       // 導通電阻 (Ω)
        this.Roff = this.safeParseValue(params.Roff, 1e9);     // 關斷電阻 (Ω)
        this.Vf_body = this.safeParseValue(params.Vf_body, 0.7); // 體二極體順向電壓 (V)
        this.Ron_body = this.safeParseValue(params.Ron_body, 0.01); // 體二極體導通電阻 (Ω)
        
        // 電容參數 (暫時簡化，不在 MNA 中處理)
        this.Cgs = this.safeParseValue(params.Cgs, 1e-12);     // 閘源電容 (F)
        this.Cgd = this.safeParseValue(params.Cgd, 1e-12);     // 閘汲電容 (F) 
        this.Cds = this.safeParseValue(params.Cds, 1e-12);     // 汲源電容 (F)
        
        // 模型類型
        this.modelType = params.modelType || 'NMOS'; // 'NMOS' 或 'PMOS'
        this.operatingRegion = 'OFF'; // 'OFF', 'LINEAR', 'SATURATION'
        
        // 狀態變數
        this.Vgs = 0;  // 閘源電壓
        this.Vds = 0;  // 汲源電壓
        this.Vbs = 0;  // 體源電壓
        this.Id = 0;   // 汲極電流
        
        // 驗證參數
        this.validate();
    }

    /**
     * 安全地解析數值參數
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
     * 更新 MOSFET 的工作電壓
     * @param {Map} nodeVoltages 節點電壓映射
     */
    updateVoltages(nodeVoltages) {
        const Vd = nodeVoltages.get(this.drain) || 0;
        const Vg = nodeVoltages.get(this.gate) || 0;
        const Vs = nodeVoltages.get(this.source) || 0;
        const Vb = nodeVoltages.get(this.bulk) || Vs;
        
        this.Vgs = Vg - Vs;
        this.Vds = Vd - Vs;
        this.Vbs = Vb - Vs;
        
        // 更新工作區域和電流
        this.updateOperatingRegion();
        this.calculateDrainCurrent();
    }

    /**
     * 判斷 MOSFET 工作區域
     */
    updateOperatingRegion() {
        const effectiveVth = this.getEffectiveThresholdVoltage();
        
        if (this.modelType === 'NMOS') {
            if (this.Vgs < effectiveVth) {
                this.operatingRegion = 'OFF';
            } else if (this.Vds < (this.Vgs - effectiveVth)) {
                this.operatingRegion = 'LINEAR';
            } else {
                this.operatingRegion = 'SATURATION';
            }
        } else { // PMOS
            if (this.Vgs > effectiveVth) {
                this.operatingRegion = 'OFF';
            } else if (this.Vds > (this.Vgs - effectiveVth)) {
                this.operatingRegion = 'LINEAR';
            } else {
                this.operatingRegion = 'SATURATION';
            }
        }
    }

    /**
     * 獲取有效閾值電壓（考慮體效應）
     * @returns {number} 有效閾值電壓 (V)
     */
    getEffectiveThresholdVoltage() {
        // 簡化的體效應模型：Vth_eff = Vth + γ * (sqrt(|Vbs| + 2φf) - sqrt(2φf))
        // 這裡使用簡化版本，忽略體效應
        return this.Vth;
    }

    /**
     * 計算汲極電流
     */
    calculateDrainCurrent() {
        const effectiveVth = this.getEffectiveThresholdVoltage();
        const beta = this.Kp * this.W / this.L; // 跨導參數
        
        switch (this.operatingRegion) {
            case 'OFF':
                this.Id = 0;
                break;
                
            case 'LINEAR':
                // 線性區：Id = β * [(Vgs - Vth) * Vds - Vds²/2] * (1 + λ * Vds)
                const Vov = this.Vgs - effectiveVth; // 過驅動電壓
                this.Id = beta * (Vov * this.Vds - this.Vds * this.Vds / 2) * (1 + this.lambda * this.Vds);
                break;
                
            case 'SATURATION':
                // 飽和區：Id = β/2 * (Vgs - Vth)² * (1 + λ * Vds)
                const Vov_sat = this.Vgs - effectiveVth;
                this.Id = (beta / 2) * Vov_sat * Vov_sat * (1 + this.lambda * this.Vds);
                break;
        }
        
        // 確保電流方向正確（NMOS vs PMOS）
        if (this.modelType === 'PMOS') {
            this.Id = -this.Id;
        }
    }

    /**
     * 獲取等效電阻（用於 MNA 分析的簡化模型）
     * @returns {number} 等效電阻 (Ω)
     */
    getEquivalentResistance() {
        if (this.operatingRegion === 'OFF') {
            return this.Roff;
        } else {
            // 使用導通電阻作為簡化模型
            // 在實際應用中，這裡應該根據工作點計算小信號電阻
            return this.Ron;
        }
    }

    /**
     * 檢查體二極體是否導通
     * @returns {boolean}
     */
    isBodyDiodeOn() {
        // 體二極體：bulk 到 source（對於 NMOS）
        if (this.modelType === 'NMOS') {
            return this.Vbs > this.Vf_body; // Vb > Vs + Vf
        } else {
            return this.Vbs < -this.Vf_body; // Vb < Vs - Vf (PMOS)
        }
    }

    /**
     * 為 MNA 分析提供印花支援
     * 使用等效電阻模型進行簡化分析
     */
    stamp(matrix, rhs, nodeMap, voltageSourceMap, time) {
        // 獲取節點索引
        const drainIndex = this.drain === '0' ? -1 : nodeMap.get(this.drain);
        const sourceIndex = this.source === '0' ? -1 : nodeMap.get(this.source);
        
        if (drainIndex === undefined || sourceIndex === undefined) {
            throw new Error(`VoltageControlledMOSFET ${this.name}: Node mapping not found`);
        }
        
        // 獲取等效電阻並計算導納
        const resistance = this.getEquivalentResistance();
        const conductance = 1 / resistance;
        
        // 印花汲源電阻
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
        
        // 如果有計算出的汲極電流，可以作為電流源處理
        if (Math.abs(this.Id) > 1e-12) {
            if (drainIndex >= 0) {
                rhs.addAt(drainIndex, -this.Id); // 電流流出汲極
            }
            if (sourceIndex >= 0) {
                rhs.addAt(sourceIndex, this.Id);  // 電流流入源極
            }
        }
        
        // 處理體二極體（如果導通）
        if (this.isBodyDiodeOn()) {
            const bulkIndex = this.bulk === '0' ? -1 : nodeMap.get(this.bulk);
            const diodeConductance = 1 / this.Ron_body;
            
            if (bulkIndex >= 0 && sourceIndex >= 0) {
                matrix.addAt(bulkIndex, bulkIndex, diodeConductance);
                matrix.addAt(bulkIndex, sourceIndex, -diodeConductance);
                matrix.addAt(sourceIndex, bulkIndex, -diodeConductance);
                matrix.addAt(sourceIndex, sourceIndex, diodeConductance);
                
                // 體二極體順向偏壓
                const diodeVoltage = this.modelType === 'NMOS' ? this.Vf_body : -this.Vf_body;
                const currentSource = diodeVoltage * diodeConductance;
                rhs.addAt(bulkIndex, -currentSource);
                rhs.addAt(sourceIndex, currentSource);
            }
        }
    }

    /**
     * 檢查是否需要電流變數
     * @returns {boolean}
     */
    needsCurrentVariable() {
        return false; // 使用等效電阻模型，不需要額外電流變數
    }

    /**
     * 驗證 MOSFET 參數
     */
    validate() {
        if (this.Kp <= 0) {
            throw new Error(`VoltageControlledMOSFET ${this.name}: Kp must be positive`);
        }
        if (this.W <= 0 || this.L <= 0) {
            throw new Error(`VoltageControlledMOSFET ${this.name}: W and L must be positive`);
        }
        if (this.Ron <= 0) {
            throw new Error(`VoltageControlledMOSFET ${this.name}: Ron must be positive`);
        }
    }

    /**
     * 獲取詳細工作狀態
     * @returns {Object}
     */
    getOperatingStatus() {
        return {
            name: this.name,
            type: 'VoltageControlledMOSFET',
            modelType: this.modelType,
            operatingRegion: this.operatingRegion,
            voltages: {
                Vgs: this.Vgs,
                Vds: this.Vds,
                Vbs: this.Vbs
            },
            current: {
                Id: this.Id
            },
            equivalentResistance: this.getEquivalentResistance(),
            bodyDiodeOn: this.isBodyDiodeOn(),
            parameters: {
                Vth: this.Vth,
                Kp: this.Kp,
                WoverL: this.W / this.L
            }
        };
    }

    /**
     * 獲取元件資訊字串
     * @returns {string}
     */
    toString() {
        return `${this.name} (${this.modelType} VC-MOSFET): D=${this.drain} G=${this.gate} S=${this.source}, ` +
               `Vth=${this.Vth}V, Region=${this.operatingRegion}, Id=${this.Id.toExponential(3)}A`;
    }

    /**
     * 復製 MOSFET
     * @returns {VoltageControlledMOSFET}
     */
    clone() {
        const nodes = [this.drain, this.gate, this.source];
        if (this.bulk !== this.source) {
            nodes.push(this.bulk);
        }
        
        return new VoltageControlledMOSFET(this.name, nodes, {
            Vth: this.Vth,
            Kp: this.Kp,
            W: this.W,
            L: this.L,
            lambda: this.lambda,
            Ron: this.Ron,
            Roff: this.Roff,
            Vf_body: this.Vf_body,
            Ron_body: this.Ron_body,
            modelType: this.modelType
        }, { ...this.params });
    }
}