'use strict';
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const current = LEVELS[process.env.LOG_LEVEL] || LEVELS.info;

function ts() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function emit(level, args) {
  if (LEVELS[level] < current) return;
  const line = '[' + ts() + '] [' + level.toUpperCase() + ']';
  const sink = (level === 'error' || level === 'warn') ? console.error : console.log;
  sink(line, ...args);
}

module.exports = {
  debug: (...a) => emit('debug', a),
  info: (...a) => emit('info', a),
  warn: (...a) => emit('warn', a),
  error: (...a) => emit('error', a)
};
