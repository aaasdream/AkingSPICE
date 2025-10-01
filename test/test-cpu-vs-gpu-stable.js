// CPU vs GPU RLC對比測試 - 穩定版本 (159Hz, 15.9kHz, 159kHz)
import { ExplicitStateSolver } from '../src/core/explicit-state-solver.js';
import { GPUExplicitStateSolver } from '../src/core/gpu-explicit-solver.js';
import { VoltageSource } from '../src/components/sources.js';
import { Resistor } from '../src/components/resistor.js';
import { Capacitor } from '../src/components/capacitor.js';
import { Inductor } from '../src/components/inductor.js';

console.log('⚡ CPU vs GPU RLC電路對比測試');
console.log('測試頻率: 159Hz → 15.9kHz → 159kHz');
console.log('='.repeat(60));

async function compareCPUvsGPU() {
    try {
        // 測試案例配置 (使用與穩定測試相同的參數)
        const testCases = [
            {
                name: '低頻基準',
                frequency: 159,
                L: 1e-3,      // 1mH
                C: 1e-6,      // 1μF
                R: 10,        // 10Ω
                dtFactor: 0.01,
                maxSteps: 30,  // 減少步數以避免GPU超時
                symbol: '🎵'
            },
            {
                name: '中頻測試',
                frequency: 15900,
                L: 10e-6,     // 10μH
                C: 1e-6,      // 1μF
                R: 10,        // 10Ω
                dtFactor: 0.01,
                maxSteps: 40,
                symbol: '📻'
            },
            {
                name: '高頻測試',
                frequency: 159000,
                L: 1e-6,      // 1μH
                C: 1e-6,      // 1μF
                R: 10,        // 10Ω
                dtFactor: 0.005,
                maxSteps: 50,
                symbol: '📡'
            }
        ];

        const allResults = [];

        for (const testCase of testCases) {
            console.log(`\n${testCase.symbol} ${testCase.name} - ${formatFreq(testCase.frequency)}`);
            console.log('-'.repeat(50));
            
            const result = await compareForFrequency(testCase);
            allResults.push(result);
        }

        // 綜合分析
        console.log('\n' + '='.repeat(60));
        console.log('📊 CPU vs GPU 綜合比較結果');
        console.log('='.repeat(60));
        
        console.log('頻率      | CPU時間 | GPU時間 | 加速比 | 最大誤差 | RMS誤差 | 狀態');
        console.log('-'.repeat(75));
        
        allResults.forEach(r => {
            if (r.comparison) {
                const freqStr = formatFreq(r.frequency).padEnd(9);
                const cpuStr = `${r.cpuTime.toFixed(1)}ms`.padStart(7);
                const gpuStr = `${r.gpuTime.toFixed(1)}ms`.padStart(7);
                const speedupStr = r.gpuTime > 0 ? `${(r.cpuTime/r.gpuTime).toFixed(2)}x`.padStart(6) : '  N/A';
                const maxErrStr = r.maxError ? `${r.maxError.toFixed(3)}%`.padStart(8) : '   N/A';
                const rmsErrStr = r.rmsError ? `${r.rmsError.toFixed(3)}%`.padStart(7) : '  N/A';
                const statusStr = r.status || '未完成';
                
                console.log(`${freqStr} | ${cpuStr} | ${gpuStr} | ${speedupStr} | ${maxErrStr} | ${rmsErrStr} | ${statusStr}`);
            }
        });

        // 成功完成的測試分析
        const successfulTests = allResults.filter(r => r.comparison && r.status !== '❌ GPU失敗');
        
        if (successfulTests.length > 0) {
            console.log('\n💡 分析結果:');
            
            const avgSpeedup = successfulTests.reduce((sum, r) => sum + (r.gpuTime > 0 ? r.cpuTime/r.gpuTime : 0), 0) / successfulTests.length;
            const maxErrorRange = successfulTests.map(r => r.maxError).filter(e => e !== undefined);
            
            if (avgSpeedup > 0) {
                console.log(`  🚀 平均加速比: ${avgSpeedup.toFixed(2)}x`);
                if (avgSpeedup > 1.5) {
                    console.log(`  ✅ GPU顯示明顯性能優勢`);
                } else if (avgSpeedup > 0.8) {
                    console.log(`  ⚖️ CPU和GPU性能相近`);  
                } else {
                    console.log(`  💻 CPU在這些測試中表現更好`);
                }
            }
            
            if (maxErrorRange.length > 0) {
                const avgError = maxErrorRange.reduce((a, b) => a + b, 0) / maxErrorRange.length;
                console.log(`  🎯 平均精度誤差: ${avgError.toFixed(3)}%`);
                
                if (avgError < 1) {
                    console.log(`  ✅ 精度優秀，CPU和GPU結果高度一致`);
                } else if (avgError < 5) {
                    console.log(`  🟡 精度良好，可接受的差異範圍`);
                } else {
                    console.log(`  ⚠️ 精度需要改進`);
                }
            }
        }
        
        console.log('\n🏆 測試總結:');
        console.log(`  完成測試: ${allResults.length}/3`);
        console.log(`  GPU成功: ${successfulTests.length}/${allResults.length}`);
        
        if (successfulTests.length === 3) {
            console.log('  🎉 所有頻率的CPU vs GPU測試都成功完成！');
        }

    } catch (error) {
        console.error('❌ CPU vs GPU測試失敗:', error.message);
    }
}

async function compareForFrequency(testCase) {
    const { name, frequency, L, C, R, dtFactor, maxSteps } = testCase;
    
    // 計算電路參數
    const omega0 = 1 / Math.sqrt(L * C);
    const f0 = omega0 / (2 * Math.PI);
    const Q = (1 / R) * Math.sqrt(L / C);
    const criticalDt = 2 / omega0;
    const dt = criticalDt * dtFactor;
    
    console.log(`📋 電路: L=${formatValue(L, 'H')}, C=${formatValue(C, 'F')}, R=${R}Ω`);
    console.log(`   諧振: ${formatFreq(f0)}, Q=${Q.toFixed(3)}, dt=${formatTime(dt)}, 步數=${maxSteps}`);
    
    // 創建電路組件
    const components = [
        new VoltageSource('V1', ['vin', 'gnd'], 5),
        new Resistor('R1', ['vin', 'n1'], R),
        new Inductor('L1', ['n1', 'n2'], L, { ic: 0 }),
        new Capacitor('C1', ['n2', 'gnd'], C, { ic: 0 })
    ];
    
    // CPU測試
    console.log('\n💻 CPU仿真:');
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
            
            // 檢查穩定性
            if (Math.abs(IL) > 100 || Math.abs(VC) > 1000) {
                console.log(`  ⚠️ CPU在步驟${i+1}檢測到不穩定`);
                cpuSuccess = false;
                break;
            }
            
            cpuResults.push({ time: result.time, IL, VC });
            
            if (i < 3 || i >= maxSteps - 3) {
                console.log(`  步驟${i+1}: t=${formatTime(result.time)}, IL=${formatValue(IL, 'A')}, VC=${formatValue(VC, 'V')}`);
            } else if (i === 3) {
                console.log(`  ... (${maxSteps-6}個中間步驟) ...`);
            }
        }
    } catch (error) {
        console.error('  ❌ CPU仿真失敗:', error.message);
        cpuSuccess = false;
    }
    
    const cpuTime = performance.now() - cpuStartTime;
    console.log(`  CPU執行時間: ${cpuTime.toFixed(2)}ms`);
    
    if (!cpuSuccess || cpuResults.length === 0) {
        return {
            frequency,
            comparison: false,
            status: '❌ CPU失敗',
            cpuTime
        };
    }
    
    // GPU測試
    console.log('\n🚀 GPU仿真:');
    const gpuStartTime = performance.now();
    
    let gpuSolver;
    const gpuResults = [];
    let gpuSuccess = true;
    let gpuTime = 0;
    
    try {
        gpuSolver = new GPUExplicitStateSolver({ debug: false });
        await gpuSolver.initialize(components, dt);
        
        for (let i = 0; i < maxSteps; i++) {
            const result = await gpuSolver.step();
            const IL = result.stateVariables.get('L1') || 0;
            const VC = result.stateVariables.get('C1') || 0;
            
            // 檢查穩定性 
            if (Math.abs(IL) > 100 || Math.abs(VC) > 1000) {
                console.log(`  ⚠️ GPU在步驟${i+1}檢測到不穩定`);
                gpuSuccess = false;
                break;
            }
            
            gpuResults.push({ time: result.time, IL, VC });
            
            if (i < 3 || i >= maxSteps - 3) {
                console.log(`  步驟${i+1}: t=${formatTime(result.time)}, IL=${formatValue(IL, 'A')}, VC=${formatValue(VC, 'V')}`);
            } else if (i === 3) {
                console.log(`  ... (${maxSteps-6}個中間步驟) ...`);
            }
        }
        
        gpuTime = performance.now() - gpuStartTime;
        console.log(`  GPU執行時間: ${gpuTime.toFixed(2)}ms`);
        
    } catch (error) {
        console.error('  ❌ GPU仿真失敗:', error.message);
        gpuSuccess = false;
        gpuTime = performance.now() - gpuStartTime;
    }
    
    // 比較分析
    if (cpuSuccess && gpuSuccess && cpuResults.length === gpuResults.length && gpuResults.length > 0) {
        console.log('\n📊 CPU vs GPU 詳細比較:');
        
        let maxErrorIL = 0, maxErrorVC = 0;
        let sumErrorIL = 0, sumErrorVC = 0;
        
        const minLength = Math.min(cpuResults.length, gpuResults.length);
        
        for (let i = 0; i < minLength; i++) {
            const cpu = cpuResults[i];
            const gpu = gpuResults[i];
            
            const errorIL = Math.abs((gpu.IL - cpu.IL) / (Math.abs(cpu.IL) + 1e-15) * 100);
            const errorVC = Math.abs((gpu.VC - cpu.VC) / (Math.abs(cpu.VC) + 1e-15) * 100);
            
            maxErrorIL = Math.max(maxErrorIL, errorIL);
            maxErrorVC = Math.max(maxErrorVC, errorVC);
            
            sumErrorIL += errorIL * errorIL;
            sumErrorVC += errorVC * errorVC;
        }
        
        const rmsErrorIL = Math.sqrt(sumErrorIL / minLength);
        const rmsErrorVC = Math.sqrt(sumErrorVC / minLength);
        const maxError = Math.max(maxErrorIL, maxErrorVC);
        const rmsError = Math.max(rmsErrorIL, rmsErrorVC);
        
        console.log(`  電感電流: 最大誤差=${maxErrorIL.toFixed(4)}%, RMS誤差=${rmsErrorIL.toFixed(4)}%`);
        console.log(`  電容電壓: 最大誤差=${maxErrorVC.toFixed(4)}%, RMS誤差=${rmsErrorVC.toFixed(4)}%`);
        console.log(`  性能比較: CPU=${cpuTime.toFixed(1)}ms, GPU=${gpuTime.toFixed(1)}ms, 加速比=${(cpuTime/gpuTime).toFixed(2)}x`);
        
        let status;
        if (maxError < 0.1) {
            status = '✅ 優秀';
        } else if (maxError < 1) {
            status = '🟢 良好';
        } else if (maxError < 10) {
            status = '🟡 一般';
        } else {
            status = '🔴 差';
        }
        
        return {
            frequency,
            cpuTime,
            gpuTime,
            maxError,
            rmsError,
            status,
            comparison: true
        };
    } else {
        const status = !gpuSuccess ? '❌ GPU失敗' : '❌ 比較失敗';
        return {
            frequency,
            cpuTime,
            gpuTime,
            status,
            comparison: false
        };
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

// 執行CPU vs GPU比較
compareCPUvsGPU();