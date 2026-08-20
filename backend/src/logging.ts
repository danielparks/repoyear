// Logging.

export enum Level {
  Silent = -1,
  Error = 0,
  Warning = 1,
  Info = 2,
}

export interface Logger {
  error(message: string): void;
  warn(message: string): void;
  info(message: string): void;
}

/** A logger that writes to stderr, filtered by `level`. */
export function createLogger(level: Level): Logger {
  const write = (messageLevel: Level, tag: string, message: string) => {
    if (messageLevel <= level) {
      console.error(`${tag} ${message}`);
    }
  };
  return {
    error: (message) => write(Level.Error, "ERROR", message),
    warn: (message) => write(Level.Warning, "WARN", message),
    info: (message) => write(Level.Info, "INFO", message),
  };
}
