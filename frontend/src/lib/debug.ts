const MAX_LINES = 14;
const EMPTY: string[] = [];

let lines: string[] = EMPTY;
const listeners = new Set<() => void>();

export function logDebug(message: string) {
  const time = new Date().toISOString().slice(11, 19);
  lines = [...lines, `${time} ${message}`].slice(-MAX_LINES);
  listeners.forEach((listener) => listener());
}

export function subscribeDebug(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getDebugLines() {
  return lines;
}

export function getServerDebugLines() {
  return EMPTY;
}
