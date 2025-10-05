好的，這是一份針對 `index.js` 導出內容的完整 API參考文件。文件涵蓋了核心引擎、分析器、以及所有電路元件的使用方法，並包含一個完整的 Buck 轉換器範例，展示如何以程式化方式建構和模擬電路。

---

## AkingSPICE API 參考手冊 (v2.1.0)

`AkingSPICE` 是一個專為電力電子模擬設計的 JavaScript SPICE 引擎。其核心採用了先進的 **混合互補問題 (MCP)** 方法來精確處理開關元件的非線性行為，避免了傳統方法中的數值振盪和收斂問題。

此 API 文件旨在幫助開發者透過程式化方式使用 `AkingSPICE` 來建構、模擬和分析複雜的電力電子電路。

### 目錄

1.  [**核心使用模式**](#核心使用模式)
    *   模式一：批次分析 (基於網表) - `AkingSPICE`
    *   模式二：互動式步進模擬 - `StepwiseSimulator`
2.  [**核心引擎 API**](#核心引擎-api)
    *   [`AkingSPICE` 類](#akingspice-類)
    *   [`StepwiseSimulator` 類](#stepwisesimulator-類)
3.  [**電路元件 (Components) API**](#電路元件-components-api)
    *   [線性元件](#線性元件)
        *   `Resistor` (電阻)
        *   `Capacitor` (電容)
        *   `Inductor` (電感)
    *   [獨立源 (Sources)](#獨立源-sources)
        *   `VoltageSource` (電壓源)
        *   `CurrentSource` (電流源)
    *   [MCP 非線性元件](#mcp-非線性元件)
        *   `MCPDiode` (二極體)
        *   `MCPMOSFET` (金氧半場效電晶體)
        *   `PWMController` (脈寬調變控制器)
    *   [複雜/元元件](#複雜元元件)
        *   `MultiWindingTransformer` (多繞組變壓器)
4.  [**完整範例：建立並模擬 Buck 轉換器**](#完整範例建立並模擬-buck-轉換器)
5.  [**版本資訊**](#版本資訊)

---

### 核心使用模式

`AkingSPICE` 提供了兩種主要的使用方式：

#### 模式一：批次分析 (基於網表) - `AkingSPICE`

此模式類似傳統的 SPICE 軟體，您提供一個完整的網表 (Netlist) 字串，求解器會根據網表中的分析指令 (如 `.tran`, `.dc`) 執行完整的模擬並返回結果。

**適用場景**：
*   快速驗證現有的 SPICE 網表。
*   執行一次性的完整模擬。
*   不需要在模擬過程中進行互動或干預。

#### 模式二：互動式步進模擬 - `StepwiseSimulator`

此模式提供了一個強大的 API，讓您可以完全控制模擬的每一步。您可以初始化電路，單步推進，隨時查詢電路狀態，甚至在模擬過程中動態修改元件參數。

**適用場景**：
*   開發即時控制系統的數位孿生模型。
*   建立互動式電路教學應用。
*   執行參數掃描或最佳化演算法。
*   需要對模擬過程進行精細控制的進階應用。

---

### 核心引擎 API

#### `AkingSPICE` 類

批次模式的主求解器，負責解析網表並執行完整的分析。

```javascript
import { AkingSPICE } from './index.js';

// 透過網表文字建立實例
const netlist = `
* My First Circuit
V1 1 0 12V
R1 1 0 1k
.end
`;
const solver = new AkingSPICE(netlist);

// 執行網表中的分析指令
const result = await solver.runAnalysis();
```

**主要方法**:

*   `new AkingSPICE(netlist?: string)`: 建立一個求解器實例。可以選擇性地在建構時傳入網表字串。
*   `loadNetlist(netlistText: string)`: 載入並解析網表。
*   `runAnalysis(command?: string): Promise<Object>`: 執行分析。
    *   如果提供了 `command` (如 `'.tran 1us 1ms'`)，則執行該指令。
    *   如果未提供，則執行網表中找到的第一個分析指令。
    *   如果網表中也沒有指令，預設執行 `.op` (DC 工作點分析)。
*   `set components(componentArray: BaseComponent[])`: 以程式化方式設定電路元件。

#### `StepwiseSimulator` 類

互動式模擬引擎，提供對模擬過程的完全控制。

```javascript
import { StepwiseSimulator, VoltageSource, Resistor } from './index.js';

// 1. 建立電路元件陣列
const components = [
    new VoltageSource('V1', ['1', '0'], 12),
    new Resistor('R1', ['1', '0'], 1000)
];

// 2. 建立模擬器實例
const simulator = new StepwiseSimulator({ debug: true });

// 3. 初始化模擬
await simulator.initialize(components, {
    startTime: 0,
    stopTime: 1e-3, // 1ms
    timeStep: 1e-6  // 1us
});

// 4. 單步推進
const stepResult = await simulator.stepForward();
console.log(`Time: ${stepResult.time}, V(1)=${stepResult.state.nodeVoltages.get('1')}V`);

// 5. 獲取當前狀態
const currentState = simulator.getCircuitState();```

**主要方法**:

*   `new StepwiseSimulator(options?: Object)`: 建立一個步進模擬器實例。`options` 可包含 `debug: true`。
*   `initialize(components: BaseComponent[], params: Object): Promise<boolean>`: 初始化模擬。
    *   `components`: 電路元件物件的陣列。
    *   `params`: 包含 `startTime`, `stopTime`, `timeStep` 的物件。
*   `stepForward(): Promise<Object>`: 將模擬向前推進一個時間步。返回 `{ success, state, isComplete }`。
*   `runSteps(numSteps: number): Promise<Object>`: 連續執行指定數量的步驟。
*   `getCircuitState(): Object`: 獲取當前模擬時間的完整電路狀態，包括節點電壓、元件電流和狀態。
*   `modifyComponent(name: string, params: Object): boolean`: 在模擬過程中動態修改元件的參數。**注意**：不能修改節點連接。
*   `pause()` / `resume()`: 暫停和繼續模擬。

---

### 電路元件 (Components) API

所有元件都繼承自 `BaseComponent`。建立元件時，通常需要提供 `name`, `nodes` (節點陣列), `value` (值) 和可選的 `params` 物件。

#### 線性元件

##### `Resistor` (電阻)
*   `new Resistor(name: string, nodes: string[], resistance: number|string, params?: Object)`
*   **範例**: `new Resistor('RL', ['out', '0'], '1k')` // '1k' 會被自動解析為 1000

##### `Capacitor` (電容)
*   `new Capacitor(name: string, nodes: string[], capacitance: number|string, params?: Object)`
*   `params.ic`: 設定初始電壓 (Initial Condition)。
*   **範例**: `new Capacitor('Cout', ['out', '0'], '100uF', { ic: 0 })` // '100uF' 解析為 100e-6

##### `Inductor` (電感)
*   `new Inductor(name: string, nodes: string[], inductance: number|string, params?: Object)`
*   `params.ic`: 設定初始電流 (Initial Condition)。
*   **範例**: `new Inductor('L1', ['sw', 'out'], 10e-6, { ic: 0 })`

#### 獨立源 (Sources)

##### `VoltageSource` (電壓源)
*   `new VoltageSource(name: string, nodes: string[], source: number|string|Object, params?: Object)`
*   `nodes`: `['正極', '負極']`
*   `source`:
    *   **DC**: `12`
    *   **PULSE (脈衝)**: `'PULSE(v1 v2 td tr tf pw per)'`
    *   **SINE (正弦)**: `{ type: 'SINE', amplitude, frequency, offset, phase }`
*   **範例**:
    *   `new VoltageSource('Vin', ['in', '0'], 12)`
    *   `new VoltageSource('Vdrive', ['gate', '0'], 'PULSE(0 5 0 10n 10n 5u 10u)')`

##### `CurrentSource` (電流源)
*   `new CurrentSource(name: string, nodes: string[], source: number|string|Object, params?: Object)`
*   `nodes`: `['流出節點', '流入節點']`
*   `source` 的定義同 `VoltageSource`。

#### MCP 非線性元件

這些是 `AkingSPICE` 的核心，建議使用提供的工廠函數 (factory functions) 來建立。

##### `MCPDiode` (二極體)
*   **建議使用**: `createSchottkyDiode(name, anode, cathode, params?)` 或 `createFastRecoveryDiode(...)`
*   `params`: 可選，用於覆蓋預設的 `Vf` (導通電壓) 和 `Ron` (導通電阻)。
*   **範例**: `createSchottkyDiode('D1', '0', 'sw', { Vf: 0.5, Ron: 1e-3 })`

##### `MCPMOSFET` (金氧半場效電晶體)
*   **建議使用**: `createNMOSSwitch(name, drain, source, gate, params?)` 或 `createPMOSSwitch(...)`
*   `params`: 可選，用於覆蓋預設的 `Ron`, `Vth` (閾值電壓) 等參數。
*   **範例**: `createNMOSSwitch('M1', 'in', 'sw', 'gate', { Ron: 10e-3, Vth: 2.5 })`

##### `PWMController` (脈寬調變控制器)
這是一個輔助類，用於產生 PWM 訊號來控制 MOSFET。
*   `new PWMController(frequency: number, dutyCycle: number, phase?: number)`
*   **使用方法**:
    1.  建立 `PWMController` 實例。
    2.  將其連結到 `MCPMOSFET` 實例上。
    3.  在模擬迴圈的每一步之前，呼叫 `mosfet.updatePWMState(time)`。
*   **範例**: (見下方完整範例)

#### 複雜/元元件

##### `MultiWindingTransformer` (多繞組變壓器)
這是一個元元件 (Meta-Component)，它本身不參與計算，而是生成一組互相耦合的 `Inductor` 元件。
*   `new MultiWindingTransformer(name: string, config: Object)`
*   `config`:
    *   `windings`: 一個陣列，定義每個繞組的 `{ name, nodes, inductance, resistance }`。
    *   `couplingMatrix`: 可選的耦合係數矩陣。預設為 0.99。
*   **使用方法**:
    *   建立變壓器實例後，使用其 `getComponents()` 方法取得內部的電感陣列，並將這些電感加入到主電路元件列表中。
*   **範例**:
    ```javascript
    const transformer = new MultiWindingTransformer('T1', {
        windings: [
            { name: 'primary', nodes: ['1', '2'], inductance: 100e-6 },
            { name: 'secondary', nodes: ['3', '4'], inductance: 10e-6 }
        ],
        couplingMatrix: [[1.0, 0.995], [0.995, 1.0]]
    });
    
    // 將變壓器生成的電感加入電路
    components.push(...transformer.getComponents());
    ```

---

### 完整範例：建立並模擬 Buck 轉換器

這個範例展示了如何結合使用多種元件和 `StepwiseSimulator` 來從零開始建構並模擬一個開迴路的 Buck 轉換器。

```javascript
import {
    StepwiseSimulator,
    VoltageSource,
    Resistor,
    Capacitor,
    Inductor,
    createNMOSSwitch,
    createSchottkyDiode
} from './index.js';

// 1. 定義電路參數
const VIN = 12;            // 輸入電壓
const VOUT_TARGET = 5;     // 目標輸出電壓
const F_SW = 100e3;        // 切換頻率 100 kHz
const DUTY_CYCLE = VOUT_TARGET / VIN; // 理想佔空比
const PERIOD = 1 / F_SW;

// 2. 建立所有電路元件
const components = [
    // 輸入電壓源
    new VoltageSource('Vin', ['in', '0'], VIN),

    // 主開關 MOSFET (NMOS)
    createNMOSSwitch('M1', 'in', 'sw', 'gate', { Ron: 10e-3, Vth: 2.5 }),

    // 續流二極體 (蕭特基)
    createSchottkyDiode('D1', '0', 'sw', { Vf: 0.5, Ron: 2e-3 }),

    // 功率電感
    new Inductor('L1', ['sw', 'out'], 22e-6, { ic: 0 }),

    // 輸出電容
    new Capacitor('Cout', ['out', '0'], 100e-6, { ic: 0 }),

    // 負載電阻
    new Resistor('Rload', ['out', '0'], 5)
];

// 3. 建立閘極驅動源 (不加入主電路，由 MOSFET 內部邏輯使用)
// 為了模擬 PWM，我們將使用一個 PULSE 電壓源
const vdrive = new VoltageSource('Vdrive', ['gate', '0'], 
    `PULSE(0 5 0 10n 10n ${PERIOD * DUTY_CYCLE}s ${PERIOD}s)`
);

// 4. 建立並初始化模擬器
const simulator = new StepwiseSimulator();
const simParams = {
    startTime: 0,
    stopTime: 200e-6, // 模擬 200us
    timeStep: 100e-9  // 時間步長 100ns
};

console.log('Initializing simulation...');
await simulator.initialize(components, simParams);

// 5. 執行模擬迴圈
console.log('Running simulation loop...');
let currentTime = simParams.startTime;
const mosfet_M1 = simulator.components.find(c => c.name === 'M1'); // 從模擬器中取得元件參考

while (currentTime < simParams.stopTime) {
    // 更新 MOSFET 的閘極狀態
    const gateVoltage = vdrive.getValue(currentTime);
    mosfet_M1.setGateState(gateVoltage > mosfet_M1.Vth, gateVoltage);

    // 向前推进一步
    const stepResult = await simulator.stepForward();
    
    if (!stepResult.success) {
        console.error(`Simulation failed at t=${currentTime}s: ${stepResult.error}`);
        break;
    }

    currentTime = stepResult.time;

    // 每 100 步輸出一次結果
    if (stepResult.step % 100 === 0) {
        const v_out = stepResult.state.nodeVoltages.get('out');
        console.log(`Time: ${(currentTime * 1e6).toFixed(1)}us, V(out): ${v_out.toFixed(4)}V`);
    }
}

// 6. 獲取最終結果
const finalState = simulator.getCircuitState();
if (finalState.isValid) {
    const final_v_out = finalState.nodeVoltages.get('out');
    console.log(`\nSimulation finished.`);
    console.log(`Final output voltage: ${final_v_out.toFixed(4)}V`);
}
```

---

### 版本資訊

您可以透過 `VERSION` 物件取得目前求解器的版本和資訊。

```javascript
import { VERSION } from './index.js';

console.log(`AkingSPICE Version: ${VERSION.major}.${VERSION.minor}.${VERSION.patch}`);
console.log(`Edition: ${VERSION.name}`);
```