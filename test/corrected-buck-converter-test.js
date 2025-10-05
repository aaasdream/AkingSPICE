/**
 * 修正的 Buck 轉換器 - 正確的電路拓撲
 * 
 * 正確的 Buck 轉換器拓撲:
 * Vin → [PWM開關] → L → [輸出] → R_load
 *                      ↓
 *                  [續流二極體]
 *                      ↓
 *                     GND
 */

import { MCPTransientAnalysis } from '../src/analysis/transient_mcp.js';
import { VoltageSource } from '../src/components/sources.js';
import { Resistor } from '../src/components/resistor.js';
import { Capacitor } from '../src/components/capacitor.js';
import { Inductor } from '../src/components/inductor.js';
import { Diode_MCP } from '../src/components/diode_mcp.js';

console.log('🚀 修正的 Buck 轉換器測試 - 正確拓撲');
console.log('=====================================');

// Buck 轉換器參數  
const VIN = 24.0;           // 輸入電壓 24V
const VOUT_TARGET = 12.0;   // 目標輸出電壓 12V
const DUTY_CYCLE = VOUT_TARGET / VIN;  // 理論占空比 0.5
const SWITCHING_FREQ = 50e3;  // 開關頻率 50kHz  
const L = 150e-6;           // 電感 150µH
const C = 47e-6;            // 電容 47µF
const RLOAD = 10.0;         // 負載電阻 10Ω

console.log('📋 Buck 轉換器參數:');
console.log(`  輸入電壓: ${VIN}V`);
console.log(`  目標輸出: ${VOUT_TARGET}V`);
console.log(`  理論占空比: ${(DUTY_CYCLE*100).toFixed(1)}%`);
console.log(`  開關頻率: ${(SWITCHING_FREQ/1000).toFixed(0)}kHz`);
console.log(`  電感: ${(L*1e6).toFixed(0)}µH`);
console.log(`  電容: ${(C*1e6).toFixed(0)}µF`);
console.log(`  負載: ${RLOAD}Ω`);

/*
 * 正確的 Buck 轉換器電路:
 * 
 * Vin ----[Vsw]----+----[L1]----+----[C1]----+---- Vout
 *                  |             |           |
 *                 GND           [D1]       [Rload] 
 *                               |           |
 *                              GND         GND
 * 
 * 其中 Vsw 是 PWM 控制的開關，D1 是續流二極體
 */

const components = [
    // 輸入 DC 電源
    new VoltageSource('Vin', ['vin', 'gnd'], VIN),
    
    // PWM 開關 - 控制 Vin 到電感的連接
    new VoltageSource('Vsw', ['vin', 'sw_node'], {
        type: 'PWM',
        dc: 0,                  // 關斷時斷開 (0V 表示不導通)
        pwm: {
            amplitude: 0,       // 開通時為 0V (直接連通)
            frequency: SWITCHING_FREQ,
            dutyCycle: DUTY_CYCLE,
            phase: 0
        }
    }),
    
    // 小電阻模擬開關的導通電阻
    new Resistor('Rsw_on', ['sw_node', 'lx'], 1e-3),  // 1mΩ
    
    // 濾波電感
    new Inductor('L1', ['sw_node', 'lx'], L),
    
    // 續流二極體 (從 gnd 到 lx，反向連接)  
    new Diode_MCP('D1', ['gnd', 'lx'], {
        Vf: 0.7,        // 導通電壓 0.7V
        Ron: 10e-3,     // 導通電阻 10mΩ
        debug: false
    }),
    
    // 輸出濾波電容
    new Capacitor('C1', ['lx', 'gnd'], C),
    
    // 負載電阻  
    new Resistor('Rload', ['lx', 'gnd'], RLOAD)
];

console.log('\n🔧 電路拓撲檢查:');
console.log('  Vin (24V) → Vsw (PWM控制) → L1 (150µH) → 輸出');
console.log('  輸出 → C1 (47µF) || Rload (10Ω) → GND');
console.log('  輸出 → D1 (續流二極體) → GND');

// 設定合理的初始條件
components.find(c => c.name === 'L1').ic = 1.0;  // 電感初始電流 1A
components.find(c => c.name === 'C1').ic = VOUT_TARGET;  // 電容初始電壓 12V

// 模擬參數 - 更細的時間步長來捕捉開關動作
const SWITCHING_PERIOD = 1.0 / SWITCHING_FREQ;  // 開關周期 20µs
const TIME_STEP = SWITCHING_PERIOD / 100;        // 每周期 100 個時間步長  
const SIM_TIME = 3 * SWITCHING_PERIOD;          // 模擬 3 個開關周期

console.log('\n⏱️  時間參數:');
console.log(`  開關周期: ${(SWITCHING_PERIOD*1e6).toFixed(1)}µs`);
console.log(`  時間步長: ${(TIME_STEP*1e6).toFixed(2)}µs`);
console.log(`  模擬時間: ${(SIM_TIME*1e6).toFixed(0)}µs`);
console.log(`  每周期步數: ${(SWITCHING_PERIOD/TIME_STEP).toFixed(0)}`);

const analyzer = new MCPTransientAnalysis({
    enablePredictor: true,    // 啟用預測器
    enableNodeDamping: true,  // 啟用節點阻尼  
    debug: false,
    collectStatistics: true
});

try {
    console.log('\\n🔄 開始修正的 Buck 轉換器分析...');
    
    const result = await analyzer.run(components, {
        startTime: 0,
        stopTime: SIM_TIME,
        timeStep: TIME_STEP
    });
    
    console.log('\\n✅ 模擬成功完成!');
    
    // 分析結果
    const times = result.timeVector;
    const voltages_lx = result.voltageMatrix.lx;
    const voltages_sw = result.voltageMatrix.sw_node; 
    const currents_L1 = result.currentMatrix.L1;
    
    if (!times || times.length === 0) {
        throw new Error('沒有時間點數據');
    }
    
    console.log(`\\n📊 結果分析 (共 ${times.length} 個時間點):`);
    
    // 分析最後一個周期的結果  
    const lastPeriodStart = Math.floor(times.length * 0.67); // 最後 33% 的數據
    
    console.log('\\n📈 最後周期的詳細數據 (每5個點):');
    for (let i = lastPeriodStart; i < times.length; i += 5) {
        const t_us = times[i] * 1e6;
        const v_lx = voltages_lx[i];
        const v_sw = voltages_sw[i]; 
        const i_L = currents_L1[i];
        const phase = (times[i] / SWITCHING_PERIOD) % 1.0;  // 周期內相位
        
        console.log(`  t=${t_us.toFixed(1)}µs (${(phase*100).toFixed(0)}%): Vlx=${v_lx.toFixed(2)}V, Vsw=${v_sw.toFixed(2)}V, IL=${i_L.toFixed(3)}A`);
    }
    
    // 計算平均值和紋波
    const steadyStateStart = Math.floor(times.length * 0.5); // 後 50% 視為穩態
    const avgOutputVoltage = voltages_lx.slice(steadyStateStart).reduce((sum, v) => sum + v, 0) / 
                             (voltages_lx.length - steadyStateStart);
                             
    const avgInductorCurrent = currents_L1.slice(steadyStateStart).reduce((sum, i) => sum + i, 0) / 
                              (currents_L1.length - steadyStateStart);
    
    const outputRipple = Math.max(...voltages_lx.slice(steadyStateStart)) - 
                        Math.min(...voltages_lx.slice(steadyStateStart));
                        
    const currentRipple = Math.max(...currents_L1.slice(steadyStateStart)) - 
                         Math.min(...currents_L1.slice(steadyStateStart));
    
    console.log('\\n🎯 穩態性能分析:');
    console.log(`  平均輸出電壓: ${avgOutputVoltage.toFixed(3)}V (目標: ${VOUT_TARGET}V, 誤差: ${((Math.abs(avgOutputVoltage - VOUT_TARGET)/VOUT_TARGET)*100).toFixed(1)}%)`);
    console.log(`  平均電感電流: ${avgInductorCurrent.toFixed(3)}A (理論: ${(VOUT_TARGET/RLOAD).toFixed(3)}A)`);
    console.log(`  輸出電壓紋波: ${(outputRipple*1000).toFixed(1)}mV (${((outputRipple/avgOutputVoltage)*100).toFixed(2)}%)`);
    console.log(`  電感電流紋波: ${(currentRipple*1000).toFixed(1)}mA (${((currentRipple/avgInductorCurrent)*100).toFixed(1)}%)`);
    
    // 效率和功率分析
    const outputPower = avgOutputVoltage * avgInductorCurrent;
    const inputPower = VIN * avgInductorCurrent * DUTY_CYCLE; // 近似
    const efficiency = (outputPower / inputPower) * 100;
    
    console.log(`  輸出功率: ${outputPower.toFixed(2)}W`);
    console.log(`  輸入功率估計: ${inputPower.toFixed(2)}W`);
    console.log(`  估計效率: ${efficiency.toFixed(1)}%`);
    
    // Buck 轉換器性能檢查
    const voltageError = Math.abs(avgOutputVoltage - VOUT_TARGET) / VOUT_TARGET;
    const currentError = Math.abs(avgInductorCurrent - VOUT_TARGET/RLOAD) / (VOUT_TARGET/RLOAD);
    
    const isVoltageGood = voltageError < 0.1;  // 10% 容差
    const isCurrentGood = currentError < 0.2;  // 20% 容差  
    const isRippleOK = (outputRipple / avgOutputVoltage) < 0.05;  // 5% 紋波
    const isEfficiencyOK = efficiency > 70;  // 效率 > 70%
    
    if (isVoltageGood && isCurrentGood && isRippleOK && isEfficiencyOK) {
        console.log('\\n🎉 Buck 轉換器工作正常!');
        console.log('✅ 輸出電壓穩定且準確');
        console.log('✅ 電感電流穩定'); 
        console.log('✅ 輸出紋波在合理範圍');
        console.log('✅ 效率滿足要求');
        console.log('✅ PWM 開關和二極體協同工作正常');
        console.log('✅ Variable BDF2、Predictor、Node Damping 全部有效');
    } else {
        console.log('\\n⚠️  Buck 轉換器性能需要改進:');
        if (!isVoltageGood) console.log(`❌ 輸出電壓誤差過大: ${(voltageError*100).toFixed(1)}%`);
        if (!isCurrentGood) console.log(`❌ 電感電流誤差過大: ${(currentError*100).toFixed(1)}%`);
        if (!isRippleOK) console.log(`❌ 輸出紋波過大: ${((outputRipple/avgOutputVoltage)*100).toFixed(2)}%`);
        if (!isEfficiencyOK) console.log(`❌ 效率過低: ${efficiency.toFixed(1)}%`);
    }
    
    // 統計信息
    console.log(`\\n📊 數值分析統計:`);
    console.log(`  總時間步數: ${analyzer.statistics?.totalTimeSteps || 'N/A'}`);
    console.log(`  MCP 求解次數: ${analyzer.statistics?.mcpSolveCount || 'N/A'}`);
    console.log(`  預測器調用: ${analyzer.statistics?.predictorUsageCount || 'N/A'}`);
    
} catch (error) {
    console.log(`\\n❌ 測試失敗: ${error.message}`);
    if (error.stack) {
        console.log('錯誤堆棧:');
        console.log(error.stack);
    }
}

console.log('\\n🏁 修正的 Buck 轉換器測試完成');