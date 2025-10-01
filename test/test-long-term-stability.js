// 長時間模擬穩定性測試 - CPU vs GPU誤差累積分析
import { ExplicitStateSolver } from '../src/core/explicit-state-solver.js';
import { GPUExplicitStateSolver } from '../src/core/gpu-explicit-solver.js';
import { VoltageSource } from '../src/components/sources.js';
import { Resistor } from '../src/components/resistor.js';
import { Capacitor } from '../src/components/capacitor.js';
import { Inductor } from '../src/components/inductor.js';

console.log('⏰ 長時間模擬穩定性測試');
console.log('檢驗CPU vs GPU誤差累積特性');
console.log('='.repeat(60));

async function testLongTermStability() {
    try {
        // 選擇一個中等頻率進行長時間測試
        const frequency = 15900;  // 15.9kHz
        const L = 10e-6;         // 10μH
        const C = 1e-6;          // 1μF  
        const R = 10;            // 10Ω
        
        // 計算穩定時間步長
        const omega0 = 1 / Math.sqrt(L * C);
        const f0 = omega0 / (2 * Math.PI);
        const Q = (1 / R) * Math.sqrt(L / C);
        const dt = (2 / omega0) * 0.01;  // 保守時間步長
        
        console.log(`📋 測試電路參數:`);
        console.log(`  頻率: ${formatFreq(frequency)}, 諧振: ${formatFreq(f0)}, Q=${Q.toFixed(3)}`);
        console.log(`  L=${formatValue(L, 'H')}, C=${formatValue(C, 'F')}, R=${R}Ω`);
        console.log(`  時間步長: ${formatTime(dt)}`);
        
        // 多個時間區間測試
        const timeIntervals = [
            { name: '短期', cycles: 10, color: '🟢' },
            { name: '中期', cycles: 50, color: '🟡' },
            { name: '長期', cycles: 200, color: '🔴' }
        ];
        
        for (const interval of timeIntervals) {
            console.log(`\n${interval.color} ${interval.name}穩定性測試 (${interval.cycles}個週期)`);
            console.log('-'.repeat(50));
            
            const result = await testTimeInterval(frequency, L, C, R, dt, interval.cycles);
            
            if (result.success) {
                console.log(`✅ ${interval.name}測試完成:`);
                console.log(`   CPU時間: ${result.cpuTime.toFixed(1)}ms, GPU時間: ${result.gpuTime.toFixed(1)}ms`);
                console.log(`   最大誤差: ${result.maxError.toFixed(4)}%, RMS誤差: ${result.rmsError.toFixed(4)}%`);
                console.log(`   最終誤差: ${result.finalError.toFixed(4)}% (電流), ${result.finalVoltageError.toFixed(4)}% (電壓)`);
                console.log(`   誤差趨勢: ${result.errorTrend}`);
                
                if (result.maxError > 10) {
                    console.log(`   ⚠️ 警告: 誤差超過10%，可能存在數值不穩定`);
                }
            } else {
                console.log(`❌ ${interval.name}測試失敗: ${result.reason}`);
            }
        }
        
    } catch (error) {
        console.error('❌ 長時間穩定性測試失敗:', error.message);
    }
}

async function testTimeInterval(frequency, L, C, R, dt, cycles) {
    const period = 1 / frequency;
    const totalTime = cycles * period;
    const totalSteps = Math.floor(totalTime / dt);
    
    // 限制最大步數以避免測試時間過長
    const maxSteps = Math.min(500, totalSteps);
    const actualTime = maxSteps * dt;
    const actualCycles = actualTime * frequency;
    
    console.log(`  設定: ${cycles}週期 → 實際: ${actualCycles.toFixed(1)}週期 (${maxSteps}步, ${formatTime(actualTime)})`);
    
    // 創建測試電路
    const components = [
        new VoltageSource('V1', ['vin', 'gnd'], 5),
        new Resistor('R1', ['vin', 'n1'], R),
        new Inductor('L1', ['n1', 'n2'], L, { ic: 0 }),
        new Capacitor('C1', ['n2', 'gnd'], C, { ic: 0 })
    ];
    
    // CPU測試
    console.log('  💻 CPU長時間仿真...');
    const cpuStartTime = performance.now();
    
    const cpuSolver = new ExplicitStateSolver();
    await cpuSolver.initialize(components, dt);
    
    const cpuResults = [];
    let cpuSuccess = true;
    
    try {
        for (let i = 0; i < maxSteps; i++) {
            const result = await cpuSolver.step();
            const IL = result.stateVariables.get('L1') || 0;
            const VC = result.stateVariables.get('C1') || 0;
            
            // 檢查數值爆炸
            if (Math.abs(IL) > 1000 || Math.abs(VC) > 10000 || isNaN(IL) || isNaN(VC)) {
                console.log(`    ❌ CPU在步驟${i+1}數值失控: IL=${formatValue(IL, 'A')}, VC=${formatValue(VC, 'V')}`);
                cpuSuccess = false;
                break;
            }
            
            cpuResults.push({ 
                step: i + 1, 
                time: result.time, 
                IL, 
                VC,
                cycle: result.time * frequency
            });
            
            // 定期顯示進度
            if (i === 0 || (i + 1) % Math.max(1, Math.floor(maxSteps / 5)) === 0 || i === maxSteps - 1) {
                const cycle = result.time * frequency;
                console.log(`    步驟${i+1}/${maxSteps} (週期${cycle.toFixed(1)}): IL=${formatValue(IL, 'A')}, VC=${formatValue(VC, 'V')}`);
            }
        }
    } catch (error) {
        console.error(`    ❌ CPU仿真異常:`, error.message);
        cpuSuccess = false;
    }
    
    const cpuTime = performance.now() - cpuStartTime;
    
    if (!cpuSuccess || cpuResults.length === 0) {
        return {
            success: false,
            reason: 'CPU仿真失敗或數值不穩定'
        };
    }
    
    // GPU測試
    console.log('  🚀 GPU長時間仿真...');
    const gpuStartTime = performance.now();
    
    let gpuResults = [];
    let gpuSuccess = true;
    let gpuTime = 0;
    
    try {
        const gpuSolver = new GPUExplicitStateSolver({ debug: false });
        await gpuSolver.initialize(components, dt);
        
        for (let i = 0; i < maxSteps; i++) {
            const result = await gpuSolver.step();
            const IL = result.stateVariables.get('L1') || 0;
            const VC = result.stateVariables.get('C1') || 0;
            
            // 檢查數值爆炸
            if (Math.abs(IL) > 1000 || Math.abs(VC) > 10000 || isNaN(IL) || isNaN(VC)) {
                console.log(`    ❌ GPU在步驟${i+1}數值失控: IL=${formatValue(IL, 'A')}, VC=${formatValue(VC, 'V')}`);
                gpuSuccess = false;
                break;
            }
            
            gpuResults.push({ 
                step: i + 1, 
                time: result.time, 
                IL, 
                VC,
                cycle: result.time * frequency
            });
            
            // 定期顯示進度
            if (i === 0 || (i + 1) % Math.max(1, Math.floor(maxSteps / 5)) === 0 || i === maxSteps - 1) {
                const cycle = result.time * frequency;
                console.log(`    步驟${i+1}/${maxSteps} (週期${cycle.toFixed(1)}): IL=${formatValue(IL, 'A')}, VC=${formatValue(VC, 'V')}`);
            }
        }
        
        gpuTime = performance.now() - gpuStartTime;
        
    } catch (error) {
        console.error(`    ❌ GPU仿真異常:`, error.message);
        gpuSuccess = false;
        gpuTime = performance.now() - gpuStartTime;
    }
    
    if (!gpuSuccess || gpuResults.length !== cpuResults.length) {
        return {
            success: false,
            reason: 'GPU仿真失敗或結果數量不匹配'
        };
    }
    
    // 詳細誤差分析
    console.log('  📊 誤差演化分析...');
    
    const errors = [];
    let maxErrorIL = 0, maxErrorVC = 0;
    let sumSqErrorIL = 0, sumSqErrorVC = 0;
    
    // 分段分析誤差趨勢
    const segments = [
        { name: '初期', start: 0, end: Math.floor(cpuResults.length * 0.2) },
        { name: '中期', start: Math.floor(cpuResults.length * 0.4), end: Math.floor(cpuResults.length * 0.6) },
        { name: '後期', start: Math.floor(cpuResults.length * 0.8), end: cpuResults.length }
    ];
    
    for (let i = 0; i < cpuResults.length; i++) {
        const cpu = cpuResults[i];
        const gpu = gpuResults[i];
        
        const errorIL = Math.abs((gpu.IL - cpu.IL) / (Math.abs(cpu.IL) + 1e-15) * 100);
        const errorVC = Math.abs((gpu.VC - cpu.VC) / (Math.abs(cpu.VC) + 1e-15) * 100);
        
        errors.push({ step: i + 1, errorIL, errorVC, cycle: cpu.cycle });
        
        maxErrorIL = Math.max(maxErrorIL, errorIL);
        maxErrorVC = Math.max(maxErrorVC, errorVC);
        
        sumSqErrorIL += errorIL * errorIL;
        sumSqErrorVC += errorVC * errorVC;
    }
    
    const rmsErrorIL = Math.sqrt(sumSqErrorIL / cpuResults.length);
    const rmsErrorVC = Math.sqrt(sumSqErrorVC / cpuResults.length);
    
    // 分析誤差趨勢
    const segmentErrors = segments.map(seg => {
        const segErrors = errors.slice(seg.start, seg.end);
        const avgErrorIL = segErrors.reduce((sum, e) => sum + e.errorIL, 0) / segErrors.length;
        const avgErrorVC = segErrors.reduce((sum, e) => sum + e.errorVC, 0) / segErrors.length;
        return { name: seg.name, avgErrorIL, avgErrorVC };
    });
    
    console.log('    誤差分段分析:');
    segmentErrors.forEach(seg => {
        console.log(`      ${seg.name}: 電流${seg.avgErrorIL.toFixed(4)}%, 電壓${seg.avgErrorVC.toFixed(4)}%`);
    });
    
    // 判斷誤差趨勢
    const initialError = (segmentErrors[0].avgErrorIL + segmentErrors[0].avgErrorVC) / 2;
    const finalError = (segmentErrors[2].avgErrorIL + segmentErrors[2].avgErrorVC) / 2;
    
    let errorTrend;
    if (finalError > initialError * 1.5) {
        errorTrend = '🔴 誤差明顯增長';
    } else if (finalError > initialError * 1.1) {
        errorTrend = '🟡 誤差輕微增長';
    } else if (finalError < initialError * 0.9) {
        errorTrend = '🟢 誤差改善';
    } else {
        errorTrend = '✅ 誤差穩定';
    }
    
    // 最終時刻的絕對誤差
    const lastCpu = cpuResults[cpuResults.length - 1];
    const lastGpu = gpuResults[gpuResults.length - 1];
    const finalCurrentError = Math.abs((lastGpu.IL - lastCpu.IL) / (Math.abs(lastCpu.IL) + 1e-15) * 100);
    const finalVoltageError = Math.abs((lastGpu.VC - lastCpu.VC) / (Math.abs(lastCpu.VC) + 1e-15) * 100);
    
    return {
        success: true,
        cpuTime,
        gpuTime,
        maxError: Math.max(maxErrorIL, maxErrorVC),
        rmsError: Math.max(rmsErrorIL, rmsErrorVC),
        finalError: finalCurrentError,
        finalVoltageError,
        errorTrend,
        segmentErrors
    };
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

// 執行長時間穩定性測試
testLongTermStability();