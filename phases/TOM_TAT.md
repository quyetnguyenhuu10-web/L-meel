# 🏗️ Implementation Roadmap - Tóm tắt Việt

**Dự án:** Thêm Patch Mode vào Sequential Agent Loop  
**Phương pháp:** Kỹ sư hệ thống - Linear Phase Chain  
**Thời gian dự tính:** 1 tháng (3 tuần dev + 1 tuần deploy)  
**Ngày tạo:** 2 tháng 2, 2026  

---

## 📋 5 Giai Đoạn (Linear Chain)

### Phase 00: Baseline Validation (2-3h)
**Mục tiêu:** Xác nhận hệ thống hiện tại hoạt động  
**Vấn đề:** Nếu baseline broken, mọi phase sẽ fail  
**Test:** Gọi các tool hiện tại (search, edit, verify)  
**Kết quả:** BASELINE_ARCHITECTURE.md (map các function)  

### Phase 01: Tool Schema (1-2h)
**Mục tiêu:** Thêm `apply_patches` vào TOOLS array  
**Vấn đề:** OpenAI không biết tool này tồn tại  
**Test:** 15 tools → 16 tools, JSON valid  
**Kết quả:** TOOLS array có apply_patches  

### Phase 02: Executor Handler (2-3h)
**Mục tiêu:** Xử lý apply_patches tool call  
**Vấn đề:** Executor không biết cách xử lý patches  
**Test:** Validate patches, gọi controller, broadcast events  
**Kết quả:** Executor xử lý apply_patches → controller.execute  

### Phase 03: Controller Action (3-4h)
**Mục tiêu:** Áp dụng patches (DESC sort để tránh line drift)  
**Vấn đề:** Nếu apply patches sai order → line numbers sai  
**Test:** Line drift prevention, patch types, error handling  
**Kết quả:** Controller áp dụng patches + update paper.rev  

### Phase 04: Integration Test (3-4h)
**Mục tiêu:** Test Patch Mode hoạt động cho single + batch edits  
**Vấn đề:** Combining parts ≠ works together  
**Test:** Single edit, batch edits (DESC sort), validation rules  
**Kết quả:** Xác nhận Patch Mode unified layer works  

### Phase 05: Production Rollout (2-4 tuần)
**Mục tiêu:** Deploy safe với monitoring + gradual rollout  
**Vấn đề:** 100% users immediately = huge risk  
**Test:** Feature flag 10% → 20% → 50% → 100%  
**Kết quả:** Live production, monitoring dashboard, alert rules  

---

## 🎯 Nguyên tắc Kỹ sư Hệ thống

### 1. Linear Chain (Không nhánh)
```
Phase 00 → 01 → 02 → 03 → 04 → 05
  ↓
(Không được skip, không được song song)
```

### 2. Test Ngay, Không Chờ
```
Build Steps → Test Now → Exit Criteria → Commit
(Nếu test fail → fix, không tiếp tục)
```

### 3. Mỗi Phase: 1-2 Vấn Đề
```
Không gộp: "Implement tool + executor + controller"
Chia nhỏ:
  - Phase 01: Tool schema (data)
  - Phase 02: Executor (validation)
  - Phase 03: Controller (logic)
```

### 4. Từng Bước Nhỏ
```
Phase < 5h làm việc
Phase < 100 dòng code
Phase < 5 test cases
Phase < 2 files thay đổi
```

### 5. No Magic - Tất cả rõ ràng
```
Không "design chung chung"
Không "optimize sau"
Không "test được không?"
→ Test NGAY hoặc không làm
```

---

## 🗂️ Cấu trúc Folder

```
/phases/
├── phase-00-baseline-validation.md      ← START ĐÂY
├── phase-01-tool-schema.md
├── phase-02-executor-handler.md
├── phase-03-controller-action.md
├── phase-04-ai-decision-logic.md
├── phase-05-integration-test.md
├── phase-06-production-rollout.md
└── ROADMAP.md                           ← Index chính
```

**Mỗi file:**
- Goal (tại sao)
- Scope (vấn đề gì)
- Build Steps (làm cụ thể)
- Test Now (chạy ngay)
- Exit Criteria (khi nào xong)
- Dependency (phụ thuộc phase nào)
- Next (phase kế tiếp dùng gì)

---

## 📊 Timeline

| Tuần | Phase | Khoảng thời gian |
|------|-------|-----------------|
| 1 | 00-04 | 2-3 ngày |
| 1 | Code review | 1 ngày |
| 2-4 | 05 (Deploy) | 3 tuần |
| 4+ | Monitoring | Ongoing |

**Tổng:** ~1 tháng start-to-finish

---

## ✅ Điều Kiện Thành Công

### Mỗi Phase:
- ✅ Tất cả test PASS
- ✅ Commit được accepted
- ✅ Code review approved
- ✅ Không regressions

### Cuối cùng (Phase 05):
- ✅ < 5% error rate
- ✅ > 20% token savings
- ✅ < 5000ms latency
- ✅ Monitored 24/7

---

## 🚀 Bắt Đầu Ngay

### Hôm nay:
```bash
1. Đọc: phases/ROADMAP.md
2. Đọc: phases/phase-00-baseline-validation.md
3. Làm: Build Steps của Phase 00
4. Chạy: Test Now của Phase 00
5. Commit: git commit -m "Phase 00: Baseline validation passed"
```

### Mỗi ngày:
```bash
1. Mở phase file hiện tại
2. Làm Build Steps
3. Chạy Test Now
4. Check Exit Criteria
5. Commit
6. → Phase tiếp theo
```

---

## ⚠️ Avoid These (Tuyệt đối không)

❌ Skip Phase 00 vì "biết rồi"  
❌ Gộp 2 phases vào 1 để "nhanh"  
❌ Accumulate uncommitted changes  
❌ "Test lát rồi làm" (phải TEST NGAY)  
❌ Skip integration test  
❌ Deploy 100% users vào ngay (phải gradual)  

---

## 📝 Cách Sử Dụng Tài Liệu

Mỗi phase file là **self-contained**:
- Đọc từ trên xuống
- Làm Build Steps chính xác
- Copy-paste code nếu cần
- Chạy test scripts
- Verify Exit Criteria

**Nếu bị stuck:**
1. Re-read phase file từ đầu
2. Kiểm tra "If Tests Fail" section
3. So sánh code với test expectations
4. Xem phase trước (nó là dependency)

---

## 🎁 Output của Each Phase

| Phase | Output |
|-------|--------|
| 00 | BASELINE_ARCHITECTURE.md |
| 01 | TOOLS array +1 tool |
| 02 | executeToolCall handler |
| 03 | Controller case + DESC sort |
| 04 | Integration test results |
| 05 | Feature flag + dashboard + alerts |

---

## 💡 Tại Sao Cách Này?

### Single Mode (hiện tại)
```
AI: search → result → edit → result → verify → done
Iterations: ~5 cho 1-2 edits
Tokens: High
```

### Patch Mode (mới)
```
AI: search all → collect patches → apply_patches → verify → done
Iterations: ~2 cho 3+ independent edits
Tokens: 40-60% savings
```

### Hybrid (Goal)
```
AI sẽ chọn:
- Single Mode: Edits dependent OR file nhỏ
- Patch Mode: Edits independent AND file lớn
```

---

## 📞 Nếu Cần Giúp

| Vấn đề | Hành động |
|--------|----------|
| Test fail | Đọc "If Tests Fail" section trong phase |
| Code không hiểu | Re-read Build Steps, so sánh với test |
| Architecture unclear | Đọc Scope section, re-read dependency |
| Stuck > 30 min | Ask for pair programming |

---

## ✨ Sau Khi Hoàn Thành

- Phase 1 giảm 40-60% tokens cho batch edits
- AI thông minh hơn (biết khi nào dùng patch)
- Users thấy latency giảm ~50%
- Zero data loss → confidence cao

---

**Ready? Open `/phases/ROADMAP.md` now! 🚀**

(Nếu chưa, re-read section "Bắt Đầu Ngay")
