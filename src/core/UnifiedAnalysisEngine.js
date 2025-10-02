/**
 * 統一分析引擎 - AkingSPICE 的頂層分析 API
 * 
 * 這個引擎解決了 AkingSPICE 的「雙重人格」問題：
 * • 隱式 MNA 求解器 (適用於非線性、剛性問題)
 * • 狀態空間求解器 (適用於線性時不變系統)
 * 
 * 核心設計原則：
 * 1. 策略模式：根據電路特性智能選擇最優求解策略
 * 2. 統一接口：用戶無需關心內部實現細節
 * 3. 性能優化：緩存編譯結果，避免重複計算
 * 4. 漸進增強：從簡單策略開始，必要時自動升級
 * 
 * @author AkingSPICE Team
 * @version 3.0
 */

import { StrategySelector } from './StrategySelector.js';
import { AnalysisResult } from './AnalysisResult.js';

/**
 * 統一分析引擎類
 * 
 * 職責：
 * - 提供統一的分析接口 (analyzeDC, analyzeTRAN, analyzeAC)
 * - 智能選擇最優求解策略
 * - 管理分析結果緩存
 * - 協調不同求解器間的數據流轉
 */
export class UnifiedAnalysisEngine {
    /**
     * @param {Object} options 配置選項
     * @param {boolean} options.enableCaching 是否啟用結果緩存
     * @param {boolean} options.debug 是否輸出調試信息
     * @param {number} options.maxCacheSize 最大緩存條目數
     * @param {string} options.preferredStrategy 首選策略 ('auto', 'implicit', 'statespace')
     */
    constructor(options = {}) {
        this.options = {
            enableCaching: true,
            debug: false,
            maxCacheSize: 100,
            preferredStrategy: 'auto',
            performanceTarget: 'balanced', // 'speed', 'accuracy', 'balanced'
            ...options
        };

        // 策略選擇器 - 大腦
        this.strategySelector = new StrategySelector(this.options);
        
        // 結果緩存 - 記憶
        this.resultCache = new Map();
        
        // 性能統計
        this.stats = {
            totalAnalyses: 0,
            cacheHits: 0,
            cacheMisses: 0,
            averageTime: 0,
            strategyUsage: new Map()
        };

        if (this.options.debug) {
            console.log('🚀 統一分析引擎初始化完成');
            console.log(`   緩存: ${this.options.enableCaching ? '啟用' : '禁用'}`);
            console.log(`   首選策略: ${this.options.preferredStrategy}`);
            console.log(`   性能目標: ${this.options.performanceTarget}`);
        }
    }

    /**
     * DC 分析 - 統一入口點
     * @param {Circuit} circuit 電路對象
     * @param {Object} options 分析選項
     * @returns {Promise<AnalysisResult>} 分析結果
     */
    async analyzeDC(circuit, options = {}) {
        const startTime = performance.now();
        
        try {
            // 1. 檢查緩存
            const cacheKey = this.generateCacheKey('DC', circuit, options);
            if (this.options.enableCaching && this.resultCache.has(cacheKey)) {
                this.stats.cacheHits++;
                if (this.options.debug) {
                    console.log('💾 使用緩存結果: DC');
                }
                return this.resultCache.get(cacheKey).clone();
            }

            // 2. 選擇最優策略
            const strategyInfo = await this.strategySelector.selectStrategy('DC', circuit, options);
            
            if (this.options.debug) {
                console.log(`📋 選擇策略: ${strategyInfo.name} (原因: ${strategyInfo.reason})`);
            }

            // 3. 執行分析
            const result = await strategyInfo.strategy.analyzeDC(circuit, options);
            
            // 4. 後處理和緩存
            result.strategy = strategy.name;
            result.selectionReason = strategy.reason;
            result.analysisTime = performance.now() - startTime;

            if (this.options.enableCaching) {
                this.cacheResult(cacheKey, result);
            }

            // 5. 更新統計
            this.updateStats(strategy.name, result.analysisTime);
            this.stats.cacheMisses++;

            return result;

        } catch (error) {
            // 錯誤恢復：嘗試備用策略
            if (this.options.debug) {
                console.log(`❌ 策略失敗，嘗試備用方案: ${error.message}`);
            }
            
            const fallbackResult = await this.tryFallbackStrategy('DC', circuit, options, error);
            if (fallbackResult) {
                fallbackResult.analysisTime = performance.now() - startTime;
                return fallbackResult;
            }
            
            throw error;
        }
    }

    /**
     * 暫態分析 - 統一入口點
     * @param {Circuit} circuit 電路對象
     * @param {Object} options 分析選項 (tStart, tStop, tStep, etc.)
     * @returns {Promise<AnalysisResult>} 分析結果
     */
    async analyzeTRAN(circuit, options = {}) {
        const startTime = performance.now();
        
        try {
            // 暫態分析通常不緩存（結果太大）
            const strategyInfo = await this.strategySelector.selectStrategy('TRAN', circuit, options);
            
            if (this.options.debug) {
                console.log(`📋 暫態分析策略: ${strategyInfo.name}`);
            }

            const result = await strategyInfo.strategy.analyzeTRAN(circuit, options);
            result.strategy = strategyInfo.name;
            result.analysisTime = performance.now() - startTime;

            this.updateStats(strategy.name, result.analysisTime);
            
            return result;

        } catch (error) {
            const fallbackResult = await this.tryFallbackStrategy('TRAN', circuit, options, error);
            if (fallbackResult) {
                fallbackResult.analysisTime = performance.now() - startTime;
                return fallbackResult;
            }
            
            throw error;
        }
    }

    /**
     * AC 分析 - 統一入口點
     * @param {Circuit} circuit 電路對象
     * @param {Object} options 分析選項 (fStart, fStop, points, etc.)
     * @returns {Promise<AnalysisResult>} 分析結果
     */
    async analyzeAC(circuit, options = {}) {
        const startTime = performance.now();
        
        try {
            const strategyInfo = await this.strategySelector.selectStrategy('AC', circuit, options);
            
            if (this.options.debug) {
                console.log(`📋 AC 分析策略: ${strategyInfo.name}`);
            }

            const result = await strategyInfo.strategy.analyzeAC(circuit, options);
            result.strategy = strategyInfo.name;
            result.analysisTime = performance.now() - startTime;

            this.updateStats(strategy.name, result.analysisTime);
            
            return result;

        } catch (error) {
            const fallbackResult = await this.tryFallbackStrategy('AC', circuit, options, error);
            if (fallbackResult) {
                fallbackResult.analysisTime = performance.now() - startTime;
                return fallbackResult;
            }
            
            throw error;
        }
    }

    /**
     * 生成緩存鍵
     */
    generateCacheKey(analysisType, circuit, options) {
        // 簡化的緩存鍵生成（實際實現應考慮更多因素）
        const circuitHash = this.hashCircuit(circuit);
        const optionsHash = JSON.stringify(options);
        return `${analysisType}_${circuitHash}_${btoa(optionsHash).slice(0, 16)}`;
    }

    /**
     * 計算電路哈希值
     */
    hashCircuit(circuit) {
        // 簡化的哈希實現
        const componentSig = circuit.components.map(comp => 
            `${comp.type}_${comp.nodes.join(',')}_${comp.value || comp.voltage || comp.current}`
        ).sort().join('|');
        
        return btoa(componentSig).slice(0, 12);
    }

    /**
     * 緩存分析結果
     */
    cacheResult(key, result) {
        if (this.resultCache.size >= this.options.maxCacheSize) {
            // LRU 淘汰：刪除最舊的條目
            const firstKey = this.resultCache.keys().next().value;
            this.resultCache.delete(firstKey);
        }
        
        this.resultCache.set(key, result.clone());
    }

    /**
     * 嘗試備用策略
     */
    async tryFallbackStrategy(analysisType, circuit, options, originalError) {
        const fallbackStrategies = await this.strategySelector.getFallbackStrategies(
            analysisType, circuit, options
        );

        for (const fallback of fallbackStrategies) {
            try {
                if (this.options.debug) {
                    console.log(`🔄 嘗試備用策略: ${fallback.name}`);
                }
                
                const result = await fallback[`analyze${analysisType}`](circuit, options);
                result.strategy = fallback.name;
                result.isFallback = true;
                result.originalError = originalError.message;
                
                return result;
                
            } catch (fallbackError) {
                if (this.options.debug) {
                    console.log(`❌ 備用策略失敗: ${fallbackError.message}`);
                }
                continue;
            }
        }

        return null; // 所有策略都失敗
    }

    /**
     * 更新性能統計
     */
    updateStats(strategyName, analysisTime) {
        this.stats.totalAnalyses++;
        
        // 更新平均時間
        this.stats.averageTime = (
            (this.stats.averageTime * (this.stats.totalAnalyses - 1) + analysisTime) / 
            this.stats.totalAnalyses
        );

        // 更新策略使用統計
        if (!this.stats.strategyUsage.has(strategyName)) {
            this.stats.strategyUsage.set(strategyName, { count: 0, totalTime: 0 });
        }
        
        const strategyStats = this.stats.strategyUsage.get(strategyName);
        strategyStats.count++;
        strategyStats.totalTime += analysisTime;
    }

    /**
     * 獲取引擎統計信息
     */
    getStatistics() {
        const cacheHitRate = this.stats.totalAnalyses > 0 ? 
            (this.stats.cacheHits / this.stats.totalAnalyses) * 100 : 0;

        return {
            totalAnalyses: this.stats.totalAnalyses,
            averageTime: this.stats.averageTime.toFixed(2),
            cacheHitRate: cacheHitRate.toFixed(1),
            cacheSize: this.resultCache.size,
            strategyUsage: Object.fromEntries(this.stats.strategyUsage.entries())
        };
    }

    /**
     * 清理資源
     */
    cleanup() {
        this.resultCache.clear();
        this.stats = {
            totalAnalyses: 0,
            cacheHits: 0,
            cacheMisses: 0,
            averageTime: 0,
            strategyUsage: new Map()
        };
    }
}

/**
 * 工廠函數 - 創建預配置的引擎實例
 */
export function createAnalysisEngine(preset = 'balanced') {
    const presets = {
        speed: {
            preferredStrategy: 'statespace',
            performanceTarget: 'speed',
            enableCaching: true,
            maxCacheSize: 200
        },
        accuracy: {
            preferredStrategy: 'implicit',
            performanceTarget: 'accuracy',
            enableCaching: false,
            debug: true
        },
        balanced: {
            preferredStrategy: 'auto',
            performanceTarget: 'balanced',
            enableCaching: true,
            maxCacheSize: 100
        },
        development: {
            preferredStrategy: 'auto',
            debug: true,
            enableCaching: false
        }
    };

    return new UnifiedAnalysisEngine(presets[preset] || presets.balanced);
}