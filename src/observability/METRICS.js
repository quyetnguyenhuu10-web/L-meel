// METRICS.js - Metrics collection for batch patch system

/**
 * Simple metrics collector for latency, counts, and gauges
 */
class Metrics {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.counters = {};
    this.gauges = {};
    this.histograms = {};
    this.timers = {};
  }

  // Counters - track discrete events
  increment(name, value = 1, tags = {}) {
    if (!this.enabled) return;
    const key = this.makeKey(name, tags);
    this.counters[key] = (this.counters[key] || 0) + value;
  }

  getCounter(name, tags = {}) {
    const key = this.makeKey(name, tags);
    return this.counters[key] || 0;
  }

  // Gauges - current state
  setGauge(name, value, tags = {}) {
    if (!this.enabled) return;
    const key = this.makeKey(name, tags);
    this.gauges[key] = value;
  }

  getGauge(name, tags = {}) {
    const key = this.makeKey(name, tags);
    return this.gauges[key];
  }

  // Histograms - distributions and latencies
  recordHistogram(name, value, tags = {}) {
    if (!this.enabled) return;
    const key = this.makeKey(name, tags);
    if (!this.histograms[key]) {
      this.histograms[key] = [];
    }
    this.histograms[key].push(value);
  }

  getHistogram(name, tags = {}) {
    const key = this.makeKey(name, tags);
    const values = this.histograms[key] || [];
    if (values.length === 0) return null;
    return {
      count: values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      avg: values.reduce((a, b) => a + b, 0) / values.length,
      sum: values.reduce((a, b) => a + b, 0)
    };
  }

  // Timers - measure latency
  startTimer() {
    return process.hrtime.bigint();
  }

  endTimer(name, startTime, tags = {}) {
    if (!this.enabled || !startTime) return;
    const endTime = process.hrtime.bigint();
    const duration = Number(endTime - startTime) / 1_000_000; // ms
    this.recordHistogram(name, duration, tags);
    return duration;
  }

  makeKey(name, tags = {}) {
    if (Object.keys(tags).length === 0) return name;
    const tagStr = Object.entries(tags)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
    return `${name}{${tagStr}}`;
  }

  // Get all metrics as object
  getAll() {
    return {
      counters: this.counters,
      gauges: this.gauges,
      histograms: Object.entries(this.histograms).reduce((acc, [key, values]) => {
        acc[key] = this.getHistogram(key.split('{')[0], {});
        return acc;
      }, {})
    };
  }

  // Reset all metrics
  reset() {
    this.counters = {};
    this.gauges = {};
    this.histograms = {};
    this.timers = {};
  }

  // Format for display
  summary() {
    const summary = [];
    summary.push('=== METRICS SUMMARY ===');
    
    if (Object.keys(this.counters).length > 0) {
      summary.push('\nCounters:');
      Object.entries(this.counters).forEach(([key, value]) => {
        summary.push(`  ${key}: ${value}`);
      });
    }

    if (Object.keys(this.gauges).length > 0) {
      summary.push('\nGauges:');
      Object.entries(this.gauges).forEach(([key, value]) => {
        summary.push(`  ${key}: ${value}`);
      });
    }

    if (Object.keys(this.histograms).length > 0) {
      summary.push('\nHistograms:');
      Object.entries(this.histograms).forEach(([key, values]) => {
        if (values.length > 0) {
          const stats = this.getHistogram(key.split('{')[0]);
          summary.push(`  ${key}:`);
          summary.push(`    count: ${stats.count}, min: ${stats.min.toFixed(2)}ms, max: ${stats.max.toFixed(2)}ms, avg: ${stats.avg.toFixed(2)}ms`);
        }
      });
    }

    return summary.join('\n');
  }
}

module.exports = Metrics;
