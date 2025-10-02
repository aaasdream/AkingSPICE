/**
 * 簡化的狀態空間編譯器測試
 */

// 先測試導入
try {
    const { StateSpaceCompiler } = await import('./src/core/state-space-compiler.js');
    console.log('✅ StateSpaceCompiler 導入成功');
    
    // 創建編譯器實例
    const compiler = new StateSpaceCompiler();
    console.log('✅ 編譯器實例創建成功');
    
    // 測試簡單元件
    const components = [
        {
            type: 'V',
            name: 'V1', 
            node1: 'node1',
            node2: '0',
            voltage: 1.0,
            getNodes() { return [this.node1, this.node2]; }
        },
        {
            type: 'C',
            name: 'C1',
            node1: 'node1', 
            node2: '0',
            capacitance: 1e-6,
            ic: 0,
            getNodes() { return [this.node1, this.node2]; }
        }
    ];
    
    console.log('📊 測試元件列表:', components.map(c => c.name));
    
    // 嘗試編譯
    compiler.setDebug(true);
    const matrices = await compiler.compile(components);
    
    console.log('✅ 編譯成功!');
    console.log('   狀態變量數:', matrices.numStates);
    console.log('   輸入變量數:', matrices.numInputs);
    console.log('   輸出變量數:', matrices.numOutputs);
    
    if (matrices.A) {
        console.log('   A矩陣維度:', `${matrices.A.rows}x${matrices.A.cols}`);
    }
    
} catch (error) {
    console.error('❌ 測試失敗:', error.message);
    console.error('   堆疊:', error.stack);
}