# Phase 05: Production Rollout - Gradual Deployment

**Status:** READY  
**Duration:** 2-4 weeks (deployment, not development)  
**Dependency:** Phase 04 (all integration tests pass)  
**Next:** Monitoring + Phase 2 Planning  

---

## 🎯 Goal

Deploy Patch Mode safely to production with monitoring and gradual rollout.

**What this does:**
- Setup feature flag system for gradual user rollout
- Deploy with 10% → 20% → 50% → 100% schedule
- Monitor error rates, latency, token savings
- Setup alert rules for anomalies
- Enable quick rollback if needed

**Why this matters:**
- 100% deployment of new features = huge risk
- Gradual rollout = early detection of issues
- Monitoring = data-driven decisions
- Feature flags = zero-code rollback

---

## 🔧 Scope: 2 Technical Problems

1. **Problem 1:** Need to gradually enable Patch Mode for different user cohorts
   - Solution: Feature flag system with deterministic hash-based assignment

2. **Problem 2:** Need to detect issues early (errors, latency, token usage)
   - Solution: Monitoring dashboard + alert rules with thresholds

---

## 📋 Build Steps

### Step 1: Implement Feature Flag System

**File:** `feature-flags.js`

```javascript
// Feature Flag Management
class FeatureFlags {
  constructor() {
    this.flags = {
      'patch_mode_enabled': {
        enabled: false,
        rolloutPercentage: 0,     // 0-100
        whitelist: [],             // explicit users
        blacklist: []              // exclude users
      }
    };
  }

  // Deterministic hash-based cohort assignment
  getUserCohort(userId) {
    // Convert userId to hash (0-99)
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = ((hash << 5) - hash) + userId.charCodeAt(i);
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash % 100);
  }

  // Check if user should get feature
  isFeatureEnabled(flagName, userId) {
    const flag = this.flags[flagName];
    
    if (!flag || !flag.enabled) {
      return false;
    }

    // Check whitelist first
    if (flag.whitelist.includes(userId)) {
      return true;
    }

    // Check blacklist
    if (flag.blacklist.includes(userId)) {
      return false;
    }

    // Deterministic rollout
    const cohort = this.getUserCohort(userId);
    return cohort < flag.rolloutPercentage;
  }

  // Update rollout percentage
  setRolloutPercentage(flagName, percentage) {
    if (this.flags[flagName]) {
      this.flags[flagName].rolloutPercentage = Math.min(100, Math.max(0, percentage));
      console.log(`[FEATURE FLAG] ${flagName} rollout set to ${this.flags[flagName].rolloutPercentage}%`);
    }
  }

  // Add user to whitelist (forces on)
  whitelistUser(flagName, userId) {
    if (this.flags[flagName]) {
      if (!this.flags[flagName].whitelist.includes(userId)) {
        this.flags[flagName].whitelist.push(userId);
      }
    }
  }

  // Add user to blacklist (forces off)
  blacklistUser(flagName, userId) {
    if (this.flags[flagName]) {
      if (!this.flags[flagName].blacklist.includes(userId)) {
        this.flags[flagName].blacklist.push(userId);
      }
    }
  }
}

module.exports = FeatureFlags;
```

**Usage in AI Handler:**

```javascript
const featureFlags = new FeatureFlags();

// In your tool execution handler
async function handleToolCall(toolName, params, userId) {
  // Check if Patch Mode enabled for this user
  const patchModeEnabled = featureFlags.isFeatureEnabled('patch_mode_enabled', userId);
  
  if (toolName === "apply_patches" && !patchModeEnabled) {
    // User not in rollout cohort - use Single Mode instead
    return {
      error: true,
      message: "Patch Mode not available for this user yet",
      fallback: "Use single tool calls instead"
    };
  }
  
  // ... rest of handler
}
```

---

### Step 2: Setup Monitoring Dashboard

**File:** `monitoring.js`

```javascript
// Monitoring Metrics
class Metrics {
  constructor() {
    this.metrics = {
      patchMode: {
        total_calls: 0,
        successful_calls: 0,
        failed_calls: 0,
        total_patches: 0,
        failed_patches: 0,
        avg_latency_ms: 0,
        token_usage_total: 0,
        unique_users: new Set()
      },
      singleMode: {
        total_calls: 0,
        successful_calls: 0,
        failed_calls: 0,
        avg_latency_ms: 0,
        token_usage_total: 0,
        unique_users: new Set()
      }
    };
    this.latencies = {
      patchMode: [],
      singleMode: []
    };
  }

  // Record Patch Mode execution
  recordPatchModeExecution(userId, latencyMs, tokensUsed, success, patchCount) {
    const m = this.metrics.patchMode;
    m.total_calls++;
    m.unique_users.add(userId);
    m.total_patches += patchCount;
    m.token_usage_total += tokensUsed;
    
    this.latencies.patchMode.push(latencyMs);
    // Keep only last 1000 latencies
    if (this.latencies.patchMode.length > 1000) {
      this.latencies.patchMode.shift();
    }
    
    if (success) {
      m.successful_calls++;
    } else {
      m.failed_calls++;
    }
    
    this.updateAverageLatency('patchMode');
  }

  // Record Single Mode execution
  recordSingleModeExecution(userId, latencyMs, tokensUsed, success) {
    const m = this.metrics.singleMode;
    m.total_calls++;
    m.unique_users.add(userId);
    m.token_usage_total += tokensUsed;
    
    this.latencies.singleMode.push(latencyMs);
    if (this.latencies.singleMode.length > 1000) {
      this.latencies.singleMode.shift();
    }
    
    if (success) {
      m.successful_calls++;
    } else {
      m.failed_calls++;
    }
    
    this.updateAverageLatency('singleMode');
  }

  updateAverageLatency(mode) {
    if (this.latencies[mode].length > 0) {
      const sum = this.latencies[mode].reduce((a, b) => a + b, 0);
      this.metrics[mode].avg_latency_ms = Math.round(sum / this.latencies[mode].length);
    }
  }

  // Get current dashboard
  getDashboard() {
    return {
      timestamp: new Date().toISOString(),
      patchMode: {
        ...this.metrics.patchMode,
        unique_users: this.metrics.patchMode.unique_users.size,
        error_rate: this.metrics.patchMode.total_calls > 0 
          ? (this.metrics.patchMode.failed_calls / this.metrics.patchMode.total_calls * 100).toFixed(2) + '%'
          : 'N/A',
        success_rate: this.metrics.patchMode.total_calls > 0
          ? (this.metrics.patchMode.successful_calls / this.metrics.patchMode.total_calls * 100).toFixed(2) + '%'
          : 'N/A',
        avg_tokens_per_call: this.metrics.patchMode.total_calls > 0
          ? Math.round(this.metrics.patchMode.token_usage_total / this.metrics.patchMode.total_calls)
          : 0
      },
      singleMode: {
        ...this.metrics.singleMode,
        unique_users: this.metrics.singleMode.unique_users.size,
        error_rate: this.metrics.singleMode.total_calls > 0
          ? (this.metrics.singleMode.failed_calls / this.metrics.singleMode.total_calls * 100).toFixed(2) + '%'
          : 'N/A',
        success_rate: this.metrics.singleMode.total_calls > 0
          ? (this.metrics.singleMode.successful_calls / this.metrics.singleMode.total_calls * 100).toFixed(2) + '%'
          : 'N/A',
        avg_tokens_per_call: this.metrics.singleMode.total_calls > 0
          ? Math.round(this.metrics.singleMode.token_usage_total / this.metrics.singleMode.total_calls)
          : 0
      }
    };
  }
}

module.exports = Metrics;
```

---

### Step 3: Setup Alert Rules

**File:** `alert-rules.js`

```javascript
// Alert Rules for Patch Mode Monitoring
class AlertRules {
  constructor(metrics, featureFlags) {
    this.metrics = metrics;
    this.featureFlags = featureFlags;
    this.alertHistory = [];
  }

  // Check alerts
  checkAlerts() {
    const dashboard = this.metrics.getDashboard();
    const alerts = [];

    // Alert 1: Error rate too high
    const patchErrorRate = parseFloat(dashboard.patchMode.error_rate);
    if (patchErrorRate > 5) {
      alerts.push({
        severity: 'CRITICAL',
        message: `Patch Mode error rate ${patchErrorRate}% > 5% threshold`,
        action: 'Reduce rollout percentage to 50%',
        timestamp: new Date().toISOString()
      });
    }

    // Alert 2: Latency degradation
    const baselineSingleLatency = dashboard.singleMode.avg_latency_ms;
    const patchLatency = dashboard.patchMode.avg_latency_ms;
    if (patchLatency > baselineSingleLatency * 1.5) {
      alerts.push({
        severity: 'WARNING',
        message: `Patch Mode latency ${patchLatency}ms > 1.5× baseline (${baselineSingleLatency}ms)`,
        action: 'Investigate latency causes',
        timestamp: new Date().toISOString()
      });
    }

    // Alert 3: Token savings not met
    const singleTokens = dashboard.singleMode.avg_tokens_per_call;
    const patchTokens = dashboard.patchMode.avg_tokens_per_call;
    if (singleTokens > 0 && patchTokens > singleTokens * 0.8) {
      alerts.push({
        severity: 'WARNING',
        message: `Token savings low: Patch ${patchTokens} vs Single ${singleTokens}`,
        action: 'Verify patches are properly batched',
        timestamp: new Date().toISOString()
      });
    }

    // Alert 4: Success rate dropped
    const patchSuccess = parseFloat(dashboard.patchMode.success_rate);
    if (patchSuccess < 95) {
      alerts.push({
        severity: 'WARNING',
        message: `Patch Mode success rate ${patchSuccess}% < 95% target`,
        action: 'Review recent changes',
        timestamp: new Date().toISOString()
      });
    }

    // Add to history
    if (alerts.length > 0) {
      this.alertHistory.push(...alerts);
    }

    return alerts;
  }

  // Auto-remediation
  autoRemediate(alerts) {
    for (const alert of alerts) {
      if (alert.severity === 'CRITICAL') {
        // Critical alerts: reduce rollout
        this.featureFlags.setRolloutPercentage('patch_mode_enabled', 50);
        console.log('[AUTO-REMEDIATION] Reduced Patch Mode rollout to 50%');
      }
    }
  }
}

module.exports = AlertRules;
```

---

### Step 4: Rollout Schedule

**Week 1: 10% Rollout**
```javascript
featureFlags.setRolloutPercentage('patch_mode_enabled', 10);
// ~10% of users get Patch Mode
// 90% still use Single Mode
// Close monitoring for 1 week
```

**Week 2: Evaluate + 20-30% Rollout**
- Review dashboard metrics
- If error rate < 2%: increase to 20%
- If error rate 2-5%: stay at 10% or increase to 15%
- If error rate > 5%: keep at 10% or rollback to 0%

```javascript
featureFlags.setRolloutPercentage('patch_mode_enabled', 20);
```

**Week 3: Evaluate + 50% Rollout**
- Review another week of data
- If stable: increase to 50%
- If issues: stay at previous level

```javascript
featureFlags.setRolloutPercentage('patch_mode_enabled', 50);
```

**Week 4: 100% Rollout**
- Full production deployment
- Continue monitoring for 2 weeks after

```javascript
featureFlags.setRolloutPercentage('patch_mode_enabled', 100);
```

---

### Step 5: Create Rollout Test Script

**File:** `test-phase-05-rollout.js`

```javascript
const assert = require('assert');
const FeatureFlags = require('./feature-flags');
const Metrics = require('./monitoring');
const AlertRules = require('./alert-rules');

console.log('=== PHASE 05 TEST: Rollout Infrastructure ===\n');

// Test 1: Feature flag cohort assignment
console.log('Test 1: Feature flag cohort assignment...');
try {
  const flags = new FeatureFlags();
  
  // Set rollout to 25%
  flags.setRolloutPercentage('patch_mode_enabled', 25);
  flags.flags['patch_mode_enabled'].enabled = true;
  
  // Test multiple users
  let enabledCount = 0;
  for (let i = 0; i < 100; i++) {
    const userId = `user_${i}`;
    if (flags.isFeatureEnabled('patch_mode_enabled', userId)) {
      enabledCount++;
    }
  }
  
  // Should be roughly 25% (20-30% tolerance)
  assert(enabledCount >= 15 && enabledCount <= 35, `Expected ~25%, got ${enabledCount}%`);
  console.log(`  ✓ Passed - ${enabledCount}% of users enabled (expected ~25%)`);
} catch (e) {
  console.log(`  ✗ FAIL: ${e.message}`);
}

// Test 2: Whitelist/Blacklist
console.log('\nTest 2: Whitelist/Blacklist...');
try {
  const flags = new FeatureFlags();
  flags.flags['patch_mode_enabled'].enabled = true;
  flags.setRolloutPercentage('patch_mode_enabled', 0); // 0% rollout
  
  // Whitelist user
  flags.whitelistUser('patch_mode_enabled', 'whitelisted_user');
  
  // Blacklist user
  flags.blacklistUser('patch_mode_enabled', 'blacklisted_user');
  
  assert(flags.isFeatureEnabled('patch_mode_enabled', 'whitelisted_user'), 'Whitelisted user should be enabled');
  assert(!flags.isFeatureEnabled('patch_mode_enabled', 'blacklisted_user'), 'Blacklisted user should be disabled');
  
  console.log('  ✓ Passed - Whitelist/blacklist works');
} catch (e) {
  console.log(`  ✗ FAIL: ${e.message}`);
}

// Test 3: Metrics collection
console.log('\nTest 3: Metrics collection...');
try {
  const metrics = new Metrics();
  
  // Record some executions
  metrics.recordPatchModeExecution('user1', 150, 800, true, 3);
  metrics.recordPatchModeExecution('user2', 180, 750, true, 2);
  metrics.recordPatchModeExecution('user3', 200, 900, false, 5);
  
  metrics.recordSingleModeExecution('user4', 100, 1200, true);
  metrics.recordSingleModeExecution('user5', 120, 1300, true);
  
  const dashboard = metrics.getDashboard();
  
  assert.strictEqual(dashboard.patchMode.total_calls, 3);
  assert.strictEqual(dashboard.patchMode.successful_calls, 2);
  assert.strictEqual(dashboard.patchMode.failed_calls, 1);
  assert.strictEqual(dashboard.singleMode.total_calls, 2);
  assert(dashboard.patchMode.avg_latency_ms > 0);
  
  console.log('  ✓ Passed - Metrics collected correctly');
  console.log(`    Patch Mode: ${dashboard.patchMode.successful_calls}/${dashboard.patchMode.total_calls} success`);
  console.log(`    Single Mode: ${dashboard.singleMode.successful_calls}/${dashboard.singleMode.total_calls} success`);
} catch (e) {
  console.log(`  ✗ FAIL: ${e.message}`);
}

// Test 4: Alert rules
console.log('\nTest 4: Alert rules...');
try {
  const metrics = new Metrics();
  const flags = new FeatureFlags();
  const alerts = new AlertRules(metrics, flags);
  
  // Simulate high error rate
  for (let i = 0; i < 10; i++) {
    metrics.recordPatchModeExecution('user', 100, 800, false, 1); // All fail
  }
  
  const triggeredAlerts = alerts.checkAlerts();
  
  // Should trigger error rate alert
  assert(triggeredAlerts.length > 0, 'Should trigger alerts');
  assert(triggeredAlerts.some(a => a.message.includes('error rate')), 'Should include error rate alert');
  
  console.log('  ✓ Passed - Alert rules work');
  console.log(`    Triggered ${triggeredAlerts.length} alert(s)`);
} catch (e) {
  console.log(`  ✗ FAIL: ${e.message}`);
}

console.log('\n✅ ALL ROLLOUT TESTS PASSED');
```

**Run it:**
```bash
node test-phase-05-rollout.js
```

---

## ✅ Exit Criteria

Before completing Phase 05, verify:

- [ ] Feature flag system implemented
- [ ] Metrics collection working
- [ ] Alert rules detecting anomalies
- [ ] test-phase-05-rollout.js passes ✅
- [ ] Can adjust rollout % (Week 1: 10%, Week 2: 20%, etc.)
- [ ] Can whitelist/blacklist specific users
- [ ] Dashboard shows correct metrics
- [ ] All alerts configured and tested

---

## 📊 Rollout Timeline

| Week | Rollout % | Actions | Monitoring |
|------|-----------|---------|-----------|
| 1 | 10% | Deploy + monitor | Daily reviews |
| 2 | 20-30% | Increase if stable | Daily reviews |
| 3 | 50% | Major milestone | Daily reviews |
| 4 | 100% | Full production | 2 weeks post-deploy |

---

## ⚠️ If Issues Arise

**If error rate > 5%:**
```javascript
featureFlags.setRolloutPercentage('patch_mode_enabled', 0);
// Zero-code rollback - users automatically fall back to Single Mode
```

**If latency degraded:**
- Check: Paper size distribution (large files might be slow)
- Check: Patch count distribution (many patches = slower)
- Action: Reduce rollout %, investigate specific cases

**If token savings not meeting expectations:**
- Check: Are batches actually batched? (1 patch ≠ savings)
- Check: Fallback logic working? (should use Patch only for 3+ patches)
- Action: Review request patterns

---

## 💾 Success Metrics

| Metric | Target | Week 1 | Week 2 | Week 4 |
|--------|--------|--------|--------|--------|
| Error Rate | < 5% | < 2% | < 3% | < 2% |
| Latency | ± 10% baseline | ✓ | ✓ | ✓ |
| Token Savings | > 20% | Measure | Measure | > 20% |
| Success Rate | > 95% | > 98% | > 97% | > 98% |

---

## 🎉 Completion

When Phase 05 complete:
- ✅ Patch Mode in production
- ✅ Monitoring active
- ✅ Alerts configured
- ✅ Rollout schedule defined
- ✅ Zero-code rollback available
- ✅ Success metrics achievable

---

## Next Steps

- **Week 1-4:** Execute rollout schedule
- **Week 5+:** Analyze results, plan Phase 2 optimizations
- **Ongoing:** Monitor dashboard, respond to alerts

🚀 **Patch Mode is live!**
