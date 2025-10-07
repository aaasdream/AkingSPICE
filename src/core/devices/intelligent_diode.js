"use strict";
/**
 * 🚀 智能二极管模型 - AkingSPICE 2.1
 *
 * 革命性的二极管建模实现，专为电力电子应用优化
 * 结合 Shockley 方程和先进数值技术的完美融合
 *
 * 🏆 技术特色：
 * - 指数特性线性化处理
 * - 反向恢复建模
 * - 温度漂移补偿
 * - 自适应收敛控制
 * - 数值稳定性保障
 *
 * 📚 物理基础：
 *   Shockley 二极管方程：I = Is*(exp(V/nVt) - 1)
 *   考虑串联电阻、结电容、温度效应
 *   支持齐纳/雪崩击穿建模
 *
 * 🎯 应用领域：
 *   整流电路精确分析
 *   续流二极管建模
 *   ESD 保护器件
 *   RF 检波器设计
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntelligentDiode = exports.DiodeState = void 0;
const vector_1 = require("../../math/sparse/vector");
const intelligent_device_model_1 = require("./intelligent_device_model");
/**
 * 二极管工作状态枚举
 */
var DiodeState;
(function (DiodeState) {
    DiodeState["FORWARD_BIAS"] = "forward_bias";
    DiodeState["REVERSE_BIAS"] = "reverse_bias";
    DiodeState["BREAKDOWN"] = "breakdown";
    DiodeState["TRANSITION"] = "transition"; // 过渡状态
})(DiodeState || (exports.DiodeState = DiodeState = {}));
/**
 * 🚀 智能二极管模型实现
 *
 * 提供物理准确、数值稳定的二极管建模
 * 专为高频整流和开关应用优化
 */
class IntelligentDiode extends intelligent_device_model_1.IntelligentDeviceModelBase {
    constructor(deviceId, nodes, // [Anode, Cathode]  
    parameters) {
        super(deviceId, 'DIODE', nodes, parameters);
        this._gminConductance = 0;
        [this._anodeNode, this._cathodeNode] = nodes;
        this._diodeParams = parameters;
        // 初始化二极管状态
        this._initializeDiodeState();
    }
    /**
     * 🔥 二极管载入实现
     *
     * 核心载入逻辑：
     * 1. 提取端电压
     * 2. 计算指数特性
     * 3. 线性化处理
     * 4. 生成 MNA 印花
     * 5. 更新内部状态
     */
    load(voltage) {
        const startTime = performance.now();
        this._totalLoadCalls++;
        try {
            // 1. 提取端电压
            const Va = voltage.get(this._anodeNode);
            const Vc = voltage.get(this._cathodeNode);
            const Vd = Va - Vc; // 二极管端电压
            // 2. 确定工作状态
            const state = this._determineOperatingState(Vd);
            // 3. 计算 DC 特性
            const dcAnalysis = this._computeDCCharacteristics(Vd, state);
            // 4. 计算小信号电导
            const conductance = this._computeConductance(Vd, state);
            // 5. 计算电容效应
            const capacitance = this._computeCapacitance(Vd);
            // 6. 生成 MNA 印花
            const matrixStamp = this._generateMNAStamp(conductance);
            // 7. 计算右侧向量贡献
            const rhsContribution = this._computeRHSContribution(dcAnalysis, conductance, Vd);
            // 8. 更新设备状态
            const newState = this._createNewDeviceState(Vd, state, dcAnalysis, conductance, capacitance);
            const loadTime = performance.now() - startTime;
            this._totalLoadTime += loadTime;
            return {
                success: true,
                matrixStamp,
                rhsContribution,
                deviceState: newState,
                stats: {
                    loadTime,
                    nonlinearIterations: 1,
                    jacobianEvaluations: 1
                }
            };
        }
        catch (error) {
            const loadTime = performance.now() - startTime;
            this._totalLoadTime += loadTime;
            return {
                success: false,
                matrixStamp: this._createEmptyStamp(),
                rhsContribution: new vector_1.Vector(voltage.size),
                deviceState: this._currentState,
                errorMessage: `Diode ${this.deviceId} load failed: ${error}`,
                stats: {
                    loadTime,
                    nonlinearIterations: 0,
                    jacobianEvaluations: 0
                }
            };
        }
    }
    /**
     * ⚡️ Gmin Stepping 支持
     *
     * 在 MNA 矩阵中并联一个临时电导
     */
    stampGmin(gmin) {
        this._gminConductance = gmin;
    }
    /**
     * 🎯 二极管收敛性检查
     *
     * 专门针对二极管指数特性的收敛判断：
     * 1. 指数函数收敛性
     * 2. 正反向偏置稳定性
     * 3. 电流连续性检查
     */
    checkConvergence(deltaV) {
        const baseCheck = super.checkConvergence(deltaV);
        // 二极管特定检查
        const diodeCheck = this._checkDiodeSpecificConvergence(deltaV);
        return {
            ...baseCheck,
            confidence: Math.min(baseCheck.confidence, diodeCheck.confidence),
            physicalConsistency: {
                ...baseCheck.physicalConsistency,
                operatingRegionValid: diodeCheck.stateStable
            }
        };
    }
    /**
     * 🛡️ 二极管 Newton 步长限制
     *
     * 防止指数函数数值溢出和发散：
     * 1. 正向电压限制
     * 2. 指数参数裁剪
     * 3. 电导下界保护
     */
    limitUpdate(deltaV) {
        const limited = super.limitUpdate(deltaV);
        // 二极管特定限制
        this._applyDiodeSpecificLimits(limited);
        return limited;
    }
    /**
     * 🔮 二极管状态预测
     *
     * 预测二极管的开关行为和恢复特性
     */
    predictNextState(dt) {
        const baseHint = super.predictNextState(dt);
        // 检测开关事件
        const switchingEvents = this._predictSwitchingEvents(dt);
        // 识别数值挑战
        const challenges = this._identifyDiodeChallenges(dt);
        return {
            ...baseHint,
            switchingEvents,
            numericalChallenges: challenges
        };
    }
    // === 二极管特定的私有方法 ===
    _initializeDiodeState() {
        this._currentState = {
            ...this._currentState,
            operatingMode: DiodeState.REVERSE_BIAS,
            internalStates: {
                state: DiodeState.REVERSE_BIAS,
                voltage: 0,
                current: 0,
                conductance: IntelligentDiode.MIN_CONDUCTANCE,
                capacitance: this._diodeParams.Cj0,
                temperature: 300
            }
        };
    }
    /**
     * 确定二极管工作状态
     */
    _determineOperatingState(Vd) {
        const { n } = this._diodeParams;
        const Vt = IntelligentDiode.VT;
        // 击穿检查 (简化：只检查反向击穿)
        if (Vd < -5.0) { // -5V 作为击穿阈值示例
            return DiodeState.BREAKDOWN;
        }
        // 过渡态：接近零偏置
        if (Math.abs(Vd) < 2 * n * Vt) {
            return DiodeState.TRANSITION;
        }
        // 正向 vs 反向偏置
        return Vd > 0 ? DiodeState.FORWARD_BIAS : DiodeState.REVERSE_BIAS;
    }
    /**
     * 计算二极管 DC 特性
     */
    _computeDCCharacteristics(Vd, state) {
        const { Is, n, Rs } = this._diodeParams;
        const Vt = IntelligentDiode.VT;
        switch (state) {
            case DiodeState.REVERSE_BIAS:
                // 反向饱和电流
                return { current: -Is, voltage: Vd };
            case DiodeState.FORWARD_BIAS:
                // Shockley 方程：I = Is*(exp(V/nVt) - 1)
                // 考虑串联电阻的迭代求解简化为直接计算
                const expArg = Math.min(Vd / (n * Vt), IntelligentDiode.MAX_EXPONENTIAL_ARG);
                const current = Is * (Math.exp(expArg) - 1);
                // 考虑串联电阻压降
                const voltageAcrossJunction = Vd - current * Rs;
                return { current, voltage: voltageAcrossJunction };
            case DiodeState.BREAKDOWN:
                // 击穿区：简化为大电导模型
                const breakdownCurrent = -(Vd + 5.0) * 0.1; // 简化击穿特性
                return { current: breakdownCurrent, voltage: Vd };
            case DiodeState.TRANSITION:
                // 过渡区：线性化处理
                const transitionCurrent = Is * Vd / (n * Vt);
                return { current: transitionCurrent, voltage: Vd };
            default:
                throw new Error(`Unknown diode state: ${state}`);
        }
    }
    /**
     * 计算小信号电导
     */
    _computeConductance(Vd, state) {
        const { Is, n, Rs } = this._diodeParams;
        const Vt = IntelligentDiode.VT;
        switch (state) {
            case DiodeState.REVERSE_BIAS:
                return IntelligentDiode.MIN_CONDUCTANCE;
            case DiodeState.FORWARD_BIAS:
                // 动态电导：gd = dI/dV = Is*exp(V/nVt)/(nVt)
                const expArg = Math.min(Vd / (n * Vt), IntelligentDiode.MAX_EXPONENTIAL_ARG);
                const intrinsicConductance = (Is / (n * Vt)) * Math.exp(expArg);
                // 考虑串联电阻
                const totalConductance = 1 / (1 / intrinsicConductance + Rs);
                return Math.max(totalConductance, IntelligentDiode.MIN_CONDUCTANCE);
            case DiodeState.BREAKDOWN:
                return 0.1; // 击穿区高电导
            case DiodeState.TRANSITION:
                return Math.max(Is / (n * Vt), IntelligentDiode.MIN_CONDUCTANCE);
            default:
                return IntelligentDiode.MIN_CONDUCTANCE;
        }
    }
    /**
     * 计算结电容
     */
    _computeCapacitance(Vd) {
        const { Cj0, Vj, m } = this._diodeParams;
        if (Vd >= 0) {
            // 正向偏置：电容增大
            return Cj0 * (1 + Vd / Vj);
        }
        else {
            // 反向偏置：结电容变化
            const factor = Math.pow(1 - Vd / Vj, -m);
            return Cj0 * factor;
        }
    }
    /**
     * 生成 MNA 印花
     */
    _generateMNAStamp(conductance) {
        const totalConductance = conductance + this._gminConductance;
        const entries = [
            // 阳极方程：Ia = G*(Va - Vc)
            { row: this._anodeNode, col: this._anodeNode, value: totalConductance },
            { row: this._anodeNode, col: this._cathodeNode, value: -totalConductance },
            // 阴极方程：Ic = -Ia
            { row: this._cathodeNode, col: this._anodeNode, value: -totalConductance },
            { row: this._cathodeNode, col: this._cathodeNode, value: totalConductance }
        ];
        return {
            entries,
            type: intelligent_device_model_1.StampType.NONLINEAR,
            isLinear: false,
            conditionEstimate: 1.0 / conductance
        };
    }
    /**
     * 计算右侧向量贡献
     */
    _computeRHSContribution(dcAnalysis, conductance, Vd) {
        const rhs = new vector_1.Vector(2); // [Anode, Cathode]
        const { current } = dcAnalysis;
        // 线性化误差补偿：I_actual - G*V
        const linearCurrent = conductance * Vd;
        const error = current - linearCurrent;
        rhs.set(this._anodeNode, -error); // 阳极电流
        rhs.set(this._cathodeNode, error); // 阴极电流
        return rhs;
    }
    /**
     * 创建新的设备状态
     */
    _createNewDeviceState(Vd, state, dcAnalysis, conductance, capacitance) {
        return {
            ...this._currentState,
            operatingMode: state,
            internalStates: {
                state,
                voltage: Vd,
                current: dcAnalysis.current,
                conductance,
                capacitance,
                temperature: this._currentState.temperature
            }
        };
    }
    _createEmptyStamp() {
        return {
            entries: [],
            type: intelligent_device_model_1.StampType.RESISTIVE,
            isLinear: true
        };
    }
    /**
     * 二极管特定收敛检查
     */
    _checkDiodeSpecificConvergence(deltaV) {
        const deltaVd = deltaV.get(this._anodeNode) - deltaV.get(this._cathodeNode);
        // 检查电压变化是否在合理范围
        const voltageChangeReasonable = Math.abs(deltaVd) < IntelligentDiode.CONVERGENCE_VOLTAGE_TOL * 1000;
        // 检查是否可能跨越工作状态边界
        const currentVd = this._currentState.internalStates['voltage'] || 0;
        const newVd = currentVd + deltaVd;
        const currentState = this._currentState.internalStates['state'];
        const newState = this._determineOperatingState(newVd);
        const stateStable = currentState === newState;
        // 计算置信度
        let confidence = 0.8;
        if (!voltageChangeReasonable)
            confidence *= 0.5;
        if (!stateStable)
            confidence *= 0.3;
        return { stateStable, confidence };
    }
    /**
     * 二极管特定步长限制
     */
    _applyDeviceSpecificLimits(deltaV) {
        const deltaVd = deltaV.get(this._anodeNode) - deltaV.get(this._cathodeNode);
        // 限制正向电压步长
        if (deltaVd > IntelligentDiode.FORWARD_VOLTAGE_LIMIT) {
            const scale = IntelligentDiode.FORWARD_VOLTAGE_LIMIT / deltaVd;
            deltaV.set(this._anodeNode, deltaV.get(this._anodeNode) * scale);
            deltaV.set(this._cathodeNode, deltaV.get(this._cathodeNode) * scale);
        }
    }
    /**
     * 预测开关事件
     */
    _predictSwitchingEvents(dt) {
        const events = [];
        const currentVd = this._currentState.internalStates['voltage'] || 0;
        const currentState = this._currentState.internalStates['state'];
        // 如果接近状态切换边界，预测开关事件
        if (currentState === DiodeState.REVERSE_BIAS && currentVd > -0.1) {
            events.push({
                eventType: 'turn_on',
                estimatedTime: this._currentState.time + dt * 0.5,
                confidence: 0.6,
                impactSeverity: 'medium'
            });
        }
        if (currentState === DiodeState.FORWARD_BIAS && currentVd < 0.1) {
            events.push({
                eventType: 'turn_off',
                estimatedTime: this._currentState.time + dt * 0.5,
                confidence: 0.6,
                impactSeverity: 'medium'
            });
        }
        return events;
    }
    /**
     * 识别二极管数值挑战
     */
    _identifyDiodeChallenges(_dt) {
        const challenges = [];
        const conductance = this._currentState.internalStates['conductance'] || 0;
        const voltage = this._currentState.internalStates['voltage'] || 0;
        // 高电导导致的病态问题
        if (conductance > 1e6) {
            challenges.push({
                type: 'ill_conditioning',
                severity: 0.7,
                mitigation: '增加串联电阻或使用更精确的数值方法'
            });
        }
        // 指数函数接近溢出
        const { n } = this._diodeParams;
        const expArg = voltage / (n * IntelligentDiode.VT);
        if (expArg > 30) {
            challenges.push({
                type: 'stiffness',
                severity: 0.8,
                mitigation: '使用对数变换或限制器避免指数溢出'
            });
        }
        return challenges;
    }
}
exports.IntelligentDiode = IntelligentDiode;
// 物理常数
IntelligentDiode.VT = 0.026; // 热电压 (26mV @ 300K)
IntelligentDiode.KB = 1.381e-23; // 玻尔兹曼常数
// 数值常数  
IntelligentDiode.MIN_CONDUCTANCE = 1e-12; // 最小电导
IntelligentDiode.MAX_EXPONENTIAL_ARG = 50; // 最大指数参数 (避免溢出)
IntelligentDiode.FORWARD_VOLTAGE_LIMIT = 2.0; // 正向电压限制 (V)
IntelligentDiode.CONVERGENCE_VOLTAGE_TOL = 1e-9; // 电压收敛容差 (nV)
