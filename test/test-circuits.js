/**
 * 電路分析測試
 */

import { AkingSPICE } from '../src/core/solver.js';

export async function runCircuitTests(ctx) {
    
    await ctx.test('Simple resistor divider - DC analysis', async () => {
        const netlist = `
        * Simple voltage divider
        VIN 1 0 DC(10)
        R1 1 2 1000
        R2 2 0 1000
        `;
        
        const solver = new AkingSPICE(netlist);
        const result = await solver.runDCAnalysis();
        
        ctx.assert.isTrue(result.converged);
        
        // 電壓分壓器：V(2) = 10 * 1000/(1000+1000) = 5V
        const v2 = result.getNodeVoltage('2');
        ctx.assert.closeTo(v2, 5.0, 1e-10);
        
        // VIN的電流 = 10V / 2000Ω = 5mA
        const iVIN = result.getBranchCurrent('VIN');
        ctx.assert.closeTo(iVIN, 0.005, 1e-10);
    });
    
    await ctx.test('Simple RC circuit - transient analysis', async () => {
        const netlist = `
        * RC charging circuit
        VIN 1 0 DC(5)
        R1 1 2 1000
        C1 2 0 1e-6
        .tran 1us 5ms
        `;
        
        const solver = new AkingSPICE(netlist);
        const result = await solver.runAnalysis('.tran 1us 5ms');
        
        ctx.assert.isTrue(result.timeVector.length > 0);
        
        // 檢查時間範圍
        const timeVector = result.getTimeVector();
        ctx.assert.equal(timeVector[0], 0);
        ctx.assert.closeTo(timeVector[timeVector.length - 1], 5e-3, 1e-9);
        
        // 檢查RC充電曲線
        const voltageVector = result.getVoltageVector('2');
        
        // t=0時，電容電壓應該是0（假設初始條件為0）
        ctx.assert.closeTo(voltageVector[0], 0, 1e-6);
        
        // 在足夠長的時間後，電容電壓應該接近5V
        const finalVoltage = voltageVector[voltageVector.length - 1];
        ctx.assert.closeTo(finalVoltage, 5.0, 0.1);
        
        // RC時間常數 τ = RC = 1000 * 1e-6 = 1ms
        // 在 t = τ 時，電壓應該是 5 * (1 - e^(-1)) ≈ 3.16V
        const tauIndex = Math.floor(timeVector.length * 1e-3 / 5e-3); // τ/total_time的位置
        if (tauIndex < voltageVector.length) {
            const vAtTau = voltageVector[tauIndex];
            const expectedAtTau = 5 * (1 - Math.exp(-1));
            ctx.assert.closeTo(vAtTau, expectedAtTau, 0.5); // 允許較大誤差，因為時間步長限制
        }
    });
    
    await ctx.test('RLC circuit - basic validation', async () => {
        const netlist = `
        * RLC circuit
        VIN 1 0 DC(10)
        R1 1 2 100
        L1 2 3 1e-3
        C1 3 0 1e-6
        `;
        
        const solver = new AkingSPICE(netlist);
        
        // 檢查電路信息
        const circuitInfo = solver.getCircuitInfo();
        ctx.assert.equal(circuitInfo.componentCount, 4);
        ctx.assert.isTrue(circuitInfo.nodeList.includes('1'));
        ctx.assert.isTrue(circuitInfo.nodeList.includes('2'));
        ctx.assert.isTrue(circuitInfo.nodeList.includes('3'));
        
        // 驗證電路
        const validation = solver.validateCircuit();
        ctx.assert.isTrue(validation.valid);
        
        // 運行DC分析
        const dcResult = await solver.runDCAnalysis();
        ctx.assert.isTrue(dcResult.converged);
    });
    
    await ctx.test('Circuit with SINE source', async () => {
        const netlist = `
        * AC circuit with resistive load
        VAC 1 0 SINE(0 10 60)
        R1 1 0 1000
        `;
        
        const solver = new AkingSPICE(netlist);
        const result = await solver.runAnalysis('.tran 1ms 50ms');
        
        ctx.assert.isTrue(result.timeVector.length > 0);
        
        const timeVector = result.getTimeVector();
        const voltageVector = result.getVoltageVector('1');
        
        // 檢查正弦波特性
        // 在 t = 0 時，應該接近 0
        ctx.assert.closeTo(voltageVector[0], 0, 1e-6);
        
        // 找到 t ≈ 1/(4*60) = 4.17ms 的索引 (quarter cycle)
        const quarterPeriod = 1 / (4 * 60);
        let quarterIndex = -1;
        for (let i = 0; i < timeVector.length; i++) {
            if (timeVector[i] >= quarterPeriod) {
                quarterIndex = i;
                break;
            }
        }
        
        if (quarterIndex >= 0) {
            // 在四分之一周期時，電壓應該接近峰值10V
            ctx.assert.closeTo(voltageVector[quarterIndex], 10, 1.0);
        }
    });
    
    await ctx.test('Circuit with multiple sources', async () => {
        const netlist = `
        * Circuit with voltage and current source
        V1 1 0 DC(12)
        I1 0 2 DC(0.001)
        R1 1 2 1000
        R2 2 0 2000
        `;
        
        const solver = new AkingSPICE(netlist);
        const result = await solver.runDCAnalysis();
        
        ctx.assert.isTrue(result.converged);
        
        // 使用節點分析驗證結果
        const v1 = result.getNodeVoltage('1');
        const v2 = result.getNodeVoltage('2');
        
        ctx.assert.equal(v1, 12); // 電壓源直接固定電壓
        
        // 節點2的電流方程式: (V2-V1)/R1 + V2/R2 = I1
        // (V2-12)/1000 + V2/2000 = 0.001
        // V2 * (1/1000 + 1/2000) = 12/1000 + 0.001
        // V2 * (3/2000) = 0.012 + 0.001 = 0.013
        // V2 = 0.013 * 2000/3 = 8.667V
        ctx.assert.closeTo(v2, 8.666666666666666, 1e-10);
    });
    
    await ctx.test('Netlist parsing with comments and blank lines', async () => {
        const netlist = `
        * This is a comment
        * Another comment line
        
        VIN 1 0 DC(5)  ; inline comment
        R1 1 2 1K      $ another inline comment
        R2 2 0 2K
        
        ; This is also a comment
        .tran 1us 1ms
        
        * End of netlist
        `;
        
        const solver = new AkingSPICE(netlist);
        
        const circuitInfo = solver.getCircuitInfo();
        ctx.assert.equal(circuitInfo.componentCount, 3); // VIN, R1, R2
        
        const result = await solver.runDCAnalysis();
        ctx.assert.isTrue(result.converged);
        
        // 電壓分壓器: V(2) = 5 * 2K/(1K+2K) = 10/3 V
        const v2 = result.getNodeVoltage('2');
        ctx.assert.closeTo(v2, 10/3, 1e-10);
    });
    
    await ctx.test('Error handling - invalid netlist', async () => {
        const badNetlist = `
        VIN 1  ; incomplete voltage source definition
        R1 1 2  ; missing resistance value
        `;
        
        ctx.assert.throws(() => {
            new AkingSPICE(badNetlist);
        });
    });
    
    await ctx.test('Circuit validation warnings', async () => {
        const netlist = `
        * Circuit without ground reference
        V1 1 2 DC(10)
        R1 1 2 1000
        `;
        
        const solver = new AkingSPICE(netlist);
        const validation = solver.validateCircuit();
        
        // 應該有警告：沒有接地節點
        ctx.assert.isTrue(validation.warnings.length > 0);
        ctx.assert.isTrue(validation.warnings.some(w => w.includes('ground')));
    });
    
    await ctx.test('Component value engineering notation', async () => {
        const netlist = `
        * Test engineering notation parsing
        VIN 1 0 DC(10)
        R1 1 2 1.5K
        R2 2 3 2.2MEG
        C1 3 4 100n
        L1 4 0 10u
        `;
        
        const solver = new AkingSPICE(netlist);
        const components = solver.components;
        
        // 檢查解析結果
        const r1 = components.find(c => c.name === 'R1');
        ctx.assert.equal(r1.value, 1500);
        
        const r2 = components.find(c => c.name === 'R2');
        ctx.assert.equal(r2.value, 2.2e6);
        
        const c1 = components.find(c => c.name === 'C1');
        ctx.assert.closeTo(c1.value, 100e-9, 1e-12);
        
        const l1 = components.find(c => c.name === 'L1');
        ctx.assert.closeTo(l1.value, 10e-6, 1e-12);
    });
}
