// 簡化長時間穩定性測試 - 專注於誤差累積分析
import { ExplicitStateSolver } from '../src/core/explicit-state-solver.js';
import { VoltageSource } from '../src/components/sources.js';
import { Resistor } from '../src/components/resistor.js';
import { Capacitor } from '../src/components/capacitor.js';
import { Inductor } from '../src/components/inductor.js';

console.log('📈 誤差累積分析測試');
console.log('檢驗長時間模擬中的數值穩定性');
console.log('='.repeat(50));

async function analyzeLongTermErrors() {
    try {
        // 使用較穩定的電路參數
        const frequency = 15900;  // 15.9kHz
        const L = 10e-6;         // 10μH  
        const C = 1e-6;          // 1μF
        const R = 10;            // 10Ω
        
        // 計算穩定的時間步長
        const omega0 = 1 / Math.sqrt(L * C);
        const dt = (2 / omega0) * 0.01;  // 1%的諧振週期
        
        console.log(`📋 測試設定:`);
        console.log(`  電路: L=${formatValue(L, 'H')}, C=${formatValue(C, 'F')}, R=${R}Ω`);
        console.log(`  頻率: ${formatFreq(frequency)}, 時間步長: ${formatTime(dt)}`);
        
        // 測試不同的時間長度
        const testDurations = [
            { name: '短期', steps: 50, expected: '基準測試' },
            { name: '中期', steps: 150, expected: '誤差應保持穩定' },
            { name: '長期', steps: 300, expected: '檢驗累積效應' }
        ];
        
        const results = [];
        
        for (const duration of testDurations) {
            console.log(`\n🔍 ${duration.name}測試 (${duration.steps}步)`);
            console.log('-'.repeat(30));
            
            const result = await runSingleDurationTest(frequency, L, C, R, dt, duration.steps);
            
            if (result.success) {
                results.push({
                    name: duration.name,
                    steps: duration.steps,
                    ...result
                });
                
                console.log(`✅ 完成: 執行時間=${result.executionTime.toFixed(1)}ms`);
                console.log(`   最大電流: ${formatValue(result.maxCurrent, 'A')}, 最大電壓: ${formatValue(result.maxVoltage, 'V')}`);
                console.log(`   最終值: IL=${formatValue(result.finalCurrent, 'A')}, VC=${formatValue(result.finalVoltage, 'V')}`);
                console.log(`   數值穩定性: ${result.stable ? '✅ 穩定' : '⚠️ 不穩定'}`);
            } else {
                console.log(`❌ 失敗: ${result.reason}`);
            }
        }
        
        // 分析結果趨勢
        if (results.length >= 2) {
            console.log('\n' + '='.repeat(50));
            console.log('📊 誤差累積分析');
            console.log('='.repeat(50));
            
            analyzeErrorTrends(results);
        }
        
    } catch (error) {
        console.error('❌ 測試失敗:', error.message);
    }
}

async function runSingleDurationTest(frequency, L, C, R, dt, maxSteps) {
    // 創建測試電路
    const components = [
        new VoltageSource('V1', ['vin', 'gnd'], 5),    // 5V階躍響應
        new Resistor('R1', ['vin', 'n1'], R),
        new Inductor('L1', ['n1', 'n2'], L, { ic: 0 }),
        new Capacitor('C1', ['n2', 'gnd'], C, { ic: 0 })
    ];
    
    console.log('  💻 執行CPU仿真...');
    const startTime = performance.now();
    
    try {
        const solver = new ExplicitStateSolver();
        await solver.initialize(components, dt);
        
        let maxCurrent = 0;
        let maxVoltage = 0;
        let finalCurrent = 0;
        let finalVoltage = 0;
        let stable = true;
        
        const checkpoints = [];  // 記錄檢查點數據
        
        for (let i = 0; i < maxSteps; i++) {
            const result = await solver.step();
            const IL = result.stateVariables.get('L1') || 0;
            const VC = result.stateVariables.get('C1') || 0;
            
            // 檢查數值穩定性
            if (Math.abs(IL) > 100 || Math.abs(VC) > 1000 || isNaN(IL) || isNaN(VC)) {
                console.log(`    ❌ 在步驟${i+1}檢測到數值失控`);
                stable = false;
                break;
            }
            
            maxCurrent = Math.max(maxCurrent, Math.abs(IL));
            maxVoltage = Math.max(maxVoltage, Math.abs(VC));
            
            // 記錄檢查點 (每1/10進度)
            if (i % Math.max(1, Math.floor(maxSteps / 10)) === 0 || i === maxSteps - 1) {
                checkpoints.push({
                    step: i + 1,
                    time: result.time,
                    IL,
                    VC,
                    progress: ((i + 1) / maxSteps * 100).toFixed(0)
                });
                
                console.log(`    進度${checkpoints[checkpoints.length-1].progress}% (${i+1}/${maxSteps}): IL=${formatValue(IL, 'A')}, VC=${formatValue(VC, 'V')}`);
            }
            
            if (i === maxSteps - 1) {
                finalCurrent = IL;
                finalVoltage = VC;
            }
        }
        
        const executionTime = performance.now() - startTime;
        
        // 分析數值漂移
        let currentDrift = 0;
        let voltageDrift = 0;
        
        if (checkpoints.length >= 3 && stable) {
            const early = checkpoints[1];  // 10%處
            const late = checkpoints[checkpoints.length - 2];  // 90%處
            
            currentDrift = Math.abs((late.IL - early.IL) / (Math.abs(early.IL) + 1e-15) * 100);
            voltageDrift = Math.abs((late.VC - early.VC) / (Math.abs(early.VC) + 1e-15) * 100);
            
            console.log(`    數值漂移: 電流${currentDrift.toFixed(3)}%, 電壓${voltageDrift.toFixed(3)}%`);
        }
        
        return {
            success: true,
            stable,
            executionTime,
            maxCurrent,
            maxVoltage,
            finalCurrent,
            finalVoltage,
            currentDrift,
            voltageDrift,
            checkpoints
        };
        
    } catch (error) {
        console.error('    ❌ 仿真異常:', error.message);
        return {
            success: false,
            reason: error.message
        };
    }
}

function analyzeErrorTrends(results) {
    console.log('步數      | 執行時間 | 最大電流 | 最大電壓 | 電流漂移 | 電壓漂移 | 狀態');
    console.log('-'.repeat(75));
    
    results.forEach(r => {
        const stepsStr = `${r.steps}`.padStart(7);
        const timeStr = `${r.executionTime.toFixed(1)}ms`.padStart(8);
        const currentStr = formatValue(r.maxCurrent, 'A').padStart(8);
        const voltageStr = formatValue(r.maxVoltage, 'V').padStart(8);
        const currentDriftStr = `${r.currentDrift.toFixed(3)}%`.padStart(8);
        const voltageDriftStr = `${r.voltageDrift.toFixed(3)}%`.padStart(8);
        const statusStr = r.stable ? '✅ 穩定' : '❌ 不穩定';
        
        console.log(`${stepsStr} | ${timeStr} | ${currentStr} | ${voltageStr} | ${currentDriftStr} | ${voltageDriftStr} | ${statusStr}`);
    });
    
    // 趨勢分析
    console.log('\n🔍 趨勢分析:');
    
    const stableResults = results.filter(r => r.stable);
    if (stableResults.length >= 2) {
        // 檢查漂移趨勢
        const driftTrend = analyzeDriftTrend(stableResults);
        console.log(`  📈 數值漂移趨勢: ${driftTrend}`);
        
        // 檢查性能趨勢
        const perfTrend = analyzePerformanceTrend(stableResults);
        console.log(`  ⚡ 性能趨勢: ${perfTrend}`);
        
        // 穩定性評估
        const maxDrift = Math.max(
            ...stableResults.map(r => Math.max(r.currentDrift, r.voltageDrift))
        );
        
        if (maxDrift < 1) {
            console.log('  🎉 優秀: 長時間模擬數值穩定性良好');
        } else if (maxDrift < 10) {
            console.log('  ⚠️ 注意: 存在輕微數值漂移，建議縮小時間步長');
        } else {
            console.log('  🔴 警告: 明顯的數值不穩定，需要檢查算法或參數');
        }
    }
}

function analyzeDriftTrend(results) {
    if (results.length < 2) return '數據不足';
    
    const first = results[0];
    const last = results[results.length - 1];
    
    const firstMaxDrift = Math.max(first.currentDrift, first.voltageDrift);
    const lastMaxDrift = Math.max(last.currentDrift, last.voltageDrift);
    
    if (lastMaxDrift > firstMaxDrift * 2) {
        return '🔴 漂移明顯惡化';
    } else if (lastMaxDrift > firstMaxDrift * 1.2) {
        return '🟡 漂移輕微增加';
    } else if (lastMaxDrift < firstMaxDrift * 0.8) {
        return '🟢 漂移改善';
    } else {
        return '✅ 漂移穩定';
    }
}

function analyzePerformanceTrend(results) {
    if (results.length < 2) return '數據不足';
    
    // 計算每步平均時間
    const timePerStep = results.map(r => r.executionTime / r.steps);
    
    const first = timePerStep[0];
    const last = timePerStep[timePerStep.length - 1];
    
    const change = (last - first) / first * 100;
    
    if (Math.abs(change) < 10) {
        return `線性擴展 (${change.toFixed(1)}%變化)`;
    } else if (change > 0) {
        return `性能下降 (+${change.toFixed(1)}%)`;
    } else {
        return `性能改善 (${change.toFixed(1)}%)`;
    }
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

// 執行測試
analyzeLongTermErrors();