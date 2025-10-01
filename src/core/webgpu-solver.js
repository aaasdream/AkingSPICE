/**
 * WebGPU線性求解器 - GPU加速的電路仿真核心
 * 
 * 實現功能:
 * 1. GPU緩衝區管理 (G矩陣、RHS向量、狀態向量)
 * 2. 並行線性方程組求解 (迭代法: Jacobi/Gauss-Seidel)
 * 3. 狀態變量更新 (顯式歐拉/RK4)
 * 4. CPU-GPU數據傳輸優化
 */

// 移除有問題的 webgpu 依賴，直接使用瀏覽器原生 WebGPU API
// import { create, globals } from 'webgpu';

export class WebGPUSolver {
    constructor(options = {}) {
        this.debug = options.debug || false;
        this.maxIterations = options.maxIterations || 2000;
        this.tolerance = options.tolerance || 1e-12;
        
        // WebGPU組件
        this.gpu = null;
        this.adapter = null;
        this.device = null;
        
        // 計算管線
        this.solverPipeline = null;
        this.stateUpdatePipeline = null;
        
        // GPU緩衝區
        this.gMatrixBuffer = null;
        this.rhsBuffer = null;
        this.solutionBuffer = null;
        this.stateBuffer = null;
        this.tempBuffer = null;
        
        // 電路數據
        this.circuitData = null;
        this.nodeCount = 0;
        this.stateCount = 0;
        this.workgroupSize = 64;
        
        // 性能統計
        this.stats = {
            totalGPUTime: 0,
            totalTransferTime: 0,
            totalIterations: 0,
            averageIterations: 0,
        };
    }

    /**
     * 初始化WebGPU上下文和設備
     * @param {GPUDevice} device - 外部傳入的 WebGPU 設備
     * @param {GPUAdapter} adapter - 外部傳入的 WebGPU 適配器
     */
    async initialize(device = null, adapter = null) {
        if (this.debug) console.log('🚀 初始化WebGPU線性求解器...');
        
        try {
            // 使用外部傳入的設備和適配器，或者自己創建
            if (device && adapter) {
                if (this.debug) console.log('✅ 使用外部傳入的 WebGPU 設備');
                this.adapter = adapter;
                this.device = device;
            } else {
                if (this.debug) console.log('🔍 自動獲取 WebGPU 設備...');
                
                // 使用瀏覽器原生 WebGPU API
                if (!navigator.gpu) {
                    throw new Error('瀏覽器不支援 WebGPU API');
                }
                
                // 請求適配器和設備
                this.adapter = await navigator.gpu.requestAdapter();
                if (!this.adapter) {
                    throw new Error('無法獲取WebGPU適配器');
                }
                
                this.device = await this.adapter.requestDevice({
                    requiredFeatures: [],
                    requiredLimits: {
                        maxComputeWorkgroupStorageSize: 16384,
                        maxStorageBufferBindingSize: 134217728, // 128MB
                    }
                });
                
                // 添加設備丟失監聽器
                this.device.lost.then((info) => {
                    console.error('WebGPU設備丟失:', info.reason, info.message);
                    this.device = null;
                });
            }
            
            if (this.debug) {
                console.log('✅ WebGPU設備初始化成功');
                console.log(`   適配器: ${this.adapter.info?.description || 'Unknown'}`);
                console.log(`   供應商: ${this.adapter.info?.vendor || 'Unknown'}`);
            }
            
            // 創建著色器和管線
            await this.createComputePipelines();
            
        } catch (error) {
            throw new Error(`WebGPU初始化失敗: ${error.message}`);
        }
    }

    /**
     * 設置電路數據並創建GPU緩衝區
     */
    setupCircuit(circuitData) {
        this.circuitData = circuitData;
        this.nodeCount = circuitData.nodeCount;
        this.stateCount = circuitData.stateCount;
        
        if (this.debug) {
            console.log(`📊 設置電路: ${this.nodeCount} 節點, ${this.stateCount} 狀態變量`);
        }
        
        this.createBuffers();
        this.uploadCircuitData();
    }

    /**
     * 創建計算著色器管線
     */
    async createComputePipelines() {
        // Jacobi迭代求解器著色器
        const jacobiSolverWGSL = this.generateJacobiSolverWGSL();
        const jacobiShaderModule = this.device.createShaderModule({
            label: 'Jacobi Linear Solver',
            code: jacobiSolverWGSL,
        });
        
        this.solverPipeline = this.device.createComputePipeline({
            label: 'Jacobi Solver Pipeline',
            layout: 'auto',
            compute: {
                module: jacobiShaderModule,
                entryPoint: 'jacobi_iteration',
            },
        });
        
        // 狀態變量更新著色器
        const stateUpdateWGSL = this.generateStateUpdateWGSL();
        const stateShaderModule = this.device.createShaderModule({
            label: 'State Variable Update',
            code: stateUpdateWGSL,
        });
        
        this.stateUpdatePipeline = this.device.createComputePipeline({
            label: 'State Update Pipeline', 
            layout: 'auto',
            compute: {
                module: stateShaderModule,
                entryPoint: 'update_state_variables',
            },
        });
        
        if (this.debug) {
            console.log('✅ 計算管線創建完成');
        }
    }

    /**
     * 生成Jacobi迭代求解器的WGSL代碼
     */
    generateJacobiSolverWGSL() {
        return `
            // Jacobi迭代法求解 Gv = rhs
            // x_new[i] = (rhs[i] - sum(G[i,j] * x_old[j], j != i)) / G[i,i]
            
            @group(0) @binding(0) var<storage, read> g_matrix: array<f32>;
            @group(0) @binding(1) var<storage, read> rhs: array<f32>;
            @group(0) @binding(2) var<storage, read> x_old: array<f32>;
            @group(0) @binding(3) var<storage, read_write> x_new: array<f32>;
            @group(0) @binding(4) var<uniform> params: JacobiParams;
            
            struct JacobiParams {
                node_count: u32,
                matrix_size: u32,
                workgroup_size: u32,
                padding: u32,
            }
            
            @compute @workgroup_size(64)
            fn jacobi_iteration(@builtin(global_invocation_id) global_id: vec3<u32>) {
                let row = global_id.x;
                if (row >= params.node_count) {
                    return;
                }
                
                var sum = 0.0;
                var diagonal = 0.0;
                
                // 計算G矩陣的行積(排除對角線)
                for (var col = 0u; col < params.node_count; col = col + 1u) {
                    let matrix_idx = row * params.node_count + col;
                    let g_value = g_matrix[matrix_idx];
                    
                    if (row == col) {
                        diagonal = g_value;
                    } else {
                        sum = sum + g_value * x_old[col];
                    }
                }
                
                // Jacobi更新: x_new[i] = (rhs[i] - sum) / G[i,i]
                // 使用更高精度的數值運算和relaxation factor
                if (abs(diagonal) > 1e-12) {
                    let update = (rhs[row] - sum) / diagonal;
                    // 使用relaxation factor提高數值穩定性 (ω=0.8)
                    x_new[row] = x_old[row] * 0.2 + update * 0.8;
                } else {
                    x_new[row] = x_old[row]; // 保持舊值如果對角線接近零
                }
            }
        `;
    }

    /**
     * 生成狀態變量更新的WGSL代碼
     */
    generateStateUpdateWGSL() {
        return `
            // 顯式狀態變量更新 - 基於KCL的通用方法
            // 對於電容: dVc/dt = Ic/C，其中 Ic 通過KCL計算
            // 對於電感: dIl/dt = Vl/L
            
            @group(0) @binding(0) var<storage, read> node_voltages: array<f32>;
            @group(0) @binding(1) var<storage, read> state_old: array<f32>;
            @group(0) @binding(2) var<storage, read_write> state_new: array<f32>;
            @group(0) @binding(3) var<storage, read> state_params: array<f32>; // C或L值
            @group(0) @binding(4) var<storage, read> state_nodes: array<i32>; // 節點索引對
            @group(0) @binding(5) var<storage, read> state_types: array<u32>; // 0=voltage(電容), 1=current(電感)
            @group(0) @binding(6) var<storage, read> g_matrix: array<f32>; // G矩陣 (row-major)
            @group(0) @binding(7) var<storage, read> rhs_vector: array<f32>; // RHS向量
            @group(0) @binding(8) var<uniform> update_params: StateUpdateParams;
            
            struct StateUpdateParams {
                state_count: u32,
                node_count: u32,
                time_step: f32,
                large_admittance: f32, // 電容大導納值
                method: u32, // 0=Euler, 1=RK4
            }
            
            @compute @workgroup_size(64)
            fn update_state_variables(@builtin(global_invocation_id) global_id: vec3<u32>) {
                let state_idx = global_id.x;
                if (state_idx >= update_params.state_count) {
                    return;
                }
                
                // 獲取狀態變量的節點索引和參數
                let node1 = state_nodes[state_idx * 2];
                let node2 = state_nodes[state_idx * 2 + 1];
                let state_type = state_types[state_idx];
                let parameter = state_params[state_idx]; // C或L值
                let current_state = state_old[state_idx];
                
                var derivative = 0.0;
                
                if (state_type == 0u) {
                    // 電容: dVc/dt = Ic/C
                    // 使用簡化的電容電流計算: Ic = (V_node - Vc) * G_large
                    var capacitor_current = 0.0;
                    
                    if (node1 >= 0) {
                        // 獲取節點電壓
                        var v1 = 0.0;
                        var v2 = 0.0;
                        if (node1 >= 0) { v1 = node_voltages[u32(node1)]; }
                        if (node2 >= 0) { v2 = node_voltages[u32(node2)]; }
                        let node_voltage = v1 - v2;
                        
                        // 電容電流 = (節點電壓 - 電容電壓) * 大導納
                        capacitor_current = (node_voltage - current_state) * update_params.large_admittance;
                    }
                    
                    // 計算導數: dVc/dt = Ic/C
                    derivative = capacitor_current / parameter;
                    
                } else if (state_type == 1u) {
                    // 電感: dIl/dt = Vl/L
                    var v1 = 0.0;
                    var v2 = 0.0;
                    if (node1 >= 0) { v1 = node_voltages[u32(node1)]; }
                    if (node2 >= 0) { v2 = node_voltages[u32(node2)]; }
                    let node_voltage = v1 - v2;
                    
                    derivative = node_voltage / parameter;
                }
                
                // 積分更新
                if (update_params.method == 0u) {
                    // 前向歐拉法: x(t+dt) = x(t) + dt * f(x(t), t)
                    state_new[state_idx] = current_state + update_params.time_step * derivative;
                } else {
                    // RK4暫時簡化為歐拉（完整RK4需要多次求解）
                    state_new[state_idx] = current_state + update_params.time_step * derivative;
                }
            }
        `;
    }

    /**
     * 創建GPU緩衝區
     */
    createBuffers() {
        if (!this.device) {
            throw new Error('無法創建緩衝區：WebGPU設備未初始化');
        }
        
        const nodeCount = this.nodeCount;
        const stateCount = this.stateCount;
        
        if (this.debug) {
            console.log(`  創建GPU緩衝區: 節點${nodeCount}, 狀態${stateCount}`);
        }
        
        // G矩陣 (nodeCount x nodeCount)
        const matrixSize = nodeCount * nodeCount * 4; // Float32 = 4 bytes
        this.gMatrixBuffer = this.device.createBuffer({
            label: 'G Matrix Buffer',
            size: matrixSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        
        // RHS向量 (nodeCount)
        const vectorSize = nodeCount * 4;
        this.rhsBuffer = this.device.createBuffer({
            label: 'RHS Vector Buffer',
            size: vectorSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        
        // 解向量 (nodeCount, 需要雙緩衝)
        this.solutionBuffer = this.device.createBuffer({
            label: 'Solution Vector Buffer',
            size: vectorSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
        });
        
        this.tempBuffer = this.device.createBuffer({
            label: 'Temp Solution Buffer',
            size: vectorSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
        });
        
        // 狀態向量 (stateCount)
        const stateSize = Math.max(stateCount * 4, 16); // 至少16字節
        this.stateBuffer = this.device.createBuffer({
            label: 'State Vector Buffer',
            size: stateSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
        });
        
        if (this.debug) {
            console.log(`✅ GPU緩衝區創建完成 (G矩陣: ${matrixSize}B, 向量: ${vectorSize}B, 狀態: ${stateSize}B)`);
        }
    }

    /**
     * 上傳電路數據到GPU
     */
    uploadCircuitData() {
        // 從電路預處理器獲取數據
        const gMatrix = this.circuitData.gMatrix.getDenseMatrix();
        const initialState = this.circuitData.initialStateVector;
        
        if (this.debug) {
            console.log('📊 GPU數據上傳調試:');
            console.log(`  G矩陣維度: ${gMatrix.length}x${gMatrix[0]?.length || 0}`);
            console.log(`  G矩陣內容:`, gMatrix.flat().slice(0, 10));
            console.log(`  初始狀態:`, initialState);
        }
        
        // 上傳G矩陣
        this.device.queue.writeBuffer(
            this.gMatrixBuffer, 
            0, 
            new Float32Array(gMatrix.flat())
        );
        
        // 上傳初始狀態
        if (this.stateCount > 0) {
            this.device.queue.writeBuffer(
                this.stateBuffer, 
                0, 
                new Float32Array(initialState)
            );
        }
        
        if (this.debug) {
            console.log('✅ 電路數據上傳到GPU完成');
        }
    }

    /**
     * GPU線性方程組求解: Gv = rhs
     */
    async solveLinearSystem(rhsVector, initialGuess = null) {
        const startTime = performance.now();
        
        // 快速檢查核心組件（僅在調試模式下輸出）
        if (!this.device || !this.gMatrixBuffer || !this.rhsBuffer || !this.solutionBuffer || !this.tempBuffer || !this.solverPipeline) {
            throw new Error('[GPU錯誤] WebGPU組件未正確初始化');
        }
        
        if (this.debug) {
            console.log(`      WebGPU求解開始: RHS長度=${rhsVector.length}`);
        }
        
        // 上傳RHS向量 (保持更高精度轉換)
        const rhsFloat32 = new Float32Array(rhsVector.length);
        for (let i = 0; i < rhsVector.length; i++) {
            rhsFloat32[i] = rhsVector[i];
        }
        
        if (this.debug) {
            console.log(`      上傳RHS到GPU...`);
        }
        
        this.device.queue.writeBuffer(this.rhsBuffer, 0, rhsFloat32);
        
        // 設置初始猜測 (如果沒有提供，使用零向量)
        const initGuess = initialGuess || new Array(this.nodeCount).fill(0.0);
        const initFloat32 = new Float32Array(initGuess.length);
        for (let i = 0; i < initGuess.length; i++) {
            initFloat32[i] = initGuess[i];
        }
        this.device.queue.writeBuffer(this.solutionBuffer, 0, initFloat32);
        
        // Jacobi迭代求解
        if (this.debug) {
            console.log(`      開始Jacobi迭代求解...`);
        }
        await this.runJacobiIterations();
        
        // 讀取結果
        const result = await this.readSolutionVector();
        
        // 調試輸出
        if (this.debug && result.length > 0) {
            console.log(`  GPU求解結果: [${Array.from(result).slice(0, Math.min(4, result.length)).map(x => x.toFixed(6)).join(', ')}${result.length > 4 ? '...' : ''}]`);
            console.log(`  結果向量長度: ${result.length}`);
        } else if (this.debug) {
            console.log('  ⚠️ GPU返回空結果向量');
        }
        
        this.stats.totalGPUTime += performance.now() - startTime;
        return result;
    }

    /**
     * 執行Jacobi迭代 - 增加收斂檢查以避免無用的固定迭代
     */
    async runJacobiIterations() {
        if (this.debug) {
            console.log(`        Jacobi迭代開始: 節點數=${this.nodeCount}`);
        }
        
        // 創建參數緩衝區
        const paramsData = new Uint32Array([
            this.nodeCount,
            this.nodeCount * this.nodeCount,
            this.workgroupSize,
            0 // padding
        ]);
        
        const paramsBuffer = this.device.createBuffer({
            label: 'Jacobi Params',
            size: paramsData.byteLength,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        
        this.device.queue.writeBuffer(paramsBuffer, 0, paramsData);
        
        // 收斂檢查變量
        let converged = false;
        let lastSolution = null;
        let iterCount = 0;
        const convergenceCheckInterval = 5; // 每5次迭代檢查一次收斂
        const tolerance = this.tolerance || 1e-6;
        
        if (this.debug) {
            console.log(`  開始Jacobi迭代 (收斂容差: ${tolerance})`);
        }
        
        for (iterCount = 0; iterCount < this.maxIterations && !converged; iterCount++) {
            // 執行單次 Jacobi 迭代
            await this.runSingleJacobiIteration(paramsBuffer);
            
            // 定期檢查收斂 (避免每次都讀取GPU數據)
            if (iterCount % convergenceCheckInterval === 0 || iterCount >= this.maxIterations - 5) {
                const currentSolution = await this.readSolutionVector();
                
                if (lastSolution) {
                    let maxError = 0;
                    let relativeError = 0;
                    
                    for (let i = 0; i < this.nodeCount; i++) {
                        const diff = Math.abs(currentSolution[i] - lastSolution[i]);
                        const rel = Math.abs(currentSolution[i]) > 1e-12 ? diff / Math.abs(currentSolution[i]) : diff;
                        maxError = Math.max(maxError, diff);
                        relativeError = Math.max(relativeError, rel);
                    }
                    
                    if (maxError < tolerance || relativeError < tolerance) {
                        converged = true;
                        if (this.debug) {
                            console.log(`  ✓ Jacobi收斂於第 ${iterCount + 1} 次迭代 (誤差: ${maxError.toExponential(2)}, 相對誤差: ${relativeError.toExponential(2)})`);
                        }
                        break;
                    }
                }
                
                lastSolution = new Float32Array(currentSolution);
            }
        }
        
        if (!converged) {
            console.warn(`⚠️ Jacobi在 ${this.maxIterations} 次迭代後未收斂 (節點數: ${this.nodeCount})`);
        }
        
        this.stats.totalIterations = (this.stats.totalIterations || 0) + iterCount;
    }

    /**
     * 執行單次Jacobi迭代
     */
    async runSingleJacobiIteration(paramsBuffer) {
        // 創建綁定組
        const bindGroup = this.device.createBindGroup({
            layout: this.solverPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.gMatrixBuffer } },
                { binding: 1, resource: { buffer: this.rhsBuffer } },
                { binding: 2, resource: { buffer: this.solutionBuffer } }, // x_old
                { binding: 3, resource: { buffer: this.tempBuffer } },     // x_new
                { binding: 4, resource: { buffer: paramsBuffer } },
            ],
        });
        
        // 執行計算
        const commandEncoder = this.device.createCommandEncoder();
        const computePass = commandEncoder.beginComputePass();
        
        computePass.setPipeline(this.solverPipeline);
        computePass.setBindGroup(0, bindGroup);
        computePass.dispatchWorkgroups(Math.ceil(this.nodeCount / this.workgroupSize));
        computePass.end();
        
        // 交換緩衝區 (x_new -> x_old)
        commandEncoder.copyBufferToBuffer(
            this.tempBuffer, 0,
            this.solutionBuffer, 0,
            this.nodeCount * 4
        );
        
        this.device.queue.submit([commandEncoder.finish()]);
        
        // 等待這次迭代完成
        await this.device.queue.onSubmittedWorkDone();
    }

    /**
     * 讀取解向量
     */
    async readSolutionVector() {
        const readBuffer = this.device.createBuffer({
            size: this.nodeCount * 4,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });
        
        const commandEncoder = this.device.createCommandEncoder();
        commandEncoder.copyBufferToBuffer(
            this.solutionBuffer, 0,
            readBuffer, 0,
            this.nodeCount * 4
        );
        
        this.device.queue.submit([commandEncoder.finish()]);
        
        // 添加超時處理防止卡死
        try {
            await Promise.race([
                readBuffer.mapAsync(GPUMapMode.READ),
                new Promise((_, reject) => setTimeout(() => reject(new Error('GPU讀取超時')), 5000))
            ]);
            
            const result = new Float32Array(readBuffer.getMappedRange());
            const copy = new Float32Array(result);
            readBuffer.unmap();
            
            return copy;
        } catch (error) {
            try {
                readBuffer.destroy();
            } catch (e) {
                // 忽略清理錯誤
            }
            throw new Error(`GPU結果讀取失敗: ${error.message}`);
        }
    }

    /**
     * 清理資源
     */
    destroy() {
        if (this.device) {
            this.device.destroy();
        }
    }

    /**
     * 獲取性能統計
     */
    getStats() {
        return { ...this.stats };
    }
}

/**
 * WebGPU求解器工廠函數
 */
export async function createWebGPUSolver(options = {}) {
    const solver = new WebGPUSolver(options);
    await solver.initialize();
    return solver;
}