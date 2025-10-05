/**
 * Buck 轉換器穩定性測試 - 較小時間步長
 * 測試使用 0.1µs 時間步長是否能解決數值發散問題
 */

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { NetlistParser } from '../src/parser/netlist.js';
import { MCPTransientAnalysis } from '../src/analysis/transient_mcp.js';

console.log('🔧 Buck 轉換器 - 小時間步長測試');
console.log('========================================');

async function testSmallerTimeStep() {
    // Buck converter with smaller time step
    const netlist = `
    Buck Converter with Small Time Step
    
    V1 vin 0 24
    L1 vin vout 150u
    R1 vout 0 2
    
    .ic L1 2.4
    .tran 0.1u 10u
    `;

    try {
        const parser = new NetlistParser();
        const circuit = parser.parse(netlist);
        
        console.log('電路設置:');
        console.log('- 時間步長: 0.1µs (原來是 1µs)');
        console.log('- 模擬時間: 10µs');
        console.log('- 初始電感電流: 2.4A');
        
        // 計算新的數值參數
        const L = 150e-6;
        const R = 2;
        const h_new = 0.1e-6; // 0.1µs
        const alpha = 1.5;
        const R_eq_new = R + L * alpha / h_new;
        
        console.log('\n新的數值參數:');
        console.log(`- 等效電阻: ${R_eq_new.toFixed(1)}Ω (原來是 227Ω)`);
        console.log(`- Req/R 比值: ${(R_eq_new/R).toFixed(1)} (原來是 113.5)`);
        
        // 估計 BDF2 等效電壓源
        const typical_current = 5; // 5A
        const beta = -2, gamma = 0.5;
        const typical_veq_new = L * (beta * typical_current + gamma * typical_current) / h_new;
        console.log(`- 典型 BDF2 Veq: ${Math.abs(typical_veq_new).toFixed(0)}V (原來是 1125V)`);
        
        if (Math.abs(typical_veq_new) < 100) {
            console.log('✅ BDF2 等效電壓源現在合理!');
        } else {
            console.log('⚠️ BDF2 等效電壓源仍然較大');
        }
        
        console.log('\n🚀 開始瞬態分析...');
        
        const analysis = new MCPTransientAnalysis(circuit.components, circuit.analyses[0].params);
        analysis.maxVoltageStep = 1.0;  // 1V node damping
        analysis.dampingFactor = 0.5;   // 50% damping
        
        const result = analysis.run();
        
        if (result && result.timeVector && result.currentMatrix) {
            console.log(`✅ 模擬成功! 共 ${result.timeVector.length} 個時間點`);
            
            // 分析電感電流
            const inductorCurrIndex = result.branchCurrentLabels.indexOf('L1');
            if (inductorCurrIndex >= 0) {
                const numPoints = result.timeVector.length;
                const startIdx = 0;
                const endIdx = Math.min(10, numPoints - 1);
                
                console.log('\n📊 電感電流變化 (前10步):');
                for (let i = startIdx; i <= endIdx; i++) {
                    const time = result.timeVector[i];
                    const current = result.currentMatrix[inductorCurrIndex][i];
                    console.log(`  t=${(time*1e6).toFixed(1)}µs: IL=${current.toExponential(3)}A`);
                }
                
                // 檢查最後幾步
                if (numPoints > 10) {
                    const lastIdx = numPoints - 1;
                    const prev5Idx = Math.max(0, lastIdx - 5);
                    
                    console.log('\n📊 電感電流變化 (最後5步):');
                    for (let i = prev5Idx; i <= lastIdx; i++) {
                        const time = result.timeVector[i];
                        const current = result.currentMatrix[inductorCurrIndex][i];
                        console.log(`  t=${(time*1e6).toFixed(1)}µs: IL=${current.toExponential(3)}A`);
                    }
                }
                
                // 檢查穩定性
                const finalCurrent = result.currentMatrix[inductorCurrIndex][numPoints - 1];
                const maxReasonableCurrent = 24 / 2; // V/R = 12A for steady state
                
                if (Math.abs(finalCurrent) < maxReasonableCurrent * 2) {
                    console.log(`\n✅ 電流穩定! 最終電流: ${finalCurrent.toFixed(3)}A`);
                    console.log('🎉 小時間步長成功解決了數值發散問題!');
                    return true;
                } else {
                    console.log(`\n⚠️ 電流仍然過大: ${finalCurrent.toFixed(3)}A`);
                    return false;
                }
            } else {
                console.log('❌ 找不到電感電流數據');
                return false;
            }
        } else {
            console.log('❌ 模擬失敗或沒有返回結果');
            return false;
        }
        
    } catch (error) {
        console.error('測試失敗:', error);
        return false;
    }
}

// 運行測試
const success = await testSmallerTimeStep();

if (success) {
    console.log('\n🎯 結論: 減小時間步長是解決 BDF2 數值發散的有效方法');
    console.log('建議: 對於 150µH 電感，使用 0.1µs 或更小的時間步長');
} else {
    console.log('\n🤔 減小時間步長未完全解決問題，可能需要進一步調整');
    console.log('其他可嘗試的方法:');
    console.log('1. 更小的時間步長 (0.01µs)');
    console.log('2. 更小的初始電流');
    console.log('3. 更強的節點阻尼');
}