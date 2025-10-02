/**
 * 狀態空間ODE求解器 - 極致性能的電路模擬引擎
 * 
 * 核心思想：基於預編譯的狀態空間矩陣進行純ODE積分
 * 
 * 運行時算法：
 * 1. x'(t) = A*x(t) + B*u(t)  <- 一次GEMV操作
 * 2. x(t+dt) = 積分器(x'(t))   <- 標準ODE積分 
 * 3. y(t) = C*x(t) + D*u(t)   <- 輸出計算
 */

import { Matrix, Vector } from './linalg.js';
import { StateSpaceCompiler } from './state-space-compiler.js';

/**
 * GPU加速的矩陣運算接口 (CPU後備實現)
 */
class GPUMatrixOps {
    constructor() {
        this.useGPU = false;  // 目前使用CPU實現
    }
    
    /**
     * 初始化GPU上下文
     */
    async initialize() {
        console.log('GPU矩陣運算：使用CPU後備實現');
        this.useGPU = false;
        return true;
    }
    
    /**
     * 矩陣-向量乘法：y = A*x + B*u
     */
    gemv(A, x, B, u, y, numStates, numInputs) {
        // CPU實現：y = A*x + B*u
        
        // 第一部分：y = A*x
        for (let i = 0; i < numStates; i++) {
            let sum = 0;
            for (let j = 0; j < numStates; j++) {
                sum += A[i * numStates + j] * x[j];
            }
            y[i] = sum;
        }
        
        // 第二部分：y += B*u
        for (let i = 0; i < numStates; i++) {
            for (let j = 0; j < numInputs; j++) {
                y[i] += B[i * numInputs + j] * u[j];
            }
        }
    }
    
    /**
     * 輸出計算：y = C*x + D*u
     */
    gemvOutput(C, x, D, u, y, numOutputs, numStates, numInputs) {
        // 第一部分：y = C*x
        for (let i = 0; i < numOutputs; i++) {
            let sum = 0;
            for (let j = 0; j < numStates; j++) {
                sum += C[i * numStates + j] * x[j];
            }
            y[i] = sum;
        }
        
        // 第二部分：y += D*u
        for (let i = 0; i < numOutputs; i++) {
            for (let j = 0; j < numInputs; j++) {
                y[i] += D[i * numInputs + j] * u[j];
            }
        }
    }
}

/**
 * 高精度ODE積分器
 */
class ODEIntegrator {
    constructor() {
        this.method = 'rk4';  // 'euler', 'rk4'
        
        // 工作緩衝區
        this.k1 = null;
        this.k2 = null;  
        this.k3 = null;
        this.k4 = null;
        this.tempState = null;
    }
    
    /**
     * 初始化積分器
     */
    initialize(numStates, numInputs) {
        // 分配工作緩衝區
        this.k1 = new Float32Array(numStates);
        this.k2 = new Float32Array(numStates);
        this.k3 = new Float32Array(numStates);
        this.k4 = new Float32Array(numStates);
        this.tempState = new Float32Array(numStates);
        
        console.log(`ODE積分器初始化：${this.method}方法，${numStates}個狀態`);
    }
    
    /**
     * 單步積分
     */
    step(derivativeFunction, x, u, t, dt) {
        switch (this.method) {
            case 'euler':
                return this.forwardEuler(derivativeFunction, x, u, t, dt);
            case 'rk4':
                return this.rungeKutta4(derivativeFunction, x, u, t, dt);
            default:
                throw new Error(`未支持的積分方法: ${this.method}`);
        }
    }
    
    /**
     * 前向歐拉法
     */
    forwardEuler(f, x, u, t, dt) {
        // 計算導數 k1 = f(x, u, t)
        f(x, u, t, this.k1);
        
        // 更新狀態：x = x + dt*k1
        for (let i = 0; i < x.length; i++) {
            x[i] += dt * this.k1[i];
        }
        
        return x;
    }
    
    /**
     * 四階龍格-庫塔法 (RK4)
     */
    rungeKutta4(f, x, u, t, dt) {
        const n = x.length;
        
        // k1 = f(x, u, t)
        f(x, u, t, this.k1);
        
        // 準備 x + dt/2*k1
        for (let i = 0; i < n; i++) {
            this.tempState[i] = x[i] + 0.5 * dt * this.k1[i];
        }
        
        // k2 = f(x + dt/2*k1, u, t + dt/2)
        f(this.tempState, u, t + 0.5 * dt, this.k2);
        
        // 準備 x + dt/2*k2
        for (let i = 0; i < n; i++) {
            this.tempState[i] = x[i] + 0.5 * dt * this.k2[i];
        }
        
        // k3 = f(x + dt/2*k2, u, t + dt/2)
        f(this.tempState, u, t + 0.5 * dt, this.k3);
        
        // 準備 x + dt*k3
        for (let i = 0; i < n; i++) {
            this.tempState[i] = x[i] + dt * this.k3[i];
        }
        
        // k4 = f(x + dt*k3, u, t + dt)
        f(this.tempState, u, t + dt, this.k4);
        
        // 最終更新：x = x + dt/6*(k1 + 2*k2 + 2*k3 + k4)
        for (let i = 0; i < n; i++) {
            x[i] += (dt / 6.0) * (this.k1[i] + 2*this.k2[i] + 2*this.k3[i] + this.k4[i]);
        }
        
        return x;
    }
    
    /**
     * 設置積分方法
     */
    setMethod(method) {
        const validMethods = ['euler', 'rk4'];
        if (!validMethods.includes(method)) {
            throw new Error(`無效的積分方法: ${method}`);
        }
        this.method = method;
    }
}

/**
 * 狀態空間ODE求解器主類
 */
export class StateSpaceODESolver {
    constructor() {
        // 狀態空間數據
        this.matrices = null;
        this.gpuBuffers = null;
        
        // 計算引擎
        this.gpuOps = new GPUMatrixOps();
        this.integrator = new ODEIntegrator();
        
        // 仿真狀態
        this.currentTime = 0;
        this.timeStep = 1e-6;
        this.stateVector = null;
        this.inputVector = null;
        this.outputVector = null;
        this.stateDerivative = null;
        
        // 輸入更新函數
        this.inputUpdateFunction = null;
        
        // 性能統計
        this.stats = {
            totalSteps: 0,
            totalComputeTime: 0,
            averageStepTime: 0,
            stepsPerSecond: 0
        };
        
        // 選項
        this.options = {
            integrationMethod: 'rk4',
            debug: false
        };
    }
    
    /**
     * 初始化求解器
     */
    async initialize(matrices, options = {}) {
        console.log('🚀 初始化狀態空間ODE求解器...');
        
        // 保存狀態空間數據
        this.matrices = matrices;
        Object.assign(this.options, options);
        
        // 初始化GPU運算
        await this.gpuOps.initialize();
        
        // 創建GPU緩衝區
        this.gpuBuffers = matrices.createGPUBuffers();
        
        // 初始化積分器
        this.integrator.setMethod(this.options.integrationMethod);
        this.integrator.initialize(matrices.numStates, matrices.numInputs);
        
        // 分配工作向量
        this.stateVector = new Float32Array(this.gpuBuffers.initialStates);
        this.inputVector = new Float32Array(matrices.numInputs);
        this.outputVector = new Float32Array(matrices.numOutputs);  
        this.stateDerivative = new Float32Array(matrices.numStates);
        
        // 設置初始輸入值
        for (let i = 0; i < matrices.inputVariables.length; i++) {
            const inputVar = matrices.inputVariables[i];
            this.inputVector[i] = inputVar.value;
        }
        
        console.log(`✅ 求解器初始化完成: ${matrices.numStates}狀態, ${matrices.numInputs}輸入, ${matrices.numOutputs}輸出`);
        
        return true;
    }
    
    /**
     * 設置輸入更新函數
     */
    setInputUpdateFunction(updateFunction) {
        this.inputUpdateFunction = updateFunction;
    }
    
    /**
     * 執行單步仿真
     */
    step(dt = null) {
        const stepStartTime = performance.now();
        const actualDt = dt || this.timeStep;
        
        // 1. 更新輸入向量
        if (this.inputUpdateFunction) {
            this.inputUpdateFunction(this.currentTime, this.inputVector);
        }
        
        // 2. 執行ODE積分
        this.integrator.step(
            this.computeStateDerivative.bind(this),
            this.stateVector,
            this.inputVector,
            this.currentTime,
            actualDt
        );
        
        // 3. 計算輸出
        this.computeOutput();
        
        // 4. 更新統計
        this.currentTime += actualDt;
        this.stats.totalSteps++;
        
        const stepTime = performance.now() - stepStartTime;
        this.stats.totalComputeTime += stepTime;
        this.stats.averageStepTime = this.stats.totalComputeTime / this.stats.totalSteps;
        this.stats.stepsPerSecond = 1000 / this.stats.averageStepTime;
        
        return this.getCurrentStepResult();
    }
    
    /**
     * 計算狀態導數：x' = A*x + B*u
     */
    computeStateDerivative(x, u, t, xDot) {
        this.gpuOps.gemv(
            this.gpuBuffers.matrixA,
            x,
            this.gpuBuffers.matrixB,
            u,
            xDot,
            this.matrices.numStates,
            this.matrices.numInputs
        );
    }
    
    /**
     * 計算輸出：y = C*x + D*u
     */
    computeOutput() {
        this.gpuOps.gemvOutput(
            this.gpuBuffers.matrixC,
            this.stateVector,
            this.gpuBuffers.matrixD,
            this.inputVector,
            this.outputVector,
            this.matrices.numOutputs,
            this.matrices.numStates,
            this.matrices.numInputs
        );
    }
    
    /**
     * 獲取當前步結果
     */
    getCurrentStepResult() {
        // 構建節點電壓對象
        const nodeVoltages = {};
        nodeVoltages['0'] = 0;
        nodeVoltages['gnd'] = 0;
        
        // 從輸出向量中提取節點電壓
        for (let i = 0; i < this.matrices.outputVariables.length; i++) {
            const output = this.matrices.outputVariables[i];
            
            if (output.type === 'node_voltage') {
                const nodeName = this.matrices.nodeNames[output.node1];
                nodeVoltages[nodeName] = this.outputVector[i];
            }
        }
        
        // 構建狀態變量Map
        const stateVariables = new Map();
        for (let i = 0; i < this.matrices.stateVariables.length; i++) {
            const stateVar = this.matrices.stateVariables[i];
            stateVariables.set(stateVar.componentName, this.stateVector[i]);
        }
        
        return {
            time: this.currentTime,
            timeStep: this.timeStep,
            nodeVoltages: nodeVoltages,
            stateVariables: stateVariables,
            converged: true,
            
            // 額外信息
            stateVector: Array.from(this.stateVector),
            inputVector: Array.from(this.inputVector),
            outputVector: Array.from(this.outputVector),
            stats: { ...this.stats }
        };
    }
    
    /**
     * 執行完整的時域仿真
     */
    async run(startTime = 0, stopTime = 1e-3, timeStep = null, inputFunction = null) {
        const actualTimeStep = timeStep || this.timeStep;
        this.timeStep = actualTimeStep;
        
        console.log(`🏃 開始狀態空間仿真: ${startTime}s → ${stopTime}s, dt=${actualTimeStep}s`);
        
        // 設置輸入函數
        if (inputFunction) {
            this.setInputUpdateFunction((t, u) => {
                const inputs = inputFunction(t);
                for (let i = 0; i < this.matrices.inputVariables.length; i++) {
                    const inputVar = this.matrices.inputVariables[i];
                    if (inputs.hasOwnProperty(inputVar.componentName)) {
                        u[i] = inputs[inputVar.componentName];
                    }
                }
            });
        }
        
        // 初始化結果容器
        const results = {
            timeVector: [],
            nodeVoltages: {},
            stateVariables: {},
            stats: null
        };
        
        // 初始化結果數組
        for (const nodeName of this.matrices.nodeNames) {
            results.nodeVoltages[nodeName] = [];
        }
        for (const stateVar of this.matrices.stateVariables) {
            results.stateVariables[stateVar.componentName] = [];
        }
        
        // 重置仿真狀態
        this.currentTime = startTime;
        this.stateVector.set(this.gpuBuffers.initialStates);
        this.stats = { totalSteps: 0, totalComputeTime: 0, averageStepTime: 0, stepsPerSecond: 0 };
        
        const totalSteps = Math.ceil((stopTime - startTime) / actualTimeStep);
        let stepCount = 0;
        const simulationStartTime = performance.now();
        
        // 記錄初始條件
        const initialResult = this.getCurrentStepResult();
        this.recordTimePoint(results, initialResult);
        
        // 主仿真循環
        while (this.currentTime < stopTime) {
            const stepResult = this.step(actualTimeStep);
            this.recordTimePoint(results, stepResult);
            
            stepCount++;
            
            // 進度報告
            if (stepCount % Math.max(1, Math.floor(totalSteps / 10)) === 0) {
                const progress = (stepCount / totalSteps) * 100;
                console.log(`   進度: ${progress.toFixed(1)}% | ${this.stats.stepsPerSecond.toFixed(0)} steps/s`);
            }
        }
        
        const simulationTime = performance.now() - simulationStartTime;
        
        // 最終統計
        results.stats = {
            ...this.stats,
            totalSimulationTime: simulationTime,
            actualTimeSteps: stepCount,
            simulationSpeedup: (stopTime - startTime) * 1000 / simulationTime,
            averageStepsPerSecond: stepCount / (simulationTime / 1000)
        };
        
        console.log(`✅ 狀態空間仿真完成！`);
        console.log(`   性能: ${results.stats.averageStepsPerSecond.toFixed(0)} steps/s`);
        console.log(`   加速比: ${results.stats.simulationSpeedup.toFixed(1)}x`);
        
        return results;
    }
    
    /**
     * 記錄時間點數據
     */
    recordTimePoint(results, stepResult) {
        results.timeVector.push(stepResult.time);
        
        // 記錄節點電壓
        for (const [nodeName, voltage] of Object.entries(stepResult.nodeVoltages)) {
            if (results.nodeVoltages.hasOwnProperty(nodeName)) {
                results.nodeVoltages[nodeName].push(voltage);
            }
        }
        
        // 記錄狀態變量  
        for (const [componentName, value] of stepResult.stateVariables) {
            if (results.stateVariables.hasOwnProperty(componentName)) {
                results.stateVariables[componentName].push(value);
            }
        }
    }
    
    /**
     * 設置時間步長
     */
    setTimeStep(dt) {
        if (dt <= 0) {
            throw new Error('時間步長必須大於零');
        }
        this.timeStep = dt;
    }
    
    /**
     * 設置積分方法
     */
    setIntegrationMethod(method) {
        this.options.integrationMethod = method;
        this.integrator.setMethod(method);
    }
    
    /**
     * 設置調試模式
     */
    setDebug(enabled) {
        this.options.debug = enabled;
    }
    
    /**
     * 獲取性能統計
     */
    getStats() {
        return { ...this.stats };
    }
}

/**
 * 工廠函數：自動編譯+求解的便利接口
 */
export async function createStateSpaceSolver(components, simulationOptions = {}) {
    console.log('🏭 創建狀態空間求解器 (自動編譯)...');
    
    // 階段1：編譯電路
    const compiler = new StateSpaceCompiler();
    compiler.setDebug(simulationOptions.debug || false);
    
    const matrices = await compiler.compile(components, {
        includeNodeVoltages: true,
        includeBranchCurrents: simulationOptions.includeBranchCurrents || false,
        debug: simulationOptions.debug || false
    });
    
    // 階段2：創建求解器
    const solver = new StateSpaceODESolver();
    
    await solver.initialize(matrices, {
        integrationMethod: simulationOptions.integrationMethod || 'rk4',
        debug: simulationOptions.debug || false
    });
    
    // 設置時間步長
    if (simulationOptions.timeStep) {
        solver.setTimeStep(simulationOptions.timeStep);
    }
    
    // 階段3：自動設置輸入函數
    solver.setInputUpdateFunction((t, u) => {
        for (let i = 0; i < matrices.inputVariables.length; i++) {
            const inputVar = matrices.inputVariables[i];
            
            // 根據輸入變量類型設置值
            if (inputVar.type === 'voltage') {
                u[i] = inputVar.parameter || 0;  // 使用預設電壓值
            } else if (inputVar.type === 'current') {
                u[i] = inputVar.parameter || 0;  // 使用預設電流值
            }
        }
    });
    
    console.log('🎯 狀態空間求解器創建完成！');
    
    return solver;
}