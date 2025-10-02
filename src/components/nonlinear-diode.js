/**
 * 非線性二極體模型
 * 
 * 實現真正的連續非線性二極體特性：
 * - 基於 Shockley 方程的指數 I-V 關係
 * - 溫度依賴性建模
 * - 數值穩定性優化
 * - 小信號參數計算
 * 
 * Shockley 方程：
 * I = Is * (exp(Vd / (n*Vt)) - 1)
 * 其中：
 * - Is: 飽和電流
 * - n: 理想因子
 * - Vt: 熱電壓 = kT/q
 */

import { BaseComponent } from './base.js';

/**
 * 非線性 Shockley 二極體模型
 */
export class NonlinearDiode extends BaseComponent {
    /**
     * @param {string} name 二極體名稱
     * @param {string[]} nodes 連接節點 [anode, cathode]
     * @param {Object} params 物理參數
     */
    constructor(name, nodes, params = {}) {
        super(name, 'D', nodes, 0, params);
        
        if (nodes.length < 2) {
            throw new Error(`NonlinearDiode ${name} must have 2 nodes: [anode, cathode]`);
        }
        
        // 物理參數
        this.Is = (params.Is !== undefined) ? this.parseValue(params.Is) : 1e-12;        // 飽和電流 (A)
        this.n = (params.n !== undefined) ? this.parseValue(params.n) : 1.0;            // 理想因子
        this.T = (params.T !== undefined) ? this.parseValue(params.T) : 300.15;         // 溫度 (K)
        this.Rs = (params.Rs !== undefined) ? this.parseValue(params.Rs) : 0;            // 串聯電阻 (Ω)
        this.Cj = (params.Cj !== undefined) ? this.parseValue(params.Cj) : 0;            // 結電容 (F)
        
        // 計算溫度相關參數
        this.updateThermalParameters();
        
        // 節點分配
        this.anode = nodes[0];
        this.cathode = nodes[1];
        
        // 工作點變量
        this.workingPoint = {
            voltage: 0,           // 陽極-陰極電壓
            current: 0,           // 通過電流
            conductance: 0,       // 小信號導納 dI/dV
            transconductance: 0,  // 跨導
            charge: 0,            // 結電荷
            capacitance: 0        // 微分電容
        };
        
        // 數值穩定性參數
        this.Vmax = 0.8;          // 最大正向電壓 (防止exp溢出)
        this.Vmin = -10 * this.Vt; // 最小反向電壓
        this.Gmin = 1e-12;        // 最小導納 (數值穩定性)
        
        // 指定為非線性元件
        this.model = 'shockley';
        this.isNonlinear = true;
        
        this.validate();
    }
    
    /**
     * 更新溫度相關參數
     */
    updateThermalParameters() {
        // 熱電壓 Vt = kT/q
        const k = 1.380649e-23;    // 玻爾茲曼常數 (J/K)
        const q = 1.602176634e-19; // 電子電荷 (C)
        this.Vt = (k * this.T) / q;
        
        // 溫度補償飽和電流 (簡化模型)
        const T0 = 300.15;  // 參考溫度
        if (this.T !== T0) {
            this.Is_actual = this.Is * Math.pow(this.T / T0, 3) * Math.exp(-1.12 * (1/this.Vt - 1/(k*T0/q)));
        } else {
            this.Is_actual = this.Is;
        }
    }
    
    /**
     * 驗證二極體參數
     */
    validate() {
        if (this.Is <= 0) {
            throw new Error(`NonlinearDiode ${this.name}: Is must be positive`);
        }
        if (this.n <= 0) {
            throw new Error(`NonlinearDiode ${this.name}: n must be positive`);
        }
        if (this.T <= 0) {
            throw new Error(`NonlinearDiode ${this.name}: T must be positive`);
        }
    }
    
    /**
     * 檢查是否需要額外的電流變量 (用於 MNA 建構器)
     * @returns {boolean} 二極體不需要額外電流變量
     */
    needsCurrentVariable() {
        return false;
    }
    
    /**
     * 獲取元件值 (用於 MNA 建構器接口)
     * @returns {number} 對於二極體，返回飽和電流作為特徵值
     */
    getValue() {
        return this.Is;
    }
    
    /**
     * MNA 預處理 (占位符，用於兼容 MNA 建構器接口)
     */
    preprocess() {
        // 非線性二極體在 MNA 中不需要特別的預處理
        // 實際的非線性處理在 stampResidual 和 stampJacobian 中完成
    }
    
    /**
     * 計算二極體電流 I(V) = Is * (exp(V/(n*Vt)) - 1)
     * @param {number} vd 二極體電壓 (V)
     * @returns {number} 二極體電流 (A)
     */
    evaluateCurrent(vd) {
        // 限制電壓範圍，確保數值穩定性
        const vdLimited = Math.max(this.Vmin, Math.min(vd, this.Vmax));
        
        if (vdLimited > 0.1) {
            // 正向偏壓：使用完整 Shockley 方程
            const expArg = vdLimited / (this.n * this.Vt);
            
            // 防止指數溢出
            if (expArg > 80) {
                // 線性外推，避免 exp 溢出
                const expMax = Math.exp(80);
                const linearSlope = this.Is_actual * expMax / (this.n * this.Vt);
                return this.Is_actual * expMax + linearSlope * (vdLimited - 80 * this.n * this.Vt);
            } else {
                return this.Is_actual * (Math.exp(expArg) - 1);
            }
        } else {
            // 反向偏壓：線性近似，避免數值問題
            return this.Is_actual * vdLimited / (this.n * this.Vt);
        }
    }
    
    /**
     * 計算小信號導納 dI/dV = (Is/(n*Vt)) * exp(V/(n*Vt))
     * @param {number} vd 二極體電壓 (V)
     * @returns {number} 小信號導納 (S)
     */
    evaluateConductance(vd) {
        const vdLimited = Math.max(this.Vmin, Math.min(vd, this.Vmax));
        
        if (vdLimited > 0.1) {
            // 正向偏壓：指數導數
            const expArg = vdLimited / (this.n * this.Vt);
            
            if (expArg > 80) {
                // 線性區域的常數導納
                return this.Is_actual * Math.exp(80) / (this.n * this.Vt);
            } else {
                return (this.Is_actual / (this.n * this.Vt)) * Math.exp(expArg);
            }
        } else {
            // 反向偏壓：常數小導納
            return Math.max(this.Gmin, this.Is_actual / (this.n * this.Vt));
        }
    }
    
    /**
     * 更新工作點 (在每次Newton迭代中調用)
     * @param {number} vd 二極體電壓
     */
    updateWorkingPoint(vd) {
        this.workingPoint.voltage = vd;
        this.workingPoint.current = this.evaluateCurrent(vd);
        this.workingPoint.conductance = this.evaluateConductance(vd);
        
        // 計算電荷和微分電容 (如果需要)
        if (this.Cj > 0) {
            // 簡化的結電容模型
            this.workingPoint.charge = this.Cj * vd;
            this.workingPoint.capacitance = this.Cj;
        }
    }
    
    /**
     * 獲取當前工作點電流
     * @returns {number} 電流 (A)
     */
    getCurrentCurrent() {
        return this.workingPoint.current;
    }
    
    /**
     * 獲取當前小信號導納
     * @returns {number} 導納 (S)
     */
    getCurrentConductance() {
        return this.workingPoint.conductance;
    }
    
    /**
     * 為非線性求解器提供函數評估接口
     * @param {Map} nodeVoltages 節點電壓映射
     * @returns {number} 二極體電流
     */
    evaluateFunction(nodeVoltages) {
        const Va = nodeVoltages.get(this.anode) || 0;
        const Vk = nodeVoltages.get(this.cathode) || 0;
        const vd = Va - Vk;
        
        this.updateWorkingPoint(vd);
        return this.workingPoint.current;
    }
    
    /**
     * 為非線性求解器提供雅可比評估接口
     * @param {Map} nodeVoltages 節點電壓映射
     * @returns {Map} 節點雅可比映射
     */
    evaluateJacobian(nodeVoltages) {
        const Va = nodeVoltages.get(this.anode) || 0;
        const Vk = nodeVoltages.get(this.cathode) || 0;
        const vd = Va - Vk;
        
        const conductance = this.evaluateConductance(vd);
        
        const jacobian = new Map();
        jacobian.set(this.anode, conductance);      // ∂I/∂Va = +g
        jacobian.set(this.cathode, -conductance);   // ∂I/∂Vk = -g
        
        return jacobian;
    }
    
    /**
     * MNA 印花 (為相容性保留，但非線性版本使用不同的機制)
     */
    stamp(matrix, rhs, nodeMap, voltageSourceMap, time) {
        console.warn(`NonlinearDiode ${this.name}: stamp() should not be called for nonlinear components`);
        
        // 為了向後相容，提供線性化印花
        const anodeIndex = this.anode === '0' || this.anode === 'gnd' ? -1 : nodeMap.get(this.anode);
        const cathodeIndex = this.cathode === '0' || this.cathode === 'gnd' ? -1 : nodeMap.get(this.cathode);
        
        if (anodeIndex === undefined || cathodeIndex === undefined) {
            throw new Error(`NonlinearDiode ${this.name}: Node mapping not found`);
        }
        
        // 使用當前工作點的線性化導納
        const conductance = this.workingPoint.conductance || this.Gmin;
        
        if (anodeIndex >= 0) {
            matrix.addAt(anodeIndex, anodeIndex, conductance);
            if (cathodeIndex >= 0) {
                matrix.addAt(anodeIndex, cathodeIndex, -conductance);
            }
        }
        
        if (cathodeIndex >= 0) {
            matrix.addAt(cathodeIndex, cathodeIndex, conductance);
            if (anodeIndex >= 0) {
                matrix.addAt(cathodeIndex, anodeIndex, -conductance);
            }
        }
    }
    
    /**
     * 計算Norton等效電路 (用於線性化)
     * @returns {Object} {conductance, currentSource}
     */
    getNortonEquivalent() {
        const vd = this.workingPoint.voltage;
        const id = this.workingPoint.current;
        const gd = this.workingPoint.conductance;
        
        // Norton 等效：I_norton = gd * V + I_source
        // 其中 I_source = id - gd * vd
        const currentSource = id - gd * vd;
        
        return {
            conductance: gd,
            currentSource: currentSource
        };
    }
    
    /**
     * 在 MNA 矩陣中蓋印雅可比項 (用於 Newton-Raphson)
     * 
     * @param {Matrix} jacobian 雅可比矩陣
     * @param {Vector} solution 當前解向量
     * @param {Map<string, number>} nodeMap 節點到矩陣索引的映射
     */
    stampJacobian(jacobian, solution, nodeMap) {
        const anodeIndex = nodeMap.get(this.anode);
        const cathodeIndex = nodeMap.get(this.cathode);
        
        // 獲取當前節點電壓
        let Va = 0, Vc = 0;
        if (anodeIndex !== undefined && anodeIndex >= 0) {
            Va = solution.get(anodeIndex);
        }
        if (cathodeIndex !== undefined && cathodeIndex >= 0) {
            Vc = solution.get(cathodeIndex);
        }
        
        // 計算二極體電壓和小信號電導
        const Vd = Va - Vc;
        const Gd = this.evaluateConductance(Vd);
        
        // 在雅可比矩陣中蓋印電導項
        if (anodeIndex !== undefined && anodeIndex >= 0) {
            jacobian.addAt(anodeIndex, anodeIndex, Gd);
            if (cathodeIndex !== undefined && cathodeIndex >= 0) {
                jacobian.addAt(anodeIndex, cathodeIndex, -Gd);
            }
        }
        
        if (cathodeIndex !== undefined && cathodeIndex >= 0) {
            if (anodeIndex !== undefined && anodeIndex >= 0) {
                jacobian.addAt(cathodeIndex, anodeIndex, -Gd);
            }
            jacobian.addAt(cathodeIndex, cathodeIndex, Gd);
        }
    }
    
    /**
     * 在殘差向量中蓋印非線性電流項 (用於 Newton-Raphson)
     * 
     * @param {Vector} residual 殘差向量
     * @param {Vector} solution 當前解向量  
     * @param {Map<string, number>} nodeMap 節點映射
     */
    stampResidual(residual, solution, nodeMap) {
        const anodeIndex = nodeMap.get(this.anode);
        const cathodeIndex = nodeMap.get(this.cathode);
        
        // 獲取當前節點電壓
        let Va = 0, Vc = 0;
        if (anodeIndex !== undefined && anodeIndex >= 0) {
            Va = solution.get(anodeIndex);
        }
        if (cathodeIndex !== undefined && cathodeIndex >= 0) {
            Vc = solution.get(cathodeIndex);
        }
        
        // 計算二極體電流
        const Vd = Va - Vc;
        const Id = this.evaluateCurrent(Vd);
        
        // 在殘差向量中加入電流項
        if (anodeIndex !== undefined && anodeIndex >= 0) {
            residual.addAt(anodeIndex, Id);
        }
        
        if (cathodeIndex !== undefined && cathodeIndex >= 0) {
            residual.addAt(cathodeIndex, -Id);
        }
    }

    /**
     * 獲取詳細的工作點狀態
     */
    getOperatingStatus() {
        return {
            name: this.name,
            type: 'NonlinearDiode',
            model: 'Shockley',
            workingPoint: { ...this.workingPoint },
            parameters: {
                Is: this.Is,
                Is_actual: this.Is_actual,
                n: this.n,
                Vt: this.Vt,
                T: this.T,
                Rs: this.Rs
            },
            operatingRegion: this.getOperatingRegion()
        };
    }
    
    /**
     * 判斷工作區域
     */
    getOperatingRegion() {
        const vd = this.workingPoint.voltage;
        
        if (vd > 0.5) {
            return 'forward_conduction';
        } else if (vd > 0.1) {
            return 'forward_weak';
        } else if (vd > -0.1) {
            return 'near_zero';
        } else {
            return 'reverse_bias';
        }
    }
    
    /**
     * 序列化
     */
    toJSON() {
        return {
            ...super.toJSON(),
            model: 'shockley',
            parameters: {
                Is: this.Is,
                n: this.n,
                T: this.T,
                Rs: this.Rs,
                Cj: this.Cj
            },
            operatingStatus: this.getOperatingStatus()
        };
    }
    
    /**
     * 複製二極體
     */
    clone() {
        return new NonlinearDiode(this.name, this.nodes, {
            Is: this.Is,
            n: this.n,
            T: this.T,
            Rs: this.Rs,
            Cj: this.Cj
        });
    }
}