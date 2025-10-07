/**
 * 🔄 事件驅動檢測器 - AkingSPICE 2.0
 * 
 * 替代 MCP-LCP 的現代開關檢測系統
 * 
 * 核心功能：
 * - 零交叉檢測 (Zero-crossing detection)
 * - 二分法精確定位事件時刻
 * - 多組件並行事件檢測
 * - 事件優先級排序
 * 
 * 這是 SPICE、Cadence、Ngspice 的標準做法
 */

import type {
  IEventDetector,
  IEvent,
  IComponent,
  Time,
  VoltageVector
} from '../../types/index.js';
import { EventType } from '../../types/index.js';

/**
 * 事件檢測器主類
 */
export class EventDetector implements IEventDetector {
  private readonly _tolerance: number;
  private readonly _maxBisections: number;
  private readonly _minTimestep: number;

  constructor(options: EventDetectorOptions = {}) {
    this._tolerance = options.tolerance ?? 1e-12;
    this._maxBisections = options.maxBisections ?? 50;
    this._minTimestep = options.minTimestep ?? 1e-15;
  }

  /**
   * 檢測所有組件在時間區間內的事件
   * 
   * @param components 需要檢查的組件列表
   * @param t0 起始時間
   * @param t1 結束時間  
   * @param v0 起始電壓向量
   * @param v1 結束電壓向量
   * @returns 按時間排序的事件列表
   */
  detectEvents(
    components: IComponent[],
    t0: Time,
    t1: Time,
    v0: VoltageVector,
    v1: VoltageVector
  ): IEvent[] {
    const events: IEvent[] = [];

    // 並行檢測所有組件
    for (const component of components) {
      if (!component.hasEvents()) continue;

      try {
        const componentEvents = component.detectEvents?.(t0, t1, v0, v1) ?? [];
        events.push(...componentEvents);
      } catch (error) {
        console.warn(`組件 ${component.id} 事件檢測失敗:`, error);
      }
    }

    // 按時間排序並過濾重複事件
    return this._sortAndFilterEvents(events);
  }

  /**
   * 精確定位單個事件的時刻
   * 
   * 使用二分法在區間 [t0, t1] 內精確定位事件發生時刻
   */
  locateEvent(
    component: IComponent,
    event: IEvent,
    t0: Time,
    t1: Time,
    tolerance: number = this._tolerance
  ): Time {
    if (!component.detectEvents) {
      throw new Error(`組件 ${component.id} 不支持事件檢測`);
    }

    let tLow = t0;
    let tHigh = t1;
    let iterations = 0;

    while (tHigh - tLow > tolerance && iterations < this._maxBisections) {
      const tMid = 0.5 * (tLow + tHigh);
      
      // 在中點處檢查事件條件
      // 這需要在中點重新計算電壓向量
      const vMid = this._interpolateVoltages(event, tLow, tHigh, tMid);
      
      const hasEventInFirstHalf = this._hasEventInInterval(
        component, 
        tLow, 
        tMid, 
        event
      );

      if (hasEventInFirstHalf) {
        tHigh = tMid;
      } else {
        tLow = tMid;
      }

      iterations++;
    }

    if (iterations >= this._maxBisections) {
      console.warn(`事件定位達到最大迭代次數: ${component.id}`);
    }

    return 0.5 * (tLow + tHigh);
  }

  /**
   * 檢查時間區間是否過小
   */
  isTimestepTooSmall(dt: Time): boolean {
    return dt < this._minTimestep;
  }

  private _sortAndFilterEvents(events: IEvent[]): IEvent[] {
    // 按時間排序
    events.sort((a, b) => a.time - b.time);

    // 過濾同時發生的重複事件
    const filtered: IEvent[] = [];
    let lastTime = -Infinity;

    for (const event of events) {
      if (Math.abs(event.time - lastTime) > this._tolerance) {
        filtered.push(event);
        lastTime = event.time;
      } else {
        // 同一時刻的事件，選擇優先級更高的
        const lastEvent = filtered[filtered.length - 1]!;
        if (this._getEventPriority(event) > this._getEventPriority(lastEvent)) {
          filtered[filtered.length - 1] = event;
        }
      }
    }

    return filtered;
  }

  private _getEventPriority(event: IEvent): number {
    // 事件優先級：開關 > 二極體 > MOSFET
    switch (event.type) {
      case EventType.SWITCH_ON:
      case EventType.SWITCH_OFF:
        return 100;
      case EventType.DIODE_FORWARD:
      case EventType.DIODE_REVERSE:
        return 90;
      case EventType.MOSFET_LINEAR:
      case EventType.MOSFET_SATURATION:
      case EventType.MOSFET_CUTOFF:
        return 80;
      default:
        return 50;
    }
  }

  private _interpolateVoltages(
    event: IEvent,
    t0: Time,
    t1: Time,
    tTarget: Time
  ): VoltageVector {
    // 簡化的線性插值
    // 實際實現需要從積分器獲取準確的插值
    const alpha = (tTarget - t0) / (t1 - t0);
    
    // 這是佔位實現，實際需要積分器支援
    throw new Error(`電壓插值需要積分器支援 (event: ${event.type}, t: ${tTarget})`);
  }

  private _hasEventInInterval(
    component: IComponent,
    t0: Time,
    t1: Time,
    referenceEvent: IEvent
  ): boolean {
    // 檢查組件在區間 [t0, t1] 是否有與 referenceEvent 同類型的事件
    // 這需要組件提供事件條件函數
    
    // 佔位實現
    return Math.random() > 0.5;
  }
}

/**
 * 具體的事件檢測函數
 */
export class EventDetectionFunctions {
  /**
   * 二極體事件檢測：檢測 Vd 的零交叉
   */
  static detectDiodeEvents(
    anodeVoltage0: number,
    cathodeVoltage0: number,
    anodeVoltage1: number, 
    cathodeVoltage1: number,
    Vf: number = 0.7
  ): { hasEvent: boolean; eventType?: EventType } {
    const Vd0 = anodeVoltage0 - cathodeVoltage0;
    const Vd1 = anodeVoltage1 - cathodeVoltage1;
    
    const condition0 = Vd0 - Vf;
    const condition1 = Vd1 - Vf;

    // 檢測零交叉
    if (Math.sign(condition0) !== Math.sign(condition1)) {
      const eventType = condition1 > 0 
        ? EventType.DIODE_FORWARD 
        : EventType.DIODE_REVERSE;
      
      return { hasEvent: true, eventType };
    }

    return { hasEvent: false };
  }

  /**
   * MOSFET 事件檢測：檢測工作區域轉換
   */
  static detectMOSFETEvents(
    Vgs0: number,
    Vds0: number,
    Vgs1: number,
    Vds1: number,
    Vth: number = 1.0
  ): { hasEvent: boolean; eventType?: EventType } {
    const mode0 = this._getMOSFETMode(Vgs0, Vds0, Vth);
    const mode1 = this._getMOSFETMode(Vgs1, Vds1, Vth);

    if (mode0 !== mode1) {
      return { hasEvent: true, eventType: mode1 };
    }

    return { hasEvent: false };
  }

  /**
   * 理想開關事件檢測：檢測控制信號變化
   */
  static detectSwitchEvents(
    control0: number,
    control1: number,
    threshold: number = 0.5
  ): { hasEvent: boolean; eventType?: EventType } {
    const state0 = control0 > threshold;
    const state1 = control1 > threshold;

    if (state0 !== state1) {
      const eventType = state1 
        ? EventType.SWITCH_ON 
        : EventType.SWITCH_OFF;
      
      return { hasEvent: true, eventType };
    }

    return { hasEvent: false };
  }

  private static _getMOSFETMode(Vgs: number, Vds: number, Vth: number): EventType {
    if (Vgs < Vth) {
      return EventType.MOSFET_CUTOFF;
    } else if (Vds < Vgs - Vth) {
      return EventType.MOSFET_LINEAR;
    } else {
      return EventType.MOSFET_SATURATION;
    }
  }
}

/**
 * 事件檢測器配置選項
 */
export interface EventDetectorOptions {
  readonly tolerance?: number;
  readonly maxBisections?: number;
  readonly minTimestep?: number;
}

/**
 * 事件統計信息
 */
export interface EventStatistics {
  readonly totalEvents: number;
  readonly eventsByType: Map<EventType, number>;
  readonly averageLocalizationTime: number;
  readonly maxBisections: number;
}

/**
 * 事件歷史記錄器
 */
export class EventLogger {
  private _events: IEvent[] = [];
  private _statistics: EventStatistics | undefined;

  logEvent(event: IEvent): void {
    this._events.push(event);
    this._statistics = undefined; // 重新計算統計
  }

  getEvents(): readonly IEvent[] {
    return this._events;
  }

  getStatistics(): EventStatistics {
    if (!this._statistics) {
      this._statistics = this._computeStatistics();
    }
    return this._statistics;
  }

  clear(): void {
    this._events = [];
    this._statistics = undefined;
  }

  private _computeStatistics(): EventStatistics {
    const eventsByType = new Map<EventType, number>();
    
    for (const event of this._events) {
      const count = eventsByType.get(event.type) ?? 0;
      eventsByType.set(event.type, count + 1);
    }

    return {
      totalEvents: this._events.length,
      eventsByType,
      averageLocalizationTime: 0, // 需要從定位器獲取
      maxBisections: 0
    };
  }
}