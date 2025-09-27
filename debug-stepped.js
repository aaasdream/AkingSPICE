/**
 * 步進式模擬控制 API 測試
 * 測試 JSSolverPE 的步進式控制功能
 */

import { JSSolverPE } from './src/index.js';

async function runTests() {
    console.log('=== 步進式模擬控制 API 測試 ===\n');

    // 測試 1: 基本步進式控制初始化
    console.log('測試 1: 基本步進式控制初始化');
    try {
        const solver = new JSSolverPE();
        
        // 簡單的測試電路：電阻分壓器 + 可控開關
        const netlist = `
    * 可控開關測試電路
    V1 VCC GND DC 12V
    R1 VCC N1 1K
    M1 N1 OUT CTRL Ron=10m Roff=1MEG
    R2 OUT GND 2K
    .TRAN 0 10u 100n
    .END
        `;
        
        solver.loadNetlist(netlist);
        
        // 初始化步進式模擬
        const success = await solver.initSteppedTransient({
            startTime: 0,
            stopTime: 10e-6,    // 10μs
            timeStep: 100e-9,   // 100ns
            maxIterations: 10
        });
        
        if (success) {
            console.log('✓ 步進式控制初始化成功');
            console.log(`  當前時間: ${solver.getCurrentTime()}s`);
            console.log(`  模擬完成: ${solver.isFinished()}`);
        } else {
            console.log('✗ 初始化失敗');
        }
    } catch (error) {
        console.log(`✗ 錯誤: ${error.message}`);
    }

    console.log('\n測試 2: 單步執行與開關控制');
    try {
        const solver = new JSSolverPE();
        
        const netlist = `
    * PWM 控制測試
    V1 VCC GND DC 5V
    R1 VCC SW 100
    M1 SW OUT PWM Ron=1m Roff=10MEG Vf=0.7
    R2 OUT GND 1K
    .END
        `;
        
        solver.loadNetlist(netlist);
        await solver.initSteppedTransient({
            startTime: 0,
            stopTime: 2e-6,     // 2μs 
            timeStep: 100e-9    // 100ns
        });
        
        console.log('執行前幾個時間步:');
        
        for (let i = 0; i < 10 && !solver.isFinished(); i++) {
            // 模擬 PWM 控制：前 5 步 ON，後 5 步 OFF
            const gateState = i < 5;
            
            const stepResult = solver.step({ 'M1': gateState });
            
            if (stepResult) {
                const outVoltage = solver.getVoltage('OUT');
                const mosfetState = solver.getComponentState('M1');
                
                console.log(`  步驟 ${i}: t=${(stepResult.time * 1e9).toFixed(1)}ns, ` +
                           `M1=${gateState ? 'ON' : 'OFF'}, Vout=${outVoltage.toFixed(3)}V`);
            }
        }
        
        console.log('✓ 單步執行正常');
    } catch (error) {
        console.log(`✗ 錯誤: ${error.message}`);
    }
}

console.log('\n測試 3: 完整 PWM 模擬');
try {
    const solver = new JSSolverPE();
    
    const netlist = `
* Buck 轉換器簡化電路
V1 VIN GND DC 12V
M1 VIN LX PWM Ron=5m Roff=1MEG Vf=0.8
L1 LX VOUT 10u IC=0
R1 VOUT GND 5
.END
    `;
    
    solver.loadNetlist(netlist);
    
    // PWM 控制函數：50% 占空比，1MHz 頻率
    const pwmPeriod = 1e-6;  // 1μs 週期
    const dutyCycle = 0.5;   // 50% 占空比
    
    const controlFunction = (time) => {
        const timeInPeriod = time % pwmPeriod;
        const gateOn = timeInPeriod < (pwmPeriod * dutyCycle);
        return { 'M1': gateOn };
    };
    
    console.log('運行完整 PWM 模擬 (5 個週期)...');
    
    const result = await solver.runSteppedSimulation(controlFunction, {
        startTime: 0,
        stopTime: 5e-6,     // 5μs (5 個週期)
        timeStep: 10e-9     // 10ns
    });
    
    console.log(`✓ 模擬完成: ${result.summary.totalSteps} 步`);
    console.log(`  模擬時間: ${result.summary.simulationTime * 1e6}μs`);
    console.log(`  時間步長: ${result.summary.timeStep * 1e9}ns`);
    
    // 分析輸出電壓的範圍
    let minVout = Infinity, maxVout = -Infinity;
    result.steps.forEach(step => {
        const vout = step.nodeVoltages['VOUT'] || 0;
        minVout = Math.min(minVout, vout);
        maxVout = Math.max(maxVout, vout);
    });
    
    console.log(`  輸出電壓範圍: ${minVout.toFixed(3)}V 到 ${maxVout.toFixed(3)}V`);
    
} catch (error) {
    console.log(`✗ 錯誤: ${error.message}`);
}

console.log('\n測試 4: 多開關控制');
try {
    const solver = new JSSolverPE();
    
    const netlist = `
* 雙開關測試 (H橋一臂)
V1 VDC GND DC 24V
M1 VDC LX HIGH Ron=10m Roff=10MEG
M2 LX GND LOW Ron=10m Roff=10MEG  
R1 LX OUT 1
C1 OUT GND 1u IC=0
.END
    `;
    
    solver.loadNetlist(netlist);
    
    const controlFunction = (time) => {
        const period = 2e-6;  // 2μs 週期
        const t = time % period;
        
        if (t < 0.8e-6) {
            return { 'M1': true, 'M2': false };   // 上開關 ON，下開關 OFF
        } else if (t < 1.2e-6) {
            return { 'M1': false, 'M2': false };  // 死區時間
        } else {
            return { 'M1': false, 'M2': true };   // 上開關 OFF，下開關 ON
        }
    };
    
    console.log('多開關控制測試...');
    
    const result = await solver.runSteppedSimulation(controlFunction, {
        startTime: 0,
        stopTime: 4e-6,     // 4μs (2 個週期)
        timeStep: 20e-9     // 20ns
    });
    
    console.log(`✓ 多開關模擬完成: ${result.summary.totalSteps} 步`);
    
    // 檢查死區控制效果
    let deadTimeSteps = 0;
    result.steps.forEach(step => {
        const m1State = step.componentStates['M1']?.gateState === 'ON';
        const m2State = step.componentStates['M2']?.gateState === 'ON';
        
        if (!m1State && !m2State) {
            deadTimeSteps++;
        }
    });
    
    console.log(`  死區步數: ${deadTimeSteps} (${(deadTimeSteps/result.summary.totalSteps*100).toFixed(1)}%)`);
    
} catch (error) {
    console.log(`✗ 錯誤: ${error.message}`);
}

console.log('\n測試 5: 閉迴路控制範例');
try {
    const solver = new JSSolverPE();
    
    const netlist = `
* 簡單Buck轉換器
V1 VIN GND DC 15V
M1 VIN LX PWM Ron=8m Roff=5MEG
L1 LX N1 22u IC=0
R1 N1 VOUT 0.1
C1 VOUT GND 47u IC=0
R2 VOUT GND 10
.END
    `;
    
    solver.loadNetlist(netlist);
    
    // 簡單PI控制器
    const targetVoltage = 5.0;  // 目標 5V 輸出
    let integralError = 0;
    const kp = 0.1, ki = 1000;
    
    const controlFunction = (time) => {
        const currentVout = solver.getVoltage('VOUT');
        const error = targetVoltage - currentVout;
        
        integralError += error * solver.steppedParams.timeStep;
        
        const controlOutput = kp * error + ki * integralError;
        const dutyCycle = Math.max(0, Math.min(1, controlOutput / solver.getVoltage('VIN')));
        
        // 1MHz PWM
        const period = 1e-6;
        const timeInPeriod = time % period;
        const gateOn = timeInPeriod < (period * dutyCycle);
        
        return { 'M1': gateOn };
    };
    
    console.log('閉迴路控制測試 (PI控制器)...');
    
    const result = await solver.runSteppedSimulation(controlFunction, {
        startTime: 0,
        stopTime: 50e-6,    // 50μs
        timeStep: 50e-9     // 50ns
    });
    
    console.log(`✓ 閉迴路模擬完成: ${result.summary.totalSteps} 步`);
    
    // 分析穩態性能
    const lastSteps = result.steps.slice(-100); // 最後100步
    let avgVout = 0;
    lastSteps.forEach(step => {
        avgVout += step.nodeVoltages['VOUT'] || 0;
    });
    avgVout /= lastSteps.length;
    
    const steadyStateError = Math.abs(avgVout - targetVoltage);
    console.log(`  目標電壓: ${targetVoltage}V`);
    console.log(`  穩態輸出: ${avgVout.toFixed(4)}V`);
    console.log(`  穩態誤差: ${(steadyStateError*1000).toFixed(2)}mV`);
    
} catch (error) {
    console.log(`✗ 錯誤: ${error.message}`);
}

}

    console.log('\n=== 步進式模擬控制 API 測試完成 ===');
}

// 運行測試
runTests().catch(error => {
    console.error('測試執行失敗:', error.message);
});