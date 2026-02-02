# 🔍 AUDIT REPORT - Batch Patch System

**Date:** 2 tháng 2, 2026  
**Auditor:** System Engineer  
**Scope:** Snapshot SSOT, DESC Sort, Execution State, Line Drift Risk  
**Result:** 🟡 **RISKY** (Several critical issues found)

---

## 📋 Executive Summary

✅ **Đã làm đúng:**
- DESC sort algorithm triển khai đúng
- Revision tracking hoạt động
- Test coverage toàn diện

⚠️ **Vấn đề tìm thấy:**
1. **Snapshot SSOT không rõ ràng** - Patches áp dụng lên `workingLines` (bản copy), không snapshot gốc
2. **Semantic Coupling ẩn** - insert/delete patches ảnh hưởng line number của replace patches
3. **Mixed patch types - DESC order nguy hiểm** - insert ở dòng cao → xóa ở dòc thấp → replace có line drift
4. **Invariant Guards thiếu** - Không có test bảo vệ snapshot SSOT
5. **Execution state không tách rõ** - workingLines là state, nhưng không có documented snapshot

---

## 🔍 CHI TIẾT KIỂM TRA

### 1️⃣ SNAPSHOT SSOT ⚠️ **RISKY**

#### Kết luận: **KHÔNG RÕ RÀNG - CÓ NGUY HIỂM**

**Chi tiết:**

📝 **File:** [CONTROLLER_ACTION.js](CONTROLLER_ACTION.js#L32-L40)  
**Code:**
```javascript
async function applyPatchesAction(params, paper) {
  const { patches } = params;
  
  try {
    const lines = paper.lines || [];
    let workingLines = [...lines];  // ⚠️ Bản copy, không snapshot gốc
```

**Vấn đề 1: Không lưu snapshot gốc**
```javascript
// ❌ HIỆN TẠI:
const lines = paper.lines || [];
let workingLines = [...lines];  // Shallow copy, nhưng không có "snapshot" name

// ✔️ NÊN LÀ:
const snapshotLines = [...paper.lines];  // Document rõ SSOT
let workingLines = [...snapshotLines];   // Explicit copy từ snapshot
```

**Vấn đề 2: Không kiểm tra semantic của patch dựa trên snapshot**
```javascript
// ❌ HIỆN TẠI: Kiểm tra line 7 tồn tại trên workingLines
if (lineIdx < 0 || lineIdx >= workingLines.length) {
  // ❌ BUG: workingLines bị thay đổi bởi insert/delete ở bước trước!
  result.failedPatches.push({...});
}

// ✔️ NÊN LÀ:
if (lineIdx < 0 || lineIdx >= snapshotLines.length) {
  // ✔️ Kiểm tra theo snapshot GỐC, không theo trạng thái tạm
  result.failedPatches.push({...});
}
```

**Kết quả:**
- ✅ Patches được tạo dựa trên `params.patches` từ user (snapshot gốc)
- ⚠️ Nhưng validation và execution lẫn lộn giữa snapshot vs execution state
- ⚠️ Không có documented "snapshot line numbers" vs "execution line numbers"

---

### 2️⃣ DESC NORMALIZATION ✅ **SAFE**

#### Kết luận: **ĐÚNG - RỦI RO GIẢM**

**Chi tiết:**

📝 **File:** [CONTROLLER_ACTION.js](CONTROLLER_ACTION.js#L47-L54)  
**Code:**
```javascript
// STEP 1: Separate patches by type
const replacePatchesDesc = patches
  .filter(p => p.type === "write_replace_line")
  .sort((a, b) => b.lineNumber - a.lineNumber); // DESC: 7, 5, 2 ✅

const insertPatchesDesc = patches
  .filter(p => p.type === "insert_line")
  .sort((a, b) => b.lineNumber - a.lineNumber); // DESC ✅

const deletePatchesDesc = patches
  .filter(p => p.type === "delete_line")
  .sort((a, b) => b.lineNumber - a.lineNumber); // DESC ✅
```

**Điểm tốt:**
- ✅ DESC sort được áp dụng cho TẤT CẢ patch types
- ✅ Replace patches (7→5→2) không bị line shift
- ✅ Test 2 (DESC Sort Critical) xác nhận: lines 2, 5, 7 được sửa đúng
- ✅ Test 7 (Large Batch): 50 patches DESC sort thành công

**Cảnh báo - Interaction Risk:**
- ⚠️ INSERT từ cao xuống (DESC) → RỒI DELETE từ cao xuống (DESC)
  - Insert ở line 8 → workingLines có 9 lines
  - Delete ở line 7 → line 9 bị xóa ✅ (đúng)
  - ✅ Vẫn an toàn vì DESC order

- ⚠️ NHƯNG nếu future code thay đổi thứ tự: replace → insert → delete (ASC)
  - ❌ DELETE line 3 → xóa line 3, lines 5,7 thành 4,6
  - ❌ INSERT line 8 → sai vị trí
  - ❌ REPLACE line 7 → sai vị trí
  - **BROKEN!**

**Test bảo vệ:**
- ✅ test-phase-03.js - TEST 2: DESC order test
- ✅ test-phase-04.js - TEST 6: DESC sort in pipeline
- ⚠️ **NHƯNG:** Không có test với INSERT + DELETE + REPLACE mix

---

### 3️⃣ EXECUTION STATE FLOW ⚠️ **RISKY**

#### Kết luận: **KHÔNG TÁCH RÕGỐC vs TRẠNG THÁI**

**Chi tiết:**

📝 **File:** [CONTROLLER_ACTION.js](CONTROLLER_ACTION.js#L57-L68)  
**Code:**
```javascript
// STEP 2: Apply write_replace_line patches (DESC order)
for (const patch of replacePatchesDesc) {
  const lineIdx = patch.lineNumber - 1;

  // ⚠️ Validate theo workingLines (đã bị thay đổi!)
  if (lineIdx < 0 || lineIdx >= workingLines.length) {
    result.failedPatches.push({
      patch,
      error: `Line ${patch.lineNumber} out of range (1-${workingLines.length})`
    });
    continue;
  }

  workingLines[lineIdx] = patch.text;  // ✅ Apply trên execution state
  result.appliedCount++;
}

// STEP 3: Apply insert_line patches
for (const patch of insertPatchesDesc) {
  // ⚠️ workingLines.length đã tăng do replace() bước 2!
  if (insertIdx < 0 || insertIdx > workingLines.length) {
    ...  // Error check lại workingLines
  }
  workingLines.splice(insertIdx, 0, patch.text);  // ✅ Apply trên state mới
}
```

**Vấn đề: Validation vs State**
```
Scenario:
- Snapshot: 5 lines
- Patches: 
  1. REPLACE line 5 with "X"
  2. INSERT at line 6

Flow hiện tại:
1. replacePatchesDesc = [{ type: "replace", lineNumber: 5 }]
2. Validate: lineIdx=4 < 5 ✅ (workingLines=5)
3. Apply: workingLines[4]="X", length still 5
4. insertPatchesDesc = [{ type: "insert", lineNumber: 6 }]
5. Validate: insertIdx=6 <= 5 ❌ FAIL! (should succeed)
```

**Kết luận:**
- ✅ Execution state tăng dần (revision v1→v2→v3)
- ✅ Patches được apply lần lượt
- ⚠️ **NHƯNG:** Validation theo workingLines (execution state), không snapshot
- ⚠️ **RỦI RO:** INSERT sau REPLACE có thể fail do state bị thay đổi

---

### 4️⃣ LINE DRIFT RISK ✅ **MOSTLY SAFE**

#### Kết luận: **DESC SORT NGĂN CHẶN, NHƯNG CÓ EDGE CASES**

**Chi tiết:**

📝 **Test:** [test-phase-03.js](test-phase-03.js#L60-L102) - TEST 2: DESC Sort Critical  
**Result:** ✅ PASS - Lines 2, 5, 7 được sửa đúng, NO line drift

**Scenario Phân tích:**
```
Initial: Line 1, 2, 3, 4, 5, 6, 7, 8

Patches (input order):
  [
    { type: "replace", line: 2, text: "CHANGED" },
    { type: "replace", line: 7, text: "CHANGED" },
    { type: "replace", line: 5, text: "CHANGED" }
  ]

DESC Sort → Apply:
  1. REPLACE line 7 → workingLines[6] = "CHANGED" ✅
  2. REPLACE line 5 → workingLines[4] = "CHANGED" ✅
  3. REPLACE line 2 → workingLines[1] = "CHANGED" ✅

Result: Lines 2, 5, 7 correct ✅ NO DRIFT ✅
```

**Nhưng có edge case nguy hiểm:**

```
⚠️ EDGE CASE: INSERT + REPLACE

Scenario:
- Initial: 5 lines
- Patches:
  1. INSERT line 6 "NEW"     (insertPatchesDesc[0])
  2. REPLACE line 6 "X"      (replacePatchesDesc[0] - dựa trên snapshot!)

Problem:
- INSERT dòng 6 từ DESC → INSERT line 6 (dòng có 6 lines)
- REPLACE dòng 6 → nhưng dòng 6 bây giờ là "NEW"!
- Người dùng muốn replace dòng 6 của SNAPSHOT (không tồn tại)
- KỲ VỰC!

Current code: ✅ Vẫn safe vì line validation:
- INSERT dòng 6: insertIdx=6, workingLines.length=5 → ❌ FAIL
- REPLACE dòng 6: đã tồn tại sau INSERT → ✅ OK (nhưng không là dòng original!)
```

**Risk Summary:**
- ✅ Pure REPLACE patches: DESC order = SAFE
- ✅ Pure DELETE patches: DESC order = SAFE
- ✅ Pure INSERT patches: DESC order = SAFE
- ⚠️ Mixed types (INSERT + REPLACE): Có rủi ro semantic coupling
- ✅ Nhưng current validation bắt lỗi (dù không phải quy tắc đúng)

---

### 5️⃣ SEMANTIC COUPLING ⚠️ **RISKY**

#### Kết luận: **CÓ COUPLING ẨN - PATCHES PHỤ THUỘC STATE**

**Chi tiết:**

**Vấn đề 1: INSERT thay đổi line numbers của REPLACE**

```
Scenario:
- Snapshot: Line 1, 2, 3, 4, 5
- Patches:
  1. INSERT at line 6 "NEW_LINE"      (insertPatchesDesc[0])
  2. REPLACE line 5 "MODIFIED"        (replacePatchesDesc[0])

Application order (theo code):
  1. Apply REPLACE patches first (lines 5→2)
     - REPLACE line 5 ✅
  2. Apply INSERT patches second (lines 6+)
     - INSERT line 6: insertIdx=6, workingLines.length=5 → ❌ FAIL!

⚠️ ISSUE: INSERT validation assumes snapshot line count!
```

**Vấn đề 2: DELETE thay đổi indices của REPLACE**

```
Scenario:
- Snapshot: Line 1, 2, 3, 4, 5
- Patches:
  1. DELETE line 2       (deletePatchesDesc[0])
  2. REPLACE line 3 "X"  (replacePatchesDesc[0])

Application order (theo code):
  1. Apply REPLACE patches: line 3 ✅
  2. Apply INSERT patches: (none)
  3. Apply DELETE patches:
     - DELETE line 2: lineIdx=1, workingLines.length still 5 ✅

⚠️ ISSUE: After DELETE line 2, what was line 3 becomes line 2!
Original line 3 replaced, but semantically it moved.
```

**Coupling Analysis:**

| Operation | Độc lập? | Vấn đề |
|-----------|----------|--------|
| REPLACE only | ✅ | Không |
| DELETE only | ✅ | Không |
| INSERT only | ✅ | Không |
| REPLACE + DELETE | ⚠️ | Line number conflict (DELETE changes indices) |
| REPLACE + INSERT | ⚠️ | INSERT validation fails if line > snapshot length |
| INSERT + DELETE | ⚠️ | Complex, need careful ordering |
| All 3 mixed | ❌ | RISKY - Patches không independent |

**Kết luận:**
- ⚠️ Patches KHÔNG thực sự "independent"
- ⚠️ DESC sort chỉ giúp REPLACE safe, không handle INSERT+DELETE interaction
- ❌ **DOCUMENT CLAIM SAI:** "All patches are applied to the same snapshot - line drift = 0"
  - Snapshot = base para validation
  - Nhưng execution thay đổi state
  - Patches không thực sự independent

---

### 6️⃣ INVARIANT GUARDS ❌ **MISSING**

#### Kết luận: **KHÔNG CÓ TEST BẢO VỆ CRITICAL INVARIANTS**

**Chi tiết:**

**Missing Invariant 1: Snapshot SSOT**
```javascript
// ❌ KHÔNG CÓ TEST:
test("Snapshot không được thay đổi", () => {
  const snapshot = [Line 1, 2, 3];
  const patches = [REPLACE line 2, INSERT line 4];
  
  const snapshotBefore = [...snapshot];
  applyPatchesAction({patches}, {lines: snapshot});
  
  // snapshot phải không đổi (copy)
  assert.deepEqual(snapshot, snapshotBefore);
});
```

**Missing Invariant 2: DESC Sort Always Runs**
```javascript
// ❌ KHÔNG CÓ TEST:
test("DESC sort always applied", () => {
  const patches = [
    {type: "replace", line: 2},
    {type: "replace", line: 7},
    {type: "replace", line: 5}
  ];
  
  // Spy on sort function
  const sortedReplace = patches
    .filter(p => p.type === "replace")
    .sort((a, b) => b.lineNumber - a.lineNumber);
  
  // Verify order is DESC
  assert.deepEqual(
    sortedReplace.map(p => p.line),
    [7, 5, 2]
  );
});
```

**Missing Invariant 3: Revision Always Increments**
```javascript
// ❌ KHÔNG CÓ TEST:
test("Revision always increments on success", () => {
  const paper = {rev: "v5"};
  
  // Success case
  await applyPatchesAction({patches: [...]}, paper);
  assert(paper.rev === "v6");
  
  // Even partial failure, revision increments
  paper.rev = "v5";
  await applyPatchesAction({patches: [valid, invalid]}, paper);
  assert(paper.rev !== "v5");  // Changed even though some failed
});
```

**Existing Tests:**
- ✅ test-phase-03.js TEST 6: Revision tracking
- ❌ Nhưng chỉ test happy path, không test failure cases

**Missing Tests:**
```javascript
❌ INSERT + DELETE + REPLACE interaction
❌ Snapshot immutability
❌ Line validation against snapshot vs execution state
❌ Partial failure (some patches ok, some fail)
❌ Order sensitivity (if code changes DESC→ASC)
```

---

## 📊 RISK MATRIX

| Khía cạnh | Status | Severity | Impact |
|----------|--------|----------|---------|
| DESC Sort | ✅ | - | Prevents line drift in replaces |
| Snapshot SSOT | ⚠️ | HIGH | Patches assumes snapshot, validation uses state |
| Execution State | ⚠️ | HIGH | Mixed replace+insert can fail |
| Semantic Coupling | ❌ | CRITICAL | Patches NOT independent despite claim |
| Invariant Guards | ❌ | MEDIUM | No test protects DESC always runs |
| Revision Tracking | ✅ | - | Works correctly |
| Error Handling | ⚠️ | MEDIUM | Some edge cases not covered |

---

## 🔧 CẢI THIỆN CỤ THỂ

### Fix 1: Snapshot SSOT Rõ Ràng

**File:** CONTROLLER_ACTION.js  
**Lines:** 32-40

```javascript
// ❌ HIỆN TẠI:
const lines = paper.lines || [];
let workingLines = [...lines];

// ✅ SỬA THÀNH:
const snapshotLines = [...(paper.lines || [])];  // Snapshot SSOT
let workingLines = [...snapshotLines];            // Execute state
let snapshotLength = snapshotLines.length;        // Store for validation

// Trong validation:
if (lineIdx < 0 || lineIdx >= snapshotLength) {  // Validate theo snapshot
  result.failedPatches.push({...});
}

// Nhưng apply trên:
workingLines[lineIdx] = patch.text;  // Execution state
```

### Fix 2: INSERT Validation Fix

**File:** CONTROLLER_ACTION.js  
**Lines:** 75-85

```javascript
// ❌ HIỆN TẠI:
const insertIdx = patch.lineNumber;
if (insertIdx < 0 || insertIdx > workingLines.length) {
  // Fails if INSERT after REPLACE changed length
}

// ✅ SỬA THÀNH:
const insertIdx = patch.lineNumber;
if (insertIdx < 0 || insertIdx > snapshotLength + 1) {
  // Allow INSERT at snapshot boundaries + insertions already made
  // Hoặc rejectinsert+replace mix entirely
}
```

### Fix 3: Semantic Coupling Test

**File:** test-phase-03.js  
**Add new test:**

```javascript
test("❌ FAILS: Mixed INSERT+REPLACE not independent", () => {
  const paper = new MockPaper("Line 1\nLine 2\nLine 3\nLine 4\nLine 5");
  
  const patches = [
    { type: "insert_line", lineNumber: 6, text: "NEW" },
    { type: "write_replace_line", lineNumber: 5, text: "MODIFIED" }
  ];
  
  const result = await applyPatchesAction({patches}, paper);
  
  // Current: INSERT fails because line 6 > snapshot (5)
  assert(!result.success, "Should fail - INSERT after REPLACE interaction");
  assert(result.failedPatches.length > 0);
});
```

---

## 📌 FINAL VERDICT

| Tiêu chí | Đánh giá | Kết luận |
|----------|---------|---------|
| **Snapshot SSOT** | ⚠️ Ẩn | Patches dựa snapshot, validate dựa state → RISKY |
| **DESC Normalization** | ✅ Đúng | Replace patches: SAFE. Mixed: RISKY |
| **Execution State** | ⚠️ Không rõ | v1→v2→v3 OK, nhưng INSERT+DELETE risky |
| **Line Drift** | ✅ Phần nào | DESC sort works, but only for replace |
| **Semantic Coupling** | ❌ CÓ | Patches phụ thuộc nhau, không "independent" |
| **Invariant Guards** | ❌ THIẾU | Không có test bảo vệ |

### 🎯 OVERALL: **🟡 RISKY**

**Có thể dùng Phase 05 nhưng CẦN:**
1. ✅ Thêm Snapshot SSOT documentation
2. ✅ Fix INSERT validation
3. ✅ Thêm test cho mixed patch types
4. ✅ Document rõ "patches must be independent"
5. ⚠️ Hoặc: Reject mixed INSERT+DELETE pairs

---

## 🚀 KHUYẾN NGHỊ PHASE 05

**Trước Phase 05 (Production), phải:**

- [ ] Fix Fix 1: Snapshot SSOT rõ ràng
- [ ] Fix Fix 2: INSERT validation
- [ ] Add test-phase-03.5.js: Semantic coupling tests
- [ ] Document: "Independent patches only - no INSERT/DELETE mixes"
- [ ] Feature flag: `PATCH_MODE_BETA` (opt-in, not default)
- [ ] Monitoring: Track failed patches, revision skips

**Nếu FIX XONG:**
- ✅ Ready for Phase 05
- ✅ Safe for production with feature flag

**Nếu KHÔNG FIX:**
- ⚠️ Có nguy cơ silent data corruption
- ⚠️ INSERT patches có thể fail mà user không biết
- ❌ Không nên merge vào production

