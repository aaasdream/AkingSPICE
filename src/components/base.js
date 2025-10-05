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
            // 移除空白，但保持大小寫敏感性用於區分 M/m
            const trimmedValue = value.trim();
            
            // 工程記號對應表 (大小寫敏感)
            const suffixes = {
                'T': 1e12,   // Tera
                'G': 1e9,    // Giga  
                'MEG': 1e6,  // Mega (特殊處理，避免與 M 混淆)
                'M': 1e6,    // Mega (大寫M = 百萬)
                'K': 1e3,    // Kilo (大寫K)
                'k': 1e3,    // Kilo (小寫k，也常用)
                'm': 1e-3,   // milli (小寫m = 毫)
                'u': 1e-6,   // micro (小寫u)
                'µ': 1e-6,   // micro (μ符號)
                'n': 1e-9,   // nano (小寫n)
                'p': 1e-12,  // pico (小寫p)
                'f': 1e-15   // femto (小寫f)
            };
            
            // 特殊處理MEG (避免與單個M混淆)
            if (trimmedValue.toUpperCase().endsWith('MEG')) {
                const numPart = parseFloat(trimmedValue.slice(0, -3));
                if (!isNaN(numPart)) {
                    return numPart * 1e6;
                }
            }
            
            // 處理其他後綴 (保持大小寫敏感)
            for (const [suffix, multiplier] of Object.entries(suffixes)) {
                if (trimmedValue.endsWith(suffix)) {
                    const numPart = parseFloat(trimmedValue.slice(0, -suffix.length));
                    if (!isNaN(numPart)) {
                        return numPart * multiplier;
                    }
                }
            }
            
            // 如果沒有後綴，直接解析數字
            const numValue = parseFloat(trimmedValue);
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
     * @param {string} method 積分方法 (可選)
     */
    initTransient(timeStep, method = 'backward_euler') {
        this.timeStep = timeStep;
        this.integrationMethod = method;
        this.previousValues.clear();
        this.historyTerm = 0;
    }

    /**
     * 更新歷史狀態 (在每個時間步結束時調用)
     * 🔥 Gear 2 升級版：自動管理多個歷史點
     * @param {Object} solutionData 求解數據 {nodeVoltages, branchCurrents, getBranchCurrent()}
     * @param {number} timeStep 時間步長
     */
    updateHistory(solutionData, timeStep) {
        // 統一 API - 支援向後相容和新格式
        let nodeVoltages, branchCurrents;
        
        if (solutionData && typeof solutionData === 'object' && solutionData.nodeVoltages) {
            // 新的統一格式
            nodeVoltages = solutionData.nodeVoltages;
            branchCurrents = solutionData.branchCurrents;
        } else {
            // 向後相容：舊格式 updateHistory(nodeVoltages, branchCurrents)
            nodeVoltages = solutionData;
            branchCurrents = timeStep; // 在舊格式中，第二個參數是 branchCurrents
            timeStep = arguments[2]; // 第三個參數才是 timeStep
        }
        
        // --- 基類預設實現 ---
        // 僅更新電壓，電流由具體子類（如電阻）計算
        if (this.nodes && this.nodes.length >= 2) {
            const v1 = nodeVoltages.get(this.nodes[0]) || 0;
            const v2 = nodeVoltages.get(this.nodes[1]) || 0;
            const currentVoltage = v1 - v2;

            // 🔥 核心變更：自動將前一個值推到更早的歷史
            // 將 'voltage' -> 'voltage_prev'
            if (this.previousValues.has('voltage')) {
                this.previousValues.set('voltage_prev', this.previousValues.get('voltage'));
            }
            
            this.previousValues.set('voltage', currentVoltage);
            this.operatingPoint.voltage = currentVoltage;
        }
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
     * 克隆元件 - 基類實現，應被子類覆蓋
     * @param {Object} overrides 覆蓋參數
     * @returns {BaseComponent}
     */
    clone(overrides = {}) {
        // 🔥 注意：此為回退實現，建議各組件實現自己的 clone 方法
        console.warn(`Component ${this.constructor.name} should implement its own clone() method`);
        
        const newName = overrides.name || this.name;
        const newNodes = overrides.nodes ? [...overrides.nodes] : [...this.nodes];
        const newValue = overrides.value !== undefined ? overrides.value : this.rawValue;
        const newParams = overrides.params ? { ...this.params, ...overrides.params } : { ...this.params };
        
        // 默認的 BaseComponent 構造函數
        return new this.constructor(newName, this.type, newNodes, newValue, newParams);
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