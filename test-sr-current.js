// 簡單測試同步整流電流讀取
import { VoltageControlledMOSFET, VoltageSource } from './src/index.js';
import { AkingSPICE } from './src/core/solver.js';

console.log('=== 測試同步整流電流讀取 ===');

try {
    // 創建簡單電路
    const circuit = new AkingSPICE();
    
    // 添加MOSFET
    circuit.addComponent(new VoltageControlledMOSFET('SR1', ['A', 'G', '0'], { Ron: 0.002, Roff: 1e6 }));
    circuit.addComponent(new VoltageSource('VDD', ['A', '0'], 5)); // 5V電源
    circuit.addComponent(new VoltageSource('VG', ['G', '0'], 12)); // 12V閘極電壓
    
    // 運行DC分析
    const result = await circuit.runDCAnalysis();
    console.log('DC分析完成');
    
    // 嘗試讀取電流
    const srComponent = circuit.components.find(c => c.name === 'SR1');
    if (srComponent && typeof srComponent.getCurrent === 'function') {
        const current = srComponent.getCurrent(result.nodeVoltages);
        console.log(`SR1 電流: ${current}A`);
        console.log(`SR1 節點電壓: A=${result.nodeVoltages.get('A')}V, G=${result.nodeVoltages.get('G')}V`);
        console.log(`SR1 狀態:`, srComponent.getOperatingStatus());
    } else {
        console.log('無法找到getCurrent方法');
        console.log('SR1 component:', srComponent);
    }
    
} catch (error) {
    console.error('測試失敗:', error.message);
    console.error(error.stack);
}