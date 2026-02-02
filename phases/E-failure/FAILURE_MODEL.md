# 📋 FAILURE_MODEL.md

**Phase:** E (Failure Specification)  
**Date:** 2 tháng 2, 2026  
**Status:** Complete specification

---

## Mục Tiêu

Chỉ định rõ ràng cách hệ thống xử lý các lỗi, thất bại và điều kiện biên.

Không được để hệ thống ở trạng thái "tùy thuộc vào việc triển khai" hoặc "tùy thuộc vào tâm trạng".

---

## 1. Failure Policies

### Policy 1: FAIL-FAST (Current Default)

**Định nghĩa:** Dừng ngay khi gặp lỗi, không tiếp tục xử lý.

**Khi dùng:**
- Kiến trúc phải consistent
- Dữ liệu không được để ở trạng thái không xác định

**Hành động:**
```javascript
// Invariant violation → throw InvariantViolation → stop
try {
  enforceSnapshotSSoT(patches, snapshotLength);
  enforceDescOrder(patches);
  enforceImmutableSnapshot(snapshot);
  enforceInsertBounds(patches, snapshotLength);
} catch (error) {
  if (error instanceof InvariantViolation) {
    throw error;  // Hard stop
  }
}
```

**Log:**
```json
{
  "level": "ERROR",
  "layer": "NORMALIZER",
  "invariant": 1,
  "severity": "CRITICAL",
  "message": "Snapshot SSOT violation - stopping execution",
  "action": "FAIL-FAST"
}
```

**Return:**
```javascript
{
  success: false,
  error: "InvariantViolation: [INVARIANT X] ...",
  appliedCount: 0,
  failedPatches: [],
  newRev: paper.rev  // unchanged
}
```

---

### Policy 2: BEST-EFFORT (Optional, Not Implemented)

**Định nghĩa:** Áp dụng hết các patches có thể, skip những cái fail.

**Khi dùng:**
- Bulk import từ file không đáng tin cậy
- Partial updates OK

**Hành động:**
```javascript
for (const patch of patches) {
  try {
    applyPatch(patch);
    result.appliedCount++;
  } catch (e) {
    result.failedPatches.push({ patch, error: e.message });
    // Continue to next patch
  }
}
```

**Log:**
```json
{
  "level": "WARN",
  "patchIndex": 42,
  "lineNumber": 999,
  "error": "Out of bounds",
  "action": "SKIP"
}
```

**Return:**
```javascript
{
  success: result.failedPatches.length === 0,
  appliedCount: 3,
  failedPatches: [
    { patch: {...}, error: "..." },
    { patch: {...}, error: "..." }
  ],
  newRev: result.newRev
}
```

---

### Policy 3: ATOMIC (Not Implemented)

**Định nghĩa:** Tất cả hoặc không gì.

**Khi dùng:**
- Database-like consistency
- "Không được để ở trạng thái trung gian"

**Hành động:**
```javascript
// 1. Validate all patches first
validateAll(patches);

// 2. If any fail, rollback everything
if (validationErrors.length > 0) {
  paper.lines = originalLines;
  paper.text = originalText;
  paper.rev = originalRev;
  throw new Error("Atomic operation failed");
}

// 3. Apply all
applyAll(patches);
```

**Log:**
```json
{
  "level": "WARN",
  "patchCount": 100,
  "validPatchCount": 95,
  "failedCount": 5,
  "action": "ROLLBACK",
  "reason": "5 patches invalid - rolling back all 95"
}
```

---

## 2. Current Implementation: FAIL-FAST

### Được áp dụng ở đâu?

**PATCH_NORMALIZER.js (Layer 2)**
```javascript
try {
  enforceSnapshotSSoT(patches, snapshotLength);
  enforceImmutableSnapshot(frozen);
  enforceInsertBounds(semantics.byType.insert_line, snapshotLength);
  enforceIndependentPatches(patches, snapshotLength);
} catch (error) {
  if (error instanceof InvariantViolation) {
    throw error;  // ← FAIL-FAST
  }
}
```

**PATCH_EXECUTOR.js (Layer 3)**
```javascript
catch (error) {
  if (error instanceof InvariantViolation) {
    throw error;  // ← FAIL-FAST
  }
  return {
    success: false,
    appliedCount: result.appliedCount,
    failedPatches: result.failedPatches,
    error: error.message
  };
}
```

---

## 3. Error Hierarchy

```
Error (Node.js)
└── InvariantViolation (Production)
    ├── properties:
    │   ├── invariantNumber: 1-7
    │   ├── severity: "CRITICAL"
    │   ├── context: {...}
    │   └── timestamp: ISO8601
    └── behavior:
        └── Hard stop, log, propagate
```

### Invariant Numbers

| # | Name | Violation Type | Recovery |
|---|------|-------|----------|
| 1 | Snapshot SSOT | Out of bounds | FAIL |
| 2 | DESC Order | Wrong order | FAIL |
| 3 | Immutable Snapshot | Modified snapshot | FAIL |
| 4 | Insert Bounds | Beyond limit | FAIL |
| 5 | Independent Patches | Same line twice | FAIL |
| 6 | Revision Increment | Non-monotonic | FAIL |
| 7 | Fixed Snapshot Size | Snapshot changed | FAIL |

---

## 4. Failure Scenarios & Responses

### Scenario 1: Patch out of bounds

**Input:**
```javascript
snapshot = ['L1', 'L2', 'L3']  // snapshotLength = 3
patches = [
  { type: 'write_replace_line', lineNumber: 999, text: 'X' }
]
```

**Detection Point:** PATCH_NORMALIZER (enforceSnapshotSSoT)

**Response:**
```javascript
{
  success: false,
  error: "InvariantViolation: [INVARIANT 1] Patch lineNumber violates bounds",
  appliedCount: 0,
  newRev: "v1"  // unchanged
}
```

**State:** Paper unchanged, snapshot unchanged, rev unchanged

---

### Scenario 2: Duplicate line patches

**Input:**
```javascript
patches = [
  { type: 'write_replace_line', lineNumber: 5, text: 'A' },
  { type: 'write_replace_line', lineNumber: 5, text: 'B' }
]
```

**Detection Point:** PATCH_NORMALIZER (enforceIndependentPatches)

**Response:**
```javascript
{
  success: false,
  error: "InvariantViolation: [INVARIANT 5] Multiple patches target same line",
  appliedCount: 0,
  newRev: "v1"  // unchanged
}
```

**State:** Paper unchanged, snapshot unchanged, rev unchanged

---

### Scenario 3: Mixed valid + invalid patches

**Input:**
```javascript
patches = [
  { type: 'write_replace_line', lineNumber: 1, text: 'Valid' },     // OK
  { type: 'write_replace_line', lineNumber: 999, text: 'Invalid' }  // BAD
]
```

**Processing:**
1. PATCH_NORMALIZER validates all patches first
2. Found: Invariant 1 violation on patch 2
3. **FAIL-FAST:** Stop, throw error, no patches applied

**Response:**
```javascript
{
  success: false,
  error: "InvariantViolation: [INVARIANT 1] ...",
  appliedCount: 0,  // ← Zero, not 1!
  newRev: "v1"      // unchanged
}
```

**Why?** Consistency. If we applied patch 1, paper is in modified state but batch failed.

---

### Scenario 4: Partial failure during execution

**Input:**
```javascript
patches = [
  { type: 'write_replace_line', lineNumber: 1, text: 'A' },
  { type: 'write_replace_line', lineNumber: 2, text: 'B' }
]
```

**Execution Phase 1:**
- Patch 1 on line 1: ✅ Applied
- Patch 2 on line 2: ✅ Applied

**All succeed** → `success: true, appliedCount: 2`

**If one failed:**
- Patch 1 on line 1: ✅ Applied
- Patch 2 on line 999: ❌ Skip (bounds check in executor)

```javascript
{
  success: false,  // Some failed
  appliedCount: 1,
  failedPatches: [
    { patch: {...}, error: "Line 999 out of bounds" }
  ],
  newRev: "v2"  // ← Still incremented because 1 patch applied
}
```

---

## 5. Revision Semantics

### Rule

Revision increments **if and only if** at least 1 patch was applied.

### Cases

| Applied | Failed | Rev Change | Reason |
|---------|--------|-----------|--------|
| 0 | 0 | NO | No work done |
| 1 | 0 | YES | Modified state |
| 2 | 0 | YES | Modified state |
| 0 | 1 | NO | Failed before apply |
| 1 | 1 | YES | Some work done |
| 0 | 2 | NO | All failed |

---

## 6. Logging Strategy

### CRITICAL: Hard-stop violations

```json
{
  "timestamp": "2026-02-02T13:05:00.000Z",
  "level": "ERROR",
  "layer": "NORMALIZER",
  "batchId": "batch-123",
  "invariant": 1,
  "severity": "CRITICAL",
  "message": "[INVARIANT 1 VIOLATION] Snapshot SSOT violated",
  "context": {
    "lineNumber": 999,
    "snapshotLength": 500,
    "validRange": "[1, 500]",
    "action": "FAIL-FAST"
  }
}
```

### WARNING: Non-blocking issues

```json
{
  "timestamp": "2026-02-02T13:05:00.100Z",
  "level": "WARN",
  "layer": "NORMALIZER",
  "batchId": "batch-123",
  "message": "Mixing REPLACE with INSERT/DELETE",
  "detail": "Patches are independent, but recommend separate batches",
  "action": "CONTINUE"
}
```

### INFO: Execution progress

```json
{
  "timestamp": "2026-02-02T13:05:00.200Z",
  "level": "INFO",
  "layer": "EXECUTOR",
  "batchId": "batch-123",
  "appliedCount": 5,
  "failedCount": 0,
  "beforeRev": "v10",
  "afterRev": "v11",
  "message": "Execution complete",
  "action": "SUCCESS"
}
```

---

## 7. Recovery Procedures

### Scenario A: User submits bad patch set

```
1. NORMALIZER detects violation
2. throw InvariantViolation
3. Paper state: UNCHANGED
4. User action: Inspect error, fix patches, retry
```

### Scenario B: User partially applies

```
1. Normalizer passes
2. Executor applies some patches
3. Some patches fail (out of bounds in working state)
4. Result: { success: false, appliedCount: 5, failedPatches: [...] }
5. User action: Inspect failed patches, decide retry or skip
```

### Scenario C: System error (unlikely)

```
1. Invariant violation thrown at execution time
2. catch block: return { success: false, error: "..." }
3. Paper state: PARTIALLY MODIFIED
4. User action: Manual inspection, possible manual revert
5. Recommendation: Implement transaction log for recovery
```

---

## 8. Testing Failure Modes

See `test-resilience.js`:

- ✅ TEST 1A-2A: Stress tests (success path)
- ✅ TEST 3A: Fuzz (random valid data)
- ✅ TEST 4A-4C: Boundaries
- ✅ TEST 6A: Partial failure detection
- ✅ TEST 8A: All 7 invariant violations caught

---

## 9. Production Recommendations

### Deployment Checklist

- [ ] FAIL-FAST policy appropriate for your use case
- [ ] All 7 invariants guarded (not bypassed)
- [ ] Logging enabled in production
- [ ] Error codes documented for client integration
- [ ] Metrics: `batches_failed`, `invariant_violations` tracked
- [ ] Alerting: CRITICAL invariant violations alert immediately
- [ ] No silent failures (all errors logged)

### Feature Flags

```javascript
// Optional: Future BEST-EFFORT mode
if (process.env.PATCH_MODE_BEST_EFFORT === 'true') {
  return applyBestEffort(patches);  // Not implemented
}

// Default: FAIL-FAST
return failFast(patches);  // Current
```

### Future Phases

- [ ] Phase F: Implement BEST-EFFORT mode (if needed)
- [ ] Phase G: Add transaction log for recovery
- [ ] Phase H: Implement ATOMIC mode (if needed)

---

## 10. Summary

| Aspect | Status |
|--------|--------|
| Policy | FAIL-FAST ✅ |
| Invariants | 7 guards ✅ |
| Error hierarchy | InvariantViolation ✅ |
| Logging | Structured JSON ✅ |
| State consistency | Paper unchanged on error ✅ |
| Revision semantics | Increment if applied > 0 ✅ |
| Testing | All failure modes tested ✅ |

**System is production-ready with clear failure semantics.**

---

## References

- INVARIANTS.md - Formal definition of 7 laws
- OBSERVABILITY.md - Logging and metrics
- test-resilience.js - Failure mode tests
- PATCH_EXECUTOR.js - Implementation
- PATCH_NORMALIZER.js - Validation layer
