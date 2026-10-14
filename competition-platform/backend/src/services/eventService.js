'use strict';
const db = require('../config/db');
const { AppError } = require('../utils/response');
const cfgMod = require('../config/stageConfig');

async function list({ keyword, status } = {}) {
  const where = [];
  const params = [];
  if (keyword) {
    where.push('(e.name LIKE ? OR e.description LIKE ?)');
    params.push('%' + keyword + '%', '%' + keyword + '%');
  }
  if (status !== undefined && status !== null && status !== '') {
    where.push('e.status = ?');
    params.push(Number(status));
  }
  const sql =
    'SELECT e.id, e.name, e.description, e.status, e.created_at, e.updated_at, ' +
    '(SELECT COUNT(*) FROM stages s WHERE s.event_id = e.id) AS stage_count, ' +
    '(SELECT COUNT(*) FROM stages s WHERE s.event_id = e.id AND s.status = 1) AS active_stage_count ' +
    'FROM events e ' +
    (where.length ? 'WHERE ' + where.join(' AND ') : '') +
    ' ORDER BY e.id DESC';
  return db.query(sql, params);
}

async function getById(id) {
  const event = await db.queryOne('SELECT * FROM events WHERE id = ?', [id]);
  if (!event) throw new AppError('赛事不存在', 404, 404);
  return event;
}

async function create({ name, description, status }) {
  if (!name || !String(name).trim()) throw new AppError('赛事名称不能为空');
  const result = await db.execute('INSERT INTO events (name, description, status) VALUES (?, ?, ?)', [
    String(name).trim(),
    description || null,
    status === undefined ? 1 : Number(status) ? 1 : 0
  ]);
  return getById(result.insertId);
}

async function update(id, { name, description, status }) {
  await getById(id);
  const fields = [];
  const params = [];
  if (name !== undefined) {
    if (!String(name).trim()) throw new AppError('赛事名称不能为空');
    fields.push('name = ?');
    params.push(String(name).trim());
  }
  if (description !== undefined) {
    fields.push('description = ?');
    params.push(description || null);
  }
  if (status !== undefined) {
    fields.push('status = ?');
    params.push(Number(status) ? 1 : 0);
  }
  if (!fields.length) return getById(id);
  params.push(id);
  await db.execute('UPDATE events SET ' + fields.join(', ') + ' WHERE id = ?', params);
  return getById(id);
}

async function remove(id) {
  await getById(id);
  const row = await db.queryOne('SELECT COUNT(*) AS c FROM answers WHERE stage_id IN (SELECT id FROM stages WHERE event_id = ?)', [id]);
  if (row && Number(row.c) > 0) {
    throw new AppError('该赛事下已存在答题记录，无法删除。请先清理答题数据或改为停用。', 409, 409);
  }
  // stages 通过外键 ON DELETE CASCADE 一并删除
  await db.execute('DELETE FROM events WHERE id = ?', [id]);
  return { id };
}

/**
 * 前台可参与的赛事列表（学生端赛事选择用）。
 * 只返回已启用的赛事，并附带已开启环节数量，便于前端展示。
 */
async function listForStudent() {
  const rows = await db.query(
    'SELECT e.id, e.name, e.description, e.created_at, ' +
    '(SELECT COUNT(*) FROM stages s WHERE s.event_id = e.id AND s.status = 1) AS active_stage_count ' +
    'FROM events e WHERE e.status = 1 ORDER BY e.id DESC'
  );
  return rows;
}

/**
 * 前台首页：指定赛事的环节列表 (project.md 7.1)
 *
 * @param {number|string} [eventId] 学生选中的赛事；不传时回退到最近启用的赛事，
 *   以兼容旧链接与未做选择的首次访问。
 */
async function currentForStudent(eventId) {
  const events = await listForStudent();
  if (!events.length) return { event: null, stages: [], events: [] };

  let event = null;
  if (eventId !== undefined && eventId !== null && eventId !== '') {
    event = events.find((e) => String(e.id) === String(eventId)) || null;
    // 指定的赛事不存在或已停用：不静默回退，避免学生误入其他赛事
    if (!event) return { event: null, stages: [], events };
  } else {
    event = events[0];
  }

  const rows = await db.query(
    'SELECT id, event_id, name, sort_order, status, config FROM stages WHERE event_id = ? ORDER BY sort_order ASC',
    [event.id]
  );
  // 返回摘要结构，前端无需再逐条请求详情
  return { event, stages: rows.map(cfgMod.summarize), events };
}

module.exports = { list, listForStudent, getById, create, update, remove, currentForStudent };
