import fs from 'node:fs';
import path from 'node:path';

export type FileLogger = {
  info: (message: string, details?: unknown) => void;
  error: (message: string, details?: unknown) => void;
};

function formatDetails(details?: unknown) {
  if (details === undefined) {
    return '';
  }

  try {
    return ` ${JSON.stringify(details)}`;
  } catch {
    return ` ${String(details)}`;
  }
}

export function createFileLogger(logFilePath: string): FileLogger {
  fs.mkdirSync(path.dirname(logFilePath), { recursive: true });
  const stream = fs.createWriteStream(logFilePath, { flags: 'a' });

  const write = (level: 'INFO' | 'ERROR', message: string, details?: unknown) => {
    const line = `[${new Date().toISOString()}] [${level}] ${message}${formatDetails(details)}\n`;
    stream.write(line);
  };

  return {
    info(message, details) {
      write('INFO', message, details);
    },
    error(message, details) {
      write('ERROR', message, details);
    },
  };
}
