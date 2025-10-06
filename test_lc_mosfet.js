console.log('🔍 開始 LC + MOSFET 組合測試');

(async function() {
try {
    // 導入必要模組
    const { AkingSPICE } = await import('./src/core/solver.js');
    const { Resistor } = await import('./src/components/resistor.js');
    const { Inductor } = await import('./src/components/inductor.js');
    const { Capacitor } = await import('./src/components/capacitor.js');
    const { VoltageSource } = await import('./src/components/sources.js');
    const { MOSFET_MCP } = await import('./src/components/mosfet_mcp.js');

// 測試 1: LC + 始終導通 MOSFET
console.log('\n=== 測試 1: LC + 始終導通 MOSFET ===');
try {
    const circuit = new Circuit();
    
    // 基本 LC 電路 + MOSFET
    circuit.addComponent(new DCVoltageSource('V1', 'n1', 'gnd', 5.0));  // 5V 電源
    circuit.addComponent(new Inductor('L1', 'n1', 'n2', 1e-3));  // 1mH 電感
    circuit.addComponent(new Capacitor('C1', 'n2', 'gnd', 100e-6));  // 100µF 電容
    circuit.addComponent(new MOSFET_MCP('M1', 'n2', 'n_gate', 'gnd', { Vt: 1.0, beta: 0.1 }));
    
    // 閘極始終 5V (導通)
    circuit.addComponent(new DCVoltageSource('Vg', 'n_gate', 'gnd', 5.0));
    
    const analysis = new MCPTransientAnalysis(circuit, 100e-6, 10e-3);  // 100µs/step, 10ms total
    const result = analysis.run();
    console.log('✅ LC+MOS(始終導通) 成功');
} catch (error) {
    console.log('❌ LC+MOS(始終導通) 失敗:', error.message);
}

// 測試 2: LC + 始終關斷 MOSFET
console.log('\n=== 測試 2: LC + 始終關斷 MOSFET ===');
try {
    const circuit = new Circuit();
    
    circuit.addComponent(new DCVoltageSource('V1', 'n1', 'gnd', 5.0));  // 5V 電源
    circuit.addComponent(new Inductor('L1', 'n1', 'n2', 1e-3));  // 1mH 電感
    circuit.addComponent(new Capacitor('C1', 'n2', 'gnd', 100e-6));  // 100µF 電容
    circuit.addComponent(new MOSFET_MCP('M1', 'n2', 'n_gate', 'gnd', { Vt: 1.0, beta: 0.1 }));
    
    // 閘極始終 0V (關斷)
    circuit.addComponent(new DCVoltageSource('Vg', 'n_gate', 'gnd', 0.0));
    
    const analysis = new MCPTransientAnalysis(circuit, 100e-6, 10e-3);  // 100µs/step, 10ms total
    const result = analysis.run();
    console.log('✅ LC+MOS(始終關斷) 成功');
} catch (error) {
    console.log('❌ LC+MOS(始終關斷) 失敗:', error.message);
}

// 測試 3: LC + 慢速開關 MOSFET
console.log('\n=== 測試 3: LC + 慢速開關 MOSFET ===');
try {
    const circuit = new Circuit();
    
    circuit.addComponent(new DCVoltageSource('V1', 'n1', 'gnd', 5.0));  // 5V 電源
    circuit.addComponent(new Inductor('L1', 'n1', 'n2', 1e-3));  // 1mH 電感
    circuit.addComponent(new Capacitor('C1', 'n2', 'gnd', 100e-6));  // 100µF 電容
    circuit.addComponent(new MOSFET_MCP('M1', 'n2', 'n_gate', 'gnd', { Vt: 1.0, beta: 0.1 }));
    
    // 慢速 PWM: 100Hz
    circuit.addComponent(new PWMVoltageSource('Vpwm', 'n_gate', 'gnd', {
        amplitude: 5.0,
        frequency: 100,     // 100Hz
        dutyCycle: 0.5,
        offset: 0.0
    }));
    
    const analysis = new MCPTransientAnalysis(circuit, 100e-6, 20e-3);  // 100µs/step, 20ms total
    const result = analysis.run();
    console.log('✅ LC+MOS(慢速開關) 成功');
} catch (error) {
    console.log('❌ LC+MOS(慢速開關) 失敗:', error.message);
}

// 測試 4: LC + 快速開關 MOSFET
console.log('\n=== 測試 4: LC + 快速開關 MOSFET ===');
try {
    const circuit = new Circuit();
    
    circuit.addComponent(new DCVoltageSource('V1', 'n1', 'gnd', 5.0));  // 5V 電源
    circuit.addComponent(new Inductor('L1', 'n1', 'n2', 1e-3));  // 1mH 電感
    circuit.addComponent(new Capacitor('C1', 'n2', 'gnd', 100e-6));  // 100µF 電容
    circuit.addComponent(new MOSFET_MCP('M1', 'n2', 'n_gate', 'gnd', { Vt: 1.0, beta: 0.1 }));
    
    // 快速 PWM: 10kHz
    circuit.addComponent(new PWMVoltageSource('Vpwm', 'n_gate', 'gnd', {
        amplitude: 5.0,
        frequency: 10000,   // 10kHz
        dutyCycle: 0.5,
        offset: 0.0
    }));
    
    const analysis = new MCPTransientAnalysis(circuit, 5e-6, 1e-3);  // 5µs/step, 1ms total
    const result = analysis.run();
    console.log('✅ LC+MOS(快速開關) 成功');
} catch (error) {
    console.log('❌ LC+MOS(快速開關) 失敗:', error.message);
}

console.log('\n=== LC + MOSFET 測試總結 ===');
console.log('如果前三個測試成功但第四個失敗，說明問題出現在:');
console.log('1. 電感+電容+MOSFET 在高頻開關下的諧振問題');
console.log('2. LC 諧振頻率與 PWM 頻率的相互作用');
console.log('3. 電感伴隨模型在快速開關下的數值問題');
console.log('\n如果所有測試都失敗，說明 LC+MOSFET 組合存在根本性問題');

console.log('\n🏁 LC + MOSFET 測試完成');

} catch (error) {
    console.error('❌ 測試過程發生錯誤:', error.message);
}
})();