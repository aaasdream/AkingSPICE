"use strict";
/**
 * 🔢 稀疏矩陣實現 - AkingSPICE 2.0
 *
 * 基於 Compressed Sparse Row (CSR) 格式
 * 針對 MNA 電路矩陣優化
 *
 * 特點：
 * - 高效的非零元素存儲
 * - 快速矩陣-向量乘法
 * - 支持直接求解器接口 (KLU/UMFPACK)
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SparseMatrix = void 0;
const vector_1 = require("./vector");
const numeric = __importStar(require("numeric"));
/**
 * CSR 格式稀疏矩陣
 *
 * 存儲格式：
 * - values: 非零元素值
 * - colIndices: 列索引
 * - rowPointers: 行指針
 */
class SparseMatrix {
    constructor(rows, cols) {
        this.rows = rows;
        this.cols = cols;
        this._values = [];
        this._colIndices = [];
        this._factorized = false;
        // 求解器模式: 'iterative' | 'numeric' | 'klu'
        this._solverMode = 'numeric';
        // KLU 求解器實例 (未來使用)
        this._kluSolver = null;
        this._isKluFactorized = false;
        this._rowPointers = new Array(rows + 1).fill(0);
    }
    get nnz() {
        return this._values.length;
    }
    /**
     * 獲取元素值
     */
    get(row, col) {
        this._validateIndices(row, col);
        const start = this._rowPointers[row];
        const end = this._rowPointers[row + 1];
        for (let i = start; i < end; i++) {
            if (this._colIndices[i] === col) {
                return this._values[i];
            }
        }
        return 0;
    }
    /**
     * 設置元素值 (會觸發重新分解)
     * 使用更簡單的實現，先收集所有元素再重新構建CSR
     */
    set(row, col, value) {
        this._validateIndices(row, col);
        // 如果值太小，視為刪除
        if (Math.abs(value) < 1e-15) {
            this._removeElement(row, col);
            return;
        }
        // 使用臨時結構重新構建矩陣 - 更可靠的方法
        const entries = [];
        // 收集現有的所有非零元素
        for (let i = 0; i < this.rows; i++) {
            const start = this._rowPointers[i];
            const end = this._rowPointers[i + 1];
            for (let k = start; k < end; k++) {
                const j = this._colIndices[k];
                const val = this._values[k];
                if (i !== row || j !== col) { // 跳過要更新的元素
                    entries.push({ row: i, col: j, value: val });
                }
            }
        }
        // 添加新/更新的元素
        entries.push({ row, col, value });
        // 按行列排序
        entries.sort((a, b) => {
            if (a.row !== b.row)
                return a.row - b.row;
            return a.col - b.col;
        });
        // 重新構建CSR格式
        this._values = entries.map(e => e.value);
        this._colIndices = entries.map(e => e.col);
        this._rowPointers = new Array(this.rows + 1).fill(0);
        // 計算行指針
        for (const entry of entries) {
            this._rowPointers[entry.row + 1]++;
        }
        // 累積行指針
        for (let i = 1; i <= this.rows; i++) {
            this._rowPointers[i] += this._rowPointers[i - 1];
        }
        this._factorized = false;
        this._isKluFactorized = false;
    }
    /**
     * 累加元素值
     */
    add(row, col, value) {
        if (Math.abs(value) < 1e-15)
            return;
        const current = this.get(row, col);
        this.set(row, col, current + value);
    }
    /**
     * 矩陣-向量乘法: y = A * x
     */
    multiply(x) {
        if (x.size !== this.cols) {
            throw new Error(`向量維度不匹配: ${x.size} vs ${this.cols}`);
        }
        const y = new vector_1.Vector(this.rows);
        for (let i = 0; i < this.rows; i++) {
            let sum = 0;
            const start = this._rowPointers[i];
            const end = this._rowPointers[i + 1];
            for (let k = start; k < end; k++) {
                const j = this._colIndices[k];
                const aij = this._values[k];
                sum += aij * x.get(j);
            }
            y.set(i, sum);
        }
        return y;
    }
    /**
     * 🚀 求解線性方程組 Ax = b (同步版本，符合接口)
     *
     * @param b - 右側向量 (RHS)
     * @returns 解向量 x
     */
    solve(b) {
        if (b.size !== this.rows) {
            throw new Error(`右側向量維度不匹配: ${b.size} vs ${this.rows}`);
        }
        if (this.rows !== this.cols) {
            throw new Error('求解器僅支持方陣');
        }
        try {
            console.log(`🧮 使用 ${this._solverMode} 求解器 求解 ${this.rows}x${this.cols} 線性系統...`);
            switch (this._solverMode) {
                case 'numeric':
                    return this._solveWithNumeric(b);
                case 'klu':
                    throw new Error('KLU 求解器需要異步調用 solveAsync()');
                case 'iterative':
                default:
                    return this._solveIterative(b);
            }
        }
        catch (error) {
            console.error('❌ 主求解器失敗，嘗試回退策略...', error);
            // 回退到迭代求解器
            if (this._solverMode !== 'iterative') {
                console.log('🔄 回退到迭代求解器...');
                return this._solveIterative(b);
            }
            throw new Error(`所有求解器都失敗: ${error}`);
        }
    }
    /**
     * 🚀 求解線性方程組 Ax = b (異步版本，支持 KLU)
     *
     * @param b - 右側向量 (RHS)
     * @returns 解向量 x
     */
    async solveAsync(b) {
        if (b.size !== this.rows) {
            throw new Error(`右側向量維度不匹配: ${b.size} vs ${this.rows}`);
        }
        if (this.rows !== this.cols) {
            throw new Error('求解器僅支持方陣');
        }
        try {
            console.log(`🧮 使用 ${this._solverMode} 求解器 求解 ${this.rows}x${this.cols} 線性系統...`);
            switch (this._solverMode) {
                case 'numeric':
                    return this._solveWithNumeric(b);
                case 'klu':
                    return await this._solveWithKLU(b);
                case 'iterative':
                default:
                    return this._solveIterative(b);
            }
        }
        catch (error) {
            console.error('❌ 主求解器失敗，嘗試回退策略...', error);
            // 回退到迭代求解器
            if (this._solverMode !== 'iterative') {
                console.log('🔄 回退到迭代求解器...');
                return this._solveIterative(b);
            }
            throw new Error(`所有求解器都失敗: ${error}`);
        }
    }
    /**
     * LU 分解預處理 (兼容接口)
     */
    factorize() {
        // 對於 numeric 求解器，不需要預分解
        if (this._solverMode === 'numeric' || this._solverMode === 'iterative') {
            this._factorized = true;
            return;
        }
        // 對於 KLU，在第一次 solve 時進行分解
        this._factorized = true;
    }
    /**
     * 使用 numeric.js 庫求解 (短期方案)
     */
    _solveWithNumeric(b) {
        console.log('📊 使用 numeric.js 求解稠密線性系統...');
        // 轉換為稠密矩陣
        const denseA = this.toDense();
        const denseB = b.toArray();
        try {
            // 使用 numeric.solve 求解
            const solution = numeric.solve(denseA, denseB);
            console.log('✅ numeric.js 求解成功');
            return vector_1.Vector.from(solution);
        }
        catch (error) {
            console.error('❌ numeric.js 求解失敗:', error);
            throw new Error(`numeric.solve failed: ${error}`);
        }
    }
    /**
     * 使用 KLU WASM 求解稀疏線性系統
     */
    async _solveWithKLU(b) {
        console.log('🔬 使用 KLU WASM 求解稀疏線性系統...');
        try {
            // 動態導入智能 KLU 求解器
            if (!this._kluSolver) {
                const { default: SmartKluSolver } = await Promise.resolve().then(() => __importStar(require('../../wasm/klu/index')));
                this._kluSolver = new SmartKluSolver({
                    tolerance: 1e-12,
                    memoryGrowth: 1.2,
                    orderingMethod: 'amd'
                });
                await this._kluSolver.initialize();
                if (this._kluSolver.isUsingMock()) {
                    console.log('✅ KLU 模擬器初始化成功 (WASM 版本需要建置)');
                }
                else {
                    console.log('✅ KLU WASM 求解器初始化成功');
                }
            }
            if (!this._isKluFactorized) {
                console.log('🧮 執行 KLU 符號分析和數值分解...');
                // 轉換為 CSC 格式 (KLU 要求)
                const csc = this.toCSC();
                // 進行符號分析
                await this._kluSolver.analyze(csc);
                // 進行數值分解
                await this._kluSolver.factor();
                this._isKluFactorized = true;
                const stats = this._kluSolver.getStatistics();
                console.log(`✅ KLU 分解完成: ${this.rows}x${this.cols}, nnz=${this.nnz}`);
                console.log(`📊 分解統計: 數值秩=${stats.numericalRank}, 條件數估計=${stats.condest.toExponential(2)}`);
            }
            // 求解線性方程組
            const bArray = b.toArray();
            const solution = await this._kluSolver.solve(bArray);
            console.log('✅ KLU WASM 求解成功');
            return vector_1.Vector.from(solution);
        }
        catch (error) {
            console.error('❌ KLU WASM 求解失敗:', error);
            // 釋放資源並重置狀態
            this._cleanupKluSolver();
            throw new Error(`KLU WASM solver failed: ${error}`);
        }
    }
    /**
     * 迭代求解器 (Gauss-Seidel)
     */
    _solveIterative(b) {
        console.log('🔄 使用 Gauss-Seidel 迭代求解...');
        const x = new vector_1.Vector(this.rows);
        const maxIterations = 100;
        const tolerance = 1e-12;
        for (let iter = 0; iter < maxIterations; iter++) {
            let maxChange = 0;
            for (let i = 0; i < this.rows; i++) {
                let sum = 0;
                let diagonal = 1e-15; // 避免零除
                // 遍歷第i行的非零元素
                const start = this._rowPointers[i];
                const end = this._rowPointers[i + 1];
                for (let idx = start; idx < end; idx++) {
                    const j = this._colIndices[idx];
                    const value = this._values[idx];
                    if (i === j) {
                        diagonal = value;
                    }
                    else {
                        sum += value * x.get(j);
                    }
                }
                // 更新解
                const oldValue = x.get(i);
                const newValue = (b.get(i) - sum) / diagonal;
                const change = Math.abs(newValue - oldValue);
                maxChange = Math.max(maxChange, change);
                x.set(i, newValue);
            }
            // 檢查收敛
            if (maxChange < tolerance) {
                if (iter > 0) {
                    console.log(`✅ 迭代求解收敛: ${iter + 1} 次, 誤差: ${maxChange.toExponential(2)}`);
                }
                break;
            }
        }
        return x;
    }
    /**
     * 設置求解器模式
     */
    setSolverMode(mode) {
        this._solverMode = mode;
        this._factorized = false;
        this._isKluFactorized = false;
    }
    /**
     * 釋放 WASM 佔用的內存
     */
    dispose() {
        this._cleanupKluSolver();
        this.clear();
    }
    /**
     * 清理 KLU 求解器資源
     */
    _cleanupKluSolver() {
        if (this._kluSolver) {
            try {
                this._kluSolver.dispose();
            }
            catch (error) {
                console.warn('⚠️ KLU 求解器清理時發生錯誤:', error);
            }
            this._kluSolver = null;
        }
        this._isKluFactorized = false;
    }
    /**
     * 清空矩陣
     */
    clear() {
        this._values = [];
        this._colIndices = [];
        this._rowPointers.fill(0);
        this._factorized = false;
        this._isKluFactorized = false;
        this._kluSolver = null;
    }
    /**
     * 矩陣信息
     */
    getInfo() {
        const fillIn = this.nnz / (this.rows * this.cols);
        const symmetric = this._isSymmetric();
        return {
            rows: this.rows,
            cols: this.cols,
            nnz: this.nnz,
            fillIn,
            symmetric,
            factorized: this._factorized
        };
    }
    /**
     * 轉換為密集矩陣 (調試用)
     */
    toDense() {
        const dense = Array(this.rows).fill(0)
            .map(() => Array(this.cols).fill(0));
        for (let i = 0; i < this.rows; i++) {
            const start = this._rowPointers[i];
            const end = this._rowPointers[i + 1];
            for (let k = start; k < end; k++) {
                const j = this._colIndices[k];
                const value = this._values[k];
                dense[i][j] = value;
            }
        }
        return dense;
    }
    // 私有方法
    _validateIndices(row, col) {
        if (row < 0 || row >= this.rows) {
            throw new Error(`行索引超出範圍: ${row}`);
        }
        if (col < 0 || col >= this.cols) {
            throw new Error(`列索引超出範圍: ${col}`);
        }
    }
    _removeElement(row, col) {
        const start = this._rowPointers[row];
        const end = this._rowPointers[row + 1];
        for (let i = start; i < end; i++) {
            if (this._colIndices[i] === col) {
                this._values.splice(i, 1);
                this._colIndices.splice(i, 1);
                // 更新後續行指針
                for (let j = row + 1; j < this._rowPointers.length; j++) {
                    this._rowPointers[j]--;
                }
                this._factorized = false;
                return;
            }
        }
    }
    _isSymmetric() {
        if (this.rows !== this.cols)
            return false;
        // 檢查對稱性
        for (let i = 0; i < this.rows; i++) {
            for (let j = i + 1; j < this.cols; j++) {
                if (Math.abs(this.get(i, j) - this.get(j, i)) > 1e-12) {
                    return false;
                }
            }
        }
        return true;
    }
    /**
     * 克隆矩陣
     */
    clone() {
        const cloned = new SparseMatrix(this.rows, this.cols);
        cloned._values = [...this._values];
        cloned._colIndices = [...this._colIndices];
        cloned._rowPointers = [...this._rowPointers];
        cloned._factorized = false;
        return cloned;
    }
    /**
     * 轉換為 CSC (Compressed Sparse Column) 格式
     *
     * KLU 求解器需要 CSC 格式輸入
     *
     * @returns CSC 格式的矩陣數據
     */
    toCSC() {
        // 統計每列的非零元素數量
        const colCounts = new Array(this.cols).fill(0);
        for (let row = 0; row < this.rows; row++) {
            const start = this._rowPointers[row];
            const end = this._rowPointers[row + 1];
            for (let i = start; i < end; i++) {
                const col = this._colIndices[i];
                colCounts[col]++;
            }
        }
        // 建立列指針陣列
        const colPointers = new Array(this.cols + 1);
        colPointers[0] = 0;
        for (let col = 0; col < this.cols; col++) {
            colPointers[col + 1] = colPointers[col] + colCounts[col];
        }
        // 分配輸出陣列
        const rowIndices = new Array(this.nnz);
        const values = new Array(this.nnz);
        // 重置列計數器用於填充
        colCounts.fill(0);
        // 按列填充數據
        for (let row = 0; row < this.rows; row++) {
            const start = this._rowPointers[row];
            const end = this._rowPointers[row + 1];
            for (let i = start; i < end; i++) {
                const col = this._colIndices[i];
                const pos = colPointers[col] + colCounts[col];
                rowIndices[pos] = row;
                values[pos] = this._values[i];
                colCounts[col]++;
            }
        }
        return {
            rows: this.rows,
            cols: this.cols,
            nnz: this.nnz,
            colPointers,
            rowIndices,
            values
        };
    }
}
exports.SparseMatrix = SparseMatrix;
