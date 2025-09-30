/**
 * 單獨測試PWM控制器，檢查修正效果
 */

import {
    AkingSPICE,
    VoltageSource,
    Resistor,
    VoltageControlledMOSFET
} from './src/index.js';

console.log('=== 單獨PWM控制器測試 ===\n');

async function testPWMOnly() {
    const solver = new AkingSPICE();
    const targetFreq = 50e3; // 50kHz
    const duty = 0.5;
    
    console.log(`目標PWM頻率: ${(targetFreq/1000).toFixed(1)}kHz`);
    console.log(`占空比: ${(duty*100).toFixed(0)}%`);
    
    solver.reset();
    solver.components = [
        new VoltageSource('Vdd', ['vdd', '0'], 12),
        new VoltageSource('Vgate', ['gate', '0'], 0), // 可控制的閘極電壓源
        // ✅ 修正：高側開關配置 - drain接vdd, source接out
        new VoltageControlledMOSFET('Q1', ['vdd', 'gate', 'out'], { // drain=vdd, source=out 
            Vth: 2.0, 
            Ron: 0.1, 
            Roff: 1e8 
        }),
        new Resistor('Rload', ['out', '0'], 100) // ✅ 修正：負載接地，形成完整回路
    ];
    solver.isInitialized = true;
    
    try {
        const period = 1 / targetFreq;
        const timeStep = period / 100;
        
        const success = await solver.initSteppedTransient({
            stopTime: period * 5, // 5個週期
            timeStep: timeStep
        });
        
        if (success) {
            console.log(`\n✅ 電路初始化成功！`);
            console.log(`週期: ${(period*1e6).toFixed(2)}μs`);
            console.log(`時間步長: ${(timeStep*1e9).toFixed(2)}ns`);
            
            // ✅ 修正：PWM控制函數 - 通過controlInputs返回閘極電壓
            const pwmControl = (time) => {
                const t_in_period = time % period;
                const gate_voltage = t_in_period < (period * duty) ? 5.0 : 0.0;
                
                // 調試輸出
                if (Math.floor(time / timeStep) % 50 === 0) {
                    console.log(`t=${(time*1e6).toFixed(2)}μs, t_in_period=${(t_in_period*1e6).toFixed(2)}μs, gate=${gate_voltage}V`);
                }
                
                // 通過controlInputs返回電壓源的新值
                return {
                    'Vgate': gate_voltage
                };
            };
            
            // 執行步進式仿真
            const results = await solver.runSteppedSimulation(pwmControl, {
                stopTime: period * 5,
                timeStep: timeStep
            });
            
            console.log(`\n🔍 分析結果:`);
            console.log(`總時間步數: ${results.steps.length}`);
            
            // 分析電壓變化
            const times = results.steps.map(s => s.time);
            const voltages = results.steps.map(s => s.nodeVoltages['out'] || 0);
            const gateVoltages = results.steps.map(s => s.nodeVoltages['gate'] || 0);
            
            console.log(`輸出電壓範圍: ${Math.min(...voltages).toFixed(3)}V - ${Math.max(...voltages).toFixed(3)}V`);
            console.log(`閘極電壓範圍: ${Math.min(...gateVoltages).toFixed(3)}V - ${Math.max(...gateVoltages).toFixed(3)}V`);
            
            // ✅ 修正：調整閾值 - 高側開關時，輸出應該接近12V或接近0V
            const transitions = [];
            const threshold = 6; // 6V作為中間閾值
            for (let i = 1; i < voltages.length; i++) {
                if ((voltages[i-1] > threshold && voltages[i] < threshold) || 
                    (voltages[i-1] < threshold && voltages[i] > threshold)) {
                    transitions.push({
                        time: times[i],
                        from: voltages[i-1].toFixed(2),
                        to: voltages[i].toFixed(2),
                        type: voltages[i] > threshold ? '↑' : '↓'
                    });
                }
            }
            
            console.log(`\n📊 PWM轉換分析:`);
            console.log(`檢測到 ${transitions.length} 個轉換點`);
            
            if (transitions.length > 0) {
                console.log(`前10個轉換:`);
                transitions.slice(0, 10).forEach((t, i) => {
                    console.log(`  ${i+1}. t=${(t.time*1e6).toFixed(2)}μs: ${t.from}V ${t.type} ${t.to}V`);
                });
                
                // 分析上升沿間距
                const risingEdges = transitions.filter(t => t.type === '↑');
                console.log(`\n上升沿分析 (前5個):`);
                risingEdges.slice(0, 5).forEach((edge, i) => {
                    console.log(`  上升沿${i+1}: t=${(edge.time*1e6).toFixed(2)}μs`);
                });
                
                if (transitions.length >= 2) {
                    // ✅ 修正：一個完整週期包含一個上升沿和一個下降沿
                    // 找到連續的上升沿來計算週期
                    const risingEdges = transitions.filter(t => t.type === '↑');
                    const periods = [];
                    for (let i = 1; i < risingEdges.length; i++) {
                        periods.push(risingEdges[i].time - risingEdges[i-1].time);
                    }
                    
                    if (periods.length > 0) {
                        const avgPeriod = periods.reduce((sum, p) => sum + p, 0) / periods.length;
                        const actualFreq = 1 / avgPeriod;
                        const freqError = Math.abs(actualFreq - targetFreq) / targetFreq * 100;
                        
                        console.log(`\n✨ 頻率分析:`);
                        console.log(`理論週期: ${(period*1e6).toFixed(2)}μs`);
                        console.log(`實際週期: ${(avgPeriod*1e6).toFixed(2)}μs`);
                        console.log(`理論頻率: ${(targetFreq/1000).toFixed(1)}kHz`);
                        console.log(`實際頻率: ${(actualFreq/1000).toFixed(1)}kHz`);
                        console.log(`頻率誤差: ${freqError.toFixed(2)}%`);
                        
                        if (freqError < 5.0) {
                            console.log(`🎉 SUCCESS: PWM控制器工作正常！`);
                        } else {
                            console.log(`⚠️  WARNING: 頻率誤差較大`);
                        }
                    }
                }
            } else {
                console.log(`❌ 沒有檢測到PWM轉換，可能是:`);
                console.log(`   - MOSFET沒有正確開關`);
                console.log(`   - 閾值設置不當`);
                console.log(`   - 電路連接問題`);
            }
            
        } else {
            console.log('❌ 電路初始化失敗');
        }
    } catch (error) {
        console.log(`❌ 錯誤: ${error.message}`);
        console.log(error.stack);
    }
}

testPWMOnly();