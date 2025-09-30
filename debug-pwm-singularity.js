/**
 * 簡單PWM測試 - 修正版:正確更新閘極電壓
 */

import { AkingSPICE, VoltageSource, Resistor, VoltageControlledMOSFET } from './src/index.js';

console.log('=== PWM 閘極電壓更新修正測試 ===\n');

const solver = new AkingSPICE();

async function testSimplePWMFixed() {
    console.log('[1] 測試修正後的電壓控制MOSFET電路...');
    
    solver.reset();
    solver.components = [
        new VoltageSource('Vdd', ['vdd', '0'], 12),
        new VoltageSource('Vgate', ['gate', '0'], 0), // 閘極電壓源
        new VoltageControlledMOSFET('Q1', ['out', 'gate', '0'], { // 修正：drain=out, gate=gate, source=GND
            Vth: 2.0,
            Kp: 100e-6,
            W: 100e-6,
            L: 10e-6,
            Ron: 0.1, 
            Roff: 1e8 
        }),
        new Resistor('Rload', ['vdd', 'out'], 100) // 修正：從Vdd到out的負載電阻
    ];
    solver.isInitialized = true;
    
    try {
        const success = await solver.initSteppedTransient({
            stopTime: 1e-6,
            timeStep: 1e-8
        });
        
        if (success) {
            console.log('✅ 電路初始化成功！\n');
            
            // 測試不同閘極電壓
            const testVoltages = [0, 1, 2.5, 5, 0];
            
            for (let i = 0; i < testVoltages.length; i++) {
                const gate_voltage = testVoltages[i];
                
                // 🔥 關鍵修正:手動構造包含閘極電壓的節點電壓Map
                const mockNodeVoltages = new Map([
                    ['vdd', 12],
                    ['gate', gate_voltage],
                    ['out', gate_voltage > 2.0 ? 6 : 0], // 更好的初始猜測
                    ['0', 0]
                ]);
                
                // 🔥 在step之前,先用模擬的節點電壓更新MOSFET狀態
                const mosfet = solver.components.find(c => c.name === 'Q1');
                if (mosfet && mosfet.updateVoltages) {
                    mosfet.updateVoltages(mockNodeVoltages);
                    console.log(`  [預更新] Vg=${gate_voltage}V → MOSFET: Vgs=${mosfet.Vgs.toFixed(3)}V, Region=${mosfet.operatingRegion}, R=${mosfet.getEquivalentResistance().toExponential(2)}Ω`);
                }
                
                // 更新閘極電壓源
                const gateSource = solver.components.find(c => c.name === 'Vgate');
                if (gateSource) {
                    if (gateSource.sourceConfig) {
                        gateSource.sourceConfig.dc = gate_voltage;
                        gateSource.sourceConfig.amplitude = gate_voltage;
                        gateSource.sourceConfig.offset = gate_voltage;
                    }
                    gateSource.value = gate_voltage;
                    gateSource.dc = gate_voltage;
                }
                
                // 執行一步仿真
                const result = solver.step({});
                
                if (result) {
                    const out_voltage = solver.getVoltage('out');
                    const vdd_voltage = solver.getVoltage('vdd');
                    const gate_voltage_actual = solver.getVoltage('gate');
                    
                    console.log(`  [仿真後] Vdd=${vdd_voltage.toFixed(3)}V, Vg=${gate_voltage_actual.toFixed(3)}V, Vout=${out_voltage.toFixed(3)}V`);
                    
                    if (mosfet) {
                        const vds = mosfet.Vds || 0;
                        const id = mosfet.Id || 0;
                        console.log(`             MOSFET: Vgs=${mosfet.Vgs.toFixed(3)}V, Vds=${vds.toFixed(3)}V, Region=${mosfet.operatingRegion}`);
                        console.log(`             Id=${id.toExponential(3)}A, R=${mosfet.getEquivalentResistance().toExponential(2)}Ω\n`);
                    }
                } else {
                    console.log(`  ❌ 步驟${i}: 仿真失敗\n`);
                    break;
                }
            }
            
            console.log('✅ 測試完成!');
        } else {
            console.log('❌ 電路初始化失敗');
        }
    } catch (error) {
        console.log(`❌ 錯誤: ${error.message}`);
        console.log(error.stack);
    }
}

async function testWithoutMOSFET() {
    console.log('\n[2] 測試不含MOSFET的簡單電路...');
    
    solver.reset();
    solver.components = [
        new VoltageSource('Vdd', ['vdd', '0'], 12),
        new Resistor('R1', ['vdd', 'out'], 100),
        new Resistor('R2', ['out', '0'], 100)
    ];
    solver.isInitialized = true;
    
    try {
        const success = await solver.initSteppedTransient({
            stopTime: 1e-6,
            timeStep: 1e-8
        });
        
        if (success) {
            console.log('✅ 簡單分壓電路初始化成功');
            const result = solver.step({});
            if (result) {
                const out_voltage = solver.getVoltage('out');
                console.log(`  輸出電壓: ${out_voltage.toFixed(3)}V (理論值: 6.0V)`);
            }
        } else {
            console.log('❌ 簡單電路也初始化失敗');
        }
    } catch (error) {
        console.log(`❌ 錯誤: ${error.message}`);
    }
}

// 運行測試
async function runTests() {
    await testSimplePWMFixed();
    await testWithoutMOSFET();
}

runTests();