/**
 * API Logger Service
 * Tracks API calls, responses, and errors for debugging
 */

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success' | 'debug';
  category: 'api' | 'tonic' | 'meta' | 'tiktok' | 'ai' | 'system' | 'email' | 'ad-rules' | 'cron';
  message: string;
  details?: any;
  duration?: number;
}

class Logger {
  private logs: LogEntry[] = [];
  private maxLogs = 500; // Keep last 500 logs

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }

  log(
    level: LogEntry['level'],
    category: LogEntry['category'],
    message: string,
    details?: any,
    duration?: number
  ) {
    const entry: LogEntry = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      details,
      duration,
    };

    this.logs.unshift(entry);

    // Keep only last maxLogs entries
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(0, this.maxLogs);
    }

    // Also log to console with appropriate method
    const consoleMessage = `[${category.toUpperCase()}] ${message}`;
    switch (level) {
      case 'error':
        console.error(consoleMessage, details || '');
        break;
      case 'warn':
        console.warn(consoleMessage, details || '');
        break;
      case 'success':
        console.log(`✅ ${consoleMessage}`, details || '');
        break;
      case 'debug':
        if (process.env.NODE_ENV === 'development') {
          console.log(`🔍 ${consoleMessage}`, details || '');
        }
        break;
      default:
        console.log(consoleMessage, details || '');
    }

    return entry;
  }

  info(category: LogEntry['category'], message: string, details?: any, duration?: number) {
    return this.log('info', category, message, details, duration);
  }

  success(category: LogEntry['category'], message: string, details?: any, duration?: number) {
    return this.log('success', category, message, details, duration);
  }

  warn(category: LogEntry['category'], message: string, details?: any, duration?: number) {
    return this.log('warn', category, message, details, duration);
  }

  error(category: LogEntry['category'], message: string, details?: any) {
    return this.log('error', category, message, details);
  }

  debug(category: LogEntry['category'], message: string, details?: any) {
    return this.log('debug', category, message, details);
  }

  getLogs(options?: {
    limit?: number;
    category?: LogEntry['category'];
    level?: LogEntry['level'];
  }): LogEntry[] {
    let filtered = this.logs;

    if (options?.category) {
      filtered = filtered.filter((log) => log.category === options.category);
    }

    if (options?.level) {
      filtered = filtered.filter((log) => log.level === options.level);
    }

    if (options?.limit) {
      filtered = filtered.slice(0, options.limit);
    }

    return filtered;
  }

  clear() {
    this.logs = [];
    console.log('[LOGGER] Logs cleared');
  }

  getStats() {
    const stats = {
      total: this.logs.length,
      byLevel: {
        info: 0,
        warn: 0,
        error: 0,
        success: 0,
        debug: 0,
      },
      byCategory: {
        api: 0,
        tonic: 0,
        meta: 0,
        tiktok: 0,
        ai: 0,
        system: 0,
        email: 0,
        'ad-rules': 0,
        cron: 0,
      },
    };

    this.logs.forEach((log) => {
      stats.byLevel[log.level]++;
      stats.byCategory[log.category]++;
    });

    return stats;
  }
}

// Export singleton instance
export const logger = new Logger();
export default logger;
