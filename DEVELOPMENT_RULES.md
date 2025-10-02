# AkingSPICE 開發規則與流程

## 🎯 核心原則

### 原則 1：測試驅動開發 (TDD)
**所有核心功能與元件的修改都必須先通過完整測試驗證**

### 原則 2：向下相容性
**新版本必須與舊版本結果完全一致**

### 原則 3：雙平台一致性
**網頁與 Node.js 環境的執行結果必須完全相同**

---

## 🔄 開發流程

### 1. 修改前準備
在修改任何核心程式碼之前，必須執行以下步驟：

```bash
# 1. 執行完整測試套件，確保目前程式碼沒有問題
node test/master-test.js

# 2. 確認測試結果
# ✅ 所有測試必須通過
# ❌ 如果有測試失敗，必須先修復現有問題
```

### 2. 建立新功能測試
為新功能或修改建立對應的測試：

```javascript
// 在 test/ 目錄下建立 test-{feature-name}.js
import { registerTest, assert } from './framework/TestFramework.js';

registerTest(
    'Your Feature Name',
    async () => {
        // 設定測試環境
        return { /* 測試上下文 */ };
    },
    {
        'should do something correctly': async (context) => {
            // 測試案例
            assert.equal(actual, expected);
        }
    }
);
```

### 3. 實作與測試循環
採用紅綠重構循環：

1. **紅**：寫測試，確認測試會失敗
2. **綠**：實作最小程式碼讓測試通過
3. **重構**：改善程式碼品質，確保測試持續通過

### 4. 驗證與提交
```bash
# 執行完整測試套件
node test/master-test.js

# 確認所有測試通過後才能提交
```

---

## 📁 檔案組織規則

### 核心檔案結構
```
src/
├── core/              # 🔴 核心計算引擎 (嚴格測試)
├── components/        # 🔴 電路元件 (嚴格測試)
├── analysis/          # 🔴 分析演算法 (嚴格測試)
├── parser/            # 🟡 解析器 (一般測試)
└── utils/             # 🟡 工具函數 (一般測試)

test/
├── framework/         # 測試框架
├── master-test.js     # 主測試入口
├── test-core-*.js     # 核心功能測試
├── test-component-*.js # 元件測試
└── test-integration-*.js # 整合測試
```

### 測試覆蓋要求

| 類別 | 測試覆蓋率 | 數值精確度 | 效能要求 |
|------|-----------|------------|----------|
| 🔴 核心引擎 | 100% | < 1e-10 | 基準測試 |
| 🔴 電路元件 | 100% | < 1e-12 | 元件測試 |
| 🔴 分析演算法 | 100% | < 1e-10 | 收斂測試 |
| 🟡 其他功能 | > 80% | 適當 | 功能測試 |

---

## 🧪 測試分類與要求

### 1. 單元測試 (Unit Tests)
- **目標**：測試個別函數與類別
- **要求**：快速執行 (< 100ms)
- **覆蓋**：所有公開 API

### 2. 整合測試 (Integration Tests)  
- **目標**：測試元件間互動
- **要求**：模擬真實使用情境
- **覆蓋**：主要使用流程

### 3. 數值穩定性測試 (Numerical Stability)
- **目標**：確保長時間運算穩定
- **要求**：無發散、無累積誤差
- **覆蓋**：迭代演算法、矩陣運算

### 4. 效能基準測試 (Performance Benchmarks)
- **目標**：確保效能不退化
- **要求**：建立效能基準線
- **覆蓋**：關鍵計算路徑

### 5. 跨平台測試 (Cross-Platform Tests)
- **目標**：確保雙平台一致性
- **要求**：完全相同的結果
- **覆蓋**：所有核心功能

---

## 🛡️ 品質門檻

### 提交前檢查清單

- [ ] **單元測試**：所有新程式碼都有對應測試
- [ ] **整合測試**：修改不破壞現有功能
- [ ] **數值測試**：計算結果在容錯範圍內
- [ ] **效能測試**：沒有顯著效能退化
- [ ] **文件更新**：API 變更有對應文件
- [ ] **程式碼審查**：符合程式碼風格

### 自動化檢查

```bash
# 完整檢查腳本
npm run check-all

# 這個指令會執行：
# 1. ESLint 程式碼檢查
# 2. 完整測試套件
# 3. 效能基準測試  
# 4. 跨平台驗證
# 5. 文件產生
```

---

## ⚠️ 重要限制

### 不可破壞的規則

1. **絕對不可以修改測試讓失敗的程式碼通過**
   - 如果測試失敗，修復程式碼而不是測試
   - 只有在需求變更時才修改測試

2. **數值精確度不可退化**
   - 新版本結果必須與舊版本一致
   - 容錯範圍只能收緊，不能放鬆

3. **效能不可顯著退化**
   - 新版本效能不可低於舊版本 20%
   - 如有必要，必須提供效能改善方案

4. **API 向下相容性**
   - 不可破壞現有 API
   - 新增功能可以，但不能改變既有行為

---

## 🔧 開發工具

### 推薦的開發工具
```json
{
  "editor": "VS Code",
  "extensions": [
    "ESLint",
    "Prettier",
    "GitHub Copilot",
    "Jest Runner"
  ],
  "settings": "使用專案提供的 .vscode/settings.json"
}
```

### 測試執行方式

```bash
# 快速測試 (只執行單元測試)
npm run test:unit

# 完整測試 (所有測試類別)
npm run test:all

# 效能測試
npm run test:performance  

# 持續監視測試
npm run test:watch

# 產生測試報告
npm run test:report
```

---

## 📊 測試報告

### 自動產生報告
每次測試執行後會自動產生：

- **test-report.json**：詳細測試結果
- **coverage-report.html**：程式碼覆蓋率
- **performance-report.json**：效能基準資料

### CI/CD 整合
```yaml
# GitHub Actions 範例
name: Test Suite
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Setup Node.js
        uses: actions/setup-node@v2
        with:
          node-version: '18'
      - name: Install dependencies
        run: npm install
      - name: Run tests
        run: npm run test:all
      - name: Check coverage
        run: npm run test:coverage
```

---

## 🎓 最佳實踐

### 1. 測試命名規範
```javascript
// ✅ 好的測試名稱
'should calculate current correctly using Ohms law'
'should throw error when resistance is zero'
'should converge within 100 iterations'

// ❌ 不好的測試名稱  
'test1'
'basic test'
'it works'
```

### 2. 測試隔離
```javascript
// ✅ 每個測試都是獨立的
registerTest('Resistor Tests', 
    async () => ({ resistor: new Resistor(100) }), // 每次都建立新實例
    {
        'test1': async (context) => { /* 使用 context.resistor */ },
        'test2': async (context) => { /* 使用新的 context.resistor */ }
    }
);
```

### 3. 數值比較
```javascript
// ✅ 使用容錯比較
assert.approximately(actual, expected, 1e-10);

// ❌ 直接比較浮點數
assert.equal(0.1 + 0.2, 0.3); // 可能會失敗
```

### 4. 錯誤測試
```javascript
// ✅ 測試預期的錯誤
await assert.throws(
    () => new Resistor(0),
    'resistance cannot be zero'
);
```

---

## 🚀 持續改進

### 定期審查
- **每週**：檢視測試報告，識別問題區域
- **每月**：評估測試覆蓋率，補強不足
- **每季**：更新效能基準，設定新目標

### 社群貢獻
- 新貢獻者必須熟讀本文件
- 所有 PR 都必須包含對應測試
- 維護者負責確保規則被遵循

---

*這份文件是活的文件，隨著專案發展會持續更新*

*最後更新：2025年10月*