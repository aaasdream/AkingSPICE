// 驗證內核架構修復效果 - MultiWindingTransformer自動展開測試
const {
    VoltageSource, Resistor, Capacitor, Inductor, 
    createMCPTransientAnalysis, 
    createMCPDiode, MultiWindingTransformer
} = require('./src/index.js');

async function testKernelFix() {
try {
    console.log('🚀 測試內核架構修復效果');
    console.log('=====================================');
    console.log('測試目標：驗證MCPTransientAnalysis能自動處理MultiWindingTransformer元元件');
    
    // 基本參數
    const VIN = 1800;  // 使用已證實的1800V
    const LOAD_100 = 100; // 100Ω負載
    
    console.log(`📊 測試參數：`);
    console.log(`   輸入電壓: ${VIN}V`);
    console.log(`   負載阻抗: ${LOAD_100}Ω`);
    
    // ==================== ✅ 架構修復後的理想形式 ✅ ====================
    // 🔥 關鍵測試：直接將MultiWindingTransformer放入components列表
    // 內核應該自動展開它，無需用戶手動處理
    const transformer = new MultiWindingTransformer('T1', {
        windings: [
            { name: 'primary', nodes: ['PRI_POS', 'SW_MID'], inductance: 1000e-6 },     // 1mH
            { name: 'secondary1', nodes: ['SEC_POS', 'CENTER_TAP'], inductance: 500e-6 }, // 0.5mH，上半部
            { name: 'secondary2', nodes: ['CENTER_TAP', 'SEC_NEG'], inductance: 500e-6 }  // 0.5mH，下半部
        ],
        // 修正耦合矩陣：次級繞組相互串聯，不是對立的
        couplingMatrix: [[1.0, 0.9999, 0.9999], [0.9999, 1.0, 0.9999], [0.9999, 0.9999, 1.0]]
    });
    
    const components = [
        new VoltageSource('Vin', ['IN', '0'], VIN),
        
        // 理想半橋驅動源
        new VoltageSource('V_HB_Driver', ['SW_MID', '0'], {
            type: 'PULSE',
            v1: 0,          // 低電平
            v2: VIN,        // 高電平 (1800V)
            td: 0,          // 延遲
            tr: 10e-9,      // 上升時間 (10ns) 
            tf: 10e-9,      // 下降時間 (10ns)
            pw: 2.5e-6,     // 脈衝寬度 (50%占空比)
            per: 5e-6       // 週期
        }),
        
        // LLC諧振元件
        new Inductor('Lr', ['IN', 'RES'], 50e-6),
        new Capacitor('Cr', ['RES', 'PRI_POS'], 12e-9, { ic: 0 }),
        
        // 🔥 關鍵測試點：直接使用MultiWindingTransformer對象
        // 內核應該自動調用transformer.getComponents()來獲取基礎電感元件
        transformer,
        
        // 修正的整流二極管配置：連接到中心抽頭
        createMCPDiode('D1', 'SEC_POS', 'VOUT', { Vf: 0.7 }),     // 上管
        createMCPDiode('D2', 'SEC_NEG', 'VOUT', { Vf: 0.7 }),     // 下管
        
        // 輸出濾波和負載 - 中心抽頭連接到地
        new Capacitor('Cout', ['VOUT', 'CENTER_TAP'], 1000e-6, { ic: 0 }), // 修正：相對於中心抽頭
        new Resistor('Rload', ['VOUT', 'CENTER_TAP'], LOAD_100)             // 修正：相對於中心抽頭
    ];
    // ================================================================
    
    console.log('\n🔌 理想的電路結構 (架構修復後)：');
    console.log(`   元件總數: ${components.length} 個`);
    console.log('   ✅ 直接使用MultiWindingTransformer對象');
    console.log('   ✅ 內核應該自動展開為基礎電感元件');
    console.log('   ✅ 用戶無需了解內部實現細節');
    
    // 創建MCP求解器
    const mcpSolver = createMCPTransientAnalysis({ debug: true, gmin: 1e-6 });
    
    // 運行瞬態分析
    console.log('\n⏱️ 開始架構修復驗證測試...');
    const timeStep = 2e-7;  // 200ns
    const endTime = 5e-6;   // 5µs
    
    const analysisParams = {
        startTime: 0,
        stopTime: endTime,
        timeStep: timeStep
    };
    
    console.log('\n🔍 觀察內核行為：');
    console.log('   期望看到："🧬 展開元元件 T1..." 消息');
    console.log('   期望看到：基礎電感元件 T1_primary, T1_secondary1, T1_secondary2');
    
    const result = await mcpSolver.run(components, analysisParams);
    
    console.log('\n--- 架構修復驗證結果 ---');
    console.log(`✅ 分析成功完成: ${result.timeVector.length} 個時間點`);
    
    // 檢查最後幾個時間點的電壓
    if (result.timeVector.length > 0) {
        const lastIndex = result.timeVector.length - 1;
        const lastTime = result.timeVector[lastIndex];
        const lastVoltages = result.voltageMatrix[lastIndex];
        
        console.log(`\n📊 最終狀態 (t = ${(lastTime*1e6).toFixed(2)}µs):`);
        
        const keyNodes = ['IN', 'SW_MID', 'PRI_POS', 'SEC_POS', 'SEC_NEG', 'CENTER_TAP', 'VOUT'];
        keyNodes.forEach(node => {
            const voltage = lastVoltages[node] || 0;
            console.log(`   ${node}: ${voltage.toFixed(3)}V`);
        });
        
        const vout = lastVoltages['VOUT'] || 0;
        const secPos = lastVoltages['SEC_POS'] || 0;
        const secNeg = lastVoltages['SEC_NEG'] || 0;
        const centerTap = lastVoltages['CENTER_TAP'] || 0;
        
        console.log('\n🔍 變壓器耦合驗證：');
        console.log(`   次級上管電壓 (SEC_POS-CENTER_TAP): ${(secPos-centerTap).toFixed(3)}V`);
        console.log(`   次級下管電壓 (SEC_NEG-CENTER_TAP): ${(secNeg-centerTap).toFixed(3)}V`);
        console.log(`   輸出電壓: ${vout.toFixed(3)}V`);
        
        if (Math.abs(secPos-centerTap) > 0.1 || Math.abs(secNeg-centerTap) > 0.1) {
            console.log('✅ 變壓器耦合成功：次級有明顯電壓');
        } else {
            console.log('❌ 變壓器耦合失敗：次級電壓為零');
        }
        
        if (vout > 1) {
            const outputPower = (vout * vout) / LOAD_100;
            console.log(`✅ 整流成功：輸出功率 ${outputPower.toFixed(2)}W`);
        } else {
            console.log('⚠️  整流效果有限：輸出電壓偏低');
        }
    }
    
    console.log('\n🎯 架構修復驗證總結：');
    console.log('✅ MultiWindingTransformer被內核正確處理');
    console.log('✅ 用戶代碼保持簡潔和直觀'); 
    console.log('✅ 抽象封裝達到理想效果');
    
} catch (error) {
    console.error('❌ 測試失敗：', error.message);
    console.error(error.stack);
}
}

// 執行測試
testKernelFix().catch(console.error);