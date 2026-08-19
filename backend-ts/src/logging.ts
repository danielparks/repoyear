// Logging.

export enum Level {
  Silent = -1,
  Error = 0,
  Warning = 1,
  Info = 2,
  Debug = 3,
  Trace = 4,
}

export interface Logger {
  error(message: string): void;
  warn(message: string): void;
  info(message: string): void;
  debug(message: string): void;
  trace(message: string): void;
}

/** Turn a `-v` count (0-3) into a log level, matching the Rust CLI's scheme. */
export function levelFromVerbosity(verbose: number): Level {
  switch (verbose) {
    case 0:
      return Level.Warning;
    case 1:
      return Level.Info;
    case 2:
      return Level.Debug;
    case 3:
      return Level.Trace;
    default:
      throw new Error("-v is only allowed up to 3 times.");
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
    debug: (message) => write(Level.Debug, "DEBUG", message),
    trace: (message) => write(Level.Trace, "TRACE", message),
  };
}
