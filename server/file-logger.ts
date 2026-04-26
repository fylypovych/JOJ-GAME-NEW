import path from 'node:path';
import { appendFile, mkdir } from 'node:fs/promises';

export type LogLine = (level: 'INFO' | 'WARN' | 'ERROR', message: string) => Promise<void>;

export const createFileLogger = (logsPath: string): LogLine => async (level, message) => {
  const line = `[${new Date().toISOString()}] [${level}] ${message}\n`;
  try {
    await mkdir(path.dirname(logsPath), { recursive: true });
    await appendFile(logsPath, line, 'utf8');
  } catch {
    // ignore logging failures
  }
  // Only log to console in development
  if (process.env.NODE_ENV !== 'production') {
    process.stdout.write(line);
  }
};
