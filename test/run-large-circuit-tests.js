/**
 * 執行大規模電路GPU加速性能測試
 * 全面評估不同電路類型和規模下的GPU性能
 */

import { CircuitGenerator, PerformanceTestSuite } from './large-circuit-perf.js';

async function runLargeCircuitPerformanceTests() {
    console.log('🔥 大規模電路GPU加速性能測試');
    console.log('測試目標: 驗證GPU並行計算在複雜電路中的加速效果\n');
    
    const testSuite = new PerformanceTestSuite();
    
    try {
        // 測試1: 小規模RC梯形 (基準測試)
        console.log('階段 1: 基準性能測試');
        const smallRC = CircuitGenerator.createRCLadder(5, 100, 1e-9);
        await testSuite.runSingleTest(smallRC, '小規模RC梯形 (5級)', 1e-5, 1e-7);
        
        // 測試2: 中規模RC梯形
        console.log('\n階段 2: 中規模電路測試');
        const mediumRC = CircuitGenerator.createRCLadder(20, 100, 1e-9);
        await testSuite.runSingleTest(mediumRC, '中規模RC梯形 (20級)', 1e-5, 1e-7);
        
        // 測試3: 大規模RC梯形
        console.log('\n階段 3: 大規模電路測試');
        const largeRC = CircuitGenerator.createRCLadder(50, 100, 1e-9);
        await testSuite.runSingleTest(largeRC, '大規模RC梯形 (50級)', 1e-5, 1e-7);
        
        // 測試4: 超大規模RC梯形
        console.log('\n階段 4: 超大規模電路測試');
        const extraLargeRC = CircuitGenerator.createRCLadder(100, 100, 1e-9);
        await testSuite.runSingleTest(extraLargeRC, '超大規模RC梯形 (100級)', 5e-6, 1e-7);
        
        // 測試5: RLC振盪器網絡
        console.log('\n階段 5: 複雜拓撲測試');
        const rlcNetwork = CircuitGenerator.createCoupledRLC(10, 0.2);
        await testSuite.runSingleTest(rlcNetwork, 'RLC振盪器網絡 (10個)', 1e-5, 1e-8);
        
        // 測試6: 開關電源模型
        console.log('\n階段 6: 工程應用測試');
        const switchingPS = CircuitGenerator.createSwitchingPowerSupply(5);
        await testSuite.runSingleTest(switchingPS, '開關電源 (5級Buck)', 1e-5, 1e-8);
        
        // 測試7: 模擬電路網絡
        console.log('\n階段 7: 模擬電路測試');
        const analogCircuit = CircuitGenerator.createAnalogCircuit(8);
        await testSuite.runSingleTest(analogCircuit, '模擬放大器 (8級)', 1e-5, 1e-8);
        
        // 測試8: 極限規模測試 (僅GPU)
        console.log('\n階段 8: GPU極限測試');
        const massiveRC = CircuitGenerator.createRCLadder(200, 100, 1e-9);
        await testSuite.runSingleTest(massiveRC, '極限規模RC梯形 (200級)', 2e-6, 1e-8);
        
        // 生成綜合報告
        console.log('\n階段 9: 生成性能報告');
        const report = testSuite.generateReport();
        
        // 結論和建議
        console.log('\n' + '='.repeat(80));
        console.log('🎯 測試結論與建議');
        console.log('='.repeat(80));
        
        if (report.successfulTests >= 6) {
            console.log('✅ GPU加速架構運行穩定');
            
            if (report.averageSpeedup > 2) {
                console.log('🚀 GPU加速效果顯著 (平均加速比 > 2x)');
                console.log('💡 建議: 對於大規模電路 (>50節點) 優先使用GPU求解器');
            } else if (report.averageSpeedup > 1) {
                console.log('⚡ GPU加速效果良好 (平均加速比 > 1x)');
                console.log('💡 建議: 對於中大規模電路可考慮GPU求解器');
            } else {
                console.log('📊 GPU性能符合預期但加速效果有限');
                console.log('💡 建議: 繼續優化GPU實現或針對特定電路類型優化');
            }
        } else {
            console.log('⚠️ 部分測試失敗，需要進一步調試GPU實現');
        }
        
        // 應用場景建議
        console.log('\n🎯 應用場景建議:');
        console.log('• 實時電路仿真: GPU並行適合交互式設計工具');
        console.log('• 大規模集成電路: 充分利用GPU並行性處理複雜網絡');  
        console.log('• 參數掃描分析: 批量處理不同參數組合');
        console.log('• 蒙特卡羅仿真: 並行執行多個統計樣本');
        
        return report;
        
    } catch (error) {
        console.error('\n❌ 性能測試過程中發生錯誤:', error.message);
        console.error('詳細信息:', error);
        throw error;
    }
}

// 執行測試
if (import.meta.url === `file://${process.argv[1]}`) {
    runLargeCircuitPerformanceTests()
        .then(report => {
            console.log(`\n🎉 性能測試完成! 平均GPU加速比: ${report.averageSpeedup.toFixed(2)}x`);
            process.exit(0);
        })
        .catch(error => {
            console.error('測試失敗:', error.message);
            process.exit(1);
        });
}

export { runLargeCircuitPerformanceTests };