/**
 * 簡化的大規模電路性能測試
 * 先測試RC電路的規模擴展效果
 */

import { CircuitGenerator, PerformanceTestSuite } from './large-circuit-perf.js';

async function runScalabilityTest() {
    console.log('📈 GPU可擴展性測試\n');
    
    const testSuite = new PerformanceTestSuite();
    
    try {
        // 測試不同規模的RC梯形電路
        const scales = [
            { stages: 5, name: '小規模', simTime: 1e-5, timeStep: 1e-7 },
            { stages: 10, name: '中小規模', simTime: 1e-5, timeStep: 1e-7 },
            { stages: 20, name: '中規模', simTime: 1e-5, timeStep: 1e-7 },
            { stages: 50, name: '大規模', simTime: 5e-6, timeStep: 1e-7 },
        ];
        
        console.log('測試方案: RC梯形濾波器規模擴展');
        console.log('目標: 觀察GPU性能隨電路規模的變化\n');
        
        for (const scale of scales) {
            console.log(`\n${'='.repeat(60)}`);
            console.log(`測試規模: ${scale.stages} 級RC梯形`);
            
            const circuit = CircuitGenerator.createRCLadder(scale.stages, 100, 1e-9);
            await testSuite.runSingleTest(
                circuit, 
                `${scale.name}RC梯形 (${scale.stages}級)`, 
                scale.simTime, 
                scale.timeStep
            );
            
            // 短暫延遲以避免GPU資源競爭
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        // 生成報告
        const report = testSuite.generateReport();
        
        console.log('\n' + '='.repeat(80));
        console.log('📊 可擴展性分析');
        console.log('='.repeat(80));
        
        const gpuResults = report.results.filter(r => r.gpu.success);
        if (gpuResults.length >= 2) {
            console.log('\n🔍 性能趨勢分析:');
            
            gpuResults.forEach((result, index) => {
                const perf = result.gpu.stepsPerSecond;
                const nodes = result.circuit.nodeCount;
                const efficiency = perf / nodes;
                
                console.log(`   ${result.testName}:`);
                console.log(`     節點數: ${nodes}, 性能: ${perf.toFixed(0)} 步/秒`);
                console.log(`     效率: ${efficiency.toFixed(1)} 步/秒/節點`);
                
                if (index > 0) {
                    const prevResult = gpuResults[index - 1];
                    const scaleRatio = nodes / prevResult.circuit.nodeCount;
                    const perfRatio = perf / prevResult.gpu.stepsPerSecond;
                    const scalingEfficiency = perfRatio / scaleRatio;
                    
                    console.log(`     規模比: ${scaleRatio.toFixed(1)}x, 性能比: ${perfRatio.toFixed(2)}x`);
                    console.log(`     擴展效率: ${scalingEfficiency.toFixed(2)} ${scalingEfficiency > 0.8 ? '✅' : scalingEfficiency > 0.5 ? '⚠️' : '❌'}`);
                }
            });
            
            // 總體評估
            const firstResult = gpuResults[0];
            const lastResult = gpuResults[gpuResults.length - 1];
            const overallScaling = (lastResult.circuit.nodeCount / firstResult.circuit.nodeCount);
            const overallPerfChange = (lastResult.gpu.stepsPerSecond / firstResult.gpu.stepsPerSecond);
            
            console.log(`\n🎯 總體擴展性評估:`);
            console.log(`   規模範圍: ${firstResult.circuit.nodeCount} → ${lastResult.circuit.nodeCount} 節點 (${overallScaling.toFixed(1)}x)`);
            console.log(`   性能變化: ${firstResult.gpu.stepsPerSecond.toFixed(0)} → ${lastResult.gpu.stepsPerSecond.toFixed(0)} 步/秒 (${overallPerfChange.toFixed(2)}x)`);
            
            if (overallPerfChange > 0.7) {
                console.log(`   ✅ GPU並行化展現良好的可擴展性`);
            } else if (overallPerfChange > 0.4) {
                console.log(`   ⚠️ GPU性能隨規模有所下降，但仍可接受`);
            } else {
                console.log(`   ❌ GPU性能隨規模顯著下降，需要優化`);
            }
        }
        
        return report;
        
    } catch (error) {
        console.error('❌ 可擴展性測試失敗:', error.message);
        throw error;
    }
}

// 執行測試
runScalabilityTest()
    .then(report => {
        console.log(`\n🎊 可擴展性測試完成!`);
        console.log(`測試通過率: ${(report.successfulTests / report.totalTests * 100).toFixed(1)}%`);
        
        if (report.averageSpeedup > 0) {
            console.log(`平均GPU vs CPU加速比: ${report.averageSpeedup.toFixed(2)}x`);
        }
    })
    .catch(error => {
        console.error('測試失敗:', error.message);
        process.exit(1);
    });