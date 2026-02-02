/**
 * PATCH_EXECUTOR.js - Layer 3: Execution
 * 
 * Purpose: Apply normalized patches to execution state
 * - Mutate workingLines
 * - Track applied count
 * - Update revision
 * - Generate result
 * 
 * This layer assumes patches are already validated.
 */

const { InvariantViolation, enforceRevisionIncrement, enforceFixedSnapshotSize } = require('./INVARIANT_ENFORCER.js');

// ============================================================
// PATCH EXECUTOR
// ============================================================

class PatchExecutor {
  /**
   * Execute normalized patches
   * 
   * @param {Array} snapshotLines - Immutable snapshot
   * @param {Object} normalized - From PatchNormalizer.normalize()
   * @param {Object} paper - Paper object with lines + rev
   * @param {Object} observability - Logger and metrics (from normalized)
   * @returns {Object} Execution result
   */
  static execute(snapshotLines, normalized, paper, observability = {}) {
    const logger = observability.logger || normalized?.logger;
    const metrics = observability.metrics || normalized?.metrics;
    const batchId = observability.batchId || normalized?.batchId || 'unknown';
    
    const timerExecutor = metrics?.startTimer?.();
    
    if (logger) {
      logger.info({
        layer: 'EXECUTOR',
        batchId,
        snapshotLength: snapshotLines.length,
        replaceCount: normalized.organized.replaceDesc.length,
        insertCount: normalized.organized.insertDesc.length,
        deleteCount: normalized.organized.deleteDesc.length
      }, 'Starting patch execution');
    }

    const result = {
      success: true,
      appliedCount: 0,
      failedPatches: [],
      newRev: paper.rev,
      newText: paper.text
    };

    try {
      // Snapshot guard
      const snapshotLength = snapshotLines.length;
      enforceFixedSnapshotSize(snapshotLines, snapshotLength);

      // Create mutable execution state (separate from snapshot)
      let workingLines = [...snapshotLines];

      // ===== PHASE 1: Apply REPLACE patches =====
      if (logger) {
        logger.debug({
          layer: 'EXECUTOR',
          batchId,
          phase: 'REPLACE',
          order: normalized.organized.replaceDesc.map(p => p.lineNumber)
        }, 'Applying REPLACE patches');
      }
      
      for (const patch of normalized.organized.replaceDesc) {
        const lineIdx = patch.lineNumber - 1;

        // Bounds check against snapshot
        if (lineIdx < 0 || lineIdx >= snapshotLength) {
          const errorMsg = `Line ${patch.lineNumber} out of snapshot bounds`;
          if (logger) {
            logger.error({
              layer: 'EXECUTOR',
              batchId,
              patchIndex: normalized.organized.replaceDesc.indexOf(patch),
              lineNumber: patch.lineNumber,
              error: errorMsg
            }, 'Patch failed');
          }
          result.failedPatches.push({
            patch,
            error: errorMsg
          });
          continue;
        }

        // Apply to execution state
        workingLines[lineIdx] = patch.text;
        result.appliedCount++;
      }

      // ===== PHASE 2: Apply INSERT patches =====
      if (logger) {
        logger.debug({
          layer: 'EXECUTOR',
          batchId,
          phase: 'INSERT',
          order: normalized.organized.insertDesc.map(p => p.lineNumber)
        }, 'Applying INSERT patches');
      }
      
      for (const patch of normalized.organized.insertDesc) {
        const insertIdx = patch.lineNumber;

        // Bounds check - INSERT is special (can be at snapshotLength + 1)
        if (insertIdx < 1 || insertIdx > workingLines.length + 1) {
          result.failedPatches.push({
            patch,
            error: `Cannot insert at line ${patch.lineNumber}`
          });
          continue;
        }

        // Apply to execution state
        workingLines.splice(insertIdx - 1, 0, patch.text);
        result.appliedCount++;
      }

      // ===== PHASE 3: Apply DELETE patches =====
      if (logger) {
        logger.debug({
          layer: 'EXECUTOR',
          batchId,
          phase: 'DELETE',
          order: normalized.organized.deleteDesc.map(p => p.lineNumber)
        }, 'Applying DELETE patches');
      }
      
      for (const patch of normalized.organized.deleteDesc) {
        const lineIdx = patch.lineNumber - 1;

        // Bounds check against current execution state
        if (lineIdx < 0 || lineIdx >= workingLines.length) {
          result.failedPatches.push({
            patch,
            error: `Cannot delete line ${patch.lineNumber}`
          });
          continue;
        }

        // Apply to execution state
        workingLines.splice(lineIdx, 1);
        result.appliedCount++;
      }

      // ===== FINALIZATION =====
      // Update paper object
      const revisionBefore = paper.rev;
      paper.lines = workingLines;
      paper.text = workingLines.join('\n');
      paper.rev = this.incrementRevision(paper.rev);
      result.newRev = paper.rev;
      result.newText = paper.text;

      // Verify revision increment
      try {
        enforceRevisionIncrement(revisionBefore, result.newRev);
      } catch (error) {
        if (error instanceof InvariantViolation) {
          throw error;
        }
      }

      // Success determination
      result.success = result.failedPatches.length === 0;

      const durationExecutor = timerExecutor ? metrics?.endTimer?.('executor', timerExecutor, { batchId }) : null;

      if (logger) {
        logger.info({
          layer: 'EXECUTOR',
          batchId,
          appliedCount: result.appliedCount,
          failedCount: result.failedPatches.length,
          beforeRev: revisionBefore,
          afterRev: paper.rev,
          finalLineCount: workingLines.length,
          durationMs: durationExecutor?.toFixed(2)
        }, 'Execution complete');
      }

      if (metrics) {
        metrics.increment('patches_applied', result.appliedCount, { batchId });
        metrics.increment('patches_failed', result.failedPatches.length, { batchId });
        metrics.increment('batches_completed', result.success ? 1 : 0, { batchId });
      }

      return result;

    } catch (error) {
      if (logger) {
        logger.error({
          layer: 'EXECUTOR',
          batchId,
          appliedCount: result.appliedCount,
          failedCount: result.failedPatches.length,
          errorMessage: error.message
        }, 'Execution failed');
      }

      if (metrics) {
        metrics.increment('batches_failed', 1, { batchId });
        if (error.severity === 'CRITICAL') {
          metrics.increment('invariant_violations', 1, { batchId });
        }
      }

      return {
        success: false,
        appliedCount: result.appliedCount,
        failedPatches: result.failedPatches,
        error: error.message,
        newRev: paper.rev
      };
    }
  }

  /**
   * Increment revision: v1 → v2, v2 → v3, etc
   */
  static incrementRevision(rev) {
    if (!rev) return "v2";
    
    const match = rev.match(/v(\d+)/);
    if (match) {
      const num = parseInt(match[1]) + 1;
      return `v${num}`;
    }
    
    return "v2";
  }
}

module.exports = PatchExecutor;
