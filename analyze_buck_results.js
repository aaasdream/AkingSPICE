import { NetlistParser } from './src/parser/netlist.js';
import { MCPTransientAnalysis } from './src/analysis/transient_mcp.js';
import fs from 'fs';

// 標準 SPICE Buck 轉換器網表（使用 AkingSPICE 格式）
const netlist = `
* Buck Converter Example Netlist
VIN 1 0 DC 24V
M1 2 0 3 Ron=50m Vth=2V type=NMOS
D1 0 2 Vf=0.7V Ron=10m
L1 2 4 100uH
C1 4 0 220uF
RLOAD 4 0 5
VDRIVE 3 0 PULSE(0V 15V 0ns 10ns 10ns 5us 10us)
.TRAN 10us 1ms
.END
`;

async function runBuckAnalysis() {
    console.log('📋 分析 Buck 轉換器仿真結果...\n');
    
    try {
        // 1. 解析網表
        console.log('1. 解析標準 SPICE 網表...');
        const parser = new NetlistParser();
        const circuit = parser.parse(netlist);
        
        console.log(`✅ 解析完成：${circuit.components.length} 個組件`);
        
        // 顯示電路拓撲
        console.log('\n=== 電路拓撲分析 ===');
        circuit.components.forEach((comp, index) => {
            let description = '';
            switch (comp.constructor.name) {
                case 'VoltageSource':
                    description = comp.waveform ? `${comp.waveform.type} 波形` : `DC ${comp.voltage}V`;
                    break;
                case 'MOSFET_MCP':
                    description = `NMOS (Ron=${comp.Ron}Ω, Vth=${comp.Vth}V)`;
                    break;
                case 'Diode_MCP':
                    description = `二極管 (Vf=${comp.Vf}V, Ron=${comp.Ron}Ω)`;
                    break;
                case 'Inductor':
                    description = `電感 ${comp.inductance}H`;
                    break;
                case 'Capacitor':
                    description = `電容 ${comp.capacitance}F`;
                    break;
                case 'Resistor':
                    description = `電阻 ${comp.resistance}Ω`;
                    break;
            }
            
            console.log(`${index + 1}. ${comp.name}: ${comp.constructor.name} ${description}`);
            console.log(`   節點: [${comp.nodes.join(', ')}]`);
        });
        
        // 2. 設置仿真參數
        console.log('\n2. 設置短時間測試仿真...');
        
        // 短時間測試：1ms
        const testDuration = 1e-3; // 1ms
        const actualTimeStep = 10e-6; // 10us
        const maxSteps = Math.floor(testDuration / actualTimeStep);
        
        const simConfig = {
            startTime: 0,
            stopTime: testDuration,
            timeStep: actualTimeStep,
            
            // BDF2 數值穩定性配置
            useBDF2: true,
            adaptiveStep: false,
            
            // 預測器配置
            usePredictor: true,
            predictorOrder: 2,
            
            // 阻尼配置
            useDamping: true,
            maxVoltageStep: 2.0,
            dampingFactor: 0.85,
            
            // 收斂控制
            maxIterations: 30,
            tolerance: 1e-5,
            
            // 輸出控制
            outputInterval: 1,
            verbose: false,
            debug: false
        };
        
        console.log(`時間步長: ${(actualTimeStep * 1e6).toFixed(2)}μs`);
        console.log(`仿真時間: ${(testDuration * 1e3).toFixed(2)}ms`);
        console.log(`總步數: ${maxSteps}`);
        
        // 3. 執行仿真
        console.log('\n3. 執行 MCP 瞬態分析...');
        const startTime = Date.now();
        
        const mcpAnalysis = new MCPTransientAnalysis();
        const results = await mcpAnalysis.run(circuit.components, simConfig);
        
        const elapsed = (Date.now() - startTime) / 1000;
        console.log(`✅ 仿真完成！耗時: ${elapsed.toFixed(2)}s`);
        
        // 4. 分析結果
        console.log('\n4. 分析仿真結果...');
        if (!results || !results.timeVector) {
            throw new Error('仿真結果無效：缺少時間數據');
        }
        console.log(`✅ 獲得 ${results.timeVector.length} 個時間點的數據`);
        console.log(`時間範圍: ${(results.timeVector[0] * 1e3).toFixed(2)}ms 到 ${(results.timeVector[results.timeVector.length - 1] * 1e3).toFixed(2)}ms`);
        
        // 分析各節點電壓
        console.log('\n=== 關鍵時刻電壓分析 ===');
        
        const keyTimes = [0, Math.floor(results.timeVector.length * 0.1), Math.floor(results.timeVector.length * 0.5), results.timeVector.length - 1];
        const timeLabels = ['初始時刻', '10% 時間', '50% 時間', '最終時刻'];
        
        keyTimes.forEach((idx, i) => {
            if (idx < results.timeVector.length) {
                console.log(`\n${timeLabels[i]} (t=${(results.timeVector[idx] * 1e3).toFixed(3)}ms):`);
                Object.entries(results.voltageMatrix).forEach(([node, voltages]) => {
                    if (voltages && idx < voltages.length && voltages[idx] !== undefined) {
                        console.log(`  節點 ${node}: ${voltages[idx].toFixed(3)}V`);
                    } else {
                        console.log(`  節點 ${node}: N/A V`);
                    }
                });
                
                // PWM 狀態
                const vpwm = results.voltageMatrix['3'] && results.voltageMatrix['3'][idx] !== undefined 
                    ? results.voltageMatrix['3'][idx] : 0;
                const state = vpwm > 6 ? 'ON' : 'OFF';
                console.log(`  PWM 狀態: ${state}`);
            }
        });
        
        // PWM 頻率分析
        console.log('\n=== PWM 信號分析 ===');
        if (results.voltageMatrix['3']) {
            const pwmVoltages = results.voltageMatrix['3'];
            let transitions = 0;
            let lastState = pwmVoltages[0] > 6;
            
            for (let i = 1; i < pwmVoltages.length; i++) {
                const currentState = pwmVoltages[i] > 6;
                if (currentState !== lastState) {
                    transitions++;
                    lastState = currentState;
                }
            }
            
            const estimatedFreq = transitions / (2 * testDuration);
            console.log(`PWM 轉換次數: ${transitions}`);
            console.log(`估計頻率: ${(estimatedFreq / 1000).toFixed(1)}kHz`);
        }
        
        // 電路行為診斷
        console.log('\n=== 電路行為診斷 ===');
        
        const vout = results.voltageMatrix['4'];
        const vgate = results.voltageMatrix['3'];
        const vsw = results.voltageMatrix['2'];
        
        if (vout && vout.length > 0) {
            const finalVout = vout[vout.length - 1] || 0;
            const validVoltages = vout.filter(v => v !== undefined && !isNaN(v));
            const maxVout = validVoltages.length > 0 ? Math.max(...validVoltages) : 0;
            console.log(`輸出電壓趨勢: 0V → ${finalVout.toFixed(3)}V (峰值: ${maxVout.toFixed(3)}V)`);
            
            if (maxVout < 0.1) {
                console.log('⚠️ 輸出電壓過低，可能原因：');
                console.log('   - MOSFET 沒有正確導通');
                console.log('   - PWM 信號問題');
                console.log('   - 電路連接問題');
            }
        }
        
        if (vgate && vgate.length > 0) {
            const validGateVoltages = vgate.filter(v => v !== undefined && !isNaN(v));
            const maxGate = validGateVoltages.length > 0 ? Math.max(...validGateVoltages) : 0;
            console.log(`閘極電壓範圍: 0V 到 ${maxGate.toFixed(3)}V`);
            
            if (maxGate < 2) {
                console.log('⚠️ 閘極電壓不足以驅動 MOSFET (Vth=2V)');
            }
        }
        
        // 5. 輸出詳細資料
        console.log('\n5. 輸出詳細數據...');
        
        const csvData = ['time_ms,vin_v,vgate_v,vsw_v,vout_v,pwm_state'];
        
        for (let i = 0; i < results.timeVector.length; i++) {
            const t_ms = (results.timeVector[i] * 1e3).toFixed(6);
            const vin = (results.voltageMatrix['1'] && results.voltageMatrix['1'][i] !== undefined) 
                ? results.voltageMatrix['1'][i].toFixed(6) : '0';
            const vgate = (results.voltageMatrix['3'] && results.voltageMatrix['3'][i] !== undefined) 
                ? results.voltageMatrix['3'][i].toFixed(6) : '0';
            const vsw = (results.voltageMatrix['2'] && results.voltageMatrix['2'][i] !== undefined) 
                ? results.voltageMatrix['2'][i].toFixed(6) : '0';
            const vout = (results.voltageMatrix['4'] && results.voltageMatrix['4'][i] !== undefined) 
                ? results.voltageMatrix['4'][i].toFixed(6) : '0';
            const pwm_state = parseFloat(vgate) > 6 ? '1' : '0';
            
            csvData.push(`${t_ms},${vin},${vgate},${vsw},${vout},${pwm_state}`);
        }
        
        const outputFile = 'buck_analysis_1ms.csv';
        fs.writeFileSync(outputFile, csvData.join('\n'));
        console.log(`✅ 詳細數據已輸出到: ${outputFile}`);
        
        // 6. 建議
        console.log('\n=== 改進建議 ===');
        console.log('1. 檢查 PWM 信號幅度 (目前: 12V，建議: 15V 以確保 MOSFET 充分導通)');
        console.log('2. 驗證 MOSFET 模型參數');
        console.log('3. 考慮添加更詳細的 MOSFET 特性');
        console.log('4. 延長仿真時間以觀察穩態行為');
        
        console.log('\n🎉 Buck 轉換器分析完成！');
        
        return results;
        
    } catch (error) {
        console.error('❌ 仿真失敗：', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// 執行分析
await runBuckAnalysis();

export { runBuckAnalysis };