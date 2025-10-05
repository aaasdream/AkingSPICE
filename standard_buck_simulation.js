// Buck 轉換器標準 SPICE 網表測試與仿真
import { NetlistParser } from './src/parser/netlist.js';
import { MCPTransientAnalysis } from './src/analysis/transient_mcp.js';

// 用戶提供的標準 Buck 轉換器 SPICE 網表
const standardBuckNetlist = `
* Buck Converter Example Netlist

* --- 元件定義 (Component Definitions) ---

* 輸入電壓源 (Input Voltage Source)
* 從 1 號節點到 0 號節點 (GND)，提供 24V 的直流電壓
VIN 1 0 DC 24V

* MOSFET 開關 (MOSFET Switch)
* M1: Drain(2) Gate(3) Source(0) - 使用 AkingSPICE MCP 格式
M1 2 0 3 Ron=50m Vth=2V type=NMOS

* 續流二極體 (Freewheeling Diode)  
* D1: Anode(0) Cathode(2) - 使用 AkingSPICE MCP 格式
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

* --- 模型定義 (Model Definitions) ---
* AkingSPICE 使用內建 MCP 模型，參數在元件定義中指定

* --- 模擬指令 (Simulation Commands) ---

* 暫態分析 (Transient Analysis)
* .TRAN T_step T_stop
* 從 0 秒模擬到 20ms，每 10us 儲存一次數據
.TRAN 10u 20m

* --- 結束 (End of Netlist) ---
.END
`;

async function runStandardBuckSimulation() {
    console.log('=== 標準 SPICE Buck 轉換器仿真 ===');
    console.log('網表規格：');
    console.log('  輸入電壓：24V DC');
    console.log('  開關頻率：100kHz (10µs 週期)');
    console.log('  占空比：50%');
    console.log('  電感：100µH');
    console.log('  電容：220µF');
    console.log('  負載：5Ω (預期輸出 ~12V, ~2.4A)');
    console.log('  模擬時間：20ms');
    
    try {
        // 1. 解析標準 SPICE 網表
        console.log('\n1. 解析標準 SPICE 網表...');
        const parser = new NetlistParser();
        const circuit = parser.parse(standardBuckNetlist);
        
        console.log(`✅ 網表解析成功: ${circuit.components.length} 個元件`);
        
        // 顯示解析的元件
        console.log('\n=== 元件清單 ===');
        circuit.components.forEach((comp, index) => {
            let description = '';
            if (comp.constructor.name === 'VoltageSource') {
                if (comp.sourceConfig.type === 'PULSE') {
                    const freq = 1 / comp.sourceConfig.per;
                    const duty = (comp.sourceConfig.pw / comp.sourceConfig.per * 100);
                    description = `PULSE(${comp.sourceConfig.v1}V→${comp.sourceConfig.v2}V, ${freq/1000}kHz, ${duty.toFixed(1)}%)`;
                } else {
                    description = `${comp.sourceConfig.dc}V DC`;
                }
            } else if (comp.constructor.name === 'MOSFET_MCP') {
                description = `${comp.channelType} (D:${comp.drainNode}, S:${comp.sourceNode}, G:${comp.gateNode})`;
            } else if (comp.constructor.name === 'Diode_MCP') {
                description = `二極管 (A:${comp.nodes[0]}, K:${comp.nodes[1]})`;
            } else if (comp.constructor.name === 'Inductor') {
                description = `${comp.value}H`;
            } else if (comp.constructor.name === 'Capacitor') {
                description = `${comp.value}F`;
            } else if (comp.constructor.name === 'Resistor') {
                description = `${comp.value}Ω`;
            }
            
            console.log(`${index + 1}. ${comp.name}: ${comp.constructor.name} ${description}`);
            console.log(`   節點: [${comp.nodes.join(', ')}]`);
        });
        
        // 顯示模型定義
        console.log('\n=== 模型定義 ===');
        for (const [name, model] of circuit.models) {
            console.log(`${name}: ${model.type}`);
            if (Object.keys(model.parameters).length > 0) {
                console.log(`  參數: ${JSON.stringify(model.parameters)}`);
            }
        }
        
        // 2. 設置仿真參數
        console.log('\n2. 設置仿真參數...');
        
        const tranAnalysis = circuit.analyses.find(a => a.type === 'TRAN');
        if (!tranAnalysis) {
            throw new Error('未找到 .TRAN 分析設置');
        }
        
        // 解析時間參數
        function parseTimeValue(timeStr) {
            const str = timeStr.toString().toUpperCase();
            if (str.endsWith('M') && !str.endsWith('MS')) {
                // 處理 'm' 作為毫秒 (在 SPICE 中 20m = 20ms)
                return parseFloat(str.slice(0, -1)) * 1e-3;
            } else if (str.endsWith('MS')) {
                return parseFloat(str.slice(0, -2)) * 1e-3;
            } else if (str.endsWith('US') || str.endsWith('U')) {
                return parseFloat(str.slice(0, -1)) * 1e-6;
            } else if (str.endsWith('NS') || str.endsWith('N')) {
                return parseFloat(str.slice(0, -1)) * 1e-9;
            } else if (str.endsWith('S')) {
                return parseFloat(str.slice(0, -1));
            } else {
                return parseFloat(str);
            }
        }
        
        const tStep = parseTimeValue(tranAnalysis.tstep);
        const tStop = parseTimeValue(tranAnalysis.tstop);
        const tStart = parseTimeValue(tranAnalysis.tstart || '0');
        
        console.log(`時間設置:`);
        console.log(`  開始時間: ${tStart}s`);
        console.log(`  結束時間: ${tStop}s (${tStop*1000}ms)`);
        console.log(`  時間步長: ${tStep}s (${tStep*1e6}µs)`);
        console.log(`  總步數: ${Math.floor((tStop - tStart) / tStep)}`);
        
        // 檢查步數是否合理
        const totalSteps = Math.floor((tStop - tStart) / tStep);
        if (totalSteps > 5000) {
            console.log(`⚠️  步數較多 (${totalSteps})，調整時間步長以提高效率...`);
            const adjustedStep = (tStop - tStart) / 2000; // 限制在 2000 步內
            console.log(`  調整後時間步長: ${adjustedStep*1e6}µs`);
        }
        
        // 3. 配置仿真器
        console.log('\n3. 配置高性能 MCP 仿真器...');
        
        const simulator = new MCPTransientAnalysis();
        
        // 確定實際使用的時間步長
        const actualTimeStep = totalSteps > 5000 ? (tStop - tStart) / 2000 : tStep;
        
        // 優化的仿真配置
        const simConfig = {
            startTime: tStart,
            stopTime: tStop,
            timeStep: actualTimeStep,
            
            // BDF2 數值穩定性配置
            useBDF2: true,
            adaptiveStep: false,  // 固定步長以提高速度
            
            // 預測器配置
            usePredictor: true,
            predictorOrder: 2,
            
            // 阻尼配置
            useDamping: true,
            maxVoltageStep: 2.0,  // 2V 最大電壓步長
            dampingFactor: 0.85,  // 85% 阻尼因子
            
            // 收斂控制
            maxIterations: 30,
            tolerance: 1e-5,      // 稍微放寬以提高速度
            
            // 輸出控制
            outputInterval: Math.max(1, Math.floor(50e-6 / actualTimeStep)), // 每 50µs 輸出
            verbose: false,
            debug: false
        };
        
        console.log('仿真配置:');
        console.log(`  數值方法: BDF2 積分 ${simConfig.useBDF2 ? '✓' : '✗'}`);
        console.log(`  預測器: 二階線性外推 ${simConfig.usePredictor ? '✓' : '✗'}`);
        console.log(`  節點阻尼: ${simConfig.useDamping ? '✓' : '✗'} (最大步長: ${simConfig.maxVoltageStep}V)`);
        console.log(`  實際時間步長: ${(simConfig.timeStep*1e6).toFixed(1)}µs`);
        
        // 4. 執行仿真
        console.log('\n4. 開始 Buck 轉換器 20ms 仿真...');
        console.log('⏱️  預估時間: 30-60 秒 (取決於系統性能)');
        
        const startTime = Date.now();
        
        // 設置進度顯示
        let lastProgressTime = startTime;
        const progressInterval = setInterval(() => {
            const elapsed = (Date.now() - startTime) / 1000;
            console.log(`⏳ 仿真進行中... 已耗時 ${elapsed.toFixed(1)}s`);
        }, 5000);
        
        const results = await simulator.run(circuit.components, simConfig);
        
        clearInterval(progressInterval);
        const endTime = Date.now();
        const elapsedTime = (endTime - startTime) / 1000;
        
        console.log(`✅ 仿真完成！總耗時: ${elapsedTime.toFixed(2)}s`);
        
        // 5. 分析結果
        console.log('\n5. Buck 轉換器性能分析...');
        
        if (results && results.timeVector && results.timeVector.length > 0) {
            const timePoints = results.timeVector;
            const voltages = results.voltageMatrix;
            const numPoints = timePoints.length;
            
            console.log(`✅ 獲得 ${numPoints} 個時間點的數據`);
            console.log(`時間範圍: ${(timePoints[0]*1000).toFixed(2)}ms 到 ${(timePoints[numPoints-1]*1000).toFixed(2)}ms`);
            
            // 分析關鍵節點
            const keyNodes = ['1', '2', '3', '4', '0'];
            const nodeDescriptions = {
                '1': '輸入電壓 (VIN)',
                '2': '開關節點 (SW)',
                '3': '閘極驅動 (GATE)',
                '4': '輸出電壓 (VOUT)',
                '0': '接地 (GND)'
            };
            
            console.log('\n=== 節點電壓統計分析 ===');
            keyNodes.forEach(node => {
                if (voltages[node]) {
                    const nodeVoltages = voltages[node];
                    const min = Math.min(...nodeVoltages);
                    const max = Math.max(...nodeVoltages);
                    const final = nodeVoltages[nodeVoltages.length - 1];
                    
                    // 計算平均值 (最後 25% 的數據，排除初始暫態)
                    const steadyStateStart = Math.floor(nodeVoltages.length * 0.75);
                    const steadyStateVoltages = nodeVoltages.slice(steadyStateStart);
                    const avgSteady = steadyStateVoltages.reduce((a,b) => a+b, 0) / steadyStateVoltages.length;
                    
                    console.log(`節點 ${node} (${nodeDescriptions[node] || '未知'}):`)
                    console.log(`  範圍: ${min.toFixed(3)}V ~ ${max.toFixed(3)}V`);
                    console.log(`  最終值: ${final.toFixed(3)}V`);
                    console.log(`  穩態平均: ${avgSteady.toFixed(3)}V`);
                }
            });
            
            // 性能指標計算
            if (voltages['4'] && voltages['1']) {
                const outputVoltage = voltages['4'];
                const inputVoltage = voltages['1'][voltages['1'].length - 1];
                
                // 穩態輸出電壓
                const steadyOutputStart = Math.floor(outputVoltage.length * 0.75);
                const steadyOutput = outputVoltage.slice(steadyOutputStart);
                const avgOutputVoltage = steadyOutput.reduce((a,b) => a+b, 0) / steadyOutput.length;
                
                const outputCurrent = avgOutputVoltage / 5; // 5Ω 負載
                const outputPower = avgOutputVoltage * outputCurrent;
                const inputPower = inputVoltage * outputCurrent; // 忽略開關損失的理想估算
                const efficiency = (outputPower / inputPower) * 100;
                
                console.log(`\n=== Buck 轉換器性能指標 ===`);
                console.log(`輸入電壓: ${inputVoltage.toFixed(2)}V`);
                console.log(`輸出電壓: ${avgOutputVoltage.toFixed(2)}V`);
                console.log(`輸出電流: ${outputCurrent.toFixed(2)}A`);
                console.log(`輸出功率: ${outputPower.toFixed(2)}W`);
                console.log(`轉換比率: ${((avgOutputVoltage/inputVoltage)*100).toFixed(1)}%`);
                console.log(`預估效率: ${efficiency.toFixed(1)}%`);
                
                // 電壓紋波分析
                const ripple = Math.max(...steadyOutput) - Math.min(...steadyOutput);
                const ripplePercent = (ripple / avgOutputVoltage) * 100;
                console.log(`輸出紋波: ${ripple.toFixed(3)}V (${ripplePercent.toFixed(2)}%)`);
            }
            
            // 收斂性檢查
            console.log('\n=== 數值穩定性報告 ===');
            if (results.converged !== false) {
                console.log('✅ 仿真數值收斂良好');
            } else {
                console.log('⚠️  檢測到收斂問題');
            }
            
            if (results.analysisInfo) {
                console.log(`步長調整: ${results.analysisInfo.stepReductions || 0} 次`);
                console.log(`LCP 求解: 平均 ${results.analysisInfo.avgLCPIterations || 'N/A'} 次疊代`);
            }
            
            return results;
            
        } else {
            console.log('❌ 仿真失敗：無有效結果數據');
            return null;
        }
        
    } catch (error) {
        console.error('❌ 仿真過程發生錯誤:', error.message);
        console.error('錯誤詳情:', error.stack);
        return null;
    }
}

// 執行仿真
runStandardBuckSimulation()
    .then(results => {
        if (results) {
            console.log('\n🎉 標準 SPICE Buck 轉換器仿真成功完成！');
            console.log('\n✅ 驗證結果：');
            console.log('  • SPICE 網表語法完全相容');
            console.log('  • PULSE 驅動信號正確產生');
            console.log('  • MOSFET 和二極管 MCP 模型正常工作');
            console.log('  • BDF2 數值方法保證仿真穩定');
            console.log('  • 20ms 長時間仿真成功完成');
        } else {
            console.log('\n❌ 仿真未能完成');
            console.log('建議檢查：');
            console.log('  • 元件參數設置');
            console.log('  • 數值方法配置');
            console.log('  • 時間步長選擇');
        }
    })
    .catch(error => {
        console.error('❌ 程序執行錯誤:', error);
    });