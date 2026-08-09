export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug: (obj: unknown, msg?: string) => void;
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
  child: (bindings: Record<string, unknown>) => Logger;
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function emit(level: LogLevel, min: LogLevel, obj: unknown, msg?: string): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[min]) return;
  const line = JSON.stringify({
    level,
    time: new Date().toISOString(),
    msg: msg ?? undefined,
    ...(typeof obj === 'object' && obj !== null ? (obj as object) : { value: obj }),
  });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export function createLogger(level: string = 'info', bindings: Record<string, unknown> = {}): Logger {
  const min = (['debug', 'info', 'warn', 'error'].includes(level) ? level : 'info') as LogLevel;
  const wrap =
    (lvl: LogLevel) =>
    (obj: unknown, msg?: string): void => {
      emit(lvl, min, { ...bindings, ...(typeof obj === 'object' && obj ? obj : { value: obj }) }, msg);
    };

  return {
    debug: wrap('debug'),
    info: wrap('info'),
    warn: wrap('warn'),
    error: wrap('error'),
    child(next) {
      return createLogger(level, { ...bindings, ...next });
    },
  };
}
