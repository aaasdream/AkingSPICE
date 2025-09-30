/**
 * =================================================================
 *           LLC轉換器基礎物理驗證套件 - 逐一分解驗證
 * =================================================================
 * 
 * 目的：將LLC轉換器分解為最基本的物理元件，逐一驗證：
 * 1. 時間步長vs頻率精度
 * 2. 正弦波頻率產生準確性  
 * 3. RLC頻率響應計算
 * 4. PWM頻率控制精度
 * 5. 變壓器基礎耦合
 * 6. 理論計算vs模擬結果對比
 */

import {
    AkingSPICE, Resistor, Capacitor, Inductor, VoltageSource,
    VoltageControlledMOSFET, MultiWindingTransformer
} from './src/index.js';

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
    }
}

/**
 * 測試1: 驗證時間步長vs頻率精度
 */
async function testTimeStepVsFrequency() {
    const runner = new FundamentalTestRunner();
    const solver = new AkingSPICE();

    await runner.test("驗證70kHz正弦波的時間步長精度", async () => {
        const freq = 70e3;
        const period = 1 / freq; // 14.286μs
        
        // 測試不同的時間步長
        const timeSteps = [period/10, period/50, period/100, period/500];
        
        for (let i = 0; i < timeSteps.length; i++) {
            const timeStep = timeSteps[i];
            console.log(`    時間步長: ${(timeStep*1e6).toFixed(3)}μs (週期/${10*Math.pow(5,i)})`);
            
            solver.reset();
            solver.components = [
                new VoltageSource('V1', ['n1', '0'], `SINE(0 10 ${freq})`),
                new Resistor('R1', ['n1', '0'], 1000)
            ];
            solver.isInitialized = true;
            
            // 模擬一個完整週期
            const results = await solver.runSteppedSimulation(() => ({}), {
                stopTime: period * 2,
                timeStep: timeStep
            });
            
            // 檢查是否有足夠的採樣點捕捉波形
            const pointsPerCycle = Math.floor(period / timeStep);
            console.log(`    每週期採樣點: ${pointsPerCycle}`);
            
            // 檢查峰值檢測
            const voltages = results.steps.map(s => s.nodeVoltages['n1']);
            const maxVoltage = Math.max(...voltages);
            const minVoltage = Math.min(...voltages);
            
            console.log(`    峰值: ${maxVoltage.toFixed(3)}V, 谷值: ${minVoltage.toFixed(3)}V`);
            
            // 驗證峰值在合理範圍內
            runner.assertCloseTo(maxVoltage, 10.0, 0.5, `峰值應接近10V (時間步長${(timeStep*1e6).toFixed(3)}μs)`);
            runner.assertCloseTo(minVoltage, -10.0, 0.5, `谷值應接近-10V (時間步長${(timeStep*1e6).toFixed(3)}μs)`);
        }
    });

    runner.summary();
}

/**
 * 測試2: 驗證正弦波頻率產生準確性
 */
async function testSineWaveFrequencyAccuracy() {
    const runner = new FundamentalTestRunner();
    const solver = new AkingSPICE();

    await runner.test("驗證不同頻率正弦波的準確性", async () => {
        const frequencies = [1e3, 10e3, 50e3, 70e3, 100e3]; // 1kHz到100kHz
        
        for (const freq of frequencies) {
            console.log(`    測試頻率: ${(freq/1000).toFixed(1)}kHz`);
            
            const period = 1 / freq;
            const timeStep = period / 200; // 每週期200個採樣點
            
            solver.reset();
            solver.components = [
                new VoltageSource('V1', ['n1', '0'], `SINE(0 5 ${freq})`),
                new Resistor('R1', ['n1', '0'], 1000)
            ];
            solver.isInitialized = true;
            
            // 模擬多個週期
            const results = await solver.runSteppedSimulation(() => ({}), {
                stopTime: period * 5,
                timeStep: timeStep
            });
            
            // 分析頻率內容 - 簡化的過零點檢測
            const voltages = results.steps.map(s => s.nodeVoltages['n1']);
            const times = results.steps.map(s => s.time);
            
            // 找過零點
            const zeroCrossings = [];
            for (let i = 1; i < voltages.length; i++) {
                if ((voltages[i-1] <= 0 && voltages[i] > 0) || (voltages[i-1] >= 0 && voltages[i] < 0)) {
                    zeroCrossings.push(times[i]);
                }
            }
            
            if (zeroCrossings.length >= 4) {
                // 計算實際頻率（過零點間隔 = 半週期）
                const halfPeriods = [];
                for (let i = 1; i < zeroCrossings.length; i++) {
                    halfPeriods.push(zeroCrossings[i] - zeroCrossings[i-1]);
                }
                const avgHalfPeriod = halfPeriods.reduce((sum, val) => sum + val, 0) / halfPeriods.length;
                const actualFreq = 1 / (2 * avgHalfPeriod);
                
                console.log(`    理論頻率: ${freq.toFixed(0)}Hz, 實際頻率: ${actualFreq.toFixed(0)}Hz`);
                
                const freqError = Math.abs(actualFreq - freq) / freq * 100;
                console.log(`    頻率誤差: ${freqError.toFixed(2)}%`);
                
                runner.assert(freqError < 1.0, `頻率誤差應小於1% (實際${freqError.toFixed(2)}%)`);
            } else {
                throw new Error(`過零點太少，無法分析頻率 (發現${zeroCrossings.length}個過零點)`);
            }
        }
    });

    runner.summary();
}

/**
 * 測試3: 驗證RLC頻率響應計算
 */
async function testRLCFrequencyResponse() {
    const runner = new FundamentalTestRunner();
    const solver = new AkingSPICE();

    await runner.test("驗證串聯RLC電路的頻率響應", async () => {
        // 設計參數
        const L = 25e-6; // 25μH
        const C = 207e-9; // 207nF  
        const R = 10; // 10Ω
        
        // 理論計算
        const fr = 1 / (2 * Math.PI * Math.sqrt(L * C)); // 諧振頻率
        const Q = (1/R) * Math.sqrt(L/C); // 品質因數
        const Z0 = Math.sqrt(L/C); // 特性阻抗
        
        console.log(`    理論諧振頻率: ${(fr/1000).toFixed(1)}kHz`);
        console.log(`    理論Q值: ${Q.toFixed(2)}`);  
        console.log(`    特性阻抗: ${Z0.toFixed(1)}Ω`);
        
        // 測試頻率點：fr/2, fr, 2*fr
        const testFreqs = [fr/2, fr, fr*2];
        const theoreticalGains = [];
        const simulatedGains = [];
        
        for (let i = 0; i < testFreqs.length; i++) {
            const f = testFreqs[i];
            const omega = 2 * Math.PI * f;
            
            // 理論計算阻抗和增益
            const XL = omega * L;
            const XC = 1 / (omega * C);
            const Z_total = Math.sqrt(R*R + (XL - XC)*(XL - XC));
            const theoreticalGain = R / Z_total; // 電壓分壓比
            theoreticalGains.push(theoreticalGain);
            
            console.log(`    測試頻率 ${(f/1000).toFixed(1)}kHz:`);
            console.log(`      XL=${XL.toFixed(2)}Ω, XC=${XC.toFixed(2)}Ω, Z_total=${Z_total.toFixed(2)}Ω`);
            console.log(`      理論增益=${theoreticalGain.toFixed(4)}`);
            
            // 模擬驗證
            solver.reset();
            solver.components = [
                new VoltageSource('V1', ['in', '0'], `SINE(0 10 ${f})`),
                new Inductor('L1', ['in', 'n1'], L),
                // ✅ 修正：設置電容初始條件為0
                new Capacitor('C1', ['n1', 'out'], C, { ic: 0 }),
                new Resistor('R1', ['out', '0'], R)
            ];
            solver.isInitialized = true;
            
            const period = 1 / f;
            // ✅ 修正：增加到100個週期確保穩態，特別是高Q值電路
            const results = await solver.runSteppedSimulation(() => ({}), {
                stopTime: period * 100, // 增加到100個週期
                timeStep: period / 50   // ✅ 修正：減少時間步長提高精度
            });
            
            // ✅ 修正：使用最後20個週期計算RMS值，更穩定
            const totalSteps = results.steps.length;
            const lastTwentyCycles = Math.floor(totalSteps * 20/100); // 最後20個週期
            const steadyStateStart = totalSteps - lastTwentyCycles;
            const steadyVoltages = results.steps.slice(steadyStateStart).map(s => s.nodeVoltages['out'] || 0);
            
            // 計算RMS而非峰值，更準確
            let sumSquares = 0;
            for (const v of steadyVoltages) {
                sumSquares += v * v;
            }
            const outputRMS = Math.sqrt(sumSquares / steadyVoltages.length);
            const inputRMS = 10.0 / Math.sqrt(2); // 正弦波RMS = 峰值/√2
            const simulatedGain = outputRMS / inputRMS;
            simulatedGains.push(simulatedGain);
            
            console.log(`      模擬增益=${simulatedGain.toFixed(4)}`);
            
            // 比較理論與模擬結果
            const gainError = Math.abs(simulatedGain - theoreticalGain) / theoreticalGain * 100;
            console.log(`      增益誤差=${gainError.toFixed(1)}%`);
            
            runner.assert(gainError < 10, `增益誤差應小於10% (實際${gainError.toFixed(1)}%)`);
        }
        
        // 驗證諧振特性：fr處的增益應該最高
        const frIndex = 1; // fr是第二個測試點
        runner.assert(simulatedGains[frIndex] > simulatedGains[0], "諧振頻率處增益應大於低頻");
        runner.assert(simulatedGains[frIndex] > simulatedGains[2], "諧振頻率處增益應大於高頻");
        console.log(`    諧振特性驗證：低頻${simulatedGains[0].toFixed(3)} < 諧振${simulatedGains[1].toFixed(3)} > 高頻${simulatedGains[2].toFixed(3)}`);
    });

    runner.summary();
}

/**
 * 測試4: 驗證PWM頻率控制精度
 */
async function testPWMFrequencyControl() {
    const runner = new FundamentalTestRunner();
    const solver = new AkingSPICE();

    await runner.test("驗證PWM控制器的頻率精度", async () => {
        const targetFreqs = [50e3, 75e3, 100e3]; // 目標頻率
        const duty = 0.5; // 50%占空比
        
        for (const targetFreq of targetFreqs) {
            console.log(`    目標PWM頻率: ${(targetFreq/1000).toFixed(1)}kHz`);
            
            solver.reset();
            solver.components = [
                new VoltageSource('Vdd', ['vdd', '0'], 12),
                new VoltageSource('Vgate', ['gate', '0'], 0), // 可控制的閘極電壓源
                // ✅ 修正：高側開關配置 - drain接vdd, source接out
                new VoltageControlledMOSFET('Q1', ['vdd', 'gate', 'out'], { 
                    Vth: 2.0, 
                    Ron: 0.1, 
                    Roff: 1e8 
                }),
                new Resistor('Rload', ['vdd', 'out'], 100) // 修正：從Vdd到out的負載電阻
            ];
            solver.isInitialized = true;
            
            const period = 1 / targetFreq;
            const timeStep = period / 100;
            
            // 🔥 修正的PWM控制函數：更新閘極電壓源
            const pwmControl = (time) => {
                const t_in_period = time % period;
                const gate_voltage = t_in_period < (period * duty) ? 5.0 : 0.0; // 5V/0V開關
                
                // 更新閘極電壓源
                const gateSource = solver.components.find(c => c.name === 'Vgate');
                if (gateSource) {
                    gateSource.value = gate_voltage;
                    gateSource.dc = gate_voltage;
                }
                
                // 🔥 關鍵：手動更新MOSFET狀態
                const mosfet = solver.components.find(c => c.name === 'Q1');
                if (mosfet && mosfet.updateVoltages) {
                    const mockNodeVoltages = new Map([
                        ['vdd', 12],
                        ['gate', gate_voltage],
                        ['out', gate_voltage > 2.0 ? 6 : 12], // 初始猜測
                        ['0', 0]
                    ]);
                    mosfet.updateVoltages(mockNodeVoltages);
                }
                
                return {}; // 不需要返回控制輸入
            };
            
            const results = await solver.runSteppedSimulation(pwmControl, {
                stopTime: period * 20, // 20個週期
                timeStep: timeStep
            });
            
            // 分析PWM輸出
            const times = results.steps.map(s => s.time);
            const voltages = results.steps.map(s => s.nodeVoltages['out']);
            
            // 找所有電平轉換的時間點（開關切換）
            const transitions = [];
            const threshold = 6; // 6V作為高/低電平閾值
            for (let i = 1; i < voltages.length; i++) {
                // 檢測任何方向的轉換：高→低 或 低→高
                if ((voltages[i-1] > threshold && voltages[i] < threshold) || 
                    (voltages[i-1] < threshold && voltages[i] > threshold)) {
                    transitions.push(times[i]);
                }
            }
            
            console.log(`    檢測到 ${transitions.length} 個PWM轉換點`);
            if (transitions.length > 0) {
                console.log(`    首幾個轉換時間: ${transitions.slice(0, 5).map(t => (t*1e6).toFixed(2) + 'μs').join(', ')}`);
            }
            
            if (transitions.length >= 2) {
                // 計算實際頻率
                const periods = [];
                for (let i = 1; i < transitions.length; i++) {
                    periods.push(transitions[i] - transitions[i-1]);
                }
                const avgPeriod = periods.reduce((sum, p) => sum + p, 0) / periods.length;
                const actualFreq = 1 / avgPeriod;
                
                console.log(`    實際PWM頻率: ${(actualFreq/1000).toFixed(1)}kHz`);
                
                const freqError = Math.abs(actualFreq - targetFreq) / targetFreq * 100;
                console.log(`    頻率誤差: ${freqError.toFixed(2)}%`);
                
                runner.assert(freqError < 1.0, `PWM頻率誤差應小於1% (實際${freqError.toFixed(2)}%)`);
            } else {
                throw new Error(`PWM轉換點太少，無法分析頻率 (發現${transitions.length}個轉換點)`);
            }
        }
    });

    runner.summary();
}

/**
 * 測試5: 驗證變壓器基礎耦合
 */
async function testTransformerBasicCoupling() {
    const runner = new FundamentalTestRunner();
    const solver = new AkingSPICE();

    await runner.test("驗證變壓器匝數比和相位關係", async () => {
        const turnsRatios = [2, 5, 10]; // 測試不同匝數比
        const testFreq = 10e3; // 使用較低頻率避免寄生效應
        
        for (const ratio of turnsRatios) {
            console.log(`    測試匝數比 ${ratio}:1`);
            
            solver.reset();
            const transformer = new MultiWindingTransformer('T1', {
                windings: [
                    { name: 'pri', nodes: ['pri', '0'], inductance: 1e-3, turns: ratio },
                    { name: 'sec', nodes: ['sec', '0'], inductance: 1e-3/(ratio*ratio), turns: 1 }
                ],
                couplingMatrix: [
                    [1.0, 0.99],
                    [0.99, 1.0]
                ]
            });
            
            solver.components = [
                new VoltageSource('Vac', ['pri', '0'], `SINE(0 10 ${testFreq})`),
                transformer,
                new Resistor('Rload', ['sec', '0'], 1000) // 輕載測試
            ];
            solver.isInitialized = true;
            
            const period = 1 / testFreq;
            const results = await solver.runSteppedSimulation(() => ({}), {
                stopTime: period * 5,
                timeStep: period / 100
            });
            
            // 分析穩態電壓振幅
            const steadyStart = Math.floor(results.steps.length * 0.6);
            const priVoltages = results.steps.slice(steadyStart).map(s => s.nodeVoltages['pri']);
            const secVoltages = results.steps.slice(steadyStart).map(s => s.nodeVoltages['sec']);
            
            const priAmplitude = (Math.max(...priVoltages) - Math.min(...priVoltages)) / 2;
            const secAmplitude = (Math.max(...secVoltages) - Math.min(...secVoltages)) / 2;
            
            console.log(`    一次側振幅: ${priAmplitude.toFixed(2)}V`);
            console.log(`    二次側振幅: ${secAmplitude.toFixed(2)}V`);
            
            const actualRatio = priAmplitude / secAmplitude;
            console.log(`    實際電壓比: ${actualRatio.toFixed(2)}:1`);
            
            const ratioError = Math.abs(actualRatio - ratio) / ratio * 100;
            console.log(`    匝數比誤差: ${ratioError.toFixed(1)}%`);
            
            runner.assert(ratioError < 5, `變壓器匝數比誤差應小於5% (實際${ratioError.toFixed(1)}%)`);
        }
    });

    runner.summary();
}

// 主執行函數
async function main() {
    console.log("🔬 LLC轉換器基礎物理驗證開始...\n");
    
    try {
        await testTimeStepVsFrequency();
        await testSineWaveFrequencyAccuracy();  
        await testRLCFrequencyResponse();
        await testPWMFrequencyControl();
        await testTransformerBasicCoupling();
        
        console.log("✅ 所有基礎驗證完成！");
    } catch (error) {
        console.error("❌ 驗證過程中發生錯誤:", error);
        process.exit(1);
    }
}

main();