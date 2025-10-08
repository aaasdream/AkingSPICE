#!/usr/bin/env python3
"""
修復 TypeScript for...of 迭代器問題
將 for (const device of this._devices.values()) 
替換為 const devices = Array.from(this._devices.values()); for (const device of devices)
"""

import re

# 讀取文件
file_path = r"src\core\simulation\circuit_simulation_engine.ts"
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 替換模式 1: for (const device of this._devices.values())
pattern1 = r'for \(const device of this\._devices\.values\(\)\) \{'
replacement1 = 'const devices = Array.from(this._devices.values());\n    for (const device of devices) {'

content = re.sub(pattern1, replacement1, content)

# 替換模式 2: for (const [key, device] of this._devices.entries())
pattern2 = r'for \(const \[([^,]+), ([^\]]+)\] of this\._devices\.entries\(\)\) \{'
replacement2 = r'const deviceEntries = Array.from(this._devices.entries());\n    for (const [\1, \2] of deviceEntries) {'

content = re.sub(pattern2, replacement2, content)

# 替換模式 3: for (const [nodeName, index] of this._nodeMapping.entries())
pattern3 = r'for \(const \[([^,]+), ([^\]]+)\] of this\._nodeMapping\.entries\(\)\) \{'
replacement3 = r'const nodeMappingEntries = Array.from(this._nodeMapping.entries());\n    for (const [\1, \2] of nodeMappingEntries) {'

content = re.sub(pattern3, replacement3, content)

# 寫回文件
with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("✅ 修復完成！所有迭代器問題已解決。")