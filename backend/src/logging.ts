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

/** Turn a `-q` count into a log level. */
export function levelFromQuiet(quiet: number): Level {
  switch (quiet) {
    case 0:
      return Level.Info;
    case 1:
      return Level.Warning;
    case 2:
      return Level.Error;
    case 3:
      return Level.Silent;
    default:
      throw new Error("-q is only allowed up to 3 times.");
  }
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
