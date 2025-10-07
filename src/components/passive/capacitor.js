"use strict";
/**
 * 📏 标准电容组件 - AkingSPICE 2.1
 *
 * 线性电容元件的时域实现
 * 支持 Backward Euler 和 Trapezoidal 积分方法
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CapacitorTest = exports.CapacitorFactory = exports.Capacitor = void 0;
/**
 * 🔋 线性电容组件
 *
 * 电容的基本关系: I = C * dV/dt
 *
 * 时域离散化 (Backward Euler):
 * I(t) = C * (V(t) - V(t-Δt)) / Δt
 *
 * 等效电路 (伴随模型):
 * G_eq = C / Δt
 * I_eq = C * V(t-Δt) / Δt
 */
class Capacitor {
    constructor(name, nodes, _capacitance) {
        this.name = name;
        this.nodes = nodes;
        this._capacitance = _capacitance;
        this.type = 'C';
        // 历史状态 (用于时间积分)
        this._previousVoltage = 0;
        this._previousCurrent = 0;
        this._timeStep = 1e-6; // 默认时间步长
        if (_capacitance <= 0) {
            throw new Error(`电容值必须为正数: ${_capacitance}`);
        }
        if (!isFinite(_capacitance) || isNaN(_capacitance)) {
            throw new Error(`电容值必须为有限数值: ${_capacitance}`);
        }
        if (nodes.length !== 2) {
            throw new Error(`电容必须连接两个节点，实际: ${nodes.length}`);
        }
        if (nodes[0] === nodes[1]) {
            throw new Error(`电容不能连接到同一节点: ${nodes[0]}`);
        }
        // 初始化历史状态为零（电容初始条件）
        this._previousVoltage = 0.0;
        this._previousCurrent = 0.0;
    }
    /**
     * 🎯 获取电容值
     */
    get capacitance() {
        return this._capacitance;
    }
    /**
     * 📊 获取历史电压
     */
    get previousVoltage() {
        return this._previousVoltage;
    }
    /**
     * ⏱️ 设置时间步长
     */
    setTimeStep(dt) {
        if (dt <= 0) {
            throw new Error(`时间步长必须为正数: ${dt}`);
        }
        this._timeStep = dt;
    }
    /**
     * 📈 更新历史状态
     */
    updateHistory(voltage, current) {
        // 检查数值有效性
        if (!isFinite(voltage) || isNaN(voltage)) {
            console.warn(`电容 ${this.name} 的电压值无效: ${voltage}，使用前一值`);
            voltage = this._previousVoltage;
        }
        if (!isFinite(current) || isNaN(current)) {
            console.warn(`电容 ${this.name} 的电流值无效: ${current}，使用前一值`);
            current = this._previousCurrent;
        }
        this._previousVoltage = voltage;
        this._previousCurrent = current;
    }
    /**
     * 🔥 MNA 矩阵装配 (Backward Euler)
     *
     * 伴随模型:
     * G_eq = C / Δt  (等效电导)
     * I_eq = G_eq * V_prev  (等效电流源)
     *
     * 矩阵装配:
     * [G_eq  -G_eq] [V1]   [I_eq ]
     * [-G_eq  G_eq] [V2] = [-I_eq]
     */
    stamp(matrix, rhs, nodeMap, _currentTime) {
        const n1 = nodeMap.get(this.nodes[0]);
        const n2 = nodeMap.get(this.nodes[1]);
        // 等效电导 G_eq = C / Δt
        const geq = this._capacitance / this._timeStep;
        // 等效电流源 I_eq = G_eq * V_prev
        const ieq = geq * this._previousVoltage;
        // 装配电导矩阵 (类似电阻)
        if (n1 !== undefined && n1 >= 0) {
            matrix.add(n1, n1, geq);
            if (n2 !== undefined && n2 >= 0) {
                matrix.add(n1, n2, -geq);
            }
        }
        if (n2 !== undefined && n2 >= 0) {
            matrix.add(n2, n2, geq);
            if (n1 !== undefined && n1 >= 0) {
                matrix.add(n2, n1, -geq);
            }
        }
        // 装配等效电流源到右侧向量
        if (n1 !== undefined && n1 >= 0) {
            rhs.add(n1, ieq);
        }
        if (n2 !== undefined && n2 >= 0) {
            rhs.add(n2, -ieq);
        }
    }
    /**
     * 🔍 组件验证
     */
    validate() {
        const errors = [];
        const warnings = [];
        // 检查电容值
        if (this._capacitance <= 0) {
            errors.push(`电容值必须为正数: ${this._capacitance}`);
        }
        // 检查是否为极小电容
        if (this._capacitance < 1e-15) {
            warnings.push(`电容值过小可能被忽略: ${this._capacitance}F`);
        }
        // 检查是否为极大电容
        if (this._capacitance > 1e3) {
            warnings.push(`电容值过大可能导致数值问题: ${this._capacitance}F`);
        }
        // 检查节点连接
        if (this.nodes.length !== 2) {
            errors.push(`电容必须连接两个节点，实际: ${this.nodes.length}`);
        }
        if (this.nodes.length === 2 && this.nodes[0] === this.nodes[1]) {
            errors.push(`电容不能连接到同一节点: ${this.nodes[0]}`);
        }
        // 检查时间步长
        if (this._timeStep <= 0) {
            errors.push(`时间步长必须为正数: ${this._timeStep}`);
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
                capacitance: this._capacitance,
                timeStep: this._timeStep,
                previousVoltage: this._previousVoltage,
                previousCurrent: this._previousCurrent,
                equivalentConductance: this._capacitance / this._timeStep
            },
            units: {
                capacitance: 'F',
                timeStep: 's',
                previousVoltage: 'V',
                previousCurrent: 'A',
                equivalentConductance: 'S'
            }
        };
    }
    /**
     * ⚡ 计算瞬时电流
     *
     * I = C * dV/dt ≈ C * (V - V_prev) / Δt
     */
    calculateCurrent(currentVoltage) {
        return this._capacitance * (currentVoltage - this._previousVoltage) / this._timeStep;
    }
    /**
     * 🔋 计算储存能量
     *
     * E = 0.5 * C * V²
     */
    calculateEnergy(voltage) {
        return 0.5 * this._capacitance * voltage * voltage;
    }
    /**
     * 🔄 梯形积分方法装配 (可选的高精度方法)
     */
    stampTrapezoidal(matrix, rhs, nodeMap) {
        const n1 = nodeMap.get(this.nodes[0]);
        const n2 = nodeMap.get(this.nodes[1]);
        // 梯形公式: G_eq = 2C / Δt
        const geq = 2 * this._capacitance / this._timeStep;
        // 等效电流源包含历史项
        const ieq = geq * this._previousVoltage + this._previousCurrent;
        // 装配矩阵
        if (n1 !== undefined && n1 >= 0) {
            matrix.add(n1, n1, geq);
            if (n2 !== undefined && n2 >= 0) {
                matrix.add(n1, n2, -geq);
            }
        }
        if (n2 !== undefined && n2 >= 0) {
            matrix.add(n2, n2, geq);
            if (n1 !== undefined && n1 >= 0) {
                matrix.add(n2, n1, -geq);
            }
        }
        // 装配右侧向量
        if (n1 !== undefined && n1 >= 0) {
            rhs.add(n1, ieq);
        }
        if (n2 !== undefined && n2 >= 0) {
            rhs.add(n2, -ieq);
        }
    }
    /**
     * 🔍 调试信息
     */
    toString() {
        return `${this.name}: C=${this._capacitance}F between ${this.nodes[0]} and ${this.nodes[1]}`;
    }
}
exports.Capacitor = Capacitor;
/**
 * 🏭 电容工厂函数
 */
var CapacitorFactory;
(function (CapacitorFactory) {
    /**
     * 创建标准电容
     */
    function create(name, nodes, capacitance) {
        return new Capacitor(name, nodes, capacitance);
    }
    CapacitorFactory.create = create;
    /**
     * 创建标准系列电容 (E6系列)
     */
    function createStandardValue(name, nodes, baseValue, multiplier = 1) {
        const standardValues = [1.0, 1.5, 2.2, 3.3, 4.7, 6.8];
        const closest = standardValues.reduce((prev, curr) => Math.abs(curr - baseValue) < Math.abs(prev - baseValue) ? curr : prev);
        return new Capacitor(name, nodes, closest * multiplier);
    }
    CapacitorFactory.createStandardValue = createStandardValue;
    /**
     * 创建陶瓷电容 (常用于高频)
     */
    function createCeramic(name, nodes, capacitance) {
        return new Capacitor(name, nodes, capacitance);
    }
    CapacitorFactory.createCeramic = createCeramic;
    /**
     * 创建电解电容 (常用于电源滤波)
     */
    function createElectrolytic(name, nodes, capacitance) {
        const cap = new Capacitor(name, nodes, capacitance);
        // 电解电容通常有极性，这里可以扩展
        return cap;
    }
    CapacitorFactory.createElectrolytic = createElectrolytic;
})(CapacitorFactory || (exports.CapacitorFactory = CapacitorFactory = {}));
/**
 * 🧪 电容测试工具
 */
var CapacitorTest;
(function (CapacitorTest) {
    /**
     * 验证电容基本关系
     */
    function verifyCapacitanceRelation(capacitance, voltageChange, timeStep) {
        return capacitance * voltageChange / timeStep;
    }
    CapacitorTest.verifyCapacitanceRelation = verifyCapacitanceRelation;
    /**
     * 验证能量计算
     */
    function verifyEnergyCalculation(capacitance, voltage) {
        return 0.5 * capacitance * voltage * voltage;
    }
    CapacitorTest.verifyEnergyCalculation = verifyEnergyCalculation;
    /**
     * RC 时间常数计算
     */
    function calculateTimeConstant(resistance, capacitance) {
        return resistance * capacitance;
    }
    CapacitorTest.calculateTimeConstant = calculateTimeConstant;
})(CapacitorTest || (exports.CapacitorTest = CapacitorTest = {}));
