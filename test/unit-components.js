/**
 * 基礎組件單元測試
 * 
 * 測試 Resistor, Capacitor, Inductor 等被動組件的基本功能
 */

import { describe, it, assert } from './framework/TestFramework.js';
import { 
    Resistor, 
    Capacitor, 
    Inductor, 
    VoltageSource, 
    CurrentSource 
} from '../src/index.js';

// ==================== 電阻器測試 ====================
describe('Resistor 電阻器測試', () => {
    
    it('應該正確創建電阻器', async () => {
        const resistor = new Resistor('R1', ['n1', 'n2'], 1000);
        
        assert.equal(resistor.name, 'R1', '組件名稱應該正確');
        assert.equal(resistor.type, 'R', '組件類型應該為 R');
        assert.equal(resistor.value, 1000, '電阻值應該正確');
        assert.arrayLength(resistor.nodes, 2, '應該有兩個節點');
        assert.equal(resistor.nodes[0], 'n1', '第一個節點應該正確');
        assert.equal(resistor.nodes[1], 'n2', '第二個節點應該正確');
    });

    it('應該支持不同的電阻值格式', async () => {
        const r1 = new Resistor('R1', ['n1', 'n2'], '1k');
        const r2 = new Resistor('R2', ['n1', 'n2'], '2.2M');
        const r3 = new Resistor('R3', ['n1', 'n2'], '470');
        
        assert.equal(r1.value, 1000, '應該正確解析 1k');
        assert.equal(r2.value, 2200000, '應該正確解析 2.2M');
        assert.equal(r3.value, 470, '應該正確解析純數字');
    });

    it('應該正確生成 MNA 印記', async () => {
        const resistor = new Resistor('R1', ['n1', 'n2'], 1000);
        const G = 1 / 1000; // 電導值
        
        const mnaData = {
            G: new Map(),
            B: new Map(),
            C: new Map(),
            D: new Map(),
            I: new Map(),
            E: new Map(),
            nodeMap: new Map([['n1', 0], ['n2', 1], ['gnd', -1]]),
            branchMap: new Map(),
            currentBranchIndex: 0
        };

        resistor.stamp(mnaData);

        // 檢查電導矩陣
        assert.exists(mnaData.G.get('0,0'), 'G[0,0] 應該存在');
        assert.exists(mnaData.G.get('1,1'), 'G[1,1] 應該存在');
        assert.exists(mnaData.G.get('0,1'), 'G[0,1] 應該存在');
        assert.exists(mnaData.G.get('1,0'), 'G[1,0] 應該存在');

        assert.approximately(mnaData.G.get('0,0'), G, 1e-10, 'G[0,0] 值應該正確');
        assert.approximately(mnaData.G.get('1,1'), G, 1e-10, 'G[1,1] 值應該正確');
        assert.approximately(mnaData.G.get('0,1'), -G, 1e-10, 'G[0,1] 值應該正確');
        assert.approximately(mnaData.G.get('1,0'), -G, 1e-10, 'G[1,0] 值應該正確');
    });

});

// ==================== 電容器測試 ====================
describe('Capacitor 電容器測試', () => {

    it('應該正確創建電容器', async () => {
        const capacitor = new Capacitor('C1', ['n1', 'n2'], 1e-6);
        
        assert.equal(capacitor.name, 'C1', '組件名稱應該正確');
        assert.equal(capacitor.type, 'C', '組件類型應該為 C');
        assert.equal(capacitor.value, 1e-6, '電容值應該正確');
        assert.arrayLength(capacitor.nodes, 2, '應該有兩個節點');
    });

    it('應該支持初始條件設定', async () => {
        const capacitor = new Capacitor('C1', ['n1', 'n2'], 1e-6, { ic: 5.0 });
        
        assert.equal(capacitor.ic, 5.0, '初始電壓應該正確設定');
    });

    it('應該正確更新夥伴模型', async () => {
        const capacitor = new Capacitor('C1', ['n1', 'n2'], 1e-6, { ic: 0 });
        const h = 1e-6; // 時間步長
        
        // 設定一些歷史電壓值
        capacitor.voltageHistory = [0, 1, 2]; // t-2, t-1, t 的電壓值
        
        capacitor.updateCompanionModel(h);
        
        assert.exists(capacitor.Geq, '等效電導應該被計算');
        assert.exists(capacitor.Ieq, '等效電流源應該被計算');
        assert.isNumber(capacitor.Geq, '等效電導應該是數字');
        assert.isNumber(capacitor.Ieq, '等效電流源應該是數字');
    });

    it('應該正確處理瞬態印記', async () => {
        const capacitor = new Capacitor('C1', ['n1', 'n2'], 1e-6, { ic: 0 });
        const h = 1e-6;
        
        capacitor.updateCompanionModel(h);
        
        const mnaData = {
            G: new Map(),
            B: new Map(),
            C: new Map(),
            D: new Map(),
            I: new Map(),
            E: new Map(),
            nodeMap: new Map([['n1', 0], ['n2', 1], ['gnd', -1]]),
            branchMap: new Map(),
            currentBranchIndex: 0
        };

        capacitor.stamp(mnaData);

        // 電容器在瞬態分析中應該添加電導和電流源
        assert.exists(mnaData.G.get('0,0'), '應該有電導印記');
        assert.exists(mnaData.I.get('0'), '應該有電流源印記');
    });

});

// ==================== 電感器測試 ====================
describe('Inductor 電感器測試', () => {

    it('應該正確創建電感器', async () => {
        const inductor = new Inductor('L1', ['n1', 'n2'], 1e-3);
        
        assert.equal(inductor.name, 'L1', '組件名稱應該正確');
        assert.equal(inductor.type, 'L', '組件類型應該為 L');
        assert.equal(inductor.value, 1e-3, '電感值應該正確');
        assert.arrayLength(inductor.nodes, 2, '應該有兩個節點');
    });

    it('應該支持初始電流設定', async () => {
        const inductor = new Inductor('L1', ['n1', 'n2'], 1e-3, { ic: 0.5 });
        
        assert.equal(inductor.ic, 0.5, '初始電流應該正確設定');
    });

    it('應該正確更新夥伴模型', async () => {
        const inductor = new Inductor('L1', ['n1', 'n2'], 1e-3, { ic: 0 });
        const h = 1e-6;
        
        // 設定一些歷史電流值
        inductor.currentHistory = [0, 0.1, 0.2]; // t-2, t-1, t 的電流值
        
        inductor.updateCompanionModel(h);
        
        assert.exists(inductor.Req, '等效電阻應該被計算');
        assert.exists(inductor.Veq, '等效電壓源應該被計算');
        assert.isNumber(inductor.Req, '等效電阻應該是數字');
        assert.isNumber(inductor.Veq, '等效電壓源應該是數字');
    });

});

// ==================== 電壓源測試 ====================
describe('VoltageSource 電壓源測試', () => {

    it('應該正確創建直流電壓源', async () => {
        const vsource = new VoltageSource('V1', ['vin', 'gnd'], 5);
        
        assert.equal(vsource.name, 'V1', '組件名稱應該正確');
        assert.equal(vsource.type, 'V', '組件類型應該為 V');
        assert.equal(vsource.dcValue, 5, '直流值應該正確');
        assert.arrayLength(vsource.nodes, 2, '應該有兩個節點');
    });

    it('應該正確解析 DC 電壓源', async () => {
        const vsource = new VoltageSource('V1', ['vin', 'gnd'], 'DC 12');
        
        assert.equal(vsource.dcValue, 12, '應該正確解析 DC 12');
    });

    it('應該正確解析正弦電壓源', async () => {
        const vsource = new VoltageSource('V1', ['vin', 'gnd'], 'SIN(0 5 60)');
        
        assert.equal(vsource.waveform.type, 'SIN', '波形類型應該為 SIN');
        assert.equal(vsource.waveform.offset, 0, '偏移量應該正確');
        assert.equal(vsource.waveform.amplitude, 5, '振幅應該正確');
        assert.equal(vsource.waveform.frequency, 60, '頻率應該正確');
    });

    it('應該正確計算時間相關電壓', async () => {
        const vsource = new VoltageSource('V1', ['vin', 'gnd'], 'SIN(0 5 60)');
        
        // t=0 時，sin(0) = 0，所以電壓 = 0 + 0 = 0
        const v0 = vsource.getVoltageAtTime(0);
        assert.approximately(v0, 0, 1e-10, '時間 t=0 的電壓應該正確');
        
        // t=1/(4*60) 時，sin(π/2) = 1，所以電壓 = 0 + 5*1 = 5
        const t_quarter = 1 / (4 * 60);
        const v_quarter = vsource.getVoltageAtTime(t_quarter);
        assert.approximately(v_quarter, 5, 1e-10, '時間 t=T/4 的電壓應該正確');
    });

    it('應該正確生成 MNA 印記', async () => {
        const vsource = new VoltageSource('V1', ['vin', 'gnd'], 'DC 5');
        
        const mnaData = {
            G: new Map(),
            B: new Map(),
            C: new Map(),
            D: new Map(),
            I: new Map(),
            E: new Map(),
            nodeMap: new Map([['vin', 0], ['gnd', -1]]),
            branchMap: new Map(),
            currentBranchIndex: 0
        };

        vsource.stamp(mnaData);

        // 電壓源應該添加分支變量
        assert.mapHasKey(mnaData.branchMap, 'V1', '應該創建分支變量');
        
        // 檢查 B 矩陣 (節點-分支關聯矩陣)
        const branchIndex = mnaData.branchMap.get('V1');
        assert.exists(mnaData.B.get(`0,${branchIndex}`), 'B 矩陣應該有正確印記');
        
        // 檢查 E 向量 (電壓源值)
        assert.exists(mnaData.E.get(branchIndex.toString()), 'E 向量應該有電壓源值');
        assert.equal(mnaData.E.get(branchIndex.toString()), 5, '電壓源值應該正確');
    });

});

// ==================== 電流源測試 ====================
describe('CurrentSource 電流源測試', () => {

    it('應該正確創建直流電流源', async () => {
        const isource = new CurrentSource('I1', ['n1', 'gnd'], 0.001);
        
        assert.equal(isource.name, 'I1', '組件名稱應該正確');
        assert.equal(isource.type, 'I', '組件類型應該為 I');
        assert.equal(isource.dcValue, 0.001, '直流值應該正確');
        assert.arrayLength(isource.nodes, 2, '應該有兩個節點');
    });

    it('應該正確解析 AC 電流源', async () => {
        const isource = new CurrentSource('I1', ['n1', 'gnd'], 'AC 0.01');
        
        assert.equal(isource.acValue, 0.01, '應該正確解析 AC 0.01');
    });

    it('應該正確生成 MNA 印記', async () => {
        const isource = new CurrentSource('I1', ['n1', 'gnd'], 'DC 0.001');
        
        const mnaData = {
            G: new Map(),
            B: new Map(),
            C: new Map(),
            D: new Map(),
            I: new Map(),
            E: new Map(),
            nodeMap: new Map([['n1', 0], ['gnd', -1]]),
            branchMap: new Map(),
            currentBranchIndex: 0
        };

        isource.stamp(mnaData);

        // 電流源應該在 I 向量中添加電流
        assert.exists(mnaData.I.get('0'), 'I 向量應該有電流源值');
        assert.equal(mnaData.I.get('0'), 0.001, '電流源值應該正確');
    });

});

console.log('📁 基礎組件單元測試已載入完成');