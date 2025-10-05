/**
 * 完整 Buck 轉換器測試 - 包含 PWM 開關和續流二極體
 */

import { MCPTransientAnalysis } from '../src/analysis/transient_mcp.js';
import { VoltageSource } from '../src/components/sources.js';
import { Resistor } from '../src/components/resistor.js';
import { Capacitor } from '../src/components/capacitor.js';
import { Inductor } from '../src/components/inductor.js';
import { Diode_MCP } from '../src/components/diode_mcp.js';

console.log('🚀 完整 Buck 轉換器測試 (含 PWM 和二極體)');
console.log('==========================================');

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

// 創建電路元件
const components = [
    // 輸入電源
    new VoltageSource('Vin', ['vin', 'gnd'], VIN),
    
    // PWM 控制的開關 (用電壓控制電流源模擬)
    new VoltageSource('Vsw', ['sw', 'gnd'], {
        type: 'PWM',
        dc: 0,                  // 關斷狀態電壓
        pwm: {
            amplitude: VIN,     // 開通時輸出 VIN
            frequency: SWITCHING_FREQ,
            dutyCycle: DUTY_CYCLE,
            phase: 0
        }
    }),
    
    // 主開關的小電阻 (避免數值問題)
    new Resistor('Rsw', ['vin', 'sw'], 1e-3),
    
    // 濾波電感
    new Inductor('L1', ['sw', 'lx'], L),
    
    // 續流二極體 (從 gnd 到 lx)
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

// 設定初始條件
components.find(c => c.name === 'L1').ic = 0.5;  // 電感初始電流 0.5A
components.find(c => c.name === 'C1').ic = VOUT_TARGET;  // 電容初始電壓接近目標值

// 模擬參數
const SWITCHING_PERIOD = 1.0 / SWITCHING_FREQ;  // 開關周期 20µs
const TIME_STEP = SWITCHING_PERIOD / 20;         // 每個開關周期 20 個時間步長
const SIM_TIME = 5 * SWITCHING_PERIOD;          // 模擬 5 個開關周期

console.log('\n⏱️  時間參數:');
console.log(`  開關周期: ${(SWITCHING_PERIOD*1e6).toFixed(1)}µs`);
console.log(`  時間步長: ${(TIME_STEP*1e6).toFixed(1)}µs`);
console.log(`  模擬時間: ${(SIM_TIME*1e6).toFixed(0)}µs`);
console.log(`  每周期步數: ${(SWITCHING_PERIOD/TIME_STEP).toFixed(0)}`);

const analyzer = new MCPTransientAnalysis({
    enablePredictor: true,    // 啟用預測器
    enableNodeDamping: true,  // 啟用節點阻尼
    debug: false,
    collectStatistics: true
});

try {
    console.log('\n🔄 開始瞬態分析...');
    
    const result = await analyzer.run(components, {
        startTime: 0,
        stopTime: SIM_TIME,
        timeStep: TIME_STEP
    });
    
    console.log('\n✅ 模擬成功完成!');
    
    // 分析結果
    const times = result.timeVector;
    const voltages_lx = result.voltageMatrix.lx;
    const voltages_sw = result.voltageMatrix.sw;
    const currents_L1 = result.currentMatrix.L1;
    
    if (!times || times.length === 0) {
        throw new Error('沒有時間點數據');
    }
    
    console.log(`\n📊 結果分析 (共 ${times.length} 個時間點):`);
    
    // 分析最後一個周期的結果
    const lastPeriodStart = Math.floor(times.length * 0.8); // 最後 20% 的數據
    
    console.log('\n📈 最後一個周期數據:');
    for (let i = Math.max(0, times.length - 10); i < times.length; i++) {
        const t_us = times[i] * 1e6;
        const v_lx = voltages_lx[i];
        const v_sw = voltages_sw[i];
        const i_L = currents_L1[i];
        
        console.log(`  t=${t_us.toFixed(1)}µs: Vlx=${v_lx.toFixed(2)}V, Vsw=${v_sw.toFixed(2)}V, IL=${i_L.toFixed(3)}A`);
    }
    
    // 計算平均輸出電壓和電流
    const avgOutputVoltage = voltages_lx.slice(lastPeriodStart).reduce((sum, v) => sum + v, 0) / 
                             (voltages_lx.length - lastPeriodStart);
                             
    const avgInductorCurrent = currents_L1.slice(lastPeriodStart).reduce((sum, i) => sum + i, 0) / 
                              (currents_L1.length - lastPeriodStart);
    
    const outputRipple = Math.max(...voltages_lx.slice(lastPeriodStart)) - 
                        Math.min(...voltages_lx.slice(lastPeriodStart));
                        
    const currentRipple = Math.max(...currents_L1.slice(lastPeriodStart)) - 
                         Math.min(...currents_L1.slice(lastPeriodStart));
    
    console.log('\n🎯 穩態性能分析:');
    console.log(`  平均輸出電壓: ${avgOutputVoltage.toFixed(3)}V (目標: ${VOUT_TARGET}V)`);
    console.log(`  平均電感電流: ${avgInductorCurrent.toFixed(3)}A`);
    console.log(`  輸出電壓紋波: ${(outputRipple*1000).toFixed(1)}mV`);
    console.log(`  電感電流紋波: ${(currentRipple*1000).toFixed(1)}mA`);
    
    // 效率分析
    const outputPower = avgOutputVoltage * avgInductorCurrent;
    const inputPower = VIN * avgInductorCurrent * DUTY_CYCLE; // 近似計算
    const efficiency = outputPower / inputPower * 100;
    
    console.log(`  輸出功率: ${outputPower.toFixed(2)}W`);
    console.log(`  估計效率: ${efficiency.toFixed(1)}%`);
    
    // 檢查穩定性
    const isVoltageStable = Math.abs(avgOutputVoltage - VOUT_TARGET) < 0.5; // ±0.5V容差
    const isCurrentStable = avgInductorCurrent > 0 && avgInductorCurrent < 10; // 合理電流範圍
    const isRippleOK = outputRipple < 1.0; // 紋波小於1V
    
    if (isVoltageStable && isCurrentStable && isRippleOK) {
        console.log('\n🎉 Buck 轉換器工作正常!');
        console.log('✅ 輸出電壓穩定');
        console.log('✅ 電感電流穩定');
        console.log('✅ 紋波在合理範圍內');
        console.log('✅ PWM 開關和二極體協同工作正常');
    } else {
        console.log('\n⚠️  Buck 轉換器存在問題:');
        if (!isVoltageStable) console.log(`❌ 輸出電壓偏差過大: ${avgOutputVoltage.toFixed(2)}V vs ${VOUT_TARGET}V`);
        if (!isCurrentStable) console.log(`❌ 電感電流異常: ${avgInductorCurrent.toFixed(2)}A`);
        if (!isRippleOK) console.log(`❌ 輸出紋波過大: ${(outputRipple*1000).toFixed(1)}mV`);
    }
    
    // 統計信息
    console.log(`\n📊 數值分析統計:`);
    console.log(`  總時間步數: ${analyzer.statistics?.totalTimeSteps || 'N/A'}`);
    console.log(`  MCP 求解次數: ${analyzer.statistics?.mcpSolveCount || 'N/A'}`);
    console.log(`  預測器調用: ${analyzer.statistics?.predictorUsageCount || 'N/A'}`);
    
} catch (error) {
    console.log(`\n❌ 測試失敗: ${error.message}`);
    if (error.stack) {
        console.log('錯誤堆棧:');
        console.log(error.stack);
    }
}

console.log('\n🏁 完整 Buck 轉換器測試完成');