// LOGGER.js - Structured logging for batch patch system

/**
 * Simple structured logger for all 3 layers
 * Logs go to console (development) or stdout (production)
 */
class Logger {
  constructor(options = {}) {
    this.level = options.level || 'INFO';
    this.format = options.format || 'json'; // 'json' or 'text'
    this.batchId = options.batchId || 'unknown';
    this.enableTimestamp = options.enableTimestamp !== false;
  }

  // Log levels: 0=DEBUG, 1=INFO, 2=WARN, 3=ERROR
  static LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };

  shouldLog(level) {
    return Logger.LEVELS[level] >= Logger.LEVELS[this.level];
  }

  formatOutput(level, context, message) {
    if (this.format === 'json') {
      return JSON.stringify({
        timestamp: this.enableTimestamp ? new Date().toISOString() : undefined,
        level,
        batchId: this.batchId,
        layer: context?.layer,
        message,
        ...context
      });
    } else {
      // Text format
      const ts = this.enableTimestamp ? `[${new Date().toISOString()}]` : '';
      const layer = context?.layer ? `[${context.layer}]` : '';
      const ctx = Object.keys(context || {})
        .filter(k => k !== 'layer')
        .map(k => `${k}=${JSON.stringify(context[k])}`)
        .join(' ');
      return `${ts} [${level}] ${layer} ${message} ${ctx}`.trim();
    }
  }

  debug(context, message) {
    if (!this.shouldLog('DEBUG')) return;
    console.log(this.formatOutput('DEBUG', context, message));
  }

  info(context, message) {
    if (!this.shouldLog('INFO')) return;
    console.log(this.formatOutput('INFO', context, message));
  }

  warn(context, message) {
    if (!this.shouldLog('WARN')) return;
    console.warn(this.formatOutput('WARN', context, message));
  }

  error(context, message) {
    if (!this.shouldLog('ERROR')) return;
    console.error(this.formatOutput('ERROR', context, message));
  }

  // Create child logger with additional context
  child(additionalContext = {}) {
    const child = new Logger({
      level: this.level,
      format: this.format,
      batchId: this.batchId,
      enableTimestamp: this.enableTimestamp
    });
    child.additionalContext = additionalContext;
    child.parent = this;
    
    const originalFormat = child.formatOutput.bind(child);
    child.formatOutput = (level, context, message) => {
      const merged = { ...this.additionalContext, ...context };
      return originalFormat(level, merged, message);
    };
    return child;
  }
}

module.exports = Logger;
