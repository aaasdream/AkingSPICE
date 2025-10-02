/**
 * 統一分析引擎 - AkingSPICE Phase 3 核心
 * 
 * 職責：
 * 1. 策略選擇：根據電路特性自動選擇最優分析策略
 * 2. 策略協調：管理多個策略的協同工作
 * 3. 結果統一：提供一致的分析結果格式
 * 4. 性能優化：緩存編譯結果，避免重複計算
 * 
 * 解決「雙重人格」問題：
 * - 對用戶透明：保持統一的 API 接口
 * - 內部智能：根據情況自動選擇隱式 MNA 或狀態空間方法
 * - 混合模式：DC 用隱式方法，暫態用狀態空間方法
 */

import { 
    AnalysisStrategy, 
    ImplicitMNAStrategy, 
    StateSpaceStrategy,
    UnifiedAnalysisResult 
} from './unified-analysis-strategies.js';

/**
 * 策略選擇器
 * 負責根據電路特性和分析需求選擇最優策略
 */
class StrategySelector {
    constructor(options = {}) {
        this.options = {
            preferStateSpace: false,      // 是否偏好狀態空間方法
            preferImplicit: false,        // 是否偏好隱式方法
            adaptiveSelection: true,      // 自適應選擇
            debug: false,
            ...options
        };
        
        this.selectionHistory = [];       // 選擇歷史記錄
        this.performanceHistory = new Map(); // 性能歷史記錄
    }
    
    /**
     * 選擇最優策略
     */
    selectStrategy(strategies, components, analysisType, options = {}) {
        if (this.options.debug) {
            console.log(`🤔 選擇策略：分析類型=${analysisType}, 元件數=${components.length}`);
        }
        
        // 過濾支持該分析類型的策略
        const applicableStrategies = strategies.filter(strategy => 
            strategy.isApplicable(components, analysisType, options)
        );
        
        if (applicableStrategies.length === 0) {
            throw new Error(`沒有策略支持 ${analysisType} 分析`);
        }
        
        // 強制指定策略
        if (options.forceStrategy) {
            const forcedStrategy = strategies.find(s => 
                s.name === options.forceStrategy
            );
            if (forcedStrategy && forcedStrategy.isApplicable(components, analysisType, options)) {
                this.recordSelection(forcedStrategy, components, analysisType, 'forced');
                return forcedStrategy;
            } else if (forcedStrategy) {
                // 即使不適用也嘗試使用強制策略
                this.recordSelection(forcedStrategy, components, analysisType, 'forced-override');
                return forcedStrategy;
            }
        }
        
        // 使用偏好設置
        if (this.options.preferStateSpace) {
            const stateSpaceStrategy = applicableStrategies.find(s => 
                s.name === 'StateSpace'
            );
            if (stateSpaceStrategy) {
                this.recordSelection(stateSpaceStrategy, components, analysisType, 'preference');
                return stateSpaceStrategy;
            }
        }
        
        if (this.options.preferImplicit) {
            const implicitStrategy = applicableStrategies.find(s => 
                s.name === 'ImplicitMNA'
            );
            if (implicitStrategy) {
                this.recordSelection(implicitStrategy, components, analysisType, 'preference');
                return implicitStrategy;
            }
        }
        
        // 自適應選擇：基於成本估算
        if (this.options.adaptiveSelection) {
            return this.selectByCostAnalysis(applicableStrategies, components, analysisType, options);
        }
        
        // 默認選擇第一個適用策略
        const defaultStrategy = applicableStrategies[0];
        this.recordSelection(defaultStrategy, components, analysisType, 'default');
        return defaultStrategy;
    }
    
    /**
     * 基於成本分析選擇策略
     */
    selectByCostAnalysis(strategies, components, analysisType, options) {
        const costs = strategies.map(strategy => ({
            strategy,
            cost: strategy.getEstimatedCost(components, analysisType, options),
            reliability: this.getStrategyReliability(strategy),
            historicalPerformance: this.getHistoricalPerformance(strategy, components.length)
        }));
        
        if (this.options.debug) {
            console.log('策略成本分析:');
            costs.forEach(({ strategy, cost, reliability }) => {
                console.log(`  ${strategy.name}: 成本=${cost.toFixed(1)}, 可靠性=${reliability.toFixed(2)}`);
            });
        }
        
        // 綜合評分：成本 + 可靠性 + 歷史性能
        const scores = costs.map(({ strategy, cost, reliability, historicalPerformance }) => ({
            strategy,
            score: cost * (1 - reliability * 0.1) * (1 - historicalPerformance * 0.1)
        }));
        
        // 選擇得分最低的策略
        const bestStrategy = scores.reduce((best, current) => 
            current.score < best.score ? current : best
        ).strategy;
        
        this.recordSelection(bestStrategy, components, analysisType, 'cost-analysis');
        return bestStrategy;
    }
    
    /**
     * 獲取策略可靠性
     */
    getStrategyReliability(strategy) {
        const stats = strategy.getStats();
        if (stats.totalAnalyses === 0) {
            return 0.8; // 默認可靠性
        }
        return stats.successfulAnalyses / stats.totalAnalyses;
    }
    
    /**
     * 獲取歷史性能
     */
    getHistoricalPerformance(strategy, circuitSize) {
        const key = `${strategy.name}_${Math.floor(circuitSize / 5) * 5}`; // 按電路規模分組
        return this.performanceHistory.get(key) || 0;
    }
    
    /**
     * 記錄策略選擇
     */
    recordSelection(strategy, components, analysisType, reason) {
        const record = {
            timestamp: Date.now(),
            strategyName: strategy.name,
            analysisType,
            componentCount: components.length,
            nodeCount: strategy.countNodes(components),
            reason
        };
        
        this.selectionHistory.push(record);
        
        if (this.options.debug) {
            console.log(`📋 選擇策略: ${strategy.name} (原因: ${reason})`);
        }
    }
    
    /**
     * 更新性能歷史
     */
    updatePerformanceHistory(strategyName, circuitSize, normalizedPerformance) {
        const key = `${strategyName}_${Math.floor(circuitSize / 5) * 5}`;
        const currentPerf = this.performanceHistory.get(key) || 0;
        const newPerf = (currentPerf * 0.8 + normalizedPerformance * 0.2); // 指數平滑
        this.performanceHistory.set(key, newPerf);
    }
    
    /**
     * 獲取選擇統計
     */
    getSelectionStats() {
        const strategyCount = new Map();
        const reasonCount = new Map();
        
        for (const record of this.selectionHistory) {
            strategyCount.set(record.strategyName, 
                (strategyCount.get(record.strategyName) || 0) + 1);
            reasonCount.set(record.reason, 
                (reasonCount.get(record.reason) || 0) + 1);
        }
        
        return {
            totalSelections: this.selectionHistory.length,
            strategyDistribution: Object.fromEntries(strategyCount),
            reasonDistribution: Object.fromEntries(reasonCount),
            recentSelections: this.selectionHistory.slice(-10)
        };
    }
}

/**
 * 統一分析引擎
 * AkingSPICE 的頂層分析接口
 */
export class UnifiedAnalysisEngine {
    constructor(options = {}) {
        this.options = {
            debug: false,
            enableCaching: true,
            maxCacheSize: 100,
            validateResults: true,
            autoOptimize: true,
            ...options
        };
        
        // 初始化策略
        this.strategies = [
            new ImplicitMNAStrategy({ debug: this.options.debug }),
            new StateSpaceStrategy({ debug: this.options.debug })
        ];
        
        // 策略選擇器
        this.selector = new StrategySelector({ 
            debug: this.options.debug,
            adaptiveSelection: this.options.autoOptimize
        });
        
        // 結果緩存
        this.resultCache = new Map();
        this.cacheStats = {
            hits: 0,
            misses: 0,
            totalSize: 0
        };
        
        // 引擎統計
        this.engineStats = {
            totalAnalyses: 0,
            dcAnalyses: 0,
            acAnalyses: 0,
            tranAnalyses: 0,
            cacheHitRate: 0,
            averageTime: 0,
            totalTime: 0
        };
        
        if (this.options.debug) {
            console.log('🚀 統一分析引擎初始化完成');
            console.log(`   可用策略: ${this.strategies.map(s => s.name).join(', ')}`);
        }
    }
    
    /**
     * 主要分析接口：DC 分析
     */
    async analyzeDC(components, options = {}) {
        return this.performAnalysis('DC', components, null, options);
    }
    
    /**
     * 主要分析接口：AC 分析
     */
    async analyzeAC(components, frequencyPoints, options = {}) {
        return this.performAnalysis('AC', components, frequencyPoints, options);
    }
    
    /**
     * 主要分析接口：暫態分析
     */
    async analyzeTRAN(components, timePoints, options = {}) {
        return this.performAnalysis('TRAN', components, timePoints, options);
    }
    
    /**
     * 通用分析執行器
     */
    async performAnalysis(analysisType, components, analysisPoints, options = {}) {
        const startTime = performance.now();
        
        try {
            // 檢查緩存
            const cacheKey = this.generateCacheKey(analysisType, components, analysisPoints, options);
            if (this.options.enableCaching) {
                const cachedResult = this.getFromCache(cacheKey);
                if (cachedResult) {
                    this.cacheStats.hits++;
                    if (this.options.debug) {
                        console.log(`💾 使用緩存結果: ${analysisType}`);
                    }
                    return cachedResult;
                }
                this.cacheStats.misses++;
            }
            
            // 選擇策略
            const strategy = this.selector.selectStrategy(
                this.strategies, 
                components, 
                analysisType, 
                options
            );
            
            // 執行分析
            let result;
            switch (analysisType) {
                case 'DC':
                    result = await strategy.analyzeDC(components, options);
                    this.engineStats.dcAnalyses++;
                    break;
                case 'AC':
                    result = await strategy.analyzeAC(components, analysisPoints, options);
                    this.engineStats.acAnalyses++;
                    break;
                case 'TRAN':
                    result = await strategy.analyzeTRAN(components, analysisPoints, options);
                    this.engineStats.tranAnalyses++;
                    break;
                default:
                    throw new Error(`不支持的分析類型: ${analysisType}`);
            }
            
            // 驗證結果
            if (this.options.validateResults) {
                this.validateResult(result, components);
            }
            
            // 更新統計
            const analysisTime = performance.now() - startTime;
            this.updateEngineStats(analysisTime, result.converged);
            
            // 更新策略性能歷史
            if (result.converged) {
                const normalizedPerf = Math.min(1.0, 10000 / analysisTime); // 歸一化性能
                this.selector.updatePerformanceHistory(
                    strategy.name, 
                    components.length, 
                    normalizedPerf
                );
            }
            
            // 緩存結果
            if (this.options.enableCaching && result.converged) {
                this.addToCache(cacheKey, result);
            }
            
            if (this.options.debug) {
                console.log(`📊 分析完成: ${analysisType} (${analysisTime.toFixed(2)}ms)`);
                console.log(`   策略: ${result.strategy}, 收斂: ${result.converged}`);
            }
            
            return result;
            
        } catch (error) {
            const analysisTime = performance.now() - startTime;
            this.updateEngineStats(analysisTime, false);
            
            // 創建錯誤結果
            const errorResult = new UnifiedAnalysisResult();
            errorResult.setStrategyInfo('Unknown', analysisType);
            errorResult.addError(error);
            errorResult.converged = false;
            
            if (this.options.debug) {
                console.error(`❌ 分析失敗: ${analysisType}`, error);
            }
            
            return errorResult;
        }
    }
    
    /**
     * 生成緩存鍵
     */
    generateCacheKey(analysisType, components, analysisPoints, options) {
        const componentHash = this.hashComponents(components);
        const pointsHash = analysisPoints ? this.hashArray(analysisPoints) : '';
        const optionsHash = this.hashObject(options);
        
        return `${analysisType}_${componentHash}_${pointsHash}_${optionsHash}`;
    }
    
    /**
     * 元件哈希
     */
    hashComponents(components) {
        const componentString = components
            .map(comp => `${comp.type}_${comp.name}_${comp.value || 0}`)
            .join('|');
        return this.simpleHash(componentString);
    }
    
    /**
     * 陣列哈希
     */
    hashArray(array) {
        return this.simpleHash(array.join(','));
    }
    
    /**
     * 對象哈希
     */
    hashObject(obj) {
        const sortedKeys = Object.keys(obj).sort();
        const keyValuePairs = sortedKeys.map(key => `${key}:${obj[key]}`);
        return this.simpleHash(keyValuePairs.join('|'));
    }
    
    /**
     * 簡單哈希函數
     */
    simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // 轉換為32位整數
        }
        return Math.abs(hash).toString(16);
    }
    
    /**
     * 從緩存獲取結果
     */
    getFromCache(key) {
        return this.resultCache.get(key);
    }
    
    /**
     * 添加到緩存
     */
    addToCache(key, result) {
        // 管理緩存大小
        if (this.resultCache.size >= this.options.maxCacheSize) {
            const oldestKey = this.resultCache.keys().next().value;
            this.resultCache.delete(oldestKey);
        }
        
        this.resultCache.set(key, result);
        this.cacheStats.totalSize = this.resultCache.size;
    }
    
    /**
     * 驗證分析結果
     */
    validateResult(result, components) {
        // 基本完整性檢查
        if (!result.nodeVoltages) {
            result.addWarning('缺少節點電壓結果');
        }
        
        if (!result.branchCurrents) {
            result.addWarning('缺少支路電流結果');
        }
        
        // 物理合理性檢查
        for (const [nodeName, voltage] of result.nodeVoltages) {
            if (!isFinite(voltage)) {
                result.addError(`節點 ${nodeName} 電壓無效: ${voltage}`);
            }
            if (Math.abs(voltage) > 1e6) {
                result.addWarning(`節點 ${nodeName} 電壓過大: ${voltage.toExponential(2)}V`);
            }
        }
        
        for (const [componentName, current] of result.branchCurrents) {
            if (!isFinite(current)) {
                result.addError(`元件 ${componentName} 電流無效: ${current}`);
            }
            if (Math.abs(current) > 1e6) {
                result.addWarning(`元件 ${componentName} 電流過大: ${current.toExponential(2)}A`);
            }
        }
    }
    
    /**
     * 更新引擎統計
     */
    updateEngineStats(analysisTime, success) {
        this.engineStats.totalAnalyses++;
        this.engineStats.totalTime += analysisTime;
        this.engineStats.averageTime = this.engineStats.totalTime / this.engineStats.totalAnalyses;
        
        if (this.cacheStats.hits + this.cacheStats.misses > 0) {
            this.engineStats.cacheHitRate = this.cacheStats.hits / (this.cacheStats.hits + this.cacheStats.misses);
        }
    }
    
    /**
     * 清空緩存
     */
    clearCache() {
        this.resultCache.clear();
        this.cacheStats = {
            hits: 0,
            misses: 0,
            totalSize: 0
        };
        
        if (this.options.debug) {
            console.log('🗑️ 緩存已清空');
        }
    }
    
    /**
     * 獲取引擎統計信息
     */
    getEngineStats() {
        return {
            engine: { ...this.engineStats },
            cache: { ...this.cacheStats },
            selector: this.selector.getSelectionStats(),
            strategies: this.strategies.map(s => ({
                name: s.name,
                stats: s.getStats()
            }))
        };
    }
    
    /**
     * 獲取策略信息
     */
    getAvailableStrategies() {
        return this.strategies.map(strategy => ({
            name: strategy.name,
            capabilities: strategy.capabilities,
            stats: strategy.getStats()
        }));
    }
    
    /**
     * 設置調試模式
     */
    setDebug(enabled) {
        this.options.debug = enabled;
        this.selector.options.debug = enabled;
        
        for (const strategy of this.strategies) {
            strategy.setDebug(enabled);
        }
        
        if (enabled) {
            console.log('🐛 調試模式已啟用');
        }
    }
    
    /**
     * 手動添加策略
     */
    addStrategy(strategy) {
        if (!(strategy instanceof AnalysisStrategy)) {
            throw new Error('策略必須繼承自 AnalysisStrategy');
        }
        
        this.strategies.push(strategy);
        strategy.setDebug(this.options.debug);
        
        if (this.options.debug) {
            console.log(`➕ 添加策略: ${strategy.name}`);
        }
    }
    
    /**
     * 移除策略
     */
    removeStrategy(strategyName) {
        const index = this.strategies.findIndex(s => s.name === strategyName);
        if (index >= 0) {
            this.strategies.splice(index, 1);
            
            if (this.options.debug) {
                console.log(`➖ 移除策略: ${strategyName}`);
            }
            
            return true;
        }
        return false;
    }
}

export default UnifiedAnalysisEngine;