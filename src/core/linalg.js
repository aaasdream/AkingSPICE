/**
 * 線性代數核心 - LU分解求解器
 * 
 * 這是AkingSPICE的數值計算核心，負責求解 Ax = z 形式的線性方程組。
 * 使用LU分解方法，這是求解中等規模稠密或稀疏矩陣的標準高效方法。
 */

/**
 * 矩陣類 - 提供基本的矩陣操作
 */
export class Matrix {
    /**
     * @param {number} rows 矩陣行數
     * @param {number} cols 矩陣列數
     * @param {number[][]} data 可選的初始數據
     */
    constructor(rows, cols, data = null) {
        this.rows = rows;
        this.cols = cols;
        
        if (data) {
            this.data = data;
        } else {
            this.data = Array(rows).fill().map(() => Array(cols).fill(0));
        }
    }

    /**
     * 獲取元素值
     * @param {number} i 行索引 (0-based)
     * @param {number} j 列索引 (0-based)
     * @returns {number}
     */
    get(i, j) {
        if (i < 0 || i >= this.rows || j < 0 || j >= this.cols) {
            throw new Error(`Matrix index out of bounds: (${i}, ${j})`);
        }
        return this.data[i][j];
    }

    /**
     * 設置元素值
     * @param {number} i 行索引
     * @param {number} j 列索引
     * @param {number} value 要設置的值
     */
    set(i, j, value) {
        if (i < 0 || i >= this.rows || j < 0 || j >= this.cols) {
            throw new Error(`Matrix index out of bounds: (${i}, ${j})`);
        }
        this.data[i][j] = value;
    }

    /**
     * 累加元素值 (常用於組裝MNA矩陣)
     * @param {number} i 行索引
     * @param {number} j 列索引
     * @param {number} value 要累加的值
     */
    addAt(i, j, value) {
        this.data[i][j] += value;
    }

    /**
     * 創建單位矩陣
     * @param {number} size 矩陣大小
     * @returns {Matrix}
     */
    static identity(size) {
        const matrix = new Matrix(size, size);
        for (let i = 0; i < size; i++) {
            matrix.set(i, i, 1);
        }
        return matrix;
    }

    /**
     * 創建零矩陣
     * @param {number} rows 行數
     * @param {number} cols 列數
     * @returns {Matrix}
     */
    static zeros(rows, cols = rows) {
        return new Matrix(rows, cols);
    }

    /**
     * 矩陣複製
     * @returns {Matrix}
     */
    clone() {
        const newData = this.data.map(row => [...row]);
        return new Matrix(this.rows, this.cols, newData);
    }

    /**
     * 檢查矩陣是否為方陣
     * @returns {boolean}
     */
    isSquare() {
        return this.rows === this.cols;
    }

    /**
     * 打印矩陣 (調試用)
     * @param {number} precision 小數點後位數
     */
    print(precision = 6) {
        console.log('Matrix:');
        for (let i = 0; i < this.rows; i++) {
            const row = this.data[i].map(val => val.toFixed(precision)).join('  ');
            console.log(`[${row}]`);
        }
    }

    /**
     * 矩陣乘法 - A * B
     * @param {Matrix} other 右側矩陣
     * @returns {Matrix} 乘積矩陣
     */
    multiply(other) {
        if (this.cols !== other.rows) {
            throw new Error(`Matrix dimensions incompatible for multiplication: ${this.rows}x${this.cols} * ${other.rows}x${other.cols}`);
        }
        
        const result = new Matrix(this.rows, other.cols);
        
        for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < other.cols; j++) {
                let sum = 0;
                for (let k = 0; k < this.cols; k++) {
                    sum += this.get(i, k) * other.get(k, j);
                }
                result.set(i, j, sum);
            }
        }
        
        return result;
    }
    
    /**
     * 矩陣減法 - A - B
     * @param {Matrix} other 右側矩陣
     * @returns {Matrix} 差矩陣
     */
    subtract(other) {
        if (this.rows !== other.rows || this.cols !== other.cols) {
            throw new Error(`Matrix dimensions incompatible for subtraction: ${this.rows}x${this.cols} - ${other.rows}x${other.cols}`);
        }
        
        const result = new Matrix(this.rows, this.cols);
        
        for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.cols; j++) {
                result.set(i, j, this.get(i, j) - other.get(i, j));
            }
        }
        
        return result;
    }
    
    /**
     * 矩陣加法 - A + B
     * @param {Matrix} other 右側矩陣
     * @returns {Matrix} 和矩陣
     */
    add(other) {
        if (this.rows !== other.rows || this.cols !== other.cols) {
            throw new Error(`Matrix dimensions incompatible for addition: ${this.rows}x${this.cols} + ${other.rows}x${other.cols}`);
        }
        
        const result = new Matrix(this.rows, this.cols);
        
        for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.cols; j++) {
                result.set(i, j, this.get(i, j) + other.get(i, j));
            }
        }
        
        return result;
    }
    
    /**
     * 矩陣轉置
     * @returns {Matrix} 轉置矩陣
     */
    transpose() {
        const result = new Matrix(this.cols, this.rows);
        
        for (let i = 0; i < this.rows; i++) {
            for (let j = 0; j < this.cols; j++) {
                result.set(j, i, this.get(i, j));
            }
        }
        
        return result;
    }
    
    /**
     * 矩陣求逆 - 使用 LU 分解方法
     * @returns {Matrix} 逆矩陣
     */
    inverse() {
        if (!this.isSquare()) {
            throw new Error('Matrix must be square to compute inverse');
        }
        
        const n = this.rows;
        const A = this.clone();
        const I = Matrix.identity(n);
        
        // 對每一列求解 Ax = e_i，其中 e_i 是第 i 個單位向量
        const result = new Matrix(n, n);
        
        for (let i = 0; i < n; i++) {
            // 創建第 i 個單位向量
            const unitVector = Vector.zeros(n);
            unitVector.set(i, 1.0);
            
            try {
                // 求解 Ax = e_i
                const ACopy = this.clone();
                const solution = LUSolver.solve(ACopy, unitVector);
                
                // 將解放入結果矩陣的第 i 列
                for (let j = 0; j < n; j++) {
                    result.set(j, i, solution.get(j));
                }
            } catch (error) {
                throw new Error(`Matrix is singular and cannot be inverted: ${error.message}`);
            }
        }
        
        return result;
    }
    
    /**
     * 提取子矩陣
     * @param {number[]} rowIndices 行索引數組
     * @param {number[]} colIndices 列索引數組
     * @returns {Matrix} 子矩陣
     */
    subMatrix(rowIndices, colIndices) {
        const result = new Matrix(rowIndices.length, colIndices.length);
        
        for (let i = 0; i < rowIndices.length; i++) {
            for (let j = 0; j < colIndices.length; j++) {
                result.set(i, j, this.get(rowIndices[i], colIndices[j]));
            }
        }
        
        return result;
    }
    
    /**
     * 設置子矩陣
     * @param {number} startRow 起始行
     * @param {number} startCol 起始列
     * @param {Matrix} subMatrix 要設置的子矩陣
     */
    setSubMatrix(startRow, startCol, subMatrix) {
        for (let i = 0; i < subMatrix.rows; i++) {
            for (let j = 0; j < subMatrix.cols; j++) {
                this.set(startRow + i, startCol + j, subMatrix.get(i, j));
            }
        }
    }

    /**
     * 轉換為字符串表示
     * @param {number} precision 小數點後位數
     * @returns {string}
     */
    toString(precision = 6) {
        let result = `Matrix ${this.rows}x${this.cols}:\n`;
        for (let i = 0; i < this.rows; i++) {
            const row = this.data[i].map(val => val.toExponential(precision)).join('  ');
            result += `[${row}]\n`;
        }
        return result;
    }
}

/**
 * 向量類 - 本質上是單列矩陣的特殊形式
 */
export class Vector {
    /**
     * @param {number} size 向量大小
     * @param {number[]} data 可選的初始數據
     */
    constructor(size, data = null) {
        this.size = size;
        this.data = data ? [...data] : Array(size).fill(0);
    }

    /**
     * 獲取元素值
     * @param {number} i 索引
     * @returns {number}
     */
    get(i) {
        if (i < 0 || i >= this.size) {
            throw new Error(`Vector index out of bounds: ${i}`);
        }
        return this.data[i];
    }

    /**
     * 設置元素值
     * @param {number} i 索引
     * @param {number} value 值
     */
    set(i, value) {
        if (i < 0 || i >= this.size) {
            throw new Error(`Vector index out of bounds: ${i}`);
        }
        this.data[i] = value;
    }

    /**
     * 累加元素值
     * @param {number} i 索引
     * @param {number} value 要累加的值
     */
    addAt(i, value) {
        this.data[i] += value;
    }

    /**
     * 創建零向量
     * @param {number} size 大小
     * @returns {Vector}
     */
    static zeros(size) {
        return new Vector(size);
    }

    /**
     * 向量複製
     * @returns {Vector}
     */
    clone() {
        return new Vector(this.size, this.data);
    }

    /**
     * 向量加法
     * @param {Vector} other 另一個向量
     * @returns {Vector} 和向量
     */
    add(other) {
        if (this.size !== other.size) {
            throw new Error(`Vector dimensions incompatible for addition: ${this.size} + ${other.size}`);
        }
        
        const result = new Vector(this.size);
        for (let i = 0; i < this.size; i++) {
            result.set(i, this.get(i) + other.get(i));
        }
        return result;
    }
    
    /**
     * 向量減法
     * @param {Vector} other 另一個向量
     * @returns {Vector} 差向量
     */
    subtract(other) {
        if (this.size !== other.size) {
            throw new Error(`Vector dimensions incompatible for subtraction: ${this.size} - ${other.size}`);
        }
        
        const result = new Vector(this.size);
        for (let i = 0; i < this.size; i++) {
            result.set(i, this.get(i) - other.get(i));
        }
        return result;
    }
    
    /**
     * 標量乘法
     * @param {number} scalar 標量
     * @returns {Vector} 結果向量
     */
    scale(scalar) {
        const result = new Vector(this.size);
        for (let i = 0; i < this.size; i++) {
            result.set(i, this.get(i) * scalar);
        }
        return result;
    }
    
    /**
     * 點積
     * @param {Vector} other 另一個向量
     * @returns {number} 點積結果
     */
    dot(other) {
        if (this.size !== other.size) {
            throw new Error(`Vector dimensions incompatible for dot product: ${this.size} · ${other.size}`);
        }
        
        let sum = 0;
        for (let i = 0; i < this.size; i++) {
            sum += this.get(i) * other.get(i);
        }
        return sum;
    }
    
    /**
     * 向量的歐幾里得範數
     * @returns {number} 範數
     */
    norm() {
        let sum = 0;
        for (let i = 0; i < this.size; i++) {
            const val = this.get(i);
            sum += val * val;
        }
        return Math.sqrt(sum);
    }

    /**
     * 打印向量 (調試用)
     * @param {number} precision 小數點後位數
     */
    print(precision = 6) {
        const values = this.data.map(val => val.toFixed(precision)).join(', ');
        console.log(`Vector: [${values}]`);
    }
}

/**
 * LU分解求解器
 * 
 * 實現帶部分主元選擇的LU分解算法，用於求解線性方程組 Ax = b
 * 這是電路模擬器的數值核心，所有MNA矩陣最終都通過這裡求解。
 */
export class LUSolver {
    /**
     * 求解線性方程組 Ax = b
     * @param {Matrix} A 係數矩陣 (將被修改)
     * @param {Vector} b 右手邊向量 (將被修改)
     * @returns {Vector} 解向量 x
     */
    static solve(A, b) {
        if (!A.isSquare()) {
            throw new Error('Matrix A must be square');
        }
        
        if (A.rows !== b.size) {
            throw new Error('Matrix A and vector b dimensions do not match');
        }

        const n = A.rows;
        const x = b.clone();
        
        // Step 1: LU分解 (帶部分主元選擇)
        const permutation = this.luDecomposition(A);
        
        // Step 2: 應用置換到右手邊向量
        this.applyPermutation(x, permutation);
        
        // Step 3: 前向替代 (Forward Substitution) - 求解 Ly = b
        this.forwardSubstitution(A, x);
        
        // Step 4: 後向替代 (Backward Substitution) - 求解 Ux = y
        this.backwardSubstitution(A, x);
        
        return x;
    }

    /**
     * LU分解 (帶部分主元選擇)
     * 在原矩陣上進行分解，L存儲在下三角部分，U存儲在上三角部分
     * @param {Matrix} A 要分解的矩陣 (會被修改)
     * @returns {number[]} 置換向量
     */
    static luDecomposition(A) {
        const n = A.rows;
        const permutation = Array.from({length: n}, (_, i) => i);

        for (let k = 0; k < n - 1; k++) {
            // 部分主元選擇 - 找到第k列中絕對值最大的元素
            let maxRow = k;
            let maxVal = Math.abs(A.get(k, k));
            
            for (let i = k + 1; i < n; i++) {
                const val = Math.abs(A.get(i, k));
                if (val > maxVal) {
                    maxVal = val;
                    maxRow = i;
                }
            }

            // 檢查奇異性
            if (maxVal < 1e-14) {
                throw new Error(`Matrix is singular or nearly singular at column ${k}`);
            }

            // 交換行
            if (maxRow !== k) {
                this.swapRows(A, k, maxRow);
                [permutation[k], permutation[maxRow]] = [permutation[maxRow], permutation[k]];
            }

            // 高斯消元
            const pivot = A.get(k, k);
            for (let i = k + 1; i < n; i++) {
                const factor = A.get(i, k) / pivot;
                A.set(i, k, factor); // 存儲L矩陣的元素
                
                for (let j = k + 1; j < n; j++) {
                    const newVal = A.get(i, j) - factor * A.get(k, j);
                    A.set(i, j, newVal);
                }
            }
        }

        // 檢查最後一個對角元素
        if (Math.abs(A.get(n-1, n-1)) < 1e-14) {
            throw new Error('Matrix is singular or nearly singular');
        }

        return permutation;
    }

    /**
     * 交換矩陣的兩行
     * @param {Matrix} A 矩陣
     * @param {number} row1 行1
     * @param {number} row2 行2
     */
    static swapRows(A, row1, row2) {
        if (row1 === row2) return;
        
        for (let j = 0; j < A.cols; j++) {
            const temp = A.get(row1, j);
            A.set(row1, j, A.get(row2, j));
            A.set(row2, j, temp);
        }
    }

    /**
     * 應用置換到向量
     * @param {Vector} x 向量 (會被修改)
     * @param {number[]} permutation 置換向量
     */
    static applyPermutation(x, permutation) {
        const temp = Array(x.size);
        for (let i = 0; i < x.size; i++) {
            temp[i] = x.get(permutation[i]);
        }
        for (let i = 0; i < x.size; i++) {
            x.set(i, temp[i]);
        }
    }

    /**
     * 前向替代 - 求解 Ly = b (其中L的對角元素為1)
     * @param {Matrix} LU LU分解後的矩陣
     * @param {Vector} x 向量 (會被修改)
     */
    static forwardSubstitution(LU, x) {
        const n = x.size;
        
        for (let i = 0; i < n; i++) {
            let sum = 0;
            for (let j = 0; j < i; j++) {
                sum += LU.get(i, j) * x.get(j);
            }
            x.set(i, x.get(i) - sum);
        }
    }

    /**
     * 後向替代 - 求解 Ux = y
     * @param {Matrix} LU LU分解後的矩陣
     * @param {Vector} x 向量 (會被修改)
     */
    static backwardSubstitution(LU, x) {
        const n = x.size;
        
        for (let i = n - 1; i >= 0; i--) {
            let sum = 0;
            for (let j = i + 1; j < n; j++) {
                sum += LU.get(i, j) * x.get(j);
            }
            x.set(i, (x.get(i) - sum) / LU.get(i, i));
        }
    }

    /**
     * 矩陣條件數估算 (用於數值穩定性檢查)
     * @param {Matrix} A 原矩陣
     * @returns {number} 估算的條件數
     */
    static estimateConditionNumber(A) {
        // 簡單的條件數估算：最大對角元素 / 最小對角元素
        let maxDiag = 0;
        let minDiag = Infinity;
        
        for (let i = 0; i < A.rows; i++) {
            const val = Math.abs(A.get(i, i));
            maxDiag = Math.max(maxDiag, val);
            minDiag = Math.min(minDiag, val);
        }
        
        return minDiag > 1e-14 ? maxDiag / minDiag : Infinity;
    }
}

/**
 * 數值工具函數
 */
export class NumericalUtils {
    /**
     * 檢查兩個數值是否在容差範圍內相等
     * @param {number} a 數值a
     * @param {number} b 數值b
     * @param {number} tolerance 容差
     * @returns {boolean}
     */
    static isClose(a, b, tolerance = 1e-12) {
        return Math.abs(a - b) <= tolerance;
    }

    /**
     * 檢查向量的收斂性 (用於Newton-Raphson迭代)
     * @param {Vector} x1 舊解
     * @param {Vector} x2 新解
     * @param {number} tolerance 收斂容差
     * @returns {boolean}
     */
    static hasConverged(x1, x2, tolerance = 1e-9) {
        for (let i = 0; i < x1.size; i++) {
            const relError = Math.abs(x2.get(i) - x1.get(i)) / (Math.abs(x2.get(i)) + 1e-12);
            if (relError > tolerance) {
                return false;
            }
        }
        return true;
    }

    /**
     * 計算向量的無窮範數 (最大絕對值)
     * @param {Vector} x 向量
     * @returns {number}
     */
    static infinityNorm(x) {
        let maxVal = 0;
        for (let i = 0; i < x.size; i++) {
            maxVal = Math.max(maxVal, Math.abs(x.get(i)));
        }
        return maxVal;
    }
}