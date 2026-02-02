# 📋 SEQUENTIAL PATCH MODE - IMPLEMENTATION GUIDE

**Ngày:** 2 tháng 2, 2026  
**Phiên bản:** 1.0 - Phase 1 Implementation  
**Mô hình:** Hybrid Sequential (Single + Patch)  
**Mục đích:** Tối ưu token/latency cho batch independent edits  

---

## 📊 Overview

### Current Architecture (Single Mode)
```
User request
    ↓
AI decides 1 action at a time
    ↓ (Iteration 1)
AI search/edit → System execute → Verify → AI sees result
    ↓ (Iteration 2)
AI search/edit → System execute → Verify → AI sees result
    ↓ (Iteration 3)
... (N iterations)
    ↓
Final reply
```

### New Architecture (Single + Patch Hybrid)
```
User request
    ↓
AI analyzes: is this batch-friendly?
    ├─ If dependent edits OR file small → use Single Mode
    └─ If independent edits + file large → use Patch Mode
    ↓
SINGLE MODE: Same as current (sequential 1:1)
PATCH MODE: New path
    ├─ Search all targets at once
    ├─ Collect patches (list of edits)
    ├─ Apply all patches in 1 batch
    ├─ Verify all changes at once
    └─ Done
    ↓
Final reply
```

---

## 🎯 Phase 1: New Tool - `apply_patches`

### Tool Definition (aiClient-agent.js)

**Add to TOOLS array** (after `clear_all`, before `verify`):

```javascript
{
  name: "apply_patches",
  description: "Apply multiple independent edits in one batch operation. All patches are applied to the same snapshot - line drift = 0. Use when edits don't depend on each other.",
  parameters: {
    type: "object",
    properties: {
      patches: {
        type: "array",
        description: "Array of patch objects, each modifying 1 line or appending",
        items: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: ["write_replace_line", "write_append", "set_text", "clear_all"],
              description: "Patch type"
            },
            lineNumber: {
              type: "number",
              description: "For write_replace_line only: 1-indexed line number"
            },
            text: {
              type: "string",
              description: "For write_replace_line/write_append/set_text: new content"
            },
            id: {
              type: "string",
              description: "Optional: patch ID for tracking (e.g., 'patch_0', 'patch_1')"
            }
          },
          required: ["type"]
        },
        minItems: 1,
        maxItems: 50
      }
    },
    required: ["patches"]
  }
}
```

### Executor (server-agent.js)

**Add new branch** (after `clear_all` handler, before `verify`):

```javascript
if (toolName === "apply_patches") {
  const patches = Array.isArray(args.patches) ? args.patches : [];
  
  if (patches.length === 0) {
    return {
      error: true,
      message: "apply_patches requires at least 1 patch"
    };
  }
  
  if (patches.length > 50) {
    return {
      error: true,
      message: "apply_patches supports max 50 patches at once"
    };
  }
  
  // Call controller with new action
  const result = await controller.execute("apply_patches", { patches });
  
  if (!result.ok) {
    return {
      error: true,
      message: result.error?.message || "Failed to apply patches"
    };
  }
  
  // Broadcast patch results
  broadcast(job, "paper.applied", {
    op: "apply_patches",
    count: result.output?.appliedCount || 0,
    failed: result.output?.failedCount || 0,
    newRev: result.output?.paper_rev
  });
  
  // Broadcast final state
  broadcast(job, "paper.state", { ...paper.getState() });
  
  return {
    success: true,
    applied: result.output?.appliedCount || 0,
    failed: result.output?.failedCount || 0,
    newRev: result.output?.paper_rev,
    errors: result.output?.errors || []
  };
}
```

---

## 🎮 Controller Action - `apply_patches`

### Add to ACTIONS enum (controller.js)

```javascript
const ACTIONS = {
  search_paper,
  search_chat,
  search_tools,
  get_context_lines,
  keep_search,
  retrieve_search,
  get_kept_searches,
  clear_kept_search,
  clear_all_kept_searches,
  edit,
  apply_patches,           // ← NEW
  verify,
  close
};
```

### Handler (controller.js - in execute() switch)

**Add new case:**

```javascript
case ACTIONS.apply_patches: {
  const { patches } = params;
  
  // Validate patches structure
  const errors = [];
  const validPatches = [];
  
  for (let i = 0; i < patches.length; i++) {
    const patch = patches[i];
    
    // Validate type
    if (!["write_replace_line", "write_append", "set_text", "clear_all"].includes(patch.type)) {
      errors.push({
        index: i,
        id: patch.id || `patch_${i}`,
        error: `Invalid patch type: ${patch.type}`
      });
      continue;
    }
    
    // Validate write_replace_line has lineNumber
    if (patch.type === "write_replace_line") {
      if (patch.lineNumber === undefined || patch.lineNumber < 1) {
        errors.push({
          index: i,
          id: patch.id || `patch_${i}`,
          error: `write_replace_line requires valid lineNumber`
        });
        continue;
      }
      
      const lines = paper.text.split('\n');
      if (patch.lineNumber > lines.length) {
        errors.push({
          index: i,
          id: patch.id || `patch_${i}`,
          error: `Line number ${patch.lineNumber} out of range (max ${lines.length})`
        });
        continue;
      }
      
      // Validate text doesn't contain newline
      if (patch.text && patch.text.includes('\n')) {
        errors.push({
          index: i,
          id: patch.id || `patch_${i}`,
          error: `write_replace_line text cannot contain newline`
        });
        continue;
      }
    }
    
    // Validate text exists for relevant types
    if (["write_replace_line", "write_append", "set_text"].includes(patch.type)) {
      if (patch.text === undefined) {
        errors.push({
          index: i,
          id: patch.id || `patch_${i}`,
          error: `${patch.type} requires text parameter`
        });
        continue;
      }
    }
    
    validPatches.push({ ...patch, id: patch.id || `patch_${i}` });
  }
  
  // If validation failed, return early
  if (errors.length > 0 && validPatches.length === 0) {
    return {
      ok: false,
      error: new Error(`All patches invalid: ${errors.map(e => e.error).join("; ")}`),
      output: {
        appliedCount: 0,
        failedCount: patches.length,
        errors,
        paper_rev: paper.getPaperRev()
      }
    };
  }
  
  // Apply valid patches to a working copy
  let workingText = paper.text;
  let workingLines = workingText.split('\n');
  const appliedPatches = [];
  const failedPatches = [];
  
  // ⚠️ IMPORTANT: Sort write_replace_line patches by lineNumber DESC
  // to avoid index shifting when modifying array
  const replacePatchesDesc = validPatches
    .filter(p => p.type === "write_replace_line")
    .sort((a, b) => b.lineNumber - a.lineNumber);
  
  const otherPatches = validPatches.filter(p => p.type !== "write_replace_line");
  
  // Apply replace patches (DESC order to avoid drift)
  for (const patch of replacePatchesDesc) {
    try {
      workingLines[patch.lineNumber - 1] = patch.text;
      appliedPatches.push(patch.id);
    } catch (e) {
      failedPatches.push({
        id: patch.id,
        error: e.message
      });
    }
  }
  
  // Apply other patches (write_append, set_text, clear_all)
  // ⚠️ Note: set_text and clear_all will override previous patches!
  for (const patch of otherPatches) {
    try {
      if (patch.type === "write_append") {
        workingText = workingLines.join('\n');
        workingText += patch.text;
        workingLines = workingText.split('\n');
      } else if (patch.type === "set_text") {
        workingText = patch.text;
        workingLines = workingText.split('\n');
      } else if (patch.type === "clear_all") {
        workingText = "";
        workingLines = [""];
      }
      appliedPatches.push(patch.id);
    } catch (e) {
      failedPatches.push({
        id: patch.id,
        error: e.message
      });
    }
  }
  
  // If any patches succeeded, apply to paper
  if (appliedPatches.length > 0) {
    const finalText = workingText ? workingLines.join('\n') : workingText;
    paper.set_text(finalText);
  }
  
  // Return result
  return {
    ok: failedPatches.length === 0,  // ok only if ALL succeeded
    output: {
      appliedCount: appliedPatches.length,
      failedCount: failedPatches.length,
      appliedIds: appliedPatches,
      errors: failedPatches,
      paper_rev: paper.getPaperRev()
    }
  };
}
```

---

## 🧠 AI Decision Logic

### System Prompt Addition

Add to system prompt (before tool definitions):

```markdown
## Mode Selection: When to use apply_patches

You have two modes:

### Single Mode (Default)
Use for:
- Dependent edits (edit B depends on result of edit A)
- Small files (< 50 lines)
- Simple requests (1-2 edits)
- When you need to verify after each step
- When unsure

Flow: search → edit → verify → search → edit → verify

### Patch Mode (Optimized)
Use ONLY when ALL conditions are met:
1. File is large (> 100 lines)
2. You need to make 3+ edits
3. Edits are INDEPENDENT (no edit depends on another's result)
4. You can identify all target locations BEFORE applying any patches

Flow: search all → collect patches → apply_patches → verify

Example of INDEPENDENT edits:
✅ "Rename variable X to Y on lines 5, 12, 28, 45"
✅ "Add logging at 3 different functions (lines 10, 20, 30)"
✅ "Fix typos on multiple lines"

Example of DEPENDENT edits:
❌ "Add import on line 1, then use it in function on line 50"
   (Adding import might shift line 50)
❌ "Refactor function A (line 10), then update its calls (lines 30-50)"
   (Calls depend on A's structure)

### How to use apply_patches

1. Call search_paper() to find all targets
2. For each target, understand the exact edit needed
3. Collect all patches: patches = [{type, lineNumber/text}, ...]
4. Call apply_patches(patches)
5. Call verify() to see all changes at once

Example:
```
{
  "patches": [
    {"type": "write_replace_line", "lineNumber": 5, "text": "fixed line 5"},
    {"type": "write_replace_line", "lineNumber": 12, "text": "fixed line 12"},
    {"type": "write_replace_line", "lineNumber": 28, "text": "fixed line 28"},
  ]
}
```

### Important: Line Drift = 0 in Patch Mode

All patches are applied to the SAME snapshot:
- Line numbers are fixed at search time
- No patch changes another's target line
- verify() will show ALL changes at once
- Risk of off-by-one errors is eliminated

This is the main advantage of patch mode!
```

### Decision Function (in runAgentPipelineWrapper handler)

Add helper to evaluate mode:

```javascript
// Helper function to analyze request mode
function analyzeRequestMode(userMessage, paperState) {
  const fileSize = paperState.rows || 1;
  const messageWords = userMessage.split(/\s+/).length;
  
  // Heuristics to detect batch edits
  const isBatchKeywords = /rename|replace all|multiple|several|several/i.test(userMessage);
  const isLargeFile = fileSize > 100;
  const isComplexRequest = messageWords > 20;
  
  return {
    suggestedMode: (isBatchKeywords && isLargeFile) ? "patch" : "single",
    fileSize,
    messageLength: messageWords,
    isBatchLikely: isBatchKeywords
  };
}

// Use in AI context (optional, for logging/monitoring)
const modeAnalysis = analyzeRequestMode(userMessage, paper.getState());
// Can pass to AI in system prompt or just log for analytics
```

---

## 🔄 New Broadcast Events

### paper.applied - Updated for Patch Mode

```javascript
// Old (Single Mode):
broadcast(job, "paper.applied", {
  op: "write_replace_line",
  lineNumber: 1,
  newRev: 2
});

// New (Patch Mode):
broadcast(job, "paper.applied", {
  op: "apply_patches",
  count: 5,              // Number of patches applied
  failed: 0,             // Number of patches failed
  newRev: 10
});

// Error case:
broadcast(job, "paper.applied", {
  op: "apply_patches",
  count: 5,
  failed: 2,
  newRev: 10,
  errors: [
    { id: "patch_1", error: "Line number out of range" },
    { id: "patch_3", error: "Text contains newline" }
  ]
});
```

### verify.result - No Change Needed

Verify works same way for both modes:

```javascript
broadcast(job, "verify.result", {
  diff: "- old line 1\n+ new line 1\n  line 2\n- old line 5\n+ new line 5",
  added: 2,      // Total lines added across all patches
  removed: 2,    // Total lines removed
  status: "ok"   // or "error" if verification failed
});
```

---

## ✅ Implementation Checklist

### Phase 1A: Core Implementation
- [ ] Add `apply_patches` tool to TOOLS array (aiClient-agent.js)
- [ ] Add executor branch for `apply_patches` (server-agent.js)
- [ ] Add `ACTIONS.apply_patches` enum (controller.js)
- [ ] Add controller handler case for `apply_patches` (controller.js)
- [ ] Add broadcast events (no format change, just new op type)
- [ ] Test locally: small file, 3 independent patches

### Phase 1B: AI Integration
- [ ] Add mode selection to System Prompt
- [ ] Add decision helper function (optional but recommended)
- [ ] Test: AI correctly chooses Single vs Patch mode
- [ ] Verify: AI correctly collects patches before calling apply_patches

### Phase 1C: Testing & Validation
- [ ] Unit test: apply_patches with valid patches
- [ ] Unit test: apply_patches with invalid line numbers
- [ ] Unit test: apply_patches with newline in text
- [ ] Integration test: Single mode + Patch mode same file
- [ ] Edge case: write_append in patches (should be last)
- [ ] Edge case: set_text in patches (overrides all previous)
- [ ] Error handling: partial failure (some patches succeed, some fail)

### Phase 2 (After Phase 1 stable)
- [ ] Monitoring: Log mode selection (Single vs Patch)
- [ ] Analytics: Measure token savings in Patch mode
- [ ] Optimization: Fine-tune decision heuristics
- [ ] Enhancement: Partial rollback support if needed

---

## 🛠️ Technical Details

### Patch Application Order (Critical!)

**Problem:** If you apply `write_replace_line` patches in ascending order, line numbers shift:

```
Original lines: [1, 2, 3, 4, 5]

Patch 1: Replace line 2 → lines [1, 2', 3, 4, 5]
Patch 2: Replace line 4 → But line 4 is now different! ❌
```

**Solution:** Apply in DESCENDING order:

```
Patch DESC 1: Replace line 4 → lines [1, 2, 3, 4', 5]
                                      (line 2 untouched)
Patch DESC 2: Replace line 2 → lines [1, 2', 3, 4', 5]
                                      (correct!)
```

**Implementation:**

```javascript
// Sort write_replace_line patches by lineNumber DESC
const replacePatchesDesc = patches
  .filter(p => p.type === "write_replace_line")
  .sort((a, b) => b.lineNumber - a.lineNumber);

// Apply in DESC order
for (const patch of replacePatchesDesc) {
  workingLines[patch.lineNumber - 1] = patch.text;
}
```

### Handling write_append & set_text in Patches

⚠️ **Warning:** `set_text` and `clear_all` will override everything!

**Recommended patch order:**

1. All `write_replace_line` patches (in DESC order)
2. `write_append` patches (if any) - applied to final text
3. Single `set_text` patch (if used, should be last only)
4. Single `clear_all` patch (if used, should be only patch)

**Validation rule:**

```javascript
// If set_text is in patches, it should be the only one
if (patches.some(p => p.type === "set_text") && patches.length > 1) {
  return { error: "set_text cannot be combined with other patches" };
}

// If clear_all is in patches, it should be the only one
if (patches.some(p => p.type === "clear_all") && patches.length > 1) {
  return { error: "clear_all cannot be combined with other patches" };
}
```

---

## 📝 Example Scenarios

### Scenario 1: Rename Variable (Ideal for Patch Mode)

```
User: "Rename 'userId' to 'user_id' on lines 5, 12, 28, 45"

AI Flow:
  1. search_paper("userId") → finds 4 matches on those lines ✅
  2. Decides: Patch Mode (independent edits)
  3. Collects patches:
     [
       {type: "write_replace_line", lineNumber: 5, text: "const user_id = ..."},
       {type: "write_replace_line", lineNumber: 12, text: "if (user_id) {"},
       {type: "write_replace_line", lineNumber: 28, text: "return user_id;"},
       {type: "write_replace_line", lineNumber: 45, text: "user_id++"}
     ]
  4. apply_patches(patches)
     → Broadcast: paper.applied = {op: "apply_patches", count: 4, newRev: 11}
     → Broadcast: paper.state = {text: ..., newRev: 11}
  5. verify()
     → Broadcast: verify.result = {added: 4, removed: 4}
  6. Reply: "Renamed all 4 occurrences"

Token savings: ~40% vs Single Mode (would be 4 separate iterations)
Time savings: ~50% (fewer round-trips)
```

### Scenario 2: Complex Fix (Requires Single Mode)

```
User: "Add validation at line 5, then update error handler at line 50 based on the validation logic"

AI Flow:
  1. get_context_lines(lineNumber: 5)
  2. Decides: Single Mode (edit B depends on A)
  3. Iteration 1: write_replace_line(5, "validation code")
  4. Iteration 2: verify() → sees line 5 changed
  5. Iteration 3: Now understand new validation, get_context_lines(50)
  6. Iteration 4: write_replace_line(50, "error handling based on validation")
  7. Iteration 5: verify() → sees both changes
  8. Done

Note: Cannot use Patch Mode because:
- Error handling code depends on understanding validation
- Would need to hardcode error handler without seeing validation first
```

### Scenario 3: Small File (Single Mode Preferred)

```
User: "Fix typos on lines 2 and 5"
File: 20 lines

AI Flow:
  1. Could use Patch Mode, but unnecessary overhead
  2. Decides: Single Mode (simple, file small)
  3. Iteration 1: search("typo context")
  4. Iteration 2: write_replace_line(2, ...)
  5. Iteration 3: verify()
  6. Iteration 4: write_replace_line(5, ...)
  7. Iteration 5: verify()
  8. Done

Reason: Single Mode simpler for small requests
```

---

## 🔍 Testing Plan

### Unit Tests

```javascript
describe("apply_patches", () => {
  
  test("Apply 3 independent write_replace_line patches", () => {
    const patches = [
      { type: "write_replace_line", lineNumber: 1, text: "new1" },
      { type: "write_replace_line", lineNumber: 3, text: "new3" },
      { type: "write_replace_line", lineNumber: 5, text: "new5" }
    ];
    
    const result = controller.execute("apply_patches", { patches });
    
    expect(result.ok).toBe(true);
    expect(result.output.appliedCount).toBe(3);
    expect(paper.text).toContain("new1");
    expect(paper.text).toContain("new3");
    expect(paper.text).toContain("new5");
  });
  
  test("Fail gracefully with invalid line number", () => {
    const patches = [
      { type: "write_replace_line", lineNumber: 999, text: "bad" }
    ];
    
    const result = controller.execute("apply_patches", { patches });
    
    expect(result.ok).toBe(false);
    expect(result.output.failedCount).toBe(1);
    expect(result.output.errors[0].error).toContain("out of range");
  });
  
  test("Reject text with newline in write_replace_line", () => {
    const patches = [
      { type: "write_replace_line", lineNumber: 1, text: "line1\nline2" }
    ];
    
    const result = controller.execute("apply_patches", { patches });
    
    expect(result.ok).toBe(false);
    expect(result.output.errors[0].error).toContain("newline");
  });
  
  test("Apply patches in correct order (DESC for line number drift)", () => {
    // Original: "1\n2\n3\n4\n5"
    // Patch line 5 first, then line 2
    const patches = [
      { type: "write_replace_line", lineNumber: 5, text: "5'" },
      { type: "write_replace_line", lineNumber: 2, text: "2'" }
    ];
    
    const result = controller.execute("apply_patches", { patches });
    
    const lines = paper.text.split('\n');
    expect(lines[1]).toBe("2'");  // Line 2 (index 1) correctly updated
    expect(lines[4]).toBe("5'");  // Line 5 (index 4) correctly updated
  });
  
  test("Reject set_text when combined with other patches", () => {
    const patches = [
      { type: "write_replace_line", lineNumber: 1, text: "new1" },
      { type: "set_text", text: "completely new" }
    ];
    
    const result = controller.execute("apply_patches", { patches });
    
    expect(result.ok).toBe(false);
    expect(result.output.errors[0].error).toContain("set_text");
  });
});
```

### Integration Tests

```javascript
describe("apply_patches - Integration", () => {
  
  test("Executor correctly handles apply_patches tool call", async () => {
    const args = {
      patches: [
        { type: "write_replace_line", lineNumber: 1, text: "new1", id: "patch_1" },
        { type: "write_replace_line", lineNumber: 2, text: "new2", id: "patch_2" }
      ]
    };
    
    const result = await executeToolCall("apply_patches", args);
    
    expect(result.success).toBe(true);
    expect(result.applied).toBe(2);
    // Verify broadcasts were sent
    expect(broadcasts).toContainEqual(
      expect.objectContaining({
        type: "paper.applied",
        data: expect.objectContaining({ op: "apply_patches" })
      })
    );
  });
  
  test("AI chooses Patch Mode for large file + multiple independent edits", async () => {
    // Create 200-line paper
    const largeText = Array(200).fill(0).map((_, i) => `line ${i+1}`).join('\n');
    paper.set_text(largeText);
    
    // User request: batch rename
    const request = "Rename foo to bar on lines 10, 50, 100, 150";
    const modeAnalysis = analyzeRequestMode(request, paper.getState());
    
    expect(modeAnalysis.suggestedMode).toBe("patch");
    expect(modeAnalysis.isBatchLikely).toBe(true);
  });
  
  test("AI chooses Single Mode for small file even with multiple edits", async () => {
    // Create 20-line paper
    const smallText = Array(20).fill(0).map((_, i) => `line ${i+1}`).join('\n');
    paper.set_text(smallText);
    
    // User request: batch rename
    const request = "Rename foo to bar on lines 5 and 10";
    const modeAnalysis = analyzeRequestMode(request, paper.getState());
    
    expect(modeAnalysis.suggestedMode).toBe("single");
  });
});
```

---

## 📊 Metrics to Track

### Phase 1 Monitoring

Add logging in executor:

```javascript
const startTime = Date.now();
const startTokens = getCurrentTokenCount();  // from OpenAI tracking

// ... apply_patches execution ...

const endTime = Date.now();
const endTokens = getCurrentTokenCount();

// Log metrics
logMetric({
  mode: "patch",
  patchCount: patches.length,
  duration: endTime - startTime,
  tokensUsed: endTokens - startTokens,
  success: result.ok,
  timestamp: new Date()
});
```

### Phase 2 Analysis

Compare Single vs Patch:
- Token usage per iteration
- Latency per request
- Error rate (validation failures)
- Mode selection accuracy
- User satisfaction (if feedback available)

---

## 🚨 Error Handling & Rollback

### Current: No Rollback

If some patches fail:
- Applied patches are kept
- Failed patches are reported
- User must manually fix or retry

Example:
```
Result:
  applied: 3 patches (successful)
  failed: 1 patch (line out of range)
  
Paper state: Mixed (3 edits applied, 1 missing)
Verify will show: Added 3, Removed 3, Incomplete
```

### Future Enhancement (Phase 2)

Add rollback option:

```javascript
// Option A: Automatic rollback
if (failedCount > 0) {
  // Rollback ALL patches, keep paper unchanged
  paper.set_text(originalText);
  return {
    ok: false,
    message: "All patches rolled back due to failures",
    errors: [...],
    rollback: true
  };
}

// Option B: Partial success (current)
// Keep applied patches, report failed ones
return {
  ok: false,  // because not ALL succeeded
  message: "Partial success",
  appliedCount: 3,
  failedCount: 1,
  errors: [...]
};
```

**Recommendation:** Start with Option B (simpler), upgrade to Option A after Phase 1 is stable.

---

## 📝 Code Files to Modify

| File | Changes | Lines | Priority |
|------|---------|-------|----------|
| aiClient-agent.js | Add apply_patches tool | +25 | P0 |
| server-agent.js | Add executor branch | +50 | P0 |
| controller.js | Add APPLY_PATCHES action + handler | +100 | P0 |
| server.js (system prompt) | Add mode selection guide | +30 | P1 |
| tests/ | Add unit + integration tests | +200 | P1 |

---

## 🔗 Backward Compatibility

✅ **Fully backward compatible:**
- `apply_patches` is NEW tool (doesn't affect existing)
- Single Mode unchanged (all existing tools work same way)
- Broadcast events extended (old code ignores new fields)
- No breaking changes to API

---

## 📅 Rollout Plan

### Week 1: Development & Testing
- Implement all 3 files (aiClient, server-agent, controller)
- Write unit tests
- Manual testing with various scenarios

### Week 2: Alpha Testing
- Deploy to staging
- Test with AI in controlled scenarios
- Monitor for errors/edge cases

### Week 3: Beta Release
- Enable `apply_patches` for certain user cohorts (20%)
- Monitor metrics (token savings, error rate, latency)
- Gather feedback

### Week 4: Full Release
- Enable for all users
- Monitor production metrics
- Plan Phase 2 enhancements

---

## 🎓 Learning Resources

- Sequential Agent Loop: See API_REFERENCE.md
- Tool definitions: aiClient-agent.js TOOLS[]
- Executor pattern: server-agent.js executeToolCall()
- Controller actions: controller.js execute() switch
- Broadcast events: Grep for broadcast(job, ...)

---

**Status:** Ready for Phase 1 Implementation  
**Last Updated:** 2 tháng 2, 2026  
**Owner:** Development Team
