// RLC電路多頻率CPU vs GPU測試 (159Hz, 15.9kHz, 159kHz)
import { ExplicitStateSolver } from '../src/core/explicit-state-solver.js';
import { GPUExplicitStateSolver } from '../src/core/gpu-explicit-solver.js';
import { VoltageSource } from '../src/components/sources.js';
import { Resistor } from '../src/components/resistor.js';
import { Capacitor } from '../src/components/capacitor.js';
import { Inductor } from '../src/components/inductor.js';

console.log('🔬 RLC電路多頻率CPU vs GPU測試');
console.log('測試頻率: 159Hz → 15.9kHz → 159kHz');
console.log('='.repeat(60));

async function testMultiFrequencyRLC() {
    try {
        // 三個頻率測試案例
        const testFrequencies = [
            {
                name: '基準頻率',
                frequency: 159,      // 159Hz (基準)
                L: 1e-3,            // 1mH  
                C: 1e-6,            // 1μF
                R: 10,              // 10Ω
                symbol: '🎵',
                expectedF0: 159.2   // 理論諧振頻率
            },
            {
                name: '中低頻',
                frequency: 15900,    // 15.9kHz (100x)
                L: 1e-5,            // 10μH (1/100)
                C: 1e-6,            // 1μF (保持)
                R: 10,              // 10Ω
                symbol: '📻',
                expectedF0: 15915   // 理論諧振頻率
            },
            {
                name: '中高頻',
                frequency: 159000,   // 159kHz (1000x)
                L: 1e-6,            // 1μH (1/1000)
                C: 1e-6,            // 1μF (保持)  
                R: 10,              // 10Ω
                symbol: '📡',
                expectedF0: 159155  // 理論諧振頻率
            }
        ];

        console.log('📊 測試案例總覽:');
        testFrequencies.forEach((test, i) => {
            const f0 = 1 / (2 * Math.PI * Math.sqrt(test.L * test.C));
            const Q = (1 / test.R) * Math.sqrt(test.L / test.C);
            console.log(`  ${i+1}. ${test.symbol} ${test.name}: f=${formatFreq(test.frequency)}, f₀=${formatFreq(f0)}, Q=${Q.toFixed(1)}`);
        });

        console.log('\n' + '='.repeat(60));

        // 存儲所有結果用於最終比較
        const allResults = [];

        // 逐個測試每個頻率
        for (const testCase of testFrequencies) {
            console.log(`\n${testCase.symbol} ${testCase.name}測試 (${formatFreq(testCase.frequency)})`);
            console.log('-'.repeat(50));
            
            const result = await testRLCFrequency(testCase);
            allResults.push(result);
            
            // 簡短總結
            console.log(`📋 ${testCase.name}總結: 精度=${result.maxError.toFixed(3)}%, 加速比=${result.speedup.toFixed(2)}x, 狀態=${result.status}`);
        }

        // 全面比較分析
        console.log('\n' + '='.repeat(60));
        console.log('📈 多頻率RLC電路綜合分析');
        console.log('='.repeat(60));
        
        analyzeMultiFrequencyResults(allResults, testFrequencies);

    } catch (error) {
        console.error('❌ 多頻率RLC測試失敗:', error.message);
        console.error(error.stack);
    }
}

async function testRLCFrequency(testCase) {
    const { name, frequency, L, C, R, symbol } = testCase;
    
    // 計算電路理論參數
    const omega0 = 1 / Math.sqrt(L * C);
    const f0 = omega0 / (2 * Math.PI);
    const Q = (1 / R) * Math.sqrt(L / C);
    const timeConstant = 2 * Q / omega0;
    
    console.log(`📋 ${name}電路參數:`);
    console.log(`  目標頻率: ${formatFreq(frequency)}`);
    console.log(`  諧振頻率: ${formatFreq(f0)} (偏差: ${((frequency-f0)/f0*100).toFixed(1)}%)`);
    console.log(`  L=${formatValue(L, 'H')}, C=${formatValue(C, 'F')}, R=${R}Ω`);
    console.log(`  Q因子: ${Q.toFixed(2)}, 時間常數: ${formatTime(timeConstant)}`);
    
    // 創建RLC串聯電路
    const components = [
        new VoltageSource('V1', ['vin', 'gnd'], 5),           // 5V階躍響應
        new Resistor('R1', ['vin', 'n1'], R),                 // 串聯電阻
        new Inductor('L1', ['n1', 'n2'], L, { ic: 0 }),      // 串聯電感
        new Capacitor('C1', ['n2', 'gnd'], C, { ic: 0 })     // 並聯電容
    ];
    
    // 根據頻率選擇適當的仿真參數
    let dt, steps, simTime;
    
    if (frequency <= 1000) {
        // 低頻: 較長的仿真時間
        dt = 1 / (frequency * 100);   // 100點每週期
        simTime = 5 / frequency;      // 5個週期
        steps = Math.min(50, Math.floor(simTime / dt));
    } else {
        // 中高頻: 較短的仿真時間但更密集的採樣
        dt = 1 / (frequency * 200);   // 200點每週期  
        simTime = 3 / frequency;      // 3個週期
        steps = Math.min(100, Math.floor(simTime / dt));
    }
    
    console.log(`⏰ 仿真設定: dt=${formatTime(dt)}, 步數=${steps}, 總時間=${formatTime(simTime)}`);
    
    // CPU測試
    console.log('\n💻 CPU仿真:');
    const cpuStartTime = performance.now();
    
    const cpuSolver = new ExplicitStateSolver();
    await cpuSolver.initialize(components, dt);
    
    const cpuResults = [];
    let cpuPeakIL = 0, cpuPeakVC = 0;
    
    for (let i = 0; i < steps; i++) {
        const result = await cpuSolver.step();
        const IL = result.stateVariables.get('L1');
        const VC = result.stateVariables.get('C1');
        
        cpuResults.push({ time: result.time, IL, VC });
        cpuPeakIL = Math.max(cpuPeakIL, Math.abs(IL));
        cpuPeakVC = Math.max(cpuPeakVC, Math.abs(VC));
        
        // 顯示前幾個和最後幾個數據點
        if (i < 3 || i >= steps - 3) {
            console.log(`  t=${formatTime(result.time)}: IL=${formatValue(IL, 'A')}, VC=${formatValue(VC, 'V')}`);
        } else if (i === 3) {
            console.log(`  ... (${steps-6}個中間點) ...`);
        }
    }
    
    const cpuTime = performance.now() - cpuStartTime;
    console.log(`  執行時間: ${cpuTime.toFixed(2)}ms`);
    console.log(`  峰值電流: ${formatValue(cpuPeakIL, 'A')}, 峰值電壓: ${formatValue(cpuPeakVC, 'V')}`);
    
    // GPU測試
    console.log('\n🚀 GPU仿真:');
    const gpuStartTime = performance.now();
    
    const gpuSolver = new GPUExplicitStateSolver({ debug: false });
    await gpuSolver.initialize(components, dt);
    
    const gpuResults = [];
    let gpuPeakIL = 0, gpuPeakVC = 0;
    
    for (let i = 0; i < steps; i++) {
        const result = await gpuSolver.step();
        const IL = result.stateVariables.get('L1');
        const VC = result.stateVariables.get('C1');
        
        gpuResults.push({ time: result.time, IL, VC });
        gpuPeakIL = Math.max(gpuPeakIL, Math.abs(IL));
        gpuPeakVC = Math.max(gpuPeakVC, Math.abs(VC));
        
        if (i < 3 || i >= steps - 3) {
            console.log(`  t=${formatTime(result.time)}: IL=${formatValue(IL, 'A')}, VC=${formatValue(VC, 'V')}`);
        } else if (i === 3) {
            console.log(`  ... (${steps-6}個中間點) ...`);
        }
    }
    
    const gpuTime = performance.now() - gpuStartTime;
    console.log(`  執行時間: ${gpuTime.toFixed(2)}ms`);
    console.log(`  峰值電流: ${formatValue(gpuPeakIL, 'A')}, 峰值電壓: ${formatValue(gpuPeakVC, 'V')}`);
    
    // 詳細誤差分析
    console.log('\n📊 CPU vs GPU 詳細比較:');
    
    let maxErrorIL = 0, maxErrorVC = 0;
    let rmsErrorIL = 0, rmsErrorVC = 0;
    let peakErrorTime = 0;
    
    for (let i = 0; i < steps; i++) {
        const cpu = cpuResults[i];
        const gpu = gpuResults[i];
        
        const errorIL = Math.abs((gpu.IL - cpu.IL) / (Math.abs(cpu.IL) + 1e-15) * 100);
        const errorVC = Math.abs((gpu.VC - cpu.VC) / (Math.abs(cpu.VC) + 1e-15) * 100);
        
        if (errorIL > maxErrorIL) {
            maxErrorIL = errorIL;
            peakErrorTime = cpu.time;
        }
        if (errorVC > maxErrorVC) {
            maxErrorVC = errorVC;
        }
        
        rmsErrorIL += errorIL * errorIL;
        rmsErrorVC += errorVC * errorVC;
    }
    
    rmsErrorIL = Math.sqrt(rmsErrorIL / steps);
    rmsErrorVC = Math.sqrt(rmsErrorVC / steps);
    
    const speedup = cpuTime / gpuTime;
    const maxError = Math.max(maxErrorIL, maxErrorVC);
    
    console.log(`  電感電流: 最大誤差=${maxErrorIL.toFixed(4)}%, RMS誤差=${rmsErrorIL.toFixed(4)}%`);
    console.log(`  電容電壓: 最大誤差=${maxErrorVC.toFixed(4)}%, RMS誤差=${rmsErrorVC.toFixed(4)}%`);
    console.log(`  性能提升: ${speedup.toFixed(2)}x (CPU: ${cpuTime.toFixed(1)}ms, GPU: ${gpuTime.toFixed(1)}ms)`);
    console.log(`  最大誤差時刻: t=${formatTime(peakErrorTime)}`);
    
    // 數值穩定性評估
    let status;
    if (maxError < 0.01) {
        status = '🟢 完美';
    } else if (maxError < 0.1) {
        status = '🟢 優秀';
    } else if (maxError < 1) {
        status = '🟡 良好';
    } else if (maxError < 10) {
        status = '🟠 一般';
    } else {
        status = '🔴 不穩定';
    }
    
    console.log(`  整體評價: ${status} (最大誤差: ${maxError.toFixed(4)}%)`);
    
    // 檢查能量守恆 (選擇中間時刻)
    const midIdx = Math.floor(steps / 2);
    const cpuMid = cpuResults[midIdx];
    const gpuMid = gpuResults[midIdx];
    
    const cpuEnergy = 0.5 * L * cpuMid.IL * cpuMid.IL + 0.5 * C * cpuMid.VC * cpuMid.VC;
    const gpuEnergy = 0.5 * L * gpuMid.IL * gpuMid.IL + 0.5 * C * gpuMid.VC * gpuMid.VC;
    const energyError = Math.abs((gpuEnergy - cpuEnergy) / cpuEnergy * 100);
    
    console.log(`  能量守恆: 誤差=${energyError.toFixed(4)}% ${energyError < 1 ? '✅' : '⚠️'}`);
    
    return {
        frequency,
        name,
        cpuTime,
        gpuTime,
        speedup,
        maxErrorIL,
        maxErrorVC,
        maxError,
        rmsErrorIL,
        rmsErrorVC,
        energyError,
        status,
        Q,
        f0
    };
}

function analyzeMultiFrequencyResults(results, testCases) {
    console.log('📋 頻率範圍性能總結:');
    console.log('頻率      | CPU時間 | GPU時間 | 加速比 | 最大誤差 | RMS誤差 | 能量誤差 | 狀態');
    console.log('-'.repeat(85));
    
    results.forEach((result, i) => {
        const freqStr = formatFreq(result.frequency).padEnd(9);
        const cpuStr = `${result.cpuTime.toFixed(1)}ms`.padStart(7);
        const gpuStr = `${result.gpuTime.toFixed(1)}ms`.padStart(7);
        const speedupStr = `${result.speedup.toFixed(2)}x`.padStart(6);
        const maxErrStr = `${result.maxError.toFixed(3)}%`.padStart(8);
        const rmsErrStr = `${Math.max(result.rmsErrorIL, result.rmsErrorVC).toFixed(3)}%`.padStart(7);
        const energyStr = `${result.energyError.toFixed(3)}%`.padStart(8);
        
        console.log(`${freqStr} | ${cpuStr} | ${gpuStr} | ${speedupStr} | ${maxErrStr} | ${rmsErrStr} | ${energyStr} | ${result.status}`);
    });
    
    console.log('\n🎯 關鍵發現:');
    
    // 分析趨勢
    const speedups = results.map(r => r.speedup);
    const errors = results.map(r => r.maxError);
    
    console.log(`  📈 加速比趨勢: ${speedups[0].toFixed(2)}x → ${speedups[1].toFixed(2)}x → ${speedups[2].toFixed(2)}x`);
    console.log(`  🎯 精度趨勢: ${errors[0].toFixed(3)}% → ${errors[1].toFixed(3)}% → ${errors[2].toFixed(3)}%`);
    
    const avgSpeedup = speedups.reduce((a, b) => a + b) / speedups.length;
    const maxError = Math.max(...errors);
    
    if (avgSpeedup > 1.5) {
        console.log(`  ⚡ GPU顯示明顯性能優勢 (平均加速比: ${avgSpeedup.toFixed(2)}x)`);
    }
    
    if (maxError < 1) {
        console.log(`  ✅ 所有頻率範圍內精度優秀 (最大誤差: ${maxError.toFixed(3)}%)`);
    }
    
    console.log('\n💡 實用建議:');
    results.forEach((result, i) => {
        const advice = result.speedup > 2 ? '推薦GPU' : result.speedup > 1.2 ? 'GPU有優勢' : 'CPU/GPU皆可';
        console.log(`  ${testCases[i].symbol} ${formatFreq(result.frequency)}: ${advice} (${result.speedup.toFixed(2)}x加速, ${result.maxError.toFixed(3)}%誤差)`);
    });
}

// 輔助格式化函數
function formatFreq(freq) {
    if (freq >= 1e6) return `${(freq/1e6).toFixed(1)}MHz`;
    if (freq >= 1e3) return `${(freq/1e3).toFixed(1)}kHz`;
    return `${freq.toFixed(0)}Hz`;
}

function formatValue(value, unit) {
    const abs = Math.abs(value);
    if (abs >= 1e-3) return `${(value*1e3).toFixed(2)}m${unit}`;
    if (abs >= 1e-6) return `${(value*1e6).toFixed(2)}μ${unit}`;
    if (abs >= 1e-9) return `${(value*1e9).toFixed(2)}n${unit}`;
    if (abs >= 1e-12) return `${(value*1e12).toFixed(2)}p${unit}`;
    if (abs === 0) return `0${unit}`;
    return `${value.toExponential(2)}${unit}`;
}

function formatTime(time) {
    if (time >= 1) return `${time.toFixed(3)}s`;
    if (time >= 1e-3) return `${(time*1e3).toFixed(2)}ms`;
    if (time >= 1e-6) return `${(time*1e6).toFixed(2)}μs`;
    if (time >= 1e-9) return `${(time*1e9).toFixed(2)}ns`;
    return `${time.toExponential(2)}s`;
}

// 運行多頻率RLC測試
testMultiFrequencyRLC();