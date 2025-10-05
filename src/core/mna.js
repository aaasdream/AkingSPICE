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
    constructor(options = {}) {
        // 調試選項
        this.debug = options.debug || false;
        
        // 🔥 修正：增加 Gmin 電導，提供更強穩定性解決矩陣奇異問題
        this.gmin = options.gmin || 1e-9; // 預設 1 nS (nanoSiemens) - 從 1e-12 增強
        
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
            if (component.type === 'V' || (component.needsCurrentVariable && component.needsCurrentVariable())) {
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

        if (this.debug) {
            console.log(`MNA Analysis: ${this.nodeCount} nodes, ${this.voltageSourceCount} voltage sources, matrix size: ${this.matrixSize}x${this.matrixSize}`);
        }
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

        // 🔥 關鍵修正：自動添加 Gmin 電導
        // 為了避免奇異矩陣，從每個非地節點到地添加一個極小的電導
        for (let i = 0; i < this.nodeCount; i++) {
            this.matrix.addAt(i, i, this.gmin);
        }

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
     * 🔥 重構版：優先使用元件自己的 stamp 方法，實現真正的物件導向
     * @param {BaseComponent} component 電路元件
     * @param {number} time 當前時間
     */
    stampComponent(component, time) {
        // 🔥 優先檢查元件是否有自己的 stamp 方法
        if (typeof component.stamp === 'function') {
            // 使用元件自己的 stamp 方法 - 真正的物件導向封裝
            component.stamp(this.matrix, this.rhs, this.nodeMap, this.voltageSourceMap, time);
            return;
        }

        // 🔥 所有主要組件現在都有自己的 stamp 方法
        // 如果到了這裡，說明組件沒有實現 stamp 方法
        console.warn(`Component ${component.name} (type: ${component.type}) has no stamp method - please implement one for proper object-oriented design`);
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
     * 獲取節點映射
     * @returns {Map<string, number>} 節點名稱到矩陣索引的映射
     */
    getNodeMap() {
        return new Map(this.nodeMap);
    }
    
    /**
     * 獲取矩陣大小
     * @returns {number} 矩陣維度
     */
    getMatrixSize() {
        return this.matrixSize;
    }
    
    /**
     * 獲取電壓源映射 (用於支路電流提取)
     * @returns {Map<string, number>} 電壓源名稱到電流變量索引的映射
     */
    getVoltageSourceMap() {
        return new Map(this.voltageSourceMap);
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