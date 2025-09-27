/**
 * 簡化的步進式模擬控制 API 測試
 * 測試基本的步進式控制功能
 */

import { JSSolverPE } from './src/index.js';

async function runTests() {
    console.log('=== 步進式模擬控制 API 測試 ===\n');

    // 測試 1: 基本初始化
    console.log('測試 1: 基本步進式控制初始化');
    try {
        const solver = new JSSolverPE();
        
        const netlist = `
* 簡單開關電路
V1 VCC GND DC(5)
R1 VCC N1 1K
M1 N1 OUT CTRL Ron=10m Roff=100K
R2 OUT GND 2K
.END
        `;
        
        solver.loadNetlist(netlist);
        
        const success = await solver.initSteppedTransient({
            startTime: 0,
            stopTime: 5e-6,     // 5μs
            timeStep: 100e-9,   // 100ns
            maxIterations: 10
        });
        
        if (success) {
            console.log('✓ 初始化成功');
            console.log(`  當前時間: ${solver.getCurrentTime()}s`);
            console.log(`  模擬完成: ${solver.isFinished()}`);
            
            // 測試幾個步驟
            console.log('\n執行前 5 個步驟:');
            for (let i = 0; i < 5 && !solver.isFinished(); i++) {
                const gateState = i % 2 === 0; // 交替開關
                const stepResult = solver.step({ 'M1': gateState });
                
                if (stepResult) {
                    const vout = solver.getVoltage('OUT');
                    console.log(`  步驟 ${i}: Gate=${gateState ? 'ON' : 'OFF'}, Vout=${vout.toFixed(3)}V`);
                }
            }
        } else {
            console.log('✗ 初始化失敗');
        }
    } catch (error) {
        console.log(`✗ 錯誤: ${error.message}`);
        if (error.stack) {
            console.log('錯誤詳情:', error.stack.split('\n').slice(0,5).join('\n'));
        }
    }

    console.log('\n測試 2: PWM 控制函數');
    try {
        const solver = new JSSolverPE();
        
        const netlist = `
* Buck 轉換器模擬
V1 VIN GND DC(12)
M1 VIN LX PWM Ron=5m Roff=100K
L1 LX VOUT 10u IC=0
R1 VOUT GND 10
.END
        `;
        
        solver.loadNetlist(netlist);
        
        // PWM 控制函數
        const controlFunction = (time) => {
            const period = 1e-6;  // 1MHz
            const dutyCycle = 0.3; // 30% duty cycle
            const timeInPeriod = time % period;
            const gateOn = timeInPeriod < (period * dutyCycle);
            return { 'M1': gateOn };
        };
        
        console.log('運行 PWM 控制模擬...');
        
        const result = await solver.runSteppedSimulation(controlFunction, {
            startTime: 0,
            stopTime: 3e-6,     // 3μs (3 個週期)
            timeStep: 50e-9     // 50ns
        });
        
        console.log(`✓ PWM 模擬完成: ${result.summary.totalSteps} 步`);
        
        // 分析最後幾個結果
        const lastResults = result.steps.slice(-10);
        let onSteps = 0;
        lastResults.forEach(step => {
            const m1State = step.componentStates['M1'];
            if (m1State && m1State.gateState === 'ON') onSteps++;
        });
        
        console.log(`  最後 10 步中開啟步數: ${onSteps} (${onSteps/10*100}%)`);
        
    } catch (error) {
        console.log(`✗ 錯誤: ${error.message}`);
        if (error.stack) {
            console.log('錯誤詳情:', error.stack.split('\n').slice(0,5).join('\n'));
        }
    }

    console.log('\n=== 步進式模擬控制 API 測試完成 ===');
}

// 運行測試
runTests().catch(error => {
    console.error('測試執行失敗:', error.message);
});