/**
 * 統一分析結果類 - 標準化所有分析的輸出格式
 * 
 * 這個類解決了不同求解器返回格式不一致的問題，提供：
 * 1. 統一的數據存取接口
 * 2. 結果驗證和後處理
 * 3. 性能統計和錯誤處理
 * 4. 結果可視化支持
 * 
 * @author AkingSPICE Team
 * @version 3.0
 */

/**
 * 分析結果主類
 */
export class AnalysisResult {
    constructor(analysisType = 'DC') {
        this.analysisType = analysisType;
        this.converged = false;
        this.iterations = 0;
        this.timestamp = new Date();
        
        // 核心結果數據
        this.nodeVoltages = new Map();     // 節點電壓
        this.branchCurrents = new Map();   // 支路電流
        this.powerDissipation = new Map(); // 功率耗散
        
        // 時域數據（暫態分析）
        this.timePoints = [];
        this.waveforms = new Map(); // 波形數據
        
        // 頻域數據（AC 分析）
        this.frequencies = [];
        this.magnitudes = new Map();
        this.phases = new Map();
        
        // 元數據
        this.strategy = '';
        this.selectionReason = '';
        this.analysisTime = 0;
        this.compilationTime = 0;
        this.solverTime = 0;
        
        // 錯誤和警告
        this.errors = [];
        this.warnings = [];
        
        // 品質指標
        this.residual = 0;
        this.conditionNumber = 0;
        this.stabilityMargin = 0;
    }

    /**
     * 設置節點電壓
     * @param {string|number} node 節點名或索引
     * @param {number|Complex} voltage 電壓值
     */
    setNodeVoltage(node, voltage) {
        this.nodeVoltages.set(String(node), voltage);
    }

    /**
     * 獲取節點電壓
     * @param {string|number} node 節點名或索引
     * @returns {number|Complex} 電壓值
     */
    getNodeVoltage(node) {
        return this.nodeVoltages.get(String(node)) || 0;
    }

    /**
     * 獲取所有節點電壓（排序後）
     * @returns {Array} [節點名, 電壓值] 對的數組
     */
    getAllNodeVoltages() {
        return Array.from(this.nodeVoltages.entries())
            .sort(([a], [b]) => {
                // 數字節點優先，然後按名稱排序
                const aNum = parseInt(a);
                const bNum = parseInt(b);
                if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
                if (!isNaN(aNum)) return -1;
                if (!isNaN(bNum)) return 1;
                return a.localeCompare(b);
            });
    }

    /**
     * 設置支路電流
     * @param {string} branch 支路名（通常是元件名）
     * @param {number|Complex} current 電流值
     */
    setBranchCurrent(branch, current) {
        this.branchCurrents.set(branch, current);
    }

    /**
     * 獲取支路電流
     * @param {string} branch 支路名
     * @returns {number|Complex} 電流值
     */
    getBranchCurrent(branch) {
        return this.branchCurrents.get(branch) || 0;
    }

    /**
     * 添加時間點數據（暫態分析）
     * @param {number} time 時間點
     * @param {Map} voltages 該時間點的所有節點電壓
     * @param {Map} currents 該時間點的所有支路電流
     */
    addTimePoint(time, voltages, currents = new Map()) {
        this.timePoints.push(time);
        
        // 為每個節點/支路添加波形點
        for (const [node, voltage] of voltages) {
            if (!this.waveforms.has(node)) {
                this.waveforms.set(node, []);
            }
            this.waveforms.get(node).push(voltage);
        }
        
        for (const [branch, current] of currents) {
            const key = `I(${branch})`;
            if (!this.waveforms.has(key)) {
                this.waveforms.set(key, []);
            }
            this.waveforms.get(key).push(current);
        }
    }

    /**
     * 添加頻率點數據（AC 分析）
     * @param {number} freq 頻率
     * @param {Map} magnitudes 幅度響應
     * @param {Map} phases 相位響應
     */
    addFrequencyPoint(freq, magnitudes, phases) {
        this.frequencies.push(freq);
        
        for (const [node, mag] of magnitudes) {
            if (!this.magnitudes.has(node)) {
                this.magnitudes.set(node, []);
            }
            this.magnitudes.get(node).push(mag);
        }
        
        for (const [node, phase] of phases) {
            if (!this.phases.has(node)) {
                this.phases.set(node, []);
            }
            this.phases.get(node).push(phase);
        }
    }

    /**
     * 添加錯誤信息
     * @param {string|Error} error 錯誤信息或錯誤對象
     */
    addError(error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.errors.push({
            message: errorMsg,
            timestamp: new Date()
        });
        
        // 嚴重錯誤導致不收斂
        this.converged = false;
    }

    /**
     * 添加警告信息
     * @param {string} warning 警告信息
     */
    addWarning(warning) {
        this.warnings.push({
            message: warning,
            timestamp: new Date()
        });
    }

    /**
     * 添加性能統計
     * @param {Object} stats 性能數據
     */
    addPerformanceStats(stats) {
        if (stats.analysisTime !== undefined) this.analysisTime = stats.analysisTime;
        if (stats.compilationTime !== undefined) this.compilationTime = stats.compilationTime;
        if (stats.solverTime !== undefined) this.solverTime = stats.solverTime;
        if (stats.iterations !== undefined) this.iterations = stats.iterations;
        if (stats.residual !== undefined) this.residual = stats.residual;
        if (stats.conditionNumber !== undefined) this.conditionNumber = stats.conditionNumber;
    }

    /**
     * 驗證結果完整性
     * @returns {boolean} 結果是否有效
     */
    validate() {
        // 基本檢查
        if (this.nodeVoltages.size === 0) {
            this.addWarning('沒有節點電壓數據');
            return false;
        }

        // 檢查 NaN 和無窮大
        for (const [node, voltage] of this.nodeVoltages) {
            if (!isFinite(voltage)) {
                this.addError(`節點 ${node} 電壓無效: ${voltage}`);
                return false;
            }
        }

        // 暫態分析特定檢查
        if (this.analysisType === 'TRAN') {
            if (this.timePoints.length === 0) {
                this.addError('暫態分析缺少時間點數據');
                return false;
            }
            
            // 檢查波形數據一致性
            for (const [signal, data] of this.waveforms) {
                if (data.length !== this.timePoints.length) {
                    this.addWarning(`信號 ${signal} 數據點數量不匹配`);
                }
            }
        }

        return true;
    }

    /**
     * 計算功率統計
     */
    calculatePowerStats() {
        let totalPower = 0;
        
        // 基於電壓和電流計算功率（簡化版）
        for (const [branch, current] of this.branchCurrents) {
            const voltage = this.nodeVoltages.get(branch) || 0;
            const power = Math.abs(voltage * current);
            this.powerDissipation.set(branch, power);
            totalPower += power;
        }
        
        return {
            totalPower,
            maxPower: Math.max(...this.powerDissipation.values()),
            powerDistribution: Object.fromEntries(this.powerDissipation.entries())
        };
    }

    /**
     * 導出為標準格式
     * @param {string} format 格式 ('json', 'csv', 'spice')
     * @returns {string} 格式化的結果
     */
    export(format = 'json') {
        switch (format.toLowerCase()) {
            case 'json':
                return this.toJSON();
            case 'csv':
                return this.toCSV();
            case 'spice':
                return this.toSPICE();
            default:
                throw new Error(`不支持的導出格式: ${format}`);
        }
    }

    /**
     * 轉換為 JSON
     */
    toJSON() {
        return JSON.stringify({
            analysisType: this.analysisType,
            converged: this.converged,
            iterations: this.iterations,
            timestamp: this.timestamp,
            strategy: this.strategy,
            nodeVoltages: Object.fromEntries(this.nodeVoltages),
            branchCurrents: Object.fromEntries(this.branchCurrents),
            timePoints: this.timePoints,
            waveforms: Object.fromEntries(this.waveforms),
            performance: {
                analysisTime: this.analysisTime,
                compilationTime: this.compilationTime,
                solverTime: this.solverTime,
                residual: this.residual
            },
            errors: this.errors,
            warnings: this.warnings
        }, null, 2);
    }

    /**
     * 轉換為 CSV（主要用於時域數據）
     */
    toCSV() {
        if (this.analysisType !== 'TRAN') {
            // DC/AC 分析的簡單表格
            let csv = 'Node,Voltage\n';
            for (const [node, voltage] of this.getAllNodeVoltages()) {
                csv += `${node},${voltage}\n`;
            }
            return csv;
        }

        // 暫態分析的波形數據
        const headers = ['Time', ...Array.from(this.waveforms.keys())];
        let csv = headers.join(',') + '\n';
        
        for (let i = 0; i < this.timePoints.length; i++) {
            const row = [this.timePoints[i]];
            for (const signal of headers.slice(1)) {
                const waveform = this.waveforms.get(signal) || [];
                row.push(waveform[i] || 0);
            }
            csv += row.join(',') + '\n';
        }
        
        return csv;
    }

    /**
     * 轉換為 SPICE 兼容格式
     */
    toSPICE() {
        let output = `* AkingSPICE ${this.analysisType} Analysis Results\n`;
        output += `* Generated: ${this.timestamp.toISOString()}\n`;
        output += `* Strategy: ${this.strategy}\n`;
        output += `* Converged: ${this.converged}\n`;
        output += `* Iterations: ${this.iterations}\n\n`;

        if (this.analysisType === 'DC') {
            output += 'DC Operating Point:\n';
            for (const [node, voltage] of this.getAllNodeVoltages()) {
                output += `V(${node}) = ${voltage.toFixed(6)}V\n`;
            }
        }

        return output;
    }

    /**
     * 克隆結果對象
     * @returns {AnalysisResult} 深度拷貝的結果
     */
    clone() {
        const cloned = new AnalysisResult(this.analysisType);
        
        // 複製基本屬性
        cloned.converged = this.converged;
        cloned.iterations = this.iterations;
        cloned.timestamp = new Date(this.timestamp);
        cloned.strategy = this.strategy;
        cloned.selectionReason = this.selectionReason;
        cloned.analysisTime = this.analysisTime;
        cloned.compilationTime = this.compilationTime;
        cloned.solverTime = this.solverTime;
        cloned.residual = this.residual;
        cloned.conditionNumber = this.conditionNumber;
        
        // 深度複製 Map 對象
        cloned.nodeVoltages = new Map(this.nodeVoltages);
        cloned.branchCurrents = new Map(this.branchCurrents);
        cloned.powerDissipation = new Map(this.powerDissipation);
        
        // 複製數組
        cloned.timePoints = [...this.timePoints];
        cloned.frequencies = [...this.frequencies];
        
        // 深度複製波形數據
        for (const [key, data] of this.waveforms) {
            cloned.waveforms.set(key, [...data]);
        }
        
        for (const [key, data] of this.magnitudes) {
            cloned.magnitudes.set(key, [...data]);
        }
        
        for (const [key, data] of this.phases) {
            cloned.phases.set(key, [...data]);
        }
        
        // 複製錯誤和警告
        cloned.errors = this.errors.map(e => ({...e, timestamp: new Date(e.timestamp)}));
        cloned.warnings = this.warnings.map(w => ({...w, timestamp: new Date(w.timestamp)}));
        
        return cloned;
    }

    /**
     * 合併多個分析結果（用於並行分析比較）
     * @param {AnalysisResult[]} results 要合併的結果數組
     * @returns {AnalysisResult} 合併後的結果
     */
    static merge(results) {
        if (!results.length) return new AnalysisResult();
        
        const merged = results[0].clone();
        merged.strategy = results.map(r => r.strategy).join('+');
        merged.selectionReason = 'merged';
        
        // 合併錯誤和警告
        for (let i = 1; i < results.length; i++) {
            merged.errors.push(...results[i].errors);
            merged.warnings.push(...results[i].warnings);
        }
        
        return merged;
    }

    /**
     * 比較兩個結果的差異
     * @param {AnalysisResult} other 要比較的結果
     * @returns {Object} 差異報告
     */
    compare(other) {
        const report = {
            nodeVoltageDiffs: new Map(),
            maxVoltageDiff: 0,
            rmsVoltageDiff: 0,
            strategiesMatch: this.strategy === other.strategy,
            convergenceMatch: this.converged === other.converged
        };

        // 比較節點電壓
        const commonNodes = new Set([
            ...this.nodeVoltages.keys(),
            ...other.nodeVoltages.keys()
        ]);

        let sumSquaredDiffs = 0;
        let nodeCount = 0;

        for (const node of commonNodes) {
            const v1 = this.getNodeVoltage(node);
            const v2 = other.getNodeVoltage(node);
            const diff = Math.abs(v1 - v2);
            
            report.nodeVoltageDiffs.set(node, diff);
            report.maxVoltageDiff = Math.max(report.maxVoltageDiff, diff);
            sumSquaredDiffs += diff * diff;
            nodeCount++;
        }

        if (nodeCount > 0) {
            report.rmsVoltageDiff = Math.sqrt(sumSquaredDiffs / nodeCount);
        }

        return report;
    }
}

/**
 * 工廠函數 - 創建特定類型的結果對象
 */
export function createAnalysisResult(type, initialData = {}) {
    const result = new AnalysisResult(type);
    
    // 根據類型進行特殊初始化
    switch (type) {
        case 'DC':
            result.converged = true; // DC 分析默認假設會收斂
            break;
        case 'TRAN':
            result.timePoints = [];
            result.waveforms = new Map();
            break;
        case 'AC':
            result.frequencies = [];
            result.magnitudes = new Map();
            result.phases = new Map();
            break;
    }
    
    // 設置初始數據
    Object.assign(result, initialData);
    
    return result;
}