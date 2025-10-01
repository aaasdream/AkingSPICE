/**
 * 簡化的LLC WebGPU測試
 */

import { GPUExplicitStateSolver } from '../src/core/gpu-explicit-solver.js';
import { ExplicitStateSolver } from '../src/core/explicit-state-solver.js';
import { VoltageSource } from '../src/components/sources.js';
import { Resistor } from '../src/components/resistor.js';
import { Capacitor } from '../src/components/capacitor.js';
import { Inductor } from '../src/components/inductor.js';

async function main() {
    console.log('🚀 簡化LLC WebGPU測試');
    console.log('=' .repeat(40));
    
    try {
        console.log('🔬 測試基本LC諧振電路...');
        
        // 簡單的LC諧振電路
        const L = 47e-6; // 47µH
        const C = 100e-9; // 100nF
        const fr = 1 / (2 * Math.PI * Math.sqrt(L * C)); // 諧振頻率
        
        console.log(`   L=${L*1e6}µH, C=${C*1e9}nF, fr=${(fr/1000).toFixed(1)}kHz`);
        
        const components = [
            // DC電壓源激勵
            new VoltageSource('Vin', ['input', 'gnd'], 'DC(24)'),
            
            // 電感
            new Inductor('L1', ['input', 'lc_node'], L, { ic: 0 }),
            
            // 電容
            new Capacitor('C1', ['lc_node', 'gnd'], C, { ic: 0 }),
            
            // 負載電阻
            new Resistor('R1', ['lc_node', 'gnd'], 10.0)
        ];
        
        // CPU測試
        console.log('   CPU仿真...');
        const cpuSolver = new ExplicitStateSolver();
        await cpuSolver.initialize(components, 100e-9, { debug: false });
        const cpuStart = performance.now();
        const cpuResults = await cpuSolver.run(0, 10e-6); // 10µs
        const cpuTime = performance.now() - cpuStart;
        
        console.log(`   CPU完成: ${cpuTime.toFixed(2)}ms, 節點數: ${Object.keys(cpuResults.nodeVoltages).length}`);
        
        // GPU測試
        console.log('   GPU仿真...');
        const gpuSolver = new GPUExplicitStateSolver();
        await gpuSolver.initialize(components, 100e-9, { debug: false });
        const gpuStart = performance.now();
        const gpuResults = await gpuSolver.run(0, 10e-6);
        const gpuTime = performance.now() - gpuStart;
        
        console.log(`   GPU完成: ${gpuTime.toFixed(2)}ms, 節點數: ${Object.keys(gpuResults.nodeVoltages).length}`);
        
        // 結果比較
        console.log('   結果比較...');
        const speedup = cpuTime / gpuTime;
        console.log(`   🚀 GPU加速比: ${speedup.toFixed(2)}x`);
        
        // 驗證電壓值
        if (cpuResults.nodeVoltages['lc_node'] && gpuResults.nodeVoltages['lc_node']) {
            const cpuFinal = cpuResults.nodeVoltages['lc_node'].slice(-1)[0];
            const gpuFinal = gpuResults.nodeVoltages['lc_node'].slice(-1)[0];
            const error = Math.abs(cpuFinal - gpuFinal) / Math.abs(cpuFinal) * 100;
            
            console.log(`   電壓比較: CPU=${cpuFinal.toFixed(6)}V, GPU=${gpuFinal.toFixed(6)}V`);
            console.log(`   誤差: ${error.toFixed(3)}%`);
            
            if (error < 1.0) {
                console.log('   ✅ LLC WebGPU基礎測試通過！');
                return true;
            } else {
                console.log('   ❌ 誤差過大');
                return false;
            }
        } else {
            console.log('   ❌ 節點電壓數據缺失');
            return false;
        }
        
    } catch (error) {
        console.error('   💥 測試異常:', error.message);
        return false;
    }
}

main().then(success => {
    if (success) {
        console.log('\n🎉 LLC WebGPU基礎功能驗證成功！');
    } else {
        console.log('\n⚠️ LLC WebGPU測試需要調試');
    }
}).catch(error => {
    console.error('💥 測試套件異常:', error);
    process.exit(1);
});