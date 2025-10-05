/**
 * PWM 波形調試測試 - 檢查開關波形是否正確
 */

import { MCPTransientAnalysis } from '../src/analysis/transient_mcp.js';
import { VoltageSource } from '../src/components/sources.js';
import { Resistor } from '../src/components/resistor.js';

console.log('🔍 PWM 波形調試測試');
console.log('==================');

// 測試參數
const SWITCHING_FREQ = 50e3;  // 50kHz
const DUTY_CYCLE = 0.5;       // 50% 占空比
const VIN = 24.0;             // 24V 幅度

console.log('📋 PWM 參數:');
console.log(`  頻率: ${(SWITCHING_FREQ/1000).toFixed(0)}kHz`);
console.log(`  占空比: ${(DUTY_CYCLE*100).toFixed(0)}%`);
console.log(`  幅度: ${VIN}V`);

// 創建簡單 PWM 測試電路
const components = [
    // 測試 PWM 電壓源
    new VoltageSource('Vpwm', ['sw', 'gnd'], {
        type: 'PWM',
        dc: 0,                  // 關斷狀態電壓
        pwm: {
            amplitude: VIN,     // 開通時輸出 VIN
            frequency: SWITCHING_FREQ,
            dutyCycle: DUTY_CYCLE,
            phase: 0
        }
    }),
    
    // 負載電阻 (用來觀察波形)
    new Resistor('Rload', ['sw', 'gnd'], 1000)  // 1kΩ 負載
];

// 時間參數 - 模擬 2 個完整周期
const SWITCHING_PERIOD = 1.0 / SWITCHING_FREQ;
const TIME_STEP = SWITCHING_PERIOD / 50;  // 每周期 50 個采樣點
const SIM_TIME = 2 * SWITCHING_PERIOD;    // 2 個周期

console.log('\n⏱️  時間參數:');
console.log(`  開關周期: ${(SWITCHING_PERIOD*1e6).toFixed(1)}µs`);
console.log(`  時間步長: ${(TIME_STEP*1e6).toFixed(2)}µs`);
console.log(`  模擬時間: ${(SIM_TIME*1e6).toFixed(1)}µs`);
console.log(`  總采樣點: ${Math.round(SIM_TIME/TIME_STEP)}`);

const analyzer = new MCPTransientAnalysis({
    enablePredictor: false,   // 簡單測試，關閉預測器
    enableNodeDamping: false, // 簡單測試，關閉阻尼
    debug: false
});

try {
    console.log('\n🔄 開始 PWM 波形分析...');
    
    const result = await analyzer.run(components, {
        startTime: 0,
        stopTime: SIM_TIME,
        timeStep: TIME_STEP
    });
    
    console.log('\n✅ PWM 測試完成!');
    
    // 分析 PWM 波形
    const times = result.timeVector;
    const voltages = result.voltageMatrix.sw;
    
    if (!times || times.length === 0) {
        throw new Error('沒有時間點數據');
    }
    
    console.log(`\n📊 PWM 波形分析 (共 ${times.length} 個時間點):`);
    
    // 顯示完整波形數據
    console.log('\n📈 第一個周期波形:');
    const firstPeriodEnd = Math.ceil(times.length / 2);
    
    for (let i = 0; i < Math.min(firstPeriodEnd, 20); i++) {
        const t_us = times[i] * 1e6;
        const v_sw = voltages[i];
        const phase = (times[i] / SWITCHING_PERIOD) % 1.0;  // 周期內相位 (0-1)
        
        console.log(`  t=${t_us.toFixed(2)}µs (相位=${(phase*100).toFixed(1)}%): Vpwm=${v_sw.toFixed(2)}V`);
    }
    
    console.log('\n📈 第二個周期波形:');
    const startIdx = firstPeriodEnd;
    
    for (let i = startIdx; i < Math.min(startIdx + 20, times.length); i++) {
        const t_us = times[i] * 1e6;
        const v_sw = voltages[i];
        const phase = (times[i] / SWITCHING_PERIOD) % 1.0;  // 周期內相位 (0-1)
        
        console.log(`  t=${t_us.toFixed(2)}µs (相位=${(phase*100).toFixed(1)}%): Vpwm=${v_sw.toFixed(2)}V`);
    }
    
    // 統計分析
    const maxVoltage = Math.max(...voltages);
    const minVoltage = Math.min(...voltages);
    const avgVoltage = voltages.reduce((sum, v) => sum + v, 0) / voltages.length;
    
    // 計算實際占空比 (高電平時間比例)
    const highLevelCount = voltages.filter(v => v > VIN * 0.9).length;  // 高於 90% 幅度視為高電平
    const actualDutyCycle = highLevelCount / voltages.length;
    
    console.log(`\n🎯 PWM 性能分析:`);
    console.log(`  最大電壓: ${maxVoltage.toFixed(2)}V`);
    console.log(`  最小電壓: ${minVoltage.toFixed(2)}V`);
    console.log(`  平均電壓: ${avgVoltage.toFixed(2)}V (理論: ${(VIN * DUTY_CYCLE).toFixed(2)}V)`);
    console.log(`  實際占空比: ${(actualDutyCycle*100).toFixed(1)}% (設定: ${(DUTY_CYCLE*100).toFixed(1)}%)`);
    
    // 檢查 PWM 波形正確性
    const isAmplitudeCorrect = Math.abs(maxVoltage - VIN) < 0.1;
    const isMinimumCorrect = Math.abs(minVoltage - 0) < 0.1;
    const isDutyCycleCorrect = Math.abs(actualDutyCycle - DUTY_CYCLE) < 0.05;
    const isAverageCorrect = Math.abs(avgVoltage - VIN * DUTY_CYCLE) < 1.0;
    
    if (isAmplitudeCorrect && isMinimumCorrect && isDutyCycleCorrect && isAverageCorrect) {
        console.log('\n🎉 PWM 波形正確!');
        console.log('✅ 最大電壓正確');
        console.log('✅ 最小電壓正確');
        console.log('✅ 占空比正確');
        console.log('✅ 平均電壓正確');
        console.log('\n➡️  PWM 實現沒有問題，Buck 轉換器問題在於電路拓撲');
    } else {
        console.log('\n❌ PWM 波形存在問題:');
        if (!isAmplitudeCorrect) console.log(`❌ 最大電壓錯誤: ${maxVoltage.toFixed(2)}V vs ${VIN}V`);
        if (!isMinimumCorrect) console.log(`❌ 最小電壓錯誤: ${minVoltage.toFixed(2)}V vs 0V`);
        if (!isDutyCycleCorrect) console.log(`❌ 占空比錯誤: ${(actualDutyCycle*100).toFixed(1)}% vs ${(DUTY_CYCLE*100).toFixed(1)}%`);
        if (!isAverageCorrect) console.log(`❌ 平均電壓錯誤: ${avgVoltage.toFixed(2)}V vs ${(VIN * DUTY_CYCLE).toFixed(2)}V`);
    }
    
} catch (error) {
    console.log(`\n❌ PWM 測試失敗: ${error.message}`);
    if (error.stack) {
        console.log('錯誤堆棧:');
        console.log(error.stack);
    }
}

console.log('\n🏁 PWM 波形調試完成');