'use strict';
/** 简易日志：统一时间戳与级别前缀 */
function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
    ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
}
function out(level, args) {
  const line = '[' + stamp() + '] [' + level + '] ' + args.map((a) =>
    a instanceof Error ? a.message : (typeof a === 'object' ? JSON.stringify(a) : String(a))
  ).join(' ');
  if (level === 'ERROR') console.error(line);
  else console.log(line);
}
module.exports = {
  info: (...a) => out('INFO', a),
  warn: (...a) => out('WARN', a),
  error: (...a) => out('ERROR', a)
};
