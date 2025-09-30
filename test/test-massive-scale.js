/**
 * 大規模電路性能測試 - 專注於GPU優勢場景
 * 測試超大規模電路，其中GPU的並行優勢應該更明顯
 */

import { CircuitGenerator, PerformanceTestSuite } from './large-circuit-perf.js';

async function runMassiveScaleTest() {
    console.log('🚀 超大規模電路GPU並行化測試\n');
    
    const testSuite = new PerformanceTestSuite();
    
    try {
        // 測試更大規模的電路，專注於GPU並行化優勢
        const scales = [
            { stages: 100, name: '超大規模', simTime: 2e-6, timeStep: 1e-8 },
            { stages: 200, name: '巨型規模', simTime: 1e-6, timeStep: 1e-8 },
            { stages: 500, name: '極大規模', simTime: 5e-7, timeStep: 1e-8 },
        ];
        
        console.log('🎯 測試策略: 超大規模電路測試');
        console.log('目標: 發揮GPU並行處理優勢，減少相對初始化開銷');
        console.log('優化: 更小時間步長，更多並行計算\n');
        
        for (const scale of scales) {
            console.log(`\n${'='.repeat(70)}`);
            console.log(`📊 ${scale.name}測試: ${scale.stages} 級RC梯形`);
            
            const circuit = CircuitGenerator.createRCLadder(scale.stages, 100, 1e-9);
            console.log(`   電路規模: ${circuit.nodeCount} 節點, ${circuit.components.length} 組件`);
            console.log(`   仿真參數: ${(scale.simTime*1e6).toFixed(1)}μs, 步長 ${(scale.timeStep*1e9).toFixed(1)}ns`);
            console.log(`   預計步數: ${Math.ceil(scale.simTime / scale.timeStep)}`);
            
            const result = await testSuite.runSingleTest(
                circuit, 
                `${scale.name}RC梯形 (${scale.stages}級)`, 
                scale.simTime, 
                scale.timeStep
            );
            
            // 分析結果
            if (result.gpu.success) {
                const throughput = result.gpu.stepsPerSecond * circuit.nodeCount;
                const efficiency = throughput / 1e6; // 每秒百萬節點*步
                
                console.log(`\n   🔍 性能分析:`);
                console.log(`      吞吐量: ${(throughput/1e6).toFixed(2)} M節點步/秒`);
                console.log(`      計算效率: ${efficiency.toFixed(3)} (目標 > 1.0)`);
                console.log(`      GPU利用率: ${(result.gpu.stepsPerSecond / 300).toFixed(1)}% (基準300步/秒)`);
                
                if (efficiency > 1.0) {
                    console.log(`      ✅ 高效並行計算達成`);
                } else if (efficiency > 0.5) {
                    console.log(`      ⚠️ 中等並行效率`);
                } else {
                    console.log(`      ❌ 並行效率偏低`);
                }
            }
            
            // 延遲以避免GPU資源競爭
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        // 生成超大規模測試報告
        const report = testSuite.generateReport();
        
        console.log('\n' + '='.repeat(80));
        console.log('🎯 超大規模GPU並行化效果評估');
        console.log('='.repeat(80));
        
        const gpuResults = report.results.filter(r => r.gpu.success);
        if (gpuResults.length > 0) {
            console.log('\n📈 並行化效果分析:');
            
            let totalThroughput = 0;
            let totalNodes = 0;
            
            gpuResults.forEach((result, index) => {
                const nodes = result.circuit.nodeCount;
                const perf = result.gpu.stepsPerSecond;
                const throughput = perf * nodes;
                
                totalThroughput += throughput;
                totalNodes += nodes;
                
                console.log(`\n   ${result.testName}:`);
                console.log(`     規模: ${nodes} 節點`);
                console.log(`     性能: ${perf.toFixed(0)} 步/秒`);
                console.log(`     吞吐量: ${(throughput/1e6).toFixed(2)} M節點步/秒`);
                console.log(`     平均每節點: ${(perf/nodes).toFixed(2)} 步/秒/節點`);
                
                // 與理想線性縮放比較
                if (index === 0) {
                    console.log(`     基準測試 (100%效率)`);
                } else {
                    const firstResult = gpuResults[0];
                    const expectedPerf = firstResult.gpu.stepsPerSecond * 
                                       (firstResult.circuit.nodeCount / nodes);
                    const actualEfficiency = perf / expectedPerf;
                    
                    console.log(`     vs 線性縮放: ${(actualEfficiency * 100).toFixed(1)}%`);
                    
                    if (actualEfficiency > 0.8) {
                        console.log(`     ✅ 優異的並行擴展性`);
                    } else if (actualEfficiency > 0.6) {
                        console.log(`     ⚠️ 良好的並行擴展性`);  
                    } else {
                        console.log(`     ❌ 並行擴展性需要改進`);
                    }
                }
            });
            
            // 總體並行化效果
            const avgThroughput = totalThroughput / gpuResults.length;
            const avgNodes = totalNodes / gpuResults.length;
            
            console.log(`\n🎯 總體並行化效果:`);
            console.log(`   平均規模: ${avgNodes.toFixed(0)} 節點`);
            console.log(`   平均吞吐量: ${(avgThroughput/1e6).toFixed(2)} M節點步/秒`);
            console.log(`   計算密度: ${(avgThroughput/1e9).toFixed(3)} G節點步/秒`);
            
            if (avgThroughput > 50e6) {
                console.log(`   🚀 GPU展現強大的並行計算能力！`);
            } else if (avgThroughput > 20e6) {
                console.log(`   ✅ GPU並行化效果良好`);
            } else {
                console.log(`   ⚠️ GPU並行化有改進空間`);
            }
            
            // 推薦使用場景
            console.log(`\n💡 GPU加速建議:`);
            if (avgNodes > 100) {
                console.log(`   ✅ 推薦用於超大規模電路仿真 (>100節點)`);
            }
            if (avgThroughput > 30e6) {
                console.log(`   ✅ 適合高頻時域仿真 (小時間步長)`);  
            }
            console.log(`   📊 最佳應用: 大規模電路 + 高精度時域分析`);
        }
        
        return report;
        
    } catch (error) {
        console.error('❌ 超大規模測試失敗:', error.message);
        throw error;
    }
}

// 執行超大規模測試
runMassiveScaleTest()
    .then(report => {
        console.log(`\n🎊 超大規模GPU並行化測試完成!`);
        console.log(`測試通過率: ${(report.successfulTests / report.totalTests * 100).toFixed(1)}%`);
        
        const gpuTests = report.results.filter(r => r.gpu.success);
        if (gpuTests.length > 0) {
            const avgPerf = gpuTests.reduce((sum, r) => sum + r.gpu.stepsPerSecond, 0) / gpuTests.length;
            console.log(`平均GPU性能: ${avgPerf.toFixed(0)} 步/秒`);
            
            const totalNodes = gpuTests.reduce((sum, r) => sum + r.circuit.nodeCount, 0);
            const totalThroughput = gpuTests.reduce((sum, r) => sum + r.gpu.stepsPerSecond * r.circuit.nodeCount, 0);
            console.log(`總計算吞吐量: ${(totalThroughput/1e6).toFixed(2)} M節點步/秒`);
        }
    })
    .catch(error => {
        console.error('測試失敗:', error.message);
        process.exit(1);
    });