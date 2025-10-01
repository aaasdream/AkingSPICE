/**
 * GPU數值穩定性診斷測試
 */

import { GPUExplicitStateSolver } from '../src/core/gpu-explicit-solver.js';
import { ExplicitStateSolver } from '../src/core/explicit-state-solver.js';
import { VoltageSource } from '../src/components/sources.js';
import { Resistor } from '../src/components/resistor.js';
import { Capacitor } from '../src/components/capacitor.js';

async function testBasicRC() {
    console.log('🔬 診斷基本RC電路數值穩定性...');
    
    try {
        // 非常簡單的RC電路
        const components = [
            new VoltageSource('Vin', ['input', 'gnd'], 'DC(5)'),
            new Resistor('R1', ['input', 'output'], 1000), // 1kΩ
            new Capacitor('C1', ['output', 'gnd'], 1e-6, { ic: 0 }) // 1µF
        ];
        
        console.log('   電路: 5V -> 1kΩ -> 1µF');
        console.log('   時間常數 τ = RC = 1ms');
        
        // CPU測試
        console.log('\n   CPU求解器:');
        const cpuSolver = new ExplicitStateSolver();
        await cpuSolver.initialize(components, 1e-5, { debug: true }); // 10µs步長
        const cpuResults = await cpuSolver.run(0, 100e-6); // 100µs (0.1τ)
        
        const cpuFinalV = cpuResults.nodeVoltages['output']?.slice(-1)[0] || 0;
        console.log(`   CPU最終電壓: ${cpuFinalV.toFixed(6)}V`);
        
        // GPU測試  
        console.log('\n   GPU求解器:');
        const gpuSolver = new GPUExplicitStateSolver();
        await gpuSolver.initialize(components, 1e-5, { debug: true });
        const gpuResults = await gpuSolver.run(0, 100e-6);
        
        const gpuFinalV = gpuResults.nodeVoltages['output']?.slice(-1)[0] || 0;
        console.log(`   GPU最終電壓: ${gpuFinalV.toFixed(6)}V`);
        
        // 理論值 (RC充電: V(t) = Vin*(1-e^(-t/τ)))
        const t = 100e-6;
        const tau = 1000 * 1e-6; // RC = 1ms
        const theoretical = 5 * (1 - Math.exp(-t/tau));
        console.log(`   理論值: ${theoretical.toFixed(6)}V`);
        
        // 誤差分析
        const cpuError = Math.abs(cpuFinalV - theoretical) / theoretical * 100;
        const gpuError = Math.abs(gpuFinalV - theoretical) / theoretical * 100;
        
        console.log(`\n   誤差分析:`);
        console.log(`   CPU誤差: ${cpuError.toFixed(3)}%`);
        console.log(`   GPU誤差: ${gpuError.toFixed(3)}%`);
        
        if (cpuError < 5 && gpuError < 5) {
            console.log('   ✅ 數值穩定性測試通過');
            return true;
        } else {
            console.log('   ❌ 數值不穩定');
            return false;
        }
        
    } catch (error) {
        console.error(`   💥 測試異常: ${error.message}`);
        return false;
    }
}

async function main() {
    console.log('🚀 GPU數值穩定性診斷');
    console.log('=' .repeat(50));
    
    const success = await testBasicRC();
    
    if (success) {
        console.log('\n🎉 GPU求解器數值穩定！');
    } else {
        console.log('\n⚠️ GPU求解器需要數值調校');
    }
}

main().catch(console.error);