/**
 * JSSolver-PE 主求解器類別
 * 
 * 這是使用者的主要介面，整合了網表解析、電路分析和結果管理
 */

import { NetlistParser } from '../parser/netlist.js';
import { TransientAnalysis, TransientUtils, TransientResult } from '../analysis/transient.js';
import { DCAnalysis } from '../analysis/dc.js';

/**
 * JSSolver-PE 主求解器
 */
export class JSSolverPE {
    constructor(netlist = null) {
        this.parser = new NetlistParser();
        this.transientAnalysis = new TransientAnalysis();
        this.dcAnalysis = new DCAnalysis();
        
        // 電路數據
        this.components = [];
        this.models = new Map();
        this.parameters = new Map();
        this.analyses = [];
        this.options = new Map();
        
        // 分析結果
        this.results = new Map();
        this.lastResult = null;
        
        // 狀態信息
        this.isInitialized = false;
        this.debug = false;
        
        // 如果提供了網表，立即解析
        if (netlist) {
            this.loadNetlist(netlist);
        }
    }

    /**
     * 載入並解析網表
     * @param {string} netlistText 網表文本
     * @returns {Object} 解析結果統計
     */
    loadNetlist(netlistText) {
        console.log('Loading netlist...');
        
        try {
            const parseResult = this.parser.parse(netlistText);
            
            this.components = parseResult.components;
            this.models = parseResult.models;
            this.parameters = parseResult.parameters;
            this.analyses = parseResult.analyses;
            this.options = parseResult.options;
            
            this.isInitialized = true;
            
            if (this.debug) {
                this.parser.printReport();
            }
            
            console.log(`Netlist loaded: ${this.components.length} components`);
            return parseResult.stats;
            
        } catch (error) {
            console.error('Failed to load netlist:', error);
            throw error;
        }
    }

    /**
     * 執行分析 (批次模式 API)
     * @param {string} analysisCommand 分析指令 (如 '.tran 1us 1ms')
     * @returns {Object} 分析結果
     */
    async runAnalysis(analysisCommand = null) {
        if (!this.isInitialized) {
            throw new Error('No netlist loaded. Call loadNetlist() first.');
        }

        // 如果提供了分析指令，解析它
        if (analysisCommand) {
            const cmd = analysisCommand.trim().toLowerCase();
            
            if (cmd.startsWith('.tran')) {
                return await this.runTransientAnalysis(analysisCommand);
            } else if (cmd.startsWith('.dc') || cmd.startsWith('.op')) {
                return await this.runDCAnalysis();
            } else {
                throw new Error(`Unsupported analysis command: ${analysisCommand}`);
            }
        }

        // 如果沒有提供指令，查看網表中是否有分析指令
        if (this.analyses.length > 0) {
            const analysis = this.analyses[0]; // 使用第一個分析指令
            
            if (analysis.type === 'TRAN') {
                const tranCommand = `.tran ${analysis.tstep} ${analysis.tstop} ${analysis.tstart || '0'} ${analysis.tmax || analysis.tstep}`;
                return await this.runTransientAnalysis(tranCommand);
            } else if (analysis.type === 'DC') {
                return await this.runDCAnalysis();
            }
        }

        // 預設執行DC分析
        console.log('No analysis specified, running DC analysis');
        return await this.runDCAnalysis();
    }

    /**
     * 執行暫態分析
     * @param {string} tranCommand 暫態分析指令
     * @returns {Object} 暫態分析結果
     */
    async runTransientAnalysis(tranCommand) {
        console.log(`Running transient analysis: ${tranCommand}`);
        
        try {
            // 解析暫態分析參數
            const params = TransientUtils.parseTranCommand(tranCommand);
            params.debug = this.debug;
            
            // 執行分析
            const result = await this.transientAnalysis.run(this.components, params);
            
            // 保存結果
            this.results.set('tran', result);
            this.lastResult = result;
            
            console.log(`Transient analysis completed: ${result.timeVector.length} time points`);
            return result;
            
        } catch (error) {
            console.error('Transient analysis failed:', error);
            throw error;
        }
    }

    /**
     * 執行DC分析
     * @returns {Object} DC分析結果
     */
    async runDCAnalysis() {
        console.log('Running DC analysis...');
        
        try {
            const options = { debug: this.debug };
            const result = await this.dcAnalysis.run(this.components, options);
            
            // 保存結果
            this.results.set('dc', result);
            this.lastResult = result;
            
            console.log('DC analysis completed');
            return result;
            
        } catch (error) {
            console.error('DC analysis failed:', error);
            throw error;
        }
    }

    /**
     * 獲取分析結果
     * @param {string} analysisType 分析類型 ('tran', 'dc')
     * @returns {Object} 分析結果
     */
    getResult(analysisType = null) {
        if (analysisType) {
            return this.results.get(analysisType);
        }
        return this.lastResult;
    }

    /**
     * 獲取電路信息
     * @returns {Object} 電路信息
     */
    getCircuitInfo() {
        return {
            componentCount: this.components.length,
            components: this.components.map(comp => ({
                name: comp.name,
                type: comp.type,
                nodes: comp.nodes,
                value: comp.value
            })),
            nodeList: this.getNodeList(),
            modelCount: this.models.size,
            parameterCount: this.parameters.size,
            analysisCount: this.analyses.length,
            isInitialized: this.isInitialized
        };
    }

    /**
     * 獲取所有節點列表
     * @returns {string[]} 節點名稱列表
     */
    getNodeList() {
        const nodeSet = new Set();
        
        for (const component of this.components) {
            if (component.nodes) {
                for (const node of component.nodes) {
                    nodeSet.add(node);
                }
            }
        }
        
        return Array.from(nodeSet).sort();
    }

    /**
     * 設置調試模式
     * @param {boolean} enabled 是否啟用調試
     */
    setDebug(enabled) {
        this.debug = enabled;
        this.transientAnalysis.setDebug(enabled);
        this.dcAnalysis.setDebug(enabled);
    }

    /**
     * 驗證電路
     * @returns {Object} 驗證結果
     */
    validateCircuit() {
        const issues = [];
        const warnings = [];
        
        // 檢查基本問題
        if (this.components.length === 0) {
            issues.push('No components found in circuit');
            return { valid: false, issues, warnings };
        }
        
        // 檢查每個元件
        for (const component of this.components) {
            if (!component.isValid()) {
                issues.push(`Invalid component: ${component.name}`);
            }
            
            // 檢查節點連接
            for (const node of component.nodes) {
                if (!node || typeof node !== 'string') {
                    issues.push(`Invalid node in component ${component.name}: ${node}`);
                }
            }
            
            // 檢查元件值
            if (component.value === 0 && (component.type === 'R' || component.type === 'L' || component.type === 'C')) {
                warnings.push(`Zero value in ${component.name} may cause numerical issues`);
            }
        }
        
        // 檢查接地節點
        const nodes = this.getNodeList();
        const hasGround = nodes.includes('0') || nodes.includes('gnd') || nodes.includes('GND');
        if (!hasGround) {
            warnings.push('No ground node (0 or gnd) found - circuit may be floating');
        }
        
        // 檢查獨立節點
        const nodeConnections = new Map();
        for (const component of this.components) {
            for (const node of component.nodes) {
                nodeConnections.set(node, (nodeConnections.get(node) || 0) + 1);
            }
        }
        
        for (const [node, connectionCount] of nodeConnections) {
            if (connectionCount === 1 && node !== '0' && node !== 'gnd') {
                warnings.push(`Node ${node} has only one connection`);
            }
        }
        
        return {
            valid: issues.length === 0,
            issues,
            warnings,
            componentCount: this.components.length,
            nodeCount: nodes.length
        };
    }

    /**
     * 打印電路摘要
     */
    printCircuitSummary() {
        console.log('\\n=== Circuit Summary ===');
        
        const info = this.getCircuitInfo();
        console.log(`Components: ${info.componentCount}`);
        console.log(`Nodes: ${info.nodeList.length}`);
        console.log(`Models: ${info.modelCount}`);
        console.log(`Parameters: ${info.parameterCount}`);
        
        // 按類型統計元件
        const componentTypes = {};
        for (const comp of this.components) {
            componentTypes[comp.type] = (componentTypes[comp.type] || 0) + 1;
        }
        
        console.log('\\nComponent breakdown:');
        for (const [type, count] of Object.entries(componentTypes)) {
            console.log(`  ${type}: ${count}`);
        }
        
        console.log('\\nNodes:', info.nodeList.join(', '));
        
        // 驗證電路
        const validation = this.validateCircuit();
        console.log(`\\nValidation: ${validation.valid ? 'PASSED' : 'FAILED'}`);
        
        if (validation.issues.length > 0) {
            console.log('Issues:');
            validation.issues.forEach(issue => console.log(`  - ${issue}`));
        }
        
        if (validation.warnings.length > 0) {
            console.log('Warnings:');
            validation.warnings.forEach(warning => console.log(`  - ${warning}`));
        }
        
        console.log('=======================\\n');
    }

    /**
     * 重置求解器
     */
    reset() {
        this.components = [];
        this.models.clear();
        this.parameters.clear();
        this.analyses = [];
        this.options.clear();
        this.results.clear();
        this.lastResult = null;
        this.isInitialized = false;
        this.parser.reset();
    }

    // ==================== 步進式模擬控制 API ====================
    
    /**
     * 初始化步進式暫態分析
     * @param {Object} params 參數 {startTime, stopTime, timeStep, maxIterations}
     * @returns {boolean} 初始化是否成功
     */
    async initSteppedTransient(params = {}) {
        try {
            if (!this.isInitialized) {
                throw new Error('Circuit not initialized. Load a netlist first.');
            }

            // 設置默認參數
            this.steppedParams = {
                startTime: params.startTime || 0,
                stopTime: params.stopTime || 1e-3,  // 1ms
                timeStep: params.timeStep || 1e-6,   // 1μs
                maxIterations: params.maxIterations || 10
            };

            // 先設置參數再初始化
            this.transientAnalysis.setParameters({
                timeStep: this.steppedParams.timeStep,
                startTime: this.steppedParams.startTime,
                stopTime: this.steppedParams.stopTime,
                maxIterations: this.steppedParams.maxIterations
            });
            
            // 創建 result 對象
            this.transientAnalysis.result = new TransientResult();
            
            // 初始化暫態分析
            await this.transientAnalysis.initialize(this.components, this.steppedParams.timeStep);
            
            // 重置狀態
            this.currentTime = this.steppedParams.startTime;
            this.currentIteration = 0;
            this.isSteppedMode = true;
            this.steppedResults = {
                time: [],
                voltages: [],
                currents: [],
                componentStates: []
            };

            console.log(`步進式暫態分析初始化完成:`);
            console.log(`  時間範圍: ${this.steppedParams.startTime}s 到 ${this.steppedParams.stopTime}s`);
            console.log(`  時間步長: ${this.steppedParams.timeStep}s`);
            console.log(`  最大迭代數: ${this.steppedParams.maxIterations}`);

            return true;

        } catch (error) {
            console.error(`步進式暫態分析初始化失敗: ${error.message}`);
            return false;
        }
    }

    /**
     * 執行一個時間步
     * @param {Object} controlInputs 控制輸入 {gateName: state, ...}
     * @returns {Object} 當前時間步的結果
     */
    step(controlInputs = {}) {
        if (!this.isSteppedMode) {
            throw new Error('Step mode not initialized. Call initSteppedTransient() first.');
        }

        if (this.isFinished()) {
            console.warn('Simulation already finished');
            return null;
        }

        try {
            // 更新控制輸入 (如 MOSFET 開關狀態)
            this.updateControlInputs(controlInputs);
            
            // 執行一個時間步
            const stepResult = this.transientAnalysis.solveTimeStep(
                this.currentTime, 
                this.steppedParams.maxIterations
            );

            // 記錄結果 - 將 Map 轉換為普通物件
            const nodeVoltagesObj = Object.fromEntries(stepResult.nodeVoltages);
            const branchCurrentsObj = Object.fromEntries(stepResult.branchCurrents);
            
            this.steppedResults.time.push(this.currentTime);
            this.steppedResults.voltages.push({...nodeVoltagesObj});
            this.steppedResults.currents.push({...branchCurrentsObj});
            
            // 記錄元件狀態 (特別是 MOSFET 等可控元件)
            const componentStates = {};
            for (const component of this.components) {
                if (component.getOperatingStatus) {
                    componentStates[component.name] = component.getOperatingStatus();
                }
            }
            this.steppedResults.componentStates.push(componentStates);

            // 準備下一步
            this.currentTime += this.steppedParams.timeStep;
            this.currentIteration++;

            // 返回當前步驟的結果 - 將 Map 轉換為普通物件
            return {
                time: this.currentTime - this.steppedParams.timeStep,
                iteration: this.currentIteration - 1,
                nodeVoltages: Object.fromEntries(stepResult.nodeVoltages),
                branchCurrents: Object.fromEntries(stepResult.branchCurrents),
                componentStates: componentStates,
                converged: stepResult.converged
            };

        } catch (error) {
            console.error(`Time step ${this.currentIteration} failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * 檢查模擬是否完成
     * @returns {boolean} 是否完成
     */
    isFinished() {
        return this.isSteppedMode && (this.currentTime >= this.steppedParams.stopTime);
    }

    /**
     * 獲取當前模擬時間
     * @returns {number} 當前時間 (秒)
     */
    getCurrentTime() {
        return this.currentTime || 0;
    }

    /**
     * 更新控制輸入 (如 MOSFET 閘極狀態)
     * @param {Object} controlInputs 控制輸入映射 {componentName: state, ...}
     */
    updateControlInputs(controlInputs) {
        for (const [componentName, state] of Object.entries(controlInputs)) {
            const component = this.components.find(c => c.name === componentName);
            if (component && component.setGateState) {
                component.setGateState(state);
                if (this.debug) {
                    console.log(`Updated ${componentName} gate state: ${state ? 'ON' : 'OFF'}`);
                }
            } else if (component && component.setValue) {
                // 支援其他類型的控制輸入
                component.setValue(state);
            }
        }
    }

    /**
     * 設置特定元件的閘極狀態 (便捷方法)
     * @param {string} componentName 元件名稱
     * @param {boolean} state 閘極狀態
     */
    setGateState(componentName, state) {
        this.updateControlInputs({[componentName]: state});
    }

    /**
     * 獲取節點電壓
     * @param {string} nodeName 節點名稱
     * @returns {number} 電壓值 (V)
     */
    getVoltage(nodeName) {
        if (!this.isSteppedMode || this.steppedResults.voltages.length === 0) {
            return 0;
        }
        
        const lastVoltages = this.steppedResults.voltages[this.steppedResults.voltages.length - 1];
        return lastVoltages[nodeName] || 0;
    }

    /**
     * 獲取支路電流 (通過元件)
     * @param {string} componentName 元件名稱  
     * @returns {number} 電流值 (A)
     */
    getCurrent(componentName) {
        if (!this.isSteppedMode || this.steppedResults.currents.length === 0) {
            return 0;
        }
        
        const lastCurrents = this.steppedResults.currents[this.steppedResults.currents.length - 1];
        return lastCurrents[componentName] || 0;
    }

    /**
     * 獲取元件工作狀態
     * @param {string} componentName 元件名稱
     * @returns {Object} 元件狀態
     */
    getComponentState(componentName) {
        if (!this.isSteppedMode || this.steppedResults.componentStates.length === 0) {
            return null;
        }
        
        const lastStates = this.steppedResults.componentStates[this.steppedResults.componentStates.length - 1];
        return lastStates[componentName] || null;
    }

    /**
     * 獲取完整的步進式模擬結果
     * @returns {Object} 完整結果
     */
    getSteppedResults() {
        return this.isSteppedMode ? this.steppedResults : null;
    }

    /**
     * 運行完整的步進式模擬 (帶控制函數)
     * @param {Function} controlFunction 控制函數 (time) => {componentName: state, ...}
     * @param {Object} params 模擬參數
     * @returns {Object} 完整模擬結果
     */
    async runSteppedSimulation(controlFunction, params = {}) {
        console.log('開始步進式模擬...');
        
        if (!(await this.initSteppedTransient(params))) {
            throw new Error('Failed to initialize stepped simulation');
        }

        const results = [];
        let stepCount = 0;

        while (!this.isFinished()) {
            // 獲取當前時間的控制輸入
            const controlInputs = controlFunction ? controlFunction(this.currentTime) : {};
            
            // 執行一步
            const stepResult = this.step(controlInputs);
            if (stepResult) {
                results.push(stepResult);
                stepCount++;

                // 進度報告
                if (stepCount % 1000 === 0) {
                    const progress = ((this.currentTime - this.steppedParams.startTime) / 
                                    (this.steppedParams.stopTime - this.steppedParams.startTime)) * 100;
                    console.log(`模擬進度: ${progress.toFixed(1)}% (${stepCount} steps)`);
                }
            }
        }

        console.log(`步進式模擬完成: ${stepCount} 個時間步`);
        return {
            steps: results,
            summary: {
                totalSteps: stepCount,
                simulationTime: this.steppedParams.stopTime - this.steppedParams.startTime,
                timeStep: this.steppedParams.timeStep
            }
        };
    }

    /**
     * 重置步進式模擬狀態
     */
    resetSteppedMode() {
        this.isSteppedMode = false;
        this.currentTime = 0;
        this.currentIteration = 0;
        this.steppedParams = null;
        this.steppedResults = null;
    }

    /**
     * 獲取求解器版本信息
     * @returns {Object} 版本信息
     */
    static getVersionInfo() {
        return {
            name: 'JSSolver-PE',
            version: '0.1.0',
            description: 'JavaScript Solver for Power Electronics',
            features: [
                'Modified Nodal Analysis (MNA)',
                'LU decomposition solver',
                'Backward Euler transient analysis',
                'DC operating point analysis',
                'SPICE-compatible netlist format',
                'Basic passive components (R, L, C)',
                'Independent sources (V, I)',
                'Controlled sources (VCVS, VCCS)',
                'MOSFET with body diode model',
                'Stepped simulation control API'
            ],
            author: 'JSSolver-PE Development Team',
            license: 'MIT'
        };
    }
}