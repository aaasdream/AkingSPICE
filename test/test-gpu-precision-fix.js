/**
 * GPU精度修復驗證測試
 * 驗證800次迭代後的GPU與CPU精度差異
 */

import { ExplicitStateSolver } from '../src/core/explicit-state-solver.js';
import { GPUExplicitStateSolver } from '../src/core/gpu-explicit-solver.js';

// 格式化數值顯示
function formatValue(value, unit = '') {
    if (Math.abs(value) < 1e-12) return `${value.toExponential(3)}${unit}`;
    if (Math.abs(value) < 1e-9) return `${(value * 1e12).toFixed(3)}p${unit}`;
    if (Math.abs(value) < 1e-6) return `${(value * 1e9).toFixed(3)}n${unit}`;
    if (Math.abs(value) < 1e-3) return `${(value * 1e6).toFixed(3)}μ${unit}`;
    if (Math.abs(value) < 1) return `${(value * 1e3).toFixed(3)}m${unit}`;
    return `${value.toFixed(6)}${unit}`;
}

function formatTime(t) {
    if (t < 1e-9) return `${(t * 1e12).toFixed(3)}ps`;
    if (t < 1e-6) return `${(t * 1e9).toFixed(3)}ns`;
    if (t < 1e-3) return `${(t * 1e6).toFixed(3)}μs`;
    if (t < 1) return `${(t * 1e3).toFixed(3)}ms`;
    return `${t.toFixed(3)}s`;
}

async function testGPUPrecisionFix() {
    console.log('🔧 GPU精度修復驗證測試');
    console.log('驗證800次迭代後的GPU與CPU精度差異');
    console.log('==================================================');
    
    // 測試電路：使用與之前測試完全相同的格式  
    const components = [
        { type: 'voltage_source', id: 'V1', nodes: ['vin', 'gnd'], value: 5.0 },
        { type: 'resistor', id: 'R1', nodes: ['vin', 'vout'], value: 10 },     // 10Ω
        { type: 'capacitor', id: 'C1', nodes: ['vout', 'gnd'], value: 1e-6 }   // 1μF
    ];
    
    const timeStep = 1e-8; // 10ns - 與之前測試相同
    
    console.log('📋 精密RC電路診斷:');
    console.log('  R=10Ω, C=1.000μF');
    console.log(`  時間步長: ${formatTime(timeStep)}`);
    console.log('');
    
    // 初始化求解器
    console.log('🔍 初始化求解器');
    console.log('------------------------------');
    
    console.log('💻 CPU初始化...');
    const cpuSolver = new ExplicitStateSolver({ debug: false });
    await cpuSolver.initialize(components, timeStep);
    
    console.log('🚀 GPU初始化...');
    const gpuSolver = new GPUExplicitStateSolver({ 
        debug: false,
        solverMaxIterations: 1500,  // 更多迭代
        solverTolerance: 1e-14      // 更高精度
    });
    await gpuSolver.initialize(components, timeStep);
    
    console.log('✅ 求解器初始化完成');
    console.log('');
    
    // 進行多步比較
    console.log('🔍 進行高精度比較測試');
    console.log('------------------------------');
    
    const steps = 10;
    let maxError = 0;
    let avgError = 0;
    
    for (let i = 0; i < steps; i++) {
        // CPU計算
        const cpuResult = cpuSolver.step();
        
        // GPU計算
        const gpuResult = await gpuSolver.step();
        
        // 比較電容電壓
        const cpuVc = cpuResult.stateVariables.get('C1');
        const gpuVc = gpuResult.stateVariables.get('C1');
        const vcError = Math.abs((gpuVc - cpuVc) / cpuVc * 100);
        
        // 比較節點電壓
        const cpuVout = cpuResult.nodeVoltages.get('vout');
        const gpuVout = typeof gpuResult.nodeVoltages.get === 'function' ? 
                        gpuResult.nodeVoltages.get('vout') : 
                        gpuResult.nodeVoltages['vout'];
        const voutError = Math.abs((gpuVout - cpuVout) / cpuVout * 100);
        
        maxError = Math.max(maxError, vcError, voutError);
        avgError += (vcError + voutError) / 2;
        
        if (i % 2 === 0 || vcError > 0.01 || voutError > 0.01) {
            console.log(`步驟 ${i + 1}:`);
            console.log(`  時間: ${formatTime(cpuResult.time)}`);
            console.log(`  CPU Vc: ${formatValue(cpuVc, 'V')}, GPU Vc: ${formatValue(gpuVc, 'V')}`);
            console.log(`  CPU Vout: ${formatValue(cpuVout, 'V')}, GPU Vout: ${formatValue(gpuVout, 'V')}`);
            console.log(`  電容電壓誤差: ${vcError.toFixed(4)}%`);
            console.log(`  節點電壓誤差: ${voutError.toFixed(4)}%`);
            console.log('');
        }
    }
    
    avgError /= steps;
    
    console.log('📊 精度改進結果統計');
    console.log('------------------------------');
    console.log(`  測試步數: ${steps}`);
    console.log(`  最大誤差: ${maxError.toFixed(6)}%`);
    console.log(`  平均誤差: ${avgError.toFixed(6)}%`);
    
    if (maxError < 0.01) {
        console.log('  🎉 精度改進成功！GPU誤差 < 0.01%');
    } else if (maxError < 0.1) {
        console.log('  ✅ 精度顯著改善，GPU誤差 < 0.1%');
    } else {
        console.log('  ⚠️  仍需進一步精度改進');
    }
    
    console.log('');
    
    // 長期穩定性測試
    console.log('🔍 長期穩定性測試 (100步)');
    console.log('------------------------------');
    
    let finalError = 0;
    for (let i = steps; i < 100; i++) {
        const cpuResult = cpuSolver.step();
        const gpuResult = await gpuSolver.step();
        
        const cpuVc = cpuResult.stateVariables.get('C1');
        const gpuVc = gpuResult.stateVariables.get('C1');
        finalError = Math.abs((gpuVc - cpuVc) / cpuVc * 100);
    }
    
    console.log(`  第100步誤差: ${finalError.toFixed(6)}%`);
    
    if (finalError < 0.1) {
        console.log('  ✅ 長期穩定性良好');
    } else {
        console.log('  ⚠️  長期穩定性需要改進');
    }
}

// 執行測試
testGPUPrecisionFix().catch(console.error);