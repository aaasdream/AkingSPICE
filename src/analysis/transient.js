/**
 * 暫態分析 (Transient Analysis) 實現
 * 
 * 基於後向歐拉法的固定步長時域分析算法
 * 這是AkingSPICE v0.1的核心分析引擎
 */

import { Matrix, Vector, LUSolver } from '../core/linalg.js';
import { MNABuilder } from '../core/mna.js';

/**
 * 暫態分析結果類
 * 存儲和管理時域分析的結果數據
 */
export class TransientResult {
    constructor() {
        this.timeVector = [];
        this.nodeVoltages = new Map(); // nodeName -> voltage array
        this.branchCurrents = new Map(); // branchName -> current array
        this.componentData = new Map(); // componentName -> data array
        this.analysisInfo = {};
    }

    /**
     * 添加一個時間點的結果
     * @param {number} time 時間點
     * @param {Map<string, number>} voltages 節點電壓
     * @param {Map<string, number>} currents 支路電流
     */
    addTimePoint(time, voltages, currents) {
        this.timeVector.push(time);
        
        // 添加節點電壓
        for (const [nodeName, voltage] of voltages) {
            if (!this.nodeVoltages.has(nodeName)) {
                this.nodeVoltages.set(nodeName, []);
            }
            this.nodeVoltages.get(nodeName).push(voltage);
        }
        
        // 添加支路電流
        for (const [branchName, current] of currents) {
            if (!this.branchCurrents.has(branchName)) {
                this.branchCurrents.set(branchName, []);
            }
            this.branchCurrents.get(branchName).push(current);
        }
    }

    /**
     * 獲取時間向量
     * @returns {number[]} 時間點陣列
     */
    getTimeVector() {
        return [...this.timeVector];
    }

    /**
     * 獲取節點電壓向量
     * @param {string} nodeName 節點名稱 (如 'V(1)', '1')
     * @returns {number[]} 電壓值陣列
     */
    getVoltageVector(nodeName) {
        // 處理SPICE格式的節點名稱 V(nodeName)
        let actualNodeName = nodeName;
        const voltageMatch = nodeName.match(/^V\((.+)\)$/);
        if (voltageMatch) {
            actualNodeName = voltageMatch[1];
        }
        
        return this.nodeVoltages.get(actualNodeName) || [];
    }

    /**
     * 獲取支路電流向量
     * @param {string} branchName 支路名稱 (如 'I(V1)', 'V1')
     * @returns {number[]} 電流值陣列
     */
    getCurrentVector(branchName) {
        // 處理SPICE格式的電流名稱 I(componentName)
        let actualBranchName = branchName;
        const currentMatch = branchName.match(/^I\((.+)\)$/);
        if (currentMatch) {
            actualBranchName = currentMatch[1];
        }
        
        return this.branchCurrents.get(actualBranchName) || [];
    }

    /**
     * 獲取通用向量 (時間、電壓或電流)
     * @param {string} vectorName 向量名稱
     * @returns {number[]} 數值陣列
     */
    getVector(vectorName) {
        if (vectorName.toLowerCase() === 'time') {
            return this.getTimeVector();
        }
        
        // 嘗試作為電壓獲取
        const voltageVector = this.getVoltageVector(vectorName);
        if (voltageVector.length > 0) {
            return voltageVector;
        }
        
        // 嘗試作為電流獲取
        const currentVector = this.getCurrentVector(vectorName);
        if (currentVector.length > 0) {
            return currentVector;
        }
        
        console.warn(`Vector ${vectorName} not found`);
        return [];
    }

    /**
     * 獲取所有可用的向量名稱
     * @returns {string[]} 向量名稱列表
     */
    getAvailableVectors() {
        const vectors = ['time'];
        
        // 添加電壓向量
        for (const nodeName of this.nodeVoltages.keys()) {
            vectors.push(`V(${nodeName})`);
        }
        
        // 添加電流向量
        for (const branchName of this.branchCurrents.keys()) {
            vectors.push(`I(${branchName})`);
        }
        
        return vectors;
    }

    /**
     * 獲取分析統計信息
     * @returns {Object} 統計信息
     */
    getAnalysisInfo() {
        const info = {
            ...this.analysisInfo,
            totalTimePoints: this.timeVector.length,
            startTime: this.timeVector[0] || 0,
            stopTime: this.timeVector[this.timeVector.length - 1] || 0,
            availableVectors: this.getAvailableVectors()
        };
        
        if (this.timeVector.length > 1) {
            const timeSteps = [];
            for (let i = 1; i < this.timeVector.length; i++) {
                timeSteps.push(this.timeVector[i] - this.timeVector[i-1]);
            }
            info.averageTimeStep = timeSteps.reduce((sum, step) => sum + step, 0) / timeSteps.length;
            info.minTimeStep = Math.min(...timeSteps);
            info.maxTimeStep = Math.max(...timeSteps);
        }
        
        return info;
    }
}

/**
 * 暫態分析引擎
 */
export class TransientAnalysis {
    constructor() {
        this.mnaBuilder = new MNABuilder();
        this.components = [];
        this.result = null;
        
        // 分析參數
        this.timeStep = 1e-6;     // 預設時間步長: 1µs
        this.startTime = 0;       // 開始時間
        this.stopTime = 1e-3;     // 結束時間: 1ms
        this.maxTimeStep = 1e-6;  // 最大時間步長
        this.minTimeStep = 1e-12; // 最小時間步長
        
        // 數值參數
        this.maxIterations = 50;  // 最大Newton-Raphson迭代次數
        this.convergenceTol = 1e-9; // 收斂容差
        
        // 調試和監控
        this.debug = false;
        this.saveHistory = true;
        this.progressCallback = null;
    }

    /**
     * 設置分析參數
     * @param {Object} params 參數對象
     */
    setParameters(params) {
        if (params.timeStep !== undefined) this.timeStep = params.timeStep;
        if (params.startTime !== undefined) this.startTime = params.startTime;
        if (params.stopTime !== undefined) this.stopTime = params.stopTime;
        if (params.maxTimeStep !== undefined) this.maxTimeStep = params.maxTimeStep;
        if (params.minTimeStep !== undefined) this.minTimeStep = params.minTimeStep;
        if (params.maxIterations !== undefined) this.maxIterations = params.maxIterations;
        if (params.convergenceTol !== undefined) this.convergenceTol = params.convergenceTol;
        if (params.debug !== undefined) this.debug = params.debug;
        if (params.progressCallback !== undefined) this.progressCallback = params.progressCallback;
    }

    /**
     * 執行暫態分析
     * @param {BaseComponent[]} components 電路元件列表
     * @param {Object} params 分析參數
     * @returns {TransientResult} 分析結果
     */
    async run(components, params = {}) {
        this.setParameters(params);
        this.components = [...components];
        this.result = new TransientResult();
        
        console.log(`Starting transient analysis: ${this.startTime}s to ${this.stopTime}s, step=${this.timeStep}s`);
        
        try {
            // 初始化
            await this.initialize();
            
            // 主時域迴圈
            await this.timeLoop();
            
            // 完成分析
            this.finalize();
            
            console.log(`Transient analysis completed: ${this.result.timeVector.length} time points`);
            return this.result;
            
        } catch (error) {
            console.error('Transient analysis failed:', error);
            throw error;
        }
    }

    /**
     * 初始化分析
     */
    /**
     * 初始化暫態分析
     * @param {BaseComponent[]} components 元件列表
     * @param {number} timeStep 時間步長
     * @param {string} integrationMethod 積分方法: 'backward_euler' 或 'trapezoidal'
     */
    async initialize(components = null, timeStep = null, integrationMethod = 'backward_euler') {
        // 如果提供了元件列表，使用它
        if (components) {
            this.components = [...components];
        }
        
        // 如果提供了時間步長，使用它
        if (timeStep !== null) {
            this.timeStep = timeStep;
        }
        
        // 設置積分方法
        this.integrationMethod = integrationMethod;
        
        // 分析電路拓撲
        this.mnaBuilder.analyzeCircuit(this.components);
        
        // 初始化所有元件的暫態狀態
        for (const component of this.components) {
            component.initTransient(this.timeStep, integrationMethod);
        }
        
        // 設置初始條件 (DC工作點)
        await this.setInitialConditions();
        
        // 儲存分析信息
        const methodName = integrationMethod === 'trapezoidal' ? 'Trapezoidal Rule' : 'Backward Euler';
        this.result.analysisInfo = {
            timeStep: this.timeStep,
            startTime: this.startTime,
            stopTime: this.stopTime,
            method: methodName,
            integrationMethod: integrationMethod,
            matrixSize: this.mnaBuilder.matrixSize,
            nodeCount: this.mnaBuilder.nodeCount,
            voltageSourceCount: this.mnaBuilder.voltageSourceCount
        };
    }

    /**
     * 設置初始條件 (執行DC分析)
     */
    async setInitialConditions() {
        if (this.debug) {
            console.log('Setting initial conditions...');
        }
        
        // 建立t=0時的MNA矩陣
        const { matrix, rhs } = this.mnaBuilder.buildMNAMatrix(this.components, 0);
        
        if (this.debug) {
            this.mnaBuilder.printMNAMatrix();
        }
        
        // 求解初始工作點
        const solution = LUSolver.solve(matrix, rhs);
        
        // 提取初始狀態
        const nodeVoltages = this.mnaBuilder.extractNodeVoltages(solution);
        const branchCurrents = this.mnaBuilder.extractVoltageSourceCurrents(solution);
        
        // 更新元件歷史狀態
        for (const component of this.components) {
            component.updateHistory(nodeVoltages, branchCurrents);
        }
        
        // 保存初始點
        this.result.addTimePoint(this.startTime, nodeVoltages, branchCurrents);
        
        if (this.debug) {
            console.log('Initial conditions set');
            this.printSolutionSummary(nodeVoltages, branchCurrents);
        }
    }

    /**
     * 主時域迴圈
     */
    async timeLoop() {
        let currentTime = this.startTime + this.timeStep;
        let stepCount = 0;
        const totalSteps = Math.ceil((this.stopTime - this.startTime) / this.timeStep);
        
        while (currentTime <= this.stopTime) {
            stepCount++;
            
            try {
                // 執行一個時間步
                await this.singleTimeStep(currentTime);
                
                // 進度回調
                if (this.progressCallback) {
                    const progress = stepCount / totalSteps;
                    this.progressCallback(progress, currentTime, stepCount);
                }
                
                // 調試輸出
                if (this.debug && stepCount % 100 === 0) {
                    console.log(`Step ${stepCount}/${totalSteps}, time=${(currentTime * 1e6).toFixed(2)}µs`);
                }
                
                currentTime += this.timeStep;
                
            } catch (error) {
                console.error(`Time step failed at t=${currentTime}s:`, error);
                throw error;
            }
        }
    }

    /**
     * 執行單個時間步
     * @param {number} time 當前時間
     */
    async singleTimeStep(time) {
        // 更新所有元件的伴隨模型
        for (const component of this.components) {
            if (typeof component.updateCompanionModel === 'function') {
                component.updateCompanionModel();
            }
        }
        
        // 建立當前時間點的MNA矩陣
        const { matrix, rhs } = this.mnaBuilder.buildMNAMatrix(this.components, time);
        
        // 求解線性方程組
        const solution = LUSolver.solve(matrix, rhs);
        
        // 提取節點電壓和支路電流
        const nodeVoltages = this.mnaBuilder.extractNodeVoltages(solution);
        const branchCurrents = this.mnaBuilder.extractVoltageSourceCurrents(solution);
        
        // 更新所有元件的歷史狀態
        for (const component of this.components) {
            component.updateHistory(nodeVoltages, branchCurrents);
        }
        
        // 保存結果
        this.result.addTimePoint(time, nodeVoltages, branchCurrents);
    }

    /**
     * 完成分析
     */
    finalize() {
        // 計算最終統計信息
        const info = this.result.getAnalysisInfo();
        console.log(`Analysis summary: ${info.totalTimePoints} points, avg step=${(info.averageTimeStep * 1e6).toFixed(2)}µs`);
        
        // 清理資源
        this.mnaBuilder.reset();
    }

    /**
     * 打印解的摘要 (調試用)
     * @param {Map<string, number>} nodeVoltages 節點電壓
     * @param {Map<string, number>} branchCurrents 支路電流
     */
    printSolutionSummary(nodeVoltages, branchCurrents) {
        console.log('\\nSolution Summary:');
        console.log('Node Voltages:');
        for (const [node, voltage] of nodeVoltages) {
            console.log(`  V(${node}) = ${voltage.toFixed(6)}V`);
        }
        
        console.log('Branch Currents:');
        for (const [branch, current] of branchCurrents) {
            console.log(`  I(${branch}) = ${(current * 1000).toFixed(3)}mA`);
        }
        console.log('');
    }

    /**
     * 設置調試模式
     * @param {boolean} enabled 是否啟用調試
     */
    setDebug(enabled) {
        this.debug = enabled;
    }

    /**
     * 獲取當前分析狀態
     * @returns {Object} 狀態信息
     */
    getStatus() {
        return {
            isRunning: this.result !== null,
            currentTime: this.result ? this.result.timeVector[this.result.timeVector.length - 1] : 0,
            progress: this.result ? this.result.timeVector.length / Math.ceil((this.stopTime - this.startTime) / this.timeStep) : 0,
            timePoints: this.result ? this.result.timeVector.length : 0
        };
    }

    /**
     * 執行單一時間步求解 (用於步進式控制)
     * @param {number} currentTime 當前時間
     * @param {number} maxIterations 最大迭代次數
     * @returns {Object} 求解結果
     */
    solveTimeStep(currentTime, maxIterations = this.maxIterations) {
        try {
            // 建立當前時間步的 MNA 矩陣 (考慮歷史項)
            const { matrix, rhs } = this.mnaBuilder.buildMNAMatrix(this.components, currentTime);
            
            // 求解線性系統
            const solution = LUSolver.solve(matrix, rhs);
            
            // 提取結果
            const nodeVoltages = this.mnaBuilder.extractNodeVoltages(solution);
            const branchCurrents = this.mnaBuilder.extractVoltageSourceCurrents(solution);
            
            // 檢查收斂性 (簡化檢查)
            const converged = true; // 在線性分析中總是收斂
            
            // 更新元件歷史狀態
            for (const component of this.components) {
                component.updateHistory(nodeVoltages, branchCurrents);
            }
            
            return {
                converged: converged,
                nodeVoltages: nodeVoltages,
                branchCurrents: branchCurrents,
                time: currentTime
            };
            
        } catch (error) {
            throw new Error(`Time step solution failed at t=${currentTime}s: ${error.message}`);
        }
    }
}

/**
 * 暫態分析工具函數
 */
export class TransientUtils {
    /**
     * 解析SPICE風格的暫態分析指令
     * @param {string} command 指令字符串 (如 '.tran 1us 1ms')
     * @returns {Object} 解析後的參數
     */
    static parseTranCommand(command) {
        const cmd = command.trim().toLowerCase();
        
        // 匹配 .tran [step] [stop] [start] [max_step]
        // 使用正規表示式字面量，並用單反斜線進行轉義
        const match = cmd.match(/^\.tran\s+([0-9.]+[a-z]*)\s+([0-9.]+[a-z]*)(?:\s+([0-9.]+[a-z]*))?(?:\s+([0-9.]+[a-z]*))?/);
        
        if (!match) {
            throw new Error(`Invalid .tran command: ${command}`);
        }
        
        const params = {
            timeStep: TransientUtils.parseTimeValue(match[1]),
            stopTime: TransientUtils.parseTimeValue(match[2]),
            startTime: match[3] ? TransientUtils.parseTimeValue(match[3]) : 0,
            maxTimeStep: match[4] ? TransientUtils.parseTimeValue(match[4]) : undefined
        };
        
        return params;
    }

    /**
     * 解析時間值 (支援工程記號)
     * @param {string} timeStr 時間字符串 (如 '1us', '2.5ms')
     * @returns {number} 時間值 (秒)
     */
    static parseTimeValue(timeStr) {
        const str = timeStr.trim().toLowerCase();
        
        // 按照長度降序排列，確保最長的後綴先被匹配
        const suffixes = [
            ['fs', 1e-15],
            ['ps', 1e-12], 
            ['ns', 1e-9],
            ['us', 1e-6],
            ['µs', 1e-6],
            ['ms', 1e-3],
            ['u', 1e-6],   // SPICE 風格：u = 微秒
            ['m', 1e-3],   // SPICE 風格：m = 毫秒  
            ['s', 1]
        ];
        
        for (const [suffix, multiplier] of suffixes) {
            if (str.endsWith(suffix)) {
                const numPart = parseFloat(str.slice(0, -suffix.length));
                if (!isNaN(numPart)) {
                    return numPart * multiplier;
                }
            }
        }
        
        // 如果沒有後綴，假設是秒
        const numValue = parseFloat(str);
        if (!isNaN(numValue)) {
            return numValue;
        }
        
        throw new Error(`Cannot parse time value: ${timeStr}`);
    }

    /**
     * 格式化時間值為可讀字符串
     * @param {number} time 時間值 (秒)
     * @returns {string} 格式化的字符串
     */
    static formatTime(time) {
        const abs = Math.abs(time);
        
        if (abs >= 1) {
            return `${time.toFixed(3)}s`;
        } else if (abs >= 1e-3) {
            return `${(time * 1e3).toFixed(3)}ms`;
        } else if (abs >= 1e-6) {
            return `${(time * 1e6).toFixed(3)}µs`;
        } else if (abs >= 1e-9) {
            return `${(time * 1e9).toFixed(3)}ns`;
        } else {
            return `${(time * 1e12).toFixed(3)}ps`;
        }
    }
}