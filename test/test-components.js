/**
 * 元件模型測試
 */

import { Resistor } from '../src/components/resistor.js';
import { Capacitor } from '../src/components/capacitor.js';
import { Inductor } from '../src/components/inductor.js';
import { VoltageSource, CurrentSource } from '../src/components/sources.js';

export async function runComponentTests(ctx) {
    
    await ctx.test('Resistor basic properties', () => {
        const r = new Resistor('R1', ['1', '2'], '1000');
        
        ctx.assert.equal(r.name, 'R1');
        ctx.assert.equal(r.type, 'R');
        ctx.assert.equal(r.nodes.length, 2);
        ctx.assert.equal(r.nodes[0], '1');
        ctx.assert.equal(r.nodes[1], '2');
        ctx.assert.equal(r.value, 1000);
        ctx.assert.closeTo(r.getConductance(), 0.001, 1e-10);
    });
    
    await ctx.test('Resistor value parsing', () => {
        const r1 = new Resistor('R1', ['1', '0'], '1K');
        ctx.assert.equal(r1.value, 1000);
        
        const r2 = new Resistor('R2', ['1', '0'], '2.2k');
        ctx.assert.closeTo(r2.value, 2200, 1e-10);
        
        const r3 = new Resistor('R3', ['1', '0'], '10M');
        ctx.assert.closeTo(r3.value, 0.01, 1e-10); // M = milli in electronics
        
        const r4 = new Resistor('R4', ['1', '0'], '1MEG');
        ctx.assert.equal(r4.value, 1e6);
        
        const r5 = new Resistor('R5', ['1', '0'], '100u');
        ctx.assert.closeTo(r5.value, 100e-6, 1e-10);
    });
    
    await ctx.test('Resistor current calculation', () => {
        const r = new Resistor('R1', ['1', '2'], 1000);
        
        // 設置節點電壓: V(1) = 10V, V(2) = 0V
        const nodeVoltages = new Map([['1', 10], ['2', 0]]);
        const current = r.getCurrent(nodeVoltages);
        
        // I = V/R = 10/1000 = 0.01A
        ctx.assert.closeTo(current, 0.01, 1e-10);
    });
    
    await ctx.test('Capacitor basic properties', () => {
        const c = new Capacitor('C1', ['1', '0'], '1e-6');
        
        ctx.assert.equal(c.name, 'C1');
        ctx.assert.equal(c.type, 'C');
        ctx.assert.equal(c.value, 1e-6);
        ctx.assert.equal(c.ic, 0); // 默認初始電壓
    });
    
    await ctx.test('Capacitor with initial condition', () => {
        const c = new Capacitor('C1', ['1', '0'], '1u', { ic: 5 });
        ctx.assert.equal(c.ic, 5);
    });
    
    await ctx.test('Inductor basic properties', () => {
        const l = new Inductor('L1', ['1', '0'], '1e-3');
        
        ctx.assert.equal(l.name, 'L1');
        ctx.assert.equal(l.type, 'L');
        ctx.assert.equal(l.value, 1e-3);
        ctx.assert.equal(l.ic, 0); // 默認初始電流
        ctx.assert.isTrue(l.needsCurrentVariable());
    });
    
    await ctx.test('Voltage source DC', () => {
        const v = new VoltageSource('VIN', ['1', '0'], 'DC(12)');
        
        ctx.assert.equal(v.name, 'VIN');
        ctx.assert.equal(v.type, 'V');
        ctx.assert.equal(v.sourceConfig.type, 'DC');
        ctx.assert.equal(v.sourceConfig.dc, 12);
        ctx.assert.equal(v.getValue(0), 12);
        ctx.assert.equal(v.getValue(1), 12); // DC值不隨時間變化
    });
    
    await ctx.test('Voltage source SINE', () => {
        const v = new VoltageSource('VAC', ['1', '0'], 'SINE(0 10 60)');
        
        ctx.assert.equal(v.sourceConfig.type, 'SINE');
        ctx.assert.equal(v.sourceConfig.offset, 0);
        ctx.assert.equal(v.sourceConfig.amplitude, 10);
        ctx.assert.equal(v.sourceConfig.frequency, 60);
        
        // 測試t=0時的值
        ctx.assert.closeTo(v.getValue(0), 0, 1e-10);
        
        // 測試t=1/(4*60)時的值 (quarter cycle)
        const t_quarter = 1 / (4 * 60);
        ctx.assert.closeTo(v.getValue(t_quarter), 10, 1e-6);
    });
    
    await ctx.test('Voltage source PULSE', () => {
        const v = new VoltageSource('VPULSE', ['1', '0'], 'PULSE(0 5 1e-6 1e-9 1e-9 1e-6 2e-6)');
        
        ctx.assert.equal(v.sourceConfig.type, 'PULSE');
        ctx.assert.equal(v.sourceConfig.v1, 0);
        ctx.assert.equal(v.sourceConfig.v2, 5);
        ctx.assert.equal(v.sourceConfig.td, 1e-6);
        
        // t < td: 應該是v1
        ctx.assert.closeTo(v.getValue(0), 0, 1e-10);
        
        // t > td + tr + pw: 在上升沿
        const t_rise = 1e-6 + 0.5e-9; 
        const expected_rise = 2.5; // 上升沿中點
        ctx.assert.closeTo(v.getValue(t_rise), expected_rise, 0.1);
    });
    
    await ctx.test('Current source basic', () => {
        const i = new CurrentSource('IIN', ['1', '0'], 'DC(0.001)');
        
        ctx.assert.equal(i.name, 'IIN');
        ctx.assert.equal(i.type, 'I');
        ctx.assert.equal(i.sourceConfig.type, 'DC');
        ctx.assert.equal(i.sourceConfig.dc, 0.001);
        ctx.assert.equal(i.getValue(0), 0.001);
        ctx.assert.isFalse(i.needsCurrentVariable());
    });
    
    await ctx.test('Component validation', () => {
        const r1 = new Resistor('R1', ['1', '2'], 1000);
        ctx.assert.isTrue(r1.isValid());
        
        const r2 = new Resistor('R2', ['1', '2'], 0);
        ctx.assert.isFalse(r2.isValid()); // 零電阻無效
        
        const c1 = new Capacitor('C1', ['1', '0'], 1e-6);
        ctx.assert.isTrue(c1.isValid());
        
        const l1 = new Inductor('L1', ['1', '0'], 1e-3);
        ctx.assert.isTrue(l1.isValid());
    });
    
    await ctx.test('Component string representation', () => {
        const r = new Resistor('R1', ['1', '2'], 1000);
        const rStr = r.toString();
        ctx.assert.isTrue(rStr.includes('R1'));
        ctx.assert.isTrue(rStr.includes('1-2'));
        ctx.assert.isTrue(rStr.includes('1.00kΩ'));
        
        const c = new Capacitor('C1', ['node1', 'gnd'], 1e-6);
        const cStr = c.toString();
        ctx.assert.isTrue(cStr.includes('C1'));
        ctx.assert.isTrue(cStr.includes('1.00µF'));
    });
    
    await ctx.test('Component cloning', () => {
        const r1 = new Resistor('R1', ['1', '2'], 1000);
        const r2 = r1.clone();
        
        ctx.assert.equal(r2.name, r1.name);
        ctx.assert.equal(r2.type, r1.type);
        ctx.assert.equal(r2.value, r1.value);
        ctx.assert.isTrue(r1 !== r2); // 不同的對象實例
    });
}