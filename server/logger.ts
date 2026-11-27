import fs from 'node:fs';
import path from 'node:path';
import { nowIso } from '../shared/dates.js';
import { config } from './config.js';

export function logApp(level: 'INFO' | 'WARN' | 'ERROR', message: string, detail?: unknown): void {
  const timestamp = nowIso();
  let extra = '';
  if (detail !== undefined) {
    if (detail instanceof Error) {
      extra = ` | ${detail.message}${detail.stack ? `\n${detail.stack}` : ''}`;
    } else if (typeof detail === 'string') {
      extra = ` | ${detail}`;
    } else {
      try {
        extra = ` | ${JSON.stringify(detail)}`;
      } catch {
        extra = ` | ${String(detail)}`;
      }
    }
  }
  const line = `[${timestamp}] [${level}] ${message}${extra}\n`;
  try {
    fs.mkdirSync(path.dirname(config.logPath), { recursive: true });
    fs.appendFileSync(config.logPath, line, 'utf8');
  } catch {
    // ignore logging failure
  }
}

