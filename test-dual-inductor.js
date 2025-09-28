/**
 * 🔧 雙電感測試 - 驗證多個電感的 DC 分析
 */

import { 
    AkingSPICE,
    VoltageSource, 
    Resistor, 
    Inductor 
} from './src/index.js';

async function runDualInductorTest() {
    console.log('🔧 測試雙電感 DC 分析...\n');
    
    const solver = new AkingSPICE();
    
    try {
        solver.reset();
        
        // 雙電感電路（非耦合）
        solver.components = [
            new VoltageSource('V1', ['vin', '0'], 12),     // 12V 電源
            new Resistor('R1', ['vin', 'n1'], 100),        // 100Ω 電阻
            new Inductor('L1', ['n1', 'n2'], 10e-3),       // 10mH 電感 1
            new Inductor('L2', ['n2', '0'], 5e-3),         // 5mH 電感 2
        ];
        
        solver.isInitialized = true;

        console.log('✅ 雙電感電路構建成功');
        const circuitInfo = solver.getCircuitInfo();
        console.log(`📊 電路統計: ${circuitInfo.componentCount} 個組件, ${circuitInfo.nodeList.length} 個節點`);
        
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
            console.log(`   V(n2): ${dcResult.getNodeVoltage('n2').toFixed(3)}V`);
            console.log(`   V(0): ${dcResult.getNodeVoltage('0').toFixed(3)}V (GND)`);
            
            console.log('📊 支路電流:');
            console.log(`   I(V1): ${(dcResult.getBranchCurrent('V1') * 1000).toFixed(3)}mA`);
            console.log(`   I(L1): ${(dcResult.getBranchCurrent('L1') * 1000).toFixed(3)}mA`);
            console.log(`   I(L2): ${(dcResult.getBranchCurrent('L2') * 1000).toFixed(3)}mA`);

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

    console.log('\n🎯 雙電感測試完成！');
}

// 執行測試
runDualInductorTest();