const fs = require('fs');
const path = require('path');

/**
 * FEATURE_FLAGS.js - Production Feature Flag Management
 * 
 * Mục đích: Kiểm soát rollout từng tính năng mới trong production
 * - Cho phép bật/tắt batch patch system mà không deploy code mới
 * - Hỗ trợ gradual rollout: 10% → 25% → 50% → 100% users
 * - Persistent storage (JSON file)
 * - Instant effect (không cần restart)
 * 
 * Sử dụng:
 * const flags = new FeatureFlags();
 * flags.enable('batch-patches-v1');
 * if (flags.isEnabled('batch-patches-v1')) {
 *   // Execute batch patches
 * }
 */

class FeatureFlags {
  constructor(storagePath = null) {
    // Path để lưu flags JSON file
    this.storagePath = storagePath || path.join(__dirname, '.feature-flags.json');
    
    // In-memory cache
    this.flags = new Map();
    
    // Load từ file nếu tồn tại
    this._loadFromDisk();
    
    // Metadata: who enabled/disabled, when
    this.history = [];
  }

  /**
   * Bật một feature flag
   * @param {string} flagName - Tên flag
   * @param {object} options - {percentage, reason, enabledAt}
   * @returns {boolean} true nếu thành công
   */
  enable(flagName, options = {}) {
    const timestamp = new Date().toISOString();
    const percentage = options.percentage ?? 100;
    const reason = options.reason || 'Manual enable';

    this.flags.set(flagName, {
      enabled: true,
      percentage: Math.min(100, Math.max(0, percentage)),
      enabledAt: timestamp,
      reason: reason,
      metadata: options.metadata || {}
    });

    this.history.push({
      action: 'ENABLE',
      flagName,
      timestamp,
      reason
    });

    this._saveToDisk();
    return true;
  }

  /**
   * Tắt một feature flag
   * @param {string} flagName - Tên flag
   * @param {object} options - {reason}
   * @returns {boolean} true nếu thành công
   */
  disable(flagName, options = {}) {
    const timestamp = new Date().toISOString();
    const reason = options.reason || 'Manual disable';

    this.flags.set(flagName, {
      enabled: false,
      percentage: 0,
      disabledAt: timestamp,
      reason: reason,
      metadata: options.metadata || {}
    });

    this.history.push({
      action: 'DISABLE',
      flagName,
      timestamp,
      reason
    });

    this._saveToDisk();
    return true;
  }

  /**
   * Kiểm tra flag có enabled không
   * Hỗ trợ:
   * - isEnabled('my-flag') → boolean
   * - isEnabled('my-flag', userId) → boolean (dùng percentage)
   * 
   * @param {string} flagName - Tên flag
   * @param {string|number} userId - Optional, dùng cho percentage-based rollout
   * @returns {boolean}
   */
  isEnabled(flagName, userId = null) {
    if (!this.flags.has(flagName)) {
      return false; // Default: flag không tồn tại = disabled
    }

    const flag = this.flags.get(flagName);
    if (!flag.enabled) {
      return false;
    }

    // Nếu percentage 100, tất cả users có flag
    if (flag.percentage === 100) {
      return true;
    }

    // Nếu percentage < 100, dùng user ID để decide
    // Hash user ID để consistent rollout
    if (userId !== null) {
      const hashCode = this._hashUserId(String(userId));
      const userPercentage = (Math.abs(hashCode) % 100) + 1;
      return userPercentage <= flag.percentage;
    }

    // Nếu không có userId nhưng percentage < 100, dùng random
    return Math.random() * 100 < flag.percentage;
  }

  /**
   * Lấy trạng thái tất cả flags
   * @returns {object} {flagName: {enabled, percentage, ...}}
   */
  getStatus() {
    const status = {};
    for (const [name, flag] of this.flags) {
      status[name] = {
        ...flag,
        enabled: flag.enabled ?? false
      };
    }
    return status;
  }

  /**
   * Nâng cấp rollout percentage (gradual rollout)
   * @param {string} flagName 
   * @param {number} newPercentage - 0-100
   */
  setPercentage(flagName, newPercentage) {
    if (!this.flags.has(flagName)) {
      throw new Error(`Flag '${flagName}' không tồn tại`);
    }

    const flag = this.flags.get(flagName);
    const oldPercentage = flag.percentage;
    flag.percentage = Math.min(100, Math.max(0, newPercentage));

    this.history.push({
      action: 'SCALE',
      flagName,
      timestamp: new Date().toISOString(),
      oldPercentage,
      newPercentage: flag.percentage
    });

    this._saveToDisk();
  }

  /**
   * Lấy history của flag
   * @param {string} flagName - Optional, filter by flag
   * @returns {array}
   */
  getHistory(flagName = null) {
    if (!flagName) {
      return [...this.history];
    }
    return this.history.filter(h => h.flagName === flagName);
  }

  /**
   * Reset tất cả flags (chỉ dùng cho test/reset)
   */
  reset() {
    this.flags.clear();
    this.history = [];
    this._saveToDisk();
  }

  // ============ Private Methods ============

  _saveToDisk() {
    try {
      const data = {
        flags: Object.fromEntries(this.flags),
        history: this.history,
        lastUpdated: new Date().toISOString()
      };
      fs.writeFileSync(this.storagePath, JSON.stringify(data, null, 2));
    } catch (err) {
      console.error('Error saving flags to disk:', err.message);
      // Non-fatal: continue in-memory
    }
  }

  _loadFromDisk() {
    try {
      if (fs.existsSync(this.storagePath)) {
        const data = JSON.parse(fs.readFileSync(this.storagePath, 'utf8'));
        this.flags = new Map(Object.entries(data.flags || {}));
        this.history = data.history || [];
      }
    } catch (err) {
      console.warn('Could not load flags from disk, starting fresh:', err.message);
      this.flags = new Map();
      this.history = [];
    }
  }

  _hashUserId(userId) {
    // Simple hash để consistent rollout per user
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      const char = userId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit int
    }
    return hash;
  }
}

// ============ Integration với Batch Patch System ============

/**
 * Wrapper: bật/tắt batch patch execution dựa trên feature flag
 */
function createBatchPatchHandler(patchSemantics, patchNormalizer, patchExecutor, featureFlags) {
  return function executeBatchWithFlag(batch, snapshot, userId = null) {
    // Check flag
    if (!featureFlags.isEnabled('batch-patches-v1', userId)) {
      return {
        success: false,
        reason: 'batch-patches-v1 feature not enabled',
        applied: 0,
        failed: 0,
        revision: -1
      };
    }

    // Flag enabled, execute normally
    try {
      const semantics = patchSemantics.analyze(batch, snapshot);
      const normalized = patchNormalizer.normalize(batch, snapshot);
      const result = patchExecutor.execute(normalized, snapshot);
      return result;
    } catch (err) {
      return {
        success: false,
        reason: err.message,
        applied: 0,
        failed: batch.length,
        revision: -1
      };
    }
  };
}

module.exports = {
  FeatureFlags,
  createBatchPatchHandler
};
