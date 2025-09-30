/**
 * 電阻元件模型
 * 實現線性電阻的所有功能，包括溫度係數和功率計算
 */

import { LinearTwoTerminal } from './base.js';

export class Resistor extends LinearTwoTerminal {
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
 * 可變電阻 (電位器) 模型
 */
export class Potentiometer extends Resistor {
    /**
     * @param {string} name 電位器名稱
     * @param {string[]} nodes 連接節點 [端子1, 滑動端, 端子2]
     * @param {number} totalResistance 總電阻值
     * @param {number} position 滑動位置 (0-1)
     * @param {Object} params 額外參數
     */
    constructor(name, nodes, totalResistance, position = 0.5, params = {}) {
        // 電位器需要3個節點
        if (nodes.length !== 3) {
            throw new Error('Potentiometer must have exactly 3 nodes');
        }
        
        super(name, [nodes[0], nodes[2]], totalResistance, params);
        this.type = 'POT';
        this.nodes = [...nodes]; // [端子1, 滑動端, 端子2]
        this.position = Math.max(0, Math.min(1, position)); // 限制在0-1範圍
        this.totalResistance = totalResistance;
    }

    /**
     * 設置滑動位置
     * @param {number} position 位置 (0-1)
     */
    setPosition(position) {
        this.position = Math.max(0, Math.min(1, position));
    }

    /**
     * 獲取上半段電阻值 (端子1到滑動端)
     * @returns {number} 電阻值
     */
    getUpperResistance() {
        const minRes = 1e-6; // 防止零電阻
        return Math.max(minRes, this.totalResistance * this.position);
    }

    /**
     * 獲取下半段電阻值 (滑動端到端子2)
     * @returns {number} 電阻值
     */
    getLowerResistance() {
        const minRes = 1e-6; // 防止零電阻
        return Math.max(minRes, this.totalResistance * (1 - this.position));
    }

    toString() {
        return `${this.name}: ${this.nodes[0]}-${this.nodes[1]}-${this.nodes[2]} ${this.totalResistance}Ω (pos: ${(this.position * 100).toFixed(1)}%)`;
    }
}