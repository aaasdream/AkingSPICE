"use strict";
/**
 * 🔢 向量實現 - AkingSPICE 2.0
 *
 * 高效的數值向量操作
 * 針對電路分析優化
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Vector = void 0;
/**
 * 密集向量實現
 */
class Vector {
    constructor(size, initialValue = 0) {
        if (size <= 0) {
            throw new Error(`向量大小必須為正數: ${size}`);
        }
        this._data = new Array(size).fill(initialValue);
    }
    get size() {
        return this._data.length;
    }
    /**
     * 獲取元素
     */
    get(index) {
        this._validateIndex(index);
        return this._data[index];
    }
    /**
     * 設置元素
     */
    set(index, value) {
        this._validateIndex(index);
        this._data[index] = value;
    }
    /**
     * 累加元素
     */
    add(index, value) {
        this._validateIndex(index);
        this._data[index] += value;
    }
    /**
     * 向量的 2-範數
     */
    norm() {
        let sum = 0;
        for (const value of this._data) {
            sum += value * value;
        }
        return Math.sqrt(sum);
    }
    /**
     * 向量點積
     */
    dot(other) {
        if (other.size !== this.size) {
            throw new Error(`向量維度不匹配: ${this.size} vs ${other.size}`);
        }
        let sum = 0;
        for (let i = 0; i < this.size; i++) {
            sum += this.get(i) * other.get(i);
        }
        return sum;
    }
    /**
     * 轉換為陣列
     */
    toArray() {
        return [...this._data];
    }
    /**
     * 克隆向量
     */
    clone() {
        const cloned = new Vector(this.size);
        cloned._data = [...this._data];
        return cloned;
    }
    /**
     * 向量加法: this + other
     */
    plus(other) {
        if (other.size !== this.size) {
            throw new Error(`向量維度不匹配: ${this.size} vs ${other.size}`);
        }
        const result = new Vector(this.size);
        for (let i = 0; i < this.size; i++) {
            result.set(i, this.get(i) + other.get(i));
        }
        return result;
    }
    /**
     * 向量減法: this - other
     */
    minus(other) {
        if (other.size !== this.size) {
            throw new Error(`向量維度不匹配: ${this.size} vs ${other.size}`);
        }
        const result = new Vector(this.size);
        for (let i = 0; i < this.size; i++) {
            result.set(i, this.get(i) - other.get(i));
        }
        return result;
    }
    /**
     * 標量乘法: scalar * this
     */
    scale(scalar) {
        const result = new Vector(this.size);
        for (let i = 0; i < this.size; i++) {
            result.set(i, scalar * this.get(i));
        }
        return result;
    }
    /**
     * 零向量檢測
     */
    isZero(tolerance = 1e-12) {
        return this.norm() < tolerance;
    }
    /**
     * 填充向量
     */
    fill(value) {
        this._data.fill(value);
    }
    /**
     * 從陣列創建向量
     */
    static from(array) {
        const vector = new Vector(array.length);
        vector._data = [...array];
        return vector;
    }
    /**
     * 零向量
     */
    static zeros(size) {
        return new Vector(size, 0);
    }
    /**
     * 單位向量 (ones)
     */
    static ones(size) {
        return new Vector(size, 1);
    }
    /**
     * 標準基向量
     */
    static basis(size, index) {
        const vector = Vector.zeros(size);
        vector.set(index, 1);
        return vector;
    }
    _validateIndex(index) {
        if (index < 0 || index >= this.size) {
            throw new Error(`索引超出範圍: ${index} (大小: ${this.size})`);
        }
    }
}
exports.Vector = Vector;
