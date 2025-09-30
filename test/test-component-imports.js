/**
 * 快速組件導入測試
 * 檢查所有組件是否能正確導入
 */

console.log('🔍 檢查組件導入...\n');

const imports = [
    { name: 'BaseComponent', path: '../src/components/base.js' },
    { name: 'Resistor', path: '../src/components/resistor.js' },
    { name: 'Capacitor', path: '../src/components/capacitor.js' },
    { name: 'Inductor', path: '../src/components/inductor.js' },
    { name: 'VoltageSource', path: '../src/components/sources.js' },
    { name: 'CurrentSource', path: '../src/components/sources.js' },
    { name: 'Diode', path: '../src/components/diode.js' },
    { name: 'MOSFET', path: '../src/components/mosfet.js' }
];

let successCount = 0;
let totalCount = imports.length;

for (const imp of imports) {
    try {
        console.log(`導入 ${imp.name} 從 ${imp.path}...`);
        const module = await import(imp.path);
        
        if (module[imp.name]) {
            console.log(`✅ ${imp.name} 導入成功`);
            
            // 嘗試創建實例（基本測試）
            if (imp.name === 'BaseComponent') {
                // BaseComponent是抽象類，跳過實例化
                console.log(`   (抽象類，跳過實例化)`);
            } else if (imp.name === 'Resistor') {
                const r = new module[imp.name]('R1', ['n1', 'n2'], 1000);
                console.log(`   實例化成功: ${r.name}, 阻值=${r.resistance}Ω`);
            } else if (imp.name === 'Capacitor') {
                const c = new module[imp.name]('C1', ['n1', 'n2'], 1e-6);
                console.log(`   實例化成功: ${c.name}, 容值=${c.capacitance}F`);
            } else if (imp.name === 'Inductor') {
                const l = new module[imp.name]('L1', ['n1', 'n2'], 1e-3);
                console.log(`   實例化成功: ${l.name}, 感值=${l.inductance}H`);
            } else if (imp.name === 'VoltageSource') {
                const v = new module[imp.name]('V1', ['n1', 'n2'], 5);
                console.log(`   實例化成功: ${v.name}, 電壓=${v.value}V`);
            } else if (imp.name === 'CurrentSource') {
                const i = new module[imp.name]('I1', ['n1', 'n2'], 0.001);
                console.log(`   實例化成功: ${i.name}, 電流=${i.value}A`);
            } else if (imp.name === 'Diode') {
                const d = new module[imp.name]('D1', ['n1', 'n2']);
                console.log(`   實例化成功: ${d.name}, 類型=${d.type}`);
            } else if (imp.name === 'MOSFET') {
                const m = new module[imp.name]('M1', ['d', 'g', 's'], 'nmos');
                console.log(`   實例化成功: ${m.name}, 類型=${m.deviceType}`);
            } else {
                console.log(`   (跳過實例化測試)`);
            }
            
            successCount++;
        } else {
            console.log(`❌ ${imp.name} 未在模塊中找到`);
        }
    } catch (error) {
        console.log(`❌ ${imp.name} 導入失敗: ${error.message}`);
    }
    console.log('');
}

console.log(`\n📊 導入測試結果: ${successCount}/${totalCount} 成功`);

if (successCount === totalCount) {
    console.log('🎉 所有基礎組件導入正常！');
    
    // 測試一個簡單的電路
    console.log('\n🔧 測試簡單電路創建...');
    try {
        const { Resistor } = await import('../src/components/resistor.js');
        const { Capacitor } = await import('../src/components/capacitor.js');
        const { VoltageSource } = await import('../src/components/sources.js');
        
        const components = [
            new VoltageSource('V1', ['vin', 'gnd'], 5),
            new Resistor('R1', ['vin', 'vout'], '1k'),
            new Capacitor('C1', ['vout', 'gnd'], '1u')
        ];
        
        console.log('電路組件：');
        components.forEach(comp => {
            console.log(`  ${comp.name} (${comp.type}): ${comp.nodes.join(' - ')}`);
        });
        
        console.log('✅ 電路創建成功！');
        
    } catch (error) {
        console.log(`❌ 電路創建失敗: ${error.message}`);
    }
    
} else {
    console.log('❌ 部分組件導入失敗，需要檢查組件代碼');
    process.exit(1);
}