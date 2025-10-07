/**
 * 🧠 智能设备工厂 - AkingSPICE 2.1 重构版
 * 
 * 专注于非线性智能器件的创建和配置
 * 只包含 MOSFET、Diode 等需要智能建模的器件
 * 
 * 📋 重构说明：
 * - 移除基础组件 (R,L,C) - 它们在 src/components/ 中
 * - 专注智能设备的非线性建模和优化
 * - 提供电力电子应用的预设配置
 * 
 * 🎯 支持器件：
 * - MOSFET: 开关建模、寄生效应、温度特性
 * - Diode: 反向恢复、正向压降、热建模
 */

import { 
  IIntelligentDeviceModel,
  MOSFETParameters,
  DiodeParameters
} from './intelligent_device_model';
import { IntelligentMOSFET } from './intelligent_mosfet';
import { IntelligentDiode } from './intelligent_diode';

/**
 * 🧠 智能设备工厂
 * 
 * 专注非线性智能器件的创建和优化配置
 * 为电力电子应用提供预设参数
 */
export class SmartDeviceFactory {
  /**
   * 创建 MOSFET 智能模型
   */
  static createMOSFET(
    deviceId: string,
    nodes: [number, number, number], // [Drain, Gate, Source]
    parameters: Partial<MOSFETParameters>
  ): IIntelligentDeviceModel {
    // 参数验证和默认值
    const validatedParams: MOSFETParameters = {
      Vth: parameters.Vth ?? 2.0,        // 默认阈值电压 2V
      Kp: parameters.Kp ?? 1e-3,         // 默认跨导参数 1mA/V²
      lambda: parameters.lambda ?? 0.01, // 默认沟道调制参数
      Cgs: parameters.Cgs ?? 1e-12,      // 默认栅源电容 1pF
      Cgd: parameters.Cgd ?? 1e-12,      // 默认栅漏电容 1pF
      Ron: parameters.Ron ?? 0.1,        // 默认导通电阻 100mΩ
      Roff: parameters.Roff ?? 1e6,      // 默认关断电阻 1MΩ
      Vmax: parameters.Vmax ?? 100,      // 默认最大电压 100V
      Imax: parameters.Imax ?? 10        // 默认最大电流 10A
    };
    
    // 参数合理性检查
    SmartDeviceFactory._validateMOSFETParameters(validatedParams);
    
    return new IntelligentMOSFET(deviceId, nodes, validatedParams);
  }
  
  /**
   * 创建二极管智能模型  
   */
  static createDiode(
    deviceId: string,
    nodes: [number, number], // [Anode, Cathode]
    parameters: Partial<DiodeParameters>
  ): IIntelligentDeviceModel {
    // 参数验证和默认值
    const validatedParams: DiodeParameters = {
      Is: parameters.Is ?? 1e-14,        // 默认反向饱和电流 1fA
      n: parameters.n ?? 1.0,            // 默认理想因子
      Rs: parameters.Rs ?? 0.01,         // 默认串联电阻 10mΩ
      Cj0: parameters.Cj0 ?? 1e-12,      // 默认零偏结电容 1pF
      Vj: parameters.Vj ?? 0.7,          // 默认结电位 0.7V
      m: parameters.m ?? 0.5,            // 默认分级系数
      tt: parameters.tt ?? 1e-9          // 默认渡越时间 1ns
    };
    
    // 参数合理性检查
    SmartDeviceFactory._validateDiodeParameters(validatedParams);
    
    return new IntelligentDiode(deviceId, nodes, validatedParams);
  }

  /**
   * 🎯 预设配置：创建 Buck 变换器 MOSFET
   */
  static createBuckMOSFET(
    deviceId: string,
    nodes: [number, number, number],
    voltage: number = 12, // 工作电压
    current: number = 5   // 工作电流
  ): IIntelligentDeviceModel {
    const optimizedParams: MOSFETParameters = {
      Vth: Math.min(voltage * 0.1, 3.0),  // 阈值电压为工作电压的10%
      Kp: current / (voltage * voltage) * 10, // 根据工作点优化跨导
      lambda: 0.005,                       // 低沟道调制（电力MOSFET特性）
      Cgs: 500e-12,                        // 典型电力MOSFET栅源电容
      Cgd: 100e-12,                        // 栅漏电容（米勒效应）
      Ron: voltage / (current * 100),      // 导通电阻：确保压降<1%
      Roff: 1e8,                           // 高关断电阻
      Vmax: voltage * 2,                   // 安全裕量2倍
      Imax: current * 3                    // 电流裕量3倍
    };
    
    return SmartDeviceFactory.createMOSFET(deviceId, nodes, optimizedParams);
  }
  
  /**
   * 🎯 预设配置：创建续流二极管
   */
  static createFreewheelDiode(
    deviceId: string,
    nodes: [number, number],
    voltage: number = 12,
    current: number = 5
  ): IIntelligentDeviceModel {
    const optimizedParams: DiodeParameters = {
      Is: 1e-12,                           // 适中的反向电流
      n: 1.2,                              // 功率二极管典型值
      Rs: voltage / (current * 100),       // 串联电阻：压降<1%
      Cj0: current * 10e-12,               // 结电容与电流相关
      Vj: 0.7,                             // 硅二极管典型值
      m: 0.4,                              // 功率器件典型值
      tt: current * 1e-10                  // 恢复时间与电流相关
    };
    
    return SmartDeviceFactory.createDiode(deviceId, nodes, optimizedParams);
  }

  /**
   * 🎯 预设配置：创建同步整流 MOSFET
   */
  static createSyncRectMOSFET(
    deviceId: string,
    nodes: [number, number, number],
    voltage: number = 12,
    current: number = 5
  ): IIntelligentDeviceModel {
    const optimizedParams: MOSFETParameters = {
      Vth: Math.min(voltage * 0.08, 2.0), // 更低的阈值电压
      Kp: current / (voltage * voltage) * 15, // 更高的跨导
      lambda: 0.003,                       // 更低的沟道调制
      Cgs: 400e-12,                        // 优化的栅源电容
      Cgd: 50e-12,                         // 更小的栅漏电容（减少米勒效应）
      Ron: voltage / (current * 200),      // 更低的导通电阻
      Roff: 1e8,                           // 高关断电阻
      Vmax: voltage * 2,                   // 安全裕量2倍
      Imax: current * 3                    // 电流裕量3倍
    };
    
    return SmartDeviceFactory.createMOSFET(deviceId, nodes, optimizedParams);
  }

  /**
   * 🎯 预设配置：创建肖特基整流二极管
   */
  static createSchottkyDiode(
    deviceId: string,
    nodes: [number, number],
    voltage: number = 12,
    current: number = 5
  ): IIntelligentDeviceModel {
    const optimizedParams: DiodeParameters = {
      Is: 1e-8,                            // 肖特基二极管较高的反向电流
      n: 1.05,                             // 接近理想的理想因子
      Rs: voltage / (current * 200),       // 更低的串联电阻
      Cj0: current * 5e-12,                // 较小的结电容
      Vj: 0.4,                             // 肖特基二极管较低的正向压降
      m: 0.3,                              // 肖特基二极管特性
      tt: current * 1e-11                  // 极快的恢复时间
    };
    
    return SmartDeviceFactory.createDiode(deviceId, nodes, optimizedParams);
  }
  
  // === 私有参数验证方法 ===
  
  private static _validateMOSFETParameters(params: MOSFETParameters): void {
    if (params.Vth <= 0) throw new Error('MOSFET 阈值电压必须为正');
    if (params.Kp <= 0) throw new Error('MOSFET 跨导参数必须为正');
    if (params.Cgs < 0 || params.Cgd < 0) throw new Error('MOSFET 电容不能为负');
    if (params.Ron < 0 || params.Roff <= 0) throw new Error('MOSFET 电阻参数错误');
    if (params.Vmax <= params.Vth) throw new Error('最大电压必须大于阈值电压');
    if (params.Imax <= 0) throw new Error('最大电流必须为正');
  }
  
  private static _validateDiodeParameters(params: DiodeParameters): void {
    if (params.Is <= 0) throw new Error('二极管反向饱和电流必须为正');
    if (params.n <= 0) throw new Error('理想因子必须为正');
    if (params.Rs < 0) throw new Error('串联电阻不能为负');
    if (params.Cj0 < 0) throw new Error('结电容不能为负');
    if (params.Vj <= 0) throw new Error('结电位必须为正');
    if (params.m < 0 || params.m > 1) throw new Error('分级系数必须在0-1之间');
    if (params.tt < 0) throw new Error('渡越时间不能为负');
  }
}

/**
 * 🎯 Buck 变换器智能器件套件
 * 
 * 一键创建 Buck 变换器所需的智能器件（仅非线性部分）
 * 注意：R、L、C 等基础组件在 src/components/ 中处理
 */
export class BuckConverterSmartKit {
  /**
   * 创建 Buck 变换器的智能器件集
   */
  static createSmartDevices(
    inputVoltage: number = 12,    // 输入电压
    outputCurrent: number = 3     // 输出电流
  ) {
    return {
      // 主开关 MOSFET
      mainSwitch: SmartDeviceFactory.createBuckMOSFET(
        'M1', [1, 2, 0], // [Drain=Vin, Gate=Control, Source=SW]
        inputVoltage, outputCurrent * 1.2
      ),
      
      // 续流二极管 (或同步整流MOSFET)
      freewheelDiode: SmartDeviceFactory.createFreewheelDiode(
        'D1', [0, 1], // [Anode=GND, Cathode=SW]  
        inputVoltage, outputCurrent * 1.2
      ),

      // 可选：同步整流MOSFET (替代续流二极管)
      syncRectMOSFET: SmartDeviceFactory.createSyncRectMOSFET(
        'M2', [0, 3, 1], // [Drain=GND, Gate=SyncCtrl, Source=SW]
        inputVoltage, outputCurrent * 1.2
      ),
      
      // 设计参数总结
      designSummary: {
        inputVoltage,
        outputCurrent,
        deviceTypes: ['MOSFET主开关', '续流二极管', '同步整流MOSFET'],
        note: '基础组件(R,L,C)请使用 src/components/ 中的标准实现'
      }
    };
  }
}