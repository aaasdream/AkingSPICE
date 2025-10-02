# 🤖 AkingSPICE AI 開發導引

> **適用對象**: 新接手AkingSPICE項目的AI助手
> **最後更新**: 2025年10月2日

## 📋 快速上手清單

### ✅ 首要任務 - 理解項目現狀
1. **項目性質**: JavaScript電路模擬器，支援CPU/GPU雙平台加速
2. **核心功能**: SPICE電路模擬、WebGPU並行計算、RLC頻域驗證
3. **測試狀態**: 所有測試通過 (46/46)，包含RLC頻域驗證
4. **項目結構**: 已清理，無臨時文件干擾

### ✅ 立即執行 - 驗證環境
```bash
# 1. 確認項目可正常運行
cd "C:\Users\user\Desktop\pythonLab\AkingSPICE"
npm test                    # 執行完整測試套件

# 2. 檢查質量門檻
npm run quality-gate        # 核心+求解器+RLC+構建

# 3. 執行特定測試
npm run test:core          # 核心模組測試
npm run test:solvers       # 求解器驗證
npm run test:rlc           # RLC頻域驗證
```

---

## 🎯 項目核心目標

### 主要技術目標
1. **雙平台一致性**: Node.js ↔ Browser 完全相同結果
2. **GPU加速**: WebGPU並行求解，性能提升10-100倍
3. **數值穩定性**: 確保長時間模擬的數值精度
4. **頻域精度**: RLC電路頻域分析準確度驗證

### 當前成就狀態
- ✅ CPU求解器: 791行，穩定運行
- ✅ GPU求解器: 625行WebGPU並行實現
- ✅ 元件庫: 11種電路元件完整支援
- ✅ 測試框架: 46個測試全部通過
- ✅ RLC驗證: 時域+頻域雙重驗證系統

---

## 📚 必讀文檔順序

### 第一階段：基礎理解
1. **`README.md`** - 項目概覽和安裝指南
2. **`docs/PROJECT_ARCHITECTURE.md`** - 完整代碼架構
3. **`DEVELOPMENT_RULES.md`** - 開發流程和規則

### 第二階段：API掌握
4. **`docs/API_REFERENCE.md`** - 完整API文檔
5. **`docs/QUICK_REFERENCE.md`** - 一頁式速查表
6. **`docs/COMPONENT_GUIDE.md`** - 元件使用詳解

### 第三階段：AI工具
7. **`docs/AI_DEVELOPMENT_OVERVIEW.md`** - AI開發輔助系統
8. **`tools/ai-dev-helper.js`** - 代碼生成工具

---

## 🧪 測試系統理解

### 測試架構層次
```
master-test.js              # 主入口，自動發現test-*.js
├── test-core-modules.js    # 核心模組 (10個測試)
├── test-solver-validation.js # 求解器驗證 (7個測試)
├── test-rlc-frequency-validation.js # RLC驗證 (6個測試)
└── framework/TestFramework.js # 測試框架核心
```

### 快速測試指令
```bash
# 完整測試套件
npm test                    # → runs master-test.js

# 分項測試
npm run test:core           # 核心模組測試
npm run test:solvers        # CPU/GPU求解器測試  
npm run test:rlc            # RLC頻域驗證測試

# 質量門檻 (CI/CD)
npm run quality-gate        # 全套測試 + 構建
```

### 測試結果解讀
- **通過標準**: 所有測試必須100%通過
- **RLC驗證**: 時域響應 + 頻域諧振雙重驗證
- **數值精度**: 誤差容限 < 0.01% 
- **性能基準**: GPU vs CPU性能對比

---

## 🔧 常用開發任務

### 添加新電路元件
```bash
# 使用AI代碼生成器
npm run dev:component mosfet    # 生成MOSFET元件模板
npm run dev:circuit llc         # 生成LLC諧振轉換器電路
```

### 調試求解器問題
```javascript
// CPU求解器調試
const solver = new ExplicitStateSolver({ debug: true });

// GPU求解器狀態檢查  
if (await GPUSolver.isSupported()) {
    const gpuSolver = new GPUSolver({ verbose: true });
}
```

### 性能分析
```bash
npm run test:perf              # 快速性能測試
npm run performance-check      # 完整性能+穩定性測試
```

---

## 🚨 重要約定與限制

### 開發流程約定
1. **修改前測試**: 任何修改前必須先跑 `npm test`
2. **向下相容**: 新版本必須與舊版本結果一致
3. **雙平台**: Node.js 和 Browser 結果必須相同
4. **測試驅動**: 新功能必須先寫測試

### 數值穩定性要求
- **時間步長**: 通常1µs，可根據電路調整
- **模擬時間**: RLC電路需15個時間常數以上
- **精度要求**: 頻域誤差 < 0.01%，時域收斂 > 95%

### GPU使用注意事項
- **環境檢測**: 必須先檢查 `GPUSolver.isSupported()`
- **記憶體管理**: WebGPU資源需要明確釋放
- **精度問題**: GPU浮點數精度可能略低於CPU

---

## 📖 API 快速查詢

### 核心求解器
```javascript
// CPU求解器 (推薦)
import { ExplicitStateSolver } from './src/core/ExplicitStateSolver.js';
const solver = new ExplicitStateSolver();

// GPU求解器 (高性能)
import { GPUSolver } from './src/core/GPUSolver.js';
const gpuSolver = new GPUSolver();
```

### 基本元件
```javascript
// 被動元件
const R1 = new Resistor('R1', 'n1', 'n2', 1000);     // 1kΩ
const C1 = new Capacitor('C1', 'n2', 'gnd', 1e-6);   // 1µF
const L1 = new Inductor('L1', 'n1', 'n2', 1e-3);     // 1mH

// 主動元件  
const V1 = new VoltageSource('V1', 'vcc', 'gnd', 5);  // 5V
const I1 = new CurrentSource('I1', 'n1', 'gnd', 0.001); // 1mA
```

### 基本模擬流程
```javascript
// 1. 建立電路
const components = [V1, R1, C1];

// 2. 初始化求解器
await solver.initialize(components, 1e-6); // 1µs時間步長

// 3. 執行模擬
const results = [];
for (let i = 0; i < 10000; i++) {
    const result = solver.step();
    results.push(result);
}

// 4. 清理資源
solver.destroy();
```

---

## 🔗 相關資源連結

### 內部文檔
- **完整API**: `docs/API_REFERENCE.md`
- **快速參考**: `docs/QUICK_REFERENCE.md`  
- **架構設計**: `docs/PROJECT_ARCHITECTURE.md`
- **元件指南**: `docs/COMPONENT_GUIDE.md`

### 開發工具
- **AI助手**: `tools/ai-dev-helper.js`
- **測試框架**: `test/framework/TestFramework.js`
- **構建配置**: `rollup.config.js`

### 測試文件
- **核心測試**: `test/test-core-modules.js`
- **求解器測試**: `test/test-solver-validation.js`
- **RLC驗證**: `test/test-rlc-frequency-validation.js`

---

## 💡 AI開發建議

### 首次接手時
1. 先執行 `npm test` 確認環境
2. 閱讀 `docs/QUICK_REFERENCE.md` 快速上手
3. 使用 `npm run dev:help` 查看AI工具
4. 從簡單的RC電路開始理解

### 解決問題時  
1. 優先查閱 `docs/API_REFERENCE.md`
2. 參考 `test/` 目錄下的測試案例
3. 使用 `tools/ai-dev-helper.js` 生成模板
4. 遵循 `DEVELOPMENT_RULES.md` 流程

### 添加功能時
1. 先寫測試 (TDD方式)
2. 確保向下相容性
3. 驗證雙平台一致性
4. 更新相關文檔

---

**🎉 現在您已經具備了開發AkingSPICE所需的所有背景知識！**

> 💡 **小提示**: 項目已經非常成熟穩定，目前有46個測試全部通過，包含RLC頻域驗證系統。新AI可以安心在這個堅實的基礎上繼續開發！