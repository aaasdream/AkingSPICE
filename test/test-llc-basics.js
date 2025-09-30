/**
 * =================================================================
 *           LLC轉換器基礎物理驗證套件 - 簡化穩定版
 * =================================================================
 * 
 * 專注於最基本的、數值穩定的物理元件驗證
 */

// 導入基礎組件
import { Resistor } from '../src/components/resistor.js';
import { Capacitor } from '../src/components/capacitor.js';
import { Inductor } from '../src/components/inductor.js';
import { VoltageSource } from '../src/components/sources.js';

// 導入求解器
import { ExplicitStateSolver } from '../src/core/explicit-state-solver.js';

// 微型測試框架
class FundamentalTestRunner {
    constructor() {
        this.tests = [];
        this.stats = { passes: 0, fails: 0, total: 0 };
    }

    async test(name, testFunc) {
        this.stats.total++;
        console.log(`\n🔍 [測試] ${name}`);
        try {
            await testFunc();
            this.stats.passes++;
            console.log(`  ✅ 通過`);
        } catch (error) {
            this.stats.fails++;
            console.log(`  ❌ 失敗: ${error.message}`);
        }
    }

    assert(condition, message) {
        if (!condition) throw new Error(message);
    }

    assertCloseTo(actual, expected, tolerance, message) {
        const error = Math.abs(actual - expected);
        if (error > tolerance) {
            throw new Error(`${message} | 期望: ${expected} ±${tolerance}, 實際: ${actual}, 誤差: ${error.toFixed(6)}`);
        }
    }

    summary() {
        console.log(`\n==================== 基礎驗證總結 ====================`);
        console.log(`總計: ${this.stats.total}, 通過: ${this.stats.passes}, 失敗: ${this.stats.fails}`);
        console.log(`通過率: ${((this.stats.passes/this.stats.total)*100).toFixed(1)}%`);
        console.log(`====================================================\n`);
        return this.stats.passes === this.stats.total;
    }
}

/**
 * 測試1: 基本DC電路驗證
 */
async function testBasicDCCircuit() {
    const runner = new FundamentalTestRunner();

    await runner.test("驗證基本DC分壓電路", async () => {
        console.log(`    測試電路: 12V -> 10kΩ -> 5kΩ -> GND`);
        
        const components = [
            new VoltageSource('V1', ['vin', 'gnd'], 12),
            new Resistor('R1', ['vin', 'vout'], 10000),
            new Resistor('R2', ['vout', 'gnd'], 5000)
        ];
        
        const solver = new ExplicitStateSolver();
        await solver.initialize(components, 1e-6, { debug: false });
        
        // DC穩態分析
        const results = await solver.run(0, 10e-6); // 10μs足夠達到穩態
        
        // 獲取最終電壓
        const finalStep = results.nodeVoltages.get('vout').length - 1;
        const outputVoltage = results.nodeVoltages.get('vout')[finalStep];
        const inputVoltage = results.nodeVoltages.get('vin')[finalStep];
        
        console.log(`    輸入電壓: ${inputVoltage.toFixed(3)}V`);
        console.log(`    輸出電壓: ${outputVoltage.toFixed(3)}V`);
        
        // 理論分壓: Vout = Vin × R2/(R1+R2) = 12 × 5k/(10k+5k) = 4V
        const theoreticalOutput = 12 * 5000 / (10000 + 5000);
        console.log(`    理論電壓: ${theoreticalOutput.toFixed(3)}V`);
        
        runner.assertCloseTo(outputVoltage, theoreticalOutput, 0.1, "分壓結果應符合理論值");
    });

    return runner.summary();
}

/**
 * 測試2: RC電路時間常數驗證  
 */
async function testRCTimeConstant() {
    const runner = new FundamentalTestRunner();

    await runner.test("驗證RC電路時間常數", async () => {
        const R = 1000; // 1kΩ
        const C = 1e-6; // 1μF
        const tau = R * C; // 時間常數 = 1ms
        
        console.log(`    R = ${R}Ω, C = ${C*1e6}μF`);
        console.log(`    理論時間常數 τ = ${tau*1000}ms`);
        
        const components = [
            new VoltageSource('V1', ['vin', 'gnd'], 5), // 5V階躍輸入
            new Resistor('R1', ['vin', 'vout'], R),
            new Capacitor('C1', ['vout', 'gnd'], C, { ic: 0 }) // 初始電壓為0
        ];
        
        const solver = new ExplicitStateSolver();
        // 使用較小的時間步長確保穩定性
        const timeStep = tau / 1000; // τ/1000
        await solver.initialize(components, timeStep, { debug: false });
        
        console.log(`    時間步長: ${timeStep*1e6}μs`);
        
        // 模擬5個時間常數（理論上達到99.3%穩態）
        const simulationTime = 5 * tau;
        const results = await solver.run(0, simulationTime);
        
        console.log(`    模擬時間: ${simulationTime*1000}ms`);
        console.log(`    模擬步數: ${results.timeVector.length}`);
        
        // 分析關鍵時間點的電壓
        const timePoints = [tau, 2*tau, 3*tau];
        const theoreticalVoltages = timePoints.map(t => 5 * (1 - Math.exp(-t/tau)));
        
        for (let i = 0; i < timePoints.length; i++) {
            const targetTime = timePoints[i];
            const theoreticalV = theoreticalVoltages[i];
            
            // 找到最接近目標時間的索引
            let closestIndex = 0;
            let minTimeDiff = Math.abs(results.timeVector[0] - targetTime);
            for (let j = 1; j < results.timeVector.length; j++) {
                const timeDiff = Math.abs(results.timeVector[j] - targetTime);
                if (timeDiff < minTimeDiff) {
                    minTimeDiff = timeDiff;
                    closestIndex = j;
                }
            }
            
            const actualV = results.nodeVoltages.get('vout')[closestIndex];
            const error = Math.abs(actualV - theoreticalV) / theoreticalV * 100;
            
            console.log(`    t=${(targetTime*1000).toFixed(1)}ms: 理論=${theoreticalV.toFixed(3)}V, 實際=${actualV.toFixed(3)}V, 誤差=${error.toFixed(1)}%`);
            
            runner.assert(error < 5, `時間點${(targetTime*1000).toFixed(1)}ms誤差應小於5% (實際${error.toFixed(1)}%)`);
        }
        
        // 檢查最終穩態值
        const finalV = results.nodeVoltages.get('vout')[results.nodeVoltages.get('vout').length - 1];
        console.log(`    最終電壓: ${finalV.toFixed(3)}V (期望5.000V)`);
        runner.assertCloseTo(finalV, 5.0, 0.25, "最終電壓應接近輸入電壓");
    });

    return runner.summary();
}

/**
 * 測試3: 簡單AC正弦波響應
 */
async function testSimpleACResponse() {
    const runner = new FundamentalTestRunner();

    await runner.test("驗證簡單AC正弦波響應", async () => {
        const freq = 1000; // 1kHz，較低頻率避免數值問題
        const period = 1 / freq;
        
        console.log(`    測試頻率: ${freq}Hz`);
        console.log(`    週期: ${period*1000}ms`);
        
        const components = [
            new VoltageSource('V1', ['vin', 'gnd'], `SINE(0 5 ${freq})`), // 5V峰值正弦波
            new Resistor('R1', ['vin', 'gnd'], 1000) // 純電阻負載
        ];
        
        const solver = new ExplicitStateSolver();
        const timeStep = period / 200; // 每週期200個採樣點
        await solver.initialize(components, timeStep, { debug: false });
        
        console.log(`    時間步長: ${timeStep*1e6}μs`);
        
        // 模擬3個完整週期
        const results = await solver.run(0, 3 * period);
        
        console.log(`    模擬步數: ${results.timeVector.length}`);
        
        // 分析最後一個週期的波形
        const lastCycleStart = Math.floor(results.timeVector.length * 2/3);
        const voltages = results.nodeVoltages.get('vin').slice(lastCycleStart);
        
        const maxV = Math.max(...voltages);
        const minV = Math.min(...voltages);
        const amplitude = (maxV - minV) / 2;
        
        console.log(`    峰值: ${maxV.toFixed(3)}V`);
        console.log(`    谷值: ${minV.toFixed(3)}V`); 
        console.log(`    振幅: ${amplitude.toFixed(3)}V`);
        
        runner.assertCloseTo(amplitude, 5.0, 0.5, "正弦波振幅應接近5V");
        runner.assertCloseTo(maxV, 5.0, 0.5, "峰值應接近5V");
        runner.assertCloseTo(minV, -5.0, 0.5, "谷值應接近-5V");
        
        // 簡單的頻率檢測：計算過零點間隔
        const zeroCrossings = [];
        for (let i = 1; i < voltages.length; i++) {
            if ((voltages[i-1] <= 0 && voltages[i] > 0) || (voltages[i-1] >= 0 && voltages[i] < 0)) {
                const timeIndex = lastCycleStart + i;
                zeroCrossings.push(results.timeVector[timeIndex]);
            }
        }
        
        if (zeroCrossings.length >= 4) {
            const halfPeriods = [];
            for (let i = 1; i < zeroCrossings.length; i++) {
                halfPeriods.push(zeroCrossings[i] - zeroCrossings[i-1]);
            }
            const avgHalfPeriod = halfPeriods.reduce((sum, val) => sum + val, 0) / halfPeriods.length;
            const actualFreq = 1 / (2 * avgHalfPeriod);
            
            const freqError = Math.abs(actualFreq - freq) / freq * 100;
            console.log(`    測得頻率: ${actualFreq.toFixed(1)}Hz (誤差${freqError.toFixed(2)}%)`);
            
            runner.assert(freqError < 2, `頻率誤差應小於2% (實際${freqError.toFixed(2)}%)`);
        }
    });

    return runner.summary();
}

/**
 * 測試4: RL電路驗證
 */
async function testRLCircuit() {
    const runner = new FundamentalTestRunner();

    await runner.test("驗證RL電路時間響應", async () => {
        const R = 100; // 100Ω  
        const L = 1e-3; // 1mH
        const tau = L / R; // 時間常數 = 10μs
        
        console.log(`    R = ${R}Ω, L = ${L*1000}mH`);
        console.log(`    理論時間常數 τ = ${tau*1e6}μs`);
        
        const components = [
            new VoltageSource('V1', ['vin', 'gnd'], 12), // 12V階躍
            new Resistor('R1', ['vin', 'vout'], R),
            new Inductor('L1', ['vout', 'gnd'], L, { ic: 0 }) // 初始電流為0
        ];
        
        const solver = new ExplicitStateSolver();
        const timeStep = tau / 100; // 較小步長確保穩定性
        await solver.initialize(components, timeStep, { debug: false });
        
        console.log(`    時間步長: ${timeStep*1e6}μs`);
        
        // 模擬5個時間常數
        const simulationTime = 5 * tau;
        const results = await solver.run(0, simulationTime);
        
        console.log(`    模擬時間: ${simulationTime*1e6}μs`);
        console.log(`    模擬步數: ${results.timeVector.length}`);
        
        // RL電路的電流響應: i(t) = (V/R) * (1 - exp(-t*R/L))
        // 電感電壓: vL(t) = V * exp(-t*R/L)
        
        const targetTime = tau; // 在一個時間常數處檢查
        let closestIndex = 0;
        let minTimeDiff = Math.abs(results.timeVector[0] - targetTime);
        for (let j = 1; j < results.timeVector.length; j++) {
            const timeDiff = Math.abs(results.timeVector[j] - targetTime);
            if (timeDiff < minTimeDiff) {
                minTimeDiff = timeDiff;
                closestIndex = j;
            }
        }
        
        const actualV = results.nodeVoltages.get('vout')[closestIndex];
        // 在t=τ時，vL = V * exp(-1) ≈ 0.368 * V
        const theoreticalV = 12 * Math.exp(-1);
        const error = Math.abs(actualV - theoreticalV) / theoreticalV * 100;
        
        console.log(`    t=${(targetTime*1e6).toFixed(1)}μs: 理論=${theoreticalV.toFixed(3)}V, 實際=${actualV.toFixed(3)}V, 誤差=${error.toFixed(1)}%`);
        
        runner.assert(error < 10, `RL響應誤差應小於10% (實際${error.toFixed(1)}%)`);
    });

    return runner.summary();
}

// 主執行函數
async function main() {
    console.log("🔬 LLC轉換器基礎物理驗證 - 簡化穩定版\n");
    
    let allTestsPassed = true;
    
    try {
        console.log("📊 測試1: 基本DC電路分析");
        allTestsPassed &= await testBasicDCCircuit();
        
        console.log("⏱️ 測試2: RC時間常數響應");
        allTestsPassed &= await testRCTimeConstant();
        
        console.log("🌊 測試3: AC正弦波響應");
        allTestsPassed &= await testSimpleACResponse();
        
        console.log("🔄 測試4: RL電路時間響應");
        allTestsPassed &= await testRLCircuit();
        
        console.log("\n" + "=".repeat(60));
        if (allTestsPassed) {
            console.log("🎉 所有基礎驗證測試通過！AkingSpice基礎物理模型工作正常。");
            console.log("✅ 可以進行LLC轉換器電路設計了！");
        } else {
            console.log("⚠️ 部分基礎驗證測試失敗，建議先解決基礎問題。");
        }
        console.log("=".repeat(60));
        
    } catch (error) {
        console.error("❌ 驗證過程中發生錯誤:", error);
        console.error("堆疊追蹤:", error.stack);
        process.exit(1);
    }
}

// 直接執行測試
main().catch(error => {
    console.error('測試執行失敗:', error.message);
    process.exit(1);
});

export { 
    testBasicDCCircuit,
    testRCTimeConstant, 
    testSimpleACResponse,
    testRLCircuit,
    FundamentalTestRunner
};