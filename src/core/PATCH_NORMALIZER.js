/**
 * PATCH_NORMALIZER.js - Layer 2: Normalization
 * 
 * Purpose: Normalize patches for safe execution
 * - Validate against invariants
 * - Sort patches (DESC order)
 * - Detect violations
 * 
 * This layer prepares patches for execution.
 */

const {
  InvariantViolation,
  enforceSnapshotSSoT,
  enforceDescOrder,
  enforceImmutableSnapshot,
  enforceInsertBounds,
  enforceIndependentPatches,
  enforceFixedSnapshotSize
} = require('./INVARIANT_ENFORCER.js');
const PatchSemantics = require('./PATCH_SEMANTICS.js');

// ============================================================
// PATCH NORMALIZATION
// ============================================================

class PatchNormalizer {
  /**
   * Normalize patches for execution
   * 
   * @param {Array} snapshotLines - Immutable snapshot
   * @param {Array} patches - Raw patches
   * @param {Object} observability - Logger and metrics { logger, metrics, batchId }
   * @returns {Object} Normalized { semantics, organized, warnings }
   */
  static normalize(snapshotLines, patches, observability = {}) {
    const logger = observability.logger;
    const metrics = observability.metrics;
    const batchId = observability.batchId || 'unknown';
    
    const timerNormalizer = metrics?.startTimer?.();
    
    if (logger) {
      logger.info({
        layer: 'NORMALIZER',
        batchId,
        patchCount: patches.length
      }, 'Normalizing patches');
    }
    
    // Step 1: Freeze snapshot (immutability)
    const frozen = Object.freeze([...snapshotLines]);
    const snapshotLength = frozen.length;

    // Step 2: Analyze semantics
    const semantics = new PatchSemantics(frozen, patches, observability);

    // Step 3: Enforce invariants
    try {
      if (logger) {
        logger.debug({
          layer: 'NORMALIZER',
          batchId,
          step: 'enforcing_snapshot_ssot'
        }, 'Validating snapshot SSOT');
      }
      enforceSnapshotSSoT(patches, snapshotLength);
      
      if (logger) {
        logger.debug({
          layer: 'NORMALIZER',
          batchId,
          step: 'enforcing_immutable_snapshot'
        }, 'Validating immutability');
      }
      enforceImmutableSnapshot(frozen);
      
      if (logger) {
        logger.debug({
          layer: 'NORMALIZER',
          batchId,
          step: 'enforcing_insert_bounds'
        }, 'Validating INSERT bounds');
      }
      enforceInsertBounds(
        semantics.byType.insert_line,
        snapshotLength
      );
      
      if (logger) {
        logger.debug({
          layer: 'NORMALIZER',
          batchId,
          step: 'enforcing_independent'
        }, 'Checking patch independence');
      }
      enforceIndependentPatches(patches, snapshotLength);
      // DESC order will be validated before execution
    } catch (error) {
      if (error instanceof InvariantViolation) {
        throw error;
      }
      throw new Error(`Normalization failed: ${error.message}`);
    }

    // Step 4: Organize patches by type + DESC order
    const organized = {
      replaceDesc: this.sortDesc(semantics.byType.write_replace_line),
      insertDesc: this.sortDesc(semantics.byType.insert_line),
      deleteDesc: this.sortDesc(semantics.byType.delete_line)
    };

    if (logger) {
      logger.debug({
        layer: 'NORMALIZER',
        batchId,
        replaceOrder: organized.replaceDesc.map(p => p.lineNumber),
        insertOrder: organized.insertDesc.map(p => p.lineNumber),
        deleteOrder: organized.deleteDesc.map(p => p.lineNumber)
      }, 'Patches organized and sorted DESC');
    }

    // Step 5: Validate DESC order
    try {
      enforceDescOrder([
        ...organized.replaceDesc,
        ...organized.insertDesc,
        ...organized.deleteDesc
      ]);
    } catch (error) {
      if (error instanceof InvariantViolation) {
        throw error;
      }
    }

    // Step 6: Generate warnings (non-blocking)
    const warnings = this.generateWarnings(semantics, patches);

    if (logger) {
      warnings.forEach(w => {
        logger.warn({
          layer: 'NORMALIZER',
          batchId,
          warning: w
        }, `Non-blocking warning`);
      });
    }

    const durationNormalizer = timerNormalizer ? metrics?.endTimer?.('normalizer', timerNormalizer, { batchId }) : null;

    if (logger) {
      logger.info({
        layer: 'NORMALIZER',
        batchId,
        warningCount: warnings.length,
        durationMs: durationNormalizer?.toFixed(2)
      }, 'Normalization complete');
    }

    if (metrics) {
      metrics.increment('normalized', 1, { batchId });
      metrics.setGauge('patch_count', patches.length, { batchId });
    }

    return {
      snapshotLines: frozen,
      snapshotLength,
      semantics,
      organized,
      warnings,
      isReady: true,
      logger,
      metrics,
      batchId
    };
  }

  /**
   * Sort patches in DESC order (high lineNumber first)
   */
  static sortDesc(patches) {
    return [...patches].sort((a, b) => b.lineNumber - a.lineNumber);
  }

  /**
   * Generate non-blocking warnings
   */
  static generateWarnings(semantics, patches) {
    const warnings = [];

    // Warning 1: Large batch
    if (patches.length > 20) {
      warnings.push({
        level: "warn",
        message: `Large batch: ${patches.length} patches (recommended < 20)`
      });
    }

    // Warning 2: Mixed patch types
    if (semantics.byType.write_replace_line.length > 0 &&
        (semantics.byType.insert_line.length > 0 ||
         semantics.byType.delete_line.length > 0)) {
      warnings.push({
        level: "warn",
        message: "Mixing REPLACE with INSERT/DELETE - ensure independence"
      });
    }

    // Warning 3: All patches same type
    const types = [
      semantics.byType.write_replace_line,
      semantics.byType.insert_line,
      semantics.byType.delete_line
    ].filter(t => t.length > 0);

    if (types.length === 1) {
      warnings.push({
        level: "info",
        message: `Homogeneous batch: all ${semantics.summary.replaceCount || semantics.summary.insertCount || semantics.summary.deleteCount} patches are same type`
      });
    }

    return warnings;
  }
}

module.exports = PatchNormalizer;
