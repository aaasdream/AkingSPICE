/**
 * 簡化的返馳轉換器測試 - 僅測試基本元件創建
 */

const path = require('path');
const srcDir = path.join(__dirname, 'src');

console.log('測試基本元件導入...');

try {
    // 測試各個元件的導入
    const { Resistor } = require(path.join(srcDir, 'components/resistor.js'));
    const { VoltageSource } = require(path.join(srcDir, 'components/sources.js'));
    const { Capacitor } = require(path.join(srcDir, 'components/capacitor_v2.js'));
    const { Inductor } = require(path.join(srcDir, 'components/inductor_v2.js'));
    
    console.log('✅ 基本元件導入成功');
    
    // 測試 MCP 元件
    const { createMCPDiode } = require(path.join(srcDir, 'components/diode_mcp.js'));
    const { createNMOSSwitch } = require(path.join(srcDir, 'components/mosfet_mcp.js'));
    
    console.log('✅ MCP 元件導入成功');
    
    // 測試 MCP 分析器
    const { MCPTransientAnalysis } = require(path.join(srcDir, 'analysis/transient_mcp.js'));
    
    console.log('✅ MCP 分析器導入成功');
    
    // 創建簡單電路測試
    const components = [
        new VoltageSource('V1', ['VIN', '0'], 24),
        new Resistor('R1', ['VIN', 'VOUT'], 10),
        new Capacitor('C1', ['VOUT', '0'], 100e-6),
        createMCPDiode('D1', 'VOUT', '0')
    ];
    
    console.log(`✅ 創建了 ${components.length} 個元件`);
    
    // 創建分析器
    const analysis = new MCPTransientAnalysis({
        debug: false,
        gmin: 1e-12
    });
    
    console.log('✅ MCP 分析器創建成功');
    
    // 運行短時間模擬
    async function testSimulation() {
        console.log('🚀 開始測試模擬...');
        
        const result = await analysis.run(components, {
            tstop: 1e-6,  // 1微秒
            tstep: 1e-8   // 10納秒
        });
        
        if (result && result.success) {
            console.log('✅ 模擬成功完成！');
            console.log(`   時間點數量: ${result.timePoints?.length || 'N/A'}`);
            
            // 檢查最後一個時間點的電壓
            if (result.timePoints && result.timePoints.length > 0) {
                const lastPoint = result.timePoints[result.timePoints.length - 1];
                const vout = lastPoint.nodeVoltages?.['VOUT'] || 'N/A';
                console.log(`   輸出電壓: ${vout}V`);
            }
        } else {
            console.log('❌ 模擬未成功');
        }
    }
    
    testSimulation().catch(error => {
        console.error('❌ 模擬錯誤:', error.message);
    });
    
} catch (error) {
    console.error('❌ 導入失敗:', error.message);
    console.error('錯誤位置:', error.stack);
}