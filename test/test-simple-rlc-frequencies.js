// 簡化的RLC頻率測試 - CPU vs GPU (159Hz, 15.9kHz, 159kHz)
import { ExplicitStateSolver } from '../src/core/explicit-state-solver.js';
import { VoltageSource } from '../src/components/sources.js';
import { Resistor } from '../src/components/resistor.js';
import { Capacitor } from '../src/components/capacitor.js';
import { Inductor } from '../src/components/inductor.js';

console.log('🔬 簡化RLC電路CPU測試');
console.log('測試頻率: 159Hz → 15.9kHz → 159kHz');
console.log('='.repeat(50));

async function testRLCSimplified() {
    try {
        // 三個測試頻率
        const frequencies = [159, 15900, 159000];
        const results = [];

        for (let i = 0; i < frequencies.length; i++) {
            const freq = frequencies[i];
            console.log(`\n${i+1}. 測試頻率: ${formatFreq(freq)}`);
            console.log('-'.repeat(30));
            
            const result = await testSingleFrequency(freq);
            results.push(result);
            
            console.log(`✅ 完成: 時間=${result.cpuTime.toFixed(1)}ms, 最大電流=${formatValue(result.maxCurrent, 'A')}`);
        }
        
        // 總結比較
        console.log('\n' + '='.repeat(50));
        console.log('📊 頻率測試總結:');
        console.log('頻率      | 執行時間 | 最大電流 | 最大電壓 | 最終電流');
        console.log('-'.repeat(50));
        
        results.forEach((r, i) => {
            const freqStr = formatFreq(r.frequency).padEnd(9);
            const timeStr = `${r.cpuTime.toFixed(1)}ms`.padStart(8);
            const currentStr = formatValue(r.maxCurrent, 'A').padStart(8);
            const voltageStr = formatValue(r.maxVoltage, 'V').padStart(8);
            const finalStr = formatValue(r.finalCurrent, 'A').padStart(8);
            
            console.log(`${freqStr} | ${timeStr} | ${currentStr} | ${voltageStr} | ${finalStr}`);
        });
        
        // 分析趨勢
        console.log('\n🔍 分析:');
        const executionTimes = results.map(r => r.cpuTime);
        const maxCurrents = results.map(r => r.maxCurrent);
        
        console.log(`  執行時間趨勢: ${executionTimes.map(t => t.toFixed(1)).join('ms → ')}ms`);
        console.log(`  最大電流變化: ${maxCurrents.map(c => formatValue(c, 'A')).join(' → ')}`);
        
        if (executionTimes.every(t => t < 100)) {
            console.log('  ✅ 所有頻率都能在合理時間內完成');
        }
        
        if (maxCurrents.every(c => c > 0 && c < 10)) {
            console.log('  ✅ 電流值都在合理範圍內');
        }

    } catch (error) {
        console.error('❌ 測試失敗:', error.message);
    }
}

async function testSingleFrequency(frequency) {
    // 根據頻率設計電路參數
    let L, C, R;
    
    if (frequency <= 1000) {
        // 低頻 (159Hz)
        L = 1e-3;      // 1mH
        C = 1e-6;      // 1μF  
        R = 10;        // 10Ω
    } else if (frequency <= 20000) {
        // 中頻 (15.9kHz)
        L = 10e-6;     // 10μH
        C = 1e-6;      // 1μF
        R = 10;        // 10Ω
    } else {
        // 高頻 (159kHz)
        L = 1e-6;      // 1μH
        C = 1e-6;      // 1μF
        R = 10;        // 10Ω
    }
    
    // 計算電路參數
    const f0 = 1 / (2 * Math.PI * Math.sqrt(L * C));
    const Q = (1 / R) * Math.sqrt(L / C);
    
    console.log(`  電路: L=${formatValue(L, 'H')}, C=${formatValue(C, 'F')}, R=${R}Ω`);
    console.log(`  諧振頻率: ${formatFreq(f0)}, Q=${Q.toFixed(2)}`);
    
    // 創建RLC串聯電路
    const components = [
        new VoltageSource('V1', ['vin', 'gnd'], 5),          // 5V階躍
        new Resistor('R1', ['vin', 'n1'], R),                // 串聯電阻
        new Inductor('L1', ['n1', 'n2'], L, { ic: 0 }),     // 串聯電感
        new Capacitor('C1', ['n2', 'gnd'], C, { ic: 0 })    // 並聯電容
    ];
    
    // 仿真參數
    const period = 1 / frequency;
    const dt = period / 100;     // 每週期100個點
    const simTime = 3 * period;  // 仿真3個週期
    const steps = Math.min(100, Math.floor(simTime / dt));
    
    console.log(`  仿真: dt=${formatTime(dt)}, 步數=${steps}, 時間=${formatTime(simTime)}`);
    
    // CPU仿真
    const startTime = performance.now();
    
    const solver = new ExplicitStateSolver();
    await solver.initialize(components, dt);
    
    let maxCurrent = 0;
    let maxVoltage = 0;
    let finalCurrent = 0;
    let finalVoltage = 0;
    
    console.log('  開始仿真...');
    
    for (let i = 0; i < steps; i++) {
        const result = await solver.step();
        
        const IL = result.stateVariables.get('L1') || 0;
        const VC = result.stateVariables.get('C1') || 0;
        
        maxCurrent = Math.max(maxCurrent, Math.abs(IL));
        maxVoltage = Math.max(maxVoltage, Math.abs(VC));
        
        if (i === steps - 1) {
            finalCurrent = IL;
            finalVoltage = VC;
        }
        
        // 顯示前幾個數據點
        if (i < 5) {
            console.log(`    步驟${i+1}: t=${formatTime(result.time)}, IL=${formatValue(IL, 'A')}, VC=${formatValue(VC, 'V')}`);
        }
    }
    
    const cpuTime = performance.now() - startTime;
    
    console.log(`  最終: IL=${formatValue(finalCurrent, 'A')}, VC=${formatValue(finalVoltage, 'V')}`);
    
    return {
        frequency,
        cpuTime,
        maxCurrent,
        maxVoltage,
        finalCurrent,
        finalVoltage,
        f0,
        Q
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

// 執行測試
testRLCSimplified();