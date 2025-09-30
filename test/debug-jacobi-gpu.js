/**
 * 簡化的WebGPU Jacobi求解器測試
 * 專注於調試矩陣運算
 */

import { create, globals } from 'webgpu';

async function debugJacobiSolver() {
    console.log('🔍 調試WebGPU Jacobi求解器\n');
    
    try {
        // 初始化WebGPU
        const gpu = create([]);
        Object.assign(globalThis, globals);
        
        const adapter = await gpu.requestAdapter();
        const device = await adapter.requestDevice();
        
        console.log('✅ WebGPU設備創建成功');
        
        // 測試2x2系統
        await testJacobi2x2(device);
        
        device.destroy();
        console.log('\n✅ 調試完成');
        
    } catch (error) {
        console.error('\n❌ 調試失敗:', error);
    }
}

async function testJacobi2x2(device) {
    console.log('測試2x2 Jacobi迭代...');
    
    // 測試矩陣: [2 1; 1 3], RHS: [5; 6]
    const gMatrix = new Float32Array([
        2.0, 1.0,   // 第一行
        1.0, 3.0    // 第二行
    ]);
    
    const rhs = new Float32Array([5.0, 6.0]);
    const solution = new Float32Array([0.0, 0.0]); // 初始猜測
    
    console.log('輸入矩陣:', Array.from(gMatrix));
    console.log('RHS向量:', Array.from(rhs));
    
    // 手動計算一次Jacobi迭代作為參考
    const x_old = [0.0, 0.0];
    const x_new_manual = [
        (5.0 - 1.0 * x_old[1]) / 2.0,  // (5 - 1*0) / 2 = 2.5
        (6.0 - 1.0 * x_old[0]) / 3.0   // (6 - 1*0) / 3 = 2.0
    ];
    console.log('手動計算第一次迭代結果:', x_new_manual);
    
    // 創建簡化的WGSL著色器
    const wgslCode = `
        @group(0) @binding(0) var<storage, read> g_matrix: array<f32>;
        @group(0) @binding(1) var<storage, read> rhs: array<f32>;
        @group(0) @binding(2) var<storage, read> x_old: array<f32>;
        @group(0) @binding(3) var<storage, read_write> x_new: array<f32>;
        
        @compute @workgroup_size(1)
        fn jacobi_iteration(@builtin(global_invocation_id) global_id: vec3<u32>) {
            let row = global_id.x;
            if (row >= 2u) {
                return;
            }
            
            var sum = 0.0;
            var diagonal = 0.0;
            
            // 遍歷矩陣的一行
            for (var col = 0u; col < 2u; col = col + 1u) {
                let matrix_idx = row * 2u + col;
                let g_value = g_matrix[matrix_idx];
                
                if (row == col) {
                    diagonal = g_value;
                } else {
                    sum = sum + g_value * x_old[col];
                }
            }
            
            // Jacobi更新公式
            if (abs(diagonal) > 1e-12) {
                x_new[row] = (rhs[row] - sum) / diagonal;
            } else {
                x_new[row] = x_old[row];
            }
        }
    `;
    
    // 創建著色器和管線
    const shaderModule = device.createShaderModule({
        code: wgslCode,
    });
    
    const pipeline = device.createComputePipeline({
        layout: 'auto',
        compute: {
            module: shaderModule,
            entryPoint: 'jacobi_iteration',
        },
    });
    
    // 創建緩衝區
    const matrixBuffer = device.createBuffer({
        size: gMatrix.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    
    const rhsBuffer = device.createBuffer({
        size: rhs.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    
    const xOldBuffer = device.createBuffer({
        size: solution.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    
    const xNewBuffer = device.createBuffer({
        size: solution.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    
    const readBuffer = device.createBuffer({
        size: solution.byteLength,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    
    // 上傳數據
    device.queue.writeBuffer(matrixBuffer, 0, gMatrix);
    device.queue.writeBuffer(rhsBuffer, 0, rhs);
    device.queue.writeBuffer(xOldBuffer, 0, solution);
    
    // 執行一次迭代
    const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: matrixBuffer } },
            { binding: 1, resource: { buffer: rhsBuffer } },
            { binding: 2, resource: { buffer: xOldBuffer } },
            { binding: 3, resource: { buffer: xNewBuffer } },
        ],
    });
    
    const commandEncoder = device.createCommandEncoder();
    const computePass = commandEncoder.beginComputePass();
    
    computePass.setPipeline(pipeline);
    computePass.setBindGroup(0, bindGroup);
    computePass.dispatchWorkgroups(2); // 2個工作組，每個處理一行
    computePass.end();
    
    commandEncoder.copyBufferToBuffer(xNewBuffer, 0, readBuffer, 0, solution.byteLength);
    
    device.queue.submit([commandEncoder.finish()]);
    
    // 讀取結果
    await readBuffer.mapAsync(GPUMapMode.READ);
    const result = new Float32Array(readBuffer.getMappedRange());
    
    console.log('GPU計算結果:', Array.from(result));
    console.log('預期結果:', x_new_manual);
    
    // 驗證
    const error0 = Math.abs(result[0] - x_new_manual[0]);
    const error1 = Math.abs(result[1] - x_new_manual[1]);
    
    console.log(`誤差: [${error0.toFixed(6)}, ${error1.toFixed(6)}]`);
    
    if (error0 < 1e-5 && error1 < 1e-5) {
        console.log('✅ GPU Jacobi迭代正確');
    } else {
        console.log('❌ GPU Jacobi迭代有誤');
    }
    
    readBuffer.unmap();
}

// 運行調試
debugJacobiSolver().catch(console.error);