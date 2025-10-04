/**
 * 基於混合互補問題 (MCP) 的 MOSFET 模型
 * 
 * 實現理想開關 MOSFET + 體二極管的組合模型：
 * 
 * 1. MOSFET 通道：
 *    - ON:  Vds = Ron * Ids
 *    - OFF: Ids = 0
 * 
 * 2. 體二極管 (Source到Drain)：
 *    - 互補條件：0 ≤ (Vds - Vf_body) ⊥ Ibody ≥ 0
 *    - 注：對於NMOS，體二極管是Source(-)到Drain(+)，正向電壓為Vds
 * 
 * 這種精確建模消除了傳統PWL模型的數值問題，
 * 特別適用於電力電子應用中的硬開關場景
 */

import { BaseComponent } from './base.js';
import { Matrix, Vector } from '../core/linalg.js';

export class MOSFET_MCP extends BaseComponent {
    constructor(name, nodes, params = {}) {
        // nodes: [drain, source, gate] 或 [drain, source] (gate由外部控制)
        super(name, 'M_MCP', nodes.slice(0, 2), 0, params);  // 只有D, S參與電路矩陣
        
        this.drainNode = nodes[0];
        this.sourceNode = nodes[1];
        this.gateNode = nodes[2] || null;  // 可選，如果由外部邏輯控制
        
        // === MOSFET 通道參數 ===
        this.Ron = params.Ron || 1e-3;              // 導通電阻 (Ω)
        this.Roff = params.Roff || 1e12;            // 截止電阻 (Ω，理論上無穷大)
        this.channelType = params.type || 'NMOS';   // 'NMOS' 或 'PMOS' (不覆蓋 MCP type)
        
        // === 體二極管參數 ===
        this.Vf_body = params.Vf_body || 0.7;      // 體二極管導通電壓 (V)
        this.Ron_body = params.Ron_body || 5e-3;   // 體二極管導通電阻 (Ω)
        
        // === 閘極控制參數 ===
        this.Vth = params.Vth || 2.0;              // 閾值電壓 (V)
        this.gateVoltage = params.initialGate || 0; // 當前閘極電壓
        
        // === 狀態變量 ===
        this.gateState = false;                     // true=ON, false=OFF
        this.channelCurrent = 0;                    // 通道電流 Ids
        this.bodyCurrent = 0;                       // 體二極管電流 Ibody
        this.previousVds = 0;                       // 上一次的 Vds
        
        // === MCP 變量索引 ===
        this.channelCurrentIndex = -1;              // 通道電流變量索引
        this.bodyCurrentIndex = -1;                 // 體二極管電流變量索引
        this.bodyComplementarityIndex = -1;         // 體二極管互補約束索引
        this.channelEquationIndex = -1;             // 通道約束方程索引
        
        // === 控制模式 ===
        this.controlMode = params.controlMode || 'external';  // 'external', 'voltage', 'logic'
        this.pwmController = null;                            // PWM控制器引用
        
        if (params.debug) {
            console.log(`🔌 創建 MCP MOSFET ${name}: ${this.channelType}, Ron=${this.Ron}Ω, Vth=${this.Vth}V`);
        }
    }

    /**
     * 設置閘極狀態 (外部控制模式)
     */
    setGateState(state, voltage = null) {
        this.gateState = Boolean(state);
        if (voltage !== null) {
            this.gateVoltage = voltage;
        }
        
        if (this.debug) {
            console.log(`  🎚️ ${this.name} 閘極: ${this.gateState ? 'ON' : 'OFF'} (${this.gateVoltage}V)`);
        }
    }

    /**
     * 預先註冊 MCP 變量和約束
     */
    registerVariables(mnaBuilder) {
        // === 正確的 MNA 架構：變量索引 = 方程索引 ===
        
        // 註冊通道電流變量
        this.channelCurrentIndex = mnaBuilder.addExtraVariable(`${this.name}_Ids`);
        // 通道方程索引與變量索引相同 (對角結構)
        this.channelEquationIndex = this.channelCurrentIndex;
        
        // 註冊體二極管電流變量  
        this.bodyCurrentIndex = mnaBuilder.addExtraVariable(`${this.name}_Ibody`);
        // 體電流方程索引與變量索引相同
        this.bodyEquationIndex = this.bodyCurrentIndex;
        
        // 註冊體二極管輔助變量
        this.bodyAuxiliaryIndex = mnaBuilder.addExtraVariable(`${this.name}_w`);
        // w 定義方程索引與變量索引相同
        this.bodyAuxiliaryEquationIndex = this.bodyAuxiliaryIndex;
        
        // 註冊體二極管互補約束 (LCP 部分)
        this.bodyComplementarityIndex = mnaBuilder.addComplementarityEquation();
        
        if (mnaBuilder.debug) {
            console.log(`    📝 ${this.name}: 通道電流[${this.channelCurrentIndex}], 體電流[${this.bodyCurrentIndex}], 輔助變量w[${this.bodyAuxiliaryIndex}]`);
            console.log(`    📝 ${this.name}: 通道方程[${this.channelEquationIndex}], 體電流方程[${this.bodyEquationIndex}], w定義方程[${this.bodyAuxiliaryEquationIndex}], LCP[${this.bodyComplementarityIndex}]`);
        }
    }

    /**
     * 為 MNA-LCP 系統貢獻約束
     */
    getLCPContribution(mnaBuilder, time) {
        const nD = mnaBuilder.getNodeIndex(this.drainNode);
        const nS = mnaBuilder.getNodeIndex(this.sourceNode);
        
        // === 使用預註冊的電流變量 ===
        
        // === KCL 約束：總電流 = 通道電流 + 體二極管電流 ===
        // 電流從 Drain 流向 Source (正向定義)
        if (nD >= 0) {
            mnaBuilder.addToMatrix(nD, this.channelCurrentIndex, 1.0);   // +Ids 離開Drain
            mnaBuilder.addToMatrix(nD, this.bodyCurrentIndex, 1.0);      // +Ibody 離開Drain  
        }
        if (nS >= 0) {
            mnaBuilder.addToMatrix(nS, this.channelCurrentIndex, -1.0);  // -Ids 進入Source
            mnaBuilder.addToMatrix(nS, this.bodyCurrentIndex, -1.0);     // -Ibody 進入Source
        }

        // === MOSFET 通道約束 ===
        this.addChannelConstraints(mnaBuilder, nD, nS);
        
        // === 體二極管互補約束 ===
        this.addBodyDiodeConstraints(mnaBuilder, nD, nS);
        
        if (mnaBuilder.debug) {
            console.log(`  🔌 ${this.name}: 通道[${this.channelCurrentIndex}], 體二極管[${this.bodyCurrentIndex}]`);
        }
    }

    /**
     * 添加 MOSFET 通道約束
     */
    addChannelConstraints(mnaBuilder, nD, nS) {
        // 使用預先註冊的方程索引約束通道電流
        const eqIndex = this.channelEquationIndex;
        
        if (this.gateState) {
            // === 導通狀態：Vds = Ron * Ids ===
            // 方程：Vd - Vs - Ron*Ids = 0
            if (nD >= 0) mnaBuilder.addToMatrix(eqIndex, nD, 1.0);           // +Vd
            if (nS >= 0) mnaBuilder.addToMatrix(eqIndex, nS, -1.0);          // -Vs  
            mnaBuilder.addToMatrix(eqIndex, this.channelCurrentIndex, -this.Ron);  // -Ron*Ids
            mnaBuilder.addToRHS(eqIndex, 0.0);                               // = 0
            
        } else {
            // === 截止狀態：Ids = 0 ===  
            // 方程：Ids = 0
            mnaBuilder.addToMatrix(eqIndex, this.channelCurrentIndex, 1.0);  // Ids
            mnaBuilder.addToRHS(eqIndex, 0.0);                               // = 0
        }
    }

    /**
     * 添加體二極管互補約束  
     * 體二極管模型 (Source → Drain)：
     * - 對於NMOS，體二極管從Source(陰極)到Drain(陽極)
     * - 正向導通條件：Vds > Vf_body
     * 互補條件：0 ≤ (Vds - Vf_body) ⊥ Ibody ≥ 0
     */
    addBodyDiodeConstraints(mnaBuilder, nD, nS) {
        // === 步驟1：體二極管電流的 MNA 約束 ===
        // 為 Ibody 變量創建約束：通過 LCP 求解，這裡設為自由變量
        // 方程：Ibody = 0 (預設截止，將由 LCP 約束覆蓋)
        mnaBuilder.addToMatrix(this.bodyEquationIndex, this.bodyCurrentIndex, 1.0);
        mnaBuilder.addToRHS(this.bodyEquationIndex, 0.0);
        
        // === 步驟2：輔助變量 w 的定義方程 ===  
        // 體二極管模型 (Source → Drain)：
        // w = (Vd - Vs) - Ron_body*Ibody - Vf_body  
        // 重排為：w - (Vd - Vs) + Ron_body*Ibody = -Vf_body
        
        mnaBuilder.addToMatrix(this.bodyAuxiliaryEquationIndex, this.bodyAuxiliaryIndex, 1.0);  // +w
        
        // 電壓項：(Vd - Vs) = Vds，Source到Drain的電壓
        if (nD >= 0) {
            mnaBuilder.addToMatrix(this.bodyAuxiliaryEquationIndex, nD, -1.0);  // -Vd  
        }
        if (nS >= 0) {
            mnaBuilder.addToMatrix(this.bodyAuxiliaryEquationIndex, nS, 1.0);   // +Vs
        }
        
        // 體二極管電流項
        mnaBuilder.addToMatrix(this.bodyAuxiliaryEquationIndex, this.bodyCurrentIndex, this.Ron_body);  // +Ron_body*Ibody
        
        // 右側常數項
        mnaBuilder.addToRHS(this.bodyAuxiliaryEquationIndex, -this.Vf_body);  // = -Vf_body
        
        // === 步驟3：設置 LCP 約束 ===
        // 互補條件：0 ≤ w ⊥ Ibody ≥ 0
        // w 直接映射到 LCP
        mnaBuilder.setLCPMatrix(this.bodyComplementarityIndex, this.bodyAuxiliaryIndex, 1.0);  // w -> LCP
        mnaBuilder.setLCPVector(this.bodyComplementarityIndex, 0.0);         // 無額外常數
        
        // 建立互補映射：w ⊥ Ibody  
        mnaBuilder.mapLCPVariable(this.bodyComplementarityIndex, this.bodyCurrentIndex);
        
        if (mnaBuilder.debug) {
            console.log(`    🔌 ${this.name}: 體電流方程[${this.bodyEquationIndex}], w定義[${this.bodyAuxiliaryEquationIndex}], LCP[${this.bodyComplementarityIndex}]`);
        }
    }

    /**
     * 電壓控制模式 (如果閘極連接到電路節點)
     */
    addVoltageControlConstraints(mnaBuilder, nD, nS) {
        if (!this.gateNode || this.controlMode !== 'voltage') return;
        
        const nG = mnaBuilder.getNodeIndex(this.gateNode);
        if (nG < 0) return;
        
        // 簡化實現：根據 Vgs 設定開關狀態
        // 實際的 MCP 實現會更復雜，需要額外的互補約束
        
        // 這裡可以添加：
        // - Vgs > Vth 時的導通條件
        // - Vgs < Vth 時的截止條件
        // - 閾值附近的平滑過渡
        
        // 為簡化演示，暫時使用外部控制模式
    }

    /**
     * PWM 控制接口
     */
    setPWMController(pwmController) {
        this.pwmController = pwmController;
        this.controlMode = 'pwm';
    }

    /**
     * 更新 PWM 狀態 (在每個時間步調用)
     */
    updatePWMState(time) {
        if (this.pwmController && this.controlMode === 'pwm') {
            const newState = this.pwmController.getState(time);
            this.setGateState(newState);
        }
    }

    /**
     * 計算功耗
     */
    calculatePower(nodeVoltages, branchCurrents) {
        const vd = nodeVoltages.get(this.drainNode) || 0;
        const vs = nodeVoltages.get(this.sourceNode) || 0;
        const vds = vd - vs;
        
        // 從解中提取電流
        let channelCurrent = 0;
        let bodyCurrent = 0;
        
        if (this.channelCurrentIndex >= 0) {
            channelCurrent = branchCurrents.get(this.channelCurrentIndex) || 0;
        }
        if (this.bodyCurrentIndex >= 0) {
            bodyCurrent = branchCurrents.get(this.bodyCurrentIndex) || 0;
        }
        
        const totalCurrent = channelCurrent + bodyCurrent;
        
        // 功耗分解
        const channelPower = this.gateState ? (channelCurrent * channelCurrent * this.Ron) : 0;
        const bodyPower = bodyCurrent * (vds + this.Vf_body);  // 近似
        
        return {
            total: vds * totalCurrent,
            channel: channelPower, 
            body: bodyPower,
            switching: 0  // 開關損耗需要額外計算
        };
    }

    /**
     * 更新歷史狀態
     */
    updateHistory(nodeVoltages, branchCurrents) {
        const vd = nodeVoltages.get(this.drainNode) || 0;
        const vs = nodeVoltages.get(this.sourceNode) || 0;
        
        this.previousVds = vd - vs;
        
        if (this.channelCurrentIndex >= 0) {
            this.channelCurrent = branchCurrents.get(this.channelCurrentIndex) || 0;
        }
        if (this.bodyCurrentIndex >= 0) {
            this.bodyCurrent = branchCurrents.get(this.bodyCurrentIndex) || 0;
        }
    }

    /**
     * 獲取工作點信息
     */
    getOperatingPoint() {
        const totalCurrent = this.channelCurrent + this.bodyCurrent;
        
        return {
            name: this.name,
            type: 'MOSFET_MCP',
            gateState: this.gateState,
            gateVoltage: this.gateVoltage,
            vds: this.previousVds,
            channelCurrent: this.channelCurrent,
            bodyCurrent: this.bodyCurrent,
            totalCurrent: totalCurrent,
            conducting: Math.abs(totalCurrent) > 1e-12,
            bodyDiodeConducting: Math.abs(this.bodyCurrent) > 1e-12,
            operatingRegion: this.getOperatingRegion()
        };
    }

    /**
     * 判斷工作區域
     */
    getOperatingRegion() {
        if (this.gateState) {
            if (Math.abs(this.channelCurrent) > 1e-12) {
                return 'channel_conducting';
            } else {
                return 'channel_on_no_current';
            }
        } else {
            if (Math.abs(this.bodyCurrent) > 1e-12) {
                return 'body_diode_conducting';
            } else {
                return 'fully_off';
            }
        }
    }

    /**
     * 調試字符串
     */
    toString() {
        const op = this.getOperatingPoint();
        return `${this.name}(MCP): Gate=${op.gateState ? 'ON' : 'OFF'}, ` +
               `Vds=${op.vds.toFixed(3)}V, ` +
               `Ich=${op.channelCurrent.toExponential(3)}A, ` +
               `Ibody=${op.bodyCurrent.toExponential(3)}A, ` +
               `Region=${op.operatingRegion}`;
    }

    /**
     * 驗證互補條件 (調試用)
     */
    static verifyComplementarity(vsd, ibody, Vf_body, Ron_body, tolerance = 1e-10) {
        const w = vsd - Ron_body * ibody - Vf_body;
        const currentNonNeg = ibody >= -tolerance;
        const wNonNeg = w >= -tolerance;
        const complementarity = Math.abs(w * ibody);
        
        return {
            valid: currentNonNeg && wNonNeg && complementarity < tolerance,
            currentNonNeg,
            wNonNeg, 
            w,
            complementarity,
            tolerance
        };
    }
}

/**
 * PWM 控制器類
 */
export class PWMController {
    constructor(frequency, dutyCycle, phase = 0) {
        this.frequency = frequency;        // Hz
        this.dutyCycle = dutyCycle;       // 0-1
        this.phase = phase;               // 相位偏移 (秒)
        this.period = 1.0 / frequency;
    }

    getState(time) {
        const adjustedTime = (time - this.phase) % this.period;
        const onTime = this.period * this.dutyCycle;
        return adjustedTime < onTime;
    }

    setDutyCycle(newDutyCycle) {
        this.dutyCycle = Math.max(0, Math.min(1, newDutyCycle));
    }
}

/**
 * 創建預配置的 NMOS 開關
 */
export function createNMOSSwitch(name, drain, source, gate, params = {}) {
    const defaultParams = {
        type: 'NMOS',
        Ron: 1e-3,          // 1mΩ
        Vth: 2.0,           // 2V 閾值
        Vf_body: 0.7,       // 體二極管 0.7V
        Ron_body: 5e-3,     // 體二極管 5mΩ
        ...params
    };

    return new MOSFET_MCP(name, [drain, source, gate], defaultParams);
}

/**
 * 創建預配置的 PMOS 開關
 */
export function createPMOSSwitch(name, drain, source, gate, params = {}) {
    const defaultParams = {
        type: 'PMOS',
        Ron: 2e-3,          // PMOS 通常電阻稍大
        Vth: -2.0,          // 負閾值電壓
        Vf_body: 0.7,
        Ron_body: 8e-3,
        ...params
    };

    return new MOSFET_MCP(name, [drain, source, gate], defaultParams);
}

/**
 * 創建功率 MOSFET
 */
export function createPowerMOSFET(name, drain, source, gate, params = {}) {
    const powerParams = {
        Ron: 10e-3,         // 較大的導通電阻
        Vth: 4.0,           // 較高的閾值電壓
        Vf_body: 0.8,       // 功率器件體二極管
        Ron_body: 20e-3,
        ...params
    };

    return new MOSFET_MCP(name, [drain, source, gate], powerParams);
}

export default MOSFET_MCP;