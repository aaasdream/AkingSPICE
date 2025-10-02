# 🤖 AI Assistant Configuration

> **This file is specifically for AI assistants to quickly understand the AkingSPICE project**

## 🎯 Project Quick Facts

**Project Type**: JavaScript Circuit Simulator with WebGPU acceleration  
**Current Status**: 46/46 tests passing, production ready  
**Last Update**: October 2, 2025  
**Test Coverage**: Complete (Core modules + Solver validation + RLC frequency validation)

## ⚡ Essential Commands for AI

### First Things to Run
```bash
# Verify project state (ALWAYS run this first)
cd "C:\Users\user\Desktop\pythonLab\AkingSPICE"
npm test                    # Should show 46/46 tests passing

# Run quality gate (comprehensive check)
npm run quality-gate        # Core + Solvers + RLC + Build
```

### Available Test Suites
```bash
npm run test:core          # Core modules (10 tests)
npm run test:solvers       # CPU/GPU solver validation (7 tests)  
npm run test:rlc           # RLC frequency validation (6 tests)
```

### Development Tools
```bash
npm run dev:help           # Show AI development helper
npm run dev:circuit rc     # Generate RC circuit template
npm run dev:api            # API reference lookup
```

## 📚 AI Learning Path

### Priority 1: Essential Understanding (READ FIRST)
1. **`AI_ONBOARDING_GUIDE.md`** ⭐ - Complete AI onboarding guide
2. **`README.md`** - Project overview
3. **`docs/QUICK_REFERENCE.md`** - One-page API cheatsheet

### Priority 2: Deep Dive (when needed)
4. **`docs/API_REFERENCE.md`** - Complete API documentation
5. **`docs/PROJECT_ARCHITECTURE.md`** - Code architecture
6. **`DEVELOPMENT_RULES.md`** - Development workflow

### Priority 3: Advanced (for complex tasks)
7. **`docs/COMPONENT_GUIDE.md`** - Circuit components guide
8. **`test/` directory** - Example usage patterns

## 🧪 Test System Understanding

### Test Structure
```
Total: 46 tests (100% passing)
├── Core Modules: 10 tests (Solvers, Components, Analysis)
├── Solver Validation: 7 tests (CPU/GPU stability & consistency)
└── RLC Frequency Validation: 6 tests (Time + Frequency domain)
```

### Key Test Files
- **`test/test-core-modules.js`** - Basic functionality
- **`test/test-solver-validation.js`** - Numerical stability  
- **`test/test-rlc-frequency-validation.js`** - GPU accuracy validation

## 🔧 Core API Patterns

### Basic Circuit Simulation
```javascript
import { 
    ExplicitStateSolver,
    VoltageSource, Resistor, Capacitor 
} from './lib-dist/AkingSPICE.es.js';

// 1. Create components
const V1 = new VoltageSource('V1', 'vin', 'gnd', 5);
const R1 = new Resistor('R1', 'vin', 'vout', 1000);
const C1 = new Capacitor('C1', 'vout', 'gnd', 1e-6);

// 2. Initialize solver
const solver = new ExplicitStateSolver();
await solver.initialize([V1, R1, C1], 1e-6);

// 3. Run simulation
for (let i = 0; i < 1000; i++) {
    const result = solver.step();
    // Use result.nodeVoltages, result.stateVariables
}

// 4. Cleanup
solver.destroy();
```

### GPU Solver Usage
```javascript
import { GPUSolver } from './lib-dist/AkingSPICE.es.js';

if (await GPUSolver.isSupported()) {
    const gpuSolver = new GPUSolver();
    // Same API as ExplicitStateSolver
} else {
    // Fallback to CPU solver
}
```

## ⚠️ Important Development Rules

### Before Any Code Changes
1. **ALWAYS** run `npm test` first to verify current state
2. Follow **Test-Driven Development** (TDD) approach
3. Maintain **backward compatibility**
4. Ensure **dual platform consistency** (Node.js ↔ Browser)

### File Organization
- **`src/`** - Source code (don't modify without tests)
- **`lib-dist/`** - Built distribution (auto-generated)
- **`test/`** - Test files (follow existing patterns)
- **`docs/`** - Documentation (keep updated)

### Testing Requirements
- New features MUST include test cases
- ALL existing tests must continue passing
- RLC validation is critical for GPU solver accuracy

## 🎯 Project Goals & Constraints

### Technical Objectives
1. **Dual Platform**: Identical results in Node.js and Browser
2. **GPU Acceleration**: WebGPU parallel solver for large circuits  
3. **Numerical Stability**: Long-term simulation accuracy
4. **Frequency Accuracy**: RLC frequency domain validation

### Performance Benchmarks
- **Small circuits**: CPU solver preferred (< 100 nodes)
- **Large circuits**: GPU solver provides 10-100x speedup (> 1000 nodes)
- **Accuracy**: Frequency domain error < 0.01%
- **Stability**: Time domain convergence > 95%

## 🚨 Common AI Pitfalls to Avoid

### ❌ Don't Do This
- Modify core solvers without understanding the math
- Skip running tests before making changes  
- Break backward compatibility
- Ignore GPU memory management
- Mix up time domain vs frequency domain validation

### ✅ Do This Instead
- Use existing test patterns as templates
- Check GPU availability before using GPUSolver
- Follow the established component creation patterns
- Refer to docs/ for API usage
- Use tools/ai-dev-helper.js for code generation

## 🔗 Quick Links for AI

### Most Used Documentation
- [AI Onboarding Guide](AI_ONBOARDING_GUIDE.md)
- [Quick API Reference](docs/QUICK_REFERENCE.md)
- [Component Usage Examples](docs/COMPONENT_GUIDE.md)

### Development Tools
- [AI Code Generator](tools/ai-dev-helper.js)
- [Test Framework](test/framework/TestFramework.js)

### Test Examples  
- [Basic Tests](test/test-core-modules.js)
- [RLC Validation](test/test-rlc-frequency-validation.js)

---

**🎉 You're Ready to Develop with AkingSPICE!**

> **Remember**: This project is mature and stable (46/46 tests passing). Build on this solid foundation with confidence!