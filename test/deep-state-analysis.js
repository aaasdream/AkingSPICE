// 深度分析CPU vs GPU狀態更新差異
import { ExplicitStateSolver } from '../src/core/explicit-state-solver.js';
import { GPUExplicitStateSolver } from '../src/core/gpu-explicit-solver.js';
import { VoltageSource } from '../src/components/sources.js';
import { Resistor } from '../src/components/resistor.js';
import { Capacitor } from '../src/components/capacitor.js';

console.log('🔬 深度分析CPU vs GPU狀態更新差異');
console.log('='.repeat(60));

async function analyzeStateUpdateDifferences() {
    try {
        // 創建測試電路：RC電路
        const components = [
            new VoltageSource('V1', ['in', 'gnd'], 5),     // 5V電壓源
            new Resistor('R1', ['in', 'out'], 1000),       // 1kΩ電阻  
            new Capacitor('C1', ['out', 'gnd'], 1e-6, { ic: 0 })  // 1μF電容
        ];
        
        const dt = 1e-5;
        const steps = 5;
        
        console.log('📋 測試電路: 5V -> 1kΩ -> 1μF (RC電路)');
        console.log('⏰ 時間步長:', dt);
        console.log('🔄 步數:', steps);
        
        // CPU求解器測試
        console.log('\n💻 CPU求解器詳細分析');
        console.log('-'.repeat(40));
        
        const cpuSolver = new ExplicitStateSolver({ debug: true });
        await cpuSolver.initialize(components, dt);
        
        const cpuResults = [];
        
        for (let i = 0; i < steps; i++) {
            console.log(`\n▶️ CPU步驟 ${i}:`);
            const cpuResult = await cpuSolver.step();
            
            // 從stateVariables Map中提取C1的電壓
            const c1Voltage = cpuResult.stateVariables.get('C1');
            cpuResults.push(c1Voltage);
            
            console.log(`  時間: ${cpuResult.time.toExponential(3)}s`);
            console.log(`  C1電壓: ${c1Voltage.toFixed(8)}V`);
            console.log(`  返回格式: stateVariables (Map)`);
            
            // 檢查節點電壓
            console.log(`  節點電壓: out=${cpuResult.nodeVoltages.get('out').toFixed(8)}V`);
        }
        
        // GPU求解器測試
        console.log('\n🚀 GPU求解器詳細分析');
        console.log('-'.repeat(40));
        
        const gpuSolver = new GPUExplicitStateSolver({ debug: true });
        await gpuSolver.initialize(components, dt);
        
        const gpuResults = [];
        
        for (let i = 0; i < steps; i++) {
            console.log(`\n▶️ GPU步驟 ${i}:`);
            const gpuResult = await gpuSolver.step();
            
            // 從stateVector Array中提取C1的電壓  
            const c1Voltage = gpuResult.stateVector[0];  // 第一個狀態變量
            gpuResults.push(c1Voltage);
            
            console.log(`  時間: ${gpuResult.time.toExponential(3)}s`);
            console.log(`  C1電壓: ${c1Voltage.toFixed(8)}V`);
            console.log(`  返回格式: stateVector (Array)`);
            
            // 檢查節點電壓
            console.log(`  節點電壓: out=${gpuResult.nodeVoltages.out.toFixed(8)}V`);
        }
        
        // 詳細對比分析
        console.log('\n📊 詳細對比分析');
        console.log('='.repeat(60));
        
        let maxError = 0;
        let avgError = 0;
        
        for (let i = 0; i < steps; i++) {
            const cpuValue = cpuResults[i];
            const gpuValue = gpuResults[i];
            const error = Math.abs((gpuValue - cpuValue) / cpuValue * 100);
            const diff = gpuValue - cpuValue;
            
            maxError = Math.max(maxError, error);
            avgError += error;
            
            const status = error < 0.1 ? '✅' : error < 1 ? '⚠️' : error < 10 ? '🟡' : '❌';
            
            console.log(`步驟${i}: CPU=${cpuValue.toFixed(8)}V, GPU=${gpuValue.toFixed(8)}V`);
            console.log(`        差值=${diff.toExponential(3)}V, 誤差=${error.toFixed(3)}% ${status}`);
        }
        
        avgError /= steps;
        
        console.log('\n🎯 診斷結果:');
        console.log(`  最大誤差: ${maxError.toFixed(3)}%`);
        console.log(`  平均誤差: ${avgError.toFixed(3)}%`);
        
        if (maxError < 0.1) {
            console.log('  ✅ 結果高度一致 (<0.1%)');
        } else if (maxError < 1) {
            console.log('  ⚠️ 輕微差異 (0.1-1%)');
            console.log('  💡 可能原因: 浮點精度差異');
        } else if (maxError < 10) {
            console.log('  🟡 中等差異 (1-10%)');
            console.log('  🔧 需要檢查狀態更新算法');
        } else {
            console.log('  ❌ 顯著差異 (>10%)');
            console.log('  🚨 狀態更新算法存在根本性差異');
        }
        
        // 分析狀態更新算法差異
        console.log('\n🔍 狀態更新算法分析:');
        await analyzeAlgorithmDifferences();
        
    } catch (error) {
        console.error('❌ 測試失敗:', error.message);
        console.error('堆棧:', error.stack);
    }
}

async function analyzeAlgorithmDifferences() {
    console.log('\n📝 算法實現對比:');
    console.log('CPU實現:');
    console.log('  - 電容電流: Ic = (V_node - Vc) * 1e6');
    console.log('  - 狀態導數: dVc/dt = Ic / C');
    console.log('  - 積分: Vc += dt * dVc/dt (前向歐拉)');
    
    console.log('GPU實現:');
    console.log('  - 電容電流: Ic = (V_node - Vc) * 1e6');
    console.log('  - 狀態導數: dVc/dt = Ic / C'); 
    console.log('  - 積分: Vc += dt * dVc/dt (前向歐拉)');
    
    console.log('\n💡 理論上兩者應該完全一致...');
    console.log('🔍 實際差異可能來源:');
    console.log('  1. 浮點精度 (f32 vs f64)');
    console.log('  2. 節點電壓讀取方式不同');
    console.log('  3. 狀態變量初始化差異');
    console.log('  4. 時間累積誤差');
}

// 運行測試
analyzeStateUpdateDifferences();