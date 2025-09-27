class u {
  /**
   * @param {string} name 元件名稱 (如 'R1', 'C2')
   * @param {string} type 元件類型 (如 'R', 'C', 'L', 'V', 'I')
   * @param {string[]} nodes 連接節點列表
   * @param {number|string} value 元件值或表達式
   * @param {Object} params 額外參數
   */
  constructor(t, e, s, i, n = {}) {
    this.name = t, this.type = e, this.nodes = [...s], this.rawValue = i, this.params = { ...n }, this.value = this.parseValue(i), this.timeStep = null, this.previousValues = /* @__PURE__ */ new Map(), this.historyTerm = 0, this.operatingPoint = {
      voltage: 0,
      current: 0,
      power: 0
    }, this.temperature = n.temp || 27, this.isNonlinear = !1;
  }
  /**
   * 解析元件值，支援工程記號 (如 1K, 2.2u, 3.3m)
   * @param {number|string} value 要解析的值
   * @returns {number} 解析後的數值
   */
  parseValue(t) {
    if (typeof t == "number")
      return t;
    if (typeof t == "string") {
      const e = t.trim(), s = {
        T: 1e12,
        // Tera
        G: 1e9,
        // Giga  
        MEG: 1e6,
        // Mega (特殊處理，避免與 M 混淆)
        M: 1e6,
        // Mega (大寫M = 百萬)
        K: 1e3,
        // Kilo (大寫K)
        k: 1e3,
        // Kilo (小寫k，也常用)
        m: 1e-3,
        // milli (小寫m = 毫)
        u: 1e-6,
        // micro (小寫u)
        µ: 1e-6,
        // micro (μ符號)
        n: 1e-9,
        // nano (小寫n)
        p: 1e-12,
        // pico (小寫p)
        f: 1e-15
        // femto (小寫f)
      };
      if (e.toUpperCase().endsWith("MEG")) {
        const n = parseFloat(e.slice(0, -3));
        if (!isNaN(n))
          return n * 1e6;
      }
      for (const [n, o] of Object.entries(s))
        if (e.endsWith(n)) {
          const r = parseFloat(e.slice(0, -n.length));
          if (!isNaN(r))
            return r * o;
        }
      const i = parseFloat(e);
      if (!isNaN(i))
        return i;
    }
    throw new Error(`Cannot parse value: ${t}`);
  }
  /**
   * 檢查此元件是否需要額外的電流變數 (如電感、電壓源)
   * @returns {boolean}
   */
  needsCurrentVariable() {
    return this.type === "L" || this.type === "V" || this.type.includes("V");
  }
  /**
   * 初始化暫態分析
   * @param {number} timeStep 時間步長
   */
  initTransient(t) {
    this.timeStep = t, this.previousValues.clear(), this.historyTerm = 0;
  }
  /**
   * 更新歷史狀態 (在每個時間步結束時調用)
   * @param {Map<string, number>} nodeVoltages 節點電壓
   * @param {Map<string, number>} branchCurrents 支路電流
   */
  updateHistory(t, e) {
    const s = t.get(this.nodes[0]) || 0, i = t.get(this.nodes[1]) || 0, n = s - i;
    this.previousValues.set("voltage", n), this.operatingPoint.voltage = n;
  }
  /**
   * 計算功耗
   * @returns {number} 功耗 (瓦特)
   */
  calculatePower() {
    return Math.abs(this.operatingPoint.voltage * this.operatingPoint.current);
  }
  /**
   * 獲取元件信息字符串
   * @returns {string}
   */
  toString() {
    return `${this.name} (${this.type}): ${this.nodes.join("-")} = ${this.value}`;
  }
  /**
   * 驗證元件的有效性
   * @returns {boolean}
   */
  isValid() {
    return this.name && this.type && this.nodes.length >= 2 && !isNaN(this.value) && isFinite(this.value);
  }
  /**
   * 克隆元件
   * @returns {BaseComponent}
   */
  clone() {
    return this.constructor.name === "Resistor" || this.constructor.name === "Capacitor" || this.constructor.name === "Inductor" ? new this.constructor(this.name, this.nodes, this.rawValue, this.params) : this.constructor.name === "VoltageSource" || this.constructor.name === "CurrentSource" ? new this.constructor(this.name, this.nodes, this.rawValue, this.params) : new this.constructor(this.name, this.type, this.nodes, this.rawValue, this.params);
  }
  /**
   * 序列化為JSON
   * @returns {Object}
   */
  toJSON() {
    return {
      name: this.name,
      type: this.type,
      nodes: this.nodes,
      value: this.value,
      rawValue: this.rawValue,
      params: this.params
    };
  }
  /**
   * 從JSON反序列化
   * @param {Object} json JSON對象
   * @returns {BaseComponent}
   */
  static fromJSON(t) {
    return new u(t.name, t.type, t.nodes, t.rawValue, t.params);
  }
}
class S extends u {
  constructor(t, e, s, i, n = {}) {
    if (super(t, e, s, i, n), s.length !== 2)
      throw new Error(`${e} ${t} must have exactly 2 nodes`);
  }
  /**
   * 獲取元件兩端的電壓
   * @param {Map<string, number>} nodeVoltages 節點電壓映射
   * @returns {number} 電壓差 V(n1) - V(n2)
   */
  getVoltage(t) {
    const e = t.get(this.nodes[0]) || 0, s = t.get(this.nodes[1]) || 0;
    return e - s;
  }
}
class y extends S {
  /**
   * @param {string} name 電阻名稱 (如 'R1')
   * @param {string[]} nodes 連接節點 [n1, n2]
   * @param {number|string} resistance 電阻值 (歐姆)
   * @param {Object} params 額外參數
   */
  constructor(t, e, s, i = {}) {
    super(t, "R", e, s, i), this.tc1 = i.tc1 || 0, this.tc2 = i.tc2 || 0, this.tnom = i.tnom || 27, this.powerRating = i.power || 1 / 0, this.updateTemperatureCoefficient();
  }
  /**
   * 根據溫度更新電阻值
   */
  updateTemperatureCoefficient() {
    const t = this.temperature - this.tnom, e = 1 + this.tc1 * t + this.tc2 * t * t;
    this.actualValue = this.value * e;
  }
  /**
   * 獲取當前工作溫度下的電阻值
   * @returns {number} 實際電阻值 (歐姆)
   */
  getResistance() {
    return this.actualValue || this.value;
  }
  /**
   * 獲取電導值
   * @returns {number} 電導值 (西門子)
   */
  getConductance() {
    const t = this.getResistance();
    if (t === 0)
      throw new Error(`Zero resistance in ${this.name}`);
    return 1 / t;
  }
  /**
   * 計算通過電阻的電流 (使用歐姆定律)
   * @param {Map<string, number>} nodeVoltages 節點電壓
   * @returns {number} 電流 (安培)，正值表示從n1流向n2
   */
  getCurrent(t) {
    const s = this.getVoltage(t) / this.getResistance();
    return this.operatingPoint.current = s, s;
  }
  /**
   * 更新歷史狀態
   * @param {Map<string, number>} nodeVoltages 節點電壓
   * @param {Map<string, number>} branchCurrents 支路電流
   */
  updateHistory(t, e) {
    super.updateHistory(t, e);
    const s = this.getCurrent(t);
    this.previousValues.set("current", s), this.operatingPoint.power = this.operatingPoint.voltage * s;
  }
  /**
   * 檢查是否超過功率額定值
   * @returns {boolean} 如果超過額定功率返回true
   */
  isOverPower() {
    return this.operatingPoint.power > this.powerRating;
  }
  /**
   * 獲取電阻器資訊
   * @returns {Object} 詳細信息
   */
  getInfo() {
    return {
      ...super.toJSON(),
      actualResistance: this.getResistance(),
      conductance: this.getConductance(),
      tc1: this.tc1,
      tc2: this.tc2,
      powerRating: this.powerRating,
      operatingPoint: { ...this.operatingPoint },
      overPower: this.isOverPower()
    };
  }
  /**
   * 驗證電阻器參數
   * @returns {boolean}
   */
  isValid() {
    return super.isValid() && this.value > 0;
  }
  toString() {
    const t = this.getResistance();
    let e;
    return t >= 1e6 ? e = `${(t / 1e6).toFixed(2)}MΩ` : t >= 1e3 ? e = `${(t / 1e3).toFixed(2)}kΩ` : e = `${t.toFixed(2)}Ω`, `${this.name}: ${this.nodes[0]}-${this.nodes[1]} ${e}`;
  }
}
class $ extends S {
  /**
   * @param {string} name 電容名稱 (如 'C1')
   * @param {string[]} nodes 連接節點 [n1, n2]
   * @param {number|string} capacitance 電容值 (法拉)
   * @param {Object} params 額外參數
   */
  constructor(t, e, s, i = {}) {
    super(t, "C", e, s, i), this.ic = i.ic || 0, this.tc1 = i.tc1 || 0, this.tc2 = i.tc2 || 0, this.tnom = i.tnom || 27, this.voltageRating = i.voltage || 1 / 0, this.equivalentConductance = 0, this.historyCurrentSource = 0, this.updateTemperatureCoefficient();
  }
  /**
   * 根據溫度更新電容值
   */
  updateTemperatureCoefficient() {
    const t = this.temperature - this.tnom, e = 1 + this.tc1 * t + this.tc2 * t * t;
    this.actualValue = this.value * e;
  }
  /**
   * 獲取當前工作溫度下的電容值
   * @returns {number} 實際電容值 (法拉)
   */
  getCapacitance() {
    return this.actualValue || this.value;
  }
  /**
   * 初始化暫態分析
   * @param {number} timeStep 時間步長
   */
  initTransient(t) {
    super.initTransient(t);
    const e = this.getCapacitance();
    this.equivalentConductance = e / t, this.previousValues.set("voltage", this.ic), this.historyCurrentSource = -this.equivalentConductance * this.ic;
  }
  /**
   * 計算伴隨模型的歷史項
   * 電容的伴隨模型：i_c(t) = C/h * [v(t) - v(t-h)] + i_hist
   * 其中 i_hist = -C/h * v(t-h)
   */
  updateCompanionModel() {
    if (!this.timeStep) return;
    const t = this.previousValues.get("voltage") || 0;
    this.historyCurrentSource = -this.equivalentConductance * t, this.historyTerm = this.historyCurrentSource;
  }
  /**
   * 計算電容電流 i = C * dv/dt
   * @param {Map<string, number>} nodeVoltages 節點電壓
   * @returns {number} 電流 (安培)，正值表示從n1流向n2
   */
  getCurrent(t) {
    const e = this.getVoltage(t);
    if (!this.timeStep)
      return this.operatingPoint.current = 0, 0;
    const s = this.previousValues.get("voltage") || 0, n = this.getCapacitance() * (e - s) / this.timeStep;
    return this.operatingPoint.current = n, n;
  }
  /**
   * 計算存儲的能量 E = 0.5 * C * V²
   * @param {Map<string, number>} nodeVoltages 節點電壓
   * @returns {number} 能量 (焦耳)
   */
  getStoredEnergy(t) {
    const e = this.getVoltage(t);
    return 0.5 * this.getCapacitance() * e * e;
  }
  /**
   * 更新歷史狀態
   * @param {Map<string, number>} nodeVoltages 節點電壓
   * @param {Map<string, number>} branchCurrents 支路電流
   */
  updateHistory(t, e) {
    super.updateHistory(t, e);
    const s = this.getVoltage(t), i = this.getCurrent(t);
    this.previousValues.set("voltage", s), this.previousValues.set("current", i), this.operatingPoint.power = s * i, this.updateCompanionModel();
  }
  /**
   * 檢查是否超過電壓額定值
   * @param {Map<string, number>} nodeVoltages 節點電壓
   * @returns {boolean} 如果超過額定電壓返回true
   */
  isOverVoltage(t) {
    return Math.abs(this.getVoltage(t)) > this.voltageRating;
  }
  /**
   * 獲取電容器資訊
   * @param {Map<string, number>} nodeVoltages 節點電壓
   * @returns {Object} 詳細信息
   */
  getInfo(t = null) {
    const e = {
      ...super.toJSON(),
      actualCapacitance: this.getCapacitance(),
      ic: this.ic,
      tc1: this.tc1,
      tc2: this.tc2,
      voltageRating: this.voltageRating,
      operatingPoint: { ...this.operatingPoint }
    };
    return t && (e.storedEnergy = this.getStoredEnergy(t), e.overVoltage = this.isOverVoltage(t)), this.timeStep && (e.equivalentConductance = this.equivalentConductance, e.historyCurrentSource = this.historyCurrentSource), e;
  }
  /**
   * 驗證電容器參數
   * @returns {boolean}
   */
  isValid() {
    return super.isValid() && this.value > 0;
  }
  toString() {
    const t = this.getCapacitance();
    let e;
    t >= 1e-3 ? e = `${(t * 1e3).toFixed(2)}mF` : t >= 1e-6 ? e = `${(t * 1e6).toFixed(2)}µF` : t >= 1e-9 ? e = `${(t * 1e9).toFixed(2)}nF` : t >= 1e-12 ? e = `${(t * 1e12).toFixed(2)}pF` : e = `${t.toExponential(2)}F`;
    let s = `${this.name}: ${this.nodes[0]}-${this.nodes[1]} ${e}`;
    return this.ic !== 0 && (s += ` IC=${this.ic}V`), s;
  }
}
class v extends S {
  /**
   * @param {string} name 電感名稱 (如 'L1')
   * @param {string[]} nodes 連接節點 [n1, n2]
   * @param {number|string} inductance 電感值 (亨利)
   * @param {Object} params 額外參數
   */
  constructor(t, e, s, i = {}) {
    super(t, "L", e, s, i), this.ic = i.ic || 0, this.resistance = i.r || 0, this.tc1 = i.tc1 || 0, this.tc2 = i.tc2 || 0, this.tnom = i.tnom || 27, this.currentRating = i.current || 1 / 0, this.equivalentResistance = 0, this.historyVoltageSource = 0, this.needsCurrentVar = !0, this.updateTemperatureCoefficient();
  }
  /**
   * 根據溫度更新電感值
   */
  updateTemperatureCoefficient() {
    const t = this.temperature - this.tnom, e = 1 + this.tc1 * t + this.tc2 * t * t;
    this.actualValue = this.value * e;
  }
  /**
   * 獲取當前工作溫度下的電感值
   * @returns {number} 實際電感值 (亨利)
   */
  getInductance() {
    return this.actualValue || this.value;
  }
  /**
   * 檢查此元件是否需要額外的電流變數
   * @returns {boolean}
   */
  needsCurrentVariable() {
    return !0;
  }
  /**
   * 初始化暫態分析
   * @param {number} timeStep 時間步長
   */
  initTransient(t) {
    super.initTransient(t);
    const e = this.getInductance();
    this.equivalentResistance = e / t, this.previousValues.set("current", this.ic), this.historyVoltageSource = this.equivalentResistance * this.ic;
  }
  /**
   * 計算伴隨模型的歷史項
   * 電感的伴隨模型：v_L(t) = R_eq * i(t) + V_hist
   * 其中 R_eq = L/h, V_hist = R_eq * i(t-h)
   */
  updateCompanionModel() {
    if (!this.timeStep) return;
    const t = this.previousValues.get("current") || 0;
    this.historyVoltageSource = this.equivalentResistance * t, this.historyTerm = t;
  }
  /**
   * 計算電感電壓 v = L * di/dt
   * @param {number} current 當前電流
   * @returns {number} 電壓 (伏特)
   */
  getVoltageFromCurrent(t) {
    if (!this.timeStep)
      return t * this.resistance;
    const e = this.previousValues.get("current") || 0, s = this.getInductance(), i = (t - e) / this.timeStep, n = s * i + this.resistance * t;
    return this.operatingPoint.current = t, this.operatingPoint.voltage = n, n;
  }
  /**
   * 計算存儲的磁能 E = 0.5 * L * I²
   * @param {number} current 電流
   * @returns {number} 能量 (焦耳)
   */
  getStoredEnergy(t) {
    return 0.5 * this.getInductance() * t * t;
  }
  /**
   * 更新歷史狀態
   * @param {Map<string, number>} nodeVoltages 節點電壓
   * @param {Map<string, number>} branchCurrents 支路電流
   */
  updateHistory(t, e) {
    super.updateHistory(t, e);
    const s = e.get(this.name) || 0, i = this.getVoltageFromCurrent(s);
    this.previousValues.set("current", s), this.previousValues.set("voltage", i), this.operatingPoint.power = i * s, this.updateCompanionModel();
  }
  /**
   * 檢查是否超過電流額定值
   * @param {number} current 電流
   * @returns {boolean} 如果超過額定電流返回true
   */
  isOverCurrent(t) {
    return Math.abs(t) > this.currentRating;
  }
  /**
   * 獲取電感器資訊
   * @param {number} current 當前電流
   * @returns {Object} 詳細信息
   */
  getInfo(t = null) {
    const e = {
      ...super.toJSON(),
      actualInductance: this.getInductance(),
      ic: this.ic,
      resistance: this.resistance,
      tc1: this.tc1,
      tc2: this.tc2,
      currentRating: this.currentRating,
      operatingPoint: { ...this.operatingPoint }
    };
    return t !== null && (e.storedEnergy = this.getStoredEnergy(t), e.overCurrent = this.isOverCurrent(t)), this.timeStep && (e.equivalentResistance = this.equivalentResistance, e.historyVoltageSource = this.historyVoltageSource), e;
  }
  /**
   * 驗證電感器參數
   * @returns {boolean}
   */
  isValid() {
    return super.isValid() && this.value > 0;
  }
  toString() {
    const t = this.getInductance();
    let e;
    t >= 1 ? e = `${t.toFixed(3)}H` : t >= 1e-3 ? e = `${(t * 1e3).toFixed(2)}mH` : t >= 1e-6 ? e = `${(t * 1e6).toFixed(2)}µH` : t >= 1e-9 ? e = `${(t * 1e9).toFixed(2)}nH` : e = `${t.toExponential(2)}H`;
    let s = `${this.name}: ${this.nodes[0]}-${this.nodes[1]} ${e}`;
    return this.resistance > 0 && (s += ` R=${this.resistance}Ω`), this.ic !== 0 && (s += ` IC=${this.ic}A`), s;
  }
}
class f extends u {
  /**
   * @param {string} name 電壓源名稱 (如 'VIN', 'V1')
   * @param {string[]} nodes 連接節點 [正, 負]
   * @param {number|Object} source 電壓值或源描述對象
   * @param {Object} params 額外參數
   */
  constructor(t, e, s, i = {}) {
    if (super(t, "V", e, 0, i), e.length !== 2)
      throw new Error(`Voltage source ${t} must have exactly 2 nodes`);
    this.rawSource = s, this.sourceConfig = this.parseSourceConfig(s), this.needsCurrentVar = !0, this.value = this.sourceConfig.dc || this.sourceConfig.amplitude || 0;
  }
  /**
   * 解析源配置
   * @param {number|Object|string} source 源描述
   * @returns {Object} 標準化的源配置
   */
  parseSourceConfig(t) {
    if (typeof t == "number")
      return {
        type: "DC",
        dc: t,
        amplitude: t,
        offset: t
      };
    if (typeof t == "string")
      return this.parseSpiceSource(t);
    if (typeof t == "object")
      return {
        type: t.type || "DC",
        ...t
      };
    throw new Error(`Invalid voltage source specification: ${t}`);
  }
  /**
   * 解析SPICE格式的源描述
   * @param {string} sourceStr SPICE格式字符串
   * @returns {Object} 源配置
   */
  parseSpiceSource(t) {
    const e = t.trim().toUpperCase(), s = e.match(/^(?:DC\()?(-?[\d.]+(?:[eE][-+]?\d+)?)(?:V)?(?:\))?$/);
    if (s) {
      const o = parseFloat(s[1]);
      return {
        type: "DC",
        dc: o,
        amplitude: o,
        offset: o
      };
    }
    const i = e.match(/^SINE\(\s*([-\d.]+(?:[eE][-+]?\d+)?)?\s*([-\d.]+(?:[eE][-+]?\d+)?)?\s*([-\d.]+(?:[eE][-+]?\d+)?)?\s*([-\d.]+(?:[eE][-+]?\d+)?)?\s*([-\d.]+(?:[eE][-+]?\d+)?)?\s*\)$/);
    if (i)
      return {
        type: "SINE",
        offset: parseFloat(i[1] || "0"),
        amplitude: parseFloat(i[2] || "0"),
        frequency: parseFloat(i[3] || "1"),
        delay: parseFloat(i[4] || "0"),
        damping: parseFloat(i[5] || "0")
      };
    const n = e.match(/^PULSE\(\s*([-\d.]+(?:[eE][-+]?\d+)?)\s+([-\d.]+(?:[eE][-+]?\d+)?)\s*([-\d.]+(?:[eE][-+]?\d+)?)?\s*([-\d.]+(?:[eE][-+]?\d+)?)?\s*([-\d.]+(?:[eE][-+]?\d+)?)?\s*([-\d.]+(?:[eE][-+]?\d+)?)?\s*([-\d.]+(?:[eE][-+]?\d+)?)?\s*\)$/);
    if (n)
      return {
        type: "PULSE",
        v1: parseFloat(n[1]),
        v2: parseFloat(n[2]),
        td: parseFloat(n[3] || "0"),
        // 延遲時間
        tr: parseFloat(n[4] || "1e-9"),
        // 上升時間
        tf: parseFloat(n[5] || "1e-9"),
        // 下降時間
        pw: parseFloat(n[6] || "1e-6"),
        // 脈寬
        per: parseFloat(n[7] || "2e-6")
        // 周期
      };
    throw new Error(`Cannot parse voltage source: ${t}`);
  }
  /**
   * 檢查此元件是否需要額外的電流變數
   * @returns {boolean}
   */
  needsCurrentVariable() {
    return !0;
  }
  /**
   * 獲取指定時間的電壓值
   * @param {number} time 時間 (秒)
   * @returns {number} 電壓值 (伏特)
   */
  getValue(t = 0) {
    const e = this.sourceConfig;
    switch (e.type) {
      case "DC":
        return e.dc || 0;
      case "SINE":
        return this.getSineValue(t, e);
      case "PULSE":
        return this.getPulseValue(t, e);
      case "EXP":
        return this.getExpValue(t, e);
      case "PWL":
        return this.getPWLValue(t, e);
      default:
        return console.warn(`Unknown voltage source type: ${e.type}`), 0;
    }
  }
  /**
   * 計算正弦波值
   * v(t) = offset + amplitude * sin(2π * frequency * (t - delay)) * exp(-damping * (t - delay))
   */
  getSineValue(t, e) {
    const { offset: s, amplitude: i, frequency: n, delay: o, damping: r } = e;
    if (t < o)
      return s;
    const a = t - o, c = 2 * Math.PI * n, l = r > 0 ? Math.exp(-r * a) : 1;
    return s + i * Math.sin(c * a) * l;
  }
  /**
   * 計算脈衝波值
   */
  getPulseValue(t, e) {
    const { v1: s, v2: i, td: n, tr: o, tf: r, pw: a, per: c } = e;
    if (t < n)
      return s;
    const l = (t - n) % c;
    if (l <= o)
      return s + (i - s) * (l / o);
    if (l <= o + a)
      return i;
    if (l <= o + a + r) {
      const d = l - o - a;
      return i - (i - s) * (d / r);
    } else
      return s;
  }
  /**
   * 計算指數波值 (用於EXP源)
   */
  getExpValue(t, e) {
    const { v1: s, v2: i, td1: n, tau1: o, td2: r, tau2: a } = e;
    if (t < n)
      return s;
    if (t < r) {
      const c = t - n;
      return s + (i - s) * (1 - Math.exp(-c / o));
    } else {
      const c = r - n, l = t - r, d = s + (i - s) * (1 - Math.exp(-c / o));
      return d + (s - d) * (1 - Math.exp(-l / a));
    }
  }
  /**
   * 計算分段線性值 (用於PWL源)
   */
  getPWLValue(t, e) {
    const { points: s } = e;
    if (!s || s.length === 0)
      return 0;
    for (let i = 0; i < s.length - 1; i++) {
      const [n, o] = s[i], [r, a] = s[i + 1];
      if (t >= n && t <= r)
        return o + (a - o) * (t - n) / (r - n);
    }
    return t >= s[s.length - 1][0] ? s[s.length - 1][1] : s[0][1];
  }
  /**
   * 獲取電壓源信息
   * @param {number} time 當前時間
   * @returns {Object}
   */
  getInfo(t = 0) {
    return {
      ...super.toJSON(),
      sourceConfig: this.sourceConfig,
      currentValue: this.getValue(t),
      operatingPoint: { ...this.operatingPoint }
    };
  }
  toString() {
    const t = this.sourceConfig;
    let e;
    switch (t.type) {
      case "DC":
        e = `DC(${t.dc}V)`;
        break;
      case "SINE":
        e = `SINE(${t.offset}V, ${t.amplitude}V, ${t.frequency}Hz)`;
        break;
      case "PULSE":
        e = `PULSE(${t.v1}V, ${t.v2}V, ${t.per * 1e6}µs)`;
        break;
      default:
        e = `${t.type}`;
    }
    return `${this.name}: ${this.nodes[0]}(+) ${this.nodes[1]}(-) ${e}`;
  }
}
class x extends u {
  /**
   * @param {string} name 電流源名稱 (如 'IIN', 'I1')
   * @param {string[]} nodes 連接節點 [流出, 流入]
   * @param {number|Object} source 電流值或源描述對象
   * @param {Object} params 額外參數
   */
  constructor(t, e, s, i = {}) {
    if (super(t, "I", e, 0, i), e.length !== 2)
      throw new Error(`Current source ${t} must have exactly 2 nodes`);
    this.rawSource = s, this.sourceConfig = this.parseSourceConfig(s), this.value = this.sourceConfig.dc || this.sourceConfig.amplitude || 0;
  }
  /**
   * 解析源配置 (與電壓源相同的邏輯)
   */
  parseSourceConfig(t) {
    return new f("temp", ["1", "0"], t).sourceConfig;
  }
  /**
   * 獲取指定時間的電流值
   * @param {number} time 時間 (秒)
   * @returns {number} 電流值 (安培)
   */
  getValue(t = 0) {
    const e = new f("temp", ["1", "0"], this.sourceConfig);
    return e.sourceConfig = this.sourceConfig, e.getValue(t);
  }
  /**
   * 檢查此元件是否需要額外的電流變數
   * @returns {boolean}
   */
  needsCurrentVariable() {
    return !1;
  }
  /**
   * 獲取電流源信息
   * @param {number} time 當前時間
   * @returns {Object}
   */
  getInfo(t = 0) {
    return {
      ...super.toJSON(),
      sourceConfig: this.sourceConfig,
      currentValue: this.getValue(t),
      operatingPoint: { ...this.operatingPoint }
    };
  }
  toString() {
    const t = this.sourceConfig;
    let e;
    switch (t.type) {
      case "DC":
        e = `DC(${t.dc}A)`;
        break;
      case "SINE":
        e = `SINE(${t.offset}A, ${t.amplitude}A, ${t.frequency}Hz)`;
        break;
      case "PULSE":
        e = `PULSE(${t.v1}A, ${t.v2}A, ${t.per * 1e6}µs)`;
        break;
      default:
        e = `${t.type}`;
    }
    return `${this.name}: ${this.nodes[0]}→${this.nodes[1]} ${e}`;
  }
}
class b extends u {
  /**
   * @param {string} name VCVS名稱 (如 'E1')
   * @param {string[]} outputNodes 輸出節點 [正, 負]
   * @param {string[]} controlNodes 控制節點 [正, 負]
   * @param {number} gain 電壓增益
   * @param {Object} params 額外參數
   */
  constructor(t, e, s, i, n = {}) {
    const o = [...e, ...s];
    super(t, "VCVS", o, i, n), this.outputNodes = [...e], this.controlNodes = [...s], this.gain = i;
  }
  needsCurrentVariable() {
    return !0;
  }
  toString() {
    return `${this.name}: ${this.outputNodes[0]}-${this.outputNodes[1]} = ${this.gain} * (${this.controlNodes[0]}-${this.controlNodes[1]})`;
  }
}
class T extends u {
  /**
   * @param {string} name VCCS名稱 (如 'G1')
   * @param {string[]} outputNodes 輸出節點 [流出, 流入]
   * @param {string[]} controlNodes 控制節點 [正, 負]
   * @param {number} transconductance 跨導 (S)
   * @param {Object} params 額外參數
   */
  constructor(t, e, s, i, n = {}) {
    const o = [...e, ...s];
    super(t, "VCCS", o, i, n), this.outputNodes = [...e], this.controlNodes = [...s], this.transconductance = i;
  }
  needsCurrentVariable() {
    return !1;
  }
  toString() {
    return `${this.name}: I(${this.outputNodes[0]}→${this.outputNodes[1]}) = ${this.transconductance} * V(${this.controlNodes[0]}-${this.controlNodes[1]})`;
  }
}
class C extends u {
  /**
   * @param {string} name MOSFET名稱 (如 'M1', 'Q1')
   * @param {string[]} nodes 連接節點 [drain, source, gate] (gate節點在此模型中僅用於標識)
   * @param {Object} params 參數 {Ron, Roff, Vf_diode, Von_diode}
   */
  constructor(t, e, s = {}) {
    const i = e.length >= 3 ? [e[0], e[1]] : e;
    if (super(t, "M", i, 0, s), e.length < 2)
      throw new Error(`MOSFET ${t} must have at least 2 nodes: [drain, source], optional gate`);
    this.Ron = this.safeParseValue(s.Ron, 1e-3), this.Roff = this.safeParseValue(s.Roff, 1e6), this.Vf_diode = this.safeParseValue(s.Vf_diode, 0.7), this.Von_diode = this.safeParseValue(s.Von_diode, 1e-3), this.Roff_diode = this.safeParseValue(s.Roff_diode, 1e6), this.gateState = !1, this.isExtControlled = !0, this.drain = e[0], this.source = e[1], this.gate = e[2] || null, this.mosfetCurrent = 0, this.validate();
  }
  /**
   * 安全地解析數值參數，如果失敗則返回默認值
   * @param {*} value 要解析的值
   * @param {number} defaultValue 默認值
   * @returns {number} 解析後的數值或默認值
   */
  safeParseValue(t, e) {
    try {
      return t == null ? e : this.parseValue(t);
    } catch {
      return e;
    }
  }
  /**
   * 驗證MOSFET參數
   */
  validate() {
    if (this.Ron <= 0)
      throw new Error(`MOSFET ${this.name}: Ron must be positive`);
    if (this.Roff <= this.Ron)
      throw new Error(`MOSFET ${this.name}: Roff must be greater than Ron`);
    this.mosfetCurrent = 0, this.diodeCurrent = 0, this.totalCurrent = 0, this.drainSourceVoltage = 0;
  }
  /**
   * 設置 MOSFET 開關狀態 (外部控制接口)
   * @param {boolean} state true = ON, false = OFF
   */
  setGateState(t) {
    this.gateState = !!t;
  }
  /**
   * 獲取當前開關狀態
   * @returns {boolean}
   */
  getGateState() {
    return this.gateState;
  }
  /**
   * 計算 MOSFET 通道的等效電阻
   * @returns {number} 等效電阻 (歐姆)
   */
  getMOSFETResistance() {
    return this.gateState ? this.Ron : this.Roff;
  }
  /**
   * 計算體二極體的等效電阻
   * @param {number} vds Drain-Source 電壓 (V)
   * @returns {number} 等效電阻 (歐姆)
   */
  getBodyDiodeResistance(t) {
    return t < -this.Vf_diode ? this.Von_diode : this.Roff_diode;
  }
  /**
   * 計算總的等效電阻 (MOSFET 通道與體二極體並聯)
   * @param {number} vds Drain-Source 電壓 (V)
   * @returns {number} 等效電阻 (歐姆)
   */
  getEquivalentResistance(t) {
    const e = this.getMOSFETResistance(), s = this.getBodyDiodeResistance(t);
    return 1 / (1 / e + 1 / s);
  }
  /**
   * 為 MNA 分析提供印花 (stamping) 支援
   * 注意：這是一個非線性元件，需要在每次迭代中更新
   * 
   * @param {Matrix} matrix MNA 矩陣
   * @param {Vector} rhs 右側向量  
   * @param {Map} nodeMap 節點映射
   * @param {Map} voltageSourceMap 電壓源映射
   * @param {number} time 當前時間
   */
  stamp(t, e, s, i, n) {
    const o = this.drain === "0" || this.drain === "gnd" ? -1 : s.get(this.drain), r = this.source === "0" || this.source === "gnd" ? -1 : s.get(this.source);
    if (o === void 0 || r === void 0)
      throw new Error(`MOSFET ${this.name}: Node mapping not found (drain: ${this.drain}, source: ${this.source})`);
    let a = 0;
    this.drainSourceVoltage !== void 0 && (a = this.drainSourceVoltage);
    const l = 1 / this.getEquivalentResistance(a);
    o >= 0 && (t.addAt(o, o, l), r >= 0 && t.addAt(o, r, -l)), r >= 0 && (t.addAt(r, r, l), o >= 0 && t.addAt(r, o, -l));
  }
  /**
   * 更新元件狀態 (在每個時間步後調用)
   * @param {number} vds Drain-Source 電壓
   * @param {number} ids Drain-Source 電流
   */
  updateState(t, e) {
    this.drainSourceVoltage = t, this.totalCurrent = e;
    const s = this.getMOSFETResistance(), i = this.getBodyDiodeResistance(t), n = this.getEquivalentResistance(t);
    this.mosfetCurrent = e * (n / s), this.diodeCurrent = e * (n / i);
  }
  /**
   * 檢查是否需要電流變數 (對於理想開關，通常不需要)
   * @returns {boolean}
   */
  needsCurrentVariable() {
    return !1;
  }
  /**
   * 獲取元件資訊字串
   * @returns {string}
   */
  toString() {
    const t = this.gate ? ` G=${this.gate}` : " (Ext. Control)";
    return `${this.name} (MOSFET): D=${this.drain} S=${this.source}${t}, State=${this.gateState ? "ON" : "OFF"}, Ron=${this.Ron}Ω, Roff=${this.Roff}Ω`;
  }
  /**
   * 獲取詳細的工作狀態
   * @returns {Object}
   */
  getOperatingStatus() {
    return {
      name: this.name,
      type: "MOSFET",
      gateState: this.gateState ? "ON" : "OFF",
      drainSourceVoltage: this.drainSourceVoltage,
      totalCurrent: this.totalCurrent,
      mosfetCurrent: this.mosfetCurrent,
      diodeCurrent: this.diodeCurrent,
      currentResistance: this.getEquivalentResistance(this.drainSourceVoltage),
      bodyDiodeActive: this.drainSourceVoltage < -this.Vf_diode
    };
  }
  /**
   * 序列化為 JSON
   * @returns {Object}
   */
  toJSON() {
    return {
      ...super.toJSON(),
      gateState: this.gateState,
      Ron: this.Ron,
      Roff: this.Roff,
      Vf_diode: this.Vf_diode,
      Von_diode: this.Von_diode,
      operatingStatus: this.getOperatingStatus()
    };
  }
  /**
   * 復製 MOSFET
   * @returns {MOSFET}
   */
  clone() {
    const t = new C(this.name, this.nodes, {
      Ron: this.Ron,
      Roff: this.Roff,
      Vf_diode: this.Vf_diode,
      Von_diode: this.Von_diode,
      Roff_diode: this.Roff_diode
    });
    return t.setGateState(this.gateState), t;
  }
}
class I {
  constructor() {
    this.components = [], this.models = /* @__PURE__ */ new Map(), this.parameters = /* @__PURE__ */ new Map(), this.analyses = [], this.options = /* @__PURE__ */ new Map(), this.includes = [], this.stats = {
      totalLines: 0,
      parsedLines: 0,
      skippedLines: 0,
      errors: []
    };
  }
  /**
   * 解析網表字符串
   * @param {string} netlistText 網表內容
   * @returns {Object} 解析結果
   */
  parse(t) {
    this.reset();
    const e = t.split(/\r?\n/).map((s) => s.trim());
    this.stats.totalLines = e.length, console.log(`Parsing netlist with ${e.length} lines...`);
    try {
      const s = this.preprocessLines(e);
      for (let i = 0; i < s.length; i++) {
        const n = s[i];
        if (n.length !== 0)
          try {
            this.parseLine(n, i + 1), this.stats.parsedLines++;
          } catch (o) {
            this.stats.errors.push({
              line: i + 1,
              content: n,
              error: o.message
            });
          }
      }
      return console.log(`Netlist parsing completed: ${this.components.length} components, ${this.stats.errors.length} errors`), {
        components: this.components,
        models: this.models,
        parameters: this.parameters,
        analyses: this.analyses,
        options: this.options,
        stats: this.stats
      };
    } catch (s) {
      throw console.error("Netlist parsing failed:", s), s;
    }
  }
  /**
   * 重置解析器狀態
   */
  reset() {
    this.components = [], this.models.clear(), this.parameters.clear(), this.analyses = [], this.options.clear(), this.includes = [], this.stats = {
      totalLines: 0,
      parsedLines: 0,
      skippedLines: 0,
      errors: []
    };
  }
  /**
   * 預處理網表行
   * @param {string[]} lines 原始行
   * @returns {string[]} 處理後的行
   */
  preprocessLines(t) {
    const e = [];
    let s = "";
    for (let i of t) {
      if (i.startsWith("*") || i.startsWith(";"))
        continue;
      const n = Math.min(
        i.indexOf("$") >= 0 ? i.indexOf("$") : i.length,
        i.indexOf(";") >= 0 ? i.indexOf(";") : i.length
      );
      i = i.substring(0, n).trim(), i.length !== 0 && (i.startsWith("+") ? s += " " + i.substring(1).trim() : (s.length > 0 && e.push(s), s = i));
    }
    return s.length > 0 && e.push(s), e;
  }
  /**
   * 解析單行網表
   * @param {string} line 網表行
   * @param {number} lineNumber 行號
   * @returns {BaseComponent} 創建的組件 (如果是組件行)
   */
  parseLine(t, e = 1) {
    const s = t.split(/\s+/);
    if (s.length === 0) return null;
    const i = s[0][0].toUpperCase();
    let n = null;
    try {
      switch (i) {
        case "R":
          n = this.parseResistor(s);
          break;
        case "C":
          n = this.parseCapacitor(s);
          break;
        case "L":
          n = this.parseInductor(s);
          break;
        case "V":
          n = this.parseVoltageSource(s);
          break;
        case "I":
          n = this.parseCurrentSource(s);
          break;
        case "E":
          n = this.parseVCVS(s);
          break;
        case "G":
          n = this.parseVCCS(s);
          break;
        case "M":
          n = this.parseMOSFET(s);
          break;
        case ".":
          this.parseDirective(s);
          break;
        default:
          console.warn(`Unknown component type: ${s[0]} (line ${e})`), this.stats.skippedLines++;
      }
    } catch (o) {
      throw new Error(`Line ${e}: ${o.message}`);
    }
    return n;
  }
  /**
   * 解析電阻
   * 格式: R<name> <node1> <node2> <value> [parameters]
   * @returns {Resistor} 創建的電阻組件
   */
  parseResistor(t) {
    if (t.length < 4)
      throw new Error("Resistor requires at least 4 tokens: R<name> <node1> <node2> <value>");
    const e = t[0], s = [t[1], t[2]], i = t[3], n = this.parseParameters(t.slice(4)), o = new y(e, s, i, n);
    return this.components.push(o), o;
  }
  /**
   * 解析電容
   * 格式: C<name> <node1> <node2> <value> [IC=<initial_voltage>]
   * @returns {Capacitor} 創建的電容組件
   */
  parseCapacitor(t) {
    if (t.length < 4)
      throw new Error("Capacitor requires at least 4 tokens: C<name> <node1> <node2> <value>");
    const e = t[0], s = [t[1], t[2]], i = t[3], n = this.parseParameters(t.slice(4)), o = new $(e, s, i, n);
    return this.components.push(o), o;
  }
  /**
   * 解析電感
   * 格式: L<name> <node1> <node2> <value> [IC=<initial_current>]
   * @returns {Inductor} 創建的電感組件
   */
  parseInductor(t) {
    if (t.length < 4)
      throw new Error("Inductor requires at least 4 tokens: L<name> <node1> <node2> <value>");
    const e = t[0], s = [t[1], t[2]], i = t[3], n = this.parseParameters(t.slice(4)), o = new v(e, s, i, n);
    return this.components.push(o), o;
  }
  /**
   * 解析 MOSFET
   * 格式: M<name> <drain> <source> <gate> [Ron=<value>] [Roff=<value>] [Vf=<value>]
   * @returns {MOSFET} 創建的 MOSFET 組件
   */
  parseMOSFET(t) {
    if (t.length < 4)
      throw new Error("MOSFET requires at least 4 tokens: M<name> <drain> <source> <gate>");
    const e = t[0], s = t[1], i = t[2], n = t[3], o = [s, i, n], r = this.parseParameters(t.slice(4)), a = {
      Ron: r.Ron || r.ron || "1m",
      // 默認 1mΩ
      Roff: r.Roff || r.roff || "1M",
      // 默認 1MΩ  
      Vf_diode: r.Vf || r.vf || r.Vf_diode || "0.7",
      Von_diode: r.Von_diode || r.von_diode || "1m",
      Roff_diode: r.Roff_diode || r.roff_diode || "1M"
    }, c = new C(e, o, a);
    return this.components.push(c), c;
  }
  /**
   * 解析電壓源
   * 格式: V<name> <node+> <node-> <source_spec>
   * @returns {VoltageSource} 創建的電壓源組件
   */
  parseVoltageSource(t) {
    if (t.length < 4)
      throw new Error("Voltage source requires at least 4 tokens: V<name> <node+> <node-> <source>");
    const e = t[0], s = [t[1], t[2]];
    let i = t.slice(3).join(" ");
    const n = {}, o = new f(e, s, i, n);
    return this.components.push(o), o;
  }
  /**
   * 解析電流源
   * 格式: I<name> <node+> <node-> <source_spec>
   * @returns {CurrentSource} 創建的電流源組件
   */
  parseCurrentSource(t) {
    if (t.length < 4)
      throw new Error("Current source requires at least 4 tokens: I<name> <node+> <node-> <source>");
    const e = t[0], s = [t[1], t[2]];
    let i = t.slice(3).join(" ");
    const n = {}, o = new x(e, s, i, n);
    return this.components.push(o), o;
  }
  /**
   * 解析壓控電壓源 (VCVS)
   * 格式: E<name> <out+> <out-> <in+> <in-> <gain>
   */
  parseVCVS(t) {
    if (t.length < 6)
      throw new Error("VCVS requires 6 tokens: E<name> <out+> <out-> <in+> <in-> <gain>");
    const e = t[0], s = [t[1], t[2]], i = [t[3], t[4]], n = parseFloat(t[5]), o = new b(e, s, i, n);
    this.components.push(o);
  }
  /**
   * 解析壓控電流源 (VCCS)
   * 格式: G<name> <out+> <out-> <in+> <in-> <transconductance>
   */
  parseVCCS(t) {
    if (t.length < 6)
      throw new Error("VCCS requires 6 tokens: G<name> <out+> <out-> <in+> <in-> <gm>");
    const e = t[0], s = [t[1], t[2]], i = [t[3], t[4]], n = parseFloat(t[5]), o = new T(e, s, i, n);
    this.components.push(o);
  }
  /**
   * 解析指令 (以 . 開頭的行)
   * @param {string[]} tokens 標記陣列
   */
  parseDirective(t) {
    const e = t[0].toLowerCase();
    switch (e) {
      case ".tran":
        this.parseTranDirective(t);
        break;
      case ".dc":
        this.parseDCDirective(t);
        break;
      case ".param":
        this.parseParamDirective(t);
        break;
      case ".model":
        this.parseModelDirective(t);
        break;
      case ".options":
        this.parseOptionsDirective(t);
        break;
      case ".end":
        break;
      case ".title":
        break;
      default:
        console.warn(`Unknown directive: ${e}`);
    }
  }
  /**
   * 解析 .TRAN 指令
   * 格式: .TRAN <tstep> <tstop> [tstart] [tmax]
   */
  parseTranDirective(t) {
    if (t.length < 3)
      throw new Error(".TRAN requires at least 2 parameters: .TRAN <tstep> <tstop>");
    const e = {
      type: "TRAN",
      tstep: t[1],
      tstop: t[2],
      tstart: t[3] || "0",
      tmax: t[4] || t[1]
    };
    this.analyses.push(e);
  }
  /**
   * 解析 .DC 指令
   */
  parseDCDirective(t) {
    const e = {
      type: "DC",
      parameters: t.slice(1)
    };
    this.analyses.push(e);
  }
  /**
   * 解析 .PARAM 指令
   */
  parseParamDirective(t) {
    for (let e = 1; e < t.length; e++) {
      const s = t[e], i = s.indexOf("=");
      if (i > 0) {
        const n = s.substring(0, i), o = s.substring(i + 1);
        this.parameters.set(n, o);
      }
    }
  }
  /**
   * 解析 .MODEL 指令
   */
  parseModelDirective(t) {
    if (t.length < 3)
      throw new Error(".MODEL requires at least 2 parameters: .MODEL <name> <type>");
    const e = t[1], s = t[2], i = this.parseParameters(t.slice(3));
    this.models.set(e, {
      type: s,
      parameters: i
    });
  }
  /**
   * 解析 .OPTIONS 指令
   */
  parseOptionsDirective(t) {
    for (let e = 1; e < t.length; e++) {
      const s = t[e], i = s.indexOf("=");
      if (i > 0) {
        const n = s.substring(0, i), o = s.substring(i + 1);
        this.options.set(n.toLowerCase(), o);
      } else
        this.options.set(s.toLowerCase(), !0);
    }
  }
  /**
   * 解析參數列表 (key=value 格式)
   * @param {string[]} tokens 參數標記
   * @returns {Object} 參數對象
   */
  parseParameters(t) {
    const e = {};
    for (const s of t) {
      const i = s.indexOf("=");
      if (i > 0) {
        const n = s.substring(0, i).toLowerCase(), o = s.substring(i + 1), r = o.trim();
        if (/^[-+]?[0-9]*\.?[0-9]+([eE][-+]?[0-9]+)?$/.test(r)) {
          const a = parseFloat(r);
          e[n] = isNaN(a) ? o : a;
        } else
          e[n] = o;
      }
    }
    return e;
  }
  /**
   * 獲取解析統計信息
   * @returns {Object} 統計信息
   */
  getStats() {
    return {
      ...this.stats,
      componentCount: this.components.length,
      modelCount: this.models.size,
      parameterCount: this.parameters.size,
      analysisCount: this.analyses.length
    };
  }
  /**
   * 解析工程記號值的助手方法
   * @param {string|number} value 要解析的值
   * @returns {number} 解析後的數值
   */
  parseValue(t) {
    if (typeof t == "number") return t;
    if (typeof t != "string") return null;
    const e = t.toString().trim().toLowerCase(), s = parseFloat(e);
    if (isNaN(s)) return null;
    switch (e.slice(s.toString().length)) {
      case "p":
      case "pico":
        return s * 1e-12;
      case "n":
      case "nano":
        return s * 1e-9;
      case "u":
      case "μ":
      case "micro":
        return s * 1e-6;
      case "m":
      case "milli":
        return s * 1e-3;
      case "k":
      case "kilo":
        return s * 1e3;
      case "meg":
      case "mega":
        return s * 1e6;
      case "g":
      case "giga":
        return s * 1e9;
      case "t":
      case "tera":
        return s * 1e12;
      case "":
        return s;
      default:
        return s;
    }
  }
  /**
   * 打印解析報告
   */
  printReport() {
    console.log("\\n=== Netlist Parsing Report ==="), console.log(`Total lines: ${this.stats.totalLines}`), console.log(`Parsed lines: ${this.stats.parsedLines}`), console.log(`Skipped lines: ${this.stats.skippedLines}`), console.log(`Errors: ${this.stats.errors.length}`), console.log(`\\nComponents: ${this.components.length}`);
    const t = {};
    for (const e of this.components)
      t[e.type] = (t[e.type] || 0) + 1;
    for (const [e, s] of Object.entries(t))
      console.log(`  ${e}: ${s}`);
    if (this.analyses.length > 0) {
      console.log(`\\nAnalyses: ${this.analyses.length}`);
      for (const e of this.analyses)
        console.log(`  ${e.type}`);
    }
    if (this.stats.errors.length > 0) {
      console.log("\\nErrors:");
      for (const e of this.stats.errors)
        console.log(`  Line ${e.line}: ${e.error}`), console.log(`    "${e.content}"`);
    }
    console.log("==============================\\n");
  }
}
class p {
  /**
   * @param {number} rows 矩陣行數
   * @param {number} cols 矩陣列數
   * @param {number[][]} data 可選的初始數據
   */
  constructor(t, e, s = null) {
    this.rows = t, this.cols = e, s ? this.data = s : this.data = Array(t).fill().map(() => Array(e).fill(0));
  }
  /**
   * 獲取元素值
   * @param {number} i 行索引 (0-based)
   * @param {number} j 列索引 (0-based)
   * @returns {number}
   */
  get(t, e) {
    if (t < 0 || t >= this.rows || e < 0 || e >= this.cols)
      throw new Error(`Matrix index out of bounds: (${t}, ${e})`);
    return this.data[t][e];
  }
  /**
   * 設置元素值
   * @param {number} i 行索引
   * @param {number} j 列索引
   * @param {number} value 要設置的值
   */
  set(t, e, s) {
    if (t < 0 || t >= this.rows || e < 0 || e >= this.cols)
      throw new Error(`Matrix index out of bounds: (${t}, ${e})`);
    this.data[t][e] = s;
  }
  /**
   * 累加元素值 (常用於組裝MNA矩陣)
   * @param {number} i 行索引
   * @param {number} j 列索引
   * @param {number} value 要累加的值
   */
  addAt(t, e, s) {
    this.data[t][e] += s;
  }
  /**
   * 創建單位矩陣
   * @param {number} size 矩陣大小
   * @returns {Matrix}
   */
  static identity(t) {
    const e = new p(t, t);
    for (let s = 0; s < t; s++)
      e.set(s, s, 1);
    return e;
  }
  /**
   * 創建零矩陣
   * @param {number} rows 行數
   * @param {number} cols 列數
   * @returns {Matrix}
   */
  static zeros(t, e = t) {
    return new p(t, e);
  }
  /**
   * 矩陣複製
   * @returns {Matrix}
   */
  clone() {
    const t = this.data.map((e) => [...e]);
    return new p(this.rows, this.cols, t);
  }
  /**
   * 檢查矩陣是否為方陣
   * @returns {boolean}
   */
  isSquare() {
    return this.rows === this.cols;
  }
  /**
   * 打印矩陣 (調試用)
   * @param {number} precision 小數點後位數
   */
  print(t = 6) {
    console.log("Matrix:");
    for (let e = 0; e < this.rows; e++) {
      const s = this.data[e].map((i) => i.toFixed(t)).join("  ");
      console.log(`[${s}]`);
    }
  }
}
class m {
  /**
   * @param {number} size 向量大小
   * @param {number[]} data 可選的初始數據
   */
  constructor(t, e = null) {
    this.size = t, this.data = e ? [...e] : Array(t).fill(0);
  }
  /**
   * 獲取元素值
   * @param {number} i 索引
   * @returns {number}
   */
  get(t) {
    if (t < 0 || t >= this.size)
      throw new Error(`Vector index out of bounds: ${t}`);
    return this.data[t];
  }
  /**
   * 設置元素值
   * @param {number} i 索引
   * @param {number} value 值
   */
  set(t, e) {
    if (t < 0 || t >= this.size)
      throw new Error(`Vector index out of bounds: ${t}`);
    this.data[t] = e;
  }
  /**
   * 累加元素值
   * @param {number} i 索引
   * @param {number} value 要累加的值
   */
  addAt(t, e) {
    this.data[t] += e;
  }
  /**
   * 創建零向量
   * @param {number} size 大小
   * @returns {Vector}
   */
  static zeros(t) {
    return new m(t);
  }
  /**
   * 向量複製
   * @returns {Vector}
   */
  clone() {
    return new m(this.size, this.data);
  }
  /**
   * 打印向量 (調試用)
   * @param {number} precision 小數點後位數
   */
  print(t = 6) {
    const e = this.data.map((s) => s.toFixed(t)).join(", ");
    console.log(`Vector: [${e}]`);
  }
}
class g {
  /**
   * 求解線性方程組 Ax = b
   * @param {Matrix} A 係數矩陣 (將被修改)
   * @param {Vector} b 右手邊向量 (將被修改)
   * @returns {Vector} 解向量 x
   */
  static solve(t, e) {
    if (!t.isSquare())
      throw new Error("Matrix A must be square");
    if (t.rows !== e.size)
      throw new Error("Matrix A and vector b dimensions do not match");
    t.rows;
    const s = e.clone(), i = this.luDecomposition(t);
    return this.applyPermutation(s, i), this.forwardSubstitution(t, s), this.backwardSubstitution(t, s), s;
  }
  /**
   * LU分解 (帶部分主元選擇)
   * 在原矩陣上進行分解，L存儲在下三角部分，U存儲在上三角部分
   * @param {Matrix} A 要分解的矩陣 (會被修改)
   * @returns {number[]} 置換向量
   */
  static luDecomposition(t) {
    const e = t.rows, s = Array.from({ length: e }, (i, n) => n);
    for (let i = 0; i < e - 1; i++) {
      let n = i, o = Math.abs(t.get(i, i));
      for (let a = i + 1; a < e; a++) {
        const c = Math.abs(t.get(a, i));
        c > o && (o = c, n = a);
      }
      if (o < 1e-14)
        throw new Error(`Matrix is singular or nearly singular at column ${i}`);
      n !== i && (this.swapRows(t, i, n), [s[i], s[n]] = [s[n], s[i]]);
      const r = t.get(i, i);
      for (let a = i + 1; a < e; a++) {
        const c = t.get(a, i) / r;
        t.set(a, i, c);
        for (let l = i + 1; l < e; l++) {
          const d = t.get(a, l) - c * t.get(i, l);
          t.set(a, l, d);
        }
      }
    }
    if (Math.abs(t.get(e - 1, e - 1)) < 1e-14)
      throw new Error("Matrix is singular or nearly singular");
    return s;
  }
  /**
   * 交換矩陣的兩行
   * @param {Matrix} A 矩陣
   * @param {number} row1 行1
   * @param {number} row2 行2
   */
  static swapRows(t, e, s) {
    if (e !== s)
      for (let i = 0; i < t.cols; i++) {
        const n = t.get(e, i);
        t.set(e, i, t.get(s, i)), t.set(s, i, n);
      }
  }
  /**
   * 應用置換到向量
   * @param {Vector} x 向量 (會被修改)
   * @param {number[]} permutation 置換向量
   */
  static applyPermutation(t, e) {
    const s = Array(t.size);
    for (let i = 0; i < t.size; i++)
      s[i] = t.get(e[i]);
    for (let i = 0; i < t.size; i++)
      t.set(i, s[i]);
  }
  /**
   * 前向替代 - 求解 Ly = b (其中L的對角元素為1)
   * @param {Matrix} LU LU分解後的矩陣
   * @param {Vector} x 向量 (會被修改)
   */
  static forwardSubstitution(t, e) {
    const s = e.size;
    for (let i = 0; i < s; i++) {
      let n = 0;
      for (let o = 0; o < i; o++)
        n += t.get(i, o) * e.get(o);
      e.set(i, e.get(i) - n);
    }
  }
  /**
   * 後向替代 - 求解 Ux = y
   * @param {Matrix} LU LU分解後的矩陣
   * @param {Vector} x 向量 (會被修改)
   */
  static backwardSubstitution(t, e) {
    const s = e.size;
    for (let i = s - 1; i >= 0; i--) {
      let n = 0;
      for (let o = i + 1; o < s; o++)
        n += t.get(i, o) * e.get(o);
      e.set(i, (e.get(i) - n) / t.get(i, i));
    }
  }
  /**
   * 矩陣條件數估算 (用於數值穩定性檢查)
   * @param {Matrix} A 原矩陣
   * @returns {number} 估算的條件數
   */
  static estimateConditionNumber(t) {
    let e = 0, s = 1 / 0;
    for (let i = 0; i < t.rows; i++) {
      const n = Math.abs(t.get(i, i));
      e = Math.max(e, n), s = Math.min(s, n);
    }
    return s > 1e-14 ? e / s : 1 / 0;
  }
}
class V {
  constructor() {
    this.nodeMap = /* @__PURE__ */ new Map(), this.nodeCount = 0, this.voltageSourceMap = /* @__PURE__ */ new Map(), this.voltageSourceCount = 0, this.matrixSize = 0, this.matrix = null, this.rhs = null, this.debugInfo = {
      nodeNames: [],
      voltageSourceNames: [],
      matrixLabels: []
    };
  }
  /**
   * 重置建構器，準備處理新電路
   */
  reset() {
    this.nodeMap.clear(), this.nodeCount = 0, this.voltageSourceMap.clear(), this.voltageSourceCount = 0, this.matrixSize = 0, this.matrix = null, this.rhs = null, this.debugInfo = {
      nodeNames: [],
      voltageSourceNames: [],
      matrixLabels: []
    };
  }
  /**
   * 分析電路並建立節點映射
   * @param {BaseComponent[]} components 電路元件列表
   */
  analyzeCircuit(t) {
    this.reset();
    const e = /* @__PURE__ */ new Set(), s = /* @__PURE__ */ new Set();
    for (const o of t) {
      if (o.nodes)
        for (const r of o.nodes)
          r !== "0" && r !== "gnd" && e.add(r);
      (o.type === "V" || o.needsCurrentVariable()) && s.add(o.name);
    }
    let i = 0;
    for (const o of Array.from(e).sort())
      this.nodeMap.set(o, i), this.debugInfo.nodeNames.push(o), i++;
    this.nodeCount = i;
    let n = 0;
    for (const o of Array.from(s).sort())
      this.voltageSourceMap.set(o, this.nodeCount + n), this.debugInfo.voltageSourceNames.push(o), n++;
    this.voltageSourceCount = n, this.matrixSize = this.nodeCount + this.voltageSourceCount, this.debugInfo.matrixLabels = [
      ...this.debugInfo.nodeNames.map((o) => `V(${o})`),
      ...this.debugInfo.voltageSourceNames.map((o) => `I(${o})`)
    ], console.log(`MNA Analysis: ${this.nodeCount} nodes, ${this.voltageSourceCount} voltage sources, matrix size: ${this.matrixSize}x${this.matrixSize}`);
  }
  /**
   * 建立MNA矩陣
   * @param {BaseComponent[]} components 電路元件列表
   * @param {number} time 當前時間 (用於時變元件)
   * @returns {{matrix: Matrix, rhs: Vector}}
   */
  buildMNAMatrix(t, e = 0) {
    if (this.matrixSize === 0)
      throw new Error("Circuit not analyzed. Call analyzeCircuit() first.");
    this.matrix = p.zeros(this.matrixSize, this.matrixSize), this.rhs = m.zeros(this.matrixSize);
    for (const s of t)
      try {
        this.stampComponent(s, e);
      } catch (i) {
        throw new Error(`Failed to stamp component ${s.name}: ${i.message}`);
      }
    return {
      matrix: this.matrix,
      rhs: this.rhs
    };
  }
  /**
   * 將元件的貢獻添加到MNA矩陣中 (Stamping)
   * @param {BaseComponent} component 電路元件
   * @param {number} time 當前時間
   */
  stampComponent(t, e) {
    switch (t.type) {
      case "R":
        this.stampResistor(t);
        break;
      case "C":
        this.stampCapacitor(t);
        break;
      case "L":
        this.stampInductor(t);
        break;
      case "V":
        this.stampVoltageSource(t, e);
        break;
      case "I":
        this.stampCurrentSource(t, e);
        break;
      case "VCVS":
        this.stampVCVS(t);
        break;
      case "VCCS":
        this.stampVCCS(t);
        break;
      default:
        typeof t.stamp == "function" ? t.stamp(this.matrix, this.rhs, this.nodeMap, this.voltageSourceMap, e) : console.warn(`Unknown component type: ${t.type} (${t.name})`);
    }
  }
  /**
   * 電阻的MNA印記
   * 在節點i和j之間添加電導 G = 1/R
   */
  stampResistor(t) {
    const e = t.nodes, s = 1 / t.value, i = this.getNodeIndex(e[0]), n = this.getNodeIndex(e[1]);
    i >= 0 && (this.matrix.addAt(i, i, s), n >= 0 && this.matrix.addAt(i, n, -s)), n >= 0 && (this.matrix.addAt(n, n, s), i >= 0 && this.matrix.addAt(n, i, -s));
  }
  /**
   * 電容的MNA印記 (用於暫態分析)
   * 使用伴隨模型: i_c(t) = C * dv/dt ≈ C/h * (v(t) - v(t-h)) + i_hist
   * 其中 h 是時間步長
   */
  stampCapacitor(t) {
    if (!t.timeStep)
      return;
    const e = t.nodes, s = t.value, i = t.timeStep, n = s / i, o = this.getNodeIndex(e[0]), r = this.getNodeIndex(e[1]);
    o >= 0 && (this.matrix.addAt(o, o, n), r >= 0 && this.matrix.addAt(o, r, -n)), r >= 0 && (this.matrix.addAt(r, r, n), o >= 0 && this.matrix.addAt(r, o, -n)), t.historyTerm !== void 0 && (o >= 0 && this.rhs.addAt(o, -t.historyTerm), r >= 0 && this.rhs.addAt(r, t.historyTerm));
  }
  /**
   * 電感的MNA印記 (需要電流變數)
   * 使用伴隨模型: v_L(t) = L * di/dt ≈ L/h * (i(t) - i(t-h))
   */
  stampInductor(t) {
    const e = t.nodes, s = t.value, i = this.getNodeIndex(e[0]), n = this.getNodeIndex(e[1]), o = this.voltageSourceMap.get(t.name);
    if (o === void 0)
      throw new Error(`Inductor ${t.name} current variable not found`);
    if (i >= 0 && (this.matrix.addAt(i, o, 1), this.matrix.addAt(o, i, 1)), n >= 0 && (this.matrix.addAt(n, o, -1), this.matrix.addAt(o, n, -1)), t.timeStep) {
      const r = t.timeStep;
      this.matrix.addAt(o, o, -s / r), t.historyTerm !== void 0 && this.rhs.addAt(o, -s / r * t.historyTerm);
    }
  }
  /**
   * 電壓源的MNA印記
   */
  stampVoltageSource(t, e) {
    const s = t.nodes, i = this.getNodeIndex(s[0]), n = this.getNodeIndex(s[1]), o = this.voltageSourceMap.get(t.name);
    if (o === void 0)
      throw new Error(`Voltage source ${t.name} current variable not found`);
    i >= 0 && (this.matrix.addAt(i, o, 1), this.matrix.addAt(o, i, 1)), n >= 0 && (this.matrix.addAt(n, o, -1), this.matrix.addAt(o, n, -1));
    const r = t.getValue(e);
    this.rhs.addAt(o, r);
  }
  /**
   * 電流源的MNA印記
   */
  stampCurrentSource(t, e) {
    const s = t.nodes, i = this.getNodeIndex(s[0]), n = this.getNodeIndex(s[1]), o = t.getValue(e);
    i >= 0 && this.rhs.addAt(i, -o), n >= 0 && this.rhs.addAt(n, o);
  }
  /**
   * 壓控電壓源 (VCVS) 的印記
   * E * V_control = V_output
   */
  stampVCVS(t) {
    const e = [t.nodes[0], t.nodes[1]], s = [t.nodes[2], t.nodes[3]], i = t.value, n = this.getNodeIndex(e[0]), o = this.getNodeIndex(e[1]), r = this.getNodeIndex(s[0]), a = this.getNodeIndex(s[1]), c = this.voltageSourceMap.get(t.name);
    n >= 0 && (this.matrix.addAt(n, c, 1), this.matrix.addAt(c, n, 1)), o >= 0 && (this.matrix.addAt(o, c, -1), this.matrix.addAt(c, o, -1)), r >= 0 && this.matrix.addAt(c, r, -i), a >= 0 && this.matrix.addAt(c, a, i);
  }
  /**
   * 壓控電流源 (VCCS) 的印記  
   * I_output = gm * V_control
   */
  stampVCCS(t) {
    const e = [t.nodes[0], t.nodes[1]], s = [t.nodes[2], t.nodes[3]], i = t.value, n = this.getNodeIndex(e[0]), o = this.getNodeIndex(e[1]), r = this.getNodeIndex(s[0]), a = this.getNodeIndex(s[1]);
    n >= 0 && r >= 0 && this.matrix.addAt(n, r, i), n >= 0 && a >= 0 && this.matrix.addAt(n, a, -i), o >= 0 && r >= 0 && this.matrix.addAt(o, r, -i), o >= 0 && a >= 0 && this.matrix.addAt(o, a, i);
  }
  /**
   * 獲取節點在矩陣中的索引
   * @param {string} nodeName 節點名稱
   * @returns {number} 矩陣索引，如果是接地節點則返回-1
   */
  getNodeIndex(t) {
    if (t === "0" || t === "gnd")
      return -1;
    const e = this.nodeMap.get(t);
    if (e === void 0)
      throw new Error(`Node ${t} not found in circuit`);
    return e;
  }
  /**
   * 從解向量中提取節點電壓
   * @param {Vector} solution MNA求解結果
   * @returns {Map<string, number>} 節點名稱 -> 電壓值的映射
   */
  extractNodeVoltages(t) {
    const e = /* @__PURE__ */ new Map();
    e.set("0", 0), e.set("gnd", 0);
    for (const [s, i] of this.nodeMap)
      e.set(s, t.get(i));
    return e;
  }
  /**
   * 從解向量中提取電壓源電流
   * @param {Vector} solution MNA求解結果
   * @returns {Map<string, number>} 電壓源名稱 -> 電流值的映射
   */
  extractVoltageSourceCurrents(t) {
    const e = /* @__PURE__ */ new Map();
    for (const [s, i] of this.voltageSourceMap)
      e.set(s, t.get(i));
    return e;
  }
  /**
   * 打印MNA矩陣 (調試用)
   * @param {number} precision 小數點位數
   */
  printMNAMatrix(t = 4) {
    console.log(`
=== MNA Matrix ===`);
    const e = "     " + this.debugInfo.matrixLabels.map((s) => s.padStart(12)).join("");
    console.log(e + "     RHS");
    for (let s = 0; s < this.matrixSize; s++) {
      let n = this.debugInfo.matrixLabels[s].padStart(4) + " ";
      for (let o = 0; o < this.matrixSize; o++) {
        const r = this.matrix.get(s, o);
        n += r.toFixed(t).padStart(12);
      }
      n += " | " + this.rhs.get(s).toFixed(t).padStart(10), console.log(n);
    }
    console.log(`==================
`);
  }
  /**
   * 獲取矩陣信息 (用於調試和分析)
   * @returns {Object} 包含矩陣信息的對象
   */
  getMatrixInfo() {
    return {
      nodeCount: this.nodeCount,
      voltageSourceCount: this.voltageSourceCount,
      matrixSize: this.matrixSize,
      nodeNames: [...this.debugInfo.nodeNames],
      voltageSourceNames: [...this.debugInfo.voltageSourceNames],
      matrixLabels: [...this.debugInfo.matrixLabels]
    };
  }
}
class w {
  constructor() {
    this.timeVector = [], this.nodeVoltages = /* @__PURE__ */ new Map(), this.branchCurrents = /* @__PURE__ */ new Map(), this.componentData = /* @__PURE__ */ new Map(), this.analysisInfo = {};
  }
  /**
   * 添加一個時間點的結果
   * @param {number} time 時間點
   * @param {Map<string, number>} voltages 節點電壓
   * @param {Map<string, number>} currents 支路電流
   */
  addTimePoint(t, e, s) {
    this.timeVector.push(t);
    for (const [i, n] of e)
      this.nodeVoltages.has(i) || this.nodeVoltages.set(i, []), this.nodeVoltages.get(i).push(n);
    for (const [i, n] of s)
      this.branchCurrents.has(i) || this.branchCurrents.set(i, []), this.branchCurrents.get(i).push(n);
  }
  /**
   * 獲取時間向量
   * @returns {number[]} 時間點陣列
   */
  getTimeVector() {
    return [...this.timeVector];
  }
  /**
   * 獲取節點電壓向量
   * @param {string} nodeName 節點名稱 (如 'V(1)', '1')
   * @returns {number[]} 電壓值陣列
   */
  getVoltageVector(t) {
    let e = t;
    const s = t.match(/^V\((.+)\)$/);
    return s && (e = s[1]), this.nodeVoltages.get(e) || [];
  }
  /**
   * 獲取支路電流向量
   * @param {string} branchName 支路名稱 (如 'I(V1)', 'V1')
   * @returns {number[]} 電流值陣列
   */
  getCurrentVector(t) {
    let e = t;
    const s = t.match(/^I\((.+)\)$/);
    return s && (e = s[1]), this.branchCurrents.get(e) || [];
  }
  /**
   * 獲取通用向量 (時間、電壓或電流)
   * @param {string} vectorName 向量名稱
   * @returns {number[]} 數值陣列
   */
  getVector(t) {
    if (t.toLowerCase() === "time")
      return this.getTimeVector();
    const e = this.getVoltageVector(t);
    if (e.length > 0)
      return e;
    const s = this.getCurrentVector(t);
    return s.length > 0 ? s : (console.warn(`Vector ${t} not found`), []);
  }
  /**
   * 獲取所有可用的向量名稱
   * @returns {string[]} 向量名稱列表
   */
  getAvailableVectors() {
    const t = ["time"];
    for (const e of this.nodeVoltages.keys())
      t.push(`V(${e})`);
    for (const e of this.branchCurrents.keys())
      t.push(`I(${e})`);
    return t;
  }
  /**
   * 獲取分析統計信息
   * @returns {Object} 統計信息
   */
  getAnalysisInfo() {
    const t = {
      ...this.analysisInfo,
      totalTimePoints: this.timeVector.length,
      startTime: this.timeVector[0] || 0,
      stopTime: this.timeVector[this.timeVector.length - 1] || 0,
      availableVectors: this.getAvailableVectors()
    };
    if (this.timeVector.length > 1) {
      const e = [];
      for (let s = 1; s < this.timeVector.length; s++)
        e.push(this.timeVector[s] - this.timeVector[s - 1]);
      t.averageTimeStep = e.reduce((s, i) => s + i, 0) / e.length, t.minTimeStep = Math.min(...e), t.maxTimeStep = Math.max(...e);
    }
    return t;
  }
}
class M {
  constructor() {
    this.mnaBuilder = new V(), this.components = [], this.result = null, this.timeStep = 1e-6, this.startTime = 0, this.stopTime = 1e-3, this.maxTimeStep = 1e-6, this.minTimeStep = 1e-12, this.maxIterations = 50, this.convergenceTol = 1e-9, this.debug = !1, this.saveHistory = !0, this.progressCallback = null;
  }
  /**
   * 設置分析參數
   * @param {Object} params 參數對象
   */
  setParameters(t) {
    t.timeStep !== void 0 && (this.timeStep = t.timeStep), t.startTime !== void 0 && (this.startTime = t.startTime), t.stopTime !== void 0 && (this.stopTime = t.stopTime), t.maxTimeStep !== void 0 && (this.maxTimeStep = t.maxTimeStep), t.minTimeStep !== void 0 && (this.minTimeStep = t.minTimeStep), t.maxIterations !== void 0 && (this.maxIterations = t.maxIterations), t.convergenceTol !== void 0 && (this.convergenceTol = t.convergenceTol), t.debug !== void 0 && (this.debug = t.debug), t.progressCallback !== void 0 && (this.progressCallback = t.progressCallback);
  }
  /**
   * 執行暫態分析
   * @param {BaseComponent[]} components 電路元件列表
   * @param {Object} params 分析參數
   * @returns {TransientResult} 分析結果
   */
  async run(t, e = {}) {
    this.setParameters(e), this.components = [...t], this.result = new w(), console.log(`Starting transient analysis: ${this.startTime}s to ${this.stopTime}s, step=${this.timeStep}s`);
    try {
      return await this.initialize(), await this.timeLoop(), this.finalize(), console.log(`Transient analysis completed: ${this.result.timeVector.length} time points`), this.result;
    } catch (s) {
      throw console.error("Transient analysis failed:", s), s;
    }
  }
  /**
   * 初始化分析
   */
  /**
   * 初始化暫態分析
   * @param {BaseComponent[]} components 元件列表
   * @param {number} timeStep 時間步長
   */
  async initialize(t = null, e = null) {
    t && (this.components = [...t]), e !== null && (this.timeStep = e), this.mnaBuilder.analyzeCircuit(this.components);
    for (const s of this.components)
      s.initTransient(this.timeStep);
    await this.setInitialConditions(), this.result.analysisInfo = {
      timeStep: this.timeStep,
      startTime: this.startTime,
      stopTime: this.stopTime,
      method: "Backward Euler",
      matrixSize: this.mnaBuilder.matrixSize,
      nodeCount: this.mnaBuilder.nodeCount,
      voltageSourceCount: this.mnaBuilder.voltageSourceCount
    };
  }
  /**
   * 設置初始條件 (執行DC分析)
   */
  async setInitialConditions() {
    this.debug && console.log("Setting initial conditions...");
    const { matrix: t, rhs: e } = this.mnaBuilder.buildMNAMatrix(this.components, 0);
    this.debug && this.mnaBuilder.printMNAMatrix();
    const s = g.solve(t, e), i = this.mnaBuilder.extractNodeVoltages(s), n = this.mnaBuilder.extractVoltageSourceCurrents(s);
    for (const o of this.components)
      o.updateHistory(i, n);
    this.result.addTimePoint(this.startTime, i, n), this.debug && (console.log("Initial conditions set"), this.printSolutionSummary(i, n));
  }
  /**
   * 主時域迴圈
   */
  async timeLoop() {
    let t = this.startTime + this.timeStep, e = 0;
    const s = Math.ceil((this.stopTime - this.startTime) / this.timeStep);
    for (; t <= this.stopTime; ) {
      e++;
      try {
        if (await this.singleTimeStep(t), this.progressCallback) {
          const i = e / s;
          this.progressCallback(i, t, e);
        }
        this.debug && e % 100 === 0 && console.log(`Step ${e}/${s}, time=${(t * 1e6).toFixed(2)}µs`), t += this.timeStep;
      } catch (i) {
        throw console.error(`Time step failed at t=${t}s:`, i), i;
      }
    }
  }
  /**
   * 執行單個時間步
   * @param {number} time 當前時間
   */
  async singleTimeStep(t) {
    for (const r of this.components)
      typeof r.updateCompanionModel == "function" && r.updateCompanionModel();
    const { matrix: e, rhs: s } = this.mnaBuilder.buildMNAMatrix(this.components, t), i = g.solve(e, s), n = this.mnaBuilder.extractNodeVoltages(i), o = this.mnaBuilder.extractVoltageSourceCurrents(i);
    for (const r of this.components)
      r.updateHistory(n, o);
    this.result.addTimePoint(t, n, o);
  }
  /**
   * 完成分析
   */
  finalize() {
    const t = this.result.getAnalysisInfo();
    console.log(`Analysis summary: ${t.totalTimePoints} points, avg step=${(t.averageTimeStep * 1e6).toFixed(2)}µs`), this.mnaBuilder.reset();
  }
  /**
   * 打印解的摘要 (調試用)
   * @param {Map<string, number>} nodeVoltages 節點電壓
   * @param {Map<string, number>} branchCurrents 支路電流
   */
  printSolutionSummary(t, e) {
    console.log("\\nSolution Summary:"), console.log("Node Voltages:");
    for (const [s, i] of t)
      console.log(`  V(${s}) = ${i.toFixed(6)}V`);
    console.log("Branch Currents:");
    for (const [s, i] of e)
      console.log(`  I(${s}) = ${(i * 1e3).toFixed(3)}mA`);
    console.log("");
  }
  /**
   * 設置調試模式
   * @param {boolean} enabled 是否啟用調試
   */
  setDebug(t) {
    this.debug = t;
  }
  /**
   * 獲取當前分析狀態
   * @returns {Object} 狀態信息
   */
  getStatus() {
    return {
      isRunning: this.result !== null,
      currentTime: this.result ? this.result.timeVector[this.result.timeVector.length - 1] : 0,
      progress: this.result ? this.result.timeVector.length / Math.ceil((this.stopTime - this.startTime) / this.timeStep) : 0,
      timePoints: this.result ? this.result.timeVector.length : 0
    };
  }
  /**
   * 執行單一時間步求解 (用於步進式控制)
   * @param {number} currentTime 當前時間
   * @param {number} maxIterations 最大迭代次數
   * @returns {Object} 求解結果
   */
  solveTimeStep(t, e = this.maxIterations) {
    try {
      const { matrix: s, rhs: i } = this.mnaBuilder.buildMNAMatrix(this.components, t), n = g.solve(s, i), o = this.mnaBuilder.extractNodeVoltages(n), r = this.mnaBuilder.extractVoltageSourceCurrents(n), a = !0;
      for (const c of this.components)
        c.updateHistory(o, r);
      return {
        converged: a,
        nodeVoltages: o,
        branchCurrents: r,
        time: t
      };
    } catch (s) {
      throw new Error(`Time step solution failed at t=${t}s: ${s.message}`);
    }
  }
}
class N {
  /**
   * 解析SPICE風格的暫態分析指令
   * @param {string} command 指令字符串 (如 '.tran 1us 1ms')
   * @returns {Object} 解析後的參數
   */
  static parseTranCommand(t) {
    const s = t.trim().toLowerCase().match(/^\.tran\s+([0-9.]+[a-z]*)\s+([0-9.]+[a-z]*)(?:\s+([0-9.]+[a-z]*))?(?:\s+([0-9.]+[a-z]*))?/);
    if (!s)
      throw new Error(`Invalid .tran command: ${t}`);
    return {
      timeStep: this.parseTimeValue(s[1]),
      stopTime: this.parseTimeValue(s[2]),
      startTime: s[3] ? this.parseTimeValue(s[3]) : 0,
      maxTimeStep: s[4] ? this.parseTimeValue(s[4]) : void 0
    };
  }
  /**
   * 解析時間值 (支援工程記號)
   * @param {string} timeStr 時間字符串 (如 '1us', '2.5ms')
   * @returns {number} 時間值 (秒)
   */
  static parseTimeValue(t) {
    const e = t.trim().toLowerCase(), s = {
      fs: 1e-15,
      ps: 1e-12,
      ns: 1e-9,
      us: 1e-6,
      µs: 1e-6,
      ms: 1e-3,
      s: 1
    };
    for (const [n, o] of Object.entries(s))
      if (e.endsWith(n)) {
        const r = parseFloat(e.slice(0, -n.length));
        if (!isNaN(r))
          return r * o;
      }
    const i = parseFloat(e);
    if (!isNaN(i))
      return i;
    throw new Error(`Cannot parse time value: ${t}`);
  }
  /**
   * 格式化時間值為可讀字符串
   * @param {number} time 時間值 (秒)
   * @returns {string} 格式化的字符串
   */
  static formatTime(t) {
    const e = Math.abs(t);
    return e >= 1 ? `${t.toFixed(3)}s` : e >= 1e-3 ? `${(t * 1e3).toFixed(3)}ms` : e >= 1e-6 ? `${(t * 1e6).toFixed(3)}µs` : e >= 1e-9 ? `${(t * 1e9).toFixed(3)}ns` : `${(t * 1e12).toFixed(3)}ps`;
  }
}
class R {
  constructor() {
    this.nodeVoltages = /* @__PURE__ */ new Map(), this.branchCurrents = /* @__PURE__ */ new Map(), this.componentPower = /* @__PURE__ */ new Map(), this.totalPower = 0, this.analysisInfo = {}, this.converged = !1;
  }
  /**
   * 獲取節點電壓
   * @param {string} nodeName 節點名稱
   * @returns {number} 電壓值
   */
  getNodeVoltage(t) {
    return this.nodeVoltages.get(t) || 0;
  }
  /**
   * 獲取支路電流
   * @param {string} branchName 支路名稱
   * @returns {number} 電流值
   */
  getBranchCurrent(t) {
    return this.branchCurrents.get(t) || 0;
  }
  /**
   * 計算元件功耗
   * @param {BaseComponent[]} components 元件列表
   */
  calculatePower(t) {
    this.totalPower = 0;
    for (const e of t) {
      let s = 0;
      if (e.type === "R") {
        const i = e.getVoltage(this.nodeVoltages);
        s = i * i / e.getResistance();
      } else if (e.type === "V") {
        const i = e.getValue(), n = this.getBranchCurrent(e.name);
        s = -i * n;
      } else if (e.type === "I") {
        const i = e.getVoltage(this.nodeVoltages), n = e.getValue();
        s = -i * n;
      }
      this.componentPower.set(e.name, s), this.totalPower += Math.abs(s);
    }
  }
  /**
   * 獲取分析摘要
   * @returns {Object} 摘要信息
   */
  getSummary() {
    const t = this.nodeVoltages.size, e = this.branchCurrents.size;
    return {
      ...this.analysisInfo,
      converged: this.converged,
      nodeCount: t,
      branchCount: e,
      totalPower: this.totalPower,
      nodes: Array.from(this.nodeVoltages.keys()),
      branches: Array.from(this.branchCurrents.keys())
    };
  }
}
class E {
  constructor() {
    this.mnaBuilder = new V(), this.debug = !1;
  }
  /**
   * 執行DC分析
   * @param {BaseComponent[]} components 電路元件列表
   * @param {Object} options 分析選項
   * @returns {DCResult} DC分析結果
   */
  async run(t, e = {}) {
    this.debug = e.debug || !1;
    const s = new R();
    try {
      this.debug && console.log("Starting DC analysis..."), this.mnaBuilder.analyzeCircuit(t);
      const { matrix: i, rhs: n } = this.mnaBuilder.buildMNAMatrix(t, 0);
      this.debug && (console.log("MNA Matrix built"), this.mnaBuilder.printMNAMatrix());
      const o = g.solve(i, n);
      return s.nodeVoltages = this.mnaBuilder.extractNodeVoltages(o), s.branchCurrents = this.mnaBuilder.extractVoltageSourceCurrents(o), s.converged = !0, s.calculatePower(t), s.analysisInfo = {
        method: "Modified Nodal Analysis",
        matrixSize: this.mnaBuilder.matrixSize,
        nodeCount: this.mnaBuilder.nodeCount,
        voltageSourceCount: this.mnaBuilder.voltageSourceCount,
        matrixCondition: this.estimateCondition(i)
      }, this.debug && this.printResults(s), s;
    } catch (i) {
      return console.error("DC analysis failed:", i), s.converged = !1, s.analysisInfo.error = i.message, s;
    }
  }
  /**
   * 估算矩陣條件數
   * @param {Matrix} matrix MNA矩陣
   * @returns {number} 條件數估計值
   */
  estimateCondition(t) {
    try {
      return g.estimateConditionNumber(t);
    } catch {
      return 1 / 0;
    }
  }
  /**
   * 打印DC分析結果
   * @param {DCResult} result DC分析結果
   */
  printResults(t) {
    console.log("\\n=== DC Analysis Results ==="), console.log("\\nNode Voltages:");
    for (const [n, o] of t.nodeVoltages)
      Math.abs(o) < 1e-12 ? console.log(`  V(${n}) = 0V`) : Math.abs(o) >= 1e3 ? console.log(`  V(${n}) = ${(o / 1e3).toFixed(3)}kV`) : Math.abs(o) >= 1 ? console.log(`  V(${n}) = ${o.toFixed(6)}V`) : Math.abs(o) >= 1e-3 ? console.log(`  V(${n}) = ${(o * 1e3).toFixed(3)}mV`) : Math.abs(o) >= 1e-6 ? console.log(`  V(${n}) = ${(o * 1e6).toFixed(3)}µV`) : console.log(`  V(${n}) = ${o.toExponential(3)}V`);
    console.log("\\nBranch Currents:");
    for (const [n, o] of t.branchCurrents)
      Math.abs(o) < 1e-12 ? console.log(`  I(${n}) = 0A`) : Math.abs(o) >= 1 ? console.log(`  I(${n}) = ${o.toFixed(6)}A`) : Math.abs(o) >= 1e-3 ? console.log(`  I(${n}) = ${(o * 1e3).toFixed(3)}mA`) : Math.abs(o) >= 1e-6 ? console.log(`  I(${n}) = ${(o * 1e6).toFixed(3)}µA`) : Math.abs(o) >= 1e-9 ? console.log(`  I(${n}) = ${(o * 1e9).toFixed(3)}nA`) : console.log(`  I(${n}) = ${o.toExponential(3)}A`);
    console.log("\\nComponent Power:");
    let e = 0, s = 0;
    for (const [n, o] of t.componentPower)
      o < 0 ? (e += Math.abs(o), console.log(`  P(${n}) = ${Math.abs(o).toFixed(6)}W (supplied)`)) : o > 1e-12 && (s += o, console.log(`  P(${n}) = ${o.toFixed(6)}W (dissipated)`));
    console.log("\\nPower Balance:"), console.log(`  Total Supplied: ${e.toFixed(6)}W`), console.log(`  Total Dissipated: ${s.toFixed(6)}W`), console.log(`  Balance Error: ${Math.abs(e - s).toFixed(9)}W`);
    const i = t.getSummary();
    console.log(`\\nMatrix Info: ${i.matrixSize}×${i.matrixSize}, condition ≈ ${i.matrixCondition.toExponential(2)}`), console.log("===========================\\n");
  }
  /**
   * 設置調試模式
   * @param {boolean} enabled 是否啟用調試
   */
  setDebug(t) {
    this.debug = t;
  }
}
class P {
  constructor(t = null) {
    this.parser = new I(), this.transientAnalysis = new M(), this.dcAnalysis = new E(), this.components = [], this.models = /* @__PURE__ */ new Map(), this.parameters = /* @__PURE__ */ new Map(), this.analyses = [], this.options = /* @__PURE__ */ new Map(), this.results = /* @__PURE__ */ new Map(), this.lastResult = null, this.isInitialized = !1, this.debug = !1, t && this.loadNetlist(t);
  }
  /**
   * 載入並解析網表
   * @param {string} netlistText 網表文本
   * @returns {Object} 解析結果統計
   */
  loadNetlist(t) {
    console.log("Loading netlist...");
    try {
      const e = this.parser.parse(t);
      return this.components = e.components, this.models = e.models, this.parameters = e.parameters, this.analyses = e.analyses, this.options = e.options, this.isInitialized = !0, this.debug && this.parser.printReport(), console.log(`Netlist loaded: ${this.components.length} components`), e.stats;
    } catch (e) {
      throw console.error("Failed to load netlist:", e), e;
    }
  }
  /**
   * 執行分析 (批次模式 API)
   * @param {string} analysisCommand 分析指令 (如 '.tran 1us 1ms')
   * @returns {Object} 分析結果
   */
  async runAnalysis(t = null) {
    if (!this.isInitialized)
      throw new Error("No netlist loaded. Call loadNetlist() first.");
    if (t) {
      const e = t.trim().toLowerCase();
      if (e.startsWith(".tran"))
        return await this.runTransientAnalysis(t);
      if (e.startsWith(".dc") || e.startsWith(".op"))
        return await this.runDCAnalysis();
      throw new Error(`Unsupported analysis command: ${t}`);
    }
    if (this.analyses.length > 0) {
      const e = this.analyses[0];
      if (e.type === "TRAN") {
        const s = `.tran ${e.tstep} ${e.tstop} ${e.tstart || "0"} ${e.tmax || e.tstep}`;
        return await this.runTransientAnalysis(s);
      } else if (e.type === "DC")
        return await this.runDCAnalysis();
    }
    return console.log("No analysis specified, running DC analysis"), await this.runDCAnalysis();
  }
  /**
   * 執行暫態分析
   * @param {string} tranCommand 暫態分析指令
   * @returns {Object} 暫態分析結果
   */
  async runTransientAnalysis(t) {
    console.log(`Running transient analysis: ${t}`);
    try {
      const e = N.parseTranCommand(t);
      e.debug = this.debug;
      const s = await this.transientAnalysis.run(this.components, e);
      return this.results.set("tran", s), this.lastResult = s, console.log(`Transient analysis completed: ${s.timeVector.length} time points`), s;
    } catch (e) {
      throw console.error("Transient analysis failed:", e), e;
    }
  }
  /**
   * 執行DC分析
   * @returns {Object} DC分析結果
   */
  async runDCAnalysis() {
    console.log("Running DC analysis...");
    try {
      const t = { debug: this.debug }, e = await this.dcAnalysis.run(this.components, t);
      return this.results.set("dc", e), this.lastResult = e, console.log("DC analysis completed"), e;
    } catch (t) {
      throw console.error("DC analysis failed:", t), t;
    }
  }
  /**
   * 獲取分析結果
   * @param {string} analysisType 分析類型 ('tran', 'dc')
   * @returns {Object} 分析結果
   */
  getResult(t = null) {
    return t ? this.results.get(t) : this.lastResult;
  }
  /**
   * 獲取電路信息
   * @returns {Object} 電路信息
   */
  getCircuitInfo() {
    return {
      componentCount: this.components.length,
      components: this.components.map((t) => ({
        name: t.name,
        type: t.type,
        nodes: t.nodes,
        value: t.value
      })),
      nodeList: this.getNodeList(),
      modelCount: this.models.size,
      parameterCount: this.parameters.size,
      analysisCount: this.analyses.length,
      isInitialized: this.isInitialized
    };
  }
  /**
   * 獲取所有節點列表
   * @returns {string[]} 節點名稱列表
   */
  getNodeList() {
    const t = /* @__PURE__ */ new Set();
    for (const e of this.components)
      if (e.nodes)
        for (const s of e.nodes)
          t.add(s);
    return Array.from(t).sort();
  }
  /**
   * 設置調試模式
   * @param {boolean} enabled 是否啟用調試
   */
  setDebug(t) {
    this.debug = t, this.transientAnalysis.setDebug(t), this.dcAnalysis.setDebug(t);
  }
  /**
   * 驗證電路
   * @returns {Object} 驗證結果
   */
  validateCircuit() {
    const t = [], e = [];
    if (this.components.length === 0)
      return t.push("No components found in circuit"), { valid: !1, issues: t, warnings: e };
    for (const o of this.components) {
      o.isValid() || t.push(`Invalid component: ${o.name}`);
      for (const r of o.nodes)
        (!r || typeof r != "string") && t.push(`Invalid node in component ${o.name}: ${r}`);
      o.value === 0 && (o.type === "R" || o.type === "L" || o.type === "C") && e.push(`Zero value in ${o.name} may cause numerical issues`);
    }
    const s = this.getNodeList();
    s.includes("0") || s.includes("gnd") || s.includes("GND") || e.push("No ground node (0 or gnd) found - circuit may be floating");
    const n = /* @__PURE__ */ new Map();
    for (const o of this.components)
      for (const r of o.nodes)
        n.set(r, (n.get(r) || 0) + 1);
    for (const [o, r] of n)
      r === 1 && o !== "0" && o !== "gnd" && e.push(`Node ${o} has only one connection`);
    return {
      valid: t.length === 0,
      issues: t,
      warnings: e,
      componentCount: this.components.length,
      nodeCount: s.length
    };
  }
  /**
   * 打印電路摘要
   */
  printCircuitSummary() {
    console.log("\\n=== Circuit Summary ===");
    const t = this.getCircuitInfo();
    console.log(`Components: ${t.componentCount}`), console.log(`Nodes: ${t.nodeList.length}`), console.log(`Models: ${t.modelCount}`), console.log(`Parameters: ${t.parameterCount}`);
    const e = {};
    for (const i of this.components)
      e[i.type] = (e[i.type] || 0) + 1;
    console.log("\\nComponent breakdown:");
    for (const [i, n] of Object.entries(e))
      console.log(`  ${i}: ${n}`);
    console.log("\\nNodes:", t.nodeList.join(", "));
    const s = this.validateCircuit();
    console.log(`\\nValidation: ${s.valid ? "PASSED" : "FAILED"}`), s.issues.length > 0 && (console.log("Issues:"), s.issues.forEach((i) => console.log(`  - ${i}`))), s.warnings.length > 0 && (console.log("Warnings:"), s.warnings.forEach((i) => console.log(`  - ${i}`))), console.log("=======================\\n");
  }
  /**
   * 重置求解器
   */
  reset() {
    this.components = [], this.models.clear(), this.parameters.clear(), this.analyses = [], this.options.clear(), this.results.clear(), this.lastResult = null, this.isInitialized = !1, this.parser.reset();
  }
  // ==================== 步進式模擬控制 API ====================
  /**
   * 初始化步進式暫態分析
   * @param {Object} params 參數 {startTime, stopTime, timeStep, maxIterations}
   * @returns {boolean} 初始化是否成功
   */
  async initSteppedTransient(t = {}) {
    try {
      if (!this.isInitialized)
        throw new Error("Circuit not initialized. Load a netlist first.");
      return this.steppedParams = {
        startTime: t.startTime || 0,
        stopTime: t.stopTime || 1e-3,
        // 1ms
        timeStep: t.timeStep || 1e-6,
        // 1μs
        maxIterations: t.maxIterations || 10
      }, this.transientAnalysis.setParameters({
        timeStep: this.steppedParams.timeStep,
        startTime: this.steppedParams.startTime,
        stopTime: this.steppedParams.stopTime,
        maxIterations: this.steppedParams.maxIterations
      }), this.transientAnalysis.result = new w(), await this.transientAnalysis.initialize(this.components, this.steppedParams.timeStep), this.currentTime = this.steppedParams.startTime, this.currentIteration = 0, this.isSteppedMode = !0, this.steppedResults = {
        time: [],
        voltages: [],
        currents: [],
        componentStates: []
      }, console.log("步進式暫態分析初始化完成:"), console.log(`  時間範圍: ${this.steppedParams.startTime}s 到 ${this.steppedParams.stopTime}s`), console.log(`  時間步長: ${this.steppedParams.timeStep}s`), console.log(`  最大迭代數: ${this.steppedParams.maxIterations}`), !0;
    } catch (e) {
      return console.error(`步進式暫態分析初始化失敗: ${e.message}`), !1;
    }
  }
  /**
   * 執行一個時間步
   * @param {Object} controlInputs 控制輸入 {gateName: state, ...}
   * @returns {Object} 當前時間步的結果
   */
  step(t = {}) {
    if (!this.isSteppedMode)
      throw new Error("Step mode not initialized. Call initSteppedTransient() first.");
    if (this.isFinished())
      return console.warn("Simulation already finished"), null;
    try {
      this.updateControlInputs(t);
      const e = this.transientAnalysis.solveTimeStep(
        this.currentTime,
        this.steppedParams.maxIterations
      ), s = Object.fromEntries(e.nodeVoltages), i = Object.fromEntries(e.branchCurrents);
      this.steppedResults.time.push(this.currentTime), this.steppedResults.voltages.push({ ...s }), this.steppedResults.currents.push({ ...i });
      const n = {};
      for (const o of this.components)
        o.getOperatingStatus && (n[o.name] = o.getOperatingStatus());
      return this.steppedResults.componentStates.push(n), this.currentTime += this.steppedParams.timeStep, this.currentIteration++, {
        time: this.currentTime - this.steppedParams.timeStep,
        iteration: this.currentIteration - 1,
        nodeVoltages: Object.fromEntries(e.nodeVoltages),
        branchCurrents: Object.fromEntries(e.branchCurrents),
        componentStates: n,
        converged: e.converged
      };
    } catch (e) {
      throw console.error(`Time step ${this.currentIteration} failed: ${e.message}`), e;
    }
  }
  /**
   * 檢查模擬是否完成
   * @returns {boolean} 是否完成
   */
  isFinished() {
    return this.isSteppedMode && this.currentTime >= this.steppedParams.stopTime;
  }
  /**
   * 獲取當前模擬時間
   * @returns {number} 當前時間 (秒)
   */
  getCurrentTime() {
    return this.currentTime || 0;
  }
  /**
   * 更新控制輸入 (如 MOSFET 閘極狀態)
   * @param {Object} controlInputs 控制輸入映射 {componentName: state, ...}
   */
  updateControlInputs(t) {
    for (const [e, s] of Object.entries(t)) {
      const i = this.components.find((n) => n.name === e);
      i && i.setGateState ? (i.setGateState(s), this.debug && console.log(`Updated ${e} gate state: ${s ? "ON" : "OFF"}`)) : i && i.setValue && i.setValue(s);
    }
  }
  /**
   * 設置特定元件的閘極狀態 (便捷方法)
   * @param {string} componentName 元件名稱
   * @param {boolean} state 閘極狀態
   */
  setGateState(t, e) {
    this.updateControlInputs({ [t]: e });
  }
  /**
   * 獲取節點電壓
   * @param {string} nodeName 節點名稱
   * @returns {number} 電壓值 (V)
   */
  getVoltage(t) {
    return !this.isSteppedMode || this.steppedResults.voltages.length === 0 ? 0 : this.steppedResults.voltages[this.steppedResults.voltages.length - 1][t] || 0;
  }
  /**
   * 獲取支路電流 (通過元件)
   * @param {string} componentName 元件名稱  
   * @returns {number} 電流值 (A)
   */
  getCurrent(t) {
    return !this.isSteppedMode || this.steppedResults.currents.length === 0 ? 0 : this.steppedResults.currents[this.steppedResults.currents.length - 1][t] || 0;
  }
  /**
   * 獲取元件工作狀態
   * @param {string} componentName 元件名稱
   * @returns {Object} 元件狀態
   */
  getComponentState(t) {
    return !this.isSteppedMode || this.steppedResults.componentStates.length === 0 ? null : this.steppedResults.componentStates[this.steppedResults.componentStates.length - 1][t] || null;
  }
  /**
   * 獲取完整的步進式模擬結果
   * @returns {Object} 完整結果
   */
  getSteppedResults() {
    return this.isSteppedMode ? this.steppedResults : null;
  }
  /**
   * 運行完整的步進式模擬 (帶控制函數)
   * @param {Function} controlFunction 控制函數 (time) => {componentName: state, ...}
   * @param {Object} params 模擬參數
   * @returns {Object} 完整模擬結果
   */
  async runSteppedSimulation(t, e = {}) {
    if (console.log("開始步進式模擬..."), !await this.initSteppedTransient(e))
      throw new Error("Failed to initialize stepped simulation");
    const s = [];
    let i = 0;
    for (; !this.isFinished(); ) {
      const n = t ? t(this.currentTime) : {}, o = this.step(n);
      if (o && (s.push(o), i++, i % 1e3 === 0)) {
        const r = (this.currentTime - this.steppedParams.startTime) / (this.steppedParams.stopTime - this.steppedParams.startTime) * 100;
        console.log(`模擬進度: ${r.toFixed(1)}% (${i} steps)`);
      }
    }
    return console.log(`步進式模擬完成: ${i} 個時間步`), {
      steps: s,
      summary: {
        totalSteps: i,
        simulationTime: this.steppedParams.stopTime - this.steppedParams.startTime,
        timeStep: this.steppedParams.timeStep
      }
    };
  }
  /**
   * 重置步進式模擬狀態
   */
  resetSteppedMode() {
    this.isSteppedMode = !1, this.currentTime = 0, this.currentIteration = 0, this.steppedParams = null, this.steppedResults = null;
  }
  /**
   * 獲取求解器版本信息
   * @returns {Object} 版本信息
   */
  static getVersionInfo() {
    return {
      name: "JSSolver-PE",
      version: "0.1.0",
      description: "JavaScript Solver for Power Electronics",
      features: [
        "Modified Nodal Analysis (MNA)",
        "LU decomposition solver",
        "Backward Euler transient analysis",
        "DC operating point analysis",
        "SPICE-compatible netlist format",
        "Basic passive components (R, L, C)",
        "Independent sources (V, I)",
        "Controlled sources (VCVS, VCCS)",
        "MOSFET with body diode model",
        "Stepped simulation control API"
      ],
      author: "JSSolver-PE Development Team",
      license: "MIT"
    };
  }
}
export {
  u as BaseComponent,
  $ as Capacitor,
  x as CurrentSource,
  E as DCAnalysis,
  v as Inductor,
  P as JSSolverPE,
  C as MOSFET,
  I as NetlistParser,
  y as Resistor,
  M as TransientAnalysis,
  f as VoltageSource,
  P as default
};
//# sourceMappingURL=jssolver-pe.es.js.map
