// CPU算法 vs GPU算法 問題源頭診斷
import { ExplicitStateSolver } from '../src/core/explicit-state-solver.js';
import { GPUExplicitStateSolver } from '../src/core/gpu-explicit-solver.js';
import { VoltageSource } from '../src/components/sources.js';
import { Resistor } from '../src/components/resistor.js';
import { Capacitor } from '../src/components/capacitor.js';
import { Inductor } from '../src/components/inductor.js';

console.log('🔬 CPU vs GPU 問題源頭終極診斷');
console.log('是CPU算法問題還是GPU實現問題？');
console.log('='.repeat(60));

async function ultimateDiagnosis() {
    try {
        // 使用相對穩定的測試參數
        const L = 10e-6;    // 10μH
        const C = 1e-6;     // 1μF  
        const R = 5;        // 5Ω
        const frequency = 15900;  // 15.9kHz
        
        const omega0 = 1 / Math.sqrt(L * C);
        const f0 = omega0 / (2 * Math.PI);
        const Q = (1 / R) * Math.sqrt(L / C);
        
        // 使用兩種不同的時間步長
        const dt1 = (2 * Math.PI / omega0) / 50;   // 粗時間步長
        const dt2 = (2 * Math.PI / omega0) / 200;  // 細時間步長
        
        console.log(`📋 診斷設定:`);
        console.log(`  電路: L=${formatValue(L, 'H')}, C=${formatValue(C, 'F')}, R=${R}Ω`);
        console.log(`  諧振頻率: ${formatFreq(f0)}, Q=${Q.toFixed(2)}`);
        console.log(`  粗步長: ${formatTime(dt1)}, 細步長: ${formatTime(dt2)}`);
        
        // 測試1: 短期精度測試
        console.log('\n🎯 測試1: 短期精度 (50步)');
        console.log('-'.repeat(40));
        await diagnoseShortTerm(L, C, R, dt1, 50);
        
        // 測試2: 時間步長敏感性
        console.log('\n🎯 測試2: 時間步長敏感性');
        console.log('-'.repeat(40));
        await diagnoseTimeStepSensitivity(L, C, R, dt1, dt2);
        
        // 測試3: 算法穩定性
        console.log('\n🎯 測試3: 長期穩定性 (200步)');
        console.log('-'.repeat(40));
        await diagnoseLongTermStability(L, C, R, dt2, 200);
        
    } catch (error) {
        console.error('❌ 診斷失敗:', error.message);
    }
}

async function diagnoseShortTerm(L, C, R, dt, steps) {
    const components = [
        new VoltageSource('V1', ['vin', 'gnd'], 5),
        new Resistor('R1', ['vin', 'n1'], R),
        new Inductor('L1', ['n1', 'n2'], L, { ic: 0 }),
        new Capacitor('C1', ['n2', 'gnd'], C, { ic: 0 })
    ];
    
    console.log('💻 CPU短期測試...');
    const cpuResult = await runTest('CPU', components, dt, steps);
    
    console.log('🚀 GPU短期測試...');
    const gpuResult = await runTest('GPU', components, dt, steps);
    
    if (cpuResult.success && gpuResult.success) {
        const error = calculateError(cpuResult.data, gpuResult.data);
        console.log(`📊 CPU vs GPU 短期精度:`);
        console.log(`  最大電流誤差: ${error.maxCurrentError.toFixed(4)}%`);
        console.log(`  最大電壓誤差: ${error.maxVoltageError.toFixed(4)}%`);
        console.log(`  RMS誤差: ${error.rmsError.toFixed(4)}%`);
        
        if (error.maxCurrentError < 1 && error.maxVoltageError < 1) {
            console.log('  ✅ 短期精度優秀，GPU實現基本正確');
        } else if (error.maxCurrentError < 10) {
            console.log('  🟡 短期精度可接受，存在輕微差異');
        } else {
            console.log('  🔴 短期精度差，GPU實現有問題');
        }
    } else {
        console.log('❌ 短期測試失敗');
    }
}

async function diagnoseTimeStepSensitivity(L, C, R, dtCoarse, dtFine) {
    const components = [
        new VoltageSource('V1', ['vin', 'gnd'], 5),
        new Resistor('R1', ['vin', 'n1'], R),
        new Inductor('L1', ['n1', 'n2'], L, { ic: 0 }),
        new Capacitor('C1', ['n2', 'gnd'], C, { ic: 0 })
    ];
    
    const steps = 100;
    
    console.log(`💻 CPU時間步長敏感性:`);
    const cpuCoarse = await runTest('CPU', components, dtCoarse, steps);
    const cpuFine = await runTest('CPU', components, dtFine, steps * 4); // 調整步數保持相同總時間
    
    if (cpuCoarse.success && cpuFine.success) {
        // 比較相同時間點的結果
        const cpuSensitivity = analyzeTimeStepSensitivity(cpuCoarse.data, cpuFine.data, dtCoarse, dtFine);
        console.log(`  粗步長最終值: IL=${formatValue(cpuCoarse.data[cpuCoarse.data.length-1].IL, 'A')}`);
        console.log(`  細步長最終值: IL=${formatValue(cpuFine.data[cpuFine.data.length-1].IL, 'A')}`);
        console.log(`  CPU步長敏感性: ${cpuSensitivity.toFixed(2)}%`);
    }
    
    console.log(`🚀 GPU時間步長敏感性:`);
    const gpuCoarse = await runTest('GPU', components, dtCoarse, steps);
    const gpuFine = await runTest('GPU', components, dtFine, steps * 4);
    
    if (gpuCoarse.success && gpuFine.success) {
        const gpuSensitivity = analyzeTimeStepSensitivity(gpuCoarse.data, gpuFine.data, dtCoarse, dtFine);
        console.log(`  粗步長最終值: IL=${formatValue(gpuCoarse.data[gpuCoarse.data.length-1].IL, 'A')}`);
        console.log(`  細步長最終值: IL=${formatValue(gpuFine.data[gpuFine.data.length-1].IL, 'A')}`);
        console.log(`  GPU步長敏感性: ${gpuSensitivity.toFixed(2)}%`);
        
        // 對比分析
        if (cpuCoarse.success && gpuCoarse.success) {
            const sensitivity = Math.abs(gpuSensitivity - cpuSensitivity);
            console.log(`📊 步長敏感性對比:`);
            console.log(`  敏感性差異: ${sensitivity.toFixed(2)}%`);
            
            if (sensitivity < 5) {
                console.log('  ✅ CPU和GPU時間步長敏感性相似');
            } else if (sensitivity < 20) {
                console.log('  🟡 GPU時間步長敏感性與CPU有差異');
            } else {
                console.log('  🔴 GPU時間步長敏感性明顯異常');
            }
        }
    }
}

async function diagnoseLongTermStability(L, C, R, dt, steps) {
    const components = [
        new VoltageSource('V1', ['vin', 'gnd'], 5),
        new Resistor('R1', ['vin', 'n1'], R),
        new Inductor('L1', ['n1', 'n2'], L, { ic: 0 }),
        new Capacitor('C1', ['n2', 'gnd'], C, { ic: 0 })
    ];
    
    console.log('💻 CPU長期穩定性測試...');
    const cpuResult = await runLongTest('CPU', components, dt, steps);
    
    console.log('🚀 GPU長期穩定性測試...');
    const gpuResult = await runLongTest('GPU', components, dt, steps);
    
    console.log(`📊 長期穩定性對比:`);
    
    if (cpuResult.success) {
        console.log(`  CPU能量守恆: ${cpuResult.energyConservation.toFixed(4)}%`);
        console.log(`  CPU振幅衰減: ${cpuResult.amplitudeDecay.toFixed(2)}%`);
    } else {
        console.log('  ❌ CPU長期測試失敗');
    }
    
    if (gpuResult.success) {
        console.log(`  GPU能量守恆: ${gpuResult.energyConservation.toFixed(4)}%`);
        console.log(`  GPU振幅衰減: ${gpuResult.amplitudeDecay.toFixed(2)}%`);
    } else {
        console.log('  ❌ GPU長期測試失敗');
    }
    
    // 最終診斷
    console.log('\n🎯 最終診斷:');
    
    if (!cpuResult.success) {
        console.log('🔴 問題源頭: CPU顯式算法本身數值不穩定');
        console.log('   - Forward Euler方法不適合此電路');
        console.log('   - 建議使用隱式方法或更小時間步長');
    } else if (!gpuResult.success) {
        console.log('🟠 問題源頭: GPU實現有嚴重問題');
        console.log('   - WebGPU求解器實現錯誤');
        console.log('   - 需要修復GPU線性求解器');
    } else {
        // 都成功，比較穩定性
        const energyDiff = Math.abs(gpuResult.energyConservation - cpuResult.energyConservation);
        const amplitudeDiff = Math.abs(gpuResult.amplitudeDecay - cpuResult.amplitudeDecay);
        
        if (cpuResult.energyConservation > 50 || cpuResult.amplitudeDecay > 95) {
            console.log('🔴 主要問題: CPU算法數值不穩定');
            console.log('   - 時間步長過大或算法不適用');
        } else if (energyDiff > 10 || amplitudeDiff > 20) {
            console.log('🟠 主要問題: GPU實現與CPU不一致');
            console.log('   - GPU精度或算法實現有差異');
        } else {
            console.log('🟢 兩者都相對穩定');
            console.log('   - 可用於短中期仿真');
            console.log('   - 長期仿真需要改進算法');
        }
    }
}

async function runTest(type, components, dt, steps) {
    try {
        let solver;
        if (type === 'CPU') {
            solver = new ExplicitStateSolver();
        } else {
            solver = new GPUExplicitStateSolver({ debug: false });
        }
        
        await solver.initialize(components, dt);
        
        const data = [];
        
        for (let i = 0; i < steps; i++) {
            const result = await solver.step();
            const IL = result.stateVariables.get('L1') || 0;
            const VC = result.stateVariables.get('C1') || 0;
            
            if (Math.abs(IL) > 1000 || Math.abs(VC) > 1000 || isNaN(IL) || isNaN(VC)) {
                return { success: false, reason: '數值失控' };
            }
            
            data.push({ time: result.time, IL, VC });
        }
        
        return { success: true, data };
        
    } catch (error) {
        return { success: false, reason: error.message };
    }
}

async function runLongTest(type, components, dt, steps) {
    const testResult = await runTest(type, components, dt, steps);
    
    if (!testResult.success) {
        return testResult;
    }
    
    const data = testResult.data;
    
    // 計算能量守恆
    const L = components.find(c => c.id === 'L1').value;
    const C = components.find(c => c.id === 'C1').value;
    
    const initialEnergy = 0.5 * L * data[10].IL * data[10].IL + 0.5 * C * data[10].VC * data[10].VC;
    const finalEnergy = 0.5 * L * data[data.length-1].IL * data[data.length-1].IL + 
                       0.5 * C * data[data.length-1].VC * data[data.length-1].VC;
    
    const energyConservation = Math.abs((finalEnergy - initialEnergy) / initialEnergy * 100);
    
    // 計算振幅衰減
    const maxEarly = Math.max(...data.slice(0, 50).map(d => Math.abs(d.IL)));
    const maxLate = Math.max(...data.slice(-50).map(d => Math.abs(d.IL)));
    
    const amplitudeDecay = (1 - maxLate / maxEarly) * 100;
    
    return {
        success: true,
        energyConservation,
        amplitudeDecay,
        data
    };
}

function calculateError(cpuData, gpuData) {
    const minLength = Math.min(cpuData.length, gpuData.length);
    
    let maxCurrentError = 0;
    let maxVoltageError = 0;
    let sumSqError = 0;
    
    for (let i = 0; i < minLength; i++) {
        const currentError = Math.abs((gpuData[i].IL - cpuData[i].IL) / (Math.abs(cpuData[i].IL) + 1e-15) * 100);
        const voltageError = Math.abs((gpuData[i].VC - cpuData[i].VC) / (Math.abs(cpuData[i].VC) + 1e-15) * 100);
        
        maxCurrentError = Math.max(maxCurrentError, currentError);
        maxVoltageError = Math.max(maxVoltageError, voltageError);
        
        sumSqError += (currentError * currentError + voltageError * voltageError);
    }
    
    const rmsError = Math.sqrt(sumSqError / (2 * minLength));
    
    return { maxCurrentError, maxVoltageError, rmsError };
}

function analyzeTimeStepSensitivity(coarseData, fineData, dtCoarse, dtFine) {
    // 在相同時間點比較結果
    const coarseFinal = coarseData[coarseData.length - 1];
    const fineFinal = fineData[fineData.length - 1];
    
    const sensitivity = Math.abs((fineFinal.IL - coarseFinal.IL) / (Math.abs(coarseFinal.IL) + 1e-15) * 100);
    
    return sensitivity;
}

// 格式化函數
function formatFreq(freq) {
    if (freq >= 1e6) return `${(freq/1e6).toFixed(1)}MHz`;
    if (freq >= 1e3) return `${(freq/1e3).toFixed(1)}kHz`;
    return `${freq}Hz`;
}

function formatValue(value, unit) {
    const abs = Math.abs(value);
    if (abs === 0) return `0${unit}`;
    if (abs >= 1) return `${value.toFixed(3)}${unit}`;
    if (abs >= 1e-3) return `${(value*1e3).toFixed(2)}m${unit}`;
    if (abs >= 1e-6) return `${(value*1e6).toFixed(2)}μ${unit}`;
    if (abs >= 1e-9) return `${(value*1e9).toFixed(2)}n${unit}`;
    return `${value.toExponential(2)}${unit}`;
}

function formatTime(time) {
    if (time >= 1) return `${time.toFixed(3)}s`;
    if (time >= 1e-3) return `${(time*1e3).toFixed(2)}ms`;
    if (time >= 1e-6) return `${(time*1e6).toFixed(2)}μs`;
    if (time >= 1e-9) return `${(time*1e9).toFixed(2)}ns`;
    return `${time.toExponential(2)}s`;
}

// 執行終極診斷
ultimateDiagnosis();