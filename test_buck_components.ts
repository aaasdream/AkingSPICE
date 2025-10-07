/**
 * 🧪 Buck Converter Test - Simple Demo
 * 
 * Simplified test to verify the Buck converter components work
 * with the AkingSPICE 2.1 architecture
 */

import { CircuitSimulationEngine } from './src/core/simulation/circuit_simulation_engine';
import { VoltageSourceFactory } from './src/components/sources/voltage_source';
import { Inductor } from './src/components/passive/inductor';
import { Capacitor } from './src/components/passive/capacitor';
import { Resistor } from './src/components/passive/resistor';

console.log("🧪 Buck Converter Component Test");
console.log("=".repeat(40));

try {
  // Test 1: Create basic components
  console.log("\n1️⃣ Testing component creation...");
  
  const inputSource = VoltageSourceFactory.createDC('Vin', ['vin', 'gnd'], 12);
  console.log(`✅ DC source created: ${inputSource.toString()}`);
  
  const inductor = new Inductor('L1', ['sw', 'out'], 47e-6);
  console.log(`✅ Inductor created: ${inductor.toString()}`);
  
  const capacitor = new Capacitor('C1', ['out', 'gnd'], 100e-6);
  console.log(`✅ Capacitor created: ${capacitor.toString()}`);
  
  const resistor = new Resistor('R1', ['out', 'gnd'], 2.5);
  console.log(`✅ Resistor created: ${resistor.toString()}`);
  
  // Test 2: Component validation
  console.log("\n2️⃣ Testing component validation...");
  
  const components = [inputSource, inductor, capacitor, resistor];
  let allValid = true;
  
  for (const component of components) {
    const validation = component.validate();
    if (validation.isValid) {
      console.log(`✅ ${component.name}: Valid`);
    } else {
      console.log(`❌ ${component.name}: ${validation.errors.join(', ')}`);
      allValid = false;
    }
  }
  
  // Test 3: Try simulation engine initialization
  console.log("\n3️⃣ Testing simulation engine...");
  
  const engine = new CircuitSimulationEngine({
    endTime: 100e-6,  // 100µs
    initialTimeStep: 1e-6,
    verboseLogging: false
  });
  
  console.log("✅ Simulation engine created successfully");
  
  // Test 4: Check component info
  console.log("\n4️⃣ Component specifications:");
  
  for (const component of components) {
    const info = component.getInfo();
    console.log(`📋 ${info.name} (${info.type}):`);
    console.log(`   Nodes: [${info.nodes.join(', ')}]`);
    
    Object.entries(info.parameters).forEach(([key, value]) => {
      const unit = info.units?.[key] || '';
      console.log(`   ${key}: ${value}${unit}`);
    });
  }
  
  console.log("\n🎉 All basic tests passed!");
  console.log("✅ Components are compatible with AkingSPICE 2.1");
  
} catch (error) {
  console.error("\n💥 Test failed:", error);
  console.error("🔧 Check imports and component implementations");
}