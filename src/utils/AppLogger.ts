import fs from 'fs';
import path from 'path';

type LogLevel = 'INFO' | 'WARN' | 'ERROR';

export class AppLogger {
  private static readonly maxSize = 300 * 1024 * 1024;
  private static readonly logDir = path.join(process.cwd(), 'logs');
  private static readonly logFile = path.join(AppLogger.logDir, 'APP.log');

  private static ensureLogFile() {
    if (!fs.existsSync(AppLogger.logDir)) {
      fs.mkdirSync(AppLogger.logDir, { recursive: true });
    }
    if (!fs.existsSync(AppLogger.logFile)) {
      fs.writeFileSync(AppLogger.logFile, '');
    }
  }

  private static rotateIfNeeded() {
    try {
      const stats = fs.statSync(AppLogger.logFile);
      if (stats.size >= AppLogger.maxSize) {
        fs.writeFileSync(AppLogger.logFile, '');
      }
    } catch {
    }
  }

  private static write(level: LogLevel, message: string, meta?: unknown) {
    try {
      AppLogger.ensureLogFile();
      AppLogger.rotateIfNeeded();

      const timestamp = new Date().toISOString();
      const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
      const line = `[${timestamp}] [${level}] ${message}${metaStr}\n`;
      fs.appendFileSync(AppLogger.logFile, line);
    } catch {
    }
  }

  static info(message: string, meta?: unknown) {
    AppLogger.write('INFO', message, meta);
  }

  static warn(message: string, meta?: unknown) {
    AppLogger.write('WARN', message, meta);
  }

  static error(message: string, meta?: unknown) {
    AppLogger.write('ERROR', message, meta);
  }
}

