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

import { Matrix, Vector } from './linalg.js';

/**
 * MNA矩陣生成器
 * 負責從電路元件列表生成MNA矩陣和右手邊向量
 */
export class MNABuilder {
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
     * 使用伴隨模型: i_c(t) = C * dv/dt ≈ C/h * (v(t) - v(t-h)) + i_hist
     * 其中 h 是時間步長
     */
    stampCapacitor(capacitor) {
        if (!capacitor.timeStep) {
            // 在DC分析中，電容視為開路
            return;
        }

        const nodes = capacitor.nodes;
        const C = capacitor.value;
        const h = capacitor.timeStep;
        const Geq = C / h; // 等效電導

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
        if (capacitor.historyTerm !== undefined) {
            if (n1 >= 0) {
                this.rhs.addAt(n1, -capacitor.historyTerm);
            }
            if (n2 >= 0) {
                this.rhs.addAt(n2, capacitor.historyTerm);
            }
        }
    }

    /**
     * 電感的MNA印記 (需要電流變數)
     * 使用伴隨模型: v_L(t) = L * di/dt ≈ L/h * (i(t) - i(t-h))
     */
    stampInductor(inductor) {
        const nodes = inductor.nodes;
        const L = inductor.value;
        
        const n1 = this.getNodeIndex(nodes[0]);
        const n2 = this.getNodeIndex(nodes[1]);
        const currIndex = this.voltageSourceMap.get(inductor.name);
        
        if (currIndex === undefined) {
            throw new Error(`Inductor ${inductor.name} current variable not found`);
        }

        // B矩陣: 電流從節點流出的關係
        if (n1 >= 0) {
            this.matrix.addAt(n1, currIndex, 1);
            this.matrix.addAt(currIndex, n1, 1);
        }
        if (n2 >= 0) {
            this.matrix.addAt(n2, currIndex, -1);
            this.matrix.addAt(currIndex, n2, -1);
        }

        // D矩陣: 電感的電壓-電流關係
        if (inductor.timeStep) {
            const h = inductor.timeStep;
            this.matrix.addAt(currIndex, currIndex, -L / h);
            
            // 歷史項
            if (inductor.historyTerm !== undefined) {
                this.rhs.addAt(currIndex, -L / h * inductor.historyTerm);
            }
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