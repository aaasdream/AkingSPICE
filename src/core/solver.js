/**
 * AkingSPICE 主求解器類別 - 🔥 清潔架構版本
 * 
 * 職責：
 * - 網表解析和電路初始化
 * - 批次分析 (.tran/.dc 指令)
 * - DC 工作點分析
 * - 元件和模型管理
 * 
 * 不包含：
 * - 步進式仿真控制 (使用 StepwiseSimulator)
 * - 互動式狀態查詢 (使用 StepwiseSimulator.getCircuitState())
 * - 元件參數動態修改 (使用 StepwiseSimulator.modifyComponent())
 * 
 * 架構原則：關注點分離，消除耦合
 */

import { NetlistParser } from '../parser/netlist.js';
import { MCPTransientAnalysis, TransientResult } from '../analysis/transient_mcp.js';
import { DC_MCP_Solver } from '../analysis/dc_mcp_solver.js';

/**
 * AkingSPICE 主求解器
 */
export class AkingSPICE {
    constructor(netlist = null) {
        this.parser = new NetlistParser();
        this.transientAnalysis = new MCPTransientAnalysis();
        this.dcAnalysis = new DC_MCP_Solver();
        
        // 電路數據
        this._components = []; // 使用內部變數儲存
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

    // 🔥 新增：Component Setter，自動處理元元件
    set components(componentArray) {
        this._components = []; // 清空現有組件
        this.addComponents(componentArray);
    }

    // 🔥 新增：Component Getter
    get components() {
        return this._components || [];
    }
    
    // 🔥 新增：addComponent 方法，用於單個元件
    addComponent(component) {
        if (!this._components) {
            this._components = [];
        }
        if (component.type === 'T_META' && typeof component.getComponents === 'function') {
            // 如果是元元件，添加其子元件
            this._components.push(...component.getComponents());
        } else {
            this._components.push(component);
        }

        // 🔥 關鍵修正：只要有元件被加入，就將求解器標記為已初始化
        if (this._components.length > 0) {
            this.isInitialized = true;
        }
    }

    // 🔥 新增：addComponents 方法，用於陣列
    addComponents(componentArray) {
        for (const comp of componentArray) {
            this.addComponent(comp);
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
                return await this.runMCPTransientAnalysis(analysisCommand);
            } else if (cmd.startsWith('.dc') || cmd.startsWith('.op')) {
                return await this.runDCMCPAnalysis();
            } else {
                throw new Error(`Unsupported analysis command: ${analysisCommand}`);
            }
        }

        // 如果沒有提供指令，查看網表中是否有分析指令
        if (this.analyses.length > 0) {
            const analysis = this.analyses[0]; // 使用第一個分析指令
            
            if (analysis.type === 'TRAN') {
                const tranCommand = `.tran ${analysis.tstep} ${analysis.tstop} ${analysis.tstart || '0'} ${analysis.tmax || analysis.tstep}`;
                return await this.runMCPTransientAnalysis(tranCommand);
            } else if (analysis.type === 'DC') {
                return await this.runDCMCPAnalysis();
            }
        }

        // 預設執行 DC-MCP 分析
        console.log('No analysis specified, running DC-MCP analysis');
        return await this.runDCMCPAnalysis();
    }

    /**
     * 執行 MCP 暫態分析
     * @param {string} tranCommand 暫態分析指令
     * @returns {Object} 暫態分析結果
     */
    async runMCPTransientAnalysis(tranCommand) {
        console.log(`Running MCP transient analysis: ${tranCommand}`);
        
        try {
            // 解析暫態分析參數
            const params = this.parseTranCommand(tranCommand);
            params.debug = this.debug;
            
            // 執行 MCP 分析
            const result = await this.transientAnalysis.run(this.components, params);
            
            // 保存結果
            this.results.set('tran', result);
            this.lastResult = result;
            
            console.log(`MCP transient analysis completed: ${result.timeVector.length} time points`);
            return result;
            
        } catch (error) {
            console.error('MCP transient analysis failed:', error);
            throw error;
        }
    }

    /**
     * 解析 .TRAN 命令
     * @param {string} tranCommand 暫態分析命令
     * @returns {Object} 參數對象
     */
    parseTranCommand(tranCommand) {
        const tokens = tranCommand.trim().split(/\s+/);
        if (tokens.length < 3) {
            throw new Error('Invalid .TRAN command format. Expected: .TRAN <tstep> <tstop> [tstart] [tmax]');
        }

        const parseValue = (str) => {
            if (typeof str === 'number') return str;
            
            const match = str.match(/^([0-9.]+)([a-zA-Z]*)$/);
            if (!match) return parseFloat(str);
            
            const [, value, unit] = match;
            const num = parseFloat(value);
            
            const multipliers = {
                'f': 1e-15, 'p': 1e-12, 'n': 1e-9, 'u': 1e-6, 'μ': 1e-6,
                'm': 1e-3, 'k': 1e3, 'K': 1e3, 'M': 1e6, 'G': 1e9
            };
            
            return num * (multipliers[unit] || 1);
        };

        return {
            timeStep: parseValue(tokens[1]),
            stopTime: parseValue(tokens[2]),
            startTime: tokens[3] ? parseValue(tokens[3]) : 0,
            maxTimeStep: tokens[4] ? parseValue(tokens[4]) : parseValue(tokens[1])
        };
    }

    /**
     * 執行 DC-MCP 分析
     * @returns {Object} DC-MCP 分析結果
     */
    async runDCMCPAnalysis() {
        console.log('Running DC-MCP analysis...');
        
        try {
            const options = { debug: this.debug };
            const result = await this.dcAnalysis.solve(this.components);
            
            // 保存結果
            this.results.set('dc', result);
            this.lastResult = result;
            
            console.log('DC-MCP analysis completed');
            return result;
            
        } catch (error) {
            console.error('DC-MCP analysis failed:', error);
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
        // MCP 分析器通過構造函數選項設置調試模式
        this.transientAnalysis = new MCPTransientAnalysis({ debug: enabled });
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

    // ==================== 核心求解方法 - 🔥 移除重複步進式 API ====================
    //
    // 🔥 重要變更：已移除以下步進式方法，現由 StepwiseSimulator 專門處理：
    // - initSteppedTransient() → 使用 StepwiseSimulator.initialize()
    // - step() → 使用 StepwiseSimulator.stepForward()
    // - isFinished() → 使用 StepwiseSimulator.isCompleted
    // - getCurrentTime() → 使用 StepwiseSimulator.currentTime
    // - updateControlInputs() → 使用 StepwiseSimulator.modifyComponent()
    // - getVoltage/getCurrent/getComponentState() → 使用 StepwiseSimulator.getCircuitState()
    // - runSteppedSimulation() → 使用 StepwiseSimulator with control loop
    //
    // 此變更消除了架構耦合，實現了關注點分離

    /**
     * 獲取求解器版本信息
     * @returns {Object} 版本信息
     */
    static getVersionInfo() {
        return {
            name: 'AkingSPICE',
            version: '2.1.0',
            description: 'Clean Architecture JavaScript SPICE Engine for Power Electronics',
            features: [
                'Modified Nodal Analysis (MNA)',
                'LU decomposition solver', 
                'MCP-based transient analysis',
                'DC-MCP operating point analysis',
                'SPICE-compatible netlist format',
                'Basic passive components (R, L, C)',
                'Independent sources (V, I)',
                'Controlled sources (VCVS, VCCS)',
                'MCP nonlinear components (Diode, MOSFET)',
                'Decoupled stepping simulation via StepwiseSimulator'
            ],
            architecture: {
                coreEngine: 'Batch analysis and DC solving',
                steppingAPI: 'Handled by separate StepwiseSimulator class',
                decoupling: 'Eliminated coupling between solver and stepping logic'
            },
            author: 'AkingSPICE Development Team',
            license: 'MIT'
        };
    }
}