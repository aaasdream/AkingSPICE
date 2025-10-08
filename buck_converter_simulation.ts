// 假设所有代码文件都已正确导入
// 这是一个模拟的入口文件

import { CircuitSimulationEngine } from './src/core/simulation/circuit_simulation_engine';
import { VoltageSourceFactory } from './src/components/sources/voltage_source';
import { Resistor } from './src/components/passive/resistor';
import { Capacitor } from './src/components/passive/capacitor';
import { Inductor } from './src/components/passive/inductor';
import { SmartDeviceFactory } from './src/core/devices/intelligent_device_factory';
import { ComponentInterface } from './src/core/interfaces/component';

async function simulateBuckConverter() {
  console.log("🚀 AkingSPICE 2.1 - Buck Converter Simulation 🚀");

  // 1. 初始化仿真引擎
  const engine = new CircuitSimulationEngine({
    endTime: 200e-6, // 仿真总时长 200µs
    initialTimeStep: 1e-9, // 初始步长 1ns
    minTimeStep: 1e-12, // 最小步长 1ps
    maxTimeStep: 1e-7, // 最大步长 100ns
    verboseLogging: true, // 开启详细日志以便观察
  });

  // 2. 定义电路参数
  const vin_dc = 12.0; // 输入电压
  const f_sw = 100e3; // 开关频率 100kHz
  const duty_cycle = 0.5; // 占空比 50%
  
  const period = 1 / f_sw;
  const pulse_width = period * duty_cycle;
  const rise_fall_time = 10e-9; // 10ns 上升/下降时间

  // 3. 定义所有组件，但暂时不创建智能设备
  const initialComponents: ComponentInterface[] = [
    VoltageSourceFactory.createDC('Vin', ['vin', '0'], vin_dc),
    VoltageSourceFactory.createPulse(
      'Vpulse',
      ['gate', '0'],
      0, 5, 0, rise_fall_time, rise_fall_time, pulse_width, period
    ),
    new Inductor('L1', ['sw', 'vout'], 100e-6),
    new Capacitor('C1', ['vout', '0'], 100e-6),
    new Resistor('Rload', ['vout', '0'], 5.0)
  ];
  
  // 4. 将初始组件添加到引擎以建立完整的节点映射
  engine.addDevices(initialComponents);

  // 5. 现在节点映射已建立，我们可以安全地创建并添加智能设备
  const smartComponents: ComponentInterface[] = [
    SmartDeviceFactory.createMOSFET('M1', [
        engine.getNodeIdByName('vin')!, 
        engine.getNodeIdByName('gate')!, 
        engine.getNodeIdByName('sw')!
    ], { 
        Vth: 2.0, 
        Kp: 50.0,
        lambda: 0.01
        // Removed dummy parameters that were causing validation errors.
        // The factory will now use its safe defaults.
    }),
    SmartDeviceFactory.createFreewheelDiode('D1', [
        engine.getNodeIdByName('0')!, 
        engine.getNodeIdByName('sw')!
    ], vin_dc, 5),
  ];

  // 6. 将智能组件添加到引擎
  engine.addDevices(smartComponents);

  // 7. 运行仿真
  try {
    const result = await engine.runSimulation();

    // 8. 分析并打印结果
    if (result.success) {
      console.log("\n✅ Simulation Completed Successfully!");
      console.log(`   - Final Time: ${result.finalTime.toExponential(3)}s`);
      console.log(`   - Total Steps: ${result.totalSteps}`);
      
      const { timePoints, nodeVoltages } = result.waveformData;
      const voutNodeId = engine.getNodeIdByName('vout');
      
      if (voutNodeId !== undefined) {
        const voutWaveform = nodeVoltages.get(voutNodeId) || [];
        if (timePoints.length > 0 && voutWaveform.length > 0) {
          const finalVout = voutWaveform[voutWaveform.length - 1];
          if (finalVout !== undefined) {
            console.log(`\n📊 Final Output Voltage (Vout): ${finalVout.toFixed(4)} V`);
            const theoreticalVout = vin_dc * duty_cycle;
            console.log(`   - Theoretical Value: ${theoreticalVout.toFixed(4)} V`);
            const error = ((finalVout - theoreticalVout) / theoreticalVout) * 100;
            console.log(`   - Error: ${error.toFixed(2)}%`);
          }
        }
      } else {
        console.log("\nCould not find node 'vout' to display results.");
      }
    } else {
      console.error("\n❌ Simulation Failed!");
      console.error(`   - Error Message: ${result.errorMessage}`);
    }
    
  } catch (error) {
    console.error("\n💥 An unexpected error occurred during simulation:", error);
  } finally {
    engine.dispose();
  }
}

// 运行仿真
simulateBuckConverter();
