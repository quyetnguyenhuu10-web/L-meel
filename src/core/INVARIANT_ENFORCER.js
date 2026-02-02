/**
 * INVARIANT_ENFORCER.js - System Invariant Guards
 * 
 * Purpose: Enforce 7 core invariants of patch mode
 * Severity: ALL violations cause HARD STOP (not warnings)
 * 
 * Invariants:
 * 1. Snapshot SSOT
 * 2. DESC order
 * 3. Immutable snapshot
 * 4. Insert bounds
 * 5. Independent patches
 * 6. Revision increment
 * 7. Fixed snapshot size
 */

// ============================================================
// INVARIANT VIOLATION CLASS
// ============================================================

class InvariantViolation extends Error {
  constructor(invariantNumber, message, context = {}) {
    super(`[INVARIANT ${invariantNumber} VIOLATION] ${message}`);
    this.name = "InvariantViolation";
    this.invariantNumber = invariantNumber;
    this.severity = "CRITICAL";
    this.context = context;
    this.timestamp = new Date().toISOString();
    
    // Log immediately
    console.error({
      error: this.message,
      invariant: invariantNumber,
      severity: this.severity,
      context,
      timestamp: this.timestamp
    });
  }
}

// ============================================================
// INVARIANT 1: Snapshot SSOT
// ============================================================

function enforceSnapshotSSoT(patches, snapshotLength) {
  if (!Array.isArray(patches)) {
    throw new InvariantViolation(
      1,
      "Patches must be array",
      { received: typeof patches }
    );
  }

  for (let i = 0; i < patches.length; i++) {
    const patch = patches[i];
    
    if (typeof patch.lineNumber !== 'number') {
      throw new InvariantViolation(
        1,
        `Patch ${i}: lineNumber must be number`,
        { patch, index: i }
      );
    }

    if (patch.lineNumber < 1 || patch.lineNumber > snapshotLength) {
      throw new InvariantViolation(
        1,
        `Patch ${i}: lineNumber violates snapshot bounds`,
        { 
          lineNumber: patch.lineNumber,
          snapshotLength,
          validRange: `[1, ${snapshotLength}]`,
          patch
        }
      );
    }
  }
}

// ============================================================
// INVARIANT 2: DESC Order
// ============================================================

function enforceDescOrder(patches) {
  if (!Array.isArray(patches) || patches.length <= 1) {
    return;  // Empty or single patch OK
  }

  // Group by type and check DESC within each type
  const typeMap = new Map();
  
  for (let i = 0; i < patches.length; i++) {
    const patch = patches[i];
    const type = patch.type;
    
    if (!typeMap.has(type)) {
      typeMap.set(type, []);
    }
    typeMap.get(type).push({ index: i, ...patch });
  }

  // For each type, verify DESC order
  for (const [type, patchesOfType] of typeMap) {
    for (let i = 0; i < patchesOfType.length - 1; i++) {
      const current = patchesOfType[i];
      const next = patchesOfType[i + 1];
      
      // Current MUST be > next (DESC order: high to low)
      if (current.lineNumber <= next.lineNumber) {
        throw new InvariantViolation(
          2,
          `${type} patches not in DESC order`,
          {
            type,
            violatingIndices: [current.index, next.index],
            violatingLineNumbers: [current.lineNumber, next.lineNumber],
            message: `Index ${current.index}(line ${current.lineNumber}) must be > index ${next.index}(line ${next.lineNumber})`
          }
        );
      }
    }
  }
}

// ============================================================
// INVARIANT 3: Immutable Snapshot
// ============================================================

function enforceImmutableSnapshot(snapshotLines) {
  if (!Object.isFrozen(snapshotLines)) {
    throw new InvariantViolation(
      3,
      "Snapshot must be frozen (immutable)",
      {
        isFrozen: Object.isFrozen(snapshotLines),
        suggestion: "Use Object.freeze(snapshotLines)"
      }
    );
  }
}

// ============================================================
// INVARIANT 4: Insert Bounds
// ============================================================

function enforceInsertBounds(insertPatches, snapshotLength) {
  for (let i = 0; i < insertPatches.length; i++) {
    const patch = insertPatches[i];
    
    // INSERT must be in [1, snapshotLength + 1]
    if (patch.lineNumber < 1 || patch.lineNumber > snapshotLength + 1) {
      throw new InvariantViolation(
        4,
        `INSERT patch ${i}: index out of snapshot bounds`,
        {
          lineNumber: patch.lineNumber,
          snapshotLength,
          validRange: `[1, ${snapshotLength + 1}]`,
          patch
        }
      );
    }
  }
}

// ============================================================
// INVARIANT 5: Independent Patches
// ============================================================

function enforceIndependentPatches(patches, snapshotLength) {
  // Simple check: no two patches on same line
  const lineMap = new Map();
  
  for (let i = 0; i < patches.length; i++) {
    const patch = patches[i];
    const lineNum = patch.lineNumber;
    
    if (lineMap.has(lineNum)) {
      throw new InvariantViolation(
        5,
        "Multiple patches target same line - independence violated",
        {
          lineNumber: lineNum,
          firstPatchIndex: lineMap.get(lineNum),
          secondPatchIndex: i,
          message: "Patches must be independent (no coupling)"
        }
      );
    }
    
    lineMap.set(lineNum, i);
  }
}

// ============================================================
// INVARIANT 6: Revision Increment
// ============================================================

function enforceRevisionIncrement(beforeRev, afterRev) {
  if (beforeRev === afterRev) {
    throw new InvariantViolation(
      6,
      "Revision did not increment after patch application",
      {
        before: beforeRev,
        after: afterRev,
        message: "Successful patches must increment revision"
      }
    );
  }
  
  // Optional: check increment is exactly +1 (if using v1, v2, v3 format)
  const beforeNum = parseInt(beforeRev.match(/\d+/)?.[0] || "0");
  const afterNum = parseInt(afterRev.match(/\d+/)?.[0] || "0");
  
  if (afterNum !== beforeNum + 1) {
    throw new InvariantViolation(
      6,
      "Revision increment is not monotonic +1",
      {
        before: beforeRev,
        after: afterRev,
        beforeNum,
        afterNum,
        message: "Must increment by exactly 1 (v1→v2, v2→v3)"
      }
    );
  }
}

// ============================================================
// INVARIANT 7: Fixed Snapshot Size
// ============================================================

function enforceFixedSnapshotSize(snapshotLines, capturedLength) {
  const currentLength = snapshotLines.length;
  
  if (currentLength !== capturedLength) {
    throw new InvariantViolation(
      7,
      "Snapshot size changed during execution",
      {
        capturedAt: capturedLength,
        currentSize: currentLength,
        message: "snapshotLength must never change"
      }
    );
  }
}

// ============================================================
// EXPORT GUARDS + UTILITIES
// ============================================================

export {
  InvariantViolation,
  enforceSnapshotSSoT,
  enforceDescOrder,
  enforceImmutableSnapshot,
  enforceInsertBounds,
  enforceIndependentPatches,
  enforceRevisionIncrement,
  enforceFixedSnapshotSize
};
