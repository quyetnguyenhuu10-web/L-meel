/**
 * CONTROLLER_ACTION.js - Phase 03
 * 
 * Goal: Implement apply_patches controller action
 * CRITICAL: DESC sort to prevent line drift
 * 
 * Problem: When applying multiple edits, line numbers shift after each edit
 * Solution: Apply patches in DESC order (high line numbers first)
 * 
 * Example:
 * - Edit line 2, 5, 7
 * - If apply 2→5→7: After editing line 2, line 5 becomes 4, line 7 becomes 6 ❌
 * - If apply 7→5→2: Lines don't shift because we edit from bottom up ✅
 */

/**
 * Controller action for apply_patches
 * 
 * @param {Object} params - { patches: Array }
 * @param {Object} paper - Paper object with lines
 * @returns {Object} Result { success, appliedCount, failedPatches, newRev, newText }
 */
async function applyPatchesAction(params, paper) {
  const { patches } = params;
  const result = {
    success: true,
    appliedCount: 0,
    failedPatches: [],
    newRev: paper.rev || "v1"
  };

  try {
    // Get current paper content
    const lines = paper.lines || [];
    let workingLines = [...lines];

    // ================================================================
    // STEP 1: Separate patches by type
    // ================================================================
    const replacePatchesDesc = patches
      .filter(p => p.type === "write_replace_line")
      .sort((a, b) => b.lineNumber - a.lineNumber); // DESC: 7, 5, 2

    const insertPatchesDesc = patches
      .filter(p => p.type === "insert_line")
      .sort((a, b) => b.lineNumber - a.lineNumber); // DESC

    const deletePatchesDesc = patches
      .filter(p => p.type === "delete_line")
      .sort((a, b) => b.lineNumber - a.lineNumber); // DESC

    // ================================================================
    // STEP 2: Apply write_replace_line patches (DESC order)
    // ================================================================
    for (const patch of replacePatchesDesc) {
      const lineIdx = patch.lineNumber - 1; // Convert 1-indexed to 0-indexed

      // Validate line exists
      if (lineIdx < 0 || lineIdx >= workingLines.length) {
        result.failedPatches.push({
          patch,
          error: `Line ${patch.lineNumber} out of range (1-${workingLines.length})`
        });
        continue;
      }

      // Apply replacement
      workingLines[lineIdx] = patch.text;
      result.appliedCount++;
    }

    // ================================================================
    // STEP 3: Apply insert_line patches (DESC order)
    // ================================================================
    for (const patch of insertPatchesDesc) {
      const insertIdx = patch.lineNumber; // Insert after this line (0-indexed)

      // Validate insertion point
      if (insertIdx < 0 || insertIdx > workingLines.length) {
        result.failedPatches.push({
          patch,
          error: `Cannot insert at line ${patch.lineNumber} (valid: 0-${workingLines.length})`
        });
        continue;
      }

      // Insert new line
      workingLines.splice(insertIdx, 0, patch.text);
      result.appliedCount++;
    }

    // ================================================================
    // STEP 4: Apply delete_line patches (DESC order)
    // ================================================================
    for (const patch of deletePatchesDesc) {
      const lineIdx = patch.lineNumber - 1; // Convert 1-indexed to 0-indexed

      // Validate line exists
      if (lineIdx < 0 || lineIdx >= workingLines.length) {
        result.failedPatches.push({
          patch,
          error: `Cannot delete line ${patch.lineNumber} (out of range)`
        });
        continue;
      }

      // Delete line
      workingLines.splice(lineIdx, 1);
      result.appliedCount++;
    }

    // ================================================================
    // STEP 5: Update paper object
    // ================================================================
    paper.lines = workingLines;
    paper.text = workingLines.join('\n');
    paper.rev = incrementRevision(paper.rev);
    result.newRev = paper.rev;
    result.newText = paper.text;

    // ================================================================
    // STEP 6: Success determination
    // ================================================================
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
 * Helper: Increment revision number
 * v1 -> v2, v2 -> v3, etc
 */
function incrementRevision(rev) {
  if (!rev) return "v2";
  const match = rev.match(/v(\d+)/);
  if (match) {
    const num = parseInt(match[1]) + 1;
    return `v${num}`;
  }
  return "v2";
}

/**
 * Mock Paper object for testing
 */
class MockPaper {
  constructor(text = "") {
    this.text = text;
    this.lines = text ? text.split('\n') : [];
    this.rev = "v1";
  }

  set_text(newText) {
    this.text = newText;
    this.lines = newText.split('\n');
  }

  toString() {
    return this.text;
  }
}

export { applyPatchesAction, MockPaper, incrementRevision };
