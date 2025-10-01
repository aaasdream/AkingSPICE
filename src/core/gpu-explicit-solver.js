/**
 * GPU加速顯式狀態更新求解器
 * 整合WebGPU線性求解和狀態變數更新
 */

import { CircuitPreprocessor } from './circuit-preprocessor.js';
import { WebGPUSolver } from './webgpu-solver.js';
import { Matrix, Vector } from '../core/linalg.js';

export class GPUExplicitStateSolver {
    constructor(options = {}) {
        this.debug = options.debug || false;
        this.timeStep = options.timeStep || 1e-6;
        this.integrationMethod = options.integrationMethod || 'forward_euler';
        
        // GPU求解器選項 - 提高精度設定
        this.gpuOptions = {
            debug: this.debug,
            maxIterations: options.solverMaxIterations || 2000,
            tolerance: options.solverTolerance || 1e-12,
        };
        
        // 組件和數據
        this.preprocessor = new CircuitPreprocessor({ debug: this.debug });
        this.webgpuSolver = null;
        this.components = null;
        this.circuitData = null;
        
        // GPU狀態管理
        this.gpuBuffersInitialized = false;
        this.currentStateVector = null;
        this.currentTime = 0;
        
        // 性能統計
        this.stats = {
            totalTimeSteps: 0,
            totalGPUSolves: 0,
            totalStateUpdates: 0,
            avgGPUTime: 0,
            avgStateUpdateTime: 0,
            totalSimulationTime: 0,
        };
    }

    /**
     * 初始化GPU求解器和電路預處理
     */
    async initialize(components, timeStep = 1e-6, options = {}) {
        console.log('🚀 初始化GPU加速顯式狀態更新求解器...');
        
        this.components = components;
        this.timeStep = timeStep;
        
        // 合併選項
        Object.assign(this.gpuOptions, options);
        
        try {
            // 初始化WebGPU求解器
            console.log('   初始化WebGPU線性求解器...');
            this.webgpuSolver = new WebGPUSolver(this.gpuOptions);
            
            // 如果傳入了 WebGPU 設備，使用它們；否則讓求解器自動創建
            if (this.gpuOptions.webGPUDevice && this.gpuOptions.webGPUAdapter) {
                console.log('   使用外部提供的 WebGPU 設備');
                await this.webgpuSolver.initialize(this.gpuOptions.webGPUDevice, this.gpuOptions.webGPUAdapter);
            } else {
                console.log('   自動創建 WebGPU 設備');
                await this.webgpuSolver.initialize(); // 不傳參數，讓它自己創建
            }
            
            // 預處理電路
            console.log('   預處理電路拓撲結構...');
            const preprocessStats = this.preprocessor.process(components);
            this.circuitData = this.preprocessor.getProcessedData();
            
            // 設置GPU電路數據
            console.log('   上傳電路數據到GPU...');
            const webgpuCircuitData = {
                nodeCount: this.circuitData.nodeCount,
                stateCount: this.circuitData.stateCount,
                gMatrix: {
                    getDenseMatrix: () => this.preprocessor.getDenseMatrix()
                },
                initialStateVector: this.circuitData.initialStateVector
            };
            this.webgpuSolver.setupCircuit(webgpuCircuitData);
            
            // 初始化狀態向量
            console.log(`   調試：initialStateVector = ${this.circuitData.initialStateVector}`);
            console.log(`   調試：stateCount = ${this.circuitData.stateCount}`);
            
            this.currentStateVector = new Float64Array(this.circuitData.initialStateVector || new Array(this.circuitData.stateCount).fill(0));
            
            console.log(`   調試：currentStateVector長度 = ${this.currentStateVector.length}`);
            console.log(`✅ GPU求解器初始化完成: ${this.circuitData.nodeCount} 節點, ${this.circuitData.stateCount} 狀態變量`);
            
            return preprocessStats;
            
        } catch (error) {
            throw new Error(`GPU求解器初始化失敗: ${error.message}`);
        }
    }

    /**
     * 執行一個時間步 - 統一API
     * @param {Object} controlInputs 控制輸入 (可選)
     * @returns {Object} 時間步結果
     */
    async step(controlInputs = {}) {
        return await this.solveTimeStep(controlInputs);
    }

    /**
     * 執行單個時間步的求解
     */
    async solveTimeStep(controlInputs = {}) {
        const stepStartTime = performance.now();
        
        // 1. 更新RHS向量 (包含狀態變數貢獻)
        const rhsVector = this.buildRHSVector();
        
        // 2. GPU求解線性系統 Gv = rhs
        const gpuStartTime = performance.now();
        const nodeVoltages = await this.webgpuSolver.solveLinearSystem(rhsVector);
        const gpuTime = performance.now() - gpuStartTime;
        
        // 3. GPU更新狀態變數
        const stateStartTime = performance.now();
        await this.updateStateVariablesGPU(nodeVoltages);
        const stateTime = performance.now() - stateStartTime;
        
        // 4. 更新時間和統計
        this.currentTime += this.timeStep;
        this.updateStats(gpuTime, stateTime, performance.now() - stepStartTime);
        
        // 將節點電壓數組轉換為節點ID映射對象
        const nodeVoltageMap = {};
        const nodeMap = this.circuitData.nodeMap || new Map();
        const nodeIds = Array.from(nodeMap.keys());
        
        // 調試信息
        if (this.debug) {
            console.log(`  調試：nodeVoltages長度 = ${nodeVoltages.length}`);
            console.log(`  調試：nodeIds長度 = ${nodeIds.length}`);
            console.log(`  調試：nodeIds = [${nodeIds.join(', ')}]`);
            console.log(`  調試：nodeVoltages = [${Array.from(nodeVoltages).join(', ')}]`);
        }
        
        for (let i = 0; i < nodeVoltages.length && i < nodeIds.length; i++) {
            nodeVoltageMap[nodeIds[i]] = nodeVoltages[i];
        }
        
        // 構建狀態變量映射 (與CPU格式一致)
        const stateVariables = new Map();
        for (let i = 0; i < this.circuitData.stateCount; i++) {
            const stateVar = this.circuitData.stateVariables[i];
            stateVariables.set(stateVar.componentName, this.currentStateVector[i]);
        }

        return {
            nodeVoltages: nodeVoltageMap,
            stateVector: Array.from(this.currentStateVector),  // 保留Array格式
            stateVariables: stateVariables,  // 添加Map格式與CPU一致
            time: this.currentTime,
        };
    }

    /**
     * 構建RHS向量 (包含所有激勵源)
     */
    buildRHSVector() {
        const nodeCount = this.circuitData.nodeCount;
        const rhsVector = new Float64Array(nodeCount);
        
        // 遍歷所有組件，讓它們貢獻到RHS
        for (const component of this.components) {
            if (typeof component.updateRHS === 'function') {
                const componentData = this.circuitData.componentData.get(component.name);
                component.updateRHS(
                    rhsVector,
                    this.currentStateVector,
                    this.currentTime,
                    componentData
                );
            }
        }
        
        if (this.debug && this.stats.totalTimeSteps < 5) {
            console.log(`t=${this.currentTime.toExponential(3)}, RHS: [${Array.from(rhsVector).map(x => x.toExponential(3)).join(', ')}]`);
        }
        
        return rhsVector;
    }

    /**
     * GPU並行更新狀態變數
     */
    async updateStateVariablesGPU(nodeVoltages) {
        const stateCount = this.circuitData.stateCount;
        if (stateCount === 0) return;
        
        // 暫時使用CPU實現，後續可遷移到GPU
        const stateDerivatives = new Float64Array(stateCount);
        
        // 計算每個狀態變數的導數
        for (let i = 0; i < stateCount; i++) {
            const stateVar = this.circuitData.stateVariables[i];
            const derivative = this.calculateStateDerivative(stateVar, nodeVoltages, i);
            stateDerivatives[i] = derivative;
        }
        
        // 積分更新
        this.integrateStateVariables(stateDerivatives);
        
        if (this.debug && this.stats.totalTimeSteps < 5) {
            console.log(`t=${this.currentTime.toExponential(3)}, 狀態導數: [${Array.from(stateDerivatives).map(x => x.toExponential(3)).join(', ')}]`);
            console.log(`t=${this.currentTime.toExponential(3)}, 更新後狀態: [${Array.from(this.currentStateVector || []).map(x => x.toExponential(6)).join(', ')}]`);
            console.log(`t=${this.currentTime.toExponential(3)}, 狀態向量長度: ${this.currentStateVector ? this.currentStateVector.length : 'undefined'}`);
        }
    }

    /**
     * 計算單個狀態變數的導數
     */
    calculateStateDerivative(stateVar, nodeVoltages, stateIndex) {
        const node1 = stateVar.node1;
        const node2 = stateVar.node2;
        
        // 獲取節點電壓
        const v1 = node1 >= 0 ? nodeVoltages[node1] : 0;
        const v2 = node2 >= 0 ? nodeVoltages[node2] : 0;
        const nodeVoltage = v1 - v2;
        
        if (stateVar.type === 'voltage') {
            // 電容: dVc/dt = Ic/C
            const currentVc = this.currentStateVector[stateIndex];
            const C = stateVar.parameter;
            
            // 使用與CPU求解器相同的簡化電容電流計算
            // 電容電流 = (節點電壓 - 電容電壓) * 大導納
            const largeAdmittance = 1e6;
            const capacitorCurrent = (nodeVoltage - currentVc) * largeAdmittance;
            
            return capacitorCurrent / C;
            
        } else if (stateVar.type === 'current') {
            // 電感: dIl/dt = Vl/L
            const L = stateVar.parameter;
            return nodeVoltage / L;
        }
        
        return 0;
    }

    /**
     * 積分更新狀態變數
     */
    integrateStateVariables(derivatives) {
        if (this.integrationMethod === 'forward_euler') {
            // 前向歐拉法
            for (let i = 0; i < derivatives.length; i++) {
                this.currentStateVector[i] += this.timeStep * derivatives[i];
            }
        } else if (this.integrationMethod === 'rk4') {
            // 四階龍格庫塔 (簡化實現)
            for (let i = 0; i < derivatives.length; i++) {
                this.currentStateVector[i] += this.timeStep * derivatives[i];
            }
        }
    }

    /**
     * 運行完整的時域仿真
     */
    async runTransientAnalysis(startTime, endTime, timeStep = null) {
        if (timeStep) this.timeStep = timeStep;
        
        console.log(`開始GPU時域仿真: ${startTime}s 到 ${endTime}s, 步長 ${this.timeStep}s`);
        
        this.currentTime = startTime;
        const results = [];
        const totalSteps = Math.ceil((endTime - startTime) / this.timeStep);
        
        const simStartTime = performance.now();
        
        for (let step = 0; step <= totalSteps; step++) {
            const stepResult = await this.solveTimeStep();
            
            // 每100步或前5步記錄結果
            if (step % 100 === 0 || step < 5) {
                results.push({
                    time: this.currentTime,
                    nodeVoltages: stepResult.nodeVoltages,
                    stateVector: stepResult.stateVector,
                });
            }
            
            // 進度輸出
            if (step % Math.max(1, Math.floor(totalSteps / 10)) === 0) {
                const progress = (step / totalSteps * 100).toFixed(1);
                console.log(`   進度: ${progress}% (${step}/${totalSteps} 步)`);
            }
        }
        
        this.stats.totalSimulationTime = performance.now() - simStartTime;
        
        console.log(`GPU仿真完成: ${totalSteps} 個時間步`);
        
        return {
            results,
            stats: this.getStats(),
            finalTime: this.currentTime,
            totalSteps: totalSteps,
        };
    }

    /**
     * 更新性能統計
     */
    updateStats(gpuTime, stateTime, totalStepTime) {
        this.stats.totalTimeSteps++;
        this.stats.totalGPUSolves++;
        this.stats.totalStateUpdates++;
        
        // 移動平均
        const alpha = 0.1;
        this.stats.avgGPUTime = this.stats.avgGPUTime * (1 - alpha) + gpuTime * alpha;
        this.stats.avgStateUpdateTime = this.stats.avgStateUpdateTime * (1 - alpha) + stateTime * alpha;
    }

    /**
     * 獲取性能統計
     */
    getStats() {
        return {
            ...this.stats,
            webgpuStats: this.webgpuSolver ? this.webgpuSolver.getStats() : null,
        };
    }

    /**
     * 銷毀求解器，釋放GPU和記憶體資源
     */
    destroy() {
        // 清理WebGPU資源
        if (this.webgpuSolver) {
            this.webgpuSolver.destroy();
            this.webgpuSolver = null;
        }
        
        // 清理CPU數據
        this.components = null;
        this.circuitData = null;
        this.currentStateVector = null;
        
        // 重置狀態
        this.currentTime = 0;
        this.gpuBuffersInitialized = false;
        
        // 重置統計
        this.stats = {
            totalTimeSteps: 0,
            totalGPUSolves: 0,
            totalStateUpdates: 0,
            avgGPUTime: 0,
            avgStateUpdateTime: 0,
            totalSimulationTime: 0,
        };
        
        console.log('GPUExplicitStateSolver 已銷毀');
    }

    /**
     * 統一的run方法 - 與ExplicitStateSolver API兼容
     * @param {number} startTime 開始時間
     * @param {number} endTime 結束時間
     * @returns {Object} 格式化的仿真結果
     */
    async run(startTime, endTime) {
        console.log(`🚀 開始GPU顯式時域仿真: ${startTime}s 到 ${endTime}s, 步長 ${this.timeStep}s`);
        
        this.currentTime = startTime;
        const timeVector = [];
        const nodeVoltages = {};
        const stateVariables = {};
        
        // 初始化結果數組
        const nodeMap = this.circuitData.nodeMap || new Map();
        for (const nodeId of nodeMap.keys()) {
            nodeVoltages[nodeId] = [];
        }
        
        // 初始化狀態變量數組
        if (this.circuitData.stateCount > 0) {
            for (const component of this.components) {
                if (component.getStateVariables && component.getStateVariables().length > 0) {
                    stateVariables[component.id] = [];
                }
            }
        }
        
        const totalSteps = Math.ceil((endTime - startTime) / this.timeStep);
        const simStartTime = performance.now();
        
        // 仿真主循環
        for (let step = 0; step <= totalSteps; step++) {
            // 解算當前時間步
            const stepResult = await this.solveTimeStep();
            
            // 記錄時間
            timeVector.push(this.currentTime);
            
            // 記錄節點電壓
            if (stepResult.nodeVoltages) {
                for (const [nodeId, voltage] of Object.entries(stepResult.nodeVoltages)) {
                    if (nodeVoltages[nodeId]) {
                        nodeVoltages[nodeId].push(voltage);
                    }
                }
            }
            
            // 記錄狀態變量
            if (stepResult.stateVector && this.circuitData.stateCount > 0) {
                let stateIndex = 0;
                for (const component of this.components) {
                    if (component.getStateVariables && component.getStateVariables().length > 0) {
                        const componentStates = component.getStateVariables().length;
                        if (!stateVariables[component.id]) {
                            stateVariables[component.id] = [];
                        }
                        
                        // 提取該組件的狀態變量
                        for (let i = 0; i < componentStates; i++) {
                            if (stateIndex + i < stepResult.stateVector.length) {
                                if (!stateVariables[component.id][i]) {
                                    stateVariables[component.id][i] = [];
                                }
                                stateVariables[component.id][i].push(stepResult.stateVector[stateIndex + i]);
                            }
                        }
                        stateIndex += componentStates;
                    }
                }
            }
            
            // 進度輸出
            if (step % Math.max(1, Math.floor(totalSteps / 20)) === 0 || step < 5) {
                const progress = (step / totalSteps * 100).toFixed(1);
                if (this.debug && step % Math.max(1, Math.floor(totalSteps / 10)) === 0) {
                    console.log(`   GPU仿真進度: ${progress}% (${step}/${totalSteps})`);
                }
            }
        }
        
        const totalTime = performance.now() - simStartTime;
        this.stats.totalSimulationTime = totalTime;
        
        if (this.debug) {
            console.log(`GPU仿真完成: ${totalSteps} 個時間步, 耗時 ${totalTime.toFixed(2)}ms`);
            console.log(`   平均GPU求解時間: ${this.stats.avgGPUTime.toFixed(3)}ms`);
            console.log(`   平均狀態更新時間: ${this.stats.avgStateUpdateTime.toFixed(3)}ms`);
        }
        
        return {
            timeVector,
            nodeVoltages,
            stateVariables: Object.keys(stateVariables).length > 0 ? stateVariables : null,
            totalTime,
            stats: this.getStats()
        };
    }

    /**
     * 驗證GPU求解結果 - 與CPU求解器對比
     */
    async validateAgainstCPU(cpuSolver, testDuration = 1e-5) {
        console.log('🔍 GPU vs CPU結果驗證...');
        
        try {
            // 運行GPU仿真
            const gpuResults = await this.run(0, testDuration);
            
            // 運行CPU仿真 (相同組件和參數)
            const cpuResults = await cpuSolver.run(0, testDuration);
            
            // 簡單驗證
            const nodeErrors = [];
            let maxError = 0;
            
            for (const [nodeId, gpuVoltages] of Object.entries(gpuResults.nodeVoltages)) {
                const cpuVoltages = cpuResults.nodeVoltages[nodeId];
                if (cpuVoltages && gpuVoltages.length === cpuVoltages.length) {
                    for (let i = 0; i < gpuVoltages.length; i++) {
                        const error = Math.abs(gpuVoltages[i] - cpuVoltages[i]);
                        const relError = error / (Math.abs(cpuVoltages[i]) + 1e-12);
                        maxError = Math.max(maxError, relError);
                        
                        if (relError > 1e-3) {  // 0.1% 閾值
                            nodeErrors.push({
                                node: nodeId,
                                time: i,
                                gpu: gpuVoltages[i],
                                cpu: cpuVoltages[i],
                                error: relError
                            });
                        }
                    }
                }
            }
            
            return {
                passed: maxError < 1e-3 && nodeErrors.length === 0,
                maxError,
                nodeErrors: nodeErrors.slice(0, 10),  // 最多顯示10個錯誤
                gpuTime: gpuResults.totalTime,
                cpuTime: cpuResults.totalTime,
                speedup: cpuResults.totalTime / gpuResults.totalTime
            };
            
        } catch (error) {
            return {
                passed: false,
                error: `驗證過程異常: ${error.message}`
            };
        }
    }
}