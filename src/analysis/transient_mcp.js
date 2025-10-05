/**
 * 混合互補問題 (MCP) 瞬態分析器
 * 
 * 這是電力電子仿真的革命性方法，通过在每个时间步求解 LCP 来精确处理开关不连续性。
 * 與傳統方法相比，MCP 方法：
 * 
 * 1. 數學嚴格性：不使用平滑近似，直接描述開關的離散特性
 * 2. 數值穩健性：消除了傳統PWL模型的振盪和收斂問題  
 * 3. 物理一致性：確保互補條件在任何情況下都嚴格滿足
 * 
 * 核心思想：
 * 在每個時間步 t_n，求解混合系統：
 * - 線性MNA系統：A*x = B*z + b  (KCL + 線性元件)
 * - LCP約束：w = C*x + D*z + q, w ≥ 0, z ≥ 0, w'*z = 0  (開關元件)
 * 
 * 通过舒爾補化簡為標準LCP：w = M*z + q'，再用Lemke算法求解
 */

import { Matrix, Vector, LUSolver } from '../core/linalg.js';
import { MNABuilder } from '../core/mna.js';
import { LCPSolver, createLCPSolver } from '../core/mcp_solver.js';
import { MOSFET_MCP } from '../components/mosfet_mcp.js'; // 🔥 新增：用於自適應步長的事件檢測
// 创建一个简单的 TransientResult 类作为临时解决方案
export class TransientResult {
    constructor() {
        this.timeVector = [];
        this.voltageMatrix = {};
        this.currentMatrix = {};
        this.analysisInfo = {};
        this.dcOperatingPoint = null;
    }

    addTimePoint(time, nodeVoltages, branchCurrents) {
        this.timeVector.push(time);
        
        // 初始化电压矩阵
        for (const [node, voltage] of nodeVoltages) {
            if (!this.voltageMatrix[node]) {
                this.voltageMatrix[node] = [];
            }
            this.voltageMatrix[node].push(voltage);
        }
        
        // 初始化电流矩阵
        for (const [component, current] of branchCurrents) {
            if (!this.currentMatrix[component]) {
                this.currentMatrix[component] = [];
            }
            this.currentMatrix[component].push(current);
        }
    }

    getTimeVector() {
        return this.timeVector;
    }

    getVoltage(nodeName) {
        return this.voltageMatrix[nodeName] || [];
    }

    getCurrent(componentName) {
        return this.currentMatrix[componentName] || [];
    }
}

/**
 * 擴展的 MNA 建構器，支持 LCP 約束
 */
export class MNA_LCP_Builder extends MNABuilder {
    constructor(options = {}) {
        super(options); // 🔥 關鍵修正：將 options 傳遞給父類 MNABuilder
        
        // === 模式控制 ===
        this.isDcMode = options.isDcMode || false;  // DC 模式標誌
        
        // === LCP 相關數據結構 ===
        this.lcpVarCount = 0;                    // LCP 變量數量 (z 的維度)
        this.lcpConstraintCount = 0;             // LCP 約束數量 (w 的維度)  
        this.lcpVariableMap = new Map();         // w索引 -> z索引 的映射
        
        // === 擴展變量管理 ===
        this.extraVariables = [];                // 額外變量列表 (電流等)
        this.extraEquations = 0;                 // 額外方程數量
        
        // === 最終系統維度 ===
        this.finalMatrixSize = 0;                // 包含所有變量的系統大小
        
        // === LCP 矩陣 ===
        this.lcpM = null;                        // LCP 的 M 矩陣
        this.lcpQ = null;                        // LCP 的 q 向量
        
        this.debug = options.debug || false;
        
        if (this.debug) {
            console.log('🏗️ 初始化 MNA-LCP 建構器');
        }
    }
    
    /**
     * 重置建構器 (重載父類方法)
     */
    reset() {
        super.reset();
        
        this.lcpVarCount = 0;
        this.lcpConstraintCount = 0;
        this.lcpVariableMap.clear();
        this.extraVariables = [];
        this.extraEquations = 0;
        this.finalMatrixSize = 0;
        this.lcpM = null;
        this.lcpQ = null;
        
        if (this.debug) {
            console.log('🔄 重置 MNA-LCP 建構器');
        }
    }
    
    /**
     * 添加額外變量 (如電流變量)
     * @param {string} name - 變量名稱
     * @returns {number} 變量在擴展系統中的索引
     */
    addExtraVariable(name) {
        const index = this.matrixSize + this.extraVariables.length;
        this.extraVariables.push({
            name,
            index,
            type: 'current'
        });
        
        if (this.debug) {
            console.log(`  ➕ 添加額外變量 ${name} -> 索引 ${index}`);
        }
        
        return index;
    }
    
    /**
     * 添加純LCP變量 (不參與MNA系統約束)
     * @param {string} name - 變量名稱
     * @returns {number} 變量索引
     */
    addLCPVariable(name) {
        // LCP變量需要在完整變量空間中有索引，與MNA變量共享索引空間
        const index = this.matrixSize + this.extraVariables.length;
        this.extraVariables.push({
            name,
            index,
            type: 'lcp'  // 標記為純LCP變量
        });
        
        if (this.debug) {
            console.log(`  ➕ 添加LCP變量 ${name} -> 索引 ${index}`);
        }
        
        return index;
    }

    /**
     * 添加額外方程
     * @returns {number} 方程索引
     */
    addEquation() {
        const index = this.matrixSize + this.extraEquations;
        this.extraEquations++;
        return index;
    }
    
    /**
     * 添加互補約束
     * @returns {number} 約束索引 (w 的索引)
     */
    addComplementarityEquation() {
        return this.lcpConstraintCount++;
    }
    
    /**
     * 建立 w 和 z 之間的互補映射
     * @param {number} wIndex - w 變量索引
     * @param {number} zIndex - z 變量索引 (在擴展系統中)
     */
    mapLCPVariable(wIndex, zIndex) {
        this.lcpVariableMap.set(wIndex, zIndex);
        
        if (this.debug) {
            console.log(`  🔗 互補映射: w[${wIndex}] ⊥ z[${zIndex}]`);
        }
    }
    
    /**
     * 向 MNA 矩陣添加元素 (便利方法)
     */
    addToMatrix(row, col, value) {
        if (this.matrix && row >= 0 && col >= 0) {
            const currentValue = this.matrix.get(row, col);
            this.matrix.set(row, col, currentValue + value);
        }
    }
    
    /**
     * 向 RHS 向量添加元素
     */
    addToRHS(row, value) {
        if (this.rhs && row >= 0) {
            const currentValue = this.rhs.get(row);
            this.rhs.set(row, currentValue + value);
        }
    }
    
    /**
     * 設置 LCP 矩陣元素
     */
    setLCPMatrix(row, col, value) {
        if (this.lcpM && row < this.lcpConstraintCount) {
            this.lcpM.set(row, col, value);
        }
    }
    
    /**
     * 設置 LCP 向量元素
     */
    setLCPVector(row, value) {
        if (this.lcpQ && row < this.lcpConstraintCount) {
            this.lcpQ.set(row, value);
        }
    }
    
    /**
     * 建立完整的 MNA-LCP 系統
     * @param {Array} components - 電路元件列表
     * @param {number} time - 當前時間
     * @returns {Object} 包含 LCP 矩陣 M 和向量 q 的對象
     */
    buildMNA_LCP_System(components, time) {
        // === 第1步：分析電路並確定初始矩陣維度 ===
        this.analyzeCircuit(components);
        
        // === 第2步：讓 MCP 元件註冊額外變量和約束 ===
        this.registerMCPVariables(components);
        
        // === 第3步：計算最終矩陣維度 ===
        // 最終大小由節點數、額外變量和顯式添加的額外方程決定
        // 注意：LCP 變量通過互補約束定義，不需要額外的 MNA 方程
        // MNA 系統大小 = 節點方程數 + 額外MNA方程數  
        // 注意：額外變量不自動增加方程數，只有實際的約束方程才增加
        this.finalMatrixSize = this.matrixSize + this.extraEquations;
        
        if (this.debug) {
            console.log(`📊 系統維度分析:`);
            console.log(`  節點數: ${this.nodeCount} (矩陣大小: ${this.matrixSize})`);
            console.log(`  額外變量: ${this.extraVariables.length}`);
            console.log(`  額外方程: ${this.extraEquations}`);
            console.log(`  LCP約束: ${this.lcpConstraintCount}`);
            console.log(`  最終系統: ${this.finalMatrixSize}×${this.finalMatrixSize}`);
        }
        
        // === 第4步：初始化矩陣和向量 ===  
        // 總變量數包括所有MNA變量和LCP變量
        const totalVariableCount = this.matrixSize + this.extraVariables.length;
        
        // MNA矩陣：行數=MNA方程數，列數=總變量數
        this.matrix = Matrix.zeros(this.finalMatrixSize, totalVariableCount);
        this.rhs = Vector.zeros(this.finalMatrixSize);
        
        // LCP矩陣：行數=LCP約束數，列數=總變量數  
        this.lcpM = Matrix.zeros(this.lcpConstraintCount, totalVariableCount);
        this.lcpQ = Vector.zeros(this.lcpConstraintCount);
        
        // ==================== 🔥 修正開始 🔥 ====================
        // 在此處應用 Gmin 電導，以確保矩陣數值穩定性
        if (this.gmin > 0) {
            if (this.debug) {
                console.log(`  ⚡️ 正在應用 Gmin 電導: ${this.gmin.toExponential(2)} S`);
            }
            // 只對應於節點電壓的對角線元素添加 Gmin
            for (let i = 0; i < this.nodeCount; i++) {
                this.matrix.addAt(i, i, this.gmin);
            }
        }
        // ==================== 🔥 修正結束 🔥 ====================
        
        if (this.debug) {
            console.log('🔍 初始化矩陣完成，大小:', this.finalMatrixSize, 'x', this.finalMatrixSize);
        }
        
        // === 第5步：處理線性元件 (傳統 MNA) ===
        this.stampLinearComponents(components, time);
        
        // === 第5.5步：預更新電壓控制的 MCP 元件狀態 ===
        this.preUpdateMCPStates(components, time);
        
        // === 第6步：處理 MCP 元件 ===
        this.stampMCPComponents(components, time);
        
        // === 第7步：舒爾補化簡 ===
        return this.performSchurComplement();
    }
    
    /**
     * 讓 MCP 元件預先註冊它們需要的變量和約束
     */
    registerMCPVariables(components) {
        if (this.debug) {
            console.log('📝 註冊 MCP 變量和約束...');
        }
        
        for (const component of components) {
            if (component.type.endsWith('_MCP') && component.registerVariables) {
                if (this.debug) {
                    console.log(`  📝 註冊 ${component.name} (${component.type}) 的變量`);
                }
                component.registerVariables(this);
            }
        }
    }
    
    /**
     * 處理線性和反應性元件
     */
    stampLinearComponents(components, time) {
        if (this.debug) {
            console.log('🔧 處理線性元件...');
        }
        
        for (const component of components) {
            if (!component.type.endsWith('_MCP')) {
                if (this.isDcMode && component.isDcEquivalent) {
                    // DC 模式下的特殊處理
                    this.stampDCEquivalent(component);
                } else {
                    // 使用父類的 MNA 方法
                    this.stampComponent(component, time);
                }
            }
        }
    }

    /**
     * 處理 DC 等效元件 (電感短路、電容開路)
     */
    stampDCEquivalent(component) {
        if (component.type === 'L' && component.isDcEquivalent) {
            // 電感在 DC 中等效為 0V 電壓源
            const nodes = component.nodes;
            const n1 = this.getNodeIndex(nodes[0]);
            const n2 = this.getNodeIndex(nodes[1]);
            const currIndex = this.voltageSourceMap.get(component.name);
            
            if (currIndex === undefined) {
                throw new Error(`DC Inductor ${component.name} current variable not found`);
            }

            // 電壓約束：V_n1 - V_n2 = 0 (短路)
            if (n1 >= 0) {
                this.matrix.set(n1, currIndex, 1);
                this.matrix.set(currIndex, n1, 1);
            }
            if (n2 >= 0) {
                this.matrix.set(n2, currIndex, -1);
                this.matrix.set(currIndex, n2, -1);
            }
            
            // RHS = 0 (短路電壓)
            this.rhs.set(currIndex, component.dcVoltage || 0);
            
            if (this.debug) {
                console.log(`  ⚡ DC電感 ${component.name}: 短路 (V=0)`);
            }
        }
    }
    
    /**
     * 預更新電壓控制的 MCP 元件狀態
     */
    preUpdateMCPStates(components, time) {
        if (this.debug) {
            console.log('🔧 預更新電壓控制 MCP 元件狀態...');
        }
        
        for (const component of components) {
            if (component.type === 'M_MCP' && component.controlMode === 'voltage' && component.gateNode) {
                if (this.debug) {
                    console.log(`  🎚️ 預更新 ${component.name} 閘極狀態 (controlMode=${component.controlMode})`);
                }
                // 使用前一個時間步的電壓作為估計
                if (this.previousNodeVoltages) {
                    component.updateFromNodeVoltages(this.previousNodeVoltages);
                    if (this.debug) {
                        const vg = this.previousNodeVoltages.get(component.gateNode) || 0;
                        const vs = this.previousNodeVoltages.get(component.sourceNode) || 0;
                        console.log(`  🔍 使用前次電壓 ${component.name}: Vg=${vg}V, Vs=${vs}V, Vgs=${vg-vs}V`);
                    }
                } else {
                    // 初始時間步，檢查電壓源的值
                    let gateVoltage = 0;
                    if (this.debug) {
                        console.log(`  🔍 初始化時間步，查找 ${component.name} 閘極電壓源 (節點: ${component.gateNode})`);
                    }
                    for (const src of components) {
                        if (this.debug) {
                            console.log(`    🔍 檢查組件 ${src.name} (type: ${src.type}, nodes: ${src.nodes})`);
                        }
                        if ((src.type === 'VoltageSource' || src.type === 'V') && src.nodes.includes(component.gateNode)) {
                            gateVoltage = src.getValue(time);
                            if (this.debug) {
                                console.log(`  ✅ 發現閘極電壓源 ${src.name}: ${gateVoltage}V @ t=${time}s`);
                            }
                            break;
                        }
                    }
                    // 建立一個臨時的節點電壓映射
                    const tempVoltages = new Map();
                    tempVoltages.set(component.gateNode, gateVoltage);
                    tempVoltages.set(component.sourceNode, 0); // 假設 source 接地或較低電壓
                    if (this.debug) {
                        console.log(`  🔧 建立臨時電壓: ${component.gateNode}=${gateVoltage}V, ${component.sourceNode}=0V`);
                    }
                    component.updateFromNodeVoltages(tempVoltages);
                }
            }
        }
    }

    /**
     * 處理 MCP 元件
     */
    stampMCPComponents(components, time) {
        if (this.debug) {
            console.log('🔧 處理 MCP 元件...');
        }
        
        for (const component of components) {
            if (component.type.endsWith('_MCP') && component.getLCPContribution) {
                if (this.debug) {
                    console.log(`  📟 處理 ${component.name} (${component.type})`);
                }
                component.getLCPContribution(this, time);
            }
        }
    }
    
    /**
     * 舒爾補化簡：將混合系統轉換為標準 LCP
     * 
     * 原始系統：
     * [A  B] [x]   [b]
     * [C  D] [z] = [d]
     * 
     * w = Ex + Fz + q
     * w ≥ 0, z ≥ 0, w'z = 0
     * 
     * 化簡為：x = A⁻¹(b - Bz), w = (E A⁻¹ B - F)z + (E A⁻¹ b + q)
     * 即：w = M'z + q', 其中 M' = F - E A⁻¹ B, q' = q + E A⁻¹ b
     */
    performSchurComplement() {
        if (this.debug) {
            console.log('🧮 執行舒爾補化簡...');
        }
        
        if (this.lcpConstraintCount === 0) {
            // 沒有 LCP 約束，退化為純線性系統
            if (this.debug) {
                console.log('  ✨ 無 LCP 約束，退化為純線性系統求解');
                console.log('  💡 這種情況表示電路中的 MCP 元件未生成約束');
                console.log('     可能原因：開關處於穩定狀態，或電路工作在線性區域');
            }
            return {
                M: Matrix.zeros(0, 0),
                q: Vector.zeros(0),
                isLinear: true,
                linearSolution: LUSolver.solve(this.matrix, this.rhs)
            };
        }
        
        // === 識別 LCP 變量索引 ===
        const zcpIndices = Array.from(this.lcpVariableMap.values()).sort((a, b) => a - b);
        const nonLcpIndices = [];
        
        for (let i = 0; i < this.finalMatrixSize; i++) {
            if (!zcpIndices.includes(i)) {
                nonLcpIndices.push(i);
            }
        }
        
        if (this.debug) {
            console.log(`  📊 LCP變量索引: [${zcpIndices.join(', ')}]`);
            console.log(`  📊 非LCP變量索引: ${nonLcpIndices.length} 個`);
            console.log('🔍 MNA 矩陣 (分解前):');
            this.matrix.print(3);
            console.log('🔍 RHS 向量:');
            console.log('  ', this.rhs.data.map(x => x.toFixed(3)).join(', '));
        }
        
        // === 分塊矩陣提取 ===
        const A = this.extractSubMatrix(this.matrix, nonLcpIndices, nonLcpIndices);
        const B = this.extractSubMatrix(this.matrix, nonLcpIndices, zcpIndices);
        const C = this.extractSubMatrix(this.lcpM, null, nonLcpIndices);  // E矩陣
        const D = this.extractSubMatrix(this.lcpM, null, zcpIndices);     // F矩陣
        
        const b = this.extractSubVector(this.rhs, nonLcpIndices);
        const q = this.lcpQ;  // 已經是正確的維度
        
        // === 求解 A⁻¹ ===
        let A_inv_B, A_inv_b;
        try {
            // 求解 A⁻¹ * b (單向量)
            A_inv_b = LUSolver.solve(A.clone(), b.clone());
            
            // 求解 A⁻¹ * B (逐列求解矩陣)
            A_inv_B = Matrix.zeros(A.rows, B.cols);
            for (let col = 0; col < B.cols; col++) {
                // 提取 B 的第 col 列為向量
                const B_col = Vector.zeros(B.rows);
                for (let row = 0; row < B.rows; row++) {
                    B_col.set(row, B.get(row, col));
                }
                
                // 求解 A * x = B_col
                const A_inv_B_col = LUSolver.solve(A.clone(), B_col);
                
                // 將結果設置到 A_inv_B 的第 col 列
                for (let row = 0; row < A.rows; row++) {
                    A_inv_B.set(row, col, A_inv_B_col.get(row));
                }
            }
        } catch (error) {
            throw new Error(`舒爾補失敗：A 矩陣奇異 - ${error.message}`);
        }
        
        // === 計算最終 LCP 矩陣 ===
        // M = F - E * A⁻¹ * B
        const E_A_inv_B = C.multiply(A_inv_B);
        const M_final = D.subtract(E_A_inv_B);
        
        // q' = q + E * A⁻¹ * b  
        // 將向量轉換為單列矩陣進行矩陣乘法
        const A_inv_b_matrix = Matrix.zeros(A_inv_b.size, 1);
        for (let i = 0; i < A_inv_b.size; i++) {
            A_inv_b_matrix.set(i, 0, A_inv_b.get(i));
        }
        
        const E_A_inv_b_matrix = C.multiply(A_inv_b_matrix);
        
        // 將結果矩陣轉換回向量
        const E_A_inv_b = Vector.zeros(E_A_inv_b_matrix.rows);
        for (let i = 0; i < E_A_inv_b_matrix.rows; i++) {
            E_A_inv_b.set(i, E_A_inv_b_matrix.get(i, 0));
        }
        
        const q_final = q.add(E_A_inv_b);
        
        // 🔍 添加 M 矩陣診斷 - 檢測無界射線潛在原因
        if (this.debug) {
            console.log(`  ✅ 舒爾補完成，最終 LCP: ${M_final.rows}×${M_final.cols}`);
            this.diagnoseLCPMatrix(M_final, q_final);
        }
        
        // 🔧 如果檢測到問題，嘗試對角擾動修復
        const { stabilizedM, stabilizedQ } = this.stabilizeLCPMatrix(M_final, q_final);
        
        return {
            M: stabilizedM,
            q: stabilizedQ,
            isLinear: false,
            // 反向求解需要的數據
            A_inv_B,
            A_inv_b,
            zcpIndices,
            nonLcpIndices
        };
    }
    
    /**
     * 提取子矩陣
     */
    extractSubMatrix(matrix, rowIndices, colIndices) {
        const actualRowIndices = rowIndices || Array.from({length: matrix.rows}, (_, i) => i);
        const actualColIndices = colIndices || Array.from({length: matrix.cols}, (_, i) => i);
        
        const subMatrix = Matrix.zeros(actualRowIndices.length, actualColIndices.length);
        
        for (let i = 0; i < actualRowIndices.length; i++) {
            for (let j = 0; j < actualColIndices.length; j++) {
                subMatrix.set(i, j, matrix.get(actualRowIndices[i], actualColIndices[j]));
            }
        }
        
        return subMatrix;
    }
    
    /**
     * 提取子向量
     */
    extractSubVector(vector, indices) {
        const actualIndices = indices || Array.from({length: vector.size}, (_, i) => i);
        const subVector = Vector.zeros(actualIndices.length);
        
        for (let i = 0; i < actualIndices.length; i++) {
            subVector.set(i, vector.get(actualIndices[i]));
        }
        
        return subVector;
    }
    
    /**
     * 🔍 診斷 LCP 矩陣 M 的數學性質
     * 分析無界射線的潜在原因
     */
    diagnoseLCPMatrix(M, q) {
        console.log('🔬 === LCP 矩陣數學診斷 ===');
        
        // 1. 基本信息
        console.log(`📏 矩陣維度: ${M.rows}×${M.cols}`);
        console.log(`📊 q 向量範數: ${this.vectorNorm(q).toExponential(3)}`);
        
        // 2. 對角線分析
        const diagonalElements = [];
        let negativeDiagonals = 0;
        let zeroDiagonals = 0;
        
        for (let i = 0; i < Math.min(M.rows, M.cols); i++) {
            const diag = M.get(i, i);
            diagonalElements.push(diag);
            if (diag < -1e-12) negativeDiagonals++;
            if (Math.abs(diag) < 1e-12) zeroDiagonals++;
        }
        
        console.log(`🔢 對角線元素範圍: [${Math.min(...diagonalElements).toExponential(2)}, ${Math.max(...diagonalElements).toExponential(2)}]`);
        console.log(`❌ 負對角元素: ${negativeDiagonals}/${diagonalElements.length}`);
        console.log(`⚠️  零對角元素: ${zeroDiagonals}/${diagonalElements.length}`);
        
        // 3. 對稱性檢查
        let asymmetryError = 0;
        if (M.rows === M.cols) {
            for (let i = 0; i < M.rows; i++) {
                for (let j = 0; j < M.cols; j++) {
                    asymmetryError = Math.max(asymmetryError, Math.abs(M.get(i, j) - M.get(j, i)));
                }
            }
            console.log(`🔄 對稱性誤差: ${asymmetryError.toExponential(3)} ${asymmetryError < 1e-10 ? '✅' : '❌'}`);
        }
        
        // 4. 條件數估計 (簡化版)
        const frobeniusNorm = this.matrixFrobeniusNorm(M);
        console.log(`📐 Frobenius 範數: ${frobeniusNorm.toExponential(3)}`);
        
        // 5. 無界射線風險評估
        const riskFactors = [];
        if (negativeDiagonals > 0) riskFactors.push('負對角元素');
        if (zeroDiagonals > 0) riskFactors.push('零對角元素');
        if (asymmetryError > 1e-8) riskFactors.push('顯著非對稱');
        if (frobeniusNorm > 1e6) riskFactors.push('矩陣過大');
        
        if (riskFactors.length > 0) {
            console.log(`🚨 無界射線風險因子: ${riskFactors.join(', ')}`);
            console.log('💡 建議: 增加 Gmin 正則化或使用 QP 求解器');
        } else {
            console.log('✅ M 矩陣看起來數值穩定');
        }
        
        // 6. 詳細矩陣輸出 (小矩陣)
        if (M.rows <= 6 && M.cols <= 6) {
            console.log('🔍 完整 M 矩陣:');
            M.print(4);
            console.log('🔍 q 向量:', q.data.map(x => x.toExponential(3)).join(', '));
        }
        
        console.log('=== 診斷完成 ===');
    }
    
    /**
     * 🔧 LCP 矩陣穩定化 - 對角擾動修復
     */
    stabilizeLCPMatrix(M, q) {
        // 檢查是否需要穩定化
        let needsStabilization = false;
        const perturbationEpsilon = 1e-6;
        
        // 檢測負對角元素
        for (let i = 0; i < Math.min(M.rows, M.cols); i++) {
            if (M.get(i, i) < -1e-12) {
                needsStabilization = true;
                break;
            }
        }
        
        if (!needsStabilization) {
            return { stabilizedM: M, stabilizedQ: q };
        }
        
        console.log(`🔧 檢測到數值不穩定，應用對角擾動 ε=${perturbationEpsilon.toExponential()}`);
        
        // 創建穩定化矩陣：M' = M + εI
        const stabilizedM = M.clone();
        for (let i = 0; i < Math.min(M.rows, M.cols); i++) {
            const original = stabilizedM.get(i, i);
            stabilizedM.set(i, i, original + perturbationEpsilon);
        }
        
        console.log('✅ 對角擾動完成');
        if (this.debug) {
            console.log('🔍 穩定化後對角線:');
            const newDiagonals = [];
            for (let i = 0; i < Math.min(stabilizedM.rows, stabilizedM.cols); i++) {
                newDiagonals.push(stabilizedM.get(i, i).toExponential(3));
            }
            console.log('  ', newDiagonals.join(', '));
        }
        
        return { stabilizedM, stabilizedQ: q }; // q 向量不變
    }
    
    /**
     * 🧮 向量 2-範數
     */
    vectorNorm(v) {
        let sum = 0;
        for (let i = 0; i < v.size; i++) {
            sum += v.get(i) * v.get(i);
        }
        return Math.sqrt(sum);
    }
    
    /**
     * 🧮 矩陣 Frobenius 範數
     */
    matrixFrobeniusNorm(M) {
        let sum = 0;
        for (let i = 0; i < M.rows; i++) {
            for (let j = 0; j < M.cols; j++) {
                sum += M.get(i, j) * M.get(i, j);
            }
        }
        return Math.sqrt(sum);
    }
    
    /**
     * 從 LCP 解重構完整解
     */
    reconstructFullSolution(lcpSolution, schurData) {
        if (schurData.isLinear) {
            return schurData.linearSolution;
        }
        
        // 完整解向量需要包含所有變量（MNA + LCP變量）
        const totalVariableCount = this.matrixSize + this.extraVariables.length;
        const fullSolution = Vector.zeros(totalVariableCount);
        
        // z 變量 (LCP 解)
        for (let i = 0; i < schurData.zcpIndices.length; i++) {
            const globalIndex = schurData.zcpIndices[i];
            fullSolution.set(globalIndex, lcpSolution.z[i]);
        }
        
        // x 變量 (通過 x = A⁻¹(b - Bz) 計算)
        const z_vector = new Vector(lcpSolution.z.length, lcpSolution.z);
        
        // 計算 Bz = A_inv_B * z (矩陣乘向量)
        const z_matrix = Matrix.zeros(z_vector.size, 1);
        for (let i = 0; i < z_vector.size; i++) {
            z_matrix.set(i, 0, z_vector.get(i));
        }
        
        const Bz_matrix = schurData.A_inv_B.multiply(z_matrix);
        
        const Bz = Vector.zeros(Bz_matrix.rows);
        for (let i = 0; i < Bz_matrix.rows; i++) {
            Bz.set(i, Bz_matrix.get(i, 0));
        }
        
        const x = schurData.A_inv_b.subtract(Bz);
        
        for (let i = 0; i < schurData.nonLcpIndices.length; i++) {
            const globalIndex = schurData.nonLcpIndices[i];
            fullSolution.set(globalIndex, x.get(i));
        }
        
        return fullSolution;
    }
}

/**
 * MCP 瞬態分析器主類
 */
export class MCPTransientAnalysis {
    constructor(options = {}) {
        // 存儲選項供後續使用
        this.options = options;
        
        // 🔥 關鍵修正：將 options 傳遞給 mnaLcpBuilder
        this.mnaLcpBuilder = new MNA_LCP_Builder(options);
        this.lcpSolver = createLCPSolver({
            maxIterations: options.maxLcpIterations || 1000,
            zeroTolerance: options.lcpZeroTolerance || 1e-12,
            debug: options.lcpDebug || false
        });
        
        // 算法參數
        this.maxTimeSteps = options.maxTimeSteps || 1e6;
        
        // 🔥 新增：自適應步長參數
        this.minTimeStep = options.minTimeStep || 1e-9;    // 最小步長 1ns - 開關瞬間使用
        this.maxTimeStep = options.maxTimeStep || 1e-6;    // 最大步長 1μs - 穩定期間使用  
        this.stepIncreaseFactor = options.stepIncreaseFactor || 1.2; // 步長增加因子
        this.adaptiveTimeStep = options.adaptiveTimeStep !== false; // 默認啟用自適應步長
        
        // 🔥 新增：用於事件檢測的 MOSFET 狀態追蹤
        this.previousMosfetStates = new Map();
        
        // 收斂控制
        this.convergenceTolerance = options.convergenceTolerance || 1e-9;
        
        // 🔥 任務二：二階預估器選項
        this.previousSolution = null; // 用於存儲完整的上一個解向量（任務三節點阻尼也需要）
        
        // 🔥 任務三：節點阻尼機制選項
        // 默認啟用節點阻尼，最大電壓變化 5V (適用於開關電源)
        this.maxVoltageStep = options.maxVoltageStep || 5.0;          // 單步最大電壓變化 (V)
        this.dampingFactor = options.dampingFactor || 0.8;            // 阻尼因子 (0~1)
        this.enableNodeDamping = options.enableNodeDamping !== false; // 默認啟用節點阻尼
        
        // 調試和監控
        this.debug = options.debug || false;
        this.collectStatistics = options.collectStatistics !== false; // 默認啟用統計收集
        
        this.statistics = {
            totalTimeSteps: 0,
            lcpSolveCount: 0,
            avgLcpIterations: 0,
            maxLcpIterations: 0,
            failedSteps: 0
        };
    }
    
    /**
     * 分析電路元件組成
     * @param {BaseComponent[]} components - 電路元件陣列
     * @returns {Object} 元件分析結果
     */
    analyzeCircuitComponents(components) {
        const mcpComponents = components.filter(c => c.type.endsWith('_MCP'));
        const linearComponents = components.filter(c => !c.type.endsWith('_MCP'));
        
        // 統計 MCP 元件類型
        const mcpTypes = [...new Set(mcpComponents.map(c => c.type))];
        
        return {
            mcpComponents,
            linearComponents,
            mcpTypes,
            totalComponents: components.length,
            hasMcpElements: mcpComponents.length > 0
        };
    }

    // ==================== 🔥 新增：正式步進 API 🔥 ====================
    
    /**
     * 初始化步進式分析 - 執行所有一次性設置
     * @param {Array} components - 元件列表
     * @param {Object} params - 分析參數 {startTime, stopTime, timeStep, ...}
     * @returns {Object} 初始化結果 {flatComponents, result, componentAnalysis}
     */
    async initializeSteppedAnalysis(components, params) {
        if (this.debug) {
            console.log('🚀 初始化步進式 MCP 分析');
            console.log(`  時間範圍: ${params.startTime}s → ${params.stopTime}s`);
            console.log(`  時間步長: ${params.timeStep}s`);
            console.log(`  元件數量: ${components.length}`);
        }
        
        // 預處理元件列表，自動展開"元元件" (如變壓器)
        const flatComponents = [];
        for (const component of components) {
            if (typeof component.getComponents === 'function') {
                if (this.debug) {
                    console.log(`  🧬 展開元元件 ${component.name}...`);
                }
                flatComponents.push(...component.getComponents());
            } else {
                flatComponents.push(component);
            }
        }
        if (this.debug && flatComponents.length !== components.length) {
            console.log(`  📊 元件列表已扁平化: ${components.length} -> ${flatComponents.length} 個基礎元件`);
        }

        // 初始化結果對象
        const result = new TransientResult();
        result.analysisInfo = {
            method: 'MCP-Stepped',
            startTime: params.startTime,
            stopTime: params.stopTime,
            timeStep: params.timeStep,
            convergenceStats: {}
        };
        
        // 分析電路組成
        const componentAnalysis = this.analyzeCircuitComponents(flatComponents);
        
        if (this.debug) {
            console.log(`  📊 電路組成分析:`);
            console.log(`     MCP 元件: ${componentAnalysis.mcpComponents.length} 個`);
            console.log(`     線性元件: ${componentAnalysis.linearComponents.length} 個`);
            if (componentAnalysis.mcpComponents.length > 0) {
                console.log(`     MCP 類型: ${componentAnalysis.mcpTypes.join(', ')}`);
            }
        }
        
        if (componentAnalysis.mcpComponents.length === 0) {
            console.warn('⚠️ 沒有 MCP 元件，建議使用傳統瞬態分析器');
        }
        
        // 計算 DC 工作點
        await this.computeInitialConditions(flatComponents, result, params);
        
        // 初始化 MOSFET 狀態追蹤（如果使用自適應步長）
        if (this.adaptiveTimeStep) {
            this.previousMosfetStates.clear();
            for (const component of flatComponents) {
                if (component.constructor.name === 'MOSFET_MCP') {
                    this.previousMosfetStates.set(component.name, component.gateState || 'unknown');
                }
            }
        }
        
        if (this.debug) {
            console.log('✅ 步進式分析初始化完成');
        }
        
        return {
            flatComponents,
            result,
            componentAnalysis
        };
    }
    
    /**
     * 執行單個時間步 - 完整的步進邏輯
     * @param {Array} flatComponents - 扁平化的元件列表
     * @param {number} currentTime - 當前時間
     * @param {number} timeStep - 時間步長
     * @param {TransientResult} result - 結果對象
     * @returns {Object} 步進結果 {success, nodeVoltages, componentCurrents, lcpStats?, actualTimeStep?}
     */
    async stepForwardAnalysis(flatComponents, currentTime, timeStep, result) {
        try {
            // 🔥 自適應步長控制邏輯（如果啟用）
            let actualTimeStep = timeStep;
            if (this.adaptiveTimeStep) {
                let switchingEventDetected = false;
                
                // 先更新時變元件以獲取當前狀態
                this.updateTimeVaryingElements(flatComponents, currentTime);
                
                // 檢測開關事件
                for (const component of flatComponents) {
                    if (component.constructor.name === 'MOSFET_MCP') {
                        const previousState = this.previousMosfetStates.get(component.name);
                        const currentState = component.gateState;
                        
                        if (previousState !== undefined && previousState !== currentState) {
                            switchingEventDetected = true;
                            if (this.debug) {
                                console.log(`⚡️ 開關事件: ${component.name} 從 ${previousState} → ${currentState} @ t=${currentTime.toExponential(3)}s`);
                            }
                            break;
                        }
                    }
                }
                
                if (switchingEventDetected) {
                    actualTimeStep = this.minTimeStep;
                } else {
                    actualTimeStep = Math.min(this.maxTimeStep, actualTimeStep * this.stepIncreaseFactor);
                }
            }
            
            // 更新時變元件（如果還沒更新）
            if (!this.adaptiveTimeStep) {
                this.updateTimeVaryingElements(flatComponents, currentTime);
            }
            
            // 🚀 更新伴隨模型 (電容、電感) - 傳遞步數支持 Gear 2
            // 注意：為避免重複調用，只在非批量分析模式下更新伴隨模型
            if (!this._skipCompanionModelUpdate) {
                const stepCount = result.getTimeVector().length; // 當前步數
                this.updateCompanionModels(flatComponents, actualTimeStep, stepCount);
            }
            
            // 求解當前時間步
            const success = await this.solveTimeStep(flatComponents, currentTime, result, actualTimeStep);
            
            if (!success) {
                return { success: false, error: `時間步求解失敗於 t = ${currentTime}` };
            }
            
            // 🔥 更新 MOSFET 狀態歷史（自適應步長）
            if (this.adaptiveTimeStep) {
                for (const component of flatComponents) {
                    if (component.constructor.name === 'MOSFET_MCP') {
                        this.previousMosfetStates.set(component.name, component.gateState);
                    }
                }
            }
            
            this.statistics.totalTimeSteps++;
            
            // 提取最新解並返回
            const timePoints = result.getTimeVector();
            if (timePoints.length > 0) {
                const nodeVoltages = new Map();
                const componentCurrents = new Map();
                
                // 提取節點電壓
                for (const [node, voltageArray] of Object.entries(result.voltageMatrix)) {
                    if (voltageArray.length > 0) {
                        nodeVoltages.set(node, voltageArray[voltageArray.length - 1]);
                    }
                }
                
                // 提取組件電流
                for (const [component, currentArray] of Object.entries(result.currentMatrix)) {
                    if (currentArray.length > 0) {
                        componentCurrents.set(component, currentArray[currentArray.length - 1]);
                    }
                }
                
                const stepResult = {
                    success: true,
                    actualTimeStep: actualTimeStep,
                    nodeVoltages: nodeVoltages,
                    componentCurrents: componentCurrents
                };
                
                // 如果有 LCP 求解統計，也包含進去
                if (this.collectStatistics && this.statistics.lcpSolveCount > 0) {
                    stepResult.lcpStats = {
                        iterations: this.statistics.maxLcpIterations,
                        avgIterations: this.statistics.avgLcpIterations
                    };
                }
                
                return stepResult;
            }
            
            return { success: true, actualTimeStep: actualTimeStep };
            
        } catch (error) {
            console.error(`🚨 步進分析失敗於 t=${currentTime}: ${error.message}`);
            if (this.debug) {
                console.error('詳細錯誤信息:', error);
            }
            return { success: false, error: error.message };
        }
    }
    
    /**
     * 完成步進式分析 - 整理最終結果
     * @param {TransientResult} result - 結果對象
     * @param {number} executionTimeMs - 執行時間（毫秒）
     * @returns {TransientResult} 最終結果
     */
    finalizeSteppedAnalysis(result, executionTimeMs) {
        result.analysisInfo.executionTime = executionTimeMs / 1000;
        result.analysisInfo.statistics = this.statistics;
        
        if (this.debug) {
            console.log(`✅ 步進式 MCP 分析完成:`);
            console.log(`  總步數: ${this.statistics.totalTimeSteps}`);
            console.log(`  執行時間: ${result.analysisInfo.executionTime.toFixed(3)}s`);
            if (this.statistics.avgLcpIterations > 0) {
                console.log(`  平均LCP迭代: ${this.statistics.avgLcpIterations.toFixed(1)}`);
            }
        }
        
        return result;
    }
    
    // ==================== 🔥 任務二：二階預估器實現 🔥 ====================
    
    /**
     * 預估下一個時間步的解
     * 使用線性外插法基於前兩個時間點預估 t_n 的解
     * @param {TransientResult} result - 當前結果對象
     * @param {number} currentTime - 當前時間 t_n
     * @param {number} timeStep - 當前時間步長 h_n
     * @returns {Map} 預估的節點電壓 Map
     */
    _predictSolution(result, currentTime, timeStep) {
        if (this.options.enablePredictor === false) {
            return this.previousNodeVoltages || new Map();
        }
        
        const timeVector = result.timeVector;
        if (timeVector.length < 2) {
            // 歷史點不夠，無法預估，返回上一個解
            if (this.debug) {
                console.log('🔮 預估器：歷史點不足，使用上一個解');
            }
            return this.previousNodeVoltages || new Map();
        }

        const t_n = currentTime;
        const t_nm1 = timeVector[timeVector.length - 1];
        const t_nm2 = timeVector[timeVector.length - 2];

        const h_n = timeStep;
        const h_nm1 = t_nm1 - t_nm2;

        if (h_nm1 <= 1e-12) { // 避免除以零
            if (this.debug) {
                console.log('🔮 預估器：上一步長過小，使用上一個解');
            }
            return this.previousNodeVoltages || new Map();
        }

        const rho = h_n / h_nm1;  // 步長比例
        const predictedVoltages = new Map();
        let maxPredictionChange = 0;

        // 對每個節點進行線性外插預估
        for (const [node, voltageArray] of Object.entries(result.voltageMatrix)) {
            if (voltageArray.length >= 2) {
                const v_nm1 = voltageArray[voltageArray.length - 1];      // V_{n-1}
                const v_nm2 = voltageArray[voltageArray.length - 2];      // V_{n-2}
                
                // 預估公式: V_p = V_{n-1} + rho * (V_{n-1} - V_{n-2})
                const v_p = v_nm1 + rho * (v_nm1 - v_nm2);
                predictedVoltages.set(node, v_p);
                
                // 計算預估的變化量
                const change = Math.abs(v_p - v_nm1);
                maxPredictionChange = Math.max(maxPredictionChange, change);
            }
        }
        
        if (this.debug) {
            console.log(`🔮 預估器：rho=${rho.toFixed(3)}, 最大預估變化=${maxPredictionChange.toFixed(4)}V`);
        }
        
        return predictedVoltages;
    }

    /**
     * 🔥 任務三：節點阻尼機制
     * 限制節點電壓的單步變化幅度，防止數值震盪和發散
     * 
     * @param {Map} nodeVoltages - 當前求解的節點電壓
     * @param {number} time - 當前時間
     * @returns {Map} 應用阻尼後的節點電壓
     */
    _applyNodeDamping(nodeVoltages, time) {
        const dampedVoltages = new Map();
        let maxChange = 0;
        let dampingApplied = false;
        
        for (const [node, currentVoltage] of nodeVoltages) {
            if (node === 'gnd' || node === '0') {
                // 地節點始終為 0，不需要阻尼
                dampedVoltages.set(node, currentVoltage);
                continue;
            }
            
            const previousVoltage = this.previousSolution[node] || 0;
            const voltageChange = currentVoltage - previousVoltage;
            const absChange = Math.abs(voltageChange);
            
            maxChange = Math.max(maxChange, absChange);
            
            if (absChange > this.maxVoltageStep) {
                // 應用阻尼：限制電壓變化幅度
                const sign = Math.sign(voltageChange);
                const limitedChange = sign * this.maxVoltageStep;
                
                // 使用阻尼因子進一步減小變化
                const dampedChange = limitedChange * this.dampingFactor;
                const dampedVoltage = previousVoltage + dampedChange;
                
                dampedVoltages.set(node, dampedVoltage);
                dampingApplied = true;
                
                if (this.debug) {
                    console.log(`🛠️ 節點 ${node} 阻尼: ${currentVoltage.toFixed(3)}V → ${dampedVoltage.toFixed(3)}V (變化 ${voltageChange.toFixed(3)}V → ${dampedChange.toFixed(3)}V)`);
                }
            } else {
                // 變化在允許範圍內，不需要阻尼
                dampedVoltages.set(node, currentVoltage);
            }
        }
        
        if (this.debug && dampingApplied) {
            console.log(`🛠️ t=${time.toExponential(3)}s: 節點阻尼生效, 最大變化=${maxChange.toFixed(3)}V`);
        }
        
        return dampedVoltages;
    }

    // ==================== 🔥 重構後的批次模式 run 方法 🔥 ====================
    
    /**
     * 運行 MCP 瞬態分析（批次模式 - 基於新步進 API 重構）
     * @param {Array} components - 電路元件列表
     * @param {Object} params - 分析參數 {startTime, stopTime, timeStep, ...}
     * @returns {TransientResult} 分析結果
     */
    async run(components, params) {
        const startTime = performance.now();
        
        // 🔥 重構：使用新的步進 API 重新實現批次模式
        console.log('🚀 開始 MCP 瞬態分析（批次模式）');
        
        // 步驟 1: 初始化
        const initResult = await this.initializeSteppedAnalysis(components, params);
        if (!initResult) {
            throw new Error('初始化失敗');
        }
        
        const { flatComponents, result } = initResult;
        
        // 步驟 2: 主時間循環
        let currentTime = params.startTime;
        let stepCount = 0;
        
        console.log(`🚀 開始主時間循環:`);
        console.log(`   起始時間: ${params.startTime}s`);
        console.log(`   結束時間: ${params.stopTime}s`);
        console.log(`   時間步長: ${params.timeStep}s`);
        console.log(`   最大步數: ${this.maxTimeSteps}`);
        
        while (currentTime < params.stopTime && stepCount < this.maxTimeSteps) {
            stepCount++;
            
            // 推進時間
            currentTime += params.timeStep;
            if (currentTime > params.stopTime) {
                currentTime = params.stopTime; // 確保不超過結束時間
            }
            
            if (this.debug && (stepCount % 100 === 0)) {
                console.log(`  � Gear2 步驟 ${stepCount}: t=${currentTime.toExponential(3)}s`);
            }
            
            // 🚀 執行步進 - 先更新伴隨模型以傳遞正確的步數
            this.updateCompanionModels(flatComponents, params.timeStep, stepCount);
            
            // 設置跳過標志以避免重複調用
            this._skipCompanionModelUpdate = true;
            const stepResult = await this.stepForwardAnalysis(flatComponents, currentTime, params.timeStep, result);
            this._skipCompanionModelUpdate = false;
            
            if (!stepResult.success) {
                console.error(`❌ 時間步失敗於 t = ${currentTime}: ${stepResult.error}`);
                this.statistics.failedSteps++;
                break;
            }
        }
        
        // 步驟 3: 完成分析
        const endTime = performance.now();
        return this.finalizeSteppedAnalysis(result, endTime - startTime);
    }
    
    /**
     * 計算初始條件 (DC 工作點) - 使用 DC-MCP 求解器
     */
    async computeInitialConditions(components, result, params) {
        if (this.debug) {
            console.log('🔍 計算 DC-MCP 初始條件...');
        }
        
        // 🔥 關鍵修正：將 options 傳遞給 DC-MCP 求解器，使其內部能設置 gmin
        const dcMcpSolver = await import('./dc_mcp_solver.js').then(m => 
            m.createDC_MCP_Solver({ debug: this.debug, gmin: this.mnaLcpBuilder.gmin })
        );
        
        try {
            // 求解 DC 工作點
            const dcResult = await dcMcpSolver.solve(components);
            
            if (this.debug) {
                console.log('✅ DC-MCP 求解成功');
            }
            
            // 為元件設置初始條件
            this.applyDCResultToComponents(components, dcResult);
            
            // 🔥 新增：初始化暫態元件的歷史狀態
            this.initializeTransientComponents(components, params);
            
            // 添加初始時間點到結果
            result.addTimePoint(params?.startTime || 0, dcResult.nodeVoltages, dcResult.branchCurrents);
            
            // 保存 DC 結果供後續使用
            result.dcOperatingPoint = dcResult;
            
        } catch (error) {
            console.warn('⚠️ DC-MCP 求解失敗，使用簡化初始條件:', error.message);
            
            // 回退到簡化初始條件
            await this.computeSimplifiedInitialConditions(components, result, params);
        }
    }

    /**
     * 初始化暫態元件的歷史狀態
     */
    initializeTransientComponents(components, params) {
        const timeStep = params.timeStep || 1e-6;
        
        for (const component of components) {
            if (component.initTransient) {
                console.log(`  ⚡ 初始化 ${component.name} 暫態狀態 (h=${timeStep})`);
                component.initTransient(timeStep);
                
                // 檢查初始條件是否正確設定
                if (component.type === 'L' && component.ic && Math.abs(component.ic) > 1e-12) {
                    console.log(`    🔌 ${component.name}: ic=${component.ic*1000}mA, previousCurrent=${(component.previousValues.get('current') || 0)*1000}mA`);
                }
            }
        }
    }

    /**
     * 將 DC 結果應用到元件初始條件
     */
    applyDCResultToComponents(components, dcResult) {
        for (const component of components) {
            if (component.type === 'L') {
                // 🔥 修正：保持使用者設定的初始電流，不被 DC 結果覆蓋
                const userSetIC = component.ic || 0;  // 保存使用者設定值
                const dcCurrent = dcResult.branchCurrents.get(component.name) || 0;
                
                // 如果使用者設定了非零初始電流，則保持；否則使用 DC 結果
                if (Math.abs(userSetIC) > 1e-12) {
                    // 保持使用者的初始電流設定
                    console.log(`  🔌 ${component.name}: 保持使用者初始電流 = ${userSetIC.toExponential(3)}A (DC=${dcCurrent.toExponential(3)}A)`);
                } else {
                    // 使用 DC 分析結果
                    component.ic = dcCurrent;
                    if (this.debug && Math.abs(dcCurrent) > 1e-12) {
                        console.log(`  🔌 ${component.name}: DC 初始電流 = ${dcCurrent.toExponential(3)}A`);
                    }
                }
            }
            
            if (component.type === 'C') {
                // 為電容設置初始電壓
                const nodeVoltages = dcResult.nodeVoltages;
                const v1 = nodeVoltages.get(component.nodes[0]) || 0;
                const v2 = nodeVoltages.get(component.nodes[1]) || 0;
                component.ic = v1 - v2;
                
                if (this.debug && Math.abs(component.ic) > 1e-12) {
                    console.log(`  🔋 ${component.name}: 初始電壓 = ${component.ic.toFixed(6)}V`);
                }
            }
            
            if (component.type.endsWith('_MCP')) {
                // 為 MCP 元件設置初始狀態
                const mcpState = dcResult.componentStates.get(component.name);
                if (mcpState && component.setInitialDCState) {
                    component.setInitialDCState(mcpState);
                }
            }
        }
    }

    /**
     * 簡化初始條件 (回退方案)
     */
    async computeSimplifiedInitialConditions(components, result, params) {
        if (this.debug) {
            console.log('🔧 使用簡化初始條件...');
        }
        
        // 為電容和電感設置零初始條件
        for (const component of components) {
            if (component.setInitialConditions) {
                component.setInitialConditions();
            }
        }
        
        const initialVoltages = new Map();
        const initialCurrents = new Map(); 
        
        // 添加初始時間點
        result.addTimePoint(params?.startTime || 0, initialVoltages, initialCurrents);
    }
    
    /**
     * 更新時變元件
     */
    updateTimeVaryingElements(components, time) {
        for (const component of components) {
            if (component.updatePWMState) {
                component.updatePWMState(time);
            }
            if (component.updateTimeVarying) {
                component.updateTimeVarying(time);
            }
        }
    }
    
    /**
     * 更新伴隨模型
     */
    updateCompanionModels(components, timeStep, stepCount = null) {
        console.log(`� Gear2 MCPTransientAnalysis.updateCompanionModels: timeStep=${timeStep}, stepCount=${stepCount}, 組件數=${components.length}`);
        for (const component of components) {
            if (component.updateCompanionModel) {
                console.log(`  ➡️ 調用 ${component.id || component.constructor.name}.updateCompanionModel(${timeStep}, ${stepCount})`);
                // 🚀 傳遞 stepCount 參數支持 Gear 2 方法
                component.updateCompanionModel(timeStep, stepCount);
            } else {
                console.log(`  ⚠️ 跳過 ${component.id || component.constructor.name} (無 updateCompanionModel 方法)`);
            }
        }
    }
    
    /**
     * 求解單個時間步
     */
    async solveTimeStep(components, time, result, timeStep) {
        try {
            // === 步驟 1: 預估解 ===
            const predictedVoltages = this._predictSolution(result, time, timeStep);
            
            // === 步驟 2: 建立 MNA-LCP 系統，傳入預估解 ===
            this.mnaLcpBuilder.reset();
            // 將預估解設定為 "上一個解"，供 preUpdateMCPStates 使用
            this.mnaLcpBuilder.previousNodeVoltages = predictedVoltages;
            
            const schurData = this.mnaLcpBuilder.buildMNA_LCP_System(components, time);
            
            if (schurData.isLinear) {
                // 純線性系統
                const solution = schurData.linearSolution;
                return this.extractAndStoreSolution(solution, components, time, result, timeStep);
            }
            
            // === 求解 LCP ===
            const lcpResult = this.lcpSolver.solve(schurData.M, schurData.q);
            
            if (this.collectStatistics) {
                this.statistics.lcpSolveCount++;
                this.statistics.maxLcpIterations = Math.max(
                    this.statistics.maxLcpIterations,
                    lcpResult.iterations
                );
                this.statistics.avgLcpIterations = 
                    (this.statistics.avgLcpIterations * (this.statistics.lcpSolveCount - 1) + 
                     lcpResult.iterations) / this.statistics.lcpSolveCount;
            }
            
            if (!lcpResult.converged) {
                throw new Error(`LCP 求解失敗: ${lcpResult.error}`);
            }
            
            // === 重構完整解 ===
            const fullSolution = this.mnaLcpBuilder.reconstructFullSolution(lcpResult, schurData);
            
            return this.extractAndStoreSolution(fullSolution, components, time, result, timeStep);
            
        } catch (error) {
            console.error(`🚨 時間步 t=${time} 求解失敗: ${error.message}`);
            if (this.debug) {
                console.error('詳細錯誤信息:', error);
                console.error('堆棧跟踪:', error.stack);
            }
            return false;
        }
    }
    
    /**
     * 提取並存儲解
     */
    extractAndStoreSolution(solution, components, time, result, timeStep) {
        // 提取節點電壓
        let nodeVoltages = this.mnaLcpBuilder.extractNodeVoltages(solution);
        
        // 🔥 任務三：節點阻尼機制
        if (this.enableNodeDamping && this.previousSolution) {
            nodeVoltages = this._applyNodeDamping(nodeVoltages, time);
        }
        
        // 更新電壓控制的 MOSFET 狀態
        for (const component of components) {
            if (component.type === 'M_MCP' && component.updateFromNodeVoltages) {
                component.updateFromNodeVoltages(nodeVoltages);
            }
        }
        
        // 存儲當前電壓供下一個時間步使用
        this.previousNodeVoltages = new Map(nodeVoltages);
        
        // 提取支路電流 (包括 MCP 元件電流)
        const branchCurrents = this.mnaLcpBuilder.extractVoltageSourceCurrents(solution);
        
        // 提取 MCP 元件電流
        for (const component of components) {
            if (component.type.endsWith('_MCP') && component.currentVarIndex >= 0) {
                const current = solution.get(component.currentVarIndex);
                branchCurrents.set(`${component.name}_current`, current);
            }
        }
        
        // 🔥 確保電感電流正確提取和映射 
        for (const component of components) {
            if (component.type === 'L' && component.needsCurrentVariable && component.needsCurrentVariable()) {
                console.log(`🔍 檢查電感 ${component.name} 的電流映射...`);
                
                // 電感電流應該已經在 branchCurrents 中，但我們確認一下
                if (!branchCurrents.has(component.name)) {
                    console.log(`⚠️ [${component.name}] 電流未在 branchCurrents 中找到，嘗試從 voltageSourceMap 提取...`);
                    
                    // 如果沒有，嘗試從 voltageSourceMap 中提取
                    const voltageSourceIndex = this.mnaLcpBuilder.voltageSourceMap.get(component.name);
                    if (voltageSourceIndex !== undefined) {
                        const current = solution.get(voltageSourceIndex);
                        branchCurrents.set(component.name, current);
                        console.log(`📊 [${component.name}] 電感電流提取: ${current.toExponential(3)}A (從索引 ${voltageSourceIndex})`);
                    } else {
                        console.log(`❌ [${component.name}] voltageSourceMap 中未找到映射索引`);
                        branchCurrents.set(component.name, 0); // 設置為 0 避免錯誤
                    }
                } else {
                    const existingCurrent = branchCurrents.get(component.name);
                    console.log(`✅ [${component.name}] 電流已存在: ${existingCurrent.toExponential(3)}A`);
                }
            }
        }
        
        // 更新元件歷史 - 統一 API 調用
        const solutionData = {
            nodeVoltages: nodeVoltages,
            branchCurrents: branchCurrents
        };
        
        for (const component of components) {
            if (component.updateHistory) {
                // 所有元件現在都支持統一的 updateHistory(solutionData, timeStep) API
                component.updateHistory(solutionData, timeStep);
            }
        }
        
        // 更新預估器歷史
        if (this.options.enablePredictor !== false) {
            this.previousSolution = Object.fromEntries(nodeVoltages);
        }
        
        // 存儲到結果
        result.addTimePoint(time, nodeVoltages, branchCurrents);
        
        return true;
    }
}

/**
 * 創建預配置的 MCP 瞬態分析器
 */
export function createMCPTransientAnalysis(options = {}) {
    const defaultOptions = {
        debug: false,
        lcpDebug: false,
        collectStatistics: true,
        maxLcpIterations: 1000,
        lcpZeroTolerance: 1e-12,
        convergenceTolerance: 1e-9
    };

    return new MCPTransientAnalysis({ ...defaultOptions, ...options });
}

export default MCPTransientAnalysis;