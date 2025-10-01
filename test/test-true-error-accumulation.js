// 真正的誤差累積測試 - 使用週期性激勵和理論解對比
import { ExplicitStateSolver } from '../src/core/explicit-state-solver.js';
import { VoltageSource } from '../src/components/sources.js';
import { Resistor } from '../src/components/resistor.js';
import { Capacitor } from '../src/components/capacitor.js';
import { Inductor } from '../src/components/inductor.js';

console.log('🔬 數值誤差累積真實測試');
console.log('使用週期性激勵檢驗長時間穩定性');
console.log('='.repeat(60));

async function testRealErrorAccumulation() {
    try {
        // 使用諧振頻率附近的電路來產生週期性響應
        const frequency = 159000;  // 159kHz (接近諧振)
        const L = 1e-6;           // 1μH
        const C = 1e-6;           // 1μF  
        const R = 1;              // 降低阻尼以增強振蕩
        
        // 計算理論參數
        const omega0 = 1 / Math.sqrt(L * C);
        const f0 = omega0 / (2 * Math.PI);
        const Q = (1 / R) * Math.sqrt(L / C);
        const dt = (2 * Math.PI / omega0) / 200;  // 每週期200個點
        
        console.log(`📋 測試電路 (高Q振蕩器):`);
        console.log(`  目標頻率: ${formatFreq(frequency)}, 諧振頻率: ${formatFreq(f0)}`);
        console.log(`  L=${formatValue(L, 'H')}, C=${formatValue(C, 'F')}, R=${R}Ω`);
        console.log(`  Q因子: ${Q.toFixed(1)}, 時間步長: ${formatTime(dt)}`);
        
        // 測試不同的週期數
        const cyclesToTest = [1, 5, 20];  // 1, 5, 20個週期
        const results = [];
        
        for (const cycles of cyclesToTest) {
            console.log(`\n🔄 測試 ${cycles} 個週期`);
            console.log('-'.repeat(40));
            
            const result = await testErrorForCycles(L, C, R, dt, cycles, f0, Q);
            
            if (result.success) {
                results.push({
                    cycles,
                    ...result
                });
                
                console.log(`✅ 完成 ${cycles} 週期:`);
                console.log(`   執行時間: ${result.executionTime.toFixed(1)}ms`);
                console.log(`   振蕩幅度: ${formatValue(result.oscillationAmplitude, 'A')}`);
                console.log(`   能量守恆誤差: ${result.energyError.toFixed(4)}%`);
                console.log(`   週期穩定性: ${result.periodStability ? '✅' : '⚠️'}`);
            } else {
                console.log(`❌ ${cycles} 週期測試失敗`);
            }
        }
        
        // 分析誤差累積趨勢
        if (results.length >= 2) {
            console.log('\n' + '='.repeat(60));
            console.log('📊 誤差累積趨勢分析');
            console.log('='.repeat(60));
            
            analyzeErrorAccumulation(results);
        }
        
    } catch (error) {
        console.error('❌ 誤差累積測試失敗:', error.message);
    }
}

async function testErrorForCycles(L, C, R, dt, cycles, f0, Q) {
    // 計算所需步數
    const period = 1 / f0;
    const totalTime = cycles * period;
    const totalSteps = Math.floor(totalTime / dt);
    
    console.log(`  週期數: ${cycles}, 總時間: ${formatTime(totalTime)}, 步數: ${totalSteps}`);
    
    // 創建高Q RLC電路
    const components = [
        new VoltageSource('V1', ['vin', 'gnd'], 5),    // 階躍激勵
        new Resistor('R1', ['vin', 'n1'], R),
        new Inductor('L1', ['n1', 'n2'], L, { ic: 0 }),
        new Capacitor('C1', ['n2', 'gnd'], C, { ic: 0 })
    ];
    
    console.log('  🔄 執行振蕩仿真...');
    const startTime = performance.now();
    
    try {
        const solver = new ExplicitStateSolver();
        await solver.initialize(components, dt);
        
        const timeHistory = [];
        const currentHistory = [];
        const voltageHistory = [];
        const energyHistory = [];
        
        let maxCurrent = 0;
        let minCurrent = 0;
        
        for (let i = 0; i < totalSteps; i++) {
            const result = await solver.step();
            const IL = result.stateVariables.get('L1') || 0;
            const VC = result.stateVariables.get('C1') || 0;
            
            // 檢查數值爆炸
            if (Math.abs(IL) > 1000 || Math.abs(VC) > 1000 || isNaN(IL) || isNaN(VC)) {
                console.log(`    ❌ 步驟${i+1}數值失控`);
                return { success: false };
            }
            
            // 記錄歷史
            timeHistory.push(result.time);
            currentHistory.push(IL);
            voltageHistory.push(VC);
            
            // 計算能量
            const energy = 0.5 * L * IL * IL + 0.5 * C * VC * VC;
            energyHistory.push(energy);
            
            maxCurrent = Math.max(maxCurrent, IL);
            minCurrent = Math.min(minCurrent, IL);
            
            // 定期進度報告
            if (i % Math.max(1, Math.floor(totalSteps / 5)) === 0 || i === totalSteps - 1) {
                const currentCycle = result.time / period;
                console.log(`    進度 ${((i+1)/totalSteps*100).toFixed(0)}% (週期${currentCycle.toFixed(2)}): IL=${formatValue(IL, 'A')}, VC=${formatValue(VC, 'V')}, E=${formatValue(energy, 'J')}`);
            }
        }
        
        const executionTime = performance.now() - startTime;
        
        // 分析結果
        const oscillationAmplitude = maxCurrent - minCurrent;
        
        // 檢查週期穩定性 (比較第一個週期和最後一個週期)
        const samplesPerCycle = Math.floor(totalSteps / cycles);
        let periodStability = true;
        
        if (cycles > 1 && samplesPerCycle > 10) {
            // 比較第一週期和最後週期的幅度
            const firstCyclePeak = Math.max(...currentHistory.slice(0, samplesPerCycle));
            const lastCyclePeak = Math.max(...currentHistory.slice(-samplesPerCycle));
            
            const amplitudeChange = Math.abs((lastCyclePeak - firstCyclePeak) / firstCyclePeak * 100);
            
            if (amplitudeChange > 5) {  // 5%以上的幅度變化認為不穩定
                periodStability = false;
            }
            
            console.log(`    週期穩定性: 第1週期峰值=${formatValue(firstCyclePeak, 'A')}, 最後週期峰值=${formatValue(lastCyclePeak, 'A')}, 變化=${amplitudeChange.toFixed(2)}%`);
        }
        
        // 能量分析
        const initialEnergy = energyHistory[Math.floor(totalSteps * 0.1)];  // 跳過初始瞬態
        const finalEnergy = energyHistory[energyHistory.length - 1];
        const energyError = Math.abs((finalEnergy - initialEnergy) / initialEnergy * 100);
        
        console.log(`    能量分析: 初始=${formatValue(initialEnergy, 'J')}, 最終=${formatValue(finalEnergy, 'J')}`);
        
        // 檢查理論衰減 (對於欠阻尼情況)
        const theoreticalDecay = Math.exp(-R / (2 * L) * totalTime);
        const actualDecay = Math.abs(currentHistory[currentHistory.length - 1]) / Math.abs(maxCurrent);
        const decayError = Math.abs((actualDecay - theoreticalDecay) / theoreticalDecay * 100);
        
        console.log(`    衰減分析: 理論=${theoreticalDecay.toFixed(4)}, 實際=${actualDecay.toFixed(4)}, 誤差=${decayError.toFixed(2)}%`);
        
        return {
            success: true,
            executionTime,
            oscillationAmplitude,
            energyError,
            periodStability,
            decayError,
            maxCurrent,
            finalEnergy,
            cycles
        };
        
    } catch (error) {
        console.error('    ❌ 仿真異常:', error.message);
        return { success: false };
    }
}

function analyzeErrorAccumulation(results) {
    console.log('週期數 | 執行時間 | 振蕩幅度 | 能量誤差 | 衰減誤差 | 週期穩定 | 狀態');
    console.log('-'.repeat(75));
    
    results.forEach(r => {
        const cyclesStr = `${r.cycles}`.padStart(5);
        const timeStr = `${r.executionTime.toFixed(1)}ms`.padStart(8);
        const ampStr = formatValue(r.oscillationAmplitude, 'A').padStart(8);
        const energyStr = `${r.energyError.toFixed(3)}%`.padStart(8);
        const decayStr = `${r.decayError.toFixed(2)}%`.padStart(8);
        const stableStr = r.periodStability ? '✅' : '⚠️';
        
        let status;
        if (r.energyError < 1 && r.decayError < 5) {
            status = '🟢 優秀';
        } else if (r.energyError < 5 && r.decayError < 15) {
            status = '🟡 良好';
        } else {
            status = '🔴 差';
        }
        
        console.log(`${cyclesStr} | ${timeStr} | ${ampStr} | ${energyStr} | ${decayStr} |    ${stableStr}    | ${status}`);
    });
    
    console.log('\n🔍 累積誤差分析:');
    
    if (results.length >= 2) {
        // 檢查誤差是否隨時間累積
        const energyErrors = results.map(r => r.energyError);
        const decayErrors = results.map(r => r.decayError);
        
        let energyTrend = '穩定';
        let decayTrend = '穩定';
        
        if (energyErrors[energyErrors.length - 1] > energyErrors[0] * 2) {
            energyTrend = '🔴 明顯惡化';
        } else if (energyErrors[energyErrors.length - 1] > energyErrors[0] * 1.2) {
            energyTrend = '🟡 輕微惡化';
        } else {
            energyTrend = '✅ 穩定';
        }
        
        if (decayErrors[decayErrors.length - 1] > decayErrors[0] * 2) {
            decayTrend = '🔴 明顯惡化';
        } else if (decayErrors[decayErrors.length - 1] > decayErrors[0] * 1.2) {
            decayTrend = '🟡 輕微惡化';
        } else {
            decayTrend = '✅ 穩定';
        }
        
        console.log(`  能量守恆趨勢: ${energyTrend}`);
        console.log(`  衰減精度趨勢: ${decayTrend}`);
        
        // 總體評估
        const maxEnergyError = Math.max(...energyErrors);
        const maxDecayError = Math.max(...decayErrors);
        
        if (maxEnergyError < 1 && maxDecayError < 10) {
            console.log('  🎉 結論: 長時間模擬數值穩定性優秀，誤差不會顯著累積');
        } else if (maxEnergyError < 5 && maxDecayError < 20) {
            console.log('  ✅ 結論: 數值穩定性良好，可用於中長期仿真');
        } else {
            console.log('  ⚠️ 結論: 存在誤差累積問題，建議縮小時間步長或檢查算法');
        }
        
        // 性能擴展性
        const timePerCycle = results.map(r => r.executionTime / r.cycles);
        const avgTimePerCycle = timePerCycle.reduce((a, b) => a + b, 0) / timePerCycle.length;
        
        console.log(`  ⏱️ 平均每週期計算時間: ${avgTimePerCycle.toFixed(2)}ms`);
        
        if (timePerCycle.every((t, i) => i === 0 || t < timePerCycle[0] * 1.2)) {
            console.log('  📈 性能擴展性: 線性擴展，適合長時間仿真');
        } else {
            console.log('  📈 性能擴展性: 存在性能退化');
        }
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

// 執行真實誤差累積測試
testRealErrorAccumulation();