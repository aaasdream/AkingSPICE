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
export class CircuitPreprocessor {
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
        
        // 注意：這個方法主要用於預處理階段記錄靜態電流源
        // 動態的RHS更新將在運行時進行
        if (node1 >= 0) {
            // 此處我們暫時不直接修改RHS，而是記錄信息供後續使用
        }
        if (node2 >= 0) {
            // 同上
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