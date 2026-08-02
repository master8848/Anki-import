import type { LogLevel } from "@anki-xml/utils";

const LEVEL_ORDER: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

export interface LoggerOptions {
  level?: LogLevel;
  quiet?: boolean;
  verbose?: boolean;
  debug?: boolean;
}

export class Logger {
  private level: LogLevel;

  constructor(opts: LoggerOptions = {}) {
    if (opts.debug) this.level = "debug";
    else if (opts.quiet) this.level = "error";
    else if (opts.verbose) this.level = "debug";
    else this.level = opts.level ?? "info";
  }

  private emit(level: LogLevel, msg: string): void {
    if (LEVEL_ORDER[level] > LEVEL_ORDER[this.level]) return;
    const out = level === "error" || level === "warn" ? process.stderr : process.stdout;
    out.write(`${msg}\n`);
  }

  error(msg: string): void {
    this.emit("error", msg);
  }

  warn(msg: string): void {
    this.emit("warn", msg);
  }

  info(msg: string): void {
    this.emit("info", msg);
  }

  debug(msg: string): void {
    this.emit("debug", msg);
  }
}

export function createLogger(opts: LoggerOptions = {}): Logger {
  return new Logger(opts);
}
