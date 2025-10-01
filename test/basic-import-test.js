console.log('=== 基本測試開始 ===');

// 測試基本導入
try {
    console.log('步驟1: 測試基本導入...');
    
    import('../src/core/explicit-state-solver.js').then(module => {
        console.log('✅ CPU求解器導入成功');
        console.log('導出項目:', Object.keys(module));
    }).catch(err => {
        console.error('❌ CPU求解器導入失敗:', err.message);
    });
    
} catch (error) {
    console.error('❌ 基本測試失敗:', error.message);
}

console.log('=== 基本測試完成 ===');