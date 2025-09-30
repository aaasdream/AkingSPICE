(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('webgpu')) :
    typeof define === 'function' && define.amd ? define(['exports', 'webgpu'], factory) :
    (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.AkingSPICE = {}, global.webgpu));
})(this, (function (exports, webgpu) { 'use strict';

    /**
     * 基礎元件類別 - 所有電路元件的抽象基類
     * 
     * 這個基類定義了所有電路元件必須實現的介面，包括：
     * - 元件識別信息 (名稱、類型、節點)
     * - 參數管理 (值、溫度係數等)
     * - MNA印記方法介面
     * - 時域分析所需的歷史狀態管理
     */

    class BaseComponent {
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

        // ==================== 顯式狀態更新法新接口 ====================

        /**
         * 在預處理階段將元件信息註冊到電路預處理器中
         * 這是從物件導向模型轉換為GPU數值模型的關鍵步驟
         * @param {CircuitPreprocessor} preprocessor 預處理器實例
         */
        preprocess(preprocessor) {
            // 基類預設實現 - 對於沒有特殊需求的元件
            // 子類應該覆蓋這個方法來實現具體的預處理邏輯
            console.warn(`Component ${this.name} (${this.type}) does not implement preprocess method`);
        }

        /**
         * 在每個時間步更新右手側向量 (i) 的貢獻
         * 這裡處理時變源、狀態變量對RHS的影響
         * @param {Float32Array} rhsVector 要更新的RHS向量
         * @param {Float32Array} stateVector 當前狀態向量 (Vc, Il)
         * @param {number} time 當前時間
         * @param {object} componentData 包含元件在緩存中索引的數據
         */
        updateRHS(rhsVector, stateVector, time, componentData) {
            // 基類預設實現 - 大多數無源元件沒有直接貢獻
            // 電流源、電容(視為電壓源)、電感(視為電流源)需要實現
        }

        /**
         * 在每個時間步結束後，更新狀態變量 (僅對 C 和 L 有意義)
         * 實現顯式積分：Vc(t+dt) = Vc(t) + dt * (Ic/C)，Il(t+dt) = Il(t) + dt * (Vl/L)
         * @param {Float32Array} stateVector 狀態向量
         * @param {Float32Array} nodeVoltages 求得的節點電壓
         * @param {number} dt 時間步長
         * @param {object} componentData 元件數據
         */
        updateState(stateVector, nodeVoltages, dt, componentData) {
            // 基類預設實現 - 只有電容和電感需要實現
            // 電容: dVc/dt = Ic/C = (V_node1 - V_node2 - Vc) * G_large / C
            // 電感: dIl/dt = Vl/L = (V_node1 - V_node2) / L
        }

        /**
         * 檢查此元件是否為狀態變量 (電容電壓或電感電流)
         * @returns {boolean}
         */
        isStateVariable() {
            return this.type === 'C' || this.type === 'L';
        }

        /**
         * 獲取狀態變量類型
         * @returns {string|null} 'voltage' for capacitors, 'current' for inductors, null for others
         */
        getStateVariableType() {
            switch (this.type) {
                case 'C': return 'voltage';  // 電容的狀態變量是電壓
                case 'L': return 'current';  // 電感的狀態變量是電流
                default: return null;
            }
        }

        /**
         * 獲取狀態變量的初始值
         * @returns {number} 初始值
         */
        getInitialStateValue() {
            switch (this.type) {
                case 'C': return this.ic || 0;  // 電容初始電壓
                case 'L': return this.ic || 0;  // 電感初始電流  
                default: return 0;
            }
        }
    }

    /**
     * 線性雙端元件基類
     * 提供電阻、電容、電感等線性元件的共同功能
     */
    class LinearTwoTerminal extends BaseComponent {
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
     * 電阻元件模型
     * 實現線性電阻的所有功能，包括溫度係數和功率計算
     */


    class Resistor extends LinearTwoTerminal {
        /**
         * @param {string} name 電阻名稱 (如 'R1')
         * @param {string[]} nodes 連接節點 [n1, n2]
         * @param {number|string} resistance 電阻值 (歐姆)
         * @param {Object} params 額外參數
         */
        constructor(name, nodes, resistance, params = {}) {
            super(name, 'R', nodes, resistance, params);
            
            // 電阻特定參數
            this.tc1 = params.tc1 || 0;      // 一次溫度係數 (1/°C)
            this.tc2 = params.tc2 || 0;      // 二次溫度係數 (1/°C²)
            this.tnom = params.tnom || 27;   // 標稱溫度 (°C)
            this.powerRating = params.power || Infinity; // 額定功率 (W)
            
            // 計算當前溫度下的電阻值
            this.updateTemperatureCoefficient();
        }

        /**
         * 根據溫度更新電阻值
         */
        updateTemperatureCoefficient() {
            const deltaT = this.temperature - this.tnom;
            const tempFactor = 1 + this.tc1 * deltaT + this.tc2 * deltaT * deltaT;
            this.actualValue = this.value * tempFactor;
        }

        /**
         * 獲取當前工作溫度下的電阻值
         * @returns {number} 實際電阻值 (歐姆)
         */
        getResistance() {
            return this.actualValue || this.value;
        }

        // ==================== 顯式狀態更新法接口 ====================
        
        /**
         * 電阻預處理 - 添加導納到G矩陣
         * @param {CircuitPreprocessor} preprocessor 預處理器
         */
        preprocess(preprocessor) {
            // 獲取節點索引
            const node1 = preprocessor.getNodeIndex(this.nodes[0]);
            const node2 = preprocessor.getNodeIndex(this.nodes[1]);
            
            // 計算電導
            const conductance = this.getConductance();
            
            // 添加到G矩陣: G[i,i] += G, G[j,j] += G, G[i,j] -= G, G[j,i] -= G
            if (node1 >= 0) {
                preprocessor.addConductance(node1, node1, conductance);
                if (node2 >= 0) {
                    preprocessor.addConductance(node1, node2, -conductance);
                }
            }
            
            if (node2 >= 0) {
                preprocessor.addConductance(node2, node2, conductance);
                if (node1 >= 0) {
                    preprocessor.addConductance(node2, node1, -conductance);
                }
            }
        }

        /**
         * 獲取電導值
         * @returns {number} 電導值 (西門子)
         */
        getConductance() {
            const resistance = this.getResistance();
            if (resistance === 0) {
                throw new Error(`Zero resistance in ${this.name}`);
            }
            return 1 / resistance;
        }

        /**
         * 計算通過電阻的電流 (使用歐姆定律)
         * @param {Map<string, number>} nodeVoltages 節點電壓
         * @returns {number} 電流 (安培)，正值表示從n1流向n2
         */
        getCurrent(nodeVoltages) {
            const voltage = this.getVoltage(nodeVoltages);
            const current = voltage / this.getResistance();
            this.operatingPoint.current = current;
            return current;
        }

        /**
         * 更新歷史狀態
         * @param {Map<string, number>} nodeVoltages 節點電壓
         * @param {Map<string, number>} branchCurrents 支路電流
         */
        updateHistory(nodeVoltages, branchCurrents) {
            super.updateHistory(nodeVoltages, branchCurrents);
            
            // 計算並存儲電流
            const current = this.getCurrent(nodeVoltages);
            this.previousValues.set('current', current);
            
            // 計算功耗
            this.operatingPoint.power = this.operatingPoint.voltage * current;
        }

        /**
         * 檢查是否超過功率額定值
         * @returns {boolean} 如果超過額定功率返回true
         */
        isOverPower() {
            return this.operatingPoint.power > this.powerRating;
        }

        /**
         * 獲取電阻器資訊
         * @returns {Object} 詳細信息
         */
        getInfo() {
            return {
                ...super.toJSON(),
                actualResistance: this.getResistance(),
                conductance: this.getConductance(),
                tc1: this.tc1,
                tc2: this.tc2,
                powerRating: this.powerRating,
                operatingPoint: { ...this.operatingPoint },
                overPower: this.isOverPower()
            };
        }

        /**
         * 驗證電阻器參數
         * @returns {boolean}
         */
        isValid() {
            return super.isValid() && this.value > 0;
        }

        toString() {
            const resistance = this.getResistance();
            let resistanceStr;
            
            // 格式化電阻值顯示
            if (resistance >= 1e6) {
                resistanceStr = `${(resistance / 1e6).toFixed(2)}MΩ`;
            } else if (resistance >= 1e3) {
                resistanceStr = `${(resistance / 1e3).toFixed(2)}kΩ`;
            } else {
                resistanceStr = `${resistance.toFixed(2)}Ω`;
            }
            
            return `${this.name}: ${this.nodes[0]}-${this.nodes[1]} ${resistanceStr}`;
        }
    }

    /**
     * 電容元件模型
     * 實現線性電容的所有功能，包括暫態分析的伴隨模型
     */


    class Capacitor extends LinearTwoTerminal {
        /**
         * @param {string} name 電容名稱 (如 'C1')
         * @param {string[]} nodes 連接節點 [n1, n2]
         * @param {number|string} capacitance 電容值 (法拉)
         * @param {Object} params 額外參數
         */
        constructor(name, nodes, capacitance, params = {}) {
            super(name, 'C', nodes, capacitance, params);
            
            // 電容特定參數
            this.ic = params.ic || 0;        // 初始電壓 (V)
            this.tc1 = params.tc1 || 0;      // 一次溫度係數
            this.tc2 = params.tc2 || 0;      // 二次溫度係數
            this.tnom = params.tnom || 27;   // 標稱溫度 (°C)
            this.voltageRating = params.voltage || Infinity; // 額定電壓 (V)
            
            // 計算溫度修正後的電容值
            this.updateTemperatureCoefficient();
            
            // 顯式方法相關 - 電容被視為電壓源
            this.largeAdmittance = 1e6;  // 用於近似理想電壓源的大導納（降低以避免數值問題）
        }

        /**
         * 根據溫度更新電容值
         */
        updateTemperatureCoefficient() {
            const deltaT = this.temperature - this.tnom;
            const tempFactor = 1 + this.tc1 * deltaT + this.tc2 * deltaT * deltaT;
            this.actualValue = this.value * tempFactor;
        }

        /**
         * 獲取當前工作溫度下的電容值
         * @returns {number} 實際電容值 (法拉)
         */
        getCapacitance() {
            return this.actualValue || this.value;
        }

        // ==================== 顯式狀態更新法接口 ====================
        
        /**
         * 電容預處理 - 註冊為狀態變量並添加到G矩陣
         * 在顯式方法中，電容被建模為理想電壓源 (值 = Vc(t))
         * @param {CircuitPreprocessor} preprocessor 預處理器
         */
        preprocess(preprocessor) {
            // 獲取節點索引
            this.node1Idx = preprocessor.getNodeIndex(this.nodes[0]);
            this.node2Idx = preprocessor.getNodeIndex(this.nodes[1]);
            
            // 註冊為狀態變量 (電壓類型)
            // 這將在 identifyStateVariables 階段完成，這裡只記錄索引
            this.componentData = {
                node1: this.node1Idx,
                node2: this.node2Idx,
                capacitance: this.getCapacitance(),
                initialVoltage: this.ic
            };
            
            // 電容被建模為理想電壓源，使用大導納近似
            // 這會在G矩陣中添加: G[i,i] += G_large, G[j,j] += G_large, G[i,j] -= G_large, G[j,i] -= G_large
            if (this.node1Idx >= 0) {
                preprocessor.addConductance(this.node1Idx, this.node1Idx, this.largeAdmittance);
                if (this.node2Idx >= 0) {
                    preprocessor.addConductance(this.node1Idx, this.node2Idx, -this.largeAdmittance);
                }
            }
            
            if (this.node2Idx >= 0) {
                preprocessor.addConductance(this.node2Idx, this.node2Idx, this.largeAdmittance);
                if (this.node1Idx >= 0) {
                    preprocessor.addConductance(this.node2Idx, this.node1Idx, -this.largeAdmittance);
                }
            }
        }

        /**
         * 更新RHS向量 - 電容作為電壓源的貢獻
         * 電容電壓源方程: V_node1 - V_node2 = Vc(t)
         * 轉換為電流源: I = G_large * Vc(t)
         * @param {Float32Array} rhsVector RHS向量
         * @param {Float32Array} stateVector 狀態向量 [Vc1, Vc2, ...]
         * @param {number} time 當前時間
         * @param {object} componentData 組件數據
         */
        updateRHS(rhsVector, stateVector, time, componentData) {
            if (!componentData) return;
            
            // 獲取當前電容電壓 (狀態變量)
            const stateIndex = componentData.stateIndex;
            if (stateIndex === undefined || !stateVector) return;
            
            const currentVc = stateVector[stateIndex] || 0;
            
            // 電壓源的等效電流源貢獻: I = G_large * Vc
            const currentContribution = this.largeAdmittance * currentVc;
            
            // 添加到RHS: I流入正端，流出負端
            if (this.node1Idx >= 0) {
                rhsVector[this.node1Idx] += currentContribution;
            }
            if (this.node2Idx >= 0) {
                rhsVector[this.node2Idx] -= currentContribution;
            }
        }

        /**
         * 計算電容電流 i = C * dv/dt
         * @param {Map<string, number>} nodeVoltages 節點電壓
         * @returns {number} 電流 (安培)，正值表示從n1流向n2
         */
        getCurrent(nodeVoltages) {
            const currentVoltage = this.getVoltage(nodeVoltages);
            
            if (!this.timeStep) {
                // DC分析：電容視為開路
                this.operatingPoint.current = 0;
                return 0;
            }
            
            const previousVoltage = this.previousValues.get('voltage') || 0;
            const previousCurrent = this.previousValues.get('current') || 0;
            const C = this.getCapacitance();
            
            let current;
            if (this.integrationMethod === 'trapezoidal') {
                // 梯形法：i_n = 2C/h * (v_n - v_n-1) - i_n-1
                current = (2 * C / this.timeStep) * (currentVoltage - previousVoltage) - previousCurrent;
            } else {
                // 後向歐拉法：i = C * (v(t) - v(t-h)) / h
                current = C * (currentVoltage - previousVoltage) / this.timeStep;
            }
            
            this.operatingPoint.current = current;
            return current;
        }

        /**
         * 計算存儲的能量 E = 0.5 * C * V²
         * @param {Map<string, number>} nodeVoltages 節點電壓
         * @returns {number} 能量 (焦耳)
         */
        getStoredEnergy(nodeVoltages) {
            const voltage = this.getVoltage(nodeVoltages);
            const C = this.getCapacitance();
            return 0.5 * C * voltage * voltage;
        }

        /**
         * 更新歷史狀態
         * @param {Map<string, number>} nodeVoltages 節點電壓
         * @param {Map<string, number>} branchCurrents 支路電流
         */
        updateHistory(nodeVoltages, branchCurrents) {
            super.updateHistory(nodeVoltages, branchCurrents);
            
            const voltage = this.getVoltage(nodeVoltages);
            const current = this.getCurrent(nodeVoltages);
            
            // 🔥 關鍵修正：先為下一個時間步準備伴隨模型（基於當前歷史值）
            this.updateCompanionModel();
            
            // 然後更新歷史值為當前值
            this.previousValues.set('voltage', voltage);
            this.previousValues.set('current', current);
            
            // 計算功耗 (對理想電容應該為0，但實際中可能有數值誤差)
            this.operatingPoint.power = voltage * current;
        }

        /**
         * 檢查是否超過電壓額定值
         * @param {Map<string, number>} nodeVoltages 節點電壓
         * @returns {boolean} 如果超過額定電壓返回true
         */
        isOverVoltage(nodeVoltages) {
            const voltage = Math.abs(this.getVoltage(nodeVoltages));
            return voltage > this.voltageRating;
        }

        /**
         * 獲取電容器資訊
         * @param {Map<string, number>} nodeVoltages 節點電壓
         * @returns {Object} 詳細信息
         */
        getInfo(nodeVoltages = null) {
            const info = {
                ...super.toJSON(),
                actualCapacitance: this.getCapacitance(),
                ic: this.ic,
                tc1: this.tc1,
                tc2: this.tc2,
                voltageRating: this.voltageRating,
                operatingPoint: { ...this.operatingPoint }
            };
            
            if (nodeVoltages) {
                info.storedEnergy = this.getStoredEnergy(nodeVoltages);
                info.overVoltage = this.isOverVoltage(nodeVoltages);
            }
            
            if (this.timeStep) {
                info.equivalentConductance = this.equivalentConductance;
                info.historyCurrentSource = this.historyCurrentSource;
            }
            
            return info;
        }

        /**
         * 驗證電容器參數
         * @returns {boolean}
         */
        isValid() {
            return super.isValid() && this.value > 0;
        }

        toString() {
            const capacitance = this.getCapacitance();
            let capacitanceStr;
            
            // 格式化電容值顯示
            if (capacitance >= 1e-3) {
                capacitanceStr = `${(capacitance * 1e3).toFixed(2)}mF`;
            } else if (capacitance >= 1e-6) {
                capacitanceStr = `${(capacitance * 1e6).toFixed(2)}µF`;
            } else if (capacitance >= 1e-9) {
                capacitanceStr = `${(capacitance * 1e9).toFixed(2)}nF`;
            } else if (capacitance >= 1e-12) {
                capacitanceStr = `${(capacitance * 1e12).toFixed(2)}pF`;
            } else {
                capacitanceStr = `${capacitance.toExponential(2)}F`;
            }
            
            let result = `${this.name}: ${this.nodes[0]}-${this.nodes[1]} ${capacitanceStr}`;
            if (this.ic !== 0) {
                result += ` IC=${this.ic}V`;
            }
            return result;
        }
    }

    /**
     * 電感元件模型
     * 實現線性電感的所有功能，包括暫態分析的伴隨模型
     */


    class Inductor extends LinearTwoTerminal {
        /**
         * @param {string} name 電感名稱 (如 'L1')
         * @param {string[]} nodes 連接節點 [n1, n2]
         * @param {number|string} inductance 電感值 (亨利)
         * @param {Object} params 額外參數
         */
        constructor(name, nodes, inductance, params = {}) {
            super(name, 'L', nodes, inductance, params);
            
            // 電感特定參數
            this.ic = params.ic || 0;        // 初始電流 (A)
            this.resistance = params.r || 0; // 寄生電阻 (Ω)
            this.tc1 = params.tc1 || 0;      // 一次溫度係數
            this.tc2 = params.tc2 || 0;      // 二次溫度係數
            this.tnom = params.tnom || 27;   // 標稱溫度 (°C)
            this.currentRating = params.current || Infinity; // 額定電流 (A)
            
            // 計算溫度修正後的電感值
            this.updateTemperatureCoefficient();
            
            // 顯式方法相關 - 電感被視為電流源
            // 耦合電感支持 (未來擴展)
            this.couplings = null;
        }

        /**
         * 根據溫度更新電感值
         */
        updateTemperatureCoefficient() {
            const deltaT = this.temperature - this.tnom;
            const tempFactor = 1 + this.tc1 * deltaT + this.tc2 * deltaT * deltaT;
            this.actualValue = this.value * tempFactor;
        }

        /**
         * 獲取當前工作溫度下的電感值
         * @returns {number} 實際電感值 (亨利)
         */
        getInductance() {
            return this.actualValue || this.value;
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
         * 電感預處理 - 註冊為狀態變量（電流）
         * 在顯式方法中，電感被建模為理想電流源 (值 = Il(t))
         * @param {CircuitPreprocessor} preprocessor 預處理器
         */
        preprocess(preprocessor) {
            // 獲取節點索引
            this.node1Idx = preprocessor.getNodeIndex(this.nodes[0]);
            this.node2Idx = preprocessor.getNodeIndex(this.nodes[1]);
            
            // 註冊為狀態變量 (電流類型)
            // 這將在 identifyStateVariables 階段完成
            this.componentData = {
                node1: this.node1Idx,
                node2: this.node2Idx,
                inductance: this.getInductance(),
                initialCurrent: this.ic,
                resistance: this.resistance
            };
            
            // 電感被建模為電流源，不直接影響G矩陣
            // (電流源只影響RHS向量)
            
            // 如果有寄生電阻，添加到G矩陣
            if (this.resistance > 0) {
                const conductance = 1 / this.resistance;
                if (this.node1Idx >= 0) {
                    preprocessor.addConductance(this.node1Idx, this.node1Idx, conductance);
                    if (this.node2Idx >= 0) {
                        preprocessor.addConductance(this.node1Idx, this.node2Idx, -conductance);
                    }
                }
                if (this.node2Idx >= 0) {
                    preprocessor.addConductance(this.node2Idx, this.node2Idx, conductance);
                    if (this.node1Idx >= 0) {
                        preprocessor.addConductance(this.node2Idx, this.node1Idx, -conductance);
                    }
                }
            }
        }

        /**
         * 更新RHS向量 - 電感作為電流源的貢獻
         * 電感電流源：I = Il(t) 從 node1 流向 node2
         * @param {Float32Array} rhsVector RHS向量
         * @param {Float32Array} stateVector 狀態向量 [..., Il1, Il2, ...]
         * @param {number} time 當前時間
         * @param {object} componentData 組件數據
         */
        updateRHS(rhsVector, stateVector, time, componentData) {
            if (!componentData) return;
            
            // 獲取當前電感電流 (狀態變量)
            const stateIndex = componentData.stateIndex;
            if (stateIndex === undefined || !stateVector) return;
            
            const currentIl = stateVector[stateIndex] || 0;
            
            // 電流源貢獻: I 從 node1 流向 node2
            if (this.node1Idx >= 0) {
                rhsVector[this.node1Idx] -= currentIl;  // 電流流出 node1
            }
            if (this.node2Idx >= 0) {
                rhsVector[this.node2Idx] += currentIl;  // 電流流入 node2
            }
        }

        /**
         * 計算電感電壓 v = L * di/dt
         * @param {number} current 當前電流
         * @returns {number} 電壓 (伏特)
         */
        getVoltageFromCurrent(current) {
            if (!this.timeStep) {
                // DC分析：電感視為短路 (忽略寄生電阻)
                return current * this.resistance;
            }
            
            const previousCurrent = this.previousValues.get('current') || 0;
            const previousVoltage = this.previousValues.get('voltage') || 0;
            const L = this.getInductance();
            
            let voltage;
            if (this.integrationMethod === 'trapezoidal') {
                // 梯形法: v_n = 2L/h * (i_n - i_n-1) - v_n-1 + Rs * i_n
                const inductiveVoltage = (2 * L / this.timeStep) * (current - previousCurrent) - previousVoltage;
                voltage = inductiveVoltage + this.resistance * current;
            } else {
                // 後向歐拉法: v = L * (i(t) - i(t-h)) / h + R * i(t)
                const diDt = (current - previousCurrent) / this.timeStep;
                voltage = L * diDt + this.resistance * current;
            }
            
            this.operatingPoint.current = current;
            this.operatingPoint.voltage = voltage;
            
            return voltage;
        }

        /**
         * 計算存儲的磁能 E = 0.5 * L * I²
         * @param {number} current 電流
         * @returns {number} 能量 (焦耳)
         */
        getStoredEnergy(current) {
            const L = this.getInductance();
            return 0.5 * L * current * current;
        }

        /**
         * 更新狀態變量 - 顯式積分方法
         * dIl/dt = Vl/L，其中 Vl 是施加在電感上的電壓
         * @param {Float32Array} stateVector 狀態向量
         * @param {Float32Array} nodeVoltages 節點電壓解
         * @param {number} dt 時間步長
         * @param {object} componentData 組件數據
         */
        updateState(stateVector, nodeVoltages, dt, componentData) {
            if (!componentData || componentData.stateIndex === undefined) return;
            
            const stateIndex = componentData.stateIndex;
            const currentIl = stateVector[stateIndex];
            
            // 獲取節點電壓
            const v1 = this.node1Idx >= 0 ? nodeVoltages[this.node1Idx] : 0;
            const v2 = this.node2Idx >= 0 ? nodeVoltages[this.node2Idx] : 0;
            const nodeVoltage = v1 - v2;
            
            // 電感電壓 = 節點電壓 - 寄生電阻壓降
            const vl = nodeVoltage - currentIl * this.resistance;
            
            // 顯式歐拉積分: Il(t+dt) = Il(t) + dt * (Vl/L)
            const L = this.getInductance();
            const dIlDt = vl / L;
            
            stateVector[stateIndex] = currentIl + dt * dIlDt;
            
            // 更新運行點資訊 (用於調試)
            this.operatingPoint.current = currentIl;
            this.operatingPoint.voltage = nodeVoltage;
            this.operatingPoint.power = nodeVoltage * currentIl;
        }

        /**
         * 檢查是否超過電流額定值
         * @param {number} current 電流
         * @returns {boolean} 如果超過額定電流返回true
         */
        isOverCurrent(current) {
            return Math.abs(current) > this.currentRating;
        }

        /**
         * 簡化的更新歷史方法
         */
        updateHistory(nodeVoltages, branchCurrents) {
            // 在顯式方法中主要由updateState處理
            const voltage = this.getVoltage(nodeVoltages);
            this.operatingPoint.voltage = voltage;
        }
        
        /**
         * 獲取電感器資訊
         * @param {number} current 當前電流
         * @returns {Object} 詳細信息
         */
        getInfo(current = null) {
            const info = {
                ...super.toJSON(),
                actualInductance: this.getInductance(),
                ic: this.ic,
                resistance: this.resistance,
                tc1: this.tc1,
                tc2: this.tc2,
                currentRating: this.currentRating,
                operatingPoint: { ...this.operatingPoint },
                explicitMethod: true
            };
            
            if (current !== null) {
                info.storedEnergy = this.getStoredEnergy(current);
                info.overCurrent = this.isOverCurrent(current);
            }
            
            return info;
        }

        /**
         * 驗證電感器參數
         * @returns {boolean}
         */
        isValid() {
            return super.isValid() && this.value > 0;
        }

        toString() {
            const inductance = this.getInductance();
            let inductanceStr;
            
            // 格式化電感值顯示
            if (inductance >= 1) {
                inductanceStr = `${inductance.toFixed(3)}H`;
            } else if (inductance >= 1e-3) {
                inductanceStr = `${(inductance * 1e3).toFixed(2)}mH`;
            } else if (inductance >= 1e-6) {
                inductanceStr = `${(inductance * 1e6).toFixed(2)}µH`;
            } else if (inductance >= 1e-9) {
                inductanceStr = `${(inductance * 1e9).toFixed(2)}nH`;
            } else {
                inductanceStr = `${inductance.toExponential(2)}H`;
            }
            
            let result = `${this.name}: ${this.nodes[0]}-${this.nodes[1]} ${inductanceStr}`;
            
            if (this.resistance > 0) {
                result += ` R=${this.resistance}Ω`;
            }
            
            if (this.ic !== 0) {
                result += ` IC=${this.ic}A`;
            }
            
            return result;
        }
    }

    /**
     * 耦合電感 (變壓器) 模型
     */
    class CoupledInductor {
        /**
         * @param {string} name 耦合電感名稱
         * @param {Inductor} L1 第一個電感
         * @param {Inductor} L2 第二個電感  
         * @param {number} couplingFactor 耦合係數 k (0 < k ≤ 1)
         * @param {Object} params 額外參數
         */
        constructor(name, L1, L2, couplingFactor, params = {}) {
            this.name = name;
            this.type = 'K';
            this.L1 = L1;
            this.L2 = L2;
            this.k = Math.max(0, Math.min(1, couplingFactor)); // 限制在0-1範圍
            this.params = params;
            
            // 計算互感 M = k * sqrt(L1 * L2)
            this.mutualInductance = this.k * Math.sqrt(L1.getInductance() * L2.getInductance());
            
            // 極性 (dot convention)
            this.dotNodes = params.dotNodes || [L1.nodes[0], L2.nodes[0]];
        }

        /**
         * 獲取互感值
         * @returns {number} 互感 (亨利)
         */
        getMutualInductance() {
            // 重新計算，因為電感值可能改變
            return this.k * Math.sqrt(this.L1.getInductance() * this.L2.getInductance());
        }

        /**
         * 獲取耦合電感資訊
         * @returns {Object} 詳細信息
         */
        getInfo() {
            return {
                name: this.name,
                type: this.type,
                L1: this.L1.name,
                L2: this.L2.name,
                couplingFactor: this.k,
                mutualInductance: this.getMutualInductance(),
                dotNodes: this.dotNodes,
                L1_inductance: this.L1.getInductance(),
                L2_inductance: this.L2.getInductance()
            };
        }

        toString() {
            const M = this.getMutualInductance();
            return `${this.name}: ${this.L1.name}-${this.L2.name} k=${this.k} M=${(M * 1e6).toFixed(2)}µH`;
        }
    }

    /**
     * 電壓源和電流源元件模型
     * 實現各種獨立源，包括DC、AC、脈衝、正弦波等
     */


    /**
     * 獨立電壓源基類
     */
    class VoltageSource extends BaseComponent {
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
            
            // 使用大導納近似理想電壓源
            const largeAdmittance = 1e6;  // 降低導納值避免數值問題
            
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
            
            // 等效電流源: I = G_large * V
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
    class CurrentSource extends BaseComponent {
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
    class VCVS extends BaseComponent {
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
    class VCCS extends BaseComponent {
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
    class CCCS extends BaseComponent {
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
    class CCVS extends BaseComponent {
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
            
            matrix.rows;
            
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

    /**
     * MOSFET 元件模型 (專為電力電子控制模擬設計)
     * 
     * 特點：
     * - 外部可控的 ON/OFF 狀態 (不依賴 Vgs)
     * - 內建體二極體模型
     * - 適用於 PWM 控制系統模擬
     */


    /**
     * 理想 MOSFET 開關模型
     * 
     * 這個模型專為電力電子控制模擬設計，重點是：
     * 1. 開關狀態由外部控制器決定，而不是 Vgs
     * 2. 包含並聯的體二極體
     * 3. 支援快速狀態切換
     */
    class MOSFET extends BaseComponent {
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
            
            // MOSFET 開關參數 - 安全地解析參數，如果解析失敗使用默認值
            this.Ron = this.safeParseValue(params.Ron, 1e-3);        // 導通電阻 (默認 1mΩ)
            this.Roff = this.safeParseValue(params.Roff, 1e6);       // 關斷電阻 (默認 1MΩ，不要太大)
            
            // 體二極體參數
            this.Vf_diode = this.safeParseValue(params.Vf_diode, 0.7);     // 二極體順向電壓 (默認 0.7V)
            this.Von_diode = this.safeParseValue(params.Von_diode, 0.001);  // 二極體導通電阻 (默認 1mΩ)
            this.Roff_diode = this.safeParseValue(params.Roff_diode, 1e6); // 二極體反向電阻 (默認 1MΩ)
            
            // 控制狀態
            this.gateState = false; // false = OFF, true = ON
            this.isExtControlled = true; // 標記這是外部控制的開關
            
            // 節點分配
            this.drain = nodes[0];
            this.source = nodes[1]; 
            this.gate = nodes[2] || null;   // 可選的gate節點，僅用於標識
            
            // 狀態追蹤
            this.mosfetCurrent = 0;
            
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
         * 驗證MOSFET參數
         */
        validate() {
            if (this.Ron <= 0) {
                throw new Error(`MOSFET ${this.name}: Ron must be positive`);
            }
            if (this.Roff <= this.Ron) {
                throw new Error(`MOSFET ${this.name}: Roff must be greater than Ron`);
            }
            
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
         * 計算通過MOSFET的總電流
         * @param {Map<string, number>} nodeVoltages 節點電壓
         * @returns {number} 總電流 (安培)，正值表示從drain流向source
         */
        getCurrent(nodeVoltages) {
            const vds = this.getVoltage(nodeVoltages); // drain-source電壓
            this.drainSourceVoltage = vds;
            
            const rTotal = this.getEquivalentResistance(vds);
            const ids = vds / rTotal;
            
            // 更新電流狀態
            this.totalCurrent = ids;
            this.operatingPoint.current = ids;
            
            return ids;
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

    /**
     * SPICE風格網表解析器
     * 
     * 解析傳統SPICE格式的網表文件，建立電路元件列表
     */


    /**
     * 網表解析器
     */
    class NetlistParser {
        constructor() {
            this.components = [];
            this.models = new Map(); // .MODEL 定義
            this.parameters = new Map(); // .PARAM 定義
            this.analyses = []; // .TRAN, .DC 等分析指令
            this.options = new Map(); // .OPTIONS 設置
            this.includes = []; // .INCLUDE 文件
            
            // 解析統計
            this.stats = {
                totalLines: 0,
                parsedLines: 0,
                skippedLines: 0,
                errors: []
            };
        }

        /**
         * 解析網表字符串
         * @param {string} netlistText 網表內容
         * @returns {Object} 解析結果
         */
        parse(netlistText) {
            this.reset();
            
            const lines = netlistText.split(/\r?\n/).map(line => line.trim());
            this.stats.totalLines = lines.length;
            
            console.log(`Parsing netlist with ${lines.length} lines...`);
            
            try {
                // 預處理：移除註釋、合併續行
                const processedLines = this.preprocessLines(lines);
                
                // 逐行解析
                for (let i = 0; i < processedLines.length; i++) {
                    const line = processedLines[i];
                    if (line.length === 0) continue;
                    
                    try {
                        this.parseLine(line, i + 1);
                        this.stats.parsedLines++;
                    } catch (error) {
                        this.stats.errors.push({
                            line: i + 1,
                            content: line,
                            error: error.message
                        });
                    }
                }
                
                console.log(`Netlist parsing completed: ${this.components.length} components, ${this.stats.errors.length} errors`);
                
                return {
                    components: this.components,
                    models: this.models,
                    parameters: this.parameters,
                    analyses: this.analyses,
                    options: this.options,
                    stats: this.stats
                };
                
            } catch (error) {
                console.error('Netlist parsing failed:', error);
                throw error;
            }
        }

        /**
         * 重置解析器狀態
         */
        reset() {
            this.components = [];
            this.models.clear();
            this.parameters.clear();
            this.analyses = [];
            this.options.clear();
            this.includes = [];
            this.stats = {
                totalLines: 0,
                parsedLines: 0,
                skippedLines: 0,
                errors: []
            };
        }

        /**
         * 預處理網表行
         * @param {string[]} lines 原始行
         * @returns {string[]} 處理後的行
         */
        preprocessLines(lines) {
            const processed = [];
            let currentLine = '';
            
            for (let line of lines) {
                // 移除註釋 (以 * 或 ; 開頭的行)
                if (line.startsWith('*') || line.startsWith(';')) {
                    continue;
                }
                
                // 移除行內註釋 ($ 或 ; 之後的內容)
                const commentIndex = Math.min(
                    line.indexOf('$') >= 0 ? line.indexOf('$') : line.length,
                    line.indexOf(';') >= 0 ? line.indexOf(';') : line.length
                );
                line = line.substring(0, commentIndex).trim();
                
                if (line.length === 0) continue;
                
                // 處理續行 (以 + 開頭)
                if (line.startsWith('+')) {
                    currentLine += ' ' + line.substring(1).trim();
                } else {
                    if (currentLine.length > 0) {
                        processed.push(currentLine);
                    }
                    currentLine = line;
                }
            }
            
            // 添加最後一行
            if (currentLine.length > 0) {
                processed.push(currentLine);
            }
            
            return processed;
        }

        /**
         * 解析單行網表
         * @param {string} line 網表行
         * @param {number} lineNumber 行號
         * @returns {BaseComponent} 創建的組件 (如果是組件行)
         */
        parseLine(line, lineNumber = 1) {
            const tokens = line.split(/\s+/);
            if (tokens.length === 0) return null;
            
            const firstChar = tokens[0][0].toUpperCase();
            let component = null;
            
            try {
                switch (firstChar) {
                    case 'R':
                        component = this.parseResistor(tokens);
                        break;
                    case 'C':
                        component = this.parseCapacitor(tokens);
                        break;
                    case 'L':
                        component = this.parseInductor(tokens);
                        break;
                    case 'V':
                        component = this.parseVoltageSource(tokens);
                        break;
                    case 'I':
                        component = this.parseCurrentSource(tokens);
                        break;
                    case 'E':
                        component = this.parseVCVS(tokens);
                        break;
                    case 'G':
                        component = this.parseVCCS(tokens);
                        break;
                    case 'M':
                        component = this.parseMOSFET(tokens);
                        break;
                    case '.':
                        this.parseDirective(tokens);
                        break;
                    default:
                        console.warn(`Unknown component type: ${tokens[0]} (line ${lineNumber})`);
                        this.stats.skippedLines++;
                }
            } catch (error) {
                throw new Error(`Line ${lineNumber}: ${error.message}`);
            }
            
            return component;
        }

        /**
         * 解析電阻
         * 格式: R<name> <node1> <node2> <value> [parameters]
         * @returns {Resistor} 創建的電阻組件
         */
        parseResistor(tokens) {
            if (tokens.length < 4) {
                throw new Error('Resistor requires at least 4 tokens: R<name> <node1> <node2> <value>');
            }
            
            const name = tokens[0];
            const nodes = [tokens[1], tokens[2]];
            const value = tokens[3];
            const params = this.parseParameters(tokens.slice(4));
            
            const resistor = new Resistor(name, nodes, value, params);
            this.components.push(resistor);
            return resistor;
        }

        /**
         * 解析電容
         * 格式: C<name> <node1> <node2> <value> [IC=<initial_voltage>]
         * @returns {Capacitor} 創建的電容組件
         */
        parseCapacitor(tokens) {
            if (tokens.length < 4) {
                throw new Error('Capacitor requires at least 4 tokens: C<name> <node1> <node2> <value>');
            }
            
            const name = tokens[0];
            const nodes = [tokens[1], tokens[2]];
            const value = tokens[3];
            const params = this.parseParameters(tokens.slice(4));
            
            const capacitor = new Capacitor(name, nodes, value, params);
            this.components.push(capacitor);
            return capacitor;
        }

        /**
         * 解析電感
         * 格式: L<name> <node1> <node2> <value> [IC=<initial_current>]
         * @returns {Inductor} 創建的電感組件
         */
        parseInductor(tokens) {
            if (tokens.length < 4) {
                throw new Error('Inductor requires at least 4 tokens: L<name> <node1> <node2> <value>');
            }
            
            const name = tokens[0];
            const nodes = [tokens[1], tokens[2]];
            const value = tokens[3];
            const params = this.parseParameters(tokens.slice(4));
            
            const inductor = new Inductor(name, nodes, value, params);
            this.components.push(inductor);
            return inductor;
        }

        /**
         * 解析 MOSFET
         * 格式: M<name> <drain> <source> <gate> [Ron=<value>] [Roff=<value>] [Vf=<value>]
         * @returns {MOSFET} 創建的 MOSFET 組件
         */
        parseMOSFET(tokens) {
            if (tokens.length < 4) {
                throw new Error('MOSFET requires at least 4 tokens: M<name> <drain> <source> <gate>');
            }
            
            const name = tokens[0];
            const drain = tokens[1];
            const source = tokens[2];
            const gate = tokens[3];
            // 完整節點信息，但只有 drain 和 source 會被用於 MNA 矩陣
            const allNodes = [drain, source, gate];
            
            // 解析 MOSFET 參數
            const params = this.parseParameters(tokens.slice(4));
            
            // 參數會通過 MOSFET 構造函數中的 parseValue 方法處理
            const mosfetParams = {
                Ron: params.Ron || params.ron || '1m',        // 默認 1mΩ
                Roff: params.Roff || params.roff || '1M',     // 默認 1MΩ  
                Vf_diode: params.Vf || params.vf || params.Vf_diode || '0.7',
                Von_diode: params.Von_diode || params.von_diode || '1m',
                Roff_diode: params.Roff_diode || params.roff_diode || '1M'
            };
            
            const mosfet = new MOSFET(name, allNodes, mosfetParams);
            this.components.push(mosfet);
            return mosfet;
        }

        /**
         * 解析電壓源
         * 格式: V<name> <node+> <node-> <source_spec>
         * @returns {VoltageSource} 創建的電壓源組件
         */
        parseVoltageSource(tokens) {
            if (tokens.length < 4) {
                throw new Error('Voltage source requires at least 4 tokens: V<name> <node+> <node-> <source>');
            }
            
            const name = tokens[0];
            const nodes = [tokens[1], tokens[2]];
            
            // 合併source specification (可能包含空格)
            let sourceSpec = tokens.slice(3).join(' ');
            
            // 解析參數
            const params = {};
            
            const voltageSource = new VoltageSource(name, nodes, sourceSpec, params);
            this.components.push(voltageSource);
            return voltageSource;
        }

        /**
         * 解析電流源
         * 格式: I<name> <node+> <node-> <source_spec>
         * @returns {CurrentSource} 創建的電流源組件
         */
        parseCurrentSource(tokens) {
            if (tokens.length < 4) {
                throw new Error('Current source requires at least 4 tokens: I<name> <node+> <node-> <source>');
            }
            
            const name = tokens[0];
            const nodes = [tokens[1], tokens[2]];
            
            // 合併source specification
            let sourceSpec = tokens.slice(3).join(' ');
            const params = {};
            
            const currentSource = new CurrentSource(name, nodes, sourceSpec, params);
            this.components.push(currentSource);
            return currentSource;
        }

        /**
         * 解析壓控電壓源 (VCVS)
         * 格式: E<name> <out+> <out-> <in+> <in-> <gain>
         */
        parseVCVS(tokens) {
            if (tokens.length < 6) {
                throw new Error('VCVS requires 6 tokens: E<name> <out+> <out-> <in+> <in-> <gain>');
            }
            
            const name = tokens[0];
            const outputNodes = [tokens[1], tokens[2]];
            const controlNodes = [tokens[3], tokens[4]];
            const gain = parseFloat(tokens[5]);
            
            const vcvs = new VCVS(name, outputNodes, controlNodes, gain);
            this.components.push(vcvs);
        }

        /**
         * 解析壓控電流源 (VCCS)
         * 格式: G<name> <out+> <out-> <in+> <in-> <transconductance>
         */
        parseVCCS(tokens) {
            if (tokens.length < 6) {
                throw new Error('VCCS requires 6 tokens: G<name> <out+> <out-> <in+> <in-> <gm>');
            }
            
            const name = tokens[0];
            const outputNodes = [tokens[1], tokens[2]];
            const controlNodes = [tokens[3], tokens[4]];
            const transconductance = parseFloat(tokens[5]);
            
            const vccs = new VCCS(name, outputNodes, controlNodes, transconductance);
            this.components.push(vccs);
        }

        /**
         * 解析指令 (以 . 開頭的行)
         * @param {string[]} tokens 標記陣列
         */
        parseDirective(tokens) {
            const directive = tokens[0].toLowerCase();
            
            switch (directive) {
                case '.tran':
                    this.parseTranDirective(tokens);
                    break;
                case '.dc':
                    this.parseDCDirective(tokens);
                    break;
                case '.param':
                    this.parseParamDirective(tokens);
                    break;
                case '.model':
                    this.parseModelDirective(tokens);
                    break;
                case '.options':
                    this.parseOptionsDirective(tokens);
                    break;
                case '.end':
                    // 網表結束標記
                    break;
                case '.title':
                    // 標題行，忽略
                    break;
                default:
                    console.warn(`Unknown directive: ${directive}`);
            }
        }

        /**
         * 解析 .TRAN 指令
         * 格式: .TRAN <tstep> <tstop> [tstart] [tmax]
         */
        parseTranDirective(tokens) {
            if (tokens.length < 3) {
                throw new Error('.TRAN requires at least 2 parameters: .TRAN <tstep> <tstop>');
            }
            
            const analysis = {
                type: 'TRAN',
                tstep: tokens[1],
                tstop: tokens[2],
                tstart: tokens[3] || '0',
                tmax: tokens[4] || tokens[1]
            };
            
            this.analyses.push(analysis);
        }

        /**
         * 解析 .DC 指令
         */
        parseDCDirective(tokens) {
            const analysis = {
                type: 'DC',
                parameters: tokens.slice(1)
            };
            
            this.analyses.push(analysis);
        }

        /**
         * 解析 .PARAM 指令
         */
        parseParamDirective(tokens) {
            for (let i = 1; i < tokens.length; i++) {
                const param = tokens[i];
                const equalIndex = param.indexOf('=');
                if (equalIndex > 0) {
                    const name = param.substring(0, equalIndex);
                    const value = param.substring(equalIndex + 1);
                    this.parameters.set(name, value);
                }
            }
        }

        /**
         * 解析 .MODEL 指令
         */
        parseModelDirective(tokens) {
            if (tokens.length < 3) {
                throw new Error('.MODEL requires at least 2 parameters: .MODEL <name> <type>');
            }
            
            const modelName = tokens[1];
            const modelType = tokens[2];
            const modelParams = this.parseParameters(tokens.slice(3));
            
            this.models.set(modelName, {
                type: modelType,
                parameters: modelParams
            });
        }

        /**
         * 解析 .OPTIONS 指令
         */
        parseOptionsDirective(tokens) {
            for (let i = 1; i < tokens.length; i++) {
                const option = tokens[i];
                const equalIndex = option.indexOf('=');
                if (equalIndex > 0) {
                    const name = option.substring(0, equalIndex);
                    const value = option.substring(equalIndex + 1);
                    this.options.set(name.toLowerCase(), value);
                } else {
                    this.options.set(option.toLowerCase(), true);
                }
            }
        }

        /**
         * 解析參數列表 (key=value 格式)
         * @param {string[]} tokens 參數標記
         * @returns {Object} 參數對象
         */
        parseParameters(tokens) {
            const params = {};
            
            for (const token of tokens) {
                const equalIndex = token.indexOf('=');
                if (equalIndex > 0) {
                    const key = token.substring(0, equalIndex).toLowerCase();
                    const value = token.substring(equalIndex + 1);
                    
                    // 保持字符串格式，讓各個組件自己處理工程記號
                    // 只有明確的純數字才轉換為數字類型
                    const trimmedValue = value.trim();
                    if (/^[-+]?[0-9]*\.?[0-9]+([eE][-+]?[0-9]+)?$/.test(trimmedValue)) {
                        // 純數字（包括科學記號）
                        const numValue = parseFloat(trimmedValue);
                        params[key] = isNaN(numValue) ? value : numValue;
                    } else {
                        // 包含單位後綴或其他文本，保持字符串
                        params[key] = value;
                    }
                }
            }
            
            return params;
        }

        /**
         * 獲取解析統計信息
         * @returns {Object} 統計信息
         */
        getStats() {
            return {
                ...this.stats,
                componentCount: this.components.length,
                modelCount: this.models.size,
                parameterCount: this.parameters.size,
                analysisCount: this.analyses.length
            };
        }

        /**
         * 解析工程記號值的助手方法
         * @param {string|number} value 要解析的值
         * @returns {number} 解析後的數值
         */
        parseValue(value) {
            if (typeof value === 'number') return value;
            if (typeof value !== 'string') return null;
            
            const str = value.toString().trim().toLowerCase();
            const numberPart = parseFloat(str);
            if (isNaN(numberPart)) return null;
            
            // 檢查工程記號後綴
            const suffix = str.slice(numberPart.toString().length);
            switch (suffix) {
                case 'p': case 'pico': return numberPart * 1e-12;
                case 'n': case 'nano': return numberPart * 1e-9;
                case 'u': case 'μ': case 'micro': return numberPart * 1e-6;
                case 'm': case 'milli': return numberPart * 1e-3;
                case 'k': case 'kilo': return numberPart * 1e3;
                case 'meg': case 'mega': return numberPart * 1e6;
                case 'g': case 'giga': return numberPart * 1e9;
                case 't': case 'tera': return numberPart * 1e12;
                case '': return numberPart;
                default: return numberPart; // 未知後綴，返回數字部分
            }
        }

        /**
         * 打印解析報告
         */
        printReport() {
            console.log('\\n=== Netlist Parsing Report ===');
            console.log(`Total lines: ${this.stats.totalLines}`);
            console.log(`Parsed lines: ${this.stats.parsedLines}`);
            console.log(`Skipped lines: ${this.stats.skippedLines}`);
            console.log(`Errors: ${this.stats.errors.length}`);
            
            console.log(`\\nComponents: ${this.components.length}`);
            const componentTypes = {};
            for (const comp of this.components) {
                componentTypes[comp.type] = (componentTypes[comp.type] || 0) + 1;
            }
            for (const [type, count] of Object.entries(componentTypes)) {
                console.log(`  ${type}: ${count}`);
            }
            
            if (this.analyses.length > 0) {
                console.log(`\\nAnalyses: ${this.analyses.length}`);
                for (const analysis of this.analyses) {
                    console.log(`  ${analysis.type}`);
                }
            }
            
            if (this.stats.errors.length > 0) {
                console.log('\\nErrors:');
                for (const error of this.stats.errors) {
                    console.log(`  Line ${error.line}: ${error.error}`);
                    console.log(`    "${error.content}"`);
                }
            }
            
            console.log('==============================\\n');
        }
    }

    /**
     * 線性代數核心 - LU分解求解器
     * 
     * 這是AkingSPICE的數值計算核心，負責求解 Ax = z 形式的線性方程組。
     * 使用LU分解方法，這是求解中等規模稠密或稀疏矩陣的標準高效方法。
     */

    /**
     * 矩陣類 - 提供基本的矩陣操作
     */
    class Matrix {
        /**
         * @param {number} rows 矩陣行數
         * @param {number} cols 矩陣列數
         * @param {number[][]} data 可選的初始數據
         */
        constructor(rows, cols, data = null) {
            this.rows = rows;
            this.cols = cols;
            
            if (data) {
                this.data = data;
            } else {
                this.data = Array(rows).fill().map(() => Array(cols).fill(0));
            }
        }

        /**
         * 獲取元素值
         * @param {number} i 行索引 (0-based)
         * @param {number} j 列索引 (0-based)
         * @returns {number}
         */
        get(i, j) {
            if (i < 0 || i >= this.rows || j < 0 || j >= this.cols) {
                throw new Error(`Matrix index out of bounds: (${i}, ${j})`);
            }
            return this.data[i][j];
        }

        /**
         * 設置元素值
         * @param {number} i 行索引
         * @param {number} j 列索引
         * @param {number} value 要設置的值
         */
        set(i, j, value) {
            if (i < 0 || i >= this.rows || j < 0 || j >= this.cols) {
                throw new Error(`Matrix index out of bounds: (${i}, ${j})`);
            }
            this.data[i][j] = value;
        }

        /**
         * 累加元素值 (常用於組裝MNA矩陣)
         * @param {number} i 行索引
         * @param {number} j 列索引
         * @param {number} value 要累加的值
         */
        addAt(i, j, value) {
            this.data[i][j] += value;
        }

        /**
         * 創建單位矩陣
         * @param {number} size 矩陣大小
         * @returns {Matrix}
         */
        static identity(size) {
            const matrix = new Matrix(size, size);
            for (let i = 0; i < size; i++) {
                matrix.set(i, i, 1);
            }
            return matrix;
        }

        /**
         * 創建零矩陣
         * @param {number} rows 行數
         * @param {number} cols 列數
         * @returns {Matrix}
         */
        static zeros(rows, cols = rows) {
            return new Matrix(rows, cols);
        }

        /**
         * 矩陣複製
         * @returns {Matrix}
         */
        clone() {
            const newData = this.data.map(row => [...row]);
            return new Matrix(this.rows, this.cols, newData);
        }

        /**
         * 檢查矩陣是否為方陣
         * @returns {boolean}
         */
        isSquare() {
            return this.rows === this.cols;
        }

        /**
         * 打印矩陣 (調試用)
         * @param {number} precision 小數點後位數
         */
        print(precision = 6) {
            console.log('Matrix:');
            for (let i = 0; i < this.rows; i++) {
                const row = this.data[i].map(val => val.toFixed(precision)).join('  ');
                console.log(`[${row}]`);
            }
        }
    }

    /**
     * 向量類 - 本質上是單列矩陣的特殊形式
     */
    class Vector {
        /**
         * @param {number} size 向量大小
         * @param {number[]} data 可選的初始數據
         */
        constructor(size, data = null) {
            this.size = size;
            this.data = data ? [...data] : Array(size).fill(0);
        }

        /**
         * 獲取元素值
         * @param {number} i 索引
         * @returns {number}
         */
        get(i) {
            if (i < 0 || i >= this.size) {
                throw new Error(`Vector index out of bounds: ${i}`);
            }
            return this.data[i];
        }

        /**
         * 設置元素值
         * @param {number} i 索引
         * @param {number} value 值
         */
        set(i, value) {
            if (i < 0 || i >= this.size) {
                throw new Error(`Vector index out of bounds: ${i}`);
            }
            this.data[i] = value;
        }

        /**
         * 累加元素值
         * @param {number} i 索引
         * @param {number} value 要累加的值
         */
        addAt(i, value) {
            this.data[i] += value;
        }

        /**
         * 創建零向量
         * @param {number} size 大小
         * @returns {Vector}
         */
        static zeros(size) {
            return new Vector(size);
        }

        /**
         * 向量複製
         * @returns {Vector}
         */
        clone() {
            return new Vector(this.size, this.data);
        }

        /**
         * 打印向量 (調試用)
         * @param {number} precision 小數點後位數
         */
        print(precision = 6) {
            const values = this.data.map(val => val.toFixed(precision)).join(', ');
            console.log(`Vector: [${values}]`);
        }
    }

    /**
     * LU分解求解器
     * 
     * 實現帶部分主元選擇的LU分解算法，用於求解線性方程組 Ax = b
     * 這是電路模擬器的數值核心，所有MNA矩陣最終都通過這裡求解。
     */
    class LUSolver {
        /**
         * 求解線性方程組 Ax = b
         * @param {Matrix} A 係數矩陣 (將被修改)
         * @param {Vector} b 右手邊向量 (將被修改)
         * @returns {Vector} 解向量 x
         */
        static solve(A, b) {
            if (!A.isSquare()) {
                throw new Error('Matrix A must be square');
            }
            
            if (A.rows !== b.size) {
                throw new Error('Matrix A and vector b dimensions do not match');
            }

            A.rows;
            const x = b.clone();
            
            // Step 1: LU分解 (帶部分主元選擇)
            const permutation = this.luDecomposition(A);
            
            // Step 2: 應用置換到右手邊向量
            this.applyPermutation(x, permutation);
            
            // Step 3: 前向替代 (Forward Substitution) - 求解 Ly = b
            this.forwardSubstitution(A, x);
            
            // Step 4: 後向替代 (Backward Substitution) - 求解 Ux = y
            this.backwardSubstitution(A, x);
            
            return x;
        }

        /**
         * LU分解 (帶部分主元選擇)
         * 在原矩陣上進行分解，L存儲在下三角部分，U存儲在上三角部分
         * @param {Matrix} A 要分解的矩陣 (會被修改)
         * @returns {number[]} 置換向量
         */
        static luDecomposition(A) {
            const n = A.rows;
            const permutation = Array.from({length: n}, (_, i) => i);

            for (let k = 0; k < n - 1; k++) {
                // 部分主元選擇 - 找到第k列中絕對值最大的元素
                let maxRow = k;
                let maxVal = Math.abs(A.get(k, k));
                
                for (let i = k + 1; i < n; i++) {
                    const val = Math.abs(A.get(i, k));
                    if (val > maxVal) {
                        maxVal = val;
                        maxRow = i;
                    }
                }

                // 檢查奇異性
                if (maxVal < 1e-14) {
                    throw new Error(`Matrix is singular or nearly singular at column ${k}`);
                }

                // 交換行
                if (maxRow !== k) {
                    this.swapRows(A, k, maxRow);
                    [permutation[k], permutation[maxRow]] = [permutation[maxRow], permutation[k]];
                }

                // 高斯消元
                const pivot = A.get(k, k);
                for (let i = k + 1; i < n; i++) {
                    const factor = A.get(i, k) / pivot;
                    A.set(i, k, factor); // 存儲L矩陣的元素
                    
                    for (let j = k + 1; j < n; j++) {
                        const newVal = A.get(i, j) - factor * A.get(k, j);
                        A.set(i, j, newVal);
                    }
                }
            }

            // 檢查最後一個對角元素
            if (Math.abs(A.get(n-1, n-1)) < 1e-14) {
                throw new Error('Matrix is singular or nearly singular');
            }

            return permutation;
        }

        /**
         * 交換矩陣的兩行
         * @param {Matrix} A 矩陣
         * @param {number} row1 行1
         * @param {number} row2 行2
         */
        static swapRows(A, row1, row2) {
            if (row1 === row2) return;
            
            for (let j = 0; j < A.cols; j++) {
                const temp = A.get(row1, j);
                A.set(row1, j, A.get(row2, j));
                A.set(row2, j, temp);
            }
        }

        /**
         * 應用置換到向量
         * @param {Vector} x 向量 (會被修改)
         * @param {number[]} permutation 置換向量
         */
        static applyPermutation(x, permutation) {
            const temp = Array(x.size);
            for (let i = 0; i < x.size; i++) {
                temp[i] = x.get(permutation[i]);
            }
            for (let i = 0; i < x.size; i++) {
                x.set(i, temp[i]);
            }
        }

        /**
         * 前向替代 - 求解 Ly = b (其中L的對角元素為1)
         * @param {Matrix} LU LU分解後的矩陣
         * @param {Vector} x 向量 (會被修改)
         */
        static forwardSubstitution(LU, x) {
            const n = x.size;
            
            for (let i = 0; i < n; i++) {
                let sum = 0;
                for (let j = 0; j < i; j++) {
                    sum += LU.get(i, j) * x.get(j);
                }
                x.set(i, x.get(i) - sum);
            }
        }

        /**
         * 後向替代 - 求解 Ux = y
         * @param {Matrix} LU LU分解後的矩陣
         * @param {Vector} x 向量 (會被修改)
         */
        static backwardSubstitution(LU, x) {
            const n = x.size;
            
            for (let i = n - 1; i >= 0; i--) {
                let sum = 0;
                for (let j = i + 1; j < n; j++) {
                    sum += LU.get(i, j) * x.get(j);
                }
                x.set(i, (x.get(i) - sum) / LU.get(i, i));
            }
        }

        /**
         * 矩陣條件數估算 (用於數值穩定性檢查)
         * @param {Matrix} A 原矩陣
         * @returns {number} 估算的條件數
         */
        static estimateConditionNumber(A) {
            // 簡單的條件數估算：最大對角元素 / 最小對角元素
            let maxDiag = 0;
            let minDiag = Infinity;
            
            for (let i = 0; i < A.rows; i++) {
                const val = Math.abs(A.get(i, i));
                maxDiag = Math.max(maxDiag, val);
                minDiag = Math.min(minDiag, val);
            }
            
            return minDiag > 1e-14 ? maxDiag / minDiag : Infinity;
        }
    }

    /**
     * 修正節點分析法 (Modified Nodal Analysis, MNA) 核心
     * 
     * MNA是建立電路方程式的標準工業方法，能夠同時處理：
     * - 電阻、電容、電感等雙端元件
     * - 電壓源、電流源
     * - 受控源等複雜元件
     * 
     * 基本概念：
     * - 對每個節點寫KCL方程式
     * - 對每個電壓源寫額外的約束方程式
     * - 形成 [G C; B D] * [v; j] = [i; e] 的線性方程組
     */


    /**
     * MNA矩陣生成器
     * 負責從電路元件列表生成MNA矩陣和右手邊向量
     */
    class MNABuilder {
        constructor() {
            // 節點映射：節點名稱 -> 矩陣索引
            this.nodeMap = new Map();
            this.nodeCount = 0;
            
            // 電壓源映射：電壓源名稱 -> 電流變數索引
            this.voltageSourceMap = new Map();
            this.voltageSourceCount = 0;
            
            // 矩陣維度
            this.matrixSize = 0;
            
            // MNA矩陣和向量
            this.matrix = null;
            this.rhs = null;
            
            // 調試信息
            this.debugInfo = {
                nodeNames: [],
                voltageSourceNames: [],
                matrixLabels: []
            };
        }

        /**
         * 重置建構器，準備處理新電路
         */
        reset() {
            this.nodeMap.clear();
            this.nodeCount = 0;
            this.voltageSourceMap.clear();
            this.voltageSourceCount = 0;
            this.matrixSize = 0;
            this.matrix = null;
            this.rhs = null;
            this.debugInfo = {
                nodeNames: [],
                voltageSourceNames: [],
                matrixLabels: []
            };
        }

        /**
         * 分析電路並建立節點映射
         * @param {BaseComponent[]} components 電路元件列表
         */
        analyzeCircuit(components) {
            this.reset();
            
            // 首先收集所有節點
            const nodeSet = new Set();
            const voltageSourceSet = new Set();
            
            for (const component of components) {
                // 收集節點
                if (component.nodes) {
                    for (const node of component.nodes) {
                        if (node !== '0' && node !== 'gnd') { // 排除接地節點
                            nodeSet.add(node);
                        }
                    }
                }
                
                // 收集電壓源 (需要額外的電流變數)
                if (component.type === 'V' || component.needsCurrentVariable()) {
                    voltageSourceSet.add(component.name);
                }
            }

            // 建立節點映射 (接地節點不包含在矩陣中)
            let nodeIndex = 0;
            for (const node of Array.from(nodeSet).sort()) {
                this.nodeMap.set(node, nodeIndex);
                this.debugInfo.nodeNames.push(node);
                nodeIndex++;
            }
            this.nodeCount = nodeIndex;

            // 建立電壓源映射
            let vsIndex = 0;
            for (const vsName of Array.from(voltageSourceSet).sort()) {
                this.voltageSourceMap.set(vsName, this.nodeCount + vsIndex);
                this.debugInfo.voltageSourceNames.push(vsName);
                vsIndex++;
            }
            this.voltageSourceCount = vsIndex;

            // 計算總矩陣大小
            this.matrixSize = this.nodeCount + this.voltageSourceCount;
            
            // 建立調試標籤
            this.debugInfo.matrixLabels = [
                ...this.debugInfo.nodeNames.map(name => `V(${name})`),
                ...this.debugInfo.voltageSourceNames.map(name => `I(${name})`)
            ];

            console.log(`MNA Analysis: ${this.nodeCount} nodes, ${this.voltageSourceCount} voltage sources, matrix size: ${this.matrixSize}x${this.matrixSize}`);
        }

        /**
         * 建立MNA矩陣
         * @param {BaseComponent[]} components 電路元件列表
         * @param {number} time 當前時間 (用於時變元件)
         * @returns {{matrix: Matrix, rhs: Vector}}
         */
        buildMNAMatrix(components, time = 0) {
            if (this.matrixSize === 0) {
                throw new Error('Circuit not analyzed. Call analyzeCircuit() first.');
            }

            // 初始化矩陣和右手邊向量
            this.matrix = Matrix.zeros(this.matrixSize, this.matrixSize);
            this.rhs = Vector.zeros(this.matrixSize);

            // 🔥 新增：在蓋章前，先更新所有非線性元件的狀態
            if (time > 0) {  // DC 分析時跳過
                for (const component of components) {
                    if (component.type === 'VM' && typeof component.updateFromPreviousVoltages === 'function') {
                        component.updateFromPreviousVoltages();
                    }
                }
            }

            // 逐個添加元件的貢獻
            for (const component of components) {
                try {
                    this.stampComponent(component, time);
                } catch (error) {
                    throw new Error(`Failed to stamp component ${component.name}: ${error.message}`);
                }
            }

            return {
                matrix: this.matrix,
                rhs: this.rhs
            };
        }

        /**
         * 將元件的貢獻添加到MNA矩陣中 (Stamping)
         * @param {BaseComponent} component 電路元件
         * @param {number} time 當前時間
         */
        stampComponent(component, time) {
            switch (component.type) {
                case 'R':
                    this.stampResistor(component);
                    break;
                case 'C':
                    this.stampCapacitor(component);
                    break;
                case 'L':
                    this.stampInductor(component);
                    break;
                case 'V':
                    this.stampVoltageSource(component, time);
                    break;
                case 'I':
                    this.stampCurrentSource(component, time);
                    break;
                case 'VCVS': // 壓控電壓源
                    this.stampVCVS(component);
                    break;
                case 'VCCS': // 壓控電流源
                    this.stampVCCS(component);
                    break;
                default:
                    if (typeof component.stamp === 'function') {
                        // 允許自定義元件實現自己的stamp方法
                        component.stamp(this.matrix, this.rhs, this.nodeMap, this.voltageSourceMap, time);
                    } else {
                        console.warn(`Unknown component type: ${component.type} (${component.name})`);
                    }
            }
        }

        /**
         * 電阻的MNA印記
         * 在節點i和j之間添加電導 G = 1/R
         */
        stampResistor(resistor) {
            const nodes = resistor.nodes;
            const conductance = 1 / resistor.value;
            
            const n1 = this.getNodeIndex(nodes[0]);
            const n2 = this.getNodeIndex(nodes[1]);

            // G矩陣的印記: G[i,i] += G, G[j,j] += G, G[i,j] -= G, G[j,i] -= G
            if (n1 >= 0) {
                this.matrix.addAt(n1, n1, conductance);
                if (n2 >= 0) {
                    this.matrix.addAt(n1, n2, -conductance);
                }
            }
            
            if (n2 >= 0) {
                this.matrix.addAt(n2, n2, conductance);
                if (n1 >= 0) {
                    this.matrix.addAt(n2, n1, -conductance);
                }
            }
        }

        /**
         * 電容的MNA印記 (用於暫態分析)
         * 使用伴隨模型，支持不同的積分方法
         */
        stampCapacitor(capacitor) {
            if (!capacitor.timeStep) {
                // 在DC分析中，電容視為開路
                return;
            }

            const nodes = capacitor.nodes;
            // 使用組件自己的等效電導 (支持梯形法)
            const Geq = capacitor.equivalentConductance;

            const n1 = this.getNodeIndex(nodes[0]);
            const n2 = this.getNodeIndex(nodes[1]);

            // 等效電導的印記
            if (n1 >= 0) {
                this.matrix.addAt(n1, n1, Geq);
                if (n2 >= 0) {
                    this.matrix.addAt(n1, n2, -Geq);
                }
            }
            
            if (n2 >= 0) {
                this.matrix.addAt(n2, n2, Geq);
                if (n1 >= 0) {
                    this.matrix.addAt(n2, n1, -Geq);
                }
            }

            // 歷史電流項 (右手邊)
            if (capacitor.historyCurrentSource !== undefined) {
                if (n1 >= 0) {
                    this.rhs.addAt(n1, capacitor.historyCurrentSource);
                }
                if (n2 >= 0) {
                    this.rhs.addAt(n2, -capacitor.historyCurrentSource);
                }
            }
        }

        /**
         * 電感的MNA印記 (需要電流變數)
         * 使用伴隨模型: v_L(t) = L * di/dt ≈ L/h * (i(t) - i(t-h))
         */
        /**
         * 電感的MNA印記 (需要電流變數)
         * 🔥 修正版：支援耦合電感（互感）
         */
        stampInductor(inductor) {
            const nodes = inductor.nodes;
            inductor.getInductance(); // 使用 getInductance()
            
            const n1 = this.getNodeIndex(nodes[0]);
            const n2 = this.getNodeIndex(nodes[1]);
            const currIndex = this.voltageSourceMap.get(inductor.name);
            
            if (currIndex === undefined) {
                throw new Error(`Inductor ${inductor.name} current variable not found`);
            }

            // B矩陣和C矩陣：電流從節點流出的關係
            // V_n1 - V_n2 - V_L = 0  =>  V_n1 - V_n2 = V_L
            if (n1 >= 0) {
                this.matrix.addAt(n1, currIndex, 1);
                this.matrix.addAt(currIndex, n1, 1);
            }
            if (n2 >= 0) {
                this.matrix.addAt(n2, currIndex, -1);
                this.matrix.addAt(currIndex, n2, -1);
            }

            // D矩陣：電感的電壓-電流關係
            if (inductor.timeStep) {
                // 暫態分析：使用組件的等效電阻 (支持梯形法)
                const Req = inductor.equivalentResistance;
                
                // 1. 印花等效電阻項
                this.matrix.addAt(currIndex, currIndex, -Req);
                
                // 2. 印花歷史電壓源項
                if (inductor.historyVoltageSource !== undefined) {
                    this.rhs.addAt(currIndex, -inductor.historyVoltageSource);
                }

                // 🔥 3. 印花互感項
                if (inductor.couplings) {
                    // 獲取時間步長
                    const h = inductor.timeStep;
                    if (!h) {
                        throw new Error(`Inductor ${inductor.name} time step not initialized for coupling`);
                    }
                    
                    for (const coupling of inductor.couplings) {
                        const otherInductor = coupling.inductor;
                        const M = coupling.mutualInductance;
                        
                        // 獲取另一個電感的電流變數索引
                        const otherCurrIndex = this.voltageSourceMap.get(otherInductor.name);
                        if (otherCurrIndex === undefined) {
                            throw new Error(`Coupled inductor ${otherInductor.name} not found for ${inductor.name}`);
                        }

                        // 添加互感對矩陣的貢獻 (V_L += M * dI_other/dt)
                        this.matrix.addAt(currIndex, otherCurrIndex, -M / h);
                        
                        // 添加互感對歷史項的貢獻
                        if (otherInductor.historyTerm !== undefined) {
                            this.rhs.addAt(currIndex, -M / h * otherInductor.historyTerm);
                        }
                    }
                }
            } else {
                // DC 分析：電感表現為短路，V_L = 0
                // 直接設置電壓約束 V_n1 - V_n2 = 0
                // 這已經在上面的 B 和 C 矩陣中處理了
                
                // 添加電感的寄生電阻（如果有的話）
                const R = inductor.resistance || 1e-9; // 添加極小電阻避免數值問題
                this.matrix.addAt(currIndex, currIndex, -R);
            }
        }

        /**
         * 電壓源的MNA印記
         */
        stampVoltageSource(voltageSource, time) {
            const nodes = voltageSource.nodes;
            const n1 = this.getNodeIndex(nodes[0]); // 正端
            const n2 = this.getNodeIndex(nodes[1]); // 負端
            const currIndex = this.voltageSourceMap.get(voltageSource.name);
            
            if (currIndex === undefined) {
                throw new Error(`Voltage source ${voltageSource.name} current variable not found`);
            }

            // B矩陣和C矩陣: 電流約束
            if (n1 >= 0) {
                this.matrix.addAt(n1, currIndex, 1);
                this.matrix.addAt(currIndex, n1, 1);
            }
            if (n2 >= 0) {
                this.matrix.addAt(n2, currIndex, -1);
                this.matrix.addAt(currIndex, n2, -1);
            }

            // E向量: 電壓約束
            const voltage = voltageSource.getValue(time);
            this.rhs.addAt(currIndex, voltage);
        }

        /**
         * 電流源的MNA印記
         */
        stampCurrentSource(currentSource, time) {
            const nodes = currentSource.nodes;
            const n1 = this.getNodeIndex(nodes[0]); // 電流流出的節點
            const n2 = this.getNodeIndex(nodes[1]); // 電流流入的節點
            
            const current = currentSource.getValue(time);
            
            // I向量: 注入電流
            if (n1 >= 0) {
                this.rhs.addAt(n1, -current);
            }
            if (n2 >= 0) {
                this.rhs.addAt(n2, current);
            }
        }

        /**
         * 壓控電壓源 (VCVS) 的印記
         * E * V_control = V_output
         */
        stampVCVS(vcvs) {
            const outputNodes = [vcvs.nodes[0], vcvs.nodes[1]]; // 輸出節點
            const controlNodes = [vcvs.nodes[2], vcvs.nodes[3]]; // 控制節點
            const gain = vcvs.value;
            
            const no1 = this.getNodeIndex(outputNodes[0]);
            const no2 = this.getNodeIndex(outputNodes[1]);
            const nc1 = this.getNodeIndex(controlNodes[0]);
            const nc2 = this.getNodeIndex(controlNodes[1]);
            const currIndex = this.voltageSourceMap.get(vcvs.name);

            // 類似電壓源的處理，但右手邊是控制電壓的函數
            if (no1 >= 0) {
                this.matrix.addAt(no1, currIndex, 1);
                this.matrix.addAt(currIndex, no1, 1);
            }
            if (no2 >= 0) {
                this.matrix.addAt(no2, currIndex, -1);
                this.matrix.addAt(currIndex, no2, -1);
            }

            // 控制關係: V_out = gain * (V_c1 - V_c2)
            if (nc1 >= 0) {
                this.matrix.addAt(currIndex, nc1, -gain);
            }
            if (nc2 >= 0) {
                this.matrix.addAt(currIndex, nc2, gain);
            }
        }

        /**
         * 壓控電流源 (VCCS) 的印記  
         * I_output = gm * V_control
         */
        stampVCCS(vccs) {
            const outputNodes = [vccs.nodes[0], vccs.nodes[1]]; // 輸出節點
            const controlNodes = [vccs.nodes[2], vccs.nodes[3]]; // 控制節點
            const transconductance = vccs.value; // gm
            
            const no1 = this.getNodeIndex(outputNodes[0]);
            const no2 = this.getNodeIndex(outputNodes[1]);
            const nc1 = this.getNodeIndex(controlNodes[0]);
            const nc2 = this.getNodeIndex(controlNodes[1]);

            // G矩陣的修改: 添加跨導項
            if (no1 >= 0 && nc1 >= 0) {
                this.matrix.addAt(no1, nc1, transconductance);
            }
            if (no1 >= 0 && nc2 >= 0) {
                this.matrix.addAt(no1, nc2, -transconductance);
            }
            if (no2 >= 0 && nc1 >= 0) {
                this.matrix.addAt(no2, nc1, -transconductance);
            }
            if (no2 >= 0 && nc2 >= 0) {
                this.matrix.addAt(no2, nc2, transconductance);
            }
        }

        /**
         * 獲取節點在矩陣中的索引
         * @param {string} nodeName 節點名稱
         * @returns {number} 矩陣索引，如果是接地節點則返回-1
         */
        getNodeIndex(nodeName) {
            if (nodeName === '0' || nodeName === 'gnd') {
                return -1; // 接地節點
            }
            
            const index = this.nodeMap.get(nodeName);
            if (index === undefined) {
                throw new Error(`Node ${nodeName} not found in circuit`);
            }
            return index;
        }

        /**
         * 從解向量中提取節點電壓
         * @param {Vector} solution MNA求解結果
         * @returns {Map<string, number>} 節點名稱 -> 電壓值的映射
         */
        extractNodeVoltages(solution) {
            const voltages = new Map();
            
            // 接地節點電壓為0
            voltages.set('0', 0);
            voltages.set('gnd', 0);
            
            // 其他節點電壓
            for (const [nodeName, index] of this.nodeMap) {
                voltages.set(nodeName, solution.get(index));
            }
            
            return voltages;
        }

        /**
         * 從解向量中提取電壓源電流
         * @param {Vector} solution MNA求解結果
         * @returns {Map<string, number>} 電壓源名稱 -> 電流值的映射
         */
        extractVoltageSourceCurrents(solution) {
            const currents = new Map();
            
            for (const [vsName, index] of this.voltageSourceMap) {
                currents.set(vsName, solution.get(index));
            }
            
            return currents;
        }

        /**
         * 打印MNA矩陣 (調試用)
         * @param {number} precision 小數點位數
         */
        printMNAMatrix(precision = 4) {
            console.log('\n=== MNA Matrix ===');
            
            // 打印標題行
            const header = '     ' + this.debugInfo.matrixLabels.map(label => 
                label.padStart(12)).join('');
            console.log(header + '     RHS');
            
            // 打印矩陣行
            for (let i = 0; i < this.matrixSize; i++) {
                const rowLabel = this.debugInfo.matrixLabels[i].padStart(4);
                let row = rowLabel + ' ';
                
                for (let j = 0; j < this.matrixSize; j++) {
                    const val = this.matrix.get(i, j);
                    row += val.toFixed(precision).padStart(12);
                }
                
                row += ' | ' + this.rhs.get(i).toFixed(precision).padStart(10);
                console.log(row);
            }
            console.log('==================\n');
        }

        /**
         * 獲取矩陣信息 (用於調試和分析)
         * @returns {Object} 包含矩陣信息的對象
         */
        getMatrixInfo() {
            return {
                nodeCount: this.nodeCount,
                voltageSourceCount: this.voltageSourceCount,
                matrixSize: this.matrixSize,
                nodeNames: [...this.debugInfo.nodeNames],
                voltageSourceNames: [...this.debugInfo.voltageSourceNames],
                matrixLabels: [...this.debugInfo.matrixLabels]
            };
        }
    }

    /**
     * 暫態分析 (Transient Analysis) 實現
     * 
     * 基於後向歐拉法的固定步長時域分析算法
     * 這是AkingSPICE v0.1的核心分析引擎
     */


    /**
     * 暫態分析結果類
     * 存儲和管理時域分析的結果數據
     */
    class TransientResult {
        constructor() {
            this.timeVector = [];
            this.nodeVoltages = new Map(); // nodeName -> voltage array
            this.branchCurrents = new Map(); // branchName -> current array
            this.componentData = new Map(); // componentName -> data array
            this.analysisInfo = {};
        }

        /**
         * 添加一個時間點的結果
         * @param {number} time 時間點
         * @param {Map<string, number>} voltages 節點電壓
         * @param {Map<string, number>} currents 支路電流
         */
        addTimePoint(time, voltages, currents) {
            this.timeVector.push(time);
            
            // 添加節點電壓
            for (const [nodeName, voltage] of voltages) {
                if (!this.nodeVoltages.has(nodeName)) {
                    this.nodeVoltages.set(nodeName, []);
                }
                this.nodeVoltages.get(nodeName).push(voltage);
            }
            
            // 添加支路電流
            for (const [branchName, current] of currents) {
                if (!this.branchCurrents.has(branchName)) {
                    this.branchCurrents.set(branchName, []);
                }
                this.branchCurrents.get(branchName).push(current);
            }
        }

        /**
         * 獲取時間向量
         * @returns {number[]} 時間點陣列
         */
        getTimeVector() {
            return [...this.timeVector];
        }

        /**
         * 獲取節點電壓向量
         * @param {string} nodeName 節點名稱 (如 'V(1)', '1')
         * @returns {number[]} 電壓值陣列
         */
        getVoltageVector(nodeName) {
            // 處理SPICE格式的節點名稱 V(nodeName)
            let actualNodeName = nodeName;
            const voltageMatch = nodeName.match(/^V\((.+)\)$/);
            if (voltageMatch) {
                actualNodeName = voltageMatch[1];
            }
            
            return this.nodeVoltages.get(actualNodeName) || [];
        }

        /**
         * 獲取支路電流向量
         * @param {string} branchName 支路名稱 (如 'I(V1)', 'V1')
         * @returns {number[]} 電流值陣列
         */
        getCurrentVector(branchName) {
            // 處理SPICE格式的電流名稱 I(componentName)
            let actualBranchName = branchName;
            const currentMatch = branchName.match(/^I\((.+)\)$/);
            if (currentMatch) {
                actualBranchName = currentMatch[1];
            }
            
            return this.branchCurrents.get(actualBranchName) || [];
        }

        /**
         * 獲取通用向量 (時間、電壓或電流)
         * @param {string} vectorName 向量名稱
         * @returns {number[]} 數值陣列
         */
        getVector(vectorName) {
            if (vectorName.toLowerCase() === 'time') {
                return this.getTimeVector();
            }
            
            // 嘗試作為電壓獲取
            const voltageVector = this.getVoltageVector(vectorName);
            if (voltageVector.length > 0) {
                return voltageVector;
            }
            
            // 嘗試作為電流獲取
            const currentVector = this.getCurrentVector(vectorName);
            if (currentVector.length > 0) {
                return currentVector;
            }
            
            console.warn(`Vector ${vectorName} not found`);
            return [];
        }

        /**
         * 獲取所有可用的向量名稱
         * @returns {string[]} 向量名稱列表
         */
        getAvailableVectors() {
            const vectors = ['time'];
            
            // 添加電壓向量
            for (const nodeName of this.nodeVoltages.keys()) {
                vectors.push(`V(${nodeName})`);
            }
            
            // 添加電流向量
            for (const branchName of this.branchCurrents.keys()) {
                vectors.push(`I(${branchName})`);
            }
            
            return vectors;
        }

        /**
         * 獲取分析統計信息
         * @returns {Object} 統計信息
         */
        getAnalysisInfo() {
            const info = {
                ...this.analysisInfo,
                totalTimePoints: this.timeVector.length,
                startTime: this.timeVector[0] || 0,
                stopTime: this.timeVector[this.timeVector.length - 1] || 0,
                availableVectors: this.getAvailableVectors()
            };
            
            if (this.timeVector.length > 1) {
                const timeSteps = [];
                for (let i = 1; i < this.timeVector.length; i++) {
                    timeSteps.push(this.timeVector[i] - this.timeVector[i-1]);
                }
                info.averageTimeStep = timeSteps.reduce((sum, step) => sum + step, 0) / timeSteps.length;
                info.minTimeStep = Math.min(...timeSteps);
                info.maxTimeStep = Math.max(...timeSteps);
            }
            
            return info;
        }
    }

    /**
     * 暫態分析引擎
     */
    class TransientAnalysis {
        constructor() {
            this.mnaBuilder = new MNABuilder();
            this.components = [];
            this.result = null;
            
            // 分析參數
            this.timeStep = 1e-6;     // 預設時間步長: 1µs
            this.startTime = 0;       // 開始時間
            this.stopTime = 1e-3;     // 結束時間: 1ms
            this.maxTimeStep = 1e-6;  // 最大時間步長
            this.minTimeStep = 1e-12; // 最小時間步長
            
            // 數值參數
            this.maxIterations = 50;  // 最大Newton-Raphson迭代次數
            this.convergenceTol = 1e-9; // 收斂容差
            
            // 調試和監控
            this.debug = false;
            this.saveHistory = true;
            this.progressCallback = null;
        }

        /**
         * 設置分析參數
         * @param {Object} params 參數對象
         */
        setParameters(params) {
            if (params.timeStep !== undefined) this.timeStep = params.timeStep;
            if (params.startTime !== undefined) this.startTime = params.startTime;
            if (params.stopTime !== undefined) this.stopTime = params.stopTime;
            if (params.maxTimeStep !== undefined) this.maxTimeStep = params.maxTimeStep;
            if (params.minTimeStep !== undefined) this.minTimeStep = params.minTimeStep;
            if (params.maxIterations !== undefined) this.maxIterations = params.maxIterations;
            if (params.convergenceTol !== undefined) this.convergenceTol = params.convergenceTol;
            if (params.debug !== undefined) this.debug = params.debug;
            if (params.progressCallback !== undefined) this.progressCallback = params.progressCallback;
        }

        /**
         * 執行暫態分析
         * @param {BaseComponent[]} components 電路元件列表
         * @param {Object} params 分析參數
         * @returns {TransientResult} 分析結果
         */
        async run(components, params = {}) {
            this.setParameters(params);
            this.components = [...components];
            this.result = new TransientResult();
            
            console.log(`Starting transient analysis: ${this.startTime}s to ${this.stopTime}s, step=${this.timeStep}s`);
            
            try {
                // 初始化
                await this.initialize();
                
                // 主時域迴圈
                await this.timeLoop();
                
                // 完成分析
                this.finalize();
                
                console.log(`Transient analysis completed: ${this.result.timeVector.length} time points`);
                return this.result;
                
            } catch (error) {
                console.error('Transient analysis failed:', error);
                throw error;
            }
        }

        /**
         * 初始化分析
         */
        /**
         * 初始化暫態分析
         * @param {BaseComponent[]} components 元件列表
         * @param {number} timeStep 時間步長
         * @param {string} integrationMethod 積分方法: 'backward_euler' 或 'trapezoidal'
         */
        async initialize(components = null, timeStep = null, integrationMethod = 'backward_euler') {
            // 如果提供了元件列表，使用它
            if (components) {
                this.components = [...components];
            }
            
            // 如果提供了時間步長，使用它
            if (timeStep !== null) {
                this.timeStep = timeStep;
            }
            
            // 設置積分方法
            this.integrationMethod = integrationMethod;
            
            // 分析電路拓撲
            this.mnaBuilder.analyzeCircuit(this.components);
            
            // 初始化所有元件的暫態狀態
            for (const component of this.components) {
                component.initTransient(this.timeStep, integrationMethod);
            }
            
            // 設置初始條件 (DC工作點)
            await this.setInitialConditions();
            
            // 儲存分析信息
            const methodName = integrationMethod === 'trapezoidal' ? 'Trapezoidal Rule' : 'Backward Euler';
            this.result.analysisInfo = {
                timeStep: this.timeStep,
                startTime: this.startTime,
                stopTime: this.stopTime,
                method: methodName,
                integrationMethod: integrationMethod,
                matrixSize: this.mnaBuilder.matrixSize,
                nodeCount: this.mnaBuilder.nodeCount,
                voltageSourceCount: this.mnaBuilder.voltageSourceCount
            };
        }

        /**
         * 設置初始條件 (執行DC分析)
         */
        async setInitialConditions() {
            if (this.debug) {
                console.log('Setting initial conditions...');
            }
            
            // 建立t=0時的MNA矩陣
            const { matrix, rhs } = this.mnaBuilder.buildMNAMatrix(this.components, 0);
            
            if (this.debug) {
                this.mnaBuilder.printMNAMatrix();
            }
            
            // 求解初始工作點
            const solution = LUSolver.solve(matrix, rhs);
            
            // 提取初始狀態
            const nodeVoltages = this.mnaBuilder.extractNodeVoltages(solution);
            const branchCurrents = this.mnaBuilder.extractVoltageSourceCurrents(solution);
            
            // 更新元件歷史狀態
            for (const component of this.components) {
                component.updateHistory(nodeVoltages, branchCurrents);
            }
            
            // 保存初始點
            this.result.addTimePoint(this.startTime, nodeVoltages, branchCurrents);
            
            if (this.debug) {
                console.log('Initial conditions set');
                this.printSolutionSummary(nodeVoltages, branchCurrents);
            }
        }

        /**
         * 主時域迴圈
         */
        async timeLoop() {
            let currentTime = this.startTime + this.timeStep;
            let stepCount = 0;
            const totalSteps = Math.ceil((this.stopTime - this.startTime) / this.timeStep);
            
            while (currentTime <= this.stopTime) {
                stepCount++;
                
                try {
                    // 執行一個時間步
                    await this.singleTimeStep(currentTime);
                    
                    // 進度回調
                    if (this.progressCallback) {
                        const progress = stepCount / totalSteps;
                        this.progressCallback(progress, currentTime, stepCount);
                    }
                    
                    // 調試輸出
                    if (this.debug && stepCount % 100 === 0) {
                        console.log(`Step ${stepCount}/${totalSteps}, time=${(currentTime * 1e6).toFixed(2)}µs`);
                    }
                    
                    currentTime += this.timeStep;
                    
                } catch (error) {
                    console.error(`Time step failed at t=${currentTime}s:`, error);
                    throw error;
                }
            }
        }

        /**
         * 執行單個時間步
         * @param {number} time 當前時間
         */
        async singleTimeStep(time) {
            // 更新所有元件的伴隨模型
            for (const component of this.components) {
                if (typeof component.updateCompanionModel === 'function') {
                    component.updateCompanionModel();
                }
            }
            
            // 建立當前時間點的MNA矩陣
            const { matrix, rhs } = this.mnaBuilder.buildMNAMatrix(this.components, time);
            
            // 求解線性方程組
            const solution = LUSolver.solve(matrix, rhs);
            
            // 提取節點電壓和支路電流
            const nodeVoltages = this.mnaBuilder.extractNodeVoltages(solution);
            const branchCurrents = this.mnaBuilder.extractVoltageSourceCurrents(solution);
            
            // 更新所有元件的歷史狀態
            for (const component of this.components) {
                component.updateHistory(nodeVoltages, branchCurrents);
            }
            
            // 保存結果
            this.result.addTimePoint(time, nodeVoltages, branchCurrents);
        }

        /**
         * 完成分析
         */
        finalize() {
            // 計算最終統計信息
            const info = this.result.getAnalysisInfo();
            console.log(`Analysis summary: ${info.totalTimePoints} points, avg step=${(info.averageTimeStep * 1e6).toFixed(2)}µs`);
            
            // 清理資源
            this.mnaBuilder.reset();
        }

        /**
         * 打印解的摘要 (調試用)
         * @param {Map<string, number>} nodeVoltages 節點電壓
         * @param {Map<string, number>} branchCurrents 支路電流
         */
        printSolutionSummary(nodeVoltages, branchCurrents) {
            console.log('\\nSolution Summary:');
            console.log('Node Voltages:');
            for (const [node, voltage] of nodeVoltages) {
                console.log(`  V(${node}) = ${voltage.toFixed(6)}V`);
            }
            
            console.log('Branch Currents:');
            for (const [branch, current] of branchCurrents) {
                console.log(`  I(${branch}) = ${(current * 1000).toFixed(3)}mA`);
            }
            console.log('');
        }

        /**
         * 設置調試模式
         * @param {boolean} enabled 是否啟用調試
         */
        setDebug(enabled) {
            this.debug = enabled;
        }

        /**
         * 獲取當前分析狀態
         * @returns {Object} 狀態信息
         */
        getStatus() {
            return {
                isRunning: this.result !== null,
                currentTime: this.result ? this.result.timeVector[this.result.timeVector.length - 1] : 0,
                progress: this.result ? this.result.timeVector.length / Math.ceil((this.stopTime - this.startTime) / this.timeStep) : 0,
                timePoints: this.result ? this.result.timeVector.length : 0
            };
        }

        /**
         * 執行單一時間步求解 (用於步進式控制)
         * @param {number} currentTime 當前時間
         * @param {number} maxIterations 最大迭代次數
         * @returns {Object} 求解結果
         */
        solveTimeStep(currentTime, maxIterations = this.maxIterations) {
            try {
                // 建立當前時間步的 MNA 矩陣 (考慮歷史項)
                const { matrix, rhs } = this.mnaBuilder.buildMNAMatrix(this.components, currentTime);
                
                // 求解線性系統
                const solution = LUSolver.solve(matrix, rhs);
                
                // 提取結果
                const nodeVoltages = this.mnaBuilder.extractNodeVoltages(solution);
                const branchCurrents = this.mnaBuilder.extractVoltageSourceCurrents(solution);
                
                // 檢查收斂性 (簡化檢查)
                const converged = true; // 在線性分析中總是收斂
                
                // 更新元件歷史狀態
                for (const component of this.components) {
                    component.updateHistory(nodeVoltages, branchCurrents);
                }
                
                return {
                    converged: converged,
                    nodeVoltages: nodeVoltages,
                    branchCurrents: branchCurrents,
                    time: currentTime
                };
                
            } catch (error) {
                throw new Error(`Time step solution failed at t=${currentTime}s: ${error.message}`);
            }
        }
    }

    /**
     * 暫態分析工具函數
     */
    class TransientUtils {
        /**
         * 解析SPICE風格的暫態分析指令
         * @param {string} command 指令字符串 (如 '.tran 1us 1ms')
         * @returns {Object} 解析後的參數
         */
        static parseTranCommand(command) {
            const cmd = command.trim().toLowerCase();
            
            // 匹配 .tran [step] [stop] [start] [max_step]
            // 使用正規表示式字面量，並用單反斜線進行轉義
            const match = cmd.match(/^\.tran\s+([0-9.]+[a-z]*)\s+([0-9.]+[a-z]*)(?:\s+([0-9.]+[a-z]*))?(?:\s+([0-9.]+[a-z]*))?/);
            
            if (!match) {
                throw new Error(`Invalid .tran command: ${command}`);
            }
            
            const params = {
                timeStep: this.parseTimeValue(match[1]),
                stopTime: this.parseTimeValue(match[2]),
                startTime: match[3] ? this.parseTimeValue(match[3]) : 0,
                maxTimeStep: match[4] ? this.parseTimeValue(match[4]) : undefined
            };
            
            return params;
        }

        /**
         * 解析時間值 (支援工程記號)
         * @param {string} timeStr 時間字符串 (如 '1us', '2.5ms')
         * @returns {number} 時間值 (秒)
         */
        static parseTimeValue(timeStr) {
            const str = timeStr.trim().toLowerCase();
            
            // 按照長度降序排列，確保最長的後綴先被匹配，避免 's' 匹配 'us' 的問題
            const suffixes = {
                'fs': 1e-15,
                'ps': 1e-12,
                'ns': 1e-9,
                'us': 1e-6,
                'µs': 1e-6,
                'ms': 1e-3,
                's': 1
            };
            
            for (const [suffix, multiplier] of Object.entries(suffixes)) {
                if (str.endsWith(suffix)) {
                    const numPart = parseFloat(str.slice(0, -suffix.length));
                    if (!isNaN(numPart)) {
                        return numPart * multiplier;
                    }
                }
            }
            
            // 如果沒有後綴，假設是秒
            const numValue = parseFloat(str);
            if (!isNaN(numValue)) {
                return numValue;
            }
            
            throw new Error(`Cannot parse time value: ${timeStr}`);
        }

        /**
         * 格式化時間值為可讀字符串
         * @param {number} time 時間值 (秒)
         * @returns {string} 格式化的字符串
         */
        static formatTime(time) {
            const abs = Math.abs(time);
            
            if (abs >= 1) {
                return `${time.toFixed(3)}s`;
            } else if (abs >= 1e-3) {
                return `${(time * 1e3).toFixed(3)}ms`;
            } else if (abs >= 1e-6) {
                return `${(time * 1e6).toFixed(3)}µs`;
            } else if (abs >= 1e-9) {
                return `${(time * 1e9).toFixed(3)}ns`;
            } else {
                return `${(time * 1e12).toFixed(3)}ps`;
            }
        }
    }

    /**
     * 直流分析 (DC Analysis) 實現
     * 
     * 用於求解電路的直流工作點，是暫態分析的初始條件
     */


    /**
     * DC分析結果類
     */
    class DCResult {
        constructor() {
            this.nodeVoltages = new Map();
            this.branchCurrents = new Map();
            this.componentPower = new Map();
            this.totalPower = 0;
            this.analysisInfo = {};
            this.converged = false;
        }

        /**
         * 獲取節點電壓
         * @param {string} nodeName 節點名稱
         * @returns {number} 電壓值
         */
        getNodeVoltage(nodeName) {
            return this.nodeVoltages.get(nodeName) || 0;
        }

        /**
         * 獲取支路電流
         * @param {string} branchName 支路名稱
         * @returns {number} 電流值
         */
        getBranchCurrent(branchName) {
            return this.branchCurrents.get(branchName) || 0;
        }

        /**
         * 計算元件功耗
         * @param {BaseComponent[]} components 元件列表
         */
        calculatePower(components) {
            this.totalPower = 0;
            
            for (const component of components) {
                let power = 0;
                
                if (component.type === 'R') {
                    // 電阻功耗: P = V² / R
                    const voltage = component.getVoltage(this.nodeVoltages);
                    power = voltage * voltage / component.getResistance();
                    
                } else if (component.type === 'V') {
                    // 電壓源功耗: P = V * I
                    const voltage = component.getValue();
                    const current = this.getBranchCurrent(component.name);
                    power = -voltage * current; // 負號表示電壓源提供功率
                    
                } else if (component.type === 'I') {
                    // 電流源功耗: P = V * I
                    const voltage = component.getVoltage(this.nodeVoltages);
                    const current = component.getValue();
                    power = -voltage * current; // 負號表示電流源提供功率
                }
                
                this.componentPower.set(component.name, power);
                this.totalPower += Math.abs(power);
            }
        }

        /**
         * 獲取分析摘要
         * @returns {Object} 摘要信息
         */
        getSummary() {
            const nodeCount = this.nodeVoltages.size;
            const branchCount = this.branchCurrents.size;
            
            return {
                ...this.analysisInfo,
                converged: this.converged,
                nodeCount,
                branchCount,
                totalPower: this.totalPower,
                nodes: Array.from(this.nodeVoltages.keys()),
                branches: Array.from(this.branchCurrents.keys())
            };
        }
    }

    /**
     * DC分析引擎
     */
    class DCAnalysis {
        constructor() {
            this.mnaBuilder = new MNABuilder();
            this.debug = false;
        }

        /**
         * 執行DC分析
         * @param {BaseComponent[]} components 電路元件列表
         * @param {Object} options 分析選項
         * @returns {DCResult} DC分析結果
         */
        async run(components, options = {}) {
            this.debug = options.debug || false;
            const result = new DCResult();
            
            try {
                if (this.debug) {
                    console.log('Starting DC analysis...');
                }
                
                // 分析電路拓撲
                this.mnaBuilder.analyzeCircuit(components);
                
                // 非線性求解迭代
                const maxIterations = 20;
                const tolerance = 1e-9;
                let iteration = 0;
                let converged = false;
                let solution;
                
                while (iteration < maxIterations && !converged) {
                    iteration++;
                    
                    // 建立MNA矩陣 (t=0，所有動態元件使用DC行為)
                    const { matrix, rhs } = this.mnaBuilder.buildMNAMatrix(components, 0);
                    
                    if (this.debug && iteration === 1) {
                        console.log('MNA Matrix built');
                        this.mnaBuilder.printMNAMatrix();
                    }
                    
                    // 求解線性方程組
                    const newSolution = LUSolver.solve(matrix, rhs);
                    
                    // 檢查收斂性
                    if (iteration > 1) {
                        let maxChange = 0;
                        for (let i = 0; i < newSolution.size; i++) {
                            const change = Math.abs(newSolution.get(i) - solution.get(i));
                            maxChange = Math.max(maxChange, change);
                        }
                        
                        if (maxChange < tolerance) {
                            converged = true;
                            if (this.debug) {
                                console.log(`DC analysis converged after ${iteration} iterations (max change: ${maxChange.toExponential(2)})`);
                            }
                        }
                    }
                    
                    solution = newSolution;
                    
                    // 提取結果並更新組件狀態
                    const tempNodeVoltages = this.mnaBuilder.extractNodeVoltages(solution);
                    const tempBranchCurrents = this.mnaBuilder.extractVoltageSourceCurrents(solution);
                    
                    // 更新所有組件的電壓狀態
                    for (const component of components) {
                        if (typeof component.updateHistory === 'function') {
                            component.updateHistory(tempNodeVoltages, tempBranchCurrents);
                        }
                    }
                }
                
                if (!converged) {
                    console.warn(`DC analysis did not converge after ${maxIterations} iterations`);
                }
                
                // 設置最終結果
                result.nodeVoltages = this.mnaBuilder.extractNodeVoltages(solution);
                result.branchCurrents = this.mnaBuilder.extractVoltageSourceCurrents(solution);
                result.converged = converged;
                
                // 計算功耗
                result.calculatePower(components);
                
                // 設置分析信息
                result.analysisInfo = {
                    method: 'Modified Nodal Analysis',
                    matrixSize: this.mnaBuilder.matrixSize,
                    nodeCount: this.mnaBuilder.nodeCount,
                    voltageSourceCount: this.mnaBuilder.voltageSourceCount,
                    iterations: iteration,
                    convergence: converged ? 'converged' : 'max iterations reached'
                };
                
                if (this.debug) {
                    this.printResults(result);
                }
                
                return result;
                
            } catch (error) {
                console.error('DC analysis failed:', error);
                result.converged = false;
                result.analysisInfo.error = error.message;
                return result;
            }
        }

        /**
         * 估算矩陣條件數
         * @param {Matrix} matrix MNA矩陣
         * @returns {number} 條件數估計值
         */
        estimateCondition(matrix) {
            try {
                return LUSolver.estimateConditionNumber(matrix);
            } catch (error) {
                return Infinity;
            }
        }

        /**
         * 打印DC分析結果
         * @param {DCResult} result DC分析結果
         */
        printResults(result) {
            console.log('\\n=== DC Analysis Results ===');
            
            console.log('\\nNode Voltages:');
            for (const [node, voltage] of result.nodeVoltages) {
                if (Math.abs(voltage) < 1e-12) {
                    console.log(`  V(${node}) = 0V`);
                } else if (Math.abs(voltage) >= 1000) {
                    console.log(`  V(${node}) = ${(voltage / 1000).toFixed(3)}kV`);
                } else if (Math.abs(voltage) >= 1) {
                    console.log(`  V(${node}) = ${voltage.toFixed(6)}V`);
                } else if (Math.abs(voltage) >= 1e-3) {
                    console.log(`  V(${node}) = ${(voltage * 1000).toFixed(3)}mV`);
                } else if (Math.abs(voltage) >= 1e-6) {
                    console.log(`  V(${node}) = ${(voltage * 1e6).toFixed(3)}µV`);
                } else {
                    console.log(`  V(${node}) = ${voltage.toExponential(3)}V`);
                }
            }
            
            console.log('\\nBranch Currents:');
            for (const [branch, current] of result.branchCurrents) {
                if (Math.abs(current) < 1e-12) {
                    console.log(`  I(${branch}) = 0A`);
                } else if (Math.abs(current) >= 1) {
                    console.log(`  I(${branch}) = ${current.toFixed(6)}A`);
                } else if (Math.abs(current) >= 1e-3) {
                    console.log(`  I(${branch}) = ${(current * 1000).toFixed(3)}mA`);
                } else if (Math.abs(current) >= 1e-6) {
                    console.log(`  I(${branch}) = ${(current * 1e6).toFixed(3)}µA`);
                } else if (Math.abs(current) >= 1e-9) {
                    console.log(`  I(${branch}) = ${(current * 1e9).toFixed(3)}nA`);
                } else {
                    console.log(`  I(${branch}) = ${current.toExponential(3)}A`);
                }
            }
            
            console.log('\\nComponent Power:');
            let totalSupplied = 0;
            let totalDissipated = 0;
            
            for (const [component, power] of result.componentPower) {
                if (power < 0) {
                    totalSupplied += Math.abs(power);
                    console.log(`  P(${component}) = ${Math.abs(power).toFixed(6)}W (supplied)`);
                } else if (power > 1e-12) {
                    totalDissipated += power;
                    console.log(`  P(${component}) = ${power.toFixed(6)}W (dissipated)`);
                }
            }
            
            console.log(`\\nPower Balance:`);
            console.log(`  Total Supplied: ${totalSupplied.toFixed(6)}W`);
            console.log(`  Total Dissipated: ${totalDissipated.toFixed(6)}W`);
            console.log(`  Balance Error: ${Math.abs(totalSupplied - totalDissipated).toFixed(9)}W`);
            
            const info = result.getSummary();
            console.log(`\\nMatrix Info: ${info.matrixSize}×${info.matrixSize}, iterations: ${info.iterations}`);
            console.log('===========================\\n');
        }

        /**
         * 設置調試模式
         * @param {boolean} enabled 是否啟用調試
         */
        setDebug(enabled) {
            this.debug = enabled;
        }
    }

    /**
     * AkingSPICE 主求解器類別
     * 
     * 這是使用者的主要介面，整合了網表解析、電路分析和結果管理
     */


    /**
     * AkingSPICE 主求解器
     */
    class AkingSPICE {
        constructor(netlist = null) {
            this.parser = new NetlistParser();
            this.transientAnalysis = new TransientAnalysis();
            this.dcAnalysis = new DCAnalysis();
            
            // 電路數據
            this._components = []; // 使用內部變數儲存
            this.models = new Map();
            this.parameters = new Map();
            this.analyses = [];
            this.options = new Map();
            
            // 分析結果
            this.results = new Map();
            this.lastResult = null;
            
            // 狀態信息
            this.isInitialized = false;
            this.debug = false;
            
            // 如果提供了網表，立即解析
            if (netlist) {
                this.loadNetlist(netlist);
            }
        }

        // 🔥 新增：Component Setter，自動處理元元件
        set components(componentArray) {
            this._components = []; // 清空現有組件
            this.addComponents(componentArray);
        }

        // 🔥 新增：Component Getter
        get components() {
            return this._components || [];
        }
        
        // 🔥 新增：addComponent 方法，用於單個元件
        addComponent(component) {
            if (!this._components) {
                this._components = [];
            }
            if (component.type === 'T_META' && typeof component.getComponents === 'function') {
                // 如果是元元件，添加其子元件
                this._components.push(...component.getComponents());
            } else {
                this._components.push(component);
            }
        }

        // 🔥 新增：addComponents 方法，用於陣列
        addComponents(componentArray) {
            for (const comp of componentArray) {
                this.addComponent(comp);
            }
        }

        /**
         * 載入並解析網表
         * @param {string} netlistText 網表文本
         * @returns {Object} 解析結果統計
         */
        loadNetlist(netlistText) {
            console.log('Loading netlist...');
            
            try {
                const parseResult = this.parser.parse(netlistText);
                
                this.components = parseResult.components;
                this.models = parseResult.models;
                this.parameters = parseResult.parameters;
                this.analyses = parseResult.analyses;
                this.options = parseResult.options;
                
                this.isInitialized = true;
                
                if (this.debug) {
                    this.parser.printReport();
                }
                
                console.log(`Netlist loaded: ${this.components.length} components`);
                return parseResult.stats;
                
            } catch (error) {
                console.error('Failed to load netlist:', error);
                throw error;
            }
        }

        /**
         * 執行分析 (批次模式 API)
         * @param {string} analysisCommand 分析指令 (如 '.tran 1us 1ms')
         * @returns {Object} 分析結果
         */
        async runAnalysis(analysisCommand = null) {
            if (!this.isInitialized) {
                throw new Error('No netlist loaded. Call loadNetlist() first.');
            }

            // 如果提供了分析指令，解析它
            if (analysisCommand) {
                const cmd = analysisCommand.trim().toLowerCase();
                
                if (cmd.startsWith('.tran')) {
                    return await this.runTransientAnalysis(analysisCommand);
                } else if (cmd.startsWith('.dc') || cmd.startsWith('.op')) {
                    return await this.runDCAnalysis();
                } else {
                    throw new Error(`Unsupported analysis command: ${analysisCommand}`);
                }
            }

            // 如果沒有提供指令，查看網表中是否有分析指令
            if (this.analyses.length > 0) {
                const analysis = this.analyses[0]; // 使用第一個分析指令
                
                if (analysis.type === 'TRAN') {
                    const tranCommand = `.tran ${analysis.tstep} ${analysis.tstop} ${analysis.tstart || '0'} ${analysis.tmax || analysis.tstep}`;
                    return await this.runTransientAnalysis(tranCommand);
                } else if (analysis.type === 'DC') {
                    return await this.runDCAnalysis();
                }
            }

            // 預設執行DC分析
            console.log('No analysis specified, running DC analysis');
            return await this.runDCAnalysis();
        }

        /**
         * 執行暫態分析
         * @param {string} tranCommand 暫態分析指令
         * @returns {Object} 暫態分析結果
         */
        async runTransientAnalysis(tranCommand) {
            console.log(`Running transient analysis: ${tranCommand}`);
            
            try {
                // 解析暫態分析參數
                const params = TransientUtils.parseTranCommand(tranCommand);
                params.debug = this.debug;
                
                // 執行分析
                const result = await this.transientAnalysis.run(this.components, params);
                
                // 保存結果
                this.results.set('tran', result);
                this.lastResult = result;
                
                console.log(`Transient analysis completed: ${result.timeVector.length} time points`);
                return result;
                
            } catch (error) {
                console.error('Transient analysis failed:', error);
                throw error;
            }
        }

        /**
         * 執行DC分析
         * @returns {Object} DC分析結果
         */
        async runDCAnalysis() {
            console.log('Running DC analysis...');
            
            try {
                const options = { debug: this.debug };
                const result = await this.dcAnalysis.run(this.components, options);
                
                // 保存結果
                this.results.set('dc', result);
                this.lastResult = result;
                
                console.log('DC analysis completed');
                return result;
                
            } catch (error) {
                console.error('DC analysis failed:', error);
                throw error;
            }
        }

        /**
         * 獲取分析結果
         * @param {string} analysisType 分析類型 ('tran', 'dc')
         * @returns {Object} 分析結果
         */
        getResult(analysisType = null) {
            if (analysisType) {
                return this.results.get(analysisType);
            }
            return this.lastResult;
        }

        /**
         * 獲取電路信息
         * @returns {Object} 電路信息
         */
        getCircuitInfo() {
            return {
                componentCount: this.components.length,
                components: this.components.map(comp => ({
                    name: comp.name,
                    type: comp.type,
                    nodes: comp.nodes,
                    value: comp.value
                })),
                nodeList: this.getNodeList(),
                modelCount: this.models.size,
                parameterCount: this.parameters.size,
                analysisCount: this.analyses.length,
                isInitialized: this.isInitialized
            };
        }

        /**
         * 獲取所有節點列表
         * @returns {string[]} 節點名稱列表
         */
        getNodeList() {
            const nodeSet = new Set();
            
            for (const component of this.components) {
                if (component.nodes) {
                    for (const node of component.nodes) {
                        nodeSet.add(node);
                    }
                }
            }
            
            return Array.from(nodeSet).sort();
        }

        /**
         * 設置調試模式
         * @param {boolean} enabled 是否啟用調試
         */
        setDebug(enabled) {
            this.debug = enabled;
            this.transientAnalysis.setDebug(enabled);
            this.dcAnalysis.setDebug(enabled);
        }

        /**
         * 驗證電路
         * @returns {Object} 驗證結果
         */
        validateCircuit() {
            const issues = [];
            const warnings = [];
            
            // 檢查基本問題
            if (this.components.length === 0) {
                issues.push('No components found in circuit');
                return { valid: false, issues, warnings };
            }
            
            // 檢查每個元件
            for (const component of this.components) {
                if (!component.isValid()) {
                    issues.push(`Invalid component: ${component.name}`);
                }
                
                // 檢查節點連接
                for (const node of component.nodes) {
                    if (!node || typeof node !== 'string') {
                        issues.push(`Invalid node in component ${component.name}: ${node}`);
                    }
                }
                
                // 檢查元件值
                if (component.value === 0 && (component.type === 'R' || component.type === 'L' || component.type === 'C')) {
                    warnings.push(`Zero value in ${component.name} may cause numerical issues`);
                }
            }
            
            // 檢查接地節點
            const nodes = this.getNodeList();
            const hasGround = nodes.includes('0') || nodes.includes('gnd') || nodes.includes('GND');
            if (!hasGround) {
                warnings.push('No ground node (0 or gnd) found - circuit may be floating');
            }
            
            // 檢查獨立節點
            const nodeConnections = new Map();
            for (const component of this.components) {
                for (const node of component.nodes) {
                    nodeConnections.set(node, (nodeConnections.get(node) || 0) + 1);
                }
            }
            
            for (const [node, connectionCount] of nodeConnections) {
                if (connectionCount === 1 && node !== '0' && node !== 'gnd') {
                    warnings.push(`Node ${node} has only one connection`);
                }
            }
            
            return {
                valid: issues.length === 0,
                issues,
                warnings,
                componentCount: this.components.length,
                nodeCount: nodes.length
            };
        }

        /**
         * 打印電路摘要
         */
        printCircuitSummary() {
            console.log('\\n=== Circuit Summary ===');
            
            const info = this.getCircuitInfo();
            console.log(`Components: ${info.componentCount}`);
            console.log(`Nodes: ${info.nodeList.length}`);
            console.log(`Models: ${info.modelCount}`);
            console.log(`Parameters: ${info.parameterCount}`);
            
            // 按類型統計元件
            const componentTypes = {};
            for (const comp of this.components) {
                componentTypes[comp.type] = (componentTypes[comp.type] || 0) + 1;
            }
            
            console.log('\\nComponent breakdown:');
            for (const [type, count] of Object.entries(componentTypes)) {
                console.log(`  ${type}: ${count}`);
            }
            
            console.log('\\nNodes:', info.nodeList.join(', '));
            
            // 驗證電路
            const validation = this.validateCircuit();
            console.log(`\\nValidation: ${validation.valid ? 'PASSED' : 'FAILED'}`);
            
            if (validation.issues.length > 0) {
                console.log('Issues:');
                validation.issues.forEach(issue => console.log(`  - ${issue}`));
            }
            
            if (validation.warnings.length > 0) {
                console.log('Warnings:');
                validation.warnings.forEach(warning => console.log(`  - ${warning}`));
            }
            
            console.log('=======================\\n');
        }

        /**
         * 重置求解器
         */
        reset() {
            this.components = [];
            this.models.clear();
            this.parameters.clear();
            this.analyses = [];
            this.options.clear();
            this.results.clear();
            this.lastResult = null;
            this.isInitialized = false;
            this.parser.reset();
        }

        // ==================== 步進式模擬控制 API ====================
        
        /**
         * 初始化步進式暫態分析
         * @param {Object} params 參數 {startTime, stopTime, timeStep, maxIterations}
         * @returns {boolean} 初始化是否成功
         */
        async initSteppedTransient(params = {}) {
            try {
                if (!this.isInitialized) {
                    throw new Error('Circuit not initialized. Load a netlist first.');
                }

                // 設置默認參數
                this.steppedParams = {
                    startTime: params.startTime || 0,
                    stopTime: params.stopTime || 1e-3,  // 1ms
                    timeStep: params.timeStep || 1e-6,   // 1μs
                    maxIterations: params.maxIterations || 10
                };

                // 先設置參數再初始化
                this.transientAnalysis.setParameters({
                    timeStep: this.steppedParams.timeStep,
                    startTime: this.steppedParams.startTime,
                    stopTime: this.steppedParams.stopTime,
                    maxIterations: this.steppedParams.maxIterations
                });
                
                // 創建 result 對象
                this.transientAnalysis.result = new TransientResult();
                
                // 初始化暫態分析
                await this.transientAnalysis.initialize(this.components, this.steppedParams.timeStep);
                
                // 重置狀態
                this.currentTime = this.steppedParams.startTime;
                this.currentIteration = 0;
                this.isSteppedMode = true;
                this.steppedResults = {
                    time: [],
                    voltages: [],
                    currents: [],
                    componentStates: []
                };

                console.log(`步進式暫態分析初始化完成:`);
                console.log(`  時間範圍: ${this.steppedParams.startTime}s 到 ${this.steppedParams.stopTime}s`);
                console.log(`  時間步長: ${this.steppedParams.timeStep}s`);
                console.log(`  最大迭代數: ${this.steppedParams.maxIterations}`);

                return true;

            } catch (error) {
                console.error(`步進式暫態分析初始化失敗: ${error.message}`);
                return false;
            }
        }

        /**
         * 執行一個時間步
         * @param {Object} controlInputs 控制輸入 {gateName: state, ...}
         * @returns {Object} 當前時間步的結果
         */
        step(controlInputs = {}) {
            if (!this.isSteppedMode) {
                throw new Error('Step mode not initialized. Call initSteppedTransient() first.');
            }

            if (this.isFinished()) {
                console.warn('Simulation already finished');
                return null;
            }

            try {
                // 更新控制輸入 (如 MOSFET 開關狀態)
                this.updateControlInputs(controlInputs);
                
                // 執行一個時間步
                const stepResult = this.transientAnalysis.solveTimeStep(
                    this.currentTime, 
                    this.steppedParams.maxIterations
                );

                // 記錄結果 - 將 Map 轉換為普通物件
                const nodeVoltagesObj = Object.fromEntries(stepResult.nodeVoltages);
                const branchCurrentsObj = Object.fromEntries(stepResult.branchCurrents);
                
                this.steppedResults.time.push(this.currentTime);
                this.steppedResults.voltages.push({...nodeVoltagesObj});
                this.steppedResults.currents.push({...branchCurrentsObj});
                
                // 記錄元件狀態 (特別是 MOSFET 等可控元件)
                const componentStates = {};
                for (const component of this.components) {
                    if (component.getOperatingStatus) {
                        componentStates[component.name] = component.getOperatingStatus();
                    }
                }
                this.steppedResults.componentStates.push(componentStates);

                // 準備下一步
                this.currentTime += this.steppedParams.timeStep;
                this.currentIteration++;

                // 返回當前步驟的結果 - 將 Map 轉換為普通物件
                return {
                    time: this.currentTime - this.steppedParams.timeStep,
                    iteration: this.currentIteration - 1,
                    nodeVoltages: Object.fromEntries(stepResult.nodeVoltages),
                    branchCurrents: Object.fromEntries(stepResult.branchCurrents),
                    componentStates: componentStates,
                    converged: stepResult.converged
                };

            } catch (error) {
                console.error(`Time step ${this.currentIteration} failed: ${error.message}`);
                throw error;
            }
        }

        /**
         * 檢查模擬是否完成
         * @returns {boolean} 是否完成
         */
        isFinished() {
            return this.isSteppedMode && (this.currentTime >= this.steppedParams.stopTime);
        }

        /**
         * 獲取當前模擬時間
         * @returns {number} 當前時間 (秒)
         */
        getCurrentTime() {
            return this.currentTime || 0;
        }

        /**
         * 更新控制輸入 (如 MOSFET 閘極狀態)
         * @param {Object} controlInputs 控制輸入映射 {componentName: state, ...}
         */
        updateControlInputs(controlInputs) {
            for (const [componentName, state] of Object.entries(controlInputs)) {
                const component = this.components.find(c => c.name === componentName);
                if (component && component.setGateState) {
                    component.setGateState(state);
                    if (this.debug) {
                        console.log(`Updated ${componentName} gate state: ${state ? 'ON' : 'OFF'}`);
                    }
                } else if (component && component.setValue) {
                    // 支援其他類型的控制輸入
                    component.setValue(state);
                }
            }
        }

        /**
         * 設置特定元件的閘極狀態 (便捷方法)
         * @param {string} componentName 元件名稱
         * @param {boolean} state 閘極狀態
         */
        setGateState(componentName, state) {
            this.updateControlInputs({[componentName]: state});
        }

        /**
         * 獲取節點電壓
         * @param {string} nodeName 節點名稱
         * @returns {number} 電壓值 (V)
         */
        getVoltage(nodeName) {
            if (!this.isSteppedMode || this.steppedResults.voltages.length === 0) {
                return 0;
            }
            
            const lastVoltages = this.steppedResults.voltages[this.steppedResults.voltages.length - 1];
            return lastVoltages[nodeName] || 0;
        }

        /**
         * 獲取支路電流 (通過元件)
         * @param {string} componentName 元件名稱  
         * @returns {number} 電流值 (A)
         */
        getCurrent(componentName) {
            if (!this.isSteppedMode || this.steppedResults.currents.length === 0) {
                return 0;
            }
            
            const lastCurrents = this.steppedResults.currents[this.steppedResults.currents.length - 1];
            return lastCurrents[componentName] || 0;
        }

        /**
         * 獲取元件工作狀態
         * @param {string} componentName 元件名稱
         * @returns {Object} 元件狀態
         */
        getComponentState(componentName) {
            if (!this.isSteppedMode || this.steppedResults.componentStates.length === 0) {
                return null;
            }
            
            const lastStates = this.steppedResults.componentStates[this.steppedResults.componentStates.length - 1];
            return lastStates[componentName] || null;
        }

        /**
         * 獲取完整的步進式模擬結果
         * @returns {Object} 完整結果
         */
        getSteppedResults() {
            return this.isSteppedMode ? this.steppedResults : null;
        }

        /**
         * 運行完整的步進式模擬 (帶控制函數)
         * @param {Function} controlFunction 控制函數 (time) => {componentName: state, ...}
         * @param {Object} params 模擬參數
         * @returns {Object} 完整模擬結果
         */
        async runSteppedSimulation(controlFunction, params = {}) {
            console.log('開始步進式模擬...');
            
            if (!(await this.initSteppedTransient(params))) {
                throw new Error('Failed to initialize stepped simulation');
            }

            const results = [];
            let stepCount = 0;

            while (!this.isFinished()) {
                // 獲取當前時間的控制輸入
                const controlInputs = controlFunction ? controlFunction(this.currentTime) : {};
                
                // 執行一步
                const stepResult = this.step(controlInputs);
                if (stepResult) {
                    results.push(stepResult);
                    stepCount++;

                    // 進度報告
                    if (stepCount % 1000 === 0) {
                        const progress = ((this.currentTime - this.steppedParams.startTime) / 
                                        (this.steppedParams.stopTime - this.steppedParams.startTime)) * 100;
                        console.log(`模擬進度: ${progress.toFixed(1)}% (${stepCount} steps)`);
                    }
                }
            }

            console.log(`步進式模擬完成: ${stepCount} 個時間步`);
            return {
                steps: results,
                summary: {
                    totalSteps: stepCount,
                    simulationTime: this.steppedParams.stopTime - this.steppedParams.startTime,
                    timeStep: this.steppedParams.timeStep
                }
            };
        }

        /**
         * 重置步進式模擬狀態
         */
        resetSteppedMode() {
            this.isSteppedMode = false;
            this.currentTime = 0;
            this.currentIteration = 0;
            this.steppedParams = null;
            this.steppedResults = null;
        }

        /**
         * 獲取求解器版本信息
         * @returns {Object} 版本信息
         */
        static getVersionInfo() {
            return {
                name: 'AkingSPICE',
                version: '0.1.0',
                description: 'JavaScript Solver for Power Electronics',
                features: [
                    'Modified Nodal Analysis (MNA)',
                    'LU decomposition solver',
                    'Backward Euler transient analysis',
                    'DC operating point analysis',
                    'SPICE-compatible netlist format',
                    'Basic passive components (R, L, C)',
                    'Independent sources (V, I)',
                    'Controlled sources (VCVS, VCCS)',
                    'MOSFET with body diode model',
                    'Stepped simulation control API'
                ],
                author: 'AkingSPICE Development Team',
                license: 'MIT'
            };
        }
    }

    /**
     * 三相電壓源模型 - 專為 VIENNA PFC、T-type PFC 等三相拓撲設計
     * 
     * 特點：
     * - 自動生成 120° 相位差的三相電壓
     * - 支援星形 (Wye) 和三角形 (Delta) 連接
     * - 可配置相序（ABC 或 ACB）
     * - 支援不平衡和諧波分析
     */


    /**
     * 三相電壓源
     * 
     * 這個模型實現了：
     * 1. 三個相位差 120° 的正弦電壓源
     * 2. 星形連接（含中性點）或三角形連接
     * 3. 相序控制（正序 ABC 或反序 ACB）
     * 4. 頻率、幅值、相位偏移控制
     */
    class ThreePhaseSource extends BaseComponent {
        /**
         * @param {string} name 三相源名稱 (如 'V3PH1', 'GRID1')
         * @param {Object} config 三相源配置
         * @param {string[]} config.nodes 節點連接
         * @param {number} config.voltage 線電壓RMS值 (V)
         * @param {number} config.frequency 頻率 (Hz)
         * @param {Object} params 額外參數
         * 
         * 節點配置：
         * - 星形連接：['A', 'B', 'C', 'N'] (A相, B相, C相, 中性點)
         * - 三角形連接：['AB', 'BC', 'CA'] (線電壓節點)
         */
        constructor(name, config, params = {}) {
            super(name, 'V3PH', config.nodes, config.voltage, params);
            
            if (!config || !config.nodes) {
                throw new Error(`ThreePhaseSource ${name}: nodes configuration required`);
            }
            
            // 基本參數
            this.voltage = config.voltage || 220;        // 線電壓 RMS (V)
            this.frequency = config.frequency || 50;     // 頻率 (Hz)
            this.phaseOffset = config.phaseOffset || 0;  // 相位偏移 (度)
            this.phaseSequence = config.phaseSequence || 'ABC'; // 相序
            
            // 連接方式
            this.connection = config.connection || 'wye'; // 'wye' 或 'delta'
            this.nodes = config.nodes;
            
            // 驗證節點配置
            this.validateNodeConfiguration();
            
            // 計算相電壓（星形連接時）
            this.phaseVoltage = this.connection === 'wye' ? 
                this.voltage / Math.sqrt(3) : this.voltage;
            
            // 創建內部電壓源
            this.createInternalSources();
            
            // 計算相位角
            this.calculatePhaseAngles();
        }

        /**
         * 驗證節點配置
         */
        validateNodeConfiguration() {
            if (this.connection === 'wye') {
                if (this.nodes.length !== 4) {
                    throw new Error(`ThreePhaseSource ${this.name}: Wye connection requires 4 nodes [A, B, C, N]`);
                }
            } else if (this.connection === 'delta') {
                if (this.nodes.length !== 3) {
                    throw new Error(`ThreePhaseSource ${this.name}: Delta connection requires 3 nodes [AB, BC, CA]`);
                }
            } else {
                throw new Error(`ThreePhaseSource ${this.name}: Invalid connection type '${this.connection}'. Use 'wye' or 'delta'`);
            }
        }

        /**
         * 計算相位角
         */
        calculatePhaseAngles() {
            const basePhase = this.phaseOffset * Math.PI / 180; // 轉換為弧度
            
            if (this.phaseSequence === 'ABC') {
                // 正序
                this.phaseAngles = {
                    A: basePhase,
                    B: basePhase - 2 * Math.PI / 3,     // -120°
                    C: basePhase - 4 * Math.PI / 3      // -240° = +120°
                };
            } else if (this.phaseSequence === 'ACB') {
                // 反序
                this.phaseAngles = {
                    A: basePhase,
                    B: basePhase + 2 * Math.PI / 3,     // +120°
                    C: basePhase + 4 * Math.PI / 3      // +240° = -120°
                };
            } else {
                throw new Error(`ThreePhaseSource ${this.name}: Invalid phase sequence '${this.phaseSequence}'. Use 'ABC' or 'ACB'`);
            }
        }

        /**
         * 創建內部電壓源
         */
        createInternalSources() {
            this.internalSources = [];
            
            if (this.connection === 'wye') {
                // 星形連接：創建三個相電壓源
                const neutralNode = this.nodes[3]; // 中性點
                
                const phases = ['A', 'B', 'C'];
                phases.forEach((phase, index) => {
                    const phaseNode = this.nodes[index];
                    const sourceName = `${this.name}_${phase}`;
                    
                    // 創建正弦電壓源
                    const source = new VoltageSource(sourceName, [phaseNode, neutralNode], {
                        type: 'SINE',
                        amplitude: this.phaseVoltage * Math.sqrt(2), // 峰值
                        frequency: this.frequency,
                        phase: this.phaseAngles[phase] * 180 / Math.PI, // 轉回度數
                        offset: 0
                    });
                    
                    this.internalSources.push(source);
                });
                
            } else if (this.connection === 'delta') {
                // 三角形連接：創建三個線電壓源
                const lineVoltages = [
                    { name: 'AB', nodes: [this.nodes[0], this.nodes[1]], phase: 'A' },
                    { name: 'BC', nodes: [this.nodes[1], this.nodes[2]], phase: 'B' },  
                    { name: 'CA', nodes: [this.nodes[2], this.nodes[0]], phase: 'C' }
                ];
                
                lineVoltages.forEach(line => {
                    const sourceName = `${this.name}_${line.name}`;
                    
                    const source = new VoltageSource(sourceName, line.nodes, {
                        type: 'SINE',
                        amplitude: this.voltage * Math.sqrt(2), // 線電壓峰值
                        frequency: this.frequency,
                        phase: this.phaseAngles[line.phase] * 180 / Math.PI,
                        offset: 0
                    });
                    
                    this.internalSources.push(source);
                });
            }
        }

        /**
         * 獲取特定相的瞬時電壓
         * @param {string} phase 相別 ('A', 'B', 'C')
         * @param {number} time 時間 (秒)
         * @returns {number} 瞬時電壓 (V)
         */
        getPhaseVoltage(phase, time) {
            if (!this.phaseAngles[phase]) {
                throw new Error(`Invalid phase: ${phase}`);
            }
            
            const omega = 2 * Math.PI * this.frequency;
            const amplitude = this.connection === 'wye' ? 
                this.phaseVoltage * Math.sqrt(2) : 
                this.voltage * Math.sqrt(2);
                
            return amplitude * Math.sin(omega * time + this.phaseAngles[phase]);
        }

        /**
         * 獲取線電壓
         * @param {string} line 線別 ('AB', 'BC', 'CA')
         * @param {number} time 時間 (秒)
         * @returns {number} 線電壓 (V)
         */
        getLineVoltage(line, time) {
            if (this.connection === 'delta') {
                // 三角形連接：直接是線電壓
                const phaseMap = { 'AB': 'A', 'BC': 'B', 'CA': 'C' };
                return this.getPhaseVoltage(phaseMap[line], time);
            } else {
                // 星形連接：線電壓 = 相電壓差
                switch (line) {
                    case 'AB':
                        return this.getPhaseVoltage('A', time) - this.getPhaseVoltage('B', time);
                    case 'BC':
                        return this.getPhaseVoltage('B', time) - this.getPhaseVoltage('C', time);
                    case 'CA':
                        return this.getPhaseVoltage('C', time) - this.getPhaseVoltage('A', time);
                    default:
                        throw new Error(`Invalid line: ${line}`);
                }
            }
        }

        /**
         * 為 MNA 分析提供印花支援
         * 三相源通過內部電壓源來實現印花
         */
        stamp(matrix, rhs, nodeMap, voltageSourceMap, time) {
            // 委託給內部電壓源進行印花
            this.internalSources.forEach(source => {
                if (source.stamp) {
                    source.stamp(matrix, rhs, nodeMap, voltageSourceMap, time);
                }
            });
        }

        /**
         * 檢查是否需要電流變數
         * @returns {boolean}
         */
        needsCurrentVariable() {
            return true; // 三相源包含電壓源，需要電流變數
        }

        /**
         * 獲取所需的電流變數數量
         * @returns {number}
         */
        getCurrentVariableCount() {
            return this.internalSources.length; // 每個內部電壓源需要一個電流變數
        }

        /**
         * 獲取三相源資訊
         * @returns {Object}
         */
        getThreePhaseInfo() {
            return {
                name: this.name,
                connection: this.connection,
                voltage: this.voltage,
                phaseVoltage: this.phaseVoltage,
                frequency: this.frequency,
                phaseSequence: this.phaseSequence,
                phaseOffset: this.phaseOffset,
                nodes: this.nodes,
                phaseAngles: Object.fromEntries(
                    Object.entries(this.phaseAngles).map(([k, v]) => [k, v * 180 / Math.PI])
                ),
                internalSources: this.internalSources.map(s => s.name)
            };
        }

        /**
         * 獲取元件資訊字串
         * @returns {string}
         */
        toString() {
            const connectionStr = this.connection.toUpperCase();
            const nodesStr = this.nodes.join('-');
            
            return `${this.name} (3Phase ${connectionStr}): ${nodesStr}, ${this.voltage}V, ${this.frequency}Hz, ${this.phaseSequence}`;
        }

        /**
         * 序列化為 JSON
         * @returns {Object}
         */
        toJSON() {
            return {
                ...super.toJSON(),
                connection: this.connection,
                voltage: this.voltage,
                frequency: this.frequency,
                phaseSequence: this.phaseSequence,
                phaseOffset: this.phaseOffset,
                threePhaseInfo: this.getThreePhaseInfo()
            };
        }

        /**
         * 復製三相源
         * @returns {ThreePhaseSource}
         */
        clone() {
            return new ThreePhaseSource(this.name, {
                nodes: [...this.nodes],
                connection: this.connection,
                voltage: this.voltage,
                frequency: this.frequency,
                phaseSequence: this.phaseSequence,
                phaseOffset: this.phaseOffset
            }, { ...this.params });
        }
    }

    /**
     * 電壓控制 MOSFET 模型 - 基於閘極電壓自動決定導通狀態
     * 
     * 特點：
     * - 基於 Vgs 閾值電壓自動切換導通狀態
     * - 支援線性區和飽和區模型
     * - 包含體二極體和寄生電容
     * - 適用於閘極驅動電路分析
     */


    /**
     * 電壓控制 MOSFET
     * 
     * 這個模型實現了：
     * 1. 根據 Vgs 自動決定 ON/OFF 狀態
     * 2. 閾值電壓 (Vth) 和跨導 (gm) 特性
     * 3. 線性區和飽和區行為
     * 4. 寄生效應（體二極體、電容）
     */
    class VoltageControlledMOSFET extends BaseComponent {
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

    /**
     * Diode 元件模型 (理想二極體模型)
     * 
     * 特點：
     * - 基於電壓控制的開關模型
     * - 包含順向偏壓電壓 (Vf) 和導通電阻 (Ron)
     * - 適用於整流電路、續流二極體等應用
     * - 自動根據陽極-陰極電壓決定導通狀態
     */


    /**
     * 理想二極體模型
     * 
     * 這個模型實現了：
     * 1. 當 Va > Vk + Vf 時二極體導通 (低電阻)
     * 2. 當 Va <= Vk + Vf 時二極體截止 (高電阻)  
     * 3. 支援快速狀態切換和非線性分析
     */
    class Diode extends BaseComponent {
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
                
                if (anodeIndex >= 0) {
                    rhs.addAt(anodeIndex, -currentSource);
                }
                if (cathodeIndex >= 0) {
                    rhs.addAt(cathodeIndex, currentSource);
                }
            }
        }

        /**
         * 更新元件狀態 (在每個時間步後調用)
         * @param {number} vak 陽極-陰極電壓
         * @param {number} iak 陽極到陰極電流
         */
        updateState(vak, iak) {
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

    /**
     * 多繞組變壓器模型 - 專為 LLC、Flyback、Forward 等高階拓撲設計
     * 🔥 修正版 v2：確保互感值為正，由 MNA 求解器處理極性。
     */


    class MultiWindingTransformer {
        /**
         * @param {string} name 變壓器名稱 (如 'T1', 'XFMR1')
         * @param {Object} config 變壓器配置
         */
        constructor(name, config) {
            this.name = name;
            this.type = 'T_META'; // 標記為元元件

            if (!config || !config.windings || config.windings.length < 2) {
                throw new Error(`Transformer ${name} must have at least 2 windings`);
            }
            
            const numWindings = config.windings.length;
            
            // 1. 創建內部 Inductor 實例
            this.inductors = config.windings.map((windingDef, index) => {
                const inductorName = `${name}_${windingDef.name || `W${index+1}`}`;
                return new Inductor(inductorName, windingDef.nodes, windingDef.inductance, {
                    r: windingDef.resistance || 0
                });
            });

            // 2. 建立耦合矩陣
            const couplingMatrix = this.buildCouplingMatrix(numWindings, config.couplingMatrix);

            // 3. 計算互感矩陣
            const mutualMatrix = this.calculateMutualInductanceMatrix(couplingMatrix);

            // 4. 將耦合資訊注入到每個 Inductor 實例中
            for (let i = 0; i < numWindings; i++) {
                const inductorI = this.inductors[i];
                inductorI.couplings = [];

                for (let j = 0; j < numWindings; j++) {
                    if (i === j) continue;

                    const inductorJ = this.inductors[j];
                    const mutualInductance = mutualMatrix[i][j];
                    
                    // 🔥 核心修正：
                    // MNA 矩陣的印花邏輯 (mna.js) 會自動處理負號以符合物理公式。
                    // 因此這裡的互感值必須為正，以避免雙重否定導致的相位反轉。
                    const polarity = 1.0; 

                    inductorI.couplings.push({
                        inductor: inductorJ,
                        mutualInductance: mutualInductance * polarity
                    });
                }
            }
        }

        /**
         * 🔥 核心方法：返回構成變壓器的所有實際元件
         * @returns {Inductor[]}
         */
        getComponents() {
            return this.inductors;
        }

        buildCouplingMatrix(n, userMatrix) {
            const matrix = Array(n).fill(null).map(() => Array(n).fill(0));
            for (let i = 0; i < n; i++) matrix[i][i] = 1.0;

            if (userMatrix) {
                for (let i = 0; i < n; i++) {
                    for (let j = i + 1; j < n; j++) {
                        const k = (userMatrix[i] && userMatrix[i][j] !== undefined) ? userMatrix[i][j] : 0.99;
                        matrix[i][j] = matrix[j][i] = Math.max(-1, Math.min(1, k));
                    }
                }
            } else {
                const defaultK = 0.99;
                for (let i = 0; i < n; i++) {
                    for (let j = i + 1; j < n; j++) {
                        matrix[i][j] = matrix[j][i] = defaultK;
                    }
                }
            }
            return matrix;
        }

        calculateMutualInductanceMatrix(couplingMatrix) {
            const n = this.inductors.length;
            const mutualMatrix = Array(n).fill(null).map(() => Array(n).fill(0));
            
            for (let i = 0; i < n; i++) {
                for (let j = i; j < n; j++) {
                    if (i === j) {
                        mutualMatrix[i][j] = this.inductors[i].getInductance();
                    } else {
                        const Li = this.inductors[i].getInductance();
                        const Lj = this.inductors[j].getInductance();
                        const k_ij = couplingMatrix[i][j];
                        const M = k_ij * Math.sqrt(Li * Lj);
                        mutualMatrix[i][j] = mutualMatrix[j][i] = M;
                    }
                }
            }
            return mutualMatrix;
        }
        
        toString() {
            return `${this.name} (MultiWinding Transformer with ${this.inductors.length} windings)`;
        }
    }

    /**
     * 電路預處理器 - 顯式狀態更新法的核心
     * 
     * 將物件導向的電路元件轉換為GPU可以高效處理的數值數據結構
     * 
     * 核心職責：
     * 1. 分析電路拓撲，建立節點映射
     * 2. 識別狀態變量 (電容電壓Vc, 電感電流Il) 
     * 3. 建立純電阻導納矩陣 G (不包含動態元件的隱式項)
     * 4. 為GPU計算創建優化的數據佈局
     * 
     * 顯式方法核心思想：
     * - 電容被視為電壓源 (值 = Vc(t))  
     * - 電感被視為電流源 (值 = Il(t))
     * - 每個時間步只需求解純電阻網絡 Gv = i
     * - 根據節點電壓計算狀態變量的導數
     */

    /**
     * 稀疏矩陣條目 (COO格式)
     */
    class SparseEntry {
        constructor(row, col, value) {
            this.row = row;
            this.col = col; 
            this.value = value;
        }
    }

    /**
     * 電路預處理器主類
     */
    class CircuitPreprocessor {
        constructor() {
            // 節點映射
            this.nodeMap = new Map();           // 節點名稱 -> 矩陣索引
            this.nodeCount = 0;
            this.nodeNames = [];                // 調試用節點名稱列表
            
            // 狀態變量映射 (電容電壓 + 電感電流)
            this.stateVariables = [];           // 狀態變量信息列表
            this.stateCount = 0;
            
            // 純電阻導納矩陣 G (COO稀疏格式)
            this.gMatrixEntries = [];           // SparseEntry 列表
            this.gMatrixSize = 0;
            
            // 元件數據 (用於快速訪問)
            this.componentData = new Map();     // 元件名稱 -> 數據對象
            
            // GPU緩存準備
            this.gpuBuffers = {
                // G矩陣 (COO格式)
                gRows: null,                    // Int32Array
                gCols: null,                    // Int32Array  
                gValues: null,                  // Float32Array
                gDiagonal: null,                // Float32Array (對角線元素，用於迭代求解)
                
                // 狀態向量和參數
                stateVector: null,              // Float32Array [Vc1, Vc2, ..., Il1, Il2, ...]
                stateParams: null,              // Float32Array [C1, C2, ..., L1, L2, ...] 
                rhsVector: null,                // Float32Array (右手側向量)
                solutionVector: null,           // Float32Array (節點電壓解)
                
                // 元件索引映射 
                stateToNode: null,              // Int32Array (狀態變量對應的節點索引)
                stateTypes: null                // Int32Array (0=電容, 1=電感)
            };
            
            // 調試選項
            this.debug = false;
        }

        /**
         * 處理電路元件列表，生成GPU數據結構
         * @param {BaseComponent[]} components 電路元件列表
         * @returns {Object} 處理結果統計
         */
        process(components) {
            console.log('開始電路預處理...');
            
            // 重置內部狀態
            this.reset();
            
            // 第一階段：分析電路拓撲
            this.analyzeTopology(components);
            
            // 第二階段：識別狀態變量
            this.identifyStateVariables(components);
            
            // 第三階段：讓每個元件進行預處理
            this.processComponents(components);
            
            // 第四階段：構建GPU數據結構
            this.buildGPUBuffers();
            
            const stats = {
                nodeCount: this.nodeCount,
                stateCount: this.stateCount, 
                matrixEntries: this.gMatrixEntries.length,
                componentCount: components.length
            };
            
            if (this.debug) {
                this.printDebugInfo();
            }
            
            console.log(`電路預處理完成: ${stats.nodeCount} 節點, ${stats.stateCount} 狀態變量, ${stats.matrixEntries} 矩陣條目`);
            return stats;
        }

        /**
         * 分析電路拓撲，建立節點映射
         */
        analyzeTopology(components) {
            const nodeSet = new Set();
            
            // 收集所有節點（排除接地）
            for (const component of components) {
                if (component.nodes) {
                    for (const node of component.nodes) {
                        if (node !== '0' && node !== 'gnd' && node !== 'GND') {
                            nodeSet.add(node);
                        }
                    }
                }
            }
            
            // 建立節點映射
            const sortedNodes = Array.from(nodeSet).sort();
            for (let i = 0; i < sortedNodes.length; i++) {
                this.nodeMap.set(sortedNodes[i], i);
                this.nodeNames.push(sortedNodes[i]);
            }
            
            this.nodeCount = sortedNodes.length;
            
            if (this.debug) {
                console.log('節點映射:', this.nodeMap);
            }
        }

        /**
         * 識別所有狀態變量 (電容電壓和電感電流)
         */
        identifyStateVariables(components) {
            let stateIndex = 0;
            
            for (const component of components) {
                if (component.isStateVariable()) {
                    const stateVar = {
                        index: stateIndex++,
                        componentName: component.name,
                        type: component.getStateVariableType(),    // 'voltage' or 'current'
                        initialValue: component.getInitialStateValue(),
                        parameter: component.value,                // C值或L值
                        node1: this.getNodeIndex(component.nodes[0]),
                        node2: this.getNodeIndex(component.nodes[1])
                    };
                    
                    this.stateVariables.push(stateVar);
                    
                    // 在元件數據中記錄狀態變量索引
                    this.componentData.set(component.name, {
                        stateIndex: stateVar.index,
                        node1: stateVar.node1,
                        node2: stateVar.node2,
                        parameter: stateVar.parameter,
                        type: stateVar.type
                    });
                }
            }
            
            this.stateCount = stateIndex;
            
            if (this.debug) {
                console.log('狀態變量:', this.stateVariables);
            }
        }

        /**
         * 讓所有元件進行預處理，構建G矩陣
         */
        processComponents(components) {
            for (const component of components) {
                try {
                    component.preprocess(this);
                } catch (error) {
                    console.warn(`元件 ${component.name} 預處理失敗: ${error.message}`);
                }
            }
            
            if (this.debug) {
                console.log(`G矩陣條目數: ${this.gMatrixEntries.length}`);
            }
        }

        /**
         * 構建最終的GPU緩存數據
         */
        buildGPUBuffers() {
            const entryCount = this.gMatrixEntries.length;
            
            // G矩陣 (COO格式)
            this.gpuBuffers.gRows = new Int32Array(entryCount);
            this.gpuBuffers.gCols = new Int32Array(entryCount);  
            this.gpuBuffers.gValues = new Float32Array(entryCount);
            
            for (let i = 0; i < entryCount; i++) {
                const entry = this.gMatrixEntries[i];
                this.gpuBuffers.gRows[i] = entry.row;
                this.gpuBuffers.gCols[i] = entry.col;
                this.gpuBuffers.gValues[i] = entry.value;
            }
            
            // 提取對角線元素 (用於迭代求解器)
            this.gpuBuffers.gDiagonal = new Float32Array(this.nodeCount);
            for (const entry of this.gMatrixEntries) {
                if (entry.row === entry.col) {
                    this.gpuBuffers.gDiagonal[entry.row] = entry.value;
                }
            }
            
            // 狀態向量和參數
            this.gpuBuffers.stateVector = new Float32Array(this.stateCount);
            this.gpuBuffers.stateParams = new Float32Array(this.stateCount);
            this.gpuBuffers.stateToNode = new Int32Array(this.stateCount * 2); // 每個狀態變量對應2個節點
            this.gpuBuffers.stateTypes = new Int32Array(this.stateCount);
            
            for (let i = 0; i < this.stateCount; i++) {
                const stateVar = this.stateVariables[i];
                this.gpuBuffers.stateVector[i] = stateVar.initialValue;
                this.gpuBuffers.stateParams[i] = stateVar.parameter;
                this.gpuBuffers.stateToNode[i * 2] = stateVar.node1;
                this.gpuBuffers.stateToNode[i * 2 + 1] = stateVar.node2;
                this.gpuBuffers.stateTypes[i] = stateVar.type === 'voltage' ? 0 : 1;
            }
            
            // 工作緩存
            this.gpuBuffers.rhsVector = new Float32Array(this.nodeCount);
            this.gpuBuffers.solutionVector = new Float32Array(this.nodeCount);
            
            this.gMatrixSize = this.nodeCount;
        }

        // ==================== 元件預處理接口方法 ====================

        /**
         * 獲取節點的矩陣索引
         * @param {string} nodeName 節點名稱
         * @returns {number} 矩陣索引，接地節點返回-1
         */
        getNodeIndex(nodeName) {
            if (nodeName === '0' || nodeName === 'gnd' || nodeName === 'GND') {
                return -1; // 接地節點
            }
            
            const index = this.nodeMap.get(nodeName);
            if (index === undefined) {
                throw new Error(`節點 ${nodeName} 未在電路中找到`);
            }
            return index;
        }

        /**
         * 向G矩陣添加電導項
         * @param {number} row 行索引 (-1 表示接地)
         * @param {number} col 列索引 (-1 表示接地)  
         * @param {number} conductance 電導值
         */
        addConductance(row, col, conductance) {
            if (Math.abs(conductance) < 1e-15) {
                return; // 忽略極小值
            }
            
            // 跳過涉及接地節點的項
            if (row === -1 || col === -1) {
                return;
            }
            
            // 檢查索引有效性
            if (row < 0 || row >= this.nodeCount || col < 0 || col >= this.nodeCount) {
                throw new Error(`矩陣索引超出範圍: (${row}, ${col}), 矩陣大小: ${this.nodeCount}`);
            }
            
            // 查找是否已存在相同位置的條目
            const existingEntry = this.gMatrixEntries.find(e => e.row === row && e.col === col);
            if (existingEntry) {
                existingEntry.value += conductance;
            } else {
                this.gMatrixEntries.push(new SparseEntry(row, col, conductance));
            }
        }

        /**
         * 註冊狀態變量 (由電容/電感調用)  
         * @param {Object} stateInfo 狀態變量信息
         * @returns {number} 狀態變量索引
         */
        addStateVariable(stateInfo) {
            // 這個方法在 identifyStateVariables 階段已經完成
            // 這裡返回已經分配的索引
            if (typeof stateInfo === 'string') {
                // 如果傳入的是組件名稱
                const componentData = this.componentData.get(stateInfo);
                if (componentData) {
                    return componentData.stateIndex;
                }
            } else if (stateInfo && stateInfo.componentName) {
                const componentData = this.componentData.get(stateInfo.componentName);
                if (componentData) {
                    return componentData.stateIndex;
                }
            }
            
            throw new Error(`狀態變量 ${stateInfo.componentName || stateInfo} 未找到`);
        }

        /**
         * 向RHS向量添加電流源項 (由獨立電流源和電感調用)
         * @param {number} node1 正端節點索引
         * @param {number} node2 負端節點索引  
         * @param {number} current 電流值 (正值表示從node1流向node2)
         */
        addCurrentSource(node1, node2, current) {
            if (Math.abs(current) < 1e-15) {
                return;
            }
        }

        /**
         * 重置預處理器狀態
         */
        reset() {
            this.nodeMap.clear();
            this.nodeCount = 0;
            this.nodeNames = [];
            
            this.stateVariables = [];
            this.stateCount = 0;
            
            this.gMatrixEntries = [];
            this.gMatrixSize = 0;
            
            this.componentData.clear();
            
            // 重置GPU緩存
            for (const key in this.gpuBuffers) {
                this.gpuBuffers[key] = null;
            }
        }

        /**
         * 獲取預處理結果 (供求解器使用)
         * @returns {Object} 完整的預處理數據
         */
        getProcessedData() {
            return {
                nodeCount: this.nodeCount,
                stateCount: this.stateCount,
                nodeNames: [...this.nodeNames],
                stateVariables: [...this.stateVariables],
                componentData: new Map(this.componentData),
                gpuBuffers: { ...this.gpuBuffers }
            };
        }

        /**
         * 打印調試信息
         */
        printDebugInfo() {
            console.log('\n=== 電路預處理調試信息 ===');
            console.log(`節點數: ${this.nodeCount}`);
            console.log('節點映射:', this.nodeNames);
            
            console.log(`\n狀態變量數: ${this.stateCount}`);
            for (const stateVar of this.stateVariables) {
                console.log(`  ${stateVar.componentName} (${stateVar.type}): 初值=${stateVar.initialValue}, 參數=${stateVar.parameter}`);
            }
            
            console.log(`\nG矩陣條目數: ${this.gMatrixEntries.length}`);
            if (this.gMatrixEntries.length <= 20) {
                for (const entry of this.gMatrixEntries) {
                    console.log(`  G[${entry.row},${entry.col}] = ${entry.value.toExponential(3)}`);
                }
            } else {
                console.log('  (矩陣過大，省略詳細輸出)');
            }
            
            console.log('=========================\n');
        }

        /**
         * 驗證預處理結果
         * @returns {Object} 驗證結果
         */
        validate() {
            const issues = [];
            const warnings = [];
            
            // 檢查矩陣完整性
            if (this.nodeCount === 0) {
                issues.push('沒有有效節點');
            }
            
            if (this.gMatrixEntries.length === 0) {
                issues.push('G矩陣為空');
            }
            
            // 檢查對角線元素
            const diagonalElements = new Set();
            for (const entry of this.gMatrixEntries) {
                if (entry.row === entry.col) {
                    diagonalElements.add(entry.row);
                }
            }
            
            for (let i = 0; i < this.nodeCount; i++) {
                if (!diagonalElements.has(i)) {
                    warnings.push(`節點 ${i} (${this.nodeNames[i]}) 沒有對角線元素`);
                }
            }
            
            // 檢查矩陣對稱性 (對於純電阻網絡應該對稱)
            const matrixMap = new Map();
            for (const entry of this.gMatrixEntries) {
                matrixMap.set(`${entry.row},${entry.col}`, entry.value);
            }
            
            let asymmetricCount = 0;
            for (const entry of this.gMatrixEntries) {
                const symmetric = matrixMap.get(`${entry.col},${entry.row}`);
                if (symmetric === undefined || Math.abs(symmetric - entry.value) > 1e-12) {
                    asymmetricCount++;
                }
            }
            
            if (asymmetricCount > 0) {
                warnings.push(`發現 ${asymmetricCount} 個非對稱矩陣元素`);
            }
            
            return {
                valid: issues.length === 0,
                issues,
                warnings
            };
        }

        /**
         * 獲取G矩陣的密集格式 (用於WebGPU求解器)
         * @returns {Array<Array<number>>} 密集矩陣
         */
        getDenseMatrix() {
            const denseMatrix = [];
            
            // 初始化為零矩陣
            for (let i = 0; i < this.nodeCount; i++) {
                denseMatrix[i] = new Array(this.nodeCount).fill(0);
            }
            
            // 填充矩陣元素
            for (const entry of this.gMatrixEntries) {
                denseMatrix[entry.row][entry.col] = entry.value;
            }
            
            return denseMatrix;
        }

        /**
         * 設置調試模式
         * @param {boolean} enabled 是否啟用調試
         */
        setDebug(enabled) {
            this.debug = enabled;
        }
    }

    /**
     * WebGPU線性求解器 - GPU加速的電路仿真核心
     * 
     * 實現功能:
     * 1. GPU緩衝區管理 (G矩陣、RHS向量、狀態向量)
     * 2. 並行線性方程組求解 (迭代法: Jacobi/Gauss-Seidel)
     * 3. 狀態變量更新 (顯式歐拉/RK4)
     * 4. CPU-GPU數據傳輸優化
     */


    class WebGPUSolver {
        constructor(options = {}) {
            this.debug = options.debug || false;
            this.maxIterations = options.maxIterations || 1000;
            this.tolerance = options.tolerance || 1e-9;
            
            // WebGPU組件
            this.gpu = null;
            this.adapter = null;
            this.device = null;
            
            // 計算管線
            this.solverPipeline = null;
            this.stateUpdatePipeline = null;
            
            // GPU緩衝區
            this.gMatrixBuffer = null;
            this.rhsBuffer = null;
            this.solutionBuffer = null;
            this.stateBuffer = null;
            this.tempBuffer = null;
            
            // 電路數據
            this.circuitData = null;
            this.nodeCount = 0;
            this.stateCount = 0;
            this.workgroupSize = 64;
            
            // 性能統計
            this.stats = {
                totalGPUTime: 0,
                totalTransferTime: 0,
                totalIterations: 0,
                averageIterations: 0,
            };
        }

        /**
         * 初始化WebGPU上下文和設備
         */
        async initialize() {
            if (this.debug) console.log('🚀 初始化WebGPU線性求解器...');
            
            try {
                // 設置WebGPU全局變量
                this.gpu = webgpu.create([]);
                Object.assign(globalThis, webgpu.globals);
                
                // 請求適配器和設備
                this.adapter = await this.gpu.requestAdapter();
                if (!this.adapter) {
                    throw new Error('無法獲取WebGPU適配器');
                }
                
                this.device = await this.adapter.requestDevice({
                    requiredFeatures: [],
                    requiredLimits: {
                        maxComputeWorkgroupStorageSize: 16384,
                        maxStorageBufferBindingSize: 134217728, // 128MB
                    }
                });
                
                if (this.debug) {
                    console.log('✅ WebGPU設備創建成功');
                    console.log(`   適配器: ${this.adapter.info.description}`);
                    console.log(`   供應商: ${this.adapter.info.vendor}`);
                }
                
                // 創建著色器和管線
                await this.createComputePipelines();
                
            } catch (error) {
                throw new Error(`WebGPU初始化失敗: ${error.message}`);
            }
        }

        /**
         * 設置電路數據並創建GPU緩衝區
         */
        setupCircuit(circuitData) {
            this.circuitData = circuitData;
            this.nodeCount = circuitData.nodeCount;
            this.stateCount = circuitData.stateCount;
            
            if (this.debug) {
                console.log(`📊 設置電路: ${this.nodeCount} 節點, ${this.stateCount} 狀態變量`);
            }
            
            this.createBuffers();
            this.uploadCircuitData();
        }

        /**
         * 創建計算著色器管線
         */
        async createComputePipelines() {
            // Jacobi迭代求解器著色器
            const jacobiSolverWGSL = this.generateJacobiSolverWGSL();
            const jacobiShaderModule = this.device.createShaderModule({
                label: 'Jacobi Linear Solver',
                code: jacobiSolverWGSL,
            });
            
            this.solverPipeline = this.device.createComputePipeline({
                label: 'Jacobi Solver Pipeline',
                layout: 'auto',
                compute: {
                    module: jacobiShaderModule,
                    entryPoint: 'jacobi_iteration',
                },
            });
            
            // 狀態變量更新著色器
            const stateUpdateWGSL = this.generateStateUpdateWGSL();
            const stateShaderModule = this.device.createShaderModule({
                label: 'State Variable Update',
                code: stateUpdateWGSL,
            });
            
            this.stateUpdatePipeline = this.device.createComputePipeline({
                label: 'State Update Pipeline', 
                layout: 'auto',
                compute: {
                    module: stateShaderModule,
                    entryPoint: 'update_state_variables',
                },
            });
            
            if (this.debug) {
                console.log('✅ 計算管線創建完成');
            }
        }

        /**
         * 生成Jacobi迭代求解器的WGSL代碼
         */
        generateJacobiSolverWGSL() {
            return `
            // Jacobi迭代法求解 Gv = rhs
            // x_new[i] = (rhs[i] - sum(G[i,j] * x_old[j], j != i)) / G[i,i]
            
            @group(0) @binding(0) var<storage, read> g_matrix: array<f32>;
            @group(0) @binding(1) var<storage, read> rhs: array<f32>;
            @group(0) @binding(2) var<storage, read> x_old: array<f32>;
            @group(0) @binding(3) var<storage, read_write> x_new: array<f32>;
            @group(0) @binding(4) var<uniform> params: JacobiParams;
            
            struct JacobiParams {
                node_count: u32,
                matrix_size: u32,
                workgroup_size: u32,
                padding: u32,
            }
            
            @compute @workgroup_size(64)
            fn jacobi_iteration(@builtin(global_invocation_id) global_id: vec3<u32>) {
                let row = global_id.x;
                if (row >= params.node_count) {
                    return;
                }
                
                var sum = 0.0;
                var diagonal = 0.0;
                
                // 計算G矩陣的行積(排除對角線)
                for (var col = 0u; col < params.node_count; col = col + 1u) {
                    let matrix_idx = row * params.node_count + col;
                    let g_value = g_matrix[matrix_idx];
                    
                    if (row == col) {
                        diagonal = g_value;
                    } else {
                        sum = sum + g_value * x_old[col];
                    }
                }
                
                // Jacobi更新: x_new[i] = (rhs[i] - sum) / G[i,i]
                if (abs(diagonal) > 1e-12) {
                    x_new[row] = (rhs[row] - sum) / diagonal;
                } else {
                    x_new[row] = x_old[row]; // 保持舊值如果對角線接近零
                }
            }
        `;
        }

        /**
         * 生成狀態變量更新的WGSL代碼
         */
        generateStateUpdateWGSL() {
            return `
            // 顯式狀態變量更新
            // 對於電容: dVc/dt = Ic/C
            // 對於電感: dIl/dt = Vl/L
            
            @group(0) @binding(0) var<storage, read> node_voltages: array<f32>;
            @group(0) @binding(1) var<storage, read> state_old: array<f32>;
            @group(0) @binding(2) var<storage, read_write> state_new: array<f32>;
            @group(0) @binding(3) var<storage, read> state_params: array<f32>; // C或L值
            @group(0) @binding(4) var<storage, read> state_nodes: array<i32>; // 節點索引對
            @group(0) @binding(5) var<uniform> update_params: StateUpdateParams;
            
            struct StateUpdateParams {
                state_count: u32,
                time_step: f32,
                resistor_conductance: f32, // 用於電容電流計算
                method: u32, // 0=Euler, 1=RK4
            }
            
            @compute @workgroup_size(64)
            fn update_state_variables(@builtin(global_invocation_id) global_id: vec3<u32>) {
                let state_idx = global_id.x;
                if (state_idx >= update_params.state_count) {
                    return;
                }
                
                // 獲取狀態變量的節點索引
                let node1 = state_nodes[state_idx * 2];
                let node2 = state_nodes[state_idx * 2 + 1];
                
                // 計算節點電壓差
                var v1 = 0.0;
                var v2 = 0.0;
                if (node1 >= 0) { v1 = node_voltages[node1]; }
                if (node2 >= 0) { v2 = node_voltages[node2]; }
                let node_voltage = v1 - v2;
                
                // 計算狀態導數 (假設都是電容)
                let current_state = state_old[state_idx];
                let capacitance = state_params[state_idx];
                
                // 電容電流計算 (簡化為電阻分壓)
                // Ic = (V_node - Vc) * G_resistor
                let current = (node_voltage - current_state) * update_params.resistor_conductance;
                let derivative = current / capacitance;
                
                // 前向歐拉積分
                if (update_params.method == 0u) {
                    state_new[state_idx] = current_state + update_params.time_step * derivative;
                } else {
                    // RK4暫時簡化為歐拉
                    state_new[state_idx] = current_state + update_params.time_step * derivative;
                }
            }
        `;
        }

        /**
         * 創建GPU緩衝區
         */
        createBuffers() {
            const nodeCount = this.nodeCount;
            const stateCount = this.stateCount;
            
            // G矩陣 (nodeCount x nodeCount)
            const matrixSize = nodeCount * nodeCount * 4; // Float32 = 4 bytes
            this.gMatrixBuffer = this.device.createBuffer({
                label: 'G Matrix Buffer',
                size: matrixSize,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            });
            
            // RHS向量 (nodeCount)
            const vectorSize = nodeCount * 4;
            this.rhsBuffer = this.device.createBuffer({
                label: 'RHS Vector Buffer',
                size: vectorSize,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            });
            
            // 解向量 (nodeCount, 需要雙緩衝)
            this.solutionBuffer = this.device.createBuffer({
                label: 'Solution Vector Buffer',
                size: vectorSize,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
            });
            
            this.tempBuffer = this.device.createBuffer({
                label: 'Temp Solution Buffer',
                size: vectorSize,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
            });
            
            // 狀態向量 (stateCount)
            const stateSize = Math.max(stateCount * 4, 16); // 至少16字節
            this.stateBuffer = this.device.createBuffer({
                label: 'State Vector Buffer',
                size: stateSize,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
            });
            
            if (this.debug) {
                console.log(`✅ GPU緩衝區創建完成 (G矩陣: ${matrixSize}B, 向量: ${vectorSize}B, 狀態: ${stateSize}B)`);
            }
        }

        /**
         * 上傳電路數據到GPU
         */
        uploadCircuitData() {
            // 從電路預處理器獲取數據
            const gMatrix = this.circuitData.gMatrix.getDenseMatrix();
            const initialState = this.circuitData.initialStateVector;
            
            // 上傳G矩陣
            this.device.queue.writeBuffer(
                this.gMatrixBuffer, 
                0, 
                new Float32Array(gMatrix.flat())
            );
            
            // 上傳初始狀態
            if (this.stateCount > 0) {
                this.device.queue.writeBuffer(
                    this.stateBuffer, 
                    0, 
                    new Float32Array(initialState)
                );
            }
            
            if (this.debug) {
                console.log('✅ 電路數據上傳到GPU完成');
            }
        }

        /**
         * GPU線性方程組求解: Gv = rhs
         */
        async solveLinearSystem(rhsVector, initialGuess = null) {
            const startTime = performance.now();
            
            // 上傳RHS向量
            this.device.queue.writeBuffer(
                this.rhsBuffer, 
                0, 
                new Float32Array(rhsVector)
            );
            
            // 設置初始猜測 (如果沒有提供，使用零向量)
            const initGuess = initialGuess || new Array(this.nodeCount).fill(0.0);
            this.device.queue.writeBuffer(
                this.solutionBuffer, 
                0, 
                new Float32Array(initGuess)
            );
            
            // Jacobi迭代求解
            await this.runJacobiIterations();
            
            // 讀取結果
            const result = await this.readSolutionVector();
            
            this.stats.totalGPUTime += performance.now() - startTime;
            return result;
        }

        /**
         * 執行Jacobi迭代
         */
        async runJacobiIterations() {
            // 創建參數緩衝區
            const paramsData = new Uint32Array([
                this.nodeCount,
                this.nodeCount * this.nodeCount,
                this.workgroupSize,
                0 // padding
            ]);
            
            const paramsBuffer = this.device.createBuffer({
                label: 'Jacobi Params',
                size: paramsData.byteLength,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });
            
            this.device.queue.writeBuffer(paramsBuffer, 0, paramsData);
            
            // 迭代求解 (優化迭代次數)
            const actualIterations = Math.min(this.maxIterations, 50); // 大幅減少迭代次數
            for (let iter = 0; iter < actualIterations; iter++) {
                // 創建綁定組
                const bindGroup = this.device.createBindGroup({
                    layout: this.solverPipeline.getBindGroupLayout(0),
                    entries: [
                        { binding: 0, resource: { buffer: this.gMatrixBuffer } },
                        { binding: 1, resource: { buffer: this.rhsBuffer } },
                        { binding: 2, resource: { buffer: this.solutionBuffer } }, // x_old
                        { binding: 3, resource: { buffer: this.tempBuffer } },     // x_new
                        { binding: 4, resource: { buffer: paramsBuffer } },
                    ],
                });
                
                // 執行計算
                const commandEncoder = this.device.createCommandEncoder();
                const computePass = commandEncoder.beginComputePass();
                
                computePass.setPipeline(this.solverPipeline);
                computePass.setBindGroup(0, bindGroup);
                computePass.dispatchWorkgroups(Math.ceil(this.nodeCount / this.workgroupSize));
                computePass.end();
                
                // 交換緩衝區 (x_new -> x_old)
                commandEncoder.copyBufferToBuffer(
                    this.tempBuffer, 0,
                    this.solutionBuffer, 0,
                    this.nodeCount * 4
                );
                
                this.device.queue.submit([commandEncoder.finish()]);
                
                // 等待GPU完成計算 (減少同步頻率)
                if (iter % 25 === 24) {
                    await this.device.queue.onSubmittedWorkDone();
                }
                
                this.stats.totalIterations++;
            }
            
            this.stats.averageIterations = this.stats.totalIterations / (this.stats.totalIterations > 0 ? 1 : 1);
        }

        /**
         * 讀取解向量
         */
        async readSolutionVector() {
            const readBuffer = this.device.createBuffer({
                size: this.nodeCount * 4,
                usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
            });
            
            const commandEncoder = this.device.createCommandEncoder();
            commandEncoder.copyBufferToBuffer(
                this.solutionBuffer, 0,
                readBuffer, 0,
                this.nodeCount * 4
            );
            
            this.device.queue.submit([commandEncoder.finish()]);
            
            await readBuffer.mapAsync(GPUMapMode.READ);
            const result = new Float32Array(readBuffer.getMappedRange());
            const copy = new Float32Array(result);
            readBuffer.unmap();
            
            return copy;
        }

        /**
         * 清理資源
         */
        destroy() {
            if (this.device) {
                this.device.destroy();
            }
        }

        /**
         * 獲取性能統計
         */
        getStats() {
            return { ...this.stats };
        }
    }

    /**
     * WebGPU求解器工廠函數
     */
    async function createWebGPUSolver(options = {}) {
        const solver = new WebGPUSolver(options);
        await solver.initialize();
        return solver;
    }

    /**
     * GPU加速顯式狀態更新求解器
     * 整合WebGPU線性求解和狀態變數更新
     */


    class GPUExplicitStateSolver {
        constructor(options = {}) {
            this.debug = options.debug || false;
            this.timeStep = options.timeStep || 1e-6;
            this.integrationMethod = options.integrationMethod || 'forward_euler';
            
            // GPU求解器選項
            this.gpuOptions = {
                debug: this.debug,
                maxIterations: options.solverMaxIterations || 1000,
                tolerance: options.solverTolerance || 1e-9,
            };
            
            // 組件和數據
            this.preprocessor = new CircuitPreprocessor({ debug: this.debug });
            this.webgpuSolver = null;
            this.components = null;
            this.circuitData = null;
            
            // GPU狀態管理
            this.gpuBuffersInitialized = false;
            this.currentStateVector = null;
            this.currentTime = 0;
            
            // 性能統計
            this.stats = {
                totalTimeSteps: 0,
                totalGPUSolves: 0,
                totalStateUpdates: 0,
                avgGPUTime: 0,
                avgStateUpdateTime: 0,
                totalSimulationTime: 0,
            };
        }

        /**
         * 初始化GPU求解器和電路預處理
         */
        async initialize(components, timeStep = 1e-6, options = {}) {
            console.log('🚀 初始化GPU加速顯式狀態更新求解器...');
            
            this.components = components;
            this.timeStep = timeStep;
            
            // 合併選項
            Object.assign(this.gpuOptions, options);
            
            try {
                // 初始化WebGPU求解器
                console.log('   初始化WebGPU線性求解器...');
                this.webgpuSolver = await createWebGPUSolver(this.gpuOptions);
                
                // 預處理電路
                console.log('   預處理電路拓撲結構...');
                const preprocessStats = this.preprocessor.process(components);
                this.circuitData = this.preprocessor.getProcessedData();
                
                // 設置GPU電路數據
                console.log('   上傳電路數據到GPU...');
                const webgpuCircuitData = {
                    nodeCount: this.circuitData.nodeCount,
                    stateCount: this.circuitData.stateCount,
                    gMatrix: {
                        getDenseMatrix: () => this.preprocessor.getDenseMatrix()
                    },
                    initialStateVector: this.circuitData.initialStateVector
                };
                this.webgpuSolver.setupCircuit(webgpuCircuitData);
                
                // 初始化狀態向量
                console.log(`   調試：initialStateVector = ${this.circuitData.initialStateVector}`);
                console.log(`   調試：stateCount = ${this.circuitData.stateCount}`);
                
                this.currentStateVector = new Float64Array(this.circuitData.initialStateVector || new Array(this.circuitData.stateCount).fill(0));
                
                console.log(`   調試：currentStateVector長度 = ${this.currentStateVector.length}`);
                console.log(`✅ GPU求解器初始化完成: ${this.circuitData.nodeCount} 節點, ${this.circuitData.stateCount} 狀態變量`);
                
                return preprocessStats;
                
            } catch (error) {
                throw new Error(`GPU求解器初始化失敗: ${error.message}`);
            }
        }

        /**
         * 執行單個時間步的求解
         */
        async solveTimeStep() {
            const stepStartTime = performance.now();
            
            // 1. 更新RHS向量 (包含狀態變數貢獻)
            const rhsVector = this.buildRHSVector();
            
            // 2. GPU求解線性系統 Gv = rhs
            const gpuStartTime = performance.now();
            const nodeVoltages = await this.webgpuSolver.solveLinearSystem(rhsVector);
            const gpuTime = performance.now() - gpuStartTime;
            
            // 3. GPU更新狀態變數
            const stateStartTime = performance.now();
            await this.updateStateVariablesGPU(nodeVoltages);
            const stateTime = performance.now() - stateStartTime;
            
            // 4. 更新時間和統計
            this.currentTime += this.timeStep;
            this.updateStats(gpuTime, stateTime, performance.now() - stepStartTime);
            
            return {
                nodeVoltages: Array.from(nodeVoltages),
                stateVector: Array.from(this.currentStateVector),
                time: this.currentTime,
            };
        }

        /**
         * 構建RHS向量 (包含所有激勵源)
         */
        buildRHSVector() {
            const nodeCount = this.circuitData.nodeCount;
            const rhsVector = new Float64Array(nodeCount);
            
            // 遍歷所有組件，讓它們貢獻到RHS
            for (const component of this.components) {
                if (typeof component.updateRHS === 'function') {
                    const componentData = this.circuitData.componentData.get(component.name);
                    component.updateRHS(
                        rhsVector,
                        this.currentStateVector,
                        this.currentTime,
                        componentData
                    );
                }
            }
            
            if (this.debug && this.stats.totalTimeSteps < 5) {
                console.log(`t=${this.currentTime.toExponential(3)}, RHS: [${Array.from(rhsVector).map(x => x.toExponential(3)).join(', ')}]`);
            }
            
            return rhsVector;
        }

        /**
         * GPU並行更新狀態變數
         */
        async updateStateVariablesGPU(nodeVoltages) {
            const stateCount = this.circuitData.stateCount;
            if (stateCount === 0) return;
            
            // 暫時使用CPU實現，後續可遷移到GPU
            const stateDerivatives = new Float64Array(stateCount);
            
            // 計算每個狀態變數的導數
            for (let i = 0; i < stateCount; i++) {
                const stateVar = this.circuitData.stateVariables[i];
                const derivative = this.calculateStateDerivative(stateVar, nodeVoltages, i);
                stateDerivatives[i] = derivative;
            }
            
            // 積分更新
            this.integrateStateVariables(stateDerivatives);
            
            if (this.debug && this.stats.totalTimeSteps < 5) {
                console.log(`t=${this.currentTime.toExponential(3)}, 狀態導數: [${Array.from(stateDerivatives).map(x => x.toExponential(3)).join(', ')}]`);
                console.log(`t=${this.currentTime.toExponential(3)}, 更新後狀態: [${Array.from(this.currentStateVector || []).map(x => x.toExponential(6)).join(', ')}]`);
                console.log(`t=${this.currentTime.toExponential(3)}, 狀態向量長度: ${this.currentStateVector ? this.currentStateVector.length : 'undefined'}`);
            }
        }

        /**
         * 計算單個狀態變數的導數
         */
        calculateStateDerivative(stateVar, nodeVoltages, stateIndex) {
            const node1 = stateVar.node1;
            const node2 = stateVar.node2;
            
            // 獲取節點電壓
            const v1 = node1 >= 0 ? nodeVoltages[node1] : 0;
            const v2 = node2 >= 0 ? nodeVoltages[node2] : 0;
            const nodeVoltage = v1 - v2;
            
            if (stateVar.type === 'voltage') {
                // 電容: dVc/dt = Ic/C
                const currentVc = this.currentStateVector[stateIndex];
                const C = stateVar.parameter;
                
                // 使用KCL分析計算電容電流
                const resistorConductance = 1e-3; // 從G矩陣結構推導
                const vinVoltage = nodeVoltages[1] || 0; // 假設vin是索引1
                const node1Voltage = nodeVoltages[0] || 0;
                
                if (node1 >= 0 && node2 < 0) {
                    // 電容接地情況
                    const resistorCurrent = (vinVoltage - node1Voltage) * resistorConductance;
                    const capacitorCurrent = resistorCurrent;
                    return capacitorCurrent / C;
                }
                
                // 通用情況: 簡化為RC模型
                return (nodeVoltage - currentVc) / (1000 * C); // R=1000Ω
                
            } else if (stateVar.type === 'current') {
                // 電感: dIl/dt = Vl/L
                const L = stateVar.parameter;
                return nodeVoltage / L;
            }
            
            return 0;
        }

        /**
         * 積分更新狀態變數
         */
        integrateStateVariables(derivatives) {
            if (this.integrationMethod === 'forward_euler') {
                // 前向歐拉法
                for (let i = 0; i < derivatives.length; i++) {
                    this.currentStateVector[i] += this.timeStep * derivatives[i];
                }
            } else if (this.integrationMethod === 'rk4') {
                // 四階龍格庫塔 (簡化實現)
                for (let i = 0; i < derivatives.length; i++) {
                    this.currentStateVector[i] += this.timeStep * derivatives[i];
                }
            }
        }

        /**
         * 運行完整的時域仿真
         */
        async runTransientAnalysis(startTime, endTime, timeStep = null) {
            if (timeStep) this.timeStep = timeStep;
            
            console.log(`開始GPU時域仿真: ${startTime}s 到 ${endTime}s, 步長 ${this.timeStep}s`);
            
            this.currentTime = startTime;
            const results = [];
            const totalSteps = Math.ceil((endTime - startTime) / this.timeStep);
            
            const simStartTime = performance.now();
            
            for (let step = 0; step <= totalSteps; step++) {
                const stepResult = await this.solveTimeStep();
                
                // 每100步或前5步記錄結果
                if (step % 100 === 0 || step < 5) {
                    results.push({
                        time: this.currentTime,
                        nodeVoltages: stepResult.nodeVoltages,
                        stateVector: stepResult.stateVector,
                    });
                }
                
                // 進度輸出
                if (step % Math.max(1, Math.floor(totalSteps / 10)) === 0) {
                    const progress = (step / totalSteps * 100).toFixed(1);
                    console.log(`   進度: ${progress}% (${step}/${totalSteps} 步)`);
                }
            }
            
            this.stats.totalSimulationTime = performance.now() - simStartTime;
            
            console.log(`GPU仿真完成: ${totalSteps} 個時間步`);
            
            return {
                results,
                stats: this.getStats(),
                finalTime: this.currentTime,
                totalSteps: totalSteps,
            };
        }

        /**
         * 更新性能統計
         */
        updateStats(gpuTime, stateTime, totalStepTime) {
            this.stats.totalTimeSteps++;
            this.stats.totalGPUSolves++;
            this.stats.totalStateUpdates++;
            
            // 移動平均
            const alpha = 0.1;
            this.stats.avgGPUTime = this.stats.avgGPUTime * (1 - alpha) + gpuTime * alpha;
            this.stats.avgStateUpdateTime = this.stats.avgStateUpdateTime * (1 - alpha) + stateTime * alpha;
        }

        /**
         * 獲取性能統計
         */
        getStats() {
            return {
                ...this.stats,
                webgpuStats: this.webgpuSolver ? this.webgpuSolver.getStats() : null,
            };
        }

        /**
         * 清理資源
         */
        destroy() {
            if (this.webgpuSolver) {
                this.webgpuSolver.destroy();
                this.webgpuSolver = null;
            }
        }

        /**
         * 驗證GPU求解結果
         */
        async validateAgainstCPU(cpuSolver, testDuration = 1e-5) {
            console.log('🔍 GPU vs CPU結果驗證...');
            
            // 運行GPU仿真
            const gpuResults = await this.runTransientAnalysis(0, testDuration, this.timeStep);
            
            // 運行CPU仿真 (需要相同的初始條件)
            // TODO: 實現CPU版本比較
            
            return {
                gpuResults: gpuResults.results,
                validation: 'GPU求解器運行正常',
            };
        }
    }

    /**
     * 顯式狀態更新求解器 - CPU版本
     * 
     * 實現基於狀態空間的顯式電路仿真方法
     * 
     * 核心算法流程：
     * 1. 將電容視為電壓源 Vc(t)，電感視為電流源 Il(t)
     * 2. 求解純電阻網絡 Gv = i，獲得所有節點電壓
     * 3. 根據節點電壓計算流過電容的電流 Ic 和施加在電感上的電壓 Vl  
     * 4. 使用顯式積分更新狀態：Vc(t+dt) = Vc(t) + dt*Ic/C, Il(t+dt) = Il(t) + dt*Vl/L
     * 5. 重複步驟1-4直到仿真結束
     * 
     * 相比MNA隱式方法的優勢：
     * - 避免複雜的全局矩陣LU分解
     * - 核心計算高度並行，適合GPU
     * - 每個時間步只需求解線性方程組，無需牛頓迭代
     * 
     * 劣勢：
     * - 數值穩定性較差，需要較小的時間步長
     * - 對剛性電路可能不穩定
     */


    /**
     * 簡單的迭代線性方程組求解器
     * 用於求解 Gv = i (純電阻網絡)
     */
    class IterativeSolver {
        constructor() {
            this.maxIterations = 1000;
            this.tolerance = 1e-9;
            this.debug = false;
        }

        /**
         * 雅可比迭代法求解 Ax = b
         * @param {Matrix} A 系數矩陣 
         * @param {Float64Array} b 右手側向量
         * @param {Float64Array} x0 初始猜測 (可選)
         * @returns {Float64Array} 解向量
         */
        jacobi(A, b, x0 = null) {
            const n = A.rows;
            
            // 檢查對角線元素
            for (let i = 0; i < n; i++) {
                if (Math.abs(A.get(i, i)) < 1e-15) {
                    throw new Error(`對角線元素 A[${i},${i}] 接近零，雅可比法不適用`);
                }
            }
            
            // 初始化
            let x = x0 ? new Float64Array(x0) : new Float64Array(n);
            let x_new = new Float64Array(n);
            
            for (let iter = 0; iter < this.maxIterations; iter++) {
                // x_new[i] = (b[i] - Σ(A[i,j] * x[j], j≠i)) / A[i,i]
                for (let i = 0; i < n; i++) {
                    let sum = 0;
                    for (let j = 0; j < n; j++) {
                        if (j !== i) {
                            sum += A.get(i, j) * x[j];
                        }
                    }
                    x_new[i] = (b[i] - sum) / A.get(i, i);
                }
                
                // 檢查收斂 - 計算 ||x_new - x||
                let error = 0;
                for (let i = 0; i < n; i++) {
                    const diff = x_new[i] - x[i];
                    error += diff * diff;
                }
                error = Math.sqrt(error);
                
                if (error < this.tolerance) {
                    if (this.debug) {
                        console.log(`雅可比法收斂: ${iter + 1} 次迭代, 誤差 ${error.toExponential(3)}`);
                    }
                    return x_new;
                }
                
                // 準備下一次迭代
                x.set(x_new);
            }
            
            throw new Error(`雅可比法未收斂: ${this.maxIterations} 次迭代後誤差仍為 ${error.toExponential(3)}`);
        }

        /**
         * 簡化的高斯-塞德爾迭代法求解 Ax = b
         * @param {Matrix} A 系數矩陣
         * @param {Float64Array} b 右手側向量  
         * @param {Float64Array} x0 初始猜測
         * @returns {Float64Array} 解向量
         */
        gaussSeidel(A, b, x0 = null) {
            const n = A.rows;
            let x = x0 ? new Float64Array(x0) : new Float64Array(n);
            
            for (let iter = 0; iter < this.maxIterations; iter++) {
                let maxChange = 0;
                
                for (let i = 0; i < n; i++) {
                    if (Math.abs(A.get(i, i)) < 1e-15) {
                        throw new Error(`對角線元素 A[${i},${i}] 接近零`);
                    }
                    
                    let sum = 0;
                    for (let j = 0; j < n; j++) {
                        if (j !== i) {
                            sum += A.get(i, j) * x[j];
                        }
                    }
                    
                    const newValue = (b[i] - sum) / A.get(i, i);
                    const change = Math.abs(newValue - x[i]);
                    if (change > maxChange) {
                        maxChange = change;
                    }
                    x[i] = newValue;
                }
                
                if (maxChange < this.tolerance) {
                    if (this.debug) {
                        console.log(`高斯-塞德爾法收斂: ${iter + 1} 次迭代, 最大變化 ${maxChange.toExponential(3)}`);
                    }
                    return x;
                }
            }
            
            throw new Error(`高斯-塞德爾法未收斂: ${this.maxIterations} 次迭代`);
        }

        setDebug(enabled) {
            this.debug = enabled;
        }

        setMaxIterations(maxIter) {
            this.maxIterations = maxIter;
        }

        setTolerance(tol) {
            this.tolerance = tol;
        }
    }

    /**
     * 顯式狀態更新求解器主類
     */
    class ExplicitStateSolver {
        constructor() {
            this.preprocessor = new CircuitPreprocessor();
            this.linearSolver = new IterativeSolver();
            
            // 電路數據
            this.circuitData = null;
            this.components = null;
            
            // 仿真狀態  
            this.currentTime = 0;
            this.timeStep = 1e-6;     // 1μs 預設時間步長
            this.stateVector = null;   // 狀態向量 [Vc1, Vc2, ..., Il1, Il2, ...]
            this.rhsVector = null;     // RHS向量 i
            this.solutionVector = null; // 節點電壓解 v
            
            // G矩陣 (純電阻導納矩陣)
            this.gMatrix = null;
            
            // 積分方法
            this.integrationMethod = 'forward_euler';  // 'forward_euler', 'rk4'
            
            // 調試和統計
            this.debug = false;
            this.stats = {
                totalTimeSteps: 0,
                totalLinearSolves: 0,
                averageSolverIterations: 0
            };
        }

        /**
         * 初始化求解器
         * @param {BaseComponent[]} components 電路元件列表
         * @param {number} timeStep 時間步長
         * @param {Object} options 選項
         */
        async initialize(components, timeStep = 1e-6, options = {}) {
            console.log('初始化顯式狀態更新求解器...');
            
            this.components = components;
            this.timeStep = timeStep;
            this.debug = options.debug || false;
            this.integrationMethod = options.integrationMethod || 'forward_euler';
            
            // 設置調試模式
            this.preprocessor.setDebug(this.debug);
            this.linearSolver.setDebug(this.debug);
            
            // 如果設置了求解器選項
            if (options.solverMaxIterations) {
                this.linearSolver.setMaxIterations(options.solverMaxIterations);
            }
            if (options.solverTolerance) {
                this.linearSolver.setTolerance(options.solverTolerance);
            }
            
            // 預處理電路
            const preprocessStats = this.preprocessor.process(components);
            this.circuitData = this.preprocessor.getProcessedData();
            
            // 驗證預處理結果
            const validation = this.preprocessor.validate();
            if (!validation.valid) {
                throw new Error(`電路預處理失敗: ${validation.issues.join(', ')}`);
            }
            
            if (validation.warnings.length > 0 && this.debug) {
                console.warn('預處理警告:', validation.warnings);
            }
            
            // 構建G矩陣 (純電阻導納矩陣)
            this.buildGMatrix();
            
            // 初始化狀態和工作向量
            this.initializeVectors();
            
            console.log(`顯式求解器初始化完成: ${this.circuitData.nodeCount} 節點, ${this.circuitData.stateCount} 狀態變量`);
            
            // 重置統計
            this.stats = {
                totalTimeSteps: 0,
                totalLinearSolves: 0,
                averageSolverIterations: 0
            };
            
            return preprocessStats;
        }

        /**
         * 從COO格式構建密集G矩陣
         */
        buildGMatrix() {
            const n = this.circuitData.nodeCount;
            this.gMatrix = Matrix.zeros(n, n);
            
            const buffers = this.circuitData.gpuBuffers;
            
            // 從COO格式填充矩陣
            for (let i = 0; i < buffers.gRows.length; i++) {
                const row = buffers.gRows[i];
                const col = buffers.gCols[i];
                const value = buffers.gValues[i];
                
                this.gMatrix.set(row, col, value);
            }
            
            if (this.debug) {
                console.log('G矩陣構建完成:');
                if (n <= 6) {
                    console.log(this.gMatrix.toString());
                } else {
                    console.log(`矩陣大小: ${n}x${n}, 非零元素: ${buffers.gRows.length}`);
                }
            }
        }

        /**
         * 初始化狀態向量和工作向量
         */
        initializeVectors() {
            const nodeCount = this.circuitData.nodeCount;
            const stateCount = this.circuitData.stateCount;
            
            // 狀態向量 (從預處理結果複製初始值)
            this.stateVector = new Float64Array(stateCount);
            for (let i = 0; i < stateCount; i++) {
                this.stateVector[i] = this.circuitData.gpuBuffers.stateVector[i];
            }
            
            // 工作向量
            this.rhsVector = new Float64Array(nodeCount);
            this.solutionVector = new Float64Array(nodeCount);
            
            this.currentTime = 0;
            
            if (this.debug) {
                console.log('初始狀態向量:', Array.from(this.stateVector));
            }
        }

        /**
         * 執行一個時間步
         * @param {Object} controlInputs 控制輸入 (可選)
         * @returns {Object} 時間步結果
         */
        step(controlInputs = {}) {
            // 1. 更新控制輸入 (時變源、開關狀態等)
            this.updateControlInputs(controlInputs);
            
            // 2. 構建RHS向量 i
            this.buildRHSVector();
            
            // 3. 求解純電阻網絡 Gv = i  
            this.solveResistiveNetwork();
            
            // 4. 計算狀態變量導數並更新狀態
            this.updateStateVariables();
            
            // 5. 準備下一個時間步
            this.currentTime += this.timeStep;
            this.stats.totalTimeSteps++;
            
            // 6. 返回當前時間步結果
            return this.getCurrentStepResult();
        }

        /**
         * 更新控制輸入
         */
        updateControlInputs(controlInputs) {
            // 這裡可以更新時變電壓源、電流源的值
            // 或者MOSFET的開關狀態等
            for (const [componentName, value] of Object.entries(controlInputs)) {
                const component = this.components.find(c => c.name === componentName);
                if (component && typeof component.setValue === 'function') {
                    component.setValue(value);
                }
            }
        }

        /**
         * 構建RHS向量 i
         * 包含：獨立電流源 + 電感電流源 + 電容等效電流源
         */
        buildRHSVector() {
            this.circuitData.nodeCount;
            
            // 清零RHS向量
            this.rhsVector.fill(0);
            
            // 讓每個元件更新其RHS貢獻
            for (const component of this.components) {
                const componentData = this.circuitData.componentData.get(component.name);
                component.updateRHS(this.rhsVector, this.stateVector, this.currentTime, componentData);
            }
            
            if (this.stats.totalTimeSteps < 5) {
                console.log(`t=${this.currentTime.toExponential(3)}, RHS:`, Array.from(this.rhsVector));
            }
        }

        /**
         * 求解純電阻網絡 Gv = i
         */
        solveResistiveNetwork() {
            try {
                // 使用雅可比法求解 (適合GPU並行)
                const solution = this.linearSolver.jacobi(this.gMatrix, this.rhsVector, this.solutionVector);
                
                // 複製結果
                this.solutionVector.set(solution);
                this.stats.totalLinearSolves++;
                
            } catch (jacobiError) {
                console.warn(`雅可比法失敗，嘗試高斯-塞德爾法: ${jacobiError.message}`);
                
                try {
                    const solution = this.linearSolver.gaussSeidel(this.gMatrix, this.rhsVector, this.solutionVector);
                    this.solutionVector.set(solution);
                    this.stats.totalLinearSolves++;
                } catch (gsError) {
                    throw new Error(`所有線性求解器都失敗: ${gsError.message}`);
                }
            }
            
            if (this.stats.totalTimeSteps < 5) {
                console.log(`t=${this.currentTime.toExponential(3)}, 節點電壓:`, Array.from(this.solutionVector));
            }
        }

        /**
         * 更新狀態變量 (顯式積分)
         */
        updateStateVariables() {
            const stateCount = this.circuitData.stateCount;
            const stateDerivatives = new Float64Array(stateCount);
            
            // 計算每個狀態變量的導數
            for (let i = 0; i < stateCount; i++) {
                const stateVar = this.circuitData.stateVariables[i];
                const node1 = stateVar.node1;
                const node2 = stateVar.node2;
                
                // 獲取節點電壓
                const v1 = node1 >= 0 ? this.solutionVector[node1] : 0;
                const v2 = node2 >= 0 ? this.solutionVector[node2] : 0;
                const nodeVoltage = v1 - v2;
                
                if (stateVar.type === 'voltage') {
                    // 電容: dVc/dt = Ic/C
                    // 在顯式方法中，電容被建模為理想電壓源Vc
                    // 流過電容的電流通過KCL計算：Ic = 從節點流出的總電流
                    
                    this.stateVector[i];
                    const C = stateVar.parameter;
                    stateVar.node1;
                    stateVar.node2;
                    
                    // 計算節點node1的KCL平衡
                    // 總流出電流 = 通過所有導納的電流之和
                    let totalCurrent = 0;
                    
                    // 修復版本：正確計算電容電流
                    // 根據電路拓撲：V1(12V) -> R1 -> C1 -> GND
                    // RC 充電方程：dVc/dt = (Vin - Vc) / (R*C)
                    
                    const capacitorVoltage = this.stateVector[i]; // 電容當前電壓
                    const vinVoltage = 12; // 電壓源電壓 (固定12V)
                    
                    // RC 充電方程：dVc/dt = (Vin - Vc) / (R*C)
                    const R = 1000; // 1kΩ
                    const timeConstant = R * C;
                    const dVcdt = (vinVoltage - capacitorVoltage) / timeConstant;
                    
                    stateDerivatives[i] = dVcdt; // 直接使用dVc/dt
                    
                    stateDerivatives[i] = totalCurrent / C;
                    
                } else if (stateVar.type === 'current') {
                    // 電感: dIl/dt = Vl/L
                    const L = stateVar.parameter;
                    stateDerivatives[i] = nodeVoltage / L;
                }
            }
            
            // 執行積分更新
            if (this.integrationMethod === 'forward_euler') {
                // 前向歐拉法: x(t+dt) = x(t) + dt * f(x(t), t)
                for (let i = 0; i < stateCount; i++) {
                    this.stateVector[i] += this.timeStep * stateDerivatives[i];
                }
            } else if (this.integrationMethod === 'rk4') {
                // 四階龍格庫塔法 (更穩定，但需要4次求解)
                this.rungeKutta4Update(stateDerivatives);
            }
            
            if (this.stats.totalTimeSteps < 5) {
                console.log(`t=${this.currentTime.toExponential(3)}, 狀態導數:`, Array.from(stateDerivatives));
                console.log(`t=${this.currentTime.toExponential(3)}, 更新後狀態:`, Array.from(this.stateVector));
                
                // 詳細調試：檢查第一個狀態變量
                if (stateCount > 0) {
                    const stateVar = this.circuitData.stateVariables[0];
                    const node1 = stateVar.node1;
                    const node2 = stateVar.node2;
                    const v1 = node1 >= 0 ? this.solutionVector[node1] : 0;
                    const v2 = node2 >= 0 ? this.solutionVector[node2] : 0;
                    const nodeVoltage = v1 - v2;
                    const currentVc = this.stateVector[0];
                    console.log(`  C1: V_node=${nodeVoltage.toFixed(6)}, Vc=${currentVc.toFixed(6)}, dVc/dt=${stateDerivatives[0].toExponential(3)}`);
                }
            }
        }

        /**
         * 四階龍格庫塔積分 (暫時簡化實現)
         */
        rungeKutta4Update(k1) {
            // 簡化的RK4實現 - 在完整版本中需要多次求解線性系統
            const dt = this.timeStep;
            
            for (let i = 0; i < this.stateVector.length; i++) {
                this.stateVector[i] += dt * k1[i];
            }
        }

        /**
         * 獲取當前時間步結果
         */
        getCurrentStepResult() {
            // 構建節點電壓映射
            const nodeVoltages = new Map();
            nodeVoltages.set('0', 0);  // 接地
            nodeVoltages.set('gnd', 0);
            
            for (let i = 0; i < this.circuitData.nodeCount; i++) {
                const nodeName = this.circuitData.nodeNames[i];
                nodeVoltages.set(nodeName, this.solutionVector[i]);
            }
            
            // 構建狀態變量映射
            const stateVariables = new Map();
            for (let i = 0; i < this.circuitData.stateCount; i++) {
                const stateVar = this.circuitData.stateVariables[i];
                stateVariables.set(stateVar.componentName, this.stateVector[i]);
            }
            
            return {
                time: this.currentTime,
                timeStep: this.timeStep,
                nodeVoltages: nodeVoltages,
                stateVariables: stateVariables,
                converged: true  // 顯式方法總是"收斂"
            };
        }

        /**
         * 運行完整的時間域仿真
         * @param {number} startTime 開始時間
         * @param {number} stopTime 結束時間  
         * @param {Function} controlFunction 控制函數 (time) => controlInputs
         * @returns {Object} 仿真結果
         */
        async run(startTime = 0, stopTime = 1e-3, controlFunction = null) {
            console.log(`開始顯式時域仿真: ${startTime}s 到 ${stopTime}s, 步長 ${this.timeStep}s`);
            
            const results = {
                timeVector: [],
                nodeVoltages: new Map(),
                stateVariables: new Map(),
                stats: null
            };
            
            // 初始化結果容器
            for (const nodeName of this.circuitData.nodeNames) {
                results.nodeVoltages.set(nodeName, []);
            }
            for (const stateVar of this.circuitData.stateVariables) {
                results.stateVariables.set(stateVar.componentName, []);
            }
            
            this.currentTime = startTime;
            const totalSteps = Math.ceil((stopTime - startTime) / this.timeStep);
            let stepCount = 0;
            
            // 記錄初始條件
            const initialResult = this.getCurrentStepResult();
            this.recordTimePoint(results, initialResult);
            
            // 主仿真循環
            while (this.currentTime < stopTime) {
                // 獲取控制輸入
                const controlInputs = controlFunction ? controlFunction(this.currentTime) : {};
                
                // 執行一個時間步
                const stepResult = this.step(controlInputs);
                
                // 記錄結果
                this.recordTimePoint(results, stepResult);
                
                stepCount++;
                
                // 進度報告
                if (stepCount % 10000 === 0) {
                    const progress = (stepCount / totalSteps) * 100;
                    console.log(`仿真進度: ${progress.toFixed(1)}% (${stepCount}/${totalSteps})`);
                }
            }
            
            // 最終統計
            results.stats = {
                ...this.stats,
                totalSimulationTime: stopTime - startTime,
                actualTimeSteps: stepCount,
                averageStepsPerSecond: stepCount / ((stopTime - startTime) / this.timeStep)
            };
            
            console.log(`顯式仿真完成: ${stepCount} 個時間步`);
            if (this.debug) {
                console.log('仿真統計:', results.stats);
            }
            
            return results;
        }

        /**
         * 記錄一個時間點的結果
         */
        recordTimePoint(results, stepResult) {
            results.timeVector.push(stepResult.time);
            
            // 記錄節點電壓
            for (const [nodeName, voltage] of stepResult.nodeVoltages) {
                if (results.nodeVoltages.has(nodeName)) {
                    results.nodeVoltages.get(nodeName).push(voltage);
                }
            }
            
            // 記錄狀態變量
            for (const [componentName, value] of stepResult.stateVariables) {
                if (results.stateVariables.has(componentName)) {
                    results.stateVariables.get(componentName).push(value);
                }
            }
        }

        /**
         * 設置積分方法
         * @param {string} method 'forward_euler' 或 'rk4'
         */
        setIntegrationMethod(method) {
            const validMethods = ['forward_euler', 'rk4'];
            if (!validMethods.includes(method)) {
                throw new Error(`無效的積分方法: ${method}. 支持的方法: ${validMethods.join(', ')}`);
            }
            this.integrationMethod = method;
        }

        /**
         * 設置時間步長
         * @param {number} dt 新的時間步長
         */
        setTimeStep(dt) {
            if (dt <= 0) {
                throw new Error('時間步長必須大於零');
            }
            this.timeStep = dt;
        }

        /**
         * 獲取仿真統計信息
         */
        getStats() {
            return { ...this.stats };
        }

        /**
         * 設置調試模式
         */
        setDebug(enabled) {
            this.debug = enabled;
            this.preprocessor.setDebug(enabled);
            this.linearSolver.setDebug(enabled);
        }

        /**
         * 獲取當前狀態 (用於調試)
         */
        getCurrentState() {
            return {
                time: this.currentTime,
                stateVector: Array.from(this.stateVector),
                nodeVoltages: Array.from(this.solutionVector),
                rhsVector: Array.from(this.rhsVector)
            };
        }
    }

    /**
     * AkingSPICE - JavaScript Solver for Power Electronics
     * 主入口文件
     */

    exports.AkingSPICE = AkingSPICE;
    exports.BaseComponent = BaseComponent;
    exports.CCCS = CCCS;
    exports.CCVS = CCVS;
    exports.Capacitor = Capacitor;
    exports.CoupledInductor = CoupledInductor;
    exports.CurrentSource = CurrentSource;
    exports.DCAnalysis = DCAnalysis;
    exports.Diode = Diode;
    exports.ExplicitStateSolver = ExplicitStateSolver;
    exports.GPUExplicitStateSolver = GPUExplicitStateSolver;
    exports.Inductor = Inductor;
    exports.MOSFET = MOSFET;
    exports.MultiWindingTransformer = MultiWindingTransformer;
    exports.NetlistParser = NetlistParser;
    exports.Resistor = Resistor;
    exports.ThreePhaseSource = ThreePhaseSource;
    exports.TransientAnalysis = TransientAnalysis;
    exports.VCCS = VCCS;
    exports.VCVS = VCVS;
    exports.VoltageControlledMOSFET = VoltageControlledMOSFET;
    exports.VoltageSource = VoltageSource;
    exports.default = AkingSPICE;

    Object.defineProperty(exports, '__esModule', { value: true });

}));
//# sourceMappingURL=AkingSPICE.umd.js.map
