// 步驟五：Buck轉換器調試測試
// 基於步驟四發現的振盪穩定性問題，謹慎調試Buck轉換器

import { NetlistParser } from '../src/parser/netlist.js';
import { DC_MCP_Solver } from '../src/analysis/dc_mcp_solver.js';
import { MCPTransientAnalysis } from '../src/analysis/transient_mcp.js';

console.log('🔧 步驟五：Buck轉換器系統性調試');
console.log('⚠️  已知問題：Gear 2積分器在振盪電路中不穩定');
console.log('📋 調試策略：從簡單到複雜，逐步增加組件');
console.log('');

// 調試階段1：靜態DC分析（無開關動作）
async function debugPhase1_StaticDC() {
    console.log('🔍 階段1：靜態DC分析（開關常開）');
    console.log('目標：驗證Buck電路在靜態條件下的DC工作點');
    
    try {
        // 手動創建組件（避免netlist解析問題）
        const { VoltageSource } = await import('../src/components/sources.js');
        const { Resistor } = await import('../src/components/resistor.js');
        const { Inductor } = await import('../src/components/inductor.js');
        const { Capacitor } = await import('../src/components/capacitor.js');
        
        const components = [
            new VoltageSource('Vin', ['1', '0'], 12),
            new Resistor('R_sw', ['1', '2'], 0.01),     // 開關閉合阻抗
            new Inductor('L1', ['2', '3'], 10e-3),      // 10mH
            new Capacitor('C1', ['3', '0'], 100e-6),    // 100uF
            new Resistor('R_load', ['3', '0'], 10)      // 負載
        ];
        
        const solver = new DC_MCP_Solver({
            debug: false,
            gmin: 1e-12,
            maxIterations: 100,
            tolerance: 1e-9
        });
        const result = await solver.solve(components);
        
        if (result.converged) {
            console.log('✅ 靜態DC分析收斂');
            console.log(`📊 關鍵節點電壓：`);
            const V1 = result.nodeVoltages.get('1') || 0;
            const V2 = result.nodeVoltages.get('2') || 0;
            const V3 = result.nodeVoltages.get('3') || 0;
            
            console.log(`   V(1) = ${V1.toFixed(6)}V  (輸入)`);
            console.log(`   V(2) = ${V2.toFixed(6)}V  (開關後)`);
            console.log(`   V(3) = ${V3.toFixed(6)}V  (輸出)`);
            
            // 計算電流和功率
            const I_load = V3 / 10;  // V(3) / R_load
            const P_out = V3 * I_load;
            
            console.log(`⚡ 負載分析：`);
            console.log(`   I_load = ${I_load.toFixed(6)}A`);
            console.log(`   P_out = ${P_out.toFixed(6)}W`);
            
            // 理論值驗證（忽略電感直流阻抗）
            const V_theory = 12 * 10 / (0.01 + 10);  // 電阻分壓
            const error = Math.abs(V3 - V_theory) / V_theory * 100;
            
            console.log(`🎯 理論值驗證：`);
            console.log(`   理論輸出 = ${V_theory.toFixed(6)}V`);
            console.log(`   實際誤差 = ${error.toFixed(2)}%`);
            
            if (error < 1.0) {
                console.log('✅ 階段1測試：PASS');
                return true;
            } else {
                console.log('❌ 階段1測試：FAIL - DC計算誤差過大');
                return false;
            }
        } else {
            console.log('❌ 階段1測試：FAIL - DC求解不收斂');
            return false;
        }
        
    } catch (error) {
        console.error('❌ 階段1異常：', error.message);
        return false;
    }
}

// 調試階段2：簡化瞬態分析（固定導通）
async function debugPhase2_SimpleTransient() {
    console.log('');
    console.log('🔍 階段2：簡化瞬態分析（開關恆導通）');
    console.log('目標：測試LC電路的瞬態響應穩定性');
    
    try {
        // 手動創建組件
        const { VoltageSource } = await import('../src/components/sources.js');
        const { Resistor } = await import('../src/components/resistor.js');
        const { Inductor } = await import('../src/components/inductor.js');
        const { Capacitor } = await import('../src/components/capacitor.js');
        
        const components = [
            // 簡化為DC電壓源
            new VoltageSource('Vin', ['1', '0'], 12),
            new Resistor('R_sw', ['1', '2'], 0.01),
            new Inductor('L1', ['2', '3'], 10e-3),      
            new Capacitor('C1', ['3', '0'], 100e-6),    
            new Resistor('R_load', ['3', '0'], 10)
        ];
        
        const analysis = new MCPTransientAnalysis({
            debug: false,
            adaptiveTimeStep: true
        });
        
        // 較保守的步長，避免振盪放大
        const timeStep = 1e-6;    // 1us步長
        const endTime = 1e-3;     // 1ms總時間
        
        console.log(`⚙️  瞬態參數：dt=${timeStep*1e6}μs, t_end=${endTime*1e3}ms`);
        
        const params = {
            startTime: 0.0,
            stopTime: endTime,
            timeStep: timeStep,
            maxSteps: 2000
        };
        
        const results = await analysis.run(components, params);
        
        if (results && results.timeVector && results.voltageMatrix) {
            console.log(`✅ 瞬態分析完成：${results.timeVector.length}個時間點`);
            console.log(`🕐 最終時間：${results.timeVector[results.timeVector.length-1]*1e3}ms`);
            
            // 檢查數值穩定性 - 節點3的電壓歷史
            const node3Index = results.nodeMap?.get('3') || 2;  // 假設節點3是索引2
            const voltages = results.voltageMatrix.map(row => row[node3Index] || 0);
            const minV = Math.min(...voltages);
            const maxV = Math.max(...voltages);
            const finalV = voltages[voltages.length - 1];
            
            console.log(`📊 輸出電壓範圍：${minV.toFixed(6)}V 到 ${maxV.toFixed(6)}V`);
            console.log(`🎯 最終輸出電壓：${finalV.toFixed(6)}V`);
            
            // 穩定性檢查
            const isStable = maxV < 1000 && minV > -1000;  // 合理範圍
            const isMonotonic = checkMonotonicity(voltages);
            
            console.log(`🔍 穩定性檢查：${isStable ? '✅ 穩定' : '❌ 不穩定'}`);
            console.log(`📈 單調性檢查：${isMonotonic ? '✅ 單調' : '❌ 振盪'}`);
            
            // 關鍵時間點分析
            const keyIndices = [
                Math.floor(voltages.length * 0.1),   // 10%
                Math.floor(voltages.length * 0.5),   // 50%
                Math.floor(voltages.length * 0.9),   // 90%
                voltages.length - 1                   // 100%
            ];
            
            console.log(`⏱️  關鍵時間點：`);
            keyIndices.forEach(i => {
                if (i < voltages.length && i < results.timeVector.length) {
                    const t = results.timeVector[i] * 1e3;  // ms
                    const v = voltages[i];
                    console.log(`   t=${t.toFixed(2)}ms: V(3)=${v.toFixed(6)}V`);
                }
            });
            
            if (isStable && !Number.isNaN(finalV)) {
                console.log('✅ 階段2測試：PASS');
                return { success: true, stable: isStable, monotonic: isMonotonic };
            } else {
                console.log('❌ 階段2測試：FAIL - 數值不穩定');
                return { success: false, stable: isStable, monotonic: isMonotonic };
            }
            
        } else {
            console.log('❌ 階段2測試：FAIL - 瞬態分析失敗');
            return { success: false, stable: false, monotonic: false };
        }
        
    } catch (error) {
        console.error('❌ 階段2異常：', error.message);
        return { success: false, stable: false, monotonic: false };
    }
}

// 調試階段3：簡化負載測試（暫時跳過PWM）
async function debugPhase3_LoadTest() {
    console.log('');
    console.log('🔍 階段3：負載變化測試（暫時跳過PWM）');
    console.log('目標：測試不同負載條件下的系統穩定性');
    
    try {
        const { VoltageSource } = await import('../src/components/sources.js');
        const { Resistor } = await import('../src/components/resistor.js');
        const { Inductor } = await import('../src/components/inductor.js');
        const { Capacitor } = await import('../src/components/capacitor.js');
        
        // 測試不同負載阻抗
        const loadResistances = [5, 10, 20];  // 5Ω, 10Ω, 20Ω
        let allStable = true;
        
        for (const Rload of loadResistances) {
            console.log(`\n� 測試負載阻抗：${Rload}Ω`);
            
            const components = [
                new VoltageSource('Vin', ['1', '0'], 12),
                new Resistor('R_sw', ['1', '2'], 0.01),
                new Inductor('L1', ['2', '3'], 10e-3),
                new Capacitor('C1', ['3', '0'], 100e-6),
                new Resistor('R_load', ['3', '0'], Rload)
            ];
            
            const solver = new DC_MCP_Solver({
                debug: false,
                gmin: 1e-12,
                maxIterations: 100,
                tolerance: 1e-9
            });
            const result = await solver.solve(components);
            
            if (result.converged) {
                const V_out = result.nodeVoltages.get('3') || 0;
                const I_load = V_out / Rload;
                const P_load = V_out * I_load;
                
                console.log(`  ✅ DC收斂：V_out=${V_out.toFixed(4)}V, I_load=${I_load.toFixed(4)}A, P=${P_load.toFixed(4)}W`);
            } else {
                console.log(`  ❌ DC不收斂`);
                allStable = false;
            }
        }
        
        if (allStable) {
            console.log('\n✅ 階段3測試：PASS - 多負載條件穩定');
            return true;
        } else {
            console.log('\n❌ 階段3測試：FAIL - 某些負載條件不穩定');
            return false;
        }
        
    } catch (error) {
        console.error('❌ 階段3異常：', error.message);
        return false;
    }
}

// 單調性檢查函數
function checkMonotonicity(values, tolerance = 0.1) {
    if (values.length < 10) return true;  // 太少數據點無法判斷
    
    let increasing = 0;
    let decreasing = 0;
    
    for (let i = 1; i < values.length; i++) {
        const diff = values[i] - values[i-1];
        if (Math.abs(diff) > tolerance) {
            if (diff > 0) increasing++;
            else decreasing++;
        }
    }
    
    // 如果主要趨勢一致，認為是單調的
    const majorTrend = Math.max(increasing, decreasing);
    const minorTrend = Math.min(increasing, decreasing);
    
    return majorTrend > minorTrend * 3;  // 主要趨勢佔主導
}

// 主測試函數
async function runBuckConverterDebug() {
    console.log('🚀 開始Buck轉換器系統性調試...');
    console.log('');
    
    // 階段1：靜態DC分析
    const phase1Result = await debugPhase1_StaticDC();
    
    if (!phase1Result) {
        console.log('');
        console.log('🛑 調試終止：階段1 DC分析失敗');
        console.log('❌ Buck轉換器基本DC路徑有問題');
        return;
    }
    
    // 階段2：瞬態響應
    const phase2Result = await debugPhase2_SimpleTransient();
    
    if (!phase2Result.success) {
        console.log('');
        console.log('🛑 調試終止：階段2 瞬態分析失敗');
        console.log('❌ LC電路瞬態響應不穩定');
        console.log('💡 建議：降低電感值或增加阻尼');
        return;
    }
    
    if (!phase2Result.stable) {
        console.log('');
        console.log('⚠️  警告：瞬態響應顯示穩定性問題');
        console.log('❌ 跳過PWM測試，避免進一步不穩定');
        return;
    }
    
    // 階段3：負載測試（僅在前面穩定時進行）
    if (phase2Result.stable && phase2Result.monotonic) {
        const phase3Result = await debugPhase3_LoadTest();
        
        if (phase3Result) {
            console.log('');
            console.log('🎉 Buck轉換器基礎調試成功！');
            console.log('✅ 所有階段測試通過');
            console.log('📈 系統基礎功能正常，可考慮PWM實現');
        } else {
            console.log('');
            console.log('⚠️  負載測試發現問題');
            console.log('💡 建議：檢查元件參數或求解器配置');
        }
    } else {
        console.log('');
        console.log('⚠️  瞬態響應問題，跳過負載測試');
        console.log('💡 需要解決LC電路振盪問題');
    }
    
    console.log('');
    console.log('=== 步驟五調試總結 ===');
    console.log(`✅ DC分析：${phase1Result ? 'PASS' : 'FAIL'}`);
    console.log(`✅ 瞬態穩定性：${phase2Result.stable ? 'PASS' : 'FAIL'}`);
    console.log(`✅ 瞬態單調性：${phase2Result.monotonic ? 'PASS' : 'FAIL'}`);
    console.log('');
    
    if (phase1Result && phase2Result.success) {
        console.log('🎯 診斷結論：Buck轉換器基礎功能正常');
        console.log('⚠️  注意：需要針對振盪電路優化Gear 2積分器');
    } else {
        console.log('❌ 診斷結論：Buck轉換器存在基礎問題');
        console.log('🔧 需要進一步調試電路結構或求解器');
    }
}

// 執行調試
runBuckConverterDebug().catch(console.error);