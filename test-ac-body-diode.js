/**
 * 🔬 交流條件下的體二極體測試
 * 驗證體二極體在正弦波激勵下的半波整流行為
 */

import { 
    AkingSPICE,
    VoltageSource, 
    Resistor, 
    VoltageControlledMOSFET 
} from './src/index.js';

async function runACBodyDiodeTest() {
    console.log('--- AC MOSFET Body Diode Half-Wave Rectifier Test ---');
    
    const solver = new AkingSPICE();
    solver.setDebug(false);

    try {
        solver.reset();

        // 體二極體半波整流電路
        solver.components = [
            // 正弦波電壓源：50V 峰值，60Hz
            new VoltageSource('Vac', ['ac_node', '0'], 'SINE(0 50 60)'),
            
            // 串聯電阻
            new Resistor('Rs', ['ac_node', 'cathode'], 10),
            
            // MOSFET 作為體二極體：源極接地，汲極接cathode，閘極接地
            // 這樣體二極體方向是從地到cathode（正確的整流方向）
            new VoltageControlledMOSFET('M1', ['cathode', '0', '0'], { 
                Ron: 1e6, Roff: 1e6,  // 通道完全關閉
                Vf_body: 0.7, Ron_body: 0.1,  // 體二極體
                Vth: 10.0
            }),
            
            // 負載電阻
            new Resistor('Rload', ['cathode', '0'], 100)
        ];
        
        solver.isInitialized = true;
        console.log('✅ AC body diode test circuit built.');

        // 暫態分析：1.5 個週期
        const period = 1 / 60; // 60Hz 週期
        const duration = 1.5 * period;
        const timeStep = period / 200; // 每週期 200 個點
        
        console.log(`\nRunning transient analysis:`);
        console.log(`- Duration: ${(duration * 1000).toFixed(1)} ms`);
        console.log(`- Time step: ${(timeStep * 1e6).toFixed(1)} μs`);
        
        const results = await solver.runSteppedSimulation(() => ({}), {
            stopTime: duration,
            timeStep: timeStep
        });
        
        // 分析結果
        if (!results.steps || results.steps.length < 100) {
            console.error('❌ Simulation produced too few results');
            return false;
        }
        
        // 提取電壓數據並調試
        const V_cathode = [];
        const V_ac = [];
        const times = [];
        let debugCount = 0;
        
        for (let i = 0; i < results.steps.length; i++) {
            const step = results.steps[i];
            const time = step.time || i * timeStep;
            const v_cathode = step.nodeVoltages['cathode'] || 0;
            const v_ac = step.nodeVoltages['ac_node'] || 0;
            
            times.push(time);
            V_cathode.push(v_cathode);
            V_ac.push(v_ac);
            
            // 調試前幾個和後幾個時間步
            if (i < 5 || i >= results.steps.length - 5) {
                console.log(`  t=${(time*1000).toFixed(2)}ms: V_ac=${v_ac.toFixed(3)}V, V_cathode=${v_cathode.toFixed(3)}V`);
                debugCount++;
            } else if (debugCount === 5) {
                console.log('  ... (middle data omitted) ...');
                debugCount++;
            }
        }
        
        if (V_cathode.length === 0) {
            console.error('❌ No cathode voltage data received');
            return false;
        }
        
        // 找到峰值和平均值
        const V_cathode_max = Math.max(...V_cathode);
        const V_cathode_min = Math.min(...V_cathode);
        const V_cathode_avg = V_cathode.reduce((sum, v) => sum + v, 0) / V_cathode.length;
        
        // 計算整流效果：正半週應該有電壓，負半週應該接近 0
        const positiveHalfCycle = [];
        const negativeHalfCycle = [];
        
        for (let i = 0; i < times.length; i++) {
            const phase = (times[i] * 60 * 2 * Math.PI) % (2 * Math.PI);
            if (phase < Math.PI) {
                positiveHalfCycle.push(V_cathode[i]);
            } else {
                negativeHalfCycle.push(V_cathode[i]);
            }
        }
        
        const positiveAvg = positiveHalfCycle.reduce((sum, v) => sum + v, 0) / positiveHalfCycle.length;
        const negativeAvg = negativeHalfCycle.reduce((sum, v) => sum + v, 0) / negativeHalfCycle.length;
        
        console.log(`\n結果分析：`);
        console.log(`- Cathode voltage max:      ${V_cathode_max.toFixed(3)} V`);
        console.log(`- Cathode voltage min:      ${V_cathode_min.toFixed(3)} V`);
        console.log(`- Cathode voltage average:  ${V_cathode_avg.toFixed(3)} V`);
        console.log(`- Positive half-cycle avg: ${positiveAvg.toFixed(3)} V`);
        console.log(`- Negative half-cycle avg: ${negativeAvg.toFixed(3)} V`);
        
        // 檢驗半波整流行為
        const rectificationWorking = 
            V_cathode_max > 40 && // 正半週應有高電壓（接近50V - 0.7V）
            Math.abs(negativeAvg) < 1.0 && // 負半週應接近0V
            V_cathode_avg > 15; // 平均值應為正（DC成分）
        
        console.log(`\n半波整流檢驗：`);
        console.log(`- Peak voltage > 40V:     ${V_cathode_max > 40 ? '✅' : '❌'} (${V_cathode_max.toFixed(1)}V)`);
        console.log(`- Negative avg < 1V:      ${Math.abs(negativeAvg) < 1.0 ? '✅' : '❌'} (${negativeAvg.toFixed(3)}V)`);
        console.log(`- DC component > 15V:     ${V_cathode_avg > 15 ? '✅' : '❌'} (${V_cathode_avg.toFixed(1)}V)`);
        
        if (rectificationWorking) {
            console.log('\n✅ SUCCESS: MOSFET body diode half-wave rectification working!');
            return true;
        } else {
            console.log('\n❌ FAILURE: Half-wave rectification not working properly.');
            return false;
        }

    } catch (error) {
        console.error('❌ Error:', error);
        return false;
    }
}

runACBodyDiodeTest();