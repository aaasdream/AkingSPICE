/**
 * 核心求解器測試
 * 
 * 測試 AkingSPICE, MCPTransientAnalysis, DC_MCP_Solver 的核心功能
 */

import { describe, it, assert } from './framework/TestFramework.js';
import { 
    AkingSPICE,
    MCPTransientAnalysis,
    DC_MCP_Solver,
    StepwiseSimulator,
    Resistor,
    Capacitor,
    Inductor,
    VoltageSource,
    MCPDiode,
    MCPMOSFET
} from '../src/index.js';

// ==================== AkingSPICE 主求解器測試 ====================
describe('AkingSPICE 主求解器測試', () => {

    it('應該正確創建求解器實例', async () => {
        const solver = new AkingSPICE();
        
        assert.exists(solver, '求解器實例應該存在');
        assert.exists(solver.parser, '網表解析器應該存在');
        assert.exists(solver.transientAnalysis, '瞬態分析器應該存在');
        assert.exists(solver.dcAnalysis, 'DC 分析器應該存在');
        assert.equal(solver.isInitialized, false, '初始化狀態應該為 false');
    });

    it('應該正確添加組件', async () => {
        const solver = new AkingSPICE();
        const components = [
            new Resistor('R1', ['n1', 'n2'], 1000),
            new Capacitor('C1', ['n2', 'gnd'], 1e-6)
        ];
        
        solver.components = components;
        
        assert.equal(solver.components.length, 2, '應該有兩個組件');
        assert.equal(solver.isInitialized, true, '添加組件後應該自動初始化');
    });

    it('應該正確處理單個組件添加', async () => {
        const solver = new AkingSPICE();
        
        solver.addComponent(new Resistor('R1', ['n1', 'n2'], 1000));
        assert.equal(solver.components.length, 1, '應該有一個組件');
        
        solver.addComponent(new VoltageSource('V1', ['n1', 'gnd'], 5));
        assert.equal(solver.components.length, 2, '應該有兩個組件');
        assert.equal(solver.isInitialized, true, '應該已初始化');
    });

    it('應該支持批次添加組件', async () => {
        const solver = new AkingSPICE();
        const components = [
            new VoltageSource('V1', ['vin', 'gnd'], 12),
            new Resistor('R1', ['vin', 'vout'], 1000),
            new Resistor('R2', ['vout', 'gnd'], 2000)
        ];
        
        solver.addComponents(components);
        
        assert.equal(solver.components.length, 3, '應該有三個組件');
        assert.equal(solver.isInitialized, true, '應該已初始化');
    });

    it('應該正確執行 DC 分析', async () => {
        const solver = new AkingSPICE();
        const components = [
            new VoltageSource('V1', ['vin', 'gnd'], 12),
            new Resistor('R1', ['vin', 'vout'], 1000),
            new Resistor('R2', ['vout', 'gnd'], 2000)
        ];
        
        solver.components = components;
        
        const result = await solver.runDCMCPAnalysis();
        
        assert.exists(result, 'DC 分析結果應該存在');
        assert.exists(result.nodeVoltages, '節點電壓應該存在');
        assert.mapHasKey(result.nodeVoltages, 'vin', '應該有 vin 節點電壓');
        assert.mapHasKey(result.nodeVoltages, 'vout', '應該有 vout 節點電壓');
        
        // 檢查分壓器計算：Vout = 12V * 2000/(1000+2000) = 8V
        const vout = result.nodeVoltages.get('vout');
        assert.approximately(vout, 8.0, 1e-6, 'Vout 應該約為 8V');
    });

});

// ==================== MCPTransientAnalysis 瞬態分析測試 ====================
describe('MCPTransientAnalysis 瞬態分析測試', () => {

    it('應該正確創建瞬態分析器', async () => {
        const transient = new MCPTransientAnalysis();
        
        assert.exists(transient, '瞬態分析器應該存在');
        assert.exists(transient.solver, 'MCP 求解器應該存在');
    });

    it('應該正確設置分析參數', async () => {
        const transient = new MCPTransientAnalysis();
        const params = {
            startTime: 0,
            stopTime: 1e-3,
            timeStep: 1e-6,
            maxIterations: 10
        };
        
        transient.setParameters(params);
        
        assert.equal(transient.startTime, 0, '起始時間應該正確');
        assert.equal(transient.stopTime, 1e-3, '結束時間應該正確');
        assert.equal(transient.timeStep, 1e-6, '時間步長應該正確');
        assert.equal(transient.maxIterations, 10, '最大迭代數應該正確');
    });

    it('應該正確初始化 RC 電路', async () => {
        const transient = new MCPTransientAnalysis();
        const components = [
            new VoltageSource('V1', ['vin', 'gnd'], 5),
            new Resistor('R1', ['vin', 'vout'], 1000),
            new Capacitor('C1', ['vout', 'gnd'], 1e-6, { ic: 0 })
        ];
        
        await transient.initialize(components, 1e-6);
        
        assert.isTrue(transient.isInitialized, '應該已初始化');
        assert.exists(transient.nodeMap, '節點映射應該存在');
        assert.exists(transient.mnaMatrices, 'MNA 矩陣應該存在');
    });

    it('應該正確執行瞬態步驟', async () => {
        const transient = new MCPTransientAnalysis();
        const components = [
            new VoltageSource('V1', ['vin', 'gnd'], 5),
            new Resistor('R1', ['vin', 'vout'], 1000),
            new Capacitor('C1', ['vout', 'gnd'], 1e-6, { ic: 0 })
        ];
        
        const params = {
            startTime: 0,
            stopTime: 5e-3,
            timeStep: 1e-4,
            maxIterations: 10
        };
        
        transient.setParameters(params);
        await transient.initialize(components, params.timeStep);
        
        // 執行第一個時間步
        const result1 = transient.solveTimeStep(1e-4, 10);
        assert.exists(result1.nodeVoltages, '第一步結果應該有節點電壓');
        assert.isTrue(result1.converged, '第一步應該收斂');
        
        // 執行第二個時間步
        const result2 = transient.solveTimeStep(2e-4, 10);
        assert.exists(result2.nodeVoltages, '第二步結果應該有節點電壓');
        
        // RC 電路充電：Vout 應該隨時間增加
        const vout1 = result1.nodeVoltages.get('vout') || 0;
        const vout2 = result2.nodeVoltages.get('vout') || 0;
        assert.isTrue(vout2 > vout1, '電容器電壓應該隨時間增加');
    });

    it('應該支持正式步進 API', async () => {
        const transient = new MCPTransientAnalysis();
        const components = [
            new VoltageSource('V1', ['vin', 'gnd'], 10),
            new Resistor('R1', ['vin', 'vout'], 500),
            new Capacitor('C1', ['vout', 'gnd'], 2e-6, { ic: 0 })
        ];
        
        const params = {
            startTime: 0,
            stopTime: 2e-3,
            timeStep: 1e-4,
            maxIterations: 15
        };
        
        // 使用正式 API
        await transient.initializeSteppedAnalysis(components, params);
        
        // 執行幾個步驟
        const step1 = transient.stepForwardAnalysis();
        const step2 = transient.stepForwardAnalysis();
        const step3 = transient.stepForwardAnalysis();
        
        assert.exists(step1.nodeVoltages, '步驟 1 應該有結果');
        assert.exists(step2.nodeVoltages, '步驟 2 應該有結果');
        assert.exists(step3.nodeVoltages, '步驟 3 應該有結果');
        
        // 完成分析
        const summary = transient.finalizeSteppedAnalysis();
        assert.exists(summary, '應該有完成總結');
        assert.isNumber(summary.totalSteps, '總步數應該是數字');
    });

});

// ==================== DC_MCP_Solver DC求解器測試 ====================
describe('DC_MCP_Solver DC求解器測試', () => {

    it('應該正確創建 DC 求解器', async () => {
        const dcSolver = new DC_MCP_Solver();
        
        assert.exists(dcSolver, 'DC 求解器應該存在');
        assert.exists(dcSolver.mcpSolver, 'MCP 求解器應該存在');
    });

    it('應該正確求解線性 DC 電路', async () => {
        const dcSolver = new DC_MCP_Solver();
        const components = [
            new VoltageSource('V1', ['vin', 'gnd'], 15),
            new Resistor('R1', ['vin', 'vmid'], 1500),
            new Resistor('R2', ['vmid', 'gnd'], 1000)
        ];
        
        const result = await dcSolver.solve(components);
        
        assert.exists(result, 'DC 求解結果應該存在');
        assert.exists(result.nodeVoltages, '節點電壓應該存在');
        assert.mapHasKey(result.nodeVoltages, 'vin', '應該有 vin 節點');
        assert.mapHasKey(result.nodeVoltages, 'vmid', '應該有 vmid 節點');
        
        // 檢查分壓：Vmid = 15V * 1000/(1500+1000) = 6V
        const vmid = result.nodeVoltages.get('vmid');
        assert.approximately(vmid, 6.0, 1e-6, 'Vmid 應該約為 6V');
    });

    it('應該正確處理 MCP 二極管 DC 分析', async () => {
        const dcSolver = new DC_MCP_Solver();
        const components = [
            new VoltageSource('V1', ['vin', 'gnd'], 5),
            new Resistor('R1', ['vin', 'anode'], 1000),
            new MCPDiode('D1', ['anode', 'cathode'], { Vf: 0.7, Ron: 0.01 }),
            new Resistor('Rload', ['cathode', 'gnd'], 2000)
        ];
        
        const result = await dcSolver.solve(components);
        
        assert.exists(result, 'MCP 二極管 DC 結果應該存在');
        assert.exists(result.nodeVoltages, '節點電壓應該存在');
        
        // 二極管導通時，cathode 電壓應該約為 anode - Vf
        const vanode = result.nodeVoltages.get('anode') || 0;
        const vcathode = result.nodeVoltages.get('cathode') || 0;
        
        if (vanode > 0.7) {
            // 二極管應該導通
            assert.approximately(vanode - vcathode, 0.7, 0.1, '二極管壓降應該約為 Vf');
        }
    });

});

// ==================== StepwiseSimulator 步進式仿真器測試 ====================
describe('StepwiseSimulator 步進式仿真器測試', () => {

    it('應該正確創建步進式仿真器', async () => {
        const simulator = new StepwiseSimulator();
        
        assert.exists(simulator, '仿真器應該存在');
        assert.equal(simulator.isInitialized, false, '初始狀態應該未初始化');
        assert.equal(simulator.isPaused, false, '初始狀態應該未暫停');
        assert.equal(simulator.isCompleted, false, '初始狀態應該未完成');
    });

    it('應該正確初始化仿真', async () => {
        const simulator = new StepwiseSimulator({ debug: false });
        const components = [
            new VoltageSource('V1', ['vin', 'gnd'], 8),
            new Resistor('R1', ['vin', 'vout'], 800),
            new Capacitor('C1', ['vout', 'gnd'], 10e-6, { ic: 0 })
        ];
        
        const params = {
            startTime: 0,
            stopTime: 10e-3,
            timeStep: 1e-3,
            maxIterations: 20
        };
        
        const success = await simulator.initialize(components, params);
        
        assert.isTrue(success, '初始化應該成功');
        assert.equal(simulator.isInitialized, true, '應該已初始化');
        assert.equal(simulator.currentTime, 0, '當前時間應該為 0');
        assert.equal(simulator.stepCount, 0, '步數計數應該為 0');
    });

    it('應該正確執行單步前進', async () => {
        const simulator = new StepwiseSimulator({ debug: false });
        const components = [
            new VoltageSource('V1', ['vin', 'gnd'], 10),
            new Resistor('R1', ['vin', 'vout'], 1000),
            new Capacitor('C1', ['vout', 'gnd'], 5e-6, { ic: 0 })
        ];
        
        await simulator.initialize(components, {
            startTime: 0,
            stopTime: 5e-3,
            timeStep: 1e-3
        });
        
        const result = await simulator.stepForward();
        
        assert.isTrue(result.success, '步進應該成功');
        assert.equal(result.step, 1, '步數應該為 1');
        assert.approximately(result.time, 1e-3, 1e-10, '時間應該正確');
        assert.exists(result.state, '狀態數據應該存在');
        assert.exists(result.state.nodeVoltages, '節點電壓應該存在');
    });

    it('應該正確處理暫停/繼續', async () => {
        const simulator = new StepwiseSimulator({ debug: false });
        const components = [
            new VoltageSource('V1', ['vin', 'gnd'], 6),
            new Resistor('R1', ['vin', 'vout'], 600),
            new Capacitor('C1', ['vout', 'gnd'], 1e-6, { ic: 0 })
        ];
        
        await simulator.initialize(components, {
            startTime: 0,
            stopTime: 3e-3,
            timeStep: 1e-3
        });
        
        // 執行一步
        await simulator.stepForward();
        assert.equal(simulator.stepCount, 1, '應該執行了一步');
        
        // 暫停
        simulator.pause();
        assert.equal(simulator.isPaused, true, '應該已暫停');
        
        // 嘗試步進（應該被跳過）
        const pausedResult = await simulator.stepForward();
        assert.equal(pausedResult.isPaused, true, '暫停時步進應該被跳過');
        assert.equal(simulator.stepCount, 1, '步數不應該增加');
        
        // 繼續
        simulator.resume();
        assert.equal(simulator.isPaused, false, '應該已恢復');
        
        // 正常步進
        const resumedResult = await simulator.stepForward();
        assert.isTrue(resumedResult.success, '恢復後步進應該成功');
        assert.equal(simulator.stepCount, 2, '步數應該增加');
    });

    it('應該正確查詢電路狀態', async () => {
        const simulator = new StepwiseSimulator({ debug: false });
        const components = [
            new VoltageSource('V1', ['vin', 'gnd'], 15),
            new Resistor('R1', ['vin', 'vout'], 1500),
            new Resistor('R2', ['vout', 'gnd'], 1000)
        ];
        
        await simulator.initialize(components, {
            startTime: 0,
            stopTime: 1e-3,
            timeStep: 1e-3
        });
        
        await simulator.stepForward();
        const state = simulator.getCircuitState();
        
        assert.exists(state, '電路狀態應該存在');
        assert.equal(state.isValid, true, '狀態應該有效');
        assert.exists(state.nodeVoltages, '節點電壓應該存在');
        assert.exists(state.componentStates, '組件狀態應該存在');
        assert.mapHasKey(state.nodeVoltages, 'vin', '應該有 vin 電壓');
        assert.mapHasKey(state.nodeVoltages, 'vout', '應該有 vout 電壓');
        
        // 檢查分壓計算
        const vout = state.nodeVoltages.get('vout');
        assert.approximately(vout, 6.0, 1e-6, '分壓計算應該正確');
    });

    it('應該正確修改組件參數', async () => {
        const simulator = new StepwiseSimulator({ debug: false });
        const components = [
            new VoltageSource('V1', ['vin', 'gnd'], 12),
            new Resistor('R1', ['vin', 'vout'], 1200),
            new Resistor('R2', ['vout', 'gnd'], 800)
        ];
        
        await simulator.initialize(components, {
            startTime: 0,
            stopTime: 2e-3,
            timeStep: 1e-3
        });
        
        await simulator.stepForward();
        
        // 修改 R1 阻值
        const success = simulator.modifyComponent('R1', { value: 600 });
        assert.isTrue(success, '組件修改應該成功');
        
        // 檢查修改後的值
        const state = simulator.getCircuitState();
        const r1State = state.componentStates.get('R1');
        assert.equal(r1State.value, 600, 'R1 阻值應該已修改');
    });

});

console.log('⚙️ 核心求解器測試已載入完成');