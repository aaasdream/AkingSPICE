/**
 * 🔧 簡單電感測試 - 驗證基本 DC 分析是否正常
 */

import { 
    AkingSPICE,
    VoltageSource, 
    Resistor, 
    Inductor 
} from './src/index.js';

async function runSimpleTest() {
    console.log('🔧 測試基本電感 DC 分析...\n');
    
    const solver = new AkingSPICE();
    
    try {
        solver.reset();
        
        // 簡單的 RL 電路
        solver.components = [
            new VoltageSource('V1', ['vin', '0'], 12),     // 12V 電源
            new Resistor('R1', ['vin', 'n1'], 100),        // 100Ω 電阻
            new Inductor('L1', ['n1', '0'], 10e-3)         // 10mH 電感
        ];
        
        solver.isInitialized = true;

        console.log('✅ 簡單 RL 電路構建成功');
        const circuitInfo = solver.getCircuitInfo();
        console.log(`📊 電路統計: ${circuitInfo.componentCount} 個組件, ${circuitInfo.nodeList.length} 個節點`);
        
        console.log('📋 組件列表:');
        solver.components.forEach((comp, i) => {
            console.log(`   ${i+1}. ${comp.toString()}`);
        });

        const validation = solver.validateCircuit();
        if (!validation.valid) {
            throw new Error(`電路驗證失敗: ${validation.issues.join(', ')}`);
        }
        console.log('✅ 電路驗證通過\n');

        console.log('📋 執行 DC 分析...');
        const dcResult = await solver.runDCAnalysis();
        
        if (dcResult && dcResult.converged) {
            console.log('✅ DC 分析成功完成!');
            console.log('📊 節點電壓:');
            console.log(`   V(vin): ${dcResult.getNodeVoltage('vin').toFixed(3)}V`);
            console.log(`   V(n1): ${dcResult.getNodeVoltage('n1').toFixed(3)}V`);
            console.log(`   V(0): ${dcResult.getNodeVoltage('0').toFixed(3)}V (GND)`);
            
            console.log('📊 支路電流:');
            console.log(`   I(V1): ${(dcResult.getBranchCurrent('V1') * 1000).toFixed(3)}mA`);
            console.log(`   I(L1): ${(dcResult.getBranchCurrent('L1') * 1000).toFixed(3)}mA`);
            
            // DC 分析中，電感應該表現為短路，所以 V(n1) 應該約等於 0V
            const n1_voltage = dcResult.getNodeVoltage('n1');
            if (Math.abs(n1_voltage) < 0.1) {
                console.log('✅ 電感在 DC 分析中正確表現為短路');
            } else {
                console.log('⚠️ 電感在 DC 分析中沒有表現為短路');
            }

        } else {
            console.error('❌ DC 分析失敗');
            if (dcResult && dcResult.analysisInfo && dcResult.analysisInfo.error) {
                console.error('   錯誤信息:', dcResult.analysisInfo.error);
            }
        }
        
    } catch (error) {
        console.error('❌ 測試失敗:', error.message);
        console.error('   詳細錯誤:', error.stack);
    }

    console.log('\n🎯 簡單測試完成！');
}

// 執行測試
runSimpleTest();