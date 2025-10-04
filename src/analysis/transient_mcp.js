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
import { TransientResult } from './transient.js';

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
     * 添加額外方程
     * @returns {number} 方程索引
     */
    addEquation() {
        const index = this.matrixSize + this.extraVariables.length + this.extraEquations;
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
        this.finalMatrixSize = this.matrixSize + this.extraVariables.length + this.extraEquations;
        
        if (this.debug) {
            console.log(`📊 系統維度分析:`);
            console.log(`  節點數: ${this.nodeCount} (矩陣大小: ${this.matrixSize})`);
            console.log(`  額外變量: ${this.extraVariables.length}`);
            console.log(`  額外方程: ${this.extraEquations}`);
            console.log(`  LCP約束: ${this.lcpConstraintCount}`);
            console.log(`  最終系統: ${this.finalMatrixSize}×${this.finalMatrixSize}`);
        }
        
        // === 第4步：初始化矩陣和向量 ===
        this.matrix = Matrix.zeros(this.finalMatrixSize, this.finalMatrixSize);
        this.rhs = Vector.zeros(this.finalMatrixSize);
        this.lcpM = Matrix.zeros(this.lcpConstraintCount, this.finalMatrixSize);
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
        
        if (this.debug) {
            console.log(`  ✅ 舒爾補完成，最終 LCP: ${M_final.rows}×${M_final.cols}`);
        }
        
        return {
            M: M_final,
            q: q_final,
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
     * 從 LCP 解重構完整解
     */
    reconstructFullSolution(lcpSolution, schurData) {
        if (schurData.isLinear) {
            return schurData.linearSolution;
        }
        
        const fullSolution = Vector.zeros(this.finalMatrixSize);
        
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
        // 🔥 關鍵修正：將 options 傳遞給 mnaLcpBuilder
        this.mnaLcpBuilder = new MNA_LCP_Builder(options);
        this.lcpSolver = createLCPSolver({
            maxIterations: options.maxLcpIterations || 1000,
            zeroTolerance: options.lcpZeroTolerance || 1e-12,
            debug: options.lcpDebug || false
        });
        
        // 算法參數
        this.maxTimeSteps = options.maxTimeSteps || 1e6;
        this.minTimeStep = options.minTimeStep || 1e-12;
        this.maxTimeStep = options.maxTimeStep || 1e-3;
        
        // 收斂控制
        this.convergenceTolerance = options.convergenceTolerance || 1e-9;
        this.maxNewtonIterations = options.maxNewtonIterations || 20;
        
        // 調試和監控
        this.debug = options.debug || false;
        this.collectStatistics = options.collectStatistics || false;
        
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

    /**
     * 運行 MCP 瞬態分析
     * @param {Array} components - 電路元件列表
     * @param {Object} params - 分析參數 {startTime, stopTime, timeStep, ...}
     * @returns {TransientResult} 分析結果
     */
    async run(components, params) {
        const startTime = performance.now();
        
        if (this.debug) {
            console.log('🚀 開始 MCP 瞬態分析');
            console.log(`  時間範圍: ${params.startTime}s → ${params.stopTime}s`);
            console.log(`  時間步長: ${params.timeStep}s`);
            console.log(`  元件數量: ${components.length}`);
        }
        
        // ==================== 🔥 核心架構修正開始 🔥 ====================
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
        // ==================== 🔥 核心架構修正結束 🔥 ====================

        // 初始化結果對象
        const result = new TransientResult();
        result.analysisInfo = {
            method: 'MCP',
            startTime: params.startTime,
            stopTime: params.stopTime,
            timeStep: params.timeStep,
            convergenceStats: {}
        };
        
        // 分析電路組成 (使用扁平化後的列表)
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
            if (this.debug) {
                console.log('   建議：對於純線性/非線性電路，TransientAnalysis 可能更適合');
                console.log('   MCP 分析器專為包含開關、二極體等互補約束的電路設計');
            }
        }
        
        // === 步驟1：計算 DC 工作點 ===
        // 🔥 修正：傳遞 params 以便使用 startTime (使用扁平化後的列表)
        await this.computeInitialConditions(flatComponents, result, params);
        
        // === 步驟2：主時間循環 ===
        let currentTime = params.startTime;
        let stepCount = 0;
        
        console.log(`🚀 開始主時間循環:`);
        console.log(`   起始時間: ${params.startTime}s`);
        console.log(`   結束時間: ${params.stopTime}s`);
        console.log(`   時間步長: ${params.timeStep}s`);
        console.log(`   最大步數: ${this.maxTimeSteps}`);
        console.log(`   初始條件: currentTime=${currentTime}, stopTime=${params.stopTime}`);
        
        while (currentTime < params.stopTime && stepCount < this.maxTimeSteps) {
            currentTime += params.timeStep;
            stepCount++;
            
            if (this.debug && stepCount % 1000 === 0) {
                console.log(`  📅 步驟 ${stepCount}, t = ${currentTime.toFixed(6)}s`);
            }
            
            try {
                // 更新 PWM 控制器和時變源 (使用扁平化後的列表)
                console.log(`  🔥 步驟 ${stepCount}: 開始處理 t=${currentTime.toFixed(6)}s, timeStep=${params.timeStep}`);
                this.updateTimeVaryingElements(flatComponents, currentTime);
                
                // 更新伴隨模型 (電容、電感) - 傳遞時間步長 (使用扁平化後的列表)
                console.log(`  ⚡ 準備調用 updateCompanionModels...`);
                this.updateCompanionModels(flatComponents, params.timeStep);
                console.log(`  ✅ updateCompanionModels 調用完成`);
                
                // 求解當前時間步 (使用扁平化後的列表)
                const success = await this.solveTimeStep(flatComponents, currentTime, result);
                
                if (!success) {
                    console.error(`❌ 時間步失敗於 t = ${currentTime}`);
                    this.statistics.failedSteps++;
                    
                    // 這裡可以實施自適應步長控制
                    break;
                }
                
                this.statistics.totalTimeSteps++;
                
            } catch (error) {
                console.error(`❌ 分析失敗於 t = ${currentTime}: ${error.message}`);
                result.analysisInfo.error = error.message;
                break;
            }
        }
        
        // === 步驟3：整理結果 ===
        const endTime = performance.now();
        result.analysisInfo.executionTime = (endTime - startTime) / 1000;
        result.analysisInfo.statistics = this.statistics;
        
        if (this.debug) {
            console.log(`✅ MCP 瞬態分析完成:`);
            console.log(`  總步數: ${this.statistics.totalTimeSteps}`);
            console.log(`  執行時間: ${result.analysisInfo.executionTime.toFixed(3)}s`);
            console.log(`  平均LCP迭代: ${this.statistics.avgLcpIterations.toFixed(1)}`);
        }
        
        return result;
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
     * 將 DC 結果應用到元件初始條件
     */
    applyDCResultToComponents(components, dcResult) {
        for (const component of components) {
            if (component.type === 'L') {
                // 為電感設置初始電流
                const initialCurrent = dcResult.branchCurrents.get(component.name) || 0;
                component.ic = initialCurrent;
                
                if (this.debug && Math.abs(initialCurrent) > 1e-12) {
                    console.log(`  🔌 ${component.name}: 初始電流 = ${initialCurrent.toExponential(3)}A`);
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
    updateCompanionModels(components, timeStep) {
        console.log(`🔧 MCPTransientAnalysis.updateCompanionModels 被調用: timeStep=${timeStep}, 組件數=${components.length}`);
        for (const component of components) {
            if (component.updateCompanionModel) {
                console.log(`  ➡️ 調用 ${component.id || component.constructor.name}.updateCompanionModel(${timeStep})`);
                component.updateCompanionModel(timeStep);
            } else {
                console.log(`  ⚠️ 跳過 ${component.id || component.constructor.name} (無 updateCompanionModel 方法)`);
            }
        }
    }
    
    /**
     * 求解單個時間步
     */
    async solveTimeStep(components, time, result) {
        try {
            // === 建立 MNA-LCP 系統 ===
            this.mnaLcpBuilder.reset();
            const schurData = this.mnaLcpBuilder.buildMNA_LCP_System(components, time);
            
            if (schurData.isLinear) {
                // 純線性系統
                const solution = schurData.linearSolution;
                return this.extractAndStoreSolution(solution, components, time, result);
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
            
            return this.extractAndStoreSolution(fullSolution, components, time, result);
            
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
    extractAndStoreSolution(solution, components, time, result) {
        // 提取節點電壓
        const nodeVoltages = this.mnaLcpBuilder.extractNodeVoltages(solution);
        
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
        
        // 更新元件歷史
        for (const component of components) {
            if (component.updateHistory) {
                // 🔥 修复：为 inductor_v2.js 传递完整参数
                if (component.constructor.name === 'Inductor' && component.updateHistory.length === 4) {
                    // 传递电感所需的所有参数: (nodeVoltages, branchCurrents, currentVarName, h)
                    component.updateHistory(nodeVoltages, branchCurrents, component.name, this.currentTimeStep || 1e-6);
                } else {
                    // 对其他组件使用标准调用
                    component.updateHistory(nodeVoltages, branchCurrents);
                }
            }
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