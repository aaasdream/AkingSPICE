/**
 * 🧪 LLC 800V→48V 轉換器測試 - 新變壓器模型驗證
 * 測試重寫後的 MultiWindingTransformer 是否能正確工作
 * 🔥 版本 2.0 - 已更新至符合當前的 AkingSPICE API
 */

import { 
    AkingSPICE,
    VoltageSource, 
    Resistor, 
    Inductor, 
    Capacitor,
    MultiWindingTransformer 
} from './src/index.js';

async function runTest() {
    console.log('🔧 測試新的 MultiWindingTransformer 模型...\n');

    // 1. 首先測試變壓器本身是否正常創建
    console.log('📋 步驟 1: 創建變壓器組件');
    let transformer;
    try {
        transformer = new MultiWindingTransformer('T1', {
            windings: [
                { name: 'primary', nodes: ['p1', 'p2'], inductance: 400e-6, resistance: 0.05 },
                { name: 'secondary', nodes: ['s1', 's2'], inductance: 25e-6, resistance: 0.01 }
            ],
            couplingMatrix: [[1.0, 0.95], [0.95, 1.0]]
        });
        
        console.log('✅ 變壓器創建成功:', transformer.toString());
        const inductors = transformer.getComponents();
        console.log(`📊 變壓器分解為 ${inductors.length} 個電感組件`);
        inductors.forEach((inductor) => {
            console.log(`   - ${inductor.toString()}, 耦合數量: ${inductor.couplings?.length || 0}`);
        });

    } catch (error) {
        console.error('❌ 變壓器創建失敗:', error.message);
        process.exit(1);
    }

    console.log('\n📋 步驟 2: 構建簡化的 LLC 測試電路');
    const solver = new AkingSPICE();
    
    try {
        solver.reset();
        
        const transformerComponents = transformer.getComponents();

        solver.components = [
            new VoltageSource('Vin', ['vin', '0'], 800),
            new Capacitor('Cr', ['vin', 'cr_node'], 100e-9),
            new Inductor('Lr', ['cr_node', 'p1'], 50e-6),
            
            // 🔥 核心：將變壓器分解出的耦合電感加入電路
            ...transformerComponents,
            
            // 為一次側提供到地的直流路徑，避免浮動節點
            new Resistor('R_primary_dc_path', ['p2', '0'], 10e6),
            
            // 為次級提供到地的直流路徑，避免浮動節點
            new Resistor('R_secondary_dc_path', ['s2', '0'], 10e6),

            // 次級負載（連接在 s1 和 s2 之間）
            new Resistor('R_load', ['s1', 's2'], 0.48) // 48V/100A = 0.48Ω
        ];
        
        solver.isInitialized = true;

        console.log('✅ LLC 測試電路構建成功');
        const circuitInfo = solver.getCircuitInfo();
        console.log(`📊 電路統計: ${circuitInfo.componentCount} 個組件, ${circuitInfo.nodeList.length} 個節點`);
        
        const validation = solver.validateCircuit();
        if (!validation.valid) {
            throw new Error(`電路驗證失敗: ${validation.issues.join(', ')}`);
        }
        console.log(`✅ 電路驗證通過`);

    } catch (error) {
        console.error('❌ 電路構建失敗:', error.message);
        console.error('   詳細錯誤:', error.stack);
        process.exit(1);
    }

    console.log('\n📋 步驟 3: 執行 DC 分析測試');

    try {
        const dcResult = await solver.runDCAnalysis();
        
        if (dcResult && dcResult.converged) {
            console.log('✅ DC 分析成功完成!');
            console.log('📊 關鍵節點電壓:');
            
            const keyNodes = ['vin', 'cr_node', 'p1', 'p2', 's1', 's2'];
            keyNodes.forEach(node => {
                console.log(`   V(${node}): ${dcResult.getNodeVoltage(node).toFixed(3)}V`);
            });
            
            console.log('📊 關鍵組件電流:');
            const keyComponents = ['Vin', 'Lr', 'T1_primary', 'T1_secondary'];
            keyComponents.forEach(compName => {
                const current = dcResult.getBranchCurrent(compName);
                if (current !== undefined) {
                     console.log(`   I(${compName}): ${(current * 1000).toFixed(3)}mA`);
                }
            });

        } else {
            console.error('❌ DC 分析失敗');
            if (dcResult && dcResult.analysisInfo && dcResult.analysisInfo.error) {
                console.error('   錯誤信息:', dcResult.analysisInfo.error);
            }
        }
        
    } catch (error) {
        console.error('❌ 分析執行錯誤:', error.message);
        console.error('   詳細錯誤:', error.stack);
    }

    console.log('\n🎯 測試完成！');
    console.log('如果以上所有步驟都成功，說明修正後的變壓器模型已能正確整合並參與求解。');
}

// 執行測試
runTest();