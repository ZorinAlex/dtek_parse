/* Tiny logger with leveled output */
type LogLevel = "info" | "warn" | "error" | "debug";

const levelOrder: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const currentLevel =
  (process.env.LOG_LEVEL as LogLevel | undefined) ?? "info";

function shouldLog(level: LogLevel): boolean {
  return levelOrder[level] <= levelOrder[currentLevel];
}

function format(level: LogLevel, message: string): string {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [${level.toUpperCase()}] ${message}`;
}

export const logger = {
  info: (message: string): void => {
    if (shouldLog("info")) {
      console.log(format("info", message));
    }
  },
  warn: (message: string): void => {
    if (shouldLog("warn")) {
      console.warn(format("warn", message));
    }
  },
  error: (message: string, error?: unknown): void => {
    if (shouldLog("error")) {
      console.error(format("error", message), error ?? "");
    }
  },
  debug: (message: string): void => {
    if (shouldLog("debug")) {
      console.debug(format("debug", message));
    }
  },
};

