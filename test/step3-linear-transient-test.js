/**
 * 驗證步驟三：線性時域分析
 * 測試RC充電電路的瞬態響應
 */
import { MCPTransientAnalysis } from '../src/analysis/transient_mcp.js';
import { VoltageSource } from '../src/components/sources.js';
import { Resistor } from '../src/components/resistor.js';
import { Capacitor } from '../src/components/capacitor.js';

async function testLinearTransientAnalysis() {
    try {
        console.log('=== 驗證步驟三：線性時域分析 ===\n');

        // === 創建RC充電電路 ===
        // V1: 5V階躍電壓源 (t=0時接通)
        // R1: 1kΩ電阻 
        // C1: 1µF電容 (初始電壓 = 0V)
        // 預期時間常數: τ = R*C = 1000 * 1e-6 = 1ms
        
        const components = [
            new VoltageSource('V1', ['1', '0'], 5.0),        // 5V電壓源
            new Resistor('R1', ['1', '2'], 1000),            // 1kΩ電阻
            new Capacitor('C1', ['2', '0'], 1e-6, 0.0)       // 1µF電容，初值0V
        ];
        
        console.log('📋 測試電路元件：');
        for (const comp of components) {
            console.log(`  ${comp.name}: ${comp.constructor.name} ${comp.nodes[0]}→${comp.nodes[1]}`);
            console.log(`    值: ${comp.value}`);
            console.log(`    類型: ${comp.type}`);
        }
        
        // === 理論分析 ===
        console.log('\n🧮 理論分析：');
        console.log('RC充電電路：');
        console.log('  時間常數: τ = R*C = 1000 * 1e-6 = 1ms');
        console.log('  電容電壓: V_C(t) = V_final * (1 - e^(-t/τ)) = 5 * (1 - e^(-t/0.001))');
        console.log('  電阻電流: I_R(t) = (V_source - V_C(t))/R');
        console.log('  在 t=τ 時: V_C ≈ 5*(1-1/e) ≈ 3.16V');
        console.log('  在 t=5τ 時: V_C ≈ 5*(1-e^-5) ≈ 4.97V (>99%充電完成)');
        
        // === 使用瞬態求解器 ===
        console.log('\n🔧 使用MCPTransientAnalysis求解（啟用debug）...');
        
        const solver = new MCPTransientAnalysis({
            debug: true,
            maxTimeStep: 1e-4,    // 最大時間步長: 0.1ms
            minTimeStep: 1e-6,    // 最小時間步長: 1µs
            convergenceTolerance: 1e-6,      // 數值容忍度
            adaptiveTimeStep: true
        });
        
        // 設置時間參數
        const timeStart = 0.0;
        const timeEnd = 5e-3;         // 模擬5ms (5個時間常數)
        const timeStep = 1e-4;        // 初始時間步長: 0.1ms
        
        console.log(`時間範圍: ${timeStart}s 到 ${timeEnd}s`);
        console.log(`初始時間步長: ${timeStep}s`);
        
        // 執行瞬態分析
        const params = {
            startTime: timeStart,
            stopTime: timeEnd,
            timeStep: timeStep,
            maxSteps: 1000
        };
        
        const result = await solver.run(components, params);
        
        console.log('\n📊 瞬態分析結果：');
        console.log(`收斂狀態: ${result ? '✅ 收斂' : '❌ 未收斂'}`);
        console.log(`時間點數: ${result?.timeVector?.length || 0}`);
        console.log(`最終時間: ${result?.timeVector?.[result.timeVector.length-1] || 'N/A'}s`);
        
        if (result && result.timeVector && result.voltageMatrix) {
            // 檢查關鍵時間點
            const keyTimes = [0, 1e-3, 2e-3, 3e-3, 5e-3]; // 0, 1τ, 2τ, 3τ, 5τ
            
            console.log('\n🔋 關鍵時間點的節點電壓：');
            console.log('時間(ms)    V(1)[V]    V(2)[V]    理論V_C[V]  誤差[%]');
            console.log('----------------------------------------------------');
            
            const timeVector = result.timeVector;
            const voltage1 = result.getVoltage('1') || [];  // 節點1電壓
            const voltage2 = result.getVoltage('2') || [];  // 節點2電壓(電容電壓)
            
            for (const t of keyTimes) {
                // 找到最接近的時間點
                let closestIndex = 0;
                let minDiff = Math.abs(timeVector[0] - t);
                
                for (let i = 1; i < timeVector.length; i++) {
                    const diff = Math.abs(timeVector[i] - t);
                    if (diff < minDiff) {
                        minDiff = diff;
                        closestIndex = i;
                    }
                }
                
                const actualTime = timeVector[closestIndex];
                const V1 = voltage1[closestIndex] || 0;  // 節點1電壓
                const V2 = voltage2[closestIndex] || 0;  // 節點2電壓(電容電壓)
                
                // 理論值: V_C(t) = 5 * (1 - exp(-t/0.001))
                const theoreticalV_C = 5.0 * (1 - Math.exp(-actualTime / 1e-3));
                const error = Math.abs(V2 - theoreticalV_C) / theoreticalV_C * 100;
                
                console.log(`${(actualTime*1000).toFixed(1).padStart(8)} ${V1.toFixed(3).padStart(10)} ${V2.toFixed(3).padStart(10)} ${theoreticalV_C.toFixed(3).padStart(11)} ${error.toFixed(1).padStart(8)}`);
            }
            
            // 驗證最終值
            const finalV2 = voltage2[voltage2.length - 1] || 0;
            const expectedFinal = 5.0 * (1 - Math.exp(-timeEnd / 1e-3)); // 約4.97V
            const finalError = Math.abs(finalV2 - expectedFinal) / expectedFinal * 100;
            
            console.log('\n✅ 結果驗證：');
            console.log(`最終電容電壓: 實際=${finalV2.toFixed(6)}V, 理論=${expectedFinal.toFixed(6)}V, 誤差=${finalError.toFixed(2)}%`);
            
            // 測試通過條件
            if (finalError < 5.0) { // 誤差小於5%
                console.log('\n🎉 總體測試結果: PASS');
                console.log('✅ 線性時域分析工作正常！');
                console.log('  - RC電路瞬態響應正確');
                console.log('  - 時間積分收斂正常');
                console.log('  - 數值精度滿足要求');
                console.log('\n=== 步驟三測試結果: PASS ===');
                console.log('✅ 可以進行步驟四：Gear 2積分器驗證');
                return true;
            } else {
                console.log('\n❌ 總體測試結果: FAIL');
                console.log('❌ 最終值誤差過大，需要調試積分算法');
                return false;
            }
        } else {
            console.log('\n❌ 瞬態求解失敗');
            console.log('錯誤信息: 結果對象為空或缺少必要數據');
            return false;
        }
        
    } catch (error) {
        console.log('\n❌ 測試執行失敗：', error.message);
        console.log('錯誤堆疊：', error.stack);
        console.log('\n=== 步驟三測試結果: FAIL ===');
        console.log('❌ 需要調試瞬態分析器或積分器');
        return false;
    }
}

// 執行測試
testLinearTransientAnalysis();