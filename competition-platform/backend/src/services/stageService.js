'use strict';
const db = require('../config/db');
const { AppError } = require('../utils/response');
const cfgMod = require('../config/stageConfig');

/** 环节列表（含摘要信息，供后台环节管理页使用） */
async function listByEvent(eventId) {
  const rows = await db.query(
    'SELECT id, event_id, name, sort_order, status, config, created_at, updated_at FROM stages WHERE event_id = ? ORDER BY sort_order ASC, id ASC',
    [eventId]
  );
  return rows.map(cfgMod.summarize);
}

/**
 * 全部环节的简要选项（含所属赛事名）。
 *
 * 供后台"清空答题数据"等需要选择环节的下拉框使用：
 * 不同赛事下可能有同名环节，因此带上赛事名以便区分。
 */
async function listAllOptions() {
  const rows = await db.query(
    'SELECT s.id, s.name, s.status, s.sort_order, e.id AS event_id, e.name AS event_name ' +
    'FROM stages s JOIN events e ON e.id = s.event_id ' +
    'ORDER BY e.id ASC, s.sort_order ASC, s.id ASC'
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    eventId: r.event_id,
    eventName: r.event_name
  }));
}

async function getRow(id) {
  const row = await db.queryOne('SELECT * FROM stages WHERE id = ?', [id]);
  if (!row) throw new AppError('环节不存在', 404, 404);
  return row;
}

async function getById(id) {
  return cfgMod.summarize(await getRow(id));
}

async function nextSortOrder(eventId) {
  const row = await db.queryOne('SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM stages WHERE event_id = ?', [eventId]);
  return row ? Number(row.next) : 1;
}

async function create(eventId, payload) {
  const event = await db.queryOne('SELECT id FROM events WHERE id = ?', [eventId]);
  if (!event) throw new AppError('赛事不存在', 404, 404);
  if (!payload.name || !String(payload.name).trim()) throw new AppError('环节名称不能为空');

  const config = cfgMod.normalizeConfig(payload.config);
  const errors = cfgMod.validateConfig(config);
  if (errors.length) throw new AppError(errors.join('；'));

  const sortOrder = payload.sortOrder !== undefined ? Number(payload.sortOrder) : await nextSortOrder(eventId);
  const result = await db.execute(
    'INSERT INTO stages (event_id, name, sort_order, config, status) VALUES (?, ?, ?, ?, ?)',
    [eventId, String(payload.name).trim(), sortOrder, JSON.stringify(config), payload.status === undefined ? 0 : Number(payload.status)]
  );
  return getById(result.insertId);
}

async function update(id, payload) {
  const row = await getRow(id);
  const fields = [];
  const params = [];

  if (payload.name !== undefined) {
    if (!String(payload.name).trim()) throw new AppError('环节名称不能为空');
    fields.push('name = ?');
    params.push(String(payload.name).trim());
  }
  if (payload.config !== undefined) {
    // 与既有配置合并，支持前端只提交变更片段
    const merged = cfgMod.normalizeConfig(Object.assign({}, row.config, payload.config));
    const errors = cfgMod.validateConfig(merged);
    if (errors.length) throw new AppError(errors.join('；'));
    fields.push('config = ?');
    params.push(JSON.stringify(merged));
  }
  if (payload.status !== undefined) {
    fields.push('status = ?');
    params.push(Number(payload.status));
  }
  if (payload.sortOrder !== undefined) {
    fields.push('sort_order = ?');
    params.push(Number(payload.sortOrder));
  }

  if (fields.length) {
    params.push(id);
    await db.execute('UPDATE stages SET ' + fields.join(', ') + ' WHERE id = ?', params);
  }
  return getById(id);
}

/** 复制环节 (project.md 1.3 / 4.1) */
async function copy(id) {
  const row = await getRow(id);
  const sortOrder = await nextSortOrder(row.event_id);
  const result = await db.execute(
    'INSERT INTO stages (event_id, name, sort_order, config, status) VALUES (?, ?, ?, ?, 0)',
    [row.event_id, row.name + '-副本', sortOrder, JSON.stringify(row.config)]
  );
  return getById(result.insertId);
}

/** 启用/停用/结束 (project.md 3.1 stages.status) */
async function setStatus(id, status) {
  const s = Number(status);
  if (![0, 1, 2].includes(s)) throw new AppError('状态值无效，应为 0=未开启 1=已开启 2=已结束');
  await getRow(id);
  await db.execute('UPDATE stages SET status = ? WHERE id = ?', [s, id]);
  return getById(id);
}

async function remove(id) {
  const row = await getRow(id);
  const used = await db.queryOne('SELECT COUNT(*) AS c FROM answers WHERE stage_id = ?', [id]);
  if (used && Number(used.c) > 0) {
    throw new AppError('该环节已存在答题记录，无法删除。可改为停用。', 409, 409);
  }
  await db.execute('DELETE FROM stage_papers WHERE stage_id = ?', [id]);
  await db.execute('DELETE FROM stage_scores WHERE stage_id = ?', [id]);
  await db.execute('DELETE FROM stages WHERE id = ?', [id]);
  return { id, eventId: row.event_id };
}

/** 上下移动排序 (project.md 4.1) */
async function move(id, direction) {
  const row = await getRow(id);
  const dir = direction === 'up' ? 'up' : 'down';
  const neighbor = await db.queryOne(
    dir === 'up'
      ? 'SELECT id, sort_order FROM stages WHERE event_id = ? AND sort_order < ? ORDER BY sort_order DESC LIMIT 1'
      : 'SELECT id, sort_order FROM stages WHERE event_id = ? AND sort_order > ? ORDER BY sort_order ASC LIMIT 1',
    [row.event_id, row.sort_order]
  );
  if (!neighbor) return listByEvent(row.event_id);

  await db.transaction(async (tx) => {
    await tx.execute('UPDATE stages SET sort_order = ? WHERE id = ?', [neighbor.sort_order, row.id]);
    await tx.execute('UPDATE stages SET sort_order = ? WHERE id = ?', [row.sort_order, neighbor.id]);
  });
  return listByEvent(row.event_id);
}

/** 重新排序：接收按顺序排列的环节 id 数组 */
async function reorder(eventId, orderedIds) {
  if (!Array.isArray(orderedIds) || !orderedIds.length) throw new AppError('排序列表不能为空');
  await db.transaction(async (tx) => {
    for (let i = 0; i < orderedIds.length; i += 1) {
      await tx.execute('UPDATE stages SET sort_order = ? WHERE id = ? AND event_id = ?', [i + 1, Number(orderedIds[i]), eventId]);
    }
  });
  return listByEvent(eventId);
}

module.exports = { listByEvent, listAllOptions, getRow, getById, create, update, copy, setStatus, remove, move, reorder };
