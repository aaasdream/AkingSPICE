/**
 * 簡單 RC + MOSFET 組合測試
 * 測試電阻、電容、MOSFET 三種元件的組合是否工作正常
 * 這是發現 Buck 轉換器問題的關鍵測試
 */

console.log('🔍 開始 RC + MOSFET 組合測試');

try {
    // 導入必要模組
    const { AkingSPICE } = await import('./src/core/solver.js');
    
    // 測試 1: 最簡單的 RC + 常開 MOSFET
    console.log('\n=== 測試 1: RC + 常開 MOSFET ===');
    const rcMosNetlist1 = `
* Simple RC with always-ON MOSFET
V1 1 0 DC 12V
M1 1 2 3 NMOS Ron=10m Vth=2V
R1 2 4 1k
C1 4 0 100uF
VG 3 0 DC 15V
.TRAN 0.1m 10m
.END
`;

    const rcMosSolver1 = new AkingSPICE();
    rcMosSolver1.setDebug(false);
    rcMosSolver1.loadNetlist(rcMosNetlist1);
    
    const rcMosValidation1 = rcMosSolver1.validateCircuit();
    console.log(`RC+MOS(常開) 驗證: ${rcMosValidation1.valid ? '✅ 通過' : '❌ 失敗'}`);
    
    if (rcMosValidation1.valid) {
        try {
            const rcMosResult1 = await rcMosSolver1.runAnalysis();
            if (rcMosResult1.success) {
                console.log('✅ RC+MOS(常開) 模擬成功');
                console.log(`   時間點數: ${rcMosResult1.timeVector ? rcMosResult1.timeVector.length : 0}`);
                
                if (rcMosResult1.data && rcMosResult1.data.length > 0) {
                    const finalV = rcMosResult1.data[rcMosResult1.data.length - 1]['4'] || 0;
                    console.log(`   最終電壓: ${finalV.toFixed(3)}V (理論: 接近12V)`);
                }
            } else {
                console.log(`❌ RC+MOS(常開) 失敗: ${rcMosResult1.error}`);
            }
        } catch (e) {
            console.log(`❌ RC+MOS(常開) 異常: ${e.message}`);
        }
    }

    // 測試 2: RC + 常關 MOSFET
    console.log('\n=== 測試 2: RC + 常關 MOSFET ===');
    const rcMosNetlist2 = `
* Simple RC with always-OFF MOSFET  
V1 1 0 DC 12V
M1 1 2 3 NMOS Ron=10m Vth=2V
R1 2 4 1k
C1 4 0 100uF
VG 3 0 DC 0V
.TRAN 0.1m 10m
.END
`;

    const rcMosSolver2 = new AkingSPICE();
    rcMosSolver2.setDebug(false);
    rcMosSolver2.loadNetlist(rcMosNetlist2);
    
    const rcMosValidation2 = rcMosSolver2.validateCircuit();
    console.log(`RC+MOS(常關) 驗證: ${rcMosValidation2.valid ? '✅ 通過' : '❌ 失敗'}`);
    
    if (rcMosValidation2.valid) {
        try {
            const rcMosResult2 = await rcMosSolver2.runAnalysis();
            if (rcMosResult2.success) {
                console.log('✅ RC+MOS(常關) 模擬成功');
                console.log(`   時間點數: ${rcMosResult2.timeVector ? rcMosResult2.timeVector.length : 0}`);
                
                if (rcMosResult2.data && rcMosResult2.data.length > 0) {
                    const finalV = rcMosResult2.data[rcMosResult2.data.length - 1]['4'] || 0;
                    console.log(`   最終電壓: ${finalV.toFixed(3)}V (理論: 接近0V)`);
                }
            } else {
                console.log(`❌ RC+MOS(常關) 失敗: ${rcMosResult2.error}`);
            }
        } catch (e) {
            console.log(`❌ RC+MOS(常關) 異常: ${e.message}`);
        }
    }

    // 測試 3: RC + 緩慢開關 MOSFET
    console.log('\n=== 測試 3: RC + 緩慢開關 MOSFET ===');
    const rcMosNetlist3 = `
* RC with slow switching MOSFET
V1 1 0 DC 12V  
M1 1 2 3 NMOS Ron=10m Vth=2V
R1 2 4 1k
C1 4 0 100uF
VG 3 0 PULSE(0 15 0 0.1m 0.1m 4.8m 10m)
.TRAN 0.1m 25m
.END
`;

    const rcMosSolver3 = new AkingSPICE();
    rcMosSolver3.setDebug(false);
    rcMosSolver3.loadNetlist(rcMosNetlist3);
    
    const rcMosValidation3 = rcMosSolver3.validateCircuit();
    console.log(`RC+MOS(緩慢開關) 驗證: ${rcMosValidation3.valid ? '✅ 通過' : '❌ 失敗'}`);
    
    if (rcMosValidation3.valid) {
        try {
            const rcMosResult3 = await rcMosSolver3.runAnalysis();
            if (rcMosResult3.success) {
                console.log('✅ RC+MOS(緩慢開關) 模擬成功');
                console.log(`   時間點數: ${rcMosResult3.timeVector ? rcMosResult3.timeVector.length : 0}`);
                
                if (rcMosResult3.data && rcMosResult3.data.length > 10) {
                    // 分析開關行為
                    const voltages = rcMosResult3.data.map(d => d['4'] || 0);
                    const maxV = Math.max(...voltages);
                    const minV = Math.min(...voltages);
                    
                    console.log(`   電壓範圍: ${minV.toFixed(3)}V ~ ${maxV.toFixed(3)}V`);
                    
                    if (maxV > 8 && minV < 2) {
                        console.log('   ✅ 檢測到開關行為 - MOSFET 工作正常');
                    } else {
                        console.log('   ⚠️ 開關行為不明顯');
                    }
                }
            } else {
                console.log(`❌ RC+MOS(緩慢開關) 失敗: ${rcMosResult3.error}`);
            }
        } catch (e) {
            console.log(`❌ RC+MOS(緩慢開關) 異常: ${e.message}`);
        }
    }

    // 測試 4: RC + 快速開關 MOSFET (更接近 Buck 轉換器)
    console.log('\n=== 測試 4: RC + 快速開關 MOSFET ===');
    const rcMosNetlist4 = `
* RC with fast switching MOSFET (like Buck converter)
V1 1 0 DC 12V
M1 1 2 3 NMOS Ron=10m Vth=2V  
R1 2 4 10
C1 4 0 10uF
VG 3 0 PULSE(0 15 0 10n 10n 5u 10u)
.TRAN 0.05u 50u
.END
`;

    const rcMosSolver4 = new AkingSPICE();
    rcMosSolver4.setDebug(false);
    rcMosSolver4.loadNetlist(rcMosNetlist4);
    
    const rcMosValidation4 = rcMosSolver4.validateCircuit();
    console.log(`RC+MOS(快速開關) 驗證: ${rcMosValidation4.valid ? '✅ 通過' : '❌ 失敗'}`);
    
    if (rcMosValidation4.valid) {
        try {
            const rcMosResult4 = await rcMosSolver4.runAnalysis();
            if (rcMosResult4.success) {
                console.log('✅ RC+MOS(快速開關) 模擬成功');
                console.log(`   時間點數: ${rcMosResult4.timeVector ? rcMosResult4.timeVector.length : 0}`);
                
                if (rcMosResult4.data && rcMosResult4.data.length > 10) {
                    // 分析快速開關行為
                    const voltages = rcMosResult4.data.map(d => d['4'] || 0);
                    const times = rcMosResult4.timeVector || [];
                    
                    // 查看最後幾個週期的平均值
                    const lastQuarter = voltages.slice(Math.floor(voltages.length * 0.75));
                    const avgV = lastQuarter.reduce((a, b) => a + b, 0) / lastQuarter.length;
                    
                    console.log(`   平均電壓: ${avgV.toFixed(3)}V (理論: 約6V = 12V × 50%)`);
                    
                    const maxV = Math.max(...voltages);
                    const minV = Math.min(...voltages);
                    console.log(`   電壓範圍: ${minV.toFixed(3)}V ~ ${maxV.toFixed(3)}V`);
                    
                    if (Math.abs(avgV - 6) < 1.5) {
                        console.log('   ✅ 快速開關行為正常 - 接近 Buck 轉換器模式');
                    } else {
                        console.log('   ⚠️ 快速開關結果異常');
                    }
                }
            } else {
                console.log(`❌ RC+MOS(快速開關) 失敗: ${rcMosResult4.error}`);
            }
        } catch (e) {
            console.log(`❌ RC+MOS(快速開關) 異常: ${e.message}`);
        }
    }

    console.log('\n=== RC + MOSFET 測試總結 ===');
    console.log('如果前三個測試成功但第四個失敗，說明問題出現在:');
    console.log('1. 快速開關時的數值穩定性');
    console.log('2. MCP 求解器在高頻開關下的收斂問題');
    console.log('3. 時間步長與開關頻率的匹配問題');
    console.log('');
    console.log('如果所有測試都失敗，說明 MOSFET MCP 實現有根本性問題');

} catch (error) {
    console.error('❌ RC+MOSFET 測試失敗:', error.message);
    console.error(error.stack);
}

console.log('\n🏁 RC + MOSFET 測試完成');