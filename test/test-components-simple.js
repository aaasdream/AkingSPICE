/**
 * 簡化的基礎組件功能測試
 */

console.log('🧪 基礎組件功能測試\n');

async function runBasicComponentTests() {
    let passed = 0;
    let total = 0;
    
    try {
        // 測試基本組件導入和實例化
        console.log('1. 測試電阻組件...');
        total++;
        const { Resistor } = await import('../src/components/resistor.js');
        const r1 = new Resistor('R1', ['n1', 'n2'], '1k');
        console.log(`   名稱: ${r1.name}, 類型: ${r1.type}, 值: ${r1.value}`);
        console.log('   ✅ 電阻測試通過');
        passed++;
        
        console.log('\n2. 測試電容組件...');
        total++;
        const { Capacitor } = await import('../src/components/capacitor.js');
        const c1 = new Capacitor('C1', ['n1', 'n2'], '1u', { ic: 0 });
        console.log(`   名稱: ${c1.name}, 類型: ${c1.type}, 值: ${c1.value}`);
        console.log('   ✅ 電容測試通過');
        passed++;
        
        console.log('\n3. 測試電感組件...');
        total++;
        const { Inductor } = await import('../src/components/inductor.js');
        const l1 = new Inductor('L1', ['n1', 'n2'], '1m', { ic: 0 });
        console.log(`   名稱: ${l1.name}, 類型: ${l1.type}, 值: ${l1.value}`);
        console.log('   ✅ 電感測試通過');
        passed++;
        
        console.log('\n4. 測試電壓源組件...');
        total++;
        const { VoltageSource } = await import('../src/components/sources.js');
        const v1 = new VoltageSource('V1', ['n1', 'n2'], 5);
        console.log(`   名稱: ${v1.name}, 類型: ${v1.type}, 值: ${v1.value}`);
        console.log('   ✅ 電壓源測試通過');
        passed++;
        
        console.log('\n5. 測試電流源組件...');
        total++;
        const { CurrentSource } = await import('../src/components/sources.js');
        const i1 = new CurrentSource('I1', ['n1', 'n2'], 0.001);
        console.log(`   名稱: ${i1.name}, 類型: ${i1.type}, 值: ${i1.value}`);
        console.log('   ✅ 電流源測試通過');
        passed++;
        
        console.log('\n6. 測試二極體組件...');
        total++;
        const { Diode } = await import('../src/components/diode.js');
        const d1 = new Diode('D1', ['anode', 'cathode']);
        console.log(`   名稱: ${d1.name}, 類型: ${d1.type}`);
        console.log('   ✅ 二極體測試通過');
        passed++;
        
        console.log('\n7. 測試MOSFET組件...');
        total++;
        const { MOSFET } = await import('../src/components/mosfet.js');
        const m1 = new MOSFET('M1', ['d', 'g', 's'], 'nmos');
        console.log(`   名稱: ${m1.name}, 類型: ${m1.type}`);
        console.log('   ✅ MOSFET測試通過');
        passed++;
        
        console.log('\n='.repeat(50));
        console.log(`基本組件測試: ${passed}/${total} 通過`);
        
        return passed === total;
        
    } catch (error) {
        console.log(`❌ 組件測試失敗: ${error.message}`);
        return false;
    }
}

async function testCircuitFunctionality() {
    console.log('\n🔧 測試電路功能...');
    
    try {
        // 導入求解器和組件
        const { ExplicitStateSolver } = await import('../src/core/explicit-state-solver.js');
        const { Resistor } = await import('../src/components/resistor.js');
        const { Capacitor } = await import('../src/components/capacitor.js');
        const { VoltageSource } = await import('../src/components/sources.js');
        
        // 創建RC電路
        const components = [
            new VoltageSource('V1', ['vin', 'gnd'], 5),
            new Resistor('R1', ['vin', 'vout'], '1k'),
            new Capacitor('C1', ['vout', 'gnd'], '1u', { ic: 0 })
        ];
        
        console.log('電路組件:');
        components.forEach((comp, i) => {
            console.log(`   ${i+1}. ${comp.name} (${comp.type}): ${comp.nodes.join(' - ')}`);
        });
        
        // 初始化求解器
        const solver = new ExplicitStateSolver();
        console.log('\n初始化求解器...');
        await solver.initialize(components, 1e-6, { debug: false });
        
        console.log('電路分析結果:');
        console.log(`   節點數: ${solver.circuitData.nodeCount}`);
        console.log(`   狀態變量數: ${solver.circuitData.stateCount}`);
        
        // 運行短時間仿真
        console.log('\n運行仿真...');
        const results = await solver.run(0, 1e-5);
        
        console.log(`   時間步數: ${results.timeVector.length}`);
        const finalTime = results.timeVector[results.timeVector.length-1];
        console.log(`   最終時間: ${(finalTime*1e6).toFixed(1)}μs`);
        
        if (results.stateVariables.has('C1')) {
            const finalVoltage = results.stateVariables.get('C1')[results.stateVariables.get('C1').length-1];
            console.log(`   C1最終電壓: ${finalVoltage.toFixed(4)}V`);
        }
        
        console.log('✅ 電路功能測試通過');
        return true;
        
    } catch (error) {
        console.log(`❌ 電路功能測試失敗: ${error.message}`);
        return false;
    }
}

// 執行測試
async function main() {
    const basicPass = await runBasicComponentTests();
    const circuitPass = await testCircuitFunctionality();
    
    console.log('\n' + '='.repeat(60));
    console.log('📋 總體測試結果');
    console.log('='.repeat(60));
    console.log(`基礎組件測試: ${basicPass ? '✅ 通過' : '❌ 失敗'}`);
    console.log(`電路功能測試: ${circuitPass ? '✅ 通過' : '❌ 失敗'}`);
    
    if (basicPass && circuitPass) {
        console.log('\n🎊 所有測試通過！AkingSpice基礎組件運行正常！');
        process.exit(0);
    } else {
        console.log('\n⚠️ 部分測試失敗，需要進一步檢查');
        process.exit(1);
    }
}

main().catch(error => {
    console.error(`測試執行失敗: ${error.message}`);
    process.exit(1);
});