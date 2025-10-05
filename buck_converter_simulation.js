/**
 * Buck Converter Simulation
 * 基於用戶提供的 netlist 進行 Buck 轉換器模擬
 * 
 * 電路規格：
 * - 輸入電壓：24V
 * - 目標輸出：~12V (50% 佔空比)
 * - 負載：5Ω
 * - 開關頻率：100kHz
 */

import { NetlistParser } from './src/parser/netlist.js';
import { MCPTransientAnalysis } from './src/analysis/transient_mcp.js';

// Buck 轉換器 SPICE 網表 (基於用戶提供的網表)
const buckConverterNetlist = `
* Buck Converter Example Netlist
* 根據用戶提供的 netlist 建立

* --- 元件定義 (Component Definitions) ---

* 輸入電壓源 (Input Voltage Source)
* 從 1 號節點到 0 號節點 (GND)，提供 24V 的直流電壓
VIN 1 0 DC 24V

* MOSFET 開關 (MOSFET Switch)
* M1: Drain(2) Gate(3) Source(0) Model(MYSW)
M1 2 3 0 0 MYSW

* 續流二極體 (Freewheeling Diode)
* D1: Anode(0) Cathode(2) Model(MYDIODE)
D1 0 2 MYDIODE

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

* --- 模型定義 (Model Definitions) ---

* 定義 MOSFET 模型
.MODEL MYSW NMOS (LEVEL=1 VTO=2 KP=120u)

* 定義二極體模型
.MODEL MYDIODE D (IS=1e-9 N=1.1)

* --- 模擬指令 (Simulation Commands) ---

* 暫態分析 (Transient Analysis)
* .TRAN T_step T_stop
* 從 0 秒模擬到 2ms，每 1us 儲存一次數據
.TRAN 1u 2m

* --- 結束 (End of Netlist) ---
.END
`;

/**
 * 解析時間值字串 (支持 ns, us, ms, s)
 */
function parseTimeValue(timeStr) {
    const str = timeStr.toString().toUpperCase();
    if (str.endsWith('NS')) {
        return parseFloat(str) * 1e-9;
    } else if (str.endsWith('US') || str.endsWith('U')) {
        return parseFloat(str) * 1e-6;
    } else if (str.endsWith('MS') || str.endsWith('M')) {
        return parseFloat(str) * 1e-3;
    } else if (str.endsWith('S')) {
        return parseFloat(str);
    } else {
        return parseFloat(str);  // 預設為秒
    }
}

/**
 * 解析頻率值字串 (支持 Hz, kHz, MHz)
 */
function parseFrequencyValue(freqStr) {
    const str = freqStr.toString().toUpperCase();
    if (str.endsWith('KHZ') || str.endsWith('K')) {
        return parseFloat(str) * 1e3;
    } else if (str.endsWith('MHZ') || str.endsWith('M')) {
        return parseFloat(str) * 1e6;
    } else if (str.endsWith('HZ')) {
        return parseFloat(str);
    } else {
        return parseFloat(str);  // 預設為 Hz
    }
}

/**
 * 主要模擬函數
 */
async function runBuckConverterSimulation() {
    console.log('=== Buck Converter Simulation ===');
    console.log('基於用戶提供的 netlist 進行模擬\n');
    
    try {
        // 1. 解析網表
        console.log('📋 步驟 1: 解析 Buck 轉換器網表...');
        const parser = new NetlistParser();
        const circuit = parser.parse(buckConverterNetlist);
        
        console.log(`✅ 網表解析成功: ${circuit.components.length} 個元件`);
        
        // 顯示電路拓撲資訊
        console.log('\n🔧 電路拓撲分析:');
        let hasSwitch = false;
        let hasDiode = false;
        let hasInductor = false;
        let hasCapacitor = false;
        let hasLoad = false;
        
        circuit.components.forEach(comp => {
            const compType = comp.constructor.name;
            if (compType === 'VoltageSource') {
                if (comp.sourceConfig && comp.sourceConfig.type === 'PULSE') {
                    const freq = 1 / comp.sourceConfig.per;
                    const duty = (comp.sourceConfig.pw / comp.sourceConfig.per * 100);
                    console.log(`   📊 ${comp.name}: PWM驅動 (${(freq/1000).toFixed(0)}kHz, ${duty.toFixed(1)}% 佔空比)`);
                } else {
                    console.log(`   🔋 ${comp.name}: ${comp.sourceConfig?.dc || comp.value}V 直流電源`);
                }
            } else if (compType === 'MOSFET_MCP' || compType === 'MOSFET') {
                hasSwitch = true;
                console.log(`   🔌 ${comp.name}: MOSFET 主開關 (${comp.drainNode || comp.nodes[0]}→${comp.sourceNode || comp.nodes[1]})`);
            } else if (compType === 'Diode_MCP' || compType === 'Diode') {
                hasDiode = true;
                console.log(`   ⚡ ${comp.name}: 續流二極體 (${comp.nodes[0]}→${comp.nodes[1]})`);
            } else if (compType === 'Inductor') {
                hasInductor = true;
                const value = comp.value || comp.inductance;
                console.log(`   🌀 ${comp.name}: 儲能電感 ${(value*1e6).toFixed(0)}µH (${comp.nodes[0]}→${comp.nodes[1]})`);
            } else if (compType === 'Capacitor') {
                hasCapacitor = true;
                const value = comp.value || comp.capacitance;
                console.log(`   ⚡ ${comp.name}: 輸出電容 ${(value*1e6).toFixed(0)}µF (${comp.nodes[0]}→${comp.nodes[1]})`);
            } else if (compType === 'Resistor') {
                hasLoad = true;
                const value = comp.value || comp.resistance;
                console.log(`   🏠 ${comp.name}: 負載電阻 ${value}Ω (${comp.nodes[0]}→${comp.nodes[1]})`);
            }
        });
        
        // 驗證 Buck 拓撲完整性
        console.log('\n✅ Buck 轉換器拓撲驗證:');
        console.log(`   主開關: ${hasSwitch ? '✓' : '✗'}`);
        console.log(`   續流二極體: ${hasDiode ? '✓' : '✗'}`);
        console.log(`   儲能電感: ${hasInductor ? '✓' : '✗'}`);
        console.log(`   輸出電容: ${hasCapacitor ? '✓' : '✗'}`);
        console.log(`   負載: ${hasLoad ? '✓' : '✗'}`);
        
        // 2. 設置模擬參數
        console.log('\n⚙️  步驟 2: 設置暫態分析參數...');
        
        const tranAnalysis = circuit.analyses.find(a => a.type === 'TRAN');
        if (!tranAnalysis) {
            throw new Error('❌ 未找到 .TRAN 分析設置');
        }
        
        const tStep = parseTimeValue(tranAnalysis.tstep);
        const tStop = parseTimeValue(tranAnalysis.tstop);
        const tStart = parseTimeValue(tranAnalysis.tstart || '0');
        
        console.log(`📊 模擬時間範圍: ${tStart}s 到 ${(tStop*1000).toFixed(1)}ms`);
        console.log(`📊 時間步長: ${(tStep*1e6).toFixed(1)}µs`);
        console.log(`📊 預計總步數: ${Math.floor((tStop - tStart) / tStep)}`);
        
        // 3. 創建並配置 MCP 仿真器
        console.log('\n🚀 步驟 3: 啟動 MCP 暫態仿真器...');
        
        const simulator = new MCPTransientAnalysis();
        
        // 配置仿真參數
        const simConfig = {
            startTime: tStart,
            stopTime: tStop,
            timeStep: tStep,
            
            // MCP 求解器配置
            mcpMaxIterations: 1000,
            mcpTolerance: 1e-12,
            
            // BDF2 積分器配置
            useBDF2: true,
            adaptiveStep: false,  // 固定步長以確保穩定性
            
            // 調試和收斂增強
            gmin: 1e-12,          // 最小電導
            debug: false,         // 關閉詳細調試以提升性能
            
            // 數值穩定性
            reltol: 1e-6,
            abstol: 1e-12,
            vntol: 1e-6
        };
        
        console.log('🔧 仿真器配置:');
        console.log(`   MCP 最大迭代數: ${simConfig.mcpMaxIterations}`);
        console.log(`   MCP 容差: ${simConfig.mcpTolerance}`);
        console.log(`   積分方法: ${simConfig.useBDF2 ? 'BDF2' : 'Backward Euler'}`);
        console.log(`   最小電導: ${simConfig.gmin}`);
        
        // 4. 執行暫態仿真
        console.log('\n⚡ 步驟 4: 執行暫態仿真...');
        console.log('正在求解非線性 MCP 系統...\n');
        
        const startTime = Date.now();
        const result = await simulator.solve(circuit.components, simConfig);
        const endTime = Date.now();
        
        if (!result.success) {
            throw new Error(`❌ 仿真失敗: ${result.error}`);
        }
        
        console.log(`✅ 仿真完成！耗時: ${((endTime - startTime)/1000).toFixed(2)}s\n`);
        
        // 5. 分析結果
        console.log('📈 步驟 5: 分析模擬結果...');
        
        const timePoints = result.timePoints;
        const voltageData = result.nodeVoltages;
        const currentData = result.branchCurrents || new Map();
        
        console.log(`📊 獲得 ${timePoints.length} 個時間點的數據`);
        
        // 分析輸出電壓 (節點4)
        if (voltageData.has('4')) {
            const outputVoltage = voltageData.get('4');
            const finalVout = outputVoltage[outputVoltage.length - 1];
            const avgVout = outputVoltage.slice(-Math.floor(outputVoltage.length/5)).reduce((a,b) => a+b, 0) / Math.floor(outputVoltage.length/5);
            
            // 計算紋波
            const steadyStateData = outputVoltage.slice(-Math.floor(outputVoltage.length/3));
            const maxVout = Math.max(...steadyStateData);
            const minVout = Math.min(...steadyStateData);
            const ripple = maxVout - minVout;
            
            console.log('\n🎯 輸出電壓分析:');
            console.log(`   最終輸出電壓: ${finalVout.toFixed(3)}V`);
            console.log(`   平均輸出電壓: ${avgVout.toFixed(3)}V`);
            console.log(`   電壓紋波: ${(ripple*1000).toFixed(1)}mV (${(ripple/avgVout*100).toFixed(2)}%)`);
            console.log(`   理論預期: ${(24 * 0.5).toFixed(1)}V (50% 佔空比)`);
            console.log(`   轉換效率: ${((avgVout/24)*100).toFixed(1)}%`);
        }
        
        // 分析輸入電流
        if (currentData.has('VIN')) {
            const inputCurrent = currentData.get('VIN');
            const avgIin = Math.abs(inputCurrent.slice(-Math.floor(inputCurrent.length/5)).reduce((a,b) => a+b, 0) / Math.floor(inputCurrent.length/5));
            
            console.log('\n⚡ 輸入電流分析:');
            console.log(`   平均輸入電流: ${avgIin.toFixed(3)}A`);
            console.log(`   輸入功率: ${(24 * avgIin).toFixed(2)}W`);
        }
        
        // 顯示關鍵時間點
        console.log('\n📋 關鍵時間點採樣:');
        const samplePoints = [0, Math.floor(timePoints.length/4), Math.floor(timePoints.length/2), 
                             Math.floor(3*timePoints.length/4), timePoints.length-1];
        
        for (const i of samplePoints) {
            if (i < timePoints.length) {
                const t = timePoints[i];
                const vOut = voltageData.has('4') ? voltageData.get('4')[i] : 'N/A';
                const vIn = voltageData.has('1') ? voltageData.get('1')[i] : 'N/A';
                
                console.log(`   t=${(t*1000).toFixed(2)}ms: V(in)=${vIn}V, V(out)=${typeof vOut === 'number' ? vOut.toFixed(3) : vOut}V`);
            }
        }
        
        // 6. 生成報告總結
        console.log('\n📋 模擬報告總結:');
        console.log('================================');
        console.log(`電路類型: Buck 降壓轉換器`);
        console.log(`輸入電壓: 24V DC`);
        console.log(`開關頻率: 100kHz (50% 佔空比)`);
        console.log(`負載電阻: 5Ω`);
        console.log(`模擬時間: ${(tStop*1000).toFixed(1)}ms`);
        console.log(`數值方法: MCP-BDF2 積分`);
        console.log(`計算狀態: ✅ 成功收斂`);
        
        if (voltageData.has('4')) {
            const outputVoltage = voltageData.get('4');
            const avgVout = outputVoltage.slice(-Math.floor(outputVoltage.length/5)).reduce((a,b) => a+b, 0) / Math.floor(outputVoltage.length/5);
            console.log(`實際輸出: ${avgVout.toFixed(3)}V`);
            console.log(`理論輸出: ${(24 * 0.5).toFixed(1)}V`);
            console.log(`誤差: ${Math.abs(avgVout - 12)/12*100 < 5 ? '✅ 正常' : '⚠️  需檢查'}`);
        }
        
        console.log('================================\n');
        console.log('🎉 Buck 轉換器模擬完成！');
        
        return result;
        
    } catch (error) {
        console.error('\n❌ 模擬過程發生錯誤:');
        console.error(`   錯誤訊息: ${error.message}`);
        console.error(`   錯誤位置: ${error.stack?.split('\n')[1] || '未知'}`);
        
        // 提供除錯建議
        console.log('\n🔍 除錯建議:');
        if (error.message.includes('解析')) {
            console.log('   - 檢查 netlist 語法是否正確');
            console.log('   - 確認所有元件型號定義完整');
        } else if (error.message.includes('MCP') || error.message.includes('收斂')) {
            console.log('   - 嘗試減小時間步長');
            console.log('   - 檢查元件參數是否合理');
            console.log('   - 增加 MCP 求解器迭代次數');
        } else {
            console.log('   - 檢查電路拓撲連接');
            console.log('   - 驗證元件數值範圍');
        }
        
        throw error;
    }
}

// 執行模擬
if (import.meta.url === `file://${process.argv[1]}`) {
    runBuckConverterSimulation()
        .then(() => {
            console.log('\n✨ 程序執行完畢');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n💥 程序異常終止:', error.message);
            process.exit(1);
        });
}

export { runBuckConverterSimulation, parseTimeValue, parseFrequencyValue };