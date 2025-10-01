/**
 * 簡化的WebGPU驗算測試
 * 先測試CPU vs CPU求解器是否正常工作
 */

import { ExplicitStateSolver } from '../src/core/explicit-state-solver.js';
import { VoltageSource } from '../src/components/sources.js';
import { Resistor } from '../src/components/resistor.js';
import { Capacitor } from '../src/components/capacitor.js';

async function testCPUBaseline() {
    console.log('🔬 測試CPU基準線...');
    
    try {
        // 創建簡單RC電路
        const components = [
            new VoltageSource('V1', ['in', 'gnd'], 'DC(5)'),
            new Resistor('R1', ['in', 'out'], 1000),
            new Capacitor('C1', ['out', 'gnd'], 100e-6, { ic: 0 })
        ];

        console.log('   初始化CPU求解器...');
        const solver = new ExplicitStateSolver();
        await solver.initialize(components, 1e-5, { debug: false });
        
        console.log('   運行仿真...');
        const results = await solver.run(0, 1e-3);  // 1ms
        
        console.log('   分析結果...');
        console.log(`   時間點數: ${results.timeVector.length}`);
        console.log(`   節點數: ${Object.keys(results.nodeVoltages).length}`);
        
        // 檢查電容充電
        const outVoltages = results.nodeVoltages['out'] || results.nodeVoltages[Object.keys(results.nodeVoltages)[0]];
        if (outVoltages && outVoltages.length > 10) {
            const initialV = outVoltages[0];
            const finalV = outVoltages[outVoltages.length - 1];
            console.log(`   電容電壓: ${initialV.toFixed(6)}V → ${finalV.toFixed(6)}V`);
            console.log('   ✅ CPU基準線測試成功');
            return true;
        } else {
            console.log('   ❌ 沒有獲得有效的仿真結果');
            return false;
        }
        
    } catch (error) {
        console.log(`   ❌ CPU測試失敗: ${error.message}`);
        console.log(`   堆棧: ${error.stack}`);
        return false;
    }
}

async function testWebGPUAvailability() {
    console.log('🔬 測試WebGPU可用性...');
    
    try {
        // 嘗試導入WebGPU相關模塊
        const { create, globals } = await import('webgpu');
        console.log('   ✅ WebGPU模塊導入成功');
        
        // 嘗試創建GPU實例
        const gpu = create([]);
        Object.assign(globalThis, globals);
        console.log('   ✅ WebGPU實例創建成功');
        
        // 嘗試請求適配器
        const adapter = await gpu.requestAdapter();
        if (adapter) {
            console.log('   ✅ WebGPU適配器獲取成功');
            console.log(`   適配器信息: ${adapter.info?.description || 'Unknown'}`);
            
            // 嘗試請求設備
            try {
                const device = await adapter.requestDevice({
                    requiredFeatures: [],
                    requiredLimits: {}
                });
                console.log('   ✅ WebGPU設備創建成功');
                device.destroy();
                return true;
            } catch (deviceError) {
                console.log(`   ❌ WebGPU設備創建失敗: ${deviceError.message}`);
                return false;
            }
        } else {
            console.log('   ❌ 無法獲取WebGPU適配器');
            return false;
        }
        
    } catch (error) {
        console.log(`   ❌ WebGPU不可用: ${error.message}`);
        return false;
    }
}

async function testGPUSolver() {
    console.log('🔬 測試GPU求解器...');
    
    try {
        const { GPUExplicitStateSolver } = await import('../src/core/gpu-explicit-solver.js');
        
        // 創建測試電路
        const components = [
            new VoltageSource('V1', ['in', 'gnd'], 'DC(5)'),
            new Resistor('R1', ['in', 'out'], 1000),
            new Capacitor('C1', ['out', 'gnd'], 100e-6, { ic: 0 })
        ];

        console.log('   初始化GPU求解器...');
        const gpuSolver = new GPUExplicitStateSolver({ debug: true });
        await gpuSolver.initialize(components, 1e-5, { debug: true });
        
        console.log('   運行GPU仿真...');
        const gpuResults = await gpuSolver.run(0, 1e-4);  // 100μs 較短時間
        
        console.log('   GPU仿真結果分析...');
        console.log(`   時間點數: ${gpuResults.timeVector.length}`);
        console.log(`   節點數: ${Object.keys(gpuResults.nodeVoltages).length}`);
        
        if (gpuResults.timeVector.length > 5) {
            console.log('   ✅ GPU求解器測試成功');
            return gpuResults;
        } else {
            console.log('   ❌ GPU求解器結果不足');
            return null;
        }
        
    } catch (error) {
        console.log(`   ❌ GPU求解器測試失敗: ${error.message}`);
        console.log(`   堆棧: ${error.stack}`);
        return null;
    }
}

async function compareCPUGPUResults() {
    console.log('🔬 CPU vs GPU 結果對比...');
    
    try {
        const components = [
            new VoltageSource('V1', ['in', 'gnd'], 'DC(5)'),
            new Resistor('R1', ['in', 'out'], 1000),
            new Capacitor('C1', ['out', 'gnd'], 100e-6, { ic: 0 })
        ];

        const timeStep = 1e-5;
        const simTime = 1e-4;  // 100μs

        // CPU求解
        console.log('   運行CPU仿真...');
        const cpuSolver = new ExplicitStateSolver();
        await cpuSolver.initialize(components, timeStep, { debug: false });
        const cpuResults = await cpuSolver.run(0, simTime);

        // GPU求解 
        console.log('   運行GPU仿真...');
        const { GPUExplicitStateSolver } = await import('../src/core/gpu-explicit-solver.js');
        const gpuSolver = new GPUExplicitStateSolver({ debug: false });
        await gpuSolver.initialize(components, timeStep, { debug: false });
        const gpuResults = await gpuSolver.run(0, simTime);

        // 結果比較
        console.log('   比較結果...');
        console.log(`   CPU時間點: ${cpuResults.timeVector.length}`);
        console.log(`   GPU時間點: ${gpuResults.timeVector.length}`);
        
        if (cpuResults.nodeVoltages && gpuResults.nodeVoltages) {
            const cpuNodes = Object.keys(cpuResults.nodeVoltages);
            const gpuNodes = Object.keys(gpuResults.nodeVoltages);
            console.log(`   CPU節點: [${cpuNodes.join(', ')}]`);
            console.log(`   GPU節點: [${gpuNodes.join(', ')}]`);
            
            // 比較第一個節點的電壓
            if (cpuNodes.length > 0 && gpuNodes.length > 0) {
                const cpuVoltages = cpuResults.nodeVoltages[cpuNodes[0]];
                const gpuVoltages = gpuResults.nodeVoltages[gpuNodes[0]];
                
                if (cpuVoltages && gpuVoltages && cpuVoltages.length > 5 && gpuVoltages.length > 5) {
                    const samples = Math.min(5, cpuVoltages.length, gpuVoltages.length);
                    console.log('   電壓對比 (前5個點):');
                    
                    let maxError = 0;
                    for (let i = 0; i < samples; i++) {
                        const cpuV = cpuVoltages[i];
                        const gpuV = gpuVoltages[i];
                        const error = Math.abs(cpuV - gpuV);
                        const relError = error / (Math.abs(cpuV) + 1e-12) * 100;
                        maxError = Math.max(maxError, relError);
                        
                        console.log(`   t=${i}: CPU=${cpuV.toFixed(6)}V, GPU=${gpuV.toFixed(6)}V, 誤差=${relError.toFixed(3)}%`);
                    }
                    
                    if (maxError < 1) {  // 1%容差
                        console.log('   ✅ CPU vs GPU 結果一致');
                        return true;
                    } else {
                        console.log(`   ⚠️  最大誤差 ${maxError.toFixed(3)}% 超出容差`);
                        return false;
                    }
                }
            }
        }
        
        console.log('   ❌ 無法比較CPU和GPU結果');
        return false;
        
    } catch (error) {
        console.log(`   ❌ CPU vs GPU 比較失敗: ${error.message}`);
        return false;
    }
}

async function main() {
    console.log('🚀 WebGPU驗算測試套件');
    console.log('=' .repeat(50));
    
    let testsPassed = 0;
    const totalTests = 4;
    
    // 測試1: CPU基準線
    if (await testCPUBaseline()) {
        testsPassed++;
    }
    console.log('');
    
    // 測試2: WebGPU可用性
    const webgpuAvailable = await testWebGPUAvailability();
    if (webgpuAvailable) {
        testsPassed++;
    }
    console.log('');
    
    if (!webgpuAvailable) {
        console.log('❌ WebGPU不可用，跳過GPU相關測試');
        console.log(`\n總結: ${testsPassed}/${totalTests} 測試通過`);
        return;
    }
    
    // 測試3: GPU求解器
    const gpuResult = await testGPUSolver();
    if (gpuResult) {
        testsPassed++;
    }
    console.log('');
    
    // 測試4: CPU vs GPU 比較
    if (gpuResult && await compareCPUGPUResults()) {
        testsPassed++;
    }
    
    console.log('=' .repeat(50));
    console.log(`📊 測試總結: ${testsPassed}/${totalTests} 通過 (${(testsPassed/totalTests*100).toFixed(1)}%)`);
    
    if (testsPassed === totalTests) {
        console.log('🎉 所有WebGPU驗算測試通過！');
    } else {
        console.log('⚠️  部分測試失敗，需要進一步調試');
    }
}

main().catch(error => {
    console.error('💥 測試套件異常終止:', error);
    process.exit(1);
});