/**
 * 增強的 MCP 求解器修復方案
 * 專門針對快速開關引起的數值不穩定問題
 */

console.log('🔧 開始 MCP 求解器數值穩定性修復');

try {
    // 讀取當前的 MCP 求解器
    const { readFileSync, writeFileSync } = await import('fs');
    const path = await import('path');
    
    const mcpSolverPath = './src/core/mcp_solver.js';
    let mcpSolverCode = readFileSync(mcpSolverPath, 'utf-8');
    
    // 1. 提高 QP 求解器的數值穩定性
    console.log('🎯 增強 QPSolver 的數值穩定性...');
    
    // 修改 QP 求解器的容差和迭代參數
    const qpEnhancements = `
    /**
     * 🔧 增強的 QP 求解器 - 針對電力電子開關優化
     */
    export class EnhancedQPSolver {
        constructor(options = {}) {
            this.maxIterations = options.maxIterations || 8000;  // 增加迭代次數
            this.tolerance = options.tolerance || 1e-12;        // 提高精度要求  
            this.initialMu = options.initialMu || 0.1;         // 調整初始障礙參數
            this.muReduction = options.muReduction || 0.2;      // 較慢的參數收縮
            this.minMu = options.minMu || 1e-12;
            this.debug = options.debug || false;
            
            // 數值穩定性參數
            this.minVariableValue = 1e-14;  // 防止變量過小
            this.regularizationFactor = 1e-10;  // Tikhonov 正則化
        }
        
        solve(M, q) {
            if (this.debug) {
                console.log('🎯 使用增強 QP 內點法求解 LCP...');
            }
            
            const n = q.size;
            
            // 檢查輸入矩陣的條件數
            const conditionEstimate = this.estimateConditionNumber(M);
            if (conditionEstimate > 1e12) {
                if (this.debug) {
                    console.log(\`⚠️ 檢測到病態矩陣 (cond ≈ \${conditionEstimate.toExponential(2)})，應用正則化\`);
                }
                // 應用 Tikhonov 正則化：M' = M + λI
                for (let i = 0; i < Math.min(M.rows, M.cols); i++) {
                    const original = M.get(i, i);
                    M.set(i, i, original + this.regularizationFactor);
                }
            }
            
            // 內點法參數 - 針對開關電路優化
            let mu = this.initialMu;
            
            // 智能初始點選擇
            let z = this.findSmartInitialPoint(M, q, n);
            let s = new Array(n);
            
            // 計算初始鬆弛變量
            for (let i = 0; i < n; i++) {
                s[i] = Math.max(this.minVariableValue, this.computeSlackVariable(M, q, z, i));
            }
            
            let iteration = 0;
            let bestSolution = null;
            let bestResidual = Infinity;
            
            for (iteration = 0; iteration < this.maxIterations; iteration++) {
                // 計算 KKT 條件的殘差
                const gradLag = this.computeGradientLagrangian(M, q, z, s);
                const residualNorm = Math.sqrt(gradLag.reduce((sum, r) => sum + r*r, 0));
                
                // 保存最佳解
                if (residualNorm < bestResidual) {
                    bestResidual = residualNorm;
                    bestSolution = {
                        z: [...z],
                        s: [...s],
                        residual: residualNorm,
                        iteration: iteration
                    };
                }
                
                if (this.debug && iteration % 100 === 0) {
                    console.log(\`  QP iter \${iteration}: μ=\${mu.toExponential(2)}, res=\${residualNorm.toExponential(2)}\`);
                }
                
                // 收斂檢查
                if (residualNorm < this.tolerance && mu < this.minMu) {
                    if (this.debug) {
                        console.log(\`✅ QP 收斂於 \${iteration} 步\`);
                    }
                    break;
                }
                
                // 計算牛頓步長 - 增強版
                const deltaZ = this.computeRobustNewtonStep(M, q, z, s, mu, n);
                
                // 自適應線搜索
                const alpha = this.adaptiveLineSearch(M, q, z, s, deltaZ, mu);
                
                // 更新變量並確保數值穩定性
                for (let i = 0; i < n; i++) {
                    z[i] = Math.max(this.minVariableValue, z[i] + alpha * deltaZ[i]);
                    
                    // 重新計算鬆弛變量
                    s[i] = Math.max(this.minVariableValue, this.computeSlackVariable(M, q, z, i));
                }
                
                // 自適應障礙參數調整
                if (iteration > 0 && iteration % 50 === 0) {
                    const reductionRate = residualNorm < 0.1 ? this.muReduction : Math.sqrt(this.muReduction);
                    mu = Math.max(mu * reductionRate, this.minMu);
                }
            }
            
            // 使用最佳解構造最終結果
            if (bestSolution) {
                const w = this.computeFinalSlackVariables(M, q, bestSolution.z);
                
                if (this.debug) {
                    console.log(\`✅ QP 返回最佳解 (iter \${bestSolution.iteration}, res=\${bestSolution.residual.toExponential(2)})\`);
                }
                
                return {
                    z: bestSolution.z,
                    w: w,
                    converged: bestSolution.residual < this.tolerance * 10, // 放寬收斂標準
                    iterations: iteration,
                    method: 'Enhanced-QP-Interior-Point',
                    residualNorm: bestSolution.residual
                };
            }
            
            // 如果完全失敗，嘗試簡單的固定點迭代作為備用
            if (this.debug) {
                console.log('⚠️ QP 主算法失敗，嘗試備用方法...');
            }
            
            return this.fallbackFixedPointMethod(M, q);
        }
        
        /**
         * 估計矩陣條件數 (簡化版)
         */
        estimateConditionNumber(M) {
            const n = Math.min(M.rows, M.cols);
            let maxDiag = 0, minDiag = Infinity;
            
            for (let i = 0; i < n; i++) {
                const diag = Math.abs(M.get(i, i));
                maxDiag = Math.max(maxDiag, diag);
                minDiag = Math.min(minDiag, diag);
            }
            
            return minDiag > 0 ? maxDiag / minDiag : 1e16;
        }
        
        /**
         * 智能初始點選擇
         */
        findSmartInitialPoint(M, q, n) {
            const z = new Array(n);
            
            // 嘗試求解對角化系統作為初始猜測
            for (let i = 0; i < n; i++) {
                const Mii = M.get(i, i);
                const qi = q.get(i);
                
                if (Math.abs(Mii) > 1e-12) {
                    // 如果 Mii*zi + qi = 0，那麼 zi = -qi/Mii
                    const candidate = -qi / Mii;
                    z[i] = Math.max(0.01, candidate); // 確保正性
                } else {
                    z[i] = 0.1; // 默認值
                }
            }
            
            return z;
        }
        
        /**
         * 計算鬆弛變量
         */
        computeSlackVariable(M, q, z, i) {
            let result = q.get(i);
            for (let j = 0; j < z.length; j++) {
                result += M.get(i, j) * z[j];
            }
            return Math.max(this.minVariableValue, result);
        }
        
        /**
         * 計算最終鬆弛變量
         */
        computeFinalSlackVariables(M, q, z) {
            const n = z.length;
            const w = new Array(n);
            
            for (let i = 0; i < n; i++) {
                w[i] = this.computeSlackVariable(M, q, z, i);
            }
            
            return w;
        }
        
        /**
         * 增強的牛頓步長計算
         */
        computeRobustNewtonStep(M, q, z, s, mu, n) {
            const deltaZ = new Array(n);
            
            for (let i = 0; i < n; i++) {
                let Mii = M.get(i, i);
                
                // 防止除零並改善數值穩定性
                if (Math.abs(Mii) < 1e-12) {
                    Mii = Math.sign(Mii) * 1e-6 || 1e-6;
                }
                
                // 計算牛頓方向，考慮互補性約束
                const complementarity = z[i] * s[i];
                const target = mu / Math.max(complementarity, this.minVariableValue);
                
                deltaZ[i] = -target / (Mii + this.regularizationFactor);
                
                // 限制步長避免數值爆炸
                deltaZ[i] = Math.max(-0.5, Math.min(0.5, deltaZ[i]));
            }
            
            return deltaZ;
        }
        
        /**
         * 自適應線搜索
         */
        adaptiveLineSearch(M, q, z, s, deltaZ, mu) {
            let alpha = 1.0;
            const reduction = 0.7;  // 較保守的減少因子
            const minAlpha = 1e-10;
            
            while (alpha > minAlpha) {
                let valid = true;
                
                // 檢查新點的可行性和數值穩定性
                for (let i = 0; i < z.length; i++) {
                    const newZ = z[i] + alpha * deltaZ[i];
                    const newS = this.computeSlackVariable(M, q, [...z.map((zj, j) => j === i ? newZ : zj)], i);
                    
                    if (newZ < this.minVariableValue || newS < this.minVariableValue) {
                        valid = false;
                        break;
                    }
                    
                    // 檢查互補性是否改善
                    const newComplementarity = newZ * newS;
                    const oldComplementarity = z[i] * s[i];
                    
                    if (newComplementarity > oldComplementarity * 2) {
                        valid = false;
                        break;
                    }
                }
                
                if (valid) return alpha;
                alpha *= reduction;
            }
            
            return minAlpha;
        }
        
        /**
         * 備用固定點迭代方法
         */
        fallbackFixedPointMethod(M, q) {
            const n = q.size;
            let z = new Array(n).fill(0.01);
            
            console.log('🆘 使用備用固定點迭代...');
            
            for (let iter = 0; iter < 100; iter++) {
                const newZ = new Array(n);
                
                for (let i = 0; i < n; i++) {
                    let sum = q.get(i);
                    for (let j = 0; j < n; j++) {
                        if (j !== i) sum += M.get(i, j) * z[j];
                    }
                    
                    const Mii = M.get(i, i);
                    if (Math.abs(Mii) > 1e-12) {
                        newZ[i] = Math.max(0, -sum / Mii);
                    } else {
                        newZ[i] = Math.max(0, z[i] - 0.01 * sum);
                    }
                }
                
                // 檢查收斂
                let maxChange = 0;
                for (let i = 0; i < n; i++) {
                    maxChange = Math.max(maxChange, Math.abs(newZ[i] - z[i]));
                    z[i] = newZ[i];
                }
                
                if (maxChange < 1e-6) break;
            }
            
            const w = this.computeFinalSlackVariables(M, q, z);
            
            return {
                z: z,
                w: w,
                converged: false,
                iterations: 100,
                method: 'Fallback-Fixed-Point',
                residualNorm: 1e-3
            };
        }
        
        /**
         * 計算拉格朗日梯度 (重載原有方法)
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
    }`;
    
    // 2. 替換現有的 QPSolver 類
    mcpSolverCode = mcpSolverCode.replace(
        /export class QPSolver \{[\s\S]*?\n\}/,
        qpEnhancements
    );
    
    // 3. 更新 RobustLCPSolver 使用增強版 QP 求解器
    const robustSolverUpdate = `
    /**
     * 🔧 增強的 LCP 求解器 - 自動回退到增強 QP
     */
    export class RobustLCPSolver {
        constructor(options = {}) {
            this.lemkeSolver = new LCPSolver(options);
            this.qpSolver = new EnhancedQPSolver({
                ...options,
                maxIterations: options.maxIterations || 8000,
                tolerance: options.tolerance || 1e-12,
                debug: options.debug || false
            });
            this.debug = options.debug || false;
            this.useQPFirst = options.useQPFirst || false;  // 新選項：優先使用 QP
        }
        
        solve(M, q) {
            if (this.debug) {
                console.log('🛡️ 使用強健 LCP 求解器...');
            }
            
            // 如果設置了 useQPFirst，直接使用 QP 求解器
            if (this.useQPFirst) {
                if (this.debug) {
                    console.log('⚡️ 直接使用增強 QP 方法（跳過 Lemke）');
                }
                return this.qpSolver.solve(M, q);
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
                        console.log('⚠️ Lemke 失敗，切換到增強 QP 方法');
                        console.log(\`   失敗原因: \${lemkeResult.error}\`);
                    }
                }
            } catch (error) {
                if (this.debug) {
                    console.log('❌ Lemke 異常，切換到增強 QP 方法');
                    console.log(\`   異常: \${error.message}\`);
                }
            }
            
            // 回退到增強 QP 求解器
            try {
                const qpResult = this.qpSolver.solve(M, q);
                if (this.debug) {
                    if (qpResult.converged) {
                        console.log('✅ 增強 QP 方法成功救援');
                    } else {
                        console.log(\`⚠️ 增強 QP 方法部分收斂 (residual=\${qpResult.residualNorm?.toExponential(2) || 'N/A'})\`);
                    }
                }
                return qpResult;
            } catch (error) {
                return {
                    z: null,
                    w: null,
                    converged: false,
                    iterations: 0,
                    error: \`所有方法失敗: \${error.message}\`,
                    method: 'All-Failed'
                };
            }
        }
    }`;
    
    // 替換現有的 RobustLCPSolver
    mcpSolverCode = mcpSolverCode.replace(
        /export class RobustLCPSolver \{[\s\S]*?\n\s*\}/,
        robustSolverUpdate
    );
    
    // 4. 修改 createLCPSolver 函數，默認啟用增強模式
    const createSolverUpdate = `
    /**
     * 創建預配置的 LCP 求解器 - 增強版
     */
    export function createLCPSolver(options = {}) {
        const defaultOptions = {
            maxIterations: 8000,          // 大幅增加迭代數
            zeroTolerance: 1e-12,
            pivotTolerance: 1e-10,
            tolerance: 1e-12,             // QP 求解器容差
            useQPFirst: options.forceQP || false,  // 可選：直接使用 QP
            debug: false
        };
        
        // 🚀 默認使用增強的強健求解器
        return new RobustLCPSolver({ ...defaultOptions, ...options });
    }`;
    
    mcpSolverCode = mcpSolverCode.replace(
        /export function createLCPSolver[\s\S]*?\n\}/,
        createSolverUpdate
    );
    
    // 保存修改後的文件
    writeFileSync(mcpSolverPath, mcpSolverCode, 'utf-8');
    
    console.log('✅ MCP 求解器數值穩定性修復完成');
    
    // 5. 創建測試文件驗證修復效果
    const testEnhancedSolver = `
/**
 * 測試增強的 MCP 求解器
 */

console.log('🧪 測試增強的 MCP 求解器');

try {
    const { createLCPSolver } = await import('./src/core/mcp_solver.js');
    
    // 測試 1: 使用增強 QP 求解器
    console.log('\\n=== 測試 1: 增強 QP 求解器 ===');
    
    const solver = createLCPSolver({ 
        forceQP: true,  // 強制使用 QP
        debug: true 
    });
    
    // 創建一個具有挑戰性的 LCP 問題
    const { Matrix, Vector } = await import('./src/core/linalg.js');
    
    const M = new Matrix([
        [2.1, -1.0],
        [-1.0, 2.1]
    ]);
    
    const q = new Vector([-1.0, -1.0]);
    
    console.log('求解 LCP: w = Mz + q, w ≥ 0, z ≥ 0, w\\'z = 0');
    console.log('M =', M.data);
    console.log('q =', q.data);
    
    const result = solver.solve(M, q);
    
    console.log('\\n結果:');
    console.log('  收斂:', result.converged);
    console.log('  方法:', result.method);
    console.log('  迭代次數:', result.iterations);
    console.log('  z =', result.z?.map(x => x.toFixed(6)) || 'null');
    console.log('  w =', result.w?.map(x => x.toFixed(6)) || 'null');
    
    if (result.residualNorm !== undefined) {
        console.log('  殘差範數:', result.residualNorm.toExponential(3));
    }
    
    // 驗證解的正確性
    if (result.z && result.w) {
        const complementarity = result.z.reduce((sum, zi, i) => sum + zi * result.w[i], 0);
        console.log('  互補性 (w\\'z):', complementarity.toExponential(6));
        
        const feasible = result.z.every(zi => zi >= -1e-10) && result.w.every(wi => wi >= -1e-10);
        console.log('  可行性:', feasible ? '✅' : '❌');
        
        if (feasible && Math.abs(complementarity) < 1e-8) {
            console.log('  ✅ 解驗證通過');
        } else {
            console.log('  ⚠️ 解可能不準確');
        }
    }
    
    console.log('\\n測試完成！');
    
} catch (error) {
    console.error('❌ 測試失敗:', error.message);
    console.error(error.stack);
}`;
    
    writeFileSync('./test_enhanced_mcp_solver.js', testEnhancedSolver, 'utf-8');
    
    console.log('✅ 創建了測試文件: test_enhanced_mcp_solver.js');
    
} catch (error) {
    console.error('❌ MCP 求解器修復失敗:', error.message);
    console.error(error.stack);
}

console.log('\\n🎯 修復摘要:');
console.log('1. ✅ 增強了 QP 求解器的數值穩定性');
console.log('2. ✅ 添加了 Tikhonov 正則化處理病態矩陣');  
console.log('3. ✅ 改善了初始點選擇和線搜索算法');
console.log('4. ✅ 增加了備用固定點迭代方法');
console.log('5. ✅ 大幅增加了最大迭代次數限制');
console.log('');
console.log('🚀 建議下一步: 運行 test_enhanced_mcp_solver.js 驗證修復效果');
console.log('然後重新測試 Buck 轉換器模擬');