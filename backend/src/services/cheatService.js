'use strict';
const db = require('../config/db');
const config = require('../config');
const { AppError } = require('../utils/response');

/** 记录一次预警 (project.md 7.5) */
async function log(user, { stageId, eventType, duration }) {
  if (!eventType) throw new AppError('事件类型不能为空');
  const result = await db.execute(
    'INSERT INTO cheat_logs (stage_id, team_id, student_id, event_type, duration) VALUES (?,?,?,?,?)',
    [stageId || null, user.teamId || null, user.studentId || null, String(eventType), Math.max(0, Number(duration) || 0)]
  );
  return { id: result.insertId };
}

async function list(query = {}) {
  const where = [];
  const params = [];
  if (query.stageId) { where.push('c.stage_id = ?'); params.push(Number(query.stageId)); }
  if (query.teamId) { where.push('c.team_id = ?'); params.push(Number(query.teamId)); }
  if (query.studentId) { where.push('c.student_id = ?'); params.push(query.studentId); }
  if (query.eventType) { where.push('c.event_type = ?'); params.push(query.eventType); }

  const whereSql = where.length ? ' WHERE ' + where.join(' AND ') : '';
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(500, Math.max(1, Number(query.pageSize) || 20));

  const countRow = await db.queryOne('SELECT COUNT(*) AS total FROM cheat_logs c' + whereSql, params);
  const rows = await db.query(
    'SELECT c.*, t.name AS team_name, s.name AS stage_name ' +
    'FROM cheat_logs c LEFT JOIN teams t ON t.id = c.team_id LEFT JOIN stages s ON s.id = c.stage_id ' +
    whereSql + ' ORDER BY c.created_at DESC, c.id DESC LIMIT ' + pageSize + ' OFFSET ' + ((page - 1) * pageSize),
    params
  );
  return { list: rows, total: countRow ? Number(countRow.total) : 0, page, pageSize };
}

/** 导出 CSV (project.md 10.3) */
async function exportCsv(query = {}) {
  const result = await list(Object.assign({}, query, { page: 1, pageSize: 100000 }));
  const header = ['时间', '队伍', '学号', '事件类型', '持续时间(秒)', '环节'];
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [header.join(',')];
  result.list.forEach((r) => {
    lines.push([
      r.created_at instanceof Date ? r.created_at.toISOString().slice(0, 19).replace('T', ' ') : String(r.created_at || ''),
      r.team_name || '',
      r.student_id || '',
      r.event_type || '',
      r.duration,
      r.stage_name || ''
    ].map(esc).join(','));
  });
  // 加 BOM 以便 Excel 正确识别 UTF-8
  return '\uFEFF' + lines.join('\r\n');
}

async function summary() {
  const total = await db.queryOne('SELECT COUNT(*) AS c FROM cheat_logs');
  const today = await db.queryOne('SELECT COUNT(*) AS c FROM cheat_logs WHERE DATE(created_at) = CURDATE()');
  const byType = await db.query('SELECT event_type, COUNT(*) AS c FROM cheat_logs GROUP BY event_type ORDER BY c DESC');
  return {
    total: total ? Number(total.c) : 0,
    today: today ? Number(today.c) : 0,
    byType: byType.map((r) => ({ eventType: r.event_type, count: Number(r.c) })),
    thresholds: config.cheat
  };
}

module.exports = { log, list, exportCsv, summary };
