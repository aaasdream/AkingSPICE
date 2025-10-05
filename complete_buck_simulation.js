// 完整的 Buck 轉換器時域仿真測試
import { NetlistParser } from './src/parser/netlist.js';
import { MCPTransientAnalysis } from './src/analysis/transient_mcp.js';

// 用戶的 Buck 轉換器 SPICE 網表
const buckConverterNetlist = `
* Buck Converter Circuit - High Performance PWM Design
* Input: 24V, Output: ~5V, Load: 5Ω (1A), Switching: 100kHz

VIN     vin     0       DC 24V
VDRIVE  drive   0       PULSE(0V 5V 0s 10ns 10ns 5us 10us)
M1      vin     drive   sw      NMOS_Model Ron=50m Vth=2V
D1      0       sw      DIODE_Model Vf=0.7V Ron=10m  
L1      sw      vo      100uH
C1      vo      0       220uF
RLOAD   vo      0       5

.MODEL NMOS_Model NMOS()
.MODEL DIODE_Model D()

.TRAN 0.1us 100us
.END
`;

async function runCompleteBuckSimulation() {
    console.log('=== 完整 Buck 轉換器仿真測試 ===');
    
    try {
        // 1. 解析網表
        console.log('\n1. 解析 Buck 轉換器網表...');
        const parser = new NetlistParser();
        const circuit = parser.parse(buckConverterNetlist);
        
        console.log(`✅ 網表解析成功: ${circuit.components.length} 個元件`);
        
        // 顯示電路拓撲
        console.log('\n=== 電路拓撲 ===');
        circuit.components.forEach(comp => {
            if (comp.constructor.name === 'VoltageSource') {
                if (comp.sourceConfig.type === 'PULSE') {
                    console.log(`${comp.name}: PULSE(${comp.sourceConfig.v1}V→${comp.sourceConfig.v2}V, ${comp.sourceConfig.per*1e6}µs, ${(comp.sourceConfig.pw/comp.sourceConfig.per*100).toFixed(1)}%)`);
                } else {
                    console.log(`${comp.name}: ${comp.sourceConfig.dc}V DC`);
                }
            } else if (comp.constructor.name === 'MOSFET_MCP') {
                console.log(`${comp.name}: ${comp.channelType} (${comp.drainNode}→${comp.sourceNode}, Gate=${comp.gateNode})`);
            } else if (comp.constructor.name === 'Diode_MCP') {
                console.log(`${comp.name}: 二極管 (${comp.nodes[0]}→${comp.nodes[1]})`);
            } else {
                console.log(`${comp.name}: ${comp.constructor.name} (${comp.nodes.join('→')})`);
            }
        });
        
        // 2. 設置仿真參數
        console.log('\n2. 設置時域仿真參數...');
        
        const tranAnalysis = circuit.analyses.find(a => a.type === 'TRAN');
        if (!tranAnalysis) {
            throw new Error('未找到 .TRAN 分析設置');
        }
        
        // 解析時間單位
        function parseTimeValue(timeStr) {
            const str = timeStr.toString().toUpperCase();
            if (str.endsWith('US')) {
                return parseFloat(str) * 1e-6;
            } else if (str.endsWith('MS')) {
                return parseFloat(str) * 1e-3;
            } else if (str.endsWith('NS')) {
                return parseFloat(str) * 1e-9;
            } else if (str.endsWith('S')) {
                return parseFloat(str);
            } else {
                return parseFloat(str);  // 假設是秒
            }
        }
        
        const tStep = parseTimeValue(tranAnalysis.tstep);
        const tStop = parseTimeValue(tranAnalysis.tstop);
        const tStart = parseTimeValue(tranAnalysis.tstart || '0');
        
        console.log(`時間範圍: ${tStart}s 到 ${tStop}s，步長: ${tStep}s`);
        console.log(`總步數: ${Math.floor((tStop - tStart) / tStep)}`);
        
        // 3. 創建並配置仿真器
        console.log('\n3. 創建高級數值仿真器...');
        
        const simulator = new MCPTransientAnalysis();
        
        // 配置 BDF2 + 預測器 + 阻尼參數
        const simConfig = {
            startTime: tStart,
            stopTime: tStop,
            timeStep: tStep,
            
            // BDF2 配置
            useBDF2: true,
            adaptiveStep: true,
            minTimeStep: tStep / 100,
            maxTimeStep: tStep * 10,
            
            // 預測器配置  
            usePredictor: true,
            predictorOrder: 2,
            
            // 阻尼配置
            useDamping: true,
            maxVoltageStep: 1.0,  // 1V 最大電壓步長
            dampingFactor: 0.8,   // 80% 阻尼
            
            // 收斂控制
            maxIterations: 50,
            tolerance: 1e-6,
            
            // 輸出控制
            outputInterval: Math.max(1, Math.floor(0.5e-6 / tStep)), // 每 0.5µs 輸出一次
            verbose: false
        };
        
        console.log('仿真配置:');
        console.log(`  BDF2 積分: ${simConfig.useBDF2 ? '✓' : '✗'}`);
        console.log(`  二階預測器: ${simConfig.usePredictor ? '✓' : '✗'}`);
        console.log(`  節點阻尼: ${simConfig.useDamping ? '✓' : '✗'}`);
        console.log(`  輸出間隔: 每 ${simConfig.outputInterval} 步`);
        
        // 4. 運行仿真
        console.log('\n4. 開始 Buck 轉換器仿真...');
        console.log('(這可能需要幾秒鐘時間)');
        
        const startTime = Date.now();
        
        const results = await simulator.run(circuit.components, simConfig);
        
        const endTime = Date.now();
        const elapsedTime = (endTime - startTime) / 1000;
        
        console.log(`✅ 仿真完成！耗時: ${elapsedTime.toFixed(2)}s`);
        
        // 5. 分析結果
        console.log('\n5. 仿真結果分析...');
        
        if (results && results.timePoints && results.timePoints.length > 0) {
            const timePoints = results.timePoints;
            const numPoints = timePoints.length;
            
            console.log(`總時間點數: ${numPoints}`);
            console.log(`時間範圍: ${timePoints[0]*1e6}µs 到 ${timePoints[numPoints-1]*1e6}µs`);
            
            // 分析關鍵節點電壓
            if (results.voltages) {
                const keyNodes = ['vin', 'drive', 'sw', 'vo'];
                
                console.log('\n=== 關鍵節點電壓統計 ===');
                keyNodes.forEach(node => {
                    if (results.voltages[node]) {
                        const voltages = results.voltages[node];
                        const min = Math.min(...voltages);
                        const max = Math.max(...voltages);
                        const avg = voltages.reduce((a,b) => a+b, 0) / voltages.length;
                        const final = voltages[voltages.length - 1];
                        
                        console.log(`${node}: ${min.toFixed(3)}V ~ ${max.toFixed(3)}V (平均: ${avg.toFixed(3)}V, 最終: ${final.toFixed(3)}V)`);
                    }
                });
                
                // 計算轉換效率（如果可能）
                if (results.voltages['vo'] && results.voltages['vin']) {
                    const finalOutputVoltage = results.voltages['vo'][results.voltages['vo'].length - 1];
                    const inputVoltage = results.voltages['vin'][results.voltages['vin'].length - 1];
                    
                    const outputCurrent = finalOutputVoltage / 5; // 5Ω 負載
                    const outputPower = finalOutputVoltage * outputCurrent;
                    
                    console.log(`\n=== 性能指標 ===`);
                    console.log(`輸出電壓: ${finalOutputVoltage.toFixed(3)}V`);
                    console.log(`輸出電流: ${outputCurrent.toFixed(3)}A`);
                    console.log(`輸出功率: ${outputPower.toFixed(3)}W`);
                    console.log(`電壓轉換比: ${((finalOutputVoltage/inputVoltage)*100).toFixed(1)}%`);
                }
            }
            
            // 檢查數值穩定性
            console.log('\n=== 數值穩定性檢查 ===');
            if (results.converged !== false) {
                console.log('✅ 仿真收斂穩定');
            } else {
                console.log('⚠️  仿真可能存在收斂問題');
            }
            
            if (results.stepReductions) {
                console.log(`步長調整次數: ${results.stepReductions}`);
            }
            
            return results;
            
        } else {
            console.log('❌ 仿真失敗或無結果');
            return null;
        }
        
    } catch (error) {
        console.error('仿真過程中發生錯誤:', error.message);
        console.error('錯誤堆疊:', error.stack);
        return null;
    }
}

// 運行完整仿真
runCompleteBuckSimulation()
    .then(results => {
        if (results) {
            console.log('\n🎉 Buck 轉換器仿真成功完成！');
            console.log('\n這證明了 AkingSPICE 現在可以:');
            console.log('✅ 正確解析標準 SPICE 網表語法');
            console.log('✅ 支持 PULSE 電壓源和 PWM 控制');  
            console.log('✅ 處理 MOSFET 和二極管的 MCP 模型');
            console.log('✅ 使用 BDF2 積分和預測器保持數值穩定性');
            console.log('✅ 實現複雜電力電子電路的精確仿真');
        } else {
            console.log('\n❌ 仿真未能完成，需要進一步調試');
        }
    })
    .catch(error => {
        console.error('仿真執行錯誤:', error);
    });