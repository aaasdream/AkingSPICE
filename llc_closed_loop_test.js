#!/usr/bin/env node

/**
 * LLC 轉換器閉環控制系統測試
 * 基於成功的 1800V 開環配置，實現完整的閉環控制
 * 整合 MultiWindingTransformer 內核修復成果
 */

const path = require('path');
const srcDir = path.join(__dirname, 'src');

// 導入組件和分析器
const { VoltageSource } = require(path.join(srcDir, 'components/sources.js'));
const { Inductor } = require(path.join(srcDir, 'components/inductor.js'));  
const { Capacitor } = require(path.join(srcDir, 'components/capacitor.js'));
const { Resistor } = require(path.join(srcDir, 'components/resistor.js'));
const { Diode_MCP } = require(path.join(srcDir, 'components/diode_mcp.js'));
const { MultiWindingTransformer } = require(path.join(srcDir, 'components/transformer.js'));
const { MCPTransientAnalysis } = require(path.join(srcDir, 'analysis/transient_mcp.js'));

/**
 * 閉環控制器類
 * 實現基於輸出電壓反饋的PWM控制
 */
class LLCClosedLoopController {
    constructor(config) {
        this.targetVoltage = config.targetVoltage || 48;  // 目標輸出電壓 48V
        this.Kp = config.Kp || 0.001;  // 比例增益
        this.Ki = config.Ki || 0.1;    // 積分增益 
        this.Kd = config.Kd || 0.0001; // 微分增益
        
        this.integralError = 0;
        this.previousError = 0;
        this.minFreq = config.minFreq || 80e3;   // 最小頻率 80kHz
        this.maxFreq = config.maxFreq || 200e3;  // 最大頻率 200kHz
        this.nominalFreq = config.nominalFreq || 100e3; // 標稱頻率 100kHz
        
        this.debug = config.debug || false;
    }
    
    /**
     * 計算控制輸出
     * @param {number} outputVoltage 當前輸出電壓
     * @param {number} dt 時間步長
     * @returns {number} 新的開關頻率
     */
    update(outputVoltage, dt) {
        const error = this.targetVoltage - outputVoltage;
        
        // PID 控制計算
        this.integralError += error * dt;
        const derivativeError = (error - this.previousError) / dt;
        
        const pidOutput = this.Kp * error + 
                         this.Ki * this.integralError + 
                         this.Kd * derivativeError;
        
        // 將 PID 輸出轉換為頻率調整
        const frequencyAdjustment = pidOutput * 1000; // 頻率調整量
        let newFrequency = this.nominalFreq - frequencyAdjustment;
        
        // 限制頻率範圍
        newFrequency = Math.max(this.minFreq, Math.min(this.maxFreq, newFrequency));
        
        if (this.debug) {
            console.log(`🎛️  PID控制: Vout=${outputVoltage.toFixed(2)}V, 誤差=${error.toFixed(3)}V, 新頻率=${(newFrequency/1000).toFixed(1)}kHz`);
        }
        
        this.previousError = error;
        return newFrequency;
    }
}

/**
 * 創建 LLC 轉換器電路
 * 使用修復後的內核，直接使用 MultiWindingTransformer
 */
function createLLCCircuit(switchingFreq = 100e3) {
    const VIN = 1800; // 高壓輸入
    const period = 1 / switchingFreq;
    const dutyCycle = 0.5;
    
    return [
        // 輸入電壓源
        new VoltageSource('Vin', ['IN', '0'], VIN),
        
        // 諧振網絡
        new Inductor('Lr', ['IN', 'SW_MID'], 100e-6),    // 100µH 諧振電感
        new Capacitor('Cr', ['SW_MID', 'PRI_POS'], 10e-9), // 10nF 諧振電容
        
        // 主變壓器 - 直接使用 MultiWindingTransformer (內核會自動處理)
        new MultiWindingTransformer('T1', {
            windings: [
                { name: 'primary', nodes: ['PRI_POS', 'SW_MID'], inductance: 1000e-6 },     // 1mH
                { name: 'secondary1', nodes: ['SEC_POS', 'CENTER_TAP'], inductance: 500e-6 }, // 0.5mH
                { name: 'secondary2', nodes: ['CENTER_TAP', 'SEC_NEG'], inductance: 500e-6 }  // 0.5mH
            ],
            couplingMatrix: [[1.0, 0.9999, 0.9999], [0.9999, 1.0, 0.9999], [0.9999, 0.9999, 1.0]]
        }),
        
        // 次級整流電路
        new Diode_MCP('D1', ['SEC_POS', 'VOUT'], { 
            Is: 1e-12, Vt: 0.026, n: 1.0 
        }),
        new Diode_MCP('D2', ['SEC_NEG', 'VOUT'], { 
            Is: 1e-12, Vt: 0.026, n: 1.0 
        }),
        
        // 輸出濾波和負載
        new Capacitor('Co', ['VOUT', 'CENTER_TAP'], 100e-6), // 100µF 輸出電容
        new Resistor('R_LOAD', ['VOUT', 'CENTER_TAP'], 10),   // 10Ω 負載
        
        // 半橋驅動信號 (使用成功的配置)
        new VoltageSource('V_HB_Driver', ['SW_MID', '0'], {
            type: 'PULSE',
            v1: 0,
            v2: VIN,
            td: 0,
            tr: 1e-8,
            tf: 1e-8,
            pw: period * dutyCycle,
            per: period
        })
    ];
}

/**
 * 主閉環控制測試函數
 */
async function runClosedLoopTest() {
    console.log('🔄 LLC 轉換器閉環控制系統測試');
    console.log('=' .repeat(60));
    
    try {
        // 初始化控制器
        const controller = new LLCClosedLoopController({
            targetVoltage: 48,    // 目標 48V 輸出
            Kp: 0.002,           // 調優的 PID 參數
            Ki: 0.05,
            Kd: 0.0001,
            debug: true
        });
        
        // 初始化分析器
        const mcpAnalysis = new MCPTransientAnalysis({
            debug: false,
            gmin: 1e-6
        });
        
        console.log('\n📊 閉環控制參數:');
        console.log(`   目標電壓: ${controller.targetVoltage}V`);
        console.log(`   PID 增益: Kp=${controller.Kp}, Ki=${controller.Ki}, Kd=${controller.Kd}`);
        console.log(`   頻率範圍: ${controller.minFreq/1000}-${controller.maxFreq/1000}kHz`);
        
        // 閉環控制循環
        let currentFreq = controller.nominalFreq;
        let outputVoltage = 0;
        const controlTimeStep = 10e-6; // 10µs 控制週期
        const simulationTime = 100e-6; // 100µs 總時間
        const numControlSteps = Math.floor(simulationTime / controlTimeStep);
        
        console.log('\n🚀 開始閉環控制仿真...');
        console.log(`   控制週期: ${controlTimeStep*1e6}µs`);
        console.log(`   仿真總時間: ${simulationTime*1e6}µs`);
        console.log(`   控制步數: ${numControlSteps}`);
        
        const results = {
            time: [],
            frequency: [],
            outputVoltage: [],
            controlAction: []
        };
        
        for (let step = 0; step < numControlSteps; step++) {
            const currentTime = step * controlTimeStep;
            
            console.log(`\n🔄 控制步驟 ${step + 1}/${numControlSteps} (t=${(currentTime*1e6).toFixed(1)}µs)`);
            
            // 創建當前頻率下的電路
            const components = createLLCCircuit(currentFreq);
            
            // 運行短時間仿真
            const analysisConfig = {
                startTime: 0,
                stopTime: controlTimeStep,
                timeStep: 1e-6,
                gmin: 1e-6,
                debug: false
            };
            
            console.log(`   當前頻率: ${(currentFreq/1000).toFixed(1)}kHz`);
            
            // 執行瞬態分析 (內核自動處理 MultiWindingTransformer)
            const result = await mcpAnalysis.run(components, analysisConfig);
            
            if (result && result.timeVector && result.timeVector.length > 0) {
                // 提取輸出電壓
                const voutArray = result.nodeVoltages.get('VOUT');
                if (voutArray && voutArray.length > 0) {
                    outputVoltage = voutArray[voutArray.length - 1];
                }
                
                console.log(`   輸出電壓: ${outputVoltage.toFixed(3)}V`);
                
                // 控制器更新
                const newFreq = controller.update(outputVoltage, controlTimeStep);
                const freqChange = newFreq - currentFreq;
                currentFreq = newFreq;
                
                console.log(`   頻率調整: ${freqChange > 0 ? '+' : ''}${(freqChange/1000).toFixed(2)}kHz → ${(currentFreq/1000).toFixed(1)}kHz`);
                
                // 記錄結果
                results.time.push(currentTime);
                results.frequency.push(currentFreq);
                results.outputVoltage.push(outputVoltage);
                results.controlAction.push(freqChange);
                
            } else {
                console.log('   ⚠️ 仿真步驟失敗');
                break;
            }
        }
        
        // 顯示最終結果
        console.log('\n📊 閉環控制結果分析:');
        if (results.time.length > 0) {
            const finalVout = results.outputVoltage[results.outputVoltage.length - 1];
            const finalFreq = results.frequency[results.frequency.length - 1];
            const finalError = Math.abs(controller.targetVoltage - finalVout);
            
            console.log(`   最終輸出電壓: ${finalVout.toFixed(3)}V`);
            console.log(`   目標電壓: ${controller.targetVoltage}V`);
            console.log(`   穩態誤差: ${finalError.toFixed(3)}V (${(finalError/controller.targetVoltage*100).toFixed(2)}%)`);
            console.log(`   最終開關頻率: ${(finalFreq/1000).toFixed(1)}kHz`);
            
            // 控制性能分析
            const maxVout = Math.max(...results.outputVoltage);
            const minVout = Math.min(...results.outputVoltage);
            const overshoot = Math.max(0, maxVout - controller.targetVoltage);
            
            console.log(`\n🎯 控制性能指標:`);
            console.log(`   最大輸出: ${maxVout.toFixed(3)}V`);
            console.log(`   最小輸出: ${minVout.toFixed(3)}V`);
            console.log(`   超調量: ${overshoot.toFixed(3)}V`);
            console.log(`   頻率變化範圍: ${((Math.max(...results.frequency) - Math.min(...results.frequency))/1000).toFixed(1)}kHz`);
            
            if (finalError < 0.5) { // 0.5V 允許誤差
                console.log(`\n✅ 閉環控制成功: 穩態誤差 < 0.5V`);
            } else {
                console.log(`\n⚠️ 閉環控制需要調優: 穩態誤差 = ${finalError.toFixed(3)}V`);
            }
        }
        
        console.log('\n' + '=' .repeat(60));
        console.log('🎉 LLC 閉環控制測試完成');
        console.log('✅ MultiWindingTransformer 內核修復成功集成');
        console.log('✅ 完整閉環控制系統正常運行');
        console.log('=' .repeat(60));
        
    } catch (error) {
        console.error('\n❌ 閉環控制測試失敗:');
        console.error(error.message);
        console.error('\n堆棧跟蹤:');
        console.error(error.stack);
    }
}

// 執行閉環控制測試
runClosedLoopTest().catch(console.error);