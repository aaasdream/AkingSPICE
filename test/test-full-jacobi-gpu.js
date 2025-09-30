/**
 * 完整的GPU Jacobi求解器測試
 * 測試多次迭代直到收斂
 */

import { create, globals } from 'webgpu';

async function testFullJacobiSolver() {
    console.log('🔥 完整GPU Jacobi求解器測試\n');
    
    try {
        // 初始化WebGPU
        const gpu = create([]);
        Object.assign(globalThis, globals);
        
        const adapter = await gpu.requestAdapter();
        const device = await adapter.requestDevice();
        
        console.log('✅ WebGPU設備創建成功');
        
        // 測試完整迭代
        await runFullJacobiIterations(device);
        
        device.destroy();
        console.log('\n✅ 完整測試完成');
        
    } catch (error) {
        console.error('\n❌ 測試失敗:', error);
    }
}

async function runFullJacobiIterations(device) {
    console.log('執行完整Jacobi迭代求解...');
    
    // 系統: [2 1; 1 3][x; y] = [5; 6], 解: x=1, y=3
    const gMatrix = new Float32Array([2.0, 1.0, 1.0, 3.0]);
    const rhs = new Float32Array([5.0, 6.0]);
    
    console.log('目標解: x=1, y=3');
    
    // WGSL著色器
    const wgslCode = `
        @group(0) @binding(0) var<storage, read> g_matrix: array<f32>;
        @group(0) @binding(1) var<storage, read> rhs: array<f32>;
        @group(0) @binding(2) var<storage, read> x_old: array<f32>;
        @group(0) @binding(3) var<storage, read_write> x_new: array<f32>;
        
        @compute @workgroup_size(1)
        fn jacobi_iteration(@builtin(global_invocation_id) global_id: vec3<u32>) {
            let row = global_id.x;
            if (row >= 2u) { return; }
            
            var sum = 0.0;
            var diagonal = 0.0;
            
            for (var col = 0u; col < 2u; col = col + 1u) {
                let matrix_idx = row * 2u + col;
                let g_value = g_matrix[matrix_idx];
                
                if (row == col) {
                    diagonal = g_value;
                } else {
                    sum = sum + g_value * x_old[col];
                }
            }
            
            if (abs(diagonal) > 1e-12) {
                x_new[row] = (rhs[row] - sum) / diagonal;
            } else {
                x_new[row] = x_old[row];
            }
        }
    `;
    
    // 創建管線
    const shaderModule = device.createShaderModule({ code: wgslCode });
    const pipeline = device.createComputePipeline({
        layout: 'auto',
        compute: { module: shaderModule, entryPoint: 'jacobi_iteration' },
    });
    
    // 創建緩衝區
    const matrixBuffer = device.createBuffer({
        size: 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    const rhsBuffer = device.createBuffer({
        size: 8, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    const xBuffer1 = device.createBuffer({
        size: 8, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });
    const xBuffer2 = device.createBuffer({
        size: 8, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });
    const readBuffer = device.createBuffer({
        size: 8, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    
    // 上傳數據
    device.queue.writeBuffer(matrixBuffer, 0, gMatrix);
    device.queue.writeBuffer(rhsBuffer, 0, rhs);
    device.queue.writeBuffer(xBuffer1, 0, new Float32Array([0.0, 0.0])); // 初始猜測
    
    // 迭代求解
    const maxIterations = 50;
    let currentBuffer = xBuffer1;
    let nextBuffer = xBuffer2;
    
    for (let iter = 0; iter < maxIterations; iter++) {
        // 創建綁定組
        const bindGroup = device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: matrixBuffer } },
                { binding: 1, resource: { buffer: rhsBuffer } },
                { binding: 2, resource: { buffer: currentBuffer } },  // x_old
                { binding: 3, resource: { buffer: nextBuffer } },     // x_new
            ],
        });
        
        // 執行計算
        const commandEncoder = device.createCommandEncoder();
        const computePass = commandEncoder.beginComputePass();
        computePass.setPipeline(pipeline);
        computePass.setBindGroup(0, bindGroup);
        computePass.dispatchWorkgroups(2);
        computePass.end();
        
        device.queue.submit([commandEncoder.finish()]);
        await device.queue.onSubmittedWorkDone();
        
        // 每5次迭代檢查結果
        if (iter % 5 === 4) {
            // 讀取當前解
            const readCommandEncoder = device.createCommandEncoder();
            readCommandEncoder.copyBufferToBuffer(nextBuffer, 0, readBuffer, 0, 8);
            device.queue.submit([readCommandEncoder.finish()]);
            
            await readBuffer.mapAsync(GPUMapMode.READ);
            const result = new Float32Array(readBuffer.getMappedRange());
            
            console.log(`迭代 ${iter+1}: [${result[0].toFixed(6)}, ${result[1].toFixed(6)}]`);
            
            // 檢查收斂
            const error = Math.max(Math.abs(result[0] - 1.0), Math.abs(result[1] - 3.0));
            if (error < 1e-6) {
                console.log(`✅ 在第 ${iter+1} 次迭代收斂，誤差: ${error.toExponential(3)}`);
                readBuffer.unmap();
                return;
            }
            
            readBuffer.unmap();
        }
        
        // 交換緩衝區
        [currentBuffer, nextBuffer] = [nextBuffer, currentBuffer];
    }
    
    console.log('❌ 達到最大迭代次數仍未收斂');
}

// 運行測試
testFullJacobiSolver().catch(console.error);