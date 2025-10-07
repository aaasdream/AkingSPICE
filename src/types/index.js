"use strict";
/**
 * 🎯 AkingSPICE 核心類型定義
 *
 * 基於現代 MNA 架構的類型系統
 * 不包含任何 MCP/LCP 相關類型
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_CONFIG = exports.AnalysisType = exports.EventType = exports.ComponentType = void 0;
// 組件類型 (不再包含 MCP 標識)
var ComponentType;
(function (ComponentType) {
    // 被動元件
    ComponentType["RESISTOR"] = "R";
    ComponentType["CAPACITOR"] = "C";
    ComponentType["INDUCTOR"] = "L";
    // 源
    ComponentType["VOLTAGE_SOURCE"] = "V";
    ComponentType["CURRENT_SOURCE"] = "I";
    // 半導體 (事件驅動，非 MCP)
    ComponentType["DIODE"] = "D";
    ComponentType["MOSFET"] = "M";
    ComponentType["BJT"] = "Q";
    ComponentType["IGBT"] = "J";
    // 控制器
    ComponentType["PWM_CONTROLLER"] = "PWM";
    ComponentType["PID_CONTROLLER"] = "PID";
    // 電力電子模塊
    ComponentType["BUCK_CONVERTER"] = "BUCK";
    ComponentType["BOOST_CONVERTER"] = "BOOST";
})(ComponentType || (exports.ComponentType = ComponentType = {}));
var EventType;
(function (EventType) {
    EventType["SWITCH_ON"] = "switch_on";
    EventType["SWITCH_OFF"] = "switch_off";
    EventType["DIODE_FORWARD"] = "diode_forward";
    EventType["DIODE_REVERSE"] = "diode_reverse";
    EventType["MOSFET_LINEAR"] = "mosfet_linear";
    EventType["MOSFET_SATURATION"] = "mosfet_saturation";
    EventType["MOSFET_CUTOFF"] = "mosfet_cutoff";
})(EventType || (exports.EventType = EventType = {}));
// 分析類型
var AnalysisType;
(function (AnalysisType) {
    AnalysisType["DC"] = "dc";
    AnalysisType["TRANSIENT"] = "tran";
    AnalysisType["AC"] = "ac";
    AnalysisType["NOISE"] = "noise";
})(AnalysisType || (exports.AnalysisType = AnalysisType = {}));
// 默認配置
exports.DEFAULT_CONFIG = {
    tolerance: 1e-9,
    maxIterations: 50,
    minTimestep: 1e-15,
    maxTimestep: 1e-3,
    initialTimestep: 1e-9,
    eventTolerance: 1e-12,
    debug: false
};
