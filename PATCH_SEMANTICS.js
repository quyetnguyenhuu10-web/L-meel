/**
 * PATCH_SEMANTICS.js - Layer 1: Semantics
 * 
 * Purpose: Define what patches MEAN at the semantic level
 * - snapshot (immutable reference)
 * - snapshot metadata (length, type info)
 * - patch interpretation (what does this patch do?)
 * 
 * This layer does NOT apply patches.
 * It just understands their meaning.
 */

// ============================================================
// SEMANTIC ANALYSIS
// ============================================================

class PatchSemantics {
  /**
   * Create semantics from snapshot + patches
   * 
   * @param {Array} snapshotLines - Initial immutable snapshot
   * @param {Array} patches - Array of patch objects
   */
  constructor(snapshotLines, patches) {
    this.snapshotLines = Object.freeze([...snapshotLines]);
    this.snapshotLength = this.snapshotLines.length;
    this.patches = patches;
    
    // Analyze semantic meaning
    this.byType = this.categorizeByType();
    this.byLine = this.categorizeByLine();
    this.summary = this.analyzeSummary();
  }

  /**
   * Categorize patches by type
   */
  categorizeByType() {
    const types = {
      write_replace_line: [],
      insert_line: [],
      delete_line: []
    };

    for (let i = 0; i < this.patches.length; i++) {
      const patch = this.patches[i];
      if (types[patch.type]) {
        types[patch.type].push({ index: i, ...patch });
      }
    }

    return types;
  }

  /**
   * Categorize patches by line number
   */
  categorizeByLine() {
    const byLine = new Map();

    for (let i = 0; i < this.patches.length; i++) {
      const patch = this.patches[i];
      if (!byLine.has(patch.lineNumber)) {
        byLine.set(patch.lineNumber, []);
      }
      byLine.get(patch.lineNumber).push({ index: i, ...patch });
    }

    return byLine;
  }

  /**
   * Analyze summary: what changes happen semantically?
   */
  analyzeSummary() {
    return {
      totalPatches: this.patches.length,
      replaceCount: this.byType.write_replace_line.length,
      insertCount: this.byType.insert_line.length,
      deleteCount: this.byType.delete_line.length,
      linesAffected: new Set(this.patches.map(p => p.lineNumber)).size,
      expectedFinalLength: this.calculateExpectedLength()
    };
  }

  /**
   * Calculate expected final line count after all patches
   * (theoretical, based on snapshot + insertions/deletions)
   */
  calculateExpectedLength() {
    let count = this.snapshotLength;
    count += this.byType.insert_line.length;   // Each insert adds 1
    count -= this.byType.delete_line.length;   // Each delete removes 1
    return count;
  }

  /**
   * Validate patch is within snapshot bounds
   */
  isValidLineNumber(lineNumber) {
    return lineNumber >= 1 && lineNumber <= this.snapshotLength;
  }

  /**
   * Check if patches are independent (different lines)
   */
  areIndependent() {
    return this.summary.linesAffected === this.summary.totalPatches;
  }

  /**
   * Get semantic meaning of a single patch
   */
  getMeaning(patchIndex) {
    const patch = this.patches[patchIndex];
    
    return {
      index: patchIndex,
      type: patch.type,
      targetLine: patch.lineNumber,
      targetContent: this.snapshotLines[patch.lineNumber - 1],
      newContent: patch.text || null,
      isValid: this.isValidLineNumber(patch.lineNumber)
    };
  }

  /**
   * Get ALL meanings
   */
  getAllMeanings() {
    return this.patches.map((_, i) => this.getMeaning(i));
  }

  /**
   * String representation for debugging
   */
  toString() {
    return `
PatchSemantics:
  Snapshot size: ${this.snapshotLength}
  Total patches: ${this.summary.totalPatches}
  - Replaces: ${this.summary.replaceCount}
  - Inserts: ${this.summary.insertCount}
  - Deletes: ${this.summary.deleteCount}
  Lines affected: ${this.summary.linesAffected}
  Expected final length: ${this.summary.expectedFinalLength}
  Independent? ${this.areIndependent()}
    `.trim();
  }
}

export { PatchSemantics };
