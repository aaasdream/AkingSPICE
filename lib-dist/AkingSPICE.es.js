class d {
  /**
   * @param {string} name 元件名稱 (如 'R1', 'C2')
   * @param {string} type 元件類型 (如 'R', 'C', 'L', 'V', 'I')
   * @param {string[]} nodes 連接節點列表
   * @param {number|string} value 元件值或表達式
   * @param {Object} params 額外參數
   */
  constructor(t, e, s, i, o = {}) {
    this.name = t, this.type = e, this.nodes = [...s], this.rawValue = i, this.params = { ...o }, this.value = this.parseValue(i), this.timeStep = null, this.previousValues = /* @__PURE__ */ new Map(), this.historyTerm = 0, this.operatingPoint = {
      voltage: 0,
      current: 0,
      power: 0
    }, this.temperature = o.temp || 27, this.isNonlinear = !1;
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
        const o = parseFloat(e.slice(0, -3));
        if (!isNaN(o))
          return o * 1e6;
      }
      for (const [o, n] of Object.entries(s))
        if (e.endsWith(o)) {
          const r = parseFloat(e.slice(0, -o.length));
          if (!isNaN(r))
            return r * n;
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
    const s = t.get(this.nodes[0]) || 0, i = t.get(this.nodes[1]) || 0, o = s - i;
    this.previousValues.set("voltage", o), this.operatingPoint.voltage = o;
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
    return new d(t.name, t.type, t.nodes, t.rawValue, t.params);
  }
}
class y extends d {
  constructor(t, e, s, i, o = {}) {
    if (super(t, e, s, i, o), s.length !== 2)
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
class A extends y {
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
class P extends y {
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
    const s = this.previousValues.get("voltage") || 0, o = this.getCapacitance() * (e - s) / this.timeStep;
    return this.operatingPoint.current = o, o;
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
    this.updateCompanionModel(), this.previousValues.set("voltage", s), this.previousValues.set("current", i), this.operatingPoint.power = s * i;
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
class $ extends y {
  /**
   * @param {string} name 電感名稱 (如 'L1')
   * @param {string[]} nodes 連接節點 [n1, n2]
   * @param {number|string} inductance 電感值 (亨利)
   * @param {Object} params 額外參數
   */
  constructor(t, e, s, i = {}) {
    super(t, "L", e, s, i), this.ic = i.ic || 0, this.resistance = i.r || 0, this.tc1 = i.tc1 || 0, this.tc2 = i.tc2 || 0, this.tnom = i.tnom || 27, this.currentRating = i.current || 1 / 0, this.equivalentResistance = 0, this.historyVoltageSource = 0, this.needsCurrentVar = !0, this.couplings = null, this.updateTemperatureCoefficient();
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
    const e = this.previousValues.get("current") || 0, s = this.getInductance(), i = (t - e) / this.timeStep, o = s * i + this.resistance * t;
    return this.operatingPoint.current = t, this.operatingPoint.voltage = o, o;
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
    this.updateCompanionModel(), this.previousValues.set("current", s), this.previousValues.set("voltage", i), this.operatingPoint.power = i * s;
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
class k {
  /**
   * @param {string} name 耦合電感名稱
   * @param {Inductor} L1 第一個電感
   * @param {Inductor} L2 第二個電感  
   * @param {number} couplingFactor 耦合係數 k (0 < k ≤ 1)
   * @param {Object} params 額外參數
   */
  constructor(t, e, s, i, o = {}) {
    this.name = t, this.type = "K", this.L1 = e, this.L2 = s, this.k = Math.max(0, Math.min(1, i)), this.params = o, this.mutualInductance = this.k * Math.sqrt(e.getInductance() * s.getInductance()), this.dotNodes = o.dotNodes || [e.nodes[0], s.nodes[0]];
  }
  /**
   * 獲取互感值
   * @returns {number} 互感 (亨利)
   */
  getMutualInductance() {
    return this.k * Math.sqrt(this.L1.getInductance() * this.L2.getInductance());
  }
  /**
   * 獲取耦合電感資訊
   * @returns {Object} 詳細信息
   */
  getInfo() {
    return {
      name: this.name,
      type: this.type,
      L1: this.L1.name,
      L2: this.L2.name,
      couplingFactor: this.k,
      mutualInductance: this.getMutualInductance(),
      dotNodes: this.dotNodes,
      L1_inductance: this.L1.getInductance(),
      L2_inductance: this.L2.getInductance()
    };
  }
  toString() {
    const t = this.getMutualInductance();
    return `${this.name}: ${this.L1.name}-${this.L2.name} k=${this.k} M=${(t * 1e6).toFixed(2)}µH`;
  }
}
class m extends d {
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
      const n = parseFloat(s[1]);
      return {
        type: "DC",
        dc: n,
        amplitude: n,
        offset: n
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
    const o = e.match(/^PULSE\(\s*([-\d.]+(?:[eE][-+]?\d+)?)\s+([-\d.]+(?:[eE][-+]?\d+)?)\s*([-\d.]+(?:[eE][-+]?\d+)?)?\s*([-\d.]+(?:[eE][-+]?\d+)?)?\s*([-\d.]+(?:[eE][-+]?\d+)?)?\s*([-\d.]+(?:[eE][-+]?\d+)?)?\s*([-\d.]+(?:[eE][-+]?\d+)?)?\s*\)$/);
    if (o)
      return {
        type: "PULSE",
        v1: parseFloat(o[1]),
        v2: parseFloat(o[2]),
        td: parseFloat(o[3] || "0"),
        // 延遲時間
        tr: parseFloat(o[4] || "1e-9"),
        // 上升時間
        tf: parseFloat(o[5] || "1e-9"),
        // 下降時間
        pw: parseFloat(o[6] || "1e-6"),
        // 脈寬
        per: parseFloat(o[7] || "2e-6")
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
    const { offset: s, amplitude: i, frequency: o, delay: n, damping: r } = e;
    if (t < n)
      return s;
    const a = t - n, h = 2 * Math.PI * o, c = r > 0 ? Math.exp(-r * a) : 1;
    return s + i * Math.sin(h * a) * c;
  }
  /**
   * 計算脈衝波值
   */
  getPulseValue(t, e) {
    const { v1: s, v2: i, td: o, tr: n, tf: r, pw: a, per: h } = e;
    if (t < o)
      return s;
    const c = (t - o) % h;
    if (c <= n)
      return s + (i - s) * (c / n);
    if (c <= n + a)
      return i;
    if (c <= n + a + r) {
      const l = c - n - a;
      return i - (i - s) * (l / r);
    } else
      return s;
  }
  /**
   * 計算指數波值 (用於EXP源)
   */
  getExpValue(t, e) {
    const { v1: s, v2: i, td1: o, tau1: n, td2: r, tau2: a } = e;
    if (t < o)
      return s;
    if (t < r) {
      const h = t - o;
      return s + (i - s) * (1 - Math.exp(-h / n));
    } else {
      const h = r - o, c = t - r, l = s + (i - s) * (1 - Math.exp(-h / n));
      return l + (s - l) * (1 - Math.exp(-c / a));
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
      const [o, n] = s[i], [r, a] = s[i + 1];
      if (t >= o && t <= r)
        return n + (a - n) * (t - o) / (r - o);
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
  /**
   * 動態設置電壓值（用於控制系統）
   * @param {number} newValue 新的電壓值
   */
  setValue(t) {
    this.value = t, this.sourceConfig.type === "DC" && (this.sourceConfig.dc = t, this.sourceConfig.amplitude = t, this.sourceConfig.offset = t);
  }
}
class F extends d {
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
    return new m("temp", ["1", "0"], t).sourceConfig;
  }
  /**
   * 獲取指定時間的電流值
   * @param {number} time 時間 (秒)
   * @returns {number} 電流值 (安培)
   */
  getValue(t = 0) {
    const e = new m("temp", ["1", "0"], this.sourceConfig);
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
class O extends d {
  /**
   * @param {string} name VCVS名稱 (如 'E1')
   * @param {string[]} outputNodes 輸出節點 [正, 負]
   * @param {string[]} controlNodes 控制節點 [正, 負]
   * @param {number} gain 電壓增益
   * @param {Object} params 額外參數
   */
  constructor(t, e, s, i, o = {}) {
    const n = [...e, ...s];
    super(t, "VCVS", n, i, o), this.outputNodes = [...e], this.controlNodes = [...s], this.gain = i;
  }
  needsCurrentVariable() {
    return !0;
  }
  toString() {
    return `${this.name}: ${this.outputNodes[0]}-${this.outputNodes[1]} = ${this.gain} * (${this.controlNodes[0]}-${this.controlNodes[1]})`;
  }
}
class L extends d {
  /**
   * @param {string} name VCCS名稱 (如 'G1')
   * @param {string[]} outputNodes 輸出節點 [流出, 流入]
   * @param {string[]} controlNodes 控制節點 [正, 負]
   * @param {number} transconductance 跨導 (S)
   * @param {Object} params 額外參數
   */
  constructor(t, e, s, i, o = {}) {
    const n = [...e, ...s];
    super(t, "VCCS", n, i, o), this.outputNodes = [...e], this.controlNodes = [...s], this.transconductance = i;
  }
  needsCurrentVariable() {
    return !1;
  }
  toString() {
    return `${this.name}: I(${this.outputNodes[0]}→${this.outputNodes[1]}) = ${this.transconductance} * V(${this.controlNodes[0]}-${this.controlNodes[1]})`;
  }
}
class v extends d {
  /**
   * @param {string} name CCCS名稱 (如 'F1')
   * @param {string[]} outputNodes 輸出節點 [流出, 流入]
   * @param {string} controlElement 控制元件名稱（通過其電流來控制）
   * @param {number} currentGain 電流增益（無單位）
   * @param {Object} params 額外參數
   */
  constructor(t, e, s, i, o = {}) {
    if (super(t, "CCCS", e, i, o), e.length !== 2)
      throw new Error(`CCCS ${t} must have exactly 2 output nodes`);
    this.outputNodes = [...e], this.controlElement = s, this.currentGain = i, this.controlCurrent = 0;
  }
  /**
   * 設定控制電流（由解算器在每個時間步調用）
   * @param {number} current 控制元件的電流
   */
  setControlCurrent(t) {
    this.controlCurrent = t;
  }
  /**
   * 獲取輸出電流
   * @returns {number} 輸出電流 = F × I_control
   */
  getOutputCurrent() {
    return this.currentGain * this.controlCurrent;
  }
  /**
   * 為 MNA 分析提供印花支援
   * CCCS 需要在控制元件電流確定後才能計算
   */
  stamp(t, e, s, i, o) {
    const n = this.getOutputCurrent(), r = this.outputNodes[0] === "0" ? -1 : s.get(this.outputNodes[0]), a = this.outputNodes[1] === "0" ? -1 : s.get(this.outputNodes[1]);
    r >= 0 && e.addAt(r, -n), a >= 0 && e.addAt(a, n);
  }
  needsCurrentVariable() {
    return !1;
  }
  toString() {
    return `${this.name}: I(${this.outputNodes[0]}→${this.outputNodes[1]}) = ${this.currentGain} * I(${this.controlElement})`;
  }
  clone() {
    return new v(this.name, [...this.outputNodes], this.controlElement, this.currentGain, { ...this.params });
  }
}
class b extends d {
  /**
   * @param {string} name CCVS名稱 (如 'H1')
   * @param {string[]} outputNodes 輸出節點 [正, 負]
   * @param {string} controlElement 控制元件名稱（通過其電流來控制）
   * @param {number} transresistance 轉移阻抗 (Ω)
   * @param {Object} params 額外參數
   */
  constructor(t, e, s, i, o = {}) {
    if (super(t, "CCVS", e, i, o), e.length !== 2)
      throw new Error(`CCVS ${t} must have exactly 2 output nodes`);
    this.outputNodes = [...e], this.controlElement = s, this.transresistance = i, this.controlCurrent = 0;
  }
  /**
   * 設定控制電流（由解算器在每個時間步調用）
   * @param {number} current 控制元件的電流
   */
  setControlCurrent(t) {
    this.controlCurrent = t;
  }
  /**
   * 獲取輸出電壓
   * @returns {number} 輸出電壓 = H × I_control
   */
  getOutputVoltage() {
    return this.transresistance * this.controlCurrent;
  }
  /**
   * 為 MNA 分析提供印花支援
   * CCVS 作為電壓源需要額外的電流變數
   */
  stamp(t, e, s, i, o) {
    const n = this.getOutputVoltage(), r = this.outputNodes[0] === "0" ? -1 : s.get(this.outputNodes[0]), a = this.outputNodes[1] === "0" ? -1 : s.get(this.outputNodes[1]), h = i.get(this.name);
    if (h === void 0)
      throw new Error(`CCVS ${this.name}: Current variable not found in voltage source map`);
    t.rows, r >= 0 && (t.addAt(h, r, 1), t.addAt(r, h, 1)), a >= 0 && (t.addAt(h, a, -1), t.addAt(a, h, -1)), e.setAt(h, n);
  }
  needsCurrentVariable() {
    return !0;
  }
  toString() {
    return `${this.name}: V(${this.outputNodes[0]}-${this.outputNodes[1]}) = ${this.transresistance} * I(${this.controlElement})`;
  }
  clone() {
    return new b(this.name, [...this.outputNodes], this.controlElement, this.transresistance, { ...this.params });
  }
}
class w extends d {
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
  stamp(t, e, s, i, o) {
    const n = this.drain === "0" || this.drain === "gnd" ? -1 : s.get(this.drain), r = this.source === "0" || this.source === "gnd" ? -1 : s.get(this.source);
    if (n === void 0 || r === void 0)
      throw new Error(`MOSFET ${this.name}: Node mapping not found (drain: ${this.drain}, source: ${this.source})`);
    let a = 0;
    this.drainSourceVoltage !== void 0 && (a = this.drainSourceVoltage);
    const c = 1 / this.getEquivalentResistance(a);
    n >= 0 && (t.addAt(n, n, c), r >= 0 && t.addAt(n, r, -c)), r >= 0 && (t.addAt(r, r, c), n >= 0 && t.addAt(r, n, -c));
  }
  /**
   * 更新元件狀態 (在每個時間步後調用)
   * @param {number} vds Drain-Source 電壓
   * @param {number} ids Drain-Source 電流
   */
  updateState(t, e) {
    this.drainSourceVoltage = t, this.totalCurrent = e;
    const s = this.getMOSFETResistance(), i = this.getBodyDiodeResistance(t), o = this.getEquivalentResistance(t);
    this.mosfetCurrent = e * (o / s), this.diodeCurrent = e * (o / i);
  }
  /**
   * 計算通過MOSFET的總電流
   * @param {Map<string, number>} nodeVoltages 節點電壓
   * @returns {number} 總電流 (安培)，正值表示從drain流向source
   */
  getCurrent(t) {
    const e = this.getVoltage(t);
    this.drainSourceVoltage = e;
    const s = this.getEquivalentResistance(e), i = e / s;
    return this.totalCurrent = i, this.operatingPoint.current = i, i;
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
    const t = new w(this.name, this.nodes, {
      Ron: this.Ron,
      Roff: this.Roff,
      Vf_diode: this.Vf_diode,
      Von_diode: this.Von_diode,
      Roff_diode: this.Roff_diode
    });
    return t.setGateState(this.gateState), t;
  }
}
class D {
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
        const o = s[i];
        if (o.length !== 0)
          try {
            this.parseLine(o, i + 1), this.stats.parsedLines++;
          } catch (n) {
            this.stats.errors.push({
              line: i + 1,
              content: o,
              error: n.message
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
      const o = Math.min(
        i.indexOf("$") >= 0 ? i.indexOf("$") : i.length,
        i.indexOf(";") >= 0 ? i.indexOf(";") : i.length
      );
      i = i.substring(0, o).trim(), i.length !== 0 && (i.startsWith("+") ? s += " " + i.substring(1).trim() : (s.length > 0 && e.push(s), s = i));
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
    let o = null;
    try {
      switch (i) {
        case "R":
          o = this.parseResistor(s);
          break;
        case "C":
          o = this.parseCapacitor(s);
          break;
        case "L":
          o = this.parseInductor(s);
          break;
        case "V":
          o = this.parseVoltageSource(s);
          break;
        case "I":
          o = this.parseCurrentSource(s);
          break;
        case "E":
          o = this.parseVCVS(s);
          break;
        case "G":
          o = this.parseVCCS(s);
          break;
        case "M":
          o = this.parseMOSFET(s);
          break;
        case ".":
          this.parseDirective(s);
          break;
        default:
          console.warn(`Unknown component type: ${s[0]} (line ${e})`), this.stats.skippedLines++;
      }
    } catch (n) {
      throw new Error(`Line ${e}: ${n.message}`);
    }
    return o;
  }
  /**
   * 解析電阻
   * 格式: R<name> <node1> <node2> <value> [parameters]
   * @returns {Resistor} 創建的電阻組件
   */
  parseResistor(t) {
    if (t.length < 4)
      throw new Error("Resistor requires at least 4 tokens: R<name> <node1> <node2> <value>");
    const e = t[0], s = [t[1], t[2]], i = t[3], o = this.parseParameters(t.slice(4)), n = new A(e, s, i, o);
    return this.components.push(n), n;
  }
  /**
   * 解析電容
   * 格式: C<name> <node1> <node2> <value> [IC=<initial_voltage>]
   * @returns {Capacitor} 創建的電容組件
   */
  parseCapacitor(t) {
    if (t.length < 4)
      throw new Error("Capacitor requires at least 4 tokens: C<name> <node1> <node2> <value>");
    const e = t[0], s = [t[1], t[2]], i = t[3], o = this.parseParameters(t.slice(4)), n = new P(e, s, i, o);
    return this.components.push(n), n;
  }
  /**
   * 解析電感
   * 格式: L<name> <node1> <node2> <value> [IC=<initial_current>]
   * @returns {Inductor} 創建的電感組件
   */
  parseInductor(t) {
    if (t.length < 4)
      throw new Error("Inductor requires at least 4 tokens: L<name> <node1> <node2> <value>");
    const e = t[0], s = [t[1], t[2]], i = t[3], o = this.parseParameters(t.slice(4)), n = new $(e, s, i, o);
    return this.components.push(n), n;
  }
  /**
   * 解析 MOSFET
   * 格式: M<name> <drain> <source> <gate> [Ron=<value>] [Roff=<value>] [Vf=<value>]
   * @returns {MOSFET} 創建的 MOSFET 組件
   */
  parseMOSFET(t) {
    if (t.length < 4)
      throw new Error("MOSFET requires at least 4 tokens: M<name> <drain> <source> <gate>");
    const e = t[0], s = t[1], i = t[2], o = t[3], n = [s, i, o], r = this.parseParameters(t.slice(4)), a = {
      Ron: r.Ron || r.ron || "1m",
      // 默認 1mΩ
      Roff: r.Roff || r.roff || "1M",
      // 默認 1MΩ  
      Vf_diode: r.Vf || r.vf || r.Vf_diode || "0.7",
      Von_diode: r.Von_diode || r.von_diode || "1m",
      Roff_diode: r.Roff_diode || r.roff_diode || "1M"
    }, h = new w(e, n, a);
    return this.components.push(h), h;
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
    const o = {}, n = new m(e, s, i, o);
    return this.components.push(n), n;
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
    const o = {}, n = new F(e, s, i, o);
    return this.components.push(n), n;
  }
  /**
   * 解析壓控電壓源 (VCVS)
   * 格式: E<name> <out+> <out-> <in+> <in-> <gain>
   */
  parseVCVS(t) {
    if (t.length < 6)
      throw new Error("VCVS requires 6 tokens: E<name> <out+> <out-> <in+> <in-> <gain>");
    const e = t[0], s = [t[1], t[2]], i = [t[3], t[4]], o = parseFloat(t[5]), n = new O(e, s, i, o);
    this.components.push(n);
  }
  /**
   * 解析壓控電流源 (VCCS)
   * 格式: G<name> <out+> <out-> <in+> <in-> <transconductance>
   */
  parseVCCS(t) {
    if (t.length < 6)
      throw new Error("VCCS requires 6 tokens: G<name> <out+> <out-> <in+> <in-> <gm>");
    const e = t[0], s = [t[1], t[2]], i = [t[3], t[4]], o = parseFloat(t[5]), n = new L(e, s, i, o);
    this.components.push(n);
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
        const o = s.substring(0, i), n = s.substring(i + 1);
        this.parameters.set(o, n);
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
        const o = s.substring(0, i), n = s.substring(i + 1);
        this.options.set(o.toLowerCase(), n);
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
        const o = s.substring(0, i).toLowerCase(), n = s.substring(i + 1), r = n.trim();
        if (/^[-+]?[0-9]*\.?[0-9]+([eE][-+]?[0-9]+)?$/.test(r)) {
          const a = parseFloat(r);
          e[o] = isNaN(a) ? n : a;
        } else
          e[o] = n;
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
class g {
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
    const e = new g(t, t);
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
    return new g(t, e);
  }
  /**
   * 矩陣複製
   * @returns {Matrix}
   */
  clone() {
    const t = this.data.map((e) => [...e]);
    return new g(this.rows, this.cols, t);
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
class S {
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
    return new S(t);
  }
  /**
   * 向量複製
   * @returns {Vector}
   */
  clone() {
    return new S(this.size, this.data);
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
class f {
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
    const e = t.rows, s = Array.from({ length: e }, (i, o) => o);
    for (let i = 0; i < e - 1; i++) {
      let o = i, n = Math.abs(t.get(i, i));
      for (let a = i + 1; a < e; a++) {
        const h = Math.abs(t.get(a, i));
        h > n && (n = h, o = a);
      }
      if (n < 1e-14)
        throw new Error(`Matrix is singular or nearly singular at column ${i}`);
      o !== i && (this.swapRows(t, i, o), [s[i], s[o]] = [s[o], s[i]]);
      const r = t.get(i, i);
      for (let a = i + 1; a < e; a++) {
        const h = t.get(a, i) / r;
        t.set(a, i, h);
        for (let c = i + 1; c < e; c++) {
          const l = t.get(a, c) - h * t.get(i, c);
          t.set(a, c, l);
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
        const o = t.get(e, i);
        t.set(e, i, t.get(s, i)), t.set(s, i, o);
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
      let o = 0;
      for (let n = 0; n < i; n++)
        o += t.get(i, n) * e.get(n);
      e.set(i, e.get(i) - o);
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
      let o = 0;
      for (let n = i + 1; n < s; n++)
        o += t.get(i, n) * e.get(n);
      e.set(i, (e.get(i) - o) / t.get(i, i));
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
      const o = Math.abs(t.get(i, i));
      e = Math.max(e, o), s = Math.min(s, o);
    }
    return s > 1e-14 ? e / s : 1 / 0;
  }
}
class x {
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
    for (const n of t) {
      if (n.nodes)
        for (const r of n.nodes)
          r !== "0" && r !== "gnd" && e.add(r);
      (n.type === "V" || n.needsCurrentVariable()) && s.add(n.name);
    }
    let i = 0;
    for (const n of Array.from(e).sort())
      this.nodeMap.set(n, i), this.debugInfo.nodeNames.push(n), i++;
    this.nodeCount = i;
    let o = 0;
    for (const n of Array.from(s).sort())
      this.voltageSourceMap.set(n, this.nodeCount + o), this.debugInfo.voltageSourceNames.push(n), o++;
    this.voltageSourceCount = o, this.matrixSize = this.nodeCount + this.voltageSourceCount, this.debugInfo.matrixLabels = [
      ...this.debugInfo.nodeNames.map((n) => `V(${n})`),
      ...this.debugInfo.voltageSourceNames.map((n) => `I(${n})`)
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
    this.matrix = g.zeros(this.matrixSize, this.matrixSize), this.rhs = S.zeros(this.matrixSize);
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
    const e = t.nodes, s = 1 / t.value, i = this.getNodeIndex(e[0]), o = this.getNodeIndex(e[1]);
    i >= 0 && (this.matrix.addAt(i, i, s), o >= 0 && this.matrix.addAt(i, o, -s)), o >= 0 && (this.matrix.addAt(o, o, s), i >= 0 && this.matrix.addAt(o, i, -s));
  }
  /**
   * 電容的MNA印記 (用於暫態分析)
   * 使用伴隨模型: i_c(t) = C * dv/dt ≈ C/h * (v(t) - v(t-h)) + i_hist
   * 其中 h 是時間步長
   */
  stampCapacitor(t) {
    if (!t.timeStep)
      return;
    const e = t.nodes, s = t.value, i = t.timeStep, o = s / i, n = this.getNodeIndex(e[0]), r = this.getNodeIndex(e[1]);
    n >= 0 && (this.matrix.addAt(n, n, o), r >= 0 && this.matrix.addAt(n, r, -o)), r >= 0 && (this.matrix.addAt(r, r, o), n >= 0 && this.matrix.addAt(r, n, -o)), t.historyTerm !== void 0 && (n >= 0 && this.rhs.addAt(n, -t.historyTerm), r >= 0 && this.rhs.addAt(r, t.historyTerm));
  }
  /**
   * 電感的MNA印記 (需要電流變數)
   * 使用伴隨模型: v_L(t) = L * di/dt ≈ L/h * (i(t) - i(t-h))
   */
  /**
   * 電感的MNA印記 (需要電流變數)
   * 🔥 修正版：支援耦合電感（互感）
   */
  stampInductor(t) {
    const e = t.nodes, s = t.getInductance(), i = this.getNodeIndex(e[0]), o = this.getNodeIndex(e[1]), n = this.voltageSourceMap.get(t.name);
    if (n === void 0)
      throw new Error(`Inductor ${t.name} current variable not found`);
    if (i >= 0 && (this.matrix.addAt(i, n, 1), this.matrix.addAt(n, i, 1)), o >= 0 && (this.matrix.addAt(o, n, -1), this.matrix.addAt(n, o, -1)), t.timeStep) {
      const r = t.timeStep;
      if (this.matrix.addAt(n, n, -s / r), t.historyTerm !== void 0 && this.rhs.addAt(n, -s / r * t.historyTerm), t.couplings)
        for (const a of t.couplings) {
          const h = a.inductor, c = a.mutualInductance, l = this.voltageSourceMap.get(h.name);
          if (l === void 0)
            throw new Error(`Coupled inductor ${h.name} not found for ${t.name}`);
          this.matrix.addAt(n, l, -c / r), h.historyTerm !== void 0 && this.rhs.addAt(n, -c / r * h.historyTerm);
        }
    } else {
      const r = t.resistance || 1e-9;
      this.matrix.addAt(n, n, -r);
    }
  }
  /**
   * 電壓源的MNA印記
   */
  stampVoltageSource(t, e) {
    const s = t.nodes, i = this.getNodeIndex(s[0]), o = this.getNodeIndex(s[1]), n = this.voltageSourceMap.get(t.name);
    if (n === void 0)
      throw new Error(`Voltage source ${t.name} current variable not found`);
    i >= 0 && (this.matrix.addAt(i, n, 1), this.matrix.addAt(n, i, 1)), o >= 0 && (this.matrix.addAt(o, n, -1), this.matrix.addAt(n, o, -1));
    const r = t.getValue(e);
    this.rhs.addAt(n, r);
  }
  /**
   * 電流源的MNA印記
   */
  stampCurrentSource(t, e) {
    const s = t.nodes, i = this.getNodeIndex(s[0]), o = this.getNodeIndex(s[1]), n = t.getValue(e);
    i >= 0 && this.rhs.addAt(i, -n), o >= 0 && this.rhs.addAt(o, n);
  }
  /**
   * 壓控電壓源 (VCVS) 的印記
   * E * V_control = V_output
   */
  stampVCVS(t) {
    const e = [t.nodes[0], t.nodes[1]], s = [t.nodes[2], t.nodes[3]], i = t.value, o = this.getNodeIndex(e[0]), n = this.getNodeIndex(e[1]), r = this.getNodeIndex(s[0]), a = this.getNodeIndex(s[1]), h = this.voltageSourceMap.get(t.name);
    o >= 0 && (this.matrix.addAt(o, h, 1), this.matrix.addAt(h, o, 1)), n >= 0 && (this.matrix.addAt(n, h, -1), this.matrix.addAt(h, n, -1)), r >= 0 && this.matrix.addAt(h, r, -i), a >= 0 && this.matrix.addAt(h, a, i);
  }
  /**
   * 壓控電流源 (VCCS) 的印記  
   * I_output = gm * V_control
   */
  stampVCCS(t) {
    const e = [t.nodes[0], t.nodes[1]], s = [t.nodes[2], t.nodes[3]], i = t.value, o = this.getNodeIndex(e[0]), n = this.getNodeIndex(e[1]), r = this.getNodeIndex(s[0]), a = this.getNodeIndex(s[1]);
    o >= 0 && r >= 0 && this.matrix.addAt(o, r, i), o >= 0 && a >= 0 && this.matrix.addAt(o, a, -i), n >= 0 && r >= 0 && this.matrix.addAt(n, r, -i), n >= 0 && a >= 0 && this.matrix.addAt(n, a, i);
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
      let o = this.debugInfo.matrixLabels[s].padStart(4) + " ";
      for (let n = 0; n < this.matrixSize; n++) {
        const r = this.matrix.get(s, n);
        o += r.toFixed(t).padStart(12);
      }
      o += " | " + this.rhs.get(s).toFixed(t).padStart(10), console.log(o);
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
class I {
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
    for (const [i, o] of e)
      this.nodeVoltages.has(i) || this.nodeVoltages.set(i, []), this.nodeVoltages.get(i).push(o);
    for (const [i, o] of s)
      this.branchCurrents.has(i) || this.branchCurrents.set(i, []), this.branchCurrents.get(i).push(o);
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
class q {
  constructor() {
    this.mnaBuilder = new x(), this.components = [], this.result = null, this.timeStep = 1e-6, this.startTime = 0, this.stopTime = 1e-3, this.maxTimeStep = 1e-6, this.minTimeStep = 1e-12, this.maxIterations = 50, this.convergenceTol = 1e-9, this.debug = !1, this.saveHistory = !0, this.progressCallback = null;
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
    this.setParameters(e), this.components = [...t], this.result = new I(), console.log(`Starting transient analysis: ${this.startTime}s to ${this.stopTime}s, step=${this.timeStep}s`);
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
    const s = f.solve(t, e), i = this.mnaBuilder.extractNodeVoltages(s), o = this.mnaBuilder.extractVoltageSourceCurrents(s);
    for (const n of this.components)
      n.updateHistory(i, o);
    this.result.addTimePoint(this.startTime, i, o), this.debug && (console.log("Initial conditions set"), this.printSolutionSummary(i, o));
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
    const { matrix: e, rhs: s } = this.mnaBuilder.buildMNAMatrix(this.components, t), i = f.solve(e, s), o = this.mnaBuilder.extractNodeVoltages(i), n = this.mnaBuilder.extractVoltageSourceCurrents(i);
    for (const r of this.components)
      r.updateHistory(o, n);
    this.result.addTimePoint(t, o, n);
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
      const { matrix: s, rhs: i } = this.mnaBuilder.buildMNAMatrix(this.components, t), o = f.solve(s, i), n = this.mnaBuilder.extractNodeVoltages(o), r = this.mnaBuilder.extractVoltageSourceCurrents(o), a = !0;
      for (const h of this.components)
        h.updateHistory(n, r);
      return {
        converged: a,
        nodeVoltages: n,
        branchCurrents: r,
        time: t
      };
    } catch (s) {
      throw new Error(`Time step solution failed at t=${t}s: ${s.message}`);
    }
  }
}
class B {
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
    for (const [o, n] of Object.entries(s))
      if (e.endsWith(o)) {
        const r = parseFloat(e.slice(0, -o.length));
        if (!isNaN(r))
          return r * n;
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
class z {
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
        const i = e.getValue(), o = this.getBranchCurrent(e.name);
        s = -i * o;
      } else if (e.type === "I") {
        const i = e.getVoltage(this.nodeVoltages), o = e.getValue();
        s = -i * o;
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
class _ {
  constructor() {
    this.mnaBuilder = new x(), this.debug = !1;
  }
  /**
   * 執行DC分析
   * @param {BaseComponent[]} components 電路元件列表
   * @param {Object} options 分析選項
   * @returns {DCResult} DC分析結果
   */
  async run(t, e = {}) {
    this.debug = e.debug || !1;
    const s = new z();
    try {
      this.debug && console.log("Starting DC analysis..."), this.mnaBuilder.analyzeCircuit(t);
      const i = 20, o = 1e-9;
      let n = 0, r = !1, a;
      for (; n < i && !r; ) {
        n++;
        const { matrix: h, rhs: c } = this.mnaBuilder.buildMNAMatrix(t, 0);
        this.debug && n === 1 && (console.log("MNA Matrix built"), this.mnaBuilder.printMNAMatrix());
        const l = f.solve(h, c);
        if (n > 1) {
          let p = 0;
          for (let C = 0; C < l.size; C++) {
            const N = Math.abs(l.get(C) - a.get(C));
            p = Math.max(p, N);
          }
          p < o && (r = !0, this.debug && console.log(`DC analysis converged after ${n} iterations (max change: ${p.toExponential(2)})`));
        }
        a = l;
        const V = this.mnaBuilder.extractNodeVoltages(a), E = this.mnaBuilder.extractVoltageSourceCurrents(a);
        for (const p of t)
          typeof p.updateHistory == "function" && p.updateHistory(V, E);
      }
      return r || console.warn(`DC analysis did not converge after ${i} iterations`), s.nodeVoltages = this.mnaBuilder.extractNodeVoltages(a), s.branchCurrents = this.mnaBuilder.extractVoltageSourceCurrents(a), s.converged = r, s.calculatePower(t), s.analysisInfo = {
        method: "Modified Nodal Analysis",
        matrixSize: this.mnaBuilder.matrixSize,
        nodeCount: this.mnaBuilder.nodeCount,
        voltageSourceCount: this.mnaBuilder.voltageSourceCount,
        iterations: n,
        convergence: r ? "converged" : "max iterations reached"
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
      return f.estimateConditionNumber(t);
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
    for (const [o, n] of t.nodeVoltages)
      Math.abs(n) < 1e-12 ? console.log(`  V(${o}) = 0V`) : Math.abs(n) >= 1e3 ? console.log(`  V(${o}) = ${(n / 1e3).toFixed(3)}kV`) : Math.abs(n) >= 1 ? console.log(`  V(${o}) = ${n.toFixed(6)}V`) : Math.abs(n) >= 1e-3 ? console.log(`  V(${o}) = ${(n * 1e3).toFixed(3)}mV`) : Math.abs(n) >= 1e-6 ? console.log(`  V(${o}) = ${(n * 1e6).toFixed(3)}µV`) : console.log(`  V(${o}) = ${n.toExponential(3)}V`);
    console.log("\\nBranch Currents:");
    for (const [o, n] of t.branchCurrents)
      Math.abs(n) < 1e-12 ? console.log(`  I(${o}) = 0A`) : Math.abs(n) >= 1 ? console.log(`  I(${o}) = ${n.toFixed(6)}A`) : Math.abs(n) >= 1e-3 ? console.log(`  I(${o}) = ${(n * 1e3).toFixed(3)}mA`) : Math.abs(n) >= 1e-6 ? console.log(`  I(${o}) = ${(n * 1e6).toFixed(3)}µA`) : Math.abs(n) >= 1e-9 ? console.log(`  I(${o}) = ${(n * 1e9).toFixed(3)}nA`) : console.log(`  I(${o}) = ${n.toExponential(3)}A`);
    console.log("\\nComponent Power:");
    let e = 0, s = 0;
    for (const [o, n] of t.componentPower)
      n < 0 ? (e += Math.abs(n), console.log(`  P(${o}) = ${Math.abs(n).toFixed(6)}W (supplied)`)) : n > 1e-12 && (s += n, console.log(`  P(${o}) = ${n.toFixed(6)}W (dissipated)`));
    console.log("\\nPower Balance:"), console.log(`  Total Supplied: ${e.toFixed(6)}W`), console.log(`  Total Dissipated: ${s.toFixed(6)}W`), console.log(`  Balance Error: ${Math.abs(e - s).toFixed(9)}W`);
    const i = t.getSummary();
    console.log(`\\nMatrix Info: ${i.matrixSize}×${i.matrixSize}, iterations: ${i.iterations}`), console.log("===========================\\n");
  }
  /**
   * 設置調試模式
   * @param {boolean} enabled 是否啟用調試
   */
  setDebug(t) {
    this.debug = t;
  }
}
class W {
  constructor(t = null) {
    this.parser = new D(), this.transientAnalysis = new q(), this.dcAnalysis = new _(), this._components = [], this.models = /* @__PURE__ */ new Map(), this.parameters = /* @__PURE__ */ new Map(), this.analyses = [], this.options = /* @__PURE__ */ new Map(), this.results = /* @__PURE__ */ new Map(), this.lastResult = null, this.isInitialized = !1, this.debug = !1, t && this.loadNetlist(t);
  }
  // 🔥 新增：Component Setter，自動處理元元件
  set components(t) {
    this._components = [], this.addComponents(t);
  }
  // 🔥 新增：Component Getter
  get components() {
    return this._components || [];
  }
  // 🔥 新增：addComponent 方法，用於單個元件
  addComponent(t) {
    this._components || (this._components = []), t.type === "T_META" && typeof t.getComponents == "function" ? this._components.push(...t.getComponents()) : this._components.push(t);
  }
  // 🔥 新增：addComponents 方法，用於陣列
  addComponents(t) {
    for (const e of t)
      this.addComponent(e);
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
      const e = B.parseTranCommand(t);
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
    for (const n of this.components) {
      n.isValid() || t.push(`Invalid component: ${n.name}`);
      for (const r of n.nodes)
        (!r || typeof r != "string") && t.push(`Invalid node in component ${n.name}: ${r}`);
      n.value === 0 && (n.type === "R" || n.type === "L" || n.type === "C") && e.push(`Zero value in ${n.name} may cause numerical issues`);
    }
    const s = this.getNodeList();
    s.includes("0") || s.includes("gnd") || s.includes("GND") || e.push("No ground node (0 or gnd) found - circuit may be floating");
    const o = /* @__PURE__ */ new Map();
    for (const n of this.components)
      for (const r of n.nodes)
        o.set(r, (o.get(r) || 0) + 1);
    for (const [n, r] of o)
      r === 1 && n !== "0" && n !== "gnd" && e.push(`Node ${n} has only one connection`);
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
    for (const [i, o] of Object.entries(e))
      console.log(`  ${i}: ${o}`);
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
      }), this.transientAnalysis.result = new I(), await this.transientAnalysis.initialize(this.components, this.steppedParams.timeStep), this.currentTime = this.steppedParams.startTime, this.currentIteration = 0, this.isSteppedMode = !0, this.steppedResults = {
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
      const o = {};
      for (const n of this.components)
        n.getOperatingStatus && (o[n.name] = n.getOperatingStatus());
      return this.steppedResults.componentStates.push(o), this.currentTime += this.steppedParams.timeStep, this.currentIteration++, {
        time: this.currentTime - this.steppedParams.timeStep,
        iteration: this.currentIteration - 1,
        nodeVoltages: Object.fromEntries(e.nodeVoltages),
        branchCurrents: Object.fromEntries(e.branchCurrents),
        componentStates: o,
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
      const i = this.components.find((o) => o.name === e);
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
      const o = t ? t(this.currentTime) : {}, n = this.step(o);
      if (n && (s.push(n), i++, i % 1e3 === 0)) {
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
      name: "AkingSPICE",
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
      author: "AkingSPICE Development Team",
      license: "MIT"
    };
  }
}
class T extends d {
  /**
   * @param {string} name 三相源名稱 (如 'V3PH1', 'GRID1')
   * @param {Object} config 三相源配置
   * @param {string[]} config.nodes 節點連接
   * @param {number} config.voltage 線電壓RMS值 (V)
   * @param {number} config.frequency 頻率 (Hz)
   * @param {Object} params 額外參數
   * 
   * 節點配置：
   * - 星形連接：['A', 'B', 'C', 'N'] (A相, B相, C相, 中性點)
   * - 三角形連接：['AB', 'BC', 'CA'] (線電壓節點)
   */
  constructor(t, e, s = {}) {
    if (super(t, "V3PH", e.nodes, e.voltage, s), !e || !e.nodes)
      throw new Error(`ThreePhaseSource ${t}: nodes configuration required`);
    this.voltage = e.voltage || 220, this.frequency = e.frequency || 50, this.phaseOffset = e.phaseOffset || 0, this.phaseSequence = e.phaseSequence || "ABC", this.connection = e.connection || "wye", this.nodes = e.nodes, this.validateNodeConfiguration(), this.phaseVoltage = this.connection === "wye" ? this.voltage / Math.sqrt(3) : this.voltage, this.createInternalSources(), this.calculatePhaseAngles();
  }
  /**
   * 驗證節點配置
   */
  validateNodeConfiguration() {
    if (this.connection === "wye") {
      if (this.nodes.length !== 4)
        throw new Error(`ThreePhaseSource ${this.name}: Wye connection requires 4 nodes [A, B, C, N]`);
    } else if (this.connection === "delta") {
      if (this.nodes.length !== 3)
        throw new Error(`ThreePhaseSource ${this.name}: Delta connection requires 3 nodes [AB, BC, CA]`);
    } else
      throw new Error(`ThreePhaseSource ${this.name}: Invalid connection type '${this.connection}'. Use 'wye' or 'delta'`);
  }
  /**
   * 計算相位角
   */
  calculatePhaseAngles() {
    const t = this.phaseOffset * Math.PI / 180;
    if (this.phaseSequence === "ABC")
      this.phaseAngles = {
        A: t,
        B: t - 2 * Math.PI / 3,
        // -120°
        C: t - 4 * Math.PI / 3
        // -240° = +120°
      };
    else if (this.phaseSequence === "ACB")
      this.phaseAngles = {
        A: t,
        B: t + 2 * Math.PI / 3,
        // +120°
        C: t + 4 * Math.PI / 3
        // +240° = -120°
      };
    else
      throw new Error(`ThreePhaseSource ${this.name}: Invalid phase sequence '${this.phaseSequence}'. Use 'ABC' or 'ACB'`);
  }
  /**
   * 創建內部電壓源
   */
  createInternalSources() {
    if (this.internalSources = [], this.connection === "wye") {
      const t = this.nodes[3];
      ["A", "B", "C"].forEach((s, i) => {
        const o = this.nodes[i], n = `${this.name}_${s}`, r = new m(n, [o, t], {
          type: "SINE",
          amplitude: this.phaseVoltage * Math.sqrt(2),
          // 峰值
          frequency: this.frequency,
          phase: this.phaseAngles[s] * 180 / Math.PI,
          // 轉回度數
          offset: 0
        });
        this.internalSources.push(r);
      });
    } else this.connection === "delta" && [
      { name: "AB", nodes: [this.nodes[0], this.nodes[1]], phase: "A" },
      { name: "BC", nodes: [this.nodes[1], this.nodes[2]], phase: "B" },
      { name: "CA", nodes: [this.nodes[2], this.nodes[0]], phase: "C" }
    ].forEach((e) => {
      const s = `${this.name}_${e.name}`, i = new m(s, e.nodes, {
        type: "SINE",
        amplitude: this.voltage * Math.sqrt(2),
        // 線電壓峰值
        frequency: this.frequency,
        phase: this.phaseAngles[e.phase] * 180 / Math.PI,
        offset: 0
      });
      this.internalSources.push(i);
    });
  }
  /**
   * 獲取特定相的瞬時電壓
   * @param {string} phase 相別 ('A', 'B', 'C')
   * @param {number} time 時間 (秒)
   * @returns {number} 瞬時電壓 (V)
   */
  getPhaseVoltage(t, e) {
    if (!this.phaseAngles[t])
      throw new Error(`Invalid phase: ${t}`);
    const s = 2 * Math.PI * this.frequency;
    return (this.connection === "wye" ? this.phaseVoltage * Math.sqrt(2) : this.voltage * Math.sqrt(2)) * Math.sin(s * e + this.phaseAngles[t]);
  }
  /**
   * 獲取線電壓
   * @param {string} line 線別 ('AB', 'BC', 'CA')
   * @param {number} time 時間 (秒)
   * @returns {number} 線電壓 (V)
   */
  getLineVoltage(t, e) {
    if (this.connection === "delta") {
      const s = { AB: "A", BC: "B", CA: "C" };
      return this.getPhaseVoltage(s[t], e);
    } else
      switch (t) {
        case "AB":
          return this.getPhaseVoltage("A", e) - this.getPhaseVoltage("B", e);
        case "BC":
          return this.getPhaseVoltage("B", e) - this.getPhaseVoltage("C", e);
        case "CA":
          return this.getPhaseVoltage("C", e) - this.getPhaseVoltage("A", e);
        default:
          throw new Error(`Invalid line: ${t}`);
      }
  }
  /**
   * 為 MNA 分析提供印花支援
   * 三相源通過內部電壓源來實現印花
   */
  stamp(t, e, s, i, o) {
    this.internalSources.forEach((n) => {
      n.stamp && n.stamp(t, e, s, i, o);
    });
  }
  /**
   * 檢查是否需要電流變數
   * @returns {boolean}
   */
  needsCurrentVariable() {
    return !0;
  }
  /**
   * 獲取所需的電流變數數量
   * @returns {number}
   */
  getCurrentVariableCount() {
    return this.internalSources.length;
  }
  /**
   * 獲取三相源資訊
   * @returns {Object}
   */
  getThreePhaseInfo() {
    return {
      name: this.name,
      connection: this.connection,
      voltage: this.voltage,
      phaseVoltage: this.phaseVoltage,
      frequency: this.frequency,
      phaseSequence: this.phaseSequence,
      phaseOffset: this.phaseOffset,
      nodes: this.nodes,
      phaseAngles: Object.fromEntries(
        Object.entries(this.phaseAngles).map(([t, e]) => [t, e * 180 / Math.PI])
      ),
      internalSources: this.internalSources.map((t) => t.name)
    };
  }
  /**
   * 獲取元件資訊字串
   * @returns {string}
   */
  toString() {
    const t = this.connection.toUpperCase(), e = this.nodes.join("-");
    return `${this.name} (3Phase ${t}): ${e}, ${this.voltage}V, ${this.frequency}Hz, ${this.phaseSequence}`;
  }
  /**
   * 序列化為 JSON
   * @returns {Object}
   */
  toJSON() {
    return {
      ...super.toJSON(),
      connection: this.connection,
      voltage: this.voltage,
      frequency: this.frequency,
      phaseSequence: this.phaseSequence,
      phaseOffset: this.phaseOffset,
      threePhaseInfo: this.getThreePhaseInfo()
    };
  }
  /**
   * 復製三相源
   * @returns {ThreePhaseSource}
   */
  clone() {
    return new T(this.name, {
      nodes: [...this.nodes],
      connection: this.connection,
      voltage: this.voltage,
      frequency: this.frequency,
      phaseSequence: this.phaseSequence,
      phaseOffset: this.phaseOffset
    }, { ...this.params });
  }
}
class M extends d {
  /**
   * @param {string} name MOSFET名稱 (如 'M1', 'Q1')
   * @param {string[]} nodes 連接節點 [drain, gate, source] 或 [drain, gate, source, bulk]
   * @param {Object} params MOSFET參數
   * @param {Object} modelParams 額外模型參數
   * 
   * 主要參數：
   * - Vth: 閾值電壓 (V)
   * - Kp: 跨導參數 (A/V²)
   * - W/L: 寬長比
   * - Ron: 導通電阻 (Ω)
   * - Vf_body: 體二極體順向電壓 (V)
   */
  constructor(t, e, s = {}, i = {}) {
    if (super(t, "VM", e, 0, { ...s, ...i }), e.length < 3 || e.length > 4)
      throw new Error(`VoltageControlledMOSFET ${t} must have 3 or 4 nodes: [drain, gate, source] or [drain, gate, source, bulk]`);
    this.drain = e[0], this.gate = e[1], this.source = e[2], this.bulk = e[3] || e[2], this.Vth = this.safeParseValue(s.Vth, 2), this.Kp = this.safeParseValue(s.Kp, 1e-4), this.W = this.safeParseValue(s.W, 1e-4), this.L = this.safeParseValue(s.L, 1e-5), this.lambda = this.safeParseValue(s.lambda, 0), this.Ron = this.safeParseValue(s.Ron, 0.1), this.Roff = this.safeParseValue(s.Roff, 1e9), this.Vf_body = this.safeParseValue(s.Vf_body, 0.7), this.Ron_body = this.safeParseValue(s.Ron_body, 0.01), this.Cgs = this.safeParseValue(s.Cgs, 1e-12), this.Cgd = this.safeParseValue(s.Cgd, 1e-12), this.Cds = this.safeParseValue(s.Cds, 1e-12), this.modelType = s.modelType || "NMOS", this.operatingRegion = "OFF", this.Vgs = 0, this.Vds = 0, this.Vbs = 0, this.Id = 0, this.validate();
  }
  /**
   * 安全地解析數值參數
   */
  safeParseValue(t, e) {
    try {
      return t == null ? e : this.parseValue(t);
    } catch {
      return e;
    }
  }
  /**
   * 更新 MOSFET 的工作電壓
   * @param {Map} nodeVoltages 節點電壓映射
   */
  updateVoltages(t) {
    const e = t.get(this.drain) || 0, s = t.get(this.gate) || 0, i = t.get(this.source) || 0, o = t.get(this.bulk) || i;
    this.Vgs = s - i, this.Vds = e - i, this.Vbs = o - i, this.updateOperatingRegion(), this.calculateDrainCurrent();
  }
  /**
   * 判斷 MOSFET 工作區域
   */
  updateOperatingRegion() {
    const t = this.getEffectiveThresholdVoltage();
    this.modelType === "NMOS" ? this.Vgs < t ? this.operatingRegion = "OFF" : this.Vds < this.Vgs - t ? this.operatingRegion = "LINEAR" : this.operatingRegion = "SATURATION" : this.Vgs > t ? this.operatingRegion = "OFF" : this.Vds > this.Vgs - t ? this.operatingRegion = "LINEAR" : this.operatingRegion = "SATURATION";
  }
  /**
   * 獲取有效閾值電壓（考慮體效應）
   * @returns {number} 有效閾值電壓 (V)
   */
  getEffectiveThresholdVoltage() {
    return this.Vth;
  }
  /**
   * 計算汲極電流
   */
  calculateDrainCurrent() {
    const t = this.getEffectiveThresholdVoltage(), e = this.Kp * this.W / this.L;
    switch (this.operatingRegion) {
      case "OFF":
        this.Id = 0;
        break;
      case "LINEAR":
        const s = this.Vgs - t;
        this.Id = e * (s * this.Vds - this.Vds * this.Vds / 2) * (1 + this.lambda * this.Vds);
        break;
      case "SATURATION":
        const i = this.Vgs - t;
        this.Id = e / 2 * i * i * (1 + this.lambda * this.Vds);
        break;
    }
    this.modelType === "PMOS" && (this.Id = -this.Id);
  }
  /**
   * 獲取等效電阻（用於 MNA 分析的簡化模型）
   * @returns {number} 等效電阻 (Ω)
   */
  getEquivalentResistance() {
    return this.operatingRegion === "OFF" ? this.Roff : this.Ron;
  }
  /**
   * 檢查體二極體是否導通
   * 體二極體是從 Source 到 Drain 的內建二極體
   * @returns {boolean}
   */
  isBodyDiodeOn() {
    return this.modelType === "NMOS" ? -this.Vds > this.Vf_body : this.Vds > this.Vf_body;
  }
  /**
   * 為 MNA 分析提供印花支援
   * 使用等效電阻模型進行簡化分析
   */
  stamp(t, e, s, i, o) {
    const n = this.drain === "0" ? -1 : s.get(this.drain), r = this.source === "0" ? -1 : s.get(this.source);
    if (n === void 0 || r === void 0)
      throw new Error(`VoltageControlledMOSFET ${this.name}: Node mapping not found`);
    const a = this.getEquivalentResistance(), h = 1 / a;
    n >= 0 && (t.addAt(n, n, h), r >= 0 && t.addAt(n, r, -h)), r >= 0 && (t.addAt(r, r, h), n >= 0 && t.addAt(r, n, -h));
    const c = this.isBodyDiodeOn();
    if (c) {
      const l = 1 / this.Ron_body;
      n >= 0 && (t.addAt(n, n, l), r >= 0 && t.addAt(n, r, -l)), r >= 0 && (t.addAt(r, r, l), n >= 0 && t.addAt(r, n, -l));
      const V = l * this.Vf_body;
      n >= 0 && e.addAt(n, -V), r >= 0 && e.addAt(r, V);
    }
    this.name === "M1" && c && console.log(`${this.name}: Body diode ON, Vds=${this.Vds.toFixed(2)}V, Channel R=${a.toExponential(1)}Ω`);
  }
  /**
   * 更新元件歷史狀態（在每個時間步求解後調用）
   * @param {Map} nodeVoltages 節點電壓映射
   * @param {Map} branchCurrents 支路電流映射
   */
  updateHistory(t, e) {
    this.updateVoltages(t), super.updateHistory(t, e);
  }
  /**
   * 設置閘極狀態（由控制器調用）
   * @param {boolean} state 閘極狀態（true=ON, false=OFF）
   */
  setGateState(t) {
    this.gateState = t;
  }
  /**
   * 檢查是否需要電流變數
   * @returns {boolean}
   */
  needsCurrentVariable() {
    return !1;
  }
  /**
   * 計算通過MOSFET的電流
   * @param {Map<string, number>} nodeVoltages 節點電壓
   * @returns {number} 汲極電流 (安培)，正值表示從drain流向source
   */
  getCurrent(t) {
    return this.updateVoltages(t), this.operatingPoint.current = this.Id, this.Id;
  }
  /**
   * 驗證 MOSFET 參數
   */
  validate() {
    if (this.Kp <= 0)
      throw new Error(`VoltageControlledMOSFET ${this.name}: Kp must be positive`);
    if (this.W <= 0 || this.L <= 0)
      throw new Error(`VoltageControlledMOSFET ${this.name}: W and L must be positive`);
    if (this.Ron <= 0)
      throw new Error(`VoltageControlledMOSFET ${this.name}: Ron must be positive`);
  }
  /**
   * 獲取詳細工作狀態
   * @returns {Object}
   */
  getOperatingStatus() {
    return {
      name: this.name,
      type: "VoltageControlledMOSFET",
      modelType: this.modelType,
      operatingRegion: this.operatingRegion,
      voltages: {
        Vgs: this.Vgs,
        Vds: this.Vds,
        Vbs: this.Vbs
      },
      current: {
        Id: this.Id
      },
      equivalentResistance: this.getEquivalentResistance(),
      bodyDiodeOn: this.isBodyDiodeOn(),
      parameters: {
        Vth: this.Vth,
        Kp: this.Kp,
        WoverL: this.W / this.L
      }
    };
  }
  /**
   * 獲取元件資訊字串
   * @returns {string}
   */
  toString() {
    return `${this.name} (${this.modelType} VC-MOSFET): D=${this.drain} G=${this.gate} S=${this.source}, Vth=${this.Vth}V, Region=${this.operatingRegion}, Id=${this.Id.toExponential(3)}A`;
  }
  /**
   * 復製 MOSFET
   * @returns {VoltageControlledMOSFET}
   */
  clone() {
    const t = [this.drain, this.gate, this.source];
    return this.bulk !== this.source && t.push(this.bulk), new M(this.name, t, {
      Vth: this.Vth,
      Kp: this.Kp,
      W: this.W,
      L: this.L,
      lambda: this.lambda,
      Ron: this.Ron,
      Roff: this.Roff,
      Vf_body: this.Vf_body,
      Ron_body: this.Ron_body,
      modelType: this.modelType
    }, { ...this.params });
  }
}
class R extends d {
  /**
   * @param {string} name 二極體名稱 (如 'D1', 'CR1')
   * @param {string[]} nodes 連接節點 [anode, cathode]
   * @param {Object} params 參數 {Vf, Ron, Roff}
   */
  constructor(t, e, s = {}) {
    if (super(t, "D", e, 0, s), e.length < 2)
      throw new Error(`Diode ${t} must have 2 nodes: [anode, cathode]`);
    this.Vf = this.safeParseValue(s.Vf, 0.7), this.Ron = this.safeParseValue(s.Ron, 0.01), this.Roff = this.safeParseValue(s.Roff, 1e6), this.anode = e[0], this.cathode = e[1], this.isForwardBiased = !1, this.anodeCathodeVoltage = 0, this.current = 0, this.validate();
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
   * 驗證二極體參數
   */
  validate() {
    if (this.Ron <= 0)
      throw new Error(`Diode ${this.name}: Ron must be positive`);
    if (this.Roff <= this.Ron)
      throw new Error(`Diode ${this.name}: Roff must be greater than Ron`);
    if (this.Vf < 0)
      throw new Error(`Diode ${this.name}: Forward voltage Vf must be non-negative`);
  }
  /**
   * 計算二極體的等效電阻
   * @param {number} vak 陽極-陰極電壓 (V)
   * @returns {number} 等效電阻 (歐姆)
   */
  getEquivalentResistance(t) {
    return this.isForwardBiased = t > this.Vf, this.isForwardBiased ? this.Ron : this.Roff;
  }
  /**
   * 檢查二極體是否處於導通狀態
   * @returns {boolean}
   */
  isOn() {
    return this.isForwardBiased;
  }
  /**
   * 獲取二極體壓降 (包含順向偏壓電壓)
   * @returns {number} 實際壓降 (V)
   */
  getVoltageDrop() {
    return this.isForwardBiased ? this.Vf + this.current * this.Ron : this.anodeCathodeVoltage;
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
  stamp(t, e, s, i, o) {
    const n = this.anode === "0" || this.anode === "gnd" ? -1 : s.get(this.anode), r = this.cathode === "0" || this.cathode === "gnd" ? -1 : s.get(this.cathode);
    if (n === void 0 || r === void 0)
      throw new Error(`Diode ${this.name}: Node mapping not found (anode: ${this.anode}, cathode: ${this.cathode})`);
    let a = 0;
    this.anodeCathodeVoltage !== void 0 && (a = this.anodeCathodeVoltage);
    const h = this.getEquivalentResistance(a), c = 1 / h;
    if (n >= 0 && (t.addAt(n, n, c), r >= 0 && t.addAt(n, r, -c)), r >= 0 && (t.addAt(r, r, c), n >= 0 && t.addAt(r, n, -c)), this.isForwardBiased) {
      const l = this.Vf / h;
      n >= 0 && e.addAt(n, -l), r >= 0 && e.addAt(r, l);
    }
  }
  /**
   * 更新元件狀態 (在每個時間步後調用)
   * @param {number} vak 陽極-陰極電壓
   * @param {number} iak 陽極到陰極電流
   */
  updateState(t, e) {
    this.anodeCathodeVoltage = t, this.current = e, this.isForwardBiased = t > this.Vf;
  }
  /**
   * 更新歷史狀態 (在每個時間步結束時調用)
   * @param {Map<string, number>} nodeVoltages 節點電壓
   * @param {Map<string, number>} branchCurrents 支路電流
   */
  updateHistory(t, e) {
    super.updateHistory(t, e);
    const s = t.get(this.anode) || 0, i = t.get(this.cathode) || 0, o = s - i, n = this.getEquivalentResistance(o), r = o / n;
    this.updateState(o, r);
  }
  /**
   * 檢查是否需要電流變數 (對於理想二極體，通常不需要)
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
    return `${this.name} (Diode): A=${this.anode} K=${this.cathode}, State=${this.isForwardBiased ? "ON" : "OFF"}, Vf=${this.Vf}V, Ron=${this.Ron}Ω`;
  }
  /**
   * 獲取詳細的工作狀態
   * @returns {Object}
   */
  getOperatingStatus() {
    return {
      name: this.name,
      type: "Diode",
      state: this.isForwardBiased ? "ON" : "OFF",
      anodeCathodeVoltage: this.anodeCathodeVoltage,
      current: this.current,
      voltageDrop: this.getVoltageDrop(),
      currentResistance: this.getEquivalentResistance(this.anodeCathodeVoltage),
      isForwardBiased: this.isForwardBiased
    };
  }
  /**
   * 序列化為 JSON
   * @returns {Object}
   */
  toJSON() {
    return {
      ...super.toJSON(),
      Vf: this.Vf,
      Ron: this.Ron,
      Roff: this.Roff,
      operatingStatus: this.getOperatingStatus()
    };
  }
  /**
   * 復製二極體
   * @returns {Diode}
   */
  clone() {
    return new R(this.name, this.nodes, {
      Vf: this.Vf,
      Ron: this.Ron,
      Roff: this.Roff
    });
  }
}
class H {
  /**
   * @param {string} name 變壓器名稱 (如 'T1', 'XFMR1')
   * @param {Object} config 變壓器配置
   */
  constructor(t, e) {
    if (this.name = t, this.type = "T_META", !e || !e.windings || e.windings.length < 2)
      throw new Error(`Transformer ${t} must have at least 2 windings`);
    const s = e.windings.length;
    this.inductors = e.windings.map((n, r) => {
      const a = `${t}_${n.name || `W${r + 1}`}`;
      return new $(a, n.nodes, n.inductance, {
        r: n.resistance || 0
      });
    });
    const i = this.buildCouplingMatrix(s, e.couplingMatrix), o = this.calculateMutualInductanceMatrix(i);
    for (let n = 0; n < s; n++) {
      const r = this.inductors[n];
      r.couplings = [];
      for (let a = 0; a < s; a++) {
        if (n === a) continue;
        const h = this.inductors[a], c = o[n][a];
        r.couplings.push({
          inductor: h,
          mutualInductance: c * 1
        });
      }
    }
  }
  /**
   * 🔥 核心方法：返回構成變壓器的所有實際元件
   * @returns {Inductor[]}
   */
  getComponents() {
    return this.inductors;
  }
  buildCouplingMatrix(t, e) {
    const s = Array(t).fill(null).map(() => Array(t).fill(0));
    for (let i = 0; i < t; i++) s[i][i] = 1;
    if (e)
      for (let i = 0; i < t; i++)
        for (let o = i + 1; o < t; o++) {
          const n = e[i] && e[i][o] !== void 0 ? e[i][o] : 0.99;
          s[i][o] = s[o][i] = Math.max(-1, Math.min(1, n));
        }
    else
      for (let o = 0; o < t; o++)
        for (let n = o + 1; n < t; n++)
          s[o][n] = s[n][o] = 0.99;
    return s;
  }
  calculateMutualInductanceMatrix(t) {
    const e = this.inductors.length, s = Array(e).fill(null).map(() => Array(e).fill(0));
    for (let i = 0; i < e; i++)
      for (let o = i; o < e; o++)
        if (i === o)
          s[i][o] = this.inductors[i].getInductance();
        else {
          const n = this.inductors[i].getInductance(), r = this.inductors[o].getInductance(), h = t[i][o] * Math.sqrt(n * r);
          s[i][o] = s[o][i] = h;
        }
    return s;
  }
  toString() {
    return `${this.name} (MultiWinding Transformer with ${this.inductors.length} windings)`;
  }
}
export {
  W as AkingSPICE,
  d as BaseComponent,
  v as CCCS,
  b as CCVS,
  P as Capacitor,
  k as CoupledInductor,
  F as CurrentSource,
  _ as DCAnalysis,
  R as Diode,
  $ as Inductor,
  w as MOSFET,
  H as MultiWindingTransformer,
  D as NetlistParser,
  A as Resistor,
  T as ThreePhaseSource,
  q as TransientAnalysis,
  L as VCCS,
  O as VCVS,
  M as VoltageControlledMOSFET,
  m as VoltageSource,
  W as default
};
//# sourceMappingURL=AkingSPICE.es.js.map
