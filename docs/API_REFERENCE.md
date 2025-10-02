# AkingSPICE API Reference

## 概述

AkingSPICE 是一個JavaScript電路仿真器，提供CPU和GPU雙求解器架構，支援WebGPU加速，實現高效能電路模擬。本文檔詳細描述了所有可用的API接口。

## 快速開始

```javascript
import { AkingSPICE, VoltageSource, Resistor, Capacitor } from './lib-dist/AkingSPICE.es.js';

// 方法1: 使用網表
const spice = new AkingSPICE();
spice.loadNetlist(`
V1 in gnd DC(5)
R1 in out 1k
C1 out gnd 1u IC=0
.tran 1u 1m
`);
const result = await spice.runAnalysis();

// 方法2: 程式化建立電路
spice.components = [
    new VoltageSource('V1', ['in', 'gnd'], 5),
    new Resistor('R1', ['in', 'out'], 1000),
    new Capacitor('C1', ['out', 'gnd'], 1e-6)
];
const dcResult = await spice.runDCAnalysis();
```

---

## 核心類別

### AkingSPICE (主求解器)

**構造函數**
```javascript
constructor(netlist = null)
```
- `netlist` (string, optional): 要載入的SPICE網表

**屬性**
- `components` (BaseComponent[]): 電路元件陣列
- `isInitialized` (boolean): 是否已初始化
- `debug` (boolean): 調試模式開關
- `results` (Map): 分析結果存儲
- `lastResult` (Object): 最近一次分析結果

**方法**

#### loadNetlist(netlistText)
載入並解析SPICE網表
- **參數**: `netlistText` (string) - 網表文本內容
- **返回**: Object - 解析統計信息
- **示例**:
```javascript
const stats = spice.loadNetlist(`
V1 vin gnd DC(12)
R1 vin vout 1k
.dc
`);
console.log(stats); // { components: 2, analyses: 1, ... }
```

#### runAnalysis(analysisCommand)
執行指定的分析
- **參數**: `analysisCommand` (string, optional) - 分析指令
- **返回**: Promise<Object> - 分析結果
- **支援的指令**:
  - `.tran <tstep> <tstop> [tstart] [tmax]` - 暫態分析
  - `.dc` 或 `.op` - 直流分析
- **示例**:
```javascript
const result = await spice.runAnalysis('.tran 1u 10m');
```

#### runDCAnalysis()
執行直流工作點分析
- **返回**: Promise<DCResult> - DC分析結果
- **示例**:
```javascript
const dcResult = await spice.runDCAnalysis();
console.log(dcResult.nodeVoltages); // Map of node voltages
```

#### runTransientAnalysis(tranCommand)
執行暫態分析
- **參數**: `tranCommand` (string) - 暫態分析指令
- **返回**: Promise<TransientResult> - 暫態分析結果
- **示例**:
```javascript
const result = await spice.runTransientAnalysis('.tran 100n 1m');
console.log(result.timePoints.length); // Number of time points
```

#### addComponent(component)
新增單個元件到電路
- **參數**: `component` (BaseComponent) - 要新增的元件
- **示例**:
```javascript
spice.addComponent(new Resistor('R1', ['n1', 'n2'], 1000));
```

#### addComponents(componentArray)
新增元件陣列到電路
- **參數**: `componentArray` (BaseComponent[]) - 元件陣列
- **示例**:
```javascript
spice.addComponents([
    new VoltageSource('V1', ['vin', 'gnd'], 5),
    new Resistor('R1', ['vin', 'vout'], 1000)
]);
```

#### getResult(analysisType)
獲取分析結果
- **參數**: `analysisType` (string, optional) - 分析類型 ('tran', 'dc')
- **返回**: Object - 分析結果
- **示例**:
```javascript
const dcResult = spice.getResult('dc');
const lastResult = spice.getResult(); // 獲取最近結果
```

#### getCircuitInfo()
獲取電路資訊
- **返回**: Object - 電路統計資訊
- **示例**:
```javascript
const info = spice.getCircuitInfo();
// { componentCount: 3, nodeList: ['vin', 'vout', 'gnd'], ... }
```

#### setDebug(enabled)
設置調試模式
- **參數**: `enabled` (boolean) - 是否啟用調試
- **示例**:
```javascript
spice.setDebug(true); // 啟用詳細日誌
```

#### reset()
重置求解器狀態
- **示例**:
```javascript
spice.reset(); // 清空所有電路和結果
```

---

## 求解器類別

### ExplicitStateSolver (CPU求解器)

高效能CPU顯式狀態求解器，適用於中小型電路。

**構造函數**
```javascript
constructor(options = {})
```
- `options.debug` (boolean): 調試模式
- `options.maxIterations` (number): 最大迭代次數
- `options.tolerance` (number): 收斂容差

**方法**

#### initialize(components, timeStep, options)
初始化求解器和電路預處理
- **參數**:
  - `components` (BaseComponent[]): 電路元件陣列
  - `timeStep` (number): 時間步長 (秒)
  - `options` (Object): 選項 { debug: boolean }
- **返回**: Promise<void>
- **示例**:
```javascript
const solver = new ExplicitStateSolver();
await solver.initialize(components, 1e-6, { debug: true });
```

#### step(controlInputs)
執行單個時間步
- **參數**: `controlInputs` (Object): 控制輸入 (可選)
- **返回**: Promise<Object> - 時間步結果
- **結果格式**:
```javascript
{
    time: number,           // 當前時間
    nodeVoltages: Float64Array,  // 節點電壓
    stateVariables: Map,    // 狀態變量 (元件名 → 值)
    converged: boolean,     // 是否收斂
    iterations: number      // 迭代次數
}
```

#### solveTimeStep(controlInputs)
求解單個時間步 (別名方法)
- 參數和返回值同 `step()`

### GPUExplicitStateSolver (GPU求解器)

WebGPU加速的並行求解器，適用於大型電路，可提供4.6倍性能提升。

**構造函數**
```javascript
constructor(options = {})
```
- `options.debug` (boolean): 調試模式
- `options.preferredDevice` (string): 首選GPU設備

**方法**

#### initialize(components, timeStep, options)
初始化GPU求解器
- **參數**: 同 ExplicitStateSolver
- **返回**: Promise<void>
- **注意**: 在Node.js環境中會自動回退到CPU模式

#### step(controlInputs)
執行GPU加速的時間步
- **參數**: `controlInputs` (Object): 控制輸入
- **返回**: Promise<Object> - 時間步結果 (格式同CPU版本)

---

## 元件類別

### BaseComponent (抽象基類)

所有電路元件的基礎類別。

**構造函數**
```javascript
constructor(name, type, nodes, value, params = {})
```
- `name` (string): 元件名稱 (如 'R1')
- `type` (string): 元件類型 (如 'R')
- `nodes` (string[]): 連接節點
- `value` (number|string): 元件值
- `params` (Object): 額外參數

**屬性**
- `name` (string): 元件名稱
- `type` (string): 元件類型
- `nodes` (string[]): 節點連接
- `value` (number): 解析後的數值
- `operatingPoint` (Object): 工作點信息

### 被動元件

#### Resistor
```javascript
new Resistor(name, nodes, resistance, params = {})
```
- `resistance` (number): 阻值 (歐姆)
- **示例**: `new Resistor('R1', ['n1', 'n2'], 1000)`

#### Capacitor
```javascript
new Capacitor(name, nodes, capacitance, params = {})
```
- `capacitance` (number): 容值 (法拉)
- `params.ic` (number): 初始電壓
- **示例**: `new Capacitor('C1', ['n1', 'n2'], 1e-6, { ic: 0 })`

#### Inductor
```javascript
new Inductor(name, nodes, inductance, params = {})
```
- `inductance` (number): 感值 (亨利)
- `params.ic` (number): 初始電流
- **示例**: `new Inductor('L1', ['n1', 'n2'], 1e-3, { ic: 0 })`

### 信號源

#### VoltageSource
```javascript
new VoltageSource(name, nodes, voltage, params = {})
```
- `voltage` (number|string): 電壓值或表達式
- **支援格式**:
  - 直流: `5` 或 `'DC(5)'`
  - 正弦: `'SIN(0 5 1000)'` (偏移 振幅 頻率)
- **示例**:
```javascript
new VoltageSource('V1', ['vin', 'gnd'], 12)
new VoltageSource('V2', ['ac', 'gnd'], 'SIN(0 5 50)')
```

#### CurrentSource
```javascript
new CurrentSource(name, nodes, current, params = {})
```
- `current` (number): 電流值 (安培)
- **示例**: `new CurrentSource('I1', ['n1', 'n2'], 0.001)`

### 受控源

#### VCVS (電壓控制電壓源)
```javascript
new VCVS(name, nodes, controlNodes, gain)
```
- `controlNodes` (string[]): 控制節點 [+, -]
- `gain` (number): 電壓增益
- **示例**: `new VCVS('E1', ['out+', 'out-'], ['in+', 'in-'], 100)`

#### VCCS (電壓控制電流源)
```javascript
new VCCS(name, nodes, controlNodes, transconductance)
```
- `transconductance` (number): 轉導 (S)
- **示例**: `new VCCS('G1', ['out+', 'out-'], ['in+', 'in-'], 0.001)`

### 半導體元件

#### Diode
```javascript
new Diode(name, nodes, params = {})
```
- `params.is` (number): 飽和電流
- `params.n` (number): 理想因子
- **示例**: `new Diode('D1', ['anode', 'cathode'])`

#### MOSFET
```javascript
new MOSFET(name, nodes, params = {})
```
- `nodes`: [drain, gate, source, bulk]
- `params.type` (string): 'NMOS' 或 'PMOS'
- `params.vth` (number): 閾值電壓
- **示例**: `new MOSFET('M1', ['d', 'g', 's', 's'], { type: 'NMOS' })`

---

## 分析引擎

### TransientAnalysis

暫態分析引擎，支援時域仿真。

**方法**

#### initialize(components, timeStep, integrationMethod)
初始化暫態分析
- `components` (BaseComponent[]): 電路元件
- `timeStep` (number): 時間步長
- `integrationMethod` (string): 'backward_euler' 或 'trapezoidal'

#### run(startTime, stopTime)
執行暫態分析
- `startTime` (number): 開始時間
- `stopTime` (number): 結束時間
- **返回**: Promise<TransientResult>

### DCAnalysis

直流分析引擎。

**方法**

#### run(components, options)
執行DC分析
- `components` (BaseComponent[]): 電路元件
- `options` (Object): 分析選項 { debug: boolean }
- **返回**: Promise<DCResult>

---

## 結果類別

### TransientResult

暫態分析結果容器。

**屬性**
- `timePoints` (Float64Array): 時間點陣列
- `nodeVoltages` (Map): 節點電壓時間序列
- `componentCurrents` (Map): 元件電流時間序列
- `stateVariables` (Map): 狀態變量歷史
- `analysisInfo` (Object): 分析資訊

**方法**
- `getNodeVoltage(nodeName)`: 獲取節點電壓序列
- `getComponentCurrent(componentName)`: 獲取元件電流序列
- `exportCSV()`: 導出CSV格式數據

### DCResult

直流分析結果容器。

**屬性**
- `nodeVoltages` (Map): 節點電壓
- `componentCurrents` (Map): 元件電流
- `convergenceInfo` (Object): 收斂信息

---

## 實用工具

### NetlistParser

SPICE網表解析器。

**方法**

#### parse(netlistText)
解析網表文本
- `netlistText` (string): 網表內容
- **返回**: Object - 解析結果

#### reset()
重置解析器狀態

---

## 錯誤處理

### 常見錯誤類型

1. **CircuitError**: 電路拓撲錯誤
2. **ConvergenceError**: 數值收斂失敗
3. **GPUError**: WebGPU初始化或運行錯誤

### 錯誤處理示例

```javascript
try {
    const result = await spice.runAnalysis('.tran 1u 1m');
} catch (error) {
    if (error.name === 'ConvergenceError') {
        console.log('數值不收斂，嘗試減小時間步長');
    } else if (error.name === 'GPUError') {
        console.log('GPU不可用，自動回退到CPU模式');
    }
}
```

---

## 性能優化

### GPU加速使用指南

1. **適用場景**: 節點數 > 50，時間步數 > 1000
2. **瀏覽器支援**: Chrome 113+, Edge 113+
3. **自動回退**: Node.js環境自動使用CPU

### 數值穩定性建議

1. **時間步長**: 建議 < 1/(10*f_max)，其中f_max為最高頻率
2. **電路條件**: 避免極大的阻抗比差異
3. **初始條件**: 適當設置電容初始電壓和電感初始電流

### 記憶體使用優化

```javascript
// 對於長時間仿真，定期清理歷史數據
if (timePoints.length > 10000) {
    result.truncateHistory(5000); // 保留最近5000個點
}
```

---

## 版本信息

使用 `AkingSPICE.getVersionInfo()` 獲取版本信息：

```javascript
const info = AkingSPICE.getVersionInfo();
console.log(`${info.name} v${info.version}`);
console.log('支援功能:', info.features);
```

---

## 高級用法

### 自定義元件

```javascript
class CustomResistor extends BaseComponent {
    constructor(name, nodes, resistance, tempCoeff = 0) {
        super(name, 'R', nodes, resistance);
        this.tempCoeff = tempCoeff;
    }
    
    getValue(temperature = 27) {
        return this.value * (1 + this.tempCoeff * (temperature - 27));
    }
}
```

### 批次仿真

```javascript
const results = [];
for (let freq = 1; freq <= 1000; freq *= 10) {
    spice.components[1].value = `SIN(0 1 ${freq})`;
    results.push(await spice.runAnalysis('.tran 1u 10m'));
}
```

### 參數掃描

```javascript
const sweepResults = new Map();
for (let r = 100; r <= 10000; r *= 2) {
    spice.components[0].value = r;
    const result = await spice.runDCAnalysis();
    sweepResults.set(r, result.nodeVoltages.get('vout'));
}
```