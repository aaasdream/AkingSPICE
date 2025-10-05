// 測試用戶提供的 Buck 轉換器 SPICE 網表解析
import { NetlistParser } from './src/parser/netlist.js';

// 用戶的完整 Buck 轉換器 SPICE 網表
const buckConverterNetlist = `
* Buck Converter Circuit
VIN     vin     0       DC 24V
VDRIVE  drive   0       PULSE(0V 5V 0s 10ns 10ns 5us 10us)
M1      vin     drive   sw      NMOS_Model Ron=50m Vth=2V
D1      0       sw      DIODE_Model Vf=0.7V Ron=10m  
L1      sw      vo      100uH
C1      vo      0       220uF
RLOAD   vo      0       5

.MODEL NMOS_Model NMOS()
.MODEL DIODE_Model D()

.TRAN 0.1us 100us
.END
`;

// 測試網表解析器
function testBuckNetlistParsing() {
    console.log('=== 測試 Buck 轉換器網表解析 ===');
    
    try {
        const parser = new NetlistParser();
        console.log('NetlistParser 創建成功');
        
        // 解析網表
        const circuit = parser.parse(buckConverterNetlist);
        console.log('網表解析成功！');
        
        // 顯示解析結果統計
        console.log('\n=== 解析統計 ===');
        console.log(`元件總數: ${circuit.components.length}`);
        console.log(`模型總數: ${circuit.models.size}`);
        console.log(`參數總數: ${circuit.parameters.size}`);
        console.log(`分析總數: ${circuit.analyses.length}`);
        
        // 詳細檢查每個元件
        console.log('\n=== 元件詳情 ===');
        circuit.components.forEach((component, index) => {
            console.log(`${index + 1}. ${component.name} (${component.constructor.name})`);
            console.log(`   節點: ${component.nodes}`);
            
            // 特別檢查 PULSE 電壓源
            if (component.name === 'VDRIVE') {
                console.log(`   源配置: ${JSON.stringify(component.sourceConfig, null, 4)}`);
                
                // 測試幾個時間點的值
                console.log(`   時間測試:`);
                console.log(`     t=0s:    ${component.getValue(0)}V`);
                console.log(`     t=2.5µs: ${component.getValue(2.5e-6)}V`);
                console.log(`     t=5µs:   ${component.getValue(5e-6)}V`);
                console.log(`     t=7.5µs: ${component.getValue(7.5e-6)}V`);
                console.log(`     t=10µs:  ${component.getValue(10e-6)}V`);
            }
            
            if (component.sourceConfig) {
                console.log(`   源類型: ${component.sourceConfig.type}`);
            }
        });
        
        // 檢查模型定義
        console.log('\n=== 模型定義 ===');
        for (const [name, model] of circuit.models) {
            console.log(`${name}: ${model.type}`);
            if (Object.keys(model.parameters).length > 0) {
                console.log(`   參數: ${JSON.stringify(model.parameters)}`);
            }
        }
        
        // 檢查分析設置
        console.log('\n=== 分析設置 ===');
        circuit.analyses.forEach(analysis => {
            console.log(`${analysis.type}: ${JSON.stringify(analysis.params)}`);
        });
        
        return circuit;
        
    } catch (error) {
        console.error('網表解析失敗:', error.message);
        console.error('錯誤堆疊:', error.stack);
        return null;
    }
}

// 測試 PULSE 波形函數
async function testPulseWaveform() {
    console.log('\n=== PULSE 波形測試 ===');
    
    try {
        // 直接測試 PULSE 解析
        const { VoltageSource } = await import('./src/components/sources.js');
        
        const pulseSource = new VoltageSource('VTEST', ['drive', '0'], 'PULSE(0V 5V 0s 10ns 10ns 5us 10us)', {});
        
        console.log('PULSE 源創建成功');
        console.log('源配置:', JSON.stringify(pulseSource.sourceConfig, null, 2));
        
        // 測試多個時間點
        const testTimes = [0, 2.5e-6, 5e-6, 7.5e-6, 10e-6, 12.5e-6, 15e-6, 20e-6];
        
        console.log('\nPULSE 波形時間測試:');
        testTimes.forEach(t => {
            const value = pulseSource.getValue(t);
            console.log(`t=${t*1e6}µs: ${value.toFixed(3)}V`);
        });
        
    } catch (error) {
        console.error('PULSE 波形測試失敗:', error.message);
    }
}

// 執行測試
async function runTests() {
    const circuit = testBuckNetlistParsing();
    await testPulseWaveform();
    
    if (circuit) {
        console.log('\n✅ 網表解析成功！Buck 轉換器電路已正確建立');
    } else {
        console.log('\n❌ 網表解析失敗');
    }
}

runTests().catch(console.error);