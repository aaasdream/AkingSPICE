/**
 * AkingSpice GPU並行化使用指南
 * 提供清晰的使用說明和最佳實踐
 */

# AkingSpice GPU並行化使用指南

## 🚀 快速開始

### 1. 環境需求
```bash
# 確保Node.js版本 >= 16
node --version

# 安裝WebGPU依賴 (已包含在項目中)
npm install webgpu@0.3.8
```

### 2. 基本使用
```javascript
import { BatchGPUExplicitSolver } from './src/core/batch-gpu-solver.js';
import { Resistor, Capacitor, VoltageSource } from './src/components/index.js';

// 創建電路組件
const components = [
    new VoltageSource('V1', 'n1', 'gnd', { type: 'dc', value: 10 }),
    new Resistor('R1', 'n1', 'n2', 100),
    new Capacitor('C1', 'n2', 'gnd', 1e-9)
];

// 初始化GPU求解器
const solver = new BatchGPUExplicitSolver({
    debug: false,
    timeStep: 1e-7,
    batchSize: 100,           // 建議: 50-100
    solverMaxIterations: 25   // 建議: 15-25
});

// 運行GPU並行仿真
await solver.initialize(components, 1e-7);
const results = await solver.runOptimizedTransientAnalysis(0, 1e-5);

console.log(`GPU仿真完成: ${results.optimizedStepsPerSecond} 步/秒`);
```

## 🎯 最佳實踐

### 適用場景
✅ **推薦使用GPU加速**:
```javascript
// 中大規模電路 (50+ 節點)
const largecircuit = CircuitGenerator.createRCLadder(100, 100, 1e-9);

// 長時間仿真 (500+ 步)
const longSimulation = { startTime: 0, endTime: 1e-4, timeStep: 1e-7 };

// 批量參數研究
for (let i = 0; i < 10; i++) {
    const results = await solver.runOptimizedTransientAnalysis(0, 1e-5);
    // 分析結果...
}
```

❌ **不建議使用GPU加速**:
```javascript
// 小規模電路 (< 50 節點) - 使用CPU更高效
const smallCircuit = [resistor, capacitor]; // 只有幾個組件

// 短時間仿真 (< 100 步) - GPU初始化開銷過大  
const quickSim = { endTime: 1e-6 }; // 很短的仿真

// 單次分析 - CPU更適合
const oneTimeAnalysis = await cpuSolver.run(0, 1e-6);
```

### 性能優化配置

#### 🔧 基本優化
```javascript
const optimizedConfig = {
    // 批處理大小: 影響GPU利用率
    batchSize: 100,        // 推薦 50-100
    
    // 疊代次數: 影響精度vs速度權衡
    solverMaxIterations: 15, // 推薦 15-25
    
    // 容差: 影響收斂速度
    solverTolerance: 1e-6,   // 推薦 1e-6 到 1e-4
    
    // 時間步長: 影響精度和穩定性
    timeStep: 1e-7          // 根據電路特性調整
};
```

#### ⚡ 高性能配置  
```javascript
const highPerfConfig = {
    batchSize: 200,           // 大批處理
    solverMaxIterations: 15,  // 較少疊代
    solverTolerance: 1e-5,    // 寬鬆容差
    timeStep: 1e-6,           // 較大時間步
    debug: false              // 關閉除錯輸出
};
```

#### 🎯 高精度配置
```javascript
const highAccuracyConfig = {
    batchSize: 50,            // 小批處理 (更頻繁同步)
    solverMaxIterations: 30,  // 更多疊代
    solverTolerance: 1e-7,    // 嚴格容差 
    timeStep: 1e-8,           // 小時間步
    debug: true               // 開啟監控
};
```

## 📊 性能監控

### 性能指標
```javascript
// 運行仿真並監控性能
const results = await solver.runOptimizedTransientAnalysis(0, 1e-5);

console.log('性能指標:');
console.log(`  步速: ${results.optimizedStepsPerSecond} 步/秒`);
console.log(`  總步數: ${results.totalSteps}`);
console.log(`  仿真時間: ${results.elapsedTime}ms`);
console.log(`  平均每步: ${results.elapsedTime/results.totalSteps}ms`);

// 判斷性能等級
if (results.optimizedStepsPerSecond > 200) {
    console.log('✅ 優秀性能');
} else if (results.optimizedStepsPerSecond > 100) {
    console.log('⚠️ 良好性能');
} else {
    console.log('❌ 性能偏低，建議優化');
}
```

### 性能診斷
```javascript
// 電路規模評估
const circuitSize = components.length;
const expectedNodes = circuitSize * 0.7; // 粗略估算

console.log('電路分析:');
console.log(`  組件數: ${circuitSize}`);
console.log(`  預估節點: ${expectedNodes}`);

if (expectedNodes < 50) {
    console.log('  建議: 使用CPU求解器');
} else if (expectedNodes < 200) {
    console.log('  建議: GPU加速適中效果');
} else {
    console.log('  建議: GPU加速顯著效果');
}
```

## 🔍 故障排除

### 常見問題

#### 1. GPU初始化失敗
```javascript
try {
    await solver.initialize(components, timeStep);
} catch (error) {
    if (error.message.includes('WebGPU')) {
        console.log('❌ WebGPU不可用，請檢查:');
        console.log('  - Node.js版本 >= 16');
        console.log('  - webgpu包已安裝');
        console.log('  - 系統支援WebGPU');
        
        // 回退到CPU
        console.log('🔄 回退使用CPU求解器');
        const cpuSolver = new ExplicitStateSolver();
        return await cpuSolver.run(0, endTime);
    }
}
```

#### 2. 性能不如預期
```javascript
// 檢查配置
if (results.optimizedStepsPerSecond < 50) {
    console.log('🔧 性能優化建議:');
    console.log('  1. 減少疊代次數 (solverMaxIterations)');
    console.log('  2. 增加批處理大小 (batchSize)');
    console.log('  3. 放寬容差 (solverTolerance)');
    console.log('  4. 檢查電路規模是否適合GPU');
}
```

#### 3. 數值不穩定
```javascript
// 監控收斂性
const config = {
    solverMaxIterations: 30,  // 增加疊代次數
    solverTolerance: 1e-7,    // 更嚴格容差
    timeStep: 1e-8,           // 減小時間步長
    debug: true               // 開啟詳細日誌
};

// 檢查結果合理性
if (results.results && results.results.length > 0) {
    const finalResult = results.results[results.results.length - 1];
    // 檢查電壓是否在合理範圍內
    // 檢查是否有NaN或無窮大值
}
```

## 🎯 應用示例

### 1. RC濾波器分析
```javascript
import { CircuitGenerator } from '../test/large-circuit-perf.js';

// 創建RC梯形濾波器
const circuit = CircuitGenerator.createRCLadder(50, 100, 1e-9);

// GPU並行仿真
const solver = new BatchGPUExplicitSolver({
    batchSize: 100,
    solverMaxIterations: 20
});

await solver.initialize(circuit.components, 1e-7);
const results = await solver.runOptimizedTransientAnalysis(0, 1e-4);

console.log(`50級RC濾波器仿真: ${results.optimizedStepsPerSecond} 步/秒`);
```

### 2. 參數掃描
```javascript
// 電容值參數掃描
const capacitanceValues = [1e-12, 1e-11, 1e-10, 1e-9, 1e-8];
const results = [];

for (const C of capacitanceValues) {
    // 更新電容值
    const circuit = createCircuitWithCapacitance(C);
    
    // GPU仿真
    const solver = new BatchGPUExplicitSolver({ batchSize: 100 });
    await solver.initialize(circuit, 1e-7);
    const result = await solver.runOptimizedTransientAnalysis(0, 1e-5);
    
    results.push({
        capacitance: C,
        performance: result.optimizedStepsPerSecond,
        finalVoltage: result.results[result.results.length - 1]
    });
    
    solver.destroy(); // 清理GPU資源
}

console.log('參數掃描完成:', results);
```

### 3. 大規模電路測試
```javascript
// 測試不同規模的電路
const scales = [50, 100, 200, 500];

for (const scale of scales) {
    console.log(`\n測試 ${scale} 級電路:`);
    
    const circuit = CircuitGenerator.createRCLadder(scale, 100, 1e-9);
    const solver = new BatchGPUExplicitSolver({
        batchSize: Math.min(100, scale), // 自適應批處理大小
        solverMaxIterations: 20
    });
    
    const startTime = performance.now();
    await solver.initialize(circuit.components, 1e-7);
    const results = await solver.runOptimizedTransientAnalysis(0, 5e-6);
    const endTime = performance.now();
    
    console.log(`  節點數: ${circuit.nodeCount}`);
    console.log(`  性能: ${results.optimizedStepsPerSecond} 步/秒`);
    console.log(`  總時間: ${endTime - startTime}ms`);
    console.log(`  吞吐量: ${(results.optimizedStepsPerSecond * circuit.nodeCount / 1e6).toFixed(2)} M節點步/秒`);
    
    solver.destroy();
}
```

## 💡 開發建議

### GPU vs CPU 選擇邏輯
```javascript
function chooseSolver(circuit, simulationParams) {
    const nodeCount = estimateNodeCount(circuit);
    const stepCount = simulationParams.endTime / simulationParams.timeStep;
    
    // GPU適用條件
    if (nodeCount >= 50 && stepCount >= 100) {
        console.log('📈 選擇GPU加速 - 大規模電路');
        return new BatchGPUExplicitSolver();
    } else if (nodeCount >= 100) {
        console.log('⚡ 選擇GPU加速 - 超大規模電路');
        return new BatchGPUExplicitSolver();
    } else {
        console.log('💻 選擇CPU求解器 - 小規模電路');
        return new ExplicitStateSolver();
    }
}
```

### 資源管理
```javascript
// 正確的資源管理
class GPUSimulationManager {
    constructor() {
        this.solvers = [];
    }
    
    async createSolver(config) {
        const solver = new BatchGPUExplicitSolver(config);
        this.solvers.push(solver);
        return solver;
    }
    
    async cleanup() {
        // 清理所有GPU求解器
        for (const solver of this.solvers) {
            if (solver.destroy) {
                solver.destroy();
            }
        }
        this.solvers = [];
    }
}

// 使用示例
const manager = new GPUSimulationManager();
try {
    const solver = await manager.createSolver({ batchSize: 100 });
    // 進行仿真...
} finally {
    await manager.cleanup(); // 確保清理資源
}
```

---

## 🎊 總結

AkingSpice的GPU並行化為大規模電路仿真提供了強大的加速能力。通過合理選擇應用場景和優化配置，可以實現顯著的性能提升。

**關鍵要點**:
- 🎯 適用於 50+ 節點的中大規模電路
- ⚡ 在長時間仿真中展現最佳效果  
- 🔧 通過調整參數可達到最佳性能
- 💻 小規模電路建議使用CPU求解器

開始您的GPU並行化之旅吧！🚀