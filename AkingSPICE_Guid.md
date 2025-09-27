# AkingSPICE 完整使用指南 v2.0
**一份專為 AI 助手設計的、支援高階電力電子拓撲的綜合模擬指南**

## 📋 版本更新摘要
- **v2.0 (2025-09-28)**: 新增進階元件支援，包含多繞組變壓器、電壓控制MOSFET、完整受控源集、三相電源
- **支援拓撲**: LLC諧振轉換器、VIENNA PFC、T-type PFC、Baby Boost PFC、多輸出隔離電源
- **核心創新**: 業界首創JavaScript高階電力電子SPICE求解器

## 🚀 快速開始 (3步驟)

### 1. 初始化與導入
```javascript
import { 
    AkingSPICE, 
    // 基礎元件
    Resistor, Capacitor, Inductor, VoltageSource, CurrentSource,
    Diode, MOSFET, 
    // 🔥 進階元件 (v2.0新增)
    VoltageControlledMOSFET, MultiWindingTransformer, 
    VCVS, VCCS, CCCS, CCVS, ThreePhaseSource 
} from './src/index.js';

const solver = new AkingSPICE();
solver.setDebug(true); // 強烈建議啟用
```

### 2. 建立電路
```javascript
solver.reset();  // 總是先重置
solver.components = [
    new VoltageSource('V1', ['input', '0'], 12.0),
    new Resistor('R1', ['input', 'output'], 1000),
    // 🔥 新功能：智慧型電壓控制MOSFET (自動根據Vgs決定開關狀態)
    new VoltageControlledMOSFET('M1', ['output', 'gate', '0'], {
        Vth: 2.0, Ron: 0.01, modelType: 'NMOS'
    })
];
solver.isInitialized = true;
```

### 3. 執行分析
```javascript
// 基礎分析
const dcResult = await solver.runDCAnalysis();

// 🔥 高階PWM分析 (推薦用於開關電路)
const results = await solver.runSteppedSimulation(pwmControlFunc, {
    stopTime: 1e-3, timeStep: 1e-7
});
```

## 🔧 完整元件庫 (v2.0 - 支援高階拓撲)

### 基礎元件
| 元件 | 語法 | 範例 |
|---|---|---|
| **電阻** | `new Resistor(name, [n1,n2], value)` | `new Resistor('R1', ['a','b'], 1000)` |
| **電容** | `new Capacitor(name, [n1,n2], value, {ic})` | `new Capacitor('C1', ['a','0'], 1e-6, {ic: 0})` |
| **電感** | `new Inductor(name, [n1,n2], value, {ic})` | `new Inductor('L1', ['a','b'], 1e-3, {ic: 0})` |
| **電壓源** | `new VoltageSource(name, [+,-], voltage)` | `new VoltageSource('V1', ['in','0'], 12)` |
| **電流源** | `new CurrentSource(name, [+,-], current)` | `new CurrentSource('I1', ['in','0'], 1.0)` |
| **二極體** | `new Diode(name, [a,k], {params})` | `new Diode('D1', ['a','b'], {Vf:0.7, Ron:0.01})` |
| **MOSFET** | `new MOSFET(name, [d,s], {params})` | `new MOSFET('M1', ['a','b'], {Ron:0.01, Roff:1e6})` |

### 🔥 進階元件 (v2.0 新功能)
| 元件 | 語法 | 應用場景 |
|---|---|---|
| **電壓控制MOSFET** | `new VoltageControlledMOSFET(name, [d,g,s], {Vth, Ron, modelType})` | 閘極驅動電路、智慧開關 |
| **多繞組變壓器** | `new MultiWindingTransformer(name, {windings, couplingMatrix})` | LLC轉換器、隔離電源 |
| **三相電源** | `new ThreePhaseSource(name, {nodes, voltage, frequency, connection})` | VIENNA PFC、三相系統 |
| **電流控制電流源** | `new CCCS(name, [out+,out-], [sens+,sens-], gain)` | 電流放大器、電流鏡 |
| **電流控制電壓源** | `new CCVS(name, [out+,out-], [sens+,sens-], gain)` | 跨阻放大器、電流感測 |
| **電壓控制電流源** | `new VCCS(name, [out+,out-], [ctrl+,ctrl-], gain)` | 跨導放大器 |
| **電壓控制電壓源** | `new VCVS(name, [out+,out-], [ctrl+,ctrl-], gain)` | 電壓放大器 |

## ⚡️ PWM 控制方式

### 推薦：高階 API (`runSteppedSimulation`)
這是最簡單可靠的方式，內部已處理好迴圈。
```javascript
// PWM 控制函數 (AI 需要根據需求生成此邏輯)
const pwmControl = (time) => {
    const period = 1e-5;  // 100kHz
    const duty = 0.5;
    const high_side_on = (time % period) < (period * duty);
    return {
        'MSW_H': high_side_on,
        'MSW_L': !high_side_on // 互補開關
    };
};

// 執行模擬
const results = await solver.runSteppedSimulation(pwmControl, {
    stopTime: 1e-3, timeStep: 1e-7
});
```

### 🔥 進階應用：電壓控制開關 (v2.0)
```javascript
// 智慧型MOSFET - 自動根據閘極電壓決定開關狀態
const smartMosfet = new VoltageControlledMOSFET('Q1', ['drain', 'gate', 'source'], {
    Vth: 2.0,        // 閾值電壓
    Ron: 0.01,       // 導通電阻
    modelType: 'NMOS' // NMOS或PMOS
});

// 閘極驅動電壓源
const gateDriver = new VoltageSource('VG1', ['gate', '0'], 0, 'PULSE', {
    period: 1e-5, dutyCycle: 0.5, amplitude: 15
});
```

### 可選：低階手動迴圈
用於需要每一步都進行複雜判斷的場景。
```javascript
await solver.initSteppedTransient({ stopTime: 1e-3, timeStep: 1e-7 });

while (!solver.isFinished()) {
    const time = solver.getCurrentTime();
    const controlState = /* 你的 PWM 或其他控制邏輯 */;
    const result = solver.step(controlState);
    const voltage = result.nodeVoltages['節點名'];
}
```

## 📊 結果獲取
```javascript
// 從 runSteppedSimulation 的結果中獲取
const lastStep = results.steps[results.steps.length - 1];
const v_out = lastStep.nodeVoltages['out'];      // 最後一步的節點電壓
const i_l1 = lastStep.branchCurrents['L1'];     // 最後一步的電感電流
const m_state = lastStep.componentStates['MSW_H']; // 元件狀態

// 遍歷所有步驟
results.steps.forEach(step => {
    console.log(`t=${step.time}, V_out=${step.nodeVoltages['out']}`);
});
```

## 🎯 高階拓撲範例 (v2.0)

### LLC 諧振轉換器 (完整範例)
```javascript
// 創建LLC轉換器實例 - 展示多繞組變壓器應用
import { runLLCExample } from './llc-resonant-example.js';

// 一鍵運行完整LLC範例
const llcConverter = runLLCExample();

// 手動建構LLC核心部分
solver.components = [
    // 諧振腔
    new Inductor('Lr', ['bridge', 'primary+'], 15e-6),      // 諧振電感
    new Capacitor('Cr', ['primary+', 'primary-'], 68e-9),   // 諧振電容
    
    // 🔥 多繞組變壓器 (LLC核心)
    new MultiWindingTransformer('T1', {
        windings: [
            {name: 'primary', nodes: ['primary+', 'primary-'], turns: 15},
            {name: 'secondary', nodes: ['secondary+', 'secondary-'], turns: 1}
        ],
        baseMagnetizingInductance: 120e-6,
        couplingMatrix: [[1.0, 0.98], [0.98, 1.0]]
    }),
    
    // 同步整流 (使用電壓控制MOSFET)
    new VoltageControlledMOSFET('SR1', ['output', 'sr_gate1', 'secondary+'], {
        Vth: 1.0, Ron: 0.005, modelType: 'NMOS'
    })
];
```

### VIENNA PFC (三相應用)
```javascript
// 🔥 三相輸入電源
const threePhasePower = new ThreePhaseSource('AC_IN', {
    nodes: ['L1', 'L2', 'L3', 'N'],
    voltage: 220,          // 線電壓220V RMS
    frequency: 50,         // 50Hz
    connection: 'wye'      // 星形連接
});

// 三相整流二極體橋
solver.components = [
    threePhasePower,
    new Diode('D1', ['L1', 'DC+']),
    new Diode('D2', ['L2', 'DC+']),
    new Diode('D3', ['L3', 'DC+']),
    new Diode('D4', ['DC-', 'L1']),
    new Diode('D5', ['DC-', 'L2']),
    new Diode('D6', ['DC-', 'L3'])
];
```

### 電流感測與控制回饋
```javascript
// 🔥 使用CCVS進行電流感測
const currentSensor = new CCVS('I_SENSE', ['i_feedback', '0'], ['load+', 'load-'], 0.1);

// 電流放大器 (CCCS)
const currentAmplifier = new CCCS('AMP', ['out+', 'out-'], ['sense+', 'sense-'], 10);

// 電壓控制電流源 (跨導放大器)
const transconductor = new VCCS('GM', ['out+', 'out-'], ['ctrl+', 'ctrl-'], 0.01);
```

## ⚠️ AI 必須遵守的黃金規則 (v2.0 更新)

1.  **永遠先 `solver.reset()`**: 建立新電路前的第一步。
2.  **確保電流路徑完整**: 對於 Buck/Boost 等電感性開關電路，**必須提供續流路徑**。
3.  **時間步長是關鍵**: `timeStep` **必須遠小於** PWM 開關週期。推薦值為週期的 `1/100`。
4.  **接地節點為 `'0'`**: 所有電路都需要參考地。
5.  **設定 `solver.isInitialized = true`**: 在定義完元件後設定。
6.  **優先使用 `runSteppedSimulation`**: 最高階、最可靠的 API。
7.  **🔥 進階元件注意事項**:
   - **VoltageControlledMOSFET**: 需要閘極電壓源驅動
   - **MultiWindingTransformer**: 確保耦合矩陣對稱且合理
   - **ThreePhaseSource**: 星形連接需4個節點，三角形需3個
   - **受控源**: 注意控制端與輸出端的節點定義

🎯 **這份指南讓任何 AI 助手都能高效、正確地使用 AkingSPICE 進行高階電力電子模擬！**

---

## 📖 詳細使用指南

### 核心工作流程
AI 應遵循以下核心步驟完成模擬：

1. **初始化**: 創建 `AkingSPICE` 實例並導入所需元件
2. **電路建構**: 重置解算器，定義元件陣列
3. **模擬執行**: 選擇適當的分析方法
4. **結果分析**: 提取電壓、電流波形或數值

### 🔥 進階元件詳細說明

#### 1. VoltageControlledMOSFET - 智慧型開關
```javascript
const smartMOSFET = new VoltageControlledMOSFET('M1', ['drain', 'gate', 'source'], {
    Vth: 2.0,           // 閾值電壓 (V)
    Kp: 100e-6,         // 跨導參數 (A/V²)
    W: 100e-6,          // 通道寬度 (m)
    L: 10e-6,           // 通道長度 (m)
    Ron: 0.01,          // 導通電阻 (Ω)
    modelType: 'NMOS'   // 'NMOS' 或 'PMOS'
});

// 工作區域自動判斷：OFF, LINEAR, SATURATION
// 根據 Vgs 與 Vth 的關係自動切換
```

#### 2. MultiWindingTransformer - 多繞組耦合
```javascript
const llcTransformer = new MultiWindingTransformer('T1', {
    windings: [
        {name: 'primary', nodes: ['P+', 'P-'], turns: 15, inductance: 120e-6},
        {name: 'secondary', nodes: ['S+', 'S-'], turns: 1, inductance: 0.53e-6},
        {name: 'auxiliary', nodes: ['AUX+', 'AUX-'], turns: 2, inductance: 2.1e-6}
    ],
    baseMagnetizingInductance: 120e-6,
    couplingMatrix: [
        [1.0,  0.98, 0.95],  // 主繞組自耦合、與次級、與輔助
        [0.98, 1.0,  0.92],  // 次級與主、自耦合、與輔助
        [0.95, 0.92, 1.0 ]   // 輔助與主、與次級、自耦合
    ]
});

// 支援任意繞組數和耦合係數
```

#### 3. ThreePhaseSource - 三相系統
```javascript
// 星形連接 (Wye)
const wyeSource = new ThreePhaseSource('3PH', {
    nodes: ['A', 'B', 'C', 'N'],    // 三相 + 中性點
    voltage: 220,                    // 線電壓 RMS (V)
    frequency: 50,                   // 頻率 (Hz)
    connection: 'wye',               // 星形連接
    phaseSequence: 'ABC'             // 正序
});

// 三角形連接 (Delta)
const deltaSource = new ThreePhaseSource('3PH_D', {
    nodes: ['AB', 'BC', 'CA'],       // 三個線電壓節點
    voltage: 380,                    // 線電壓 RMS (V)
    frequency: 60,                   // 60Hz
    connection: 'delta'              // 三角形連接
});
```

### 支援的高階拓撲

#### LLC 諧振轉換器
- **特點**: 軟切換、高效率、寬範圍調節
- **核心元件**: 多繞組變壓器、諧振腔 (Lr-Cr)
- **應用**: 伺服器電源、LED驅動、快充適配器
```javascript
// 諧振頻率計算
const fr1 = 1 / (2 * Math.PI * Math.sqrt(Lr * Cr));                    // 主諧振頻率
const fr2 = 1 / (2 * Math.PI * Math.sqrt((Lr + Lm) * Cr));             // 次諧振頻率
```

#### VIENNA PFC 整流器
- **特點**: 三相、單向導通、功率因數校正
- **核心元件**: 三相電源、三電平拓撲
- **應用**: 高功率伺服器、工業電源

#### T-type 三電平
- **特點**: 中性點鉗位、低dv/dt、高頻率
- **核心元件**: 三相電源、多電平開關
- **應用**: 太陽能逆變器、馬達驅動

### 🚀 效能優化建議

1. **時間步長選擇**:
   - PWM頻率 100kHz → timeStep ≤ 100ns
   - 諧振頻率 150kHz → timeStep ≤ 67ns
   - 一般規則: timeStep = 1/(frequency × 100)

2. **收斂性改善**:
   - 適當的初始條件設定 (ic 參數)
   - 漸進式加載 (軟啟動)
   - 阻尼電阻消除數值振盪

3. **記憶體管理**:
   - 長時間模擬時定期清理中間結果
   - 使用適當的停止條件
   - 避免過小的時間步長

## 🎉 成功案例展示

### 完整 LLC 設計流程
```javascript
// 1. 導入範例並運行
import { runLLCExample } from './llc-resonant-example.js';
const llc = runLLCExample();

// 2. 查看設計報告
console.log(llc.generateDesignReport());

// 3. 分析諧振特性
const resonantInfo = llc.calculateResonantFrequencies();
console.log(`fr1 = ${resonantInfo.fr1/1000} kHz`);
console.log(`Operating region: ${resonantInfo.operating_region}`);

// 4. 可選：運行暫態分析
// const results = await llc.runTransientAnalysis(50e-6, 100e-9);
```

### 測試進階元件
```javascript
// 運行完整測試套件
import('./test-advanced-components.js').then(() => {
    console.log('所有進階元件測試完成！');
});
```

---

## 🔧 故障排除指南

### 常見問題與解決方案

**Q1: VoltageControlledMOSFET 不切換？**
- 檢查閘極電壓是否超過閾值電壓 (Vth)
- 確認閘極有適當的驅動電路
- 驗證 modelType 設定正確 (NMOS/PMOS)

**Q2: MultiWindingTransformer 耦合不正確？**
- 檢查耦合矩陣是否對稱且對角線為1.0
- 確認繞組匝數比合理
- 驗證基準電感設定正確

**Q3: ThreePhaseSource 無法創建？**
- 檢查節點數量：星形需4個，三角形需3個
- 確認電壓和頻率為正值
- 驗證 connection 參數 ('wye' 或 'delta')

**Q4: LLC 諧振頻率不匹配？**
- 重新檢查 Lr, Lm, Cr 數值
- 確認變壓器設計參數
- 調整開關頻率至合適工作區域

**Q5: 受控源增益設定？**
- CCCS/CCVS: 增益單位分別為 A/A 和 V/A
- VCCS/VCVS: 增益單位分別為 A/V 和 V/V
- 注意控制端與輸出端的極性定義

---

## 🌟 版本演進歷程

**v1.0**: 基礎Buck轉換器模擬
- 支援基本被動元件
- 簡單DC/暫態分析
- MOSFET開關模型

**v2.0** (當前): 高階電力電子平台
- ✅ 16+ 專業元件模型
- ✅ 智慧型電壓控制開關
- ✅ 多繞組變壓器耦合
- ✅ 完整三相系統支援
- ✅ LLC/VIENNA/T-type 拓撲就緒
- ✅ 工程級數值穩定性

**v3.0** (規劃中): 商業級精度
- 頻域AC分析
- 參數掃描與優化
- 熱效應建模
- GUI電路繪製介面

---

🎯 **AkingSPICE v2.0 - 電力電子工程師的JavaScript仿真利器！**
```

---

### 檔案 2：`AI-USAGE-GUIDE.md` (AI 詳細使用指南)

這份文件提供了更詳盡的說明、範例和背景知識，幫助 AI 理解「為什麼」要這麼做。

```markdown
# AkingSPICE AI 使用指南
**一份專為 AI 助手設計的、用於正確進行電力電子模擬的綜合指南**

## 1. 概述
AkingSPICE 是一個專為電力電子設計的 JavaScript 電路模擬器。本指南將引導 AI 如何透過程式化 API 來建立、模擬和分析電路，特別是 PWM 控制的開關電源。

## 2. 核心工作流程
AI 應遵循以下四個核心步驟來完成一次模擬：

1.  **初始化 (Initialization)**: 創建 `AkingSPICE` 實例。
2.  **電路建構 (Circuit Building)**: **重置**解算器，然後以程式化方式定義所有元件。
3.  **執行模擬 (Simulation)**: 根據電路類型選擇合適的分析方法。對於開關電源，**強烈推薦**使用 `runSteppedSimulation`。
4.  **結果分析 (Result Analysis)**: 從返回的結果物件中提取所需的電壓、電流波形或數值。

---

## 3. 步驟詳解與程式碼範例

### 3.1. 初始化
```javascript
import { AkingSPICE, Resistor, Capacitor, Inductor, VoltageSource, MOSFET, Diode } from './src/index.js';

// 創建解算器實例
const solver = new AkingSPICE();

// [建議] 啟用調試模式可以在控制台看到詳細的 MNA 矩陣和求解過程
solver.setDebug(true);
```

### 3.2. 電路建構
這是最關鍵且最容易出錯的步驟。

```javascript
// **步驟 1: 清除舊電路**
solver.reset();

// 步驟 2: 以陣列形式定義所有電路元件
solver.components = [
    // new ComponentType(name, nodes, value, params),
    new VoltageSource('VIN', ['vin', '0'], 12.0),
    new Resistor('RLOAD', ['out', '0'], 5.0),
    // ... 其他元件
];

// **步驟 3: 標記電路已準備就緒**
solver.isInitialized = true;

// [可選但建議] 驗證電路是否存在明顯問題
const validation = solver.validateCircuit();
if (!validation.valid) {
    console.error('電路驗證失敗:', validation.issues);
}
```

### 3.3. 元件詳解

| 元件類型 | 構造函數 | 說明 |
|---|---|---|
| **Resistor** | `new Resistor(name, [n1, n2], value)` | 線性電阻。`value` 單位為歐姆 (Ω)。 |
| **Capacitor**| `new Capacitor(name, [n1, n2], value, {ic})` | 線性電容。`value` 單位為法拉 (F)。`ic` 是可選的初始電壓。 |
| **Inductor** | `new Inductor(name, [n1, n2], value, {ic})` | 線性電感。`value` 單位為亨利 (H)。`ic` 是可選的初始電流。 |
| **VoltageSource**| `new VoltageSource(name, [+node, -node], value)` | 獨立直流電壓源。`value` 單位為伏特 (V)。 |
| **MOSFET** | `new MOSFET(name, [drain, source], {params})` | **外部控制的開關**。其狀態**不依賴**閘極電壓，而是由 `step` 或 `runSteppedSimulation` API 控制。`params` 應包含 `{Ron, Roff}`。 |
| **Diode** | `new Diode(name, [anode, cathode], {params})` | 理想二極體。`params` 可包含 `{Vf, Ron}`。 |

### 3.4. 選擇分析方法

#### 3.4.1. 直流工作點 (`runDCAnalysis`)
用於分析純直流電路，或計算暫態分析的初始狀態。
```javascript
const dcResult = await solver.runDCAnalysis();
if (dcResult.converged) {
    const outputVoltage = dcResult.nodeVoltages.get('out');
    console.log(`DC Output Voltage: ${outputVoltage.toFixed(3)}V`);
}
```

#### 3.4.2. 開關電路模擬 (`runSteppedSimulation`) - **AI 首選**
這是模擬 Buck、Boost 等 PWM 電路的**最佳方法**。它將模擬的控制權交給一個您定義的 `pwmControl` 函數。

```javascript
// 1. 定義 PWM 控制邏輯
const pwmControl = (time) => {
    const frequency = 100e3; // 100kHz
    const period = 1 / frequency;
    const dutyCycle = 0.5; // 50%

    // 計算當前時刻 MOSFET 是否應該導通
    const isHighSideOn = (time % period) < (period * dutyCycle);

    // 返回一個物件，鍵是元件名稱，值是其狀態
    return {
        'MSW_H': isHighSideOn,
        'MSW_L': !isHighSideOn // 對於同步 Buck，低端開關與高端互補
    };
};

// 2. 定義模擬參數
const simulationParameters = {
    stopTime: 2e-3,     // 模擬 2ms
    timeStep: 1e-7      // 時間步長 0.1us (遠小於 10us 的開關週期)
};

// 3. 執行模擬
const results = await solver.runSteppedSimulation(pwmControl, simulationParameters);
```

### 4.2. 完整範例：同步 Buck 轉換器

這是一個完整的、可執行的黃金範例。AI 應以此為基礎來建構所有 Buck/Boost 類型的電路。

```javascript
// 1. 初始化
const solver = new AkingSPICE();
solver.reset();

// 2. 電路建構
solver.components = [
    new VoltageSource('VIN', ['vin', '0'], 12.0),            // 輸入電壓
    new Resistor('RLOAD', ['out', '0'], 5.0),                 // 負載電阻
    new Capacitor('C1', ['out', '0'], 220e-6, {ic: 0}),       // 輸出電容
    new Inductor('L1', ['sw', 'out'], 100e-6, {ic: 0}),       // 功率電感
    
    // **關鍵的開關部分**
    new MOSFET('MSW_H', ['vin', 'sw'], {Ron: 0.01, Roff: 1e6}), // 高端開關
    new MOSFET('MSW_L', ['sw', '0'], {Ron: 0.01, Roff: 1e6})    // 低端同步開關 (提供續流路徑)
];
solver.isInitialized = true;

// 3. 執行模擬
const pwmControl = (time) => {
    const period = 1 / 100e3; // 100kHz
    const duty = 0.5;
    const high_on = (time % period) < (period * duty);
    return {'MSW_H': high_on, 'MSW_L': !high_on};
};

const results = await solver.runSteppedSimulation(pwmControl, {
    stopTime: 2e-3, 
    timeStep: 1e-7 // 100kHz 週期為 10us，1e-7 (0.1us) 提供了 100 個點，解析度良好
});

// 4. 結果分析
const lastStep = results.steps[results.steps.length - 1];
const finalVoltage = lastStep.nodeVoltages['out'];
const finalCurrent = lastStep.branchCurrents['L1'];

console.log(`Simulation finished. Final Vout: ${finalVoltage.toFixed(3)}V, Final IL1: ${finalCurrent.toFixed(3)}A`);
```

## 4. 完整電路範例

### 4.1. 完整範例：非同步 Buck 轉換器 (使用二極體)

這是展示如何使用 Diode 元件的經典範例，非同步 Buck 是最基礎的電力電子拓撲之一。

```javascript
// 1. 初始化
const solver = new AkingSPICE();
solver.reset();

// 2. 非同步 Buck 電路建構
solver.components = [
    new VoltageSource('VIN', ['vin', '0'], 12.0),              // 輸入電壓
    new Resistor('RLOAD', ['out', '0'], 5.0),                   // 負載電阻
    new Capacitor('C1', ['out', '0'], 220e-6, {ic: 0}),         // 輸出電容
    new Inductor('L1', ['sw', 'out'], 100e-6, {ic: 0}),         // 功率電感
    
    // **關鍵差異：主開關 + 續流二極體**
    new MOSFET('MSW', ['vin', 'sw'], {Ron: 0.01, Roff: 1e6}),   // 主開關 (高側)
    new Diode('D_FREEWHEEL', ['0', 'sw'], {                     // 🔥 續流二極體 (低側)
        Vf: 0.7,    // 順向偏壓電壓
        Ron: 0.02,  // 導通電阻
        Roff: 1e6   // 截止電阻
    })
];
solver.isInitialized = true;

// 3. PWM 控制 - 只控制主開關，二極體自動工作
const pwmControl = (time) => {
    const period = 1 / 100e3; // 100kHz
    const duty = 0.5;
    const mainSwitchOn = (time % period) < (period * duty);
    
    return {
        'MSW': mainSwitchOn  // 只控制主開關，二極體會根據電壓自動導通/截止
    };
};

// 4. 執行模擬
const results = await solver.runSteppedSimulation(pwmControl, {
    stopTime: 5e-3,         // 5ms
    timeStep: 5e-8          // 50ns，足夠解析度
});

// 5. 分析結果
const lastStep = results.steps[results.steps.length - 1];
const outputVoltage = lastStep.nodeVoltages['out'];
const diodeStatus = lastStep.componentStates['D_FREEWHEEL'];

console.log(`非同步 Buck 輸出: ${outputVoltage.toFixed(3)}V`);
console.log(`續流二極體狀態: ${diodeStatus?.state || 'Unknown'}`);

// 理論輸出：Vout = Vin × D - V_diode_drop ≈ 12V × 0.5 - 0.7V = 5.3V
```

**關鍵差異總結：**
- **同步 Buck**: 使用兩個 MOSFET (MSW_H + MSW_L)，效率高但控制複雜
- **非同步 Buck**: 使用一個 MOSFET + 一個 Diode，控制簡單但效率較低 (因二極體壓降)

## 5. ⚠️ AI 必須避免的常見錯誤 (Best Practices & Pitfalls)

1.  **錯誤：遺漏續流路徑**
    *   **問題**: 在 Buck/Boost 電路中，當主開關關斷時，電感電流必須有地方流動。如果沒有，模擬會因電壓無窮大而失敗。
    *   **解決方案**: **永遠**在電感開關路徑中加入一個續流二極體 (`Diode`) 或一個同步 MOSFET (`MOSFET`)。對於 Buck，它在 `sw` 和 `0` 之間；對於 Boost，它在 `sw` 和 `out` 之間。

2.  **錯誤：時間步長過大**
    *   **問題**: 如果 `timeStep` 接近或大於 PWM 開關週期，模擬器將會「錯過」開關動作，導致結果完全錯誤。
    *   **解決方案**: 設定 `timeStep` 為 `(1 / frequency) / 100`。即**每個開關週期至少有 100 個模擬點**。

3.  **錯誤：二極體極性接反**
    *   **問題**: Diode 的陽極 (anode) 和陰極 (cathode) 接反會導致電流無法流動，電路無法正常工作。
    *   **解決方案**: 確保續流二極體的接法正確。對於 Buck 轉換器，應該是 `new Diode('D1', ['0', 'sw'], params)`，即陰極接開關節點，陽極接地。

4.  **錯誤：未重置解算器**
    *   **問題**: 多次運行模擬而不調用 `solver.reset()` 會導致新舊電路元件疊加，產生混亂。
    *   **解決方案**: 在賦值 `solver.components` 之前，**務必**先調用 `solver.reset()`。

5.  **提醒：數值單位**
    *   所有數值都應使用**基本 SI 單位**：法拉 (F)、亨利 (H)、歐姆 (Ω)、伏特 (V)、安培 (A)、秒 (s)。
    *   使用科學記號表示，例如 `100μF` 應寫為 `100e-6`。

---

### 附錄：常見問題與解答 (FAQ)

**Q1: 為什麼我的電路模擬結果不收斂？**
- A1: 請檢查是否有遺漏續流路徑，特別是在使用電感的開關電路中。確保每個電感都有一個對應的續流二極體或同步 MOSFET。

**Q2: 如何選擇合適的時間步長？**
- A2: 一般建議設置為 PWM 頻率的 `1/100`，即 `timeStep = (1 / frequency) / 100`。這樣可以確保在開關週期內有足夠的模擬點數。

**Q3: 為什麼我的電路無法正常啟動？**
- A3: 確保在定義完 `solver.components` 後，將 `solver.isInitialized` 設置為 `true`。此外，檢查電路中是否有明顯的錯誤，如短路或開路。

**Q4: AI 助手如何生成 PWM 控制邏輯？**
- A4: PWM 控制邏輯通常基於所需的輸出特性（如電壓或電流）以及開關元件的特性。AI 可以根據歷史數據或預設的控制策略來生成此邏輯。

**Q5: 有什麼方法可以驗證我的電路設計？**
- A5: 可以使用 `solver.validateCircuit()` 方法來檢查電路設計中的常見問題。此外，對於關鍵參數，可以先進行 DC 分析以確認基本的電壓電流關係是否正常。

**Q6: 什麼時候應該使用 Diode 而不是同步 MOSFET？**
- A6: **使用 Diode 的場合**: 簡單控制、成本考量、非同步拓撲、整流應用。**使用同步 MOSFET 的場合**: 追求高效率、複雜控制系統、大電流應用。一般來說，非同步 Buck/Boost 使用二極體，同步 Buck/Boost 使用 MOSFET。

**Q7: 如何設定二極體參數？**
- A7: 關鍵參數：`Vf` (順向偏壓電壓，通常 0.3V~0.7V)、`Ron` (導通電阻，通常很小)、`Roff` (截止電阻，通常很大)。對於功率電路，建議 `Vf=0.7V, Ron=0.01~0.05Ω, Roff=1e6Ω`。
- A5: 可以使用 `solver.validateCircuit()` 方法來檢查電路設計中的常見問題。此外，對於關鍵參數，可以先進行 DC 分析以確認基本的電壓電流關係是否正常。
