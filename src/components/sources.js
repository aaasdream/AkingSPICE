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
     * 解析帶 SPICE 單位的數值
     * @param {string} valueStr 數值字符串（可能包含單位）
     * @returns {number} 解析後的數值（基本單位）
     */
    parseValueWithUnit(valueStr) {
        if (!valueStr || valueStr.trim() === '') {
            return 0;
        }
        
        const str = valueStr.toString().trim().toUpperCase();
        
        // 提取數值部分
        const numMatch = str.match(/([-\d.]+(?:[eE][-+]?\d+)?)/);
        if (!numMatch) {
            return 0;
        }
        
        const baseValue = parseFloat(numMatch[1]);
        
        // SPICE 單位換算表 (注意：SPICE 工程記號不區分具體單位類型)
        const unitMultipliers = {
            // 完整電壓單位
            'V': 1,
            'MV': 1e-3,
            'UV': 1e-6,
            'NV': 1e-9,
            'PV': 1e-12,
            'KV': 1e3,
            
            // 完整時間單位  
            'S': 1,
            'MS': 1e-3,
            'US': 1e-6,
            'NS': 1e-9,
            'PS': 1e-12,
            
            // 頻率單位
            'HZ': 1,
            'KHZ': 1e3,
            'MHZ': 1e6,
            'GHZ': 1e9,
            
            // SPICE 工程記號 (無具體單位，通用)
            'T': 1e12,   // Tera
            'G': 1e9,    // Giga
            'MEG': 1e6,  // Mega (特殊)
            'M': 1e6,    // Mega  
            'K': 1e3,    // Kilo
            'U': 1e-6,   // Micro (SPICE 標準用 u/U)
            'N': 1e-9,   // Nano
            'P': 1e-12,  // Pico
            'F': 1e-15,  // Femto
            
            // 無單位
            '': 1
        };
        
        // 尋找單位後綴（按長度從長到短排序以避免錯誤匹配）
        const sortedUnits = Object.keys(unitMultipliers)
            .filter(unit => unit !== '')  // 排除空字符串
            .sort((a, b) => b.length - a.length);  // 長單位優先匹配
        
        for (const unit of sortedUnits) {
            if (str.endsWith(unit)) {
                return baseValue * unitMultipliers[unit];
            }
        }
        
        // 如果沒有匹配的單位，返回基本數值
        return baseValue;
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
            // 檢查是否有 PWM 配置
            if (source.pwm) {
                return {
                    type: 'PWM',
                    dc: source.dc || 0,
                    ...source
                };
            }
            
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
        
        // 脈衝波: "PULSE(v1 v2 td tr tf pw per)" 或 "PULSE v1 v2 td tr tf pw per" - 支援科學記號和 SPICE 單位
        let pulseMatch = str.match(/^PULSE\(\s*([-\d.]+(?:[eE][-+]?\d+)?)[A-Z]*\s+([-\d.]+(?:[eE][-+]?\d+)?)[A-Z]*\s*([-\d.]+(?:[eE][-+]?\d+)?[A-Z]*\s*)?\s*([-\d.]+(?:[eE][-+]?\d+)?[A-Z]*\s*)?\s*([-\d.]+(?:[eE][-+]?\d+)?[A-Z]*\s*)?\s*([-\d.]+(?:[eE][-+]?\d+)?[A-Z]*\s*)?\s*([-\d.]+(?:[eE][-+]?\d+)?[A-Z]*\s*)?\s*\)$/);
        
        // 如果括號格式不匹配，嘗試空格分隔格式
        if (!pulseMatch) {
            pulseMatch = str.match(/^PULSE\s+([-\d.]+(?:[eE][-+]?\d+)?[A-Z]*)\s+([-\d.]+(?:[eE][-+]?\d+)?[A-Z]*)\s*([-\d.]+(?:[eE][-+]?\d+)?[A-Z]*\s*)?\s*([-\d.]+(?:[eE][-+]?\d+)?[A-Z]*\s*)?\s*([-\d.]+(?:[eE][-+]?\d+)?[A-Z]*\s*)?\s*([-\d.]+(?:[eE][-+]?\d+)?[A-Z]*\s*)?\s*([-\d.]+(?:[eE][-+]?\d+)?[A-Z]*\s*)?$/);
        }
        
        if (pulseMatch) {
            return {
                type: 'PULSE',
                v1: this.parseValueWithUnit(pulseMatch[1]),
                v2: this.parseValueWithUnit(pulseMatch[2]),
                td: this.parseValueWithUnit(pulseMatch[3] || '0'),      // 延遲時間
                tr: this.parseValueWithUnit(pulseMatch[4] || '1e-9'),   // 上升時間
                tf: this.parseValueWithUnit(pulseMatch[5] || '1e-9'),   // 下降時間
                pw: this.parseValueWithUnit(pulseMatch[6] || '1e-6'),   // 脈寬
                per: this.parseValueWithUnit(pulseMatch[7] || '2e-6')   // 周期
            };
        }
        
        // 如果無法解析，嘗試作為簡單的 DC 值
        const numValue = parseFloat(sourceStr.replace(/[^\d.-]/g, ''));
        if (!isNaN(numValue)) {
            return {
                type: 'DC',
                dc: numValue,
                amplitude: numValue,
                offset: numValue
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
     * 獲取指定時間的電壓值
     * @param {number} time 時間 (秒)
     * @returns {number} 電壓值 (伏特)
     */
    getValue(time = 0) {
        const config = this.sourceConfig;
        
        switch (config.type) {
            case 'DC':
                return config.dc || 0;
                
            case 'PWM':
                return this.getPWMValue(time, config);
                
            case 'SINE':
                return this.getSineValue(time, config);
                
            case 'PULSE':
                return this.getPulseValue(time, config);
                
            case 'EXP':
                return this.getExpValue(time, config);
                
            case 'PWL':
                return this.getPWLValue(time, config);
            
            case 'dc':
                return config.value || 0;
                
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
     * 計算 PWM 波值
     */
    getPWMValue(time, config) {
        const { pwm, dc } = config;
        
        if (!pwm) {
            return dc || 0;
        }
        
        const { amplitude, frequency, dutyCycle, phase = 0 } = pwm;
        
        // 計算周期和相位偏移
        const period = 1.0 / frequency;
        const phaseOffset = (phase / 360.0) * period; // 相位轉換為時間偏移
        const adjustedTime = time - phaseOffset;
        
        if (adjustedTime < 0) {
            return dc || 0; // 相位延遲期間返回 DC 值
        }
        
        // 計算在周期內的位置
        const cycleTime = adjustedTime % period;
        const dutyTime = period * dutyCycle;
        
        if (cycleTime < dutyTime) {
            return (dc || 0) + amplitude; // 高電平
        } else {
            return dc || 0; // 低電平
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

    /**
     * 更新時變電壓源的當前值（供瞬態分析調用）
     * @param {number} time 當前時間
     */
    updateTimeVarying(time) {
        // 只更新非DC源
        if (this.sourceConfig.type !== 'DC') {
            this.value = this.getValue(time);
        }
    }

    /**
     * 獲取當前時刻的電壓值（公開接口）
     * @param {number} time 當前時間
     * @returns {number} 電壓值
     */
    getCurrentValue(time) {
        return this.getValue(time);
    }

    /**
     * MNA 矩陣印花 - 電壓源需要額外的電流變數
     * @param {Matrix} matrix MNA 導納矩陣
     * @param {Vector} rhs 右手邊向量
     * @param {Map} nodeMap 節點映射
     * @param {Map} voltageSourceMap 電壓源映射
     * @param {number} time 當前時間
     */
    stamp(matrix, rhs, nodeMap, voltageSourceMap, time) {
        // 獲取節點索引，接地節點返回 -1
        const getNodeIndex = (nodeName) => {
            if (nodeName === '0' || nodeName === 'gnd') {
                return -1;
            }
            return nodeMap.get(nodeName);
        };
        
        const n1 = getNodeIndex(this.nodes[0]); // 正端
        const n2 = getNodeIndex(this.nodes[1]); // 負端
        const currIndex = voltageSourceMap.get(this.name);
        
        if (currIndex === undefined) {
            throw new Error(`Voltage source ${this.name} current variable not found`);
        }

        // B 矩陣和 C 矩陣: 電流約束
        if (n1 >= 0) {
            matrix.addAt(n1, currIndex, 1);
            matrix.addAt(currIndex, n1, 1);
        }
        if (n2 >= 0) {
            matrix.addAt(n2, currIndex, -1);
            matrix.addAt(currIndex, n2, -1);
        }

        // E 向量: 電壓約束
        const voltage = this.getValue(time);
        rhs.addAt(currIndex, voltage);
    }

    /**
     * 克隆電壓源元件，支持參數覆蓋
     * @param {Object} overrides 覆蓋參數 {name?, nodes?, source?, params?}
     * @returns {VoltageSource} 新的電壓源實例
     */
    clone(overrides = {}) {
        const newName = overrides.name || this.name;
        const newNodes = overrides.nodes ? [...overrides.nodes] : [...this.nodes];
        const newSource = overrides.source !== undefined ? overrides.source : this.rawSource;
        const newParams = overrides.params ? { ...this.params, ...overrides.params } : { ...this.params };
        
        return new VoltageSource(newName, newNodes, newSource, newParams);
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

    /**
     * MNA 矩陣印花 - 電流源直接影響節點電流
     * @param {Matrix} matrix MNA 導納矩陣
     * @param {Vector} rhs 右手邊向量
     * @param {Map} nodeMap 節點映射
     * @param {Map} voltageSourceMap 電壓源映射
     * @param {number} time 當前時間
     */
    stamp(matrix, rhs, nodeMap, voltageSourceMap, time) {
        // 獲取節點索引，接地節點返回 -1
        const getNodeIndex = (nodeName) => {
            if (nodeName === '0' || nodeName === 'gnd') {
                return -1;
            }
            return nodeMap.get(nodeName);
        };
        
        const n1 = getNodeIndex(this.nodes[0]); // 電流流出的節點
        const n2 = getNodeIndex(this.nodes[1]); // 電流流入的節點
        
        const current = this.getValue(time);
        
        // I 向量: 注入電流
        if (n1 >= 0) {
            rhs.addAt(n1, -current);
        }
        if (n2 >= 0) {
            rhs.addAt(n2, current);
        }
    }

    /**
     * 克隆電流源元件，支持參數覆蓋
     * @param {Object} overrides 覆蓋參數 {name?, nodes?, source?, params?}
     * @returns {CurrentSource} 新的電流源實例
     */
    clone(overrides = {}) {
        const newName = overrides.name || this.name;
        const newNodes = overrides.nodes ? [...overrides.nodes] : [...this.nodes];
        const newSource = overrides.source !== undefined ? overrides.source : this.rawSource;
        const newParams = overrides.params ? { ...this.params, ...overrides.params } : { ...this.params };
        
        return new CurrentSource(newName, newNodes, newSource, newParams);
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

    /**
     * MNA 矩陣印花 - 壓控電壓源 (VCVS)
     * E * V_control = V_output
     * @param {Matrix} matrix MNA 導納矩陣
     * @param {Vector} rhs 右手邊向量
     * @param {Map} nodeMap 節點映射
     * @param {Map} voltageSourceMap 電壓源映射
     * @param {number} time 當前時間
     */
    stamp(matrix, rhs, nodeMap, voltageSourceMap, time) {
        // 獲取節點索引，接地節點返回 -1
        const getNodeIndex = (nodeName) => {
            if (nodeName === '0' || nodeName === 'gnd') {
                return -1;
            }
            return nodeMap.get(nodeName);
        };
        
        const no1 = getNodeIndex(this.outputNodes[0]);
        const no2 = getNodeIndex(this.outputNodes[1]);
        const nc1 = getNodeIndex(this.controlNodes[0]);
        const nc2 = getNodeIndex(this.controlNodes[1]);
        const currIndex = voltageSourceMap.get(this.name);

        // 類似電壓源的處理，但右手邊是控制電壓的函數
        if (no1 >= 0) {
            matrix.addAt(no1, currIndex, 1);
            matrix.addAt(currIndex, no1, 1);
        }
        if (no2 >= 0) {
            matrix.addAt(no2, currIndex, -1);
            matrix.addAt(currIndex, no2, -1);
        }

        // 控制關係: V_out = gain * (V_c1 - V_c2)
        if (nc1 >= 0) {
            matrix.addAt(currIndex, nc1, -this.gain);
        }
        if (nc2 >= 0) {
            matrix.addAt(currIndex, nc2, this.gain);
        }
    }

    /**
     * 克隆 VCVS 元件，支持參數覆蓋
     * @param {Object} overrides 覆蓋參數 {name?, outputNodes?, controlNodes?, gain?, params?}
     * @returns {VCVS} 新的 VCVS 實例
     */
    clone(overrides = {}) {
        const newName = overrides.name || this.name;
        const newOutputNodes = overrides.outputNodes ? [...overrides.outputNodes] : [...this.outputNodes];
        const newControlNodes = overrides.controlNodes ? [...overrides.controlNodes] : [...this.controlNodes];
        const newGain = overrides.gain !== undefined ? overrides.gain : this.gain;
        const newParams = overrides.params ? { ...this.params, ...overrides.params } : { ...this.params };
        
        return new VCVS(newName, newOutputNodes, newControlNodes, newGain, newParams);
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

    /**
     * MNA 矩陣印花 - 壓控電流源 (VCCS)  
     * I_output = gm * V_control
     * @param {Matrix} matrix MNA 導納矩陣
     * @param {Vector} rhs 右手邊向量
     * @param {Map} nodeMap 節點映射
     * @param {Map} voltageSourceMap 電壓源映射
     * @param {number} time 當前時間
     */
    stamp(matrix, rhs, nodeMap, voltageSourceMap, time) {
        // 獲取節點索引，接地節點返回 -1
        const getNodeIndex = (nodeName) => {
            if (nodeName === '0' || nodeName === 'gnd') {
                return -1;
            }
            return nodeMap.get(nodeName);
        };
        
        const no1 = getNodeIndex(this.outputNodes[0]);
        const no2 = getNodeIndex(this.outputNodes[1]);
        const nc1 = getNodeIndex(this.controlNodes[0]);
        const nc2 = getNodeIndex(this.controlNodes[1]);

        // G 矩陣的修改: 添加跨導項
        if (no1 >= 0 && nc1 >= 0) {
            matrix.addAt(no1, nc1, this.transconductance);
        }
        if (no1 >= 0 && nc2 >= 0) {
            matrix.addAt(no1, nc2, -this.transconductance);
        }
        if (no2 >= 0 && nc1 >= 0) {
            matrix.addAt(no2, nc1, -this.transconductance);
        }
        if (no2 >= 0 && nc2 >= 0) {
            matrix.addAt(no2, nc2, this.transconductance);
        }
    }

    /**
     * 克隆 VCCS 元件，支持參數覆蓋
     * @param {Object} overrides 覆蓋參數 {name?, outputNodes?, controlNodes?, transconductance?, params?}
     * @returns {VCCS} 新的 VCCS 實例
     */
    clone(overrides = {}) {
        const newName = overrides.name || this.name;
        const newOutputNodes = overrides.outputNodes ? [...overrides.outputNodes] : [...this.outputNodes];
        const newControlNodes = overrides.controlNodes ? [...overrides.controlNodes] : [...this.controlNodes];
        const newTransconductance = overrides.transconductance !== undefined ? overrides.transconductance : this.transconductance;
        const newParams = overrides.params ? { ...this.params, ...overrides.params } : { ...this.params };
        
        return new VCCS(newName, newOutputNodes, newControlNodes, newTransconductance, newParams);
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