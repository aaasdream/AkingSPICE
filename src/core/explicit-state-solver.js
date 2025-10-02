/**
 * 顯式狀態更新求解器 - CPU版本
 * 
 * 實現基於狀態空間的顯式電路仿真方法
 * 
 * 核心算法流程：
 * 1. 將電容視為電壓源 Vc(t)，電感視為電流源 Il(t)
 * 2. 求解純電阻網絡 Gv = i，獲得所有節點電壓
 * 3. 根據節點電壓計算流過電容的電流 Ic 和施加在電感上的電壓 Vl  
 * 4. 使用顯式積分更新狀態：Vc(t+dt) = Vc(t) + dt*Ic/C, Il(t+dt) = Il(t) + dt*Vl/L
 * 5. 重複步驟1-4直到仿真結束
 * 
 * 相比MNA隱式方法的優勢：
 * - 避免複雜的全局矩陣LU分解
 * - 核心計算高度並行，適合GPU
 * - 每個時間步只需求解線性方程組，無需牛頓迭代
 * 
 * 劣勢：
 * - 數值穩定性較差，需要較小的時間步長
 * - 對剛性電路可能不穩定
 */

import { CircuitPreprocessor } from './circuit-preprocessor.js';
import { Matrix, Vector } from './linalg.js';

/**
 * 簡單的迭代線性方程組求解器
 * 用於求解 Gv = i (純電阻網絡)
 */
class IterativeSolver {
    constructor() {
        this.maxIterations = 1000;
        this.tolerance = 1e-9;
        this.debug = false;
    }

    /**
     * 雅可比迭代法求解 Ax = b
     * @param {Matrix} A 系數矩陣 
     * @param {Float64Array} b 右手側向量
     * @param {Float64Array} x0 初始猜測 (可選)
     * @returns {Float64Array} 解向量
     */
    jacobi(A, b, x0 = null) {
        const n = A.rows;

        // 檢查對角線元素
        for (let i = 0; i < n; i++) {
            if (Math.abs(A.get(i, i)) < 1e-15) {
                throw new Error(`對角線元素 A[${i},${i}] 接近零，雅可比法不適用`);
            }
        }

        // 初始化
        let x = x0 ? new Float64Array(x0) : new Float64Array(n);
        let x_new = new Float64Array(n);
        let lastError = 0;

        for (let iter = 0; iter < this.maxIterations; iter++) {
            // x_new[i] = (b[i] - Σ(A[i,j] * x[j], j≠i)) / A[i,i]
            for (let i = 0; i < n; i++) {
                let sum = 0;
                for (let j = 0; j < n; j++) {
                    if (j !== i) {
                        sum += A.get(i, j) * x[j];
                    }
                }
                x_new[i] = (b[i] - sum) / A.get(i, i);
            }

            // 檢查收斂 - 計算 ||x_new - x||
            let error = 0;
            for (let i = 0; i < n; i++) {
                const diff = x_new[i] - x[i];
                error += diff * diff;
            }
            error = Math.sqrt(error);
            lastError = error;

            if (error < this.tolerance) {
                if (this.debug) {
                    console.log(`雅可比法收斂: ${iter + 1} 次迭代, 誤差 ${error.toExponential(3)}`);
                }
                return x_new;
            }

            // 準備下一次迭代
            x.set(x_new);
        }

        throw new Error(`雅可比法未收斂: ${this.maxIterations} 次迭代後誤差仍為 ${lastError.toExponential(3)}`);
    }

    /**
     * 強化的高斯-塞德爾迭代法求解 Ax = b
     * @param {Matrix} A 系數矩陣
     * @param {Float64Array} b 右手側向量  
     * @param {Float64Array} x0 初始猜測
     * @returns {Float64Array} 解向量
     */
    gaussSeidel(A, b, x0 = null) {
        const n = A.rows;
        let x = x0 ? new Float64Array(x0) : new Float64Array(n);

        // 添加對角線主元檢查和修正
        for (let i = 0; i < n; i++) {
            if (Math.abs(A.get(i, i)) < 1e-12) {
                // 如果對角線元素太小，添加一個小的正則化項
                A.set(i, i, A.get(i, i) + 1e-10);
                if (this.debug) {
                    console.warn(`對角線元素 A[${i},${i}] 太小，已添加正則化`);
                }
            }
        }

        // 使用更寬鬆的收斂判據和動態鬆弛因子
        let relaxation = 1.0;  // 鬆弛因子

        for (let iter = 0; iter < this.maxIterations; iter++) {
            let maxChange = 0;
            let sumSquareChange = 0;

            for (let i = 0; i < n; i++) {
                let sum = 0;
                for (let j = 0; j < n; j++) {
                    if (j !== i) {
                        sum += A.get(i, j) * x[j];
                    }
                }

                const newValue = (b[i] - sum) / A.get(i, i);

                // 使用鬆弛因子進行更新
                const relaxedValue = x[i] + relaxation * (newValue - x[i]);
                const change = Math.abs(relaxedValue - x[i]);

                if (change > maxChange) {
                    maxChange = change;
                }
                sumSquareChange += change * change;

                x[i] = relaxedValue;
            }

            // 動態調整鬆弛因子
            if (iter > 5 && maxChange > this.tolerance * 10) {
                relaxation = Math.max(0.5, relaxation * 0.95);  // 減少鬆弛因子
            }

            // 多重收斂條件
            const rmsChange = Math.sqrt(sumSquareChange / n);

            if (maxChange < this.tolerance || rmsChange < this.tolerance * 0.1) {
                if (this.debug) {
                    console.log(`高斯-塞德爾法收斂: ${iter + 1} 次迭代, 最大變化 ${maxChange.toExponential(3)}, RMS變化 ${rmsChange.toExponential(3)}`);
                }
                return x;
            }

            // 如果收斂很慢，嘗試更激進的鬆弛
            if (iter > this.maxIterations * 0.7 && maxChange > this.tolerance * 100) {
                relaxation = 1.5;  // 超鬆弛
            }
        }

        throw new Error(`高斯-塞德爾法未收斂: ${this.maxIterations} 次迭代`);
    }

    /**
     * 直接高斯消元法 (作為備用求解器)
     * @param {Matrix} A 系數矩陣
     * @param {Float64Array} b 右手側向量
     * @returns {Float64Array} 解向量
     */
    directSolve(A, b) {
        const n = A.rows;

        // 創建增廣矩陣 [A|b]
        const augmented = Matrix.zeros(n, n + 1);
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                augmented.set(i, j, A.get(i, j));
            }
            augmented.set(i, n, b[i]);
        }

        // 高斯消元 - 前向消元
        for (let k = 0; k < n; k++) {
            // 部分主元選取
            let maxRow = k;
            for (let i = k + 1; i < n; i++) {
                if (Math.abs(augmented.get(i, k)) > Math.abs(augmented.get(maxRow, k))) {
                    maxRow = i;
                }
            }

            // 交換行
            if (maxRow !== k) {
                for (let j = 0; j <= n; j++) {
                    const temp = augmented.get(k, j);
                    augmented.set(k, j, augmented.get(maxRow, j));
                    augmented.set(maxRow, j, temp);
                }
            }

            // 檢查主元是否為零
            if (Math.abs(augmented.get(k, k)) < 1e-15) {
                throw new Error(`矩陣奇異或接近奇異，主元 ${k} 為零`);
            }

            // 消元
            for (let i = k + 1; i < n; i++) {
                const factor = augmented.get(i, k) / augmented.get(k, k);
                for (let j = k; j <= n; j++) {
                    augmented.set(i, j, augmented.get(i, j) - factor * augmented.get(k, j));
                }
            }
        }

        // 回代求解
        const x = new Float64Array(n);
        for (let i = n - 1; i >= 0; i--) {
            let sum = 0;
            for (let j = i + 1; j < n; j++) {
                sum += augmented.get(i, j) * x[j];
            }
            x[i] = (augmented.get(i, n) - sum) / augmented.get(i, i);
        }

        return x;
    }

    setDebug(enabled) {
        this.debug = enabled;
    }

    setMaxIterations(maxIter) {
        this.maxIterations = maxIter;
    }

    setTolerance(tol) {
        this.tolerance = tol;
    }
}

/**
 * 顯式狀態更新求解器主類
 */
export class ExplicitStateSolver {
    constructor() {
        this.preprocessor = new CircuitPreprocessor();
        this.linearSolver = new IterativeSolver();

        // 電路數據
        this.circuitData = null;
        this.components = null;

        // 仿真狀態  
        this.currentTime = 0;
        this.timeStep = 1e-6;     // 1μs 預設時間步長
        this.stateVector = null;   // 狀態向量 [Vc1, Vc2, ..., Il1, Il2, ...]
        this.rhsVector = null;     // RHS向量 i
        this.solutionVector = null; // 節點電壓解 v

        // G矩陣 (純電阻導納矩陣)
        this.gMatrix = null;

        // 積分方法
        this.integrationMethod = 'forward_euler';  // 'forward_euler', 'rk4'

        // 調試和統計
        this.debug = false;
        this.stats = {
            totalTimeSteps: 0,
            totalLinearSolves: 0,
            averageSolverIterations: 0
        };
    }

    /**
     * 初始化求解器
     * @param {BaseComponent[]} components 電路元件列表
     * @param {number} timeStep 時間步長
     * @param {Object} options 選項
     */
    async initialize(components, timeStep = 1e-6, options = {}) {
        console.log('初始化顯式狀態更新求解器...');

        this.components = components;
        this.timeStep = timeStep;
        this.debug = options.debug || false;
        this.integrationMethod = options.integrationMethod || 'forward_euler';

        // 設置調試模式
        this.preprocessor.setDebug(this.debug);
        this.linearSolver.setDebug(this.debug);

        // 如果設置了求解器選項
        if (options.solverMaxIterations) {
            this.linearSolver.setMaxIterations(options.solverMaxIterations);
        }
        if (options.solverTolerance) {
            this.linearSolver.setTolerance(options.solverTolerance);
        }

        // 預處理電路
        const preprocessStats = this.preprocessor.process(components);
        this.circuitData = this.preprocessor.getProcessedData();

        // 驗證預處理結果
        const validation = this.preprocessor.validate();
        if (!validation.valid) {
            throw new Error(`電路預處理失敗: ${validation.issues.join(', ')}`);
        }

        if (validation.warnings.length > 0 && this.debug) {
            console.warn('預處理警告:', validation.warnings);
        }

        // 構建G矩陣 (純電阻導納矩陣)
        this.buildGMatrix();

        // 初始化狀態和工作向量
        this.initializeVectors();

        console.log(`顯式求解器初始化完成: ${this.circuitData.nodeCount} 節點, ${this.circuitData.stateCount} 狀態變量`);

        // 重置統計
        this.stats = {
            totalTimeSteps: 0,
            totalLinearSolves: 0,
            averageSolverIterations: 0
        };

        return preprocessStats;
    }

    /**
     * 從COO格式構建密集G矩陣
     */
    buildGMatrix() {
        const n = this.circuitData.nodeCount;
        this.gMatrix = Matrix.zeros(n, n);

        // 檢查是否有非線性元件
        if (this.hasNonlinearComponents()) {
            // 混合構建：先用預處理數據，然後更新非線性元件
            const buffers = this.circuitData.gpuBuffers;

            // 從COO格式填充線性部分
            for (let i = 0; i < buffers.gRows.length; i++) {
                const row = buffers.gRows[i];
                const col = buffers.gCols[i];
                const value = buffers.gValues[i];

                this.gMatrix.set(row, col, value);
            }

            // 然後為非線性元件重新印花
            const rhs = new Float64Array(n);  // 臨時RHS，不用於實際計算
            for (const component of this.components) {
                if ((component.type === 'D' || component.type === 'M' || component.type === 'Q') &&
                    typeof component.stamp === 'function') {
                    component.stamp(this.gMatrix, rhs, this.circuitData.nodeMap,
                        this.circuitData.voltageSourceMap, this.currentTime);
                }
            }

            if (this.debug && this.stats.totalTimeSteps < 5) {
                console.log(`  混合重建G矩陣 (時間步 ${this.stats.totalTimeSteps})`);
                console.log('  重建後G矩陣:');
                this.gMatrix.print(3);
            }
        } else {
            // 線性電路：使用預處理數據
            const buffers = this.circuitData.gpuBuffers;

            // 從COO格式填充矩陣
            for (let i = 0; i < buffers.gRows.length; i++) {
                const row = buffers.gRows[i];
                const col = buffers.gCols[i];
                const value = buffers.gValues[i];

                this.gMatrix.set(row, col, value);
            }
        }

        if (this.debug && this.stats.totalTimeSteps === 0) {
            console.log('G矩陣構建完成:');
            if (n <= 6) {
                console.log(this.gMatrix.toString());
            } else {
                console.log(`矩陣大小: ${n}x${n}`);
            }
        }
    }

    /**
     * 初始化狀態向量和工作向量
     */
    initializeVectors() {
        const nodeCount = this.circuitData.nodeCount;
        const stateCount = this.circuitData.stateCount;

        // 狀態向量 (從預處理結果複製初始值)
        this.stateVector = new Float64Array(stateCount);
        for (let i = 0; i < stateCount; i++) {
            this.stateVector[i] = this.circuitData.gpuBuffers.stateVector[i];
        }

        // 工作向量
        this.rhsVector = new Float64Array(nodeCount);
        this.solutionVector = new Float64Array(nodeCount);

        this.currentTime = 0;

        if (this.debug) {
            console.log('初始狀態向量:', Array.from(this.stateVector));
        }
    }

    /**
     * 執行一個時間步
     * @param {Object} controlInputs 控制輸入 (可選)
     * @returns {Object} 時間步結果
     */
    step(controlInputs = {}) {
        // 1. 更新控制輸入 (時變源、開關狀態等)
        this.updateControlInputs(controlInputs);

        // 2. 檢查是否需要重新構建 G 矩陣 (非線性元件如二極體)
        if (this.hasNonlinearComponents()) {
            this.buildGMatrix();
        }

        // 3. 構建RHS向量 i
        this.buildRHSVector();

        // 4. 求解純電阻網絡 Gv = i  
        this.solveResistiveNetwork();

        // 5. 計算狀態變量導數並更新狀態
        // 🔥 核心修正：移除錯誤的後處理約束，使用標準大導納法
        this.updateStateVariables();

        // 6. 準備下一個時間步
        this.currentTime += this.timeStep;
        this.stats.totalTimeSteps++;

        // 7. 返回當前時間步結果
        return this.getCurrentStepResult();
    }

    /**
     * 檢查是否有非線性元件需要重新構建 G 矩陣
     * @returns {boolean}
     */
    hasNonlinearComponents() {
        return this.components.some(comp =>
            comp.type === 'D' ||          // 二極體
            comp.type === 'M' ||          // MOSFET
            comp.type === 'Q'             // 晶體管
        );
    }

    /**
     * 更新控制輸入
     */
    updateControlInputs(controlInputs) {
        // 這裡可以更新時變電壓源、電流源的值
        // 或者MOSFET的開關狀態等
        for (const [componentName, value] of Object.entries(controlInputs)) {
            const component = this.components.find(c => c.name === componentName);
            if (component && typeof component.setValue === 'function') {
                component.setValue(value);
            }
        }
    }

    /**
     * 構建RHS向量 i
     * 包含：獨立電流源 + 電感電流源 + 電容等效電流源
     */
    buildRHSVector() {
        const n = this.circuitData.nodeCount;

        // 清零RHS向量
        this.rhsVector.fill(0);

        // 讓每個元件更新其RHS貢獻
        for (const component of this.components) {
            const componentData = this.circuitData.componentData.get(component.name);
            component.updateRHS(this.rhsVector, this.stateVector, this.currentTime, componentData);
        }

        if (this.stats.totalTimeSteps < 5) {
            console.log(`t=${this.currentTime.toExponential(3)}, RHS:`, Array.from(this.rhsVector));
        }
    }

    /**
     * 求解純電阻網絡 Gv = i
     */
    solveResistiveNetwork() {
        // 保存前一個時間步的解向量，用於電容電流計算
        if (!this.previousSolutionVector) {
            this.previousSolutionVector = new Float64Array(this.solutionVector.length);
        }
        this.previousSolutionVector.set(this.solutionVector);

        try {
            // 使用雅可比法求解 (適合GPU並行)
            const solution = this.linearSolver.jacobi(this.gMatrix, this.rhsVector, this.solutionVector);

            // 複製結果
            this.solutionVector.set(solution);
            this.stats.totalLinearSolves++;

        } catch (jacobiError) {
            if (this.debug) {
                console.warn(`雅可比法失敗，嘗試高斯-塞德爾法: ${jacobiError?.message || jacobiError}`);
            }

            try {
                const solution = this.linearSolver.gaussSeidel(this.gMatrix, this.rhsVector, this.solutionVector);
                this.solutionVector.set(solution);
                this.stats.totalLinearSolves++;
            } catch (gsError) {
                if (this.debug) {
                    console.warn(`高斯-塞德爾法也失敗，嘗試直接求解: ${gsError?.message || gsError}`);
                }

                try {
                    // 使用直接高斯消元法作為最後的備用方案
                    const solution = this.linearSolver.directSolve(this.gMatrix, this.rhsVector);
                    this.solutionVector.set(solution);
                    this.stats.totalLinearSolves++;

                    if (this.debug) {
                        console.log('直接求解成功');
                    }
                } catch (directError) {
                    throw new Error(`所有線性求解器都失敗: 雅可比法[${jacobiError?.message}], 高斯-塞德爾法[${gsError?.message}], 直接求解[${directError?.message}]`);
                }
            }
        }

        if (this.stats.totalTimeSteps < 5) {
            console.log(`t=${this.currentTime.toExponential(3)}, 節點電壓:`, Array.from(this.solutionVector));
        }
    }

    // 🔥 核心修正：移除錯誤的後處理約束方法
    // 標準大導納法不需要後處理，約束已經在G矩陣和RHS中正確處理
    // 原 enforceVoltageSourceConstraints() 方法已刪除

    /**
     * 更新狀態變量 (顯式積分)
     */
    updateStateVariables() {
        const stateCount = this.circuitData.stateCount;
        const stateDerivatives = new Float64Array(stateCount);

        // 保存前一步的狀態向量
        if (!this.prevStateVector) {
            this.prevStateVector = new Float64Array(stateCount);
        }
        this.prevStateVector.set(this.stateVector);



        // 使用元件的 updateState 方法更新狀態變數
        // 為元件提供必要的上下文數據
        const componentData = {
            gMatrix: this.gMatrix,  // 使用求解器中的G矩陣
            rhsVector: this.rhsVector
        };

        // 遍歷所有元件，調用其 updateState 方法
        if (this.components) {
            // 創建節點電壓映射
            const nodeVoltages = new Map();
            nodeVoltages.set('0', 0);  // 接地
            nodeVoltages.set('gnd', 0);

            for (let i = 0; i < this.circuitData.nodeCount; i++) {
                const nodeName = this.circuitData.nodeNames[i];
                nodeVoltages.set(nodeName, this.solutionVector[i]);
            }

            for (const component of this.components) {
                // 特殊處理：電容器和電感器使用備用路徑，其他組件使用updateState方法
                if (component.type !== 'C' && component.type !== 'L' &&
                    component.updateState && typeof component.updateState === 'function') {
                    // 調用統一的 updateState 接口
                    component.updateState(
                        nodeVoltages,          // 節點電壓映射
                        this.solutionVector,   // 解向量
                        this.timeStep,         // 時間步長
                        this.currentTime,      // 當前時間
                        this.circuitData.nodeMap,  // 節點映射
                        this.gMatrix           // G矩陣
                    );
                }
            }
        }

        // 備用方法：專門處理電容和電感的狀態更新
        for (let i = 0; i < stateCount; i++) {
            const stateVar = this.circuitData.stateVariables[i];

            // 檢查對應的元件類型
            let component = null;
            if (this.components) {
                component = this.components.find(c => c.name === stateVar.componentName);
            }

            // 只處理電容(C)和電感(L)
            if (component && (component.type === 'C' || component.type === 'L')) {
                // 使用備用路徑處理
            } else {
                continue; // 不是電容或電感，跳過
            }

            // 對於沒有 updateState 方法的元件（如老版本的電感），使用傳統方式
            const node1 = stateVar.node1;
            const node2 = stateVar.node2;

            // 獲取節點電壓
            const v1 = node1 >= 0 ? this.solutionVector[node1] : 0;
            const v2 = node2 >= 0 ? this.solutionVector[node2] : 0;
            const nodeVoltage = v1 - v2;

            if (stateVar.type === 'current') {
                // 電感: dIl/dt = Vl/L，使用前向歐拉積分
                const L = stateVar.parameter;
                const dIldt = nodeVoltage / L;
                this.stateVector[i] += this.timeStep * dIldt;
            } else if (stateVar.type === 'voltage') {
                // 電容: dVc/dt = Ic/C，使用修正後的KCL方法計算電容電流
                const C = stateVar.parameter;
                const currentVc = this.stateVector[i];

                const node1Idx = stateVar.node1;
                const node2Idx = stateVar.node2;

                // 獲取節點電壓  
                const v1 = node1Idx >= 0 ? this.solutionVector[node1Idx] : 0;
                const v2 = node2Idx >= 0 ? this.solutionVector[node2Idx] : 0;

                // 🔥 核心修正：使用標準大導納法計算電容電流
                // Ic = (V_node - Vc(t)) * G_large
                // 這是工業標準方法，數值穩定且準確
                
                const nodeVoltage = v1 - v2;
                
                // 獲取電容的大導納值
                let largeAdmittance = 1e3;  // 預設值，與 capacitor.js 中一致
                
                // 嘗試從組件中獲取實際的大導納值
                if (this.components) {
                    const capacitorComponent = this.components.find(c => c.name === stateVar.componentName);
                    if (capacitorComponent && capacitorComponent.largeAdmittance) {
                        largeAdmittance = capacitorComponent.largeAdmittance;
                    }
                }
                
                // 標準大導納法公式：Ic = (V_node - Vc) * G_large
                let capacitorCurrent = largeAdmittance * (nodeVoltage - currentVc);
                
                // 數值穩定性保護：防止電流過大
                const maxReasonableCurrent = C * 1000 / this.timeStep;  // 基於物理限制
                if (Math.abs(capacitorCurrent) > maxReasonableCurrent) {
                    capacitorCurrent = Math.sign(capacitorCurrent) * maxReasonableCurrent;
                }
                
                // 電壓範圍保護：防止電容電壓過大
                const dVcdt = capacitorCurrent / C;
                const potentialVc = currentVc + dVcdt * this.timeStep;
                
                if (Math.abs(potentialVc) > 50) {  // ±50V保護限制
                    const maxVc = Math.sign(potentialVc) * 50;
                    capacitorCurrent = C * (maxVc - currentVc) / this.timeStep;
                }

                this.stateVector[i] += this.timeStep * dVcdt;
                stateDerivatives[i] = dVcdt;
            }
        }

        if (this.stats.totalTimeSteps < 10) {
            console.log(`t=${this.currentTime.toExponential(3)}, 狀態導數:`, Array.from(stateDerivatives));
            console.log(`t=${this.currentTime.toExponential(3)}, 更新後狀態:`, Array.from(this.stateVector));

            // 詳細調試：檢查第一個狀態變量（電容）
            if (stateCount > 0) {
                const stateVar = this.circuitData.stateVariables[0];
                if (stateVar.type === 'voltage') {  // 電容
                    const node1 = stateVar.node1;
                    const node2 = stateVar.node2;
                    const v1 = node1 >= 0 ? this.solutionVector[node1] : 0;
                    const v2 = node2 >= 0 ? this.solutionVector[node2] : 0;
                    const nodeVoltage = v1 - v2;
                    const currentVc = this.stateVector[0];
                    const voltageDiff = nodeVoltage - currentVc;
                    console.log(`  C1: V_node=${nodeVoltage.toFixed(6)}, Vc=${currentVc.toFixed(6)}, 電壓差=${voltageDiff.toFixed(6)}, dVc/dt=${stateDerivatives[0].toExponential(3)}`);
                }
            }
        }
    }

    /**
     * 四階龍格庫塔積分 (暫時簡化實現)
     */
    rungeKutta4Update(k1) {
        // 簡化的RK4實現 - 在完整版本中需要多次求解線性系統
        const dt = this.timeStep;

        for (let i = 0; i < this.stateVector.length; i++) {
            this.stateVector[i] += dt * k1[i];
        }
    }

    /**
     * 獲取當前時間步結果
     */
    getCurrentStepResult() {
        // 構建節點電壓對象 - 返回普通對象而不是Map
        const nodeVoltages = {};
        nodeVoltages['0'] = 0;      // 接地
        nodeVoltages['gnd'] = 0;    // 接地

        for (let i = 0; i < this.circuitData.nodeCount; i++) {
            const nodeName = this.circuitData.nodeNames[i];
            nodeVoltages[nodeName] = this.solutionVector[i];
        }

        // 構建狀態變量Map對象 - 返回Map以兼容測試代碼
        const stateVariables = new Map();
        for (let i = 0; i < this.circuitData.stateCount; i++) {
            const stateVar = this.circuitData.stateVariables[i];
            stateVariables.set(stateVar.componentName, this.stateVector[i]);
        }

        return {
            time: this.currentTime,
            timeStep: this.timeStep,
            nodeVoltages: nodeVoltages,
            stateVariables: stateVariables,
            converged: true  // 顯式方法總是"收斂"
        };
    }

    /**
     * 運行完整的時間域仿真
     * @param {number} startTime 開始時間
     * @param {number} stopTime 結束時間  
     * @param {Function} controlFunction 控制函數 (time) => controlInputs
     * @returns {Object} 仿真結果
     */
    async run(startTime = 0, stopTime = 1e-3, controlFunction = null) {
        console.log(`開始顯式時域仿真: ${startTime}s 到 ${stopTime}s, 步長 ${this.timeStep}s`);

        const results = {
            timeVector: [],
            nodeVoltages: new Map(),
            stateVariables: new Map(),
            stats: null
        };

        // 初始化結果容器
        for (const nodeName of this.circuitData.nodeNames) {
            results.nodeVoltages.set(nodeName, []);
        }
        for (const stateVar of this.circuitData.stateVariables) {
            results.stateVariables.set(stateVar.componentName, []);
        }

        this.currentTime = startTime;
        const totalSteps = Math.ceil((stopTime - startTime) / this.timeStep);
        let stepCount = 0;

        // 先求解t=0時刻的初始條件
        this.step();
        this.currentTime = startTime; // 重置時間為開始時間

        // 記錄初始條件
        const initialResult = this.getCurrentStepResult();
        this.recordTimePoint(results, initialResult);

        // 主仿真循環
        while (this.currentTime < stopTime) {
            // 獲取控制輸入
            const controlInputs = controlFunction ? controlFunction(this.currentTime) : {};

            // 執行一個時間步
            const stepResult = this.step(controlInputs);

            // 記錄結果
            this.recordTimePoint(results, stepResult);

            stepCount++;

            // 進度報告
            if (stepCount % 10000 === 0) {
                const progress = (stepCount / totalSteps) * 100;
                console.log(`仿真進度: ${progress.toFixed(1)}% (${stepCount}/${totalSteps})`);
            }
        }

        // 最終統計
        results.stats = {
            ...this.stats,
            totalSimulationTime: stopTime - startTime,
            actualTimeSteps: stepCount,
            averageStepsPerSecond: stepCount / ((stopTime - startTime) / this.timeStep)
        };

        console.log(`顯式仿真完成: ${stepCount} 個時間步`);
        if (this.debug) {
            console.log('仿真統計:', results.stats);
        }

        // 轉換為GPU求解器兼容格式
        const compatibleResults = {
            timeVector: results.timeVector,
            nodeVoltages: {},
            stateVariables: {},
            totalTime: results.stats.totalSimulationTime,
            stats: results.stats
        };

        // 轉換節點電壓Map為對象
        for (const [nodeName, voltages] of results.nodeVoltages) {
            compatibleResults.nodeVoltages[nodeName] = voltages;
        }

        // 轉換狀態變量Map為對象
        for (const [componentName, states] of results.stateVariables) {
            compatibleResults.stateVariables[componentName] = states;
        }

        return compatibleResults;
    }

    /**
     * 記錄一個時間點的結果
     */
    recordTimePoint(results, stepResult) {
        results.timeVector.push(stepResult.time);

        // 記錄節點電壓 - stepResult.nodeVoltages 是普通對象
        for (const [nodeName, voltage] of Object.entries(stepResult.nodeVoltages)) {
            if (results.nodeVoltages.has(nodeName)) {
                results.nodeVoltages.get(nodeName).push(voltage);
            }
        }

        // 記錄狀態變量 - stepResult.stateVariables 是普通對象
        for (const [componentName, value] of Object.entries(stepResult.stateVariables)) {
            if (results.stateVariables.has(componentName)) {
                results.stateVariables.get(componentName).push(value);
            }
        }
    }

    /**
     * 設置積分方法
     * @param {string} method 'forward_euler' 或 'rk4'
     */
    setIntegrationMethod(method) {
        const validMethods = ['forward_euler', 'rk4'];
        if (!validMethods.includes(method)) {
            throw new Error(`無效的積分方法: ${method}. 支持的方法: ${validMethods.join(', ')}`);
        }
        this.integrationMethod = method;
    }

    /**
     * 設置時間步長
     * @param {number} dt 新的時間步長
     */
    setTimeStep(dt) {
        if (dt <= 0) {
            throw new Error('時間步長必須大於零');
        }
        this.timeStep = dt;
    }

    /**
     * 獲取仿真統計信息
     */
    getStats() {
        return { ...this.stats };
    }

    /**
     * 設置調試模式
     */
    setDebug(enabled) {
        this.debug = enabled;
        this.preprocessor.setDebug(enabled);
        this.linearSolver.setDebug(enabled);
    }

    /**
     * 獲取當前狀態 (用於調試)
     */
    getCurrentState() {
        return {
            time: this.currentTime,
            stateVector: Array.from(this.stateVector),
            nodeVoltages: Array.from(this.solutionVector),
            rhsVector: Array.from(this.rhsVector)
        };
    }

    /**
     * 銷毀求解器，釋放資源
     * 對於CPU版本主要是清理記憶體引用
     */
    destroy() {
        // 清理矩陣和向量
        this.gMatrix = null;
        this.stateVector = null;
        this.rhsVector = null;
        this.solutionVector = null;

        // 清理電路數據
        this.circuitData = null;
        this.components = null;

        // 重置狀態
        this.currentTime = 0;
        this.stats = {
            totalTimeSteps: 0,
            totalLinearSolves: 0,
            averageSolverIterations: 0
        };

        console.log('ExplicitStateSolver 已銷毀');
    }
}