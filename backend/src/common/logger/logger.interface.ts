export interface LoggerWriteOptions {
  format?: 'json' | 'pretty';
  sinks?: {
    console?: boolean;
    database?: boolean;
  };
}

export interface Logger {
  debug(message: string, metadata?: Record<string, unknown>, options?: LoggerWriteOptions): void;
  info(message: string, metadata?: Record<string, unknown>, options?: LoggerWriteOptions): void;
  warn(message: string, metadata?: Record<string, unknown>, options?: LoggerWriteOptions): void;
  error(message: string, metadata?: Record<string, unknown>, options?: LoggerWriteOptions): void;
  fatal(message: string, metadata?: Record<string, unknown>, options?: LoggerWriteOptions): void;
}