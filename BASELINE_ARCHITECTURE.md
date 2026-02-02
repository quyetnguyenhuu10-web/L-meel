# BASELINE_ARCHITECTURE.md - Current Single Mode System

**Phase:** 00 Baseline Validation  
**Date:** 2 tháng 2, 2026  
**Source:** API_REFERENCE.md (2930 lines)  
**Status:** ✅ Mapped from documentation

---

## 🎯 Summary

Current system: **Sequential Agent Loop**
- Mode: Single tool call per iteration
- Max iterations: 15
- Tool choice: OpenAI "auto"
- Streaming: Token-by-token (delta mode)

---

## 🏗️ Architecture Components

### 1. TOOLS ARRAY (14 Tools)

**Location:** aiClient-agent.js (conceptual)

```javascript
const TOOLS = [
  { name: "search_paper", description: "...", parameters: {...} },
  { name: "search_chat", description: "...", parameters: {...} },
  { name: "get_context_lines", description: "...", parameters: {...} },
  { name: "write_replace_line", description: "...", parameters: {...} },
  { name: "insert_line", description: "...", parameters: {...} },
  { name: "delete_line", description: "...", parameters: {...} },
  { name: "verify", description: "...", parameters: {...} },
  { name: "revert", description: "...", parameters: {...} },
  { name: "commit_paper", description: "...", parameters: {...} },
  { name: "broadcast_event", description: "...", parameters: {...} },
  { name: "list_comments", description: "...", parameters: {...} },
  { name: "highlight_section", description: "...", parameters: {...} },
  { name: "get_edit_history", description: "...", parameters: {...} },
  { name: "validate_syntax", description: "...", parameters: {...} }
];
```

**Tool Count:** 14 ✅

---

### 2. EXECUTOR FUNCTION

**Location:** server-agent.js (conceptual)

```javascript
async function executeToolCall(toolName, params) {
  // 1. Validate tool exists
  const tool = TOOLS.find(t => t.name === toolName);
  if (!tool) throw new Error(`Unknown tool: ${toolName}`);
  
  // 2. Validate params against schema
  validateParams(params, tool.parameters);
  
  // 3. Call controller
  const result = await controller.execute(toolName, params);
  
  // 4. Broadcast result
  broadcast(job, `${toolName}.result`, result);
  
  return result;
}
```

**Function Signature:** `executeToolCall(toolName: string, params: object): Promise<object>`

**Returns:** `{success: boolean, ...toolSpecificData}`

---

### 3. CONTROLLER DISPATCHER

**Location:** controller.js (conceptual)

```javascript
class Controller {
  constructor() {
    this.actions = {
      search_paper: async (params) => handleSearchPaper(params),
      search_chat: async (params) => handleSearchChat(params),
      get_context_lines: async (params) => handleGetContext(params),
      write_replace_line: async (params) => handleWriteReplace(params),
      insert_line: async (params) => handleInsertLine(params),
      delete_line: async (params) => handleDeleteLine(params),
      verify: async (params) => handleVerify(params),
      revert: async (params) => handleRevert(params),
      commit_paper: async (params) => handleCommit(params),
      broadcast_event: async (params) => handleBroadcast(params),
      list_comments: async (params) => handleListComments(params),
      highlight_section: async (params) => handleHighlight(params),
      get_edit_history: async (params) => handleHistory(params),
      validate_syntax: async (params) => handleValidate(params)
    };
  }
  
  async execute(actionName, params) {
    const action = this.actions[actionName];
    if (!action) throw new Error(`Unknown action: ${actionName}`);
    return await action(params);
  }
}
```

**Action Count:** 14 ✅  
**Pattern:** action_name → handler function

---

### 4. BROADCAST EVENT SYSTEM

**Location:** broadcast.js (conceptual)

```javascript
function broadcast(job, eventName, payload) {
  // Send Server-Sent Event (SSE) to client
  const event = {
    eventName,
    timestamp: Date.now(),
    payload
  };
  
  // Stream to client via SSE
  job.res.write(`data: ${JSON.stringify(event)}\n\n`);
}
```

**Event Types (per tool):**
- `agent.thought` - AI thinking phase
- `search.result` - Paper search result
- `context.retrieved` - Context lines retrieved
- `edit.applied` - Edit applied
- `paper.verified` - Paper verified
- etc.

---

## 📊 Tool → Action Mapping

| # | Tool Name | Controller Action | Handler | Event |
|----|-----------|------------------|---------|-------|
| 1 | search_paper | search_paper | handleSearchPaper | search.result |
| 2 | search_chat | search_chat | handleSearchChat | chat.result |
| 3 | get_context_lines | get_context_lines | handleGetContext | context.retrieved |
| 4 | write_replace_line | write_replace_line | handleWriteReplace | edit.applied |
| 5 | insert_line | insert_line | handleInsertLine | edit.applied |
| 6 | delete_line | delete_line | handleDeleteLine | edit.applied |
| 7 | verify | verify | handleVerify | paper.verified |
| 8 | revert | revert | handleRevert | paper.reverted |
| 9 | commit_paper | commit_paper | handleCommit | paper.committed |
| 10 | broadcast_event | broadcast_event | handleBroadcast | event.custom |
| 11 | list_comments | list_comments | handleListComments | comments.listed |
| 12 | highlight_section | highlight_section | handleHighlight | highlight.applied |
| 13 | get_edit_history | get_edit_history | handleHistory | history.retrieved |
| 14 | validate_syntax | validate_syntax | handleValidate | syntax.result |

---

## 🔄 Data Flow - Single Iteration

```
┌─────────────────────────────────────────────────────────┐
│ USER MESSAGE: "Find where handleVerify is called"       │
└─────────────────────────────────────────────────────────┘
                          ↓
            ┌─────────────────────────┐
            │ OpenAI /v1/chat/complete│
            │ (tool_choice="auto")    │
            └─────────────────────────┘
                          ↓
            ┌─────────────────────────┐
            │ AI THINKING PHASE       │
            │ "I should search for..." │
            └─────────────────────────┘
                    ↓ broadcast("agent.thought")
            Client receives: thinking tokens
                          ↓
            ┌─────────────────────────┐
            │ AI TOOL CALL DECISION   │
            │ tool_calls = [          │
            │  { name: "search_paper",│
            │    arguments: {...}     │
            │  }                      │
            │ ]                       │
            └─────────────────────────┘
                          ↓
            ┌─────────────────────────┐
            │ EXECUTOR                │
            │ executeToolCall(         │
            │  "search_paper",        │
            │  {query: "handleVerify"}│
            │ )                       │
            └─────────────────────────┘
                          ↓
            ┌─────────────────────────┐
            │ CONTROLLER              │
            │ controller.execute(     │
            │  "search_paper",        │
            │  {...}                  │
            │ )                       │
            └─────────────────────────┘
                          ↓
            ┌─────────────────────────┐
            │ HANDLER                 │
            │ handleSearchPaper(...)  │
            │ returns:                │
            │ {                       │
            │  success: true,         │
            │  matches: [             │
            │    {file: "...", line}  │
            │  ]                      │
            │ }                       │
            └─────────────────────────┘
                          ↓
            broadcast("search.result", matches)
                    ↓
            Client receives: 3 results
                          ↓
            AI reads result and decides:
            "I found the code. Now I need context."
                          ↓
            ITERATION 2 begins (with tool result in history)
```

---

## 🚨 Error Handling

### Executor-level errors:
```javascript
if (!tool) → Error: Unknown tool
if (!params match schema) → Error: Invalid parameters
if (handler throws) → Error: Execution failed
```

### Recovery:
```javascript
AI reads error in result
→ AI decides to retry or try different approach
→ Next iteration uses new tool/params
```

---

## 📡 Broadcast Events

**All events follow pattern:**
```javascript
{
  eventName: "entity.action",
  timestamp: 1707000000000,
  payload: {
    // tool-specific data
  }
}
```

**Broadcasting locations:**
- Executor: After tool execution completes
- Handler: During async operations
- AI: At thinking phase start

---

## ✅ Verification Checklist

- [x] TOOLS array: 14 tools defined
- [x] Executor function: Validates + calls controller
- [x] Controller: Maps 14 actions
- [x] Each action has handler function
- [x] Broadcast events for each tool
- [x] Error handling for unknown tools
- [x] Error handling for invalid params
- [x] Error handling for execution failures
- [x] Max iterations: 15 limit
- [x] Tool choice: OpenAI "auto"

---

## 🎯 Phase 00 Exit Criteria

Before Phase 01 begins:

- [x] Architecture documented (this file)
- [x] All 14 tools mapped
- [x] TOOLS array structure understood
- [x] Executor signature known
- [x] Controller pattern understood
- [x] Event flow documented
- [x] Error handling identified
- [x] No unknown gaps

**Status:** ✅ BASELINE VALIDATED

---

## 📝 Notes for Phase 01

Phase 01 will add one new tool:
```javascript
{
  name: "apply_patches",
  description: "Apply batch patches to paper",
  parameters: {
    type: "object",
    properties: {
      patches: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: {enum: ["write_replace_line", "insert_line", "delete_line"]},
            lineNumber: {type: "integer"},
            text: {type: "string"}
          }
        },
        minItems: 1,
        maxItems: 50
      }
    }
  }
}
```

This requires:
- TOOLS.push(apply_patches) → TOOLS length becomes 15 ✅
- controller.actions["apply_patches"] = handler ✅
- broadcast event: "paper.applied" ✅

---

**Generated from:** API_REFERENCE.md  
**Verified against:** Sequential Agent Loop documentation  
**Ready for:** Phase 01 - Tool Schema
