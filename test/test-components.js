/**
 * 元件模型測試
 */

import { Resistor } from '../src/components/resistor.js';
import { Capacitor } from '../src/components/capacitor.js';
import { Inductor } from '../src/components/inductor.js';
import { VoltageSource, CurrentSource } from '../src/components/sources.js';
import { Diode } from '../src/components/diode.js';

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
    
    await ctx.test('Diode basic properties', () => {
        const d = new Diode('D1', ['anode', 'cathode'], { Vf: 0.7, Ron: 0.01, Roff: 1e6 });
        
        ctx.assert.equal(d.name, 'D1');
        ctx.assert.equal(d.type, 'D');
        ctx.assert.equal(d.nodes.length, 2);
        ctx.assert.equal(d.anode, 'anode');
        ctx.assert.equal(d.cathode, 'cathode');
        ctx.assert.equal(d.Vf, 0.7);
        ctx.assert.equal(d.Ron, 0.01);
        ctx.assert.equal(d.Roff, 1e6);
        ctx.assert.isFalse(d.isForwardBiased);
    });
    
    await ctx.test('Diode forward bias behavior', () => {
        const d = new Diode('D1', ['a', 'k'], { Vf: 0.7, Ron: 0.01 });
        
        // 測試順向偏壓 (Va > Vk + Vf)
        const vak_forward = 1.0; // 1V > 0.7V
        const r_forward = d.getEquivalentResistance(vak_forward);
        ctx.assert.equal(r_forward, 0.01); // 應該使用 Ron
        ctx.assert.isTrue(d.isForwardBiased);
        ctx.assert.isTrue(d.isOn());
    });
    
    await ctx.test('Diode reverse bias behavior', () => {
        const d = new Diode('D1', ['a', 'k'], { Vf: 0.7, Ron: 0.01, Roff: 1e6 });
        
        // 測試反向偏壓 (Va < Vk + Vf)
        const vak_reverse = 0.5; // 0.5V < 0.7V
        const r_reverse = d.getEquivalentResistance(vak_reverse);
        ctx.assert.equal(r_reverse, 1e6); // 應該使用 Roff
        ctx.assert.isFalse(d.isForwardBiased);
        ctx.assert.isFalse(d.isOn());
    });
    
    await ctx.test('Diode voltage drop calculation', () => {
        const d = new Diode('D1', ['a', 'k'], { Vf: 0.7, Ron: 0.01 });
        
        // 設定電流為 1A，順向偏壓
        d.updateState(1.0, 1.0);  // Vak = 1V, Iak = 1A
        
        const voltageDrop = d.getVoltageDrop();
        const expected = 0.7 + 1.0 * 0.01; // Vf + I * Ron = 0.71V
        ctx.assert.closeTo(voltageDrop, expected, 1e-10);
    });
    
    await ctx.test('Diode parameter validation', () => {
        // 測試無效參數
        ctx.assert.throws(() => {
            new Diode('D1', ['a', 'k'], { Ron: -0.01 }); // 負的 Ron
        }, /Ron must be positive/);
        
        ctx.assert.throws(() => {
            new Diode('D2', ['a', 'k'], { Vf: -0.7 }); // 負的 Vf
        }, /Forward voltage Vf must be non-negative/);
        
        ctx.assert.throws(() => {
            new Diode('D3', ['a', 'k'], { Ron: 1e6, Roff: 0.01 }); // Roff <= Ron
        }, /Roff must be greater than Ron/);
    });
    
    await ctx.test('Diode toString and status', () => {
        const d = new Diode('D1', ['anode', 'cathode'], { Vf: 0.7, Ron: 0.01 });
        d.updateState(1.0, 0.5); // 順向偏壓
        
        const str = d.toString();
        ctx.assert.isTrue(str.includes('D1'));
        ctx.assert.isTrue(str.includes('Diode'));
        ctx.assert.isTrue(str.includes('anode'));
        ctx.assert.isTrue(str.includes('cathode'));
        ctx.assert.isTrue(str.includes('ON'));
        
        const status = d.getOperatingStatus();
        ctx.assert.equal(status.name, 'D1');
        ctx.assert.equal(status.type, 'Diode');
        ctx.assert.equal(status.state, 'ON');
        ctx.assert.isTrue(status.isForwardBiased);
    });
}