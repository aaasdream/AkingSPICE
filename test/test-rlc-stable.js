// 修正版RLC頻率測試 - 適當的時間步長 (159Hz, 15.9kHz, 159kHz)
import { ExplicitStateSolver } from '../src/core/explicit-state-solver.js';
import { VoltageSource } from '../src/components/sources.js';
import { Resistor } from '../src/components/resistor.js';
import { Capacitor } from '../src/components/capacitor.js';
import { Inductor } from '../src/components/inductor.js';

console.log('🔬 修正版RLC電路頻率測試');
console.log('測試頻率: 159Hz → 15.9kHz → 159kHz');
console.log('使用穩定的時間步長設定');
console.log('='.repeat(50));

async function testRLCCorrected() {
    try {
        // 三個測試案例，每個都有經過調整的參數
        const testCases = [
            {
                name: '低頻測試',
                frequency: 159,
                L: 1e-3,      // 1mH
                C: 1e-6,      // 1μF
                R: 10,        // 10Ω
                dtFactor: 0.01,  // 保守的時間步長
                maxSteps: 50,
                symbol: '🎵'
            },
            {
                name: '中頻測試',
                frequency: 15900,
                L: 10e-6,     // 10μH
                C: 1e-6,      // 1μF
                R: 10,        // 10Ω  
                dtFactor: 0.01,  // 保守的時間步長
                maxSteps: 75,
                symbol: '📻'
            },
            {
                name: '高頻測試',  
                frequency: 159000,
                L: 1e-6,      // 1μH
                C: 1e-6,      // 1μF
                R: 10,        // 10Ω
                dtFactor: 0.005, // 更保守的時間步長
                maxSteps: 100,
                symbol: '📡'
            }
        ];

        const results = [];

        for (const testCase of testCases) {
            console.log(`\n${testCase.symbol} ${testCase.name} (${formatFreq(testCase.frequency)})`);
            console.log('-'.repeat(40));
            
            const result = await testSingleCase(testCase);
            results.push(result);
            
            if (result.stable) {
                console.log(`✅ 穩定: 時間=${result.cpuTime.toFixed(1)}ms, 最大電流=${formatValue(result.maxCurrent, 'A')}, 最大電壓=${formatValue(result.maxVoltage, 'V')}`);
            } else {
                console.log(`⚠️ 不穩定: 需要更小的時間步長`);
            }
        }
        
        // 總結穩定的結果
        const stableResults = results.filter(r => r.stable);
        
        console.log('\n' + '='.repeat(50));
        console.log('📊 穩定測試結果總結:');
        console.log('頻率      | 執行時間 | 最大電流 | 最大電壓 | 諧振頻率 | Q因子');
        console.log('-'.repeat(70));
        
        stableResults.forEach(r => {
            const freqStr = formatFreq(r.frequency).padEnd(9);
            const timeStr = `${r.cpuTime.toFixed(1)}ms`.padStart(8);
            const currentStr = formatValue(r.maxCurrent, 'A').padStart(10);
            const voltageStr = formatValue(r.maxVoltage, 'V').padStart(10);
            const f0Str = formatFreq(r.f0).padStart(10);
            const qStr = r.Q.toFixed(2).padStart(6);
            
            console.log(`${freqStr} | ${timeStr} | ${currentStr} | ${voltageStr} | ${f0Str} | ${qStr}`);
        });
        
        // 分析電路行為
        console.log('\n🔍 電路行為分析:');
        stableResults.forEach((r, i) => {
            const deviation = ((r.frequency - r.f0) / r.f0 * 100).toFixed(1);
            const damping = r.Q > 0.5 ? '欠阻尼' : '過阻尼';
            
            console.log(`  ${testCases.find(t => t.frequency === r.frequency).symbol} ${formatFreq(r.frequency)}: 偏離諧振${deviation}%, ${damping} (Q=${r.Q.toFixed(2)})`);
        });
        
        if (stableResults.length === 3) {
            console.log('\n🎉 所有頻率測試都達到數值穩定！');
        }

    } catch (error) {
        console.error('❌ 測試失敗:', error.message);
    }
}

async function testSingleCase(testCase) {
    const { name, frequency, L, C, R, dtFactor, maxSteps } = testCase;
    
    // 計算電路理論參數
    const omega0 = 1 / Math.sqrt(L * C);
    const f0 = omega0 / (2 * Math.PI);
    const Q = (1 / R) * Math.sqrt(L / C);
    const criticalDt = 2 / omega0;  // 基於諧振頻率的臨界時間步長
    
    console.log(`  電路: L=${formatValue(L, 'H')}, C=${formatValue(C, 'F')}, R=${R}Ω`);
    console.log(`  諧振頻率: ${formatFreq(f0)}, Q因子: ${Q.toFixed(3)}`);
    
    // 使用保守的時間步長
    const dt = criticalDt * dtFactor;
    const simTime = 3 / frequency;  // 仿真3個週期
    const totalSteps = Math.min(maxSteps, Math.floor(simTime / dt));
    
    console.log(`  時間設定: dt=${formatTime(dt)}, 步數=${totalSteps}, 總時間=${formatTime(simTime)}`);
    console.log(`  穩定性: dt/dt_crit = ${(dt/criticalDt).toFixed(4)}`);
    
    // 創建RLC串聯電路
    const components = [
        new VoltageSource('V1', ['vin', 'gnd'], 5),          // 5V階躍
        new Resistor('R1', ['vin', 'n1'], R),                // 串聯電阻
        new Inductor('L1', ['n1', 'n2'], L, { ic: 0 }),     // 串聯電感  
        new Capacitor('C1', ['n2', 'gnd'], C, { ic: 0 })    // 並聯電容
    ];
    
    // CPU仿真
    const startTime = performance.now();
    
    const solver = new ExplicitStateSolver();
    await solver.initialize(components, dt);
    
    let maxCurrent = 0;
    let maxVoltage = 0;
    let finalCurrent = 0;
    let finalVoltage = 0;
    let stable = true;
    
    console.log('  開始穩定性仿真...');
    
    for (let i = 0; i < totalSteps; i++) {
        const result = await solver.step();
        
        const IL = result.stateVariables.get('L1') || 0;
        const VC = result.stateVariables.get('C1') || 0;
        
        // 檢查數值穩定性
        if (Math.abs(IL) > 100 || Math.abs(VC) > 1000) {
            console.log(`  ⚠️ 步驟${i+1}檢測到不穩定: IL=${formatValue(IL, 'A')}, VC=${formatValue(VC, 'V')}`);
            stable = false;
            break;
        }
        
        maxCurrent = Math.max(maxCurrent, Math.abs(IL));
        maxVoltage = Math.max(maxVoltage, Math.abs(VC));
        
        if (i === totalSteps - 1) {
            finalCurrent = IL;
            finalVoltage = VC;
        }
        
        // 顯示關鍵數據點
        if (i < 3 || i === Math.floor(totalSteps/2) || i >= totalSteps - 3) {
            console.log(`    步驟${i+1}: t=${formatTime(result.time)}, IL=${formatValue(IL, 'A')}, VC=${formatValue(VC, 'V')}`);
        }
    }
    
    const cpuTime = performance.now() - startTime;
    
    if (stable) {
        console.log(`  最終穩定值: IL=${formatValue(finalCurrent, 'A')}, VC=${formatValue(finalVoltage, 'V')}`);
        
        // 計算理論最終值 (RC充電)
        const tau = R * C;  // RC時間常數
        const theoreticalFinalVC = 5 * (1 - Math.exp(-simTime/tau));
        console.log(`  理論最終電壓: ${formatValue(theoreticalFinalVC, 'V')} (τ=${formatTime(tau)})`);
    }
    
    return {
        frequency,
        cpuTime,
        maxCurrent,
        maxVoltage,
        finalCurrent,
        finalVoltage,
        f0,
        Q,
        stable
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

// 執行修正測試
testRLCCorrected();