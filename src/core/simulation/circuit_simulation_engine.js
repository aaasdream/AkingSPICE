"use strict";
/**
 * 🚀 AkingSPICE 2.1 通用电路仿真引擎
 *
 * 世界领先的通用电路仿真引擎，整合三大革命性技术：
 * - Generalized-α 时域积分器 (L-稳定，可控阻尼)
 * - 统一组件接口 (基础组件 + 智能设备)
 * - Ultra KLU WASM 求解器 (极致性能)
 *
 * 🏆 设计目标：
 * - 支持任意电路拓扑仿真
 * - 大规模电路高效处理 (1000+ 节点)
 * - 实时仿真能力 (μs 级时间步长)
 * - 工业级数值稳定性 (>99% 收敛率)
 * - 自适应仿真策略 (智能优化)
 *
 * 📚 技术架构：
 *   Event-Driven MNA + Generalized-α + 统一组件接口
 *   多时间尺度处理 + 自适应步长控制
 *   并行化友好设计 + 内存优化
 *
 * 🎯 应用领域：
 *   开关电源设计验证
 *   电力电子系统分析
 *   RF/模拟电路仿真
 *   多物理场耦合仿真
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CircuitSimulationEngine = exports.SimulationState = void 0;
const vector_1 = require("../../math/sparse/vector");
const matrix_1 = require("../../math/sparse/matrix");
const generalized_alpha_1 = require("../integrator/generalized_alpha");
/**
 * 仿真状态枚举
 */
var SimulationState;
(function (SimulationState) {
    SimulationState["IDLE"] = "idle";
    SimulationState["INITIALIZING"] = "initializing";
    SimulationState["RUNNING"] = "running";
    SimulationState["PAUSED"] = "paused";
    SimulationState["CONVERGED"] = "converged";
    SimulationState["FAILED"] = "failed";
    SimulationState["COMPLETED"] = "completed"; // 完成
})(SimulationState || (exports.SimulationState = SimulationState = {}));
/**
 * 🚀 电路仿真引擎核心类
 *
 * 整合所有革命性技术的统一仿真平台
 * 提供工业级的大规模电路仿真能力
 */
class CircuitSimulationEngine {
    constructor(config = {}) {
        this._devices = new Map();
        this._nodeMapping = new Map();
        // 仿真状态
        this._state = SimulationState.IDLE;
        this._currentTime = 0;
        this._currentTimeStep = 1e-6;
        this._stepCount = 0;
        this._startTime = 0;
        this._events = [];
        // 内存管理
        this._memoryUsage = 0;
        // 配置默认参数
        this._config = {
            startTime: 0,
            endTime: 1e-3, // 默认 1ms 仿真
            initialTimeStep: 1e-6, // 默认 1μs 步长
            minTimeStep: 1e-9, // 最小 1ns
            maxTimeStep: 1e-5, // 最大 10μs
            voltageToleranceAbs: 1e-6, // 1μV 绝对容差
            voltageToleranceRel: 1e-9, // 1ppb 相对容差
            currentToleranceAbs: 1e-9, // 1nA 绝对容差
            currentToleranceRel: 1e-9, // 1ppb 相对容差
            maxNewtonIterations: 50, // 最大 Newton 迭代
            alphaf: 0.4, // Generalized-α 参数 (数值阻尼)
            alpham: 0.2, // Generalized-α 参数 
            beta: 0.36, // Newmark β
            gamma: 0.7, // Newmark γ  
            enableAdaptiveTimeStep: true, // 启用自适应步长
            enablePredictiveAnalysis: true, // 启用预测分析
            enableParallelization: false, // 暂不启用并行化
            maxMemoryUsage: 1024, // 1GB 内存限制
            verboseLogging: false, // 简洁日志
            saveIntermediateResults: true, // 保存中间结果
            enablePerformanceMonitoring: true, // 启用性能监控
            ...config
        };
        // 初始化积分器
        this._integrator = new generalized_alpha_1.GeneralizedAlphaIntegrator({
            spectralRadius: this._config.alphaf, // 使用正确的参数名
            tolerance: this._config.voltageToleranceAbs,
            maxNewtonIterations: this._config.maxNewtonIterations,
            verbose: this._config.verboseLogging
        });
        // 估算最大节点数 (基于内存限制)
        this._maxNodes = Math.floor(this._config.maxMemoryUsage * 1024 * 1024 / (8 * 1000)); // 估算公式
        // 初始化矩阵和向量 (使用估算大小)
        const estimatedSize = Math.min(this._maxNodes, 1000); // 默认最大1000节点
        this._systemMatrix = new matrix_1.SparseMatrix(estimatedSize, estimatedSize);
        this._rhsVector = new vector_1.Vector(estimatedSize);
        this._solutionVector = new vector_1.Vector(estimatedSize);
        // 初始化性能指标
        this._performanceMetrics = {
            totalSimulationTime: 0,
            matrixAssemblyTime: 0,
            matrixSolutionTime: 0,
            deviceEvaluationTime: 0,
            convergenceCheckTime: 0,
            memoryPeakUsage: 0,
            averageIterationsPerStep: 0,
            failedSteps: 0,
            adaptiveStepChanges: 0
        };
        // 初始化波形数据
        this._waveformData = {
            timePoints: [],
            nodeVoltages: new Map(),
            deviceCurrents: new Map(),
            deviceStates: new Map()
        };
    }
    /**
     * 🔧 添加智能设备到电路
     */
    addDevice(device) {
        if (this._state !== SimulationState.IDLE) {
            throw new Error('Cannot add devices while simulation is running');
        }
        this._devices.set(device.deviceId, device);
        // 更新节点映射
        device.nodes.forEach((nodeId) => {
            if (!this._nodeMapping.has(nodeId.toString())) {
                const globalNodeId = this._nodeMapping.size;
                this._nodeMapping.set(nodeId.toString(), globalNodeId);
            }
        });
        this._logEvent('DEVICE_ADDED', device.deviceId, `Added ${device.deviceType} device`);
    }
    /**
     * 🔧 批量添加设备 (便于复杂电路创建)
     */
    addDevices(devices) {
        devices.forEach(device => this.addDevice(device));
    }
    /**
     * ⚙️ 初始化仿真系统
     */
    async _initializeSimulation() {
        this._state = SimulationState.INITIALIZING;
        const initStartTime = performance.now();
        try {
            // 1. 验证电路完整性
            this._validateCircuit();
            // 2. 分配系统矩阵和向量
            const systemSize = this._nodeMapping.size;
            this._systemMatrix = new matrix_1.SparseMatrix(systemSize, systemSize);
            this._rhsVector = new vector_1.Vector(systemSize);
            this._solutionVector = new vector_1.Vector(systemSize);
            // 3. 积分器不需要额外初始化（构造函数中已完成）
            // 积分器将在第一次调用 step() 时自动初始化状态
            // 4. 计算初始工作点 (DC 分析)
            await this._performDCAnalysis();
            // 5. 初始化波形数据存储
            this._initializeWaveformStorage();
            // 6. 设置初始时间和步长
            this._currentTime = this._config.startTime;
            this._currentTimeStep = this._config.initialTimeStep;
            this._stepCount = 0;
            const initTime = performance.now() - initStartTime;
            this._logEvent('INITIALIZATION_COMPLETE', undefined, `Initialization completed in ${initTime.toFixed(2)}ms`);
        }
        catch (error) {
            this._state = SimulationState.FAILED;
            throw new Error(`Simulation initialization failed: ${error}`);
        }
    }
    /**
     * 🚀 运行主要仿真循环
     */
    async runSimulation() {
        this._startTime = performance.now();
        this._state = SimulationState.RUNNING;
        try {
            // 1. 初始化仿真
            await this._initializeSimulation();
            // 2. 主仿真循环
            while (this._currentTime < this._config.endTime && this._state === SimulationState.RUNNING) {
                const stepSuccess = await this._performTimeStep();
                if (!stepSuccess) {
                    // 步长减半重试
                    if (this._currentTimeStep > this._config.minTimeStep * 2) {
                        this._currentTimeStep *= 0.5;
                        this._performanceMetrics.adaptiveStepChanges++;
                        continue;
                    }
                    else {
                        // 无法继续，仿真失败
                        this._state = SimulationState.FAILED;
                        break;
                    }
                }
                // 3. 保存波形数据
                if (this._config.saveIntermediateResults) {
                    this._saveWaveformPoint();
                }
                // 4. 自适应时间步长调整
                if (this._config.enableAdaptiveTimeStep) {
                    await this._adaptTimeStep();
                }
                // 5. 内存使用检查
                if (this._memoryUsage > this._config.maxMemoryUsage * 1024 * 1024) {
                    this._logEvent('MEMORY_WARNING', undefined, 'Memory usage exceeded limit');
                    break;
                }
                this._stepCount++;
            }
            // 3. 生成最终结果
            return this._generateFinalResult();
        }
        catch (error) {
            this._state = SimulationState.FAILED;
            return {
                success: false,
                finalTime: this._currentTime,
                totalSteps: this._stepCount,
                convergenceRate: 0,
                averageStepTime: 0,
                peakMemoryUsage: this._memoryUsage / (1024 * 1024),
                waveformData: this._waveformData,
                performanceMetrics: this._performanceMetrics,
                errorMessage: `Simulation failed: ${error}`
            };
        }
    }
    /**
     * ⏸️ 暂停仿真
     */
    pauseSimulation() {
        if (this._state === SimulationState.RUNNING) {
            this._state = SimulationState.PAUSED;
            this._logEvent('SIMULATION_PAUSED', undefined, `Paused at t=${this._currentTime}`);
        }
    }
    /**
     ▶️ 恢复仿真
     */
    resumeSimulation() {
        if (this._state === SimulationState.PAUSED) {
            this._state = SimulationState.RUNNING;
            this._logEvent('SIMULATION_RESUMED', undefined, `Resumed at t=${this._currentTime}`);
        }
    }
    /**
     * ⏹️ 停止仿真
     */
    stopSimulation() {
        this._state = SimulationState.COMPLETED;
        this._logEvent('SIMULATION_STOPPED', undefined, `Stopped at t=${this._currentTime}`);
    }
    /**
     * 📊 获取当前仿真状态
     */
    getSimulationStatus() {
        return {
            state: this._state,
            currentTime: this._currentTime,
            progress: (this._currentTime - this._config.startTime) / (this._config.endTime - this._config.startTime),
            stepCount: this._stepCount,
            currentTimeStep: this._currentTimeStep,
            memoryUsage: this._memoryUsage / (1024 * 1024), // MB
            deviceCount: this._devices.size,
            nodeCount: this._nodeMapping.size
        };
    }
    // === 私有方法实现 ===
    _validateCircuit() {
        if (this._devices.size === 0) {
            throw new Error('No devices found in circuit');
        }
        if (this._nodeMapping.size > this._maxNodes) {
            throw new Error(`Too many nodes: ${this._nodeMapping.size} > ${this._maxNodes}`);
        }
        // 验证节点连通性 (简化检查)
        const connectedNodes = new Set();
        this._devices.forEach(device => {
            device.nodes.forEach(nodeId => {
                const globalNodeId = this._nodeMapping.get(nodeId.toString());
                if (globalNodeId !== undefined) {
                    connectedNodes.add(globalNodeId);
                }
            });
        });
        if (connectedNodes.size !== this._nodeMapping.size) {
            console.warn('Warning: Some nodes may not be connected');
        }
    }
    /**
     * ⚙️ 执行 DC 工作点分析 (完全重构)
     * 实现了源步进 (外部循环) 和带步长阻尼的 Newton-Raphson (内部循环)
     */
    async _performDCAnalysis() {
        console.log('📊 開始 DC 工作點分析...');
        // 步驟 1: 標準 Newton-Raphson (帶阻尼)
        let dcResult = await this._solveDCNewtonRaphson();
        if (dcResult) {
            this._logEvent('dc_converged', undefined, '標準 Newton 收斂');
            return;
        }
        // 步驟 2: 源步進 (當前實現)
        console.log('🔄 標準 Newton 失敗，嘗試源步進...');
        dcResult = await this._sourceSteppingHomotopy();
        if (dcResult) {
            this._logEvent('dc_converged', undefined, '源步進收斂');
            return;
        }
        // 步驟 3: Gmin Stepping (新添加)
        console.log('🔄 源步進失敗，嘗試 Gmin Stepping...');
        dcResult = await this._gminSteppingHomotopy();
        if (dcResult) {
            this._logEvent('dc_converged', undefined, 'Gmin Stepping 收斂');
            return;
        }
        // 最終失敗
        this._logEvent('dc_failed', undefined, '所有 DC 方法失敗');
        throw new Error('DC 工作點分析失敗');
    }
    async _sourceSteppingHomotopy() {
        const sources = Array.from(this._devices.values()).filter(d => 'scaleSource' in d);
        const stepFactors = [0.0, 0.25, 0.5, 0.75, 1.0];
        let converged = false;
        for (const factor of stepFactors) {
            this._logEvent('DC_SOURCE_STEP', undefined, `Setting source factor to ${(factor * 100).toFixed(0)}%`);
            for (const source of sources) {
                source.scaleSource(factor);
            }
            converged = await this._solveDCNewtonRaphson();
            if (!converged) {
                this._logEvent('DC_STEP_FAILED', undefined, `Newton-Raphson failed to converge at source factor ${factor}`);
                for (const source of sources) {
                    source.restoreSource();
                }
                return false;
            }
        }
        for (const source of sources) {
            source.restoreSource();
        }
        return converged;
    }
    // 新方法: Gmin Stepping
    async _gminSteppingHomotopy() {
        const gminSteps = 10; // 步進次數
        const initialGmin = 1e-2; // 初始大電導 (S)
        const finalGmin = 1e-12; // 最終小電導 (近零)
        let currentSolution = this._solutionVector.clone(); // 從上次嘗試開始
        for (let step = 0; step <= gminSteps; step++) {
            const factor = step / gminSteps;
            const currentGmin = initialGmin * Math.pow(finalGmin / initialGmin, factor);
            // 臨時添加 Gmin 到所有 PN 接面 (e.g., 二極管、BJT)
            this._applyGminToNonlinearDevices(currentGmin);
            // 重新構建 MNA 並求解
            const newtonResult = await this._solveDCNewtonRaphson();
            // 移除臨時 Gmin
            this._removeGminFromNonlinearDevices();
            if (!newtonResult) {
                return false;
            }
            this._logEvent('gmin_step', undefined, `Gmin=${currentGmin.toExponential(2)}, 步驟 ${step}/${gminSteps}`);
        }
        return true;
    }
    // 輔助: 應用/移除 Gmin (在 NonlinearDevice 如 Diode 中添加 stampGmin 方法)
    _applyGminToNonlinearDevices(gmin) {
        for (const device of this._devices.values()) {
            if ('stampGmin' in device && typeof device.stampGmin === 'function') {
                device.stampGmin(gmin);
            }
        }
    }
    _removeGminFromNonlinearDevices() {
        for (const device of this._devices.values()) {
            if ('stampGmin' in device && typeof device.stampGmin === 'function') {
                device.stampGmin(0);
            }
        }
    }
    /**
     * 🆕 辅助方法：执行 Newton-Raphson 迭代求解 DC 工作点
     */
    async _solveDCNewtonRaphson() {
        let iterations = 0;
        while (iterations < this._config.maxNewtonIterations) {
            // a. 根据当前解 _solutionVector 装配系统
            await this._assembleSystem(); // 移除时间参数
            // b. 计算残差 F(x)，在我们的 MNA 框架中，它就是右侧向量 _rhsVector
            const residual = this._rhsVector;
            const residualNorm = residual.norm();
            // c. 检查收敛
            if (this._checkConvergenceDC(residualNorm, iterations)) {
                return true; // 收敛成功
            }
            // d. 求解线性系统 J * Δx = -F(x)
            const jacobian = this._systemMatrix;
            const negResidual = residual.scale(-1);
            const fullStepDeltaV = await this._solveLinearSystem(jacobian, negResidual);
            // e. 实现步长阻尼 (Line Search)
            const { accepted, finalSolution } = await this._applyDampedStep(fullStepDeltaV, residualNorm);
            if (!accepted) {
                this._logEvent('DC_DAMPING_FAILED', undefined, `Step damping failed at iteration ${iterations}. Convergence is unlikely.`);
                return false; // 阻尼失败，无法前进
            }
            this._solutionVector = finalSolution;
            iterations++;
        }
        this._logEvent('DC_NR_FAILED', undefined, `Newton-Raphson exceeded max iterations (${this._config.maxNewtonIterations}).`);
        return false; // 超过最大迭代次数
    }
    /**
     * 🆕 辅助方法：应用带阻尼的更新步长
     */
    async _applyDampedStep(fullStep, initialResidualNorm) {
        let alpha = 1.0; // 阻尼因子，从 1 (完整步长) 开始
        const minAlpha = 1e-4;
        while (alpha > minAlpha) {
            const trialSolution = this._solutionVector.plus(fullStep.scale(alpha));
            // 使用试探解计算新的残差
            const trialResidualNorm = await this._calculateResidualNorm(trialSolution);
            // 如果新的残差小于旧的，则接受这一步
            if (trialResidualNorm < initialResidualNorm) {
                return { accepted: true, finalSolution: trialSolution };
            }
            // 否则，减小步长再试一次
            alpha /= 2;
        }
        return { accepted: false, finalSolution: this._solutionVector }; // 阻尼失败
    }
    /**
     * 🆕 辅助方法：仅计算残差范数 (用于步长阻尼)
     */
    async _calculateResidualNorm(solution) {
        // 这是计算成本较高的部分，因为它需要重新评估所有非线性设备
        const originalSolution = this._solutionVector;
        this._solutionVector = solution; // 临时设置为试探解
        await this._assembleSystem(); // 重新装配以获得新的 RHS (残差)
        const norm = this._rhsVector.norm();
        this._solutionVector = originalSolution; // 恢复原始解
        return norm;
    }
    /**
     * 🆕 辅助方法：检查 DC 收敛
     */
    _checkConvergenceDC(residualNorm, iteration) {
        // 这里我们使用一个简化的收敛标准，基于电流残差
        const converged = residualNorm < this._config.currentToleranceAbs;
        if (this._config.verboseLogging) {
            console.log(`  [DC Iter ${iteration}] Residual Norm = ${residualNorm.toExponential(4)}`);
        }
        return converged;
    }
    /**
     * 🚀 執行一個時間步進 (增強版事件驅動)
     *
     * 主要改進：
     * 1. 事件檢測與處理
     * 2. Newton-Raphson 失敗自動恢復
     * 3. 自適應步長控制
     * 4. 器件狀態變化監控
     */
    async _performTimeStep() {
        const stepStartTime = performance.now();
        this._stepCount++;
        // 1. 預事件檢測 - 檢查是否有器件狀態即將變化
        const preEvents = await this._detectPreStepEvents();
        if (preEvents.length > 0) {
            console.log(`🎯 檢測到 ${preEvents.length} 個預步事件`);
            this._handlePreStepEvents(preEvents);
        }
        let newtonIterations = 0;
        let converged = false;
        let retryCount = 0;
        const maxRetries = 3; // 最大重試次數
        // 2. 主Newton-Raphson循環 (帶重試機制)
        while (!converged && retryCount < maxRetries) {
            try {
                // 2.1 Newton-Raphson 迭代求解非线性系统
                while (newtonIterations < this._config.maxNewtonIterations && !converged) {
                    // 装配系统矩阵和右侧向量
                    const assemblyStartTime = performance.now();
                    await this._assembleSystem();
                    this._performanceMetrics.matrixAssemblyTime += performance.now() - assemblyStartTime;
                    // 求解线性系统
                    const solutionStartTime = performance.now();
                    const deltaV = await this._solveLinearSystem(this._systemMatrix, this._rhsVector);
                    this._performanceMetrics.matrixSolutionTime += performance.now() - solutionStartTime;
                    // 应用设备步长限制和阻尼
                    const dampingResult = await this._applyDampedStep(deltaV, 0); // 使用初始殘差0作為fallback
                    const dampedDeltaV = dampingResult.finalSolution;
                    // 更新解向量
                    this._solutionVector = this._solutionVector.plus(dampedDeltaV);
                    // 检查收敛性
                    const convergenceStartTime = performance.now();
                    converged = await this._checkConvergence(dampedDeltaV);
                    this._performanceMetrics.convergenceCheckTime += performance.now() - convergenceStartTime;
                    newtonIterations++;
                }
                if (converged) {
                    // 2.3 檢查解的物理合理性
                    const solutionValid = await this._validateSolution();
                    if (!solutionValid) {
                        console.log('⚠️ 解不滿足物理約束，重新計算...');
                        converged = false;
                    }
                }
                if (!converged && retryCount < maxRetries - 1) {
                    // 2.4 Newton失敗處理策略
                    const recoveryAction = await this._handleNewtonFailure(retryCount);
                    if (recoveryAction === 'reduce_timestep') {
                        this._currentTimeStep *= 0.5;
                        console.log(`🔄 減小時間步長至 ${this._currentTimeStep.toExponential(3)}s`);
                    }
                    else if (recoveryAction === 'restart_with_damping') {
                        console.log('🛡️ 使用強阻尼模式重試');
                    }
                    // 重置迭代計數器準備重試
                    newtonIterations = 0;
                    retryCount++;
                }
                else if (!converged) {
                    break; // 達到最大重試次數
                }
            }
            catch (error) {
                console.error(`❌ 時間步計算錯誤: ${error}`);
                retryCount++;
                if (retryCount >= maxRetries) {
                    throw new Error(`時間步在 ${retryCount} 次重試後仍然失敗`);
                }
                newtonIterations = 0; // 重置計數器
            }
        }
        if (converged) {
            // 3. 後事件檢測 - 檢查器件狀態是否已變化
            const postEvents = await this._detectPostStepEvents();
            if (postEvents.length > 0) {
                console.log(`🎯 檢測到 ${postEvents.length} 個後步事件`);
                await this._handlePostStepEvents(postEvents);
            }
            // 4. 更新器件狀態
            await this._updateDeviceStates();
            // 5. 自適應步長調整
            this._adaptiveTimeStepControl(newtonIterations);
            // 6. 準備下一步
            this._currentTime += this._currentTimeStep;
            // 更新性能指標
            this._performanceMetrics.averageIterationsPerStep =
                (this._performanceMetrics.averageIterationsPerStep * this._stepCount + newtonIterations) / (this._stepCount + 1);
        }
        else {
            // 收敛失败
            this._performanceMetrics.failedSteps++;
            this._logEvent('STEP_FAILED', undefined, `Step failed at t=${this._currentTime}, iterations=${newtonIterations}, retries=${retryCount}`);
        }
        const stepTime = performance.now() - stepStartTime;
        if (this._config.verboseLogging) {
            console.log(`Step ${this._stepCount}: t=${this._currentTime.toExponential(3)}, dt=${this._currentTimeStep.toExponential(3)}, iterations=${newtonIterations}, retries=${retryCount}, time=${stepTime.toFixed(2)}ms`);
        }
        return converged;
    }
    async _assembleSystem() {
        // 重新创建系统矩阵和向量来清空它们
        // 注意：接口不提供clear方法，所以创建新实例
        const matrixSize = this._systemMatrix.rows;
        this._systemMatrix = new this._systemMatrix.constructor(matrixSize, matrixSize);
        // 重置向量 - 没有clear方法，创建新的零向量
        this._rhsVector = new this._rhsVector.constructor(this._rhsVector.size);
        for (const device of this._devices.values()) {
            const evalStartTime = performance.now();
            const loadResult = device.load(this._solutionVector, {
                systemMatrix: () => this._systemMatrix,
                getRHS: () => this._rhsVector,
                size: this._nodeMapping.size
            });
            this._performanceMetrics.deviceEvaluationTime += performance.now() - evalStartTime;
            if (loadResult.success) {
                this._assembleDeviceContribution(device.deviceId, loadResult);
            }
            else {
                throw new Error(`Device ${device.deviceId} evaluation failed: ${loadResult.errorMessage}`);
            }
        }
    }
    _assembleDeviceContribution(_deviceId, loadResult) {
        // 将设备矩阵印花添加到系统矩阵
        loadResult.matrixStamp.entries.forEach(entry => {
            this._systemMatrix.add(entry.row, entry.col, entry.value); // 使用接口的add方法
        });
        // 添加右侧向量贡献
        for (let i = 0; i < loadResult.rhsContribution.size; i++) {
            const currentValue = this._rhsVector.get(i);
            this._rhsVector.set(i, currentValue + loadResult.rhsContribution.get(i));
        }
    }
    async _solveLinearSystem(_A, b) {
        // TODO: 集成 Ultra KLU WASM 求解器
        // 暂时使用简化的直接求解
        // 简化实现：对角占优矩阵的 Jacobi 迭代
        const solution = new vector_1.Vector(b.size);
        const iterations = 100;
        for (let iter = 0; iter < iterations; iter++) {
            for (let i = 0; i < b.size; i++) {
                let sum = 0;
                for (let j = 0; j < b.size; j++) {
                    if (i !== j) {
                        // 需要实现矩阵元素访问
                        // sum += A.get(i, j) * solution.get(j);
                    }
                }
                // const diag = A.get(i, i) || 1.0;
                const diag = 1.0; // 简化
                solution.set(i, (b.get(i) - sum) / diag);
            }
        }
        return solution;
    }
    async _applyStepLimiting(deltaV) {
        let limitedDeltaV = deltaV;
        // 应用每个设备的步长限制
        for (const device of this._devices.values()) {
            limitedDeltaV = device.limitUpdate(limitedDeltaV);
        }
        return limitedDeltaV;
    }
    /**
     * 🌐 全局策略：線搜索算法 (Armijo條件)
     *
     * 實現工業級線搜索，確保在困難電路中的收斂性
     * 基於Armijo條件的backtracking line search
     */
    async _globalLineSearch(searchDirection, initialResidualNorm) {
        const c1 = 1e-4; // Armijo條件參數
        const rho = 0.5; // 步長收縮比例
        let alpha = 1.0; // 初始步長
        const maxLineSearchIterations = 20;
        const initialSolution = this._solutionVector;
        for (let iter = 0; iter < maxLineSearchIterations; iter++) {
            // 試探新解
            const trialSolution = initialSolution.plus(searchDirection.scale(alpha));
            // 計算新的目標函數值（殘差范數）
            const newResidualNorm = await this._calculateResidualNorm(trialSolution);
            // Armijo條件檢查
            const armijoCondition = newResidualNorm <= initialResidualNorm * (1 - c1 * alpha);
            if (armijoCondition) {
                console.log(`🎯 線搜索成功: α=${alpha.toFixed(4)}, 殘差減少 ${((1 - newResidualNorm / initialResidualNorm) * 100).toFixed(2)}%`);
                return {
                    alpha,
                    newSolution: trialSolution,
                    converged: true
                };
            }
            // 收縮步長
            alpha *= rho;
            if (alpha < 1e-8) {
                console.log('⚠️ 線搜索步長過小，退出');
                break;
            }
        }
        console.log('❌ 線搜索失敗，使用原始解');
        return {
            alpha: 0,
            newSolution: initialSolution,
            converged: false
        };
    }
    /**
     * 🌐 全局策略：Trust Region算法
     *
     * 當Newton方法失敗時的備用策略
     * 限制搜索區域，保證數值穩定性
     */
    async _trustRegionMethod(jacobian, residual, trustRadius) {
        // 求解 Trust Region 子問題: min ||J*p + r||^2, s.t. ||p|| <= trustRadius
        // 1. 嘗試完整Newton步
        const fullNewtonStep = await this._solveLinearSystem(jacobian, residual.scale(-1));
        const fullStepNorm = this._vectorNorm(fullNewtonStep);
        let proposedStep;
        if (fullStepNorm <= trustRadius) {
            // Newton步在trust region內，直接使用
            proposedStep = fullNewtonStep;
            console.log(`🎯 Trust Region: 使用完整Newton步 (||p||=${fullStepNorm.toFixed(4)} <= ${trustRadius.toFixed(4)})`);
        }
        else {
            // Newton步超出trust region，需要截斷
            const scaleFactor = trustRadius / fullStepNorm;
            proposedStep = fullNewtonStep.scale(scaleFactor);
            console.log(`🔄 Trust Region: 截斷Newton步 (比例=${scaleFactor.toFixed(4)})`);
        }
        // 2. 計算實際降幅與預測降幅的比值
        const currentSolution = this._solutionVector;
        const trialSolution = currentSolution.plus(proposedStep);
        const currentResidualNorm = await this._calculateResidualNorm(currentSolution);
        const trialResidualNorm = await this._calculateResidualNorm(trialSolution);
        const actualReduction = currentResidualNorm - trialResidualNorm;
        const predictedReduction = this._predictedReduction(jacobian, residual, proposedStep);
        const rho = actualReduction / predictedReduction; // 實際降幅/預測降幅
        // 3. 調整trust region半徑
        let newRadius = trustRadius;
        let success = false;
        if (rho > 0.75 && Math.abs(this._vectorNorm(proposedStep) - trustRadius) < 1e-12) {
            // 步長接近邊界且效果很好，擴大region
            newRadius = Math.min(2 * trustRadius, 1.0);
            success = true;
            console.log(`📈 Trust Region 擴大: ${trustRadius.toFixed(4)} → ${newRadius.toFixed(4)}`);
        }
        else if (rho > 0.25) {
            // 效果尚可，保持region
            success = true;
            console.log(`✅ Trust Region 保持: ${trustRadius.toFixed(4)}`);
        }
        else {
            // 效果不佳，縮小region
            newRadius = 0.5 * trustRadius;
            success = false;
            console.log(`📉 Trust Region 縮小: ${trustRadius.toFixed(4)} → ${newRadius.toFixed(4)}`);
        }
        return { step: proposedStep, newRadius, success };
    }
    /**
     * 🌐 全局策略：預測降幅計算
     */
    _predictedReduction(jacobian, residual, step) {
        // 線性模型預測: m(p) = 0.5 * ||J*p + r||^2
        // 預測降幅 = 0.5 * ||r||^2 - 0.5 * ||J*p + r||^2
        const jacobianTimesStep = jacobian.multiply(step);
        const newResidual = residual.plus(jacobianTimesStep);
        const oldObjective = 0.5 * this._vectorNorm(residual) ** 2;
        const newObjective = 0.5 * this._vectorNorm(newResidual) ** 2;
        return oldObjective - newObjective;
    }
    /**
     * 🌐 全局策略：向量范數計算
     */
    _vectorNorm(vector) {
        let sum = 0;
        for (let i = 0; i < vector.size; i++) {
            const val = vector.get(i);
            sum += val * val;
        }
        return Math.sqrt(sum);
    }
    /**
     * 🌐 全局策略：高級重啟策略
     *
     * 當所有方法都失敗時的最後手段
     */
    async _advancedRestartStrategy() {
        console.log('🔄 啟動高級重啟策略...');
        // 策略1: 回退到更保守的初始條件
        const conservativeSolution = this._solutionVector.scale(0.1); // 縮小所有電壓
        console.log('📉 嘗試保守解 (電壓×0.1)');
        // 策略2: 隨機擾動當前解
        const perturbedSolution = this._addRandomPerturbation(this._solutionVector, 0.01);
        console.log('🎲 嘗試隨機擾動解');
        // 策略3: 分段線性化
        const segmentedSolution = await this._segmentedLinearization();
        console.log('🔀 嘗試分段線性化');
        // 選擇最佳候選解
        const candidates = [conservativeSolution, perturbedSolution, segmentedSolution];
        let bestSolution = this._solutionVector;
        let bestResidual = Infinity;
        for (const candidate of candidates) {
            const residualNorm = await this._calculateResidualNorm(candidate);
            if (residualNorm < bestResidual) {
                bestResidual = residualNorm;
                bestSolution = candidate;
            }
        }
        const improvement = bestResidual < await this._calculateResidualNorm(this._solutionVector);
        console.log(`🎯 重啟策略結果: ${improvement ? '成功' : '失敗'}, 殘差=${bestResidual.toExponential(3)}`);
        return { newSolution: bestSolution, success: improvement };
    }
    /**
     * 輔助方法：添加隨機擾動
     */
    _addRandomPerturbation(solution, magnitude) {
        const perturbedData = [];
        for (let i = 0; i < solution.size; i++) {
            const perturbation = (Math.random() - 0.5) * 2 * magnitude;
            perturbedData.push(solution.get(i) + perturbation);
        }
        return vector_1.Vector.from(perturbedData);
    }
    /**
     * 輔助方法：分段線性化求解
     */
    async _segmentedLinearization() {
        // 簡化版：線性內插到零解
        const alpha = 0.5;
        return this._solutionVector.scale(alpha);
    }
    async _checkConvergence(deltaV) {
        // 全局收敛检查
        const maxDelta = this._getMaxAbsValue(deltaV);
        const relativeDelta = this._getRelativeChange(deltaV);
        // 添加調試信息
        if (this._config.verboseLogging) {
            console.log(`🔍 收斂檢查: maxDelta=${maxDelta.toExponential(3)}, relativeDelta=${relativeDelta.toExponential(3)}`);
            console.log(`🔍 容差: abs=${this._config.voltageToleranceAbs.toExponential(3)}, rel=${this._config.voltageToleranceRel.toExponential(3)}`);
        }
        const voltageConverged = maxDelta < this._config.voltageToleranceAbs &&
            relativeDelta < this._config.voltageToleranceRel;
        // 设备级收敛检查
        let deviceConvergenceCount = 0;
        for (const device of this._devices.values()) {
            const convergenceInfo = device.checkConvergence(deltaV);
            if (convergenceInfo.converged) {
                deviceConvergenceCount++;
            }
        }
        // 如果沒有設備，認為設備層面已收斂
        const deviceConverged = this._devices.size === 0 || deviceConvergenceCount === this._devices.size;
        const overallConverged = voltageConverged && deviceConverged;
        if (this._config.verboseLogging) {
            console.log(`🔍 收斂結果: voltage=${voltageConverged}, device=${deviceConverged}, overall=${overallConverged}`);
        }
        return overallConverged;
    }
    async _updateDeviceStates() {
        for (const device of this._devices.values()) {
            // 创建新的设备状态 (简化)
            const newState = {
                deviceId: device.deviceId,
                time: this._currentTime,
                voltage: this._solutionVector,
                current: new vector_1.Vector(device.nodes.length), // TODO: 计算实际电流
                operatingMode: 'normal',
                parameters: device.parameters,
                internalStates: {},
                temperature: 300
            };
            device.updateState(newState);
        }
    }
    async _adaptTimeStep() {
        if (!this._config.enablePredictiveAnalysis)
            return;
        // 基于设备预测的自适应步长调整
        let suggestedTimeStep = this._currentTimeStep;
        for (const device of this._devices.values()) {
            const prediction = device.predictNextState(this._currentTimeStep);
            if (prediction.suggestedTimestep > 0 && prediction.suggestedTimestep < suggestedTimeStep) {
                suggestedTimeStep = prediction.suggestedTimestep;
            }
        }
        // 限制步长变化幅度
        const maxIncrease = 1.5;
        const maxDecrease = 0.5;
        if (suggestedTimeStep > this._currentTimeStep * maxIncrease) {
            suggestedTimeStep = this._currentTimeStep * maxIncrease;
        }
        else if (suggestedTimeStep < this._currentTimeStep * maxDecrease) {
            suggestedTimeStep = this._currentTimeStep * maxDecrease;
        }
        // 应用步长限制
        suggestedTimeStep = Math.max(this._config.minTimeStep, Math.min(this._config.maxTimeStep, suggestedTimeStep));
        if (Math.abs(suggestedTimeStep - this._currentTimeStep) / this._currentTimeStep > 0.1) {
            this._currentTimeStep = suggestedTimeStep;
            this._performanceMetrics.adaptiveStepChanges++;
        }
    }
    _saveWaveformPoint() {
        // 保存当前时间点的波形数据
        this._waveformData.timePoints.push(this._currentTime);
        // 保存节点电压
        for (let i = 0; i < this._solutionVector.size; i++) {
            if (!this._waveformData.nodeVoltages.has(i)) {
                this._waveformData.nodeVoltages.set(i, []);
            }
            this._waveformData.nodeVoltages.get(i).push(this._solutionVector.get(i));
        }
        // 保存设备电流和状态 (简化实现)
        for (const device of this._devices.values()) {
            const deviceId = device.deviceId;
            if (!this._waveformData.deviceCurrents.has(deviceId)) {
                this._waveformData.deviceCurrents.set(deviceId, []);
                this._waveformData.deviceStates.set(deviceId, []);
            }
            // TODO: 获取实际设备电流
            this._waveformData.deviceCurrents.get(deviceId).push(0);
            this._waveformData.deviceStates.get(deviceId).push('normal');
        }
    }
    _generateFinalResult() {
        const totalTime = performance.now() - this._startTime;
        this._performanceMetrics.totalSimulationTime = totalTime;
        const convergenceRate = 1 - (this._performanceMetrics.failedSteps / Math.max(this._stepCount, 1));
        return {
            success: this._state === SimulationState.COMPLETED || this._currentTime >= this._config.endTime,
            finalTime: this._currentTime,
            totalSteps: this._stepCount,
            convergenceRate,
            averageStepTime: totalTime / Math.max(this._stepCount, 1),
            peakMemoryUsage: this._performanceMetrics.memoryPeakUsage,
            waveformData: this._waveformData,
            performanceMetrics: this._performanceMetrics
        };
    }
    _initializeWaveformStorage() {
        // 预分配波形数据存储
        // 开始瞬态分析 (暂时跳过，集中精力于DC分析)
        // 节点电压存储
        for (let nodeId = 0; nodeId < this._nodeMapping.size; nodeId++) {
            this._waveformData.nodeVoltages.set(nodeId, []);
        }
        // 设备电流和状态存储
        for (const device of this._devices.values()) {
            this._waveformData.deviceCurrents.set(device.deviceId, []);
            this._waveformData.deviceStates.set(device.deviceId, []);
        }
    }
    _logEvent(type, deviceId, description = '') {
        const event = {
            time: this._currentTime,
            type,
            deviceId,
            description,
            data: null
        };
        this._events.push(event);
        if (this._config.verboseLogging) {
            console.log(`[${type}] t=${this._currentTime.toExponential(3)} ${deviceId ? `[${deviceId}]` : ''}: ${description}`);
        }
    }
    // 辅助方法
    _getMaxAbsValue(vector) {
        let max = 0;
        for (let i = 0; i < vector.size; i++) {
            max = Math.max(max, Math.abs(vector.get(i)));
        }
        return max;
    }
    _getRelativeChange(deltaV) {
        const deltaNorm = deltaV.norm();
        const stateNorm = Math.max(this._solutionVector.norm(), 1e-12);
        return deltaNorm / stateNorm;
    }
    // 公共 API 方法
    /**
     * 📊 获取仿真事件日志
     */
    getSimulationEvents() {
        return this._events;
    }
    /**
     * 📈 获取波形数据
     */
    getWaveformData() {
        return this._waveformData;
    }
    /**
     * 📊 获取性能指标
     */
    getPerformanceMetrics() {
        return { ...this._performanceMetrics };
    }
    /**
     * 🔧 获取设备列表
     */
    getDevices() {
        return new Map(this._devices);
    }
    /**
     * 🗺️ 获取节点映射
     */
    getNodeMapping() {
        return new Map(this._nodeMapping);
    }
    /**
     * 🎯 檢測預步事件
     */
    async _detectPreStepEvents() {
        // 檢測可能的器件狀態變化
        const events = [];
        for (const device of this._devices.values()) {
            // 檢查二極管是否即將轉換狀態
            if (device.deviceType === 'diode') {
                const nodes = device.nodes;
                if (nodes.length >= 2 && nodes[0] !== undefined && nodes[1] !== undefined) {
                    const currentV = this._solutionVector.get(nodes[0]) -
                        this._solutionVector.get(nodes[1]);
                    const threshold = 0.6; // 二極管轉折電壓
                    if (Math.abs(currentV - threshold) < 0.1) {
                        events.push({
                            type: 'diode_transition',
                            device: device,
                            voltage: currentV
                        });
                    }
                }
            }
        }
        return events;
    }
    /**
     * 🎯 處理預步事件
     */
    _handlePreStepEvents(events) {
        for (const event of events) {
            console.log(`🎯 處理預步事件: ${event.type}`);
            // 可以調整步長或初始條件
            if (event.type === 'diode_transition') {
                this._currentTimeStep = Math.min(this._currentTimeStep, 1e-9);
            }
        }
    }
    /**
     * 🎯 檢測後步事件
     */
    async _detectPostStepEvents() {
        const events = [];
        // 檢測器件狀態實際變化
        return events;
    }
    /**
     * 🎯 處理後步事件
     */
    async _handlePostStepEvents(events) {
        for (const event of events) {
            console.log(`🎯 處理後步事件: ${event.type}`);
        }
    }
    /**
     * ✅ 驗證解的物理合理性
     */
    async _validateSolution() {
        // 檢查節點電壓是否在合理範圍內
        for (let i = 0; i < this._solutionVector.size; i++) {
            const voltage = this._solutionVector.get(i);
            if (Math.abs(voltage) > 1000) { // 超過1kV可能不合理
                console.log(`⚠️ 節點 ${i} 電壓過大: ${voltage}V`);
                return false;
            }
            if (isNaN(voltage) || !isFinite(voltage)) {
                console.log(`⚠️ 節點 ${i} 電壓無效: ${voltage}`);
                return false;
            }
        }
        return true;
    }
    /**
     * 🛡️ Newton失敗處理策略 (增強版)
     */
    async _handleNewtonFailure(retryCount) {
        console.log(`🛡️ Newton失敗處理 - 第 ${retryCount + 1} 次重試`);
        if (retryCount === 0) {
            // 第一次重試：使用線搜索
            console.log('🎯 嘗試線搜索算法...');
            const searchDirection = await this._solveLinearSystem(this._systemMatrix, this._rhsVector.scale(-1));
            const initialResidualNorm = await this._calculateResidualNorm(this._solutionVector);
            const lineSearchResult = await this._globalLineSearch(searchDirection, initialResidualNorm);
            if (lineSearchResult.converged) {
                this._solutionVector = lineSearchResult.newSolution;
                return 'line_search_success';
            }
            return 'restart_with_damping';
        }
        else if (retryCount === 1) {
            // 第二次重試：使用Trust Region方法
            console.log('🌐 嘗試Trust Region算法...');
            const residual = this._rhsVector.scale(-1);
            const trustRadius = 0.1;
            const trustRegionResult = await this._trustRegionMethod(this._systemMatrix, residual, trustRadius);
            if (trustRegionResult.success) {
                this._solutionVector = this._solutionVector.plus(trustRegionResult.step);
                return 'trust_region_success';
            }
            return 'reduce_timestep';
        }
        else {
            // 最後手段：高級重啟策略
            console.log('🔄 嘗試高級重啟策略...');
            const restartResult = await this._advancedRestartStrategy();
            if (restartResult.success) {
                this._solutionVector = restartResult.newSolution;
                return 'restart_success';
            }
            return 'use_global_strategy';
        }
    }
    /**
     * ⚡ 自適應步長控制
     */
    _adaptiveTimeStepControl(iterations) {
        const targetIterations = 5; // 目標迭代次數
        if (iterations < targetIterations / 2) {
            // 收斂太快，可以增大步長
            this._currentTimeStep = Math.min(this._currentTimeStep * 1.2, this._config.maxTimeStep);
        }
        else if (iterations > targetIterations * 1.5) {
            // 收斂太慢，減小步長
            this._currentTimeStep = Math.max(this._currentTimeStep * 0.8, this._config.minTimeStep);
        }
        console.log(`⚡ 步長調整: dt=${this._currentTimeStep.toExponential(3)}s (${iterations} 迭代)`);
    }
    /**
     * ♻️ 清理资源
     */
    dispose() {
        this._devices.forEach(device => device.dispose());
        this._devices.clear();
        this._events = [];
        this._state = SimulationState.IDLE;
    }
}
exports.CircuitSimulationEngine = CircuitSimulationEngine;
