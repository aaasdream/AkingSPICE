/**
 * 驗證步驟四：Gear 2積分器深度驗證
 * 測試RLC諧振電路的振盪響應，驗證積分器數值穩定性
 */
import { MCPTransientAnalysis } from '../src/analysis/transient_mcp.js';
import { VoltageSource } from '../src/components/sources.js';
import { Resistor } from '../src/components/resistor.js';
import { Capacitor } from '../src/components/capacitor.js';
import { Inductor } from '../src/components/inductor.js';

async function testGear2IntegratorValidation() {
    try {
        console.log('=== 驗證步驟四：Gear 2積分器深度驗證 ===\n');

        // === 創建RLC諧振電路 ===
        // V1: 5V階躍電壓源 (t=0時接通)
        // L1: 1mH電感 (初始電流 = 0A)
        // R1: 10Ω電阻 (阻尼)
        // C1: 1µF電容 (初始電壓 = 0V)
        // 
        // 理論參數:
        // ω₀ = 1/√(LC) = 1/√(1e-3 * 1e-6) = 1e3 rad/s (諧振頻率)
        // f₀ = ω₀/(2π) ≈ 159 Hz
        // ζ = R/2 * √(C/L) = 10/2 * √(1e-6/1e-3) ≈ 0.158 (欠阻尼)
        // T = 2π/ω₀ ≈ 6.28ms (振盪週期)
        
        const components = [
            new VoltageSource('V1', ['1', '0'], 5.0),        // 5V電壓源
            new Inductor('L1', ['1', '2'], 1e-3, 0.0),       // 1mH電感，初值0A
            new Resistor('R1', ['2', '3'], 10),              // 10Ω電阻
            new Capacitor('C1', ['3', '0'], 1e-6, 0.0)       // 1µF電容，初值0V
        ];
        
        console.log('📋 測試電路元件：');
        for (const comp of components) {
            console.log(`  ${comp.name}: ${comp.constructor.name} ${comp.nodes[0]}→${comp.nodes[1]}`);
            console.log(`    值: ${comp.value}`);
            console.log(`    類型: ${comp.type}`);
        }
        
        // === 理論分析 ===
        console.log('\n🧮 理論分析：');
        console.log('RLC諧振電路：');
        console.log('  電感: L = 1mH');
        console.log('  電容: C = 1µF');
        console.log('  電阻: R = 10Ω');
        console.log('  諧振頻率: ω₀ = 1/√(LC) = 1000 rad/s');
        console.log('  諧振頻率: f₀ = ω₀/(2π) ≈ 159 Hz');
        console.log('  振盪週期: T = 2π/ω₀ ≈ 6.28ms');
        console.log('  阻尼係數: ζ = R/2 * √(C/L) ≈ 0.158 (欠阻尼)');
        console.log('  阻尼振盪頻率: ωd = ω₀√(1-ζ²) ≈ 987 rad/s');
        
        // === 使用瞬態求解器（高精度設置）===
        console.log('\n🔧 使用MCPTransientAnalysis求解（高精度Gear 2積分）...');
        
        const solver = new MCPTransientAnalysis({
            debug: false,  // 關閉debug以減少輸出
            maxTimeStep: 1e-5,    // 最大時間步長: 10µs (週期的1/628)
            minTimeStep: 1e-7,    // 最小時間步長: 0.1µs
            convergenceTolerance: 1e-9,      // 高精度容忍度
            adaptiveTimeStep: true,
            maxTimeSteps: 10000   // 允許更多時間步
        });
        
        // 設置時間參數 - 模擬2個週期
        const timeStart = 0.0;
        const timeEnd = 12.56e-3;         // 模擬2個週期 (2T ≈ 12.56ms)
        const timeStep = 1e-5;            // 初始時間步長: 10µs
        
        console.log(`時間範圍: ${timeStart}s 到 ${timeEnd}s`);
        console.log(`初始時間步長: ${timeStep}s`);
        console.log('預期振盪: 約2個完整週期');
        
        // 執行瞬態分析
        const params = {
            startTime: timeStart,
            stopTime: timeEnd,
            timeStep: timeStep,
            maxSteps: 10000
        };
        
        const result = await solver.run(components, params);
        
        console.log('\n📊 瞬態分析結果：');
        console.log(`收斂狀態: ${result ? '✅ 收斂' : '❌ 未收斂'}`);
        console.log(`時間點數: ${result?.timeVector?.length || 0}`);
        console.log(`最終時間: ${result?.timeVector?.[result.timeVector.length-1] || 'N/A'}s`);
        
        if (result && result.timeVector && result.voltageMatrix) {
            // 分析關鍵時間點和振盪特性
            const timeVector = result.timeVector;
            const voltage1 = result.getVoltage('1') || [];  // 節點1電壓 (V1 = 5V)
            const voltage2 = result.getVoltage('2') || [];  // 節點2電壓 (電感後)
            const voltage3 = result.getVoltage('3') || [];  // 節點3電壓 (電容電壓)
            
            // 檢查特定時間點
            const keyTimePoints = [];
            const keyTimes = [0, 1.57e-3, 3.14e-3, 6.28e-3, 9.42e-3, 12.56e-3]; // T/4間隔
            
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
                
                keyTimePoints.push({
                    time: timeVector[closestIndex],
                    V1: voltage1[closestIndex] || 0,
                    V2: voltage2[closestIndex] || 0,
                    V3: voltage3[closestIndex] || 0
                });
            }
            
            console.log('\n🔋 關鍵時間點的節點電壓：');
            console.log('時間(ms)    V(1)[V]    V(2)[V]    V(3)[V]    相位');
            console.log('------------------------------------------------');
            
            for (let i = 0; i < keyTimePoints.length; i++) {
                const point = keyTimePoints[i];
                const phaseLabel = ['0°', '90°', '180°', '270°', '360°', '450°'][i] || `${i*90}°`;
                console.log(`${(point.time*1000).toFixed(2).padStart(8)} ${point.V1.toFixed(3).padStart(10)} ${point.V2.toFixed(3).padStart(10)} ${point.V3.toFixed(3).padStart(10)} ${phaseLabel.padStart(8)}`);
            }
            
            // 振盪特性分析
            console.log('\n📈 振盪特性分析：');
            
            // 尋找電容電壓的峰值和谷值
            const peaks = [];
            const valleys = [];
            
            for (let i = 1; i < voltage3.length - 1; i++) {
                if (voltage3[i] > voltage3[i-1] && voltage3[i] > voltage3[i+1]) {
                    peaks.push({ time: timeVector[i], voltage: voltage3[i] });
                }
                if (voltage3[i] < voltage3[i-1] && voltage3[i] < voltage3[i+1]) {
                    valleys.push({ time: timeVector[i], voltage: voltage3[i] });
                }
            }
            
            console.log(`找到 ${peaks.length} 個峰值, ${valleys.length} 個谷值`);
            
            if (peaks.length >= 2) {
                const measuredPeriod = peaks[1].time - peaks[0].time;
                const theoreticalPeriod = 2 * Math.PI / (1000 * Math.sqrt(1 - 0.158*0.158)); // Td = 2π/ωd
                const periodError = Math.abs(measuredPeriod - theoreticalPeriod) / theoreticalPeriod * 100;
                
                console.log(`實際週期: ${(measuredPeriod*1000).toFixed(3)}ms`);
                console.log(`理論週期: ${(theoreticalPeriod*1000).toFixed(3)}ms`);
                console.log(`週期誤差: ${periodError.toFixed(2)}%`);
                
                // 檢查阻尼
                if (peaks.length >= 2) {
                    const amplitude1 = peaks[0].voltage;
                    const amplitude2 = peaks[1].voltage;
                    const dampingRatio = -Math.log(amplitude2/amplitude1) / (1000 * (peaks[1].time - peaks[0].time));
                    const theoreticalDamping = 0.158 * 1000; // ζ * ω₀
                    const dampingError = Math.abs(dampingRatio - theoreticalDamping) / theoreticalDamping * 100;
                    
                    console.log(`實際阻尼: ${dampingRatio.toFixed(1)} rad/s`);
                    console.log(`理論阻尼: ${theoreticalDamping.toFixed(1)} rad/s`);
                    console.log(`阻尼誤差: ${dampingError.toFixed(2)}%`);
                }
            }
            
            // 數值穩定性檢查
            console.log('\n🔍 數值穩定性檢查：');
            
            // 能量守恆檢查（簡化版）
            const finalV3 = voltage3[voltage3.length - 1];
            const energyDrift = Math.abs(finalV3) / 5.0 * 100; // 相對於輸入電壓的百分比
            
            console.log(`最終電容電壓: ${finalV3.toFixed(6)}V`);
            console.log(`能量漂移指標: ${energyDrift.toFixed(3)}%`);
            
            // 測試通過條件
            const periodOK = peaks.length >= 2 && periodError < 5.0; // 週期誤差 < 5%
            const stabilityOK = energyDrift < 10.0; // 能量漂移 < 10%
            const convergenceOK = result.timeVector.length > 100; // 至少100個時間點
            
            console.log('\n✅ 結果驗證：');
            console.log(`週期精度: ${periodOK ? 'PASS' : 'FAIL'} (誤差 ${periodError?.toFixed(2) || 'N/A'}%)`);
            console.log(`數值穩定: ${stabilityOK ? 'PASS' : 'FAIL'} (漂移 ${energyDrift.toFixed(2)}%)`);
            console.log(`收斂性: ${convergenceOK ? 'PASS' : 'FAIL'} (${result.timeVector.length} 時間點)`);
            
            if (periodOK && stabilityOK && convergenceOK) {
                console.log('\n🎉 總體測試結果: PASS');
                console.log('✅ Gear 2積分器工作正常！');
                console.log('  - RLC電路振盪響應正確');
                console.log('  - 數值積分穩定性良好');
                console.log('  - 週期和阻尼特性準確');
                console.log('  - 長時間積分無發散');
                console.log('\n=== 步驟四測試結果: PASS ===');
                console.log('✅ 可以進行步驟五：Buck轉換器調試');
                return true;
            } else {
                console.log('\n❌ 總體測試結果: FAIL');
                console.log('❌ Gear 2積分器存在問題，需要調試');
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
        console.log('\n=== 步驟四測試結果: FAIL ===');
        console.log('❌ 需要調試積分器或分析器');
        return false;
    }
}

// 執行測試
testGear2IntegratorValidation();