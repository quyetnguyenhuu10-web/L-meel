# 🔒 INVARIANTS - System Laws (Bất Biến Hệ Thống)

**Date:** 2 tháng 2, 2026  
**Purpose:** Define formal system invariants that must be enforced  
**Status:** PRODUCTION-GRADE SPECIFICATION  

---

## What Are Invariants?

**Invariant** = A condition that must ALWAYS be true

- If violated → **CRASH**, don't proceed
- Not just a warning → **HARD STOP**
- Must be testable → **Always tested**

Example: "A snapshot is immutable"
- If code tries to mutate snapshot → ❌ CRASH
- If test violates this → ❌ FAIL
- If audit finds violation → ❌ REJECT

---

## Core Invariants of Patch Mode

### **INVARIANT 1: Snapshot SSOT (Single Source of Truth)**

**Definition:**
```
All patch semantics (lineNumber, text meaning) are defined
relative to the INITIAL snapshot at call time.
No patch may reference intermediate execution state.
```

**Formal:**
```
snapshotLines := paper.lines at applyPatchesAction entry
∀ patch ∈ patches: patch.lineNumber ∈ [1, snapshotLength]
∀ patch ∈ patches: meaning(patch) := evaluate(patch, snapshotLines)
```

**Why:**
- Prevents line drift ambiguity
- Patches are deterministic
- Can be replayed/audited

**Enforcement:**
```javascript
const snapshotLines = Object.freeze([...paper.lines]);
const snapshotLength = snapshotLines.length;

// MUST validate against snapshot, not execution state
if (patch.lineNumber < 1 || patch.lineNumber > snapshotLength) {
  throw new InvariantViolation(
    "Patch lineNumber violates snapshot bounds",
    { patch, snapshotLength }
  );
}
```

---

### **INVARIANT 2: Patches Applied in Descending Line Order**

**Definition:**
```
When applying patches of the same type (REPLACE, INSERT, DELETE),
higher line numbers must be processed before lower ones.
```

**Formal:**
```
replacePatchesDesc = sort(replacePatchesByType, (a,b) => b.lineNumber - a.lineNumber)
insertPatchesDesc  = sort(insertPatchesByType,  (a,b) => b.lineNumber - a.lineNumber)
deletePatchesDesc  = sort(deletePatchesByType,  (a,b) => b.lineNumber - a.lineNumber)

apply(replacePatchesDesc) then apply(insertPatchesDesc) then apply(deletePatchesDesc)
```

**Why:**
- Prevents line number shifts
- Each patch sees consistent indices
- Deterministic execution order

**Enforcement:**
```javascript
// Verify sort is DESC
const sorted = patches.sort((a, b) => b.lineNumber - a.lineNumber);
if (!arraysEqual(patches, sorted)) {
  throw new InvariantViolation(
    "Patches not in DESC order - possible line drift",
    { patches, sorted }
  );
}
```

---

### **INVARIANT 3: Execution State Mutable, Snapshot Immutable**

**Definition:**
```
snapshotLines is frozen and never changes.
workingLines mutates as patches apply.
These are two separate objects.
```

**Formal:**
```
snapshotLines ∈ FROZEN_OBJECT_SET
workingLines ∈ MUTABLE_ARRAY_SET
snapshotLines ≠ workingLines (different references)
∀ operation: snapshotLines unchanged
```

**Why:**
- Clear separation of concerns
- Can revert to snapshot
- Allows replay/audit trail

**Enforcement:**
```javascript
const snapshotLines = Object.freeze([...paper.lines]);
let workingLines = [...snapshotLines];  // Separate copy

// Guard: snapshot never mutated
Object.isFrozen(snapshotLines) || 
  throw new InvariantViolation("Snapshot was mutated");
```

---

### **INVARIANT 4: Insert Index Bounds**

**Definition:**
```
An INSERT patch at lineNumber N means:
- N ∈ [1, snapshotLength + 1]
- Not N ∈ [1, currentExecutionLength]
- Based on SNAPSHOT, not execution state
```

**Formal:**
```
∀ insertPatch: 1 ≤ insertPatch.lineNumber ≤ snapshotLength + 1
Violations: insertPatch.lineNumber > snapshotLength + 1 → REJECT
```

**Why:**
- INSERT is semantically defined on snapshot
- Prevents "out of bounds" surprises
- Catches coupling with other operations

**Enforcement:**
```javascript
if (insertPatch.lineNumber < 1 || 
    insertPatch.lineNumber > snapshotLength + 1) {
  throw new InvariantViolation(
    "INSERT patch violates snapshot bounds",
    { 
      lineNumber: insertPatch.lineNumber,
      snapshotLength,
      validRange: [1, snapshotLength + 1]
    }
  );
}
```

---

### **INVARIANT 5: No Patch May Depend on Intermediate Execution State**

**Definition:**
```
No patch's semantics can be based on changes made by
previous patches in the same batch.
Patches are INDEPENDENT.
```

**Formal:**
```
∀ i, j: i ≠ j ∈ patches
  semantics(patches[i]) ⊥ semantics(patches[j])
  (Patches[i] is independent of patches[j])
```

**Examples of VIOLATION:**
```javascript
// ❌ BAD:
patches: [
  { type: "insert_line", lineNumber: 3, text: "INSERTED" },
  { type: "replace_line", lineNumber: 3, text: "MODIFY_THE_INSERT" }  // Depends on insert!
]

// ❌ BAD:
patches: [
  { type: "delete_line", lineNumber: 5 },
  { type: "replace_line", lineNumber: 6, text: "X" }  // Expects line 6 to exist
]
```

**Examples of OK:**
```javascript
// ✅ GOOD:
patches: [
  { type: "replace_line", lineNumber: 2, text: "X" },
  { type: "replace_line", lineNumber: 5, text: "Y" },
  { type: "replace_line", lineNumber: 8, text: "Z" }
]
```

**Why:**
- Makes batch deterministic
- Can be reordered/retried
- Prevents semantic coupling bugs

**Enforcement:**
```javascript
// Detect violations (heuristic)
const patchLines = new Set();
for (const patch of patches) {
  // REPLACE/INSERT/DELETE all reference same line from snapshot
  if (patchLines.has(patch.lineNumber)) {
    throw new InvariantViolation(
      "Multiple patches target same line - independence violated",
      { lineNumber: patch.lineNumber, patches }
    );
  }
  patchLines.add(patch.lineNumber);
}
```

---

### **INVARIANT 6: Revision Always Increments on Success**

**Definition:**
```
After successful applyPatchesAction, paper.rev must increment.
v1 → v2, v2 → v3, etc.
Monotonic increasing.
```

**Formal:**
```
∀ call to applyPatchesAction:
  result.success = true → paper.rev > previous.rev
  Revision must increment by exactly 1 minor version
```

**Why:**
- Track state changes
- Detect silent failures
- Audit trail

**Enforcement:**
```javascript
const revisionBefore = paper.rev;
await applyPatchesAction(params, paper);
const revisionAfter = paper.rev;

if (revisionAfter === revisionBefore) {
  throw new InvariantViolation(
    "Revision did not increment after patch application",
    { before: revisionBefore, after: revisionAfter }
  );
}
```

---

### **INVARIANT 7: Snapshot Length Fixed During Execution**

**Definition:**
```
snapshotLength is constant throughout patch application.
It's captured at entry and never re-evaluated.
```

**Formal:**
```
snapshotLength := |snapshotLines| at applyPatchesAction(entry)
∀ operation during applyPatchesAction: snapshotLength unchanged
```

**Why:**
- Prevents re-binding snapshot size
- Validation remains consistent
- Bounds are fixed

**Enforcement:**
```javascript
const snapshotLength = snapshotLines.length;

// Guard: Don't read paper.lines.length again
// ❌ WRONG: if (lineIdx >= paper.lines.length) { ... }
// ✅ RIGHT: if (lineIdx >= snapshotLength) { ... }
```

---

## Summary Table

| Invariant | Definition | Enforcement | Test |
|-----------|------------|-------------|------|
| 1. Snapshot SSOT | All patches relative to initial snapshot | Validate against snapshotLength | TEST_1A |
| 2. DESC Order | Apply patches high→low | Sort all patch types DESC | TEST_2A |
| 3. Immutable Snapshot | snapshotLines frozen, workingLines mutable | Object.freeze() + guards | TEST_3A |
| 4. Insert Bounds | insertIdx ∈ [1, snapshotLength+1] | Explicit bounds check | TEST_4A |
| 5. Independent Patches | No patch depends on others | Detect multiple patches per line | TEST_5A |
| 6. Revision Increment | paper.rev must increase | Assert new > old | TEST_6A |
| 7. Fixed Snapshot Size | snapshotLength never changes | Capture once, use consistently | TEST_7A |

---

## Invariant Violation = Crash

```javascript
class InvariantViolation extends Error {
  constructor(message, context) {
    super(`[INVARIANT VIOLATION] ${message}`);
    this.context = context;
    this.severity = "CRITICAL";  // Always critical
    console.error({
      error: this.message,
      context,
      stack: this.stack
    });
  }
}
```

**When invariant violated:**
1. ❌ STOP execution immediately
2. ❌ Revert any changes
3. ❌ Log with full context
4. ❌ Alert operations team (if production)
5. ❌ Never proceed

---

## Testing Invariants

Every invariant must have dedicated test:

```javascript
// test-invariants.js
test("Invariant 1: Snapshot SSOT - lineNumber validation", () => {
  const paper = { lines: ["L1", "L2", "L3"] };
  const patches = [
    { type: "replace", lineNumber: 10 }  // Violates!
  ];
  
  assert.throws(
    () => applyPatchesAction({patches}, paper),
    InvariantViolation,
    "Should reject patch outside snapshot bounds"
  );
});

test("Invariant 2: DESC Order - patches applied high→low", () => {
  const patches = [
    { type: "replace", line: 2 },
    { type: "replace", line: 7 },
    { type: "replace", line: 5 }
  ];
  
  const sorted = patches.sort((a,b) => b.line - a.line);
  assert.deepEqual(
    sorted.map(p => p.line),
    [7, 5, 2],
    "Patches must be DESC"
  );
});

// ... etc for all 7 invariants
```

---

## Why This Matters (Production Context)

When you scale to:
- **1000s of patches/day** → Invariant violations save your data
- **Distributed system** → Clear invariants = clear protocol
- **Audit requirement** → Invariants = provable guarantees
- **Team scale** → Invariants = code review checklist

**Senior engineers always:**
1. ✅ Define invariants first
2. ✅ Enforce in code (hard stops)
3. ✅ Test invariants (not just features)
4. ✅ Document & audit
5. ✅ Monitor violations

---

## References

- **Concurrent Programming:** Leslie Lamport - "Specifying Systems"
- **Database Theory:** Serializability invariants
- **Distributed Systems:** Consistency invariants
- **Formal Methods:** Program correctness

This document + code enforcement = **PRODUCTION-GRADE SYSTEM**

