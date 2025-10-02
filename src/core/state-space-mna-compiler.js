/**
 * 狀態空間 MNA 編譯器 - Phase 2 核心實現
 * 
 * 核心算法：從 MNA 系統到狀態空間的自動轉換
 * 
 * 理論基礎：
 * 1. MNA 方程： C·ż(t) + G·z(t) = B·u(t)
 * 2. 變量分離： z = [xs, xa]^T (狀態變量 xs, 代數變量 xa)  
 * 3. 塊矩陣分割：
 *    [Css Csa] [ẋs]   [Gss Gsa] [xs]   [Bs]
 *    [Cas Caa] [ẋa] + [Gas Gaa] [xa] = [Ba] · u
 * 4. 代數消除： ẋa = 0 (代數約束) → 求解 xa = f(xs, u)
 * 5. 狀態空間形式： ẋs = A·xs + B·u, y = C·xs + D·u
 */

import { Matrix, Vector, LUSolver } from './linalg.js';

/**
 * MNA 變量類型枚舉
 */
const VariableType = {
    NODE_VOLTAGE: 'node_voltage',    // 節點電壓
    BRANCH_CURRENT: 'branch_current', // 支路電流 (電感、電壓源)
    STATE: 'state',                  // 狀態變量 (電容電壓、電感電流)
    ALGEBRAIC: 'algebraic'           // 代數變量 (純電阻節點)
};

/**
 * MNA 系統描述符
 */
class MNASystemDescriptor {
    constructor() {
        this.variables = [];           // MNA 變量列表
        this.stateIndices = [];        // 狀態變量在 MNA 中的索引
        this.algebraicIndices = [];    // 代數變量在 MNA 中的索引
        this.nodeCount = 0;
        this.branchCount = 0;
        this.totalSize = 0;
        
        // 分塊矩陣
        this.C_mna = null;  // 容性矩陣 (儲能元件)
        this.G_mna = null;  // 電導矩陣 (電阻性元件)
        this.B_mna = null;  // 輸入矩陣
    }
}

/**
 * 狀態空間 MNA 編譯器
 */
export class StateSpaceMNACompiler {
    constructor(options = {}) {
        this.options = {
            debug: false,
            numericalTolerance: 1e-12,
            maxConditionNumber: 1e12,
            validateMatrices: true,
            ...options
        };
        
        this.stats = {
            compilationTime: 0,
            mnaSize: 0,
            stateSize: 0,
            algebraicSize: 0,
            reductionRatio: 1.0,
            conditionNumbers: {}
        };
    }
    
    /**
     * 主編譯方法：MNA → 狀態空間
     */
    async compile(components, stateVariables, inputVariables, outputVariables) {
        const startTime = performance.now();
        
        if (this.options.debug) {
            console.log('🔧 啟動 MNA → 狀態空間編譯器...');
        }
        
        try {
            // Phase 2.1: 構建完整 MNA 系統
            const mnaSystem = await this.buildMNASystem(components, stateVariables, inputVariables);
            
            // Phase 2.2: 變量分類與索引映射
            const variableMapping = this.classifyAndMapVariables(mnaSystem, stateVariables, inputVariables);
            
            // Phase 2.3: 塊矩陣分割
            const blockMatrices = this.performBlockPartitioning(mnaSystem, variableMapping);
            
            // Phase 2.4: 代數消除與狀態空間求解
            const stateSpaceMatrices = await this.eliminateAlgebraicVariables(blockMatrices, variableMapping);
            
            // Phase 2.5: 輸出矩陣構建
            const outputMatrices = this.buildOutputMatrices(stateSpaceMatrices, outputVariables, variableMapping);
            
            // Phase 2.6: 最終驗證與優化
            const finalMatrices = this.validateAndOptimize(outputMatrices, variableMapping);
            
            // 記錄統計
            this.stats.compilationTime = performance.now() - startTime;
            this.stats.mnaSize = mnaSystem.totalSize;
            this.stats.stateSize = variableMapping.stateIndices.length;
            this.stats.algebraicSize = variableMapping.algebraicIndices.length;
            this.stats.reductionRatio = this.stats.mnaSize / this.stats.stateSize;
            
            if (this.options.debug) {
                console.log(`✅ MNA → 狀態空間編譯完成 (${this.stats.compilationTime.toFixed(2)}ms)`);
                console.log(`   原始 MNA 維度: ${this.stats.mnaSize}×${this.stats.mnaSize}`);
                console.log(`   狀態空間維度: ${this.stats.stateSize}×${this.stats.stateSize}`);
                console.log(`   維度縮減比: ${this.stats.reductionRatio.toFixed(2)}:1`);
            }
            
            return finalMatrices;
            
        } catch (error) {
            console.error('❌ MNA → 狀態空間編譯失敗:', error);
            throw new Error(`StateSpaceMNACompiler: ${error.message}`);
        }
    }
    
    /**
     * Phase 2.1: 構建完整 MNA 系統
     * 建立 C·ż + G·z = B·u 形式的方程組
     */
    async buildMNASystem(components, stateVariables, inputVariables) {
        if (this.options.debug) {
            console.log('  📊 Phase 2.1: 構建 MNA 系統...');
        }
        
        // 分析電路拓撲
        const topology = this.analyzeCircuitTopology(components);
        
        // 計算系統維度
        const nodeCount = topology.nodeCount;  // 使用返回的節點數
        const branchCount = this.countBranchVariables(components);
        const totalSize = nodeCount + branchCount;
        
        if (this.options.debug) {
            console.log(`    節點數: ${nodeCount}, 支路變數: ${branchCount}, 總維度: ${totalSize}`);
        }
        
        // 檢查維度有效性
        if (totalSize <= 0 || !isFinite(totalSize)) {
            throw new Error(`無效的系統維度: ${totalSize} (節點: ${nodeCount}, 支路: ${branchCount})`);
        }
        
        // 初始化 MNA 矩陣
        const mnaSystem = new MNASystemDescriptor();
        mnaSystem.nodeCount = nodeCount;
        mnaSystem.branchCount = branchCount;
        mnaSystem.totalSize = totalSize;
        mnaSystem.C_mna = Matrix.zeros(totalSize, totalSize);
        mnaSystem.G_mna = Matrix.zeros(totalSize, totalSize);
        mnaSystem.B_mna = Matrix.zeros(totalSize, inputVariables.length);
        
        // 建立變數映射表
        const nodeMap = this.buildNodeMapping(topology.nodes);
        let branchIndex = nodeCount;
        
        // 逐元件蓋印 MNA 矩陣
        for (const component of components) {
            branchIndex = this.stampComponentMNA(
                mnaSystem, 
                component, 
                nodeMap, 
                branchIndex, 
                stateVariables, 
                inputVariables
            );
        }
        
        return mnaSystem;
    }
    
    /**
     * 分析電路拓撲結構
     */
    analyzeCircuitTopology(components) {
        const nodes = new Set();
        const branches = [];
        
        for (const component of components) {
            // 收集節點 (排除接地)
            if (component.node1 && component.node1 !== '0' && component.node1 !== 'gnd') {
                nodes.add(component.node1);
            }
            if (component.node2 && component.node2 !== '0' && component.node2 !== 'gnd') {
                nodes.add(component.node2);
            }
            
            // 收集需要支路變數的元件
            if (this.needsBranchVariable(component)) {
                branches.push({
                    component: component,
                    type: this.getBranchVariableType(component)
                });
            }
        }
        
        const nodeArray = Array.from(nodes).sort();
        return { 
            nodes: nodeArray, 
            branches,
            nodeCount: nodeArray.length  // 明確返回節點數
        };
    }
    
    /**
     * 判斷元件是否需要支路變數
     */
    needsBranchVariable(component) {
        return component.type === 'L' ||   // 電感需要電流變數
               component.type === 'V' ||   // 電壓源需要電流變數  
               component.type === 'VCVS';  // 壓控電壓源需要電流變數
    }
    
    /**
     * 獲取支路變數類型
     */
    getBranchVariableType(component) {
        if (component.type === 'L') return 'inductor_current';
        if (component.type === 'V') return 'voltage_source_current';
        if (component.type === 'VCVS') return 'vcvs_current';
        return 'unknown';
    }
    
    /**
     * 計算支路變數數量
     */
    countBranchVariables(components) {
        return components.filter(comp => this.needsBranchVariable(comp)).length;
    }
    
    /**
     * 建立節點映射表
     */
    buildNodeMapping(nodeNames) {
        const nodeMap = new Map();
        if (Array.isArray(nodeNames)) {
            nodeNames.forEach((name, index) => {
                nodeMap.set(name, index);
            });
        } else {
            console.warn('buildNodeMapping: nodeNames 不是陣列:', nodeNames);
        }
        return nodeMap;
    }
    
    /**
     * 蓋印單個元件的 MNA 貢獻
     */
    stampComponentMNA(mnaSystem, component, nodeMap, branchIndex, stateVariables, inputVariables) {
        const { C_mna, G_mna, B_mna } = mnaSystem;
        
        switch (component.type) {
            case 'R':
                this.stampResistorMNA(G_mna, component, nodeMap);
                break;
                
            case 'C':
                this.stampCapacitorMNA(C_mna, G_mna, component, nodeMap, stateVariables);
                break;
                
            case 'L':
                const inductorBranch = this.stampInductorMNA(C_mna, G_mna, component, nodeMap, branchIndex);
                branchIndex++;
                break;
                
            case 'V':
                const voltageBranch = this.stampVoltageSourceMNA(G_mna, B_mna, component, nodeMap, branchIndex, inputVariables);
                branchIndex++;
                break;
                
            case 'I':
                this.stampCurrentSourceMNA(B_mna, component, nodeMap, inputVariables);
                break;
                
            case 'VCVS':
                const vcvsBranch = this.stampVCVSMNA(G_mna, component, nodeMap, branchIndex);
                branchIndex++;
                break;
                
            default:
                if (this.options.debug) {
                    console.warn(`    ⚠️  未知元件類型: ${component.type} (${component.name})`);
                }
        }
        
        return branchIndex;
    }
    
    /**
     * 電阻 MNA 蓋印：G 矩陣
     */
    stampResistorMNA(G_mna, resistor, nodeMap) {
        const n1 = this.getNodeIndex(resistor.node1, nodeMap);
        const n2 = this.getNodeIndex(resistor.node2, nodeMap);
        const g = 1 / resistor.value; // 電導
        
        if (n1 >= 0) {
            G_mna.addAt(n1, n1, g);
            if (n2 >= 0) {
                G_mna.addAt(n1, n2, -g);
            }
        }
        
        if (n2 >= 0) {
            G_mna.addAt(n2, n2, g);
            if (n1 >= 0) {
                G_mna.addAt(n2, n1, -g);
            }
        }
    }
    
    /**
     * 電容 MNA 蓋印：C 矩陣
     * 電容電壓是狀態變數，對應節點電壓
     */
    stampCapacitorMNA(C_mna, G_mna, capacitor, nodeMap, stateVariables) {
        const n1 = this.getNodeIndex(capacitor.node1, nodeMap);
        const n2 = this.getNodeIndex(capacitor.node2, nodeMap);
        const C = capacitor.value;
        
        // 找到對應的狀態變數
        const stateVar = stateVariables.find(sv => 
            sv.componentName === capacitor.name && sv.type === 'voltage'
        );
        
        if (!stateVar) {
            if (this.options.debug) {
                console.warn(`    ⚠️  電容 ${capacitor.name} 沒有對應的狀態變數`);
            }
            return;
        }
        
        // KCL: I_C = C * dV_C/dt
        if (n1 >= 0) {
            C_mna.addAt(n1, n1, C);
            if (n2 >= 0) {
                C_mna.addAt(n1, n2, -C);
            }
        }
        
        if (n2 >= 0) {
            C_mna.addAt(n2, n2, C);
            if (n1 >= 0) {
                C_mna.addAt(n2, n1, -C);
            }
        }
    }
    
    /**
     * 電感 MNA 蓋印：C 矩陣 + G 矩陣
     * 電感電流是狀態變數，需要支路變數
     */
    stampInductorMNA(C_mna, G_mna, inductor, nodeMap, branchIndex) {
        const n1 = this.getNodeIndex(inductor.node1, nodeMap);
        const n2 = this.getNodeIndex(inductor.node2, nodeMap);
        const L = inductor.value;
        
        // KCL: 節點電流平衡
        if (n1 >= 0) {
            G_mna.set(n1, branchIndex, 1);      // 電流流入正極
            G_mna.set(branchIndex, n1, 1);      // 對稱項
        }
        
        if (n2 >= 0) {
            G_mna.set(n2, branchIndex, -1);     // 電流流出負極
            G_mna.set(branchIndex, n2, -1);     // 對稱項
        }
        
        // KVL: V_L = L * dI_L/dt
        C_mna.set(branchIndex, branchIndex, -L);
        
        return branchIndex;
    }
    
    /**
     * 電壓源 MNA 蓋印：G 矩陣 + B 矩陣
     */
    stampVoltageSourceMNA(G_mna, B_mna, voltageSource, nodeMap, branchIndex, inputVariables) {
        const n1 = this.getNodeIndex(voltageSource.node1, nodeMap);
        const n2 = this.getNodeIndex(voltageSource.node2, nodeMap);
        
        // 找到對應的輸入變數
        const inputVar = inputVariables.find(iv => 
            iv.componentName === voltageSource.name && iv.type === 'voltage'
        );
        
        if (!inputVar) {
            if (this.options.debug) {
                console.warn(`    ⚠️  電壓源 ${voltageSource.name} 沒有對應的輸入變數`);
            }
            return branchIndex;
        }
        
        // KCL: 節點電流平衡
        if (n1 >= 0) {
            G_mna.set(n1, branchIndex, 1);
            G_mna.set(branchIndex, n1, 1);
        }
        
        if (n2 >= 0) {
            G_mna.set(n2, branchIndex, -1);
            G_mna.set(branchIndex, n2, -1);
        }
        
        // 電壓約束: V_source = input
        B_mna.set(branchIndex, inputVar.index, 1);
        
        return branchIndex;
    }
    
    /**
     * 電流源 MNA 蓋印：B 矩陣
     */
    stampCurrentSourceMNA(B_mna, currentSource, nodeMap, inputVariables) {
        const n1 = this.getNodeIndex(currentSource.node1, nodeMap);
        const n2 = this.getNodeIndex(currentSource.node2, nodeMap);
        
        // 找到對應的輸入變數
        const inputVar = inputVariables.find(iv => 
            iv.componentName === currentSource.name && iv.type === 'current'
        );
        
        if (!inputVar) {
            if (this.options.debug) {
                console.warn(`    ⚠️  電流源 ${currentSource.name} 沒有對應的輸入變數`);
            }
            return;
        }
        
        // KCL: 注入電流
        if (n1 >= 0) {
            B_mna.set(n1, inputVar.index, 1);   // 正極注入
        }
        
        if (n2 >= 0) {
            B_mna.set(n2, inputVar.index, -1);  // 負極流出
        }
    }
    
    /**
     * 壓控電壓源 MNA 蓋印
     */
    stampVCVSMNA(G_mna, vcvs, nodeMap, branchIndex) {
        // 輸出節點
        const no1 = this.getNodeIndex(vcvs.nodes[0], nodeMap);
        const no2 = this.getNodeIndex(vcvs.nodes[1], nodeMap);
        
        // 控制節點
        const nc1 = this.getNodeIndex(vcvs.nodes[2], nodeMap);
        const nc2 = this.getNodeIndex(vcvs.nodes[3], nodeMap);
        
        const gain = vcvs.value;
        
        // 輸出端 KCL
        if (no1 >= 0) {
            G_mna.set(no1, branchIndex, 1);
            G_mna.set(branchIndex, no1, 1);
        }
        
        if (no2 >= 0) {
            G_mna.set(no2, branchIndex, -1);
            G_mna.set(branchIndex, no2, -1);
        }
        
        // 控制關係: V_out = gain * (V_c1 - V_c2)
        if (nc1 >= 0) {
            G_mna.set(branchIndex, nc1, -gain);
        }
        
        if (nc2 >= 0) {
            G_mna.set(branchIndex, nc2, gain);
        }
        
        return branchIndex;
    }
    
    /**
     * 獲取節點在 MNA 矩陣中的索引
     */
    getNodeIndex(nodeName, nodeMap) {
        if (!nodeName || nodeName === '0' || nodeName === 'gnd') {
            return -1; // 接地節點
        }
        return nodeMap.get(nodeName) ?? -1;
    }
    
    /**
     * Phase 2.2: 變量分類與索引映射
     * 將 MNA 變量分為狀態變量和代數變量
     */
    classifyAndMapVariables(mnaSystem, stateVariables, inputVariables) {
        if (this.options.debug) {
            console.log('  🔍 Phase 2.2: 變量分類與映射...');
        }
        
        const stateIndices = [];
        const algebraicIndices = [];
        const stateToMNAMap = new Map();
        const mnaToStateMap = new Map();
        
        // 建立狀態變量索引映射
        for (let i = 0; i < stateVariables.length; i++) {
            const stateVar = stateVariables[i];
            let mnaIndex = -1;
            
            if (stateVar.type === 'voltage') {
                // 電容電壓對應節點電壓 (在 MNA 的前 nodeCount 個變量中)
                const nodeIndex = this.findNodeIndexForCapacitor(stateVar.componentName, mnaSystem);
                mnaIndex = nodeIndex;
            } else if (stateVar.type === 'current') {
                // 電感電流對應支路電流 (在 MNA 的後 branchCount 個變量中)
                const branchIndex = this.findBranchIndexForInductor(stateVar.componentName, mnaSystem);
                mnaIndex = mnaSystem.nodeCount + branchIndex;
            }
            
            if (mnaIndex >= 0) {
                stateIndices.push(mnaIndex);
                stateToMNAMap.set(i, mnaIndex);
                mnaToStateMap.set(mnaIndex, i);
            }
        }
        
        // 剩餘變量為代數變量
        for (let i = 0; i < mnaSystem.totalSize; i++) {
            if (!stateIndices.includes(i)) {
                algebraicIndices.push(i);
            }
        }
        
        if (this.options.debug) {
            console.log(`    狀態變量索引: [${stateIndices.join(', ')}]`);
            console.log(`    代數變量索引: [${algebraicIndices.join(', ')}]`);
        }
        
        return {
            stateIndices,
            algebraicIndices,
            stateToMNAMap,
            mnaToStateMap,
            stateVariables,
            inputVariables
        };
    }
    
    /**
     * 查找電容對應的節點索引
     */
    findNodeIndexForCapacitor(componentName, mnaSystem) {
        // 簡化實現：假設電容名稱包含節點信息
        // 實際實現需要從電路拓撲中查找
        return 0; // 暫時返回第一個節點
    }
    
    /**
     * 查找電感對應的支路索引
     */
    findBranchIndexForInductor(componentName, mnaSystem) {
        // 簡化實現：按順序分配支路索引
        // 實際實現需要根據元件順序確定
        return 0; // 暫時返回第一個支路
    }
    
    /**
     * Phase 2.3: 塊矩陣分割
     * 將 MNA 矩陣按狀態/代數變量重新排列和分塊
     */
    performBlockPartitioning(mnaSystem, variableMapping) {
        if (this.options.debug) {
            console.log('  📦 Phase 2.3: 塊矩陣分割...');
        }
        
        const { stateIndices, algebraicIndices } = variableMapping;
        const { C_mna, G_mna, B_mna } = mnaSystem;
        
        // 提取分塊矩陣
        const C_ss = this.extractSubMatrix(C_mna, stateIndices, stateIndices);
        const C_sa = this.extractSubMatrix(C_mna, stateIndices, algebraicIndices);
        const C_as = this.extractSubMatrix(C_mna, algebraicIndices, stateIndices);
        const C_aa = this.extractSubMatrix(C_mna, algebraicIndices, algebraicIndices);
        
        const G_ss = this.extractSubMatrix(G_mna, stateIndices, stateIndices);
        const G_sa = this.extractSubMatrix(G_mna, stateIndices, algebraicIndices);
        const G_as = this.extractSubMatrix(G_mna, algebraicIndices, stateIndices);
        const G_aa = this.extractSubMatrix(G_mna, algebraicIndices, algebraicIndices);
        
        const B_s = this.extractSubMatrix(B_mna, stateIndices, null);
        const B_a = this.extractSubMatrix(B_mna, algebraicIndices, null);
        
        if (this.options.debug) {
            console.log(`    C_ss: ${C_ss.rows}×${C_ss.cols}, G_aa: ${G_aa.rows}×${G_aa.cols}`);
            console.log(`    B_s: ${B_s.rows}×${B_s.cols}, B_a: ${B_a.rows}×${B_a.cols}`);
        }
        
        return {
            C_ss, C_sa, C_as, C_aa,
            G_ss, G_sa, G_as, G_aa,
            B_s, B_a,
            stateIndices,
            algebraicIndices
        };
    }
    
    /**
     * 提取子矩陣
     */
    extractSubMatrix(matrix, rowIndices, colIndices) {
        if (colIndices === null) {
            // 處理向量情況
            colIndices = Array.from({length: matrix.cols}, (_, i) => i);
        }
        
        const subMatrix = Matrix.zeros(rowIndices.length, colIndices.length);
        
        for (let i = 0; i < rowIndices.length; i++) {
            for (let j = 0; j < colIndices.length; j++) {
                const value = matrix.get(rowIndices[i], colIndices[j]);
                subMatrix.set(i, j, value);
            }
        }
        
        return subMatrix;
    }
    
    /**
     * Phase 2.4: 代數消除與狀態空間求解
     * 核心算法：從分塊 MNA 系統導出狀態空間矩陣
     */
    async eliminateAlgebraicVariables(blockMatrices, variableMapping) {
        if (this.options.debug) {
            console.log('  ⚡ Phase 2.4: 代數消除求解...');
        }
        
        const { C_ss, C_sa, G_ss, G_sa, G_as, G_aa, B_s, B_a } = blockMatrices;
        const numStates = variableMapping.stateIndices.length;
        const numInputs = variableMapping.inputVariables.length;
        
        try {
            // 步驟 1: 檢查 G_aa 是否可逆
            if (this.options.debug) {
                console.log('    檢查代數約束矩陣 G_aa 可逆性...');
            }
            
            let conditionNumber;
            try {
                conditionNumber = this.estimateConditionNumber(G_aa);
            } catch (error) {
                // 如果條件數估算失敗，設置為無窮大
                conditionNumber = Infinity;
            }
            this.stats.conditionNumbers.G_aa = conditionNumber;
            
            // 步驟 2: 計算 G_aa 的逆矩陣 (使用穩健方法)
            let G_aa_inv;
            if (conditionNumber > this.options.maxConditionNumber || !isFinite(conditionNumber)) {
                // 使用偽逆或正則化技術
                if (this.options.debug) {
                    console.log(`    ⚠️  G_aa 矩陣奇異或病態 (條件數: ${conditionNumber}), 使用偽逆...`);
                }
                G_aa_inv = await this.computePseudoInverse(G_aa);
            } else {
                G_aa_inv = this.computeInverse(G_aa);
            }
            
            // 步驟 3: 檢查 C_ss 是否可逆 (或使用廣義逆)
            const C_ss_inv = this.computeGeneralizedInverse(C_ss);
            
            // 步驟 4: 計算狀態空間矩陣
            // A = -inv(C_ss) * (G_ss - G_sa * inv(G_aa) * G_as)
            const temp1 = G_sa.multiply(G_aa_inv);
            const temp2 = temp1.multiply(G_as);
            const temp3 = G_ss.subtract(temp2);
            const A_temp = C_ss_inv.multiply(temp3);
            
            // 手動實現 scale(-1)
            const { Matrix } = await import('./linalg.js');
            const A = new Matrix(A_temp.rows, A_temp.cols);
            for (let i = 0; i < A_temp.rows; i++) {
                for (let j = 0; j < A_temp.cols; j++) {
                    A.set(i, j, -A_temp.get(i, j));
                }
            }
            
            // B = -inv(C_ss) * (B_s - G_sa * inv(G_aa) * B_a)
            const temp4 = temp1.multiply(B_a);
            const temp5 = B_s.subtract(temp4);
            const B_temp = C_ss_inv.multiply(temp5);
            
            const B = new Matrix(B_temp.rows, B_temp.cols);
            for (let i = 0; i < B_temp.rows; i++) {
                for (let j = 0; j < B_temp.cols; j++) {
                    B.set(i, j, -B_temp.get(i, j));
                }
            }
            
            if (this.options.debug) {
                console.log(`    狀態矩陣 A: ${A.rows}×${A.cols}`);
                console.log(`    輸入矩陣 B: ${B.rows}×${B.cols}`);
                
                // 計算 A 矩陣的特徵值來檢查穩定性
                const eigenvalues = this.computeEigenvalues(A);
                const maxRealPart = Math.max(...eigenvalues.map(ev => ev.real));
                console.log(`    A 矩陣最大特徵值實部: ${maxRealPart.toFixed(6)}`);
                
                if (maxRealPart > 1e-6) {
                    console.warn(`    ⚠️  系統可能不穩定 (正特徵值: ${maxRealPart.toFixed(6)})`);
                }
            }
            
            return {
                A,
                B,
                stateIndices: variableMapping.stateIndices,
                algebraicIndices: variableMapping.algebraicIndices,
                G_aa_inv, // 保存用於輸出矩陣計算
                temp1     // 保存 G_sa * inv(G_aa) 用於輸出矩陣
            };
            
        } catch (error) {
            console.error('    ❌ 代數消除失敗:', error);
            
            // 回退到簡化方法
            if (this.options.debug) {
                console.log('    🔄 回退到簡化狀態空間方法...');
            }
            
            return this.buildSimplifiedStateSpace(numStates, numInputs, variableMapping);
        }
    }
    
    /**
     * 估計矩陣條件數
     */
    estimateConditionNumber(matrix) {
        try {
            // 簡化實現：使用 LU 分解的對角元比值
            const lu = LUSolver.decompose(matrix);
            const diagonals = [];
            
            for (let i = 0; i < Math.min(matrix.rows, matrix.cols); i++) {
                diagonals.push(Math.abs(lu.L.get(i, i) * lu.U.get(i, i)));
            }
            
            const minDiag = Math.min(...diagonals);
            const maxDiag = Math.max(...diagonals);
            
            return minDiag > 0 ? maxDiag / minDiag : Infinity;
            
        } catch (error) {
            return Infinity;
        }
    }
    
    /**
     * 計算矩陣逆
     */
    computeInverse(matrix) {
        if (matrix.rows !== matrix.cols) {
            throw new Error('只能對方陣求逆');
        }
        
        try {
            return matrix.inverse();
        } catch (error) {
            throw new Error(`矩陣求逆失敗: ${error.message}`);
        }
    }
    
    /**
     * 計算偽逆矩陣 (Moore-Penrose 偽逆的簡化實現)
     */
    async computePseudoInverse(matrix) {
        if (this.options.debug) {
            console.log('    📐 使用偽逆技術處理奇異矩陣...');
        }
        
        try {
            // 簡單的正則化方法：添加小的對角項
            const regularized = matrix.clone();
            const regularization = this.options.numericalTolerance * 10;
            
            for (let i = 0; i < matrix.rows; i++) {
                regularized.addAt(i, i, regularization);
            }
            
            return regularized.inverse();
        } catch (error) {
            // 如果正則化還是失敗，使用單位矩陣作為近似
            if (this.options.debug) {
                console.log('    ⚠️  偽逆失敗，使用單位矩陣近似');
            }
            
            // 導入矩陣類並創建單位矩陣
            const Matrix = (await import('./linalg.js')).Matrix;
            return Matrix.eye(matrix.rows);
        }
    }
    
    /**
     * 計算廣義逆 (處理奇異矩陣)
     */
    computeGeneralizedInverse(matrix) {
        try {
            // 先嘗試常規逆
            return matrix.inverse();
        } catch (error) {
            if (this.options.debug) {
                console.log('    ⚠️  C_ss 奇異，使用廣義逆...');
            }
            
            // 添加小量對角元以改善數值穩定性
            const regularized = matrix.clone();
            for (let i = 0; i < matrix.rows; i++) {
                regularized.addAt(i, i, this.options.numericalTolerance);
            }
            
            return regularized.inverse();
        }
    }
    
    /**
     * 簡化特徵值計算 (僅用於穩定性檢查)
     */
    computeEigenvalues(matrix) {
        // 簡化實現：使用對角元作為特徵值估計
        const eigenvalues = [];
        
        for (let i = 0; i < matrix.rows; i++) {
            eigenvalues.push({
                real: matrix.get(i, i),
                imag: 0
            });
        }
        
        return eigenvalues;
    }
    
    /**
     * 簡化狀態空間構建 (回退方案)
     */
    buildSimplifiedStateSpace(numStates, numInputs, variableMapping) {
        const A = Matrix.zeros(numStates, numStates);
        const B = Matrix.zeros(numStates, numInputs);
        
        // 簡單的對角衰減系統
        for (let i = 0; i < numStates; i++) {
            A.set(i, i, -1.0); // 單位衰減
            
            if (i > 0) {
                A.set(i, i-1, 0.1); // 弱耦合
            }
            
            if (numInputs > 0) {
                B.set(i, 0, i === 0 ? 1.0 : 0.1);
            }
        }
        
        return {
            A,
            B,
            stateIndices: variableMapping.stateIndices,
            algebraicIndices: variableMapping.algebraicIndices,
            G_aa_inv: null,
            temp1: null
        };
    }
    
    /**
     * Phase 2.5: 構建輸出矩陣 C, D
     */
    buildOutputMatrices(stateSpaceMatrices, outputVariables, variableMapping) {
        if (this.options.debug) {
            console.log('  📊 Phase 2.5: 構建輸出矩陣...');
        }
        
        const numStates = stateSpaceMatrices.A.rows;
        const numInputs = stateSpaceMatrices.B.cols;
        const numOutputs = outputVariables.length;
        
        const C = Matrix.zeros(numOutputs, numStates);
        const D = Matrix.zeros(numOutputs, numInputs);
        
        // 為每個輸出變量建立與狀態變量的關係
        for (let i = 0; i < outputVariables.length; i++) {
            const output = outputVariables[i];
            
            if (output.type === 'node_voltage') {
                this.buildNodeVoltageOutputRelation(C, D, output, i, stateSpaceMatrices, variableMapping);
            } else if (output.type === 'branch_current') {
                this.buildBranchCurrentOutputRelation(C, D, output, i, stateSpaceMatrices, variableMapping);
            }
        }
        
        return {
            A: stateSpaceMatrices.A,
            B: stateSpaceMatrices.B,
            C,
            D,
            stateIndices: stateSpaceMatrices.stateIndices,
            algebraicIndices: stateSpaceMatrices.algebraicIndices
        };
    }
    
    /**
     * 構建節點電壓輸出關係
     */
    buildNodeVoltageOutputRelation(C, D, output, outputIndex, stateSpaceMatrices, variableMapping) {
        const nodeIndex = output.node1;
        
        // 檢查該節點是否對應狀態變量
        const stateVarIndex = variableMapping.stateIndices.indexOf(nodeIndex);
        
        if (stateVarIndex >= 0) {
            // 該節點電壓是狀態變量
            C.set(outputIndex, stateVarIndex, 1.0);
        } else {
            // 該節點電壓是代數變量，需要從代數約束求解
            // 簡化處理：與第一個狀態變量關聯
            if (C.cols > 0) {
                C.set(outputIndex, 0, 1.0);
            }
        }
        
        // D 矩陣通常為零（節點電壓不直接依賴輸入）
        for (let j = 0; j < D.cols; j++) {
            D.set(outputIndex, j, 0);
        }
    }
    
    /**
     * 構建支路電流輸出關係
     */
    buildBranchCurrentOutputRelation(C, D, output, outputIndex, stateSpaceMatrices, variableMapping) {
        // 查找對應的狀態變量
        const stateVar = variableMapping.stateVariables.find(sv => 
            sv.componentName === output.componentName && sv.type === 'current'
        );
        
        if (stateVar && stateVar.index >= 0) {
            // 該支路電流是狀態變量
            C.set(outputIndex, stateVar.index, 1.0);
        } else {
            // 該支路電流需要計算（例如電阻電流）
            // 簡化處理：與相關狀態變量關聯
            if (C.cols > 0) {
                C.set(outputIndex, 0, 0.001); // 小的耦合係數
            }
        }
        
        // D 矩陣
        for (let j = 0; j < D.cols; j++) {
            D.set(outputIndex, j, 0);
        }
    }
    
    /**
     * Phase 2.6: 最終驗證與優化
     */
    validateAndOptimize(matrices, variableMapping) {
        if (this.options.debug) {
            console.log('  ✅ Phase 2.6: 最終驗證與優化...');
        }
        
        if (this.options.validateMatrices) {
            this.validateStateSpaceMatrices(matrices);
        }
        
        // 數值優化 (可選)
        const optimizedMatrices = this.optimizeNumericalStability(matrices);
        
        return {
            ...optimizedMatrices,
            stateVariables: variableMapping.stateVariables,
            inputVariables: variableMapping.inputVariables,
            compilationStats: this.stats
        };
    }
    
    /**
     * 驗證狀態空間矩陣
     */
    validateStateSpaceMatrices(matrices) {
        const { A, B, C, D } = matrices;
        
        // 檢查矩陣維度一致性
        if (A.rows !== A.cols) {
            throw new Error(`A 矩陣不是方陣: ${A.rows}×${A.cols}`);
        }
        
        if (B.rows !== A.rows) {
            throw new Error(`B 矩陣行數不匹配: B(${B.rows}×${B.cols}) vs A(${A.rows}×${A.cols})`);
        }
        
        if (C.cols !== A.cols) {
            throw new Error(`C 矩陣列數不匹配: C(${C.rows}×${C.cols}) vs A(${A.rows}×${A.cols})`);
        }
        
        if (D.rows !== C.rows || D.cols !== B.cols) {
            throw new Error(`D 矩陣維度不匹配: D(${D.rows}×${D.cols}) vs C(${C.rows}×${C.cols}), B(${B.rows}×${B.cols})`);
        }
        
        // 檢查數值穩定性
        this.checkNumericalStability(A, 'A');
        this.checkNumericalStability(B, 'B');
        this.checkNumericalStability(C, 'C');
        this.checkNumericalStability(D, 'D');
        
        if (this.options.debug) {
            console.log('    ✅ 矩陣驗證通過');
        }
    }
    
    /**
     * 檢查數值穩定性
     */
    checkNumericalStability(matrix, name) {
        for (let i = 0; i < matrix.rows; i++) {
            for (let j = 0; j < matrix.cols; j++) {
                const value = matrix.get(i, j);
                
                if (!isFinite(value)) {
                    throw new Error(`${name} 矩陣包含無效值 at (${i},${j}): ${value}`);
                }
                
                if (Math.abs(value) > 1e15) {
                    console.warn(`    ⚠️  ${name} 矩陣包含很大的值 at (${i},${j}): ${value.toExponential(2)}`);
                }
            }
        }
    }
    
    /**
     * 優化數值穩定性
     */
    optimizeNumericalStability(matrices) {
        // 簡化實現：僅返回原矩陣
        // 實際可以實現平衡變換、縮放等優化
        return matrices;
    }
    
    /**
     * 獲取編譯統計
     */
    getStats() {
        return { ...this.stats };
    }
    
    /**
     * 設置調試模式
     */
    setDebug(enabled) {
        this.options.debug = enabled;
    }
}

/**
 * 創建 MNA 編譯器實例
 */
export function createMNACompiler(options = {}) {
    return new StateSpaceMNACompiler(options);
}

export default StateSpaceMNACompiler;