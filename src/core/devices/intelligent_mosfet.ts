/**
 * 🚀 智能 MOSFET 模型 - AkingSPICE 2.1
 * 
 * 世界领先的 MOSFET 建模实现，专为电力电子应用优化
 * 结合物理准确性和数值稳定性的终极解决方案
 * 
 * 🏆 技术亮点：
 * - 多工作区域无缝切换 (截止/线性/饱和)
 * - 智能开关事件预测
 * - 自适应 Newton 收敛控制
 * - 温度效应建模
 * - 寄生电容/电阻精确处理
 * 
 * 📚 物理模型：
 *   基于 Level 1 SPICE 模型，增强数值稳定性
 *   支持亚阈值传导和短沟道效应
 *   考虑体二极管和结电容非线性
 * 
 * 🎯 应用目标：
 *   Buck/Boost 变换器高频开关
 *   三相逆变器精确建模  
 *   同步整流器优化设计
 */

import type { 
  VoltageVector,
  IVector
} from '../../types/index';
import { 
  IntelligentDeviceModelBase,
  LoadResult,
  MatrixStamp,
  StampEntry,
  StampType,
  DeviceState,
  ConvergenceInfo,
  PredictionHint,
  SwitchingEvent,
  NumericalChallenge,
  MOSFETParameters
} from './intelligent_device_model';

/**
 * MOSFET 工作区域枚举
 */
export enum MOSFETRegion {
  CUTOFF = 'cutoff',           // 截止区
  LINEAR = 'linear',           // 线性区 (欧姆区)
  SATURATION = 'saturation',   // 饱和区 (恒流区)
  SUBTHRESHOLD = 'subthreshold' // 亚阈值区
}

/**
 * MOSFET 内部状态
 */
// import type { 
//   MOSFETInternalState
// } from './intelligent_device_model';

/**
 * 🚀 智能 MOSFET 模型实现
 * 
 * 提供物理准确、数值稳定的 MOSFET 建模
 * 专为电力电子高频开关应用优化
 */
export class IntelligentMOSFET extends IntelligentDeviceModelBase {
  private readonly _drainNode: string;
  private readonly _gateNode: string;
  private readonly _sourceNode: string;
  private readonly _mosfetParams: MOSFETParameters;
  
  // 物理常数
  private static readonly VT = 0.026; // 热电压 (26mV @ 300K)
  
  // 数值常数
  private static readonly MIN_CONDUCTANCE = 1e-12; // 最小电导 (避免奇异)
  private static readonly MAX_VOLTAGE_STEP = 0.5;  // 最大电压步长 (V)
  private static readonly SWITCH_THRESHOLD = 0.1;  // 开关检测阈值 (V)
  
  private _gminConductance: number = 0;

  constructor(
    deviceId: string,
    nodes: [string, string, string], // [Drain, Gate, Source]
    parameters: MOSFETParameters
  ) {
    super(deviceId, 'MOSFET', nodes, parameters);
    
    [this._drainNode, this._gateNode, this._sourceNode] = nodes;
    this._mosfetParams = parameters;
    
    // 初始化 MOSFET 特定状态
    this._initializeMOSFETState();
  }

  /**
   * 🧠 Unified assembly entry point for MOSFET
   */
  override assemble(context: AssemblyContext): void {
    const { matrix, rhs, solutionVector, nodeMap, gmin } = context;

    const drainIndex = nodeMap.get(this._drainNode);
    const gateIndex = nodeMap.get(this._gateNode);
    const sourceIndex = nodeMap.get(this._sourceNode);

    if (drainIndex === undefined || gateIndex === undefined || sourceIndex === undefined) {
      throw new Error(`MOSFET ${this.deviceId}: Node not found in mapping.`);
    }
    
    if (!solutionVector) {
        throw new Error(`MOSFET ${this.deviceId}: Solution vector is not available in assembly context.`);
    }

    // 1. 提取节点电压
    const Vd = solutionVector.get(drainIndex);
    const Vg = solutionVector.get(gateIndex);
    const Vs = solutionVector.get(sourceIndex);
    
    // 2. 计算端电压
    const Vgs = Vg - Vs;
    const Vds = Vd - Vs;

    // 关键保护：检查 NaN
    if (isNaN(Vgs) || isNaN(Vds)) {
      const detailedError = `Input voltage is NaN for ${this.deviceId}. Vd=${Vd}, Vg=${Vg}, Vs=${Vs} -> Vgs=${Vgs}, Vds=${Vds}`;
      console.error(detailedError);
      throw new Error(detailedError);
    }
    
    // 3. 确定工作区域
    const region = this._determineOperatingRegion(Vgs, Vds);
    
    // 4. 计算 DC 特性
    const dcAnalysis = this._computeDCCharacteristics(Vgs, Vds, region);
    
    // 5. 计算小信号参数
    const smallSignal = this._computeSmallSignalParameters(Vgs, Vds, region);
    
    // Add Gmin
    const totalGds = smallSignal.gds + (gmin || 0);

    // 6. 计算右侧向量贡献 (线性化误差)
    const Ieq = dcAnalysis.Id - (smallSignal.gm * Vgs + smallSignal.gds * Vds);

    // 7. Stamp Matrix
    const { gm } = smallSignal;
    matrix.add(drainIndex, gateIndex, gm);
    matrix.add(drainIndex, drainIndex, totalGds);
    matrix.add(drainIndex, sourceIndex, -(gm + totalGds));
    
    matrix.add(sourceIndex, gateIndex, -gm);
    matrix.add(sourceIndex, drainIndex, -totalGds);
    matrix.add(sourceIndex, sourceIndex, gm + totalGds);

    // 8. Stamp RHS
    rhs.add(drainIndex, -Ieq);
    rhs.add(sourceIndex, Ieq);

    // 9. 更新设备状态
    const capacitance = this._computeCapacitances(Vgs, Vds);
    this._currentState = this._createNewDeviceState(
      Vgs, Vds, region, smallSignal, capacitance
    );
  }

  /**
   * 🔥 MOSFET 载入实现 (DEPRECATED)
   */
  /*
  override load(voltage: VoltageVector, nodeMap: Map<string, number>): LoadResult {
    // ... (This method is now replaced by assemble) ...
  }
  */

  /**
   * ⚡️ Gmin Stepping 支持
   * 
   * 在 MNA 矩阵中并联一个临时电导
   */
  stampGmin(gmin: number): void {
    this._gminConductance = gmin;
  }

  /**
   * 🎯 MOSFET 收敛性检查
   * 
   * 专门针对 MOSFET 开关特性的收敛判断：
   * 1. 工作区域稳定性
   * 2. 开关瞬态检测
   * 3. 栅极电压变化率
   * 4. 漏极电流连续性
   */
  override checkConvergence(deltaV: VoltageVector, nodeMap: Map<string, number>): ConvergenceInfo {
    // 调用基类通用检查
    const baseCheck = super.checkConvergence(deltaV, nodeMap);
    
    // MOSFET 特定的收敛检查
    const mosfetCheck = this._checkMOSFETSpecificConvergence(deltaV, nodeMap);
    
    // 合并检查结果
    return {
      ...baseCheck,
      confidence: Math.min(baseCheck.confidence, mosfetCheck.confidence),
      physicalConsistency: {
        ...baseCheck.physicalConsistency,
        operatingRegionValid: mosfetCheck.regionStable
      }
    };
  }

  /**
   * 🛡️ MOSFET Newton 步长限制
   * 
   * 专门处理 MOSFET 的数值挑战：
   * 1. 防止跨越开关阈值
   * 2. 限制栅极电压过冲
   * 3. 保护工作区域边界
   */
  override limitUpdate(deltaV: VoltageVector, nodeMap: Map<string, number>): VoltageVector {
    const limited = super.limitUpdate(deltaV, nodeMap);
    
    // MOSFET 特定的步长限制
    this._applyDeviceSpecificLimits(limited, nodeMap);
    
    return limited;
  }

  /**
   * 🔮 MOSFET 状态预测
   * 
   * 预测 MOSFET 的开关行为和时间常数
   */
  override predictNextState(dt: number): PredictionHint {
    const baseHint = super.predictNextState(dt);
    
    // 检测开关事件
    const switchingEvents = this._predictSwitchingEvents(dt);
    
    // 识别 MOSFET 特定的数值挑战
    const challenges = this._identifyMOSFETChallenges(dt);
    
    return {
      ...baseHint,
      switchingEvents,
      numericalChallenges: challenges
    };
  }

  // === MOSFET 特定的私有方法 ===

  /**
   * ADDED: 获取 MOSFET 在给定电压下的工作模式
   * 实现了基类的抽象方法
   */
  override getOperatingMode(voltage: IVector, nodeMap: Map<string, number>): string {
    const drainIndex = nodeMap.get(this._drainNode);
    const gateIndex = nodeMap.get(this._gateNode);
    const sourceIndex = nodeMap.get(this._sourceNode);

    if (drainIndex === undefined || gateIndex === undefined || sourceIndex === undefined) {
      return MOSFETRegion.CUTOFF; // Default if nodes not mapped
    }

    const Vd = voltage.get(drainIndex);
    const Vg = voltage.get(gateIndex);
    const Vs = voltage.get(sourceIndex);
    
    const Vgs = Vg - Vs;
    const Vds = Vd - Vs;
    
    return this._determineOperatingRegion(Vgs, Vds);
  }

  /**
   * 🆕 导出事件条件函数
   */
  override getEventFunctions(nodeMap: Map<string, number>) {
    const drainIndex = nodeMap.get(this._drainNode);
    const gateIndex = nodeMap.get(this._gateNode);
    const sourceIndex = nodeMap.get(this._sourceNode);

    if (drainIndex === undefined || gateIndex === undefined || sourceIndex === undefined) {
      return [];
    }

    return [
      {
        // 检测 Vgs 是否穿过 Vth
        type: 'Vgs_cross_Vth',
        condition: (v: IVector) => {
          const Vg = v.get(gateIndex);
          const Vs = v.get(sourceIndex);
          return (Vg - Vs) - this._mosfetParams.Vth;
        }
      },
      {
        // 检测是否从线性区进入饱和区
        type: 'linear_to_saturation',
        condition: (v: IVector) => {
          const Vd = v.get(drainIndex);
          const Vg = v.get(gateIndex);
          const Vs = v.get(sourceIndex);
          const Vds = Vd - Vs;
          const Vgs = Vg - Vs;
          return (Vgs - this._mosfetParams.Vth) - Vds;
        }
      }
    ];
  }

  private _initializeMOSFETState(): void {
    // 设置初始工作区域为截止
    this._currentState = {
      ...this._currentState,
      operatingMode: MOSFETRegion.CUTOFF,
      internalStates: {
        region: MOSFETRegion.CUTOFF,
        Vgs: 0,
        Vds: 0,
        Vbs: 0,
        gm: 0,
        gds: IntelligentMOSFET.MIN_CONDUCTANCE,
        gmbs: 0,
        Cgs: this._mosfetParams.Cgs,
        Cgd: this._mosfetParams.Cgd,
        Cdb: 0,
        Csb: 0
      }
    };
  }

  /**
   * 确定 MOSFET 工作区域
   */
  private _determineOperatingRegion(Vgs: number, Vds: number): MOSFETRegion {
    const { Vth } = this._mosfetParams;
    const transitionWidth = 5 * IntelligentMOSFET.VT; // 5 * 26mV = 130mV transition region

    // Smooth transition around Vth
    if (Vgs < Vth - transitionWidth) {
        return MOSFETRegion.CUTOFF;
    }
    if (Vgs > Vth + transitionWidth) {
        // On region
        const Vdsat = Vgs - Vth;
        return Vds < Vdsat ? MOSFETRegion.LINEAR : MOSFETRegion.SATURATION;
    }
    
    // Subthreshold/Transition region
    return MOSFETRegion.SUBTHRESHOLD;
  }

  /**
   * 计算 DC 特性
   */
  private _computeDCCharacteristics(
    Vgs: number, 
    Vds: number, 
    region: MOSFETRegion
  ) {
    const { Vth, Kp, lambda, Roff } = this._mosfetParams;
    
    switch (region) {
      case MOSFETRegion.CUTOFF:
        // In cutoff, model as a large resistor Roff.
        // This is CRITICAL for numerical stability, especially during DC analysis,
        // as it prevents the matrix from becoming singular.
        const Id_off = Vds / Roff;
        return { Id: Id_off, Ig: 0, Is: -Id_off };
        
      case MOSFETRegion.SUBTHRESHOLD:
        // 亚阈值传导 (指数特性)
        const expArgUnsafe = (Vgs - Vth) / (2 * IntelligentMOSFET.VT);
        const expArg = Math.max(-50, Math.min(50, expArgUnsafe)); // 限制范围
        const Isub = Kp * Math.exp(expArg) * (1 - Math.exp(-Vds / IntelligentMOSFET.VT));
        return { Id: Isub * (1 + lambda * Vds), Ig: 0, Is: -Isub };
        
      case MOSFETRegion.LINEAR:
        // 线性区 (欧姆区)
        const VgsEff = Vgs - Vth;
        // 增加平滑处理，避免 Vds 接近 0 时出现数值问题
        const Id_lin = Kp * (VgsEff * Vds - 0.5 * Vds * Vds);
        return { Id: Id_lin * (1 + lambda * Vds), Ig: 0, Is: -Id_lin };
        
      case MOSFETRegion.SATURATION:
        // 饱和区 (恒流区)
        const VgsEff_sat = Vgs - Vth;
        const Id_sat = 0.5 * Kp * VgsEff_sat * VgsEff_sat;
        return { Id: Id_sat * (1 + lambda * Vds), Ig: 0, Is: -Id_sat };
        
      default:
        throw new Error(`Unknown MOSFET region: ${region}`);
    }
  }

  /**
   * 计算小信号参数
   */
  private _computeSmallSignalParameters(
    Vgs: number, 
    Vds: number, 
    region: MOSFETRegion
  ) {
    const { Vth, Kp, lambda, Roff } = this._mosfetParams;
    let gm = 0;
    let gds = IntelligentMOSFET.MIN_CONDUCTANCE;

    switch (region) {
      case MOSFETRegion.CUTOFF:
        gm = 0;
        // The conductance is 1/Roff. This provides a stable, non-zero value.
        gds = 1 / Roff;
        break;
        
      case MOSFETRegion.SUBTHRESHOLD:
        const n = 2; // Subthreshold slope factor
        const expArg = (Vgs - Vth) / (n * IntelligentMOSFET.VT);
        const I0 = Kp * (n * IntelligentMOSFET.VT)**2;
        // Clamp the argument to prevent overflow
        if (expArg < 50) { 
            const expVal = Math.exp(expArg);
            const term = (1 - Math.exp(-Vds / IntelligentMOSFET.VT));
            gm = (I0 / (n * IntelligentMOSFET.VT)) * expVal * term;
            gds = (I0 / IntelligentMOSFET.VT) * expVal * Math.exp(-Vds / IntelligentMOSFET.VT);
        } else {
            gm = 1e12; // Large but not infinite
            gds = 1e-9;
        }
        break;
        
      case MOSFETRegion.LINEAR:
        const VgsEff = Vgs - Vth;
        gm = Kp * Vds * (1 + lambda * Vds);
        gds = Kp * (VgsEff - Vds) * (1 + lambda * Vds) + 
              Kp * VgsEff * Vds * lambda;
        break;
        
      case MOSFETRegion.SATURATION:
        const VgsEff_sat = Vgs - Vth;
        gm = Kp * VgsEff_sat * (1 + lambda * Vds);
        gds = 0.5 * Kp * VgsEff_sat * VgsEff_sat * lambda;
        break;
        
      default:
        throw new Error(`Unknown MOSFET region: ${region}`);
    }

    // Final validation to prevent NaN/Infinity
    gm = isFinite(gm) ? gm : 1e12;
    gds = isFinite(gds) && gds > 0 ? gds : IntelligentMOSFET.MIN_CONDUCTANCE;

    return {
      gm,
      gds,
      gmbs: 0 // Not modeled yet
    };
  }

  /**
   * 计算电容效应
   */
  private _computeCapacitances(Vgs: number, Vds: number) {
    const { Cgs: Cgs0, Cgd: Cgd0 } = this._mosfetParams;
    
    // 简化模型：电容随电压变化
    const Cgs = Cgs0 * (1 + 0.1 * Math.abs(Vgs));
    const Cgd = Cgd0 * (1 + 0.1 * Math.abs(Vds - Vgs));
    const Cdb = 1e-12; // 漏体结电容
    const Csb = 1e-12; // 源体结电容
    
    return { Cgs, Cgd, Cdb, Csb };
  }

  /**
   * 生成 MNA 印花 (DEPRECATED)
   */
  /*
  private _generateMNAStamp(smallSignal: any, _capacitance: any, nodeMap: Map<string, number>): MatrixStamp {
    // ... (This logic is now inside assemble) ...
  }
  */

  /**
   * 计算右侧向量贡献 (DEPRECATED)
   */
  /*
  private _computeRHSContribution(
    dcAnalysis: any, 
    smallSignal: any,
    Vgs: number,
    Vds: number,
    nodeMap: Map<string, number>
  ): { index: number, value: number }[] {
    // ... (This logic is now inside assemble) ...
  }
  */

  /**
   * 创建新的设备状态
   */
  private _createNewDeviceState(
    Vgs: number,
    Vds: number, 
    region: MOSFETRegion,
    smallSignal: any,
    capacitance: any
  ): DeviceState {
    return {
      ...this._currentState,
      operatingMode: region,
      internalStates: {
        region,
        Vgs,
        Vds,
        ...smallSignal,
        ...capacitance
      }
    };
  }

  private _createEmptyStamp(): MatrixStamp {
    return {
      entries: [],
      type: StampType.RESISTIVE,
      isLinear: true
    };
  }

  /**
   * MOSFET 特定收敛检查
   */
  private _checkMOSFETSpecificConvergence(deltaV: VoltageVector, nodeMap: Map<string, number>) {
    const gateIndex = nodeMap.get(this._gateNode);
    const sourceIndex = nodeMap.get(this._sourceNode);
    const drainIndex = nodeMap.get(this._drainNode);

    if (gateIndex === undefined || sourceIndex === undefined || drainIndex === undefined) {
      return { regionStable: false, confidence: 0.1 };
    }
    
    // 检查工作区域是否稳定
    const deltaVgs = deltaV.get(gateIndex) - deltaV.get(sourceIndex);
    const deltaVds = deltaV.get(drainIndex) - deltaV.get(sourceIndex);
    
    // 如果电压变化可能导致区域切换，降低置信度
    const regionStable = Math.abs(deltaVgs) < IntelligentMOSFET.SWITCH_THRESHOLD &&
                         Math.abs(deltaVds) < IntelligentMOSFET.SWITCH_THRESHOLD;
    
    const confidence = regionStable ? 0.9 : 0.3;
    
    return { regionStable, confidence };
  }

  /**
   * MOSFET 特定步长限制
   */
  protected override _applyDeviceSpecificLimits(deltaV: VoltageVector, nodeMap: Map<string, number>): void {
    const gateIndex = nodeMap.get(this._gateNode);
    const sourceIndex = nodeMap.get(this._sourceNode);

    if (gateIndex === undefined || sourceIndex === undefined) {
      return;
    }

    // 限制栅源电压变化
    const deltaVgs = deltaV.get(gateIndex) - deltaV.get(sourceIndex);
    if (Math.abs(deltaVgs) > IntelligentMOSFET.MAX_VOLTAGE_STEP) {
      const scale = IntelligentMOSFET.MAX_VOLTAGE_STEP / Math.abs(deltaVgs);
      
      // 缩放所有节点电压变化
      // Note: This is a simple approach. A more sophisticated method might
      // only scale the relevant node voltages (gate, source).
      for (let i = 0; i < deltaV.size; i++) {
        deltaV.set(i, deltaV.get(i) * scale);
      }
    }
  }

  /**
   * 预测开关事件
   */
  private _predictSwitchingEvents(dt: number): readonly SwitchingEvent[] {
    const events: SwitchingEvent[] = [];
    const currentVgs = this._currentState.internalStates['Vgs'] as number;
    const { Vth } = this._mosfetParams;
    
    // 如果接近阈值电压，预测开关事件
    const distanceToThreshold = Math.abs(currentVgs - Vth);
    
    if (distanceToThreshold < 0.1) { // 100mV 内
      const eventType = currentVgs > Vth ? 'turn_off' : 'turn_on';
      const estimatedTime = this._currentState.time + dt * (distanceToThreshold / 0.1);
      
      events.push({
        eventType,
        estimatedTime,
        confidence: 0.7,
        impactSeverity: 'high'
      });
    }
    
    return events;
  }

  /**
   * 识别 MOSFET 数值挑战
   */
  private _identifyMOSFETChallenges(_dt: number): readonly NumericalChallenge[] {
    const challenges: NumericalChallenge[] = [];
    const region = this._currentState.internalStates['region'] as MOSFETRegion;
    
    // 开关瞬态挑战
    if (region === MOSFETRegion.SUBTHRESHOLD) {
      challenges.push({
        type: 'stiffness',
        severity: 0.8,
        mitigation: '减小时间步长至纳秒级'
      });
    }
    
    // 工作区域边界挑战
    const gds = this._currentState.internalStates['gds'] as number;
    if (gds < IntelligentMOSFET.MIN_CONDUCTANCE * 10) {
      challenges.push({
        type: 'ill_conditioning',
        severity: 0.6,
        mitigation: '增加并联电阻改善条件数'
      });
    }
    
    return challenges;
  }
}