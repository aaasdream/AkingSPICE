//
// llc_simulation_step1.js
// 步驟1：開環功率級測試 - 用理想方波源替換控制器和MOSFET
//

import {
    VoltageSource, Resistor, Capacitor, Inductor,
    createMCPDiode, MultiWindingTransformer,
    createMCPTransientAnalysis, TransientResult
} from './src/index.js';
import { performance } from 'perf_hooks';

// --- 主模擬函數 ---
async function runLLCSimulation() {
    const totalStartTime = performance.now();
    console.log('🧪 步驟1：開環功率級測試 (移除控制器，用理想方波驅動)...');

    // --- 3. 定義電路與模擬參數 ---
    // 🔧 修復方案：提升輸入電壓解決二極管驅動電壓不足問題
    // 原因：900V輸入僅產生~1V次級電壓，扣除二極管壓降(0.7V)後餘量不足
    const VIN = 1800;  // 增加至1800V以確保足夠的二極管驅動電壓
    const VOUT_REF = 48;
    const LOAD_100 = 2.5;

    // --- 4. 創建電路元件 ---
    const TURNS_RATIO_TEST = 2.0;  // 測試溫和的1:2升壓匝比
    const L_PRIMARY = 250e-6;
    const L_SECONDARY = L_PRIMARY * TURNS_RATIO_TEST * TURNS_RATIO_TEST;  // 升壓匝比
    
    console.log(`🔍 測試匝比: 1:${TURNS_RATIO_TEST} (升壓), L_primary=${L_PRIMARY*1e6}µH, L_secondary=${L_SECONDARY*1e6}µH`);
    console.log(`🔍 耦合系數: k=0.999, 相互電感 M=√(L1*L2)*k=${Math.sqrt(L_PRIMARY*L_SECONDARY)*0.999*1e6}µH`);
    
    // 測試1:1匝比改善阻抗匹配
    const transformer = new MultiWindingTransformer('T1', {
        windings: [
            { name: 'primary', nodes: ['PRI_POS', 'SW_MID'], inductance: 1000e-6 },     // 1mH
            { name: 'secondary', nodes: ['SEC_POS', '0'], inductance: 1000e-6 },        // 1mH, 1:1匝比
            { name: 'secondary2', nodes: ['0', 'SEC_NEG'], inductance: 1000e-6 }       // 1mH
        ],
        couplingMatrix: [[1.0, 0.9999, 0.9999], [0.9999, 1.0, -1.0], [0.9999, -1.0, 1.0]]
    });

    // --- 5. 實例化 MCP 求解器 ---
    console.log('� 最終測試：無二極管直接測量次級電壓 + 1:1匝比 + gmin=1e-6');
    const mcpSolver = createMCPTransientAnalysis({ debug: true, gmin: 1e-6 });
    const result = new TransientResult();
   
    // 【步驟1修改】用固定200kHz進行開環測試
    const F_TEST = 200e3;
    const PERIOD_TEST = 1 / F_TEST;
    console.log(`🧪 開環測試：固定頻率 ${F_TEST/1000}kHz，週期 ${PERIOD_TEST*1e6}μs`);

    // 🔍 LLC電路阻抗匹配診斷:
    console.log('\\n🔍 LLC電路阻抗匹配診斷:');
    
    // 運行瞬態分析 - 早期退出以便調試
    console.log('\\n⏱️ 開始瞬態分析 (gmin=1e-6測試)...');
    const totalSteps = 10;  // 進一步減少到10步
    const rloadValue = LOAD_100;
    const cOutValue = 1000e-6;
    console.log(`   負載阻抗: ${rloadValue}Ω`);
    console.log(`   輸出電容: ${(cOutValue * 1e6).toFixed(1)}µF`);
    
    // 🔥 計算特徵阻抗
    const Lr = 50e-6;  // 50µH
    const Cr = 12e-9;  // 12nF
    const Z0 = Math.sqrt(Lr / Cr);  // 特徵阻抗
    const fr = 1 / (2 * Math.PI * Math.sqrt(Lr * Cr));  // 諧振頻率
    const expectedOutputZ = rloadValue / (TURNS_RATIO_TEST * TURNS_RATIO_TEST);  // 反射阻抗
    console.log(`   諧振參數: fr=${(fr/1000).toFixed(1)}kHz, Z0=${Z0.toFixed(1)}Ω`);
    console.log(`   負載阻抗: ${rloadValue}Ω, 反射阻抗: ${expectedOutputZ.toFixed(1)}Ω`);
    console.log(`   阻抗匹配比: Z0/Zreflected=${(Z0/expectedOutputZ).toFixed(2)} (理想約為1)`);

    const components = [
        new VoltageSource('Vin', ['IN', '0'], VIN),
        
        // 【步驟1修改】移除MOSFET，用理想脈衝電壓源替換
        // 新增理想半橋驅動源：在0V和900V之間切換
        new VoltageSource('V_HB_Driver', ['SW_MID', '0'], {
            type: 'PULSE',
            v1: 0,          // 低電平
            v2: VIN,        // 高電平 (900V)
            td: 0,          // 延遲
            tr: 10e-9,      // 上升時間 (10ns)
            tf: 10e-9,      // 下降時間 (10ns)
            pw: PERIOD_TEST / 2 - 20e-9, // 脈寬 (接近50%佔空比，留邊緣)
            per: PERIOD_TEST // 週期
        }),
        
        new Inductor('Lr', ['SW_MID', 'RES'], 50e-6),
        new Capacitor('Cr', ['RES', 'PRI_POS'], 12e-9, { ic: 100 }), // 諧振電容（恢復初始電壓）
        
        ...transformer.getComponents(),

        // 🔧 恢復完整整流器：現在有足夠的驅動電壓（1.97V > 0.7V）
        createMCPDiode('D1', 'SEC_POS', 'VOUT', { Vf: 0.7 }),
        createMCPDiode('D2', 'SEC_NEG', 'VOUT', { Vf: 0.7 }),
        
        new Capacitor('Cout', ['VOUT', '0'], 1000e-6, { ic: 48 }), // 恢復輸出電容，設定初始電壓
        new Resistor('Rload', ['VOUT', '0'], LOAD_100)  // 恢復標準負載
    ];
    
    // --- 6. 執行步進式模擬 ---
    const simParams = {
        startTime: 0,
        stopTime: 0.001,    // 測試 1ms 仿真
        timeStep: 2e-7,     // 使用 0.2μs 步長
    };
    
    try {
        console.log('⏳ 正在計算初始 DC 工作點...');
        await mcpSolver.computeInitialConditions(components, result, simParams);
        console.log('✅ 初始條件計算完成。');
    } catch (e) {
        console.error('❌ DC 工作點計算失敗:', e.message);
        console.log('⚠️ 將使用簡化初始條件（全零）繼續...');
        
        try {
            await mcpSolver.computeSimplifiedInitialConditions(components, result, simParams);
        } catch (e2) {
            console.log('使用默認初始條件繼續...');
        }
    }

    let currentTime = simParams.startTime;
    let stepCount = 0;
    console.log('⏳ 開始執行暫態分析...');
    
    while (currentTime < simParams.stopTime) {
        console.log(`🚀 Entering step ${stepCount}: time=${currentTime.toFixed(6)}s`);
        
        // 【步驟1修改】在迴圈開始處添加詳細電壓日誌
        if (stepCount < 10) { // 只看前10步的詳細日誌
            console.log(`--- STEP ${stepCount} START ---`);
            const nodesToLog = ['SW_MID', 'RES', 'PRI_POS', 'SEC_POS', 'SEC_NEG', 'VOUT'];  // 恢復VOUT監控
            for (const node of nodesToLog) {
                const voltage = result.nodeVoltages.get(node)?.slice(-1)[0] || 0;
                console.log(`   V(${node}) = ${voltage.toFixed(6)}V`);
            }
            // 特別關注諧振電容電壓
            const vRes = result.nodeVoltages.get('RES')?.slice(-1)[0] || 0;
            const vPriPos = result.nodeVoltages.get('PRI_POS')?.slice(-1)[0] || 0;
            console.log(`   V(Cr) = V(RES)-V(PRI_POS) = ${(vRes - vPriPos).toFixed(6)}V`);
        }

        // 🔥 關鍵補充：更新伴隨模型 (電容、電感)
        console.log(`🔍 Step ${stepCount}: 調用 updateCompanionModels, t=${currentTime.toFixed(6)}s, timeStep=${simParams.timeStep}`);
        mcpSolver.updateCompanionModels(components, simParams.timeStep);
        console.log(`✅ updateCompanionModels 調用完成`);

        console.log(`🔄 Calling MCP solver for step ${stepCount}...`);
        // 🔥 传递时间步长给求解器
        mcpSolver.currentTimeStep = simParams.timeStep; 
        const success = await mcpSolver.solveTimeStep(components, currentTime, result);
        if (!success) {
            console.error(`❌ 模擬在 t=${currentTime}s 失敗！`);
            break;
        }
        
        // 🔍 顯示求解結果 - 專注於變壓器和整流器
        if (stepCount < 100 && stepCount % 5 === 0) {  // 每5步顯示一次結果
            console.log(`📊 Step ${stepCount} 求解結果:`);
            console.log(`   節點電壓 Map 大小: ${result.nodeVoltages?.size || 0}`);
            if (result.nodeVoltages) {
                const voltageMap = result.nodeVoltages;
                console.log(`   關鍵節點電壓:`);
                const keyNodes = ['IN', 'SW_MID', 'RES', 'PRI_POS', 'SEC_POS', 'SEC_NEG', 'VOUT'];
                for (const node of keyNodes) {
                    const voltages = voltageMap.get(node);
                    const voltage = voltages?.slice(-1)[0] || 0;
                    console.log(`     ${node}: ${voltage.toFixed(6)}V`);
                }
                
                // 計算變壓器比值
                const priPos = voltageMap.get('PRI_POS')?.slice(-1)[0] || 0;
                const swMid = voltageMap.get('SW_MID')?.slice(-1)[0] || 0;
                const secPos = voltageMap.get('SEC_POS')?.slice(-1)[0] || 0;
                const secNeg = voltageMap.get('SEC_NEG')?.slice(-1)[0] || 0;
                const secDiff = secPos - secNeg;
                const priVoltage = priPos - swMid;  // 真正的一次線圈電壓
                console.log(`   🔍 變壓器電壓分析:`);
                console.log(`     一次線圈電壓 (PRI_POS-SW_MID): ${priVoltage.toFixed(6)}V`);
                console.log(`     次線圈差壓 (SEC_POS-SEC_NEG): ${secDiff.toFixed(6)}V`);
                if (Math.abs(priVoltage) > 1e-6) {
                    const turnsRatio = Math.abs(secDiff / priVoltage);
                    console.log(`     電壓轉換比: ${turnsRatio.toFixed(3)} (理論值: ${TURNS_RATIO_TEST})`);
                }
                
                // 🔥 新增：詳細電流路徑分析
                console.log(`   🔍 電流路徑診斷:`);
                if (result.currents) {
                    const lrCurrent = result.currents['I_Lr'] || 0;
                    const t1PrimaryCurrent = result.currents['I_T1_primary'] || 0; 
                    const t1SecondaryCurrent = result.currents['I_T1_secondary'] || 0;
                    console.log(`     Lr電流: ${lrCurrent.toExponential(3)}A`);
                    console.log(`     T1一次電流: ${t1PrimaryCurrent.toExponential(3)}A`);
                    console.log(`     T1次線電流: ${t1SecondaryCurrent.toExponential(3)}A`);
                }
                
                // 🔥 新增：輸出電路深度診斷
                console.log(`\\n🔍 輸出電路深度診斷:`);
                
                // 檢查變壓器次級電壓極性
                console.log(`   📊 變壓器次級分析:`);
                console.log(`     SEC_POS-SEC_NEG差值: ${secDiff.toFixed(6)}V`);
                console.log(`     次級電壓極性: ${secDiff > 0 ? '正向' : '負向'}`);
                
                // 檢查整流路徑
                const vout = voltageMap.get('VOUT')?.slice(-1)[0] || 0;
                console.log(`   📊 整流路徑分析:`);
                console.log(`     SEC_POS到VOUT壓降: ${(secPos - vout).toFixed(6)}V`);
                console.log(`     SEC_NEG到GND壓降: ${secNeg.toFixed(6)}V`);
                
                // 計算理論整流條件 (中心抽頭設計: D1, D2)
                const d1Forward = secPos - vout;  // D1正向壓降需求 (SEC_POS -> VOUT)
                const d2Forward = secNeg - vout;  // D2正向壓降需求 (SEC_NEG -> VOUT) 
                console.log(`   📊 二極管導通條件 (中心抽頭設計):`);
                console.log(`     D1需要正向電壓 (SEC_POS→VOUT): ${d1Forward.toFixed(6)}V ${d1Forward > 0.7 ? '✅' : '❌'}`);
                console.log(`     D2需要正向電壓 (SEC_NEG→VOUT): ${d2Forward.toFixed(6)}V ${d2Forward > 0.7 ? '✅' : '❌'}`);
            }
            
            if (result.currents) {
                // 🔥 重點關注整流二極管電流 (中心抽頭設計: D1, D2)
                console.log(`   📊 整流器電流分析 (中心抽頭):`);
                const d1Current = result.currents['D1_Id'] || 0;
                const d2Current = result.currents['D2_Id'] || 0;
                console.log(`     D1電流 (SEC_POS→VOUT): ${d1Current.toExponential(3)}A ${Math.abs(d1Current) > 1e-9 ? '🟢導通' : '🔴截止'}`);
                console.log(`     D2電流 (SEC_NEG→VOUT): ${d2Current.toExponential(3)}A ${Math.abs(d2Current) > 1e-9 ? '🟢導通' : '🔴截止'}`);
                console.log(`     總整流電流: ${(d1Current + d2Current).toExponential(3)}A`);
            }
        }
        
        console.log(`✅ Step ${stepCount} completed successfully`);
        currentTime += simParams.timeStep;
        stepCount++;
        
        // Exit early for debugging
        if (stepCount >= 30) {  // 运行30步来观察完整切换周期
            console.log(`🛑 Early exit for debugging after ${stepCount} steps`);
            break;
        }

        if (stepCount % 5000 === 0) {
            const progress = (currentTime / simParams.stopTime) * 100;
            console.log(`   進度: ${progress.toFixed(1)}% (t = ${(currentTime * 1e3).toFixed(2)} ms)`);
        }
    }

    const totalEndTime = performance.now();
    console.log(`🏁 步驟1開環測試完成！總耗時: ${((totalEndTime - totalStartTime)/1000).toFixed(2)} 秒`);
    
    // --- 8. 處理並顯示結果 ---
    const findVoltageAt = (time) => {
        const timeVector = result.getTimeVector();
        if (timeVector.length === 0) return null;
        const closestIndex = timeVector.reduce((prev, curr, idx) => (Math.abs(curr - time) < Math.abs(timeVector[prev] - time) ? idx : prev), 0);
        return result.getVoltageVector('VOUT')[closestIndex];
    };

    console.log('\\n--- 步驟1結果摘要 (1800V驅動測試) ---');
    console.log(`最終 VOUT: ${findVoltageAt(currentTime)?.toFixed(3)}V`);
    console.log('🔧 電壓增加修復驗證:');
    console.log('  - 如果VOUT > 20V: 修復成功，二極管正常導通');
    console.log('  - 如果VOUT = 0V: 仍有其他問題需要進一步分析');
    console.log('  - 預期次級電壓: ~2V (足夠驅動0.7V二極管)');
    console.log('------------------');
}

// 執行模擬
runLLCSimulation().catch(err => {
    console.error('步驟1測試過程中發生嚴重錯誤:', err);
});