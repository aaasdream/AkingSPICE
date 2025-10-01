/**
 * WebGPU Float64支援檢測測試
 * 檢查當前WebGPU實現是否支援64位雙精度浮點數
 */

import { create, globals } from 'webgpu';

async function checkWebGPUFloat64Support() {
    console.log('🔍 WebGPU Float64 支援檢測');
    console.log('=====================================');
    
    try {
        // 初始化WebGPU
        const gpu = create([]);
        Object.assign(globalThis, globals);
        
        const adapter = await gpu.requestAdapter();
        if (!adapter) {
            console.log('❌ 無法獲取WebGPU適配器');
            return;
        }
        
        console.log('✅ WebGPU適配器資訊:');
        console.log(`   描述: ${adapter.info.description}`);
        console.log(`   供應商: ${adapter.info.vendor}`);
        console.log(`   架構: ${adapter.info.architecture}`);
        console.log('');
        
        // 檢查支援的功能
        console.log('📋 支援的功能 (Features):');
        const features = Array.from(adapter.features);
        features.forEach(feature => {
            console.log(`   ✓ ${feature}`);
        });
        console.log('');
        
        // 檢查限制
        console.log('📏 設備限制 (Limits):');
        const limits = adapter.limits;
        console.log(`   最大工作組大小: ${limits.maxComputeWorkgroupSizeX}`);
        console.log(`   最大儲存緩衝區大小: ${limits.maxStorageBufferBindingSize}`);
        console.log(`   最大工作組共享記憶體: ${limits.maxComputeWorkgroupStorageSize}`);
        console.log('');
        
        // 檢查是否支援shader-f16功能
        const hasShaderF16 = adapter.features.has('shader-f16');
        console.log(`🔢 Shader F16 支援: ${hasShaderF16 ? '✅ 支援' : '❌ 不支援'}`);
        
        // WebGPU目前不直接支援f64，但我們可以檢查相關功能
        console.log('');
        console.log('🎯 Float64 支援狀況:');
        console.log('   WebGPU 1.0標準: ❌ 不支援原生f64');
        console.log('   WGSL語言: ❌ 目前只支援f32和f16');
        console.log('   未來計劃: 🔄 可能在WebGPU 2.0中加入');
        
        // 測試創建設備
        const device = await adapter.requestDevice({
            requiredFeatures: hasShaderF16 ? ['shader-f16'] : [],
            requiredLimits: {}
        });
        
        console.log('');
        console.log('💡 替代方案:');
        console.log('   1️⃣ 雙f32模擬f64 (軟體實現)');
        console.log('   2️⃣ 使用f16獲得更好的記憶體效率');
        console.log('   3️⃣ 混合精度計算 (關鍵部分用CPU)');
        
        // 測試創建一個簡單的著色器來確認精度類型
        console.log('');
        console.log('🧪 測試WGSL精度類型:');
        
        const testShaderWGSL = `
            @group(0) @binding(0) var<storage, read> input: array<f32>;
            @group(0) @binding(1) var<storage, read_write> output: array<f32>;
            
            @compute @workgroup_size(1)
            fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
                let idx = global_id.x;
                if (idx >= arrayLength(&input)) {
                    return;
                }
                
                // 測試f32精度
                let value = input[idx];
                let precise_calc = value * 1.0000000001; // 需要高精度的計算
                output[idx] = precise_calc;
            }
        `;
        
        try {
            const shaderModule = device.createShaderModule({
                label: 'Precision Test Shader',
                code: testShaderWGSL,
            });
            console.log('   ✅ F32著色器編譯成功');
        } catch (error) {
            console.log(`   ❌ 著色器編譯失敗: ${error.message}`);
        }
        
        // 如果支援f16，測試f16著色器
        if (hasShaderF16) {
            const f16ShaderWGSL = `
                enable f16;
                
                @group(0) @binding(0) var<storage, read> input: array<f16>;
                @group(0) @binding(1) var<storage, read_write> output: array<f16>;
                
                @compute @workgroup_size(1)
                fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
                    let idx = global_id.x;
                    if (idx >= arrayLength(&input)) {
                        return;
                    }
                    
                    output[idx] = input[idx] * 2.0h;
                }
            `;
            
            try {
                const f16ShaderModule = device.createShaderModule({
                    label: 'F16 Test Shader',
                    code: f16ShaderWGSL,
                });
                console.log('   ✅ F16著色器編譯成功');
            } catch (error) {
                console.log(`   ❌ F16著色器編譯失敗: ${error.message}`);
            }
        }
        
        console.log('');
        console.log('🏆 結論:');
        console.log('   WebGPU目前不支援原生Float64 (f64)');
        console.log('   建議使用改進的f32實現或混合精度策略');
        console.log('   對於大多數電路仿真應用，優化的f32已足夠');
        
    } catch (error) {
        console.error('❌ WebGPU檢測失敗:', error.message);
    }
}

// 執行檢測
checkWebGPUFloat64Support().catch(console.error);