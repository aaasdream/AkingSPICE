// 临时调试脚本 - 只运行几个时间步长
import { LLCConverter } from './llc_simulation.js';

async function debugTest() {
    console.log('=== 临时调试测试 ===');
    
    const llc = new LLCConverter();
    
    // 只运行前5个时间步长
    for (let step = 0; step < 5; step++) {
        console.log(`\n--- Step ${step} ---`);
        try {
            // 这里需要调用LLC的单步仿真方法
            // 由于我们没有直接的单步方法，我们将修改LLC以支持这个
            break; // 暂时退出
        } catch (error) {
            console.error(`Step ${step} failed:`, error);
            break;
        }
    }
}

debugTest().catch(console.error);