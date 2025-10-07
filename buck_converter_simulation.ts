/**
 * 🔋 Buck Converter Simulation - AkingSPICE 2.1
 * 
 * Advanced Buck converter simulation demonstrating:
 * - Intelligent device modeling (MOSFET, Diode)
 * - Transient analysis with adaptive time stepping
 * - PWM control signal generation
 * - Comprehensive output analysis
 * 
 * Circuit Configuration:
 * - Input: 12V DC source
 * - Main Switch: MOSFET with PWM gate drive
 * - Freewheel Diode: For continuous current path
 * - Filter: L=47µH, C=100µF
 * - Load: R=2.5Ω (2A @ 5V expected output)
 * 
 * 📊 Expected Results:
 * - Output Voltage: ~5V (duty cycle ≈ 42%)
 * - Output Current: ~2A
 * - Ripple: <100mV peak-to-peak
 */

import { CircuitSimulationEngine, type SimulationConfig } from './src/core/simulation/circuit_simulation_engine';
import { VoltageSource, VoltageSourceFactory } from './src/components/sources/voltage_source';
import { SmartDeviceFactory } from './src/core/devices/intelligent_device_factory';
import { Inductor } from './src/components/passive/inductor';
import { Capacitor } from './src/components/passive/capacitor';
import { Resistor } from './src/components/passive/resistor';
import type { IIntelligentDeviceModel } from './src/core/devices/intelligent_device_model';
import type { ComponentInterface } from './src/core/interfaces/component';

/**
 * 🏗️ Buck Converter Circuit Builder
 * 
 * Encapsulates the complete Buck converter circuit construction
 * with proper component sizing and PWM control
 */
class BuckConverterCircuit {
  private components: (ComponentInterface | IIntelligentDeviceModel)[] = [];
  private nodeMapping: Map<string, number> = new Map();
  
  constructor(
    private inputVoltage: number = 12,    // Input voltage (V)
    private outputCurrent: number = 2,    // Desired output current (A)
    private switchingFrequency: number = 100e3, // Switching frequency (Hz)
    private dutyCycle: number = 0.417     // PWM duty cycle (for ~5V output)
  ) {
    this.buildCircuit();
  }

  /**
   * 🔧 Build the complete Buck converter circuit
   */
  private buildCircuit(): void {
    console.log("🔧 Building Buck converter components...");
    
    // Calculate PWM timing parameters
    const period = 1 / this.switchingFrequency;  // 10µs for 100kHz
    const pulseWidth = period * this.dutyCycle;   // ~4.17µs for 41.7% duty
    
    // 1. Input DC voltage source
    const inputSource = VoltageSourceFactory.createDC(
      'Vin', 
      ['vin', 'gnd'], 
      this.inputVoltage
    );
    this.components.push(inputSource);
    
    // 2. PWM gate drive signal
    const gateDriver = VoltageSourceFactory.createPulse(
      'Vgate',                    // Name
      ['gate', 'gnd'],            // Nodes: [gate, ground]
      0,                          // Low level (V1) = 0V
      10,                         // High level (V2) = 10V
      0,                          // Delay = 0s
      10e-9,                      // Rise time = 10ns
      10e-9,                      // Fall time = 10ns
      pulseWidth,                 // Pulse width ≈ 4.17µs
      period                      // Period = 10µs
    );
    this.components.push(gateDriver);
    
    // 3. Main switching MOSFET (optimized for Buck operation)
    // Note: SmartDeviceFactory expects node indices, so we'll need proper node mapping
    // For now, using a simplified approach with string node names converted to numbers
    const nodeMap = new Map([
      ['vin', 1], ['gate', 2], ['sw', 3], ['out', 4], ['gnd', 0]
    ]);
    
    const mainSwitch = SmartDeviceFactory.createBuckMOSFET(
      'M1',
      [nodeMap.get('vin')!, nodeMap.get('gate')!, nodeMap.get('sw')!], // [Drain, Gate, Source]
      this.inputVoltage,
      this.outputCurrent
    );
    this.components.push(mainSwitch);
    
    // 4. Freewheel diode (for continuous current path)
    const freewheelDiode = SmartDeviceFactory.createFreewheelDiode(
      'D1',
      [nodeMap.get('gnd')!, nodeMap.get('sw')!], // [Anode, Cathode]
      this.inputVoltage,
      this.outputCurrent
    );
    this.components.push(freewheelDiode);
    
    // 5. Filter inductor (47µH - standard for 100kHz switching)
    const filterInductor = new Inductor('L1', ['sw', 'out'], 47e-6); // 47µH
    this.components.push(filterInductor);
    
    // 6. Output filter capacitor (100µF - low ESR ceramic or electrolytic)
    const outputCapacitor = new Capacitor('C1', ['out', 'gnd'], 100e-6); // 100µF
    this.components.push(outputCapacitor);
    
    // 7. Load resistor (2.5Ω for 2A @ 5V)
    const loadResistor = new Resistor('R1', ['out', 'gnd'], 2.5); // 2.5Ω
    this.components.push(loadResistor);
    
    console.log(`✅ Circuit construction complete: ${this.components.length} components created`);
    
    // Log circuit specifications
    console.log("\n📋 Circuit Specifications:");
    console.log(`   Input Voltage: ${this.inputVoltage}V`);
    console.log(`   Target Output: ${this.outputCurrent * 2.5}V @ ${this.outputCurrent}A`);
    console.log(`   Switching Frequency: ${this.switchingFrequency / 1000}kHz`);
    console.log(`   PWM Duty Cycle: ${(this.dutyCycle * 100).toFixed(1)}%`);
    console.log(`   Filter: L=${filterInductor.inductance * 1e6}µH, C=${outputCapacitor.capacitance * 1e6}µF`);
  }
  
  /**
   * 📦 Get all circuit components
   */
  getComponents(): (ComponentInterface | IIntelligentDeviceModel)[] {
    return [...this.components];
  }
  
  /**
   * 📊 Get circuit specifications
   */
  getSpecifications() {
    return {
      inputVoltage: this.inputVoltage,
      outputCurrent: this.outputCurrent,
      switchingFrequency: this.switchingFrequency,
      dutyCycle: this.dutyCycle,
      expectedOutputVoltage: this.inputVoltage * this.dutyCycle,
      componentCount: this.components.length
    };
  }
}

/**
 * 📊 Simulation Results Analyzer
 * 
 * Analyzes and presents Buck converter simulation results
 */
class BuckConverterAnalyzer {
  constructor(private specs: ReturnType<BuckConverterCircuit['getSpecifications']>) {}
  
  /**
   * 📈 Analyze simulation results
   */
  analyzeResults(
    result: any, 
    nodeMapping: Map<string, number>
  ): void {
    if (!result.success) {
      console.error("\n❌ Simulation Failed!");
      console.error(`   Reason: ${result.errorMessage}`);
      return;
    }
    
    console.log("\n✅ Buck Converter Simulation Successful!");
    console.log(`   Total Steps: ${result.totalSteps}`);
    console.log(`   Final Time: ${(result.finalTime * 1e6).toFixed(1)}µs`);
    console.log(`   Convergence Rate: ${(result.convergenceRate * 100).toFixed(1)}%`);
    
    // Analyze output voltage
    this.analyzeOutputVoltage(result, nodeMapping);
    
    // Analyze performance metrics
    this.analyzePerformance(result);
  }
  
  /**
   * 📊 Analyze output voltage characteristics
   */
  private analyzeOutputVoltage(result: any, nodeMapping: Map<string, number>): void {
    const outNodeIndex = nodeMapping.get('out');
    
    if (outNodeIndex === undefined) {
      console.error("❌ Error: 'out' node not found in mapping");
      return;
    }
    
    const outputVoltages = result.waveformData.nodeVoltages.get(outNodeIndex);
    if (!outputVoltages || outputVoltages.length === 0) {
      console.error("❌ Error: No output voltage data available");
      return;
    }
    
    // Calculate final and average output voltage
    const finalVoltage = outputVoltages[outputVoltages.length - 1];
    const steadyStateStart = Math.floor(outputVoltages.length * 0.8); // Last 20% for average
    const steadyStateVoltages = outputVoltages.slice(steadyStateStart);
    const averageVoltage = steadyStateVoltages.reduce((sum: number, v: number) => sum + v, 0) / steadyStateVoltages.length;
    
    // Calculate ripple
    const minVoltage = Math.min(...steadyStateVoltages);
    const maxVoltage = Math.max(...steadyStateVoltages);
    const rippleVoltage = maxVoltage - minVoltage;
    const ripplePercent = (rippleVoltage / averageVoltage) * 100;
    
    // Calculate efficiency (simplified)
    const expectedVoltage = this.specs.expectedOutputVoltage;
    const voltageError = Math.abs(averageVoltage - expectedVoltage);
    const voltageAccuracy = (1 - voltageError / expectedVoltage) * 100;
    
    console.log("\n--- 📊 Output Voltage Analysis ---");
    console.log(`➡️  Final Output Voltage: ${finalVoltage.toFixed(4)}V`);
    console.log(`➡️  Steady-State Average: ${averageVoltage.toFixed(4)}V`);
    console.log(`➡️  Expected Voltage: ${expectedVoltage.toFixed(3)}V`);
    console.log(`➡️  Voltage Accuracy: ${voltageAccuracy.toFixed(1)}%`);
    console.log(`➡️  Output Ripple: ${(rippleVoltage * 1000).toFixed(1)}mV (${ripplePercent.toFixed(2)}%)`);
    console.log(`➡️  Voltage Range: ${minVoltage.toFixed(4)}V - ${maxVoltage.toFixed(4)}V`);
    
    // Performance assessment
    if (voltageAccuracy > 95) {
      console.log("🎯 EXCELLENT: Output voltage within 5% of target");
    } else if (voltageAccuracy > 90) {
      console.log("✅ GOOD: Output voltage within 10% of target");
    } else {
      console.log("⚠️ WARNING: Output voltage error > 10%");
    }
    
    if (ripplePercent < 2) {
      console.log("🌊 EXCELLENT: Low output ripple (<2%)");
    } else if (ripplePercent < 5) {
      console.log("🌊 GOOD: Acceptable output ripple (<5%)");
    } else {
      console.log("⚠️ WARNING: High output ripple (>5%)");
    }
  }
  
  /**
   * ⚡ Analyze simulation performance
   */
  private analyzePerformance(result: any): void {
    const metrics = result.performanceMetrics;
    
    console.log("\n--- ⚡ Performance Metrics ---");
    console.log(`🕐 Total Simulation Time: ${metrics.totalSimulationTime.toFixed(2)}ms`);
    console.log(`🔧 Matrix Assembly Time: ${metrics.matrixAssemblyTime.toFixed(2)}ms`);
    console.log(`🧮 Matrix Solution Time: ${metrics.matrixSolutionTime.toFixed(2)}ms`);
    console.log(`📱 Device Evaluation Time: ${metrics.deviceEvaluationTime.toFixed(2)}ms`);
    console.log(`📊 Average Iterations/Step: ${metrics.averageIterationsPerStep.toFixed(1)}`);
    console.log(`❌ Failed Steps: ${metrics.failedSteps}`);
    console.log(`🔄 Adaptive Step Changes: ${metrics.adaptiveStepChanges}`);
    
    // Performance assessment
    const avgStepTime = result.averageStepTime;
    if (avgStepTime < 1) {
      console.log("🚀 EXCELLENT: High-performance simulation (<1ms/step)");
    } else if (avgStepTime < 5) {
      console.log("✅ GOOD: Acceptable performance (<5ms/step)");
    } else {
      console.log("⚠️ SLOW: Consider optimization (>5ms/step)");
    }
  }
}

/**
 * 🚀 Main Buck Converter Simulation Function
 * 
 * Orchestrates the complete simulation workflow
 */
async function runBuckConverterSimulation(): Promise<void> {
  console.log("🚀 Starting Buck Converter Simulation - AkingSPICE 2.1");
  console.log("=" .repeat(60));
  
  try {
    // Step 1: Build the circuit
    const circuit = new BuckConverterCircuit(
      12,    // 12V input
      2,     // 2A output current
      100e3, // 100kHz switching
      0.417  // 41.7% duty cycle for ~5V output
    );
    
    // Step 2: Configure simulation engine
    console.log("\n🔧 Initializing simulation engine...");
    
    const simConfig: Partial<SimulationConfig> = {
      endTime: 500e-6,              // 500µs simulation time (50 switching cycles)
      initialTimeStep: 1e-9,        // 1ns initial time step
      minTimeStep: 1e-12,           // 1ps minimum time step
      maxTimeStep: 1e-7,            // 100ns maximum time step
      voltageToleranceAbs: 1e-6,    // 1µV absolute voltage tolerance
      voltageToleranceRel: 1e-9,    // 1ppb relative voltage tolerance
      maxNewtonIterations: 100,     // Increased for complex switching behavior
      enableAdaptiveTimeStep: true, // Essential for switching circuits
      enablePredictiveAnalysis: true, // Optimize step size prediction
      verboseLogging: false,        // Clean output for demo
      saveIntermediateResults: true // Save waveform data
    };
    
    const engine = new CircuitSimulationEngine(simConfig);
    
    // Step 3: Add components to engine
    const components = circuit.getComponents();
    console.log(`📦 Adding ${components.length} components to simulation engine...`);
    
    // Type assertion to match engine interface
    engine.addDevices(components as IIntelligentDeviceModel[]);
    
    // Step 4: Run simulation
    console.log("\n⚡ Running transient simulation...");
    const startTime = performance.now();
    
    const result = await engine.runSimulation();
    
    const endTime = performance.now();
    const simulationDuration = endTime - startTime;
    
    console.log(`\n🏁 Simulation completed in ${simulationDuration.toFixed(2)}ms`);
    
    // Step 5: Analyze results
    const analyzer = new BuckConverterAnalyzer(circuit.getSpecifications());
    analyzer.analyzeResults(result, engine.getNodeMapping());
    
    // Step 6: Summary
    console.log("\n" + "=".repeat(60));
    console.log("🎉 Buck Converter Simulation Summary");
    console.log("=".repeat(60));
    
    const specs = circuit.getSpecifications();
    console.log(`🔋 Input: ${specs.inputVoltage}V DC`);
    console.log(`⚡ Switching: ${specs.switchingFrequency/1000}kHz @ ${(specs.dutyCycle*100).toFixed(1)}% duty`);
    console.log(`🎯 Target Output: ${specs.expectedOutputVoltage.toFixed(1)}V @ ${specs.outputCurrent}A`);
    
    if (result.success) {
      console.log("✅ Status: SIMULATION SUCCESSFUL");
      console.log(`📊 Total Steps: ${result.totalSteps}`);
      console.log(`🎯 Convergence: ${(result.convergenceRate*100).toFixed(1)}%`);
    } else {
      console.log("❌ Status: SIMULATION FAILED");
    }
    
  } catch (error) {
    console.error("\n💥 Simulation Error:", error);
    console.error("🔧 Please check component parameters and circuit connectivity");
  }
}

/**
 * 🎯 Execute the simulation
 * 
 * This will be called when the script is run
 */
if (require.main === module) {
  runBuckConverterSimulation()
    .then(() => {
      console.log("\n🎉 Buck converter simulation completed successfully!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n💥 Fatal error:", error);
      process.exit(1);
    });
}

// Export for use in other modules
// Export for use in other modules
export { runBuckConverterSimulation, BuckConverterCircuit, BuckConverterAnalyzer };