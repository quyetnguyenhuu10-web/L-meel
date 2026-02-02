# 📚 API REFERENCE - HOÀN CHỈNH

**Ngày:** 2 tháng 2, 2026  
**Phiên bản:** 1.0 - Single Agent Loop Architecture  
**Mô hình:** GPT-4o-mini (token-by-token streaming, tool_choice="auto")  
**Triết lý:** 🧠 AI suy nghĩ → 🎯 Gọi tool → ⚙️ Thực thi → ✓ Verify → Lặp lại

---

### ⚙️ Implementation Details

- **Token Streaming:** Mỗi token từ OpenAI được stream ngay (delta mode)
- **Tool Calls Accumulation:** Tool calls tích lũy theo index, không reset khi có thinking tokens
- **Max Iterations:** 15 iterations (mỗi iteration = 1 tool call cycle)
- **Tool Choice:** "auto" (OpenAI tự quyết định gọi tool hay trả lời)

---

## ✅ CÓ & ❌ KHÔNG CÓ

| Tiêu chí | ĐÚNG ✅ | SAI ❌ |
|---------|--------|-------|
| **Cách thực thi** | **Tuần tự (Sequential)** | Batch processing |
| **Quy trình** | 🧠→🎯→⚙️→✓→🧠→🎯→⚙️→✓→... | 🧠 Plan → ⚙️⚙️⚙️ Exec all → 💬 Reply |
| **AI quyết định** | Sau mỗi bước, dựa trên kết quả | Trước, 1 lần duy nhất |
| **Self-correction** | ✅ Có (AI thấy lỗi → fix ngay) | ❌ Không (batch fail → toàn bộ fail) |
| **Stream UI** | ✅ Từng token, từng step | ❌ Chỉ cuối cùng |
| **Tool calls** | 1-2 tool/lần (focused) | 3-5+ tools cùng 1 lần (unfocused) |
| **Bộ nhớ** | 🧠 AI thấy kết quả → nhớ | 🧠 Chỉ plan → quên context |

---

## 📋 MỤC LỤC

1. [Kiến trúc tổng thể](#kiến-trúc-tổng-thể)
2. [14 Tools & 12 Actions Mapping](#14-tools--12-actions-mapping)
3. [14 Tools Chi tiết](#14-tools-chi-tiết)
4. [Flow xử lý](#flow-xử-lý)
5. [Broadcast Events](#broadcast-events)
6. [Error Handling](#error-handling)

---

## 🏗️ Kiến trúc tổng thể - Sequential Execution (Tuần tự)

### Triết lý: AI tự quyết định, từng bước một

**Khác biệt cơ bản:**
- ❌ **SAI (Legacy)**: Plan → Batch execute → Final reply
- ✅ **ĐÚNG (Current)**: AI suy nghĩ → Gọi tool 1 → Xem kết quả → Suy nghĩ → Gọi tool 2 → ... → Reply

```
┌──────────────────────────────────────────────────────────────┐
│                    SEQUENTIAL AGENT LOOP                      │
└──────────────────────────────────────────────────────────────┘

USER REQUEST
    ↓
[Express] POST /api/chat/create
    ↓
[runAgentPipelineWrapper] - Setup pipeline
    ├─ Tạo controller (action dispatcher)
    ├─ Định nghĩa 9 handlers (search, context, edit, verify)
    └─ Khởi tạo search state
    ↓
[runAgentPipeline] - Initialize history
    ├─ Load chat history
    ├─ Add user message
    └─ Prepare system prompt
    ↓
    ┌─────────────────────────────────────────────┐
    │     AGENT LOOP (Max 15 iterations)          │
    └─────────────────────────────────────────────┘
    │
    ├─ ITERATION 1
    │  ├─ runAgentLoop() call OpenAI
    │  ├─ 🧠 AI THINKING PHASE (token stream)
    │  │  └─ onThought("token: ...") 
    │  │     → broadcast agent.thought
    │  │
    │  ├─ 🎯 AI TOOL CALL (OpenAI returns tool_calls)
    │  │  └─ Accumulate fragments with index key
    │  │
    │  ├─ ⚙️ SYSTEM EXECUTION
    │  │  ├─ executeToolCall(search_paper)
    │  │  ├─ controller.execute("search_paper")
    │  │  ├─ handler searchPaper()
    │  │  └─ broadcast search.result
    │  │
    │  └─ ✓ AI VERIFICATION
    │     └─ (AI reads tool result & decides next)
    │
    ├─ ITERATION 2 (AI sees result from Iteration 1)
    │  ├─ 🧠 AI THINKING based on search result
    │  ├─ 🎯 AI TOOL CALL (get_context_lines)
    │  ├─ ⚙️ SYSTEM EXECUTION
    │  │  └─ broadcast context.retrieved
    │  └─ ✓ AI VERIFICATION
    │
    ├─ ITERATION 3 (AI sees context)
    │  ├─ 🧠 AI THINKING "Cần sửa dòng X"
    │  ├─ 🎯 AI TOOL CALL (write_replace_line)
    │  ├─ ⚙️ SYSTEM EXECUTION
    │  │  ├─ broadcast paper.applied
    │  │  └─ broadcast paper.state
    │  └─ ✓ AI VERIFICATION
    │
    ├─ ITERATION 4 (AI sees paper.state)
    │  ├─ 🧠 AI THINKING "Kiểm tra..."
    │  ├─ 🎯 AI TOOL CALL (verify)
    │  ├─ ⚙️ SYSTEM EXECUTION
    │  │  └─ broadcast verify.result
    │  └─ ✓ AI VERIFICATION "OK, kết thúc"
    │
    └─ STOP REASON = end_turn
       └─ 💬 FINAL REPLY
          └─ broadcast chat.final
    ↓
[broadcast] SSE stream to client
    ├─ agent.thought (multiple)
    ├─ search.result
    ├─ context.retrieved
    ├─ paper.applied
    ├─ paper.state
    ├─ verify.result
    └─ chat.final
    ↓
[SSE /api/chat/stream] ← CLIENT nhận từng event
```

### 4 Lớp xử lý - Tuần tự, Rõ ràng:

| Lớp | File | Mục đích | Trách nhiệm |
|-----|------|---------|-----------|
| **L1: Tools** | `aiClient-agent.js` | OpenAI function definitions | Định nghĩa 14 tools, streaming + tool_calls accumulation |
| **L2: Executors** | `server-agent.js` | Xử lý từng tool call | Gọi controller, kiểm tra kết quả, broadcast |
| **L3: Handlers** | `server.js` wrapper | Custom handlers cho mỗi action | Tìm kiếm, lấy context, sửa, verify |
| **L4: Controller** | `runtime/workspace/controller.js` | Action dispatcher | Gọi handler, track budget, enforce policy |

### Luồng xử lý chi tiết từng layer:

```
[ITERATION N]
    ↓
L1: TOOLS (aiClient-agent.js)
    ├─ TOOLS array: 14 function definitions
    ├─ runAgentLoop() calls OpenAI chat.completions.create()
    ├─ Stream accumulates: agent thinking + tool calls
    ├─ Returns: { content, toolCalls[] }
    └─ Each toolCall: { id, name, arguments }
    ↓
L2: EXECUTORS (server-agent.js)
    ├─ For each toolCall:
    ├─   await executeToolCall(name, arguments)
    ├─   if (name === "search_paper"):
    ├─     args = { query, limit }
    ├─     result = controller.execute("search_paper", args)
    ├─     if (!result.ok) return error
    ├─     broadcast(job, "search.result", result.output)
    ├─     return { success, matches }
    └─ Next toolCall (Iteration N+1 sẽ thấy result)
    ↓
L3: HANDLERS (server.js wrapper in runAgentPipelineWrapper)
    ├─ controller.execute(action, args) → dispatcher
    ├─ switch(action):
    ├─   case "search_paper":
    ├─     return { ok: true, output: await handlers.searchPaper(args) }
    ├─   case "get_context_lines":
    ├─     return { ok: true, output: await handlers.getContextLines(args) }
    ├─   ...
    └─ return { ok, output or error }
    ↓
L4: CONTROLLER (runtime/workspace/controller.js)
    ├─ Action dispatcher with 12 actions
    ├─ Checks budget (prevent infinite loops)
    ├─ Enforces policy (max iterations)
    ├─ Calls appropriate handler
    ├─ Returns: { ok: bool, output: any, error?: Error }
    └─ Each action is ATOMIC (complete or fail)
```

---

##   14 Tools & 12 Actions Mapping

### Tools exposed to OpenAI model:

**14 tools** định nghĩa trong `aiClient-agent.js:TOOLS[]`:

| # | Tool Name | Loại | Mapping → Controller Action |
|---|-----------|------|---------------------------|
| 1 | `search_paper` | Search | → `SEARCH_PAPER` |
| 2 | `search_chat` | Search | → `SEARCH_CHAT` |
| 3 | `search_tools` | Search | → `SEARCH_TOOLS` |
| 4 | `get_context_lines` | Context | → `GET_CONTEXT_LINES` |
| 5 | `keep_search` | Search Mgmt | → `KEEP_SEARCH` |
| 6 | `retrieve_search` | Search Mgmt | → `RETRIEVE_SEARCH` |
| 7 | `get_kept_searches` | Search Mgmt | → `GET_KEPT_SEARCHES` |
| 8 | `clear_kept_search` | Search Mgmt | → `CLEAR_KEPT_SEARCH` |
| 9 | `clear_all_kept_searches` | Search Mgmt | → `CLEAR_ALL_KEPT_SEARCHES` |
| 10 | `write_append` | Edit | → `EDIT` (edit_op="write_append") |
| 11 | `write_replace_line` | Edit | → `EDIT` (edit_op="set_text") ⚠️ |
| 12 | `set_text` | Edit | → `EDIT` (edit_op="set_text") |
| 13 | `clear_all` | Edit | → `EDIT` (edit_op="clear_all") |
| 14 | `verify` | Verify | → `VERIFY` |

### Controller actions (12):

**12 actions** định nghĩa trong `controller.js:ACTIONS{}`:

```javascript
// ✅ ACTIONS enum sử dụng snake_case (match với controller.execute() strings)
ACTIONS = {
  search_paper,              // 1 - Tool API (search_paper)
  search_chat,               // 2 - Tool API (search_chat)
  search_tools,              // 3 - Tool API (search_tools)
  get_context_lines,         // 4 - Tool API (get_context_lines)
  keep_search,               // 5 - Tool API (keep_search)
  retrieve_search,           // 6 - Tool API (retrieve_search)
  get_kept_searches,         // 7 - Tool API (get_kept_searches)
  clear_kept_search,         // 8 - Tool API (clear_kept_search)
  clear_all_kept_searches,   // 9 - Tool API (clear_all_kept_searches)
  edit,                      // 10 - Meta-action: write_append, write_replace_line, set_text, clear_all → edit
  verify,                    // 11 - Tool API (verify, auto-handled)
  close                      // 12 - Internal only (legacy, not exposed)
}

// ✅ ACTIONS Count:
//   - 11 actions exposed via tools
//   - 1 action internal (close) → 12 total in controller
//   - Executor uses: controller.execute("action_name_snake_case", params)
```

### Mapping chi tiết (TOOLS 14 → ACTIONS 11+1):

```
TOOLS (14 exposed)              CONTROLLER ACTIONS (11 exposed + 1 internal = 12)
│
├─ search_paper    ────→ controller.execute("search_paper", ...)
├─ search_chat     ────→ controller.execute("search_chat", ...)
├─ search_tools    ────→ controller.execute("search_tools", ...)
├─ get_context_lines ─→ controller.execute("get_context_lines", ...)
├─ keep_search     ────→ controller.execute("keep_search", ...)
├─ retrieve_search ────→ controller.execute("retrieve_search", ...)
├─ get_kept_searches → controller.execute("get_kept_searches", ...)
├─ clear_kept_search → controller.execute("clear_kept_search", ...)
├─ clear_all_kept_searches → controller.execute("clear_all_kept_searches", ...)
│
├─ write_append    ┐
├─ write_replace_line ├──→ controller.execute("edit", {edit_op: "..."})
├─ set_text        │
└─ clear_all       ┘
│
├─ verify          ────→ controller.execute("verify", {})
│
└─ (no tool)       ────→ controller.execute("close", {}) [internal only, not exposed]
```

**Note:**
- Executor sử dụng **snake_case strings** (không SCREAMING_CASE enum values)
- 4 edit tools → 1 meta-action `edit` với parameter `edit_op`
- `close` action nội bộ, không có tool tương ứng
- `verify` auto-handled (không bypass controller), gọi như tool bình thường

### Tại sao tool ≠ action 1:1?

- **Edit tools** (4) được merge vào **1 action** (`EDIT`) để tập trung business logic
- `write_replace_line` → thực tế gọi `EDIT` với `edit_op="set_text"` (full rewrite, không atomic line op)
- **CLOSE action** không expose qua tools (legacy)

---

## 📡 14 Tools Chi tiết

### **1. search_paper**

**Tool Definition** (aiClient-agent.js:12)
```javascript
{
  name: "search_paper",
  description: "Tìm kiếm từ khóa trong bài viết, trả về dòng chứa câu keyword hoàn chỉnh",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Từ khóa tìm kiếm" },
      limit: { type: "number", description: "Số kết quả tối đa (default 5)" }
    },
    required: ["query"]
  }
}
```

**Executor** (server-agent.js:51)
```javascript
if (toolName === "search_paper") {
  const query = String(args.query || "");
  const limit = Number(args.limit || 5);
  
  const result = await controller.execute("search_paper", { query, limit });
  
  if (!result.ok) {
    return { error: true, message: result.error?.message || "Search failed" };
  }
  
  // Broadcast search results
  broadcast(job, "search.result", {
    type: "paper",
    query,
    lines: result.output?.lines || [],
    totalMatches: result.output?.totalMatches || 0,
    keyword: result.output?.keyword || ""
  });
  
  return { success: true, matches: result.output?.lines?.length || 0 };
}
```

**Handler** (server.js:1988 - server-agent.js:runAgentPipelineWrapper)
```javascript
searchPaper: async ({ query, limit }, { paper }) => {
  const cardResults = searchPaperKeyword(query, paper.text, 100);
  const results = cardResults.map(cardResult => ({
    match: cardResult.text,
    keyword: cardResult.keyword,
    lines: Array.isArray(cardResult.lines)
      ? cardResult.lines.map(line => ({ line: line.line, content: line.content }))
      : undefined,
  }));
  
  currentSearchResult = results;
  currentSearchQuery = query;
  
  // ✅ Handler trả output THUẦN (không wrap {ok, output})
  return { results };
}
```

**Executor** (server-agent.js:51 - Gọi tool search_paper)
```javascript
if (toolName === "search_paper") {
  const query = String(args.query || "");
  const limit = Number(args.limit || 5);
  
  // controller.execute() wrap: { ok: true, output: { results } }
  const result = await controller.execute("search_paper", { query, limit });
  
  if (!result.ok) {
    return { error: true, message: result.error?.message || "Search failed" };
  }
  
  // ✅ Access: result.output = handler output thuần = { results }
  const results = result.output?.results || [];
  
  // ✅ currentSearchResult là ARRAY của results (không phải {results})
  currentSearchResult = results;
  currentSearchQuery = query;
  
  // Broadcast search results
  broadcast(job, "search.result", {
    type: "paper",
    query,
    results: results.map(r => ({
      match: r.match || "",
      keyword: r.keyword || "",
      lineCount: Array.isArray(r.lines) ? r.lines.length : 0,
      firstLine: r.lines?.[0]?.line || 0
    })),
    totalMatches: results.length
  });
  
  return { success: true, matches: results.length };
}
```

**Contract rõ ràng:**
```
┌─────────────────────────────────────────────────┐
│         HANDLER OUTPUT → CONTROLLER → EXECUTOR  │
└─────────────────────────────────────────────────┘

Handler returns:          { results: [...] }
                                ↓
Controller wraps:        { ok: true, output: { results: [...] } }
                                ↓
Executor accesses:       result.output.results ✅
                         (KHÔNG phải result.output.output.results)
```

---

### **2. search_chat**

**Tool Definition** (aiClient-agent.js:29)
```javascript
{
  name: "search_chat",
  description: "Tìm kiếm semantic trong chat history",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Từ khóa tìm kiếm" },
      limit: { type: "number", description: "Số card tối đa (default 5)" }
    },
    required: ["query"]
  }
}
```

**Executor** (server-agent.js:88)
```javascript
if (toolName === "search_chat") {
  const query = String(args.query || "");
  const limit = Number(args.limit || 5);
  
  // controller.execute() wrap: { ok: true, output: handler_result }
  const result = await controller.execute("search_chat", { query, limit });
  
  // ✅ Access: result.output = handler output thuần
  const cards = result.output?.cards || [];
  
  broadcast(job, "search.result", {
    type: "chat",
    query,
    cards,
    count: cards.length
  });
  
  return { success: true, cards: cards.length };
}
```

**Handler** (server.js:2000)
```javascript
searchChat: async ({ query, limit }, { legacyFunctions }) => {
  const { PACKAGES } = await import("./runtime/core/packages.js");
  
  // ✅ Handler trả output THUẦN
  return await search(PACKAGES.CHAT, query || "", {
    legacyFunctions,
    maxResults: limit ?? 5,
  });
}
```

**Contract:**
```
Handler output:          { cards: [...], ... }
                              ↓
Controller wraps:        { ok: true, output: { cards: [...] } }
                              ↓
Executor accesses:       result.output.cards ✅
```

---

### **3. search_tools**

**Tool Definition** (aiClient-agent.js:46)
```javascript
{
  name: "search_tools",
  description: "Tìm kiếm trong system knowledge/tools",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string" },
      limit: { type: "number" }
    },
    required: ["query"]
  }
}
```

**Executor** (server-agent.js:120)
```javascript
if (toolName === "search_tools") {
  const query = String(args.query || "");
  const limit = Number(args.limit || 5);
  
  // controller.execute() wrap: { ok: true, output: handler_result }
  const result = await controller.execute("search_tools", { query, limit });
  
  // ✅ Access: result.output = handler output thuần
  const cards = result.output?.cards || [];
  
  broadcast(job, "search.result", {
    type: "tools",
    query,
    cards,
    count: cards.length
  });
  
  return { success: true, cards: cards.length };
}
```

**Handler** (server.js:2019)
```javascript
searchTools: async ({ query, limit }, { legacyFunctions }) => {
  const { PACKAGES } = await import("./runtime/core/packages.js");
  
  // ✅ Handler trả output THUẦN
  return await search(PACKAGES.TOOLS, query || "", {
    legacyFunctions,
    maxResults: limit ?? 5,
  });
}
```

**Contract:**
```
Handler output:          { cards: [...], ... }
                              ↓
Controller wraps:        { ok: true, output: { cards: [...] } }
                              ↓
Executor accesses:       result.output.cards ✅
```

---

### **4. get_context_lines** ⭐ MỚI (Mở rộng)

**Tool Definition** (aiClient-agent.js:63)
```javascript
{
  name: "get_context_lines",
  description: "Lấy context từ nhiều line ranges",
  parameters: {
    type: "object",
    properties: {
      lineNumber: { type: "number", description: "Single line (backward compat)" },
      before: { type: "number" },
      after: { type: "number" },
      ranges: {
        type: "array",
        description: "Array of {line, before?, after?} or {start, end}",
        items: { type: "object" }
      }
    },
    required: []
  }
}
```

**Executor** (server-agent.js:152)
```javascript
if (toolName === "get_context_lines") {
  const params = {};
  
  if (args.lineNumber !== undefined) {
    params.lineNumber = Number(args.lineNumber);
    params.before = Number(args.before || 3);
    params.after = Number(args.after || 3);
  }
  
  if (args.ranges && Array.isArray(args.ranges)) {
    params.ranges = args.ranges.map(r => ({
      line: r.line !== undefined ? Number(r.line) : undefined,
      start: r.start !== undefined ? Number(r.start) : undefined,
      end: r.end !== undefined ? Number(r.end) : undefined,
      before: r.before !== undefined ? Number(r.before) : 3,
      after: r.after !== undefined ? Number(r.after) : 3,
    }));
  }
  
  const result = await controller.execute("get_context_lines", params);
  
  return {
    success: true,
    params,
    ranges: params.ranges ? params.ranges.length : 1,
    lines: result.output?.contextLines || []
  };
}
```

**Handler** (server.js:2127)
```javascript
getContextLines: async ({ lineNumber, before, after, ranges }, { paper }) => {
  const text = paper.text || "";
  const lines = text.split("\n");
  const allContextLines = [];
  const processedRanges = [];
  
  const rangeList = [];
  
  // Single line (backward compat)
  if (lineNumber !== undefined) {
    rangeList.push({
      line: Number(lineNumber),
      before: Number(before || 3),
      after: Number(after || 3),
    });
  }
  
  // Multiple ranges
  if (ranges && Array.isArray(ranges)) {
    rangeList.push(...ranges);
  }
  
  // Process mỗi range
  for (const range of rangeList) {
    let startLine, endLine, targetLine;
    
    if (range.line !== undefined) {
      // Format: {line, before, after}
      targetLine = Number(range.line);
      const beforeCount = Number(range.before || 3);
      const afterCount = Number(range.after || 3);
      startLine = Math.max(1, targetLine - beforeCount);
      endLine = Math.min(lines.length, targetLine + afterCount);
    } else if (range.start !== undefined && range.end !== undefined) {
      // Format: {start, end}
      startLine = Math.max(1, Number(range.start));
      endLine = Math.min(lines.length, Number(range.end));
      targetLine = null;
    } else {
      continue;
    }
    
    const rangeLines = [];
    for (let i = startLine; i <= endLine; i++) {
      rangeLines.push({
        lineNumber: i,
        content: lines[i - 1] || "",
        isTarget: targetLine ? i === targetLine : false,
      });
    }
    
    allContextLines.push(...rangeLines);
    processedRanges.push({ startLine, endLine, targetLine });
  }
  
  // ✅ Handler trả output THUẦN (không wrap {ok, output})
  // Controller sẽ wrap: { ok: true, output: {...} }
  return {
    contextLines: allContextLines,
    processedRanges,
    totalLines: allContextLines.length
  };
}
```

**Ví dụ sử dụng:**
```javascript
// Single line
get_context_lines({ lineNumber: 5, before: 2, after: 2 })
→ Trả về lines 3-7, line 5 là target

// Multiple ranges
get_context_lines({
  ranges: [
    { line: 1, before: 0, after: 0 },    // Chỉ dòng 1
    { start: 10, end: 20 },               // Lines 10-20
    { line: 50, before: 5, after: 5 }    // Lines 45-55
  ]
})
→ Trả về tất cả dòng từ 3 ranges, merged
```

---

### **5. keep_search**

**Tool Definition** (aiClient-agent.js:88)
```javascript
{
  name: "keep_search",
  description: "Lưu search result hiện tại để tránh mất khi search query khác",
  parameters: {
    type: "object",
    properties: {
      key: { type: "string", description: "Tên lưu trữ (ví dụ 'auth_results')" }
    },
    required: ["key"]
  }
}
```

**Executor** (server-agent.js:182)
```javascript
if (toolName === "keep_search") {
  const key = String(args.key || "search");
  
  if (!currentSearchResult) {
    return {
      error: true,
      message: "No active search result to keep. Call search_paper() first."
    };
  }
  
  // ✅ Hướng A: Handler sẽ lấy currentSearchResult từ closure
  // Không truyền searchResult (handler không nhận param này)
  const result = await controller.execute("keep_search", {
    key
  });
  
  // ✅ currentSearchResult là array, không có .lines property
  broadcast(job, "search.kept", {
    key,
    query: currentSearchQuery,
    lineCount: currentSearchResult?.length || 0
  });
  
  return { success: true, key, query: currentSearchQuery };
}
```

**Handler** (server.js:2024 - trong runAgentPipelineWrapper)
```javascript
keepSearch: async ({ key }, { paper }) => {
  if (!key || !currentSearchResult) {
    throw new Error("No active search to keep");
  }
  
  savedSearches.set(key, {
    query: currentSearchQuery,
    result: currentSearchResult,
    timestamp: Date.now()
  });
  
  // ✅ Handler trả output THUẦN (không wrap {ok, output})
  return {
    key,
    saved: true,
    totalSaved: savedSearches.size
  };
}
```

**Contract rõ ràng:**
```
Handler output:          { key, saved: true, totalSaved: N }
                              ↓
Controller wraps:        { ok: true, output: { key, saved, totalSaved } }
                              ↓
Executor accesses:       result.output.key ✅
                         (KHÔNG phải result.output.output.key)
```

---

### **6. retrieve_search**

**Tool Definition** (aiClient-agent.js:105)
```javascript
{
  name: "retrieve_search",
  description: "Lấy lại search result đã lưu theo key",
  parameters: {
    type: "object",
    properties: {
      key: { type: "string", description: "Tên lưu trữ" }
    },
    required: ["key"]
  }
}
```

**Executor** (server-agent.js:204)
```javascript
if (toolName === "retrieve_search") {
  const key = String(args.key || "");
  
  const result = await controller.execute("retrieve_search", { key });
  
  if (!result.ok) {
    return {
      error: true,
      message: `Search key '${key}' not found`
    };
  }
  
  broadcast(job, "search.retrieved", {
    key,
    query: result.output?.query || "",
    resultCount: result.output?.resultCount || 0  // ✅ Match handler output field
  });
  
  return {
    success: true,
    key,
    query: result.output?.query || "",
    resultCount: result.output?.resultCount || 0  // ✅ Match handler output field
  };
}
```

**Handler** (server.js:2033 - trong runAgentPipelineWrapper)
```javascript
retrieveSearch: async ({ key }, { paper }) => {
  const saved = savedSearches.get(key);
  
  if (!saved) {
    throw new Error(`Search key '${key}' not found`);
  }
  
  currentSearchResult = saved.result;
  currentSearchQuery = saved.query;
  
  // ✅ Handler trả output THUẦN
  // Note: saved.result là ARRAY (copy của currentSearchResult từ keep_search)
  return {
    key,
    query: saved.query,
    results: saved.result || [],  // ✅ Là array, không .lines
    resultCount: Array.isArray(saved.result) ? saved.result.length : 0,
    timestamp: saved.timestamp
  };
}
```

**Executor** (server-agent.js:204)
```javascript
if (toolName === "retrieve_search") {
  const key = String(args.key || "");
  
  // controller.execute() wrap: { ok: true, output: handler_result }
  const result = await controller.execute("retrieve_search", { key });
  
  if (!result.ok) {
    return {
      error: true,
      message: `Search key '${key}' not found`
    };
  }
  
  // ✅ Access: result.output = handler output thuần
  broadcast(job, "search.retrieved", {
    key: result.output?.key,
    query: result.output?.query || "",
    lineCount: result.output?.lines?.length || 0
  });
  
  return {
    success: true,
    key,
    query: result.output?.query || "",
    lines: result.output?.lines?.length || 0
  };
}
```

**Contract:**
```
Handler output:          { key, query, lines, timestamp }
                              ↓
Controller wraps:        { ok: true, output: { key, query, lines, timestamp } }
                              ↓
Executor accesses:       result.output.query ✅
```

---

### **7. get_kept_searches**

**Tool Definition** (aiClient-agent.js:122)
```javascript
{
  name: "get_kept_searches",
  description: "Trả về danh sách tất cả saved searches",
  parameters: { type: "object", properties: {}, required: [] }
}
```

**Executor** (server-agent.js:232)
```javascript
if (toolName === "get_kept_searches") {
  const result = await controller.execute("get_kept_searches", {});
  
  return {
    success: true,
    searches: result.output?.searches || [],
    total: result.output?.searches?.length || 0
  };
}
```

**Handler** (server.js:2041 - trong runAgentPipelineWrapper)
```javascript
getKeptSearches: async ({}, { paper }) => {
  const searches = [];
  
  for (const [key, data] of savedSearches) {
    searches.push({
      key,
      query: data.query,
      timestamp: data.timestamp,
      resultCount: Array.isArray(data.result) ? data.result.length : 0  // ✅ data.result là array
    });
  }
  
  // ✅ Handler trả output THUẦN
  return {
    searches,
    total: searches.length
  };
}
```

**Executor** (server-agent.js:232)
```javascript
if (toolName === "get_kept_searches") {
  // controller.execute() wrap: { ok: true, output: handler_result }
  const result = await controller.execute("get_kept_searches", {});
  
  // ✅ Access: result.output = handler output thuần
  return {
    success: true,
    searches: result.output?.searches || [],
    total: result.output?.total || 0
  };
}
```

**Contract:**
```
Handler output:          { searches: [], total: N }
                              ↓
Controller wraps:        { ok: true, output: { searches, total } }
                              ↓
Executor accesses:       result.output.searches ✅
```

---

### **8. clear_kept_search**

**Tool Definition** (aiClient-agent.js:134)
```javascript
{
  name: "clear_kept_search",
  description: "Xóa 1 saved search theo key",
  parameters: {
    type: "object",
    properties: {
      key: { type: "string", description: "Tên lưu trữ" }
    },
    required: ["key"]
  }
}
```

**Executor** (server-agent.js:251)
```javascript
if (toolName === "clear_kept_search") {
  const key = String(args.key || "");
  
  const result = await controller.execute("clear_kept_search", { key });
  
  broadcast(job, "search.cleared", { key });
  
  return {
    success: true,
    key,
    remaining: result.output?.remaining || 0
  };
}
```

**Handler** (server.js:2050 - trong runAgentPipelineWrapper)
```javascript
clearKeptSearch: async ({ key }) => {
  const deleted = savedSearches.delete(key);
  
  // ✅ Handler trả output THUẦN
  return {
    deleted,
    remaining: savedSearches.size
  };
}
```

**Executor** (server-agent.js:251)
```javascript
if (toolName === "clear_kept_search") {
  const key = String(args.key || "");
  
  // controller.execute() wrap: { ok: true, output: handler_result }
  const result = await controller.execute("clear_kept_search", { key });
  
  // ✅ Access: result.output = handler output thuần
  broadcast(job, "search.cleared", { key });
  
  return {
    success: true,
    key,
    remaining: result.output?.remaining || 0
  };
}
```

**Contract:**
```
Handler output:          { deleted: bool, remaining: N }
                              ↓
Controller wraps:        { ok: true, output: { deleted, remaining } }
                              ↓
Executor accesses:       result.output.remaining ✅
```

**Controller** (controller.js:330)
```javascript
case ACTIONS.CLEAR_KEPT_SEARCH:
  return await handlers.clearKeptSearch(params, { paper, legacyFunctions, context });
```

---

### **9. clear_all_kept_searches**

**Tool Definition** (aiClient-agent.js:151)
```javascript
{
  name: "clear_all_kept_searches",
  description: "Xóa tất cả saved searches",
  parameters: { type: "object", properties: {}, required: [] }
}
```

**Executor** (server-agent.js:272)
```javascript
if (toolName === "clear_all_kept_searches") {
  const result = await controller.execute("clear_all_kept_searches", {});
  
  currentSearchResult = null;
  currentSearchQuery = "";
  
  return {
    success: true,
    cleared: result.output?.cleared || 0
  };
}
```

**Handler** (server.js:2059 - trong runAgentPipelineWrapper)
```javascript
clearAllKeptSearches: async ({}, { paper }) => {
  const count = savedSearches.size;
  savedSearches.clear();
  
  // ✅ Handler trả output THUẦN
  return {
    cleared: count
  };
}
```

**Executor** (server-agent.js:272)
```javascript
if (toolName === "clear_all_kept_searches") {
  // controller.execute() wrap: { ok: true, output: handler_result }
  const result = await controller.execute("clear_all_kept_searches", {});
  
  // ✅ Access: result.output = handler output thuần
  // Executor bonus: clear global state
  currentSearchResult = null;
  currentSearchQuery = "";
  
  return {
    success: true,
    cleared: result.output?.cleared || 0
  };
}
```

**Contract:**
```
Handler output:          { cleared: N }
                              ↓
Controller wraps:        { ok: true, output: { cleared } }
                              ↓
Executor accesses:       result.output.cleared ✅
```

**Controller** (controller.js:338)
```javascript
case ACTIONS.CLEAR_ALL_KEPT_SEARCHES:
  return await handlers.clearAllKeptSearches(params, { paper, legacyFunctions, context });
```

---

### **10. write_append**

**Tool Definition** (aiClient-agent.js:163)
```javascript
{
  name: "write_append",
  description: "Thêm nội dung vào cuối bài viết",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "Nội dung cần thêm" }
    },
    required: ["text"]
  }
}
```

**Executor** (server-agent.js:363)
```javascript
if (toolName === "write_append") {
  const text = String(args.text || "");
  
  const result = await controller.execute("edit", {
    edit_op: "write_append",
    text,
    expected_rev: paper.getPaperRev(),
  });
  
  if (result.ok) {
    broadcast(job, "paper.applied", {
      op: "write_append",
      appended: text.length,
      newRev: result.output?.paper_rev
    });
    broadcast(job, "paper.state", { ...paper.getState() });
  }
  
  return {
    success: result.ok,
    appended: text.length,
    newRev: result.output?.paper_rev
  };
}
```

**Handler** (Controller - dòng 107)
```javascript
case "write_append":
  return await legacyWriteAppend(paper, text ?? "", true);
```

**Logic:**
- Thêm `text` vào cuối `paper.text`
- Return: `{ ok: true, paper_rev }`

**Chi tiết xử lý:**
```
FLOW:
  1. executeToolCall("write_append", { text: "\nthêm dòng mới" })
  2. Gọi controller.execute("edit", {
       edit_op: "write_append",
       text: "\nthêm dòng mới",
       expected_rev: paper.getPaperRev()  // Check version
     })
  3. Trong controller (controller.js:107):
     - Gọi legacyWriteAppend(paper, text, true)
       ├─ Lấy current_text = paper.text
       ├─ Nối: new_text = current_text + text
       ├─ Gọi paper.set_text(new_text)
       ├─ Increment paper revision
       └─ Return { ok: true, paper_rev }
  4. Executor broadcast:
     - paper.applied: { op: "write_append", appended: text.length, newRev }
     - paper.state: { text, rev, cols, rows }
  5. Return { success: true, appended, newRev }

ĐIỀU KIỆN:
  - ✅ `text` là string (có thể chứa newline)
  - ✅ Không kiểm tra line structure (append thẳng vào cuối)
  - ✅ Paper revision tự động increment
  - ✅ Broadcast 2 events: paper.applied + paper.state

PAPER KERNEL INTERACTION:
  paper.set_text(newText)
    ├─ Cập nhật paper.text
    ├─ Recalculate paper.cols (dòng dài nhất)
    ├─ Recalculate paper.rows (số dòng)
    ├─ Increment paper.rev
    ├─ Emit PAPER_UPDATED event
    └─ Log: "[SSOT] Paper updated: rev=X, text_len=Y"

ERROR HANDLING:
  - ❌ Không validate text (accept tất cả)
  - ❌ Không check memory limit (rely on Node.js)
  - ✅ Luôn thành công nếu paper tồn tại

EXAMPLE:
  Current: "line 1\nline 2"
  write_append("\nline 3\nline 4")
  Result: "line 1\nline 2\nline 3\nline 4"
  
  paper.text = "line 1\nline 2\nline 3\nline 4"
  paper.rows = 4
  paper.rev = 2
```

---

### **11. write_replace_line**

**Tool Definition** (aiClient-agent.js:180)
```javascript
{
  name: "write_replace_line",
  description: "Replace 1 dòng hoàn chỉnh",
  parameters: {
    type: "object",
    properties: {
      lineNumber: { type: "number", description: "Line number (1-indexed)" },
      text: { type: "string", description: "Nội dung dòng mới (NO line prefix!)" }
    },
    required: ["lineNumber", "text"]
  }
}
```

**Executor** (server-agent.js:291)
```javascript
if (toolName === "write_replace_line") {
  const lineNumber = Number(args.lineNumber || 0);
  const text = String(args.text || "");
  
  // ✅ Validate newline (prevent structure breaking)
  if (text.includes("\n")) {
    return { error: true, message: "Line text cannot contain newline" };
  }
  
  // ✅ Validate no prefix pattern (1| hello, etc)
  if (/^\s*\d+\s*\|/.test(text)) {
    return { error: true, message: "Line text must not contain line prefix (e.g. '1|')" };
  }
  
  if (lineNumber < 1) {
    return { error: true, message: "Invalid line number" };
  }
  
  const paperText = paper.text;
  const lines = paperText.split('\n');
  
  if (lineNumber > lines.length) {
    return { error: true, message: "Line number out of range" };
  }
  
  // Replace line directly
  lines[lineNumber - 1] = text;
  const newText = lines.join('\n');
  
  const result = await controller.execute("edit", {
    edit_op: "set_text",
    text: newText,
    expected_rev: paper.getPaperRev(),
  });
  
  if (result.ok) {
    broadcast(job, "paper.applied", {
      op: "write_replace_line",
      lineNumber,
      newRev: result.output?.paper_rev
    });
    broadcast(job, "paper.state", { ...paper.getState() });
  }
  
  return {
    success: result.ok,
    lineNumber,
    newRev: result.output?.paper_rev
  };
}
```

**Logic:**
```
INPUT: lineNumber=1, text="hello"
CURRENT: "1 2 4 3 34 34 2\n1"
         Line 1: "1 2 4 3 34 34 2"
         Line 2: "1"

ACTION:
  lines[0] = "hello"
  newText = "hello\n1"

OUTPUT: Update paper.text, return newRev
```

**Chi tiết xử lý:**
```
FLOW:
  1. executeToolCall("write_replace_line", {
       lineNumber: 1,
       text: "2 2 4 3 34 34 2"
     })
  2. Validate:
     - lineNumber < 1? → error
     - lineNumber > lines.length? → error
  3. Split paper.text thành lines array:
     lines = paper.text.split('\n')
       ['1 2 4 3 34 34 2', '1']
  4. Replace target line:
     lines[lineNumber - 1] = text
       lines[0] = "2 2 4 3 34 34 2"
       ['2 2 4 3 34 34 2', '1']
  5. Join lại:
     newText = lines.join('\n')
       "2 2 4 3 34 34 2\n1"
  6. Gọi controller.execute("edit", {
       edit_op: "set_text",
       text: newText,
       expected_rev: paper.getPaperRev()
     })
       ├─ Gọi paper.set_text(newText)
       ├─ Increment paper.rev
       └─ Return { ok: true, paper_rev }
  7. Executor broadcast:
     - paper.applied: { op: "write_replace_line", lineNumber: 1, newRev }
     - paper.state: { text, rev, cols, rows }
  8. Return { success: true, lineNumber, newRev }

VALIDATION:
  ✅ lineNumber phải >= 1
  ✅ lineNumber phải <= lines.length
  ✅ text KHÔNG được chứa newline (\n) → error
  ✅ text KHÔNG được có prefix như "1| ", "2|", ... → error
  ✅ Auto-increment revision

**GUARD validation:**
```
// Validate newline
if (text.includes("\n")) {
  return { error: true, message: "Line text cannot contain newline" };
}

// Validate no prefix pattern (1| hello, 2|hello, ...)
if (/^\s*\d+\s*\|/.test(text)) {
  return { error: true, message: "Line text must not contain line prefix (e.g. '1|')" };
}
```

PAPER STATE AFTER:
  paper.text = "2 2 4 3 34 34 2\n1"
  paper.rows = 2 (tính lại)
  paper.cols = max(17, 1) = 17 (dòng 1 dài hơn)
  paper.rev = +1

⚠️ IMPORTANT:
  `text` parameter CHỈ chứa nội dung THUẦN, KHÔNG có prefix:
  ✅ ĐÚNG: text: "hello"
  ❌ SAI: text: "1| hello"  (có prefix)
  ❌ SAI: text: "1|hello"   (có pipe separator)

WHY NO PREFIX?
  Vì line index được track by lineNumber, không cần prefix
  Prefix chỉ dùng khi display UI cho user

EXAMPLE FLOW:
  Current paper: "apple\nbanana\ncherry"
  write_replace_line(lineNumber=2, text="blueberry")
    → Split: ['apple', 'banana', 'cherry']
    → Replace: ['apple', 'blueberry', 'cherry']
    → Join: "apple\nblueberry\ncherry"
    → Broadcast: paper.state = { text: "apple\nblueberry\ncherry", rows: 3, ... }

EDGE CASES:
  // Replace đầu tiên
  write_replace_line(lineNumber=1, text="new line 1") ✅
  
  // Replace cuối cùng
  write_replace_line(lineNumber=3, text="new line 3") ✅
  
  // Sai line number
  write_replace_line(lineNumber=0, text="...") ❌ error
  write_replace_line(lineNumber=999, text="...") ❌ error
  
  // Empty text (thay bằng string rỗng)
  write_replace_line(lineNumber=2, text="") ✅ OK (thành dòng rỗng)

⚠️ IMPLEMENTATION NOTE - Convenience Layer (Full Rewrite):

write_replace_line là CONVENIENCE LAYER, không phải atomic kernel operation:

┌──────────────────────────────────────────────────────┐
│    write_replace_line(lineNumber=1, text="hello")     │
└──────────────────────────────────────────────────────┘
         ↓
  [Executor xử lý]
  1. Split: lines = paper.text.split('\n')
  2. Update: lines[0] = "hello"
  3. Join: newText = lines.join('\n')
         ↓
  [Gọi controller]
  4. controller.execute("edit", {
       edit_op: "set_text",
       text: newText    ← Full paper text!
     })
         ↓
  [Kernel thực thi]
  5. paper.set_text(newText)
       ├─ Rewrite entire paper.text
       ├─ paper.rev++
       ├─ Recalc rows/cols
       └─ Emit PAPER_UPDATED

HẬU QUẢ:
  ✅ Ưu: Đơn giản, chắc chắn, không race condition ở line level
  ❌ Nhược: Full paper rewrite (inefficient)
  ❌ Nhược: Diff/preview lớn hơn cần thiết
  ⚠️ Nhược: Rev tăng cho 1 dòng (expected_rev collision risk if concurrent)

ALTERNATIVE (Not implemented):
  - Implement set_line(lineNumber, text) ở paperKernel
  - Chỉ update target line + rev
  - Avoid full rewrite → nhưng code phức tạp hơn

DESIGN DECISION: "Simplicity over micro-optimization"
  Vì: đơn giản, dễ debug, tránh kernel complexity
  Trade-off: revision tăng full, nhưng acceptable vì sessions tách biệt

---

## ✅ IDEAL STANDARD: Atomic replaceLine Implementation

**Mục tiêu cải thiện:**
- Atomic operation ở kernel level (không full rewrite)
- Concurrency-safe với expected_rev guard
- Efficient diff/streaming (chỉ oldTextLen + newTextLen + newRev)
- Smart cols/rows computation (chỉ recompute nếu cần)
- Lazy text rebuild (textDirty flag)

### **Refactoring Roadmap (5 TODO items):**

#### **TODO 1: Update Tool Schema (aiClient-agent.js)**
```javascript
{
  name: "write_replace_line",
  description: "Replace 1 dòng hoàn chỉnh (atomic)",
  parameters: {
    type: "object",
    properties: {
      lineNumber: { type: "number", description: "Line number (1-indexed)" },
      text: { type: "string", description: "Nội dung dòng mới (NO line prefix!)" },
      expected_rev: { 
        type: "number", 
        description: "Optional: concurrency guard. If provided, operation fails if paper.rev !== expected_rev" 
      }
    },
    required: ["lineNumber", "text"]
    // expected_rev is optional (not in required array)
  }
}
```

#### **TODO 2: Add Controller Action (controller.js)**
```javascript
// Add to ACTIONS enum
const ACTIONS = {
  // ... existing actions ...
  WRITE_REPLACE_LINE: "write_replace_line"
};

// Add handler in execute() switch
case "write_replace_line": {
  const { lineNumber, text, expected_rev } = params;
  
  // Validate line number
  if (lineNumber < 1 || lineNumber > paper.lines.length) {
    return { error: true, message: "Invalid line number" };
  }
  
  // Validate concurrency guard (optional)
  if (expected_rev !== undefined && paper.rev !== expected_rev) {
    return { error: true, message: "Revision mismatch - concurrent edit detected" };
  }
  
  // Get old line for diff calculation
  const oldText = paper.lines[lineNumber - 1];
  const oldTextLen = oldText.length;
  
  // Atomic update
  const newTextLen = text.length;
  paper.replaceLine(lineNumber, text);  // New kernel API
  
  // Return result with change metrics
  return {
    ok: true,
    lineNumber,
    oldTextLen,
    newTextLen,
    paper_rev: paper.rev
  };
}
```

#### **TODO 3: Implement Kernel API (paperKernel.js)**
```javascript
class Paper {
  constructor() {
    this.lines = [];           // SSOT: String[] (1-indexed via [0], [1], ...)
    this.text = "";            // Lazy-rebuilt from lines (textDirty flag)
    this.textDirty = false;    // Mark if text needs rebuild
    this.rev = 0;
    this.rows = 0;
    this.cols = 0;
    this.maxColLine = -1;      // Track which line had max cols for smart recompute
  }
  
  // NEW: Atomic line replacement
  replaceLine(lineNumber, newText) {
    // Validate
    if (lineNumber < 1 || lineNumber > this.lines.length) {
      throw new Error("Invalid line number");
    }
    
    const idx = lineNumber - 1;
    const oldText = this.lines[idx];
    const oldTextLen = oldText.length;
    const newTextLen = newText.length;
    
    // Atomic update
    this.lines[idx] = newText;
    this.textDirty = true;  // Mark for lazy rebuild
    this.rev++;
    
    // Smart cols computation:
    // - If old line was max, need full rescan
    // - If new line might be max, check only against old max
    if (oldTextLen === this.cols) {
      // Old line was max - need full rescan
      this.cols = Math.max(...this.lines.map(l => l.length));
      this.maxColLine = this.lines.findIndex(l => l.length === this.cols);
    } else if (newTextLen > this.cols) {
      // New line exceeded old max
      this.cols = newTextLen;
      this.maxColLine = idx;
    }
    // else: new line shorter than current max - no action needed
    
    // Rows never change (only new_line affects rows, not replace)
    return { ok: true, oldTextLen, newTextLen, newRev: this.rev };
  }
  
  // Lazy rebuild of text from lines (called when text is accessed)
  getText() {
    if (this.textDirty) {
      this.text = this.lines.join('\n');
      this.textDirty = false;
    }
    return this.text;
  }
  
  // UPDATED: set_text also updates lines[]
  setText(newText) {
    this.text = newText;
    this.lines = newText.split('\n');  // Parse into lines
    this.textDirty = false;            // Already in sync
    this.rows = this.lines.length;
    this.cols = Math.max(...this.lines.map(l => l.length), 0);
    this.maxColLine = this.lines.findIndex(l => l.length === this.cols);
    this.rev++;
  }
}
```

#### **TODO 4: Update Executor (server-agent.js)**
```javascript
if (toolName === "write_replace_line") {
  const lineNumber = Number(args.lineNumber || 0);
  const text = String(args.text || "");
  const expected_rev = args.expected_rev ? Number(args.expected_rev) : undefined;
  
  // Validate
  if (lineNumber < 1) {
    return { error: true, message: "Invalid line number" };
  }
  
  if (lineNumber > paper.lines.length) {
    return { error: true, message: "Line number out of range" };
  }
  
  // Call controller with new action (not edit → set_text)
  const result = await controller.execute("write_replace_line", {
    lineNumber,
    text,
    expected_rev: expected_rev || paper.getPaperRev()
  });
  
  if (result.ok) {
    // Broadcast with atomic operation details
    broadcast(job, "paper.applied", {
      op: "write_replace_line",
      lineNumber,
      oldTextLen: result.oldTextLen,
      newTextLen: result.newTextLen,
      newRev: result.paper_rev
    });
    broadcast(job, "paper.state", { ...paper.getState() });
  }
  
  return {
    success: result.ok,
    lineNumber,
    oldTextLen: result.oldTextLen,
    newTextLen: result.newTextLen,
    newRev: result.paper_rev
  };
}
```

#### **TODO 5: Update Broadcast Event**
```javascript
// paper.applied broadcast now includes change metrics:
{
  op: "write_replace_line",
  lineNumber: 42,          // Which line changed
  oldTextLen: 156,         // Old line length (for diff streaming)
  newTextLen: 142,         // New line length
  newRev: 127              // Paper revision after change
}

// UI/streaming can use oldTextLen + newTextLen to:
// ✅ Stream only delta (not full paper)
// ✅ Highlight changed line efficiently
// ✅ Calculate character count diff
// ✅ Update preview incrementally
```

### **Benefits Comparison Table:**

| Aspect | Current (Full Rewrite) | Ideal (Atomic) |
|--------|------------------------|-|
| **Operation** | Split→Replace→Join→set_text | paper.replaceLine() |
| **Kernel Call** | set_text (full rewrite) | replaceLine (single line) |
| **Diff Size** | Entire paper text | lineNumber + oldTextLen + newTextLen |
| **Rows Recompute** | Yes (always) | No (never changes) |
| **Cols Recompute** | Yes (always) | Smart (only if needed) |
| **Text Rebuild** | Immediate | Lazy (on-demand) |
| **Concurrency** | Rev collision risk | expected_rev guard |
| **Streaming** | Large deltas | Small deltas |
| **Lines SSOT** | Reconstructed each time | Persistent array |
| **Complexity** | O(n) string ops | O(1) array update |
| **Efficiency** | ❌ Poor | ✅ Excellent |
| **Safety** | ✅ Simple | ✅ Atomic |

### **Verify Semantics (Unchanged):**

Verify vẫn sử dụng snapshot comparison:

```javascript
const snapshotText = verify.textSnapshot;  // From iteration 1
const currentText = paper.getText();        // Current state

if (snapshotText === currentText) {
  // ✅ Paper unchanged - verify success
  result = { ok: true, changed: false, added: 0, removed: 0 };
} else {
  // ❌ Paper changed - diff for details
  const snapshotLines = snapshotText.split('\n');
  const currentLines = currentText.split('\n');
  
  // Line-by-line diff (tính added, removed, modified)
  // ...
}
```

Khi write_replace_line(lineNumber=2, text="new"):
```
VERIFY: old line 2 = "old", new line 2 = "new"
→ Diff (normalized): removed 1 (old), added 1 (new)
→ Result: { changed: true, added: 1, removed: 1 }

NOTE: Verify reports "replace" as (-1 removed, +1 added)
Tương đương: remove old content + add new content
```

---
```

**⚠️ QUAN TRỌNG:**
- `text` parameter CHỈ chứa nội dung thuần, KHÔNG có prefix (1|, 2|, ...)
- VD SAI: `text: "1| hello"` → KHÔNG được
- VD ĐÚNG: `text: "hello"` → ĐƯỢC

---

### **12. set_text**

**Tool Definition** (aiClient-agent.js:201)
```javascript
{
  name: "set_text",
  description: "Đặt toàn bộ nội dung bài viết",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "Nội dung toàn bộ bài viết" }
    },
    required: ["text"]
  }
}
```

**Executor** (server-agent.js:397)
```javascript
if (toolName === "set_text") {
  const text = String(args.text || "");
  
  const result = await controller.execute("edit", {
    edit_op: "set_text",
    text,
    expected_rev: paper.getPaperRev(),
  });
  
  if (result.ok) {
    broadcast(job, "paper.applied", { op: "set_text" });
    broadcast(job, "paper.state", { ...paper.getState() });
  }
  
  return { success: result.ok, newLength: text.length };
}
```

**Chi tiết xử lý:**
```
FLOW:
  1. executeToolCall("set_text", {
       text: "new content line 1\nnew content line 2"
     })
  2. Gọi controller.execute("edit", {
       edit_op: "set_text",
       text: "new content line 1\nnew content line 2",
       expected_rev: paper.getPaperRev()  // Version check
     })
  3. Trong controller (controller.js:110):
     - Gọi legacySetText(paper, text)
       ├─ paper.set_text(text)  // Ghi toàn bộ
       ├─ Increment paper.rev
       ├─ Emit PAPER_UPDATED
       └─ Return { ok: true, paper_rev }
  4. Executor broadcast:
     - paper.applied: { op: "set_text" }
     - paper.state: { text, rev, cols, rows }
  5. Return { success: true, newLength: text.length }

ĐIỀU KIỆN:
  - ✅ Đặt toàn bộ paper.text (ghi đè mọi thứ)
  - ✅ Paper revision tự động increment
  - ✅ Broadcast 2 events
  - ✅ Tính lại rows/cols

PAPER STATE CHANGE:
  paper.text = text  (mới)
  paper.rev = +1     (tăng)
  paper.rows = count('\n') + 1
  paper.cols = max line length

USE CASE:
  1. Rewrite toàn bộ file
  2. Restore từ backup
  3. Load template mới
  4. Generate content từ scratch

EXAMPLE:
  set_text("Chapter 1\nIntroduction\n\nContent here")
    → paper.text = "Chapter 1\nIntroduction\n\nContent here"
    → paper.rows = 4
    → paper.rev = +1
    → Broadcast: paper.state cập nhật
    → AI có thể verify() sau để check
```

---

### **13. clear_all**

**Tool Definition** (aiClient-agent.js:218)
```javascript
{
  name: "clear_all",
  description: "Xóa toàn bộ nội dung bài viết",
  parameters: { type: "object", properties: {}, required: [] }
}
```

**Executor** (server-agent.js:431)
```javascript
if (toolName === "clear_all") {
  const result = await controller.execute("edit", {
    edit_op: "clear_all",
    expected_rev: paper.getPaperRev(),
  });
  
  if (result.ok) {
    broadcast(job, "paper.applied", { op: "clear_all" });
    broadcast(job, "paper.state", { ...paper.getState() });
  }
  
  return { success: result.ok };
}
```

**Chi tiết xử lý:**
```
FLOW:
  1. executeToolCall("clear_all", {})
  2. Gọi controller.execute("edit", {
       edit_op: "clear_all",
       expected_rev: paper.getPaperRev()
     })
  3. Trong controller (controller.js:112):
     - Gọi legacyClearAll(paper)
       ├─ paper.set_text("")  // Đặt rỗng
       ├─ Increment paper.rev
       ├─ Emit PAPER_UPDATED
       └─ Return { ok: true, paper_rev }
  4. Executor broadcast:
     - paper.applied: { op: "clear_all" }
     - paper.state: { text: "", rev, cols: 0, rows: 1 }
  5. Return { success: true }

ĐIỀU KIỆN:
  - ✅ Xóa TẤT CẢ nội dung (thành chuỗi rỗng)
  - ✅ Không có parameters (luôn clear tất cả)
  - ✅ Paper revision tự động increment
  - ✅ Broadcast 2 events

PAPER STATE AFTER CLEAR:
  paper.text = ""  (empty)
  paper.rev = +1   (tăng)
  paper.rows = 1   (1 dòng rỗng)
  paper.cols = 0   (không có content)

USE CASE:
  1. Reset paper (xóa sạch)
  2. Bắt đầu mới từ đầu
  3. Cleanup sau lỗi
  4. Prepare cho batch operation mới

IMPORTANT DIFFERENCE:
  ✅ clear_all(): { text: "" }        → Paper rỗng
  ✅ set_text(""): { text: "" }        → Giống clear_all
  ❌ write_append(""): append rỗng    → Không thay đổi

AFTER CLEAR:
  Có thể ngay lập tức:
  1. write_append() để thêm content mới
  2. set_text() để load template
  3. verify() để check (sẽ show: removed=old length, added=0)

EXAMPLE:
  clear_all()
    → paper.text = ""
    → paper.rows = 1
    → paper.rev = 10 (nếu rev trước là 9)
    → Broadcast: paper.state = { text: "", rev: 10, cols: 0, rows: 1 }
    → AI có thể write_append("new content") ngay sau
```

---

### **14. verify**

**Tool Definition** (aiClient-agent.js:230)
```javascript
{
  name: "verify",
  description: "So sánh paper hiện tại với snapshot ban đầu, trả về diff",
  parameters: { type: "object", properties: {}, required: [] }
}
```

**Executor** (server-agent.js:461)
```javascript
if (toolName === "verify") {
  const result = await controller.execute("verify", {});
  
  if (result.ok) {
    broadcast(job, "verify.result", {
      diff: result.output?.diff || "",
      added: result.output?.added || 0,
      removed: result.output?.removed || 0
    });
  }
  
  return {
    success: result.ok,
    diff: result.output?.diff || "",
    changes: {
      added: result.output?.added || 0,
      removed: result.output?.removed || 0
    }
  };
}
```

**Chi tiết xử lý:**
```
FLOW:
  1. executeToolCall("verify", {})
  2. Gọi controller.execute("verify", {})
  3. Trong controller (controller.js:141):
     - Lấy snapshotText (text ban đầu khi bắt đầu)
     - Lấy currentText = paper.text (text hiện tại)
     - So sánh 2 text
     - Tính diff (added vs removed)
  4. Return:
     {
       ok: true,
       output: {
         // ✅ CORE fields (guaranteed)
         diff: string (diff output),
         added: number (lines thêm vào),
         removed: number (lines xóa đi),
         
         // ⏳ OPTIONAL fields (not currently used)
         files: [...],      // Nếu có multiple files
         evidence: [...]    // Card IDs
       }
     }
  5. Executor broadcast (core fields only):
     - verify.result: { diff, added, removed }
  6. Return { success, diff, changes: {added, removed} }
  
**⚠️ Note:** 
Executor broadcast chỉ dùng core fields (diff, added, removed).
Optional fields (files, evidence) không được truyền hiện tại.
Nếu cần thêm fields, update broadcast schema và executor logic.

SNAPSHOT MECHANISM:
  Ban đầu khi tạo session:
    ├─ Lưu paper.text hiện tại → snapshotText
    ├─ Lưu timestamp
    ├─ Lưu paper.rev
    └─ Lưu metadata

  Khi call verify():
    ├─ So sánh snapshotText vs paper.text hiện tại
    ├─ Tính removed = lines only in snapshot
    ├─ Tính added = lines only in current
    └─ Tính diff = visual representation

DIFF ALGORITHM:
  Pseudo-code:
  ```
  snapshotLines = snapshotText.split('\n')
  currentLines = paper.text.split('\n')
  
  // Myers diff algorithm (or simple LCS)
  diff = computeDiff(snapshotLines, currentLines)
    ├─ Lines with '-' prefix = removed
    ├─ Lines with '+' prefix = added
    ├─ Lines with ' ' prefix = unchanged
  
  removed = count lines with '-'
  added = count lines with '+'
  
  return {
    diff: "-line1\n+newline1\n line2",
    added: 1,
    removed: 1
  }
  ```

OUTPUT EXAMPLE:
  Snapshot: "apple\nbanana"
  Current:  "apricot\nbanana\ncherry"
  
  verify() returns:
  {
    success: true,
    diff: "- apple\n+ apricot\n  banana\n+ cherry",
    changes: {
      added: 2,    // apricot, cherry
      removed: 1   // apple
    }
  }
  
  Broadcast:
  verify.result = {
    diff: "...",
    added: 2,
    removed: 1
  }

ĐIỀU KIỆN:
  - ✅ Luôn so sánh với snapshotText (không thay đổi snapshot)
  - ✅ Không thay đổi paper.text
  - ✅ Chỉ đọc, không có side effect
  - ✅ Trả về diff dạng string (multi-line)

USE CASE:
  AI sau khi edit:
    1. write_replace_line(1, "new")
       → Broadcast: paper.state
    2. verify()
       → Broadcast: verify.result = { added: 1, removed: 1 }
    3. AI reads verify.result:
       - Nếu added=1, removed=1 → OK, expected
       - Nếu added=0, removed=0 → Không thay đổi (sai)
       - Nếu added=5, removed=1 → Hơn dự kiến (warning)
    4. AI decide: continue hay retry

IMPORTANT:
  ✅ verify() không reset snapshot
  ✅ Có thể call verify() nhiều lần
  ✅ Mỗi call so sánh với SAME snapshot ban đầu
  ✅ Không phải "checkpoint" (không save intermediate)

EXAMPLE FLOW:
  T1: Session bắt đầu
      snapshot = "line1\nline2"
      paper.text = "line1\nline2"
  
  T2: AI write_replace_line(1, "newline1")
      paper.text = "newline1\nline2"
  
  T3: AI verify()
      Compare: "line1\nline2" vs "newline1\nline2"
      Return: { diff: "-line1\n+newline1\n line2", added: 1, removed: 1 }
  
  T4: AI write_append("\nline3")
      paper.text = "newline1\nline2\nline3"
  
  T5: AI verify() again
      Compare: "line1\nline2" vs "newline1\nline2\nline3"
      Return: { diff: "-line1\n+newline1\n line2\n+line3", added: 2, removed: 1 }
      (Vẫn so sánh với snapshot ban đầu, không phải T2)

FULL VERIFICATION EXAMPLE:
  Initial: "apple\nbanana\ncherry"
  
  Step 1: write_replace_line(1, "apricot")
  Step 2: write_append("\ndate")
  
  Current: "apricot\nbanana\ncherry\ndate"
  
  verify() output:
  {
    success: true,
    diff: "- apple\n+ apricot\n  banana\n  cherry\n+ date",
    changes: {
      added: 2,
      removed: 1
    }
  }
  
  Interpretation:
  - Removed: "apple" (1 line)
  - Added: "apricot", "date" (2 lines)
  - Unchanged: "banana", "cherry"
  - Net change: +1 line
```

---

## 🔄 Flow xử lý - TUẦN TỰ (Sequential Execution)

### ✅ ĐÚNG: Luồng hoạt động là **1 chuỗi XEN KẾ** (interleaved)

**AI suy nghĩ → Gọi tool 1 → Hệ thống thực thi → Xác minh → AI suy nghĩ lại → Gọi tool 2 → ...**

```
┌─────────────────────────────────────────────────────────────┐
│         ITERATION 1: AI SƯỚC NGHĨ & GỌI TOOL 1              │
└─────────────────────────────────────────────────────────────┘

1️⃣  [AI SỪINKING - Phase]
    OpenAI đang suy nghĩ, stream token-by-token
    Token: "Tôi" → "cần" → "tìm" → "từ" → "khóa" → "sửa"
    ✅ broadcast agent.thought: "Tôi cần tìm từ khóa sửa"

2️⃣  [AI TOOL CALL - Phase]
    AI quyết định: gọi search_paper (query="sửa")
    ✅ broadcast agent.thought: "Đang tìm kiếm từ 'sửa'"

3️⃣  [SYSTEM EXECUTION - Phase]
    Hệ thống thực thi:
    - executeToolCall(search_paper) → controller.execute()
    - Scan paper, tìm tất cả dòng có "sửa"
    - Lấy câu hoàn chỉnh xung quanh
    ✅ broadcast search.result: { query: "sửa", lines: [...] }

4️⃣  [AI VERIFICATION - Phase]
    AI xem kết quả search, quyết định bước tiếp theo:
    - Nếu search ra dòng → gọi get_context_lines
    - Nếu chưa đủ → gọi search_paper lại
    - Nếu có lỗi → gọi verify để kiểm tra

┌─────────────────────────────────────────────────────────────┐
│        ITERATION 2: AI SƯỜC NGHĨ & GỌI TOOL 2               │
└─────────────────────────────────────────────────────────────┘

1️⃣  [AI THINKING - Phase]
    Stream: "Tôi" → "tìm" → "được" → "dòng" → "1" 
    ✅ broadcast agent.thought: "Tôi tìm được dòng 1"

2️⃣  [AI TOOL CALL - Phase]
    AI quyết định: gọi get_context_lines (lineNumber=1, ranges=[...])
    ✅ broadcast agent.thought: "Lấy context xung quanh dòng 1"

3️⃣  [SYSTEM EXECUTION - Phase]
    - executeToolCall(get_context_lines)
    - Lấy dòng 1 + dòng xung quanh
    ✅ broadcast context.retrieved: { lineNumber: 1, context: [...] }

4️⃣  [AI VERIFICATION - Phase]
    AI thấy content rõ ràng, quyết định sửa
    → Tiếp tục lặp...

┌─────────────────────────────────────────────────────────────┐
│        ITERATION 3: AI SƯỜC NGHĨ & GỌI TOOL 3               │
└─────────────────────────────────────────────────────────────┘

1️⃣  [AI THINKING - Phase]
    Stream: "Thay" → "đổi" → "1" → "thành" → "2"
    ✅ broadcast agent.thought: "Thay đổi 1 thành 2"

2️⃣  [AI TOOL CALL - Phase]
    AI gọi: write_replace_line (lineNumber=1, text="2 2 4 3 34 34 2")
    ✅ broadcast agent.thought: "Đang áp dụng thay đổi"

3️⃣  [SYSTEM EXECUTION - Phase]
    - executeToolCall(write_replace_line)
    - Paper kernel apply change
    ✅ broadcast paper.applied: { op: "write_replace_line", lineNumber: 1 }
    ✅ broadcast paper.state: { text: "2 2 4 3 34 34 2\n1" }

4️⃣  [AI VERIFICATION - Phase]
    AI quyết định: gọi verify() để kiểm tra
    → Tiếp tục lặp...

┌─────────────────────────────────────────────────────────────┐
│        ITERATION 4: AI SƯỜC NGHĨ & GỌI TOOL 4               │
└─────────────────────────────────────────────────────────────┘

1️⃣  [AI THINKING - Phase]
    Stream: "Kiểm" → "tra" → "kết" → "quả"
    ✅ broadcast agent.thought: "Kiểm tra kết quả"

2️⃣  [AI TOOL CALL - Phase]
    AI gọi: verify()
    ✅ broadcast agent.thought: "Xác minh thay đổi"

3️⃣  [SYSTEM EXECUTION - Phase]
    - executeToolCall(verify)
    - Compare current vs snapshot
    ✅ broadcast verify.result: { diff: "- 1 2 4 3 34 34 2\n+ 2 2 4 3 34 34 2", added: 1, removed: 1 }
    (replaced dòng 1: removed old "1 2...", added new "2 2...")

4️⃣  [AI FINAL CHECK - Phase]
    AI xem verify.result OK:
    - ✅ Removed: 1 dòng (old content)
    - ✅ Added: 1 dòng (new content)
    - ✅ Match expected (replace = -1 +1)
    → Kết thúc, stream final reply

┌─────────────────────────────────────────────────────────────┐
│                  FINAL: AI REPLY TO USER                    │
└─────────────────────────────────────────────────────────────┘

Stream: "Đã" → "sửa" → "xong" → "rồi"
✅ broadcast agent.thought: "Đã sửa xong rồi"
✅ broadcast chat.final: { text: "Đã sửa dòng 1 thành 2, tất cả bình thường" }

Stream closes ← Client receives final message
```

### ❌ SAI (Batch Processing): 

**Lập plan 1 lần → Hệ thống xử lý TẤT CẢ tools cùng 1 lúc:**

```
[AI Planning Phase]
  → "Bước 1: search, Bước 2: get_context, Bước 3: write, Bước 4: verify"

[System Batch Execution]
  → search_paper
  → get_context_lines
  → write_replace_line
  → verify
  Tất cả run đồng thời/nối tiếp không có feedback

[Final Reply]
  → "Đã xong"

❌ VẤN ĐỀ:
  - AI không thấy kết quả từng bước → không biết có lỗi không
  - Nếu bước 1 fail → bước 2,3,4 vẫn chạy → dữ liệu sai
  - Không thể self-correct
  - Không có chuyển tiếp mềm mại giữa các bước
```

---

### User sends message → AI responds with streaming + tool calls (Tuần tự, Xen kẽ)

```
1. POST /api/chat/create
   ├─ Input: { message: "sửa 1 thành 2" }
   └─ Output: { sessionId }

2. GET /api/chat/stream?sid=xxx (SSE)
   ├─ [AGENT LOOP Iteration 1]
   │  ├─🧠 AI THINKING: Stream token-by-token từ OpenAI
   │  │  └─ onThought("token: ...") → broadcast agent.thought
   │  ├─🎯 AI TOOL CALL: Gọi search_paper
   │  ├─⚙️  SYSTEM EXECUTION: Thực thi tool, lấy kết quả
   │  │  └─ broadcast search.result
   │  └─✓ AI VERIFICATION: Xem kết quả, quyết định lặp tiếp
   │
   ├─ [AGENT LOOP Iteration 2]
   │  ├─🧠 AI THINKING: Suy nghĩ kế tiếp dựa trên kết quả Iteration 1
   │  ├─🎯 AI TOOL CALL: Gọi get_context_lines
   │  ├─⚙️  SYSTEM EXECUTION: Lấy context
   │  │  └─ broadcast context.retrieved
   │  └─✓ AI VERIFICATION: OK rồi, lặp tiếp
   │
   ├─ [AGENT LOOP Iteration 3]
   │  ├─🧠 AI THINKING: Suy nghĩ dựa trên context
   │  ├─🎯 AI TOOL CALL: Gọi write_replace_line
   │  ├─⚙️  SYSTEM EXECUTION: Áp dụng thay đổi
   │  │  └─ broadcast paper.applied, paper.state
   │  └─✓ AI VERIFICATION: Tiếp tục
   │
   ├─ [AGENT LOOP Iteration 4]
   │  ├─🧠 AI THINKING: Kiểm tra cần verify không
   │  ├─🎯 AI TOOL CALL: Gọi verify
   │  ├─⚙️  SYSTEM EXECUTION: So sánh
   │  │  └─ broadcast verify.result
   │  └─✓ AI VERIFICATION: Tất cả OK, kết thúc
   │
   └─ [FINAL REPLY]
      └─ chat.final → User nhận reply
```

### Broadcast events (Tuần tự theo flow):

```
⏱️  TIMELINE:

T0:  🧠 agent.thought: "Suy nghĩ..."
T1:  🧠 agent.thought: "token: Tôi"
T2:  🧠 agent.thought: "token: cần"
...
Tn:  🎯 [TOOL CALL 1 - search_paper]
     ⚙️  search.result: { query: "sửa", lines: [...] }
     ✓ [AI sees result, decides next step]

Tn+1: 🧠 agent.thought: "Tìm được rồi..."
Tn+2: 🎯 [TOOL CALL 2 - get_context_lines]
      ⚙️  context.retrieved: { lineNumber: 1, ... }
      ✓ [AI sees context, decides next step]

Tn+3: 🧠 agent.thought: "Sửa dòng 1..."
Tn+4: 🎯 [TOOL CALL 3 - write_replace_line]
      ⚙️  paper.applied: { op: "write_replace_line" }
      ⚙️  paper.state: { text: "..." }
      ✓ [AI sees change, decides next step]

Tn+5: 🧠 agent.thought: "Kiểm tra..."
Tn+6: 🎯 [TOOL CALL 4 - verify]
      ⚙️  verify.result: { diff: "...", added: 1 }
      ✓ [AI sees verification OK, time to reply]

Tn+7: 🧠 agent.thought: "Xong rồi"
Tn+8: 💬 chat.final: "Đã sửa xong"
```

### 📝 NOTE: Broadcast Events Scope

Broadcast events trong doc này là **CORE EVENTS** của Sequential Agent Loop Architecture v1.0:
- `agent.thought` - AI thinking stream
- `search.result`, `search.kept`, `search.retrieved`, `search.cleared` - Search state
- `context.retrieved` - Context lines retrieved
- `paper.applied`, `paper.state` - Paper edits and state
- `verify.result` - Verification results
- `chat.final` - Final response

**Preview events** (`paper.preview_*`, `paper.state` with diff) từ older architecture **không được sử dụng** trong minimal pipeline này.

Nếu bạn cần preview/diff streaming, bạn có thể extend broadcast event này.

### Streaming chi tiết:

```
Client                              Server
  │                                  │
  ├─ POST /api/chat/create ────────→ runAgentPipelineWrapper
  │                                  │
  ├─ GET /api/chat/stream ─────────→ res.writeHead(200, {
  │                    (SSE)          'Content-Type': 'text/event-stream'
  │                                  })
  │                                  │
  │←─ agent.thought ─────────────── broadcast(job, "agent.thought")
  │   event: agent.thought
  │   data: {"thought":"Suy nghĩ..."}
  │
  │←─ agent.thought ───────────────── onThought("token: hello")
  │   event: agent.thought
  │   data: {"thought":"token: hello"}
  │
  │←─ search.result ────────────────── broadcast(job, "search.result")
  │   event: search.result
  │   data: {"type":"paper","query":"sửa",...}
  │
  │←─ paper.applied ────────────────── broadcast(job, "paper.applied")
  │   event: paper.applied
  │   data: {"op":"write_replace_line","lineNumber":1,...}
  │
  │←─ paper.state ──────────────────── broadcast(job, "paper.state")
  │   event: paper.state
  │   data: {"text":"2 2 4 3 34 34 2\n1",...}
  │
  │←─ verify.result ────────────────── broadcast(job, "verify.result")
  │   event: verify.result
  │   data: {"diff":"...","added":1,"removed":0}
  │
  │←─ chat.final ───────────────────── broadcast(job, "chat.final")
  │   event: chat.final
  │   data: {"text":"Đã sửa dòng 1 thành 2"}
  │
  └─ (stream closes)
```

---

## 📢 Broadcast Events (Tuần tự - Sequential)

| Bước | Event | Mô tả | Khi nào phát |
|------|-------|-------|------------|
| 🧠 AI THINKING | `agent.thought` | Token/suy nghĩ từ AI | Mỗi token từ OpenAI stream |
| 🎯 AI TOOL CALL 1 | (none, just accumulate) | AI đã quyết định gọi tool nào | Accumulating fragments |
| ⚙️ SYSTEM EXEC 1 | `search.result` / `context.retrieved` / `paper.applied` / `verify.result` | Kết quả từng tool | Sau khi executeToolCall hoàn thành |
| ✓ AI VERIFY 1 | (AI sees result from step 3) | AI xem result và quyết định bước tiếp | Được lấy từ last message |
| 🧠 AI THINKING | `agent.thought` | AI suy nghĩ lại dựa trên Verify 1 | Iteration 2 bắt đầu |
| ... | ... | ... | Lặp lại 2-5 lần |
| 💬 FINAL | `chat.final` | Reply cuối cùng | Khi stop_reason="end_turn" |

### Ví dụ: "sửa 1 thành 2" - Chi tiết timeline

```
T=0ms   [Iteration 1]
        User: "sửa 1 thành 2"
        POST /api/chat/create
        ↓
        GET /api/chat/stream
        ↓
        🧠 AI THINKING
        onThought("token: Tôi")
        broadcast(job, "agent.thought", { thought: "Tôi" })
        
T=50ms  🧠 AI THINKING (continued)
        onThought("token: cần")
        broadcast(job, "agent.thought", { thought: "token: cần" })
        onThought("token: tìm")
        onThought("token: từ")
        onThought("token: khóa")
        broadcast(job, "agent.thought", { thought: "token: khóa" })
        
T=150ms 🎯 AI TOOL CALL 1
        OpenAI stream phát hiện tool_calls:
        toolCall: {
          id: "call_abc123",
          index: 0,
          function: {
            name: "search_paper",
            arguments: '{"query":"sửa"}'
          }
        }
        
        ⚙️ SYSTEM EXECUTION 1
        server-agent.js:51
        await controller.execute("search_paper", { query: "sửa", limit: 5 })
        ↓
        searchPaperKeyword("sửa")
        ↓ Found: ["sửa", "sửa lại"]
        ↓ With context: Dòng 1: "sửa 1 thành 2"
        ↓
        broadcast(job, "search.result", {
          type: "paper",
          query: "sửa",
          lines: [{
            lineNumber: 1,
            text: "sửa 1 thành 2",
            snippet: "...sửa 1 thành 2..."
          }],
          totalMatches: 1,
          keyword: "sửa"
        })
        
T=250ms ✓ AI VERIFICATION 1
        AI reads: result = {
          ok: true,
          output: {
            lines: [{ lineNumber: 1, text: "sửa 1 thành 2" }],
            totalMatches: 1
          }
        }
        
        AI thinks: "Tìm được 1 dòng"
        AI decides: "Cần lấy context xung quanh dòng 1"
        ↓ Iteration 2 bắt đầu
        
T=300ms [Iteration 2]
        🧠 AI THINKING
        onThought("token: Dòng")
        onThought("token: 1")
        broadcast(agent.thought, "Dòng 1 chứa 'sửa'")
        
T=350ms 🎯 AI TOOL CALL 2
        AI gọi: get_context_lines({
          lineNumber: 1,
          ranges: [
            { start: 1, end: 1 }
          ]
        })
        
        ⚙️ SYSTEM EXECUTION 2
        server.js:2127 handler getContextLines
        Lấy dòng 1 từ paper:
        broadcast(job, "context.retrieved", {
          lineNumber: 1,
          context: [{
            lineNumber: 1,
            text: "sửa 1 thành 2"
          }],
          totalLines: 2
        })
        
T=400ms ✓ AI VERIFICATION 2
        AI reads: context = [{ lineNumber: 1, text: "sửa 1 thành 2" }]
        AI thinks: "OK, dòng 1 cần sửa '1' thành '2'"
        AI decides: "Gọi write_replace_line"
        ↓ Iteration 3 bắt đầu
        
T=450ms [Iteration 3]
        🧠 AI THINKING

---

## ⚠️ Design Considerations & Optimization Notes

### A. Context Window Management (Token Budget)

**Problem:** Với Max Iterations: 15, context window có thể tăng rất nhanh:
- Search results có thể trả về nhiều text
- Verify diff có thể lớn nếu file lớn
- Token cost tăng cao sau vài iterations

**Solution:**
1. **Truncate search results:** Giới hạn search_paper output (ví dụ: max 5 matches, each max 500 chars)
2. **Summarize old steps:** Khi iteration > 10, có thể compress các "thought tokens" cũ hoặc ghi "(... 5 iterations trước ...)"
3. **Limit diff output:** Verify chỉ trả full diff nếu < 10 lines, otherwise trả "N lines added/removed" + summary
4. **Monitor token count:** Log token usage per iteration, stop nếu approach 90% window limit

**Implementation hint:** Thêm `maxResults`, `truncateAt`, `maxDiffLines` config params

---

### B. Line Number Drift - The Re-anchoring Pattern ⚠️ CRITICAL

**Problem: "Blind Spot Scenario"**

```
Initial state: File có 100 dòng, AI biết Function A ở dòng 10, Function B ở dòng 80

Action 1: write_append(10, "5 new lines")
         → File giờ có 105 dòng, Function B đã trôi xuống dòng 85

Action 2: verify()
         → Trả về: "+5 lines at 10", nhưng KHÔNG show Function B ở dòng 85

Action 3: AI muốn sửa Function B (dòng 80 trong ký ức cũ)
         write_replace_line(80, ...)  ← SAILS!
         
Result:  Thay thế sai dòng, code hỏng, Function B thực chất ở dòng 85
```

**Why verify() alone is NOT enough:**
- Verify nhìn về **quá khứ** (diff từ snapshot)
- Nó KHÔNG nhìn về **tương lai** (nơi target sẽ là sau edit)
- Trong large files, AI dễ "mất định hướng" (lose anchor)

**Solution: Re-anchor before Multi-site Edits**

Nếu AI edit ở **2 vị trí khác nhau**, PHẢI gọi search/context lại:

```
Edit 1: write_replace_line(10, "...")
        verify()  ← OK, thấy change ở dòng 10

(Before Edit 2 ở vị trí xa)
Search: search_paper("Function B")  ← Re-anchor!
        → Result: "Found at line 85"
        
Edit 2: write_replace_line(85, "...")
        verify()  ← Chính xác!
```

**System Prompt guidance (add to AI prompt):**
```
Quy tắc:
1. Nếu edit ở CÙNG dòng liên tiếp: Chỉ cần verify (diff show ngay)
2. Nếu edit ở DỰA vị trí khác nhau: PHẢI search/get_context lại TRƯỚC khi sửa
   Không tin vào "dòng số trong ký ức", vì file đã thay đổi
3. Sau mỗi edit, dòng số CÓ THỂ thay đổi. Luôn tìm target mới bằng content search.
```

**Implementation:**
- System Prompt must mention this explicitly
- Consider adding "anchor validation" rule: "verify that target line contains expected content before edit"

---

### C. Indentation Preservation in write_replace_line

**Problem:** AI thường quên giữ nguyên khoảng trắng đầu dòng

```javascript
// Original line 10: "    return value;"  (4 spaces indent)
// AI replaces with: "return value;" (NO indent)
// Result: Syntax error or logical error
```

**Solution:**

1. **In get_context_lines:** Preserve leading whitespace in context:
```javascript
{
  lineNumber: 10,
  content: "    return value;",
  leadingSpaces: 4  // ← Rõ ràng để AI học
}
```

2. **In executor validation:** Check and preserve indent:
```javascript
if (toolName === "write_replace_line") {
  const text = String(args.text || "");
  const originalLine = lines[lineNumber - 1];
  const originalIndent = originalLine.match(/^\s*/)[0];
  
  // If new text doesn't have indent, preserve old one
  if (!text.startsWith(originalIndent) && !text.match(/^\s/)) {
    const fixedText = originalIndent + text.trim();
    // Use fixedText instead, or warn AI
  }
}
```

3. **In tool definition:** Add hint:
```javascript
{
  name: "write_replace_line",
  description: "...",
  parameters: {
    text: {
      description: "Nội dung mới (PRESERVE indentation của dòng cũ!)"
    }
  }
}
```

---

### D. Error Recovery Loop Prevention

**Problem:** AI gọi tool với tham số sai liên tục

```
Iteration 1: write_replace_line(999, ...) → Error: out of range
Iteration 2: write_replace_line(999, ...) → Error: out of range
Iteration 3: write_replace_line(999, ...) → Error: out of range
...
(Lãng phí iterations)
```

**Solution: Error Quota**

```javascript
const errorQuota = {
  [key: toolName]: count
};

if (errorQuota[toolName] >= 3) {
  return {
    error: true,
    message: `Tool '${toolName}' failed 3 times. Stopping.`,
    instruction: "Please re-read context with search_paper() or get_context_lines() to find correct line number"
  };
}
```

**Better approach: Helpful error messages**

Instead of generic error, give AI specific guidance:

```javascript
// Bad error:
{ error: true, message: "Line number out of range" }

// Good error:
{
  error: true,
  message: "Line number 999 out of range. Paper has only 105 lines.",
  suggestion: "Try search_paper('keyword') to find exact line number first"
}
```

---

### E. Summary: When to Search vs When to Verify

| Scenario | Use Verify | Use Search/Context | Reason |
|----------|------------|-------------------|--------|
| **Single location edits (same line)** | ✅ YES | ❌ NO | Diff shows exact change, no drift |
| **Multi-site edits (edit A then edit B far away)** | ✅ YES (for A) | ✅ YES (before B) | Need to re-anchor target B |
| **After many edits (>5 consecutive)** | ✅ YES | ✅ Consider | Context might be stale, re-validate |
| **Before large edit (affecting many lines)** | ✅ YES | ✅ YES | Critical to know exact state |
| **Just checking if done** | ✅ YES | ❌ NO | Verify shows final diff |

---

### F. Recommended "Safe Edit Pattern"

```
PATTERN: Search → Verify → Edit → Verify (Repeat)

Iteration N:
  1. search_paper("target content")  ← Find exact location
  2. get_context_lines(found_line, before=3, after=3)  ← Validate context
  3. verify()  ← Show baseline
  4. write_replace_line(found_line, new_text)  ← Edit
  5. verify()  ← Confirm change
  6. (Repeat for next target, NOT using old line numbers)

WHY THIS WORKS:
- Step 1-2: No guessing, find by content
- Step 3: Establishes baseline
- Step 4-5: Edit + immediate feedback
- Step 6: Never reuse old coordinates
```

---

## 📋 Checklist for Implementation

- [ ] Add truncation/summarization for search_paper output (max results, max text length)
- [ ] Document re-anchoring pattern in System Prompt
- [ ] Implement error quota (3 strikes = stop + guidance)
- [ ] Add indentation preservation in executor or warn in tool schema
- [ ] Monitor context window usage per iteration (log token count)
- [ ] Test "multi-site edit" scenario: verify it doesn't drift
- [ ] Consider adding "anchor validation" (check content before edit)
- [ ] Test large file (100+ lines) with 3+ consecutive edits

---
        onThought("token: Thay")
        onThought("token: đổi")
        broadcast(agent.thought, "Thay đổi dòng 1")
        
T=500ms 🎯 AI TOOL CALL 3
        AI gọi: write_replace_line({
          lineNumber: 1,
          text: "2 2 4 3 34 34 2"
        })
        
        ⚙️ SYSTEM EXECUTION 3
        server-agent.js:291 executeToolCall
        await controller.execute("edit", {
          operation: "write_replace_line",
          lineNumber: 1,
          text: "2 2 4 3 34 34 2"
        })
        ↓
        Paper.set_text() applied
        ↓
        broadcast(job, "paper.applied", {
          op: "write_replace_line",
          lineNumber: 1,
          newRev: 2,
          timestamp: 1707...
        })
        
        broadcast(job, "paper.state", {
          text: "2 2 4 3 34 34 2\n1",
          rev: 2,
          cols: 17,
          rows: 2
        })
        
T=550ms ✓ AI VERIFICATION 3
        AI reads: applied = { op: "write_replace_line", lineNumber: 1 }
        AI reads: state = { text: "2 2 4 3 34 34 2\n1" }
        AI thinks: "Thay đổi thành công"
        AI decides: "Gọi verify() để kiểm tra"
        ↓ Iteration 4 bắt đầu
        
T=600ms [Iteration 4]
        🧠 AI THINKING
        onThought("token: Kiểm")
        onThought("token: tra")
        broadcast(agent.thought, "Kiểm tra kết quả")
        
T=650ms 🎯 AI TOOL CALL 4
        AI gọi: verify()
        
        ⚙️ SYSTEM EXECUTION 4
        server-agent.js:461 executeToolCall
        await controller.execute("verify")
        ↓
        Compare current vs snapshot
        ↓
        broadcast(job, "verify.result", {
          diff: "- sửa 1 thành 2\n+ 2 2 4 3 34 34 2",
          added: 1,
          removed: 1,
          status: "ok"
        })
        
T=700ms ✓ AI VERIFICATION 4
        AI reads: verify = {
          diff: "...",
          added: 1,
          removed: 1,
          status: "ok"
        }
        AI thinks: "Thay đổi chính xác"
        AI decides: "Xong, reply người dùng"
        ↓ FINAL REPLY
        
T=750ms 🧠 AI THINKING (Final)
        onThought("token: Đã")
        onThought("token: sửa")
        onThought("token: xong")
        
T=800ms 💬 FINAL REPLY
        broadcast(job, "chat.final", {
          text: "Đã sửa xong dòng 1, thay đổi '1' thành '2' và các số khác theo yêu cầu"
        })
        
        res.write(":\n\n")
        stream close
```

### Bảng broadcast events chi tiết:

| Event | Lần phát | Tần suất | Khi nào | Data cấu trúc |
|-------|---------|---------|---------|----------------|
| `agent.thought` | Mỗi token + Tool decision | 5-20 lần/request | Mỗi khi OpenAI stream token hoặc AI quyết định tool | `{ thought: string }` |
| `search.result` | Khi tool search_paper/search_chat/search_tools hoàn thành | 1-3 lần | Sau executeToolCall search | `{ type, query, lines/cards, totalMatches, keyword }` |
| `context.retrieved` | Khi get_context_lines hoàn thành | 1-2 lần | Sau executeToolCall get_context | `{ lineNumber, context[], totalLines }` |
| `search.kept` | Khi keep_search gọi | 0-2 lần | User chọn lưu search | `{ key, query, lineCount }` |
| `search.retrieved` | Khi retrieve_search gọi | 0-2 lần | User khôi phục search | `{ key, query, lineCount }` |
| `search.cleared` | Khi clear_kept_search gọi | 0-1 lần | User xóa 1 search | `{ key }` |
| `paper.applied` | Khi tool edit được gọi | 1-3 lần | Sau executeToolCall write_replace/write_append/set_text/clear_all | `{ op, lineNumber, newRev, timestamp }` |
| `paper.state` | Sau mỗi paper.applied | 1-3 lần | Ngay sau edit hoàn thành | `{ text, rev, cols, rows }` |
| `verify.result` | Khi verify gọi | 1 lần | Sau executeToolCall verify hoàn thành | `{ diff, added, removed, status }` |
| `chat.final` | Cuối cùng | 1 lần | Khi AI stop_reason=end_turn | `{ text: string }` |

---

## ⚠️ Error Handling

### Tool execution errors:

```javascript
try {
  const result = await onToolCall(functionName, args);
} catch (parseErr) {
  console.error(`[AGENT LOOP] Failed to parse args for ${functionName}:`, parseErr.message);
  args = {};  // Fallback to empty
}

// Return error format
return {
  error: true,
  message: "Invalid line number" / "Not found" / etc
}

// AI xem error, quyết định:
// - Retry với parameters khác
// - Gọi get_context_lines để lấy info
// - Gọi verify để check state
```

### Search not found:

```javascript
searchPaper("xyz") → totalMatches = 0
→ currentSearchResult = null
→ keep_search sẽ fail nếu gọi ngay sau

→ AI phải xử lý (retry search khác hoặc skip)
```

### Line out of range:

```javascript
write_replace_line(lineNumber=999) 
→ { error: true, message: "Line number out of range" }
→ AI phải gọi get_context_lines trước để xem có mấy dòng
```

### Incomplete JSON:

```javascript
OpenAI stream:
  CHUNK 1: arguments = ""
  CHUNK 2: arguments = "{"
  CHUNK 3: arguments = ""line"
  ...
  FINAL: arguments = "{"lineNumber":1,"text":"hello"}"

Fixed by: Accumulate chunks, parse sau khi stream xong
```

---

## 📊 Trạng thái Global

```javascript
// ✅ Search result hiện tại (ARRAY, không object)
// currentSearchResult = results (array từ handler searchPaper)
currentSearchResult = [
  {
    match: "matched text",
    keyword: "query",
    lines: [{ line: 5, content: "full line content" }, ...]  
  },
  ...
]
// Truy cập: currentSearchResult.length, currentSearchResult[0].match

currentSearchQuery = "query"  // String query hiện tại

// Lưu tất cả searches (savedSearches = Map)
// savedSearches.set(key, { query, result, timestamp })
// result ở đây cũng là ARRAY (copy của currentSearchResult)
savedSearches = Map {
  "key1": { query: "...", result: [...], timestamp: 1234567890 },
  "key2": { query: "...", result: [...], timestamp: 1234567891 }
}

// Paper state
paper.text = "content"
paper.rev = 1
paper.cols = 80
```

---

## 🔗 Contract Rõ ràng: Handler → Controller → Executor

### ✅ OPTION A (Hiện tại - Đúng)

**Handler trả output THUẦN** (không wrap `{ ok, output }`)

```javascript
// Handler (trong runAgentPipelineWrapper handlers = {...})
searchPaper: async ({ query }, { paper }) => {
  // ... logic
  return { results: [...] };  // ← Output thuần
}

// Controller.execute("search_paper", args)
return { ok: true, output: { results: [...] } };  // ← Controller wrap 1 lần

// Executor
const result = controller.execute(...);
const results = result.output?.results;  // ← Access result.output
```

**Contract:**
```
┌────────────────────────────────────────────────────┐
│ Handler Output → Controller Wrap → Executor Access │
└────────────────────────────────────────────────────┘

Handler:    { results: [...] }
                   ↓
Controller: { ok: true, output: { results: [...] } }
                                  ↓
Executor:   result.output.results ✅
```

### ❌ SAI (Trộn lẫn contract)

```javascript
// Handler wrap { ok, output }
searchPaper: async (...) => {
  return { ok: true, output: { results: [...] } };
}

// Controller wrap lại
return { ok: true, output: { ok: true, output: { results: [...] } } };
                    ↑ Lồng nhau!

// Executor access sai
result.output?.results  // ← undefined!
result.output?.output?.results  // ← phải như này → XẤU
```

### APIs sử dụng Option A:

| API | Handler Output | Executor Access |
|-----|----------------|-----------------|
| search_paper | `{ results: [] }` | `result.output.results` |
| search_chat | `{ cards: [] }` | `result.output.cards` |
| search_tools | `{ cards: [] }` | `result.output.cards` |
| keep_search | `{ key, saved, totalSaved }` | `result.output.key` |
| retrieve_search | `{ key, query, lines, timestamp }` | `result.output.query` |
| get_kept_searches | `{ searches, total }` | `result.output.searches` |
| clear_kept_search | `{ deleted, remaining }` | `result.output.remaining` |
| clear_all_kept_searches | `{ cleared }` | `result.output.cleared` |
| write_append | (Paper kernel, wrap by controller) | `result.output.paper_rev` |
| write_replace_line | (Paper kernel, wrap by controller) | `result.output.paper_rev` |
| set_text | (Paper kernel, wrap by controller) | `result.output.paper_rev` |
| clear_all | (Paper kernel, wrap by controller) | `result.output.paper_rev` |
| verify | (Paper kernel, wrap by controller) | `result.output.diff` |
| get_context_lines | `{ contextLines, processedRanges, totalLines }` | `result.output.contextLines` |

---

| Aspect | Chi tiết |
|--------|---------|
| **Architecture** | Tools → Executors → Handlers → Controller |
| **Streaming** | Token-by-token từ OpenAI, broadcast qua SSE |
| **Tool calls** | Accumulate qua chunks, dùng index as key |
| **Search** | Scan biên tìm câu hoàn chỉnh, merge DUY NHẤT target |
| **Edit** | Line-based (KHÔNG offset-based) |
| **Context** | Flexible: single line hoặc multiple ranges |
| **State** | Lưu search, verify thay đổi, replay |

---

**Cập nhật:** 2 tháng 2, 2026  
**Phiên bản:** 1.0  
**Status:** ✅ Production Ready
