/**
 * 解析器測試
 */

import { NetlistParser } from '../src/parser/netlist.js';

export async function runParserTests(ctx) {
    
    await ctx.test('Basic component parsing - Resistor', async () => {
        const parser = new NetlistParser();
        const component = parser.parseLine('R1 1 2 1000');
        
        ctx.assert.equal(component.name, 'R1');
        ctx.assert.equal(component.constructor.name, 'Resistor');
        ctx.assert.equal(component.nodes[0], '1');
        ctx.assert.equal(component.nodes[1], '2');
        ctx.assert.equal(component.value, 1000);
    });
    
    await ctx.test('Basic component parsing - Capacitor', async () => {
        const parser = new NetlistParser();
        const component = parser.parseLine('C1 3 4 1e-6');
        
        ctx.assert.equal(component.name, 'C1');
        ctx.assert.equal(component.constructor.name, 'Capacitor');
        ctx.assert.equal(component.nodes[0], '3');
        ctx.assert.equal(component.nodes[1], '4');
        ctx.assert.closeTo(component.value, 1e-6, 1e-12);
    });
    
    await ctx.test('Basic component parsing - Inductor', async () => {
        const parser = new NetlistParser();
        const component = parser.parseLine('L1 5 6 10e-3');
        
        ctx.assert.equal(component.name, 'L1');
        ctx.assert.equal(component.constructor.name, 'Inductor');
        ctx.assert.equal(component.nodes[0], '5');
        ctx.assert.equal(component.nodes[1], '6');
        ctx.assert.closeTo(component.value, 10e-3, 1e-12);
    });
    
    await ctx.test('Voltage source parsing - DC', async () => {
        const parser = new NetlistParser();
        const component = parser.parseLine('VIN 7 8 DC(12)');
        
        ctx.assert.equal(component.name, 'VIN');
        ctx.assert.equal(component.constructor.name, 'VoltageSource');
        ctx.assert.equal(component.nodes[0], '7');
        ctx.assert.equal(component.nodes[1], '8');
        ctx.assert.equal(component.sourceConfig.dc, 12);
        ctx.assert.equal(component.sourceConfig.type, 'DC');
    });
    
    await ctx.test('Voltage source parsing - SINE', async () => {
        const parser = new NetlistParser();
        const component = parser.parseLine('VAC 1 0 SINE(0 10 60 0 0)');
        
        ctx.assert.equal(component.name, 'VAC');
        ctx.assert.equal(component.constructor.name, 'VoltageSource');
        ctx.assert.equal(component.sourceConfig.type, 'SINE');
        ctx.assert.equal(component.sourceConfig.offset, 0);
        ctx.assert.equal(component.sourceConfig.amplitude, 10);
        ctx.assert.equal(component.sourceConfig.frequency, 60);
        ctx.assert.equal(component.sourceConfig.delay, 0);
        ctx.assert.equal(component.sourceConfig.damping, 0);
    });
    
    await ctx.test('Current source parsing - DC', async () => {
        const parser = new NetlistParser();
        const component = parser.parseLine('I1 9 10 DC(0.005)');
        
        ctx.assert.equal(component.name, 'I1');
        ctx.assert.equal(component.constructor.name, 'CurrentSource');
        ctx.assert.equal(component.nodes[0], '9');
        ctx.assert.equal(component.nodes[1], '10');
        ctx.assert.closeTo(component.sourceConfig.dc, 0.005, 1e-12);
        ctx.assert.equal(component.sourceConfig.type, 'DC');
    });
    
    await ctx.test('Engineering notation parsing', async () => {
        const parser = new NetlistParser();
        
        // 測試各種工程記號
        const testCases = [
            { line: 'R1 1 2 1K', expected: 1000 },
            { line: 'R2 1 2 1.5K', expected: 1500 },
            { line: 'R3 1 2 2.2MEG', expected: 2.2e6 },
            { line: 'R4 1 2 47', expected: 47 },
            { line: 'C1 1 2 100n', expected: 100e-9 },
            { line: 'C2 1 2 1u', expected: 1e-6 },
            { line: 'C3 1 2 10m', expected: 10e-3 },
            { line: 'L1 1 2 10u', expected: 10e-6 },
            { line: 'L2 1 2 1m', expected: 1e-3 }
        ];
        
        testCases.forEach(test => {
            const component = parser.parseLine(test.line);
            ctx.assert.closeTo(component.value, test.expected, 1e-15, 
                `Failed for line: ${test.line}, expected: ${test.expected}, got: ${component.value}`);
        });
    });
    
    await ctx.test('Comment and whitespace handling', async () => {
        const parser = new NetlistParser();
        
        // 測試註解處理
        const component1 = parser.parseLine('R1 1 2 1000  ; This is a comment');
        ctx.assert.equal(component1.name, 'R1');
        ctx.assert.equal(component1.value, 1000);
        
        const component2 = parser.parseLine('R2 1 2 2000  $ Another comment style');
        ctx.assert.equal(component2.name, 'R2');
        ctx.assert.equal(component2.value, 2000);
        
        // 測試多個空格和tab
        const component3 = parser.parseLine('R3\t1\t\t2\t\t\t3000');
        ctx.assert.equal(component3.name, 'R3');
        ctx.assert.equal(component3.value, 3000);
    });
    
    await ctx.test('Full netlist parsing', async () => {
        const netlist = `
        * Simple RC circuit
        * This is a test netlist
        
        VIN 1 0 DC(5)     ; Input voltage source
        R1  1 2 1000      ; First resistor  
        C1  2 0 1e-6      ; Capacitor to ground
        
        .tran 1us 10ms    ; Transient analysis
        .end              ; End of netlist
        `;
        
        const parser = new NetlistParser();
        const parsed = parser.parse(netlist);
        
        ctx.assert.equal(parsed.components.length, 3);
        ctx.assert.equal(parsed.analyses.length, 1);
        
        // 檢查元件
        const vin = parsed.components.find(c => c.name === 'VIN');
        ctx.assert.equal(vin.constructor.name, 'VoltageSource');
        ctx.assert.equal(vin.sourceConfig.dc, 5);
        
        const r1 = parsed.components.find(c => c.name === 'R1');
        ctx.assert.equal(r1.constructor.name, 'Resistor');
        ctx.assert.equal(r1.value, 1000);
        
        const c1 = parsed.components.find(c => c.name === 'C1');
        ctx.assert.equal(c1.constructor.name, 'Capacitor');
        ctx.assert.closeTo(c1.value, 1e-6, 1e-12);
        
        // 檢查分析
        ctx.assert.equal(parsed.analyses[0].type, 'TRAN');
        ctx.assert.equal(parsed.analyses[0].tstep, '1us');
        ctx.assert.equal(parsed.analyses[0].tstop, '10ms');
    });
    
    await ctx.test('Directive parsing', async () => {
        const parser = new NetlistParser();
        
        // 測試完整的網表解析來驗證指令
        const netlistWithDirectives = `
        VIN 1 0 DC(5)
        R1 1 0 1000
        .tran 1us 10ms
        .dc
        `;
        
        const result = parser.parse(netlistWithDirectives);
        
        ctx.assert.equal(result.analyses.length, 2);
        
        // 檢查 .tran 指令
        const tranAnalysis = result.analyses.find(a => a.type === 'TRAN');
        ctx.assert.isNotNull(tranAnalysis);
        ctx.assert.equal(tranAnalysis.tstep, '1us');
        ctx.assert.equal(tranAnalysis.tstop, '10ms');
        
        // 檢查 .dc 指令
        const dcAnalysis = result.analyses.find(a => a.type === 'DC');
        ctx.assert.isNotNull(dcAnalysis);
    });
    
    await ctx.test('Error handling - malformed lines', async () => {
        const parser = new NetlistParser();
        
        // 測試各種錯誤情況
        ctx.assert.throws(() => {
            parser.parseLine('R1');  // 缺少節點
        });
        
        ctx.assert.throws(() => {
            parser.parseLine('R1 1');  // 缺少第二個節點
        });
        
        ctx.assert.throws(() => {
            parser.parseLine('R1 1 2');  // 缺少數值
        });
        
        ctx.assert.throws(() => {
            parser.parseLine('R1 1 2 ABC');  // 無效數值
        });
        
        ctx.assert.throws(() => {
            parser.parseLine('X1 1 2 3');  // 不支援的元件類型
        });
    });
    
    await ctx.test('Case sensitivity', async () => {
        const parser = new NetlistParser();
        
        // 元件名稱和節點名稱應該保持原樣
        const component1 = parser.parseLine('r1 NodeA NodeB 1000');
        ctx.assert.equal(component1.name, 'r1');
        ctx.assert.equal(component1.nodes[0], 'NodeA');
        ctx.assert.equal(component1.nodes[1], 'NodeB');
        
        // 單位應該不區分大小寫
        const component2 = parser.parseLine('R2 1 2 1k');
        ctx.assert.equal(component2.value, 1000);
        
        const component3 = parser.parseLine('R3 1 2 1K');
        ctx.assert.equal(component3.value, 1000);
    });
    
    await ctx.test('Complex circuit netlist', async () => {
        const netlist = `
        * RLC resonant circuit with AC source
        * Frequency: 1 kHz, Resonant frequency calculation test
        
        VAC 1 0 SINE(0 10 1000)  ; 1kHz sine wave, 10V amplitude
        R1  1 2 100              ; Series resistance
        L1  2 3 10m              ; 10mH inductor  
        C1  3 0 2.533e-6         ; Capacitor for 1kHz resonance
        
        .tran 10us 5ms           ; 5 periods at 1kHz
        .end
        `;
        
        const parser = new NetlistParser();
        const parsed = parser.parse(netlist);
        
        ctx.assert.equal(parsed.components.length, 4);
        
        // 檢查AC源
        const vac = parsed.components.find(c => c.name === 'VAC');
        ctx.assert.equal(vac.sourceConfig.type, 'SINE');
        ctx.assert.equal(vac.sourceConfig.amplitude, 10);
        ctx.assert.equal(vac.sourceConfig.frequency, 1000);
        
        // 檢查電感
        const l1 = parsed.components.find(c => c.name === 'L1');
        ctx.assert.closeTo(l1.value, 10e-3, 1e-12);
        
        // 檢查電容
        const c1 = parsed.components.find(c => c.name === 'C1');
        ctx.assert.closeTo(c1.value, 2.533e-6, 1e-12);
        
        // 計算諧振頻率: f = 1/(2π√LC)
        const L = l1.value;
        const C = c1.value;
        const expectedResonantFreq = 1 / (2 * Math.PI * Math.sqrt(L * C));
        ctx.assert.closeTo(expectedResonantFreq, 1000, 50); // 允許5%誤差
    });
}