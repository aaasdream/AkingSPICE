好的，這是一份根據您提供的最新程式碼更新後的 AkingSPICE 2.1 專案架構與開發者指南。舊文件中的內容已被完全對齊和擴充，以反映當前的程式碼庫。

## 🎉 重大架構更新 (2025年10月)

### ✅ 已完成的核心重構

**統一組件介面架構**：
- 引入了全新的 `AssemblyContext` 統一組裝上下文
- 所有組件現在都實現 `assemble(context)` 方法，徹底解決了 `stamp()` vs `load()` 的介面分裂問題
- 仿真引擎的 `_assembleSystem()` 方法現在使用統一的組裝循環，大幅簡化了核心邏輯

**額外變數管理器整合**：
- `ExtraVariableIndexManager` 已完全整合到仿真引擎的初始化流程中
- 引擎現在能夠正確模擬含有電感 (L)、電壓源 (V) 和理想變壓器 (K) 的電路
- 支援自動分配和管理擴展 MNA 矩陣中的額外電流變數

**DC 分析時間依賴修復**：
- `_assembleSystem()` 方法現在接受時間參數，確保 DC 分析在 t=0 進行
- 消除了 DC 分析中可能的時間依賴錯誤

---

## AkingSPICE 2.1 增強版架構設計文件

### 🏗️ 核心設計理念

AkingSPICE 2.1 是一個專為電力電子應用優化、基於現代數值方法的**通用電路仿真引擎**。其設計遵循以下核心原則：

1.  **分層與解耦**: 嚴格劃分不同層次的職責，確保核心引擎的通用性和可擴展性。
    *   **元件庫層 (`/src/components/`)**: 提供通用的基礎電路元件（R, L, C, V, 理想變壓器 K）。這些是構建任何電路的基礎模塊。
    *   **智能設備層 (`/src/core/devices/`)**: 專門處理需要高級非線性建模的半導體器件（MOSFET, Diode）。它們擁有獨立的、更複雜的生命週期管理。
    *   **核心算法層 (`/src/core/`)**: 包含所有核心的數值與仿真算法，如 MNA 系統構建、Generalized-α 時間積分器、事件檢測器、非線性求解策略等。
    *   **數學庫層 (`/src/math/`)**: 提供基礎數學工具，如稀疏矩陣、向量運算和數值穩定性保障。

2.  **通用性與擴展性**:
    *   **核心引擎**: `CircuitSimulationEngine` 完全通用，不依賴任何特定電路拓撲。
    *   **統一接口**: 所有元件和設備都遵循標準接口 (`ComponentInterface`, `IIntelligentDeviceModel`)，允許輕鬆添加新模型。
    *   **模塊化算法**: 積分器、求解器、事件檢測器等核心模塊均為獨立模塊，便於升級和替換。

3.  **數值魯棒性**:
    *   **現代積分器**: 採用 L-穩定且具有可控數值阻尼的 **Generalized-α** 積分器，專為電力電子中的剛性系統設計。
    *   **高級收斂策略**: DC 分析採用 **Source Stepping** 和 **Gmin Stepping** 等 Homotopy 方法；瞬態分析中的 Newton-Raphson 循環具備 **步長阻尼** 和 **線搜索** 等全局策略，確保在強非線性電路中的收斂性。
    *   **事件驅動**: 使用**零交叉檢測**和**二分法**精確定位開關事件，取代過時的 MCP/LCP 方法，準確處理不連續性。

### 📁 正確的目錄結構 (已對齊當前程式碼)

```
AkingSPICE/
└── src/
    ├── components/              # 🧩 通用基礎元件庫
    │   ├── coupling/            # 耦合元件 (e.g., Transformer)
    │   ├── passive/             # 無源元件 (R, L, C)
    │   └── sources/             # 獨立源 (V, I)
    │
    ├── core/                    # 🔥 仿真引擎核心 (通用)
    │   ├── devices/             # 🧠 智能非線性設備 (MOSFET, Diode)
    │   ├── events/              # 🔄 事件檢測系統
    │   ├── integrator/          # 📈 時間積分器 (Generalized-α)
    │   ├── interfaces/          # 📋 核心接口定義
    │   ├── mna/                 # ⚙️ MNA 系統構建與變量管理
    │   ├── parser/              # 📝 SPICE 網表解析器
    │   └── simulation/          # 🚀 仿真主引擎
    │
    ├── math/                    # 🧮 數學庫
    │   ├── numerical/           # 數值穩定性工具
    │   └── sparse/              # 稀疏矩陣與向量
    │
    ├── types/                   # 🏷️ 全局類型定義
    │   └── index.ts
    │
    └── applications/            # 🎯 具體應用 (架構預留)
```

### 🔧 核心組件設計

#### 1. 仿真主引擎 (`CircuitSimulationEngine`)
作為系統的總指揮，它負責：
*   **生命週期管理**: 協調 DC 分析、瞬態分析的完整流程。
*   **DC 分析**: 實現包括 **Source Stepping** 和 **Gmin Stepping** 在內的多種 Homotopy 方法來求解複雜電路的初始工作點。
*   **瞬態分析循環**:
    *   管理主時間步進循環。
    *   調用 **Generalized-α 積分器** 處理時間相關項。
    *   執行 **Newton-Raphson** 迭代求解非線性方程組。
    *   應用 **步長阻尼** 和 **線搜索** 等全局收斂策略。
*   **事件處理**: 與 `EventDetector` 協作，在開關事件發生時調整時間步長，確保精度和穩定性。
*   **結果收集**: 存儲時間點、節點電壓、支路電流等波形數據。

#### 2. 元件與設備接口 (已重構)
*   **統一組裝接口 `AssemblyContext`**:
    ```typescript
    interface AssemblyContext {
      matrix: SparseMatrix;
      rhs: Vector;
      nodeMap: Map<string, number>;
      currentTime: number;
      solutionVector?: Vector;
      gmin?: number;
      getExtraVariableIndex?: (componentName: string, variableType: string) => number | undefined;
    }
    ```
*   **重構後的 `ComponentInterface`**:
    所有組件現在實現統一的 `assemble(context: AssemblyContext)` 方法，取代了舊的 `stamp()` 和 `load()` 分裂。
    ```typescript
    interface ComponentInterface {
      assemble(context: AssemblyContext): void;
      // 其他方法保持不變...
    }
    ```
      
      // ... 狀態更新與性能診斷
    }
    ```

#### 3. MNA 系統與擴展變量
*   **擴展修正節點分析 (Extended MNA)**: 為了處理電壓源(V)、電感(L)、理想變壓器(K)等需要引入未知電流的元件，系統採用了擴展 MNA。
*   **`ExtraVariableIndexManager` (`/src/core/mna/extra_variable_manager.ts`)**:
    此管理器專門負責分配和管理這些額外的電流變量在系統矩陣中的索引。每個需要額外變量的元件在初始化時向管理器請求索引，並在 `stamp` 方法中使用這些索引來構建擴展的 MNA 方程。

#### 4. 元件實現範例

*   **基礎線性元件 (Resistor)**:
    ```typescript
    // src/components/passive/resistor.ts
    class Resistor implements ComponentInterface {
      // ... 構造函數 ...
      stamp(matrix: SparseMatrix, _rhs: Vector, nodeMap: Map<string, number>): void {
        const n1 = nodeMap.get(this.nodes[0]);
        const n2 = nodeMap.get(this.nodes[1]);
        const g = 1.0 / this._resistance;
        
        if (n1 !== undefined && n1 >= 0) {
          matrix.add(n1, n1, g);
          if (n2 !== undefined && n2 >= 0) matrix.add(n1, n2, -g);
        }
        if (n2 !== undefined && n2 >= 0) {
          matrix.add(n2, n2, g);
          if (n1 !== undefined && n1 >= 0) matrix.add(n2, n1, -g);
        }
      }
    }
    ```*   **需要擴展變量的元件 (IdealTransformer)**:
    ```typescript
    // src/components/coupling/transformer.ts
    class IdealTransformer implements ComponentInterface {
      private _primaryCurrentIndex?: number;
      private _secondaryCurrentIndex?: number;

      // 在仿真初始化時被調用
      setCurrentIndices(primaryIndex: number, secondaryIndex: number): void {
        this._primaryCurrentIndex = primaryIndex;
        this._secondaryCurrentIndex = secondaryIndex;
      }
      
      stamp(matrix: SparseMatrix, _rhs: Vector, nodeMap: Map<string, number>): void {
        // ... 獲取節點索引 np1, np2, ns1, ns2 ...
        const ip = this._primaryCurrentIndex!;
        const is = this._secondaryCurrentIndex!;
        const n = this._turnsRatio;

        // KCL 方程貢獻 (將支路電流 ip, is 關聯到節點)
        MNAStampingHelpers.safeMatrixAdd(matrix, np1, ip, 1, this.name);
        // ...

        // 支路方程 (電壓關係和電流關係)
        // (Vp1-Vp2) - n*(Vs1-Vs2) = 0
        MNAStampingHelpers.safeMatrixAdd(matrix, ip, np1, 1, this.name);
        // ...
        // n*ip + is = 0
        MNAStampingHelpers.safeMatrixAdd(matrix, is, ip, n, this.name);
        MNAStampingHelpers.safeMatrixAdd(matrix, is, is, 1, this.name);
      }
    }
    ```

### 🚀 開發流程與貢獻指南

#### 架構演進
舊架構中的問題（如核心引擎與具體應用耦合、缺少基礎元件庫）已經在 2.1 版本中得到解決。當前的架構是清晰、分層和可擴展的。

#### 如何接手開發

1.  **理解架構分層**:
    *   要添加**新的基礎元件** (如憶阻器) -> 在 `src/components/` 下創建新文件，實現 `ComponentInterface`。
    *   要添加**新的智能半導體** (如 IGBT) -> 在 `src/core/devices/` 下創建新文件，繼承 `IntelligentDeviceModelBase`。
    *   要實現**新的電路應用** (如三相逆變器) -> 在 `src/applications/` 目錄下創建，並使用元件工廠 (`TransformerFactory`, `CapacitorFactory`) 和智能設備工廠 (`SmartDeviceFactory`) 來構建電路。
    *   要**改進數值算法** -> 修改 `src/core/integrator/` 或 `src/math/sparse/` 中的對應模塊。

2.  **開發新元件的步驟**:
    1.  **選擇正確的層級**:
        *   **簡單元件 (線性或非時變)**: 在 `src/components/` 中實現 `ComponentInterface`。
        *   **需要額外變量**: 參考 `IdealTransformer` 或 `Inductor`，實現 `getExtraVariableCount()` 並在仿真器初始化時獲取索引。
        *   **複雜非線性半導體**: 在 `src/core/devices/` 中繼承 `IntelligentDeviceModelBase`，實現 `load()` 等高級接口。
    2.  **實現 `stamp()` 或 `load()`**: 根據元件的數學模型，提供其對 MNA 系統的貢獻。
    3.  **集成到解析器**: 如果需要從 SPICE 網表創建，修改 `SpiceNetlistParser` 的 `_createDeviceFromElement` 方法。
    4.  **添加到工廠 (可選)**: 為了方便程序化創建，可以在對應的工廠類中（如 `CapacitorFactory`）添加創建輔助函數。
    5.  **編寫單元測試**: 創建對應的 `.test.ts` 文件，驗證 `stamp()` 或 `load()` 的正確性。

### 🎯 成功標準

AkingSPICE 2.1 作為一個現代電路仿真引擎，其成功標準在於：
*   ✅ **可擴展性**: 開發者可以輕鬆地添加新的、從簡單到複雜的元件模型。
*   ✅ **通用性**: 能夠仿真任意拓撲的 SPICE 電路，而不僅僅是特定應用。
*   ✅ **解耦性**: 核心仿真算法與具體的元件物理模型完全分離。
*   ✅ **魯棒性**: 對於電力電子中的剛性、非線性問題具有工業級的收斂性和穩定性。
*   ✅ **高性能**: 稀疏矩陣求解器能夠高效處理大規模電路。

---

## AkingSPICE v2.1: Onboarding & Architecture Reference (Updated)

### 1.0 Introduction

#### 1.1 Project Overview
AkingSPICE 2.1 is a modern, high-performance circuit simulation engine tailored for power electronics applications. It addresses the numerical stability challenges of high-frequency switching circuits by leveraging a state-of-the-art software architecture and numerical methods.

#### 1.2 Key Technological Pillars
*   **Extended Modified Nodal Analysis (MNA)**: The foundational mathematical framework, extended to handle components like inductors, voltage sources, and transformers by introducing their currents as unknown variables. The `ExtraVariableIndexManager` is dedicated to this task.
*   **Generalized-α Integrator**: A second-order accurate, L-stable time-domain integrator for stiff Differential-Algebraic Equations (DAEs), providing controllable numerical damping crucial for power electronics.
*   **Unified Dual-Component Model**:
    1.  **Basic Components (`/src/components`)**: A library of standard, reusable components (R, L, C, V, K) that implement the simple `ComponentInterface`.
    2.  **Intelligent Devices (`/src/core/devices`)**: An advanced framework for complex, non-linear devices (MOSFET, Diode) that require sophisticated modeling and actively participate in the convergence process via the `IIntelligentDeviceModel` interface.
*   **Event-Driven Simulation**: A modern `EventDetector` that uses zero-crossing and bisection to precisely handle discontinuities, replacing older, less robust methods.
*   **Robust Non-Linear Solver**: The `CircuitSimulationEngine` implements a sophisticated Newton-Raphson loop with advanced homotopy methods (**Source Stepping**, **Gmin Stepping**) for DC analysis and global strategies (**damped steps**, **line search**) for transient analysis.

### 2.0 System Architecture

#### 2.1 Architectural Flow
**Netlist Parser** → **CircuitSimulationEngine** → **MNA System Builder (with ExtraVariableManager)** → **DC Solver (with Homotopy)** → **Transient Solver (GeneralizedAlphaIntegrator + Newton-Raphson Loop)** → **Sparse Matrix Solver** → **Waveform Data Storage**.

#### 2.2 Core Architectural Components
*   **`CircuitSimulationEngine`**: The main orchestrator managing the simulation lifecycle, coordinating all modules, and controlling the time-stepping and Newton-Raphson loops.
*   **`ExtraVariableIndexManager`**: Manages the allocation of additional unknown current variables for the extended MNA matrix, crucial for components like inductors, voltage sources, and transformers.
*   **Component & Device Models**: The core abstractions for all circuit elements. Each element provides its mathematical contribution (its "stamp") to the MNA system.
*   **`GeneralizedAlphaIntegrator`**: Discretizes time-dependent equations, providing history-dependent terms for reactive components (capacitors, inductors) at each time step.
*   **`SparseMatrix`**: The linear algebra workhorse. Solves the `Ax = b` system at each iteration, with a pluggable backend architecture to support solvers like KLU.

### 3.0 Key Abstractions & Data Structures

#### 3.1 The Extended MNA System: Ax = b
*   **A (Jacobian Matrix)**: `SparseMatrix`. Assembled from the `stamp()` or `load()` contributions of all components. For non-linear circuits, this is the Jacobian of the system.
*   **b (RHS Vector)**: `Vector`. Assembled from independent sources and historical terms. For non-linear iterations, `-b` represents the residual vector `F(x)`.
*   **x (Solution Vector)**: `Vector`. Contains node voltages **and** the extra branch currents managed by `ExtraVariableIndexManager`.

#### 3.2 The Component Contracts
*   **`ComponentInterface`**: The universal API for basic circuit elements (R, L, C, V, K). Its key method is `stamp()`, which adds the component's linearized contribution to the system.
*   **`IIntelligentDeviceModel`**: The advanced API for non-linear devices (MOSFET, Diode).
    *   `load()`: Calculates the device's operating point and provides its linearized stamp for the current Newton iteration.
    *   `checkConvergence()`: Allows the device to report its own convergence status based on physical properties (e.g., region of operation).
    *   `limitUpdate()`: Dampens the Newton-Raphson step to prevent non-physical solutions and improve convergence.

### 4.0 Developer's Guide

#### 4.1 Contribution Guide: Adding a New Component

##### **Case Study 1: A Basic Linear Component (Resistor)**
1.  **File Creation**: `src/components/passive/resistor.ts`.
2.  **Interface Implementation**: Implement `ComponentInterface`.
3.  **MNA Stamping**: Implement `stamp()`. For a resistor, this is a straightforward stamping of its conductance `G = 1/R` into the MNA matrix.
4.  **Parser Integration**: Modify `SpiceNetlistParser` to recognize the 'R' element.
5.  **Unit Testing**: Create `tests/resistor.test.ts` to verify the `stamp()` behavior.

##### **Case Study 2: A Component with Extra Variables (Ideal Transformer)**
1.  **File Creation**: `src/components/coupling/transformer.ts`.
2.  **Interface Implementation**: Implement `ComponentInterface` and add `getExtraVariableCount()` which should return `2`.
3.  **Index Management**: The class must have a method like `setCurrentIndices(primaryIndex, secondaryIndex)` that the simulation engine will call during initialization.
4.  **MNA Stamping**: The `stamp()` method will use these stored indices to add contributions to the expanded parts of the MNA matrix, defining the voltage and current relationship equations.
5.  **Testing**: Tests must verify both the KCL contributions at the nodes and the correctness of the new branch equations.

##### **Case Study 3: An "Intelligent" Non-Linear Component (Diode)**
1.  **File Creation**: `src/core/devices/intelligent_diode.ts`.
2.  **Inheritance**: Extend `IntelligentDeviceModelBase`.
3.  **Model Implementation**: Implement the `load()` method. This involves:
    a. Calculating the current based on the diode voltage (e.g., Shockley equation).
    b. Calculating the dynamic conductance (`dI/dV`), which is the derivative.
    c. Using these values to compute the stamp for the Jacobian (conductance) and the residual (the difference between the actual current and the linearized current).
4.  **Factory Integration**: Add a `createDiode` static method to `SmartDeviceFactory`.
5.  **Integration Testing**: Write tests that place the diode in a circuit and verify the non-linear DC solution against expected values.

### 5.0 Appendices

#### 5.1 Glossary of Terms
*   **Stamp**: The process of adding a component's contribution to the MNA system matrix and RHS vector.
*   **Extended MNA**: An extension of MNA that adds branch currents for certain elements as system unknowns, allowing them to be modeled.
*   **Homotopy**: A class of methods (like Source Stepping and Gmin Stepping) used to solve difficult non-linear problems by starting from a simpler problem and gradually transforming it into the actual one.
*   **Gmin Stepping**: A homotopy method where a small artificial conductance is placed in parallel with non-linear devices and gradually reduced to zero, aiding convergence.
*   **Source Stepping**: A homotopy method where all independent sources are ramped from zero to their full value, solving the system at each intermediate step.
*   **Jacobian**: The matrix of first-order partial derivatives of a system of non-linear equations. In our MNA, this is the `A` matrix in `Ax=b`.
*   **Stiff System**: A system of differential equations where numerical stability, rather than accuracy, dictates the required step size. Common in power electronics due to vastly different time constants.


請修正錯誤時以達成通用電力電子模擬器為目標，而不是為了達成某個應用範例。

注意我們的SRC裡面只存放.ts 所有的.js都是編譯的不要產生.js在src資料夾中，或是src的子資料夾。