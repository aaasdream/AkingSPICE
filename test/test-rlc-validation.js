// RLC電路CPU vs GPU驗證測試
import { ExplicitStateSolver } from '../src/core/explicit-state-solver.js';
import { GPUExplicitStateSolver } from '../src/core/gpu-explicit-solver.js';
import { VoltageSource } from '../src/components/sources.js';
import { Resistor } from '../src/components/resistor.js';
import { Capacitor } from '../src/components/capacitor.js';
import { Inductor } from '../src/components/inductor.js';

console.log('🔬 RLC電路CPU vs GPU驗證測試');
console.log('='.repeat(60));

async function testRLCCircuit() {
    try {
        // 創建RLC串聯電路
        // 5V -> 10Ω -> 1mH -> 1μF -> GND
        const components = [
            new VoltageSource('V1', ['vin', 'gnd'], 5),        // 5V電壓源
            new Resistor('R1', ['vin', 'n1'], 10),             // 10Ω電阻
            new Inductor('L1', ['n1', 'n2'], 1e-3, { ic: 0 }), // 1mH電感，初始電流0A
            new Capacitor('C1', ['n2', 'gnd'], 1e-6, { ic: 0 }) // 1μF電容，初始電壓0V
        ];
        
        // RLC電路特性計算
        const L = 1e-3;   // 電感 1mH
        const C = 1e-6;   // 電容 1μF  
        const R = 10;     // 電阻 10Ω
        
        const omega0 = 1 / Math.sqrt(L * C);  // 固有角頻率
        const f0 = omega0 / (2 * Math.PI);    // 固有頻率
        const zeta = R / 2 * Math.sqrt(C / L); // 阻尼比
        
        console.log('📋 RLC電路參數:');
        console.log(`  電阻: R = ${R}Ω`);
        console.log(`  電感: L = ${L * 1000}mH`);
        console.log(`  電容: C = ${C * 1e6}μF`);
        console.log(`  固有頻率: f₀ = ${(f0 / 1000).toFixed(2)}kHz`);
        console.log(`  阻尼比: ζ = ${zeta.toFixed(3)}`);
        
        if (zeta < 1) {
            console.log('  電路類型: 欠阻尼 (振蕩響應)');
        } else if (zeta === 1) {
            console.log('  電路類型: 臨界阻尼');
        } else {
            console.log('  電路類型: 過阻尼');
        }
        
        const dt = 1e-6;  // 1μs時間步長
        const steps = 20;
        
        console.log(`⏰ 時間步長: ${dt * 1e6}μs`);
        console.log(`🔄 仿真步數: ${steps}`);
        
        // CPU測試
        console.log('\n💻 CPU求解器結果:');
        console.log('-'.repeat(40));
        
        const cpuSolver = new ExplicitStateSolver();
        await cpuSolver.initialize(components, dt);
        
        const cpuResults = [];
        
        for (let i = 0; i < steps; i++) {
            const result = await cpuSolver.step();
            
            // 獲取狀態變量：L1電流和C1電壓
            const iL = result.stateVariables.get('L1');  // 電感電流
            const vC = result.stateVariables.get('C1');  // 電容電壓
            
            cpuResults.push({ iL, vC, time: result.time });
            
            if (i < 10 || i % 5 === 0) {
                console.log(`  t=${(result.time * 1e6).toFixed(1)}μs: IL=${iL.toFixed(6)}A, VC=${vC.toFixed(6)}V`);
            }
        }
        
        // GPU測試
        console.log('\n🚀 GPU求解器結果:');
        console.log('-'.repeat(40));
        
        const gpuSolver = new GPUExplicitStateSolver({ debug: false });
        await gpuSolver.initialize(components, dt);
        
        const gpuResults = [];
        
        for (let i = 0; i < steps; i++) {
            const result = await gpuSolver.step();
            
            // 獲取狀態變量
            const iL = result.stateVariables.get('L1');
            const vC = result.stateVariables.get('C1');
            
            gpuResults.push({ iL, vC, time: result.time });
            
            if (i < 10 || i % 5 === 0) {
                console.log(`  t=${(result.time * 1e6).toFixed(1)}μs: IL=${iL.toFixed(6)}A, VC=${vC.toFixed(6)}V`);
            }
        }
        
        // 詳細對比分析
        console.log('\n📊 CPU vs GPU 詳細對比:');
        console.log('='.repeat(60));
        
        let maxErrorIL = 0, maxErrorVC = 0;
        let avgErrorIL = 0, avgErrorVC = 0;
        
        console.log('時間(μs)  |  電感電流誤差  |  電容電壓誤差  | 狀態');
        console.log('-'.repeat(60));
        
        for (let i = 0; i < Math.min(steps, 15); i++) {
            const cpu = cpuResults[i];
            const gpu = gpuResults[i];
            
            const errorIL = Math.abs((gpu.iL - cpu.iL) / (Math.abs(cpu.iL) + 1e-12) * 100);
            const errorVC = Math.abs((gpu.vC - cpu.vC) / (Math.abs(cpu.vC) + 1e-12) * 100);
            
            maxErrorIL = Math.max(maxErrorIL, errorIL);
            maxErrorVC = Math.max(maxErrorVC, errorVC);
            avgErrorIL += errorIL;
            avgErrorVC += errorVC;
            
            const statusIL = errorIL < 0.01 ? '🟢' : errorIL < 0.1 ? '🟡' : errorIL < 1 ? '🟠' : '🔴';
            const statusVC = errorVC < 0.01 ? '🟢' : errorVC < 0.1 ? '🟡' : errorVC < 1 ? '🟠' : '🔴';
            
            console.log(`${(cpu.time * 1e6).toFixed(1).padStart(8)} | ${errorIL.toFixed(4).padStart(12)}% ${statusIL} | ${errorVC.toFixed(4).padStart(12)}% ${statusVC} |`);
        }
        
        avgErrorIL /= steps;
        avgErrorVC /= steps;
        
        console.log('\n🎯 統計結果:');
        console.log(`電感電流 (IL):`);
        console.log(`  最大誤差: ${maxErrorIL.toFixed(4)}%`);
        console.log(`  平均誤差: ${avgErrorIL.toFixed(4)}%`);
        
        console.log(`電容電壓 (VC):`);
        console.log(`  最大誤差: ${maxErrorVC.toFixed(4)}%`);
        console.log(`  平均誤差: ${avgErrorVC.toFixed(4)}%`);
        
        // 整體評估
        const overallMaxError = Math.max(maxErrorIL, maxErrorVC);
        console.log(`\n📈 整體評估:`);
        console.log(`  最大誤差: ${overallMaxError.toFixed(4)}%`);
        
        if (overallMaxError < 0.01) {
            console.log('  🎉 完美一致 (<0.01%) - GPU實現完全正確');
        } else if (overallMaxError < 0.1) {
            console.log('  ✅ 優秀 (<0.1%) - GPU實現高質量');
        } else if (overallMaxError < 1) {
            console.log('  🟡 良好 (<1%) - GPU實現可接受');
        } else if (overallMaxError < 10) {
            console.log('  🟠 需要改進 (1-10%) - 存在數值差異');
        } else {
            console.log('  🔴 嚴重問題 (>10%) - GPU實現需要修復');
        }
        
        // 能量守恆驗證
        console.log('\n⚡ 能量守恆驗證:');
        await verifyEnergyConservation(cpuResults, gpuResults, L, C, R);
        
        // 時間步長敏感性測試
        console.log('\n⏱️ 時間步長敏感性測試:');
        await testRLCTimestepSensitivity(components);
        
    } catch (error) {
        console.error('❌ RLC測試失敗:', error.message);
        console.error(error.stack);
    }
}

async function verifyEnergyConservation(cpuResults, gpuResults, L, C, R) {
    console.log('檢查RLC電路的能量守恆...');
    
    // 選擇中間時刻進行能量計算
    const midIndex = Math.floor(cpuResults.length / 2);
    const cpu = cpuResults[midIndex];
    const gpu = gpuResults[midIndex];
    
    // 計算各種能量
    const energyL_CPU = 0.5 * L * cpu.iL * cpu.iL;      // 電感儲能
    const energyC_CPU = 0.5 * C * cpu.vC * cpu.vC;      // 電容儲能
    const totalEnergy_CPU = energyL_CPU + energyC_CPU;
    
    const energyL_GPU = 0.5 * L * gpu.iL * gpu.iL;
    const energyC_GPU = 0.5 * C * gpu.vC * gpu.vC;
    const totalEnergy_GPU = energyL_GPU + energyC_GPU;
    
    console.log(`  t=${(cpu.time * 1e6).toFixed(1)}μs時的儲能:`);
    console.log(`  CPU: EL=${energyL_CPU.toExponential(3)}J, EC=${energyC_CPU.toExponential(3)}J, Total=${totalEnergy_CPU.toExponential(3)}J`);
    console.log(`  GPU: EL=${energyL_GPU.toExponential(3)}J, EC=${energyC_GPU.toExponential(3)}J, Total=${totalEnergy_GPU.toExponential(3)}J`);
    
    const energyError = Math.abs((totalEnergy_GPU - totalEnergy_CPU) / totalEnergy_CPU * 100);
    console.log(`  能量誤差: ${energyError.toFixed(4)}%`);
    
    if (energyError < 1) {
        console.log('  ✅ 能量守恆良好');
    } else {
        console.log('  ⚠️ 能量守恆存在偏差');
    }
}

async function testRLCTimestepSensitivity(components) {
    const timesteps = [1e-6, 5e-7, 1e-7];  // 較小的時間步長以測試穩定性
    
    console.log('測試不同時間步長下的RLC響應穩定性...');
    
    for (const dt of timesteps) {
        console.log(`\n  dt = ${dt * 1e6}μs:`);
        
        try {
            // CPU測試
            const cpuSolver = new ExplicitStateSolver();
            await cpuSolver.initialize([...components], dt);
            
            // 運行5步
            let cpuFinalIL = 0, cpuFinalVC = 0;
            for (let i = 0; i < 5; i++) {
                const result = await cpuSolver.step();
                cpuFinalIL = result.stateVariables.get('L1');
                cpuFinalVC = result.stateVariables.get('C1');
            }
            
            // GPU測試
            const gpuSolver = new GPUExplicitStateSolver();
            await gpuSolver.initialize([...components], dt);
            
            let gpuFinalIL = 0, gpuFinalVC = 0;
            for (let i = 0; i < 5; i++) {
                const result = await gpuSolver.step();
                gpuFinalIL = result.stateVariables.get('L1');
                gpuFinalVC = result.stateVariables.get('C1');
            }
            
            const errorIL = Math.abs((gpuFinalIL - cpuFinalIL) / (Math.abs(cpuFinalIL) + 1e-12) * 100);
            const errorVC = Math.abs((gpuFinalVC - cpuFinalVC) / (Math.abs(cpuFinalVC) + 1e-12) * 100);
            
            const maxError = Math.max(errorIL, errorVC);
            const status = maxError < 1 ? '✅' : maxError < 10 ? '⚠️' : maxError < 100 ? '🟠' : '🔴';
            
            console.log(`    IL誤差: ${errorIL.toFixed(3)}%, VC誤差: ${errorVC.toFixed(3)}%, 最大誤差: ${maxError.toFixed(3)}% ${status}`);
            
            if (maxError > 100) {
                console.log(`    🚨 數值不穩定!`);
            }
            
        } catch (err) {
            console.log(`    ❌ dt=${dt} 測試失敗: ${err.message}`);
        }
    }
}

// 運行RLC驗證測試
testRLCCircuit();