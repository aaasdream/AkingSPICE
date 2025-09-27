// Web entry point for JSSolver-PE Buck Converter Simulator
import { Chart } from 'chart.js/auto';

// Export Chart globally for the HTML to use
window.Chart = Chart;

// 動態導入 JSSolver-PE 模組以避免初始化錯誤
async function loadJSSolverPE() {
    try {
        console.log('開始載入 JSSolver-PE 模組...');
        
        const { JSSolverPE } = await import('./src/index.js');
        const { Resistor } = await import('./src/components/resistor.js');
        const { Inductor } = await import('./src/components/inductor.js');
        const { Capacitor } = await import('./src/components/capacitor.js');
        const { VoltageSource } = await import('./src/components/sources.js');
        const { MOSFET } = await import('./src/components/mosfet.js');
        
        console.log('JSSolver-PE 模組載入成功');
        
        return { JSSolverPE, Resistor, Inductor, Capacitor, VoltageSource, MOSFET };
    } catch (error) {
        console.error('載入 JSSolver-PE 模組失敗:', error);
        throw error;
    }
}

// Browser-compatible Buck Converter simulator using REAL JSSolver-PE
class ViteBuckSimulator {
    constructor() {
        this.solver = null;
        this.components = null;
        this.setupChart();
        this.bindControls();
        
        // 異步初始化解算器
        this.initializeSolver();
    }
    
    async initializeSolver() {
        try {
            console.log('初始化 JSSolver-PE...');
            this.components = await loadJSSolverPE();
            this.solver = new this.components.JSSolverPE();
            this.solver.setDebug(true);
            console.log('✅ JSSolver-PE 初始化成功');
            console.log('版本信息:', this.components.JSSolverPE.getVersionInfo());
            
            // 更新界面狀態
            document.getElementById('run').disabled = false;
            document.getElementById('run').textContent = 'Run Simulation';
            
        } catch (error) {
            console.error('❌ JSSolver-PE 初始化失敗:', error);
            document.getElementById('info').innerHTML = `
                <div class="info-section" style="color: red;">
                    <h3>❌ JSSolver-PE 載入失敗</h3>
                    <p><strong>錯誤:</strong> ${error.message}</p>
                    <p>請檢查瀏覽器控制台以獲取詳細信息</p>
                </div>
            `;
        }
    }

    setupChart() {
        const ctx = document.getElementById('chart').getContext('2d');
        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Output Voltage (V)',
                    data: [],
                    borderColor: 'blue',
                    backgroundColor: 'rgba(0, 0, 255, 0.1)',
                    borderWidth: 2,
                    tension: 0
                }, {
                    label: 'PWM Control',
                    data: [],
                    borderColor: 'red',
                    backgroundColor: 'rgba(255, 0, 0, 0.1)',
                    borderWidth: 2,
                    tension: 0,
                    yAxisID: 'y1'
                }, {
                    label: 'Inductor Current (A)',
                    data: [],
                    borderColor: 'green',
                    backgroundColor: 'rgba(0, 255, 0, 0.1)',
                    borderWidth: 2,
                    tension: 0,
                    yAxisID: 'y2'
                }]
            },
            options: {
                responsive: true,
                animation: false,
                scales: {
                    x: {
                        title: { display: true, text: 'Time (ms)' }
                    },
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: { display: true, text: 'Voltage (V)' },
                        min: 0,
                        max: 15
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: { display: true, text: 'PWM State' },
                        min: -0.5,
                        max: 1.5,
                        grid: { drawOnChartArea: false }
                    },
                    y2: {
                        type: 'linear',
                        display: false, // 隱藏第三個軸
                        title: { display: true, text: 'Current (A)' }
                    }
                }
            }
        });
    }

    bindControls() {
        document.getElementById('run').addEventListener('click', () => this.runSimulation());
        document.getElementById('clear').addEventListener('click', () => this.clearChart());
    }

    // 使用 JSSolver-PE 建立真實的 Buck 轉換器電路
    buildBuckCircuit() {
        const Vin = parseFloat(document.getElementById('inputVoltage').value);
        const L = parseFloat(document.getElementById('inductance').value) * 1e-6; // μH to H
        const C = parseFloat(document.getElementById('capacitance').value) * 1e-6; // μF to F
        const R_load = parseFloat(document.getElementById('resistance').value);
        
        console.log(`構建 Buck 電路: Vin=${Vin}V, L=${L*1e6}μH, C=${C*1e6}μF, Rload=${R_load}Ω`);
        
        // 重置解算器
        this.solver.reset();
        
        // 建立電路元件（真實的 MNA 矩陣求解）
        const components = [
            // 輸入電壓源 Vin: node_vin -> gnd
            new VoltageSource('VIN', ['node_vin', '0'], Vin),
            
            // 主開關 MOSFET: node_vin -> node_sw, 閘極控制
            new MOSFET('MSW', ['node_sw', '0', 'node_vin', '0'], {
                model: 'NMOS_SWITCH',
                Vth: 2.0,       // 開啟電壓
                Kp: 1e-3,       // 轉導參數
                Ron: 0.01,      // 導通電阻 10mΩ
                Roff: 1e6       // 關閉電阻 1MΩ
            }),
            
            // 續流二極管：使用 MOSFET 的體二極管（關閉時導通）
            // 這裡簡化為小電阻（二極管導通）或大電阻（二極管關閉）
            
            // 電感 L: node_sw -> node_out
            new Inductor('L1', ['node_sw', 'node_out'], L),
            
            // 輸出電容 C: node_out -> gnd
            new Capacitor('C1', ['node_out', '0'], C),
            
            // 負載電阻 R: node_out -> gnd
            new Resistor('RLOAD', ['node_out', '0'], R_load)
        ];
        
        // 載入到解算器 - 使用編程式 API 而不是網表
        this.solver.components = components;
        this.solver.isInitialized = true;
        
        console.log('Buck 電路已建立，元件清單:');
        components.forEach(comp => console.log(`  ${comp.toString()}`));
        
        // 驗證電路
        const validation = this.solver.validateCircuit();
        console.log('電路驗證結果:', validation);
        
        if (!validation.valid) {
            console.error('電路驗證失敗:', validation.issues);
            return false;
        }
    }

    async runSimulation() {
        const frequency = parseFloat(document.getElementById('frequency').value) * 1000; // Convert kHz to Hz
        const dutyCycle = parseFloat(document.getElementById('dutyCycle').value) / 100;
        const simTime = parseFloat(document.getElementById('simTime').value) / 1000; // ms to s
        
        console.log(`開始 JSSolver-PE Buck 模擬: f=${frequency/1000}kHz, D=${(dutyCycle*100).toFixed(1)}%, t=${simTime*1000}ms`);
        
        // 建立電路
        if (!this.buildBuckCircuit()) {
            alert('電路建立失敗，請檢查參數');
            return;
        }
        
        try {
            // 使用步進式模擬 API
            const params = {
                startTime: 0,
                stopTime: simTime,
                timeStep: simTime / 1000,  // 1000 個點
                maxIterations: 10
            };
            
            // PWM 控制函數
            const period = 1 / frequency; // 週期 (秒)
            const pwmControl = (time) => {
                const timeInPeriod = (time % period) / period;
                const gateState = timeInPeriod < dutyCycle; // true = 導通, false = 關閉
                return {
                    'MSW': gateState  // 控制主開關 MOSFET
                };
            };
            
            // 執行完整的步進式模擬
            console.log('初始化步進式暫態分析...');
            const results = await this.solver.runSteppedSimulation(pwmControl, params);
            
            console.log(`模擬完成: ${results.steps.length} 個時間步`);
            
            // 處理結果並繪圖
            this.processSimulationResults(results, period, dutyCycle);
            
        } catch (error) {
            console.error('JSSolver-PE 模擬失敗:', error);
            alert(`模擬失敗: ${error.message}`);
        }
    }

    processSimulationResults(results, period, dutyCycle) {
        // 清除前次資料
        this.chart.data.labels = [];
        this.chart.data.datasets[0].data = [];
        this.chart.data.datasets[1].data = [];
        this.chart.data.datasets[2].data = [];
        
        const steps = results.steps;
        let avgOutputVoltage = 0;
        let avgOutputCurrent = 0;
        let avgInputPower = 0;
        
        for (const step of steps) {
            const timeMs = step.time * 1000; // 轉換為毫秒
            const outputVoltage = step.nodeVoltages['node_out'] || 0;
            const inputVoltage = step.nodeVoltages['node_vin'] || 0;
            const inductorCurrent = step.branchCurrents['L1'] || 0;
            
            // PWM 狀態重建
            const timeInPeriod = (step.time % period) / period;
            const pwmState = timeInPeriod < dutyCycle ? 1 : 0;
            
            this.chart.data.labels.push(timeMs.toFixed(3));
            this.chart.data.datasets[0].data.push(outputVoltage);
            this.chart.data.datasets[1].data.push(pwmState);
            this.chart.data.datasets[2].data.push(inductorCurrent);
            
            // 累計平均值計算
            avgOutputVoltage += outputVoltage;
            avgOutputCurrent += Math.abs(inductorCurrent);
            avgInputPower += inputVoltage * Math.abs(inductorCurrent) * pwmState;
        }
        
        // 計算平均值
        const stepCount = steps.length;
        avgOutputVoltage /= stepCount;
        avgOutputCurrent /= stepCount;
        avgInputPower /= stepCount;
        
        const avgOutputPower = avgOutputVoltage * avgOutputCurrent;
        const efficiency = avgInputPower > 0 ? (avgOutputPower / avgInputPower) * 100 : 0;
        
        // 更新圖表
        this.chart.update();
        
        // 顯示 JSSolver-PE 真實求解結果
        document.getElementById('info').innerHTML = `
            <div class="info-section">
                <h3>🔬 JSSolver-PE 真實 MNA 求解結果</h3>
                <p><strong>解算器:</strong> Modified Nodal Analysis (MNA) with LU decomposition</p>
                <p><strong>平均輸出電壓:</strong> ${avgOutputVoltage.toFixed(3)} V</p>
                <p><strong>平均輸出電流:</strong> ${avgOutputCurrent.toFixed(3)} A</p>
                <p><strong>平均輸入功率:</strong> ${avgInputPower.toFixed(3)} W</p>
                <p><strong>平均輸出功率:</strong> ${avgOutputPower.toFixed(3)} W</p>
                <p><strong>計算效率:</strong> ${efficiency.toFixed(1)}%</p>
                <hr>
                <p><strong>電路驗證:</strong> ✅ ${stepCount} 個時間步成功求解</p>
                <p><strong>開關頻率:</strong> ${(1/period/1000).toFixed(1)} kHz</p>
                <p><strong>占空比:</strong> ${(dutyCycle*100).toFixed(1)}%</p>
                <p><strong>模擬步長:</strong> ${results.summary.timeStep*1e6.toFixed(1)} μs</p>
            </div>
        `;
        
        // 驗證解算器結果
        const Vin = parseFloat(document.getElementById('inputVoltage').value);
        const theoreticalOutput = Vin * dutyCycle;
        const error = Math.abs(avgOutputVoltage - theoreticalOutput) / theoreticalOutput * 100;
        
        console.log('=== JSSolver-PE 結果驗證 ===');
        console.log(`理論輸出: ${theoreticalOutput.toFixed(3)} V`);
        console.log(`解算器結果: ${avgOutputVoltage.toFixed(3)} V`);
        console.log(`誤差: ${error.toFixed(2)}%`);
        console.log(`解算器準確性: ${error < 5 ? '✅ 優秀' : error < 15 ? '⚠️ 可接受' : '❌ 需要調整'}`);
    }

    // Create simplified MNA-based Buck converter model
    createBuckCircuit(pwmState) {
        // Buck converter理論: Vout_avg = Vin × DutyCycle (理想情況)
        
        const Vin = parseFloat(document.getElementById('inputVoltage').value);
        const R_load = parseFloat(document.getElementById('resistance').value);
        
        // PWM狀態: 1 = 開關導通, 0 = 開關關閉(二極管續流)
        // 理想Buck轉換器模型
        
        let Vout;
        if (pwmState > 0.5) {
            // 開關導通: 輸出接近輸入電壓 (忽略開關壓降)
            Vout = Vin - 0.1; // 減去小量開關壓降
        } else {
            // 開關關閉: 二極管續流，電壓接近0 (忽略二極管壓降) 
            Vout = 0.0; // 理想情況下為0
        }
        
        const current = Vout / R_load;
        
        return {
            inputVoltage: Vin,
            outputVoltage: Math.max(0, Vout),
            current: Math.max(0, current),
            inputCurrent: pwmState > 0.5 ? current : 0
        };
    }

    // 計算理想Buck轉換器的平均值
    calculateAverageOutput(dutyCycle) {
        const Vin = parseFloat(document.getElementById('inputVoltage').value);
        const R_load = parseFloat(document.getElementById('resistance').value);
        
        // 理想Buck轉換器: Vout_avg = Vin × D
        const Vout_avg = Vin * dutyCycle;
        const Iout_avg = Vout_avg / R_load;
        const Pin_avg = Vin * Iout_avg * dutyCycle; // 輸入功率 = Vin × Iin_avg
        const Pout_avg = Vout_avg * Iout_avg;       // 輸出功率
        const efficiency = Pin_avg > 0 ? (Pout_avg / Pin_avg) * 100 : 0;
        
        return {
            inputVoltage: Vin,
            outputVoltage: Vout_avg,
            current: Iout_avg,
            efficiency: efficiency,
            inputPower: Pin_avg,
            outputPower: Pout_avg
        };
    }

    runSimulation() {
        const frequency = parseFloat(document.getElementById('frequency').value) * 1000; // Convert kHz to Hz
        const dutyCycle = parseFloat(document.getElementById('dutyCycle').value) / 100;
        const simTime = parseFloat(document.getElementById('simTime').value);
        
        // Clear previous data
        this.chart.data.labels = [];
        this.chart.data.datasets[0].data = [];
        this.chart.data.datasets[1].data = [];
        
        const timeStep = simTime / 1000; // 1000 simulation points
        const period = 1000 / frequency; // Period in ms
        
        console.log(`Running Buck simulation: Vin=${document.getElementById('inputVoltage').value}V, DutyCycle=${(dutyCycle*100).toFixed(1)}%, f=${frequency/1000}kHz`);
        
        for (let i = 0; i <= 1000; i++) {
            const time = i * timeStep;
            const timeInPeriod = (time % period) / period;
            const pwmState = timeInPeriod < dutyCycle ? 1 : 0;
            
            // Get circuit results for this PWM state
            const result = this.createBuckCircuit(pwmState);
            
            this.chart.data.labels.push(time.toFixed(2));
            this.chart.data.datasets[0].data.push(result.outputVoltage);
            this.chart.data.datasets[1].data.push(pwmState);
        }
        
        this.chart.update();
        
        // Update info display using theoretical Buck converter calculations
        const avgResult = this.calculateAverageOutput(dutyCycle);
        document.getElementById('info').innerHTML = `
            <div class="info-section">
                <h3>Buck Converter Simulation Results (理想模型)</h3>
                <p><strong>理論輸出電壓:</strong> ${avgResult.outputVoltage.toFixed(2)} V (= ${document.getElementById('inputVoltage').value}V × ${(dutyCycle*100).toFixed(1)}%)</p>
                <p><strong>負載電流:</strong> ${avgResult.current.toFixed(3)} A</p>
                <p><strong>輸入功率:</strong> ${avgResult.inputPower.toFixed(2)} W</p>
                <p><strong>輸出功率:</strong> ${avgResult.outputPower.toFixed(2)} W</p>
                <p><strong>理論效率:</strong> ${avgResult.efficiency.toFixed(1)}% (理想Buck = 100%)</p>
                <p><strong>開關頻率:</strong> ${frequency/1000} kHz</p>
                <p><strong>占空比:</strong> ${(dutyCycle*100).toFixed(1)}%</p>
            </div>
        `;
    }

    clearChart() {
        this.chart.data.labels = [];
        this.chart.data.datasets[0].data = [];
        this.chart.data.datasets[1].data = [];
        this.chart.data.datasets[2].data = [];
        this.chart.update();
        document.getElementById('info').innerHTML = '';
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('Initializing Vite-based Buck Converter Simulator...');
    console.log('Using dynamic import for JSSolver-PE...');
    window.simulator = new ViteBuckSimulator();
});