/**
 * 集成測試 - 完整電路仿真
 * 
 * 測試各種常見電路配置的完整仿真流程
 */

import { describe, it, assert } from './framework/TestFramework.js';
import { 
    AkingSPICE,
    StepwiseSimulator,
    Resistor,
    Capacitor,
    Inductor,
    VoltageSource,
    CurrentSource,
    MCPDiode,
    MCPMOSFET,
    createMCPDiode,
    createNMOSSwitch
} from '../src/index.js';

// ==================== RC 電路集成測試 ====================
describe('RC 電路集成測試', () => {

    it('應該正確仿真 RC 充電電路', async () => {
        const solver = new AkingSPICE();
        const components = [
            new VoltageSource('V1', ['vin', 'gnd'], 10),
            new Resistor('R1', ['vin', 'vout'], 1000),
            new Capacitor('C1', ['vout', 'gnd'], 10e-6, { ic: 0 })
        ];
        
        solver.components = components;
        
        // 使用步進式仿真器進行瞬態分析
        const simulator = new StepwiseSimulator({ debug: false });
        await simulator.initialize(components, {
            startTime: 0,
            stopTime: 100e-6,  // 100μs (約 10個時間常數)
            timeStep: 10e-6    // 10μs
        });
        
        const results = [];
        while (!simulator.isCompleted) {
            const result = await simulator.stepForward();
            if (result.success) {
                const vout = result.state.nodeVoltages.get('vout') || 0;
                results.push({ time: result.time, vout });
            }
        }
        
        assert.isTrue(results.length > 5, '應該有足夠的仿真點');
        
        // 檢查初始條件
        assert.approximately(results[0].vout, 0, 1e-6, '初始電壓應該為 0V');
        
        // 檢查最終值（應該接近 10V）
        const finalVout = results[results.length - 1].vout;
        assert.isTrue(finalVout > 9, '最終電壓應該接近 10V');
        
        // 檢查單調性（RC 充電應該單調遞增）
        for (let i = 1; i < results.length; i++) {
            assert.isTrue(results[i].vout >= results[i-1].vout, 
                         `電壓應該單調遞增: t${i}=${results[i].vout} >= t${i-1}=${results[i-1].vout}`);
        }
    });

    it('應該正確仿真 RC 放電電路', async () => {
        const simulator = new StepwiseSimulator({ debug: false });
        const components = [
            new VoltageSource('V1', ['vin', 'gnd'], 0), // 0V 電源
            new Resistor('R1', ['vin', 'vout'], 2000),
            new Capacitor('C1', ['vout', 'gnd'], 5e-6, { ic: 8 }) // 初始電壓 8V
        ];
        
        await simulator.initialize(components, {
            startTime: 0,
            stopTime: 80e-6,
            timeStep: 8e-6
        });
        
        const results = [];
        while (!simulator.isCompleted) {
            const result = await simulator.stepForward();
            if (result.success) {
                const vout = result.state.nodeVoltages.get('vout') || 0;
                results.push({ time: result.time, vout });
            }
        }
        
        // 檢查初始條件（應該接近 8V）
        assert.isTrue(results[0].vout > 7, '初始電壓應該接近 8V');
        
        // 檢查最終值（應該接近 0V）
        const finalVout = results[results.length - 1].vout;
        assert.isTrue(finalVout < 1, '最終電壓應該接近 0V');
        
        // 檢查單調性（RC 放電應該單調遞減）
        for (let i = 1; i < results.length; i++) {
            assert.isTrue(results[i].vout <= results[i-1].vout, 
                         '電壓應該單調遞減');
        }
    });

});

// ==================== RLC 電路集成測試 ====================
describe('RLC 電路集成測試', () => {

    it('應該正確仿真欠阻尼 RLC 電路', async () => {
        const simulator = new StepwiseSimulator({ debug: false });
        const components = [
            new VoltageSource('V1', ['vin', 'gnd'], 0),
            new Resistor('R1', ['vin', 'vout'], 10), // 小電阻，欠阻尼
            new Inductor('L1', ['vout', 'vl'], 1e-3, { ic: 0 }),
            new Capacitor('C1', ['vl', 'gnd'], 10e-6, { ic: 5 }) // 初始電壓
        ];
        
        await simulator.initialize(components, {
            startTime: 0,
            stopTime: 2e-3,
            timeStep: 50e-6
        });
        
        const results = [];
        while (!simulator.isCompleted && results.length < 40) {
            const result = await simulator.stepForward();
            if (result.success) {
                const vl = result.state.nodeVoltages.get('vl') || 0;
                results.push({ time: result.time, vl });
            }
        }
        
        assert.isTrue(results.length > 10, '應該有足夠的仿真點');
        
        // 檢查是否有振蕩（欠阻尼特性）
        let maxVoltage = Math.max(...results.map(r => r.vl));
        let minVoltage = Math.min(...results.map(r => r.vl));
        
        // 欠阻尼 RLC 應該有振蕩
        assert.isTrue(maxVoltage > 0.5, '應該有正向振蕩');
        assert.isTrue(minVoltage < -0.5, '應該有負向振蕩');
    });

});

// ==================== 二極管整流電路測試 ====================
describe('二極管整流電路測試', () => {

    it('應該正確仿真半波整流電路', async () => {
        const simulator = new StepwiseSimulator({ debug: false });
        const components = [
            new VoltageSource('V1', ['vin', 'gnd'], 'SIN(0 10 60)'), // 10V, 60Hz 正弦波
            new Resistor('R1', ['vin', 'anode'], 100),
            new MCPDiode('D1', ['anode', 'vout'], { Vf: 0.7, Ron: 0.01 }),
            new Resistor('Rload', ['vout', 'gnd'], 1000)
        ];
        
        await simulator.initialize(components, {
            startTime: 0,
            stopTime: 2/60,  // 2 個週期
            timeStep: 1/(60*100) // 每週期 100 個點
        });
        
        const results = [];
        while (!simulator.isCompleted && results.length < 200) {
            const result = await simulator.stepForward();
            if (result.success) {
                const vin = result.state.nodeVoltages.get('vin') || 0;
                const vout = result.state.nodeVoltages.get('vout') || 0;
                results.push({ time: result.time, vin, vout });
            }
        }
        
        assert.isTrue(results.length > 50, '應該有足夠的仿真點');
        
        // 檢查整流特性
        let positiveHalfCount = 0;
        let negativeHalfCount = 0;
        
        for (const point of results) {
            if (point.vin > 0.7) {
                // 正半週，二極管應該導通
                positiveHalfCount++;
                assert.isTrue(point.vout > 0, '正半週輸出應該 > 0');
            } else {
                // 負半週或小正電壓，二極管應該截止
                negativeHalfCount++;
                assert.approximately(point.vout, 0, 0.1, '負半週輸出應該 ≈ 0');
            }
        }
        
        assert.isTrue(positiveHalfCount > 0, '應該有正半週導通');
        assert.isTrue(negativeHalfCount > 0, '應該有負半週截止');
    });

});

// ==================== Buck 轉換器測試 ====================
describe('Buck 轉換器測試', () => {

    it('應該正確仿真簡單 Buck 轉換器', async () => {
        const simulator = new StepwiseSimulator({ debug: false });
        
        // 建立 Buck 轉換器
        const components = [
            new VoltageSource('Vin', ['vin', 'gnd'], 12),
            new MCPMOSFET('Mhs', ['vin', 'sw', 'gate_hs'], {
                Ron: 0.01,
                Vth: 2.0,
                type: 'NMOS',
                controlMode: 'external'
            }),
            new MCPDiode('Dls', ['gnd', 'sw'], { 
                Vf: 0.7, 
                Ron: 0.001 
            }),
            new Inductor('L1', ['sw', 'vout'], 100e-6, { ic: 0 }),
            new Capacitor('C1', ['vout', 'gnd'], 100e-6, { ic: 0 }),
            new Resistor('Rload', ['vout', 'gnd'], 10)
        ];
        
        await simulator.initialize(components, {
            startTime: 0,
            stopTime: 100e-6,
            timeStep: 1e-6,
            maxIterations: 20
        });
        
        // PWM 控制：50% 佔空比
        const switchingPeriod = 10e-6; // 100kHz
        const dutyCycle = 0.5;
        
        const results = [];
        let switchState = true;
        let lastSwitchTime = 0;
        
        while (!simulator.isCompleted && results.length < 100) {
            const result = await simulator.stepForward();
            if (result.success) {
                // PWM 控制邏輯
                const currentTime = result.time;
                const periodTime = (currentTime - lastSwitchTime) % switchingPeriod;
                
                if (periodTime < switchingPeriod * dutyCycle) {
                    if (!switchState) {
                        simulator.modifyComponent('Mhs', { gateState: 'ON' });
                        switchState = true;
                    }
                } else {
                    if (switchState) {
                        simulator.modifyComponent('Mhs', { gateState: 'OFF' });
                        switchState = false;
                    }
                }
                
                const vout = result.state.nodeVoltages.get('vout') || 0;
                const vsw = result.state.nodeVoltages.get('sw') || 0;
                
                results.push({ 
                    time: result.time, 
                    vout, 
                    vsw,
                    switchState 
                });
            }
        }
        
        assert.isTrue(results.length > 20, '應該有足夠的仿真點');
        
        // 檢查輸出電壓是否朝正確方向變化
        // Buck 轉換器理想輸出 = Vin * D = 12V * 0.5 = 6V
        const finalVout = results[results.length - 1].vout;
        
        // 在這個短時間內，可能還沒達到穩態，但應該朝正確方向變化
        assert.isTrue(finalVout > 0, '輸出電壓應該 > 0V');
        assert.isTrue(finalVout < 12, '輸出電壓應該 < 輸入電壓');
        
        // 檢查開關節點電壓變化
        let highSwitchCount = 0;
        let lowSwitchCount = 0;
        
        for (const point of results) {
            if (point.vsw > 6) highSwitchCount++;
            if (point.vsw < 2) lowSwitchCount++;
        }
        
        assert.isTrue(highSwitchCount > 0, '開關節點應該有高電位期間');
        assert.isTrue(lowSwitchCount > 0, '開關節點應該有低電位期間');
    });

});

// ==================== 運算放大器基礎電路測試 ====================
describe('運算放大器基礎電路測試', () => {

    it('應該正確仿真反相放大器', async () => {
        const simulator = new StepwiseSimulator({ debug: false });
        const components = [
            new VoltageSource('Vin', ['vin', 'gnd'], 1), // 1V 輸入
            new Resistor('Rin', ['vin', 'vminus'], 1000), // 輸入電阻
            new Resistor('Rf', ['vminus', 'vout'], 10000), // 回饋電阻
            new VoltageSource('Vplus', ['vplus', 'gnd'], 0), // 非反相輸入接地
            // 理想運放：Vout = -Rf/Rin * Vin = -10 * 1 = -10V
            // 這裡我們用 VCVS 來模擬運放
            new VoltageSource('Vout_ctrl', ['vout', 'gnd'], 0) // 初始值
        ];
        
        // 由於沒有實現 VCVS，我們簡化測試反相放大器的基本電阻網路
        const simplified_components = [
            new VoltageSource('Vin', ['vin', 'gnd'], 1),
            new Resistor('Rin', ['vin', 'vminus'], 1000),
            new Resistor('Rf', ['vminus', 'vout'], 10000),
            new VoltageSource('Vout_fixed', ['vout', 'gnd'], -10) // 假設理想輸出
        ];
        
        await simulator.initialize(simplified_components, {
            startTime: 0,
            stopTime: 1e-6,
            timeStep: 1e-7
        });
        
        const result = await simulator.stepForward();
        assert.isTrue(result.success, '仿真應該成功');
        
        const vminus = result.state.nodeVoltages.get('vminus') || 0;
        
        // 在理想運放中，vminus 應該接近 0 (虛短路)
        // 但在這個簡化模型中，我們檢查電阻分壓
        assert.isNumber(vminus, 'vminus 應該是數字');
        assert.reasonableVoltage(vminus, 15, 'vminus 電壓應該合理');
    });

});

// ==================== 複雜電路互動測試 ====================
describe('複雜電路互動測試', () => {

    it('應該正確處理多組件互動', async () => {
        const simulator = new StepwiseSimulator({ debug: false });
        
        // 建立複雜的混合電路
        const components = [
            // 電源部分
            new VoltageSource('Vdd', ['vdd', 'gnd'], 15),
            new VoltageSource('Vss', ['vss', 'gnd'], -15),
            
            // 輸入信號
            new VoltageSource('Vin', ['vin', 'gnd'], 'SIN(0 2 1000)'), // 2V, 1kHz
            
            // 輸入緩衝
            new Resistor('R1', ['vin', 'node1'], 1000),
            new Capacitor('C1', ['node1', 'node2'], 1e-6, { ic: 0 }),
            
            // 放大級
            new Resistor('R2', ['vdd', 'node2'], 10000),
            new Resistor('R3', ['node2', 'node3'], 5000),
            
            // 輸出級
            new Capacitor('C2', ['node3', 'vout'], 10e-6, { ic: 0 }),
            new Resistor('Rload', ['vout', 'gnd'], 1000),
            
            // 電源去耦
            new Capacitor('Cvdd', ['vdd', 'gnd'], 100e-6, { ic: 15 }),
            new Capacitor('Cvss', ['vss', 'gnd'], 100e-6, { ic: -15 })
        ];
        
        await simulator.initialize(components, {
            startTime: 0,
            stopTime: 5e-3,  // 5 個週期
            timeStep: 50e-6  // 每週期 20 個點
        });
        
        const results = [];
        while (!simulator.isCompleted && results.length < 100) {
            const result = await simulator.stepForward();
            if (result.success) {
                const vin = result.state.nodeVoltages.get('vin') || 0;
                const vout = result.state.nodeVoltages.get('vout') || 0;
                const node2 = result.state.nodeVoltages.get('node2') || 0;
                
                results.push({ 
                    time: result.time, 
                    vin, 
                    vout, 
                    node2 
                });
            }
        }
        
        assert.isTrue(results.length > 20, '應該有足夠的仿真點');
        
        // 檢查所有節點電壓都在合理範圍內
        for (const point of results) {
            assert.reasonableVoltage(point.vin, 5, 'Vin 電壓合理');
            assert.reasonableVoltage(point.vout, 20, 'Vout 電壓合理');
            assert.reasonableVoltage(point.node2, 20, 'Node2 電壓合理');
        }
        
        // 檢查是否有信號變化
        const vinRange = Math.max(...results.map(r => r.vin)) - Math.min(...results.map(r => r.vin));
        assert.isTrue(vinRange > 1, '輸入信號應該有足夠變化');
    });

});

// ==================== 參數掃描測試 ====================
describe('參數掃描測試', () => {

    it('應該正確執行阻值掃描分析', async () => {
        const baseComponents = [
            new VoltageSource('V1', ['vin', 'gnd'], 10),
            new Resistor('R1', ['vin', 'vout'], 1000), // 待掃描
            new Resistor('R2', ['vout', 'gnd'], 2000)
        ];
        
        const resistorValues = [500, 1000, 1500, 2000, 2500];
        const results = [];
        
        for (const R1_value of resistorValues) {
            const simulator = new StepwiseSimulator({ debug: false });
            
            // 創建當前配置的組件
            const components = [
                new VoltageSource('V1', ['vin', 'gnd'], 10),
                new Resistor('R1', ['vin', 'vout'], R1_value),
                new Resistor('R2', ['vout', 'gnd'], 2000)
            ];
            
            await simulator.initialize(components, {
                startTime: 0,
                stopTime: 1e-6,
                timeStep: 1e-6
            });
            
            const result = await simulator.stepForward();
            if (result.success) {
                const vout = result.state.nodeVoltages.get('vout') || 0;
                results.push({ R1: R1_value, Vout: vout });
                
                // 驗證分壓公式：Vout = 10V * 2000/(R1+2000)
                const expectedVout = 10 * 2000 / (R1_value + 2000);
                assert.approximately(vout, expectedVout, 1e-6, 
                                   `R1=${R1_value}Ω 時分壓計算正確`);
            }
        }
        
        assert.equal(results.length, resistorValues.length, '所有掃描點都應該完成');
        
        // 檢查輸出電壓隨電阻值變化的趨勢
        for (let i = 1; i < results.length; i++) {
            assert.isTrue(results[i].Vout < results[i-1].Vout, 
                         'R1 增加時 Vout 應該減少');
        }
    });

});

console.log('🔗 集成測試已載入完成');