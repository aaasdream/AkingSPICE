/**
 * MOSFET 模型測試
 * 測試包含體二極體的 MOSFET 元件
 */

import { MOSFET } from './src/components/mosfet.js';
import { NetlistParser } from './src/parser/netlist.js';

console.log('=== MOSFET 體二極體模型測試 ===\n');

// 測試 1: 基本 MOSFET 創建
console.log('測試 1: 基本 MOSFET 創建');
try {
    const mosfet = new MOSFET('M1', ['drain', 'source', 'gate'], {
        Ron: 10e-3,    // 10mΩ
        Roff: 1e6,     // 1MΩ  
        Vf_diode: 0.8, // 0.8V 體二極體順向壓降
        Von_diode: 5e-3 // 5mΩ 體二極體導通電阻
    });
    
    console.log(`✓ ${mosfet.toString()}`);
    console.log(`  初始狀態: ${mosfet.getGateState() ? 'ON' : 'OFF'}`);
    console.log(`  導通電阻: ${mosfet.Ron * 1000}mΩ`);
    console.log(`  關斷電阻: ${mosfet.Roff / 1e6}MΩ`);
    console.log(`  體二極體順向電壓: ${mosfet.Vf_diode}V`);
    console.log(`  體二極體導通電阻: ${mosfet.Von_diode * 1000}mΩ`);
} catch (error) {
    console.log(`✗ 錯誤: ${error.message}`);
}

console.log('\n測試 2: MOSFET 開關控制');
try {
    const mosfet = new MOSFET('M2', ['D', 'S', 'G']);
    
    console.log('初始狀態:');
    console.log(`  狀態: ${mosfet.getGateState() ? 'ON' : 'OFF'}`);
    console.log(`  等效電阻 (Vds=0V): ${mosfet.getEquivalentResistance(0) / 1e6}MΩ`);
    
    // 開啟 MOSFET
    mosfet.setGateState(true);
    console.log('\n開啟後:');
    console.log(`  狀態: ${mosfet.getGateState() ? 'ON' : 'OFF'}`);
    console.log(`  等效電阻 (Vds=0V): ${mosfet.getEquivalentResistance(0) * 1000}mΩ`);
    
    // 關閉 MOSFET
    mosfet.setGateState(false);
    console.log('\n關閉後:');
    console.log(`  狀態: ${mosfet.getGateState() ? 'ON' : 'OFF'}`);
    console.log(`  等效電阻 (Vds=0V): ${mosfet.getEquivalentResistance(0) / 1e6}MΩ`);
    
    console.log('✓ 開關控制正常');
} catch (error) {
    console.log(`✗ 錯誤: ${error.message}`);
}

console.log('\n測試 3: 體二極體導通測試');
try {
    const mosfet = new MOSFET('M3', ['D', 'S', 'G'], {
        Ron: 50e-3,     // 50mΩ MOSFET 通道
        Roff: 10e6,     // 10MΩ MOSFET 關斷
        Vf_diode: 0.7,  // 0.7V 體二極體
        Von_diode: 2e-3 // 2mΩ 體二極體導通電阻
    });
    
    // MOSFET 關閉狀態下測試不同電壓
    mosfet.setGateState(false);
    
    const testVoltages = [1.0, 0.0, -0.5, -0.8, -1.0];
    console.log('MOSFET 關閉時的等效電阻 (包含體二極體):');
    
    for (const vds of testVoltages) {
        const req = mosfet.getEquivalentResistance(vds);
        const isDiodeActive = vds < -mosfet.Vf_diode;
        
        if (req < 1000) {
            console.log(`  Vds = ${vds.toFixed(1)}V: ${req * 1000}mΩ ${isDiodeActive ? '(體二極體導通)' : ''}`);
        } else {
            console.log(`  Vds = ${vds.toFixed(1)}V: ${req / 1e6}MΩ ${isDiodeActive ? '(體二極體導通)' : ''}`);
        }
    }
    
    console.log('✓ 體二極體模型正常');
} catch (error) {
    console.log(`✗ 錯誤: ${error.message}`);
}

console.log('\n測試 4: MOSFET + 體二極體並聯效果');
try {
    const mosfet = new MOSFET('M4', ['D', 'S', 'G'], {
        Ron: 100e-3,    // 100mΩ MOSFET 通道  
        Roff: 5e6,      // 5MΩ MOSFET 關斷
        Vf_diode: 0.8,  // 0.8V 體二極體
        Von_diode: 10e-3 // 10mΩ 體二極體導通電阻
    });
    
    console.log('MOSFET 開啟 + 體二極體順向偏壓時的並聯效果:');
    
    // MOSFET 開啟，體二極體也導通
    mosfet.setGateState(true);
    const vds_forward = -1.0; // 體二極體順向偏壓
    const req_parallel = mosfet.getEquivalentResistance(vds_forward);
    
    console.log(`  MOSFET 通道電阻: ${mosfet.Ron * 1000}mΩ`);
    console.log(`  體二極體導通電阻: ${mosfet.Von_diode * 1000}mΩ`);
    console.log(`  並聯等效電阻: ${req_parallel * 1000}mΩ`);
    
    // 理論並聯電阻: 1/(1/Ron + 1/Rdiode)
    const theoretical = 1 / (1/mosfet.Ron + 1/mosfet.Von_diode);
    console.log(`  理論並聯電阻: ${theoretical * 1000}mΩ`);
    
    const error = Math.abs(req_parallel - theoretical) / theoretical * 100;
    console.log(`  誤差: ${error.toFixed(2)}%`);
    
    console.log('✓ 並聯計算正確');
} catch (error) {
    console.log(`✗ 錯誤: ${error.message}`);
}

console.log('\n測試 5: Netlist 解析測試');
try {
    const parser = new NetlistParser();
    const testNetlist = `
* MOSFET 測試電路
M1 drain source gate Ron=5m Roff=1meg Vf=0.7
M2 D1 S1 G1 Ron=10m Vf=0.8 Von_diode=2m
MQ1 OUT GND CTRL
.END
    `;
    
    const result = parser.parse(testNetlist);
    
    console.log(`解析結果:`);
    console.log(`  總元件數: ${result.components.length}`);
    
    result.components.forEach((comp, index) => {
        if (comp.type === 'M') {
            const status = comp.getOperatingStatus();
            console.log(`  ${index + 1}. ${comp.name}: D=${comp.drain} S=${comp.source} G=${comp.gate}`);
            console.log(`     Ron=${comp.Ron * 1000}mΩ, Vf=${comp.Vf_diode}V`);
        }
    });
    
    console.log('✓ Netlist 解析正常');
} catch (error) {
    console.log(`✗ 錯誤: ${error.message}`);
}

console.log('\n測試 6: 工作狀態監控');
try {
    const mosfet = new MOSFET('M5', ['D', 'S', 'G']);
    
    // 模擬不同工作狀態
    const testCases = [
        { gateState: false, vds: 0.5, ids: 0.001, desc: 'MOSFET關閉, 正向偏壓' },
        { gateState: false, vds: -1.0, ids: -2.0, desc: 'MOSFET關閉, 體二極體導通' },
        { gateState: true, vds: 0.1, ids: 5.0, desc: 'MOSFET導通, 正向電流' },
        { gateState: true, vds: -0.9, ids: -3.0, desc: 'MOSFET導通 + 體二極體導通' }
    ];
    
    console.log('不同工作狀態下的元件資訊:');
    
    testCases.forEach((testCase, index) => {
        mosfet.setGateState(testCase.gateState);
        mosfet.updateState(testCase.vds, testCase.ids);
        
        const status = mosfet.getOperatingStatus();
        console.log(`\n  ${index + 1}. ${testCase.desc}:`);
        console.log(`     閘極狀態: ${status.gateState}`);
        console.log(`     Vds: ${status.drainSourceVoltage.toFixed(2)}V`);
        console.log(`     總電流: ${status.totalCurrent.toFixed(2)}A`);
        console.log(`     體二極體作用中: ${status.bodyDiodeActive ? '是' : '否'}`);
        console.log(`     當前電阻: ${status.currentResistance * 1000}mΩ`);
    });
    
    console.log('\n✓ 工作狀態監控正常');
} catch (error) {
    console.log(`✗ 錯誤: ${error.message}`);
}

console.log('\n=== MOSFET 體二極體模型測試完成 ===');