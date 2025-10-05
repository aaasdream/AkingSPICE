/**
 * Buck 轉換器網表診斷和驗證腳本
 * 
 * 目標：
 * 1. 驗證網表解析是否正確
 * 2. 檢查 MOSFET 開關操作
 * 3. 檢查二極體導通/截止行為
 * 4. 驗證電感電容的積分準確性
 * 5. 分析整體電路行為
 */

import { AkingSPICE, NetlistParser, StepwiseSimulator } from './src/index.js';
import { readFile, writeFile } from 'fs/promises';

// 你提供的 Buck 轉換器網表
const buckConverterNetlist = `
* Buck Converter Example Netlist

* --- 元件定義 (Component Definitions) ---

* 輸入電壓源 (Input Voltage Source)
* 從 1 號節點到 0 號節點 (GND)，提供 24V 的直流電壓
VIN 1 0 DC 24V

* MOSFET 開關 (MOSFET Switch)
* M1: Drain(1) Gate(3) Source(2) 
M1 1 3 2 NMOS Ron=10m Vth=2V

* 續流二極體 (Freewheeling Diode)
* D1: Anode(0) Cathode(2) 
D1 0 2 Vf=0.7V Ron=10m

* 電感 (Inductor)
* L1: 從 2 號節點到 4 號節點，電感值為 100uH
L1 2 4 100uH

* 輸出電容 (Output Capacitor)
* C1: 從 4 號節點到 0 號節點，電容值為 220uF
C1 4 0 220uF

* 負載電阻 (Load Resistor)
* RLOAD: 從 4 號節點到 0 號節點，電阻值為 5 Ohm
RLOAD 4 0 5

* --- 驅動訊號 (Driving Signal) ---

* 產生脈波訊號 (Pulse Signal) 來驅動 MOSFET
* VDRIVE: 從 3 號節點到 0 號節點
* PULSE(V_initial V_pulsed T_delay T_rise T_fall T_pulse_width T_period)
* 初始電壓 0V，脈波電壓 15V，延遲 0ns，上升/下降時間 10ns
* 脈波寬度 5us，週期 10us (即 100kHz 開關頻率，50% 工作週期)
VDRIVE 3 0 PULSE(0 15 0 10n 10n 5u 10u)

* --- 模擬指令 (Simulation Commands) ---

* 暫態分析 (Transient Analysis)
* .TRAN T_step T_stop
* 從 0 秒模擬到 100us，每 0.1us 儲存一次數據
.TRAN 0.1u 100u

* --- 結束 (End of Netlist) ---
.END
`;

/**
 * 診斷步驟 1：網表解析驗證
 */
async function step1_verifyNetlistParsing() {
    console.log('='.repeat(80));
    console.log('🔍 步驟 1：網表解析驗證');
    console.log('='.repeat(80));

    try {
        const parser = new NetlistParser();
        const circuit = parser.parse(buckConverterNetlist);
        
        console.log('✅ 網表解析成功！');
        console.log(`   - 元件總數: ${circuit.components.length}`);
        console.log(`   - 分析指令: ${circuit.analyses.length}`);
        console.log(`   - 解析錯誤: ${circuit.stats.errors.length}`);

        // 詳細檢查每個元件
        console.log('\n📋 元件詳細資訊：');
        circuit.components.forEach((comp, i) => {
            console.log(`${i+1}. ${comp.name} (${comp.constructor.name})`);
            console.log(`   節點: [${comp.nodes.join(', ')}]`);
            
            if (comp.value !== undefined) {
                console.log(`   數值: ${comp.value}`);
            }
            
            if (comp.sourceConfig) {
                console.log(`   源配置: ${comp.sourceConfig.type}`);
                if (comp.sourceConfig.type === 'PULSE') {
                    const p = comp.sourceConfig.params;
                    console.log(`   PULSE參數: V1=${p.v1}, V2=${p.v2}, TD=${p.td}, TR=${p.tr}, TF=${p.tf}, PW=${p.pw}, PER=${p.per}`);
                }
            }
            
            if (comp.Ron !== undefined) {
                console.log(`   導通電阻: ${comp.Ron}Ω`);
            }
            if (comp.Vth !== undefined) {
                console.log(`   閾值電壓: ${comp.Vth}V`);
            }
            if (comp.Vf !== undefined) {
                console.log(`   導通電壓: ${comp.Vf}V`);
            }
            console.log('');
        });

        // 檢查解析錯誤
        if (circuit.stats.errors.length > 0) {
            console.log('⚠️ 解析錯誤：');
            circuit.stats.errors.forEach(err => {
                console.log(`   行 ${err.line}: ${err.error}`);
                console.log(`   內容: "${err.content}"`);
            });
        }

        return circuit;

    } catch (error) {
        console.error('❌ 網表解析失敗:', error.message);
        console.error(error.stack);
        return null;
    }
}

/**
 * 診斷步驟 2：MOSFET 開關行為測試
 */
async function step2_testMOSFETSwitching(circuit) {
    console.log('='.repeat(80));
    console.log('🔌 步驟 2：MOSFET 開關行為測試');
    console.log('='.repeat(80));

    // 找到 MOSFET 和驅動源
    const mosfet = circuit.components.find(c => c.name === 'M1');
    const vdrive = circuit.components.find(c => c.name === 'VDRIVE');
    
    if (!mosfet) {
        console.error('❌ 找不到 MOSFET M1');
        return false;
    }
    
    if (!vdrive) {
        console.error('❌ 找不到驅動源 VDRIVE');
        return false;
    }

    console.log('✅ 找到元件：');
    console.log(`   MOSFET: ${mosfet.name} - 節點 [${mosfet.nodes.join(', ')}]`);
    console.log(`   驅動源: ${vdrive.name} - 節點 [${vdrive.nodes.join(', ')}]`);

    // 測試 PWM 波形
    console.log('\n🌊 PWM 波形測試（前 20µs）：');
    const testTimes = [];
    for (let t = 0; t <= 20e-6; t += 1e-6) {
        testTimes.push(t);
    }

    testTimes.forEach(t => {
        const vgate = vdrive.getValue(t);
        const isOn = vgate > mosfet.Vth;
        console.log(`t=${(t*1e6).toFixed(1)}µs: Vgate=${vgate.toFixed(1)}V ${isOn ? '🟢 ON' : '🔴 OFF'}`);
    });

    // 檢查開關頻率
    const period = 10e-6; // 10µs 週期
    const dutyCycle = 5e-6 / period; // 5µs / 10µs = 50%
    console.log(`\n📊 預期特性：`);
    console.log(`   開關頻率: ${(1/period/1000).toFixed(0)} kHz`);
    console.log(`   工作週期: ${(dutyCycle*100).toFixed(1)}%`);
    console.log(`   閾值電壓: ${mosfet.Vth}V`);

    return true;
}

/**
 * 診斷步驟 3：二極體行為驗證
 */
async function step3_testDiodeBehavior(circuit) {
    console.log('='.repeat(80));
    console.log('🔋 步驟 3：二極體行為驗證');
    console.log('='.repeat(80));

    const diode = circuit.components.find(c => c.name === 'D1');
    
    if (!diode) {
        console.error('❌ 找不到二極體 D1');
        return false;
    }

    console.log('✅ 找到二極體：');
    console.log(`   名稱: ${diode.name}`);
    console.log(`   節點: [${diode.nodes.join(', ')}] (陽極到陰極)`);
    console.log(`   導通電壓: ${diode.Vf}V`);
    console.log(`   導通電阻: ${diode.Ron}Ω`);

    // 測試不同電壓下的二極體行為
    console.log('\n⚡ 二極體 I-V 特性測試：');
    const testVoltages = [-1.0, -0.5, 0.0, 0.3, 0.7, 1.0, 1.5];
    
    testVoltages.forEach(vd => {
        // 使用二極體的解析解
        const id = diode.computeAnalyticalCurrent ? diode.computeAnalyticalCurrent(vd) : 
                   (vd >= diode.Vf ? (vd - diode.Vf) / diode.Ron : 0);
        
        const state = id > 1e-12 ? '導通' : '截止';
        console.log(`   Vd=${vd.toFixed(1)}V → Id=${id.toExponential(3)}A (${state})`);
    });

    return true;
}

/**
 * 診斷步驟 4：執行完整電路模擬
 */
async function step4_runCircuitSimulation() {
    console.log('='.repeat(80));
    console.log('🚀 步驟 4：執行完整電路模擬');
    console.log('='.repeat(80));

    try {
        const solver = new AkingSPICE(buckConverterNetlist);
        console.log('✅ 求解器建立成功');

        // 執行暫態分析
        console.log('⏳ 執行暫態分析...');
        const result = await solver.runAnalysis('.TRAN 0.1u 50u');
        
        if (result.success) {
            console.log('✅ 模擬成功！');
            console.log(`   時間點數量: ${result.timePoints ? result.timePoints.length : '未知'}`);
            console.log(`   節點數量: ${result.nodeNames ? result.nodeNames.length : '未知'}`);
            
            // 分析結果
            if (result.data && result.data.length > 0) {
                console.log('\n📊 輸出電壓分析（最後10個時間點）：');
                const lastPoints = result.data.slice(-10);
                lastPoints.forEach((point, i) => {
                    const time = point.time || (result.timePoints ? result.timePoints[result.data.length - 10 + i] : i);
                    const vout = point['4'] || 0; // 節點 4 是輸出
                    console.log(`   t=${(time*1e6).toFixed(1)}µs: V(out)=${vout.toFixed(4)}V`);
                });

                // 計算平均輸出電壓（穩態）
                const steadyStateData = lastPoints.slice(-5);
                const avgVout = steadyStateData.reduce((sum, p) => sum + (p['4'] || 0), 0) / steadyStateData.length;
                console.log(`\n🎯 穩態輸出電壓: ${avgVout.toFixed(3)}V`);
                
                // 理論預期值
                const theoretical = 24 * 0.5; // Vin * D
                console.log(`   理論預期值: ${theoretical}V`);
                console.log(`   誤差: ${((avgVout - theoretical) / theoretical * 100).toFixed(2)}%`);
            }

            // 保存結果到文件
            await writeFile('buck_simulation_result.json', JSON.stringify(result, null, 2));
            console.log('💾 結果已保存到 buck_simulation_result.json');

            return result;

        } else {
            console.error('❌ 模擬失敗:', result.error);
            return null;
        }

    } catch (error) {
        console.error('❌ 模擬過程中出錯:', error.message);
        console.error(error.stack);
        return null;
    }
}

/**
 * 診斷步驟 5：步進模擬詳細分析
 */
async function step5_detailedStepwiseAnalysis(circuit) {
    console.log('='.repeat(80));
    console.log('🔬 步驟 5：步進模擬詳細分析');
    console.log('='.repeat(80));

    try {
        const simulator = new StepwiseSimulator({ debug: false });
        
        // 初始化模擬
        console.log('⚙️ 初始化步進模擬器...');
        const initialized = await simulator.initialize(circuit.components, {
            startTime: 0,
            stopTime: 30e-6,  // 30µs，涵蓋3個開關週期
            timeStep: 0.1e-6  // 100ns 步長
        });

        if (!initialized) {
            console.error('❌ 步進模擬器初始化失敗');
            return false;
        }

        console.log('✅ 初始化成功，開始詳細分析...');

        // 收集關鍵時間點的數據
        const analysisData = [];
        let stepCount = 0;
        const maxSteps = 300; // 最多運行300步

        while (stepCount < maxSteps) {
            const stepResult = await simulator.stepForward();
            
            if (!stepResult.success) {
                console.error(`❌ 步進失敗 at step ${stepCount}: ${stepResult.error}`);
                break;
            }

            const state = stepResult.state;
            const time = stepResult.time;

            // 記錄關鍵數據
            const dataPoint = {
                step: stepCount,
                time: time,
                nodeVoltages: {},
                elementStates: {}
            };

            // 節點電壓
            if (state.nodeVoltages) {
                for (const [node, voltage] of state.nodeVoltages) {
                    dataPoint.nodeVoltages[node] = voltage;
                }
            }

            // 元件狀態
            circuit.components.forEach(comp => {
                if (comp.name === 'M1') {
                    // MOSFET 狀態
                    const op = comp.getOperatingPoint ? comp.getOperatingPoint() : {};
                    dataPoint.elementStates.M1 = {
                        gateState: op.gateState,
                        vds: op.vds,
                        channelCurrent: op.channelCurrent,
                        bodyCurrent: op.bodyCurrent,
                        region: op.operatingRegion
                    };
                } else if (comp.name === 'D1') {
                    // 二極體狀態
                    const op = comp.getOperatingPoint ? comp.getOperatingPoint() : {};
                    dataPoint.elementStates.D1 = {
                        voltage: op.voltage,
                        current: op.current,
                        state: op.state,
                        conducting: op.conducting
                    };
                }
            });

            analysisData.push(dataPoint);

            // 每50步輸出一次詳細信息
            if (stepCount % 50 === 0 || stepCount < 10) {
                const vOut = dataPoint.nodeVoltages['4'] || 0;
                const vGate = dataPoint.nodeVoltages['3'] || 0;
                const vSw = dataPoint.nodeVoltages['2'] || 0;
                
                console.log(`步驟 ${stepCount.toString().padStart(3)}: t=${(time*1e6).toFixed(2)}µs`);
                console.log(`   V(gate)=${vGate.toFixed(2)}V, V(sw)=${vSw.toFixed(3)}V, V(out)=${vOut.toFixed(4)}V`);
                
                if (dataPoint.elementStates.M1) {
                    const m1 = dataPoint.elementStates.M1;
                    console.log(`   M1: ${m1.gateState ? 'ON' : 'OFF'}, Ich=${m1.channelCurrent?.toExponential(2) || 'N/A'}A`);
                }
                
                if (dataPoint.elementStates.D1) {
                    const d1 = dataPoint.elementStates.D1;
                    console.log(`   D1: ${d1.conducting ? '導通' : '截止'}, Id=${d1.current?.toExponential(2) || 'N/A'}A`);
                }
                console.log('');
            }

            stepCount++;
            
            if (stepResult.isComplete) {
                console.log('🏁 模擬完成');
                break;
            }
        }

        // 保存詳細分析數據
        await writeFile('buck_stepwise_analysis.json', JSON.stringify(analysisData, null, 2));
        console.log(`💾 詳細分析數據已保存 (${analysisData.length} 個數據點)`);

        // 分析 Buck 轉換器性能
        console.log('\n📈 Buck 轉換器性能分析：');
        const lastData = analysisData.slice(-50); // 最後50個點
        const vOutValues = lastData.map(d => d.nodeVoltages['4'] || 0);
        const avgVOut = vOutValues.reduce((a, b) => a + b, 0) / vOutValues.length;
        const ripple = Math.max(...vOutValues) - Math.min(...vOutValues);
        
        console.log(`   平均輸出電壓: ${avgVOut.toFixed(4)}V`);
        console.log(`   輸出紋波: ${(ripple * 1000).toFixed(2)}mV`);
        console.log(`   轉換效率: ${((avgVOut / 24) * 100).toFixed(1)}% (理論)`);

        return analysisData;

    } catch (error) {
        console.error('❌ 步進分析失敗:', error.message);
        console.error(error.stack);
        return null;
    }
}

/**
 * 主診斷流程
 */
async function runDiagnostics() {
    console.log('🔧 Buck 轉換器網表診斷開始...\n');

    // 步驟 1: 網表解析驗證
    const circuit = await step1_verifyNetlistParsing();
    if (!circuit) return;

    // 步驟 2: MOSFET 測試
    const mosfetOk = await step2_testMOSFETSwitching(circuit);
    if (!mosfetOk) return;

    // 步驟 3: 二極體測試
    const diodeOk = await step3_testDiodeBehavior(circuit);
    if (!diodeOk) return;

    // 步驟 4: 完整模擬
    const simResult = await step4_runCircuitSimulation();

    // 步驟 5: 詳細步進分析
    const stepwiseData = await step5_detailedStepwiseAnalysis(circuit);

    console.log('='.repeat(80));
    console.log('🎉 診斷完成！');
    console.log('='.repeat(80));
    
    if (simResult && stepwiseData) {
        console.log('✅ 所有測試步驟已完成');
        console.log('📁 結果文件:');
        console.log('   - buck_simulation_result.json (完整模擬結果)');
        console.log('   - buck_stepwise_analysis.json (詳細步進分析)');
    } else {
        console.log('⚠️ 某些測試步驟失敗，請檢查上述錯誤信息');
    }
}

// 執行診斷
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
    runDiagnostics().catch(console.error);
}

export { runDiagnostics };