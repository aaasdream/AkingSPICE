# 理想变压器组件 (IdealTransformer)

## 概述

理想变压器是 AkingSPICE 2.1 中新增的耦合组件，用于模拟无损耗的磁耦合器件。它基于扩展修正节点分析法 (Extended MNA) 实现，能够准确模拟变压器的电压变换和电流变换关系。

## 特性

- ✅ **无损耗模型**: 理想变压器假设无电阻损耗、无漏感
- ✅ **精确变换**: 严格满足电压比和电流比关系
- ✅ **功率守恒**: 自动确保初级功率等于次级功率
- ✅ **扩展MNA**: 使用两个额外的电流支路变量
- ✅ **完整验证**: 包含参数验证和数值稳定性检查
- ✅ **工厂方法**: 提供多种创建方式和预设配置

## 基本原理

理想变压器满足以下基本关系：

### 电压关系
```
Vp / Vs = n
```
其中：
- `Vp` = 初级电压
- `Vs` = 次级电压  
- `n` = 匝数比 (初级匝数 / 次级匝数)

### 电流关系
```
n * Ip + Is = 0
```
即：`Ip = -Is / n`

### 功率守恒
```
Pp = Ps
Vp * Ip = Vs * Is
```

### 阻抗变换
```
Zp = n² * Zs
```

## 快速开始

### 基本创建

```typescript
import { IdealTransformer } from '@akingspice/core';

// 创建 2:1 降压变压器
const transformer = new IdealTransformer(
  'T1',                                    // 变压器名称
  ['p1', 'p2', 's1', 's2'],              // [初级+, 初级-, 次级+, 次级-]
  2.0                                     // 匝数比
);
```

### 使用工厂方法

```typescript
import { TransformerFactory } from '@akingspice/core';

// 电力变压器 (220V -> 110V)
const powerTransformer = TransformerFactory.createPowerTransformer(
  'T_power',
  ['line', 'neutral'],
  ['out', 'out_neutral'],
  220,  // 初级电压
  110   // 次级电压
);

// 隔离变压器 (1:1)
const isolation = TransformerFactory.createIsolationTransformer(
  'T_iso',
  ['in_hot', 'in_neutral'],
  ['out_hot', 'out_neutral']
);

// 升压变压器 (1:5)
const stepUp = TransformerFactory.createStepUpTransformer(
  'T_boost',
  ['low_in', 'low_gnd'],
  ['high_out', 'high_gnd'],
  5.0
);
```

## MNA 矩阵装配

理想变压器需要扩展 MNA 矩阵来处理耦合关系：

```typescript
// 设置电流支路索引
transformer.setCurrentIndices(primaryIndex, secondaryIndex);

// 装配到 MNA 矩阵
transformer.stamp(matrix, rhs, nodeMap);
```

### 矩阵结构

扩展后的 MNA 矩阵包含：

```
[G   B ] [V ]   [I_s]
[C   D ] [I_L] = [V_s]
```

其中增加的方程：
1. 电压关系：`(Vp1-Vp2) - n*(Vs1-Vs2) = 0`
2. 电流关系：`n*Ip + Is = 0`

## API 参考

### 构造函数

```typescript
new IdealTransformer(
  name: string,                           // 变压器名称
  nodes: [string, string, string, string], // 节点连接
  turnsRatio: number                      // 匝数比
)
```

### 主要方法

#### 电气计算

```typescript
// 计算次级电压
transformer.calculateSecondaryVoltage(primaryVoltage: number): number

// 计算初级电流
transformer.calculatePrimaryCurrent(secondaryCurrent: number): number

// 验证功率守恒
transformer.verifyPowerConservation(
  primaryVoltage: number,
  primaryCurrent: number,
  secondaryVoltage: number,
  secondaryCurrent: number
): PowerConservationResult

// 阻抗变换
transformer.transformImpedance(secondaryImpedance: number): number
```

#### 矩阵装配

```typescript
// 设置电流支路索引
transformer.setCurrentIndices(primaryIndex: number, secondaryIndex: number): void

// MNA 矩阵装配
transformer.stamp(matrix: SparseMatrix, rhs: Vector, nodeMap: Map<string, number>): void

// 获取额外变量数量
transformer.getExtraVariableCount(): number
```

#### 验证和信息

```typescript
// 参数验证
transformer.validate(): ValidationResult

// 获取组件信息
transformer.getInfo(): ComponentInfo
```

### 属性

```typescript
readonly name: string          // 变压器名称
readonly type: string          // 组件类型 ('K')
readonly nodes: readonly string[]  // 连接节点
readonly turnsRatio: number    // 匝数比
```

## 应用示例

### 电源变压器电路

```typescript
// 220V AC 转 12V AC 电源电路
const powerTransformer = TransformerFactory.createPowerTransformer(
  'T_main',
  ['AC_L', 'AC_N'],    // 220V 输入
  ['V12_1', 'V12_2'],  // 12V 输出
  220, 12
);

// 验证设计
const outputVoltage = powerTransformer.calculateSecondaryVoltage(220);
console.log(`输出电压: ${outputVoltage}V`); // 12V
```

### 阻抗匹配

```typescript
// 音频变压器：匹配 8Ω 扬声器到 200Ω 放大器输出
const audioTransformer = new IdealTransformer(
  'T_audio',
  ['amp_out', 'amp_gnd', 'spk_pos', 'spk_neg'],
  5.0  // n = √(200/8) = 5
);

const matchedImpedance = audioTransformer.transformImpedance(8);
console.log(`匹配阻抗: ${matchedImpedance}Ω`); // 200Ω
```

### 隔离电路

```typescript
// 医疗设备隔离
const medicalIsolation = TransformerFactory.createIsolationTransformer(
  'T_medical',
  ['primary_hot', 'primary_neutral'],
  ['isolated_hot', 'isolated_neutral']
);

// 确保完全电气隔离，同时保持相同的电压电流关系
```

## 注意事项

### 数值稳定性

- ✅ 匝数比建议范围：`1e-6` 到 `1e6`
- ⚠️ 极小或极大的匝数比可能导致数值问题
- ✅ 自动验证会发出相应警告

### 仿真要求

- 🔴 **必须设置电流支路索引** 才能进行 MNA 装配
- 🔴 **节点不能重复** 
- 🔴 **绕组不能短路** (同一绕组的两个节点不能相同)

### 性能考虑

- ✅ 每个变压器增加 2 个额外变量到系统矩阵
- ✅ 装配时间复杂度为 O(1)
- ✅ 适合大规模电路仿真

## 测试验证

运行变压器组件测试：

```bash
npm test tests/ideal-transformer.test.ts
```

查看使用示例：

```bash
node examples/ideal-transformer-demo.ts
```

## 扩展功能

### 计划中的增强

- 🔄 **非理想变压器**: 包含漏感和绕组电阻
- 🔄 **多绕组变压器**: 支持多个次级绕组
- 🔄 **磁饱和模型**: 考虑铁芯饱和特性
- 🔄 **频率响应**: 支持寄生电容和高频效应

## 技术支持

如有问题或建议，请参考：

- 📚 [AkingSPICE 技术文档](./docs/ARCHITECTURE.md)
- 🐛 [问题报告](https://github.com/aaasdream/AkingSPICE/issues)
- 💬 [讨论区](https://github.com/aaasdream/AkingSPICE/discussions)

---

**AkingSPICE 2.1** - 现代化电路仿真引擎  
© 2025 AkingSPICE Team