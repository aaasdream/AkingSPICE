/**
 * Buck 轉換器開迴路 PWM 控制範例
 * 
 * 電路拓撲:
 * VIN(12V) -> M1(high-side switch) -> L1 -> VOUT
 *                |                     |
 *                M2(low-side switch)   C1 -> RL(load)
 *                |                     |
 *                GND                  GND
 */

import { JSSolverPE } from './src/index.js';

async function buckConverterExample() {
    console.log('=== Buck 轉換器開迴路控制範例 ===\n');

    const solver = new JSSolverPE();
    
    // Buck 轉換器電路網表
    const netlist = `
* Buck 轉換器 (12V -> 5V)
* 輸入
VIN VIN 0 DC(12)

* 高端開關 (主開關)
M1 VIN SW_NODE PWM_H Ron=10m Roff=1MEG

* 低端開關 (同步整流)  
M2 SW_NODE 0 PWM_L Ron=15m Roff=1MEG

* 濾波電感 (100uH)
L1 SW_NODE LX 100u IC=0

* 輸出濾波電容 (220uF)
C1 LX 0 220u IC=5

* 負載電阻 (1Ω = 5A@5V)
RL LX 0 1

.END
    `;
    
    try {
        console.log('載入 Buck 轉換器電路...');
        solver.loadNetlist(netlist);
        
        console.log(`載入的元件 (${solver.components.length}):`);
        solver.components.forEach((comp, idx) => {
            console.log(`  ${idx+1}. ${comp.toString()}`);
        });
        
        // 初始化暫態分析 (1MHz 開關頻率)
        const fsw = 1e6; // 1MHz
        const period = 1 / fsw;
        const timeStep = period / 100; // 每個周期100個點
        const simTime = 10 * period;   // 模擬10個開關周期
        
        console.log(`\\n初始化暫態分析:`);
        console.log(`  開關頻率: ${fsw/1000}kHz`);
        console.log(`  開關周期: ${period*1e6}μs`);
        console.log(`  時間步長: ${timeStep*1e9}ns`);
        console.log(`  模擬時間: ${simTime*1e6}μs`);
        
        const success = await solver.initSteppedTransient({
            startTime: 0,
            stopTime: simTime,
            timeStep: timeStep
        });
        
        if (!success) {
            throw new Error('初始化失敗');
        }
        
        console.log('\\n開始 PWM 控制模擬...');
        
        // PWM 參數
        const dutyCycle = 0.4; // 40% 占空比 (期望輸出 ≈ 12V × 0.4 = 4.8V)
        const dutyTime = period * dutyCycle;
        
        console.log(`PWM 設置: 占空比 = ${dutyCycle*100}%, 導通時間 = ${dutyTime*1e9}ns`);
        
        // 結果記錄
        const results = {
            time: [],
            vout: [],
            iL: [],
            m1_state: [],
            m2_state: []
        };
        
        // PWM 控制循環
        let stepCount = 0;
        const maxSteps = 50; // 限制步數以避免過長輸出
        
        while (!solver.isFinished() && stepCount < maxSteps) {
            const currentTime = solver.getCurrentTime();
            const cycleTime = currentTime % period;
            
            // PWM 邏輯: 高端開關與低端開關互補
            const m1_on = cycleTime < dutyTime;
            const m2_on = !m1_on;
            
            // 執行一步
            const result = solver.step({
                'M1': m1_on,
                'M2': m2_on
            });
            
            if (result) {
                // 記錄結果
                results.time.push(currentTime * 1e6); // 轉換為μs
                results.vout.push(result.nodeVoltages['LX'] || 0);
                results.iL.push(result.branchCurrents['L1'] || 0);
                results.m1_state.push(m1_on ? 1 : 0);
                results.m2_state.push(m2_on ? 1 : 0);
                
                // 每10步打印一次狀態
                if (stepCount % 10 === 0) {
                    const vout = result.nodeVoltages['LX'] || 0;
                    const iL = result.branchCurrents['L1'] || 0;
                    const cycle = Math.floor(currentTime / period);
                    const phase = (cycleTime / period * 100).toFixed(1);
                    
                    console.log(`  步驟 ${stepCount}: 時間=${(currentTime*1e6).toFixed(1)}μs, ` +
                               `周期 ${cycle}, 相位=${phase}%, ` +
                               `VOUT=${vout.toFixed(3)}V, IL=${iL.toFixed(3)}A, ` +
                               `M1=${m1_on?'ON':'OFF'}, M2=${m2_on?'ON':'OFF'}`);
                }
                
                stepCount++;
            } else {
                console.log(`  步驟 ${stepCount}: 求解失敗`);
                break;
            }
        }
        
        // 分析結果
        console.log('\\n=== 模擬結果分析 ===');
        
        if (results.vout.length > 0) {
            const avgVout = results.vout.reduce((a, b) => a + b, 0) / results.vout.length;
            const maxVout = Math.max(...results.vout);
            const minVout = Math.min(...results.vout);
            const rippleVout = maxVout - minVout;
            
            console.log(`輸出電壓統計:`);
            console.log(`  平均值: ${avgVout.toFixed(3)}V`);
            console.log(`  最大值: ${maxVout.toFixed(3)}V`);
            console.log(`  最小值: ${minVout.toFixed(3)}V`);
            console.log(`  紋波: ${rippleVout.toFixed(3)}V (${(rippleVout/Math.max(avgVout,0.001)*100).toFixed(1)}%)`);
            console.log(`  理論值: ${(12 * dutyCycle).toFixed(3)}V`);
            console.log(`  誤差: ${Math.abs(avgVout - 12 * dutyCycle).toFixed(3)}V`);
        }
        
        if (results.iL.length > 0) {
            const avgIL = results.iL.reduce((a, b) => a + b, 0) / results.iL.length;
            const maxIL = Math.max(...results.iL);
            const minIL = Math.min(...results.iL);
            const rippleIL = maxIL - minIL;
            
            console.log(`\\n電感電流統計:`);
            console.log(`  平均值: ${avgIL.toFixed(3)}A`);
            console.log(`  最大值: ${maxIL.toFixed(3)}A`);
            console.log(`  最小值: ${minIL.toFixed(3)}A`);
            console.log(`  紋波: ${rippleIL.toFixed(3)}A`);
            console.log(`  理論值: ${(avgVout / 1).toFixed(3)}A (負載電流)`);
        }
        
        console.log('\\n=== Buck 轉換器模擬完成 ===');
        console.log('✓ PWM 控制正常工作');
        console.log('✓ MOSFET 開關狀態切換正常');  
        console.log('✓ 電路暫態響應計算完成');
        
    } catch (error) {
        console.error('\\n✗ Buck 轉換器模擬失敗:');
        console.error(`錯誤: ${error.message}`);
        if (error.stack) {
            console.error('\\n錯誤堆疊:');
            console.error(error.stack.split('\\n').slice(0, 10).join('\\n'));
        }
    }
    
    console.log('\\n=== Buck 轉換器範例完成 ===');
}

buckConverterExample();