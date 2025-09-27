/**
 * 非同步 Buck 轉換器範例 - 使用獨立二極體
 * 
 * 這個範例展示了如何使用 AkingSPICE 中新增的 Diode 元件來模擬
 * 傳統的非同步 Buck 轉換器，這是電力電子最基礎的拓撲之一。
 * 
 * 電路特點：
 * - 使用一個主開關 MOSFET
 * - 使用一個續流二極體 (而非同步開關)
 * - 更簡單的控制，但效率較低
 */

import { AkingSPICE, VoltageSource, MOSFET, Diode, Inductor, Capacitor, Resistor } from './src/index.js';

/**
 * 非同步 Buck 轉換器模擬
 */
async function runAsyncBuckExample() {
    console.log('🔌 AkingSPICE 非同步 Buck 轉換器範例');
    console.log('======================================');

    // 1. 創建解算器實例
    const solver = new AkingSPICE();
    solver.setDebug(false);
    
    try {
        // 2. 重置並建立電路
        solver.reset();
        
        // 電路參數
        const Vin = 12.0;      // 輸入電壓 12V
        const L = 100e-6;      // 電感 100μH
        const C = 220e-6;      // 電容 220μF
        const Rload = 5.0;     // 負載電阻 5Ω
        
        console.log(`電路參數: Vin=${Vin}V, L=${L*1e6}μH, C=${C*1e6}μF, R=${Rload}Ω`);

        // 3. 定義電路元件 - 非同步 Buck 拓撲
        solver.components = [
            // 輸入電壓源
            new VoltageSource('VIN', ['vin', '0'], Vin),
            
            // 主開關 MOSFET (高側)
            new MOSFET('MSW', ['vin', 'sw'], { 
                Ron: 0.01,    // 10mΩ 導通電阻
                Roff: 1e6     // 1MΩ 關斷電阻
            }),
            
            // 🔥 關鍵：續流二極體 (低側) - 這是非同步 Buck 的核心
            new Diode('D_FREEWHEEL', ['0', 'sw'], {
                Vf: 0.7,      // 0.7V 順向壓降
                Ron: 0.02,    // 20mΩ 導通電阻
                Roff: 1e6     // 1MΩ 反向阻抗
            }),
            
            // 功率電感
            new Inductor('L1', ['sw', 'out'], L, {ic: 0}),
            
            // 輸出電容
            new Capacitor('C1', ['out', '0'], C, {ic: 0}),
            
            // 負載電阻
            new Resistor('RLOAD', ['out', '0'], Rload)
        ];
        
        solver.isInitialized = true;

        // 4. 驗證電路
        const validation = solver.validateCircuit();
        if (!validation.valid) {
            throw new Error(`電路驗證失敗: ${validation.issues.join(', ')}`);
        }
        console.log('✅ 非同步 Buck 電路建立並驗證成功');

        // 5. PWM 控制設定
        const frequency = 100e3;    // 100kHz 開關頻率
        const dutyCycle = 0.5;      // 50% 占空比
        const period = 1 / frequency;
        
        console.log(`PWM 控制: f=${frequency/1000}kHz, D=${dutyCycle*100}%`);
        console.log(`理論輸出電壓: ${Vin * dutyCycle}V`);

        // PWM 控制函數 - 只控制主開關，二極體自動續流
        const pwmControl = (time) => {
            const cycleTime = time % period;
            const mainSwitchOn = cycleTime < (period * dutyCycle);
            
            return {
                'MSW': mainSwitchOn  // 只控制主開關，二極體會自動導通/截止
            };
        };

        // 6. 執行步進式模擬
        const simTime = 5e-3;  // 5ms 模擬時間
        const timeStep = period / 200;  // 每個週期200個點，確保足夠解析度
        
        console.log(`模擬設定: t=${simTime*1000}ms, 時間步長=${timeStep*1e6}μs`);
        
        const startTime = performance.now();
        const results = await solver.runSteppedSimulation(pwmControl, {
            stopTime: simTime,
            timeStep: timeStep
        });
        const endTime = performance.now();

        // 7. 分析結果
        console.log(`\n⏱️  模擬耗時: ${(endTime - startTime).toFixed(1)}ms`);
        console.log(`📊 模擬步數: ${results.steps.length}`);

        if (results.steps.length === 0) {
            console.error('❌ 模擬結果為空');
            return;
        }

        // 分析穩態性能 (取後半段數據)
        const analysisStart = Math.max(0, results.steps.length - Math.floor(results.steps.length * 0.5));
        let avgVoltage = 0, avgCurrent = 0, validSteps = 0;
        let minV = Infinity, maxV = -Infinity;

        for (let i = analysisStart; i < results.steps.length; i++) {
            const step = results.steps[i];
            const outputVoltage = step.nodeVoltages['out'] || 0;
            const inductorCurrent = step.branchCurrents['L1'] || 0;
            
            if (outputVoltage >= 0 && outputVoltage <= Vin * 1.2) {
                avgVoltage += outputVoltage;
                avgCurrent += inductorCurrent;
                minV = Math.min(minV, outputVoltage);
                maxV = Math.max(maxV, outputVoltage);
                validSteps++;
            }
        }

        if (validSteps > 0) {
            avgVoltage /= validSteps;
            avgCurrent /= validSteps;
            
            const voltageRipple = maxV - minV;
            const theoretical = Vin * dutyCycle;
            const error = Math.abs(avgVoltage - theoretical);
            const efficiency = (avgVoltage * avgCurrent) / (Vin * avgCurrent) * 100; // 簡化效率計算

            console.log('\n🎯 非同步 Buck 轉換器分析結果:');
            console.log('================================');
            console.log(`平均輸出電壓: ${avgVoltage.toFixed(3)}V`);
            console.log(`理論輸出電壓: ${theoretical.toFixed(3)}V`);
            console.log(`電壓誤差: ${error.toFixed(3)}V (${(error/theoretical*100).toFixed(1)}%)`);
            console.log(`輸出電流: ${avgCurrent.toFixed(3)}A`);
            console.log(`電壓漣波: ${voltageRipple.toFixed(3)}V (${(voltageRipple/avgVoltage*100).toFixed(1)}%)`);
            console.log(`估計效率: ${efficiency.toFixed(1)}%`);

            // 檢查二極體是否有正常工作
            const lastStep = results.steps[results.steps.length - 1];
            const diodeStatus = lastStep.componentStates['D_FREEWHEEL'];
            const mosfetStatus = lastStep.componentStates['MSW'];
            
            console.log('\n⚡ 元件狀態分析:');
            console.log(`主開關 MSW: ${mosfetStatus?.gateState || 'Unknown'}`);
            console.log(`續流二極體 D_FREEWHEEL: ${diodeStatus?.state || 'Unknown'}`);
            
            // 成功標準
            const isSuccessful = (error / theoretical) < 0.1; // 誤差小於10%
            console.log(`\n${isSuccessful ? '✅' : '❌'} 模擬${isSuccessful ? '成功' : '失敗'}!`);
            
            if (isSuccessful) {
                console.log('🎉 AkingSPICE 的 Diode 元件工作正常，能夠正確模擬非同步 Buck 轉換器！');
            }

        } else {
            console.error('❌ 沒有有效的模擬數據');
        }

        // 8. 顯示部分波形數據 (前10個和後10個點)
        console.log('\n📈 部分波形數據 (前10點):');
        console.log('時間(ms)\t輸出電壓(V)\t電感電流(A)\tMOSFET\t二極體');
        console.log('-------\t----------\t----------\t------\t-----');
        
        for (let i = 0; i < Math.min(10, results.steps.length); i++) {
            const step = results.steps[i];
            const vout = (step.nodeVoltages['out'] || 0).toFixed(3);
            const iL = (step.branchCurrents['L1'] || 0).toFixed(3);
            const mosfet = step.componentStates['MSW']?.gateState === 'ON' ? 'ON ' : 'OFF';
            const diode = step.componentStates['D_FREEWHEEL']?.state === 'ON' ? 'ON ' : 'OFF';
            
            console.log(`${(step.time*1000).toFixed(3)}\t\t${vout}\t\t${iL}\t\t${mosfet}\t${diode}`);
        }

    } catch (error) {
        console.error('❌ 模擬失敗:', error.message);
        console.error('Stack trace:', error.stack);
    }
}

// 執行範例
console.log('啟動 AkingSPICE 非同步 Buck 轉換器範例...\n');
runAsyncBuckExample().then(() => {
    console.log('\n🏁 範例執行完成');
}).catch((error) => {
    console.error('❌ 範例執行失敗:', error);
});

// 如果在瀏覽器環境中執行
if (typeof window !== 'undefined') {
    window.runAsyncBuckExample = runAsyncBuckExample;
    console.log('瀏覽器模式：請在控制台執行 runAsyncBuckExample()');
}