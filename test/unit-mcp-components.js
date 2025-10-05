/**
 * MCP 組件單元測試
 * 
 * 測試 MCP 二極管和 MOSFET 的非線性特性和狀態切換
 */

import { describe, it, assert } from './framework/TestFramework.js';
import { 
    MCPDiode,
    MCPMOSFET,
    createMCPDiode,
    createNMOSSwitch,
    createPMOSSwitch
} from '../src/index.js';

// ==================== MCP 二極管測試 ====================
describe('MCPDiode MCP二極管測試', () => {
    
    it('應該正確創建 MCP 二極管', async () => {
        const diode = new MCPDiode('D1', ['anode', 'cathode'], { 
            Vf: 0.7, 
            Ron: 0.001 
        });
        
        assert.equal(diode.name, 'D1', '組件名稱應該正確');
        assert.equal(diode.type, 'D_MCP', '組件類型應該為 D_MCP');
        assert.equal(diode.Vf, 0.7, '正向電壓應該正確');
        assert.equal(diode.Ron, 0.001, '導通電阻應該正確');
        assert.arrayLength(diode.nodes, 2, '應該有兩個節點');
    });

    it('應該正確初始化二極管狀態', async () => {
        const diode = new MCPDiode('D1', ['anode', 'cathode'], { 
            Vf: 0.7, 
            Ron: 0.001 
        });
        
        diode.initializeState();
        
        assert.exists(diode.diodeState, '二極管狀態應該被初始化');
        assert.isTrue(['OFF', 'ON'].includes(diode.diodeState), '狀態應該為 OFF 或 ON');
    });

    it('應該正確計算 MCP 函數', async () => {
        const diode = new MCPDiode('D1', ['anode', 'cathode'], { 
            Vf: 0.7, 
            Ron: 0.001 
        });
        
        // 測試截止狀態 (電壓小於 Vf)
        const mcpOff = diode.calculateMCP(0.5, 0); // Vd = 0.5V < 0.7V
        assert.equal(mcpOff.state, 'OFF', '電壓小於 Vf 時應該截止');
        assert.approximately(mcpOff.current, 0, 1e-12, '截止時電流應該為 0');
        
        // 測試導通狀態 (電壓大於 Vf)
        const mcpOn = diode.calculateMCP(1.0, 0); // Vd = 1.0V > 0.7V
        assert.equal(mcpOn.state, 'ON', '電壓大於 Vf 時應該導通');
        assert.isTrue(mcpOn.current > 0, '導通時電流應該大於 0');
    });

    it('應該支持不同的二極管類型', async () => {
        const fastDiode = createMCPDiode('fast', 'D1', ['a', 'c']);
        const schottkyDiode = createMCPDiode('schottky', 'D2', ['a', 'c']);
        
        assert.equal(fastDiode.type, 'D_MCP', '快速二極管類型正確');
        assert.equal(schottkyDiode.type, 'D_MCP', '肖特基二極管類型正確');
        assert.isTrue(schottkyDiode.Vf < fastDiode.Vf, '肖特基二極管正向電壓應該更低');
    });

    it('應該正確處理反向偏置', async () => {
        const diode = new MCPDiode('D1', ['anode', 'cathode'], { 
            Vf: 0.7, 
            Ron: 0.001 
        });
        
        // 反向偏置測試
        const mcpReverse = diode.calculateMCP(-5.0, 0); // 反向 5V
        assert.equal(mcpReverse.state, 'OFF', '反向偏置時應該截止');
        assert.approximately(mcpReverse.current, 0, 1e-12, '反向偏置時電流應該為 0');
    });

    it('應該正確更新 MCP 夥伴模型', async () => {
        const diode = new MCPDiode('D1', ['anode', 'cathode'], { 
            Vf: 0.7, 
            Ron: 0.001 
        });
        
        // 設定電壓使二極管導通
        diode.voltageHistory = [1.0]; // 當前電壓 1V > Vf
        
        const prevState = diode.updateMCPCompanionModel(1e-6);
        
        assert.exists(diode.Geq, '等效電導應該被更新');
        assert.exists(diode.Ieq, '等效電流源應該被更新');
        assert.equal(diode.diodeState, 'ON', '應該處於導通狀態');
    });

});

// ==================== MCP MOSFET 測試 ====================
describe('MCPMOSFET MCP場效電晶體測試', () => {

    it('應該正確創建 NMOS', async () => {
        const nmos = new MCPMOSFET('M1', ['drain', 'source', 'gate'], { 
            Ron: 0.01, 
            Vth: 2.0,
            type: 'NMOS',
            controlMode: 'voltage'
        });
        
        assert.equal(nmos.name, 'M1', '組件名稱應該正確');
        assert.equal(nmos.type, 'M_MCP', '組件類型應該為 M_MCP');
        assert.equal(nmos.Ron, 0.01, '導通電阻應該正確');
        assert.equal(nmos.Vth, 2.0, '閾值電壓應該正確');
        assert.equal(nmos.mosType, 'NMOS', 'MOSFET 類型應該正確');
        assert.arrayLength(nmos.nodes, 3, '應該有三個節點');
    });

    it('應該正確創建 PMOS', async () => {
        const pmos = new MCPMOSFET('M2', ['drain', 'source', 'gate'], { 
            Ron: 0.01, 
            Vth: -2.0,
            type: 'PMOS',
            controlMode: 'voltage'
        });
        
        assert.equal(pmos.mosType, 'PMOS', 'PMOS 類型應該正確');
        assert.equal(pmos.Vth, -2.0, 'PMOS 閾值電壓應該為負');
    });

    it('應該正確初始化 MOSFET 狀態', async () => {
        const mosfet = new MCPMOSFET('M1', ['d', 's', 'g'], { 
            Ron: 0.01, 
            Vth: 2.0,
            type: 'NMOS',
            controlMode: 'voltage'
        });
        
        mosfet.initializeState();
        
        assert.exists(mosfet.gateState, '閘極狀態應該被初始化');
        assert.isTrue(['OFF', 'ON'].includes(mosfet.gateState), '狀態應該為 OFF 或 ON');
    });

    it('NMOS 應該正確響應閘極電壓', async () => {
        const nmos = new MCPMOSFET('M1', ['d', 's', 'g'], { 
            Ron: 0.01, 
            Vth: 2.0,
            type: 'NMOS',
            controlMode: 'voltage'
        });
        
        // 測試截止狀態 (Vgs < Vth)
        const mcpOff = nmos.calculateMCP(5.0, 0, 1.0); // Vds=5V, Ids=0A, Vgs=1V < 2V
        assert.equal(mcpOff.state, 'OFF', 'Vgs < Vth 時 NMOS 應該截止');
        
        // 測試導通狀態 (Vgs > Vth)
        const mcpOn = nmos.calculateMCP(1.0, 0, 3.0); // Vds=1V, Ids=0A, Vgs=3V > 2V
        assert.equal(mcpOn.state, 'ON', 'Vgs > Vth 時 NMOS 應該導通');
    });

    it('PMOS 應該正確響應閘極電壓', async () => {
        const pmos = new MCPMOSFET('M2', ['d', 's', 'g'], { 
            Ron: 0.01, 
            Vth: -2.0,
            type: 'PMOS',
            controlMode: 'voltage'
        });
        
        // 測試截止狀態 (Vsg < |Vth|)
        const mcpOff = pmos.calculateMCP(-5.0, 0, -1.0); // Vsd=5V, Isd=0A, Vsg=1V < 2V
        assert.equal(mcpOff.state, 'OFF', 'Vsg < |Vth| 時 PMOS 應該截止');
        
        // 測試導通狀態 (Vsg > |Vth|)
        const mcpOn = pmos.calculateMCP(-1.0, 0, -3.0); // Vsd=1V, Isd=0A, Vsg=3V > 2V
        assert.equal(mcpOn.state, 'ON', 'Vsg > |Vth| 時 PMOS 應該導通');
    });

    it('應該支持外部控制模式', async () => {
        const mosfet = new MCPMOSFET('M1', ['d', 's', 'g'], { 
            Ron: 0.01, 
            Vth: 2.0,
            type: 'NMOS',
            controlMode: 'external'
        });
        
        // 外部設定開關狀態
        mosfet.setGateState(true);
        assert.equal(mosfet.gateState, 'ON', '外部控制應該能設定導通');
        
        mosfet.setGateState(false);
        assert.equal(mosfet.gateState, 'OFF', '外部控制應該能設定截止');
    });

    it('應該正確處理體二極管', async () => {
        const mosfet = new MCPMOSFET('M1', ['d', 's', 'g'], { 
            Ron: 0.01, 
            Vth: 2.0,
            type: 'NMOS',
            controlMode: 'voltage',
            bodyDiode: { Vf: 0.7, Ron: 0.001 }
        });
        
        assert.exists(mosfet.bodyDiode, '體二極管應該存在');
        assert.equal(mosfet.bodyDiode.Vf, 0.7, '體二極管正向電壓應該正確');
    });

    it('應該使用便利函數創建開關', async () => {
        const nmosSwitch = createNMOSSwitch('SW1', ['d', 's', 'g']);
        const pmosSwitch = createPMOSSwitch('SW2', ['d', 's', 'g']);
        
        assert.equal(nmosSwitch.mosType, 'NMOS', 'NMOS 開關類型正確');
        assert.equal(pmosSwitch.mosType, 'PMOS', 'PMOS 開關類型正確');
        assert.equal(nmosSwitch.controlMode, 'external', 'NMOS 開關應該是外部控制');
        assert.equal(pmosSwitch.controlMode, 'external', 'PMOS 開關應該是外部控制');
    });

    it('應該正確更新 MCP 夥伴模型', async () => {
        const mosfet = new MCPMOSFET('M1', ['d', 's', 'g'], { 
            Ron: 0.01, 
            Vth: 2.0,
            type: 'NMOS',
            controlMode: 'external'
        });
        
        // 設定為導通狀態
        mosfet.setGateState(true);
        mosfet.voltageHistory = [1.0]; // Vds = 1V
        
        const prevState = mosfet.updateMCPCompanionModel(1e-6);
        
        assert.exists(mosfet.Geq, '等效電導應該被更新');
        assert.exists(mosfet.Ieq, '等效電流源應該被更新');
        assert.equal(mosfet.gateState, 'ON', '應該處於導通狀態');
        
        // 當導通時，等效電導應該是 1/Ron
        assert.approximately(mosfet.Geq, 1/0.01, 1e-6, '導通時等效電導應該正確');
    });

});

// ==================== MCP 狀態切換測試 ====================
describe('MCP 狀態切換測試', () => {

    it('二極管應該正確切換狀態', async () => {
        const diode = new MCPDiode('D1', ['a', 'c'], { Vf: 0.7, Ron: 0.001 });
        
        // 初始截止
        diode.voltageHistory = [0.5]; // < Vf
        diode.updateMCPCompanionModel(1e-6);
        assert.equal(diode.diodeState, 'OFF', '初始應該截止');
        
        // 切換到導通
        diode.voltageHistory = [1.0]; // > Vf
        const stateChanged = diode.updateMCPCompanionModel(1e-6);
        assert.equal(diode.diodeState, 'ON', '應該切換到導通');
        assert.isTrue(stateChanged, '應該檢測到狀態變化');
        
        // 保持導通
        diode.voltageHistory = [0.9]; // 仍然 > Vf
        const noStateChange = diode.updateMCPCompanionModel(1e-6);
        assert.equal(diode.diodeState, 'ON', '應該保持導通');
        assert.isFalse(noStateChange, '應該沒有狀態變化');
    });

    it('MOSFET 應該正確切換狀態', async () => {
        const mosfet = new MCPMOSFET('M1', ['d', 's', 'g'], { 
            Ron: 0.01, 
            Vth: 2.0,
            type: 'NMOS',
            controlMode: 'external'
        });
        
        // 初始截止
        mosfet.setGateState(false);
        assert.equal(mosfet.gateState, 'OFF', '初始應該截止');
        
        // 切換到導通
        mosfet.setGateState(true);
        assert.equal(mosfet.gateState, 'ON', '應該切換到導通');
        
        // 電壓控制模式測試
        mosfet.controlMode = 'voltage';
        mosfet.gateVoltageHistory = [1.5]; // < Vth
        mosfet.updateMCPCompanionModel(1e-6);
        assert.equal(mosfet.gateState, 'OFF', '電壓控制：Vgs < Vth 時應該截止');
        
        mosfet.gateVoltageHistory = [3.0]; // > Vth
        mosfet.updateMCPCompanionModel(1e-6);
        assert.equal(mosfet.gateState, 'ON', '電壓控制：Vgs > Vth 時應該導通');
    });

});

// ==================== MCP 組件互動測試 ====================
describe('MCP 組件互動測試', () => {

    it('應該正確處理 MOSFET 體二極管互動', async () => {
        const mosfet = new MCPMOSFET('M1', ['d', 's', 'g'], { 
            Ron: 0.01, 
            Vth: 2.0,
            type: 'NMOS',
            controlMode: 'external',
            bodyDiode: { Vf: 0.7, Ron: 0.001 }
        });
        
        // MOSFET 截止，但體二極管可能導通
        mosfet.setGateState(false); // MOSFET 截止
        mosfet.voltageHistory = [-1.0]; // Vds < 0，可能使體二極管導通
        
        const result = mosfet.updateMCPCompanionModel(1e-6);
        
        // 檢查體二極管是否正確處理反向電流
        assert.exists(mosfet.bodyDiode, '體二極管應該存在');
        
        // 體二極管電壓是 -Vds (source 到 drain 方向)
        const bodyDiodeVoltage = 1.0; // -(-1.0)
        if (bodyDiodeVoltage > mosfet.bodyDiode.Vf) {
            assert.isTrue(mosfet.Geq > 0, '體二極管導通時應該有電導');
        }
    });

});

console.log('🔥 MCP 組件單元測試已載入完成');