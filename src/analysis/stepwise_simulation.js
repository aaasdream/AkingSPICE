/**
 * 步進式模擬 API - AkingSPICE 互動式仿真引擎
 * 
 * 提供外部控制的步進式 MCP 瞬態分析，允許用戶在每個時間步後
 * 檢查和修改電路狀態，適用於即時控制和互動式模擬場景。
 * 
 * 核心功能：
 * - 單步前進 stepForward() 
 * - 狀態查詢 getCircuitState()
 * - 參數修改 modifyComponent()
 * - 暫停/繼續控制
 * - 事件驅動回調機制
 * - 自適應步長支持
 * 
 * 使用場景：
 * - 即時控制系統仿真
 * - 互動式電路教學
 * - 參數掃描與最佳化
 * - 故障注入測試
 * 
 * @author AkingSPICE Team
 * @version 2.0.0
 */

import { MCPTransientAnalysis } from './transient_mcp.js';
import { TransientResult } from './transient_mcp.js';

/**
 * 步進式仿真器 - 基於 MCP 瞬態分析的互動式仿真引擎
 * 🔥 重構：使用正式的步進 API，實現完美解耦
 */
export class StepwiseSimulator {
    constructor(options = {}) {
        // === 核心分析器 ===
        this.analyzer = new MCPTransientAnalysis(options);
        
        // === 步進式分析狀態 ===
        this.stepContext = null;  // 存儲初始化結果 {flatComponents, result, componentAnalysis}
        this.latestSolution = null;  // 🔥 緩存最新解，提高 getCircuitState() 效率
        
        // === 仿真狀態 ===
        this.isInitialized = false;
        this.isPaused = false;
        this.isCompleted = false;
        
        // === 時間參數 ===
        this.currentTime = 0;
        this.startTime = 0;
        this.stopTime = 0;
        this.timeStep = 0;
        this.stepCount = 0;
        
        // === 電路狀態 ===
        this.components = [];
        this.result = null;
        this.lastSolution = null;
        this.dcSolution = null;
        
        // === 事件回調 ===
        this.callbacks = {
            onStepCompleted: null,    // 每步完成後調用
            onStateChanged: null,     // 狀態變化時調用  
            onError: null,           // 錯誤發生時調用
            onSimulationComplete: null // 仿真完成時調用
        };
        
        // === 狀態快照 ===
        this.stateHistory = [];      // 狀態歷史記錄
        this.maxHistoryLength = options.maxHistoryLength || 1000;
        
        // === 調試選項 ===
        this.debug = options.debug || false;
        
        if (this.debug) {
            console.log('🎯 初始化步進式仿真器');
        }
    }
    
    /**
     * 初始化仿真
     * @param {Array} components - 電路組件列表
     * @param {Object} params - 仿真參數 {startTime, stopTime, timeStep}
     * @returns {Promise&lt;boolean&gt;} 初始化成功與否
     */
    async initialize(components, params) {
        try {
            if (this.debug) {
                console.log('🚀 初始化步進式仿真...');
                console.log(`  時間範圍: ${params.startTime}s → ${params.stopTime}s`);
                console.log(`  時間步長: ${params.timeStep}s`);
                console.log(`  組件數量: ${components.length}`);
            }
            
            // 驗證參數
            this.validateSimulationParameters(params);
            
            // 保存仿真配置
            this.components = [...components]; // 深複製組件列表
            this.startTime = params.startTime;
            this.currentTime = params.startTime;
            this.stopTime = params.stopTime;
            this.timeStep = params.timeStep;
            this.stepCount = 0;
            
            // 初始化結果對象
            this.result = new TransientResult();
            this.result.analysisInfo = {
                method: 'MCP-Stepwise',
                startTime: params.startTime,
                stopTime: params.stopTime,
                timeStep: params.timeStep,
                convergenceStats: {}
            };
            
        // 🔥 重構：使用正式的步進 API 初始化
        this.stepContext = await this.analyzer.initializeSteppedAnalysis(this.components, {
            startTime: this.startTime,
            stopTime: this.stopTime,
            timeStep: this.timeStep
        });
        
        if (!this.stepContext) {
            throw new Error('分析器初始化失敗');
        }
        
        // 更新組件列表為扁平化後的版本
        this.components = this.stepContext.flatComponents;
        this.result = this.stepContext.result;
        
        // 重置狀態
        this.isInitialized = true;
        this.isPaused = false;
        this.isCompleted = false;
        this.stateHistory = [];
        
        // 初始化最新解緩存
        this.latestSolution = {
            nodeVoltages: new Map(),
            componentCurrents: new Map()
        };
        
        // 保存初始狀態
        this.captureCurrentState();            if (this.debug) {
                console.log('✅ 步進式仿真初始化完成');
            }
            
            return true;
            
        } catch (error) {
            console.error('❌ 步進式仿真初始化失敗:', error.message);
            this.triggerCallback('onError', { 
                type: 'initialization', 
                error: error,
                time: this.currentTime 
            });
            return false;
        }
    }
    
    /**
     * 單步前進仿真
     * @returns {Promise&lt;Object&gt;} 步進結果 {success, state, isComplete}
     */
    async stepForward() {
        try {
            // 狀態檢查
            if (!this.isInitialized) {
                throw new Error('仿真器未初始化，請先調用 initialize()');
            }
            
            if (this.isPaused) {
                if (this.debug) {
                    console.log('⏸️ 仿真已暫停，跳過步進');
                }
                return { success: true, state: this.getCircuitState(), isComplete: false, isPaused: true };
            }
            
            if (this.isCompleted) {
                if (this.debug) {
                    console.log('🏁 仿真已完成');
                }
                return { success: true, state: this.getCircuitState(), isComplete: true };
            }
            
            // 檢查是否到達結束時間
            if (this.currentTime >= this.stopTime) {
                this.isCompleted = true;
                this.triggerCallback('onSimulationComplete', {
                    totalSteps: this.stepCount,
                    executionTime: this.result.analysisInfo.executionTime,
                    finalState: this.getCircuitState()
                });
                return { success: true, state: this.getCircuitState(), isComplete: true };
            }
            
            // 推進時間
            this.currentTime = Math.min(this.currentTime + this.timeStep, this.stopTime);
            this.stepCount++;
            
            if (this.debug) {
                console.log(`🔥 步進 ${this.stepCount}: t=${this.currentTime.toExponential(3)}s`);
            }
            
            // � Gear 2 重構：使用正式的步進 API 並傳遞 stepCount
            // 先更新伴隨模型以正確傳遞步數
            this.analyzer.updateCompanionModels(this.stepContext.flatComponents, this.timeStep, this.stepCount);
            
            // 設置跳過標志以避免重複調用
            this.analyzer._skipCompanionModelUpdate = true;
            const stepResult = await this.analyzer.stepForwardAnalysis(
                this.stepContext.flatComponents,
                this.currentTime,
                this.timeStep,
                this.result
            );
            this.analyzer._skipCompanionModelUpdate = false;
            
            if (!stepResult.success) {
                throw new Error(`時間步求解失敗於 t = ${this.currentTime}: ${stepResult.error}`);
            }
            
            // 🔥 更新最新解緩存，提高 getCircuitState() 效率
            if (stepResult.nodeVoltages) {
                this.latestSolution.nodeVoltages = stepResult.nodeVoltages;
            }
            if (stepResult.componentCurrents) {
                this.latestSolution.componentCurrents = stepResult.componentCurrents;
            }
            
            // 保存當前狀態
            this.captureCurrentState();
            
            // 檢查仿真完成
            const isComplete = this.currentTime >= this.stopTime;
            if (isComplete) {
                this.isCompleted = true;
            }
            
            // 觸發步驟完成回調
            const currentState = this.getCircuitState();
            this.triggerCallback('onStepCompleted', {
                step: this.stepCount,
                time: this.currentTime,
                state: currentState,
                isComplete: isComplete
            });
            
            if (isComplete) {
                this.triggerCallback('onSimulationComplete', {
                    totalSteps: this.stepCount,
                    finalState: currentState
                });
            }
            
            return { 
                success: true, 
                state: currentState, 
                isComplete: isComplete,
                step: this.stepCount,
                time: this.currentTime
            };
            
        } catch (error) {
            console.error(`❌ 步進失敗於 t=${this.currentTime}: ${error.message}`);
            this.triggerCallback('onError', { 
                type: 'step', 
                error: error,
                time: this.currentTime,
                step: this.stepCount
            });
            return { success: false, error: error.message, state: this.getCircuitState() };
        }
    }
    
    /**
     * 運行多步仿真
     * @param {number} numSteps - 步數，-1 表示運行到結束
     * @returns {Promise&lt;Object&gt;} 運行結果 {success, stepsCompleted, finalState}
     */
    async runSteps(numSteps = -1) {
        let stepsCompleted = 0;
        let success = true;
        
        const targetSteps = numSteps === -1 ? Infinity : numSteps;
        
        while (stepsCompleted < targetSteps && !this.isCompleted && !this.isPaused) {
            const stepResult = await this.stepForward();
            
            if (!stepResult.success) {
                success = false;
                break;
            }
            
            stepsCompleted++;
            
            if (stepResult.isComplete) {
                break;
            }
        }
        
        return {
            success: success,
            stepsCompleted: stepsCompleted,
            finalState: this.getCircuitState(),
            isComplete: this.isCompleted,
            isPaused: this.isPaused
        };
    }
    
    /**
     * 暫停仿真
     */
    pause() {
        this.isPaused = true;
        if (this.debug) {
            console.log('⏸️ 仿真已暫停');
        }
        this.triggerCallback('onStateChanged', { 
            type: 'paused', 
            time: this.currentTime 
        });
    }
    
    /**
     * 繼續仿真
     */
    resume() {
        if (!this.isInitialized) {
            console.warn('⚠️ 仿真器未初始化');
            return;
        }
        
        this.isPaused = false;
        if (this.debug) {
            console.log('▶️ 仿真已繼續');
        }
        this.triggerCallback('onStateChanged', { 
            type: 'resumed', 
            time: this.currentTime 
        });
    }
    
    /**
     * 重置仿真到初始狀態
     */
    async reset() {
        this.currentTime = this.startTime;
        this.stepCount = 0;
        this.isPaused = false;
        this.isCompleted = false;
        this.stateHistory = [];
        
        // 重新計算初始條件
        if (this.isInitialized) {
            await this.computeInitialConditions();
            this.captureCurrentState();
        }
        
        if (this.debug) {
            console.log('🔄 仿真已重置');
        }
        
        this.triggerCallback('onStateChanged', { 
            type: 'reset', 
            time: this.currentTime 
        });
    }
    
    /**
     * 獲取當前電路狀態 - 🔥 優化：使用緩存的最新解，避免遍歷歷史數據
     * @returns {Object} 電路狀態 {time, nodeVoltages, componentCurrents, componentStates}
     */
    getCircuitState() {
        if (!this.isInitialized || !this.latestSolution) {
            return {
                time: this.currentTime,
                nodeVoltages: new Map(),
                componentCurrents: new Map(),
                componentStates: new Map(),
                isValid: false
            };
        }
        
        try {
            // 🔥 直接使用緩存的最新解，無需遍歷歷史數據
            const nodeVoltages = this.latestSolution.nodeVoltages || new Map();
            const componentCurrents = this.latestSolution.componentCurrents || new Map();
            
            // 提取組件狀態
            const componentStates = new Map();
            for (const component of this.components) {
                const state = {};
                
                // 基本資訊
                state.name = component.name;
                state.type = component.type;
                
                // 電壓/電流
                if (componentCurrents.has(component.name)) {
                    state.current = componentCurrents.get(component.name);
                }
                
                // 特殊狀態 (MCP 組件)
                if (component.type === 'D_MCP') {
                    state.diodeState = component.diodeState || 'unknown';
                    state.forwardVoltage = component.Vf || 0.7;
                } else if (component.type === 'M_MCP') {
                    state.gateState = component.gateState || 'unknown';
                    state.threshold = component.Vth || 0;
                }
                
                // 參數值
                if (component.value !== undefined) {
                    state.value = component.value;
                }
                
                componentStates.set(component.name, state);
            }
            
            return {
                time: this.currentTime,
                step: this.stepCount,
                nodeVoltages: nodeVoltages,
                componentCurrents: componentCurrents,
                componentStates: componentStates,
                isValid: true,
                isPaused: this.isPaused,
                isComplete: this.isCompleted
            };
            
        } catch (error) {
            console.error('❌ 獲取電路狀態失敗:', error.message);
            return {
                time: this.currentTime,
                nodeVoltages: new Map(),
                componentCurrents: new Map(),
                componentStates: new Map(),
                isValid: false,
                error: error.message
            };
        }
    }
    
    /**
     * 修改組件參數 - 🔥 增強：添加局限性檢查和文檔
     * 
     * ⚠️ 重要局限性：
     * - 只能修改組件的值（value）或參數（params）
     * - 不能改變節點連接，因為會影響 MNA 矩陣結構
     * - 如需拓撲更改，需要重新初始化整個仿真
     * 
     * @param {string} componentName - 組件名稱
     * @param {Object} parameters - 要修改的參數 {value?, params?, ...}
     * @returns {boolean} 修改成功與否
     */
    modifyComponent(componentName, parameters) {
        try {
            const component = this.components.find(c => c.name === componentName);
            if (!component) {
                throw new Error(`組件 '${componentName}' 未找到`);
            }
            
            if (this.debug) {
                console.log(`🔧 修改組件 ${componentName}:`, parameters);
            }
            
            // 🔥 檢查是否嘗試修改節點連接
            if (parameters.nodes !== undefined) {
                console.warn(`⚠️ 警告：修改組件 ${componentName} 的節點連接可能導致仿真崩潰`);
                console.warn(`   建議：只修改 value 或 params，避免拓撲變更`);
                // 仍然允許修改，但發出警告
                const oldNodes = [...component.nodes];
                component.nodes = [...parameters.nodes];
                if (this.debug) {
                    console.log(`  ⚠️ 節點: [${oldNodes.join(',')}] → [${parameters.nodes.join(',')}] (危險操作)`);
                }
            }
            
            // 修改參數
            let modified = false;
            
            if (parameters.value !== undefined) {
                const oldValue = component.value;
                component.value = parameters.value;
                modified = true;
                if (this.debug) {
                    console.log(`  值: ${oldValue} → ${parameters.value}`);
                }
            }
            
            // 特殊參數處理
            for (const [key, value] of Object.entries(parameters)) {
                if (key !== 'value' && key !== 'nodes' && component.hasOwnProperty(key)) {
                    const oldValue = component[key];
                    component[key] = value;
                    modified = true;
                    if (this.debug) {
                        console.log(`  ${key}: ${oldValue} → ${value}`);
                    }
                }
            }
            
            if (modified) {
                this.triggerCallback('onStateChanged', { 
                    type: 'componentModified',
                    componentName: componentName,
                    parameters: parameters,
                    time: this.currentTime
                });
            }
            
            return modified;
            
        } catch (error) {
            console.error(`❌ 修改組件失敗: ${error.message}`);
            this.triggerCallback('onError', { 
                type: 'componentModification', 
                error: error,
                componentName: componentName,
                time: this.currentTime
            });
            return false;
        }
    }
    
    /**
     * 設置事件回調
     * @param {string} eventName - 事件名稱 (onStepCompleted, onStateChanged, onError, onSimulationComplete)
     * @param {Function} callback - 回調函數
     */
    setCallback(eventName, callback) {
        if (this.callbacks.hasOwnProperty(eventName)) {
            this.callbacks[eventName] = callback;
            if (this.debug) {
                console.log(`📋 設置回調: ${eventName}`);
            }
        } else {
            console.warn(`⚠️ 未知事件名稱: ${eventName}`);
        }
    }
    
    /**
     * 獲取仿真統計信息
     * @returns {Object} 統計信息
     */
    getStatistics() {
        return {
            currentTime: this.currentTime,
            stepCount: this.stepCount,
            isInitialized: this.isInitialized,
            isPaused: this.isPaused,
            isCompleted: this.isCompleted,
            progress: this.stopTime > this.startTime ? 
                     (this.currentTime - this.startTime) / (this.stopTime - this.startTime) * 100 : 0,
            historyLength: this.stateHistory.length,
            components: this.components.length,
            analyzerStats: this.analyzer.statistics
        };
    }
    
    /**
     * 獲取狀態歷史記錄
     * @param {number} maxEntries - 最大條目數，-1 表示全部
     * @returns {Array} 歷史狀態數組
     */
    getStateHistory(maxEntries = -1) {
        if (maxEntries === -1) {
            return [...this.stateHistory];
        }
        return this.stateHistory.slice(-maxEntries);
    }
    
    /**
     * 驗證仿真參數
     */
    validateSimulationParameters(params) {
        if (!params) {
            throw new Error('仿真參數不能為空');
        }
        
        if (typeof params.startTime !== 'number' || params.startTime < 0) {
            throw new Error('起始時間必須為非負數');
        }
        
        if (typeof params.stopTime !== 'number' || params.stopTime <= params.startTime) {
            throw new Error('結束時間必須大於起始時間');
        }
        
        if (typeof params.timeStep !== 'number' || params.timeStep <= 0) {
            throw new Error('時間步長必須為正數');
        }
        
        if (params.timeStep > (params.stopTime - params.startTime)) {
            throw new Error('時間步長不能大於總仿真時間');
        }
    }
    
    /**
     * 預處理組件（展開元件）
     */
    flattenComponents(components) {
        const flatComponents = [];
        for (const component of components) {
            if (typeof component.getComponents === 'function') {
                flatComponents.push(...component.getComponents());
            } else {
                flatComponents.push(component);
            }
        }
        return flatComponents;
    }
    
    /**
     * 計算初始條件
     */
    async computeInitialConditions() {
        // 重用 TransientMCPAnalyzer 的初始條件計算
        await this.analyzer.computeInitialConditions(
            this.components, 
            this.result, 
            { startTime: this.startTime }
        );
        
        this.dcSolution = this.result.dcOperatingPoint;
    }
    
    /**
     * 捕獲當前狀態
     */
    captureCurrentState() {
        const state = this.getCircuitState();
        this.stateHistory.push({
            time: this.currentTime,
            step: this.stepCount,
            state: state
        });
        
        // 限制歷史記錄長度
        if (this.stateHistory.length > this.maxHistoryLength) {
            this.stateHistory.shift();
        }
    }
    
    /**
     * 觸發事件回調
     */
    triggerCallback(eventName, data) {
        const callback = this.callbacks[eventName];
        if (typeof callback === 'function') {
            try {
                callback(data);
            } catch (error) {
                console.error(`❌ 回調執行失敗 (${eventName}):`, error.message);
            }
        }
    }
}

/**
 * 創建步進式仿真器的工廠函數
 * @param {Object} options - 選項
 * @returns {StepwiseSimulator} 仿真器實例
 */
export function createStepwiseSimulator(options = {}) {
    return new StepwiseSimulator(options);
}