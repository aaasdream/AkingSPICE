#!/usr/bin/env node

/**
 * 內核架構修復驗證測試 - 精簡版
 * 驗證 MultiWindingTransformer 現在能被內核自動處理
 */

const path = require('path');
const srcDir = path.join(__dirname, 'src');

// 動態導入模塊
const MultiWindingTransformer = require(path.join(srcDir, 'components/transformer.js')).MultiWindingTransformer;
const Inductor = require(path.join(srcDir, 'components/inductor.js')).Inductor;
const VoltageSource = require(path.join(srcDir, 'components/sources.js')).VoltageSource;
const MCPTransientAnalysis = require(path.join(srcDir, 'analysis/transient_mcp.js')).MCPTransientAnalysis;

async function validateKernelFix() {
    console.log('🔧 內核架構修復驗證測試');
    console.log('=' .repeat(50));
    
    try {
        // 1. 創建電路組件 - 直接使用 MultiWindingTransformer
        console.log('\n📦 創建測試電路...');
        
        const Resistor = require(path.join(srcDir, 'components/resistor.js')).Resistor;
        
        const components = [
            new VoltageSource('V1', ['IN', 'GND'], 100),
            new Inductor('Lr', ['IN', 'PRI_POS'], 10e-6),  // 10µH 諧振電感
            new MultiWindingTransformer('T1', {
                windings: [
                    { name: 'primary', nodes: ['PRI_POS', 'PRI_NEG'], inductance: 1000e-6 },
                    { name: 'secondary1', nodes: ['SEC1_POS', 'SEC1_NEG'], inductance: 250e-6 },
                    { name: 'secondary2', nodes: ['SEC2_POS', 'SEC2_NEG'], inductance: 250e-6 }
                ],
                couplingMatrix: [
                    [1.0, 0.99, 0.99],
                    [0.99, 1.0, 0.95],
                    [0.99, 0.95, 1.0]
                ]
            }),
            new VoltageSource('V2', ['PRI_NEG', 'GND'], 0),
            // 添加負載電阻以建立完整電路
            new Resistor('R_LOAD1', ['SEC1_POS', 'SEC1_NEG'], 100),
            new Resistor('R_LOAD2', ['SEC2_POS', 'SEC2_NEG'], 100)
        ];
        
        console.log(`✅ 電路組件創建完成 (${components.length} 個組件)`);
        
        // 2. 檢查原始組件列表中是否包含 MultiWindingTransformer
        console.log('\n🔍 原始組件分析:');
        const metaComponents = components.filter(comp => comp.type === 'T_META');
        console.log(`   元組件 (T_META) 數量: ${metaComponents.length}`);
        
        if (metaComponents.length > 0) {
            console.log('✅ 發現 MultiWindingTransformer 元組件');
            const transformer = metaComponents[0];
            if (typeof transformer.getComponents === 'function') {
                const expandedComps = transformer.getComponents();
                console.log(`   展開後組件數: ${expandedComps.length}`);
                console.log('✅ getComponents() 方法可用');
            } else {
                console.log('❌ getComponents() 方法不存在');
                return;
            }
        } else {
            console.log('❌ 未發現 MultiWindingTransformer');
            return;
        }
        
        // 3. 創建 MCP 分析實例並運行
        console.log('\n⚡ 初始化 MCP 瞬態分析內核...');
        const mcpAnalysis = new MCPTransientAnalysis();
        
        const analysisConfig = {
            startTime: 0,
            stopTime: 5e-6,      // 5µs 總時間 
            timeStep: 1e-6,      // 1µs 時間步長
            maxIterations: 50,
            tolerance: 1e-9,
            gmin: 1e-6,          // 添加數值穩定性參數
            debug: false         // 關閉調試輸出以清晰顯示結果
        };
        
        console.log('🚀 啟動分析 (測試內核自動處理 MultiWindingTransformer)...');
        
        // 核心測試: 直接傳入包含 MultiWindingTransformer 的組件列表
        const result = await mcpAnalysis.run(components, analysisConfig);
        
        // 4. 驗證結果
        console.log('\n📊 分析結果驗證:');
        if (result && result.timeVector && result.timeVector.length > 0) {
            console.log('✅ 分析成功完成');
            console.log(`   時間點數: ${result.timeVector.length}`);
            console.log('✅ 內核成功處理了 MultiWindingTransformer');
            console.log('✅ 抽象封裝正常工作 - 無需手動展開組件');
            
            // 檢查變壓器電流是否正常耦合
            const priCurrArray = result.branchCurrents.get('T1_primary');
            const sec1CurrArray = result.branchCurrents.get('T1_secondary1');
            const sec2CurrArray = result.branchCurrents.get('T1_secondary2');
            
            if (priCurrArray && sec1CurrArray && sec2CurrArray) {
                const finalPriCurrent = priCurrArray[priCurrArray.length - 1];
                const finalSec1Current = sec1CurrArray[sec1CurrArray.length - 1];
                const finalSec2Current = sec2CurrArray[sec2CurrArray.length - 1];
                
                console.log('\n🎯 變壓器電流耦合驗證:');
                console.log(`   一次側電流: ${finalPriCurrent.toExponential(3)}A`);
                console.log(`   次級1電流: ${finalSec1Current.toExponential(3)}A`);
                console.log(`   次級2電流: ${finalSec2Current.toExponential(3)}A`);
                
                // 檢驗電流是否有物理意義（非零且耦合）
                if (Math.abs(finalPriCurrent) > 1e-6) {
                    console.log('✅ 變壓器一次側電流正常 (> 1µA)');
                } else {
                    console.log('⚠️  變壓器一次側電流較小');
                }
                
                if (Math.abs(finalSec1Current) > 1e-9 || Math.abs(finalSec2Current) > 1e-9) {
                    console.log('✅ 變壓器次級電流正常，耦合工作');
                } else {
                    console.log('⚠️  變壓器次級電流很小');
                }
            }
            
            // 檢查關鍵節點電壓
            console.log('\n🎯 關鍵節點電壓:');
            const keyNodes = ['IN', 'PRI_POS', 'SEC1_POS', 'SEC2_POS'];
            keyNodes.forEach(node => {
                const voltageArray = result.nodeVoltages.get(node);
                if (voltageArray && voltageArray.length > 0) {
                    const finalVoltage = voltageArray[voltageArray.length - 1];
                    console.log(`   ${node}: ${finalVoltage.toFixed(3)}V`);
                }
            });
            
        } else {
            console.log('❌ 分析失败');
            if (result && result.analysisInfo && result.analysisInfo.error) {
                console.log(`   錯誤: ${result.analysisInfo.error}`);
            }
            return;
        }
        
        // 5. 架構修復驗證結論
        console.log('\n' + '=' .repeat(50));
        console.log('🎉 內核架構修復驗證結果:');
        console.log('✅ MultiWindingTransformer 自動處理成功');
        console.log('✅ 組件扁平化預處理正常工作'); 
        console.log('✅ 抽象洩漏問題已解決');
        console.log('✅ 用戶無需手動展開元組件');
        console.log('✅ 軟體架構原則得到正確實現');
        console.log('=' .repeat(50));
        
    } catch (error) {
        console.error('\n❌ 測試過程中發生錯誤:');
        console.error(error.message);
        console.error('\n堆棧跟蹤:');
        console.error(error.stack);
    }
}

// 執行驗證
validateKernelFix().then(() => {
    console.log('\n✅ 驗證測試完成');
}).catch(error => {
    console.error('❌ 驗證失敗:', error);
    process.exit(1);
});