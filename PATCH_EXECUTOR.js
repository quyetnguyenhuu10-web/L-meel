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

import { InvariantViolation, enforceRevisionIncrement, enforceFixedSnapshotSize } from './INVARIANT_ENFORCER.js';

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
   * @returns {Object} Execution result
   */
  static execute(snapshotLines, normalized, paper) {
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
      for (const patch of normalized.organized.replaceDesc) {
        const lineIdx = patch.lineNumber - 1;

        // Bounds check against snapshot
        if (lineIdx < 0 || lineIdx >= snapshotLength) {
          result.failedPatches.push({
            patch,
            error: `Line ${patch.lineNumber} out of snapshot bounds`
          });
          continue;
        }

        // Apply to execution state
        workingLines[lineIdx] = patch.text;
        result.appliedCount++;
      }

      // ===== PHASE 2: Apply INSERT patches =====
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

      return result;

    } catch (error) {
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

export { PatchExecutor };
