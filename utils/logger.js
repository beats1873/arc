import 'dotenv/config';

const LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
const MIN_LEVEL = LEVELS[process.env.LOG_LEVEL?.toUpperCase()] ?? LEVELS.INFO;

// In-memory ring buffer — last 500 lines, readable by the dashboard
const MAX_LINES = 500;
const logBuffer = [];

export function getLogBuffer() {
  return logBuffer.slice();
}

function format(level, tag, msg, extra) {
  const ts = new Date().toISOString();
  const base = `[${ts}] [${level}] [${tag}] ${msg}`;
  if (!extra) return base;
  if (extra instanceof Error) return `${base}\n  ${extra.stack ?? extra.message}`;
  if (typeof extra === 'object') {
    try { return `${base}\n  ${JSON.stringify(extra)}`; } catch { /* circular */ }
  }
  return `${base}\n  ${extra}`;
}

function log(level, tag, msg, extra) {
  if (LEVELS[level] < MIN_LEVEL) return;
  const line = format(level, tag, msg, extra);

  // Write to stdout/stderr
  if (level === 'ERROR') console.error(line);
  else if (level === 'WARN') console.warn(line);
  else console.log(line);

  // Store in ring buffer for dashboard
  logBuffer.push({ ts: new Date().toISOString(), level, tag, msg: extra ? line : line });
  if (logBuffer.length > MAX_LINES) logBuffer.shift();
}

const logger = {
  debug: (tag, msg, extra) => log('DEBUG', tag, msg, extra),
  info:  (tag, msg, extra) => log('INFO',  tag, msg, extra),
  warn:  (tag, msg, extra) => log('WARN',  tag, msg, extra),
  error: (tag, msg, extra) => log('ERROR', tag, msg, extra),
};

export default logger;
