// 簡單測試文件
console.log('測試開始...');

try {
    console.log('嘗試導入 ExplicitStateSolver...');
    const { ExplicitStateSolver } = await import('../src/core/explicit-state-solver.js');
    console.log('✅ ExplicitStateSolver 導入成功');
    
    console.log('嘗試導入 Resistor...');
    const { Resistor } = await import('../src/components/resistor.js');
    console.log('✅ Resistor 導入成功');
    
    console.log('嘗試導入 Capacitor...');  
    const { Capacitor } = await import('../src/components/capacitor.js');
    console.log('✅ Capacitor 導入成功');
    
    console.log('嘗試導入 VoltageSource...');
    const { VoltageSource } = await import('../src/components/sources.js');
    console.log('✅ VoltageSource 導入成功');
    
    console.log('所有模塊導入成功！');
    
} catch (error) {
    console.error('導入失敗:', error);
}