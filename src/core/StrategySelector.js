/**
 * 策略選擇器 - 智能選擇最優分析策略
 * 
 * 這個模塊是 UnifiedAnalysisEngine 的大腦，負責：
 * 1. 分析電路特徵（線性度、剛性、規模等）
 * 2. 根據分析類型和性能需求選擇最優策略
 * 3. 提供備用策略列表
 * 4. 學習和優化策略選擇
 * 
 * 核心算法：
 * - 啟發式規則 + 成本模型
 * - 動態性能反饋
 * - 多目標優化（速度 vs 精度）
 * 
 * @author AkingSPICE Team
 * @version 3.0
 */

import { ImplicitMNAStrategy } from './UnifiedAnalysisStrategies.js';
import { StateSpaceStrategy } from './UnifiedAnalysisStrategies.js';

/**
 * 電路特徵分析器
 */
class CircuitAnalyzer {
    /**
     * 分析電路的基本特徵
     * @param {Circuit} circuit 
     * @returns {Object} 特徵描述
     */
    static analyzeCircuit(circuit) {
        const components = circuit.components || [];
        const nodes = new Set();
        
        let linearComponents = 0;
        let nonlinearComponents = 0;
        let reactiveComponents = 0; // C, L
        let controlledSources = 0;
        let switches = 0;

        for (const comp of components) {
            // 收集節點
            if (comp.nodes) {
                comp.nodes.forEach(node => nodes.add(node));
            }

            // 分類元件
            switch (comp.type) {
                case 'R':
                case 'V':
                case 'I':
                    linearComponents++;
                    break;
                case 'C':
                case 'L':
                    reactiveComponents++;
                    linearComponents++;
                    break;
                case 'D':
                case 'Q':
                case 'M':
                    nonlinearComponents++;
                    break;
                case 'E':
                case 'F':
                case 'G':
                case 'H':
                    controlledSources++;
                    linearComponents++;
                    break;
                case 'S':
                case 'W':
                    switches++;
                    break;
                default:
                    linearComponents++; // 默認視為線性
            }
        }

        const nodeCount = nodes.size;
        const componentCount = components.length;
        const isLinear = nonlinearComponents === 0 && switches === 0;
        const hasReactive = reactiveComponents > 0;

        // 電路複雜度評估
        const complexity = this.estimateComplexity(nodeCount, componentCount, nonlinearComponents);
        
        // 剛性評估（基於電容、電感比例）
        const stiffness = this.estimateStiffness(components);

        return {
            nodeCount,
            componentCount,
            linearComponents,
            nonlinearComponents,
            reactiveComponents,
            controlledSources,
            switches,
            isLinear,
            hasReactive,
            complexity, // 'low', 'medium', 'high'
            stiffness   // 0.0 - 1.0
        };
    }

    /**
     * 估算電路複雜度
     */
    static estimateComplexity(nodes, components, nonlinear) {
        const score = nodes * 2 + components + nonlinear * 5;
        
        if (score < 20) return 'low';
        if (score < 100) return 'medium';
        return 'high';
    }

    /**
     * 估算電路剛性
     */
    static estimateStiffness(components) {
        let totalC = 0, totalL = 0, totalR = 0;
        
        for (const comp of components) {
            switch (comp.type) {
                case 'C':
                    totalC += comp.capacitance || comp.value || 0;
                    break;
                case 'L':
                    totalL += comp.inductance || comp.value || 0;
                    break;
                case 'R':
                    totalR += comp.resistance || comp.value || 0;
                    break;
            }
        }

        // 簡化的剛性評估：基於 RC 和 LC 時間常數的差異
        if (totalC === 0 || totalR === 0) return 0.0;
        
        const rcTimeConstant = totalR * totalC;
        const lcFreq = totalL > 0 ? 1.0 / Math.sqrt(totalL * totalC) : 0;
        
        // 高頻振蕩 + 長時間常數 = 剛性
        return Math.min(1.0, Math.log10(Math.max(1, rcTimeConstant * lcFreq)) / 6.0);
    }
}

/**
 * 策略成本模型
 */
class CostModel {
    /**
     * 計算策略執行成本
     * @param {string} strategyName 策略名稱
     * @param {string} analysisType 分析類型
     * @param {Object} circuitFeatures 電路特徵
     * @returns {number} 預估成本（相對值）
     */
    static estimateCost(strategyName, analysisType, circuitFeatures) {
        const { nodeCount, componentCount, complexity, isLinear, hasReactive } = circuitFeatures;

        let baseCost = 0;

        switch (strategyName) {
            case 'ImplicitMNA':
                // 隱式 MNA：對大規模、非線性電路表現優異
                baseCost = Math.pow(nodeCount, 2.2); // 超線性增長
                if (!isLinear) baseCost *= 0.8; // 非線性電路中相對優勢
                if (complexity === 'high') baseCost *= 0.9;
                break;

            case 'StateSpace':
                // 狀態空間：對線性電路極其高效
                baseCost = nodeCount * 1.5; // 近似線性
                if (!isLinear) baseCost *= 3.0; // 非線性電路中劣勢明顯
                if (!hasReactive) baseCost *= 2.0; // 無儲能元件時不適用
                if (analysisType === 'TRAN') baseCost *= 0.6; // 暫態分析優勢
                break;

            default:
                baseCost = nodeCount * 2.0;
        }

        // 分析類型調整
        switch (analysisType) {
            case 'DC':
                if (strategyName === 'StateSpace' && isLinear) baseCost *= 0.7;
                break;
            case 'TRAN':
                if (strategyName === 'StateSpace' && isLinear) baseCost *= 0.5;
                if (strategyName === 'ImplicitMNA' && !isLinear) baseCost *= 0.8;
                break;
            case 'AC':
                if (strategyName === 'StateSpace') baseCost *= 0.6;
                break;
        }

        return Math.max(1.0, baseCost);
    }

    /**
     * 估算策略可靠性
     * @param {string} strategyName 
     * @param {Object} circuitFeatures 
     * @returns {number} 可靠性分數 (0.0 - 1.0)
     */
    static estimateReliability(strategyName, circuitFeatures) {
        const { isLinear, complexity, stiffness } = circuitFeatures;
        
        let reliability = 0.8; // 基准可靠性

        switch (strategyName) {
            case 'ImplicitMNA':
                reliability = 0.9;
                if (complexity === 'high') reliability -= 0.1;
                if (stiffness > 0.7) reliability -= 0.15;
                break;

            case 'StateSpace':
                if (isLinear) {
                    reliability = 0.95;
                } else {
                    reliability = 0.3; // 非線性電路中不可靠
                }
                if (stiffness > 0.5) reliability -= 0.2;
                break;
        }

        return Math.max(0.1, Math.min(1.0, reliability));
    }
}

/**
 * 策略選擇器主類
 */
export class StrategySelector {
    constructor(options = {}) {
        this.options = {
            preferredStrategy: 'auto',
            performanceTarget: 'balanced', // 'speed', 'accuracy', 'balanced'
            debug: false,
            ...options
        };

        // 策略實例緩存
        this.strategies = new Map();
        
        // 性能歷史記錄
        this.performanceHistory = new Map();
        
        this.initializeStrategies();
    }

    /**
     * 初始化所有策略
     */
    async initializeStrategies() {
        try {
            this.strategies.set('ImplicitMNA', new ImplicitMNAStrategy({
                debug: this.options.debug
            }));
            
            this.strategies.set('StateSpace', new StateSpaceStrategy({
                debug: this.options.debug
            }));

            if (this.options.debug) {
                console.log('   可用策略:', Array.from(this.strategies.keys()).join(', '));
            }
        } catch (error) {
            console.error('策略初始化失敗:', error);
        }
    }

    /**
     * 選擇最優策略
     * @param {string} analysisType 分析類型
     * @param {Circuit} circuit 電路
     * @param {Object} options 選項
     * @returns {Object} 選中的策略及原因
     */
    async selectStrategy(analysisType, circuit, options = {}) {
        // 強制策略
        if (options.forceStrategy && this.strategies.has(options.forceStrategy)) {
            const strategy = this.strategies.get(options.forceStrategy);
            return {
                strategy,
                name: options.forceStrategy,
                reason: 'forced'
            };
        }

        // 分析電路特徵
        const circuitFeatures = CircuitAnalyzer.analyzeCircuit(circuit);
        
        if (this.options.debug) {
            console.log(`🤔 選擇策略：分析類型=${analysisType}, 元件數=${circuitFeatures.componentCount}`);
        }

        // 啟發式規則
        const heuristicChoice = this.applyHeuristics(analysisType, circuitFeatures);
        if (heuristicChoice) {
            const strategy = this.strategies.get(heuristicChoice.name);
            return {
                strategy,
                name: heuristicChoice.name,
                reason: heuristicChoice.reason
            };
        }

        // 成本分析
        const bestChoice = this.selectByCostAnalysis(analysisType, circuitFeatures);
        const strategy = this.strategies.get(bestChoice.name);
        
        return {
            strategy,
            name: bestChoice.name,
            reason: 'cost-analysis'
        };
    }

    /**
     * 應用啟發式規則
     */
    applyHeuristics(analysisType, features) {
        const { isLinear, nonlinearComponents, complexity, hasReactive } = features;

        // 規則 1: 純阻性線性電路，簡單處理
        if (isLinear && !hasReactive && complexity === 'low') {
            return { name: 'ImplicitMNA', reason: 'simple-resistive' };
        }

        // 規則 2: 大規模線性電路，狀態空間優勢明顯
        if (isLinear && hasReactive && complexity === 'high' && analysisType === 'TRAN') {
            return { name: 'StateSpace', reason: 'large-linear-transient' };
        }

        // 規則 3: 強非線性電路，必須用隱式
        if (nonlinearComponents > features.componentCount * 0.3) {
            return { name: 'ImplicitMNA', reason: 'highly-nonlinear' };
        }

        // 規則 4: 偏好設置
        if (this.options.preferredStrategy !== 'auto') {
            const preferred = this.options.preferredStrategy === 'implicit' ? 'ImplicitMNA' : 'StateSpace';
            if (this.strategies.has(preferred)) {
                return { name: preferred, reason: 'user-preference' };
            }
        }

        return null; // 無明確規則，交由成本分析
    }

    /**
     * 基於成本模型選擇策略
     */
    selectByCostAnalysis(analysisType, features) {
        const candidates = Array.from(this.strategies.keys());
        let bestChoice = null;
        let bestScore = Infinity;

        if (this.options.debug) {
            console.log('策略成本分析:');
        }

        for (const strategyName of candidates) {
            const cost = CostModel.estimateCost(strategyName, analysisType, features);
            const reliability = CostModel.estimateReliability(strategyName, features);
            
            // 綜合評分：平衡成本與可靠性
            let score = cost;
            switch (this.options.performanceTarget) {
                case 'speed':
                    score = cost * 0.8 + (1 - reliability) * 100; // 偏重速度
                    break;
                case 'accuracy':
                    score = cost * 1.2 + (1 - reliability) * 200; // 偏重可靠性
                    break;
                case 'balanced':
                default:
                    score = cost + (1 - reliability) * 150; // 平衡
                    break;
            }

            if (this.options.debug) {
                console.log(`  ${strategyName}: 成本=${cost.toFixed(1)}, 可靠性=${reliability.toFixed(2)}`);
            }

            if (score < bestScore) {
                bestScore = score;
                bestChoice = { name: strategyName, cost, reliability };
            }
        }

        return bestChoice;
    }

    /**
     * 獲取備用策略列表
     */
    async getFallbackStrategies(analysisType, circuit, options) {
        const circuitFeatures = CircuitAnalyzer.analyzeCircuit(circuit);
        const allStrategies = Array.from(this.strategies.keys());
        
        // 按可靠性排序
        const sortedStrategies = allStrategies
            .map(name => ({
                name,
                strategy: this.strategies.get(name),
                reliability: CostModel.estimateReliability(name, circuitFeatures)
            }))
            .sort((a, b) => b.reliability - a.reliability);

        return sortedStrategies.map(item => item.strategy);
    }

    /**
     * 記錄策略性能
     */
    recordPerformance(strategyName, analysisType, executionTime, success) {
        const key = `${strategyName}_${analysisType}`;
        
        if (!this.performanceHistory.has(key)) {
            this.performanceHistory.set(key, {
                executions: 0,
                totalTime: 0,
                successes: 0
            });
        }

        const record = this.performanceHistory.get(key);
        record.executions++;
        record.totalTime += executionTime;
        if (success) record.successes++;
    }

    /**
     * 獲取策略統計
     */
    getStrategyStats() {
        const stats = {};
        
        for (const [key, record] of this.performanceHistory) {
            const [strategy, analysis] = key.split('_');
            
            if (!stats[strategy]) {
                stats[strategy] = {};
            }

            stats[strategy][analysis] = {
                executions: record.executions,
                averageTime: record.executions > 0 ? record.totalTime / record.executions : 0,
                successRate: record.executions > 0 ? record.successes / record.executions : 0
            };
        }

        return stats;
    }
}