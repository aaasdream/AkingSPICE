# KLU WebAssembly 集成指南

本文檔提供了在 AkingSPICE 中使用 KLU 稀疏矩陣求解器 WebAssembly 版本的完整指南。

## 🎯 概述

KLU 是 SuiteSparse 套件中的高性能稀疏 LU 分解求解器，專門針對電路仿真中常見的矩陣結構進行優化。通過 WebAssembly，我們可以在瀏覽器和 Node.js 中直接使用 KLU 的強大功能。

### 主要特點

- ✅ **高性能**: C 語言實現，編譯為 WebAssembly
- ✅ **記憶體效率**: 稀疏矩陣存儲，支持大規模問題
- ✅ **穩定性**: 數值透視策略確保數值穩定
- ✅ **易用性**: TypeScript 包裝，類型安全
- ✅ **兼容性**: 支持 Node.js 和現代瀏覽器

## 📦 安裝和建置

### 先決條件

1. **Emscripten SDK** (v3.1.45 或更新)
2. **CMake** (v3.15 或更新)  
3. **Node.js** (v18 或更新，可選，用於測試)

### Windows 環境建置

```batch
# 1. 安裝 Emscripten
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk
emsdk install latest
emsdk activate latest
emsdk_env.bat

# 2. 返回專案目錄並建置
cd /path/to/AkingSPICE/wasm
build_klu_wasm.bat
```

### Linux/macOS 環境建置

```bash
# 1. 安裝 Emscripten
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk  
./emsdk install latest
./emsdk activate latest
source ./emsdk_env.sh

# 2. 返回專案目錄並建置
cd /path/to/AkingSPICE/wasm
chmod +x build_klu_wasm.sh
./build_klu_wasm.sh
```

建置成功後，會在 `wasm/klu/` 目錄下生成：
- `klu.js` - Emscripten 生成的 JavaScript 膠水程式碼
- `klu.wasm` - KLU WebAssembly 模組

## 🚀 基本使用

### 在 TypeScript/JavaScript 中使用

```typescript
import { KluSolver, CSCMatrix } from './wasm/klu/index';

async function solveExample() {
  // 創建求解器
  const solver = new KluSolver({
    tolerance: 1e-12,
    orderingMethod: 'amd'
  });
  
  // 初始化
  await solver.initialize();
  
  // 準備 CSC 格式矩陣
  const matrix: CSCMatrix = {
    rows: 3,
    cols: 3,
    nnz: 7,
    colPointers: [0, 2, 4, 7],
    rowIndices: [0, 2, 0, 1, 1, 2, 2],
    values: [2.0, 1.0, 1.0, 3.0, 2.0, 1.0, 4.0]
  };
  
  const b = [1.0, 2.0, 3.0];
  
  // 求解 Ax = b
  await solver.analyze(matrix);
  await solver.factor(matrix);
  const x = await solver.solve(b);
  
  console.log('解:', x);
  
  // 清理
  solver.dispose();
}
```

### 在 SparseMatrix 中使用

```typescript
import { SparseMatrix } from './src/math/sparse/matrix';

// 創建稀疏矩陣
const A = new SparseMatrix(3, 3);
A.set(0, 0, 2.0);
A.set(0, 1, 1.0);
A.set(1, 0, 1.0);
A.set(1, 1, 3.0);
A.set(2, 2, 4.0);

// 設置為 KLU 求解器
A.setSolverMode('klu');

// 求解
const b = Vector.from([1, 2, 3]);
const x = await A.solveAsync(b);

console.log('解:', x.toArray());
```

## 🎛️ 配置選項

### KluOptions 介面

```typescript
interface KluOptions {
  tolerance?: number;           // 數值容忍度 (預設: 0.001)
  memoryGrowth?: number;        // 記憶體增長因子 (預設: 1.2)
  initialMemory?: number;       // 初始記憶體大小 (預設: 10)
  enablePivoting?: boolean;     // 啟用透視 (預設: true)
  enableScaling?: boolean;      // 啟用縮放 (預設: true)
  orderingMethod?: 'amd' | 'colamd' | 'btf' | 'natural';  // 排序方法
  maxIterativeRefinement?: number;  // 最大迭代精化次數
}
```

### 求解器模式設置

```typescript
// 在 SparseMatrix 中設置求解器模式
matrix.setSolverMode('klu');     // 使用 KLU WASM
matrix.setSolverMode('numeric'); // 使用 numeric.js (預設)
matrix.setSolverMode('iterative'); // 使用迭代求解器
```

## 📊 性能指標

### 條件數檢查

```typescript
// 獲取矩陣條件數
const conditionNumber = await solver.getConditionNumber();
if (conditionNumber > 1e12) {
  console.warn('矩陣可能病態，條件數:', conditionNumber);
}
```

### 統計資訊

```typescript
// 獲取詳細統計
const stats = solver.getStatistics();
console.log('數值秩:', stats.numericalRank);
console.log('浮點運算次數:', stats.flops);
console.log('記憶體重新分配次數:', stats.numRealloc);
```

## 🔧 進階使用

### 重新分解 (Refactorization)

當矩陣結構不變但數值改變時，可以使用更高效的重新分解：

```typescript
// 首次分解
await solver.analyze(matrix);
await solver.factor(matrix);

// 矩陣數值改變 (結構不變)
matrix.values = newValues;

// 重新分解 (比完整分解快很多)
await solver.refactor(matrix);
const x = await solver.solve(b);
```

### 轉置求解

```typescript
// 求解 A^T * x = b
const x = await solver.solve(b, true);  // transpose = true
```

### 多重右側向量

目前版本支持單一右側向量，未來版本將支持多重右側向量。

## 🐛 故障排除

### 常見問題

1. **編譯錯誤**
   ```
   解決方法: 檢查 Emscripten 環境是否正確設定
   命令: emcc --version
   ```

2. **記憶體不足**
   ```typescript
   // 增加初始記憶體
   const solver = new KluSolver({
     initialMemory: 50  // 增加到 50MB
   });
   ```

3. **數值不穩定**
   ```typescript
   // 降低容忍度
   const solver = new KluSolver({
     tolerance: 1e-15
   });
   ```

4. **模組載入失敗**
   ```
   確保 klu.js 和 klu.wasm 在正確路徑
   檢查 Web 伺服器 MIME 類型設定
   ```

### 調試模式

在開發環境中啟用更詳細的錯誤報告：

```bash
# 編譯時啟用調試
emcc ... -s ASSERTIONS=1 -s SAFE_HEAP=1 -O1
```

## 🧪 測試

### 運行測試套件

```bash
# Node.js 環境
node examples/klu_wasm_test.js

# 或使用 TypeScript
npm run test:klu
```

### 自定義測試

```typescript
import { runAllTests } from './examples/klu_wasm_test';

// 運行所有測試
await runAllTests();
```

## 📈 性能比較

| 求解器 | 小矩陣 (<100) | 中矩陣 (100-1k) | 大矩陣 (>1k) | 記憶體使用 |
|--------|---------------|------------------|---------------|------------|
| KLU WASM | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| numeric.js | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐ |
| 迭代求解器 | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |

## 🔮 未來計劃

- [ ] 支持多重右側向量
- [ ] 增量更新支持
- [ ] 更多預排序選項
- [ ] GPU 加速版本 (WebGL)
- [ ] 平行化支持
- [ ] 自適應精度控制

## 📚 參考資料

- [SuiteSparse 官方文檔](https://people.engr.tamu.edu/davis/suitesparse.html)
- [KLU 用戶指南](https://people.engr.tamu.edu/davis/publications/files/klu_user_guide.pdf)
- [Emscripten 文檔](https://emscripten.org/docs/)
- [WebAssembly 規範](https://webassembly.github.io/spec/)

## 🆘 支持

如遇問題，請：
1. 檢查本文檔的故障排除章節
2. 查看 GitHub Issues
3. 提交詳細的錯誤報告

---
*AkingSPICE KLU WebAssembly 模組 - 高性能稀疏矩陣求解*