/**
 * 統一分析策略 - 策略模式實現
 * 
 * 這個模塊定義了所有分析策略的統一接口，並實現了兩個核心策略：
 * 1. ImplicitMNAStrategy - 隱式修正節點法（適用於非線性、剛性電路）
 * 2. StateSpaceStrategy - 狀態空間法（適用於線性時不變系統）
 * 
 * 每個策略都實現相同的接口，但內部使用不同的數學方法和求解器。
 * 這種設計實現了完全的算法解耦，為未來擴展奠定基礎。
 * 
 * @author AkingSPICE Team
 * @version 3.0
 */

import { AnalysisResult, createAnalysisResult } from './AnalysisResult.js';

/**
 * 抽象分析策略基類
 * 
 * 定義了所有策略必須實現的標準接口：
 * - analyzeDC(): DC 工作點分析
 * - analyzeTRAN(): 暫態分析  
 * - analyzeAC(): AC 小信號分析
 * - 通用的初始化、清理和狀態管理方法
 */
export class AnalysisStrategy {
    constructor(name, options = {}) {
        this.name = name;
        this.options = {
            debug: false,
            tolerance: 1e-9,
            maxIterations: 50,
            ...options
        };
        
        // 策略能力聲明
        this.capabilities = {
            supportsNonlinear: false,
            supportsTimeVarying: false,
            supportsLargeSignal: false,
            preferredCircuitTypes: [],
            scalabilityRating: 5 // 1-10
        };
        
        // 性能統計
        this.stats = {
            dcAnalyses: 0,
            tranAnalyses: 0,
            acAnalyses: 0,
            totalTime: 0,
            successRate: 0
        };
    }

    /**
     * DC 分析接口
     * @param {Circuit} circuit 電路對象
     * @param {Object} options 分析選項
     * @returns {Promise<AnalysisResult>} 分析結果
     */
    async analyzeDC(circuit, options = {}) {
        throw new Error(`${this.name} 必須實現 analyzeDC 方法`);
    }

    /**
     * 暫態分析接口
     * @param {Circuit} circuit 電路對象
     * @param {Object} options 分析選項 (tStart, tStop, tStep, etc.)
     * @returns {Promise<AnalysisResult>} 分析結果
     */
    async analyzeTRAN(circuit, options = {}) {
        throw new Error(`${this.name} 必須實現 analyzeTRAN 方法`);
    }

    /**
     * AC 分析接口
     * @param {Circuit} circuit 電路對象
     * @param {Object} options 分析選項 (fStart, fStop, points, etc.)
     * @returns {Promise<AnalysisResult>} 分析結果
     */
    async analyzeAC(circuit, options = {}) {
        throw new Error(`${this.name} 必須實現 analyzeAC 方法`);
    }

    /**
     * 檢查策略是否適合給定電路
     * @param {Circuit} circuit 電路對象
     * @param {string} analysisType 分析類型
     * @returns {Object} 適合度評估
     */
    assessSuitability(circuit, analysisType) {
        return {
            suitable: true,
            confidence: 0.5,
            reasons: ['通用策略']
        };
    }

    /**
     * 策略預熱（預編譯、緩存等）
     * @param {Circuit} circuit 電路對象
     */
    async warmUp(circuit) {
        // 默認實現：無操作
    }

    /**
     * 清理策略資源
     */
    cleanup() {
        // 默認實現：無操作
    }

    /**
     * 獲取策略統計信息
     */
    getStatistics() {
        return {
            name: this.name,
            capabilities: this.capabilities,
            stats: this.stats
        };
    }
}

/**
 * 隱式 MNA 策略
 * 
 * 基於修正節點分析法的隱式求解器，特點：
 * - 使用同倫延拓法和 Newton-Raphson 迭代求解非線性方程
 * - 支持所有類型的元件（線性、非線性、時變）
 * - 數值穩定性好，但計算複雜度較高
 * - 是處理複雜電路的「萬能」策略
 */
export class ImplicitMNAStrategy extends AnalysisStrategy {
    constructor(options = {}) {
        super('ImplicitMNA', options);
        
        // 聲明策略能力
        this.capabilities = {
            supportsNonlinear: true,
            supportsTimeVarying: true,
            supportsLargeSignal: true,
            preferredCircuitTypes: ['nonlinear', 'mixed', 'power'],
            scalabilityRating: 7
        };
        
        // 延遲加載依賴模塊
        this.dcSolver = null;
        this.tranSolver = null;
        this.acSolver = null;
    }

    /**
     * 延遲初始化求解器
     */
    async initializeSolvers() {
        if (!this.dcSolver) {
            const { EnhancedDCAnalysis } = await import('../analysis/enhanced-dc-clean.js');
            const { TransientAnalysis } = await import('../analysis/transient.js');
            const { ACAnalysis } = await import('../analysis/ac.js');
            
            this.dcSolver = new EnhancedDCAnalysis(this.options);
            this.tranSolver = new TransientAnalysis(this.options);
            this.acSolver = new ACAnalysis(this.options);
            
            if (this.options.debug) {
                console.log(`🔧 ${this.name} 求解器初始化完成`);
            }
        }
    }

    /**
     * DC 分析實現
     */
    async analyzeDC(circuit, options = {}) {
        const startTime = performance.now();
        const result = createAnalysisResult('DC');
        
        try {
            await this.initializeSolvers();
            
            if (this.options.debug) {
                console.log(`🔧 ${this.name} 策略執行 DC 分析...`);
            }

            // 執行增強型 DC 分析
            const dcResult = await this.dcSolver.analyze(circuit, options);
            
            // 轉換結果格式
            if (dcResult && dcResult.nodeVoltages) {
                for (const [node, voltage] of dcResult.nodeVoltages) {
                    result.setNodeVoltage(node, voltage);
                }
            }
            
            if (dcResult && dcResult.branchCurrents) {
                for (const [branch, current] of dcResult.branchCurrents) {
                    result.setBranchCurrent(branch, current);
                }
            }

            // 設置結果屬性
            result.converged = dcResult?.converged || false;
            result.iterations = dcResult?.iterations || 0;
            result.residual = dcResult?.residual || 0;

            // 性能統計
            const analysisTime = performance.now() - startTime;
            result.addPerformanceStats({
                analysisTime,
                solverTime: dcResult?.solverTime || analysisTime
            });

            this.updateStats('dc', analysisTime, result.converged);
            
            if (this.options.debug) {
                const status = result.converged ? '收斂' : '未收斂';
                console.log(`✅ ${this.name} DC 分析完成 (${analysisTime.toFixed(2)}ms)`);
                console.log(`   ${status}: ${result.converged}, 迭代: ${result.iterations}`);
            }

            return result;

        } catch (error) {
            result.addError(error);
            result.converged = false;
            
            const analysisTime = performance.now() - startTime;
            this.updateStats('dc', analysisTime, false);
            
            if (this.options.debug) {
                console.error(`❌ ${this.name} DC 分析失敗:`, error);
            }
            
            return result;
        }
    }

    /**
     * 暫態分析實現
     */
    async analyzeTRAN(circuit, options = {}) {
        const startTime = performance.now();
        const result = createAnalysisResult('TRAN');
        
        try {
            await this.initializeSolvers();
            
            if (this.options.debug) {
                console.log(`🔧 ${this.name} 策略執行暫態分析...`);
            }

            // 執行暫態分析
            const tranResult = await this.tranSolver.analyze(circuit, options);
            
            // 轉換時域數據
            if (tranResult && tranResult.timePoints) {
                for (let i = 0; i < tranResult.timePoints.length; i++) {
                    const time = tranResult.timePoints[i];
                    const voltages = new Map();
                    const currents = new Map();
                    
                    // 提取該時間點的數據
                    if (tranResult.voltageHistory) {
                        for (const [node, history] of tranResult.voltageHistory) {
                            voltages.set(node, history[i] || 0);
                        }
                    }
                    
                    if (tranResult.currentHistory) {
                        for (const [branch, history] of tranResult.currentHistory) {
                            currents.set(branch, history[i] || 0);
                        }
                    }
                    
                    result.addTimePoint(time, voltages, currents);
                }
            }

            result.converged = tranResult?.converged || false;
            
            const analysisTime = performance.now() - startTime;
            result.addPerformanceStats({
                analysisTime,
                solverTime: tranResult?.solverTime || analysisTime
            });

            this.updateStats('tran', analysisTime, result.converged);
            
            return result;

        } catch (error) {
            result.addError(error);
            result.converged = false;
            
            const analysisTime = performance.now() - startTime;
            this.updateStats('tran', analysisTime, false);
            
            return result;
        }
    }

    /**
     * AC 分析實現
     */
    async analyzeAC(circuit, options = {}) {
        const startTime = performance.now();
        const result = createAnalysisResult('AC');
        
        try {
            await this.initializeSolvers();
            
            if (this.options.debug) {
                console.log(`🔧 ${this.name} 策略執行 AC 分析...`);
            }

            // 執行 AC 分析
            const acResult = await this.acSolver.analyze(circuit, options);
            
            // 轉換頻域數據
            if (acResult && acResult.frequencies) {
                for (let i = 0; i < acResult.frequencies.length; i++) {
                    const freq = acResult.frequencies[i];
                    const magnitudes = new Map();
                    const phases = new Map();
                    
                    if (acResult.magnitudeResponse) {
                        for (const [node, response] of acResult.magnitudeResponse) {
                            magnitudes.set(node, response[i] || 0);
                        }
                    }
                    
                    if (acResult.phaseResponse) {
                        for (const [node, response] of acResult.phaseResponse) {
                            phases.set(node, response[i] || 0);
                        }
                    }
                    
                    result.addFrequencyPoint(freq, magnitudes, phases);
                }
            }

            result.converged = acResult?.converged || false;
            
            const analysisTime = performance.now() - startTime;
            result.addPerformanceStats({
                analysisTime,
                solverTime: acResult?.solverTime || analysisTime
            });

            this.updateStats('ac', analysisTime, result.converged);
            
            return result;

        } catch (error) {
            result.addError(error);
            result.converged = false;
            
            const analysisTime = performance.now() - startTime;
            this.updateStats('ac', analysisTime, false);
            
            return result;
        }
    }

    /**
     * 適合度評估
     */
    assessSuitability(circuit, analysisType) {
        const components = circuit.components || [];
        let nonlinearCount = 0;
        let totalCount = components.length;
        
        for (const comp of components) {
            if (['D', 'Q', 'M', 'S', 'W'].includes(comp.type)) {
                nonlinearCount++;
            }
        }

        const nonlinearRatio = totalCount > 0 ? nonlinearCount / totalCount : 0;
        
        let confidence = 0.7; // 基准信心度
        const reasons = [];

        if (nonlinearRatio > 0.1) {
            confidence += 0.2;
            reasons.push('含有非線性元件');
        }

        if (totalCount > 50) {
            confidence += 0.1;
            reasons.push('大規模電路');
        }

        if (analysisType === 'TRAN' && nonlinearRatio > 0) {
            confidence += 0.1;
            reasons.push('非線性暫態分析');
        }

        return {
            suitable: confidence > 0.5,
            confidence: Math.min(1.0, confidence),
            reasons: reasons.length > 0 ? reasons : ['通用 MNA 求解器']
        };
    }

    /**
     * 更新統計
     */
    updateStats(analysisType, time, success) {
        this.stats[`${analysisType}Analyses`]++;
        this.stats.totalTime += time;
        
        const totalAnalyses = this.stats.dcAnalyses + this.stats.tranAnalyses + this.stats.acAnalyses;
        if (success && totalAnalyses > 0) {
            this.stats.successRate = (this.stats.successRate * (totalAnalyses - 1) + 1) / totalAnalyses;
        } else if (totalAnalyses > 0) {
            this.stats.successRate = this.stats.successRate * (totalAnalyses - 1) / totalAnalyses;
        }
    }
}

/**
 * 狀態空間策略
 * 
 * 基於狀態空間表示的求解器，特點：
 * - 將電路編譯為 dx/dt = Ax + Bu, y = Cx + Du 形式
 * - 對線性時不變電路性能極佳
 * - 支持高效的時域和頻域分析
 * - 不支持非線性元件
 */
export class StateSpaceStrategy extends AnalysisStrategy {
    constructor(options = {}) {
        super('StateSpace', options);
        
        // 聲明策略能力
        this.capabilities = {
            supportsNonlinear: false,
            supportsTimeVarying: false,
            supportsLargeSignal: false,
            preferredCircuitTypes: ['linear', 'lti', 'filters'],
            scalabilityRating: 9
        };
        
        // 編譯器和求解器
        this.compiler = null;
        this.odeSolver = null;
        this.compiledCircuits = new Map(); // 編譯結果緩存
    }

    /**
     * 延遲初始化
     */
    async initializeSolvers() {
        if (!this.compiler) {
            const { StateSpaceMNACompiler } = await import('./state-space-mna-compiler.js');
            const { StateSpaceODESolver } = await import('./state-space-ode-solver.js');
            
            this.compiler = new StateSpaceMNACompiler(this.options);
            this.odeSolver = new StateSpaceODESolver(this.options);
            
            if (this.options.debug) {
                console.log(`🔧 ${this.name} 編譯器和求解器初始化完成`);
            }
        }
    }

    /**
     * DC 分析實現
     */
    async analyzeDC(circuit, options = {}) {
        const startTime = performance.now();
        const result = createAnalysisResult('DC');
        
        try {
            await this.initializeSolvers();
            
            if (this.options.debug) {
                console.log(`🔧 ${this.name} 策略執行 DC 分析...`);
            }

            // 編譯電路為狀態空間形式
            const compilationStartTime = performance.now();
            const stateSpace = await this.compileCircuit(circuit);
            const compilationTime = performance.now() - compilationStartTime;
            
            if (!stateSpace) {
                throw new Error('電路編譯為狀態空間失敗');
            }

            // DC 分析：求解 Ax = -Bu (穩態解)
            const dcSolution = await this.solveDCSteadyState(stateSpace);
            
            // 轉換結果
            this.extractDCResults(dcSolution, stateSpace, result);
            
            result.converged = true;
            
            const analysisTime = performance.now() - startTime;
            result.addPerformanceStats({
                analysisTime,
                compilationTime,
                solverTime: analysisTime - compilationTime
            });

            this.updateStats('dc', analysisTime, true);
            
            if (this.options.debug) {
                console.log(`✅ ${this.name} DC 分析完成 (${analysisTime.toFixed(2)}ms)`);
                console.log(`   編譯: ${compilationTime.toFixed(2)}ms, 求解: ${(analysisTime - compilationTime).toFixed(2)}ms`);
            }
            
            return result;

        } catch (error) {
            result.addError(error);
            result.converged = false;
            
            const analysisTime = performance.now() - startTime;
            this.updateStats('dc', analysisTime, false);
            
            if (this.options.debug) {
                console.error(`❌ ${this.name} DC 分析失敗:`, error);
            }
            
            return result;
        }
    }

    /**
     * 暫態分析實現
     */
    async analyzeTRAN(circuit, options = {}) {
        const startTime = performance.now();
        const result = createAnalysisResult('TRAN');
        
        try {
            await this.initializeSolvers();
            
            if (this.options.debug) {
                console.log(`🔧 ${this.name} 策略執行暫態分析...`);
            }

            // 編譯電路
            const compilationStartTime = performance.now();
            const stateSpace = await this.compileCircuit(circuit);
            const compilationTime = performance.now() - compilationStartTime;
            
            if (!stateSpace) {
                throw new Error('電路編譯為狀態空間失敗');
            }

            // 時域求解
            const tranResult = await this.odeSolver.solve(stateSpace, options);
            
            // 轉換時域數據
            this.extractTransientResults(tranResult, stateSpace, result);
            
            result.converged = tranResult.converged || true;
            
            const analysisTime = performance.now() - startTime;
            result.addPerformanceStats({
                analysisTime,
                compilationTime,
                solverTime: analysisTime - compilationTime
            });

            this.updateStats('tran', analysisTime, result.converged);
            
            return result;

        } catch (error) {
            result.addError(error);
            result.converged = false;
            
            const analysisTime = performance.now() - startTime;
            this.updateStats('tran', analysisTime, false);
            
            return result;
        }
    }

    /**
     * AC 分析實現
     */
    async analyzeAC(circuit, options = {}) {
        const startTime = performance.now();
        const result = createAnalysisResult('AC');
        
        try {
            await this.initializeSolvers();
            
            // 編譯電路
            const stateSpace = await this.compileCircuit(circuit);
            
            if (!stateSpace) {
                throw new Error('電路編譯為狀態空間失敗');
            }

            // 頻域分析：H(s) = C(sI - A)^(-1)B + D
            const acResult = await this.solveACResponse(stateSpace, options);
            
            // 轉換頻域數據
            this.extractACResults(acResult, stateSpace, result);
            
            result.converged = true;
            
            const analysisTime = performance.now() - startTime;
            result.addPerformanceStats({ analysisTime });

            this.updateStats('ac', analysisTime, true);
            
            return result;

        } catch (error) {
            result.addError(error);
            result.converged = false;
            
            const analysisTime = performance.now() - startTime;
            this.updateStats('ac', analysisTime, false);
            
            return result;
        }
    }

    /**
     * 電路編譯（帶緩存）
     */
    async compileCircuit(circuit) {
        const circuitHash = this.hashCircuit(circuit);
        
        if (this.compiledCircuits.has(circuitHash)) {
            if (this.options.debug) {
                console.log('💾 使用緩存的編譯結果');
            }
            return this.compiledCircuits.get(circuitHash);
        }

        if (this.options.debug) {
            console.log(`🔧 ${this.name} 策略編譯電路為狀態空間...`);
        }

        // 提取 components 數組
        const components = circuit.components || [];
        
        // 自動檢測狀態變量（電容電壓和電感電流）
        const stateVariables = [];
        const inputVariables = [];
        const outputVariables = [];
        
        for (const comp of components) {
            switch (comp.type) {
                case 'C':
                    stateVariables.push(`V_${comp.name}`); // 電容電壓為狀態變量
                    break;
                case 'L':
                    stateVariables.push(`I_${comp.name}`); // 電感電流為狀態變量
                    break;
                case 'V':
                case 'I':
                    inputVariables.push(comp.name); // 電源為輸入
                    break;
            }
        }
        
        // 所有節點電壓為輸出
        const nodeSet = new Set();
        for (const comp of components) {
            if (comp.nodes) {
                comp.nodes.forEach(node => nodeSet.add(node));
            }
        }
        outputVariables.push(...nodeSet);

        const stateSpace = await this.compiler.compile(components, stateVariables, inputVariables, outputVariables);
        
        // 緩存結果
        this.compiledCircuits.set(circuitHash, stateSpace);
        
        if (this.options.debug) {
            console.log(`✅ 狀態空間編譯完成`);
            console.log(`   狀態維度: ${stateSpace.A.rows}×${stateSpace.A.cols}`);
            console.log(`   輸入維度: ${stateSpace.B.cols}`);
            console.log(`   輸出維度: ${stateSpace.C.rows}`);
        }
        
        return stateSpace;
    }

    /**
     * 求解 DC 穩態
     */
    async solveDCSteadyState(stateSpace) {
        // DC 穩態：dx/dt = 0, 因此 0 = Ax + Bu, y = Cx + Du
        // 解得 x = -A^(-1)Bu, y = C(-A^(-1)Bu) + Du = (-CA^(-1)B + D)u
        
        const { A, B, C, D } = stateSpace;
        
        // 計算 A 的逆矩陣
        const A_inv = A.inverse();
        
        // 假設單位輸入 u = [1, 0, ...]
        const { Matrix } = await import('./linalg.js');
        const u = new Matrix(B.cols, 1);
        u.set(0, 0, 1.0); // 單位階躍輸入
        
        // 計算狀態變量：x = -A^(-1)Bu
        const Bu = B.multiply(u);
        const ABu = A_inv.multiply(Bu);
        
        // 手動實現 scale(-1)
        const x = new Matrix(ABu.rows, ABu.cols);
        for (let i = 0; i < ABu.rows; i++) {
            for (let j = 0; j < ABu.cols; j++) {
                x.set(i, j, -ABu.get(i, j));
            }
        }
        
        // 計算輸出：y = Cx + Du
        const y = C.multiply(x).add(D.multiply(u));
        
        return { x, y, u };
    }

    /**
     * 求解 AC 響應
     */
    async solveACResponse(stateSpace, options) {
        const { fStart = 1, fStop = 1e6, points = 100 } = options;
        const logStart = Math.log10(fStart);
        const logStop = Math.log10(fStop);
        const logStep = (logStop - logStart) / (points - 1);
        
        const frequencies = [];
        const responses = [];
        
        for (let i = 0; i < points; i++) {
            const logF = logStart + i * logStep;
            const f = Math.pow(10, logF);
            const omega = 2 * Math.PI * f;
            
            frequencies.push(f);
            
            // 計算 H(jω) = C(jωI - A)^(-1)B + D
            const response = await this.computeFrequencyResponse(stateSpace, omega);
            responses.push(response);
        }
        
        return { frequencies, responses };
    }

    /**
     * 計算頻率響應
     */
    async computeFrequencyResponse(stateSpace, omega) {
        const { A, B, C, D } = stateSpace;
        const { Matrix, Complex } = await import('./linalg.js');
        
        // 構建 jωI - A
        const jwI_minus_A = Matrix.eye(A.rows).scale(new Complex(0, omega)).subtract(A);
        
        // 計算 (jωI - A)^(-1)
        const inv = jwI_minus_A.inverse();
        
        // H(jω) = C(jωI - A)^(-1)B + D
        const H = C.multiply(inv).multiply(B).add(D);
        
        return H;
    }

    /**
     * 提取 DC 結果
     */
    extractDCResults(dcSolution, stateSpace, result) {
        const { y } = dcSolution;
        
        // 將輸出向量映射回節點電壓
        for (let i = 0; i < y.rows; i++) {
            const voltage = y.get(i, 0);
            const nodeName = stateSpace.outputNodes ? stateSpace.outputNodes[i] : `n${i}`;
            result.setNodeVoltage(nodeName, voltage);
        }
    }

    /**
     * 提取暫態結果
     */
    extractTransientResults(tranResult, stateSpace, result) {
        const { timePoints, stateHistory, outputHistory } = tranResult;
        
        for (let i = 0; i < timePoints.length; i++) {
            const time = timePoints[i];
            const voltages = new Map();
            
            // 從輸出歷史提取節點電壓
            if (outputHistory && outputHistory[i]) {
                const outputs = outputHistory[i];
                for (let j = 0; j < outputs.length; j++) {
                    const nodeName = stateSpace.outputNodes ? stateSpace.outputNodes[j] : `n${j}`;
                    voltages.set(nodeName, outputs[j]);
                }
            }
            
            result.addTimePoint(time, voltages);
        }
    }

    /**
     * 提取 AC 結果
     */
    extractACResults(acResult, stateSpace, result) {
        const { frequencies, responses } = acResult;
        
        for (let i = 0; i < frequencies.length; i++) {
            const freq = frequencies[i];
            const H = responses[i];
            const magnitudes = new Map();
            const phases = new Map();
            
            // 提取每個輸出的幅度和相位
            for (let j = 0; j < H.rows; j++) {
                for (let k = 0; k < H.cols; k++) {
                    const response = H.get(j, k);
                    const nodeName = stateSpace.outputNodes ? stateSpace.outputNodes[j] : `n${j}`;
                    
                    magnitudes.set(nodeName, response.magnitude());
                    phases.set(nodeName, response.phase());
                }
            }
            
            result.addFrequencyPoint(freq, magnitudes, phases);
        }
    }

    /**
     * 適合度評估
     */
    assessSuitability(circuit, analysisType) {
        const components = circuit.components || [];
        let linearCount = 0;
        let reactiveCount = 0;
        let nonlinearCount = 0;
        
        for (const comp of components) {
            switch (comp.type) {
                case 'R':
                case 'V':
                case 'I':
                    linearCount++;
                    break;
                case 'C':
                case 'L':
                    linearCount++;
                    reactiveCount++;
                    break;
                case 'D':
                case 'Q':
                case 'M':
                case 'S':
                case 'W':
                    nonlinearCount++;
                    break;
                default:
                    linearCount++;
            }
        }

        const isLinear = nonlinearCount === 0;
        const hasReactive = reactiveCount > 0;
        const totalCount = components.length;
        
        let confidence = 0.3; // 基准信心度
        const reasons = [];

        if (isLinear) {
            confidence += 0.4;
            reasons.push('純線性電路');
        } else {
            confidence = 0.1; // 非線性電路不適合
            reasons.push('包含非線性元件（不支持）');
        }

        if (hasReactive) {
            confidence += 0.2;
            reasons.push('含有儲能元件');
        }

        if (analysisType === 'TRAN' && isLinear) {
            confidence += 0.2;
            reasons.push('線性暫態分析優勢');
        }

        if (totalCount > 20 && isLinear) {
            confidence += 0.1;
            reasons.push('大規模線性電路');
        }

        return {
            suitable: confidence > 0.5 && isLinear,
            confidence: Math.min(1.0, confidence),
            reasons
        };
    }

    /**
     * 電路哈希（簡化版）
     */
    hashCircuit(circuit) {
        const components = circuit.components || [];
        const signature = components.map(comp => 
            `${comp.type}_${comp.nodes?.join(',')}_${comp.value}`
        ).sort().join('|');
        
        return btoa(signature).slice(0, 16);
    }

    /**
     * 更新統計
     */
    updateStats(analysisType, time, success) {
        this.stats[`${analysisType}Analyses`]++;
        this.stats.totalTime += time;
        
        const totalAnalyses = this.stats.dcAnalyses + this.stats.tranAnalyses + this.stats.acAnalyses;
        if (success && totalAnalyses > 0) {
            this.stats.successRate = (this.stats.successRate * (totalAnalyses - 1) + 1) / totalAnalyses;
        } else if (totalAnalyses > 0) {
            this.stats.successRate = this.stats.successRate * (totalAnalyses - 1) / totalAnalyses;
        }
    }
}

/**
 * 策略工廠 - 根據名稱創建策略實例
 */
export function createStrategy(name, options = {}) {
    switch (name.toLowerCase()) {
        case 'implicit':
        case 'implicitmna':
            return new ImplicitMNAStrategy(options);
        
        case 'statespace':
        case 'state-space':
            return new StateSpaceStrategy(options);
        
        default:
            throw new Error(`未知的策略類型: ${name}`);
    }
}

/**
 * 獲取所有可用策略
 */
export function getAvailableStrategies() {
    return [
        {
            name: 'ImplicitMNA',
            description: '隱式修正節點法 - 通用非線性求解器',
            capabilities: ['nonlinear', 'time-varying', 'large-signal']
        },
        {
            name: 'StateSpace',
            description: '狀態空間法 - 高效線性求解器',
            capabilities: ['linear', 'time-invariant', 'fast-transient']
        }
    ];
}