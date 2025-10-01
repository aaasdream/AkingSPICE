// 直接從源代碼導入測試
import { ExplicitStateSolver } from '../src/core/explicit-state-solver.js';
import { GPUExplicitStateSolver } from '../src/core/gpu-explicit-solver.js';
import { VoltageSource } from '../src/components/sources.js';
import { Resistor } from '../src/components/resistor.js';
import { Capacitor } from '../src/components/capacitor.js';

console.log('🔍 CPU vs GPU 核心問題分析');
console.log('='.repeat(50));

async function runBasicTest() {
    try {
        // 創建簡單RC電路
        const components = [
            new VoltageSource('V1', ['in', 'gnd'], 5),   // 5V電壓源
            new Resistor('R1', ['in', 'out'], 1000),     // 1kΩ電阻  
            new Capacitor('C1', ['out', 'gnd'], 1e-6, { ic: 0 })  // 1μF電容
        ];
        
        const dt = 1e-5;
        const steps = 3;
        
        console.log('\n📋 電路: 5V -> 1kΩ -> 1μF');
        console.log('📊 時間步長:', dt);
        
        // CPU測試
        console.log('\n💻 CPU求解器:');
        const cpuSolver = new ExplicitStateSolver();
        await cpuSolver.initialize(components, dt);
        
        for (let i = 0; i < steps; i++) {
            const result = await cpuSolver.step();
            console.log(`  t=${i*dt}: Vc=${result.stateVector[0].toFixed(6)}V`);
        }
        
        // GPU測試
        console.log('\n🚀 GPU求解器:');
        const gpuSolver = new GPUExplicitStateSolver();
        await gpuSolver.initialize(components, dt);
        
        for (let i = 0; i < steps; i++) {
            const result = await gpuSolver.step();
            console.log(`  t=${i*dt}: Vc=${result.stateVector[0].toFixed(6)}V`);
        }
        
        console.log('\n✅ 測試完成');
        
    } catch (error) {
        console.error('❌ 測試失敗:', error.message);
        console.error('錯誤堆棧:', error.stack);
    }
}

runBasicTest();