/**
 * 三相電壓源模型 - 專為 VIENNA PFC、T-type PFC 等三相拓撲設計
 * 
 * 特點：
 * - 自動生成 120° 相位差的三相電壓
 * - 支援星形 (Wye) 和三角形 (Delta) 連接
 * - 可配置相序（ABC 或 ACB）
 * - 支援不平衡和諧波分析
 */

import { VoltageSource } from './sources.js';
import { BaseComponent } from './base.js';

/**
 * 三相電壓源
 * 
 * 這個模型實現了：
 * 1. 三個相位差 120° 的正弦電壓源
 * 2. 星形連接（含中性點）或三角形連接
 * 3. 相序控制（正序 ABC 或反序 ACB）
 * 4. 頻率、幅值、相位偏移控制
 */
export class ThreePhaseSource extends BaseComponent {
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