// 簡化的中頻與高頻比較測試
import { ExplicitStateSolver } from '../src/core/explicit-state-solver.js';
import { GPUExplicitStateSolver } from '../src/core/gpu-explicit-solver.js';
import { VoltageSource } from '../src/components/sources.js';
import { Resistor } from '../src/components/resistor.js';
import { Capacitor } from '../src/components/capacitor.js';
import { Inductor } from '../src/components/inductor.js';

console.log('📡 中頻 vs 高頻 電路仿真比較');
console.log('='.repeat(50));

async function simpleFrequencyTest() {
    try {
        // 測試案例1: 中頻 (1MHz)
        console.log('\n📻 中頻測試 (1MHz)');
        console.log('-'.repeat(30));
        await testSingleFrequency({
            name: '中頻',
            frequency: 1e6,     // 1MHz
            L: 1e-6,           // 1μH  
            C: 25.3e-12,       // 25.3pF (諧振在1MHz)
            R: 50
        });

        // 測試案例2: 高頻 (100MHz) 
        console.log('\n📶 高頻測試 (100MHz)');
        console.log('-'.repeat(30));
        await testSingleFrequency({
            name: '高頻', 
            frequency: 100e6,  // 100MHz
            L: 10e-9,          // 10nH
            C: 2.53e-12,       // 2.53pF (諧振在100MHz)  
            R: 50
        });

    } catch (error) {
        console.error('❌ 測試失敗:', error.message);
    }
}

async function testSingleFrequency(config) {
    const { name, frequency, L, C, R } = config;
    
    // 計算電路參數
    const omega0 = 1 / Math.sqrt(L * C);
    const f0 = omega0 / (2 * Math.PI);
    const Q = (1/R) * Math.sqrt(L/C);
    
    console.log(`電路參數:`);
    console.log(`  目標頻率: ${formatHz(frequency)}`);
    console.log(`  諧振頻率: ${formatHz(f0)}`);
    console.log(`  品質因子: Q = ${Q.toFixed(1)}`);
    console.log(`  L = ${formatValue(L, 'H')}, C = ${formatValue(C, 'F')}, R = ${R}Ω`);
    
    // 創建電路
    const components = [
        new VoltageSource('V1', ['in', 'gnd'], 1),  // 1V DC
        new Resistor('R1', ['in', 'n1'], R),
        new Inductor('L1', ['n1', 'n2'], L, { ic: 0 }),
        new Capacitor('C1', ['n2', 'gnd'], C, { ic: 0 })
    ];
    
    // 選擇合適的時間步長
    const period = 1 / frequency;
    const dt = period / 1000;  // 1000點每週期
    const steps = 10;
    
    console.log(`時間步長: ${formatTime(dt)}`);
    
    // CPU測試
    console.log('\n💻 CPU結果:');
    const cpuStart = performance.now();
    
    const cpuSolver = new ExplicitStateSolver();
    await cpuSolver.initialize(components, dt);
    
    let cpuFinalIL = 0, cpuFinalVC = 0;
    for (let i = 0; i < steps; i++) {
        const result = await cpuSolver.step();
        cpuFinalIL = result.stateVariables.get('L1');
        cpuFinalVC = result.stateVariables.get('C1');
        
        if (i < 5) {
            console.log(`  t=${formatTime(result.time)}: IL=${formatValue(cpuFinalIL, 'A')}, VC=${formatValue(cpuFinalVC, 'V')}`);
        }
    }
    
    const cpuTime = performance.now() - cpuStart;
    console.log(`  執行時間: ${cpuTime.toFixed(2)}ms`);
    
    // GPU測試  
    console.log('\n🚀 GPU結果:');
    const gpuStart = performance.now();
    
    const gpuSolver = new GPUExplicitStateSolver();
    await gpuSolver.initialize(components, dt);
    
    let gpuFinalIL = 0, gpuFinalVC = 0;
    for (let i = 0; i < steps; i++) {
        const result = await gpuSolver.step();
        gpuFinalIL = result.stateVariables.get('L1');
        gpuFinalVC = result.stateVariables.get('C1');
        
        if (i < 5) {
            console.log(`  t=${formatTime(result.time)}: IL=${formatValue(gpuFinalIL, 'A')}, VC=${formatValue(gpuFinalVC, 'V')}`);
        }
    }
    
    const gpuTime = performance.now() - gpuStart;
    console.log(`  執行時間: ${gpuTime.toFixed(2)}ms`);
    
    // 比較結果
    const errorIL = Math.abs((gpuFinalIL - cpuFinalIL) / (Math.abs(cpuFinalIL) + 1e-15) * 100);
    const errorVC = Math.abs((gpuFinalVC - cpuFinalVC) / (Math.abs(cpuFinalVC) + 1e-15) * 100);
    const speedup = cpuTime / gpuTime;
    
    console.log('\n📊 比較結果:');
    console.log(`  電感電流誤差: ${errorIL.toFixed(3)}%`);
    console.log(`  電容電壓誤差: ${errorVC.toFixed(3)}%`);
    console.log(`  性能提升: ${speedup.toFixed(2)}x ${speedup > 1 ? '🚀' : '⚠️'}`);
    
    const maxError = Math.max(errorIL, errorVC);
    const status = maxError < 0.1 ? '🟢 優秀' : maxError < 1 ? '🟡 良好' : '🔴 需改進';
    console.log(`  整體精度: ${status} (${maxError.toFixed(3)}%)`);
}

function formatHz(freq) {
    if (freq >= 1e9) return `${(freq/1e9).toFixed(1)}GHz`;
    if (freq >= 1e6) return `${(freq/1e6).toFixed(1)}MHz`;  
    if (freq >= 1e3) return `${(freq/1e3).toFixed(1)}kHz`;
    return `${freq.toFixed(0)}Hz`;
}

function formatValue(val, unit) {
    const abs = Math.abs(val);
    if (abs >= 1e-3) return `${(val*1e3).toFixed(2)}m${unit}`;
    if (abs >= 1e-6) return `${(val*1e6).toFixed(2)}μ${unit}`;
    if (abs >= 1e-9) return `${(val*1e9).toFixed(2)}n${unit}`;
    if (abs >= 1e-12) return `${(val*1e12).toFixed(2)}p${unit}`;
    return `${val.toExponential(2)}${unit}`;
}

function formatTime(time) {
    if (time >= 1e-3) return `${(time*1e3).toFixed(2)}ms`;
    if (time >= 1e-6) return `${(time*1e6).toFixed(2)}μs`;
    if (time >= 1e-9) return `${(time*1e9).toFixed(2)}ns`;  
    return `${time.toExponential(2)}s`;
}

// 運行測試
simpleFrequencyTest();