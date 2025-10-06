/**
 * 簡單 RLC 組合測試
 * 測試電阻、電感、電容三種基礎元件的組合是否工作正常
 */

console.log('🔍 開始 RLC 組合測試');

try {
    // 導入必要模組
    const { AkingSPICE } = await import('./src/core/solver.js');
    
    // 測試 1: 簡單 RC 電路
    console.log('\n=== 測試 1: RC 電路 ===');
    const rcNetlist = `
* Simple RC Circuit
V1 1 0 DC 12V
R1 1 2 1k
C1 2 0 100uF
.TRAN 0.1m 10m
.END
`;

    const rcSolver = new AkingSPICE();
    rcSolver.setDebug(false);
    rcSolver.loadNetlist(rcNetlist);
    
    const rcValidation = rcSolver.validateCircuit();
    console.log(`RC 電路驗證: ${rcValidation.valid ? '✅ 通過' : '❌ 失敗'}`);
    
    if (rcValidation.valid) {
        try {
            const rcResult = await rcSolver.runAnalysis();
            if (rcResult.success) {
                console.log('✅ RC 電路模擬成功');
                console.log(`   時間點數: ${rcResult.timeVector ? rcResult.timeVector.length : 0}`);
                
                if (rcResult.data && rcResult.data.length > 0) {
                    const finalV = rcResult.data[rcResult.data.length - 1]['2'] || 0;
                    console.log(`   最終電壓: ${finalV.toFixed(3)}V (理論: 接近12V)`);
                }
            } else {
                console.log(`❌ RC 電路失敗: ${rcResult.error}`);
            }
        } catch (e) {
            console.log(`❌ RC 電路異常: ${e.message}`);
        }
    }

    // 測試 2: 簡單 RL 電路
    console.log('\n=== 測試 2: RL 電路 ===');
    const rlNetlist = `
* Simple RL Circuit  
V1 1 0 DC 12V
R1 1 2 1k
L1 2 0 10mH
.TRAN 0.01m 20m
.END
`;

    const rlSolver = new AkingSPICE();
    rlSolver.setDebug(false);
    rlSolver.loadNetlist(rlNetlist);
    
    const rlValidation = rlSolver.validateCircuit();
    console.log(`RL 電路驗證: ${rlValidation.valid ? '✅ 通過' : '❌ 失敗'}`);
    
    if (rlValidation.valid) {
        try {
            const rlResult = await rlSolver.runAnalysis();
            if (rlResult.success) {
                console.log('✅ RL 電路模擬成功');
                console.log(`   時間點數: ${rlResult.timeVector ? rlResult.timeVector.length : 0}`);
                
                if (rlResult.data && rlResult.data.length > 0) {
                    const finalV = rlResult.data[rlResult.data.length - 1]['2'] || 0;
                    console.log(`   最終電壓: ${finalV.toFixed(3)}V (理論: 接近0V)`);
                }
            } else {
                console.log(`❌ RL 電路失敗: ${rlResult.error}`);
            }
        } catch (e) {
            console.log(`❌ RL 電路異常: ${e.message}`);
        }
    }

    // 測試 3: 完整 RLC 電路
    console.log('\n=== 測試 3: RLC 電路 ===');
    const rlcNetlist = `
* Simple RLC Circuit
V1 1 0 DC 12V  
R1 1 2 10
L1 2 3 1mH
C1 3 0 100uF
.TRAN 0.01m 10m
.END
`;

    const rlcSolver = new AkingSPICE();
    rlcSolver.setDebug(false);
    rlcSolver.loadNetlist(rlcNetlist);
    
    const rlcValidation = rlcSolver.validateCircuit();
    console.log(`RLC 電路驗證: ${rlcValidation.valid ? '✅ 通過' : '❌ 失敗'}`);
    
    if (rlcValidation.valid) {
        try {
            const rlcResult = await rlcSolver.runAnalysis();
            if (rlcResult.success) {
                console.log('✅ RLC 電路模擬成功');
                console.log(`   時間點數: ${rlcResult.timeVector ? rlcResult.timeVector.length : 0}`);
                
                if (rlcResult.data && rlcResult.data.length > 0) {
                    // 查看中間和最終電壓
                    const midIdx = Math.floor(rlcResult.data.length / 2);
                    const midV = rlcResult.data[midIdx]['3'] || 0;
                    const finalV = rlcResult.data[rlcResult.data.length - 1]['3'] || 0;
                    
                    console.log(`   中間電壓: ${midV.toFixed(3)}V`);
                    console.log(`   最終電壓: ${finalV.toFixed(3)}V (理論: 接近12V)`);
                    
                    // 檢查是否有振盪
                    const voltages = rlcResult.data.map(d => d['3'] || 0);
                    const maxV = Math.max(...voltages);
                    const minV = Math.min(...voltages);
                    console.log(`   電壓範圍: ${minV.toFixed(3)}V ~ ${maxV.toFixed(3)}V`);
                    
                    if (maxV > 12.5) {
                        console.log('   ⚠️ 檢測到過沖 - RLC 振盪正常');
                    }
                }
            } else {
                console.log(`❌ RLC 電路失敗: ${rlResult.error}`);
            }
        } catch (e) {
            console.log(`❌ RLC 電路異常: ${e.message}`);
        }
    }

    // 測試 4: 階躍響應 RLC
    console.log('\n=== 測試 4: 階躍響應 RLC ===');
    const stepNetlist = `
* RLC Step Response  
V1 1 0 PULSE(0 12 0 0.1m 0.1m 5m 20m)
R1 1 2 5
L1 2 3 2mH
C1 3 0 220uF
.TRAN 0.05m 25m
.END
`;

    const stepSolver = new AkingSPICE();
    stepSolver.setDebug(false);
    stepSolver.loadNetlist(stepNetlist);
    
    const stepValidation = stepSolver.validateCircuit();
    console.log(`階躍 RLC 驗證: ${stepValidation.valid ? '✅ 通過' : '❌ 失敗'}`);
    
    if (stepValidation.valid) {
        try {
            const stepResult = await stepSolver.runAnalysis();
            if (stepResult.success) {
                console.log('✅ 階躍 RLC 模擬成功');
                console.log(`   時間點數: ${stepResult.timeVector ? stepResult.timeVector.length : 0}`);
                
                if (stepResult.data && stepResult.data.length > 10) {
                    // 分析響應特性
                    const voltages = stepResult.data.map(d => d['3'] || 0);
                    const times = stepResult.timeVector || [];
                    
                    // 找到輸入變化時的響應
                    let maxResponse = Math.max(...voltages);
                    let finalResponse = voltages[voltages.length - 1];
                    
                    console.log(`   最大響應: ${maxResponse.toFixed(3)}V`);
                    console.log(`   最終穩態: ${finalResponse.toFixed(3)}V`);
                    
                    // 計算超調量
                    const overshoot = ((maxResponse - 12) / 12) * 100;
                    if (overshoot > 0) {
                        console.log(`   超調量: ${overshoot.toFixed(1)}%`);
                    }
                }
            } else {
                console.log(`❌ 階躍 RLC 失敗: ${stepResult.error}`);
            }
        } catch (e) {
            console.log(`❌ 階躍 RLC 異常: ${e.message}`);
        }
    }

    console.log('\n=== RLC 組合測試總結 ===');
    console.log('如果以上所有測試都成功，說明基礎 RLC 元件工作正常');
    console.log('如果有失敗，問題可能在於：');
    console.log('1. 線性元件的數值實現');
    console.log('2. 時間積分方法');
    console.log('3. 矩陣求解器');

} catch (error) {
    console.error('❌ RLC 測試失敗:', error.message);
    console.error(error.stack);
}

console.log('\n🏁 RLC 組合測試完成');