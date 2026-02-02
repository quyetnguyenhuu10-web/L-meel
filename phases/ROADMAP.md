# 🏗️ Sequential Patch Mode - Roadmap Index

**Project:** Add Batch/Patch Mode to Sequential Agent Loop  
**Architecture Pattern:** Linear Phase Chain (no branches)  
**Status:** Ready for Execution  
**Updated:** 2 tháng 2, 2026  

---

## 📋 Phases Overview

| # | Phase | Goal | Duration | Status |
|---|-------|------|----------|--------|
| 00 | [Baseline Validation](phase-00-baseline-validation.md) | Verify current system works | 2-3h | 🟡 Ready |
| 01 | [Tool Schema](phase-01-tool-schema.md) | Add apply_patches to TOOLS array | 1-2h | 🟡 Ready |
| 02 | [Executor Handler](phase-02-executor-handler.md) | Implement tool execution logic | 2-3h | 🟡 Ready |
| 03 | [Controller Action](phase-03-controller-action.md) | Implement patch application (DESC sort) | 3-4h | 🟡 Ready |
| 04 | [Integration Test](phase-04-integration-test.md) | Test Patch Mode (single + batch edits) | 3-4h | 🟡 Ready |
| 05 | [Production Rollout](phase-05-production-rollout.md) | Deploy with monitoring & gradual rollout | 2-4 weeks | 🟡 Ready |

**Total Development Time:** ~13-19 hours  
**Total Deployment Time:** ~2-4 weeks  
**Total Project:** ~1 month start-to-finish  

---

## 🎯 Phase Dependencies

```
Phase 00 (Baseline)
    ↓ (must pass before Phase 01)
Phase 01 (Tool Schema)
    ↓ (TOOLS array reference)
Phase 02 (Executor Handler)
    ↓ (controller.execute call)
Phase 03 (Controller Action)
    ↓ (patches apply correctly)
Phase 04 (Integration Test)
    ↓ (all tests pass)
Phase 05 (Production Rollout)
    ↓ (feature flag enabled)
Maintenance + Phase 2 Planning
```

**CRITICAL:** Phases are **tightly sequential**. Phase N+1 cannot start until Phase N passes.

---

## ⚡ Quick Start

### To Begin Phase 00:
```bash
cd /path/to/project

# Open Phase 00 documentation
cat phases/phase-00-baseline-validation.md

# Follow Build Steps section
# Run Test Now section
# Verify Exit Criteria

# Commit when done
git add .
git commit -m "Phase 00: Baseline validation passed"
```

### For Each Phase:
1. Read the phase markdown file
2. Follow Build Steps exactly
3. Run Test Now immediately
4. Check Exit Criteria
5. Commit before moving to next phase
6. Document any deviations

---

## 📝 Key Principles (Non-Negotiable)

### 1. **Linear Dependency Chain**
- ✅ Must follow phases in order (00 → 01 → 02 → ...)
- ❌ Cannot skip phases
- ❌ Cannot run parallel phases
- ✅ Each phase explicitly depends on previous one

### 2. **Test Immediately**
- ✅ Run tests after each Build Step
- ✅ Commit only when tests pass
- ❌ Don't accumulate uncommitted changes
- ❌ Don't skip "Test Now" section

### 3. **Small Focused Changes**
- Each phase solves 1-2 specific problems
- Each phase touches 1-2 files
- Each phase adds < 100 lines of code
- Each phase has < 5 test cases

### 4. **Exit Criteria Are Mandatory**
- ✅ All MUST PASS items verified
- ✅ All MUST NOT items checked
- ✅ Checklist items completed
- ❌ Do not proceed if any item fails

### 5. **No Hiding Issues**
- If test fails → fix before continuing
- If unclear → re-read phase doc
- If stuck > 30 min → ask for help (don't guess)
- Document edge cases for Phase 2

---

## 🚀 Execution Checklist

### Pre-Execution (Before Phase 00)
```
□ Read entire roadmap (this file)
□ Understand linear dependency concept
□ Have access to codebase (git clone)
□ Have test environment running
□ Team aligned on timeline (1 month)
□ Understand rollback procedure
```

### During Each Phase
```
□ Open phase markdown file
□ Read Goal section (understand the "why")
□ Read Scope section (understand "what problem")
□ Follow Build Steps exactly (copy-paste if needed)
□ Run Test Now immediately (don't skip)
□ Check Exit Criteria (all items)
□ Commit with phase number (git commit -m "Phase XX: ...")
□ Move to next phase
```

### After Phase 05 (Before Phase 06)
```
□ Review test results
□ Confirm no regressions
□ Team sign-off on code quality
□ Prepare monitoring dashboard
□ Notify stakeholders of timeline
□ Prepare rollback procedure
```

### During Phase 06 (Deployment)
```
□ Week 1: Canary 10% (monitor alerts)
□ Week 2: Early Access 20-30% (collect feedback)
□ Week 3: Gradual 50% (all systems healthy?)
□ Week 4: Full 100% (remove feature flag)
□ Post-Launch: Monitor for 2 weeks
□ Document learnings for Phase 2
```

---

## 📊 Success Metrics

### Development Success (Phase 00-05)
- ✅ All tests pass
- ✅ No regressions
- ✅ Code review approved
- ✅ < 2% failure in integration tests

### Production Success (Phase 06+)
- ✅ < 5% error rate (critical)
- ✅ > 20% token savings (business goal)
- ✅ < 5000ms latency (user experience)
- ✅ > 95% patch mode success rate (reliability)

### Long-term (Phase 2 Planning)
- Token savings > 40%
- User satisfaction > 4/5
- Mode selection accuracy > 90%
- Zero data loss in 1 month

---

## 🔗 File Structure

```
project/
├── phases/
│   ├── phase-00-baseline-validation.md      ← START HERE
│   ├── phase-01-tool-schema.md
│   ├── phase-02-executor-handler.md
│   ├── phase-03-controller-action.md
│   ├── phase-04-ai-decision-logic.md
│   ├── phase-05-integration-test.md
│   ├── phase-06-production-rollout.md
│   └── ROADMAP.md                           ← You are here
│
├── tests/
│   ├── test-phase-00.js
│   ├── test-phase-01.js
│   ├── test-phase-02.js
│   ├── test-phase-03-*.js
│   ├── test-phase-04-*.js
│   ├── test-phase-05-*.js
│   └── test-phase-06-*.js
│
└── docs/
    ├── API_REFERENCE.md                    (existing)
    ├── PATCH_MODE_IMPLEMENTATION.md        (existing, Phase 1 planning)
    └── BASELINE_ARCHITECTURE.md            (output from Phase 00)
```

---

## ⚠️ Common Pitfalls (Avoid These)

❌ **Pitfall 1:** Skip Phase 00 because "we know the system works"
→ Phase 00 finds baseline issues before they cause problems

❌ **Pitfall 2:** Add multiple features in one phase
→ Harder to test, harder to debug, violates "1-2 problems per phase"

❌ **Pitfall 3:** Accumulate uncommitted changes
→ If test fails, can't revert easily. Commit per phase!

❌ **Pitfall 4:** "I'll optimize later" (in Phase 2)
→ Problems found in Phase 0-5 must be fixed now

❌ **Pitfall 5:** Skip integration testing (Phase 05)
→ Combining two working parts doesn't guarantee they work together

❌ **Pitfall 6:** Rush Phase 06 (production deployment)
→ Gradual rollout exists for a reason. Start at 10%!

---

## 🆘 If You Get Stuck

### Stuck on Phase XX Test?
1. Re-read "Test Now" section
2. Check "If Tests Fail" section
3. Verify "Exit Criteria" are what you're testing
4. Review Phase XX-1 output (what you're building on)
5. Check code for typos (copy-paste errors)
6. Look at similar tests in earlier phases

### Code Not Working as Expected?
1. Check Build Steps follow code exactly
2. Verify file paths are correct
3. Ensure required imports/requires present
4. Check function signatures match expected
5. Run tests with verbose logging
6. Compare with test code to see expected behavior

### Conceptual Confusion?
1. Re-read phase Goal section (the "why")
2. Re-read phase Scope section (the "what")
3. Check Dependency section (what you can assume)
4. Read 2-3 examples in Build Steps section
5. Cross-reference with earlier similar phases

### Still Stuck?
1. Take 15-minute break
2. Review the entire phase from top
3. Run test with debug output
4. Compare your code with test expectations
5. Ask for code review / pair programming
6. Document issue for Phase 2 (lessons learned)

---

## 📞 Support Contacts

- **Technical Issues:** Team lead / Senior engineer
- **Architecture Questions:** System design team
- **Deployment Issues:** DevOps / SRE team
- **Phase 06 Monitoring:** On-call engineer

---

## 📈 Expected Timeline

```
Week 1:
  Mon: Phase 00 (baseline) + Phase 01 (schema)
  Tue: Phase 02 (executor) + Phase 03 (controller)
  Wed: Phase 04 (AI logic)
  Thu: Phase 05 (integration)
  Fri: Code review + team sign-off

Week 2:
  Mon-Wed: Phase 06 canary (10%) + monitoring
  Thu-Fri: Fix any issues, feedback

Week 3:
  Mon-Tue: Phase 06 early access (20-30%)
  Wed-Fri: Gradual rollout (50%)

Week 4:
  Mon-Tue: Full rollout (100%)
  Wed-Fri: Post-launch monitoring
```

(Adjustable based on team size and code complexity)

---

## ✅ Final Checklist Before Starting

```
□ Team understands this is a LINEAR project
□ Each phase must pass before next starts
□ All tests must pass before committing
□ Product owner aware of 1-month timeline
□ Staging environment ready for Phase 00
□ Test environment can simulate user load
□ DevOps ready for Phase 06 deployment
□ On-call schedule prepared for Phase 06+
□ Monitoring dashboard will be set up
□ Rollback procedure documented
□ Team trained on feature flags
```

---

## 🎓 Learning Resources

- **Single Mode Architecture:** See API_REFERENCE.md
- **Patch Mode Planning:** See PATCH_MODE_IMPLEMENTATION.md
- **Tool Definition Format:** See Phase 01 Build Steps
- **Controller Pattern:** See Phase 03 Build Steps
- **Monitoring Best Practices:** See Phase 06 Build Steps

---

## 📝 Document History

- **2 tháng 2, 2026:** v1.0 - Initial roadmap created
- Next version: Post-Phase 06 lessons learned

---

## 🎉 Success State

When all phases complete successfully:

✅ Single Mode still works perfectly  
✅ Patch Mode reduces tokens by 40-60%  
✅ AI intelligently chooses between modes  
✅ All users see improvement in latency  
✅ System is monitored 24/7  
✅ Team has playbook for Phase 2  
✅ Zero data loss in production  
✅ Rollout took ~1 month  
✅ Zero critical incidents  

---

**You've got this! Start with Phase 00 now. 🚀**

Questions? Re-read this document or open the specific phase file.

Good luck!
