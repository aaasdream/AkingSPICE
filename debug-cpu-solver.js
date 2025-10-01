/**
 * 深度調試 CPU 求解器 - 找出輸出為 0V 的根本原因
 */

import { 
    ExplicitStateSolver, 
    VoltageSource, 
    Resistor, 
    Capacitor
} from './lib-dist/AkingSPICE.es.js';

console.log('🔍 深度調試 CPU 求解器 - 輸出為 0V 問題');
console.log('=' .repeat(50));

async function debugSimpleCircuit() {
    console.log('\n🧪 測試最簡單的 RC 電路');
    
    try {
        // 創建最簡單的 RC 電路
        const components = [
            new VoltageSource('V1', ['vin', 'gnd'], 5.0),
            new Resistor('R1', ['vin', 'vout'], 1000),
            new Capacitor('C1', ['vout', 'gnd'], 1e-6, { ic: 0 })
        ];
        
        console.log('\n📋 組件詳細信息:');
        components.forEach((comp, i) => {
            console.log(`  ${i+1}. ${comp.constructor.name}: ${comp.name}`);
            console.log(`     節點: [${comp.nodes.join(', ')}]`);
            if (comp.value !== undefined) {
                console.log(`     值: ${comp.value}`);
            }
            if (comp.ic !== undefined) {
                console.log(`     初始條件: ${comp.ic}`);
            }
        });
        
        // 創建求解器並啟用調試模式
        const solver = new ExplicitStateSolver({
            debug: true,  // 啟用調試
            integrationMethod: 'forward_euler',
            solverMaxIterations: 2000,
            solverTolerance: 1e-6
        });
        
        console.log('\n🔧 初始化求解器...');
        const timeStep = 10e-6; // 10μs
        await solver.initialize(components, timeStep);
        
        console.log('\n⚡ 執行前幾步模擬...');
        
        for (let i = 0; i < 10; i++) {
            console.log(`\n--- 步驟 ${i} (t=${(i * timeStep * 1000).toFixed(3)}ms) ---`);
            
            try {
                const result = await solver.step();
                
                if (result) {
                    console.log('✅ 步驟結果:');
                    
                    if (result.nodeVoltages) {
                        console.log('   節點電壓:');
                        for (const [node, voltage] of Object.entries(result.nodeVoltages)) {
                            console.log(`     ${node}: ${voltage.toFixed(6)}V`);
                        }
                    } else {
                        console.log('   ❌ 沒有 nodeVoltages');
                    }
                    
                    if (result.stateVector) {
                        console.log('   狀態向量:');
                        result.stateVector.forEach((state, idx) => {
                            console.log(`     state[${idx}]: ${state.toFixed(6)}`);
                        });
                    } else {
                        console.log('   ❌ 沒有 stateVector');
                    }
                    
                    if (result.currentVector) {
                        console.log('   電流向量:');
                        result.currentVector.forEach((current, idx) => {
                            console.log(`     current[${idx}]: ${current.toFixed(6)}A`);
                        });
                    }
                    
                } else {
                    console.log('❌ 步驟返回 null 或 undefined');
                }
            } catch (stepError) {
                console.log(`❌ 步驟 ${i} 錯誤: ${stepError.message}`);
                console.log(`   堆疊: ${stepError.stack}`);
                break;
            }
        }
        
    } catch (error) {
        console.log(`💥 測試失敗: ${error.message}`);
        console.log(`堆疊: ${error.stack}`);
    }
}

// 測試電壓源本身
async function testVoltageSourceOnly() {
    console.log('\n🔋 測試純電壓源電路');
    
    try {
        const components = [
            new VoltageSource('V1', ['vin', 'gnd'], 5.0),
            new Resistor('R1', ['vin', 'gnd'], 1000)  // 簡單負載
        ];
        
        const solver = new ExplicitStateSolver({ debug: true });
        await solver.initialize(components, 1e-6);
        
        console.log('執行一步...');
        const result = await solver.step();
        
        if (result && result.nodeVoltages) {
            console.log('節點電壓:');
            for (const [node, voltage] of Object.entries(result.nodeVoltages)) {
                console.log(`  ${node}: ${voltage.toFixed(6)}V`);
            }
        } else {
            console.log('❌ 沒有有效的節點電壓結果');
        }
        
    } catch (error) {
        console.log(`❌ 電壓源測試失敗: ${error.message}`);
    }
}

// 檢查組件創建
function checkComponents() {
    console.log('\n🔍 檢查組件創建是否正確');
    
    try {
        console.log('\n📋 創建測試組件:');
        
        const v1 = new VoltageSource('V1', ['vin', 'gnd'], 5.0);
        console.log(`VoltageSource: name=${v1.name}, nodes=[${v1.nodes.join(',')}], value=${v1.value}`);
        
        const r1 = new Resistor('R1', ['vin', 'vout'], 1000);
        console.log(`Resistor: name=${r1.name}, nodes=[${r1.nodes.join(',')}], value=${r1.value}`);
        
        const c1 = new Capacitor('C1', ['vout', 'gnd'], 1e-6, { ic: 0 });
        console.log(`Capacitor: name=${c1.name}, nodes=[${c1.nodes.join(',')}], value=${c1.value}, ic=${c1.ic}`);
        
        console.log('\n✅ 所有組件創建成功');
        
        // 檢查組件方法
        console.log('\n🔧 檢查組件方法:');
        console.log(`VoltageSource.stamp: ${typeof v1.stamp}`);
        console.log(`Resistor.stamp: ${typeof r1.stamp}`);
        console.log(`Capacitor.stamp: ${typeof c1.stamp}`);
        
    } catch (error) {
        console.log(`❌ 組件創建失敗: ${error.message}`);
    }
}

// 主函數
async function main() {
    checkComponents();
    await testVoltageSourceOnly();
    await debugSimpleCircuit();
}

main().catch(error => {
    console.error('💥 調試過程中發生錯誤:', error);
    process.exit(1);
});