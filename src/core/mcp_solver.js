/**
 * 混合互補問題 (MCP) 和線性互補問題 (LCP) 求解器
 * 
 * 實現 Lemke 演算法求解 LCP:
 * 給定矩陣 M 和向量 q，求解：
 * w = Mz + q
 * w ≥ 0, z ≥ 0, w'z = 0  (互補條件)
 * 
 * 這是電力電子開關模擬的核心數學工具
 */

import { Matrix, Vector } from './linalg.js';

/**
 * 線性互補問題 (LCP) 求解器
 * 使用 Lemke's Pivoting Algorithm
 */
export class LCPSolver {
    constructor(options = {}) {
        this.maxIterations = options.maxIterations || 1000;
        this.zeroTolerance = options.zeroTolerance || 1e-12;
        this.pivotTolerance = options.pivotTolerance || 1e-12;  // 放寬容差提高數值穩定性
        this.debug = options.debug || false;
    }

    /**
     * 求解 LCP: w = Mz + q, w ≥ 0, z ≥ 0, w'z = 0
     * @param {Matrix} M - n×n 矩陣
     * @param {Vector} q - n×1 向量  
     * @returns {Object} 包含 {z, w, converged, iterations, error} 的結果
     */
    solve(M, q) {
        const n = q.size;
        let iterations = 0;

        if (this.debug) {
            console.log(`🔢 開始 LCP 求解，問題規模: ${n}×${n}`);
        }

        // 檢查輸入有效性
        if (M.rows !== n || M.cols !== n) {
            return { 
                z: null, w: null, 
                converged: false, 
                error: `矩陣維度不匹配: M是${M.rows}×${M.cols}，q是${n}×1`,
                iterations: 0 
            };
        }

        // === 第1步：檢查平凡解 z=0 ===
        // 如果 q ≥ 0，則 z=0, w=q 是解
        const qNonNegative = this.checkVectorNonNegative(q);
        if (qNonNegative) {
            const z = Array(n).fill(0);
            const w = q.data.slice(); // 複製 q
            
            if (this.debug) {
                console.log('✅ 平凡解 z=0 滿足條件');
            }
            
            return { z, w, converged: true, iterations: 0 };
        }

        // === 第2步：初始化 Tableau ===
        // 建立增廣矩陣 [M  -I  -e | -q]
        // 其中 e 是人工變量向量 [1, 1, ..., 1]'
        const tableau = this.initializeTableau(M, q, n);
        
        // 初始基包含所有 w 變量 (索引 n 到 2n-1)
        const basis = Array(n).fill(0).map((_, i) => n + i);

        // === 第3步：尋找第一個離開變量 ===
        // 選擇 q 中最小（最負）的分量對應的變量離開
        let pivotRow = this.findInitialLeavingVariable(q);
        if (pivotRow === -1) {
            return { 
                z: null, w: null, 
                converged: false, 
                error: '無法找到初始離開變量',
                iterations: 0 
            };
        }

        // 人工變量 z_0 進入基 (列索引 2n)
        let pivotCol = 2 * n;

        if (this.debug) {
            console.log(`🎯 初始樞軸: 行 ${pivotRow}, 列 ${pivotCol}`);
        }

        // === 第4步：主樞軸循環 ===
        while (iterations < this.maxIterations) {
            iterations++;
            
            if (this.debug && iterations % 10 === 0) {
                console.log(`  迭代 ${iterations}...`);
            }

            // 記錄離開的變量
            const leavingVar = basis[pivotRow];
            basis[pivotRow] = pivotCol;
            
            // 執行樞軸操作
            const pivotResult = this.performPivotOperation(tableau, pivotRow, pivotCol, n);
            if (!pivotResult.success) {
                return { 
                    z: null, w: null, 
                    converged: false, 
                    error: `樞軸操作失敗: ${pivotResult.error}`,
                    iterations 
                };
            }

            // === 終止條件檢查 ===
            // 如果人工變量離開基，則找到解
            if (leavingVar === 2 * n) {
                const solution = this.extractSolution(tableau, basis, n);
                
                if (this.debug) {
                    console.log(`✅ LCP 收斂於第 ${iterations} 次迭代`);
                    console.log(`   解的範數: ||z|| = ${this.vectorNorm(solution.z)}`);
                }
                
                return {
                    z: solution.z,
                    w: solution.w,
                    converged: true,
                    iterations
                };
            }

            // === 尋找下一個進入變量 ===
            // 實施互補樞軸規則
            const enteringVar = this.getComplementaryVariable(leavingVar, n);
            
            // === 最小比值測試 ===
            const ratioTest = this.performMinimumRatioTest(tableau, enteringVar, n);
            
            if (!ratioTest.feasible) {
                return { 
                    z: null, w: null, 
                    converged: false, 
                    error: '無界射線：問題可能無解',
                    iterations 
                };
            }

            pivotRow = ratioTest.row;
            pivotCol = enteringVar;
        }

        return { 
            z: null, w: null, 
            converged: false, 
            error: `達到最大迭代次數 ${this.maxIterations}`,
            iterations 
        };
    }

    /**
     * 檢查向量是否非負
     */
    checkVectorNonNegative(v) {
        for (let i = 0; i < v.size; i++) {
            if (v.get(i) < -this.zeroTolerance) {
                return false;
            }
        }
        return true;
    }

    /**
     * 初始化 Lemke Tableau
     * 格式: [M  -I  -e | -q]
     */
    initializeTableau(M, q, n) {
        const tableau = Array(n).fill(0).map(() => Array(2 * n + 2).fill(0));
        
        for (let i = 0; i < n; i++) {
            // M 矩陣部分
            for (let j = 0; j < n; j++) {
                tableau[i][j] = M.get(i, j);
            }
            
            // -I 單位矩陣部分  
            tableau[i][n + i] = -1;
            
            // -e 人工變量列
            tableau[i][2 * n] = -1;
            
            // -q 右端項
            tableau[i][2 * n + 1] = -q.get(i);
        }
        
        return tableau;
    }

    /**
     * 尋找初始離開變量（q中最小分量）
     */
    findInitialLeavingVariable(q) {
        let minVal = Infinity;
        let minIndex = -1;
        
        for (let i = 0; i < q.size; i++) {
            if (q.get(i) < minVal) {
                minVal = q.get(i);
                minIndex = i;
            }
        }
        
        return minIndex;
    }

    /**
     * 執行樞軸操作
     */
    performPivotOperation(tableau, pivotRow, pivotCol, n) {
        const pivotElement = tableau[pivotRow][pivotCol];
        
        // 檢查樞軸元素是否過小
        if (Math.abs(pivotElement) < this.pivotTolerance) {
            return {
                success: false,
                error: `樞軸元素過小: ${pivotElement}`
            };
        }

        // 標準化樞軸行
        for (let j = 0; j < 2 * n + 2; j++) {
            tableau[pivotRow][j] /= pivotElement;
        }

        // 消除其他行的樞軸列元素
        for (let i = 0; i < n; i++) {
            if (i !== pivotRow) {
                const factor = tableau[i][pivotCol];
                for (let j = 0; j < 2 * n + 2; j++) {
                    tableau[i][j] -= factor * tableau[pivotRow][j];
                }
            }
        }

        return { success: true };
    }

    /**
     * 獲取互補變量
     * 對於 z_i (索引 i)，互補變量是 w_i (索引 n+i)
     * 對於 w_i (索引 n+i)，互補變量是 z_i (索引 i)
     */
    getComplementaryVariable(varIndex, n) {
        if (varIndex < n) {
            // z 變量的互補是對應的 w
            return n + varIndex;
        } else if (varIndex < 2 * n) {
            // w 變量的互補是對應的 z  
            return varIndex - n;
        } else {
            // 人工變量沒有互補
            throw new Error(`無效的變量索引: ${varIndex}`);
        }
    }

    /**
     * 最小比值測試，確定下一個離開變量
     */
    performMinimumRatioTest(tableau, enteringCol, n) {
        let minRatio = Infinity;
        let minRow = -1;
        
        for (let i = 0; i < n; i++) {
            const denominator = tableau[i][enteringCol];
            
            if (denominator > this.pivotTolerance) {
                const ratio = -tableau[i][2 * n + 1] / denominator; // -RHS / 係數
                
                if (ratio >= -this.zeroTolerance && ratio < minRatio) {
                    minRatio = ratio;
                    minRow = i;
                }
            }
        }

        if (minRow === -1) {
            return { feasible: false };
        }

        return { feasible: true, row: minRow, ratio: minRatio };
    }

    /**
     * 從最終 tableau 提取解
     */
    extractSolution(tableau, basis, n) {
        const z = Array(n).fill(0);
        const w = Array(n).fill(0);

        // 基變量的值從 RHS 列讀取
        for (let i = 0; i < n; i++) {
            const varInBasis = basis[i];
            const value = tableau[i][2 * n + 1];
            
            if (varInBasis < n) {
                // 這是一個 z 變量
                z[varInBasis] = Math.max(0, value); // 確保非負
            } else if (varInBasis < 2 * n) {
                // 這是一個 w 變量
                w[varInBasis - n] = Math.max(0, value); // 確保非負
            }
            // 人工變量忽略
        }

        // 非基變量保持為 0（已經初始化）
        
        return { z, w };
    }

    /**
     * 計算向量的範數
     */
    vectorNorm(vec) {
        return Math.sqrt(vec.reduce((sum, x) => sum + x * x, 0));
    }

    /**
     * 驗證解的正確性
     */
    verifySolution(M, q, z, w) {
        const n = z.length;
        
        // 檢查 w = Mz + q
        let maxResidual = 0;
        for (let i = 0; i < n; i++) {
            let computed_w = q.get(i);
            for (let j = 0; j < n; j++) {
                computed_w += M.get(i, j) * z[j];
            }
            
            const residual = Math.abs(computed_w - w[i]);
            maxResidual = Math.max(maxResidual, residual);
        }

        // 檢查非負性
        const zNonNeg = z.every(val => val >= -this.zeroTolerance);
        const wNonNeg = w.every(val => val >= -this.zeroTolerance);

        // 檢查互補性 w'z ≈ 0
        const complementarity = z.reduce((sum, zi, i) => sum + zi * w[i], 0);

        return {
            residualNorm: maxResidual,
            nonNegativityZ: zNonNeg,
            nonNegativityW: wNonNeg,
            complementarity: Math.abs(complementarity),
            valid: maxResidual < 1e-8 && zNonNeg && wNonNeg && Math.abs(complementarity) < 1e-8
        };
    }
}

/**
 * 混合互補問題 (MCP) 求解器
 * MCP 是 LCP 的推廣，允許變量有界限
 */
export class MCPSolver {
    constructor(options = {}) {
        this.lcpSolver = new LCPSolver(options);
        this.debug = options.debug || false;
    }

    /**
     * 求解 MCP: F(x) = 0, l ≤ x ≤ u
     * 其中一些分量可能是自由的 (l_i = -∞, u_i = +∞)
     * 
     * @param {Function} F - 殘差函數 F(x)
     * @param {Function} J - 雅可比函數 J(x) = ∂F/∂x  
     * @param {Array} lowerBounds - 下界向量 (可包含 -Infinity)
     * @param {Array} upperBounds - 上界向量 (可包含 +Infinity)
     * @param {Array} x0 - 初始猜測
     * @returns {Object} 求解結果
     */
    solve(F, J, lowerBounds, upperBounds, x0) {
        // 這是一個高級功能的框架
        // 完整的 MCP 求解器需要更復雜的算法，如 PATH 或 smooth methods
        // 這裡提供一個簡化版本，主要用於演示 MCP 的概念
        
        if (this.debug) {
            console.log('🔄 MCP 求解器：將問題轉換為 LCP...');
        }

        // 對於簡單的情況，可以嘗試將 MCP 轉換為 LCP
        // 這需要引入額外的變量和約束
        // 完整實現會非常復雜，這裡僅提供接口

        throw new Error('完整的 MCP 求解器尚未實現。請使用 LCPSolver 處理線性互補問題。');
    }
}

/**
 * 創建預配置的 LCP 求解器
 */
export function createLCPSolver(options = {}) {
    const defaultOptions = {
        maxIterations: 1000,
        zeroTolerance: 1e-12,
        pivotTolerance: 1e-15,
        debug: false
    };

    return new LCPSolver({ ...defaultOptions, ...options });
}

/**
 * 創建預配置的 MCP 求解器  
 */
export function createMCPSolver(options = {}) {
    return new MCPSolver(options);
}

export default { LCPSolver, MCPSolver, createLCPSolver, createMCPSolver };