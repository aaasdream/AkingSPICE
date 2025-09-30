/**
 * 顯式狀態更新求解器測試
 * 
 * 測試一個簡單的RC電路：
 * V1 --R1-- node1 --C1-- GND
 * 
 * 這個測試驗證：
 * 1. CircuitPreprocessor 正確建立G矩陣和狀態變量
 * 2. ExplicitStateSolver 正確求解RC充電過程
 * 3. 與理論解析解比較驗證準確性
 */

import { ExplicitStateSolver } from '../src/core/explicit-state-solver.js';
import { Resistor } from '../src/components/resistor.js';
import { Capacitor } from '../src/components/capacitor.js';
import { VoltageSource } from '../src/components/sources.js';

/**
 * 創建簡單的RC測試電路
 */
function createRCCircuit() {
    // 電路: V1(5V) --R1(1kΩ)-- node1 --C1(1µF)-- GND
    const components = [
        new VoltageSource('V1', ['vin', 'gnd'], 5),     // 5V DC源
        new Resistor('R1', ['vin', 'node1'], '1k'),     // 1kΩ電阻
        new Capacitor('C1', ['node1', 'gnd'], '1u')     // 1µF電容, IC=0V
    ];
    
    return components;
}

/**
 * RC充電的理論解析解
 * Vc(t) = V0 * (1 - exp(-t/RC))
 */
function rcTheoretical(t, V0 = 5, R = 1000, C = 1e-6) {
    const tau = R * C;  // 時間常數
    return V0 * (1 - Math.exp(-t / tau));
}

/**
 * 測試RC電路充電過程
 */
async function testRCCharging() {
    console.log('=== 測試RC電路充電過程 ===');
    
    const components = createRCCircuit();
    const solver = new ExplicitStateSolver();
    
    // 啟用調試模式
    solver.setDebug(true);
    
    // 設置較小的時間步長以確保穩定性
    const timeStep = 1e-6;  // 1µs 
    const stopTime = 1e-3;  // 1ms (只運行短時間進行調試)
    
    try {
        // 初始化求解器
        console.log('初始化求解器...');
        await solver.initialize(components, timeStep, {
            integrationMethod: 'forward_euler',
            solverMaxIterations: 1000,
            solverTolerance: 1e-12
        });
        
        // 運行仿真
        console.log('開始仿真...');
        const results = await solver.run(0, stopTime);
        
        // 驗證結果
        console.log('\\n=== 結果驗證 ===');
        console.log(`總時間步數: ${results.timeVector.length}`);
        console.log(`實際仿真時間: ${results.timeVector[results.timeVector.length - 1].toExponential(3)}s`);
        
        // 檢查關鍵時間點
        const timePoints = [0, 1e-3, 2e-3, 5e-3]; // 0, 1τ, 2τ, 5τ
        
        console.log('\\n時間點驗證:');
        console.log('時間(ms)\\t仿真值(V)\\t理論值(V)\\t誤差(%)');
        
        for (const t of timePoints) {
            if (t < stopTime) {
                // 找到最接近的時間點
                let closestIndex = 0;
                let minDiff = Math.abs(results.timeVector[0] - t);
                
                for (let i = 1; i < results.timeVector.length; i++) {
                    const diff = Math.abs(results.timeVector[i] - t);
                    if (diff < minDiff) {
                        minDiff = diff;
                        closestIndex = i;
                    }
                }
                
                const simulated = results.stateVariables.get('C1')[closestIndex];
                const theoretical = rcTheoretical(t);
                const error = Math.abs(simulated - theoretical) / theoretical * 100;
                
                console.log(`${(t * 1000).toFixed(1)}\\t\\t${simulated.toFixed(4)}\\t\\t${theoretical.toFixed(4)}\\t\\t${error.toFixed(2)}%`);
            }
        }
        
        // 檢查最終值 (應該接近5V)
        const finalValue = results.stateVariables.get('C1')[results.stateVariables.get('C1').length - 1];
        const finalTheoretical = rcTheoretical(stopTime);
        const finalError = Math.abs(finalValue - finalTheoretical) / finalTheoretical * 100;
        
        console.log(`\\n最終值: ${finalValue.toFixed(4)}V (理論: ${finalTheoretical.toFixed(4)}V, 誤差: ${finalError.toFixed(2)}%)`);
        
        // 性能統計
        console.log('\\n=== 性能統計 ===');
        console.log('求解器統計:', results.stats);
        
        // 判斷測試結果
        const maxAcceptableError = 5.0; // 5% 最大可接受誤差
        if (finalError < maxAcceptableError) {
            console.log(`\\n✅ 測試通過! 最終誤差 ${finalError.toFixed(2)}% < ${maxAcceptableError}%`);
            return true;
        } else {
            console.log(`\\n❌ 測試失敗! 最終誤差 ${finalError.toFixed(2)}% > ${maxAcceptableError}%`);
            return false;
        }
        
    } catch (error) {
        console.error('測試失敗:', error);
        return false;
    }
}

/**
 * 測試電路預處理器
 */
async function testPreprocessor() {
    console.log('\\n=== 測試電路預處理器 ===');
    
    const components = createRCCircuit();
    const solver = new ExplicitStateSolver();
    
    try {
        await solver.initialize(components, 1e-6, { debug: true });
        
        const circuitData = solver.circuitData;
        
        console.log('預處理結果:');
        console.log(`節點數: ${circuitData.nodeCount}`);
        console.log(`狀態變量數: ${circuitData.stateCount}`);
        console.log('節點名稱:', circuitData.nodeNames);
        console.log('狀態變量:', circuitData.stateVariables.map(s => `${s.componentName}(${s.type})`));
        
        // 驗證G矩陣
        const gMatrix = solver.gMatrix;
        console.log('\\nG矩陣:');
        for (let i = 0; i < gMatrix.rows; i++) {
            let row = '';
            for (let j = 0; j < gMatrix.cols; j++) {
                row += gMatrix.get(i, j).toExponential(2).padStart(12);
            }
            console.log(row);
        }
        
        return true;
        
    } catch (error) {
        console.error('預處理測試失敗:', error);
        return false;
    }
}

/**
 * 主測試函數
 */
async function main() {
    console.log('開始顯式狀態更新求解器測試\\n');
    
    let passed = 0;
    let total = 0;
    
    // 測試1: 預處理器
    total++;
    if (await testPreprocessor()) {
        passed++;
    }
    
    // 測試2: RC電路仿真
    total++;
    if (await testRCCharging()) {
        passed++;
    }
    
    // 總結
    console.log('\\n=== 測試總結 ===');
    console.log(`通過: ${passed}/${total}`);
    
    if (passed === total) {
        console.log('🎉 所有測試通過! 顯式求解器工作正常。');
        process.exit(0);
    } else {
        console.log('❌ 部分測試失敗。');
        process.exit(1);
    }
}

// 直接執行測試
main().catch(error => {
    console.error('測試執行失敗:', error);
    process.exit(1);
});

export { testRCCharging, testPreprocessor, main as runAllTests };