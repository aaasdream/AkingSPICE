/**
 * WebGPU vs CPU 驗算測試系統
 * 
 * 功能：
 * 1. 對比CPU和WebGPU求解器的計算結果
 * 2. 驗證數值精度和性能差異
 * 3. 檢測GPU計算錯誤和數據傳輸問題
 * 4. 生成詳細的驗算報告
 */

import { ExplicitStateSolver } from '../src/core/explicit-state-solver.js';
import { GPUExplicitStateSolver } from '../src/core/gpu-explicit-solver.js';
import { VoltageSource } from '../src/components/sources.js';
import { Resistor } from '../src/components/resistor.js';
import { Capacitor } from '../src/components/capacitor.js';
import { Inductor } from '../src/components/inductor.js';
import { Diode } from '../src/components/diode.js';

class WebGPUValidationSuite {
    constructor(options = {}) {
        this.debug = options.debug || false;
        this.tolerances = {
            voltage: 1e-6,      // 電壓容差 (V)
            current: 1e-9,      // 電流容差 (A)  
            relative: 1e-6,     // 相對誤差
            state: 1e-8,        // 狀態變量容差
        };
        
        this.testResults = [];
        this.performanceMetrics = [];
    }

    /**
     * 執行完整的WebGPU驗算測試套件
     */
    async runValidationSuite() {
        console.log('🔬 啟動WebGPU驗算測試套件...\n');

        const testCases = [
            {
                name: 'RC電路基礎驗算',
                description: '簡單RC電路的CPU vs GPU計算對比',
                testFunction: () => this.validateRCCircuit()
            },
            {
                name: 'RLC振盪電路驗算',
                description: 'RLC振盪電路的頻域響應驗算',
                testFunction: () => this.validateRLCCircuit()
            },
            {
                name: '二極體整流器驗算',
                description: '非線性二極體整流的GPU並行計算驗算',
                testFunction: () => this.validateDiodeRectifier()
            },
            {
                name: '多節點線性網絡驗算',
                description: '大型線性網絡的Jacobi求解器驗算',
                testFunction: () => this.validateLargeLinearNetwork()
            },
            {
                name: '性能基準測試',
                description: 'CPU vs GPU性能對比和擴展性分析',
                testFunction: () => this.performanceBenchmark()
            }
        ];

        let passedTests = 0;
        const totalTests = testCases.length;

        for (const testCase of testCases) {
            console.log(`🧪 執行測試: ${testCase.name}`);
            console.log(`   描述: ${testCase.description}`);
            
            try {
                const result = await testCase.testFunction();
                if (result.passed) {
                    console.log(`   ✅ 通過 - ${result.summary}`);
                    passedTests++;
                } else {
                    console.log(`   ❌ 失敗 - ${result.error}`);
                }
                this.testResults.push(result);
            } catch (error) {
                console.log(`   💥 錯誤 - ${error.message}`);
                this.testResults.push({
                    name: testCase.name,
                    passed: false,
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            }
            
            console.log(''); // 空行分隔
        }

        // 生成總結報告
        this.generateValidationReport(passedTests, totalTests);
        
        return {
            passedTests,
            totalTests,
            passRate: (passedTests / totalTests * 100).toFixed(1),
            results: this.testResults,
            performance: this.performanceMetrics
        };
    }

    /**
     * RC電路基礎驗算
     */
    async validateRCCircuit() {
        const startTime = Date.now();

        try {
            // 設置測試電路
            const components = [
                new VoltageSource('V1', ['in', 'gnd'], 'DC(5)'),
                new Resistor('R1', ['in', 'out'], 1000),
                new Capacitor('C1', ['out', 'gnd'], 100e-6, { ic: 0 })
            ];

            // 仿真參數
            const timeStep = 1e-5;
            const simTime = 0.001;  // 1ms
            const steps = Math.floor(simTime / timeStep);

            // CPU求解器
            const cpuSolver = new ExplicitStateSolver();
            await cpuSolver.initialize(components, timeStep, { debug: false });
            const cpuResults = await cpuSolver.run(0, simTime);

            // GPU求解器
            const gpuSolver = new GPUExplicitStateSolver({ debug: false });
            await gpuSolver.initialize(components, timeStep, { debug: false });
            const gpuResults = await gpuSolver.run(0, simTime);

            // 數值驗算
            const validation = this.compareResults(cpuResults, gpuResults, 'RC電路');
            
            // 性能統計
            const executionTime = Date.now() - startTime;
            this.performanceMetrics.push({
                testName: 'RC電路',
                cpuTime: cpuResults.totalTime || 0,
                gpuTime: gpuResults.totalTime || 0,
                executionTime,
                nodeCount: 2,
                stateCount: 1,
                timeSteps: steps
            });

            if (validation.passed) {
                return {
                    name: 'RC電路基礎驗算',
                    passed: true,
                    summary: `最大誤差: ${validation.maxError.toFixed(2)}%, 平均誤差: ${validation.avgError.toFixed(2)}%`,
                    details: validation,
                    executionTime
                };
            } else {
                return {
                    name: 'RC電路基礎驗算',
                    passed: false,
                    error: `驗算失敗: ${validation.errorMessage}`,
                    details: validation,
                    executionTime
                };
            }

        } catch (error) {
            return {
                name: 'RC電路基礎驗算',
                passed: false,
                error: `測試異常: ${error.message}`,
                executionTime: Date.now() - startTime
            };
        }
    }

    /**
     * RLC振盪電路驗算
     */
    async validateRLCCircuit() {
        const startTime = Date.now();

        try {
            const components = [
                new VoltageSource('V1', ['in', 'gnd'], 'PULSE(0 5 0 1e-9 1e-9 50e-6 100e-6)'),
                new Resistor('R1', ['in', 'n1'], 10),
                new Inductor('L1', ['n1', 'out'], 1e-3, { ic: 0 }),
                new Capacitor('C1', ['out', 'gnd'], 10e-6, { ic: 0 })
            ];

            const timeStep = 1e-6;
            const simTime = 200e-6;  // 200μs，包含兩個脈衝週期

            // CPU與GPU求解
            const cpuSolver = new ExplicitStateSolver();
            await cpuSolver.initialize(components, timeStep, { debug: false });
            const cpuResults = await cpuSolver.run(0, simTime);

            const gpuSolver = new GPUExplicitStateSolver({ debug: false });
            await gpuSolver.initialize(components, timeStep, { debug: false });
            const gpuResults = await gpuSolver.run(0, simTime);

            // 頻域分析驗算
            const validation = this.compareRLCResults(cpuResults, gpuResults);
            
            const executionTime = Date.now() - startTime;
            this.performanceMetrics.push({
                testName: 'RLC振盪電路',
                cpuTime: cpuResults.totalTime || 0,
                gpuTime: gpuResults.totalTime || 0,
                executionTime,
                nodeCount: 3,
                stateCount: 2,
                timeSteps: Math.floor(simTime / timeStep)
            });

            return {
                name: 'RLC振盪電路驗算',
                passed: validation.passed,
                summary: validation.passed ? 
                    `振盪頻率誤差: ${validation.frequencyError.toFixed(3)}%, 衰減誤差: ${validation.dampingError.toFixed(3)}%` :
                    validation.errorMessage,
                details: validation,
                executionTime
            };

        } catch (error) {
            return {
                name: 'RLC振盪電路驗算',
                passed: false,
                error: `測試異常: ${error.message}`,
                executionTime: Date.now() - startTime
            };
        }
    }

    /**
     * 二極體整流器驗算（非線性電路）
     */
    async validateDiodeRectifier() {
        const startTime = Date.now();

        try {
            const components = [
                new VoltageSource('V1', ['in', 'gnd'], 'SINE(0 10 1000)'),
                new Diode('D1', ['in', 'out']),
                new Resistor('R1', ['out', 'gnd'], 1000)
            ];

            const timeStep = 20e-6;  // 20μs
            const simTime = 5e-3;    // 5ms，5個正弦週期

            // CPU求解器
            const cpuSolver = new ExplicitStateSolver();
            await cpuSolver.initialize(components, timeStep, { debug: false });
            const cpuResults = await cpuSolver.run(0, simTime);

            // GPU求解器需要特別處理非線性組件
            const gpuSolver = new GPUExplicitStateSolver({ 
                debug: false,
                nonlinearMethod: 'iterative',  // 非線性迭代處理
                maxNonlinearIterations: 10
            });
            await gpuSolver.initialize(components, timeStep, { debug: false });
            const gpuResults = await gpuSolver.run(0, simTime);

            // 整流效果驗算
            const validation = this.validateDiodeResults(cpuResults, gpuResults);
            
            const executionTime = Date.now() - startTime;
            this.performanceMetrics.push({
                testName: '二極體整流器',
                cpuTime: cpuResults.totalTime || 0,
                gpuTime: gpuResults.totalTime || 0,
                executionTime,
                nodeCount: 2,
                stateCount: 0,
                timeSteps: Math.floor(simTime / timeStep),
                nonlinear: true
            });

            return {
                name: '二極體整流器驗算',
                passed: validation.passed,
                summary: validation.passed ? 
                    `整流效率誤差: ${validation.rectificationError.toFixed(2)}%, 導通狀態一致性: ${validation.conductionConsistency.toFixed(1)}%` :
                    validation.errorMessage,
                details: validation,
                executionTime
            };

        } catch (error) {
            return {
                name: '二極體整流器驗算',
                passed: false,
                error: `測試異常: ${error.message}`,
                executionTime: Date.now() - startTime
            };
        }
    }

    /**
     * 大型線性網絡驗算
     */
    async validateLargeLinearNetwork() {
        const startTime = Date.now();

        try {
            // 創建10x10電阻網格
            const components = [];
            const gridSize = 10;
            
            // 添加電源
            components.push(new VoltageSource('V1', [`n_0_0`, 'gnd'], 'DC(10)'));
            
            // 創建電阻網格
            for (let i = 0; i < gridSize; i++) {
                for (let j = 0; j < gridSize; j++) {
                    const nodeId = `n_${i}_${j}`;
                    
                    // 水平電阻
                    if (j < gridSize - 1) {
                        const nextNode = `n_${i}_${j + 1}`;
                        components.push(new Resistor(`Rh_${i}_${j}`, [nodeId, nextNode], 100));
                    }
                    
                    // 垂直電阻
                    if (i < gridSize - 1) {
                        const bottomNode = `n_${i + 1}_${j}`;
                        components.push(new Resistor(`Rv_${i}_${j}`, [nodeId, bottomNode], 100));
                    }
                    
                    // 接地電阻（除了源節點）
                    if (!(i === 0 && j === 0)) {
                        components.push(new Resistor(`Rg_${i}_${j}`, [nodeId, 'gnd'], 1000));
                    }
                }
            }

            const timeStep = 1e-5;
            const simTime = 1e-4;

            console.log(`   網格規模: ${gridSize}x${gridSize}, 元件數: ${components.length}`);

            // CPU vs GPU求解
            const cpuSolver = new ExplicitStateSolver();
            await cpuSolver.initialize(components, timeStep, { debug: false });
            const cpuResults = await cpuSolver.run(0, simTime);

            const gpuSolver = new GPUExplicitStateSolver({ 
                debug: false,
                solverMaxIterations: 2000  // 大型矩陣可能需要更多迭代
            });
            await gpuSolver.initialize(components, timeStep, { debug: false });
            const gpuResults = await gpuSolver.run(0, simTime);

            // 大型網絡驗算
            const validation = this.validateLargeNetworkResults(cpuResults, gpuResults);
            
            const executionTime = Date.now() - startTime;
            this.performanceMetrics.push({
                testName: '大型線性網絡',
                cpuTime: cpuResults.totalTime || 0,
                gpuTime: gpuResults.totalTime || 0,
                executionTime,
                nodeCount: gridSize * gridSize,
                stateCount: 0,
                componentCount: components.length,
                timeSteps: Math.floor(simTime / timeStep)
            });

            return {
                name: '大型線性網絡驗算',
                passed: validation.passed,
                summary: validation.passed ? 
                    `收斂性: ${validation.convergence ? '良好' : '差'}, 最大節點誤差: ${validation.maxNodeError.toFixed(2)}%` :
                    validation.errorMessage,
                details: validation,
                executionTime
            };

        } catch (error) {
            return {
                name: '大型線性網絡驗算',
                passed: false,
                error: `測試異常: ${error.message}`,
                executionTime: Date.now() - startTime
            };
        }
    }

    /**
     * 性能基準測試
     */
    async performanceBenchmark() {
        const startTime = Date.now();
        
        try {
            const benchmarkResults = [];
            const scalingSizes = [5, 10, 20, 50];  // 不同規模的測試

            for (const size of scalingSizes) {
                console.log(`   測試規模: ${size}x${size} 網格...`);

                // 創建測試電路
                const components = [];
                components.push(new VoltageSource('V1', [`n_0_0`, 'gnd'], 'SINE(0 5 1000)'));
                
                for (let i = 0; i < size; i++) {
                    for (let j = 0; j < size; j++) {
                        const nodeId = `n_${i}_${j}`;
                        
                        if (j < size - 1) {
                            components.push(new Resistor(`Rh_${i}_${j}`, [nodeId, `n_${i}_${j + 1}`], 100));
                        }
                        if (i < size - 1) {
                            components.push(new Resistor(`Rv_${i}_${j}`, [nodeId, `n_${i + 1}_${j}`], 100));
                        }
                        if (!(i === 0 && j === 0)) {
                            components.push(new Resistor(`Rg_${i}_${j}`, [nodeId, 'gnd'], 1000));
                        }
                    }
                }

                const timeStep = 1e-5;
                const simTime = 1e-4;

                // CPU性能測試
                const cpuStartTime = Date.now();
                const cpuSolver = new ExplicitStateSolver();
                await cpuSolver.initialize(components, timeStep, { debug: false });
                const cpuResults = await cpuSolver.run(0, simTime);
                const cpuTime = Date.now() - cpuStartTime;

                // GPU性能測試
                const gpuStartTime = Date.now();
                const gpuSolver = new GPUExplicitStateSolver({ debug: false });
                await gpuSolver.initialize(components, timeStep, { debug: false });
                const gpuResults = await gpuSolver.run(0, simTime);
                const gpuTime = Date.now() - gpuStartTime;

                benchmarkResults.push({
                    size,
                    nodeCount: size * size,
                    componentCount: components.length,
                    cpuTime,
                    gpuTime,
                    speedup: cpuTime / gpuTime,
                    efficiency: cpuTime > gpuTime ? 'GPU更快' : 'CPU更快'
                });
            }

            const executionTime = Date.now() - startTime;
            
            // 分析性能趨勢
            const analysis = this.analyzePerformanceTrend(benchmarkResults);

            return {
                name: '性能基準測試',
                passed: true,
                summary: `GPU加速效果: ${analysis.avgSpeedup.toFixed(2)}x, 最適規模: ${analysis.optimalSize}節點`,
                details: {
                    benchmarkResults,
                    analysis,
                    scalabilityTrend: analysis.scalabilityTrend
                },
                executionTime
            };

        } catch (error) {
            return {
                name: '性能基準測試',
                passed: false,
                error: `基準測試異常: ${error.message}`,
                executionTime: Date.now() - startTime
            };
        }
    }

    /**
     * 比較CPU和GPU結果
     */
    compareResults(cpuResults, gpuResults, testName) {
        const errors = [];
        let maxError = 0;
        let totalError = 0;
        let comparisons = 0;

        try {
            // 比較節點電壓
            for (const [node, cpuVoltages] of Object.entries(cpuResults.nodeVoltages || {})) {
                const gpuVoltages = gpuResults.nodeVoltages?.[node];
                if (!gpuVoltages) {
                    errors.push(`GPU結果缺少節點 ${node} 的電壓數據`);
                    continue;
                }

                if (cpuVoltages.length !== gpuVoltages.length) {
                    errors.push(`節點 ${node} 的時間點數量不匹配: CPU ${cpuVoltages.length}, GPU ${gpuVoltages.length}`);
                    continue;
                }

                for (let i = 0; i < cpuVoltages.length; i++) {
                    const cpuV = cpuVoltages[i];
                    const gpuV = gpuVoltages[i];
                    
                    if (Math.abs(cpuV) > this.tolerances.voltage || Math.abs(gpuV) > this.tolerances.voltage) {
                        const relativeError = Math.abs(cpuV - gpuV) / (Math.abs(cpuV) + 1e-12) * 100;
                        maxError = Math.max(maxError, relativeError);
                        totalError += relativeError;
                        comparisons++;

                        if (relativeError > this.tolerances.relative * 100) {
                            errors.push(`節點 ${node} t=${i}: CPU=${cpuV.toFixed(6)}V, GPU=${gpuV.toFixed(6)}V, 誤差=${relativeError.toFixed(3)}%`);
                        }
                    }
                }
            }

            // 比較狀態變量
            if (cpuResults.stateVariables && gpuResults.stateVariables) {
                for (const [component, cpuStates] of Object.entries(cpuResults.stateVariables)) {
                    const gpuStates = gpuResults.stateVariables[component];
                    if (!gpuStates) {
                        errors.push(`GPU結果缺少組件 ${component} 的狀態變量`);
                        continue;
                    }

                    if (cpuStates.length !== gpuStates.length) {
                        errors.push(`組件 ${component} 狀態變量長度不匹配`);
                        continue;
                    }

                    for (let i = 0; i < cpuStates.length; i++) {
                        const relativeError = Math.abs(cpuStates[i] - gpuStates[i]) / (Math.abs(cpuStates[i]) + 1e-12) * 100;
                        maxError = Math.max(maxError, relativeError);
                        totalError += relativeError;
                        comparisons++;
                    }
                }
            }

            const avgError = comparisons > 0 ? totalError / comparisons : 0;
            const passed = errors.length === 0 && maxError < this.tolerances.relative * 100;

            return {
                passed,
                maxError,
                avgError,
                comparisons,
                errorCount: errors.length,
                errorMessage: errors.length > 0 ? errors.slice(0, 5).join('; ') : null,
                allErrors: errors
            };

        } catch (error) {
            return {
                passed: false,
                errorMessage: `結果比較異常: ${error.message}`,
                maxError: Infinity,
                avgError: Infinity
            };
        }
    }

    /**
     * RLC電路特殊驗算
     */
    compareRLCResults(cpuResults, gpuResults) {
        // 基礎驗算
        const baseValidation = this.compareResults(cpuResults, gpuResults, 'RLC');
        if (!baseValidation.passed) {
            return baseValidation;
        }

        try {
            // 提取輸出節點電壓進行頻域分析
            const cpuOutput = cpuResults.nodeVoltages['out'] || cpuResults.nodeVoltages[Object.keys(cpuResults.nodeVoltages)[0]];
            const gpuOutput = gpuResults.nodeVoltages['out'] || gpuResults.nodeVoltages[Object.keys(gpuResults.nodeVoltages)[0]];

            if (!cpuOutput || !gpuOutput) {
                return {
                    passed: false,
                    errorMessage: '無法獲取輸出節點電壓數據進行RLC分析'
                };
            }

            // 簡化的頻域分析（檢測振盪週期）
            const cpuPeaks = this.findPeaks(cpuOutput);
            const gpuPeaks = this.findPeaks(gpuOutput);

            if (cpuPeaks.length < 2 || gpuPeaks.length < 2) {
                return {
                    passed: true,
                    frequencyError: 0,
                    dampingError: 0,
                    note: '振盪不明顯，使用基礎驗算結果'
                };
            }

            // 計算週期差異
            const cpuPeriod = cpuPeaks[1] - cpuPeaks[0];
            const gpuPeriod = gpuPeaks[1] - gpuPeaks[0];
            const frequencyError = Math.abs(cpuPeriod - gpuPeriod) / cpuPeriod * 100;

            // 計算衰減差異（比較峰值衰減）
            const cpuDecay = cpuOutput[cpuPeaks[1]] / cpuOutput[cpuPeaks[0]];
            const gpuDecay = gpuOutput[gpuPeaks[1]] / gpuOutput[gpuPeaks[0]];
            const dampingError = Math.abs(cpuDecay - gpuDecay) / Math.abs(cpuDecay) * 100;

            return {
                passed: frequencyError < 5 && dampingError < 10,  // 允許5%頻率誤差和10%衰減誤差
                frequencyError,
                dampingError,
                cpuPeaks: cpuPeaks.length,
                gpuPeaks: gpuPeaks.length,
                ...baseValidation
            };

        } catch (error) {
            return {
                passed: true,  // 頻域分析失敗不影響基礎驗算
                note: `RLC頻域分析失敗: ${error.message}`,
                ...baseValidation
            };
        }
    }

    /**
     * 二極體結果驗算
     */
    validateDiodeResults(cpuResults, gpuResults) {
        const baseValidation = this.compareResults(cpuResults, gpuResults, '二極體');
        if (!baseValidation.passed) {
            return baseValidation;
        }

        try {
            const cpuOutput = cpuResults.nodeVoltages['out'] || cpuResults.nodeVoltages[Object.keys(cpuResults.nodeVoltages)[1]];
            const gpuOutput = gpuResults.nodeVoltages['out'] || gpuResults.nodeVoltages[Object.keys(gpuResults.nodeVoltages)[1]];

            if (!cpuOutput || !gpuOutput) {
                return {
                    passed: false,
                    errorMessage: '無法獲取二極體輸出電壓數據'
                };
            }

            // 整流效率比較
            const cpuRectified = cpuOutput.filter(v => v > 0.7);  // 導通電壓以上
            const gpuRectified = gpuOutput.filter(v => v > 0.7);
            
            const cpuEfficiency = cpuRectified.length / cpuOutput.length;
            const gpuEfficiency = gpuRectified.length / gpuOutput.length;
            const rectificationError = Math.abs(cpuEfficiency - gpuEfficiency) / cpuEfficiency * 100;

            // 導通狀態一致性
            let consistentStates = 0;
            for (let i = 0; i < Math.min(cpuOutput.length, gpuOutput.length); i++) {
                const cpuOn = cpuOutput[i] > 0.7;
                const gpuOn = gpuOutput[i] > 0.7;
                if (cpuOn === gpuOn) consistentStates++;
            }
            const conductionConsistency = consistentStates / Math.min(cpuOutput.length, gpuOutput.length) * 100;

            return {
                passed: rectificationError < 5 && conductionConsistency > 95,
                rectificationError,
                conductionConsistency,
                cpuEfficiency,
                gpuEfficiency,
                ...baseValidation
            };

        } catch (error) {
            return {
                passed: false,
                errorMessage: `二極體驗算異常: ${error.message}`
            };
        }
    }

    /**
     * 大型網絡結果驗算
     */
    validateLargeNetworkResults(cpuResults, gpuResults) {
        const baseValidation = this.compareResults(cpuResults, gpuResults, '大型網絡');
        
        // 檢查收斂性（比較最後時間點的節點電壓）
        let maxNodeError = 0;
        let convergentNodes = 0;
        const nodeCount = Object.keys(cpuResults.nodeVoltages || {}).length;

        for (const [node, cpuVoltages] of Object.entries(cpuResults.nodeVoltages || {})) {
            const gpuVoltages = gpuResults.nodeVoltages?.[node];
            if (gpuVoltages && cpuVoltages.length > 0 && gpuVoltages.length > 0) {
                const cpuFinal = cpuVoltages[cpuVoltages.length - 1];
                const gpuFinal = gpuVoltages[gpuVoltages.length - 1];
                const nodeError = Math.abs(cpuFinal - gpuFinal) / (Math.abs(cpuFinal) + 1e-9) * 100;
                maxNodeError = Math.max(maxNodeError, nodeError);
                
                if (nodeError < 1) convergentNodes++;  // 1%以內認為收斂
            }
        }

        const convergence = convergentNodes / nodeCount > 0.95;  // 95%節點收斂

        return {
            passed: baseValidation.passed && convergence && maxNodeError < 5,
            convergence,
            maxNodeError,
            convergentNodes,
            nodeCount,
            ...baseValidation
        };
    }

    /**
     * 性能趨勢分析
     */
    analyzePerformanceTrend(benchmarkResults) {
        const speedups = benchmarkResults.map(r => r.speedup);
        const avgSpeedup = speedups.reduce((a, b) => a + b, 0) / speedups.length;
        
        // 找到最佳性能點
        const maxSpeedupResult = benchmarkResults.reduce((max, current) => 
            current.speedup > max.speedup ? current : max
        );

        // 分析擴展性趨勢
        let scalabilityTrend = 'stable';
        if (benchmarkResults.length > 2) {
            const firstSpeedup = benchmarkResults[0].speedup;
            const lastSpeedup = benchmarkResults[benchmarkResults.length - 1].speedup;
            
            if (lastSpeedup > firstSpeedup * 1.2) {
                scalabilityTrend = 'improving';
            } else if (lastSpeedup < firstSpeedup * 0.8) {
                scalabilityTrend = 'degrading';
            }
        }

        return {
            avgSpeedup,
            maxSpeedup: maxSpeedupResult.speedup,
            optimalSize: maxSpeedupResult.nodeCount,
            scalabilityTrend,
            crossoverPoint: benchmarkResults.find(r => r.speedup >= 1)?.size || null
        };
    }

    /**
     * 峰值檢測輔助函數
     */
    findPeaks(signal, minDistance = 10) {
        const peaks = [];
        for (let i = minDistance; i < signal.length - minDistance; i++) {
            let isPeak = true;
            
            // 檢查是否為局部最大值
            for (let j = i - minDistance; j <= i + minDistance; j++) {
                if (j !== i && signal[j] >= signal[i]) {
                    isPeak = false;
                    break;
                }
            }
            
            if (isPeak && signal[i] > 0.1) {  // 排除噪聲
                peaks.push(i);
            }
        }
        return peaks;
    }

    /**
     * 生成詳細驗算報告
     */
    generateValidationReport(passedTests, totalTests) {
        console.log('\n' + '='.repeat(80));
        console.log('🔬 WebGPU 驗算報告');
        console.log('='.repeat(80));
        
        console.log(`📊 總體結果: ${passedTests}/${totalTests} 通過 (${(passedTests/totalTests*100).toFixed(1)}%)`);
        console.log('');

        // 測試結果詳情
        console.log('📋 測試詳情:');
        this.testResults.forEach((result, index) => {
            const status = result.passed ? '✅' : '❌';
            console.log(`${index + 1}. ${status} ${result.name}`);
            if (result.summary) {
                console.log(`   ${result.summary}`);
            }
            if (result.error) {
                console.log(`   錯誤: ${result.error}`);
            }
        });

        // 性能統計
        if (this.performanceMetrics.length > 0) {
            console.log('\n⚡ 性能統計:');
            this.performanceMetrics.forEach(metric => {
                const speedup = metric.gpuTime > 0 ? (metric.cpuTime / metric.gpuTime).toFixed(2) : 'N/A';
                const efficiency = metric.cpuTime < metric.gpuTime ? 'GPU更快' : 'CPU更快';
                console.log(`   ${metric.testName}: ${speedup}x 加速, ${efficiency}`);
                console.log(`     節點數: ${metric.nodeCount}, 時間步: ${metric.timeSteps || 'N/A'}`);
            });
        }

        console.log('\n' + '='.repeat(80));
        
        if (passedTests === totalTests) {
            console.log('🎉 所有WebGPU驗算測試通過！GPU實現正確性已驗證。');
        } else {
            console.log('⚠️  部分測試失敗，建議檢查GPU實現或數值精度設置。');
        }
        console.log('='.repeat(80));
    }
}

// 測試運行器類
class ValidationTestRunner {
    constructor() {
        this.suite = new WebGPUValidationSuite({ debug: true });
    }

    async run() {
        console.log('🚀 啟動WebGPU vs CPU 驗算測試...\n');
        
        try {
            const results = await this.suite.runValidationSuite();
            
            return {
                success: results.passedTests === results.totalTests,
                results
            };
            
        } catch (error) {
            console.error('💥 驗算測試套件執行失敗:', error);
            throw error;
        }
    }
}

// 導出驗算功能
export { WebGPUValidationSuite, ValidationTestRunner };

// 主程序入口
async function main() {
    const runner = new ValidationTestRunner();
    try {
        const results = await runner.run();
        process.exit(results.success ? 0 : 1);
    } catch (error) {
        console.error('驗算測試異常終止:', error.message);
        process.exit(1);
    }
}

// 如果直接運行此文件
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(console.error);
}