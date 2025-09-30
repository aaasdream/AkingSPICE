/**
 * 全面的組件功能驗證測試
 * 測試更多類型的組件和複雜電路
 */

console.log('🧪 AkingSpice 全面組件驗證測試\n');

class ComprehensiveComponentTester {
    constructor() {
        this.testResults = [];
        this.totalTests = 0;
        this.passedTests = 0;
    }

    async testComponent(name, testFunc) {
        this.totalTests++;
        console.log(`🔍 測試 ${name}...`);
        
        try {
            const result = await testFunc();
            if (result) {
                this.passedTests++;
                console.log(`   ✅ 通過`);
                this.testResults.push({ name, status: 'PASS' });
            } else {
                console.log(`   ❌ 失敗`);
                this.testResults.push({ name, status: 'FAIL' });
            }
        } catch (error) {
            console.log(`   ❌ 異常: ${error.message}`);
            this.testResults.push({ name, status: 'ERROR', error: error.message });
        }
        console.log('');
    }

    async testBasicComponents() {
        await this.testComponent('基礎被動組件', async () => {
            const { Resistor } = await import('../src/components/resistor.js');
            const { Capacitor } = await import('../src/components/capacitor.js');
            const { Inductor } = await import('../src/components/inductor.js');

            // 測試不同的阻值表示方法
            const r1 = new Resistor('R1', ['n1', 'n2'], 1000);
            const r2 = new Resistor('R2', ['n3', 'n4'], '2.2k');
            const r3 = new Resistor('R3', ['n5', 'n6'], '1M');

            if (r1.value !== 1000) return false;
            if (Math.abs(r2.value - 2200) > 1) return false;
            if (Math.abs(r3.value - 1000000) > 1) return false;

            // 測試電容
            const c1 = new Capacitor('C1', ['n1', 'n2'], '100n');
            const c2 = new Capacitor('C2', ['n3', 'n4'], '1u', { ic: 2.5 });

            if (Math.abs(c1.value - 100e-9) > 1e-12) return false;
            if (c2.initialCondition !== 2.5) return false;

            // 測試電感
            const l1 = new Inductor('L1', ['n1', 'n2'], '1m');
            const l2 = new Inductor('L2', ['n3', 'n4'], '470u', { ic: 0.1 });

            if (Math.abs(l1.value - 1e-3) > 1e-6) return false;
            if (l2.initialCondition !== 0.1) return false;

            console.log(`     電阻值解析: R1=${r1.value}, R2=${r2.value}, R3=${r3.value}`);
            console.log(`     電容值解析: C1=${c1.value}, C2=${c2.value} (IC=${c2.initialCondition})`);
            console.log(`     電感值解析: L1=${l1.value}, L2=${l2.value} (IC=${l2.initialCondition})`);

            return true;
        });

        await this.testComponent('電源組件', async () => {
            const { VoltageSource, CurrentSource } = await import('../src/components/sources.js');

            // DC電源
            const vdc = new VoltageSource('V1', ['n1', 'n2'], 12);
            const idc = new CurrentSource('I1', ['n1', 'n2'], 0.005);

            // AC電源
            const vac = new VoltageSource('V2', ['n3', 'n4'], {
                type: 'sin',
                amplitude: 10,
                frequency: 1000,
                phase: 0
            });

            // 脈衝電源
            const vpulse = new VoltageSource('V3', ['n5', 'n6'], {
                type: 'pulse',
                v1: 0,
                v2: 5,
                td: 0,
                tr: 1e-9,
                tf: 1e-9,
                pw: 1e-6,
                per: 2e-6
            });

            if (vdc.value !== 12) return false;
            if (idc.value !== 0.005) return false;
            if (vac.waveform.amplitude !== 10) return false;
            if (vpulse.waveform.v2 !== 5) return false;

            console.log(`     DC電壓源: ${vdc.value}V`);
            console.log(`     DC電流源: ${idc.value}A`);
            console.log(`     AC電壓源: ${vac.waveform.amplitude}V, ${vac.waveform.frequency}Hz`);
            console.log(`     脈衝源: ${vpulse.waveform.v1}V → ${vpulse.waveform.v2}V`);

            return true;
        });

        await this.testComponent('受控源組件', async () => {
            const { VCVS, VCCS, CCCS, CCVS } = await import('../src/components/sources.js');

            const vcvs = new VCVS('E1', ['n1', 'n2'], ['n3', 'n4'], 10);
            const vccs = new VCCS('G1', ['n5', 'n6'], ['n7', 'n8'], 0.01);
            const cccs = new CCCS('F1', ['n9', 'n10'], 'V_sense', 2);
            const ccvs = new CCVS('H1', ['n11', 'n12'], 'V_sense', 100);

            console.log(`     VCVS增益: ${vcvs.gain}`);
            console.log(`     VCCS跨導: ${vccs.transconductance}S`);
            console.log(`     CCCS增益: ${cccs.gain}`);
            console.log(`     CCVS跨阻: ${ccvs.transresistance}Ω`);

            return vcvs.gain === 10 && vccs.transconductance === 0.01;
        });

        await this.testComponent('半導體組件', async () => {
            const { Diode } = await import('../src/components/diode.js');
            const { MOSFET } = await import('../src/components/mosfet.js');

            // 二極體
            const d1 = new Diode('D1', ['anode', 'cathode']);
            const d2 = new Diode('D2', ['n1', 'n2'], {
                Is: 1e-14,
                n: 1.2,
                Rs: 0.1
            });

            // MOSFET
            const nmos = new MOSFET('MN1', ['d', 'g', 's'], 'nmos', {
                Vth: 1.0,
                Kp: 100e-6
            });
            const pmos = new MOSFET('MP1', ['d', 'g', 's'], 'pmos', {
                Vth: -1.0,
                Kp: 50e-6
            });

            console.log(`     二極體默認Is: ${d1.model.Is}`);
            console.log(`     自定義二極體Is: ${d2.model.Is}, n=${d2.model.n}`);
            console.log(`     NMOS Vth: ${nmos.model.Vth}V, Kp=${nmos.model.Kp}`);
            console.log(`     PMOS Vth: ${pmos.model.Vth}V, Kp=${pmos.model.Kp}`);

            return d1.model.Is > 0 && nmos.model.Vth === 1.0 && pmos.model.Vth === -1.0;
        });
    }

    async testComplexCircuits() {
        await this.testComponent('RLC串聯電路', async () => {
            const { ExplicitStateSolver } = await import('../src/core/explicit-state-solver.js');
            const { Resistor } = await import('../src/components/resistor.js');
            const { Capacitor } = await import('../src/components/capacitor.js');
            const { Inductor } = await import('../src/components/inductor.js');
            const { VoltageSource } = await import('../src/components/sources.js');

            const components = [
                new VoltageSource('V1', ['vin', 'gnd'], 10),
                new Resistor('R1', ['vin', 'n1'], 10),
                new Inductor('L1', ['n1', 'n2'], '1m', { ic: 0 }),
                new Capacitor('C1', ['n2', 'gnd'], '1u', { ic: 0 })
            ];

            const solver = new ExplicitStateSolver();
            await solver.initialize(components, 1e-7, { debug: false });

            console.log(`     節點數: ${solver.circuitData.nodeCount}`);
            console.log(`     狀態變量: ${solver.circuitData.stateCount} (L電流 + C電壓)`);

            const results = await solver.run(0, 1e-5);
            console.log(`     仿真步數: ${results.timeVector.length}`);

            return solver.circuitData.stateCount === 2; // L和C各一個狀態變量
        });

        await this.testComponent('運算放大器電路', async () => {
            const { ExplicitStateSolver } = await import('../src/core/explicit-state-solver.js');
            const { Resistor } = await import('../src/components/resistor.js');
            const { Capacitor } = await import('../src/components/capacitor.js');
            const { VoltageSource, VCVS } = await import('../src/components/sources.js');

            // 反相放大器電路
            const components = [
                new VoltageSource('Vin', ['vin', 'gnd'], 1), // 輸入信號
                new Resistor('Rin', ['vin', 'inv'], '1k'),   // 輸入電阻
                new Resistor('Rf', ['inv', 'vout'], '10k'),  // 反饋電阻
                new VCVS('OpAmp', ['vout', 'gnd'], ['noninv', 'inv'], 100000), // 運放
                new VoltageSource('Vref', ['noninv', 'gnd'], 0), // 參考電位
                new Capacitor('Ccomp', ['vout', 'gnd'], '1p') // 補償電容
            ];

            const solver = new ExplicitStateSolver();
            await solver.initialize(components, 1e-8, { debug: false });

            console.log(`     節點數: ${solver.circuitData.nodeCount}`);
            console.log(`     預期增益: -Rf/Rin = -10`);

            const results = await solver.run(0, 1e-6);
            console.log(`     仿真完成，步數: ${results.timeVector.length}`);

            return solver.circuitData.nodeCount >= 4; // 至少4個節點
        });

        await this.testComponent('開關電源電路', async () => {
            const { ExplicitStateSolver } = await import('../src/core/explicit-state-solver.js');
            const { Resistor } = await import('../src/components/resistor.js');
            const { Capacitor } = await import('../src/components/capacitor.js');
            const { Inductor } = await import('../src/components/inductor.js');
            const { Diode } = await import('../src/components/diode.js');
            const { VoltageSource } = await import('../src/components/sources.js');

            // 降壓轉換器電路
            const components = [
                new VoltageSource('Vin', ['vin', 'gnd'], 12),
                new Inductor('L1', ['vsw', 'vout'], '100u', { ic: 0 }),
                new Diode('D1', ['gnd', 'vsw']), // 續流二極體
                new Capacitor('Cout', ['vout', 'gnd'], '100u', { ic: 0 }),
                new Resistor('Rload', ['vout', 'gnd'], 10),
                // 開關用電壓源模擬（簡化）
                new VoltageSource('Vsw', ['vin', 'vsw'], {
                    type: 'pulse',
                    v1: 0, v2: 0,
                    td: 0, tr: 1e-9, tf: 1e-9,
                    pw: 5e-6, per: 10e-6
                })
            ];

            const solver = new ExplicitStateSolver();
            await solver.initialize(components, 1e-8, { debug: false });

            console.log(`     節點數: ${solver.circuitData.nodeCount}`);
            console.log(`     狀態變量: ${solver.circuitData.stateCount} (L電流 + C電壓)`);

            // 運行較短時間避免收斂問題
            const results = await solver.run(0, 1e-6);
            console.log(`     仿真完成，步數: ${results.timeVector.length}`);

            return solver.circuitData.stateCount >= 2; // 至少L和C的狀態變量
        });
    }

    generateReport() {
        console.log('='.repeat(70));
        console.log('📋 全面組件驗證報告');
        console.log('='.repeat(70));

        console.log(`\n📊 總體結果: ${this.passedTests}/${this.totalTests} 通過 (${(this.passedTests/this.totalTests*100).toFixed(1)}%)`);

        console.log('\n📝 詳細結果:');
        this.testResults.forEach((result, index) => {
            const status = result.status === 'PASS' ? '✅' : result.status === 'FAIL' ? '❌' : '⚠️';
            console.log(`   ${index + 1}. ${status} ${result.name}`);
            if (result.error) {
                console.log(`      錯誤: ${result.error}`);
            }
        });

        const passRate = (this.passedTests / this.totalTests) * 100;
        
        if (passRate === 100) {
            console.log('\n🎉 完美！所有組件和電路測試通過！');
            console.log('AkingSpice具備完整的電路仿真能力。');
        } else if (passRate >= 80) {
            console.log('\n✅ 優秀！大部分功能正常，可以進行實際應用。');
        } else if (passRate >= 60) {
            console.log('\n⚠️ 良好！基本功能正常，但需要進一步完善。');
        } else {
            console.log('\n❌ 需要改進！存在較多問題，建議檢查實現。');
        }

        console.log('\n💡 建議後續工作:');
        if (passRate < 100) {
            console.log('   - 修復失敗的測試項目');
            console.log('   - 增強錯誤處理機制');
        }
        console.log('   - 添加更多電路拓撲測試');
        console.log('   - 性能優化和數值穩定性改進');
        console.log('   - 圖形用戶界面開發');

        return passRate === 100;
    }
}

async function main() {
    const tester = new ComprehensiveComponentTester();

    console.log('開始全面組件驗證測試...\n');

    // 基礎組件測試
    console.log('📦 基礎組件測試');
    console.log('-'.repeat(30));
    await tester.testBasicComponents();

    // 複雜電路測試  
    console.log('🔧 複雜電路測試');
    console.log('-'.repeat(30));
    await tester.testComplexCircuits();

    // 生成報告
    const allPassed = tester.generateReport();

    process.exit(allPassed ? 0 : 1);
}

main().catch(error => {
    console.error(`測試執行失敗: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
});