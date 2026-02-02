# Phase 05.4: Production Deployment Plan

## Executive Summary

**Target:** Deploy batch patch system (v1.0.0) to production using **gradual rollout**.

**Strategy:** Canary deployment with 4 waves (10% → 25% → 50% → 100%) over 8 days.

**Risk Mitigation:** Feature flags + real-time monitoring + instant rollback capability.

**Estimated Downtime:** 0 (zero-downtime deployment).

---

## Pre-Deployment Checklist

### Code Quality (Week -2)
- [ ] All phases 00-E complete and tested (95+ tests, 100% pass)
- [ ] Code review completed (2+ reviewers)
- [ ] Security audit passed (no hardcoded secrets, no SQL injection, etc)
- [ ] Performance baseline established (< 5ms per 500 patches)
- [ ] Documentation complete (README.md, API_REFERENCE.md)

### Infrastructure Readiness (Week -1)
- [ ] Prometheus + Grafana deployed and configured
- [ ] PagerDuty integration active
- [ ] Slack #alerts-critical + #alerts-warnings channels ready
- [ ] Database backups automated (if using persistent storage)
- [ ] Logging aggregation (CloudWatch / ELK) ready
- [ ] DNS / Load balancer configured for canary traffic splitting

### Team Preparation (Week -1)
- [ ] Oncall rotation scheduled for deployment week
- [ ] Response runbooks reviewed by team
- [ ] Incident commander identified for each wave
- [ ] Customer communication plan written (if applicable)
- [ ] Rollback procedure tested (at least once)

### Stakeholder Approval (Week -1)
- [ ] Product manager: Feature readiness sign-off
- [ ] Security: CISO approval
- [ ] Operations: Infrastructure readiness
- [ ] Legal (if applicable): Data privacy review

---

## Deployment Architecture

### Current State (Pre-Deployment)
```
User Requests
     ↓
[Legacy System] ← 100% traffic
     ↓
Response
```

### Target State (Full Rollout)
```
User Requests
     ↓
Load Balancer
  ↙         ↘
[Legacy]   [Batch Patch v1.0.0]
(0%)              (100%)
  ↘         ↙
Aggregated Response
```

### Canary Architecture (During Rollout)
```
User Requests (by traffic segment)
     ↓
Feature Flag Evaluator (batch-patches-v1)
  ↙              ↓              ↘
Control Group   Early Adopters  GA Group
(flag OFF)      (percentage P%)  (percentage 100%)
  ↓              ↓               ↓
Fallback Path   Batch Patches   Batch Patches
(Legacy)        (v1.0.0)        (v1.0.0)
```

---

## 4-Wave Rollout Strategy

### Wave 1: Internal Testing (Day 1, 10% Traffic)
**Duration:** 24 hours
**Target:** 10% internal users / staging accounts

**Go/No-Go Criteria:**
- [ ] Zero CRITICAL alerts
- [ ] Error rate < 5%
- [ ] P95 latency < 500ms
- [ ] All ALARM tests pass
- [ ] Team comfortable with monitoring

**Actions:**
1. Enable feature flag `batch-patches-v1` at 10%
2. Monitor metrics every 15min
3. Run synthetic tests (generate load with known patches)
4. Team reviews logs, acknowledges behavior

**Rollback Trigger:**
- ANY CRITICAL alert
- Error rate > 10% for > 5min
- Memory leak detected
- Customer data corruption detected

**Success Criteria:** 24h without issues → proceed to Wave 2

---

### Wave 2: Beta Users (Day 3, 25% Traffic)
**Duration:** 48 hours
**Target:** 25% of production users (beta group)

**Go/No-Go Criteria:**
- [ ] All Wave 1 criteria still met
- [ ] Zero new CRITICAL alerts
- [ ] Error rate trending down
- [ ] P99 latency acceptable
- [ ] Customer feedback positive (if applicable)

**Actions:**
1. Scale feature flag from 10% → 25%
2. Monitor metrics every 10min
3. Daily review meeting (team + stakeholders)
4. Beta user feedback collection
5. Performance metrics vs baseline

**Rollback Trigger:**
- CRITICAL alert appears
- Error rate increases > 5% from Wave 1
- Customer-reported data loss / corruption
- Performance degradation > 50%

**Success Criteria:** 48h without issues → proceed to Wave 3

---

### Wave 3: Gradual GA (Days 5-6, 50% Traffic)
**Duration:** 48 hours
**Target:** 50% of production users

**Go/No-Go Criteria:**
- [ ] All Wave 1-2 criteria still met
- [ ] No CRITICAL alerts in Wave 2
- [ ] Metrics stable or improving
- [ ] Cost analysis shows acceptable impact
- [ ] Monitoring coverage verified

**Actions:**
1. Scale feature flag from 25% → 50%
2. Monitor metrics every 5min (more frequent)
3. Daily 9am + 5pm sync with team
4. Prepare communications for remaining 50% users
5. Validate observability coverage

**Rollback Trigger:**
- Any CRITICAL alert
- Error rate > 10%
- Unexpected resource usage spike
- Customer escalations > 5

**Success Criteria:** 48h without issues → proceed to Wave 4

---

### Wave 4: Full Production (Days 7-8, 100% Traffic)
**Duration:** 48 hours (continue monitoring for 2 weeks)
**Target:** All production users

**Go/No-Go Criteria:**
- [ ] All Wave 1-3 criteria met
- [ ] Operations team confident in monitoring
- [ ] Support team trained on new system
- [ ] Documentation finalized

**Actions:**
1. Scale feature flag from 50% → 100%
2. Monitor metrics every 1-5min (very frequent)
3. Live support team standing by
4. Incident commander on standby for 48h
5. Daily post-rollout retrospective

**Rollback Trigger:**
- Any CRITICAL alert
- Multiple simultaneous customer issues
- Data integrity issues
- System performance below SLO

**Post-Wave Actions (Days 9-14):**
- Continuous monitoring (24/7 for 2 weeks)
- Performance analysis
- Cost attribution
- Document lessons learned
- Plan for optimization phase

**Success Criteria:** 14 days stable → mark as production-grade

---

## Traffic Splitting Implementation

### Method 1: Feature Flag Hash (Recommended)
```javascript
// In request handler
const userId = request.userId;
const featureFlags = new FeatureFlags();

if (featureFlags.isEnabled('batch-patches-v1', userId)) {
  // Route to new batch patch system
  return executeBatchPatches(request);
} else {
  // Route to legacy system (fallback)
  return legacyExecute(request);
}
```

**Benefits:**
- Consistent per-user (same user always gets same version)
- No infrastructure changes needed
- Instant rollback (disable flag)
- Easy to scale percentage

### Method 2: Load Balancer Rules (Alternative)
```nginx
# Nginx configuration
upstream batch_patches_new {
  server 10.0.1.10:3000;
}

upstream batch_patches_legacy {
  server 10.0.0.10:3000;
}

server {
  listen 80;
  
  location /batch-patches {
    # Route 10% to new, 90% to legacy
    if ($random_canary < 0.1) {
      proxy_pass http://batch_patches_new;
    } else {
      proxy_pass http://batch_patches_legacy;
    }
  }
}
```

**Benefits:**
- Separates new service from legacy
- Independent scaling
- Better for infrastructure monitoring

**Drawbacks:**
- More infrastructure complexity
- Harder to sync state between services

### Recommended: Hybrid Approach
- Use Feature Flag Hash (Method 1) for cost efficiency
- Have Load Balancer ready as backup

---

## Monitoring During Rollout

### Real-Time Dashboard
**Updated:** Every 10 seconds
```
┌─────────────────────────────────────┐
│  BATCH PATCHES v1.0.0 - ROLLOUT     │
├─────────────────────────────────────┤
│ Wave: 2/4 (25%)                     │
│ Time: Day 3 / 48h                   │
│ Status: 🟢 HEALTHY                  │
├─────────────────────────────────────┤
│ Error Rate:           2.3%  [⬇️ -0.5%]
│ Success Rate:        97.7%  [⬆️ +0.5%]
│ P99 Latency:        385ms  [⬇️ -15ms]
│ Memory Usage:       125 MB  [⬆️ +5MB]
│ Batches/sec:         45.2   [⬆️ +2.1]
├─────────────────────────────────────┤
│ Incidents:           0 CRITICAL
│ Alerts:              1 WARNING
│ Last Issue:          None
├─────────────────────────────────────┤
│ [CONTINUE]  [ROLLBACK]  [PAUSE]     │
└─────────────────────────────────────┘
```

### Key Metrics to Track

| Metric | Target | Warning | Critical |
|--------|--------|---------|----------|
| Error Rate | < 2% | > 5% | > 10% |
| Success Rate | > 98% | < 95% | < 90% |
| P95 Latency | < 400ms | > 600ms | > 1000ms |
| P99 Latency | < 500ms | > 800ms | > 1500ms |
| Memory (MB) | Baseline | +50% | +100% |
| CPU Usage | Baseline | +40% | +80% |
| Invariant Violations | 0 | > 5 | > 10 |

### Daily Standup Format
**Time:** 9:00 AM PT
**Attendees:** Incident Commander, Engineering Lead, DevOps, Product Manager

```
Agenda:
1. Health Status (metrics + alerts)
   - Error rate trend
   - Performance trend
   - Customer feedback (if any)
   
2. Issues & Resolutions (if any)
   - What happened
   - Root cause
   - Fix applied
   
3. Decision
   - Continue with same wave
   - Scale to next wave
   - Pause and investigate
   - Rollback
   
4. Next Actions
   - Monitoring focus areas
   - Team assignments
   - Next standup (24h later)
```

---

## Rollback Procedure

### Instant Rollback (< 30 seconds)
```bash
# Command: Disable feature flag
./deploy_tools/disable-feature-flag.sh batch-patches-v1

# Verification:
curl http://monitoring:9090/metrics | grep batch_patches_total
# Should see NO changes after this point
```

### Full Rollback (if flag fails)
```bash
# 1. Stop new service
systemctl stop batch-patches-v1

# 2. Flush caches
redis-cli FLUSHDB

# 3. Restore from last known good state
./deploy_tools/restore-snapshot.sh 2025-02-01T10:00:00Z

# 4. Verify legacy system is operational
curl http://legacy-api:3000/health
```

### Communication
- Announce in #alerts-critical
- Post status page update (if external customers)
- Notify stakeholders via email
- Schedule incident post-mortem

---

## Cost Analysis

### Resource Requirements

**New Service (Batch Patches v1.0.0):**
- 2 × t3.medium EC2 instances (for high availability)
- 50GB EBS (snapshot storage)
- 100GB S3 (backup)
- **Monthly Cost:** ~$150-200

**Monitoring Stack:**
- Prometheus (already exists)
- Grafana (already exists)
- PagerDuty (already configured)
- **Monthly Cost:** ~$0 (existing infrastructure)

### Cost-Benefit
- **Cost:** $200/month
- **Benefit:** 98%+ uptime for batch operations, zero manual intervention
- **ROI:** Break-even in 2-3 weeks

---

## Post-Deployment Tasks

### Week 1 (Immediately After Rollout)
- [ ] Document lessons learned
- [ ] Update runbooks with real-world findings
- [ ] Train support team on new system
- [ ] Establish SLA compliance baseline
- [ ] Review cost vs projected

### Week 2-4 (Optimization)
- [ ] Analyze performance bottlenecks
- [ ] Optimize hot paths
- [ ] Adjust monitoring thresholds (if needed)
- [ ] Plan Phase 06 (advanced features)

### Ongoing (Production Operations)
- [ ] Weekly alert threshold review
- [ ] Monthly cost analysis
- [ ] Quarterly security audit
- [ ] Semi-annual disaster recovery drill

---

## Success Criteria

### Rollout Success
- ✅ 100% traffic on new system
- ✅ Zero unplanned rollbacks
- ✅ All CRITICAL alerts handled < 30min
- ✅ Error rate < 2% throughout
- ✅ Customer satisfaction > 4.5/5 (if applicable)

### Production Readiness (2 weeks post-rollout)
- ✅ MTTR (Mean Time To Recovery) < 15min
- ✅ 99.9% uptime SLA maintained
- ✅ 0 data loss / corruption incidents
- ✅ Cost < $300/month
- ✅ Team confident in operations

---

## Sign-Off

### Development Lead
- [ ] All pre-deployment checks complete
- [ ] Code quality verified
- [ ] Performance baseline established

### Operations Lead
- [ ] Infrastructure ready
- [ ] Monitoring configured
- [ ] Runbooks tested

### Product Manager
- [ ] Business requirements met
- [ ] Customer communication plan ready

### Incident Commander (Designated)
- [ ] Available for all 4 waves
- [ ] Familiar with rollback procedure
- [ ] Team trained and ready

---

## Appendix

### Deployment Timeline Chart
```
Week 1:     Week 2:      Week 3:      Week 4:
Pre-Check   Wave 1(10%)  Wave 2(25%)  Wave 3(50%)  Wave 4(100%)
□□□         ▓▓▓          ▓▓▓          ▓▓▓          ████
Day -3,-2   Day 1-2      Day 3-4      Day 5-6      Day 7-8 +14d
```

### Contacts & Escalation
```
Primary Oncall (Engineering): oncall@company.com
Secondary Oncall (Manager): manager@company.com
Incident Commander: commander@company.com
Product Owner: product@company.com
Security Lead: security@company.com
```

### References
- FAILURE_MODEL.md (failure handling)
- ALERTING.md (monitoring rules)
- TỔNG_KẾT.md (system overview)
- API_REFERENCE.md (API documentation)
