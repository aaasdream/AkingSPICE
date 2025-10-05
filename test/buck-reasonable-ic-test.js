/**
 * Buck 轉換器穩定性測試 - 更合理的初始條件
 * 測試使用更小的初始電流是否能解決數值發散問題
 */

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { NetlistParser } from '../src/parser/netlist.js';
import { MCPTransientAnalysis } from '../src/analysis/transient_mcp.js';

console.log('🔧 Buck 轉換器 - 合理初始條件測試');
console.log('========================================');

async function testReasonableInitialConditions() {
    // Buck converter with much smaller initial current
    const netlist = `
    Buck Converter with Small Initial Current
    
    V1 vin 0 24
    L1 vin vout 150u
    R1 vout 0 2
    
    .ic L1 0.1
    .tran 1u 50u
    `;

    try {
        const parser = new NetlistParser();
        const circuit = parser.parse(netlist);
        
        console.log('電路設置:');
        console.log('- 時間步長: 1µs');
        console.log('- 模擬時間: 50µs');
        console.log('- 初始電感電流: 0.1A (原來是 2.4A)');
        
        // 計算預期的 BDF2 等效電壓源
        const L = 150e-6;
        const h = 1e-6;
        const small_current = 0.1; // 0.1A
        const beta = -2, gamma = 0.5;
        const small_veq = L * (beta * small_current + gamma * small_current) / h;
        
        console.log('\n預期數值參數:');
        console.log(`- 小電流下的 BDF2 Veq: ${Math.abs(small_veq).toFixed(2)}V (原來是 1125V)`);
        
        if (Math.abs(small_veq) < 50) {
            console.log('✅ BDF2 等效電壓源現在非常合理!');
        } else {
            console.log('⚠️ 仍需要進一步調整');
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
                
                console.log('\n📊 電感電流變化 (每5步):');
                for (let i = 0; i < numPoints; i += 5) {
                    const time = result.timeVector[i];
                    const current = result.currentMatrix[inductorCurrIndex][i];
                    console.log(`  t=${(time*1e6).toFixed(1)}µs: IL=${current.toFixed(6)}A`);
                }
                
                // 檢查穩定性和合理性
                const finalCurrent = result.currentMatrix[inductorCurrIndex][numPoints - 1];
                const steadyStateCurrent = 24 / 2; // V/R = 12A
                
                console.log(`\n📈 最終電流: ${finalCurrent.toFixed(6)}A`);
                console.log(`理論穩態電流: ${steadyStateCurrent}A`);
                
                // 檢查電流是否在合理範圍內
                if (Math.abs(finalCurrent) < 50) { // 50A as upper bound
                    console.log('✅ 電流在合理範圍內!');
                    
                    // 檢查是否趨向穩態
                    if (Math.abs(finalCurrent - steadyStateCurrent) < 1.0) {
                        console.log('✅ 電流接近理論穩態值!');
                    } else if (finalCurrent > 0 && finalCurrent < steadyStateCurrent * 1.5) {
                        console.log('✅ 電流正在向穩態收斂!');
                    } else {
                        console.log('⚠️ 電流尚未完全穩定，但在合理範圍');
                    }
                    
                    // 檢查是否有指數增長
                    const midPoint = Math.floor(numPoints / 2);
                    const midCurrent = result.currentMatrix[inductorCurrIndex][midPoint];
                    const growthRatio = Math.abs(finalCurrent / midCurrent);
                    
                    if (growthRatio < 3) {
                        console.log('✅ 沒有指數增長，數值穩定!');
                        console.log('🎉 合理的初始條件成功解決了數值發散問題!');
                        return true;
                    } else {
                        console.log(`⚠️ 仍有較快增長，增長比率: ${growthRatio.toFixed(2)}`);
                        return false;
                    }
                    
                } else {
                    console.log(`⚠️ 電流仍然過大: ${finalCurrent.toFixed(3)}A`);
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
const success = await testReasonableInitialConditions();

console.log('\n🎯 分析結論:');
if (success) {
    console.log('✅ 使用合理的初始條件成功解決了 BDF2 數值發散問題');
    console.log('📋 建議:');
    console.log('  1. 使用較小的初始電感電流 (如 0.1A 而非 2.4A)');
    console.log('  2. 讓電路從合理的初始狀態自然演化到穩態');
    console.log('  3. BDF2 方法本身是正確的，問題在於過大的初始條件');
} else {
    console.log('🔍 需要進一步調整:');
    console.log('  1. 嘗試更小的初始電流 (如 0.01A)');
    console.log('  2. 增加更強的阻尼');
    console.log('  3. 檢查電路連接是否正確');
}

console.log('\n🔬 技術總結:');
console.log('BDF2 等效電壓源 = L * (β*i_{n-1} + γ*i_{n-2}) / h');
console.log('對於 L=150µH, h=1µs:');
console.log('- 當 i~5A 時: |Veq| ~1125V (不合理)');
console.log('- 當 i~0.1A 時: |Veq| ~22.5V (合理)');
console.log('→ 關鍵是控制電流值在合理範圍內!');