"use strict";
/**
 * 🔧 AkingSPICE 2.1 - 统一组件接口定义
 *
 * 本文件定义了所有电路组件必须遵循的标准接口
 * 确保组件与仿真引擎的解耦和可扩展性
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TypeGuards = void 0;
/**
 * 🎨 组件创建辅助函数
 *
 * 具体实现将在对应的组件文件中提供
 */
/**
 * 🔍 类型守卫函数
 */
var TypeGuards;
(function (TypeGuards) {
    function isSmartDevice(component) {
        return 'updateOperatingPoint' in component && 'checkConvergence' in component;
    }
    TypeGuards.isSmartDevice = isSmartDevice;
    function isSource(component) {
        return 'getValue' in component && 'setWaveform' in component;
    }
    TypeGuards.isSource = isSource;
    function isPassiveComponent(component) {
        return ['R', 'L', 'C'].includes(component.type);
    }
    TypeGuards.isPassiveComponent = isPassiveComponent;
    function isActiveComponent(component) {
        return ['M', 'Q', 'J', 'D'].includes(component.type);
    }
    TypeGuards.isActiveComponent = isActiveComponent;
})(TypeGuards || (exports.TypeGuards = TypeGuards = {}));
