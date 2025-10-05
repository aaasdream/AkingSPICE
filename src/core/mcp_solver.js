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
     * @param {Matrix|Array} M - n×n 矩陣
     * @param {Vector|Array} q - n×1 向量  
     * @returns {Object} 包含 {z, w, converged, iterations, error} 的結果
     */
    solve(M, q) {
        // 🔥 修正：支持陣列輸入
        if (Array.isArray(M)) {
            M = new Matrix(M);
        }
        if (Array.isArray(q)) {
            q = new Vector(q);
        }
        
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
        // 🔥 修正：不要立即返回平凡解，而是先尋找非平凡解
        // 如果 q ≥ 0，則 z=0, w=q 是一個可行解，但可能不是唯一解
        const qNonNegative = this.checkVectorNonNegative(q);
        let trivialSolution = null;
        
        if (qNonNegative) {
            trivialSolution = {
                z: Array(n).fill(0),
                w: q.data ? q.data.slice() : [...q],
                converged: true,
                iterations: 0
            };
            
            if (this.debug) {
                console.log('✅ 平凡解 z=0 是可行解，但繼續尋找非平凡解...');
            }
        }

        // === 第2步：特殊處理簡單情況 ===
        // 🔥 新增：對於 1×1 情況，嘗試直接求解 M*z + q = 0
        if (n === 1 && qNonNegative) {
            const M_val = M.get(0, 0);
            const q_val = q.get(0);
            
            if (this.debug) {
                console.log(`🧮 1×1 LCP: M=${M_val.toFixed(6)}, q=${q_val.toFixed(6)}`);
            }
            
            // 嘗試求解 M*z + q = 0 (對應 w = 0)
            if (Math.abs(M_val) > this.pivotTolerance) {
                const z_val = -q_val / M_val;
                if (z_val >= -this.zeroTolerance) {
                    // 找到非平凡解！
                    const w_val = 0; // 因為我們設置 w = M*z + q = 0
                    
                    if (this.debug) {
                        console.log(`✅ 找到非平凡解: z=${z_val.toFixed(6)}, w=${w_val}`);
                    }
                    
                    return {
                        z: [z_val],
                        w: [w_val],
                        converged: true,
                        iterations: 0
                    };
                }
            }
        }

        // === 第3步：初始化 Tableau ===
        // 建立增廣矩陣 [M  -I  -e | -q]
        // 其中 e 是人工變量向量 [1, 1, ..., 1]'
        const tableau = this.initializeTableau(M, q, n);
        
        // 初始基包含所有 w 變量 (索引 n 到 2n-1)
        const basis = Array(n).fill(0).map((_, i) => n + i);

        // === 第3步：尋找第一個離開變量 ===
        // 🔥 修正：當 q ≥ 0 時，使用人工變量方法尋找非平凡解
        let pivotRow;
        if (qNonNegative) {
            // 當 q ≥ 0 時，我們有平凡解，但為了尋找非平凡解
            // 選擇第一個變量強制離開基（標準 Lemke 算法做法）
            pivotRow = 0;
            if (this.debug) {
                console.log('🔄 q ≥ 0，使用人工變量方法尋找非平凡解，選擇變量 0 離開');
            }
        } else {
            // 選擇 q 中最小（最負）的分量對應的變量離開
            pivotRow = this.findInitialLeavingVariable(q);
            if (pivotRow === -1) {
                return { 
                    z: null, w: null, 
                    converged: false, 
                    error: '無法找到初始離開變量',
                    iterations: 0 
                };
            }
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
                
                // 🔥 修正：優先返回非平凡解
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

        // 🔥 修正：如果找不到非平凡解但有平凡解可用，返回平凡解
        if (trivialSolution) {
            if (this.debug) {
                console.log('⚠️  無法找到非平凡解，返回平凡解 z=0');
            }
            return trivialSolution;
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
 * 🚀 Quadratic Programming (QP) 求解器
 * 作為 Lemke 失敗時的現代備用方案
 * 
 * 將 LCP 轉換為 QP：
 * min 0.5 * z'Mz + q'z
 * s.t. Mz + q >= 0, z >= 0
 */
export class QPSolver {
    constructor(options = {}) {
        this.maxIterations = options.maxIterations || 5000;
        this.tolerance = options.tolerance || 1e-10;
        this.debug = options.debug || false;
    }
    
    /**
     * 使用內點法求解 QP
     */
    solve(M, q) {
        if (this.debug) {
            console.log('🎯 使用 QP 內點法求解 LCP...');
        }
        
        const n = q.size;
        
        // 內點法參數
        let mu = 1.0;           // 障礙參數
        const muReduction = 0.1; // μ 收縮因子
        const minMu = 1e-10;    // 最小 μ 值
        
        // 初始點 (可行內點)
        let z = new Array(n).fill(0.1);
        let s = new Array(n).fill(0.1); // 鬆弛變量
        
        for (let iter = 0; iter < this.maxIterations; iter++) {
            // 計算 KKT 條件的殘差
            const gradLag = this.computeGradientLagrangian(M, q, z, s);
            const residualNorm = Math.sqrt(gradLag.reduce((sum, r) => sum + r*r, 0));
            
            if (this.debug && iter % 100 === 0) {
                console.log(`  QP iter ${iter}: μ=${mu.toExponential(2)}, residual=${residualNorm.toExponential(2)}`);
            }
            
            // 收斂檢查
            if (residualNorm < this.tolerance && mu < minMu) {
                if (this.debug) {
                    console.log(`✅ QP 收斂於 ${iter} 步`);
                }
                
                // 驗證解
                const w = new Array(n);
                for (let i = 0; i < n; i++) {
                    w[i] = 0;
                    for (let j = 0; j < n; j++) {
                        w[i] += M.get(i, j) * z[j];
                    }
                    w[i] += q.get(i);
                }
                
                return {
                    z: z,
                    w: w,
                    converged: true,
                    iterations: iter,
                    method: 'QP-Interior-Point'
                };
            }
            
            // 牛頓步長計算 (簡化版)
            const deltaZ = this.computeNewtonStep(M, q, z, s, mu);
            
            // 線搜索和更新
            const alpha = this.lineSearch(M, q, z, s, deltaZ);
            for (let i = 0; i < n; i++) {
                z[i] += alpha * deltaZ[i];
                z[i] = Math.max(z[i], 1e-12); // 保持正性
                
                // 更新鬆弛變量
                s[i] = 0;
                for (let j = 0; j < n; j++) {
                    s[i] += M.get(i, j) * z[j];
                }
                s[i] += q.get(i);
                s[i] = Math.max(s[i], 1e-12); // 保持正性
            }
            
            // 減少障礙參數
            if (iter % 10 === 0) {
                mu = Math.max(mu * muReduction, minMu);
            }
        }
        
        console.log('⚠️ QP 未收斂到指定精度');
        return {
            z: z,
            w: null,
            converged: false,
            iterations: this.maxIterations,
            error: 'QP 最大迭代數達到',
            method: 'QP-Interior-Point'
        };
    }
    
    /**
     * 計算拉格朗日梯度
     */
    computeGradientLagrangian(M, q, z, s) {
        const n = z.length;
        const grad = new Array(n);
        
        for (let i = 0; i < n; i++) {
            grad[i] = q.get(i);
            for (let j = 0; j < n; j++) {
                grad[i] += M.get(i, j) * z[j];
            }
        }
        
        return grad;
    }
    
    /**
     * 計算牛頓步長 (簡化版)
     */
    computeNewtonStep(M, q, z, s, mu) {
        const n = z.length;
        const deltaZ = new Array(n);
        
        // 簡化的牛頓步長計算
        for (let i = 0; i < n; i++) {
            let Mii = M.get(i, i);
            if (Math.abs(Mii) < 1e-12) Mii = 1e-6; // 正則化
            
            deltaZ[i] = -mu / (z[i] * s[i]) / Mii;
        }
        
        return deltaZ;
    }
    
    /**
     * 線搜索
     */
    lineSearch(M, q, z, s, deltaZ) {
        let alpha = 1.0;
        const reduction = 0.5;
        const minAlpha = 1e-8;
        
        while (alpha > minAlpha) {
            let valid = true;
            
            // 檢查新點的可行性
            for (let i = 0; i < z.length; i++) {
                if (z[i] + alpha * deltaZ[i] <= 0) {
                    valid = false;
                    break;
                }
            }
            
            if (valid) return alpha;
            alpha *= reduction;
        }
        
        return minAlpha;
    }
}

/**
 * 🔧 增強的 LCP 求解器 - 自動回退到 QP
 */
export class RobustLCPSolver {
    constructor(options = {}) {
        this.lemkeSolver = new LCPSolver(options);
        this.qpSolver = new QPSolver(options);
        this.debug = options.debug || false;
    }
    
    /**
     * 求解 LCP - 自動選擇最佳方法
     */
    solve(M, q) {
        if (this.debug) {
            console.log('🛡️ 使用強健 LCP 求解器...');
        }
        
        // 首先嘗試 Lemke 算法 (快速)
        try {
            const lemkeResult = this.lemkeSolver.solve(M, q);
            
            if (lemkeResult.converged) {
                if (this.debug) {
                    console.log('✅ Lemke 算法成功');
                }
                return lemkeResult;
            } else {
                if (this.debug) {
                    console.log('⚠️ Lemke 失敗，切換到 QP 方法');
                    console.log(`   失敗原因: ${lemkeResult.error}`);
                }
            }
        } catch (error) {
            if (this.debug) {
                console.log('❌ Lemke 異常，切換到 QP 方法');
                console.log(`   異常: ${error.message}`);
            }
        }
        
        // 回退到 QP 求解器
        try {
            const qpResult = this.qpSolver.solve(M, q);
            if (this.debug) {
                if (qpResult.converged) {
                    console.log('✅ QP 方法成功救援');
                } else {
                    console.log('❌ QP 方法也失敗');
                }
            }
            return qpResult;
        } catch (error) {
            return {
                z: null,
                w: null,
                converged: false,
                iterations: 0,
                error: `所有方法失敗: ${error.message}`,
                method: 'All-Failed'
            };
        }
    }
}

/**
 * 創建預配置的 LCP 求解器
 */
export function createLCPSolver(options = {}) {
    const defaultOptions = {
        maxIterations: 5000,      // 增加到 5000
        zeroTolerance: 1e-12,
        pivotTolerance: 1e-10,    // 放寬到 1e-10
        debug: false
    };

    // 🚀 使用強健求解器作為默認選擇
    const useRobustSolver = options.useRobustSolver !== false; // 默認啟用
    
    if (useRobustSolver) {
        return new RobustLCPSolver({ ...defaultOptions, ...options });
    } else {
        return new LCPSolver({ ...defaultOptions, ...options });
    }
}

/**
 * 創建預配置的 MCP 求解器  
 */
export function createMCPSolver(options = {}) {
    return new MCPSolver(options);
}

export default { LCPSolver, MCPSolver, createLCPSolver, createMCPSolver };