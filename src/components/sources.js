/**
 * 電壓源和電流源元件模型
 * 實現各種獨立源，包括DC、AC、脈衝、正弦波等
 */

import { BaseComponent } from './base.js';

/**
 * 獨立電壓源基類
 */
export class VoltageSource extends BaseComponent {
    /**
     * @param {string} name 電壓源名稱 (如 'VIN', 'V1')
     * @param {string[]} nodes 連接節點 [正, 負]
     * @param {number|Object} source 電壓值或源描述對象
     * @param {Object} params 額外參數
     */
    constructor(name, nodes, source, params = {}) {
        // 不讓 BaseComponent 解析 value，我們自己處理
        super(name, 'V', nodes, 0, params);
        
        if (nodes.length !== 2) {
            throw new Error(`Voltage source ${name} must have exactly 2 nodes`);
        }
        
        // 保存原始源描述
        this.rawSource = source;
        
        // 解析源描述
        this.sourceConfig = this.parseSourceConfig(source);
        this.needsCurrentVar = true;
        
        // 設置默認值為 DC 值
        this.value = this.sourceConfig.dc || this.sourceConfig.amplitude || 0;
    }

    /**
     * 解析源配置
     * @param {number|Object|string} source 源描述
     * @returns {Object} 標準化的源配置
     */
    parseSourceConfig(source) {
        // 如果是數字，視為DC源
        if (typeof source === 'number') {
            return {
                type: 'DC',
                dc: source,
                amplitude: source,
                offset: source
            };
        }
        
        // 如果是字符串，解析SPICE格式
        if (typeof source === 'string') {
            return this.parseSpiceSource(source);
        }
        
        // 如果是對象，直接使用
        if (typeof source === 'object') {
            return {
                type: source.type || 'DC',
                ...source
            };
        }
        
        throw new Error(`Invalid voltage source specification: ${source}`);
    }

    /**
     * 解析SPICE格式的源描述
     * @param {string} sourceStr SPICE格式字符串
     * @returns {Object} 源配置
     */
    parseSpiceSource(sourceStr) {
        const str = sourceStr.trim().toUpperCase();
        
        // DC源: "DC(5)" 或 "5" 或 "5V" - 支援科學記號和單位後綴
        const dcMatch = str.match(/^(?:DC\()?(-?[\d.]+(?:[eE][-+]?\d+)?)(?:V)?(?:\))?$/);
        if (dcMatch) {
            const value = parseFloat(dcMatch[1]);
            return {
                type: 'DC',
                dc: value,
                amplitude: value,
                offset: value
            };
        }
        
        // 正弦波: "SINE(offset amplitude frequency delay damping)" - 支援科學記號
        const sineMatch = str.match(/^SINE\(\s*([-\d.]+(?:[eE][-+]?\d+)?)?\s*([-\d.]+(?:[eE][-+]?\d+)?)?\s*([-\d.]+(?:[eE][-+]?\d+)?)?\s*([-\d.]+(?:[eE][-+]?\d+)?)?\s*([-\d.]+(?:[eE][-+]?\d+)?)?\s*\)$/);
        if (sineMatch) {
            return {
                type: 'SINE',
                offset: parseFloat(sineMatch[1] || '0'),
                amplitude: parseFloat(sineMatch[2] || '0'),
                frequency: parseFloat(sineMatch[3] || '1'),
                delay: parseFloat(sineMatch[4] || '0'),
                damping: parseFloat(sineMatch[5] || '0')
            };
        }
        
        // 脈衝波: "PULSE(v1 v2 td tr tf pw per)" - 支援科學記號
        const pulseMatch = str.match(/^PULSE\(\s*([-\d.]+(?:[eE][-+]?\d+)?)\s+([-\d.]+(?:[eE][-+]?\d+)?)\s*([-\d.]+(?:[eE][-+]?\d+)?)?\s*([-\d.]+(?:[eE][-+]?\d+)?)?\s*([-\d.]+(?:[eE][-+]?\d+)?)?\s*([-\d.]+(?:[eE][-+]?\d+)?)?\s*([-\d.]+(?:[eE][-+]?\d+)?)?\s*\)$/);
        if (pulseMatch) {
            return {
                type: 'PULSE',
                v1: parseFloat(pulseMatch[1]),
                v2: parseFloat(pulseMatch[2]),
                td: parseFloat(pulseMatch[3] || '0'),      // 延遲時間
                tr: parseFloat(pulseMatch[4] || '1e-9'),   // 上升時間
                tf: parseFloat(pulseMatch[5] || '1e-9'),   // 下降時間
                pw: parseFloat(pulseMatch[6] || '1e-6'),   // 脈寬
                per: parseFloat(pulseMatch[7] || '2e-6')   // 周期
            };
        }
        
        throw new Error(`Cannot parse voltage source: ${sourceStr}`);
    }

    /**
     * 檢查此元件是否需要額外的電流變數
     * @returns {boolean}
     */
    needsCurrentVariable() {
        return true;
    }

    // ==================== 顯式狀態更新法接口 ====================
    
    /**
     * 電壓源預處理 - 在顯式方法中需要特殊處理
     * 理想電壓源會破壞G矩陣的對稱正定性
     * 這裡使用大導納近似法
     * @param {CircuitPreprocessor} preprocessor 預處理器
     */
    preprocess(preprocessor) {
        // 獲取節點索引
        const node1 = preprocessor.getNodeIndex(this.nodes[0]);
        const node2 = preprocessor.getNodeIndex(this.nodes[1]);
        
        // 🔥 核心修正：使用標準大導納法確保G矩陣非奇異
        // 對於理想電壓源，使用更大的導納值
        const largeAdmittance = 1e6;  // 工業標準值，確保理想電壓源約束
        
        if (node1 >= 0) {
            preprocessor.addConductance(node1, node1, largeAdmittance);
            if (node2 >= 0) {
                preprocessor.addConductance(node1, node2, -largeAdmittance);
            }
        }
        
        if (node2 >= 0) {
            preprocessor.addConductance(node2, node2, largeAdmittance);
            if (node1 >= 0) {
                preprocessor.addConductance(node2, node1, -largeAdmittance);
            }
        }
        
        this.largeAdmittance = largeAdmittance;
        
        // 記錄節點索引供updateRHS使用
        this.node1Idx = node1;
        this.node2Idx = node2;
    }

    /**
     * 更新RHS向量 - 電壓源的等效電流源貢獻
     * 使用標準大導納法：I_eq = V(t) * G_large
     * @param {Float32Array} rhsVector RHS向量
     * @param {Float32Array} stateVector 狀態向量
     * @param {number} time 當前時間
     * @param {object} componentData 組件數據
     */
    updateRHS(rhsVector, stateVector, time, componentData) {
        // 使用預處理時記錄的節點索引
        const node1Idx = this.node1Idx;
        const node2Idx = this.node2Idx;
        
        // 獲取當前電壓值
        const voltage = this.getValue(time);
        
        // 🔥 核心修正：計算等效電流源貢獻 I_eq = V(t) * G_large
        // 這是標準大導納法的RHS項
        const currentContribution = this.largeAdmittance * voltage;
        
        if (node1Idx >= 0) {
            rhsVector[node1Idx] += currentContribution;
        }
        if (node2Idx >= 0) {
            rhsVector[node2Idx] -= currentContribution;
        }
    }

    /**
     * 獲取指定時間的電壓值
     * @param {number} time 時間 (秒)
     * @returns {number} 電壓值 (伏特)
     */
    getValue(time = 0) {
        const config = this.sourceConfig;
        
        switch (config.type) {
            case 'DC':
                return config.dc || 0;
                
            case 'SINE':
                return this.getSineValue(time, config);
                
            case 'PULSE':
                return this.getPulseValue(time, config);
                
            case 'EXP':
                return this.getExpValue(time, config);
                
            case 'PWL':
                return this.getPWLValue(time, config);
                
            default:
                console.warn(`Unknown voltage source type: ${config.type}`);
                return 0;
        }
    }

    /**
     * 計算正弦波值
     * v(t) = offset + amplitude * sin(2π * frequency * (t - delay)) * exp(-damping * (t - delay))
     */
    getSineValue(time, config) {
        const { offset, amplitude, frequency, delay, damping } = config;
        
        if (time < delay) {
            return offset;
        }
        
        const t = time - delay;
        const omega = 2 * Math.PI * frequency;
        const dampingFactor = damping > 0 ? Math.exp(-damping * t) : 1;
        
        return offset + amplitude * Math.sin(omega * t) * dampingFactor;
    }

    /**
     * 計算脈衝波值
     */
    getPulseValue(time, config) {
        const { v1, v2, td, tr, tf, pw, per } = config;
        
        if (time < td) {
            return v1;
        }
        
        // 計算在周期內的時間
        const cycleTime = (time - td) % per;
        
        if (cycleTime <= tr) {
            // 上升沿
            return v1 + (v2 - v1) * (cycleTime / tr);
        } else if (cycleTime <= tr + pw) {
            // 高電平
            return v2;
        } else if (cycleTime <= tr + pw + tf) {
            // 下降沿
            const fallTime = cycleTime - tr - pw;
            return v2 - (v2 - v1) * (fallTime / tf);
        } else {
            // 低電平
            return v1;
        }
    }

    /**
     * 計算指數波值 (用於EXP源)
     */
    getExpValue(time, config) {
        const { v1, v2, td1, tau1, td2, tau2 } = config;
        
        if (time < td1) {
            return v1;
        } else if (time < td2) {
            const t = time - td1;
            return v1 + (v2 - v1) * (1 - Math.exp(-t / tau1));
        } else {
            const t1 = td2 - td1;
            const t2 = time - td2;
            const v_td2 = v1 + (v2 - v1) * (1 - Math.exp(-t1 / tau1));
            return v_td2 + (v1 - v_td2) * (1 - Math.exp(-t2 / tau2));
        }
    }

    /**
     * 計算分段線性值 (用於PWL源)
     */
    getPWLValue(time, config) {
        const { points } = config;
        
        if (!points || points.length === 0) {
            return 0;
        }
        
        // 找到時間點在哪個段落中
        for (let i = 0; i < points.length - 1; i++) {
            const [t1, v1] = points[i];
            const [t2, v2] = points[i + 1];
            
            if (time >= t1 && time <= t2) {
                // 線性插值
                return v1 + (v2 - v1) * (time - t1) / (t2 - t1);
            }
        }
        
        // 如果時間超出範圍，返回最後一個值
        if (time >= points[points.length - 1][0]) {
            return points[points.length - 1][1];
        }
        
        // 如果時間在第一個點之前，返回第一個值
        return points[0][1];
    }

    /**
     * 獲取電壓源信息
     * @param {number} time 當前時間
     * @returns {Object}
     */
    getInfo(time = 0) {
        return {
            ...super.toJSON(),
            sourceConfig: this.sourceConfig,
            currentValue: this.getValue(time),
            operatingPoint: { ...this.operatingPoint }
        };
    }

    toString() {
        const config = this.sourceConfig;
        let valueStr;
        
        switch (config.type) {
            case 'DC':
                valueStr = `DC(${config.dc}V)`;
                break;
            case 'SINE':
                valueStr = `SINE(${config.offset}V, ${config.amplitude}V, ${config.frequency}Hz)`;
                break;
            case 'PULSE':
                valueStr = `PULSE(${config.v1}V, ${config.v2}V, ${config.per * 1e6}µs)`;
                break;
            default:
                valueStr = `${config.type}`;
        }
        
        return `${this.name}: ${this.nodes[0]}(+) ${this.nodes[1]}(-) ${valueStr}`;
    }

    /**
     * 動態設置電壓值（用於控制系統）
     * @param {number} newValue 新的電壓值
     */
    setValue(newValue) {
        this.value = newValue;
        // 如果是DC源，同時更新源配置
        if (this.sourceConfig.type === 'DC') {
            this.sourceConfig.dc = newValue;
            this.sourceConfig.amplitude = newValue;
            this.sourceConfig.offset = newValue;
        }
    }
}

/**
 * 獨立電流源類
 */
export class CurrentSource extends BaseComponent {
    /**
     * @param {string} name 電流源名稱 (如 'IIN', 'I1')
     * @param {string[]} nodes 連接節點 [流出, 流入]
     * @param {number|Object} source 電流值或源描述對象
     * @param {Object} params 額外參數
     */
    constructor(name, nodes, source, params = {}) {
        // 不讓 BaseComponent 解析 value，我們自己處理
        super(name, 'I', nodes, 0, params);
        
        if (nodes.length !== 2) {
            throw new Error(`Current source ${name} must have exactly 2 nodes`);
        }
        
        // 保存原始源描述
        this.rawSource = source;
        
        // 解析源描述 (使用與電壓源相同的邏輯)
        this.sourceConfig = this.parseSourceConfig(source);
        
        // 設置默認值為 DC 值
        this.value = this.sourceConfig.dc || this.sourceConfig.amplitude || 0;
    }

    /**
     * 解析源配置 (與電壓源相同的邏輯)
     */
    parseSourceConfig(source) {
        // 複用電壓源的解析邏輯
        const voltageSource = new VoltageSource('temp', ['1', '0'], source);
        return voltageSource.sourceConfig;
    }

    /**
     * 獲取指定時間的電流值
     * @param {number} time 時間 (秒)
     * @returns {number} 電流值 (安培)
     */
    getValue(time = 0) {
        // 複用電壓源的計算邏輯
        const tempVoltageSource = new VoltageSource('temp', ['1', '0'], this.sourceConfig);
        tempVoltageSource.sourceConfig = this.sourceConfig;
        return tempVoltageSource.getValue(time);
    }

    /**
     * 檢查此元件是否需要額外的電流變數
     * @returns {boolean}
     */
    needsCurrentVariable() {
        return false; // 電流源不需要額外的電流變數
    }

    // ==================== 顯式狀態更新法接口 ====================
    
    /**
     * 電流源預處理 - 電流源不影響G矩陣
     * @param {CircuitPreprocessor} preprocessor 預處理器
     */
    preprocess(preprocessor) {
        // 電流源不添加任何導納到G矩陣
        // 只在RHS中有貢獻
        
        // 記錄節點索引供後續使用
        this.node1Idx = preprocessor.getNodeIndex(this.nodes[0]);
        this.node2Idx = preprocessor.getNodeIndex(this.nodes[1]);
    }

    /**
     * 更新RHS向量 - 電流源的直接貢獻
     * @param {Float32Array} rhsVector RHS向量
     * @param {Float32Array} stateVector 狀態向量
     * @param {number} time 當前時間
     * @param {object} componentData 組件數據
     */
    updateRHS(rhsVector, stateVector, time, componentData) {
        // 獲取當前電流值
        const current = this.getValue(time);
        
        // 電流從 nodes[0] 流向 nodes[1]
        if (this.node1Idx >= 0) {
            rhsVector[this.node1Idx] -= current;  // 電流流出 node1
        }
        if (this.node2Idx >= 0) {
            rhsVector[this.node2Idx] += current;  // 電流流入 node2
        }
    }

    /**
     * 獲取電流源信息
     * @param {number} time 當前時間
     * @returns {Object}
     */
    getInfo(time = 0) {
        return {
            ...super.toJSON(),
            sourceConfig: this.sourceConfig,
            currentValue: this.getValue(time),
            operatingPoint: { ...this.operatingPoint }
        };
    }

    toString() {
        const config = this.sourceConfig;
        let valueStr;
        
        switch (config.type) {
            case 'DC':
                valueStr = `DC(${config.dc}A)`;
                break;
            case 'SINE':
                valueStr = `SINE(${config.offset}A, ${config.amplitude}A, ${config.frequency}Hz)`;
                break;
            case 'PULSE':
                valueStr = `PULSE(${config.v1}A, ${config.v2}A, ${config.per * 1e6}µs)`;
                break;
            default:
                valueStr = `${config.type}`;
        }
        
        return `${this.name}: ${this.nodes[0]}→${this.nodes[1]} ${valueStr}`;
    }
}

/**
 * 壓控電壓源 (VCVS)
 */
export class VCVS extends BaseComponent {
    /**
     * @param {string} name VCVS名稱 (如 'E1')
     * @param {string[]} outputNodes 輸出節點 [正, 負]
     * @param {string[]} controlNodes 控制節點 [正, 負]
     * @param {number} gain 電壓增益
     * @param {Object} params 額外參數
     */
    constructor(name, outputNodes, controlNodes, gain, params = {}) {
        const allNodes = [...outputNodes, ...controlNodes];
        super(name, 'VCVS', allNodes, gain, params);
        
        this.outputNodes = [...outputNodes];
        this.controlNodes = [...controlNodes];
        this.gain = gain;
    }

    needsCurrentVariable() {
        return true; // VCVS需要電流變數
    }

    toString() {
        return `${this.name}: ${this.outputNodes[0]}-${this.outputNodes[1]} = ${this.gain} * (${this.controlNodes[0]}-${this.controlNodes[1]})`;
    }
}

/**
 * 壓控電流源 (VCCS)  
 */
export class VCCS extends BaseComponent {
    /**
     * @param {string} name VCCS名稱 (如 'G1')
     * @param {string[]} outputNodes 輸出節點 [流出, 流入]
     * @param {string[]} controlNodes 控制節點 [正, 負]
     * @param {number} transconductance 跨導 (S)
     * @param {Object} params 額外參數
     */
    constructor(name, outputNodes, controlNodes, transconductance, params = {}) {
        const allNodes = [...outputNodes, ...controlNodes];
        super(name, 'VCCS', allNodes, transconductance, params);
        
        this.outputNodes = [...outputNodes];
        this.controlNodes = [...controlNodes];
        this.transconductance = transconductance;
    }

    needsCurrentVariable() {
        return false; // VCCS不需要額外的電流變數
    }

    toString() {
        return `${this.name}: I(${this.outputNodes[0]}→${this.outputNodes[1]}) = ${this.transconductance} * V(${this.controlNodes[0]}-${this.controlNodes[1]})`;
    }
}

/**
 * 電流控制電流源 (CCCS)
 * Current-Controlled Current Source
 * 輸出電流 = 增益 × 控制電流
 * 典型應用：電晶體 Beta 特性、電流鏡
 */
export class CCCS extends BaseComponent {
    /**
     * @param {string} name CCCS名稱 (如 'F1')
     * @param {string[]} outputNodes 輸出節點 [流出, 流入]
     * @param {string} controlElement 控制元件名稱（通過其電流來控制）
     * @param {number} currentGain 電流增益（無單位）
     * @param {Object} params 額外參數
     */
    constructor(name, outputNodes, controlElement, currentGain, params = {}) {
        super(name, 'CCCS', outputNodes, currentGain, params);
        
        if (outputNodes.length !== 2) {
            throw new Error(`CCCS ${name} must have exactly 2 output nodes`);
        }
        
        this.outputNodes = [...outputNodes];
        this.controlElement = controlElement; // 控制元件的名稱
        this.currentGain = currentGain;       // 電流增益 F
        
        // CCCS 需要監控控制元件的電流
        this.controlCurrent = 0;
    }

    /**
     * 設定控制電流（由解算器在每個時間步調用）
     * @param {number} current 控制元件的電流
     */
    setControlCurrent(current) {
        this.controlCurrent = current;
    }

    /**
     * 獲取輸出電流
     * @returns {number} 輸出電流 = F × I_control
     */
    getOutputCurrent() {
        return this.currentGain * this.controlCurrent;
    }

    /**
     * 為 MNA 分析提供印花支援
     * CCCS 需要在控制元件電流確定後才能計算
     */
    stamp(matrix, rhs, nodeMap, voltageSourceMap, time) {
        const outputCurrent = this.getOutputCurrent();
        
        // 獲取輸出節點索引
        const node1 = this.outputNodes[0] === '0' ? -1 : nodeMap.get(this.outputNodes[0]);
        const node2 = this.outputNodes[1] === '0' ? -1 : nodeMap.get(this.outputNodes[1]);
        
        // 印花電流源到 RHS 向量
        if (node1 >= 0) {
            rhs.addAt(node1, -outputCurrent); // 流出節點
        }
        if (node2 >= 0) {
            rhs.addAt(node2, outputCurrent);  // 流入節點
        }
    }

    needsCurrentVariable() {
        return false; // CCCS 本身不需要額外的電流變數
    }

    toString() {
        return `${this.name}: I(${this.outputNodes[0]}→${this.outputNodes[1]}) = ${this.currentGain} * I(${this.controlElement})`;
    }

    clone() {
        return new CCCS(this.name, [...this.outputNodes], this.controlElement, this.currentGain, { ...this.params });
    }
}

/**
 * 電流控制電壓源 (CCVS)
 * Current-Controlled Voltage Source
 * 輸出電壓 = 轉移阻抗 × 控制電流
 * 典型應用：霍爾感測器、變壓器建模
 */
export class CCVS extends BaseComponent {
    /**
     * @param {string} name CCVS名稱 (如 'H1')
     * @param {string[]} outputNodes 輸出節點 [正, 負]
     * @param {string} controlElement 控制元件名稱（通過其電流來控制）
     * @param {number} transresistance 轉移阻抗 (Ω)
     * @param {Object} params 額外參數
     */
    constructor(name, outputNodes, controlElement, transresistance, params = {}) {
        super(name, 'CCVS', outputNodes, transresistance, params);
        
        if (outputNodes.length !== 2) {
            throw new Error(`CCVS ${name} must have exactly 2 output nodes`);
        }
        
        this.outputNodes = [...outputNodes];
        this.controlElement = controlElement; // 控制元件的名稱
        this.transresistance = transresistance; // 轉移阻抗 H (Ω)
        
        // CCVS 需要監控控制元件的電流
        this.controlCurrent = 0;
    }

    /**
     * 設定控制電流（由解算器在每個時間步調用）
     * @param {number} current 控制元件的電流
     */
    setControlCurrent(current) {
        this.controlCurrent = current;
    }

    /**
     * 獲取輸出電壓
     * @returns {number} 輸出電壓 = H × I_control
     */
    getOutputVoltage() {
        return this.transresistance * this.controlCurrent;
    }

    /**
     * 為 MNA 分析提供印花支援
     * CCVS 作為電壓源需要額外的電流變數
     */
    stamp(matrix, rhs, nodeMap, voltageSourceMap, time) {
        const outputVoltage = this.getOutputVoltage();
        
        // 獲取節點索引
        const node1 = this.outputNodes[0] === '0' ? -1 : nodeMap.get(this.outputNodes[0]);
        const node2 = this.outputNodes[1] === '0' ? -1 : nodeMap.get(this.outputNodes[1]);
        
        // 獲取電壓源的電流變數索引
        const currentVarIndex = voltageSourceMap.get(this.name);
        if (currentVarIndex === undefined) {
            throw new Error(`CCVS ${this.name}: Current variable not found in voltage source map`);
        }
        
        const matrixSize = matrix.rows;
        
        // 印花電壓源約束方程：V+ - V- = V_output
        if (node1 >= 0) {
            matrix.addAt(currentVarIndex, node1, 1);   // 電流方程中的電壓項
            matrix.addAt(node1, currentVarIndex, 1);   // 節點方程中的電流項
        }
        if (node2 >= 0) {
            matrix.addAt(currentVarIndex, node2, -1);  // 電流方程中的電壓項
            matrix.addAt(node2, currentVarIndex, -1);  // 節點方程中的電流項
        }
        
        // 右側向量：電壓約束
        rhs.setAt(currentVarIndex, outputVoltage);
    }

    needsCurrentVariable() {
        return true; // CCVS 需要電流變數（作為電壓源）
    }

    toString() {
        return `${this.name}: V(${this.outputNodes[0]}-${this.outputNodes[1]}) = ${this.transresistance} * I(${this.controlElement})`;
    }

    clone() {
        return new CCVS(this.name, [...this.outputNodes], this.controlElement, this.transresistance, { ...this.params });
    }
}