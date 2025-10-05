// 詳細分析 MOSFET 和分析設置的解析問題
import { NetlistParser } from './src/parser/netlist.js';

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

function analyzeDetailedParsing() {
    console.log('=== 詳細網表解析分析 ===');
    
    try {
        const parser = new NetlistParser();
        const circuit = parser.parse(buckConverterNetlist);
        
        // 詳細檢查 MOSFET
        console.log('\n=== MOSFET M1 詳細分析 ===');
        const mosfet = circuit.components.find(comp => comp.name === 'M1');
        if (mosfet) {
            console.log('MOSFET 對象:', mosfet);
            console.log('MOSFET 類型:', mosfet.constructor.name);
            console.log('MOSFET 節點:', mosfet.nodes);
            console.log('MOSFET 參數:', mosfet.params || 'N/A');
            
            // 檢查是否有所有必需的節點
            if (mosfet.nodes.length < 3) {
                console.error('❌ MOSFET 節點不足！MOSFET 應該有 3 個節點 (drain, source, gate)');
                console.log('原始網表行: M1      vin     drive   sw      NMOS_Model Ron=50m Vth=2V');
                console.log('預期節點: [drain=vin, source=drive, gate=sw]');
                console.log('實際節點:', mosfet.nodes);
            } else {
                console.log('✅ MOSFET 節點數量正確');
            }
        }
        
        // 詳細檢查分析設置
        console.log('\n=== .TRAN 分析設置詳細分析 ===');
        console.log('analyses 數組長度:', circuit.analyses.length);
        
        circuit.analyses.forEach((analysis, index) => {
            console.log(`分析 ${index + 1}:`);
            console.log('  類型:', analysis.type);
            console.log('  完整分析對象:', JSON.stringify(analysis, null, 4));
            
            if (analysis.type === 'TRAN') {
                console.log('  ✅ TRAN 分析已識別');
                const { tstep, tstop, tstart, tmax } = analysis;
                if (tstep && tstop) {
                    console.log(`  時間步長: ${tstep}`);
                    console.log(`  結束時間: ${tstop}`);
                    console.log(`  開始時間: ${tstart || '0'}`);
                    console.log(`  最大步長: ${tmax || tstep}`);
                } else {
                    console.log('  ❌ TRAN 參數缺失');
                }
            }
        });
        
        // 檢查模型解析
        console.log('\n=== 模型定義詳細分析 ===');
        for (const [name, model] of circuit.models) {
            console.log(`模型: ${name}`);
            console.log(`  類型: ${model.type}`);
            console.log(`  參數: ${JSON.stringify(model.parameters)}`);
        }
        
        return circuit;
        
    } catch (error) {
        console.error('解析失敗:', error.message);
        console.error('錯誤堆疊:', error.stack);
        return null;
    }
}

analyzeDetailedParsing();