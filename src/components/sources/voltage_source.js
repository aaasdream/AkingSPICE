"use strict";
/**
 * 🔌 标准电压源组件 - AkingSPICE 2.1
 *
 * 理想电压源的实现
 * 支持直流、正弦波、脉冲等多种波形
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.VoltageSourceTest = exports.VoltageSourceFactory = exports.VoltageSource = void 0;
/**
 * ⚡ 理想电压源组件
 *
 * 电压源模型: V = V(t)
 *
 * MNA 装配需要扩展矩阵:
 * [G   B ] [V ]   [I_s]
 * [C   D ] [I_v] = [V_s]
 *
 * 其中 I_v 是电压源的电流变量
 */
class VoltageSource {
    constructor(name, nodes, _dcValue, waveform) {
        this.name = name;
        this.nodes = nodes;
        this._dcValue = _dcValue;
        this.type = 'V';
        this._dcScaleFactor = 1.0; // 新增：直流缩放因子（用于源步进）
        if (nodes.length !== 2) {
            throw new Error(`电压源必须连接两个节点，实际: ${nodes.length}`);
        }
        if (nodes[0] === nodes[1]) {
            throw new Error(`电压源不能连接到同一节点: ${nodes[0]}`);
        }
        this._originalValue = _dcValue;
        this._waveform = waveform || {
            type: 'DC',
            parameters: { value: _dcValue }
        };
    }
    scaleSource(factor) {
        this._dcValue = this._originalValue * factor;
    }
    restoreSource() {
        this._dcValue = this._originalValue;
    }
    /**
     * 🎯 获取直流值
     */
    get dcValue() {
        return this._dcValue;
    }
    /**
     * 🆕 设置直流缩放因子 (用于源步进)
     */
    scaleDcValue(factor) {
        if (factor < 0 || factor > 1) {
            console.warn(`电压源 ${this.name} 的缩放因子超出 [0, 1] 范围: ${factor}`);
        }
        this._dcScaleFactor = factor;
    }
    /**
     * 🔢 设置电流支路索引
     */
    setCurrentIndex(index) {
        this._currentIndex = index;
    }
    /**
     * 📈 获取当前激励值
     */
    getValue(time) {
        switch (this._waveform.type) {
            case 'DC':
                // 将缩放因子应用于直流值
                return (this._waveform.parameters['value'] || this._dcValue) * this._dcScaleFactor;
            case 'SIN':
                {
                    const params = this._waveform.parameters;
                    // 源步进期间，我们也缩放正弦波的直流偏置和幅度
                    const dc = (params['dc'] || 0) * this._dcScaleFactor;
                    const amplitude = (params['amplitude'] || 1) * this._dcScaleFactor;
                    const frequency = params['frequency'] || 1000;
                    const phase = params['phase'] || 0;
                    const delay = params['delay'] || 0;
                    const damping = params['damping'] || 0;
                    if (time < delay)
                        return dc;
                    const t = time - delay;
                    const expTerm = damping > 0 ? Math.exp(-damping * t) : 1;
                    return dc + amplitude * expTerm * Math.sin(2 * Math.PI * frequency * t + phase);
                }
            case 'PULSE':
                {
                    const params = this._waveform.parameters;
                    // 对脉冲波形也应用缩放
                    const v1 = (params['v1'] || 0) * this._dcScaleFactor;
                    const v2 = (params['v2'] || 1) * this._dcScaleFactor;
                    const td = params['delay'] || 0;
                    const tr = params['rise_time'] || 1e-9;
                    const tf = params['fall_time'] || 1e-9;
                    const pw = params['pulse_width'] || 1e-6;
                    const period = params['period'] || 2e-6;
                    if (time < td)
                        return v1;
                    const tmod = (time - td) % period;
                    if (tmod < tr) {
                        // 上升沿
                        return v1 + (v2 - v1) * tmod / tr;
                    }
                    else if (tmod < tr + pw) {
                        // 高电平
                        return v2;
                    }
                    else if (tmod < tr + pw + tf) {
                        // 下降沿
                        return v2 - (v2 - v1) * (tmod - tr - pw) / tf;
                    }
                    else {
                        // 低电平
                        return v1;
                    }
                }
            case 'EXP':
                {
                    const params = this._waveform.parameters;
                    // 对指数波形也应用缩放
                    const v1 = (params['v1'] || 0) * this._dcScaleFactor;
                    const v2 = (params['v2'] || 1) * this._dcScaleFactor;
                    const td1 = params['delay1'] || 0;
                    const tau1 = params['tau1'] || 1e-6;
                    const td2 = params['delay2'] || 1e-6;
                    const tau2 = params['tau2'] || 1e-6;
                    // 确保时间常数为正值
                    const safeTau1 = Math.max(tau1, 1e-15);
                    const safeTau2 = Math.max(tau2, 1e-15);
                    if (time < td1) {
                        return v1;
                    }
                    else if (time < td2) {
                        // 上升阶段：从 v1 指数上升到 v2
                        return v1 + (v2 - v1) * (1 - Math.exp(-(time - td1) / safeTau1));
                    }
                    else {
                        // 下降阶段：从 v2 指数下降
                        // 先计算在 td2 时刻的峰值
                        const v_peak = v1 + (v2 - v1) * (1 - Math.exp(-(td2 - td1) / safeTau1));
                        // 然后从峰值开始按照 tau2 指数衰减到 v1
                        return v1 + (v_peak - v1) * Math.exp(-(time - td2) / safeTau2);
                    }
                }
            case 'AC':
                {
                    const params = this._waveform.parameters;
                    // 对交流波形也应用缩放
                    const amplitude = (params['amplitude'] || 1) * this._dcScaleFactor;
                    const frequency = params['frequency'] || 1000;
                    const phase = params['phase'] || 0;
                    return amplitude * Math.cos(2 * Math.PI * frequency * time + phase);
                }
            default:
                return this._dcValue * this._dcScaleFactor;
        }
    }
    /**
     * 🌊 设置激励波形
     */
    setWaveform(waveform) {
        this._waveform = waveform;
    }
    /**
     * 🔥 MNA 矩阵装配
     *
     * 电压源需要扩展 MNA 矩阵:
     * - 添加电压源电流变量
     * - 施加电压约束方程
     */
    stamp(matrix, rhs, nodeMap, currentTime = 0) {
        const n1 = nodeMap.get(this.nodes[0]);
        const n2 = nodeMap.get(this.nodes[1]);
        if (this._currentIndex === undefined) {
            throw new Error(`电压源 ${this.name} 的电流支路索引未设置`);
        }
        const iv = this._currentIndex;
        const voltage = this.getValue(currentTime);
        // B 矩阵: 节点到支路的关联 (KCL)
        if (n1 !== undefined && n1 >= 0) {
            matrix.add(n1, iv, 1); // 电流从正端流出
        }
        if (n2 !== undefined && n2 >= 0) {
            matrix.add(n2, iv, -1); // 电流流入负端
        }
        // C 矩阵: 支路到节点的关联 (KVL)
        if (n1 !== undefined && n1 >= 0) {
            matrix.add(iv, n1, 1); // V+ 
        }
        if (n2 !== undefined && n2 >= 0) {
            matrix.add(iv, n2, -1); // -V-
        }
        // 电压约束: V+ - V- = Vs
        rhs.add(iv, voltage);
    }
    /**
     * 🔍 组件验证
     */
    validate() {
        const errors = [];
        const warnings = [];
        // 检查节点连接
        if (this.nodes.length !== 2) {
            errors.push(`电压源必须连接两个节点，实际: ${this.nodes.length}`);
        }
        if (this.nodes.length === 2 && this.nodes[0] === this.nodes[1]) {
            errors.push(`电压源不能连接到同一节点: ${this.nodes[0]}`);
        }
        // 检查波形参数
        if (!this._waveform) {
            errors.push('波形描述符不能为空');
        }
        else {
            switch (this._waveform.type) {
                case 'SIN':
                    if (!this._waveform.parameters['frequency'] || this._waveform.parameters['frequency'] <= 0) {
                        errors.push('正弦波频率必须为正数');
                    }
                    break;
                case 'PULSE':
                    if (!this._waveform.parameters['period'] || this._waveform.parameters['period'] <= 0) {
                        errors.push('脉冲周期必须为正数');
                    }
                    break;
                case 'EXP':
                    if (!this._waveform.parameters['tau1'] || this._waveform.parameters['tau1'] <= 0) {
                        errors.push('指数时间常数必须为正数');
                    }
                    break;
            }
        }
        // 检查电压幅值
        if (Math.abs(this._dcValue) > 1e6) {
            warnings.push(`电压幅值过大: ${this._dcValue}V`);
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
                dcValue: this._dcValue,
                waveform: this._waveform,
                currentIndex: this._currentIndex
            },
            units: {
                dcValue: 'V',
                waveform: 'various',
                currentIndex: '#'
            }
        };
    }
    /**
     * 🏃‍♂️ 获取需要的额外变量数量
     */
    getExtraVariableCount() {
        return 1; // 需要一个电流变量
    }
    /**
     * 📏 创建交流版本
     */
    createACVersion(amplitude, frequency, phase = 0) {
        const acSource = new VoltageSource(`${this.name}_AC`, this.nodes, 0, {
            type: 'AC',
            parameters: { amplitude, frequency, phase }
        });
        return acSource;
    }
    /**
     * 🔍 调试信息
     */
    toString() {
        return `${this.name}: V=${this._dcValue}V between ${this.nodes[0]}(+) and ${this.nodes[1]}(-)`;
    }
}
exports.VoltageSource = VoltageSource;
/**
 * 🏭 电压源工厂函数
 */
var VoltageSourceFactory;
(function (VoltageSourceFactory) {
    /**
     * 创建直流电压源
     */
    function createDC(name, nodes, voltage) {
        return new VoltageSource(name, nodes, voltage);
    }
    VoltageSourceFactory.createDC = createDC;
    /**
     * 创建正弦波电压源
     */
    function createSine(name, nodes, dc, amplitude, frequency, phase = 0) {
        return new VoltageSource(name, nodes, dc, {
            type: 'SIN',
            parameters: { dc, amplitude, frequency, phase }
        });
    }
    VoltageSourceFactory.createSine = createSine;
    /**
     * 创建脉冲电压源
     */
    function createPulse(name, nodes, v1, v2, delay = 0, riseTime = 1e-9, fallTime = 1e-9, pulseWidth = 1e-6, period = 2e-6) {
        return new VoltageSource(name, nodes, v1, {
            type: 'PULSE',
            parameters: {
                v1, v2, delay,
                rise_time: riseTime,
                fall_time: fallTime,
                pulse_width: pulseWidth,
                period
            }
        });
    }
    VoltageSourceFactory.createPulse = createPulse;
    /**
     * 创建指数电压源
     */
    function createExponential(name, nodes, v1, v2, delay1 = 0, tau1 = 1e-6, delay2, tau2) {
        return new VoltageSource(name, nodes, v1, {
            type: 'EXP',
            parameters: {
                v1, v2, delay1, tau1,
                delay2: delay2 || delay1 + 5 * tau1,
                tau2: tau2 || tau1
            }
        });
    }
    VoltageSourceFactory.createExponential = createExponential;
})(VoltageSourceFactory || (exports.VoltageSourceFactory = VoltageSourceFactory = {}));
/**
 * 🧪 电压源测试工具
 */
var VoltageSourceTest;
(function (VoltageSourceTest) {
    /**
     * 测试正弦波形
     */
    function testSineWave(amplitude, frequency, time, phase = 0) {
        return amplitude * Math.sin(2 * Math.PI * frequency * time + phase);
    }
    VoltageSourceTest.testSineWave = testSineWave;
    /**
     * 测试脉冲波形
     */
    function testPulseWave(v1, v2, pulseWidth, period, time) {
        const tmod = time % period;
        return tmod < pulseWidth ? v2 : v1;
    }
    VoltageSourceTest.testPulseWave = testPulseWave;
})(VoltageSourceTest || (exports.VoltageSourceTest = VoltageSourceTest = {}));
