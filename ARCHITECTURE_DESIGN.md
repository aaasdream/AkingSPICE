# AkingSPICE 2.1 架构设计文档

## 🏗️ 核心设计理念

AkingSPICE 2.1 是一个**通用电路仿真引擎**，遵循以下设计原则：

### 1. 分层架构原则
```
应用层 (Applications)     - 具体电路应用 (Buck, Boost, 放大器等)
组件库层 (Components)     - 通用电路元件 (R, L, C, MOSFET, Diode)  
算法层 (Algorithms)      - 数值算法 (MNA, 时间积分, 求解器)
核心层 (Core Engine)     - 仿真引擎核心 (矩阵操作, 时间步进)
```

### 2. 通用性原则
- **核心引擎**: 只包含通用的仿真算法，不依赖具体电路
- **组件库**: 提供标准的 SPICE 元件模型
- **应用层**: 在核心之上构建具体的电路应用

### 3. 可扩展性原则
- **插件化组件**: 新元件通过标准接口添加
- **模块化算法**: 积分器、求解器可独立替换
- **标准化接口**: 统一的 API 设计

## 📁 正确的目录结构

```
AkingSPICE/
├── src/
│   ├── core/                    # 🔥 仿真引擎核心 (通用)
│   │   ├── engine/              # 仿真引擎
│   │   │   ├── simulation_engine.ts
│   │   │   ├── matrix_solver.ts
│   │   │   └── time_stepper.ts
│   │   ├── algorithms/          # 数值算法
│   │   │   ├── mna_formulator.ts
│   │   │   ├── generalized_alpha.ts
│   │   │   └── sparse_solver.ts
│   │   └── interfaces/          # 核心接口定义
│   │       ├── component_interface.ts
│   │       ├── solver_interface.ts
│   │       └── simulation_interface.ts
│   │
│   ├── components/              # 🧩 通用元件库
│   │   ├── basic/              # 基础元件
│   │   │   ├── resistor.ts
│   │   │   ├── capacitor.ts
│   │   │   ├── inductor.ts
│   │   │   └── voltage_source.ts
│   │   ├── semiconductors/     # 半导体器件
│   │   │   ├── diode.ts
│   │   │   ├── mosfet.ts
│   │   │   └── bjt.ts
│   │   └── factory/           # 元件工厂
│   │       └── component_factory.ts
│   │
│   ├── parser/                 # 📝 网表解析
│   │   ├── spice_parser.ts
│   │   ├── netlist_validator.ts
│   │   └── circuit_builder.ts
│   │
│   └── applications/           # 🎯 具体应用 (在核心之上)
│       ├── power_converters/   # 电源变换器应用
│       │   ├── buck_converter.ts
│       │   ├── boost_converter.ts
│       │   └── flyback_converter.ts
│       ├── amplifiers/         # 放大器应用
│       └── filters/            # 滤波器应用
│
├── tests/                      # 🧪 测试
│   ├── unit/                   # 单元测试
│   ├── integration/            # 集成测试
│   └── examples/               # 示例电路
│
└── docs/                       # 📚 文档
    ├── api/                    # API 文档
    ├── tutorials/              # 教程
    └── examples/               # 使用示例
```

## 🔧 核心组件设计

### 1. 仿真引擎核心 (Core Engine)

```typescript
// 核心仿真引擎 - 完全通用，不依赖具体电路
class SimulationEngine {
  private solver: MatrixSolver;
  private timestepper: TimeStepper;
  private components: ComponentInterface[];
  
  // 通用仿真流程
  simulate(circuit: Circuit, options: SimulationOptions): SimulationResult;
  
  // 添加任意组件
  addComponent(component: ComponentInterface): void;
  
  // 时间步进
  step(dt: number): void;
}
```

### 2. 组件接口 (Component Interface)

```typescript
// 所有电路元件必须实现的统一接口
interface ComponentInterface {
  // 基础属性
  readonly id: string;
  readonly type: ComponentType;
  readonly nodes: number[];
  
  // MNA 方法
  stamp(matrix: SparseMatrix, rhs: Vector): void;
  
  // 时域方法 (可选)
  updateTransient?(time: number, dt: number): void;
  
  // 非线性方法 (可选)  
  updateNonlinear?(voltages: Vector): void;
}
```

### 3. 基础元件实现

```typescript
// 电阻 - 最基础的线性元件
class Resistor implements ComponentInterface {
  constructor(
    public readonly id: string,
    public readonly nodes: [number, number],
    public readonly resistance: number
  ) {}
  
  stamp(matrix: SparseMatrix, rhs: Vector): void {
    const g = 1.0 / this.resistance;
    const [n1, n2] = this.nodes;
    
    matrix.add(n1, n1, g);
    matrix.add(n2, n2, g);
    matrix.add(n1, n2, -g);
    matrix.add(n2, n1, -g);
  }
}

// 电容 - 时域相关元件
class Capacitor implements ComponentInterface {
  private history: number[] = [];
  
  constructor(
    public readonly id: string,
    public readonly nodes: [number, number],
    public readonly capacitance: number
  ) {}
  
  stamp(matrix: SparseMatrix, rhs: Vector): void {
    // 使用 companion model
    const geq = this.getEquivalentConductance();
    const ieq = this.getEquivalentCurrent();
    
    // 添加到矩阵
    matrix.add(this.nodes[0], this.nodes[0], geq);
    matrix.add(this.nodes[1], this.nodes[1], geq);
    matrix.add(this.nodes[0], this.nodes[1], -geq);
    matrix.add(this.nodes[1], this.nodes[0], -geq);
    
    rhs.add(this.nodes[0], ieq);
    rhs.add(this.nodes[1], -ieq);
  }
  
  updateTransient(time: number, dt: number): void {
    // 更新历史数据用于下一步
    this.updateHistory();
  }
}
```

## 🚀 开发流程

### Phase 1: 核心基础 (当前需要)
1. ✅ **基础元件**: R, L, C, V_source, I_source
2. ✅ **MNA 构建器**: 通用矩阵装配
3. ✅ **稀疏求解器**: KLU 或其他求解器
4. ✅ **时间步进器**: BE/TR/Gear2 积分

### Phase 2: 非线性支持  
1. **非线性元件**: Diode, MOSFET, BJT
2. **Newton 求解器**: 非线性方程求解
3. **收敛控制**: 自适应步长

### Phase 3: 高级功能
1. **AC 分析**: 小信号分析
2. **DC 扫描**: 参数扫描
3. **噪声分析**: 噪声仿真

### Phase 4: 应用层
1. **电路模板**: Buck, Boost 等应用
2. **优化工具**: 参数优化
3. **可视化**: 波形显示

## 👥 如何接手开发

### 1. 理解架构分层
```
我要添加新功能 → 确定应该在哪一层
├── 新的元件模型 → components/ 目录
├── 新的数值算法 → core/algorithms/ 目录  
├── 新的应用电路 → applications/ 目录
└── 核心引擎修改 → core/engine/ 目录 (谨慎!)
```

### 2. 开发新元件的步骤
```typescript
// 1. 实现 ComponentInterface
class MyNewComponent implements ComponentInterface {
  // 实现必需方法
}

// 2. 添加到工厂
ComponentFactory.register('mynewcomponent', MyNewComponent);

// 3. 添加到 SPICE 解析器
SpiceParser.addElementType('X', MyNewComponent);

// 4. 编写单元测试
describe('MyNewComponent', () => {
  // 测试用例
});
```

### 3. 开发新应用的步骤
```typescript
// 1. 在 applications/ 下创建
class MyCircuitApplication {
  private engine: SimulationEngine;
  
  constructor() {
    this.engine = new SimulationEngine();
    this.setupComponents();
  }
  
  private setupComponents(): void {
    // 使用通用组件库构建电路
    this.engine.addComponent(new Resistor('R1', [1, 0], 100));
    this.engine.addComponent(new Capacitor('C1', [1, 2], 1e-6));
  }
}
```

### 4. 代码质量标准
- **单元测试**: 每个组件都要有测试
- **集成测试**: 整个仿真流程测试
- **文档**: API 文档和使用示例
- **性能测试**: 大电路仿真验证

## 🐛 当前问题分析

### 问题 1: 架构混乱
```
❌ 错误: 在核心引擎中硬编码 Buck 变换器
✅ 正确: Buck 变换器应该在 applications/ 层
```

### 问题 2: 缺少基础组件
```
❌ 错误: 只有高级的智能组件，缺少基础 R, L, C
✅ 正确: 先实现基础组件，再构建复杂电路
```

### 问题 3: 测试不足
```
❌ 错误: 写了大量代码但没测试
✅ 正确: TDD - 测试驱动开发
```

## 📋 重构计划

1. **立即修复**: 移除核心中的 Buck 特定代码
2. **重新设计**: 基于正确架构重写核心组件  
3. **基础优先**: 先实现 R, L, C 等基础元件
4. **测试保证**: 每个组件都要有完整测试
5. **文档完善**: API 文档和使用教程

## 🎯 成功标准

一个好的电路仿真引擎应该：
- ✅ **用户可以轻松添加新元件**
- ✅ **用户可以仿真任意 SPICE 电路**  
- ✅ **核心引擎与具体应用解耦**
- ✅ **有完整的测试和文档**
- ✅ **性能满足工程需求**

---

这就是正确的 AkingSPICE 2.1 架构设计。接下来我会基于这个架构重新实现核心组件。