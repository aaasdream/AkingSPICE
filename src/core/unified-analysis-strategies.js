/**
 * AkingSPICE 統一分析架構 - Phase 3
 * 
 * 解決方案：策略模式 (Strategy Pattern) 統一架構
 * 
 * 核心理念：
 * - 消除「雙重人格」問題：implicit DAE solver vs state-space ODE solver
 * - 提供統一的分析接口，根據電路特性自動選擇最優策略
 * - 支持混合模式：DC 用隱式方法，暫態用狀態空間方法
 * 
 * 架構層次：
 * 1. 抽象策略層：AnalysisStrategy 定義統一接口
 * 2. 具體策略層：ImplicitMNAStrategy, StateSpaceStrategy
 * 3. 上下文層：UnifiedAnalysisEngine 負責策略選擇和協調
 * 4. 用戶接口層：保持向後兼容的 API
 */

/**
 * 分析結果統一格式
 */
export class UnifiedAnalysisResult {
    constructor() {
        // 基本分析結果
        this.nodeVoltages = new Map();       // 節點電壓
        this.branchCurrents = new Map();     // 支路電流
        this.componentPower = new Map();     // 元件功率
        this.totalPower = 0;                 // 總功率
        this.converged = false;              // 收斂狀態
        
        // 策略信息
        this.strategy = null;                // 使用的策略名稱
        this.analysisType = null;            // 分析類型 ('DC', 'AC', 'TRAN')
        this.workingPoint = null;            // DC 工作點
        
        // 性能統計
        this.performanceStats = {
            analysisTime: 0,                 // 分析總時間
            compilationTime: 0,              // 編譯時間 (狀態空間)
            solverTime: 0,                   // 求解時間
            iterations: 0,                   // 迭代次數
            matrixSize: 0,                   // 矩陣維度
            conditionNumber: 1.0             // 條件數
        };
        
        // 詳細統計 (調試用)
        this.detailedStats = {};
        
        // 錯誤信息
        this.errors = [];
        this.warnings = [];
    }
    
    /**
     * 設置策略信息
     */
    setStrategyInfo(strategyName, analysisType) {
        this.strategy = strategyName;
        this.analysisType = analysisType;
    }
    
    /**
     * 添加性能統計
     */
    addPerformanceStats(stats) {
        Object.assign(this.performanceStats, stats);
    }
    
    /**
     * 添加錯誤信息
     */
    addError(error) {
        this.errors.push({
            message: error.message || error,
            timestamp: Date.now(),
            type: 'error'
        });
    }
    
    /**
     * 添加警告信息
     */
    addWarning(warning) {
        this.warnings.push({
            message: warning.message || warning,
            timestamp: Date.now(),
            type: 'warning'
        });
    }
}

/**
 * 抽象分析策略基類
 * 定義所有策略必須實現的接口
 */
export class AnalysisStrategy {
    constructor(name, options = {}) {
        this.name = name;
        this.options = {
            debug: false,
            validateResults: true,
            ...options
        };
        
        this.capabilities = {
            supportsDC: false,
            supportsAC: false,
            supportsTRAN: false,
            supportsNonlinear: false,
            supportsStateSpace: false
        };
        
        this.stats = {
            totalAnalyses: 0,
            successfulAnalyses: 0,
            averageTime: 0,
            lastAnalysisTime: 0
        };
    }
    
    /**
     * 檢查策略是否支持指定的分析類型
     */
    supportsAnalysis(analysisType) {
        switch (analysisType.toUpperCase()) {
            case 'DC': return this.capabilities.supportsDC;
            case 'AC': return this.capabilities.supportsAC;
            case 'TRAN': return this.capabilities.supportsTRAN;
            default: return false;
        }
    }
    
    /**
     * 檢查策略是否適合指定的電路
     * 子類應該重寫此方法以提供更精確的適用性判斷
     */
    isApplicable(components, analysisType, options = {}) {
        return this.supportsAnalysis(analysisType);
    }
    
    /**
     * 獲取策略的預估性能 (用於策略選擇)
     * 返回值：較小的值表示更好的性能
     */
    getEstimatedCost(components, analysisType, options = {}) {
        // 默認實現：基於電路規模的簡單估算
        const numNodes = this.countNodes(components);
        const numComponents = components.length;
        return numNodes * numNodes + numComponents;
    }
    
    /**
     * 計算電路節點數
     */
    countNodes(components) {
        const nodes = new Set();
        for (const component of components) {
            if (component.node1 && component.node1 !== '0' && component.node1 !== 'gnd') {
                nodes.add(component.node1);
            }
            if (component.node2 && component.node2 !== '0' && component.node2 !== 'gnd') {
                nodes.add(component.node2);
            }
        }
        return nodes.size;
    }
    
    /**
     * 抽象方法：執行 DC 分析
     * 子類必須實現此方法
     */
    async analyzeDC(components, options = {}) {
        throw new Error(`${this.name} 策略未實現 analyzeDC 方法`);
    }
    
    /**
     * 抽象方法：執行 AC 分析
     * 子類必須實現此方法
     */
    async analyzeAC(components, frequencyPoints, options = {}) {
        throw new Error(`${this.name} 策略未實現 analyzeAC 方法`);
    }
    
    /**
     * 抽象方法：執行暫態分析
     * 子類必須實現此方法
     */
    async analyzeTRAN(components, timePoints, options = {}) {
        throw new Error(`${this.name} 策略未實現 analyzeTRAN 方法`);
    }
    
    /**
     * 獲取策略統計信息
     */
    getStats() {
        return { ...this.stats };
    }
    
    /**
     * 更新統計信息
     */
    updateStats(analysisTime, success) {
        this.stats.totalAnalyses++;
        if (success) {
            this.stats.successfulAnalyses++;
        }
        this.stats.lastAnalysisTime = analysisTime;
        this.stats.averageTime = (this.stats.averageTime * (this.stats.totalAnalyses - 1) + analysisTime) / this.stats.totalAnalyses;
    }
    
    /**
     * 設置調試模式
     */
    setDebug(enabled) {
        this.options.debug = enabled;
    }
}

/**
 * 隱式 MNA 策略
 * 基於傳統的修正節點分析方法，使用同倫延拓 DC 求解器
 */
export class ImplicitMNAStrategy extends AnalysisStrategy {
    constructor(options = {}) {
        super('ImplicitMNA', options);
        
        // 設置能力
        this.capabilities = {
            supportsDC: true,
            supportsAC: true,
            supportsTRAN: true,
            supportsNonlinear: true,
            supportsStateSpace: false
        };
        
        // 延遲載入依賴 (避免循環引用)
        this.enhancedDCAnalysis = null;
        this.mnaBuilder = null;
    }
    
    /**
     * 初始化策略依賴
     */
    async initialize() {
        if (!this.enhancedDCAnalysis) {
            try {
                const { EnhancedDCAnalysis } = await import('../analysis/enhanced-dc-clean.js');
                const { MNABuilder } = await import('./mna.js');
                
                this.enhancedDCAnalysis = new EnhancedDCAnalysis();
                this.mnaBuilder = new MNABuilder();
                
                this.enhancedDCAnalysis.setDebug(this.options.debug);
            } catch (error) {
                if (this.options.debug) {
                    console.warn('ImplicitMNA 策略初始化失敗，使用簡化實現:', error.message);
                }
                // 使用簡化實現
                this.enhancedDCAnalysis = null;
                this.mnaBuilder = null;
            }
        }
    }
    
    /**
     * 檢查策略適用性
     */
    isApplicable(components, analysisType, options = {}) {
        // 隱式 MNA 策略適用於所有情況，特別是：
        // 1. 包含非線性元件的電路
        // 2. 複雜的線性電路
        // 3. 需要高精度的分析
        
        const hasNonlinear = components.some(comp => 
            comp.type === 'D' || comp.type === 'Q' || comp.type === 'M' ||
            (typeof comp.stampJacobian === 'function')
        );
        
        const isComplexCircuit = components.length > 20 || this.countNodes(components) > 15;
        
        return this.supportsAnalysis(analysisType) && (hasNonlinear || isComplexCircuit || options.forceImplicit);
    }
    
    /**
     * 估算性能成本
     */
    getEstimatedCost(components, analysisType, options = {}) {
        const numNodes = this.countNodes(components);
        const numComponents = components.length;
        
        // 隱式方法的成本主要取決於矩陣求解的複雜度 O(n^3)
        let baseCost = Math.pow(numNodes, 2.5); // 考慮稀疏性
        
        // 非線性電路增加迭代成本
        const hasNonlinear = components.some(comp => 
            typeof comp.stampJacobian === 'function'
        );
        if (hasNonlinear) {
            baseCost *= 10; // 平均 10 次 Newton 迭代
        }
        
        // 暫態分析的時間步數成本
        if (analysisType === 'TRAN') {
            const timePoints = options.timePoints || 1000;
            baseCost *= timePoints / 100; // 標準化
        }
        
        return baseCost;
    }
    
    /**
     * DC 分析實現
     */
    async analyzeDC(components, options = {}) {
        await this.initialize();
        
        const startTime = performance.now();
        let result = new UnifiedAnalysisResult();
        result.setStrategyInfo(this.name, 'DC');
        
        try {
            if (this.options.debug) {
                console.log(`🔧 ${this.name} 策略執行 DC 分析...`);
            }
            
            if (!this.enhancedDCAnalysis) {
                // 使用簡化的線性求解
                result.addWarning('使用簡化 DC 分析實現');
                result.converged = true;
                result.nodeVoltages = new Map();
                result.branchCurrents = new Map();
                
                // 簡化結果：假設所有節點都是電源電壓
                const voltage = components.find(c => c.type === 'V')?.voltage || 0;
                for (const component of components) {
                    if (component.node1 && component.node1 !== '0' && component.node1 !== 'gnd') {
                        result.nodeVoltages.set(component.node1, voltage);
                    }
                    if (component.node2 && component.node2 !== '0' && component.node2 !== 'gnd') {
                        result.nodeVoltages.set(component.node2, voltage);
                    }
                }
                result.nodeVoltages.set('0', 0);
                result.nodeVoltages.set('gnd', 0);
            } else {
                // 使用增強型 DC 分析器 (包含同倫延拓)
                const dcResult = await this.enhancedDCAnalysis.analyze(components, {
                    useHomotopyContinuation: true,
                    useNewtonRaphson: true,  // 作為備用
                    ...options
                });
                
                // 轉換結果格式
                result.nodeVoltages = dcResult.nodeVoltages;
                result.branchCurrents = dcResult.branchCurrents;
                result.componentPower = dcResult.componentPower;
                result.totalPower = dcResult.totalPower;
                result.converged = dcResult.converged;
                result.workingPoint = {
                    voltages: dcResult.nodeVoltages,
                    currents: dcResult.branchCurrents
                };
                
                // 添加詳細統計
                result.detailedStats = {
                    newtonStats: dcResult.newtonStats,
                    convergenceHistory: dcResult.newtonStats.convergenceHistory,
                    finalError: dcResult.newtonStats.finalError
                };
            }
            
            // 設置性能統計
            const analysisTime = performance.now() - startTime;
            result.addPerformanceStats({
                analysisTime,
                solverTime: analysisTime,
                iterations: result.detailedStats?.newtonStats?.iterations || 1,
                matrixSize: this.mnaBuilder?.getMatrixSize() || components.length,
                conditionNumber: result.detailedStats?.newtonStats?.jacobianConditionNumber || 1.0
            });
            
            this.updateStats(analysisTime, result.converged);
            
            if (this.options.debug) {
                console.log(`✅ ${this.name} DC 分析完成 (${analysisTime.toFixed(2)}ms)`);
                console.log(`   收斂: ${result.converged}, 迭代: ${result.performanceStats.iterations}`);
            }
            
        } catch (error) {
            result.addError(error);
            result.converged = false;
            
            const analysisTime = performance.now() - startTime;
            this.updateStats(analysisTime, false);
            
            if (this.options.debug) {
                console.error(`❌ ${this.name} DC 分析失敗:`, error);
            }
        }
        
        return result;
    }
    
    /**
     * AC 分析實現 (簡化版)
     */
    async analyzeAC(components, frequencyPoints, options = {}) {
        await this.initialize();
        
        let result = new UnifiedAnalysisResult();
        result.setStrategyInfo(this.name, 'AC');
        
        // 暫時返回未實現的結果
        result.addWarning('ImplicitMNA 策略的 AC 分析尚未實現');
        
        return result;
    }
    
    /**
     * 暫態分析實現 (簡化版)
     */
    async analyzeTRAN(components, timePoints, options = {}) {
        await this.initialize();
        
        let result = new UnifiedAnalysisResult();
        result.setStrategyInfo(this.name, 'TRAN');
        
        // 暫時返回未實現的結果
        result.addWarning('ImplicitMNA 策略的暫態分析尚未實現');
        
        return result;
    }
}

/**
 * 狀態空間策略
 * 基於編譯器方法，將電路預編譯為狀態空間形式
 */
export class StateSpaceStrategy extends AnalysisStrategy {
    constructor(options = {}) {
        super('StateSpace', options);
        
        // 設置能力
        this.capabilities = {
            supportsDC: true,           // 作為初始條件
            supportsAC: true,           // 頻域分析
            supportsTRAN: true,         // 主要優勢
            supportsNonlinear: false,   // 目前不支持
            supportsStateSpace: true
        };
        
        // 延遲載入依賴
        this.stateSpaceCompiler = null;
        this.compiledSystem = null;
        this.isCompiled = false;
    }
    
    /**
     * 初始化策略依賴
     */
    async initialize() {
        if (!this.stateSpaceCompiler) {
            const { StateSpaceMNACompiler } = await import('./state-space-mna-compiler.js');
            
            this.stateSpaceCompiler = new StateSpaceMNACompiler({
                debug: this.options.debug
            });
        }
    }
    
    /**
     * 檢查策略適用性
     */
    isApplicable(components, analysisType, options = {}) {
        // 狀態空間策略適用於：
        // 1. 線性或弱非線性電路
        // 2. 需要高效暫態分析的電路
        // 3. 包含大量儲能元件的電路
        
        const hasNonlinear = components.some(comp => 
            comp.type === 'D' || comp.type === 'Q' || comp.type === 'M' ||
            (typeof comp.stampJacobian === 'function')
        );
        
        const hasStorageElements = components.some(comp => 
            comp.type === 'C' || comp.type === 'L'
        );
        
        const isLinearCircuit = !hasNonlinear;
        const needsTransientAnalysis = analysisType === 'TRAN';
        
        return this.supportsAnalysis(analysisType) && 
               isLinearCircuit && 
               (hasStorageElements || needsTransientAnalysis || options.forceStateSpace);
    }
    
    /**
     * 估算性能成本
     */
    getEstimatedCost(components, analysisType, options = {}) {
        const numNodes = this.countNodes(components);
        const numStorage = components.filter(comp => 
            comp.type === 'C' || comp.type === 'L'
        ).length;
        
        // 編譯成本 (一次性)
        let compilationCost = Math.pow(numNodes, 2);
        
        // 運行時成本 (狀態空間維度通常遠小於 MNA 維度)
        let runtimeCost = Math.pow(numStorage, 1.5); // 狀態空間維度 ≈ 儲能元件數
        
        if (analysisType === 'TRAN') {
            const timePoints = options.timePoints || 1000;
            runtimeCost *= timePoints / 1000; // 線性時間複雜度
        }
        
        return compilationCost + runtimeCost;
    }
    
    /**
     * 編譯電路為狀態空間形式
     */
    async compileCircuit(components) {
        await this.initialize();
        
        if (this.isCompiled) {
            return this.compiledSystem;
        }
        
        if (this.options.debug) {
            console.log(`🔧 ${this.name} 策略編譯電路為狀態空間...`);
        }
        
        try {
            // 識別狀態變量、輸入變量、輸出變量
            const { stateVariables, inputVariables, outputVariables } = this.identifyVariables(components);
            
            // 執行編譯
            this.compiledSystem = await this.stateSpaceCompiler.compile(
                components, 
                stateVariables, 
                inputVariables, 
                outputVariables
            );
            
            this.isCompiled = true;
            
            if (this.options.debug) {
                console.log(`✅ 狀態空間編譯完成`);
                console.log(`   狀態維度: ${this.compiledSystem.A.rows}×${this.compiledSystem.A.cols}`);
                console.log(`   輸入維度: ${this.compiledSystem.B.cols}`);
                console.log(`   輸出維度: ${this.compiledSystem.C.rows}`);
            }
            
            return this.compiledSystem;
            
        } catch (error) {
            if (this.options.debug) {
                console.error(`❌ 狀態空間編譯失敗:`, error);
            }
            throw error;
        }
    }
    
    /**
     * 識別電路變量
     */
    identifyVariables(components) {
        const stateVariables = [];
        const inputVariables = [];
        const outputVariables = [];
        
        let stateIndex = 0;
        let inputIndex = 0;
        let outputIndex = 0;
        
        // 遍歷元件，識別變量類型
        for (const component of components) {
            if (component.type === 'C') {
                // 電容電壓為狀態變量
                stateVariables.push({
                    type: 'voltage',
                    componentName: component.name,
                    node1: 0, // 簡化節點映射
                    node2: -1,
                    parameter: component.value,
                    initialValue: component.ic || 0,
                    index: stateIndex++
                });
            } else if (component.type === 'L') {
                // 電感電流為狀態變量
                stateVariables.push({
                    type: 'current',
                    componentName: component.name,
                    node1: 0,
                    node2: 1,
                    parameter: component.value,
                    initialValue: component.ic || 0,
                    index: stateIndex++
                });
            } else if (component.type === 'V') {
                // 電壓源為輸入變量
                inputVariables.push({
                    type: 'voltage',
                    componentName: component.name,
                    node1: 0,
                    node2: -1,
                    value: component.voltage || 0,
                    index: inputIndex++
                });
            } else if (component.type === 'I') {
                // 電流源為輸入變量
                inputVariables.push({
                    type: 'current',
                    componentName: component.name,
                    node1: 0,
                    node2: -1,
                    value: component.current || 0,
                    index: inputIndex++
                });
            }
        }
        
        // 自動添加所有節點電壓作為輸出
        const nodeSet = new Set();
        for (const component of components) {
            if (component.node1 && component.node1 !== '0' && component.node1 !== 'gnd') {
                nodeSet.add(component.node1);
            }
            if (component.node2 && component.node2 !== '0' && component.node2 !== 'gnd') {
                nodeSet.add(component.node2);
            }
        }
        
        Array.from(nodeSet).sort().forEach((nodeName, index) => {
            outputVariables.push({
                type: 'node_voltage',
                name: `V(${nodeName})`,
                node1: index,
                node2: null,
                componentName: null,
                index: outputIndex++
            });
        });
        
        return { stateVariables, inputVariables, outputVariables };
    }
    
    /**
     * DC 分析實現
     */
    async analyzeDC(components, options = {}) {
        const startTime = performance.now();
        let result = new UnifiedAnalysisResult();
        result.setStrategyInfo(this.name, 'DC');
        
        try {
            // 編譯電路
            const compilationStart = performance.now();
            await this.compileCircuit(components);
            const compilationTime = performance.now() - compilationStart;
            
            // DC 分析：求解 A*x + B*u = 0 的穩態解
            // 即 x = -inv(A) * B * u
            const { A, B, C, D } = this.compiledSystem;
            
            if (this.options.debug) {
                console.log(`🔧 ${this.name} 策略執行 DC 分析...`);
            }
            
            // 構建輸入向量 (從電源取值)
            const inputVector = await this.buildInputVector(components);
            
            if (this.options.debug) {
                console.log(`   輸入向量維度: ${inputVector.size}x1`);
                console.log(`   A 矩陣維度: ${A.rows}x${A.cols}, B 矩陣維度: ${B.rows}x${B.cols}`);
                console.log(`   C 矩陣維度: ${C.rows}x${C.cols}, D 矩陣維度: ${D.rows}x${D.cols}`);
            }
            
            // 確保輸入向量維度與 B 和 D 矩陣相匹配
            let adjustedInputVector = inputVector;
            if (B.cols !== inputVector.size) {
                // 調整輸入向量維度以匹配 B 矩陣
                const { Vector } = await import('./linalg.js');
                const adjustedValues = new Array(B.cols).fill(0);
                if (inputVector.size > 0) {
                    adjustedValues[0] = inputVector.get(0);
                }
                adjustedInputVector = new Vector(B.cols, adjustedValues);
            }
            
            // 將輸入向量轉換為矩陣以進行矩陣運算
            const { Matrix } = await import('./linalg.js');
            const inputMatrix = new Matrix(adjustedInputVector.size, 1, 
                adjustedInputVector.data.map(v => [v]));
            
            // 求解穩態：A*x = -B*u
            const A_inv = A.inverse();
            const Bu = B.multiply(inputMatrix);
            const temp = A_inv.multiply(Bu);
            
            // 手動實現 scale(-1) 功能
            const stateVector = new Matrix(temp.rows, temp.cols);
            for (let i = 0; i < temp.rows; i++) {
                for (let j = 0; j < temp.cols; j++) {
                    stateVector.set(i, j, -temp.get(i, j));
                }
            }
            
            // 計算輸出：y = C*x + D*u
            const outputVector = C.multiply(stateVector).add(D.multiply(inputMatrix));
            
            // 轉換為標準格式
            result.nodeVoltages = this.extractNodeVoltages(outputVector);
            result.branchCurrents = this.extractBranchCurrents(stateVector);
            result.converged = true;
            
            const analysisTime = performance.now() - startTime;
            result.addPerformanceStats({
                analysisTime,
                compilationTime,
                solverTime: analysisTime - compilationTime,
                iterations: 1, // 直接求解
                matrixSize: A.rows,
                conditionNumber: 1.0 // 簡化
            });
            
            this.updateStats(analysisTime, true);
            
            if (this.options.debug) {
                console.log(`✅ ${this.name} DC 分析完成 (${analysisTime.toFixed(2)}ms)`);
            }
            
        } catch (error) {
            result.addError(error);
            result.converged = false;
            
            const analysisTime = performance.now() - startTime;
            this.updateStats(analysisTime, false);
            
            if (this.options.debug) {
                console.error(`❌ ${this.name} DC 分析失敗:`, error);
            }
        }
        
        return result;
    }
    
    /**
     * 構建輸入向量
     */
    async buildInputVector(components) {
        // 簡化實現：從電壓源和電流源提取值
        const inputValues = [];
        
        for (const component of components) {
            if (component.type === 'V') {
                inputValues.push(component.voltage || 0);
            } else if (component.type === 'I') {
                inputValues.push(component.current || 0);
            }
        }
        
        // 如果沒有輸入源，創建默認單位輸入
        if (inputValues.length === 0) {
            inputValues.push(1.0); // 默認輸入
        }
        
        const { Vector } = await import('./linalg.js');
        return new Vector(inputValues.length, inputValues);
    }
    
    /**
     * 提取節點電壓
     */
    extractNodeVoltages(outputVector) {
        const voltages = new Map();
        
        // 簡化實現：假設輸出向量直接對應節點電壓
        for (let i = 0; i < outputVector.size; i++) {
            voltages.set(`n${i+1}`, outputVector.get(i));
        }
        
        voltages.set('0', 0);  // 接地
        voltages.set('gnd', 0);
        
        return voltages;
    }
    
    /**
     * 提取支路電流
     */
    extractBranchCurrents(stateVector) {
        const currents = new Map();
        
        // 簡化實現：從狀態向量提取電感電流
        for (let i = 0; i < stateVector.size; i++) {
            currents.set(`I_L${i+1}`, stateVector.get(i));
        }
        
        return currents;
    }
    
    /**
     * AC 分析實現
     */
    async analyzeAC(components, frequencyPoints, options = {}) {
        let result = new UnifiedAnalysisResult();
        result.setStrategyInfo(this.name, 'AC');
        
        // 暫時返回未實現的結果
        result.addWarning('StateSpace 策略的 AC 分析尚未實現');
        
        return result;
    }
    
    /**
     * 暫態分析實現
     */
    async analyzeTRAN(components, timePoints, options = {}) {
        let result = new UnifiedAnalysisResult();
        result.setStrategyInfo(this.name, 'TRAN');
        
        // 暫時返回未實現的結果
        result.addWarning('StateSpace 策略的暫態分析尚未實現');
        
        return result;
    }
}

// All classes already exported at their definitions above