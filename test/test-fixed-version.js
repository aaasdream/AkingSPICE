// 測試修復後的CPU vs GPU一致性
import { ExplicitStateSolver } from '../src/core/explicit-state-solver.js';
import { GPUExplicitStateSolver } from '../src/core/gpu-explicit-solver.js';
import { VoltageSource } from '../src/components/sources.js';
import { Resistor } from '../src/components/resistor.js';
import { Capacitor } from '../src/components/capacitor.js';

console.log('🔧 測試修復後的CPU vs GPU一致性');
console.log('='.repeat(50));

async function testFixedVersion() {
    try {
        // 創建RC電路
        const components = [
            new VoltageSource('V1', ['in', 'gnd'], 5),     
            new Resistor('R1', ['in', 'out'], 1000),       
            new Capacitor('C1', ['out', 'gnd'], 1e-6, { ic: 0 })  
        ];
        
        const dt = 1e-5;
        const steps = 5;
        
        console.log('📋 電路: RC充電電路 (5V, 1kΩ, 1μF)');
        console.log('⏰ 時間步長:', dt);
        
        // CPU測試
        console.log('\n💻 CPU求解器:');
        const cpuSolver = new ExplicitStateSolver();
        await cpuSolver.initialize(components, dt);
        
        const cpuResults = [];
        for (let i = 0; i < steps; i++) {
            const result = await cpuSolver.step();
            const vcap = result.stateVariables.get('C1');
            cpuResults.push(vcap);
            console.log(`  步驟${i}: Vc=${vcap.toFixed(8)}V`);
        }
        
        // GPU測試  
        console.log('\n🚀 GPU求解器:');
        const gpuSolver = new GPUExplicitStateSolver({ debug: true });
        await gpuSolver.initialize(components, dt);
        
        const gpuResults = [];
        for (let i = 0; i < steps; i++) {
            const result = await gpuSolver.step();
            const vcap = result.stateVariables.get('C1'); // 現在使用統一的格式
            gpuResults.push(vcap);
            console.log(`  步驟${i}: Vc=${vcap.toFixed(8)}V`);
        }
        
        // 對比分析
        console.log('\n📊 修復後對比:');
        console.log('-'.repeat(40));
        
        let maxError = 0;
        let totalError = 0;
        
        for (let i = 0; i < steps; i++) {
            const error = Math.abs((gpuResults[i] - cpuResults[i]) / cpuResults[i] * 100);
            maxError = Math.max(maxError, error);
            totalError += error;
            
            const status = error < 0.01 ? '🟢' : error < 0.1 ? '🟡' : error < 1 ? '🟠' : '🔴';
            console.log(`步驟${i}: 誤差=${error.toFixed(4)}% ${status}`);
        }
        
        const avgError = totalError / steps;
        
        console.log('\n🎯 修復效果評估:');
        console.log(`  最大誤差: ${maxError.toFixed(4)}%`);
        console.log(`  平均誤差: ${avgError.toFixed(4)}%`);
        
        if (maxError < 0.01) {
            console.log('  ✅ 完美一致 (誤差<0.01%)');
        } else if (maxError < 0.1) {
            console.log('  🟢 優秀 (誤差<0.1%)');
        } else if (maxError < 1) {
            console.log('  🟡 良好 (誤差<1%)');
        } else {
            console.log('  🟠 仍需改進 (誤差>1%)');
        }
        
        // 時間步長敏感性測試
        console.log('\n⏱️ 時間步長敏感性測試:');
        await testTimestepSensitivity(components);
        
    } catch (error) {
        console.error('❌ 測試失敗:', error.message);
        console.error(error.stack);
    }
}

async function testTimestepSensitivity(components) {
    const timesteps = [1e-3, 1e-4, 1e-5];
    
    for (const dt of timesteps) {
        console.log(`\n  測試 dt=${dt}:`);
        
        try {
            // CPU
            const cpuSolver = new ExplicitStateSolver();
            await cpuSolver.initialize([...components], dt);
            const cpuResult = await cpuSolver.step();
            const cpuValue = cpuResult.stateVariables.get('C1');
            
            // GPU
            const gpuSolver = new GPUExplicitStateSolver();
            await gpuSolver.initialize([...components], dt);
            const gpuResult = await gpuSolver.step();
            const gpuValue = gpuResult.stateVariables.get('C1');
            
            const error = Math.abs((gpuValue - cpuValue) / cpuValue * 100);
            const status = error < 1 ? '✅' : error < 10 ? '⚠️' : '❌';
            
            console.log(`    CPU=${cpuValue.toExponential(6)}, GPU=${gpuValue.toExponential(6)}, 誤差=${error.toFixed(2)}% ${status}`);
            
        } catch (err) {
            console.log(`    ❌ dt=${dt} 測試失敗: ${err.message}`);
        }
    }
}

// 運行測試
testFixedVersion();