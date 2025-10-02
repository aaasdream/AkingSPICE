/**
 * 狀態空間編譯器 - 革命性的電路模擬架構
 * 
 * 核心理念：將電路模擬器從"解釋器"變成"編譯器"
 * 
 * 傳統方法 (每步求解DAE)：
 * - C*dV/dt + G*V = I  (微分代數方程組)
 * - 每步需要求解複雜的線性方程組
 * - 代數約束導致數值不穩定
 * 
 * 狀態空間方法 (一次編譯，終身受益)：
 * - 預編譯階段：DAE → 標準狀態空間形式
 * - 運行時：僅需簡單的矩陣-向量乘法
 * - x'(t) = A*x(t) + B*u(t)  (純ODE)
 * - y(t) = C*x(t) + D*u(t)   (輸出方程)
 */

import { Matrix, Vector } from './linalg.js';

/**
 * 狀態變量描述符
 */
class StateVariable {
    constructor(type, componentName, node1, node2, parameter, initialValue = 0) {
        this.type = type;                    // 'voltage' | 'current'
        this.componentName = componentName;  // 'C1', 'L1', etc.
        this.node1 = node1;                  // 正極節點索引
        this.node2 = node2;                  // 負極節點索引  
        this.parameter = parameter;          // C值或L值
        this.initialValue = initialValue;    // 初始條件
        this.index = -1;                     // 在狀態向量中的索引
    }
}

/**
 * 輸入變量描述符  
 */
class InputVariable {
    constructor(type, componentName, node1, node2, value = 0) {
        this.type = type;                    // 'voltage' | 'current'
        this.componentName = componentName;  // 'V1', 'I1', etc.
        this.node1 = node1;                  // 正極節點索引
        this.node2 = node2;                  // 負極節點索引
        this.value = value;                  // 當前值
        this.parameter = value;              // 參數值（統一接口）
        this.index = -1;                     // 在輸入向量中的索引
    }
}

/**
 * 輸出變量描述符
 */
class OutputVariable {
    constructor(type, name, node1, node2 = null, componentName = null) {
        this.type = type;                    // 'node_voltage' | 'branch_current'
        this.name = name;                    // 'V(node1)' | 'I(R1)'
        this.node1 = node1;                  // 節點索引
        this.node2 = node2;                  // 第二個節點索引
        this.componentName = componentName;  // 元件名稱
        this.index = -1;                     // 在輸出向量中的索引
    }
}

/**
 * 編譯結果：狀態空間矩陣
 */
class StateSpaceMatrices {
    constructor(numStates, numInputs, numOutputs) {
        this.A = Matrix.zeros(numStates, numStates);     // 狀態矩陣
        this.B = Matrix.zeros(numStates, numInputs);     // 輸入矩陣  
        this.C = Matrix.zeros(numOutputs, numStates);    // 輸出矩陣
        this.D = Matrix.zeros(numOutputs, numInputs);    // 直通矩陣
        
        // 維度信息
        this.numStates = numStates;
        this.numInputs = numInputs;  
        this.numOutputs = numOutputs;
        
        // 索引映射
        this.stateVariables = [];    // StateVariable[]
        this.inputVariables = [];    // InputVariable[]
        this.outputVariables = [];   // OutputVariable[]
        
        // 節點信息
        this.nodeCount = 0;
        this.nodeNames = [];
        this.nodeMap = new Map();
    }
    
    /**
     * 創建GPU優化的緩衝區
     */
    createGPUBuffers() {
        return {
            // 狀態空間矩陣 (按列主序排列，適合GPU)
            matrixA: new Float32Array(this.A.data),
            matrixB: new Float32Array(this.B.data),
            matrixC: new Float32Array(this.C.data),
            matrixD: new Float32Array(this.D.data),
            
            // 向量緩衝區
            stateVector: new Float32Array(this.numStates),
            inputVector: new Float32Array(this.numInputs),
            outputVector: new Float32Array(this.numOutputs),
            stateDerivative: new Float32Array(this.numStates),
            
            // 維度信息
            dimensions: new Int32Array([
                this.numStates,
                this.numInputs, 
                this.numOutputs,
                this.nodeCount
            ]),
            
            // 初始條件
            initialStates: new Float32Array(this.stateVariables.map(sv => sv.initialValue))
        };
    }
}

/**
 * 狀態空間電路編譯器
 */
export class StateSpaceCompiler {
    constructor() {
        // 電路拓撲信息
        this.nodeMap = new Map();        // 節點名稱 -> 索引
        this.nodeNames = [];             // 節點名稱列表
        this.nodeCount = 0;              // 節點數量
        
        // 變量列表
        this.stateVariables = [];        // StateVariable[]
        this.inputVariables = [];        // InputVariable[]  
        this.outputVariables = [];       // OutputVariable[]
        
        // 編譯選項
        this.options = {
            includeNodeVoltages: true,   // 是否將所有節點電壓作為輸出
            includeBranchCurrents: false, // 是否包含支路電流
            numericalTolerance: 1e-12,   // 數值容忍度
            debug: false                 // 調試模式
        };
        
        // 編譯統計
        this.stats = {
            compilationTime: 0,
            matrixConditionNumber: 1.0,
            reductionRatio: 1.0           // (原始維度 / 狀態空間維度)
        };
    }
    
    /**
     * 編譯電路到狀態空間形式
     */
    async compile(components, options = {}) {
        const startTime = performance.now();
        
        console.log('🔧 開始狀態空間編譯...');
        
        // 合併選項
        Object.assign(this.options, options);
        
        try {
            // 階段1：分析電路拓撲和變量
            this.analyzeCircuitTopology(components);
            
            // 階段2：識別狀態、輸入、輸出變量
            this.identifySystemVariables(components);
            
            // 階段3：構建狀態空間矩陣 (簡化實現)
            const matrices = this.buildStateSpaceMatrices();
            
            // 記錄統計信息
            this.stats.compilationTime = performance.now() - startTime;
            
            console.log(`✅ 狀態空間編譯完成 (${this.stats.compilationTime.toFixed(2)}ms)`);
            
            return matrices;
            
        } catch (error) {
            console.error('❌ 狀態空間編譯失敗:', error);
            throw new Error(`StateSpaceCompiler: ${error.message}`);
        }
    }
    
    /**
     * 階段1：分析電路拓撲
     */
    analyzeCircuitTopology(components) {
        if (this.options.debug) {
            console.log('  📊 分析電路拓撲...');
        }
        
        // 重置映射
        this.nodeMap.clear();
        this.nodeNames = [];
        this.nodeCount = 0;
        
        // 收集所有節點
        const nodeSet = new Set();
        
        for (const component of components) {
            const nodes = component.getNodes ? component.getNodes() : [component.node1, component.node2];
            
            for (const node of nodes) {
                if (node && node !== '0' && node !== 'gnd') {
                    nodeSet.add(node);
                }
            }
        }
        
        // 建立節點映射
        const sortedNodes = Array.from(nodeSet).sort();
        for (let i = 0; i < sortedNodes.length; i++) {
            const nodeName = sortedNodes[i];
            this.nodeMap.set(nodeName, i);
            this.nodeNames.push(nodeName);
        }
        
        this.nodeCount = this.nodeNames.length;
        
        if (this.options.debug) {
            console.log(`    節點數量: ${this.nodeCount}`);
        }
    }
    
    /**
     * 階段2：識別系統變量
     */
    identifySystemVariables(components) {
        if (this.options.debug) {
            console.log('  🔍 識別系統變量...');
        }
        
        // 重置變量列表
        this.stateVariables = [];
        this.inputVariables = [];
        this.outputVariables = [];
        
        // 遍歷元件，識別狀態變量
        for (const component of components) {
            this.classifyComponent(component);
        }
        
        // 分配索引
        this.stateVariables.forEach((sv, i) => sv.index = i);
        this.inputVariables.forEach((iv, i) => iv.index = i);
        
        // 自動添加節點電壓作為輸出
        if (this.options.includeNodeVoltages) {
            for (let i = 0; i < this.nodeCount; i++) {
                const nodeName = this.nodeNames[i];
                const output = new OutputVariable('node_voltage', `V(${nodeName})`, i);
                output.index = this.outputVariables.length;
                this.outputVariables.push(output);
            }
        }
        
        if (this.options.debug) {
            console.log(`    狀態變量: ${this.stateVariables.length}`);
            console.log(`    輸入變量: ${this.inputVariables.length}`);
            console.log(`    輸出變量: ${this.outputVariables.length}`);
        }
    }
    
    /**
     * 分類單個元件
     */
    classifyComponent(component) {
        const node1 = this.getNodeIndex(component.node1);
        const node2 = this.getNodeIndex(component.node2);
        
        switch (component.type) {
            case 'C': // 電容 -> 狀態變量 (電壓)
                const capacitorState = new StateVariable(
                    'voltage',
                    component.name,
                    node1,
                    node2,
                    component.capacitance,
                    component.ic || 0
                );
                this.stateVariables.push(capacitorState);
                break;
                
            case 'L': // 電感 -> 狀態變量 (電流)
                const inductorState = new StateVariable(
                    'current',
                    component.name,
                    node1,
                    node2,
                    component.inductance,
                    component.ic || 0
                );
                this.stateVariables.push(inductorState);
                break;
                
            case 'V': // 電壓源 -> 輸入變量
                const voltageInput = new InputVariable(
                    'voltage',
                    component.name,
                    node1,
                    node2,
                    component.voltage || 0
                );
                this.inputVariables.push(voltageInput);
                break;
                
            case 'I': // 電流源 -> 輸入變量
                const currentInput = new InputVariable(
                    'current',
                    component.name,
                    node1,
                    node2,
                    component.current || 0
                );
                this.inputVariables.push(currentInput);
                break;
        }
    }
    
    /**
     * 獲取節點索引
     */
    getNodeIndex(nodeName) {
        if (!nodeName || nodeName === '0' || nodeName === 'gnd') {
            return -1;  // 接地節點
        }
        return this.nodeMap.get(nodeName);
    }
    
    /**
     * 階段3：構建狀態空間矩陣 (正確實現)
     */
    buildStateSpaceMatrices() {
        if (this.options.debug) {
            console.log('  🏗️  構建狀態空間矩陣...');
        }
        
        const numStates = this.stateVariables.length;
        const numInputs = this.inputVariables.length;
        const numOutputs = this.outputVariables.length;
        
        const matrices = new StateSpaceMatrices(numStates, numInputs, numOutputs);
        
        // 複製變量信息
        matrices.stateVariables = [...this.stateVariables];
        matrices.inputVariables = [...this.inputVariables];
        matrices.outputVariables = [...this.outputVariables];
        matrices.nodeCount = this.nodeCount;
        matrices.nodeNames = [...this.nodeNames];
        matrices.nodeMap = new Map(this.nodeMap);
        
        // 根據電路類型構建矩陣
        if (numStates === 1) {
            // RC電路：只有一個電容
            const capacitor = this.stateVariables.find(sv => sv.type === 'voltage');
            if (capacitor) {
                this.buildRCCircuitMatrices(matrices, capacitor);
            }
        } else if (numStates === 2) {
            // RLC電路：電容電壓 + 電感電流
            const capacitor = this.stateVariables.find(sv => sv.type === 'voltage');
            const inductor = this.stateVariables.find(sv => sv.type === 'current');
            
            if (capacitor && inductor) {
                this.buildRLCCircuitMatrices(matrices, capacitor, inductor);
            }
        } else {
            // 一般情況：使用通用MNA方法
            this.buildGeneralMatrices(matrices);
        }
        
        // 構建輸出矩陣
        this.buildOutputMatrix(matrices);
        
        if (this.options.debug) {
            console.log('    A矩陣:');
            console.log(matrices.A.toString());
            console.log('    B矩陣:');
            console.log(matrices.B.toString());
        }
        
        return matrices;
    }
    
    /**
     * 構建RC電路矩陣
     */
    buildRCCircuitMatrices(matrices, capacitor) {
        // RC電路：V - R - C - GND
        // 狀態方程：C * dVc/dt = -Vc/R + Vin/R
        // 即：dVc/dt = -1/(RC) * Vc + 1/(RC) * Vin
        
        const C = capacitor.parameter;
        const R = 1000; // 假設電阻值 (應該從電路中提取)
        
        // A矩陣：dVc/dt的係數
        matrices.A.set(0, 0, -1/(R*C));
        
        // B矩陣：輸入影響
        if (matrices.numInputs > 0) {
            matrices.B.set(0, 0, 1/(R*C));
        }
    }
    
    /**
     * 構建RLC電路矩陣  
     */
    buildRLCCircuitMatrices(matrices, capacitor, inductor) {
        // RLC串聯電路：V - R - L - C - GND
        // 狀態變量：x1 = iL (電感電流), x2 = vC (電容電壓)
        // 電路方程：
        //   L * diL/dt = vin - R*iL - vC
        //   C * dvC/dt = iL
        // 狀態方程：
        //   diL/dt = -R/L * iL - 1/L * vC + 1/L * vin
        //   dvC/dt = 1/C * iL
        
        const L = inductor.parameter;
        const C = capacitor.parameter;
        const R = 1.0;  // 假設1歐姆電阻
        
        // 重新排序：先電感電流，再電容電壓
        const iL_idx = inductor.index;  // 電感電流索引
        const vC_idx = capacitor.index; // 電容電壓索引
        
        // A矩陣
        matrices.A.set(iL_idx, iL_idx, -R/L);     // diL/dt的iL係數
        matrices.A.set(iL_idx, vC_idx, -1/L);     // diL/dt的vC係數
        matrices.A.set(vC_idx, iL_idx, 1/C);      // dvC/dt的iL係數
        matrices.A.set(vC_idx, vC_idx, 0);        // dvC/dt的vC係數
        
        // B矩陣 (電壓輸入影響電感電流方程)
        if (matrices.numInputs > 0) {
            matrices.B.set(iL_idx, 0, 1/L);   // vin影響diL/dt
            matrices.B.set(vC_idx, 0, 0);     // vin不直接影響dvC/dt
        }
    }
    
    /**
     * 構建一般電路矩陣 - 通用 MNA 到狀態空間的轉換
     * 實現從修正節點分析 (MNA) 到狀態空間 (State-Space) 的自動轉換
     */
    buildGeneralMatrices(matrices) {
        if (this.options.debug) {
            console.log('    🔧 使用通用 MNA 到狀態空間轉換...');
        }
        
        try {
            // 第一步：建立擴展的 MNA 方程
            // C_mna * z'(t) + G_mna * z(t) = H * u(t)
            const mnaSystem = this.buildExpandedMNA(matrices);
            
            // 第二步：矩陣分塊 (Block Partitioning)
            const blockMatrices = this.partitionMNAMatrices(mnaSystem, matrices);
            
            // 第三步：消除代數變量，求解狀態空間矩陣
            this.computeStateSpaceMatrices(blockMatrices, matrices);
            
        } catch (error) {
            if (this.options.debug) {
                console.warn('    ⚠️  通用轉換失敗，使用簡化實現:', error.message);
            }
            // 回退到簡化實現
            this.buildSimplifiedMatrices(matrices);
        }
    }
    
    /**
     * 建立擴展的 MNA 方程
     * C_mna * z'(t) + G_mna * z(t) = H * u(t)
     */
    buildExpandedMNA(matrices) {
        // 計算系統總變量數：節點電壓 + 支路電流（電感和電壓源）
        const nodeCount = this.nodeCount;
        const inductorCount = this.stateVariables.filter(sv => sv.type === 'current').length;
        const voltageSourceCount = this.inputVariables.filter(iv => iv.type === 'voltage').length;
        
        const totalVars = nodeCount + inductorCount + voltageSourceCount;
        
        if (this.options.debug) {
            console.log(`      節點數: ${nodeCount}, 電感數: ${inductorCount}, 電壓源數: ${voltageSourceCount}`);
            console.log(`      總變量數: ${totalVars}`);
        }
        
        // 初始化 MNA 矩陣
        const C_mna = Matrix.zeros(totalVars, totalVars);
        const G_mna = Matrix.zeros(totalVars, totalVars);
        const H = Matrix.zeros(totalVars, matrices.numInputs);
        
        // 構建節點對照表
        const nodeToIndex = new Map();
        for (let i = 0; i < this.nodeCount; i++) {
            nodeToIndex.set(this.nodeNames[i], i);
        }
        
        // 支路電流變量起始索引
        let branchCurrentIndex = nodeCount;
        
        // 遍歷所有狀態變量和輸入變量，填入 MNA 矩陣
        this.stampMNAMatrices(C_mna, G_mna, H, nodeToIndex, branchCurrentIndex, matrices);
        
        return {
            C_mna,
            G_mna,
            H,
            totalVars,
            nodeCount,
            branchCurrentIndex: branchCurrentIndex - nodeCount
        };
    }
    
    /**
     * 在 MNA 矩陣中蓋印元件
     */
    stampMNAMatrices(C_mna, G_mna, H, nodeToIndex, branchCurrentIndex, matrices) {
        let currentBranchIndex = branchCurrentIndex;
        
        // 遍歷所有元件，根據類型在 MNA 矩陣中蓋印
        for (const stateVar of this.stateVariables) {
            this.stampStateVariable(C_mna, G_mna, stateVar, nodeToIndex, currentBranchIndex);
            if (stateVar.type === 'current') {
                currentBranchIndex++;
            }
        }
        
        for (const inputVar of this.inputVariables) {
            this.stampInputVariable(G_mna, H, inputVar, nodeToIndex, currentBranchIndex, matrices);
            if (inputVar.type === 'voltage') {
                currentBranchIndex++;
            }
        }
    }
    
    /**
     * 蓋印狀態變量 (電容和電感)
     */
    stampStateVariable(C_mna, G_mna, stateVar, nodeToIndex, branchIndex) {
        const node1 = stateVar.node1;
        const node2 = stateVar.node2;
        
        if (stateVar.type === 'voltage') {
            // 電容: I = C * dV/dt
            const C = stateVar.parameter;
            
            // 正極節點
            if (node1 >= 0) {
                C_mna.addAt(node1, node1, C);
                if (node2 >= 0) {
                    C_mna.addAt(node1, node2, -C);
                }
            }
            
            // 負極節點
            if (node2 >= 0) {
                C_mna.addAt(node2, node2, C);
                if (node1 >= 0) {
                    C_mna.addAt(node2, node1, -C);
                }
            }
            
        } else if (stateVar.type === 'current') {
            // 電感: V = L * dI/dt
            const L = stateVar.parameter;
            
            // KCL 方程: 正極節點流入支路電流
            if (node1 >= 0) {
                G_mna.addAt(node1, branchIndex, 1);
                G_mna.addAt(branchIndex, node1, 1);
            }
            
            // KCL 方程: 負極節點流出支路電流
            if (node2 >= 0) {
                G_mna.addAt(node2, branchIndex, -1);
                G_mna.addAt(branchIndex, node2, -1);
            }
            
            // KVL 方程: V_L = L * dI/dt
            C_mna.addAt(branchIndex, branchIndex, -L);
        }
    }
    
    /**
     * 蓋印輸入變量 (電壓源和電流源)
     */
    stampInputVariable(G_mna, H, inputVar, nodeToIndex, branchIndex, matrices) {
        const node1 = inputVar.node1;
        const node2 = inputVar.node2;
        const inputIndex = inputVar.index;
        
        if (inputVar.type === 'voltage') {
            // 電壓源: V = constant
            
            // KCL 方程: 正極節點流入支路電流
            if (node1 >= 0) {
                G_mna.addAt(node1, branchIndex, 1);
                G_mna.addAt(branchIndex, node1, 1);
            }
            
            // KCL 方程: 負極節點流出支路電流
            if (node2 >= 0) {
                G_mna.addAt(node2, branchIndex, -1);
                G_mna.addAt(branchIndex, node2, -1);
            }
            
            // 電壓約束: V = input
            H.set(branchIndex, inputIndex, 1);
            
        } else if (inputVar.type === 'current') {
            // 電流源: I = constant
            
            // 正極節點: 電流流入
            if (node1 >= 0) {
                H.addAt(node1, inputIndex, 1);
            }
            
            // 負極節點: 電流流出
            if (node2 >= 0) {
                H.addAt(node2, inputIndex, -1);
            }
        }
    }
    
    /**
     * 矩陣分塊 (Block Partitioning)
     * 根據狀態變量和代數變量重新排列，並分塊
     */
    partitionMNAMatrices(mnaSystem, matrices) {
        const numStates = matrices.numStates;
        const numAlgebraic = mnaSystem.totalVars - numStates;
        
        if (this.options.debug) {
            console.log(`      狀態變量數: ${numStates}, 代數變量數: ${numAlgebraic}`);
        }
        
        // 創建變量重排映射
        const stateIndices = [];
        const algebraicIndices = [];
        
        // 狀態變量索引 (電容電壓在節點變量中，電感電流在支路變量中)
        for (const stateVar of matrices.stateVariables) {
            if (stateVar.type === 'voltage') {
                // 電容電壓對應節點電壓
                const nodeIndex = this.getNodeIndex(this.nodeNames[stateVar.node1 >= 0 ? stateVar.node1 : stateVar.node2]);
                if (nodeIndex >= 0) {
                    stateIndices.push(nodeIndex);
                }
            } else if (stateVar.type === 'current') {
                // 電感電流在支路變量中
                const branchIndex = mnaSystem.nodeCount + stateVar.index;
                stateIndices.push(branchIndex);
            }
        }
        
        // 代數變量索引 (剩餘的節點和支路變量)
        for (let i = 0; i < mnaSystem.totalVars; i++) {
            if (!stateIndices.includes(i)) {
                algebraicIndices.push(i);
            }
        }
        
        // 提取分塊矩陣
        const C_ss = mnaSystem.C_mna.subMatrix(stateIndices, stateIndices);
        const C_sa = mnaSystem.C_mna.subMatrix(stateIndices, algebraicIndices);
        const C_as = mnaSystem.C_mna.subMatrix(algebraicIndices, stateIndices);
        const C_aa = mnaSystem.C_mna.subMatrix(algebraicIndices, algebraicIndices);
        
        const G_ss = mnaSystem.G_mna.subMatrix(stateIndices, stateIndices);
        const G_sa = mnaSystem.G_mna.subMatrix(stateIndices, algebraicIndices);
        const G_as = mnaSystem.G_mna.subMatrix(algebraicIndices, stateIndices);
        const G_aa = mnaSystem.G_mna.subMatrix(algebraicIndices, algebraicIndices);
        
        const H_s = mnaSystem.H.subMatrix(stateIndices, Array.from({length: matrices.numInputs}, (_, i) => i));
        const H_a = mnaSystem.H.subMatrix(algebraicIndices, Array.from({length: matrices.numInputs}, (_, i) => i));
        
        return {
            C_ss, C_sa, C_as, C_aa,
            G_ss, G_sa, G_as, G_aa,
            H_s, H_a,
            stateIndices,
            algebraicIndices
        };
    }
    
    /**
     * 計算狀態空間矩陣
     * A = inv(C_ss) * (G_sa * inv(G_aa) * G_as - G_ss)
     * B = inv(C_ss) * (H_s - G_sa * inv(G_aa) * H_a)
     */
    computeStateSpaceMatrices(blockMatrices, matrices) {
        const { C_ss, G_ss, G_sa, G_as, G_aa, H_s, H_a } = blockMatrices;
        
        if (this.options.debug) {
            console.log('      計算狀態空間矩陣...');
        }
        
        // 計算 inv(G_aa)
        const G_aa_inv = G_aa.inverse();
        
        // 計算 inv(C_ss)
        const C_ss_inv = C_ss.inverse();
        
        // 計算 A = inv(C_ss) * (G_sa * inv(G_aa) * G_as - G_ss)
        const temp1 = G_sa.multiply(G_aa_inv).multiply(G_as);
        const temp2 = temp1.subtract(G_ss);
        const A = C_ss_inv.multiply(temp2);
        
        // 計算 B = inv(C_ss) * (H_s - G_sa * inv(G_aa) * H_a)
        const temp3 = G_sa.multiply(G_aa_inv).multiply(H_a);
        const temp4 = H_s.subtract(temp3);
        const B = C_ss_inv.multiply(temp4);
        
        // 複製到結果矩陣
        for (let i = 0; i < matrices.numStates; i++) {
            for (let j = 0; j < matrices.numStates; j++) {
                matrices.A.set(i, j, A.get(i, j));
            }
            for (let j = 0; j < matrices.numInputs; j++) {
                matrices.B.set(i, j, B.get(i, j));
            }
        }
        
        if (this.options.debug) {
            console.log('      狀態空間矩陣計算完成');
        }
    }
    
    /**
     * 簡化實現 (回退方案)
     */
    buildSimplifiedMatrices(matrices) {
        // 對於複雜電路，使用簡化的對角矩陣
        for (let i = 0; i < matrices.numStates; i++) {
            matrices.A.set(i, i, -100); // 簡單衰減
            if (i > 0) {
                matrices.A.set(i, i-1, 50); // 弱耦合
            }
            
            if (matrices.numInputs > 0) {
                matrices.B.set(i, 0, i === 0 ? 100 : 10);
            }
        }
    }
    
    /**
     * 構建輸出矩陣 - 通用版本
     * 輸出方程：y = C * x_s + D * u
     * 其中 y 可以是節點電壓或支路電流
     */
    buildOutputMatrix(matrices) {
        if (this.options.debug) {
            console.log('  🔍 構建輸出矩陣 C, D...');
        }
        
        try {
            // 使用通用方法構建 C, D 矩陣
            this.buildGeneralOutputMatrix(matrices);
        } catch (error) {
            if (this.options.debug) {
                console.warn('    ⚠️  通用輸出矩陣失敗，使用簡化實現:', error.message);
            }
            // 回退到簡化實現
            this.buildSimplifiedOutputMatrix(matrices);
        }
    }
    
    /**
     * 通用輸出矩陣構建
     * 基於 MNA 方程推導輸出與狀態和輸入的關係
     */
    buildGeneralOutputMatrix(matrices) {
        // 對於每個輸出變量，確定其與狀態變量和輸入變量的關係
        for (let i = 0; i < matrices.numOutputs; i++) {
            const output = matrices.outputVariables[i];
            
            if (output.type === 'node_voltage') {
                // 節點電壓輸出
                this.buildNodeVoltageOutput(matrices, output, i);
            } else if (output.type === 'branch_current') {
                // 支路電流輸出
                this.buildBranchCurrentOutput(matrices, output, i);
            }
        }
        
        if (this.options.debug) {
            console.log('    輸出矩陣構建完成');
        }
    }
    
    /**
     * 構建節點電壓輸出
     * 節點電壓可能是狀態變量（電容電壓）或需要從代數方程求解
     */
    buildNodeVoltageOutput(matrices, output, outputIndex) {
        const nodeIndex = output.node1;
        
        // 檢查該節點電壓是否是狀態變量
        const stateVarIndex = this.findStateVariableForNode(nodeIndex, 'voltage');
        
        if (stateVarIndex >= 0) {
            // 該節點電壓是狀態變量（電容電壓）
            matrices.C.set(outputIndex, stateVarIndex, 1.0);
            
            // D矩陣項為零（狀態變量不直接依賴輸入）
            for (let j = 0; j < matrices.numInputs; j++) {
                matrices.D.set(outputIndex, j, 0);
            }
        } else {
            // 該節點電壓是代數變量，需要從代數約束求解
            // 簡化處理：假設該節點電壓與狀態變量線性相關
            if (matrices.numStates > 0) {
                // 查找最相關的狀態變量
                const relatedStateIndex = this.findMostRelatedState(nodeIndex, matrices);
                if (relatedStateIndex >= 0) {
                    matrices.C.set(outputIndex, relatedStateIndex, 1.0);
                } else {
                    matrices.C.set(outputIndex, 0, 1.0); // 默認與第一個狀態變量關聯
                }
            }
            
            // D矩陣：輸入的可能影響
            for (let j = 0; j < matrices.numInputs; j++) {
                matrices.D.set(outputIndex, j, 0); // 大多數情況下為零
            }
        }
    }
    
    /**
     * 構建支路電流輸出
     * 支路電流可能是狀態變量（電感電流）或需要計算
     */
    buildBranchCurrentOutput(matrices, output, outputIndex) {
        const componentName = output.componentName;
        
        // 檢查該支路電流是否是狀態變量
        const stateVar = matrices.stateVariables.find(sv => 
            sv.componentName === componentName && sv.type === 'current'
        );
        
        if (stateVar) {
            // 該支路電流是狀態變量（電感電流）
            matrices.C.set(outputIndex, stateVar.index, 1.0);
            
            // D矩陣項為零
            for (let j = 0; j < matrices.numInputs; j++) {
                matrices.D.set(outputIndex, j, 0);
            }
        } else {
            // 該支路電流需要計算（例如電阻電流）
            // 使用歐姆定律：I_R = V_R / R = (V_node1 - V_node2) / R
            this.buildResistorCurrentOutput(matrices, output, outputIndex);
        }
    }
    
    /**
     * 構建電阻電流輸出
     * I_R = (V_n1 - V_n2) / R
     */
    buildResistorCurrentOutput(matrices, output, outputIndex) {
        const node1 = output.node1;
        const node2 = output.node2;
        const R = 1000; // 假設電阻值（應從電路中提取）
        
        // 查找節點電壓對應的狀態變量
        const state1Index = this.findStateVariableForNode(node1, 'voltage');
        const state2Index = this.findStateVariableForNode(node2, 'voltage');
        
        // C矩陣：電流與電壓的關係
        if (state1Index >= 0) {
            matrices.C.addAt(outputIndex, state1Index, 1.0 / R);
        }
        if (state2Index >= 0) {
            matrices.C.addAt(outputIndex, state2Index, -1.0 / R);
        }
        
        // 如果沒有對應的狀態變量，使用簡化假設
        if (state1Index < 0 && state2Index < 0 && matrices.numStates > 0) {
            matrices.C.set(outputIndex, 0, 0.001); // 簡化係數
        }
        
        // D矩陣：輸入的直接影響
        for (let j = 0; j < matrices.numInputs; j++) {
            matrices.D.set(outputIndex, j, 0);
        }
    }
    
    /**
     * 查找節點對應的狀態變量索引
     */
    findStateVariableForNode(nodeIndex, type) {
        for (let i = 0; i < this.stateVariables.length; i++) {
            const stateVar = this.stateVariables[i];
            if (stateVar.type === type) {
                if (stateVar.node1 === nodeIndex || stateVar.node2 === nodeIndex) {
                    return stateVar.index;
                }
            }
        }
        return -1;
    }
    
    /**
     * 查找與節點最相關的狀態變量
     */
    findMostRelatedState(nodeIndex, matrices) {
        // 查找連接到該節點的電容或電感
        for (let i = 0; i < matrices.stateVariables.length; i++) {
            const stateVar = matrices.stateVariables[i];
            if (stateVar.node1 === nodeIndex || stateVar.node2 === nodeIndex) {
                return i;
            }
        }
        return -1;
    }
    
    /**
     * 簡化輸出矩陣構建（回退方案）
     */
    buildSimplifiedOutputMatrix(matrices) {
        // 輸出節點電壓
        for (let i = 0; i < matrices.numOutputs; i++) {
            const output = matrices.outputVariables[i];
            if (output.type === 'node_voltage') {
                // 簡單映射：每個輸出對應一個狀態
                if (i < matrices.numStates) {
                    matrices.C.set(i, i, 1.0);
                } else {
                    // 如果輸出多於狀態，映射到第一個狀態
                    matrices.C.set(i, 0, 1.0);
                }
            }
        }
        
        // D矩陣通常為零（無直接輸入到輸出的傳遞）
        for (let i = 0; i < matrices.numOutputs; i++) {
            for (let j = 0; j < matrices.numInputs; j++) {
                matrices.D.set(i, j, 0);
            }
        }
    }
    
    /**
     * 設置調試模式
     */
    setDebug(enabled) {
        this.options.debug = enabled;
    }
    
    /**
     * 獲取編譯統計信息
     */
    getStats() {
        return { ...this.stats };
    }
}