/**
 * 全面的基礎組件測試
 * 
 * 測試所有基礎組件的功能：
 * 1. 組件導入和實例化
 * 2. 組件參數設置和驗證
 * 3. 組件在電路中的基本功能
 * 4. 組件的preprocess方法
 */

import { performance } from 'perf_hooks';

// 導入所有組件
import { BaseComponent } from '../src/components/base.js';
import { Resistor } from '../src/components/resistor.js';
import { Capacitor } from '../src/components/capacitor.js';
import { Inductor, CoupledInductor } from '../src/components/inductor.js';
import { VoltageSource, CurrentSource, VCVS, VCCS, CCCS, CCVS } from '../src/components/sources.js';
import { ThreePhaseSource } from '../src/components/threephase.js';
import { MOSFET } from '../src/components/mosfet.js';
import { VoltageControlledMOSFET } from '../src/components/vcmosfet.js';
import { Diode } from '../src/components/diode.js';
import { MultiWindingTransformer } from '../src/components/transformer.js';

// 導入求解器用於功能測試
import { ExplicitStateSolver } from '../src/core/explicit-state-solver.js';

class ComponentTester {
    constructor() {
        this.testResults = [];
        this.totalTests = 0;
        this.passedTests = 0;
    }

    /**
     * 執行單個測試
     */
    async runTest(testName, testFunction) {
        this.totalTests++;
        console.log(`\n🧪 測試: ${testName}`);
        
        try {
            const startTime = performance.now();
            const result = await testFunction();
            const endTime = performance.now();
            
            if (result === true) {
                this.passedTests++;
                console.log(`✅ 通過 (${(endTime - startTime).toFixed(2)}ms)`);
                this.testResults.push({ name: testName, status: 'PASS', time: endTime - startTime });
            } else {
                console.log(`❌ 失敗`);
                this.testResults.push({ name: testName, status: 'FAIL', time: endTime - startTime, error: result });
            }
        } catch (error) {
            console.log(`❌ 異常: ${error.message}`);
            this.testResults.push({ name: testName, status: 'ERROR', time: 0, error: error.message });
        }
    }

    /**
     * 測試基礎組件類
     */
    async testBaseComponent() {
        try {
            // 測試抽象基類不能直接實例化
            try {
                new BaseComponent('test', ['n1', 'n2'], {});
                return '基礎組件不應該能直接實例化';
            } catch (error) {
                // 預期的錯誤
            }

            // 測試繼承類的基本功能
            const resistor = new Resistor('R1', ['n1', 'n2'], 1000);
            
            // 驗證基本屬性
            if (resistor.name !== 'R1') return '組件名稱設置失敗';
            if (resistor.nodes.length !== 2) return '節點設置失敗';
            if (resistor.nodes[0] !== 'n1' || resistor.nodes[1] !== 'n2') return '節點值設置失敗';
            
            return true;
        } catch (error) {
            return `基礎組件測試失敗: ${error.message}`;
        }
    }

    /**
     * 測試電阻組件
     */
    async testResistor() {
        try {
            // 基本電阻
            const r1 = new Resistor('R1', ['n1', 'n2'], 1000);
            if (r1.resistance !== 1000) return '電阻值設置失敗';

            // 字符串電阻值
            const r2 = new Resistor('R2', ['n3', 'n4'], '1k');
            if (r2.resistance !== 1000) return '字符串電阻值解析失敗';

            const r3 = new Resistor('R3', ['n5', 'n6'], '2.2M');
            if (Math.abs(r3.resistance - 2200000) > 1) return '大電阻值解析失敗';

            // 測試preprocess方法
            const mockCircuit = {
                addConductance: () => {},
                addCurrentSource: () => {}
            };
            
            r1.preprocess(mockCircuit);
            
            return true;
        } catch (error) {
            return `電阻測試失敗: ${error.message}`;
        }
    }

    /**
     * 測試電容組件
     */
    async testCapacitor() {
        try {
            // 基本電容
            const c1 = new Capacitor('C1', ['n1', 'n2'], 1e-6);
            if (c1.capacitance !== 1e-6) return '電容值設置失敗';

            // 字符串電容值
            const c2 = new Capacitor('C2', ['n3', 'n4'], '100n');
            if (Math.abs(c2.capacitance - 100e-9) > 1e-12) return '字符串電容值解析失敗';

            // 初始條件
            const c3 = new Capacitor('C3', ['n5', 'n6'], '1u', { ic: 5 });
            if (c3.initialCondition !== 5) return '初始條件設置失敗';

            // 測試preprocess方法
            const mockCircuit = {
                addConductance: () => {},
                addCurrentSource: () => {},
                addStateVariable: () => {}
            };
            
            c1.preprocess(mockCircuit);
            
            return true;
        } catch (error) {
            return `電容測試失敗: ${error.message}`;
        }
    }

    /**
     * 測試電感組件
     */
    async testInductor() {
        try {
            // 基本電感
            const l1 = new Inductor('L1', ['n1', 'n2'], 1e-3);
            if (l1.inductance !== 1e-3) return '電感值設置失敗';

            // 字符串電感值
            const l2 = new Inductor('L2', ['n3', 'n4'], '100u');
            if (Math.abs(l2.inductance - 100e-6) > 1e-9) return '字符串電感值解析失敗';

            // 初始條件
            const l3 = new Inductor('L3', ['n5', 'n6'], '1m', { ic: 0.5 });
            if (l3.initialCondition !== 0.5) return '初始條件設置失敗';

            // 測試preprocess方法
            const mockCircuit = {
                addConductance: () => {},
                addVoltageSource: () => {},
                addStateVariable: () => {}
            };
            
            l1.preprocess(mockCircuit);
            
            return true;
        } catch (error) {
            return `電感測試失敗: ${error.message}`;
        }
    }

    /**
     * 測試電壓源組件
     */
    async testVoltageSources() {
        try {
            // DC電壓源
            const vdc = new VoltageSource('V1', ['n1', 'n2'], 12);
            if (vdc.value !== 12) return 'DC電壓源值設置失敗';

            // AC電壓源
            const vac = new VoltageSource('V2', ['n3', 'n4'], {
                type: 'sin',
                amplitude: 10,
                frequency: 1000,
                phase: 0
            });
            if (vac.waveform.amplitude !== 10) return 'AC電壓源參數設置失敗';

            // 脈衝電壓源
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
            if (vpulse.waveform.v2 !== 5) return '脈衝電壓源參數設置失敗';

            // 測試preprocess方法
            const mockCircuit = {
                addVoltageSource: () => {},
                addConductance: () => {}
            };
            
            vdc.preprocess(mockCircuit);
            
            return true;
        } catch (error) {
            return `電壓源測試失敗: ${error.message}`;
        }
    }

    /**
     * 測試電流源組件
     */
    async testCurrentSources() {
        try {
            // DC電流源
            const idc = new CurrentSource('I1', ['n1', 'n2'], 0.001);
            if (idc.value !== 0.001) return 'DC電流源值設置失敗';

            // AC電流源
            const iac = new CurrentSource('I2', ['n3', 'n4'], {
                type: 'sin',
                amplitude: 0.1,
                frequency: 50,
                phase: 90
            });
            if (iac.waveform.phase !== 90) return 'AC電流源參數設置失敗';

            // 測試preprocess方法
            const mockCircuit = {
                addCurrentSource: () => {}
            };
            
            idc.preprocess(mockCircuit);
            
            return true;
        } catch (error) {
            return `電流源測試失敗: ${error.message}`;
        }
    }

    /**
     * 測試受控源組件
     */
    async testControlledSources() {
        try {
            // VCVS (電壓控制電壓源)
            const vcvs = new VCVS('E1', ['n1', 'n2'], ['n3', 'n4'], 10);
            if (vcvs.gain !== 10) return 'VCVS增益設置失敗';

            // VCCS (電壓控制電流源)
            const vccs = new VCCS('G1', ['n5', 'n6'], ['n7', 'n8'], 0.001);
            if (vccs.transconductance !== 0.001) return 'VCCS跨導設置失敗';

            // CCCS (電流控制電流源)
            const cccs = new CCCS('F1', ['n9', 'n10'], 'V_sense', 2);
            if (cccs.gain !== 2) return 'CCCS增益設置失敗';

            // CCVS (電流控制電壓源)
            const ccvs = new CCVS('H1', ['n11', 'n12'], 'V_sense', 100);
            if (ccvs.transresistance !== 100) return 'CCVS跨阻設置失敗';

            return true;
        } catch (error) {
            return `受控源測試失敗: ${error.message}`;
        }
    }

    /**
     * 測試二極體組件
     */
    async testDiode() {
        try {
            // 基本二極體
            const d1 = new Diode('D1', ['n1', 'n2']);
            if (!d1.model.Is || !d1.model.Vt) return '二極體默認模型設置失敗';

            // 自定義模型二極體
            const d2 = new Diode('D2', ['n3', 'n4'], {
                Is: 1e-14,
                n: 1.2,
                Vt: 0.026
            });
            if (d2.model.Is !== 1e-14) return '自定義二極體模型設置失敗';

            return true;
        } catch (error) {
            return `二極體測試失敗: ${error.message}`;
        }
    }

    /**
     * 測試MOSFET組件
     */
    async testMOSFET() {
        try {
            // N型MOSFET
            const mn = new MOSFET('M1', ['nd', 'ng', 'ns'], 'nmos', {
                Vth: 1.0,
                Kp: 100e-6,
                lambda: 0.01
            });
            if (mn.model.Vth !== 1.0) return 'NMOS參數設置失敗';

            // P型MOSFET
            const mp = new MOSFET('M2', ['nd', 'ng', 'ns'], 'pmos', {
                Vth: -1.0,
                Kp: 50e-6
            });
            if (mp.model.Vth !== -1.0) return 'PMOS參數設置失敗';

            return true;
        } catch (error) {
            return `MOSFET測試失敗: ${error.message}`;
        }
    }

    /**
     * 測試三相電源組件
     */
    async testThreePhaseSource() {
        try {
            const threephase = new ThreePhaseSource('VP1', ['na', 'nb', 'nc', 'nn'], {
                amplitude: 311,  // 220V RMS的峰值
                frequency: 50,
                phase_a: 0,
                phase_b: -120,
                phase_c: 120
            });
            
            if (threephase.amplitude !== 311) return '三相電源幅值設置失敗';
            if (threephase.frequency !== 50) return '三相電源頻率設置失敗';
            
            return true;
        } catch (error) {
            return `三相電源測試失敗: ${error.message}`;
        }
    }

    /**
     * 測試變壓器組件
     */
    async testTransformer() {
        try {
            const transformer = new MultiWindingTransformer('T1', {
                windings: [
                    { nodes: ['p1', 'p2'], turns: 100 },
                    { nodes: ['s1', 's2'], turns: 10 }
                ],
                coupling: 0.98
            });
            
            if (transformer.windings.length !== 2) return '變壓器繞組數設置失敗';
            if (transformer.coupling !== 0.98) return '變壓器耦合係數設置失敗';
            
            return true;
        } catch (error) {
            return `變壓器測試失敗: ${error.message}`;
        }
    }

    /**
     * 測試簡單電路功能
     */
    async testSimpleCircuit() {
        try {
            // 創建簡單的RC電路
            const components = [
                new VoltageSource('V1', ['vin', 'gnd'], 5),
                new Resistor('R1', ['vin', 'vout'], '1k'),
                new Capacitor('C1', ['vout', 'gnd'], '1u')
            ];

            // 測試組件能否被求解器正確處理
            const solver = new ExplicitStateSolver();
            await solver.initialize(components, 1e-6, { debug: false });

            // 檢查預處理結果
            const circuitData = solver.circuitData;
            if (circuitData.nodeCount < 2) return '節點數量異常';
            if (circuitData.stateCount !== 1) return '狀態變量數量異常';

            // 運行短時間仿真
            const results = await solver.run(0, 1e-5);
            if (results.timeVector.length < 5) return '仿真步數異常';

            return true;
        } catch (error) {
            return `簡單電路測試失敗: ${error.message}`;
        }
    }

    /**
     * 生成測試報告
     */
    generateReport() {
        console.log('\n' + '='.repeat(70));
        console.log('📋 組件測試報告');
        console.log('='.repeat(70));

        console.log(`\n📊 總體結果: ${this.passedTests}/${this.totalTests} 通過 (${(this.passedTests/this.totalTests*100).toFixed(1)}%)`);

        console.log('\n📝 詳細結果:');
        this.testResults.forEach((result, index) => {
            const status = result.status === 'PASS' ? '✅' : '❌';
            const time = result.time ? `(${result.time.toFixed(1)}ms)` : '';
            console.log(`   ${index + 1}. ${status} ${result.name} ${time}`);
            
            if (result.error && result.status !== 'PASS') {
                console.log(`      錯誤: ${result.error}`);
            }
        });

        if (this.passedTests === this.totalTests) {
            console.log('\n🎉 所有組件測試通過！AkingSpice基礎組件功能正常。');
        } else {
            console.log(`\n⚠️  ${this.totalTests - this.passedTests} 個測試失敗，需要檢查相關組件。`);
        }

        return this.passedTests === this.totalTests;
    }
}

/**
 * 主測試函數
 */
async function runAllComponentTests() {
    console.log('🧪 AkingSpice 基礎組件全面測試');
    console.log('測試所有基礎組件的導入、實例化和基本功能\n');

    const tester = new ComponentTester();

    // 執行所有測試
    await tester.runTest('基礎組件類', () => tester.testBaseComponent());
    await tester.runTest('電阻組件', () => tester.testResistor());
    await tester.runTest('電容組件', () => tester.testCapacitor());
    await tester.runTest('電感組件', () => tester.testInductor());
    await tester.runTest('電壓源組件', () => tester.testVoltageSources());
    await tester.runTest('電流源組件', () => tester.testCurrentSources());
    await tester.runTest('受控源組件', () => tester.testControlledSources());
    await tester.runTest('二極體組件', () => tester.testDiode());
    await tester.runTest('MOSFET組件', () => tester.testMOSFET());
    await tester.runTest('三相電源組件', () => tester.testThreePhaseSource());
    await tester.runTest('變壓器組件', () => tester.testTransformer());
    await tester.runTest('簡單電路功能', () => tester.testSimpleCircuit());

    // 生成報告
    const allPassed = tester.generateReport();

    return allPassed;
}

// 如果直接執行此文件
if (import.meta.url === `file://${process.argv[1]}`) {
    runAllComponentTests()
        .then(success => {
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('\n❌ 測試執行失敗:', error.message);
            process.exit(1);
        });
}

export { runAllComponentTests, ComponentTester };