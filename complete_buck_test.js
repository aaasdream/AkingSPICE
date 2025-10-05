/**
 * Buck 轉換器完整模擬測試
 * 測試 MOSFET 開關、二極體續流、電感電容積分等行為
 */

console.log('🚀 Buck 轉換器完整模擬測試');

try {
    // 導入模組
    const { AkingSPICE } = await import('./src/core/solver.js');
    const { StepwiseSimulator } = await import('./src/analysis/stepwise_simulation.js');
    
    // 修正後的 Buck 轉換器網表
    const buckNetlist = `
* Buck Converter Complete Test
VIN 1 0 DC 24V
M1 1 2 3 NMOS Ron=10m Vth=2V
D1 0 2 Vf=0.7 Ron=10m
L1 2 4 100uH
C1 4 0 220uF
RLOAD 4 0 5
VDRIVE 3 0 PULSE(0 15 0 10n 10n 5u 10u)
.TRAN 0.1u 50u
.END
`;

    console.log('1. 執行批次分析（AkingSPICE）...');
    
    // 測試批次分析
    const solver = new AkingSPICE();
    solver.setDebug(false); // 關閉詳細調試輸出
    solver.loadNetlist(buckNetlist);
    
    console.log('   網表載入成功');
    console.log(`   元件數量: ${solver.components.length}`);
    
    // 電路驗證
    const validation = solver.validateCircuit();
    console.log(`   電路驗證: ${validation.valid ? '✅ 通過' : '❌ 失敗'}`);
    
    if (!validation.valid) {
        console.log('   問題:');
        validation.issues.forEach(issue => console.log(`     - ${issue}`));
    }
    
    if (validation.warnings.length > 0) {
        console.log('   警告:');
        validation.warnings.forEach(warning => console.log(`     - ${warning}`));
    }
    
    try {
        const result = await solver.runAnalysis();
        
        if (result.success) {
            console.log('   ✅ 批次分析成功');
            console.log(`   時間點數量: ${result.timeVector ? result.timeVector.length : '未知'}`);
            
            if (result.data && result.data.length > 0) {
                // 分析最後幾個時間點的輸出電壓
                const lastPoints = result.data.slice(-5);
                const avgVout = lastPoints.reduce((sum, p) => sum + (p['4'] || 0), 0) / lastPoints.length;
                console.log(`   平均輸出電壓: ${avgVout.toFixed(3)}V`);
                console.log(`   理論期望值: ${(24 * 0.5).toFixed(1)}V (Vin × Duty Cycle)`);
                console.log(`   轉換效率: ${((avgVout / 24) * 100).toFixed(1)}%`);
            }
        } else {
            console.log(`   ❌ 批次分析失敗: ${result.error}`);
        }
    } catch (batchError) {
        console.log(`   ❌ 批次分析異常: ${batchError.message}`);
    }
    
    console.log('\n2. 執行步進分析（StepwiseSimulator）...');
    
    // 測試步進分析
    const stepSim = new StepwiseSimulator({ debug: false });
    
    // 重新解析網表以取得元件
    const { NetlistParser } = await import('./src/parser/netlist.js');
    const parser = new NetlistParser();
    const circuit = parser.parse(buckNetlist);
    
    const initialized = await stepSim.initialize(circuit.components, {
        startTime: 0,
        stopTime: 50e-6, // 50µs
        timeStep: 0.2e-6 // 200ns 步長
    });
    
    if (initialized) {
        console.log('   ✅ 步進模擬器初始化成功');
        
        // 執行幾個開關週期
        const results = [];
        let stepCount = 0;
        const maxSteps = 100; // 限制步數避免過長輸出
        
        while (stepCount < maxSteps) {
            const stepResult = await stepSim.stepForward();
            
            if (!stepResult.success) {
                console.log(`   ❌ 步進失敗 at step ${stepCount}: ${stepResult.error}`);
                break;
            }
            
            const time = stepResult.time;
            const state = stepResult.state;
            
            if (state.nodeVoltages) {
                const vOut = state.nodeVoltages.get('4') || 0;
                const vGate = state.nodeVoltages.get('3') || 0;
                const vSw = state.nodeVoltages.get('2') || 0;
                
                results.push({ time, vOut, vGate, vSw });
                
                // 每20步輸出一次
                if (stepCount % 20 === 0) {
                    const mosfetState = vGate > 2 ? 'ON' : 'OFF';
                    console.log(`     t=${(time*1e6).toFixed(1)}µs: V(out)=${vOut.toFixed(4)}V, V(gate)=${vGate.toFixed(1)}V (${mosfetState}), V(sw)=${vSw.toFixed(2)}V`);
                }
            }
            
            stepCount++;
            
            if (stepResult.isComplete) {
                console.log('   🏁 模擬完成');
                break;
            }
        }
        
        if (results.length > 0) {
            console.log('\n3. 分析模擬結果:');
            
            // 計算輸出電壓統計
            const vOutValues = results.map(r => r.vOut);
            const avgVOut = vOutValues.reduce((a, b) => a + b, 0) / vOutValues.length;
            const minVOut = Math.min(...vOutValues);
            const maxVOut = Math.max(...vOutValues);
            const ripple = maxVOut - minVOut;
            
            console.log(`   平均輸出電壓: ${avgVOut.toFixed(4)}V`);
            console.log(`   輸出電壓範圍: ${minVOut.toFixed(4)}V ~ ${maxVOut.toFixed(4)}V`);
            console.log(`   電壓紋波: ${(ripple * 1000).toFixed(2)}mV`);
            
            // 分析開關行為
            const switchTransitions = [];
            for (let i = 1; i < results.length; i++) {
                const prev = results[i-1];
                const curr = results[i];
                
                const prevState = prev.vGate > 2;
                const currState = curr.vGate > 2;
                
                if (prevState !== currState) {
                    switchTransitions.push({
                        time: curr.time,
                        state: currState ? 'OFF→ON' : 'ON→OFF',
                        vSw: curr.vSw
                    });
                }
            }
            
            console.log(`   檢測到 ${switchTransitions.length} 次開關轉換:`);
            switchTransitions.forEach((trans, i) => {
                console.log(`     ${i+1}. t=${(trans.time*1e6).toFixed(1)}µs: ${trans.state}, V(sw)=${trans.vSw.toFixed(2)}V`);
            });
            
            // 計算開關頻率
            const onOffTransitions = switchTransitions.filter(t => t.state === 'ON→OFF');
            if (onOffTransitions.length >= 2) {
                const period = onOffTransitions[1].time - onOffTransitions[0].time;
                const frequency = 1 / period;
                console.log(`   實際開關頻率: ${(frequency / 1000).toFixed(1)} kHz`);
            }
            
            // 檢查 Buck 轉換器特性
            console.log('\n4. Buck 轉換器性能評估:');
            
            const theoretical = 24 * 0.5; // Vin × D
            const efficiency = (avgVOut / theoretical) * 100;
            
            console.log(`   理論輸出電壓: ${theoretical}V (24V × 50% duty cycle)`);
            console.log(`   實際輸出電壓: ${avgVOut.toFixed(3)}V`);
            console.log(`   轉換準確度: ${efficiency.toFixed(1)}%`);
            console.log(`   電壓紋波率: ${((ripple / avgVOut) * 100).toFixed(2)}%`);
            
            // 性能評級
            let grade = '';
            if (efficiency > 95 && (ripple / avgVOut) < 0.05) {
                grade = '🏆 優秀';
            } else if (efficiency > 90 && (ripple / avgVOut) < 0.1) {
                grade = '👍 良好';
            } else if (efficiency > 80) {
                grade = '⚠️ 需改進';
            } else {
                grade = '❌ 有問題';
            }
            
            console.log(`   總體評估: ${grade}`);
        }
    } else {
        console.log('   ❌ 步進模擬器初始化失敗');
    }
    
} catch (error) {
    console.error('❌ 測試失敗:', error.message);
    console.error(error.stack);
}

console.log('\n測試完成！');