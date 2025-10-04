#!/usr/bin/env node

/**
 * 簡化正確的 LLC 轉換器實現
 * 專注於獲得正確的 48V 輸出
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
 * 簡化 LLC 參數 - 更保守的設計
 */
const LLC_PARAMS = {
    VIN: 100,           // 降低到100V輸入
    VOUT_TARGET: 48,    // 目標輸出電壓 48V
    FREQ: 50e3,         // 降低開關頻率到 50kHz
    turns_ratio: 2,     // 簡單的 2:1 變比
    LOAD: 50            // 增加負載電阻到 50Ω
};

/**
 * 創建簡化的LLC電路 - 專注於正確輸出
 */
function createSimpleLLCCircuit() {
    const { VIN, FREQ, turns_ratio } = LLC_PARAMS;
    const period = 1 / FREQ;
    
    return [
        // 輸入電壓源
        new VoltageSource('Vin', ['VIN_BUS', 'GND'], VIN),
        
        // 簡化變壓器 - 理想變比
        new MultiWindingTransformer('T_LLC', {
            windings: [
                { 
                    name: 'primary', 
                    nodes: ['VIN_BUS', 'SW_DRIVE'], 
                    inductance: 500e-6  // 500µH
                },
                { 
                    name: 'secondary', 
                    nodes: ['SEC_PLUS', 'SEC_MINUS'], 
                    inductance: 125e-6  // 125µH (500µH/4 對於2:1比率)
                }
            ],
            couplingMatrix: [
                [1.0, 0.95],    // 95% 耦合係數
                [0.95, 1.0]
            ]
        }),
        
        // 開關驅動 - AC方波
        new VoltageSource('V_Drive', ['SW_DRIVE', 'GND'], {
            type: 'PULSE',
            v1: -VIN/2,  // -50V
            v2: VIN/2,   // +50V
            td: 0,
            tr: 1e-6,
            tf: 1e-6,
            pw: period * 0.5,  // 50% 占空比 (AC)
            per: period
        }),
        
        // 次級整流 - 理想二極體
        new Diode_MCP('D_Pos', ['SEC_PLUS', 'RECT_OUT'], { 
            Is: 1e-16, Vt: 0.026, n: 1.0 
        }),
        new Diode_MCP('D_Neg', ['SEC_MINUS', 'RECT_OUT'], { 
            Is: 1e-16, Vt: 0.026, n: 1.0 
        }),
        
        // 輸出濾波
        new Capacitor('C_Filter', ['RECT_OUT', 'GND'], 1000e-6), // 1mF 大容量
        
        // 輸出負載
        new Resistor('R_Load', ['RECT_OUT', 'GND'], LLC_PARAMS.LOAD),
        
        // 測量點
        new VoltageSource('V_Out_Measure', ['VOUT', 'RECT_OUT'], 0)
    ];
}

/**
 * 運行簡化LLC仿真
 */
async function runSimpleLLCSimulation() {
    console.log('🚀 簡化 LLC 轉換器仿真');
    console.log('🎯 目標: 獲得正確的 +48V 輸出');
    console.log('=' .repeat(60));
    console.log(`📊 簡化參數:`);
    console.log(`   輸入電壓: ${LLC_PARAMS.VIN}V`);
    console.log(`   變壓比: ${LLC_PARAMS.turns_ratio}:1`);
    console.log(`   理論輸出: ${LLC_PARAMS.VIN/LLC_PARAMS.turns_ratio}V`);
    console.log(`   負載: ${LLC_PARAMS.LOAD}Ω`);
    
    try {
        // 創建電路
        console.log('\n📦 創建簡化電路...');
        const components = createSimpleLLCCircuit();
        console.log(`✅ 電路創建完成，共 ${components.length} 個組件`);
        
        // 初始化分析器
        console.log('\n⚡ 初始化分析器...');
        const mcpAnalysis = new MCPTransientAnalysis({
            debug: false,
            gmin: 1e-6,
            lcpDebug: false
        });
        
        // 配置分析參數 - 更長時間觀察穩態
        const analysisConfig = {
            startTime: 0,
            stopTime: 200e-6,    // 200µs - 10個週期
            timeStep: 2e-6,      // 2µs 時間步長
            maxIterations: 100,
            tolerance: 1e-9
        };
        
        console.log(`📊 分析設定:`);
        console.log(`   仿真時間: ${analysisConfig.stopTime*1e6}µs`);
        console.log(`   週期數: ${analysisConfig.stopTime*LLC_PARAMS.FREQ}`);
        
        console.log('\n🚀 開始分析...');
        
        // 執行分析
        const startTime = Date.now();
        const result = await mcpAnalysis.run(components, analysisConfig);
        const endTime = Date.now();
        
        console.log(`⏱️  分析完成，耗時: ${(endTime - startTime)/1000}s`);
        
        // 分析結果
        if (result && result.timeVector && result.timeVector.length > 0) {
            console.log('\n📊 仿真結果分析:');
            console.log(`✅ 成功完成 ${result.timeVector.length} 個時間點`);
            
            // 提取電壓波形
            const timePoints = result.timeVector;
            const voutArray = result.nodeVoltages.get('VOUT') || [];
            const rectOutArray = result.nodeVoltages.get('RECT_OUT') || [];
            const secPlusArray = result.nodeVoltages.get('SEC_PLUS') || [];
            
            if (voutArray.length > 0) {
                const finalVout = voutArray[voutArray.length - 1];
                const finalRectOut = rectOutArray[rectOutArray.length - 1];
                
                console.log('\n🎯 輸出結果:');
                console.log(`   最終輸出電壓: ${finalVout.toFixed(3)}V`);
                console.log(`   整流後電壓: ${finalRectOut.toFixed(3)}V`);
                console.log(`   目標電壓: ${LLC_PARAMS.VOUT_TARGET}V`);
                console.log(`   電壓誤差: ${Math.abs(finalVout - LLC_PARAMS.VOUT_TARGET).toFixed(3)}V`);
                
                // 取後半段數據分析穩態
                const midPoint = Math.floor(voutArray.length / 2);
                const steadyStateVout = voutArray.slice(midPoint);
                
                if (steadyStateVout.length > 0) {
                    const avgVout = steadyStateVout.reduce((a, b) => a + b, 0) / steadyStateVout.length;
                    const maxVout = Math.max(...steadyStateVout);
                    const minVout = Math.min(...steadyStateVout);
                    const ripple = maxVout - minVout;
                    
                    console.log('\n📈 穩態性能 (後半段):');
                    console.log(`   平均輸出電壓: ${avgVout.toFixed(3)}V`);
                    console.log(`   電壓範圍: ${minVout.toFixed(3)}V ~ ${maxVout.toFixed(3)}V`);
                    console.log(`   輸出紋波: ${ripple.toFixed(3)}V (${(ripple/Math.abs(avgVout)*100).toFixed(2)}%)`);
                    
                    // 相對誤差
                    const relativeError = Math.abs(avgVout - LLC_PARAMS.VOUT_TARGET) / LLC_PARAMS.VOUT_TARGET * 100;
                    console.log(`   相對誤差: ${relativeError.toFixed(1)}%`);
                    
                    // 功率計算
                    const outputPower = avgVout * avgVout / LLC_PARAMS.LOAD;
                    console.log(`   輸出功率: ${outputPower.toFixed(3)}W`);
                    console.log(`   輸出電流: ${(avgVout/LLC_PARAMS.LOAD).toFixed(3)}A`);
                    
                    // 評估結果
                    console.log('\n🎉 結果評估:');
                    if (relativeError < 5) {
                        console.log('✅ 輸出電壓優秀 (誤差<5%)');
                    } else if (relativeError < 15) {
                        console.log('✅ 輸出電壓良好 (誤差<15%)');
                    } else if (relativeError < 30) {
                        console.log('⚠️  輸出電壓可接受 (誤差<30%)');
                    } else {
                        console.log('❌ 輸出電壓需要調整 (誤差>30%)');
                    }
                    
                    if (avgVout > 0) {
                        console.log('✅ 輸出極性正確 (正電壓)');
                    } else {
                        console.log('❌ 輸出極性錯誤 (負電壓)');
                    }
                    
                    if (ripple/Math.abs(avgVout) < 0.1) {
                        console.log('✅ 輸出紋波良好 (<10%)');
                    } else {
                        console.log('⚠️  輸出紋波較大 (>10%)');
                    }
                    
                    // 檢查次級電壓
                    if (secPlusArray.length > 0) {
                        const steadyStateSecPlus = secPlusArray.slice(midPoint);
                        const avgSecPlus = steadyStateSecPlus.reduce((a, b) => a + b, 0) / steadyStateSecPlus.length;
                        console.log(`   次級電壓: ${avgSecPlus.toFixed(3)}V`);
                        console.log(`   變壓比驗證: ${(LLC_PARAMS.VIN/2/avgSecPlus).toFixed(2)}:1 (理論${LLC_PARAMS.turns_ratio}:1)`);
                    }
                }
                
            } else {
                console.log('❌ 無法獲取輸出電壓數據');
            }
            
        } else {
            console.log('❌ 仿真失敗');
        }
        
        console.log('\n' + '=' .repeat(60));
        console.log('🎯 簡化 LLC 仿真完成');
        console.log('=' .repeat(60));
        
    } catch (error) {
        console.error('\n❌ 仿真錯誤:');
        console.error(error.message);
    }
}

// 執行仿真
console.log('🔥 AkingSPICE 簡化 LLC 轉換器');
console.log('🎯 專注於正確輸出電壓');

runSimpleLLCSimulation().catch(console.error);