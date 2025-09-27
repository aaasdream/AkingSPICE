/**
 * 基礎元件類別 - 所有電路元件的抽象基類
 * 
 * 這個基類定義了所有電路元件必須實現的介面，包括：
 * - 元件識別信息 (名稱、類型、節點)
 * - 參數管理 (值、溫度係數等)
 * - MNA印記方法介面
 * - 時域分析所需的歷史狀態管理
 */

export class BaseComponent {
    /**
     * @param {string} name 元件名稱 (如 'R1', 'C2')
     * @param {string} type 元件類型 (如 'R', 'C', 'L', 'V', 'I')
     * @param {string[]} nodes 連接節點列表
     * @param {number|string} value 元件值或表達式
     * @param {Object} params 額外參數
     */
    constructor(name, type, nodes, value, params = {}) {
        this.name = name;
        this.type = type;
        this.nodes = [...nodes]; // 複製節點陣列
        this.rawValue = value;
        this.params = { ...params };
        
        // 解析數值
        this.value = this.parseValue(value);
        
        // 暫態分析相關
        this.timeStep = null;
        this.previousValues = new Map(); // 存儲歷史值
        this.historyTerm = 0;
        
        // 操作點信息
        this.operatingPoint = {
            voltage: 0,
            current: 0,
            power: 0
        };
        
        // 模型參數
        this.temperature = params.temp || 27; // 攝氏度
        this.isNonlinear = false;
    }

    /**
     * 解析元件值，支援工程記號 (如 1K, 2.2u, 3.3m)
     * @param {number|string} value 要解析的值
     * @returns {number} 解析後的數值
     */
    parseValue(value) {
        if (typeof value === 'number') {
            return value;
        }
        
        if (typeof value === 'string') {
            // 移除空白
            value = value.trim().toUpperCase();
            
            // 工程記號對應表
            const suffixes = {
                'T': 1e12,   // Tera
                'G': 1e9,    // Giga  
                'MEG': 1e6,  // Mega (特殊處理)
                'M': 1e-3,   // Milli (注意：M在電子學中通常表示Milli)
                'K': 1e3,    // Kilo
                'U': 1e-6,   // Micro (u的替代)
                'µ': 1e-6,   // Micro
                'N': 1e-9,   // Nano
                'P': 1e-12,  // Pico
                'F': 1e-15   // Femto
            };
            
            // 特殊處理MEG (Mega)
            if (value.endsWith('MEG')) {
                const numPart = parseFloat(value.slice(0, -3));
                return numPart * 1e6;
            }
            
            // 處理其他後綴
            for (const [suffix, multiplier] of Object.entries(suffixes)) {
                if (value.endsWith(suffix)) {
                    const numPart = parseFloat(value.slice(0, -suffix.length));
                    if (!isNaN(numPart)) {
                        return numPart * multiplier;
                    }
                }
            }
            
            // 如果沒有後綴，直接解析數字
            const numValue = parseFloat(value);
            if (!isNaN(numValue)) {
                return numValue;
            }
        }
        
        throw new Error(`Cannot parse value: ${value}`);
    }

    /**
     * 檢查此元件是否需要額外的電流變數 (如電感、電壓源)
     * @returns {boolean}
     */
    needsCurrentVariable() {
        return this.type === 'L' || this.type === 'V' || this.type.includes('V');
    }

    /**
     * 初始化暫態分析
     * @param {number} timeStep 時間步長
     */
    initTransient(timeStep) {
        this.timeStep = timeStep;
        this.previousValues.clear();
        this.historyTerm = 0;
    }

    /**
     * 更新歷史狀態 (在每個時間步結束時調用)
     * @param {Map<string, number>} nodeVoltages 節點電壓
     * @param {Map<string, number>} branchCurrents 支路電流
     */
    updateHistory(nodeVoltages, branchCurrents) {
        // 基類預設實現 - 子類應該覆蓋這個方法
        const v1 = nodeVoltages.get(this.nodes[0]) || 0;
        const v2 = nodeVoltages.get(this.nodes[1]) || 0;
        const voltage = v1 - v2;
        
        this.previousValues.set('voltage', voltage);
        this.operatingPoint.voltage = voltage;
    }

    /**
     * 計算功耗
     * @returns {number} 功耗 (瓦特)
     */
    calculatePower() {
        return Math.abs(this.operatingPoint.voltage * this.operatingPoint.current);
    }

    /**
     * 獲取元件信息字符串
     * @returns {string}
     */
    toString() {
        return `${this.name} (${this.type}): ${this.nodes.join('-')} = ${this.value}`;
    }

    /**
     * 驗證元件的有效性
     * @returns {boolean}
     */
    isValid() {
        return this.name && this.type && this.nodes.length >= 2 && 
               !isNaN(this.value) && isFinite(this.value);
    }

    /**
     * 克隆元件
     * @returns {BaseComponent}
     */
    clone() {
        // 對於具體的元件類型，使用正確的構造函數參數
        if (this.constructor.name === 'Resistor' || 
            this.constructor.name === 'Capacitor' || 
            this.constructor.name === 'Inductor') {
            return new this.constructor(this.name, this.nodes, this.rawValue, this.params);
        } else if (this.constructor.name === 'VoltageSource' || 
                   this.constructor.name === 'CurrentSource') {
            return new this.constructor(this.name, this.nodes, this.rawValue, this.params);
        } else {
            // 默認的BaseComponent構造函數
            return new this.constructor(this.name, this.type, this.nodes, this.rawValue, this.params);
        }
    }

    /**
     * 序列化為JSON
     * @returns {Object}
     */
    toJSON() {
        return {
            name: this.name,
            type: this.type,
            nodes: this.nodes,
            value: this.value,
            rawValue: this.rawValue,
            params: this.params
        };
    }

    /**
     * 從JSON反序列化
     * @param {Object} json JSON對象
     * @returns {BaseComponent}
     */
    static fromJSON(json) {
        return new BaseComponent(json.name, json.type, json.nodes, json.rawValue, json.params);
    }
}

/**
 * 線性雙端元件基類
 * 提供電阻、電容、電感等線性元件的共同功能
 */
export class LinearTwoTerminal extends BaseComponent {
    constructor(name, type, nodes, value, params = {}) {
        super(name, type, nodes, value, params);
        
        if (nodes.length !== 2) {
            throw new Error(`${type} ${name} must have exactly 2 nodes`);
        }
    }

    /**
     * 獲取元件兩端的電壓
     * @param {Map<string, number>} nodeVoltages 節點電壓映射
     * @returns {number} 電壓差 V(n1) - V(n2)
     */
    getVoltage(nodeVoltages) {
        const v1 = nodeVoltages.get(this.nodes[0]) || 0;
        const v2 = nodeVoltages.get(this.nodes[1]) || 0;
        return v1 - v2;
    }
}

/**
 * 受控源基類
 * 為各種受控源 (VCVS, VCCS, CCVS, CCCS) 提供基礎架構
 */
export class ControlledSource extends BaseComponent {
    /**
     * @param {string} name 元件名稱
     * @param {string} type 元件類型
     * @param {string[]} outputNodes 輸出節點 [正, 負]
     * @param {string[]} controlNodes 控制節點 [正, 負]
     * @param {number} gainValue 增益值
     * @param {Object} params 額外參數
     */
    constructor(name, type, outputNodes, controlNodes, gainValue, params = {}) {
        // 合併輸出和控制節點
        const allNodes = [...outputNodes, ...controlNodes];
        super(name, type, allNodes, gainValue, params);
        
        this.outputNodes = [...outputNodes];
        this.controlNodes = [...controlNodes];
        
        if (outputNodes.length !== 2 || controlNodes.length !== 2) {
            throw new Error(`${type} ${name} must have 2 output nodes and 2 control nodes`);
        }
    }

    /**
     * 獲取控制信號 (電壓或電流)
     * @param {Map<string, number>} nodeVoltages 節點電壓
     * @param {Map<string, number>} branchCurrents 支路電流
     * @returns {number} 控制信號值
     */
    getControlSignal(nodeVoltages, branchCurrents) {
        // 基類預設返回控制電壓
        const vc1 = nodeVoltages.get(this.controlNodes[0]) || 0;
        const vc2 = nodeVoltages.get(this.controlNodes[1]) || 0;
        return vc1 - vc2;
    }
}