/**
 * 修正的組件功能測試
 * 測試所有基礎組件的正確屬性和功能
 */

console.log('🧪 基礎組件功能測試\n');

async function testComponent(name, createComponent, expectedProperties) {
    try {
            console.log('仿真測試:');
        console.log(`   時間步數: ${results.timeVector.length}`);
        console.log(`   最終時間: ${(results.timeVector[results.timeVector.length-1]*1e6).toFixed(1)}μs`);
        
        if (results.stateVariables.has('C1')) {
            const finalVoltage = results.stateVariables.get('C1')[results.stateVariables.get('C1').length-1];
            console.log(`   C1最終電壓: ${finalVoltage.toFixed(4)}V`);
        }
        
        console.log('✅ 電路集成測試成功！');e.log(`測試 ${name}...`);
        
        const component = createComponent();
        console.log(`✅ ${name} 實例化成功`);
        
        // 檢查基本屬性
        console.log(`   名稱: ${component.name}`);
        console.log(`   類型: ${component.type}`);
        console.log(`   節點: [${component.nodes.join(', ')}]`);
        console.log(`   值: ${component.value}`);
        
        // 檢查特定屬性
        for (const prop of expectedProperties) {
            if (component.hasOwnProperty(prop)) {
                console.log(`   ${prop}: ${component[prop]}`);
            } else {
                console.log(`   ${prop}: (未定義)`);
            }
        }
        
        // 測試preprocess方法（如果存在）
        if (typeof component.preprocess === 'function') {
            console.log(`   preprocess方法: ✅ 存在`);
        } else {
            console.log(`   preprocess方法: ❌ 缺失`);
        }
        
        console.log('');
        return true;
    } catch (error) {
        console.log(`❌ ${name} 測試失敗: ${error.message}\n`);
        return false;
    }
}

async function runTests() {
    let passed = 0;
    let total = 0;
    
    // 導入組件
    const { Resistor } = await import('../src/components/resistor.js');
    const { Capacitor } = await import('../src/components/capacitor.js');  
    const { Inductor } = await import('../src/components/inductor.js');
    const { VoltageSource, CurrentSource } = await import('../src/components/sources.js');
    const { Diode } = await import('../src/components/diode.js');
    const { MOSFET } = await import('../src/components/mosfet.js');
    
    // 測試電阻
    total++;
    if (await testComponent('電阻 (Resistor)', 
        () => new Resistor('R1', ['n1', 'n2'], '1k'),
        ['value', 'tc1', 'tc2', 'actualValue'])) {
        passed++;
    }
    
    // 測試電容
    total++;  
    if (await testComponent('電容 (Capacitor)',
        () => new Capacitor('C1', ['n1', 'n2'], '1u', { ic: 0 }),
        ['value', 'initialCondition', 'polarity'])) {
        passed++;
    }
    
    // 測試電感
    total++;
    if (await testComponent('電感 (Inductor)',
        () => new Inductor('L1', ['n1', 'n2'], '1m', { ic: 0 }),
        ['value', 'initialCondition', 'coupling'])) {
        passed++;
    }
    
    // 測試DC電壓源
    total++;
    if (await testComponent('DC電壓源 (VoltageSource)',
        () => new VoltageSource('V1', ['n1', 'n2'], 5),
        ['value', 'waveform', 'internalResistance'])) {
        passed++;
    }
    
    // 測試AC電壓源  
    total++;
    if (await testComponent('AC電壓源 (VoltageSource)',
        () => new VoltageSource('V2', ['n1', 'n2'], {
            type: 'sin',
            amplitude: 10,
            frequency: 1000,
            phase: 0
        }),
        ['value', 'waveform', 'amplitude', 'frequency'])) {
        passed++;
    }
    
    // 測試電流源
    total++;
    if (await testComponent('電流源 (CurrentSource)',
        () => new CurrentSource('I1', ['n1', 'n2'], 0.001),
        ['value', 'waveform', 'internalConductance'])) {
        passed++;
    }
    
    // 測試二極體
    total++;
    if (await testComponent('二極體 (Diode)',
        () => new Diode('D1', ['anode', 'cathode']),
        ['model', 'temperature', 'area'])) {
        passed++;
    }
    
    // 測試MOSFET
    total++;
    if (await testComponent('MOSFET',
        () => new MOSFET('M1', ['drain', 'gate', 'source'], 'nmos'),
        ['deviceType', 'model', 'width', 'length'])) {
        passed++;
    }
    
    console.log('='.repeat(50));
    console.log(`📊 測試結果: ${passed}/${total} 通過 (${(passed/total*100).toFixed(1)}%)`);
    
    if (passed === total) {
        console.log('🎉 所有基礎組件測試通過！');
        return true;
    } else {
        console.log(`⚠️  ${total - passed} 個組件測試失敗`);
        return false;
    }
}

// 現在測試一個完整的電路
async function testCircuitIntegration() {
    console.log('\n🔧 測試電路集成功能...');
    
    try {
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
        
        console.log('電路組件創建成功:');
        components.forEach(comp => {
            console.log(`   ${comp.name} (${comp.type}): ${comp.nodes.join(' ↔ ')}, 值=${comp.value}`);
        });
        
        // 測試求解器初始化
        const solver = new ExplicitStateSolver();
        await solver.initialize(components, 1e-6, { debug: false });
        
        console.log('\n電路預處理結果:');
        console.log(`   節點數: ${solver.circuitData.nodeCount}`);
        console.log(`   狀態變量數: ${solver.circuitData.stateCount}`);
        console.log(`   節點名稱: [${solver.circuitData.nodeNames.join(', ')}]`);
        
        // 快速仿真測試
        const results = await solver.run(0, 1e-5);
        console.log(`\n仿真測試:');
        console.log(`   時間步數: ${results.timeVector.length}`);
        console.log(`   最終時間: ${(results.timeVector[results.timeVector.length-1]*1e6).toFixed(1)}μs`);
        
        if (results.stateVariables.has('C1')) {
            const finalVoltage = results.stateVariables.get('C1')[results.stateVariables.get('C1').length-1];
            console.log(`   C1最終電壓: ${finalVoltage.toFixed(4)}V`);
        }
        
        console.log('✅ 電路集成測試成功！');
        return true;
        
    } catch (error) {
        console.log(`❌ 電路集成測試失敗: ${error.message}`);
        return false;
    }
}

// 執行所有測試
runTests()
    .then(async (basicTestsPass) => {
        const integrationPass = await testCircuitIntegration();
        
        console.log('\n' + '='.repeat(60));
        console.log('📋 總體測試結果');
        console.log('='.repeat(60));
        console.log(`基礎組件測試: ${basicTestsPass ? '✅' : '❌'}`);
        console.log(`電路集成測試: ${integrationPass ? '✅' : '❌'}`);
        
        if (basicTestsPass && integrationPass) {
            console.log('\n🎊 所有測試通過！AkingSpice基礎組件運行正常！');
            process.exit(0);
        } else {
            console.log('\n⚠️  部分測試失敗，需要進一步檢查');
            process.exit(1);
        }
    })
    .catch(error => {
        console.error(`❌ 測試執行失敗: ${error.message}`);
        process.exit(1);
    });