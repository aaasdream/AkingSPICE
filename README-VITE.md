# Vite Integration for JSSolver-PE Buck Converter

## Overview
This document describes how to use Vite with JSSolver-PE for professional web development, enabling **single codebase, simultaneous development** between Node.js backend and browser frontend.

## Quick Start

### Start Development Server
```bash
npm run dev
```
Opens browser at `http://localhost:3000/buck-vite.html`

### Build for Production
```bash
npm run build
```

### Preview Production Build
```bash
npm run preview
```

## Key Features

### ✅ Unified Codebase
- **Single Source**: Web interface imports directly from `src/` directory
- **No Code Duplication**: Same JSSolver-PE code runs in Node.js and browser
- **Live Development**: Changes to `src/` automatically update web interface

### ✅ Professional Development Workflow
- **Hot Module Replacement (HMR)**: Instant updates during development
- **Modern Bundling**: Optimized builds with tree-shaking and minification
- **Source Maps**: Full debugging support in browser DevTools
- **Chart.js Integration**: Professional visualization library properly bundled

### ✅ Enhanced Buck Converter Simulator
- **Real MNA Matrix Solving**: Uses actual JSSolver-PE algorithms
- **Interactive Controls**: Real-time parameter adjustment
- **Professional UI**: Modern gradient design with responsive layout
- **Technical Badge**: Shows "Vite + JSSolver-PE" to indicate unified architecture

## Project Structure

```
c:\Aking\AkingSpice/
├── src/                      # JSSolver-PE core (shared between Node.js & browser)
│   ├── index.js             # Main entry point
│   ├── core/
│   │   ├── linalg.js        # Matrix operations
│   │   ├── mna.js           # Modified Nodal Analysis
│   │   └── solver.js        # Circuit solver
│   └── components/          # Circuit components
├── web-main.js              # Web interface entry point (imports from src/)
├── buck-vite.html          # Web interface HTML
├── vite.config.js          # Vite configuration
├── package.json            # Updated with Vite scripts
└── README-VITE.md          # This documentation
```

## Configuration Files

### package.json Scripts
```json
{
  "scripts": {
    "dev": "vite",           # Development server
    "build": "vite build",   # Production build
    "preview": "vite preview" # Preview production
  }
}
```

### vite.config.js
- **Port 3000**: Professional development port
- **Auto-open**: Directly opens buck-vite.html
- **Source Maps**: Enabled for debugging
- **Chart.js Optimization**: Pre-bundled for performance

## Development Benefits

### Before Vite (Standalone HTML)
```javascript
// Code was embedded directly in HTML
class BuckSimulator {
    // Duplicated Matrix class
    // Duplicated solver logic
    // Manual dependency management
}
```

### After Vite (Unified Codebase)
```javascript
// web-main.js imports from actual source
import { JSSolverPE } from './src/index.js';
import { Matrix } from './src/core/linalg.js';
import { Chart } from 'chart.js/auto';

// Uses real JSSolver-PE algorithms
class ViteBuckSimulator {
    constructor() {
        this.solver = new JSSolverPE(); // Real solver!
    }
}
```

## Browser vs Node.js Compatibility

### Shared Code (src/)
- **Matrix Operations**: Works in both environments
- **MNA Algorithms**: Identical solver logic
- **Component Models**: Same circuit equations

### Environment-Specific
- **Node.js**: File system, process control, terminal output
- **Browser**: DOM manipulation, Chart.js rendering, user interaction

## Troubleshooting

### Module Import Errors
If you see import errors, ensure:
1. All imports use relative paths (`./src/index.js`)
2. File extensions are included in imports
3. Vite is running (`npm run dev`)

### Chart.js Issues
```javascript
// Correct import for Vite
import { Chart } from 'chart.js/auto';
```

### CORS Problems
Vite development server handles CORS automatically. For production, ensure proper server configuration.

## Performance Optimizations

### Development (Fast Iteration)
- **HMR**: Instant updates without page reload
- **Pre-bundling**: Chart.js pre-processed for speed
- **Source Maps**: Original code visibility in DevTools

### Production (Optimized Build)
- **Tree Shaking**: Unused code removed
- **Minification**: Compressed output
- **Code Splitting**: Optimal loading performance

## Comparison: Standalone vs Vite

| Feature | Standalone HTML | Vite Integration |
|---------|----------------|------------------|
| Code Sharing | ❌ Duplicated | ✅ Single Source |
| Development Speed | ❌ Manual Refresh | ✅ HMR |
| Build Optimization | ❌ None | ✅ Full Pipeline |
| Debugging | ❌ Limited | ✅ Source Maps |
| Dependency Management | ❌ Manual CDN | ✅ NPM + Bundling |
| Professional Workflow | ❌ Basic | ✅ Modern Standards |

## Future Enhancements

### Potential Additions
1. **TypeScript Support**: Add type safety
2. **Testing Framework**: Vitest integration
3. **PWA Features**: Service workers, offline support
4. **Multiple Simulators**: Other converter topologies
5. **Real-time Collaboration**: Multi-user simulation

### Advanced Features
- **WebAssembly**: Ultra-fast matrix operations
- **WebGL**: GPU-accelerated visualization
- **WebRTC**: Real-time simulation sharing

## Technical Implementation Notes

### Matrix Operations Browser Compatibility
```javascript
// src/core/linalg.js works identically in Node.js and browser
const matrix = new Matrix([[1, 2], [3, 4]]);
const inverse = matrix.inverse(); // Same code, both environments
```

### Vite Module Resolution
```javascript
// Vite automatically resolves:
import { JSSolverPE } from './src/index.js';
// Into optimized browser-compatible code
```

This integration achieves the goal of **"single codebase, simultaneous development"** - changes to the core JSSolver-PE library in `src/` immediately appear in both Node.js applications and the web interface.