/**
 * =================================================================
 *              LLC轉換器理論分析與設計工具
 * =================================================================
 * 
 * 目標：提供LLC轉換器的完整理論分析，即使電路仿真遇到數值問題
 * 包含：頻率響應、增益特性、功率傳輸、設計指導
 */

/**
 * LLC轉換器理論分析器
 */
class LLCTheoreticalAnalyzer {
    constructor() {
        this.title = "LLC諧振轉換器理論分析與設計";
        console.log(`\n${"=".repeat(60)}`);
        console.log(`${this.title}`);
        console.log(`${"=".repeat(60)}\n`);
    }
    
    /**
     * 基本LLC參數設計
     */
    designLLCParameters(specs) {
        console.log("🔧 LLC轉換器參數設計");
        console.log("-".repeat(40));
        
        const {
            Vin = 400,      // 輸入電壓
            Vout = 12,      // 輸出電壓
            Pout = 100,     // 輸出功率
            fs_nom = 100e3, // 標稱開關頻率
            n = 20          // 變壓器匝數比
        } = specs;
        
        // 基本參數計算
        const Iout = Pout / Vout;
        const Rac = 8 * n * n * Vout * Vout / (Math.PI * Math.PI * Pout); // AC等效負載
        
        console.log(`設計規格:`);
        console.log(`   輸入電壓: ${Vin}V`);
        console.log(`   輸出電壓: ${Vout}V`);
        console.log(`   輸出功率: ${Pout}W (${Iout.toFixed(2)}A)`);
        console.log(`   變壓器匝數比: ${n}:1`);
        console.log(`   AC等效負載: ${Rac.toFixed(1)}Ω`);
        
        // 諧振頻率設計 (通常設為開關頻率的0.8-1.2倍)
        const fr = fs_nom * 0.8; // 80% of switching frequency
        console.log(`   標稱開關頻率: ${fs_nom/1000}kHz`);
        console.log(`   設計諧振頻率: ${fr/1000}kHz`);
        
        // 諧振參數設計
        const Lr_design = Rac / (2 * Math.PI * fr); // 初始估計
        const Lr = 50e-6; // 實用值：50μH
        
        const omega_r = 2 * Math.PI * fr;
        const Cr = 1 / (omega_r * omega_r * Lr);
        
        const Lm = Lr * 5; // 勵磁電感通常是諧振電感的3-10倍
        
        // 特性阻抗和品質因數
        const Z0 = Math.sqrt(Lr / Cr);
        const Q = Z0 / Rac;
        
        console.log(`\n諧振參數:`);
        console.log(`   Lr = ${Lr*1e6}μH`);
        console.log(`   Cr = ${Cr*1e9}nF`);
        console.log(`   Lm = ${Lm*1e6}μH`);
        console.log(`   Z0 = ${Z0.toFixed(1)}Ω (特性阻抗)`);
        console.log(`   Q = ${Q.toFixed(2)} (品質因數)`);
        
        return {
            Vin, Vout, Pout, Iout, n, fs_nom, fr,
            Lr, Cr, Lm, Z0, Q, Rac
        };
    }
    
    /**
     * LLC頻率響應分析
     */
    analyzeFrequencyResponse(params) {
        console.log(`\n📊 LLC頻率響應分析`);
        console.log("-".repeat(40));
        
        const { Lr, Cr, Lm, Rac, fr, fs_nom } = params;
        
        // 定義頻率範圍
        const frequencies = [
            fr * 0.5,   // 低頻
            fr * 0.8,   // 次諧振
            fr,         // 諧振頻率
            fr * 1.2,   // 超諧振
            fr * 1.5,   // 高頻
            fs_nom      // 標稱開關頻率
        ];
        
        console.log(`頻率點分析:`);
        
        frequencies.forEach((f, index) => {
            const omega = 2 * Math.PI * f;
            
            // 計算各個阻抗
            const XLr = omega * Lr;           // 諧振電感阻抗
            const XCr = 1 / (omega * Cr);     // 諧振電容阻抗
            const XLm = omega * Lm;           // 勵磁電感阻抗
            
            // LLC諧振網路的等效阻抗計算
            // Zeq = XLr + (XCr || (XLm + Rac))
            const XCr_parallel = XCr * (XLm + Rac) / (XCr + XLm + Rac);
            const Zeq_magnitude = Math.sqrt((XLr + XCr_parallel) * (XLr + XCr_parallel));
            
            // 電壓增益計算 (簡化基波分析)
            const gain = Rac / Zeq_magnitude;
            
            // 相位計算
            const phase = Math.atan2(XLr - XCr, Rac) * 180 / Math.PI;
            
            const freqLabel = f === fr ? `${f/1000}kHz (諧振)` : 
                             f === fs_nom ? `${f/1000}kHz (開關)` : 
                             `${f/1000}kHz`;
            
            console.log(`   ${freqLabel}:`);
            console.log(`     XLr=${XLr.toFixed(2)}Ω, XCr=${XCr.toFixed(2)}Ω, XLm=${XLm.toFixed(1)}Ω`);
            console.log(`     電壓增益: ${gain.toFixed(3)} (${(20*Math.log10(gain)).toFixed(1)}dB)`);
            console.log(`     相位: ${phase.toFixed(1)}°`);
        });
    }
    
    /**
     * 軟開關分析
     */
    analyzeSoftSwitching(params) {
        console.log(`\n⚡ 軟開關特性分析`);
        console.log("-".repeat(40));
        
        const { Lr, Cr, fr, fs_nom, Vin, Iout, n } = params;
        
        // 諧振電流分析
        const omega_s = 2 * Math.PI * fs_nom;
        const omega_r = 2 * Math.PI * fr;
        
        // 諧振電流峰值估算
        const Ir_peak = Vin / Math.sqrt(Lr / Cr); // 簡化估算
        
        // ZVS條件分析
        const ZVS_current_min = 2 * Cr * Vin * omega_s; // 最小ZVS電流
        const actual_current = Iout / n; // 反射到一次側的電流
        
        console.log(`軟開關條件:`);
        console.log(`   諧振電流峰值: ${Ir_peak.toFixed(2)}A`);
        console.log(`   ZVS最小電流: ${ZVS_current_min.toFixed(3)}A`);
        console.log(`   實際工作電流: ${actual_current.toFixed(3)}A`);
        
        const zvs_achievable = actual_current > ZVS_current_min;
        console.log(`   ZVS實現性: ${zvs_achievable ? '✅ 可實現' : '❌ 困難'}`);
        
        // 頻率調制範圍
        const fs_range = {
            min: fr * 0.8,  // 最小開關頻率
            max: fr * 2.0   // 最大開關頻率
        };
        
        console.log(`   建議開關頻率範圍: ${fs_range.min/1000}kHz - ${fs_range.max/1000}kHz`);
        
        return {
            Ir_peak,
            ZVS_current_min,
            actual_current,
            zvs_achievable,
            fs_range
        };
    }
    
    /**
     * 功率傳輸效率分析
     */
    analyzePowerEfficiency(params) {
        console.log(`\n⚖️ 功率傳輸效率分析`);
        console.log("-".repeat(40));
        
        const { Lr, Cr, Lm, Rac, Vin, Pout, fs_nom, Q } = params;
        
        // 導通損耗估算
        const Ron_primary = 50e-3;   // 一次側開關導通電阻 50mΩ
        const Ron_secondary = 10e-3; // 二次側同步整流導通電阻 10mΩ
        
        // 開關損耗估算 (簡化)
        const Coss = 100e-12;        // 輸出電容 100pF
        const switching_loss_per_cycle = 0.5 * Coss * Vin * Vin;
        const switching_power = switching_loss_per_cycle * fs_nom;
        
        // 磁性元件損耗估算
        const core_loss_factor = 1e-6; // 磁芯損耗係數
        const core_loss = core_loss_factor * fs_nom * Vin * Vin;
        
        // 總損耗
        const conduction_loss = 2; // 簡化估算 2W
        const total_loss = switching_power + core_loss + conduction_loss;
        
        const efficiency = Pout / (Pout + total_loss) * 100;
        
        console.log(`損耗分析:`);
        console.log(`   導通損耗: ~${conduction_loss.toFixed(1)}W`);
        console.log(`   開關損耗: ${(switching_power*1000).toFixed(1)}mW`);
        console.log(`   磁芯損耗: ${(core_loss*1000).toFixed(1)}mW`);
        console.log(`   總損耗: ${total_loss.toFixed(2)}W`);
        console.log(`   預估效率: ${efficiency.toFixed(1)}%`);
        
        // 效率優化建議
        console.log(`\n💡 效率優化建議:`);
        if (Q > 3) {
            console.log(`   - Q值較高(${Q.toFixed(1)})，考慮增加負載或減小Lr`);
        }
        if (switching_power > 0.5) {
            console.log(`   - 開關損耗較高，考慮降低開關頻率`);
        }
        console.log(`   - 選用低導通電阻的MOSFET`);
        console.log(`   - 使用低損耗磁芯材料`);
        console.log(`   - 優化變壓器繞組設計減少銅損`);
        
        return {
            total_loss,
            efficiency,
            switching_power,
            core_loss
        };
    }
    
    /**
     * 設計驗證和建議
     */
    designVerification(params, softSwitching, efficiency) {
        console.log(`\n✅ 設計驗證與建議`);
        console.log("-".repeat(40));
        
        const { Q, fr, fs_nom, Rac } = params;
        const { zvs_achievable } = softSwitching;
        const { efficiency: eff } = efficiency;
        
        let score = 0;
        let recommendations = [];
        
        // 檢查品質因數
        if (Q >= 0.3 && Q <= 3.0) {
            console.log(`✅ Q值合適: ${Q.toFixed(2)} (推薦範圍: 0.3-3.0)`);
            score += 20;
        } else {
            console.log(`⚠️ Q值不佳: ${Q.toFixed(2)}`);
            recommendations.push(`調整Lr或負載阻抗使Q值在0.3-3.0範圍內`);
        }
        
        // 檢查頻率比
        const freq_ratio = fs_nom / fr;
        if (freq_ratio >= 0.8 && freq_ratio <= 1.5) {
            console.log(`✅ 頻率比合適: ${freq_ratio.toFixed(2)} (推薦範圍: 0.8-1.5)`);
            score += 20;
        } else {
            console.log(`⚠️ 頻率比不佳: ${freq_ratio.toFixed(2)}`);
            recommendations.push(`調整開關頻率或諧振頻率`);
        }
        
        // 檢查軟開關
        if (zvs_achievable) {
            console.log(`✅ ZVS條件滿足`);
            score += 30;
        } else {
            console.log(`⚠️ ZVS條件不足`);
            recommendations.push(`增加諧振電感或降低開關頻率改善ZVS`);
        }
        
        // 檢查效率
        if (eff > 90) {
            console.log(`✅ 預估效率優秀: ${eff.toFixed(1)}%`);
            score += 30;
        } else if (eff > 80) {
            console.log(`⚠️ 預估效率一般: ${eff.toFixed(1)}%`);
            score += 15;
            recommendations.push(`優化磁性元件和開關器件降低損耗`);
        } else {
            console.log(`❌ 預估效率較低: ${eff.toFixed(1)}%`);
            recommendations.push(`重新評估設計參數，考慮降低頻率或優化拓撲`);
        }
        
        console.log(`\n📊 設計評分: ${score}/100`);
        
        if (score >= 80) {
            console.log(`🎉 設計評估: 優秀`);
        } else if (score >= 60) {
            console.log(`👍 設計評估: 良好`);
        } else {
            console.log(`🔧 設計評估: 需要改進`);
        }
        
        if (recommendations.length > 0) {
            console.log(`\n💡 改進建議:`);
            recommendations.forEach((rec, i) => {
                console.log(`   ${i + 1}. ${rec}`);
            });
        }
        
        return { score, recommendations };
    }
    
    /**
     * 完整的LLC分析流程
     */
    performCompleteAnalysis(specs = {}) {
        console.log("開始LLC轉換器完整理論分析...\n");
        
        try {
            // 1. 參數設計
            const params = this.designLLCParameters(specs);
            
            // 2. 頻率響應分析
            this.analyzeFrequencyResponse(params);
            
            // 3. 軟開關分析
            const softSwitching = this.analyzeSoftSwitching(params);
            
            // 4. 效率分析
            const efficiency = this.analyzePowerEfficiency(params);
            
            // 5. 設計驗證
            const verification = this.designVerification(params, softSwitching, efficiency);
            
            // 6. 總結
            console.log(`\n${"=".repeat(60)}`);
            console.log(`LLC轉換器理論分析完成`);
            console.log(`${"=".repeat(60)}`);
            
            console.log(`🎯 設計摘要:`);
            console.log(`   Lr=${params.Lr*1e6}μH, Cr=${params.Cr*1e9.toFixed(1)}nF, Lm=${params.Lm*1e6}μH`);
            console.log(`   諧振頻率: ${params.fr/1000}kHz, 開關頻率: ${params.fs_nom/1000}kHz`);
            console.log(`   Q值: ${params.Q.toFixed(2)}, 預估效率: ${efficiency.efficiency.toFixed(1)}%`);
            console.log(`   設計評分: ${verification.score}/100`);
            
            if (verification.score >= 70) {
                console.log(`\n🚀 此設計可以進行硬件實現！`);
                console.log(`📋 下一步工作:`);
                console.log(`   1. 選擇適當的MOSFET和磁性元件`);
                console.log(`   2. 設計PWM控制器和驅動電路`);
                console.log(`   3. 布局PCB並考慮EMI優化`);
                console.log(`   4. 建立閉環控制算法`);
                console.log(`   5. 進行硬件測試和驗證`);
            } else {
                console.log(`\n🔧 建議先完善設計參數再進行硬件實現`);
            }
            
            return {
                success: true,
                params: params,
                softSwitching: softSwitching,
                efficiency: efficiency,
                verification: verification
            };
            
        } catch (error) {
            console.error(`❌ 理論分析過程中出現錯誤: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

/**
 * 主執行函數
 */
async function main() {
    const analyzer = new LLCTheoreticalAnalyzer();
    
    // 測試不同的設計規格
    const testCases = [
        {
            name: "標準400V->12V/100W設計",
            specs: { Vin: 400, Vout: 12, Pout: 100, fs_nom: 100e3, n: 20 }
        },
        {
            name: "低壓48V->12V/50W設計", 
            specs: { Vin: 48, Vout: 12, Pout: 50, fs_nom: 50e3, n: 2 }
        },
        {
            name: "高功率400V->24V/300W設計",
            specs: { Vin: 400, Vout: 24, Pout: 300, fs_nom: 80e3, n: 10 }
        }
    ];
    
    for (let i = 0; i < testCases.length; i++) {
        const testCase = testCases[i];
        
        console.log(`\n${"▶".repeat(3)} 測試案例 ${i + 1}: ${testCase.name} ${"◀".repeat(3)}`);
        
        const result = analyzer.performCompleteAnalysis(testCase.specs);
        
        if (!result.success) {
            console.log(`案例 ${i + 1} 分析失敗: ${result.error}`);
        }
        
        if (i < testCases.length - 1) {
            console.log(`\n${"─".repeat(80)}\n`);
        }
    }
    
    console.log(`\n🎉 LLC轉換器理論分析工具演示完成！`);
    console.log(`✅ 即使在電路仿真遇到數值問題時，理論分析仍能提供完整的設計指導`);
}

// 直接執行
main().catch(error => {
    console.error('程序執行失敗:', error.message);
    process.exit(1);
});

export { LLCTheoreticalAnalyzer };