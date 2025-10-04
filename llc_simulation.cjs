/**
 * LLC 諧振轉換器仿真腳本 - 基於成功的實現
 * 使用 AkingSPICE MCP 引擎
 */

const path = require('path');
const srcDir = path.join(__dirname, 'src');

// 導入 AkingSPICE 組件
const { VoltageSource } = require(path.join(srcDir, 'components/sources.js'));
const { Inductor } = require(path.join(srcDir, 'components/inductor.js'));  
const { Capacitor } = require(path.join(srcDir, 'components/capacitor.js'));
const { Resistor } = require(path.join(srcDir, 'components/resistor.js'));
const { Diode_MCP } = require(path.join(srcDir, 'components/diode_mcp.js'));
const { MultiWindingTransformer } = require(path.join(srcDir, 'components/transformer.js'));
const { MCPTransientAnalysis } = require(path.join(srcDir, 'analysis/transient_mcp.js'));

console.log('🔋 AkingSPICE LLC 諧振轉換器仿真 🔋');
console.log('目標: 400V DC → 48V DC, 真正的 LLC 拓撲');

// LLC 諧振轉換器參數
const VIN = 400.0;                 // 輸入電壓 (V)
const VOUT_TARGET = 48.0;          // 目標輸出電壓 (V)
const POUT_TARGET = 100.0;         // 目標輸出功率 (W)
const RL = (VOUT_TARGET ** 2) / POUT_TARGET; // 負載電阻

// 諧振網路參數 - 針對 48V 輸出優化
const Lr = 59.7e-6;               // 諧振電感 (H) 
const Cr = 47e-9;                 // 諧振電容 (F)
const Lm = 477.7e-6;              // 激磁電感 (H)

// 諧振頻率計算
const Fr = 1 / (2 * Math.PI * Math.sqrt(Lr * Cr));
console.log(`📊 諧振頻率: ${(Fr/1000).toFixed(1)} kHz`);

// 切換頻率設定
const Fs = 100e3;                 // 切換頻率 100kHz
const PERIOD = 1 / Fs;
const DUTY = 0.45;                // 佔空比 45%
const DEAD_TIME = 50e-9;          // 死區時間
console.log(`🔄 切換頻率: ${(Fs/1000).toFixed(1)} kHz (fs/fr = ${(Fs/Fr).toFixed(3)})`);

// 變壓器參數
const N_RATIO = 4.4;              // 匝數比 (Pri:Sec)
console.log(`🔄 變壓器匝數比: ${N_RATIO}:1`);

// 仿真參數
const TSTOP = 5e-3;               // 仿真時間 5ms
const TSTEP = PERIOD / 100;       // 時間步長
console.log(`⏱️  仿真設定: ${TSTOP*1000}ms, 步長 ${TSTEP*1e9}ns`);

/**
 * 建立電路組件
 */
function createCircuit() {
    const components = [];
    
    // === 電源 ===
    components.push(new VoltageSource('Vin', ['VIN', 'GND'], VIN));
    
    // === 半橋驅動 ===
    // 高側開關驅動信號 (0V -> VIN)
    components.push(new VoltageSource('VG_H', ['VIN', 'SW'], {
        type: 'PULSE',
        v1: 0,                    // 低電平
        v2: VIN,                  // 高電平
        td: DEAD_TIME,            // 延遲
        tr: 10e-9,                // 上升時間
        tf: 10e-9,                // 下降時間  
        pw: PERIOD * DUTY - DEAD_TIME,  // 脈寬
        per: PERIOD               // 週期
    }));
    
    // 低側開關驅動信號 (SW -> GND)
    components.push(new VoltageSource('VG_L', ['SW', 'GND'], {
        type: 'PULSE',
        v1: 0,                    // 低電平
        v2: VIN,                  // 高電平
        td: PERIOD * 0.5 + DEAD_TIME, // 相位延遲
        tr: 10e-9,                // 上升時間
        tf: 10e-9,                // 下降時間
        pw: PERIOD * DUTY - DEAD_TIME,  // 脈寬
        per: PERIOD               // 週期
    }));
    
    // === 諧振網路 ===
    components.push(new Inductor('Lr', ['SW', 'RES'], Lr));
    components.push(new Capacitor('Cr', ['RES', 'PRI'], Cr));
    
    // === 變壓器 ===
    const transformer = new MultiWindingTransformer('T1', {
        numWindings: 3,
        couplingMatrix: [
            [1.0,  0.95, -0.95],   // PRI 繞組
            [0.95,  1.0,  -1.0],   // SEC_TOP 繞組  
            [-0.95, -1.0,  1.0]    // SEC_BOTTOM 繞組
        ],
        turnsRatios: [1.0, 1/N_RATIO, 1/N_RATIO],
        inductances: [Lm, Lm/(N_RATIO**2), Lm/(N_RATIO**2)]
    });
    
    transformer.connectWinding(0, ['PRI', 'GND']);        // 初級繞組
    transformer.connectWinding(1, ['SEC_TOP', 'SEC_CT']); // 次級上半段
    transformer.connectWinding(2, ['SEC_CT', 'SEC_BOT']); // 次級下半段
    components.push(transformer);
    
    // === 整流器 (中心抽頭) ===
    components.push(new Diode_MCP('D1', ['SEC_TOP', 'VOUT'], { Is: 1e-12, n: 1.0 }));
    components.push(new Diode_MCP('D2', ['SEC_BOT', 'VOUT'], { Is: 1e-12, n: 1.0 }));
    
    // === 輸出濾波 ===
    components.push(new Capacitor('Co', ['VOUT', 'GND'], 100e-6, { ic: 48 }));
    components.push(new Resistor('RL', ['VOUT', 'GND'], RL));
    
    // === 測量電阻 ===
    components.push(new Resistor('R_sense', ['VOUT', 'VOUT_MEAS'], 1e-6));
    
    console.log(`✅ 電路建立完成: ${components.length} 個組件`);
    return components;
}

/**
 * 執行仿真
 */
async function runSimulation() {
    try {
        console.log('\n🚀 開始仿真...');
        
        const components = createCircuit();
        const analysis = new MCPTransientAnalysis(components, {
            tstop: TSTOP,
            tstep: TSTEP,
            gmin: 1e-12
        });
        
        const result = await analysis.run();
        
        if (result && result.success) {
            console.log('\n✅ 仿真完成!');
            
            // 輸出電壓測量
            const vout_samples = result.getNodeVoltages('VOUT_MEAS');
            if (vout_samples && vout_samples.length > 0) {
                // 計算穩態值 (取後半段平均)
                const stabilized = vout_samples.slice(Math.floor(vout_samples.length * 0.7));
                const vout_avg = stabilized.reduce((a, b) => a + b, 0) / stabilized.length;
                const vout_max = Math.max(...stabilized);
                const vout_min = Math.min(...stabilized);
                const ripple = ((vout_max - vout_min) / vout_avg * 100);
                
                console.log(`\n📊 輸出性能分析:`);
                console.log(`   輸出電壓 (平均): ${vout_avg.toFixed(2)} V`);
                console.log(`   目標電壓: ${VOUT_TARGET} V`);
                console.log(`   電壓精度: ${((vout_avg/VOUT_TARGET)*100).toFixed(1)}%`);
                console.log(`   電壓紋波: ${ripple.toFixed(1)}%`);
                console.log(`   輸出功率: ${(vout_avg**2/RL).toFixed(1)} W`);
                
                if (Math.abs(vout_avg - VOUT_TARGET) < 5) {
                    console.log(`\n🎉 成功! 輸出電壓在目標範圍內!`);
                } else {
                    console.log(`\n⚠️  電壓需要調整，建議修改匝數比或頻率`);
                }
            } else {
                console.log(`\n❌ 無法取得輸出電壓數據`);
            }
        } else {
            console.log(`\n❌ 仿真失敗`);
        }
        
    } catch (error) {
        console.error(`\n💥 仿真錯誤:`, error.message);
    }
}

// 執行仿真
runSimulation().catch(console.error);
import { performance } from 'perf_hooks';

// --- 主模擬函數 ---
async function runLLCSimulation() {
    const totalStartTime = performance.now();
    console.log('🚀 開始 LLC 轉換器模擬 (使用 MCP 分析引擎)...');

    // --- 3. 定義電路與模擬參數 ---
    const VIN = 900;
    const VOUT_REF = 48;
    const F_NOMINAL = 200e3;
    const LOAD_100 = 2.5;
    const LOAD_70 = 3.57;

    // --- 4. 創建電路元件 ---
    // 🔥 關鍵拓撲修正：修正LLC諧振迴路完整路徑
    // 🔥 匝比測試：從降壓到升壓掃描
    const TURNS_RATIO_TEST = 2.0;  // 測試温和的1:2升壓匝比
    const L_PRIMARY = 250e-6;
    const L_SECONDARY = L_PRIMARY * TURNS_RATIO_TEST * TURNS_RATIO_TEST;  // 升壓匝比
    
    console.log(`🔍 測試匝比: 1:${TURNS_RATIO_TEST} (升壓), L_primary=${L_PRIMARY*1e6}µH, L_secondary=${L_SECONDARY*1e6}µH`);
    console.log(`🔍 耦合系數: k=0.999, 相互電感 M=√(L1*L2)*k=${Math.sqrt(L_PRIMARY*L_SECONDARY)*0.999*1e6}µH`);
    
    const transformer = new MultiWindingTransformer('T1', {
        windings: [
            // 主線圈完成諧振迴路：PRI_POS → T1_primary → SW_MID (通過M_L到地)
            { name: 'primary', nodes: ['PRI_POS', 'SW_MID'], inductance: L_PRIMARY },
            // 🔥 中心抽頭次級：SEC_POS和SEC_NEG相對於中心點（接地）
            { name: 'secondary', nodes: ['SEC_POS', '0'], inductance: L_SECONDARY/2 },  // 上半繞組
            { name: 'secondary2', nodes: ['0', 'SEC_NEG'], inductance: L_SECONDARY/2 }   // 下半繞組
        ],
        couplingMatrix: [[1.0, 0.9999, 0.9999], [0.9999, 1.0, -1.0], [0.9999, -1.0, 1.0]]  // 提高耦合系數到接近理想值
    });

    const components = [
        new VoltageSource('Vin', ['IN', '0'], VIN),
        createNMOSSwitch('M_H', 'IN', 'SW_MID', 'GATE_H'),
        createNMOSSwitch('M_L', 'SW_MID', '0', 'GATE_L'),
        new Inductor('Lr', ['SW_MID', 'RES'], 50e-6),
        new Capacitor('Cr', ['RES', 'PRI_POS'], 12e-9, { ic: 100 }), // 較大初始電壓啟動振蕩
        
        ...transformer.getComponents(),

        // 🔥 移除手動添加的下拉電阻，現在由 Gmin 自動處理
        // new Resistor('R_pull_sw', ['SW_MID', '0'], 1e9),
        // new Resistor('R_pull_res', ['RES', '0'], 1e9),

        // 🔥 修正：中心抽頭整流器配置
        // 當SEC_POS>VOUT時，D1導通；當SEC_NEG>VOUT時，D2導通
        createMCPDiode('D1', 'SEC_POS', 'VOUT', { Vf: 0.7 }),
        createMCPDiode('D2', 'SEC_NEG', 'VOUT', { Vf: 0.7 }),
        // 移除多餘的D3,D4，中心抽頭直接接地
        new Capacitor('Cout', ['VOUT', '0'], 1000e-6), // 輸出電容（無初始電壓）
        new Resistor('Rload', ['VOUT', '0'], LOAD_100)
    ];
    
    // --- 5. 實例化 MCP 求解器和控制器 ---
    // 🔥 關鍵修正：傳遞 gmin 選項給 MCPTransientAnalysis
    const mcpSolver = createMCPTransientAnalysis({ debug: true, gmin: 1e-9 }); // 重新啟用調試以診斷問題
    const result = new TransientResult();

    const controller = new LLCController({
        vRef: VOUT_REF,
        nominalFreq: F_NOMINAL,
        minFreq: 150e3,
        maxFreq: 300e3,
        deadTime: 100e-9,
        kp: 0.05,
        ki: 200,
    });

    // --- 6. 執行步進式模擬 (手動迴圈) ---
    const simParams = {
        startTime: 0,
        stopTime: 0.001,    // 先測試 1ms 仿真
        timeStep: 2e-7,     // 使用 0.2μs 步長提供足夠的諧振解析度 (谐振周期≈4.9μs)
    };
    
    // 🔥 診斷阻抗匹配問題
    console.log('\n🔍 LLC電路阻抗匹配診斷:');
    const rload = components.find(c => c.name === 'Rload');
    const cOut = components.find(c => c.name === 'Cout');
    console.log(`   負載阻抗: ${rload?.value || 'N/A'}Ω`);
    console.log(`   輸出電容: ${(cOut?.value * 1e6).toFixed(1) || 'N/A'}µF`);
    
    // 🔥 計算特征阻抗
    const Lr = 50e-6;  // 50µH
    const Cr = 12e-9;  // 12nF
    const Z0 = Math.sqrt(Lr / Cr);  // 特征阻抗
    const fr = 1 / (2 * Math.PI * Math.sqrt(Lr * Cr));  // 諧振頻率
    const expectedOutputZ = (rload?.value || 0) / (TURNS_RATIO_TEST * TURNS_RATIO_TEST);  // 反射阻抗
    console.log(`   諧振參數: fr=${(fr/1000).toFixed(1)}kHz, Z0=${Z0.toFixed(1)}Ω`);
    console.log(`   負載阻抗: ${rload?.value || 0}Ω, 反射阻抗: ${expectedOutputZ.toFixed(1)}Ω`);
    console.log(`   阻抗匹配比: Z0/Zreflected=${(Z0/expectedOutputZ).toFixed(2)} (理想約為1)`);
    
    try {
        console.log('\n⏳ 正在計算初始 DC 工作點...');
        await mcpSolver.computeInitialConditions(components, result, simParams);
        console.log('✅ 初始條件計算完成。');
    } catch (e) {
        console.error('❌ DC 工作點計算失敗:', e.message);
        console.log('⚠️ 將使用簡化初始條件（全零）繼續...');
        
        // 🔥 嘗試手動設置初始能量
        console.log('🚀 嘗試手動注入初始諧振能量...');
        const crComponent = components.find(c => c.name === 'Cr');
        if (crComponent && crComponent.setInitialVoltage) {
            crComponent.setInitialVoltage(100);  // 設置100V初始電壓
            console.log('   ✅ 諧振電容初始電壓設為100V');
        }
        
        try {
            await mcpSolver.computeSimplifiedInitialConditions(components, result, simParams);
        } catch (e2) {
            console.log('使用默認初始條件繼續...');
        }
    }

    let currentTime = simParams.startTime;
    let stepCount = 0;
    let loadChanged = false;
    console.log('⏳ 開始執行暫態分析...');
    
    while (currentTime < simParams.stopTime) {
        console.log(`🚀 Entering step ${stepCount}: time=${currentTime.toFixed(6)}s`);
        
        // 🔥 獲取當前 VOUT，初始時應為 0V
        const vout = result.nodeVoltages.get('VOUT')?.slice(-1)[0] || 0;
        
        console.log(`� VOUT reading: ${vout?.toFixed(3)}V (from ${result.nodeVoltages.get('VOUT')?.length || 0} samples)`);
        
        const gateStates = controller.update(vout || 0, currentTime);
        console.log(`🎮 Controller output: M_H=${gateStates['M_H']}, M_L=${gateStates['M_L']}`);
        
        
        const mosH = components.find(c => c.name === 'M_H');
        const mosL = components.find(c => c.name === 'M_L');
        
        console.log(`🔧 Setting MOSFET states: M_H found=${!!mosH}, M_L found=${!!mosL}`);
        
        mosH?.setGateState(gateStates['M_H']);
        mosL?.setGateState(gateStates['M_L']);
        
        console.log(`✅ MOSFET gate states set for step ${stepCount}`);
        
        // 【步驟1修改】暫時註解負載變動以簡化測試
        /*
        if (currentTime > 0.25 && !loadChanged) {
            const rload = components.find(c => c.name === 'Rload');
            if (rload) {
                console.log(`\n--- 負載變動 @ t=${currentTime.toFixed(3)}s: ${rload.value.toFixed(2)}Ω -> ${LOAD_70.toFixed(2)}Ω ---\n`);
                rload.value = LOAD_70;
                rload.updateTemperatureCoefficient();
            }
            loadChanged = true;
        }
        */

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
        if (stepCount < 100 && stepCount % 5 === 0) {  // 每5步顯示一次結果以更細致觀察
            console.log(`📊 Step ${stepCount} 求解結果:`);
            console.log(`   節點電壓 Map 大小: ${result.nodeVoltages?.size || 0}`);
            if (result.nodeVoltages) {
                const voltageMap = result.nodeVoltages;
                console.log(`   關鍵節點電壓:`);
                // 專注於變壓器和整流器
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
                    const mhCurrent = result.currents['M_H_Ids'] || 0;
                    const mlCurrent = result.currents['M_L_Ids'] || 0;
                    console.log(`     Lr電流: ${lrCurrent.toExponential(3)}A`);
                    console.log(`     T1一次電流: ${t1PrimaryCurrent.toExponential(3)}A`);
                    console.log(`     T1次線電流: ${t1SecondaryCurrent.toExponential(3)}A`);
                    console.log(`     M_H電流: ${mhCurrent.toExponential(3)}A`);
                    console.log(`     M_L電流: ${mlCurrent.toExponential(3)}A`);
                }
                
                // 🔥 新增：輸出電路深度診斷
                console.log(`\n🔍 輸出電路深度診斷:`);
                
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
                console.log(`📊 Step ${stepCount} 支路電流:`);
                for (const [branch, current] of Object.entries(result.currents)) {
                    if (Math.abs(current) > 1e-12) {  // 降低閾值以捕捉微小電流
                        console.log(`   ${branch}: ${current.toExponential(3)}A`);
                    }
                }
                
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
    console.log(`🏁 模擬完成！總耗時: ${((totalEndTime - totalStartTime)/1000).toFixed(2)} 秒`);
    
    // --- 8. 處理並顯示結果 ---
    // (此部分不變，保持原樣)
    const findVoltageAt = (time) => {
        const timeVector = result.getTimeVector();
        if (timeVector.length === 0) return null;
        const closestIndex = timeVector.reduce((prev, curr, idx) => (Math.abs(curr - time) < Math.abs(timeVector[prev] - time) ? idx : prev), 0);
        return result.getVoltageVector('VOUT')[closestIndex];
    };

    console.log('\n--- 結果摘要 ---');
    console.log(`啟動後 (t=0.05s) VOUT: \t${findVoltageAt(0.05)?.toFixed(3)}V`);
    console.log(`負載變動前 (t=0.249s) VOUT: \t${findVoltageAt(0.249)?.toFixed(3)}V`);
    console.log(`負載變動後 (t=0.251s) VOUT: \t${findVoltageAt(0.251)?.toFixed(3)}V`);
    console.log(`穩定後 (t=0.45s) VOUT: \t${findVoltageAt(0.45)?.toFixed(3)}V`);
    console.log('------------------');

    // ... 匯出 CSV 的程式碼 ...
}

// 執行模擬
runLLCSimulation().catch(err => {
    console.error('模擬過程中發生嚴重錯誤:', err);
});