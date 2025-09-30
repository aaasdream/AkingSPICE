/**
 * WebGPU基礎測試 - 驗證Node.js環境中的WebGPU可用性
 */

import { create, globals } from 'webgpu';

async function testWebGPUBasic() {
    console.log('🧪 WebGPU基礎功能測試\n');
    
    try {
        // 創建GPU實例並設置全局變量
        console.log('1. 創建GPU實例...');
        const gpu = create([]);
        Object.assign(globalThis, globals);
        
        // 請求適配器
        console.log('2. 請求GPU適配器...');
        const adapter = await gpu.requestAdapter();
        
        if (!adapter) {
            throw new Error('未找到WebGPU適配器');
        }
        
        console.log('   適配器信息:');
        console.log(`   - 名稱: ${adapter.info.description || '未知'}`);
        console.log(`   - 供應商: ${adapter.info.vendor || '未知'}`);
        
        // 請求設備
        console.log('3. 請求GPU設備...');
        const device = await adapter.requestDevice();
        
        console.log('   設備創建成功!');
        console.log(`   - 支持的限制: ${JSON.stringify(device.limits, null, 2)}`);
        
        // 測試基本計算著色器
        console.log('4. 創建基本計算著色器...');
        await testBasicComputeShader(device);
        
        // 清理
        device.destroy();
        console.log('\n✅ WebGPU基礎測試通過！');
        
    } catch (error) {
        console.error('\n❌ WebGPU測試失敗:', error.message);
        console.error('完整錯誤:', error);
        process.exit(1);
    }
}

async function testBasicComputeShader(device) {
    // 簡單的向量加法測試
    const wgslCode = `
        @group(0) @binding(0) var<storage, read> input_a: array<f32>;
        @group(0) @binding(1) var<storage, read> input_b: array<f32>;
        @group(0) @binding(2) var<storage, read_write> output: array<f32>;
        
        @compute @workgroup_size(64)
        fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
            let index = global_id.x;
            if (index >= arrayLength(&input_a)) {
                return;
            }
            output[index] = input_a[index] + input_b[index];
        }
    `;
    
    // 創建計算管線
    const computeShader = device.createShaderModule({
        label: 'Vector Addition Compute Shader',
        code: wgslCode,
    });
    
    const computePipeline = device.createComputePipeline({
        label: 'Vector Addition Pipeline',
        layout: 'auto',
        compute: {
            module: computeShader,
            entryPoint: 'main',
        },
    });
    
    // 測試數據
    const arraySize = 1000;
    const inputA = new Float32Array(arraySize);
    const inputB = new Float32Array(arraySize);
    
    // 填充測試數據
    for (let i = 0; i < arraySize; i++) {
        inputA[i] = Math.random() * 100;
        inputB[i] = Math.random() * 100;
    }
    
    // 創建緩衝區
    const bufferA = device.createBuffer({
        label: 'Buffer A',
        size: inputA.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    
    const bufferB = device.createBuffer({
        label: 'Buffer B',
        size: inputB.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    
    const resultBuffer = device.createBuffer({
        label: 'Result Buffer',
        size: inputA.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    
    const readBuffer = device.createBuffer({
        label: 'Read Buffer',
        size: inputA.byteLength,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    
    // 上傳數據
    device.queue.writeBuffer(bufferA, 0, inputA);
    device.queue.writeBuffer(bufferB, 0, inputB);
    
    // 創建綁定組
    const bindGroup = device.createBindGroup({
        label: 'Vector Addition Bind Group',
        layout: computePipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: bufferA } },
            { binding: 1, resource: { buffer: bufferB } },
            { binding: 2, resource: { buffer: resultBuffer } },
        ],
    });
    
    // 執行計算
    const commandEncoder = device.createCommandEncoder({
        label: 'Vector Addition Command Encoder',
    });
    
    const computePass = commandEncoder.beginComputePass({
        label: 'Vector Addition Compute Pass',
    });
    
    computePass.setPipeline(computePipeline);
    computePass.setBindGroup(0, bindGroup);
    computePass.dispatchWorkgroups(Math.ceil(arraySize / 64));
    computePass.end();
    
    // 複製結果
    commandEncoder.copyBufferToBuffer(
        resultBuffer, 0,
        readBuffer, 0,
        inputA.byteLength
    );
    
    const commands = commandEncoder.finish();
    device.queue.submit([commands]);
    
    // 讀取結果
    await readBuffer.mapAsync(GPUMapMode.READ);
    const resultData = new Float32Array(readBuffer.getMappedRange());
    
    // 驗證結果
    let correctResults = 0;
    for (let i = 0; i < Math.min(10, arraySize); i++) {
        const expected = inputA[i] + inputB[i];
        const actual = resultData[i];
        const error = Math.abs(expected - actual);
        
        if (error < 1e-5) {
            correctResults++;
        }
        
        if (i < 5) { // 只顯示前5個結果
            console.log(`   [${i}]: ${inputA[i].toFixed(2)} + ${inputB[i].toFixed(2)} = ${actual.toFixed(2)} (期望: ${expected.toFixed(2)})`);
        }
    }
    
    readBuffer.unmap();
    
    console.log(`   ✅ 向量加法測試: ${correctResults}/10 個結果正確`);
    
    if (correctResults < 8) {
        throw new Error('GPU計算結果不正確');
    }
}

// 運行測試
testWebGPUBasic().catch(console.error);