/**
 * 簡單的 Buck 轉換器診斷測試
 */

console.log('開始 Buck 轉換器診斷...');

try {
    // 測試基本模組導入
    console.log('1. 測試模組導入...');
    
    // 先測試 NetlistParser
    const { NetlistParser } = await import('./src/parser/netlist.js');
    console.log('   ✅ NetlistParser 導入成功');
    
    // 測試 AkingSPICE
    const { AkingSPICE } = await import('./src/core/solver.js');
    console.log('   ✅ AkingSPICE 導入成功');
    
    // 測試網表解析
    console.log('2. 測試網表解析...');
    const buckNetlist = `
* Buck Converter Test
VIN 1 0 DC 24V
M1 1 2 3 NMOS Ron=10m Vth=2V
D1 0 2 Vf=0.7 Ron=10m
L1 2 4 100uH
C1 4 0 220uF
RLOAD 4 0 5
VDRIVE 3 0 PULSE(0 15 0 10n 10n 5u 10u)
.TRAN 0.1u 10u
.END
`;

    const parser = new NetlistParser();
    const circuit = parser.parse(buckNetlist);
    
    console.log('   ✅ 網表解析成功');
    console.log(`   - 元件數量: ${circuit.components.length}`);
    console.log(`   - 分析數量: ${circuit.analyses.length}`);
    console.log(`   - 錯誤數量: ${circuit.stats.errors.length}`);
    
    // 列出所有元件
    console.log('3. 元件列表:');
    circuit.components.forEach((comp, i) => {
        console.log(`   ${i+1}. ${comp.name} (${comp.constructor.name}) - 節點: [${comp.nodes.join(', ')}]`);
    });
    
    // 檢查關鍵元件
    console.log('4. 檢查關鍵元件:');
    const mosfet = circuit.components.find(c => c.name === 'M1');
    const diode = circuit.components.find(c => c.name === 'D1');
    const vdrive = circuit.components.find(c => c.name === 'VDRIVE');
    
    if (mosfet) {
        console.log(`   ✅ MOSFET M1 找到:`);
        console.log(`      電路節點: [${mosfet.nodes.join(', ')}] (D-S)`);
        console.log(`      閘極節點: ${mosfet.gateNode}`);
        console.log(`      Ron=${mosfet.Ron}Ω, Vth=${mosfet.Vth}V`);
        console.log(`      類型=${mosfet.channelType}`);
    } else {
        console.log('   ❌ MOSFET M1 未找到');
    }
    
    if (diode) {
        console.log(`   ✅ 二極體 D1 找到 - Vf=${diode.Vf}V, Ron=${diode.Ron}Ω`);
    } else {
        console.log('   ❌ 二極體 D1 未找到');
    }
    
    if (vdrive) {
        console.log(`   ✅ 驅動源 VDRIVE 找到 - 類型: ${vdrive.sourceConfig?.type || '未知'}`);
        
        // 測試 PWM 波形
        console.log('5. 測試 PWM 波形:');
        for (let t = 0; t <= 15e-6; t += 2.5e-6) {
            const v = vdrive.getValue(t);
            console.log(`     t=${(t*1e6).toFixed(1)}µs: V=${v.toFixed(1)}V`);
        }
    } else {
        console.log('   ❌ 驅動源 VDRIVE 未找到');
    }
    
    console.log('\n診斷完成！');
    
} catch (error) {
    console.error('❌ 診斷失敗:', error.message);
    console.error(error.stack);
}