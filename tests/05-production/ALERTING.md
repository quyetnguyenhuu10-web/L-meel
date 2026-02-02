# Phase 05.3: Alerting Rules & Response Playbooks

## Tổng Quan
Hệ thống alerting cho batch patch system trong production. Định nghĩa CRITICAL, WARNING, INFO alerts với response procedures.

**Nguyên tắc:**
- CRITICAL: Stop, notify team immediately, manual intervention needed
- WARNING: Monitor trend, prepare to act
- INFO: Log for audit trail

---

## Alert Definitions

### CRITICAL Alerts (Page Oncall)

#### 1. INVARIANT_VIOLATION_DETECTED
```
Name: invariant_violation_detected
Severity: CRITICAL
Threshold: Any violation (count ≥ 1)
Duration: Immediate (1 occurrence = alert)
Channel: PagerDuty (page oncall), Slack #alerts-critical

Condition:
- Monitor invariants.total_violations counter
- Alert triggered when ANY invariant is violated

Possible Causes:
- Bug in INVARIANT_ENFORCER.js (should never happen)
- Corrupted patch data from user
- Race condition in execution

Response Playbook:
1. [0-5min] Acknowledge alert in PagerDuty
2. [5min] Check FAILURE_MODEL.md recovery procedure #1
3. [10min] Query logs: grep "InvariantViolation" app.log
4. [15min] Identify which invariant failed (1-7)
5. [20min] Decision: Skip batch (rollback) or manual fix
6. [30min] Post incident in #batch-patches-incidents
7. [1h] Root cause analysis + preventive fix
```

#### 2. ERROR_RATE_CRITICAL
```
Name: error_rate_critical
Severity: CRITICAL
Threshold: Error rate > 20% (over 5min window)
Duration: 5 minutes
Channel: PagerDuty + Slack

Condition:
- (metrics.batches.failed / metrics.batches.total) > 0.20
- Evaluated every 1 minute, alert if true for 5min window

Possible Causes:
- Feature flag enabled for bad code path
- Invalid user data → batch fails normalization
- System resource exhaustion (memory, CPU)

Response Playbook:
1. [0-2min] Disable batch-patches-v1 feature flag
2. [2-5min] Check recent deployments
3. [5-10min] Analyze error logs for pattern
4. [10-20min] Rollback if deployment-related
5. [20-30min] Contact affected users if needed
6. [30min] Post-mortem + fix
```

#### 3. MEMORY_LEAK_DETECTED
```
Name: memory_leak_detected
Severity: CRITICAL
Threshold: memory_peak_mb increasing steadily
Duration: Check over 30min window

Condition:
- Take 10 samples of memory_current_mb over 30min
- If linear trend upward with slope > 1MB/5min
- Alert triggered

Possible Causes:
- Event listener not cleaned up
- Large strings accumulating in history
- Unreleased file handles in observability

Response Playbook:
1. [0-5min] Check eventLog size in ProductionMonitor
2. [5-10min] Reduce maxEventLog to 100 (temporary)
3. [10-15min] Check LOGGER.js child context stack
4. [15-30min] Profile memory with node --inspect
5. [30min] Fix + restart service
```

---

### WARNING Alerts (Investigate, Don't Page)

#### 1. SLOW_BATCH_DETECTED
```
Name: slow_batch_detected
Severity: WARNING
Threshold: Any single batch > 1000ms
Duration: Immediate
Channel: Slack #alerts-warnings

Condition:
- metrics.performance.total_latency_ms > 1000ms
- Check every batch result

Possible Causes:
- Large snapshot (> 10,000 lines)
- Many patches (> 500 in single batch)
- System under load
- Network I/O in executor

Response Playbook:
1. Observe trend in dashboard
2. If recurring for same user: contact for optimization
3. If system-wide: check resource usage (CPU, disk I/O)
4. Consider batching strategy (smaller batches)
```

#### 2. ERROR_RATE_WARNING
```
Name: error_rate_warning
Severity: WARNING
Threshold: Error rate > 5% (over 10min window)
Duration: 10 minutes
Channel: Slack #alerts-warnings

Condition:
- (metrics.batches.failed / metrics.batches.total) > 0.05
- Evaluated every 1 minute

Possible Causes:
- Feature flag not fully enabled (partial rollout)
- Edge case in data (rare pattern)
- Degraded normalization (performance issue)

Response Playbook:
1. Monitor next 10 batches for improvement
2. If trend continues: investigate error logs
3. Check feature flag percentage (should match plan)
4. If legitimate: document as known edge case
```

#### 3. HIGH_VIOLATION_RATE
```
Name: high_violation_rate
Severity: WARNING
Threshold: invariant_violations > 10 per hour
Duration: 1 hour window
Channel: Slack #alerts-warnings

Condition:
- Count violations in 1-hour window
- If > 10: alert (but system keeps working, non-fatal)

Possible Causes:
- User sending malformed patches
- Edge case pattern becoming popular
- Semantic coupling in user data

Response Playbook:
1. Review violation logs by type
2. If one invariant dominates: focus there
3. Document edge case for user education
4. Consider gradual feature flag scaling
```

---

### INFO Alerts (Logging Only)

#### 1. BATCH_PERFORMANCE_METRICS
```
Name: batch_performance_metrics
Severity: INFO
Frequency: Every 100 batches or 1 hour
Channel: CloudWatch, Prometheus scrape (no Slack)

Content:
- Average latency (ms)
- P95, P99 latencies
- Success rate (%)
- Throughput (batches/sec)

Purpose:
- Trend analysis
- SLO tracking
- Capacity planning
```

#### 2. FEATURE_FLAG_STATE_CHANGE
```
Name: feature_flag_state_change
Severity: INFO
Frequency: On each change
Channel: CloudWatch, Slack #ops

Content:
- flag name
- old percentage
- new percentage
- who changed it (if available)

Purpose:
- Audit trail for rollout
- Understand deployment waves
```

#### 3. GRACEFUL_DEGRADATION_ACTIVATED
```
Name: graceful_degradation_activated
Severity: INFO
Frequency: On activation
Channel: CloudWatch, Slack #ops

Content:
- Reason (which circuit breaker tripped)
- Impact (feature disabled, fallback mode)
- Recovery action (auto or manual)

Purpose:
- Document system state transitions
```

---

## Monitoring Dashboards

### Real-Time Dashboard (Grafana)
```
Row 1: System Health
  - Error Rate (%) [red zone > 10%]
  - Success Rate (%)
  - Batch Latency (ms) [p50, p95, p99]
  - Memory Usage (MB)

Row 2: Feature Flags
  - batch-patches-v1 percentage
  - Enabled users (%)
  - Rollout progress timeline

Row 3: Operation Distribution
  - REPLACE count
  - INSERT count
  - DELETE count

Row 4: Invariant Health
  - Total violations (counter)
  - Violations by type (stacked bar)
  - Top 5 violation sources (by user/feature)

Row 5: Layer Performance
  - SEMANTICS layer latency
  - NORMALIZER layer latency
  - EXECUTOR layer latency
  - Full pipeline latency
```

### Alerting Dashboard (PagerDuty + Slack)
```
Top Section:
- Current incident status (if any)
- Last CRITICAL alert
- Next on-call rotation

Middle Section:
- Last 24h alerts (with resolution time)
- Alert response times by severity

Bottom Section:
- Historical alert trends
- False positive rate (alerts resolved without action)
```

---

## Alert Tuning

### Phase 1: Discovery (First Week)
- All thresholds set conservatively (wide)
- Log all alerts, observe patterns
- No pages to oncall yet (INFO/WARNING only)

### Phase 2: Baseline (Week 2-3)
- Establish baseline metrics from Phase 1 data
- Tune thresholds based on actual behavior
- Enable CRITICAL alerts with manual ack first

### Phase 3: Production (Week 4+)
- Full automation with PagerDuty pages
- Regular alert review (weekly)
- Tune based on false positive rate target: < 5%

---

## Response SLOs

| Alert Severity | Ack Time | Resolution Time | Escalation |
|---|---|---|---|
| CRITICAL | 5 min | 30 min | Page oncall → Manager |
| WARNING | 15 min | 2 hours | Slack → Manager if unresolved |
| INFO | N/A (async) | N/A | Audit trail only |

---

## Testing Alerting

### Manual Test Procedures

#### Test CRITICAL Alert
```bash
# Simulate invariant violation
# In test-phase-05-integration.js, force violation
# Verify alert fires in < 1 second
```

#### Test ERROR_RATE_CRITICAL
```bash
# Record 10 failed batches in a row
# Verify alert fires after 5min window
# Verify disabling flag stops alert
```

#### Test SLOW_BATCH_DETECTED
```bash
# Record batch with duration > 1000ms
# Verify WARNING alert in Slack within 1min
```

### Automated Test Schedule
- Weekly: Inject synthetic failure, verify alert
- Monthly: Full chaos test, verify alerting + response
- Quarterly: Audit alert thresholds against actual metrics

---

## Escalation & Runbooks

### Primary Oncall (Engineering)
- Response time: 5 minutes
- Authority: Can disable feature flag, restart service
- Responsibility: Incident commander, post-mortem owner

### Secondary Oncall (Manager)
- Response time: 15 minutes (escalated from primary)
- Authority: Can authorize rollback, customer comms
- Responsibility: Business decision-making

### Post-Incident
- All CRITICAL alerts → incident post-mortem within 24h
- Root cause analysis
- Prevention: Change code, monitoring, or process
- Communicate timeline + fix to stakeholders

---

## Prometheus Scrape Config

```yaml
# prometheus.yml
global:
  scrape_interval: 30s
  evaluation_interval: 30s

scrape_configs:
  - job_name: 'batch-patches'
    static_configs:
      - targets: ['localhost:9090']
    metrics_path: '/metrics'
    scrape_timeout: 5s

# Alerting rules (alert-rules.yml)
groups:
  - name: batch-patches
    rules:
      - alert: InvariantViolation
        expr: increase(invariant_violations_total[5m]) > 0
        for: 0m
        labels:
          severity: critical

      - alert: HighErrorRate
        expr: (increase(batch_patches_total{status="failed"}[5m]) / increase(batch_patches_total[5m])) > 0.2
        for: 5m
        labels:
          severity: critical

      - alert: SlowBatch
        expr: batch_duration_ms{quantile="p99"} > 1000
        for: 1m
        labels:
          severity: warning
```

---

## Implementation Timeline

**Phase 05.3 Deliverables:**
- ✅ ALERTING.md specification (this file)
- Alert definition templates (8 total)
- Monitoring dashboard layout
- Response playbooks for each alert
- Prometheus scrape configuration
- Testing procedures

**Integration in Phase 05.5:**
- Hook MONITORING.js into alerting infrastructure
- Test all alert paths (simulated)
- Verify PagerDuty/Slack integration
- Validate response times

---

## Future Enhancements

1. **Smart Alerting** (Phase 06)
   - Anomaly detection (machine learning)
   - Auto-detect new patterns
   - Reduce false positives

2. **Correlation Engine** (Phase 06)
   - Link related alerts
   - Show root cause chain
   - One alert per incident (not cascade)

3. **Predictive Scaling** (Phase 06)
   - Forecast resource needs
   - Alert before threshold breached
   - Auto-scale infrastructure

---

## Sign-Off
- ✅ Specification: Complete
- ✅ Severity levels: Defined
- ✅ Response procedures: Documented
- ✅ Testing strategy: Ready
- ⏳ Implementation: Phase 05.5 integration tests
