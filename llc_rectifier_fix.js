// 整流器診斷和修復測試
const {
    VoltageSource, Resistor, Capacitor, Inductor, 
    TransientResult, MCPAnalysis,
    createMCPTransientAnalysis, 
    createMCPDiode, MultiWindingTransformer,
    displayMatrix, createUnifiedDCAnalysis
} = require('./src/index.js');

async function runTest() {
try {
    console.log('🔍 中心抽頭變壓器整流器診斷和修復');
    console.log('=====================================');
    
    // 基本參數
    const VIN = 1800;  // 使用已證實的1800V
    const LOAD_100 = 100; // 100Ω負載
    
    console.log(`📊 測試參數：`);
    console.log(`   輸入電壓: ${VIN}V`);
    console.log(`   負載阻抗: ${LOAD_100}Ω`);
    
    // 修正的中心抽頭變壓器配置
    console.log('\\n🔧 修正中心抽頭變壓器配置：');
    const transformer = new MultiWindingTransformer('T1', {
        windings: [
            { name: 'primary', nodes: ['PRI_POS', 'SW_MID'], inductance: 1000e-6 },     // 1mH
            { name: 'secondary1', nodes: ['SEC_POS', 'CENTER_TAP'], inductance: 500e-6 }, // 0.5mH，上半部
            { name: 'secondary2', nodes: ['CENTER_TAP', 'SEC_NEG'], inductance: 500e-6 }  // 0.5mH，下半部
        ],
        // 修正耦合矩陣：次級繞組相互串聯，不是對立的
        couplingMatrix: [[1.0, 0.9999, 0.9999], [0.9999, 1.0, 0.9999], [0.9999, 0.9999, 1.0]]
    });
    
    console.log('   一次線圈: PRI_POS ←→ SW_MID (1000µH)');
    console.log('   次級上半: SEC_POS ←→ CENTER_TAP (500µH)');  
    console.log('   次級下半: CENTER_TAP ←→ SEC_NEG (500µH)');
    console.log('   中心抽頭: CENTER_TAP 連接輸出負極');
    
    // 創建MCP求解器
    const mcpSolver = createMCPTransientAnalysis({ debug: true, gmin: 1e-6 });
    
    // 創建電路
    const F_TEST = 200e3;
    const PERIOD_TEST = 1 / F_TEST;
    const pw = PERIOD_TEST / 2;  // 50%占空比
    
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
            pw: pw,         // 脈衝寬度
            per: PERIOD_TEST // 週期
        }),
        
        // LLC諧振元件
        new Inductor('Lr', ['IN', 'RES'], 50e-6),
        new Capacitor('Cr', ['RES', 'PRI_POS'], 12e-9, { ic: 0 }),
        
        // 變壓器
        transformer,
        
        // 修正的整流二極管配置：連接到中心抽頭
        createMCPDiode('D1', 'SEC_POS', 'VOUT', { Vf: 0.7 }),     // 上管
        createMCPDiode('D2', 'SEC_NEG', 'VOUT', { Vf: 0.7 }),     // 下管
        
        // 輸出濾波和負載 - 中心抽頭連接到地
        new Capacitor('Cout', ['VOUT', 'CENTER_TAP'], 1000e-6, { ic: 0 }), // 修正：相對於中心抽頭
        new Resistor('Rload', ['VOUT', 'CENTER_TAP'], LOAD_100)             // 修正：相對於中心抽頭
    ];
    
    console.log('\\n🔌 修正的整流器連接：');
    console.log('   D1: SEC_POS → VOUT (上管)');
    console.log('   D2: SEC_NEG → VOUT (下管)');
    console.log('   輸出電容: VOUT ←→ CENTER_TAP');
    console.log('   負載電阻: VOUT ←→ CENTER_TAP');
    
    // 運行瞬態分析
    console.log('\\n⏱️ 開始修正後的瞬態分析...');
    const timeStep = 2e-7;  // 200ns
    const endTime = 5e-6;   // 5µs
    const totalSteps = Math.ceil(endTime / timeStep);
    
    const analysisParams = {
        startTime: 0,
        stopTime: endTime,
        timeStep: timeStep
    };
    
    const result = await mcpSolver.run(components, analysisParams);
    
    console.log('\\n--- 修正分析結果 ---');
    console.log(`總時間點: ${result.timeVector.length}`);
    
    // 分析最後幾個時間點的電壓
    const lastPoints = Math.min(5, result.timeVector.length);
    console.log(`\\n📊 最後 ${lastPoints} 個時間點的電壓分析:`);
    
    for (let i = result.timeVector.length - lastPoints; i < result.timeVector.length; i++) {
        const time = result.timeVector[i];
        const voltages = result.voltageMatrix[i];
        
        console.log(`\\n⏰ t = ${(time*1e6).toFixed(2)}µs:`);
        
        const keyNodes = ['IN', 'SW_MID', 'PRI_POS', 'SEC_POS', 'SEC_NEG', 'CENTER_TAP', 'VOUT'];
        const nodeVoltages = {};
        
        keyNodes.forEach(node => {
            const voltage = voltages[node] || 0;
            nodeVoltages[node] = voltage;
            console.log(`   ${node}: ${voltage.toFixed(3)}V`);
        });
        
        // 關鍵診斷
        const secPos = nodeVoltages['SEC_POS'];
        const secNeg = nodeVoltages['SEC_NEG'];
        const centerTap = nodeVoltages['CENTER_TAP'];
        const vout = nodeVoltages['VOUT'];
        
        console.log('\\n🔍 整流器診斷：');
        console.log(`   次級上管電壓 (SEC_POS-CENTER_TAP): ${(secPos-centerTap).toFixed(3)}V`);
        console.log(`   次級下管電壓 (SEC_NEG-CENTER_TAP): ${(secNeg-centerTap).toFixed(3)}V`);
        console.log(`   D1正向電壓 (SEC_POS-VOUT): ${(secPos-vout).toFixed(3)}V ${(secPos-vout) > 0.7 ? '✅導通' : '❌截止'}`);
        console.log(`   D2正向電壓 (SEC_NEG-VOUT): ${(secNeg-vout).toFixed(3)}V ${(secNeg-vout) > 0.7 ? '✅導通' : '❌截止'}`);
        console.log(`   輸出電壓: ${vout.toFixed(3)}V`);
        
        if (vout > 0) {
            const outputPower = (vout * vout) / LOAD_100;
            console.log(`   輸出功率: ${outputPower.toFixed(2)}W`);
        }
    }
    
    console.log('\\n--- 修正測試完成 ---');
    console.log('預期結果：');
    console.log('• SEC_POS 和 SEC_NEG 應該相對於 CENTER_TAP 有對稱的電壓');
    console.log('• 當一個二極管導通時，VOUT 應該上升');
    console.log('• 輸出功率應該 > 0W');
    
} catch (error) {
    console.error('❌ 測試失敗：', error.message);
    console.error(error.stack);
}
}

// 執行測試
runTest().catch(console.error);