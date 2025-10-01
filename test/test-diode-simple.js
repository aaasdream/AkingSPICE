/**
 * 簡單二極體測試 - 調試二極體整流功能
 */

import { Resistor } from '../src/components/resistor.js';
import { VoltageSource } from '../src/components/sources.js';
import { Diode } from '../src/components/diode.js';
import { ExplicitStateSolver } from '../src/core/explicit-state-solver.js';

async function testSimpleDiode() {
    console.log('🔍 測試簡單二極體整流電路');
    
    // 創建簡單的二極體電路：AC源 -> 二極體 -> 負載電阻
    const components = [
        new VoltageSource('V1', ['ac', 'gnd'], 'SINE(0 10 1000)'), // 1kHz, 10V峰值
        new Diode('D1', ['ac', 'dc']), // 整流二極體
        new Resistor('R1', ['dc', 'gnd'], 1000) // 1kΩ負載
    ];
    
    const solver = new ExplicitStateSolver();
    const period = 1 / 1000; // 1ms
    const timeStep = period / 100; // 每週期100個採樣點
    
    console.log(`  AC頻率: 1000Hz, 週期: ${(period*1000).toFixed(2)}ms`);
    console.log(`  時間步長: ${(timeStep*1e6).toFixed(2)}μs`);
    
    try {
        await solver.initialize(components, timeStep, { debug: true });
        
        // 模擬3個週期
        const results = await solver.run(0, period * 3);
        
        console.log(`  模擬步數: ${results.timeVector.length}`);
        
        // 分析結果
        const acVoltages = [];
        const dcVoltages = [];
        
        for (let i = 0; i < results.timeVector.length; i++) {
            const nodeVoltages = new Map();
            results.nodeVoltages.forEach((voltageArray, nodeName) => {
                nodeVoltages.set(nodeName, voltageArray[i]);
            });
            
            acVoltages.push(nodeVoltages.get('ac') || 0);
            dcVoltages.push(nodeVoltages.get('dc') || 0);
        }
        
        const maxAC = Math.max(...acVoltages);
        const minAC = Math.min(...acVoltages);
        const maxDC = Math.max(...dcVoltages);
        const minDC = Math.min(...dcVoltages);
        const avgDC = dcVoltages.reduce((sum, v) => sum + v, 0) / dcVoltages.length;
        
        console.log(`  AC電壓範圍: ${minAC.toFixed(2)}V ~ ${maxAC.toFixed(2)}V`);
        console.log(`  DC電壓範圍: ${minDC.toFixed(2)}V ~ ${maxDC.toFixed(2)}V`);
        console.log(`  平均DC電壓: ${avgDC.toFixed(2)}V`);
        
        // 預期結果：DC電壓應為正值（二極體整流效果）
        if (avgDC > 1.0) {
            console.log('  ✅ 二極體整流功能正常');
            return true;
        } else {
            console.log('  ❌ 二極體整流功能異常');
            return false;
        }
        
    } catch (error) {
        console.log(`  ❌ 測試失敗: ${error.message}`);
        return false;
    }
}

// 執行測試
testSimpleDiode().then(success => {
    if (success) {
        console.log('\n🎉 簡單二極體測試通過');
    } else {
        console.log('\n⚠️ 簡單二極體測試失敗，需要進一步調試');
    }
}).catch(error => {
    console.error('測試執行錯誤:', error);
});