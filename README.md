# JSSolver-PE (JavaScript Solver for Power Electronics)

一個專為動態電路模擬設計的純 JavaScript 函式庫，特別針對含有頻繁開關事件的電力電子電路。

## 🎯 專案願景

JSSolver-PE 提供一個高效、穩定且易於整合的求解器，具備以下特色：

- **效能優先**: 針對時域暫態分析進行深度優化
- **控制導向**: 提供互動式 API，允許外部程式即時讀取電路狀態並改變元件參數
- **模組化設計**: 元件模型與求解器核心分離，支援自訂元件
- **SPICE 相容**: 輸入網表格式與傳統 SPICE 標準保持一致

## 🚀 快速開始

### 安裝依賴
```bash
npm install
```

### 執行範例
```bash
npm run example
```

### 執行測試
```bash
npm test
```

## 📋 功能特色

### v0.1 (當前版本)
- ✅ 修正節點分析法 (MNA) 矩陣建立
- ✅ LU 分解線性求解器
- ✅ 基礎元件模型 (R, C, L, VDC)
- ✅ 後向歐拉暫態分析
- ✅ 批次模擬 API

### v0.2 (規劃中)
- 🔄 理想開關模型 (D, M)
- 🔄 互動式/步進式 API
- 🔄 外部可控 MOSFET 模型

## 🏗 專案架構

```
jssolver-pe/
├── src/                    # 核心程式碼
│   ├── core/              # 核心演算法
│   │   ├── solver.js      # 主求解器類別
│   │   ├── mna.js         # 修正節點分析法
│   │   └── linalg.js      # 線性代數運算
│   ├── components/        # 元件模型
│   │   ├── base.js        # 基礎元件類別
│   │   ├── resistor.js    # 電阻模型
│   │   ├── capacitor.js   # 電容模型
│   │   ├── inductor.js    # 電感模型
│   │   └── sources.js     # 電壓/電流源
│   ├── analysis/          # 分析演算法
│   │   ├── transient.js   # 暫態分析
│   │   └── dc.js          # 直流工作點分析
│   ├── parser/            # 網表解析
│   │   └── netlist.js     # SPICE 網表解析器
│   └── index.js           # 主入口
├── test/                  # 測試檔案
├── examples/              # 範例程式
└── docs/                  # 文件
```

## 📖 使用範例

### 批次模擬 API

```javascript
import JSSolverPE from './src/index.js';

// 簡單 RC 電路網表
const netlist = `
* Simple RC Circuit
VIN 1 0 DC(5)
R1 1 2 1000
C1 2 0 1e-6
.tran 1us 5ms
`;

// 建立求解器並執行分析
const solver = new JSSolverPE(netlist);
const result = await solver.runAnalysis('.tran 1us 5ms');

// 獲取結果
const time = result.getVector('time');
const v_out = result.getVector('V(2)');
```

### 互動式 API (v0.2)

```javascript
// 初始化求解器
const solver = new JSSolverPE(netlist);
solver.initTransient('1us', '5ms');

// 模擬迴圈
while (!solver.isFinished()) {
    // 讀取電路狀態
    const voltage = solver.getNodeVoltage('N_FEEDBACK');
    
    // 控制邏輯
    const gateState = myController.update(voltage);
    solver.setComponentState('M1', { gate: gateState });
    
    // 執行下一步
    solver.step();
}
```

## 🧪 測試

專案包含完整的測試套件，驗證各個模組的正確性：

```bash
npm test                    # 執行所有測試
npm run test:watch         # 監控模式執行測試
```

## 📈 開發路線圖

- **v0.1**: 核心 MNA 求解器與基礎元件 ✅
- **v0.2**: 理想開關模型與互動式 API
- **v0.3**: 更多訊號源與受控源
- **v1.0**: 可變時間步長與非線性求解器

## 🤝 貢獻

歡迎提交 Issue 和 Pull Request！

## 📄 授權

MIT License - 詳見 [LICENSE](LICENSE) 檔案。

---

## 🔧 JavaScript 調試工具

本專案還包含完整的 JavaScript 調試環境：

### 文件說明

1. **`index.html`** - 瀏覽器版本的JavaScript測試頁面
2. **`debug-test.js`** - Node.js版本的JavaScript測試腳本  
3. **`.vscode/launch.json`** - VS Code調試配置

### 調試工具使用方法

#### 方法1: 瀏覽器測試（推薦）
1. 在VS Code中右鍵點擊 `index.html`
2. 選擇 "在默認瀏覽器中打開"
3. 點擊頁面上的按鈕進行測試
4. 查看自動輸出結果，無需打開Console

#### 方法2: Node.js測試
```bash
node debug-test.js
```

#### 方法3: VS Code調試
1. 按F5選擇調試配置
2. 支援斷點調試和變數檢視