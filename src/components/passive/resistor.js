"use strict";
/**
 * 🔌 标准电阻组件 - AkingSPICE 2.1
 *
 * 线性电阻元件的精确实现
 * 遵循标准 SPICE 模型和 MNA 矩阵装配规则
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResistorTest = exports.ResistorFactory = exports.Resistor = void 0;
/**
 * 🔧 线性电阻组件
 *
 * 实现欧姆定律: V = I * R
 *
 * MNA 装配规则:
 * - 电导 G = 1/R
 * - 节点 i: G[i,i] += G, G[i,j] -= G
 * - 节点 j: G[j,j] += G, G[j,i] -= G
 *
 * 其中 i, j 为电阻连接的两个节点
 */
class Resistor {
    constructor(name, nodes, _resistance) {
        this.name = name;
        this.nodes = nodes;
        this._resistance = _resistance;
        this.type = 'R';
        if (_resistance <= 0) {
            throw new Error(`电阻值必须为正数: ${_resistance}`);
        }
        if (nodes.length !== 2) {
            throw new Error(`电阻必须连接两个节点，实际: ${nodes.length}`);
        }
        if (nodes[0] === nodes[1]) {
            throw new Error(`电阻不能连接到同一节点: ${nodes[0]}`);
        }
    }
    /**
     * 🎯 获取电阻值
     */
    get resistance() {
        return this._resistance;
    }
    /**
     * 🎯 获取电导值
     */
    get conductance() {
        return 1.0 / this._resistance;
    }
    /**
     * 🔥 MNA 矩阵装配
     *
     * 根据电阻的导纳矩阵形式装配系统矩阵：
     *
     * [G  -G] [V1]   [0]
     * [-G  G] [V2] = [0]
     *
     * 其中 G = 1/R 为电导
     */
    stamp(matrix, _rhs, nodeMap, _currentTime) {
        const n1 = nodeMap.get(this.nodes[0]);
        const n2 = nodeMap.get(this.nodes[1]);
        const g = this.conductance;
        // 处理节点1 (如果不是接地节点)
        if (n1 !== undefined && n1 >= 0) {
            matrix.add(n1, n1, g);
            // 处理节点1到节点2的耦合
            if (n2 !== undefined && n2 >= 0) {
                matrix.add(n1, n2, -g);
            }
        }
        // 处理节点2 (如果不是接地节点)
        if (n2 !== undefined && n2 >= 0) {
            matrix.add(n2, n2, g);
            // 处理节点2到节点1的耦合
            if (n1 !== undefined && n1 >= 0) {
                matrix.add(n2, n1, -g);
            }
        }
        // 电阻是无源元件，不向右侧向量贡献激励
        // rhs 保持不变
    }
    /**
     * 🔍 组件验证
     */
    validate() {
        const errors = [];
        const warnings = [];
        // 检查电阻值
        if (this._resistance <= 0) {
            errors.push(`电阻值必须为正数: ${this._resistance}`);
        }
        // 检查是否为极小电阻（可能导致数值问题）
        if (this._resistance < 1e-12) {
            warnings.push(`电阻值过小可能导致数值不稳定: ${this._resistance}Ω`);
        }
        // 检查是否为极大电阻（可能导致矩阵病态）
        if (this._resistance > 1e12) {
            warnings.push(`电阻值过大可能导致矩阵病态: ${this._resistance}Ω`);
        }
        // 检查节点数
        if (this.nodes.length !== 2) {
            errors.push(`电阻必须连接两个节点，实际: ${this.nodes.length}`);
        }
        // 检查节点连接
        if (this.nodes.length === 2 && this.nodes[0] === this.nodes[1]) {
            errors.push(`电阻不能连接到同一节点: ${this.nodes[0]}`);
        }
        // 检查节点名称
        for (const node of this.nodes) {
            if (!node || node.trim() === '') {
                errors.push('节点名称不能为空');
                break;
            }
        }
        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }
    /**
     * 📊 获取组件信息
     */
    getInfo() {
        return {
            type: this.type,
            name: this.name,
            nodes: [...this.nodes],
            parameters: {
                resistance: this._resistance,
                conductance: this.conductance,
                power_rating: 'N/A', // 可在子类中扩展
                tolerance: 'N/A' // 可在子类中扩展
            },
            units: {
                resistance: 'Ω',
                conductance: 'S',
                power_rating: 'W',
                tolerance: '%'
            }
        };
    }
    /**
     * 📐 计算功耗
     *
     * P = I²R = V²/R
     *
     * @param voltage - 跨阻电压
     * @param current - 通过电阻的电流
     * @returns 瞬时功耗 (W)
     */
    calculatePower(voltage, current) {
        // 验证电压电流一致性（欧姆定律：V = I * R）
        const expectedCurrent = voltage / this._resistance;
        const currentTolerance = 1e-9;
        if (Math.abs(current - expectedCurrent) > currentTolerance) {
            console.warn(`电阻 ${this.name} 电压电流不一致: V=${voltage}V, I=${current}A, 期望I=${expectedCurrent}A`);
        }
        // 使用电压计算（更稳定）
        return (voltage * voltage) / this._resistance;
    }
    /**
     * 🌡️ 计算温度系数修正
     *
     * R(T) = R₀ * [1 + α(T - T₀)]
     *
     * @param temperature - 当前温度 (°C)
     * @param referenceTemp - 参考温度 (°C, 默认25°C)
     * @param tempCoeff - 温度系数 (ppm/°C, 默认0)
     * @returns 温度修正后的电阻值
     */
    getTemperatureAdjustedResistance(temperature, referenceTemp = 25, tempCoeff = 0) {
        const deltaT = temperature - referenceTemp;
        const alpha = tempCoeff * 1e-6; // ppm to fractional
        return this._resistance * (1 + alpha * deltaT);
    }
    /**
     * 📏 创建温度修正版本
     */
    createTemperatureAdjustedVersion(temperature, referenceTemp, tempCoeff) {
        const adjustedR = this.getTemperatureAdjustedResistance(temperature, referenceTemp, tempCoeff);
        return new Resistor(`${this.name}_T${temperature}C`, this.nodes, adjustedR);
    }
    /**
     * 🔍 调试信息
     */
    toString() {
        return `${this.name}: R=${this._resistance}Ω between ${this.nodes[0]} and ${this.nodes[1]}`;
    }
}
exports.Resistor = Resistor;
/**
 * 🏭 电阻工厂函数
 */
var ResistorFactory;
(function (ResistorFactory) {
    /**
     * 创建标准电阻
     */
    function create(name, nodes, resistance) {
        return new Resistor(name, nodes, resistance);
    }
    ResistorFactory.create = create;
    /**
     * 创建标准阻值系列电阻 (E12系列)
     */
    function createStandardValue(name, nodes, baseValue, multiplier = 1) {
        const standardValues = [1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2];
        // 找到最近的标准值
        const closest = standardValues.reduce((prev, curr) => Math.abs(curr - baseValue) < Math.abs(prev - baseValue) ? curr : prev);
        return new Resistor(name, nodes, closest * multiplier);
    }
    ResistorFactory.createStandardValue = createStandardValue;
    /**
     * 创建功率电阻
     */
    function createPowerResistor(name, nodes, resistance, _powerRating) {
        const resistor = new Resistor(name, nodes, resistance);
        // 可以在这里添加功率额定值属性
        return resistor;
    }
    ResistorFactory.createPowerResistor = createPowerResistor;
})(ResistorFactory || (exports.ResistorFactory = ResistorFactory = {}));
/**
 * 🧪 电阻测试工具
 */
var ResistorTest;
(function (ResistorTest) {
    /**
     * 验证欧姆定律
     */
    function verifyOhmsLaw(resistance, voltage) {
        const current = voltage / resistance;
        const power = voltage * current;
        return { current, power };
    }
    ResistorTest.verifyOhmsLaw = verifyOhmsLaw;
    /**
     * 验证MNA装配
     */
    function verifyMNAStamp(resistance) {
        const g = 1 / resistance;
        return {
            g11: g, // G[0,0] = G
            g12: -g, // G[0,1] = -G  
            g21: -g, // G[1,0] = -G
            g22: g // G[1,1] = G
        };
    }
    ResistorTest.verifyMNAStamp = verifyMNAStamp;
})(ResistorTest || (exports.ResistorTest = ResistorTest = {}));
