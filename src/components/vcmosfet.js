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
     * 體二極體是從 Source 到 Drain 的內建二極體
     * @returns {boolean}
     */
    isBodyDiodeOn() {
        // 體二極體：source 到 drain（對於 NMOS）
        if (this.modelType === 'NMOS') {
            // 當 Vs > Vd + Vf 時，體二極體導通（電流從 source 流向 drain）
            return (-this.Vds) > this.Vf_body;
        } else {
            // 對於 PMOS，體二極體方向相反
            return this.Vds > this.Vf_body;
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
        
        // === 1. MOSFET 通道模型 ===
        const channelResistance = this.getEquivalentResistance();
        const channelConductance = 1 / channelResistance;
        
        // 印花 MOSFET 通道電阻 (drain-source)
        if (drainIndex >= 0) {
            matrix.addAt(drainIndex, drainIndex, channelConductance);
            if (sourceIndex >= 0) {
                matrix.addAt(drainIndex, sourceIndex, -channelConductance);
            }
        }
        
        if (sourceIndex >= 0) {
            matrix.addAt(sourceIndex, sourceIndex, channelConductance);
            if (drainIndex >= 0) {
                matrix.addAt(sourceIndex, drainIndex, -channelConductance);
            }
        }
        
        // === 2. 體二極體模型 ===
        // 體二極體是從 source 到 drain 的反向並聯二極體
        // 導通條件：Vs - Vd > Vf_body (源極電壓高於汲極電壓 + 順向壓降)
        
        // 檢查體二極體是否應該導通
        const bodyDiodeOn = this.isBodyDiodeOn();
        
        if (bodyDiodeOn) {
            // 體二極體導通：建模為理想電壓源 + 串聯電阻
            // 等效電路：從 source 到 drain，壓降 = Vf_body
            
            const diodeConductance = 1 / this.Ron_body;
            
            // 添加體二極體的導納矩陣 (與通道並聯)
            if (drainIndex >= 0) {
                matrix.addAt(drainIndex, drainIndex, diodeConductance);
                if (sourceIndex >= 0) {
                    matrix.addAt(drainIndex, sourceIndex, -diodeConductance);
                }
            }
            
            if (sourceIndex >= 0) {
                matrix.addAt(sourceIndex, sourceIndex, diodeConductance);
                if (drainIndex >= 0) {
                    matrix.addAt(sourceIndex, drainIndex, -diodeConductance);
                }
            }
            
            // 添加體二極體的電壓源項到右側向量
            // 電流 = G * (Vs - Vd - Vf_body)
            // 重新排列：G * Vs - G * Vd = G * Vf_body
            // 右側項：drain 節點 = -G * Vf_body, source 節點 = +G * Vf_body
            
            const voltageTerm = diodeConductance * this.Vf_body;
            
            if (drainIndex >= 0) {
                rhs.addAt(drainIndex, -voltageTerm);
            }
            if (sourceIndex >= 0) {
                rhs.addAt(sourceIndex, voltageTerm);
            }
        }
        
        // 調試輸出（簡化）
        if (this.name === 'M1' && bodyDiodeOn) {
            console.log(`${this.name}: Body diode ON, Vds=${this.Vds.toFixed(2)}V, Channel R=${channelResistance.toExponential(1)}Ω`);
        }
    }

    /**
     * 從上一時間步的節點電壓更新狀態（在蓋章前調用）
     */
    updateFromPreviousVoltages() {
        if (!this.previousNodeVoltages) {
            // 第一次調用，使用初始條件
            this.Vgs = 0;
            this.Vds = 0;
            this.Vbs = 0;
            this.updateOperatingRegion();
            this.calculateDrainCurrent();
            return;
        }
        
        const Vg = this.previousNodeVoltages.get(this.gate) || 0;
        const Vd = this.previousNodeVoltages.get(this.drain) || 0;
        const Vs = this.previousNodeVoltages.get(this.source) || 0;
        const Vb = this.previousNodeVoltages.get(this.bulk) || Vs;
        
        this.Vgs = Vg - Vs;
        this.Vds = Vd - Vs;
        this.Vbs = Vb - Vs;
        this.updateOperatingRegion();
        this.calculateDrainCurrent();
    }

    /**
     * 更新元件歷史狀態（在每個時間步求解後調用）
     * @param {Map} nodeVoltages 節點電壓映射
     * @param {Map} branchCurrents 支路電流映射
     */
    updateHistory(nodeVoltages, branchCurrents) {
        // 保存當前節點電壓供下一時間步使用
        this.previousNodeVoltages = new Map(nodeVoltages);
        
        // 🔥 關鍵修正：在每個時間步後更新 MOSFET 的工作狀態
        this.updateVoltages(nodeVoltages);
        
        // 調用父類的 updateHistory
        super.updateHistory(nodeVoltages, branchCurrents);
    }

    /**
     * 設置閘極狀態（由控制器調用）
     * @param {boolean} state 閘極狀態（true=ON, false=OFF）
     */
    setGateState(state) {
        // 這個方法由 solver 的 updateControlInputs 調用
        // 我們可以在這裡設置閘極電壓，但實際上閘極電壓由 VoltageSource 控制
        // 因此這個方法主要用於觸發狀態更新
        this.gateState = state;
        
        // 觸發電壓和工作狀態更新
        // 注意：這裡無法獲取實際的節點電壓，需要等到 stamp 時再更新
    }

    /**
     * 檢查是否需要電流變數
     * @returns {boolean}
     */
    needsCurrentVariable() {
        return false; // 使用等效電阻模型，不需要額外電流變數
    }

    /**
     * 計算通過MOSFET的電流
     * @param {Map<string, number>} nodeVoltages 節點電壓
     * @returns {number} 汲極電流 (安培)，正值表示從drain流向source
     */
    getCurrent(nodeVoltages) {
        // 更新電壓
        this.updateVoltages(nodeVoltages);
        
        // 更新操作點
        this.operatingPoint.current = this.Id;
        
        return this.Id;
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