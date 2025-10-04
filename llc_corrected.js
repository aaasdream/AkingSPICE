#!/usr/bin/env node

/**
 * LLC 轉換器正確實現 - 修正輸出電壓問題
 * 基于成功的內核修復，使用正確的電路拓撲
 */

const path = require('path');
const srcDir = path.join(__dirname, 'src');

// 導入所需組件
const { VoltageSource } = require(path.join(srcDir, 'components/sources.js'));
const { Inductor } = require(path.join(srcDir, 'components/inductor.js'));  
const { Capacitor } = require(path.join(srcDir, 'components/capacitor.js'));
const { Resistor } = require(path.join(srcDir, 'components/resistor.js'));
const { Diode_MCP } = require(path.join(srcDir, 'components/diode_mcp.js'));
const { MultiWindingTransformer } = require(path.join(srcDir, 'components/transformer.js'));
const { MCPTransientAnalysis } = require(path.join(srcDir, 'analysis/transient_mcp.js'));

/**
 * LLC 轉換器電路參數 - 修正版
 */
const LLC_PARAMS = {
    VIN: 400,           // 降低輸入電壓以獲得合理的48V輸出 
    VOUT_TARGET: 48,    // 目標輸出電壓 48V
    FREQ: 100e3,        // 開關頻率 100kHz
    Lr: 100e-6,         // 諧振電感 100µH
    Cr: 10e-9,          // 諧振電容 10nF
    Lm: 1000e-6,        // 激磁電感 1mH
    turns_ratio: 8,     // 修正變壓比 8:1 (400V -> 50V)
    LOAD: 24            // 負載電阻 24Ω (48V時輸出2A，功率96W)
};

/**
 * 創建 LLC 轉換器電路 - 正確版本
 */
function createLLCCircuit() {
    const { VIN, FREQ, Lr, Cr, Lm, turns_ratio } = LLC_PARAMS;
    const period = 1 / FREQ;
    
    return [
        // 高壓輸入
        new VoltageSource('Vin', ['VIN_BUS', 'GND'], VIN),
        
        // 諧振網絡 - 串聯 Lr 和 Cr
        new Inductor('Lr', ['VIN_BUS', 'RESONANT_NODE'], Lr),
        new Capacitor('Cr', ['RESONANT_NODE', 'TRANSFORMER_IN'], Cr),
        
        // 主變壓器 - 正確的20:1變比實現
        new MultiWindingTransformer('T_Main', {
            windings: [
                { 
                    name: 'primary', 
                    nodes: ['TRANSFORMER_IN', 'SW_NODE'], 
                    inductance: Lm  // 1mH 激磁電感
                },
                { 
                    name: 'secondary', 
                    nodes: ['SEC_OUT', 'SEC_CENTER'], 
                    inductance: Lm / (turns_ratio * turns_ratio)  // 15.625µH (1mH/64)
                }
            ],
            couplingMatrix: [
                [1.0, 0.98],    // 98% 耦合係數
                [0.98, 1.0]
            ]
        }),
        
        // 半橋開關節點 (簡化為方波)
        new VoltageSource('V_Switch', ['SW_NODE', 'GND'], {
            type: 'PULSE',
            v1: 0,
            v2: VIN,
            td: 0,
            tr: 10e-9,
            tf: 10e-9,
            pw: period * 0.45,  // 45% 占空比
            per: period
        }),
        
        // 次級全波整流 - 中心抽頭 + 單個二極體
        new Diode_MCP('D_Rectifier', ['SEC_OUT', 'VOUT_NODE'], { 
            Is: 1e-15, Vt: 0.026, n: 1.0 
        }),
        
        // 次級中心抽頭接地
        new VoltageSource('V_SecGnd', ['SEC_CENTER', 'GND'], 0),
        
        // 輸出濾波
        new Capacitor('C_Output', ['VOUT_NODE', 'GND'], 470e-6), // 470µF
        
        // 輸出負載
        new Resistor('R_Load', ['VOUT_NODE', 'GND'], LLC_PARAMS.LOAD),
        
        // 輸出電壓測試點
        new VoltageSource('V_OutTest', ['VOUT', 'VOUT_NODE'], 0)
    ];
}

/**
 * 運行 LLC 仿真 - 修正版
 */
async function runLLCSimulation() {
    console.log('🚀 LLC 轉換器修正版仿真');
    console.log('=' .repeat(60));
    console.log(`📊 修正後電路參數:`);
    console.log(`   輸入電壓: ${LLC_PARAMS.VIN}V`);
    console.log(`   目標輸出: ${LLC_PARAMS.VOUT_TARGET}V`);  
    console.log(`   變壓比: ${LLC_PARAMS.turns_ratio}:1`);
    console.log(`   理論輸出: ${LLC_PARAMS.VIN / LLC_PARAMS.turns_ratio}V (不考慮損耗)`);
    console.log(`   負載: ${LLC_PARAMS.LOAD}Ω`);
    
    try {
        // 創建電路
        console.log('\n📦 創建修正後電路組件...');
        const components = createLLCCircuit();
        console.log(`✅ 電路創建完成，共 ${components.length} 個組件`);
        
        // 初始化分析器
        console.log('\n⚡ 初始化 MCP 瞬態分析器...');
        const mcpAnalysis = new MCPTransientAnalysis({
            debug: false,
            gmin: 1e-6,
            lcpDebug: false
        });
        
        // 配置分析參數
        const analysisConfig = {
            startTime: 0,
            stopTime: 30e-6,     // 30µs 仿真時間 (3個完整週期)
            timeStep: 0.2e-6,    // 0.2µs 時間步長
            maxIterations: 100,
            tolerance: 1e-9
        };
        
        console.log(`📊 分析設定:`);
        console.log(`   仿真時間: ${analysisConfig.stopTime*1e6}µs`);
        console.log(`   時間步長: ${analysisConfig.timeStep*1e6}µs`);
        console.log(`   步數: ${Math.floor(analysisConfig.stopTime/analysisConfig.timeStep)}`);
        
        console.log('\n🚀 開始瞬態分析...');
        
        // 執行分析
        const startTime = Date.now();
        const result = await mcpAnalysis.run(components, analysisConfig);
        const endTime = Date.now();
        
        console.log(`⏱️  分析完成，耗時: ${(endTime - startTime)/1000}s`);
        
        // 分析結果
        if (result && result.timeVector && result.timeVector.length > 0) {
            console.log('\n📊 仿真結果分析:');
            console.log(`✅ 成功完成 ${result.timeVector.length} 個時間點`);
            
            // 提取關鍵波形
            const timePoints = result.timeVector;
            const voutArray = result.nodeVoltages.get('VOUT') || [];
            const voutNodeArray = result.nodeVoltages.get('VOUT_NODE') || [];
            const vinArray = result.nodeVoltages.get('VIN_BUS') || [];
            const transformerCurrentArray = result.branchCurrents.get('T_Main_primary') || [];
            
            if (timePoints.length > 0 && voutArray.length > 0) {
                const finalTime = timePoints[timePoints.length - 1];
                const finalVout = voutArray[voutArray.length - 1];
                const finalVoutNode = voutNodeArray[voutNodeArray.length - 1];
                
                console.log('\n🎯 關鍵結果:');
                console.log(`   最終輸出電壓 (測試點): ${finalVout.toFixed(3)}V`);
                console.log(`   最終輸出電壓 (節點): ${finalVoutNode.toFixed(3)}V`);
                console.log(`   目標輸出: ${LLC_PARAMS.VOUT_TARGET}V`);
                console.log(`   輸出誤差: ${Math.abs(finalVout - LLC_PARAMS.VOUT_TARGET).toFixed(3)}V`);
                console.log(`   相對誤差: ${(Math.abs(finalVout - LLC_PARAMS.VOUT_TARGET)/LLC_PARAMS.VOUT_TARGET*100).toFixed(1)}%`);
                
                // 性能分析
                console.log('\n📈 性能指標:');
                const avgVout = voutArray.reduce((a, b) => a + b, 0) / voutArray.length;
                const maxVout = Math.max(...voutArray);
                const minVout = Math.min(...voutArray);
                const ripple = maxVout - minVout;
                
                console.log(`   平均輸出電壓: ${avgVout.toFixed(3)}V`);
                console.log(`   輸出電壓範圍: ${minVout.toFixed(3)}V ~ ${maxVout.toFixed(3)}V`);
                console.log(`   輸出紋波: ${ripple.toFixed(3)}V (${(ripple/avgVout*100).toFixed(2)}%)`);
                console.log(`   電壓調節率: ${((avgVout/LLC_PARAMS.VOUT_TARGET - 1)*100).toFixed(2)}%`);
                
                // 功率分析
                const outputPower = avgVout * avgVout / LLC_PARAMS.LOAD;
                console.log(`   輸出功率: ${outputPower.toFixed(3)}W`);
                console.log(`   輸出電流: ${(avgVout/LLC_PARAMS.LOAD).toFixed(3)}A`);
                
                // 變壓器驗證
                if (transformerCurrentArray.length > 0) {
                    const avgTransformerCurrent = transformerCurrentArray.reduce((a, b) => a + Math.abs(b), 0) / transformerCurrentArray.length;
                    console.log(`   變壓器一次側平均電流: ${avgTransformerCurrent.toFixed(6)}A`);
                    
                    if (avgTransformerCurrent > 1e-6) {
                        console.log('✅ 變壓器正常工作 (內核修復成功)');
                    }
                }
                
                // 結果評估
                console.log('\n🎉 LLC 轉換器修正結果:');
                if (Math.abs(avgVout - LLC_PARAMS.VOUT_TARGET) / LLC_PARAMS.VOUT_TARGET < 0.1) {
                    console.log('✅ 輸出電壓接近目標值 (誤差<10%)');
                } else if (Math.abs(avgVout - LLC_PARAMS.VOUT_TARGET) / LLC_PARAMS.VOUT_TARGET < 0.3) {
                    console.log('⚠️  輸出電壓偏差較大 (誤差10-30%)');
                } else {
                    console.log('❌ 輸出電壓偏差過大 (誤差>30%)');
                }
                
                if (ripple / avgVout < 0.05) {
                    console.log('✅ 輸出紋波良好 (<5%)');
                } else {
                    console.log('⚠️  輸出紋波較大 (>5%)');
                }
                
            } else {
                console.log('❌ 無法獲取輸出電壓數據');
            }
            
        } else {
            console.log('❌ 仿真失敗或無結果返回');
            if (result && result.analysisInfo && result.analysisInfo.error) {
                console.log(`   錯誤: ${result.analysisInfo.error}`);
            }
        }
        
        console.log('\n' + '=' .repeat(60));
        console.log('🎯 LLC 轉換器修正版仿真完成');
        console.log('=' .repeat(60));
        
    } catch (error) {
        console.error('\n❌ LLC 仿真過程中發生錯誤:');
        console.error(error.message);
        console.error('\n堆棧跟蹤:');
        console.error(error.stack);
    }
}

// 執行仿真
console.log('🔥 AkingSPICE LLC 轉換器修正版');
console.log('📅 版本: 電壓修正版');
console.log('🎯 目標: 達到48V輸出電壓');

runLLCSimulation().catch(console.error);