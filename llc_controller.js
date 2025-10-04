//
// llc_controller.js
// 使用者可修改的 LLC 轉換器控制器
//

/**
 * LLC 控制器類別
 * 實現基於電壓回授的可變頻率控制 (VFC)
 */
export class LLCController {
    /**
     * @param {object} config 控制器配置
     * @param {number} config.vRef - 參考電壓 (目標輸出電壓)
     * @param {number} config.nominalFreq - 標稱開關頻率 (Hz)
     * @param {number} config.minFreq - 最小開關頻率 (Hz)
     * @param {number} config.maxFreq - 最大開關頻率 (Hz)
     * @param {number} config.deadTime - 半橋死區時間 (s)
     * @param {number} config.kp - PI 控制器比例增益
     * @param {number} config.ki - PI 控制器積分增益
     */
    constructor(config) {
        this.vRef = config.vRef;
        this.nominalFreq = config.nominalFreq;
        this.minFreq = config.minFreq;
        this.maxFreq = config.maxFreq;
        this.deadTime = config.deadTime;
        this.kp = config.kp;
        this.ki = config.ki;

        // PI 控制器狀態變數
        this.integral = 0; // 積分項累加器
        this.lastTime = 0;
        
        // 初始頻率設定為標稱頻率
        this.currentFreq = this.nominalFreq;
        
        console.log('🕹️ LLC 控制器已初始化');
        console.log(`   - 目標電壓: ${this.vRef.toFixed(2)}V`);
        console.log(`   - 頻率範圍: ${(this.minFreq/1e3).toFixed(1)}kHz - ${(this.maxFreq/1e3).toFixed(1)}kHz`);
        console.log(`   - PI 增益: Kp=${this.kp.toExponential(2)}, Ki=${this.ki.toExponential(2)}`);
    }

    /**
     * 更新控制器狀態並返回 MOSFET 的閘極訊號
     * @param {number} outputVoltage - 當前測量的輸出電壓
     * @param {number} currentTime - 當前的模擬時間
     * @returns {object} 閘極狀態, e.g., { 'M_H': true, 'M_L': false }
     */
    update(outputVoltage, currentTime) {
        // --- 1. 計算時間間隔 ---
        const dt = (this.lastTime > 0) ? (currentTime - this.lastTime) : 0;
        this.lastTime = currentTime;

        // --- 2. PI 控制器計算 ---
        const error = this.vRef - outputVoltage;

        // 更新積分項 (包含抗飽和機制)
        this.integral += this.ki * error * dt;
        this.integral = Math.max(-100e3, Math.min(100e3, this.integral)); // 限制積分器範圍防止飽和

        const controlOutput = this.kp * error + this.integral;

        // --- 3. 頻率調變 ---
        // 輸出電壓太高 -> error為負 -> controlOutput減小 -> 頻率增加 -> 增益下降
        // 輸出電壓太低 -> error為正 -> controlOutput增加 -> 頻率減小 -> 增益上升
        this.currentFreq = this.nominalFreq - controlOutput;
        
        // 限制頻率在安全範圍內
        this.currentFreq = Math.max(this.minFreq, Math.min(this.maxFreq, this.currentFreq));

        // --- 4. 生成 PWM 訊號 ---
        const period = 1.0 / this.currentFreq;
        const halfPeriod = period / 2.0;
        
        // 計算當前時間在一個週期內的位置
        const timeInCycle = currentTime % period;

        let highSideOn = false;
        let lowSideOn = false;

        // 🔍 添加詳細調試信息
        if (currentTime <= 6e-6) {  // 只在前6μs調試（超過一個完整週期）
            console.log(`🎯 Controller Debug t=${(currentTime*1e6).toFixed(2)}μs:`);
            console.log(`   error=${error.toFixed(2)}V, freq=${(this.currentFreq/1e3).toFixed(1)}kHz`);
            console.log(`   period=${(period*1e6).toFixed(3)}μs, halfPeriod=${(halfPeriod*1e6).toFixed(3)}μs`);
            console.log(`   timeInCycle=${(timeInCycle*1e6).toFixed(3)}μs, deadTime=${(this.deadTime*1e9).toFixed(0)}ns`);
        }

        // 高側開關導通區間 (考慮死區時間)
        if (timeInCycle > this.deadTime && timeInCycle < halfPeriod) {
            highSideOn = true;
        }

        // 低側開關導通區間 (考慮死區時間)
        if (timeInCycle > (halfPeriod + this.deadTime) && timeInCycle < period) {
            lowSideOn = true;
        }

        // 🔍 添加切換狀態調試
        if (currentTime <= 6e-6) {
            console.log(`   M_H=${highSideOn}, M_L=${lowSideOn}`);
            console.log(`   High: ${(timeInCycle*1e6).toFixed(3)} > ${(this.deadTime*1e9).toFixed(0)}ns && < ${(halfPeriod*1e6).toFixed(3)}μs?`);
            console.log(`   Low: ${(timeInCycle*1e6).toFixed(3)} > ${((halfPeriod + this.deadTime)*1e6).toFixed(3)}μs && < ${(period*1e6).toFixed(3)}μs?`);
        }

        // --- 5. 返回閘極狀態 ---
        // 控制器返回的元件名稱必須與 `llc_simulation.js` 中定義的 MOSFET 名稱一致
        return {
            'M_H': highSideOn,
            'M_L': lowSideOn
        };
    }

    /**
     * 獲取當前控制器狀態 (用於調試)
     * @returns {object}
     */
    getStatus() {
        return {
            frequency: this.currentFreq,
            integral: this.integral
        };
    }
}