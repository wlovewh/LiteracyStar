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
    ' ORDER BY e.id ASC';
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
 *
 * 可见性规则（project.md 赛事权限）：
 *   某赛事若在 event_teams 中没有任何记录 => 对全体队伍开放；
 *   一旦配置了白名单 => 只有名单内的队伍能看到。
 *
 * @param {number|string} [teamId] 当前登录队伍；不传时只返回对全体开放的赛事
 */
async function listForStudent(teamId) {
  // 按 id 升序：默认进入序号最小的赛事，避免多赛事时总是跳到最新建的那个
  const base =
    'SELECT e.id, e.name, e.description, e.created_at, ' +
    '(SELECT COUNT(*) FROM stages s WHERE s.event_id = e.id AND s.status = 1) AS active_stage_count ' +
    'FROM events e WHERE e.status = 1 ';
  const order = ' ORDER BY e.id ASC';

  if (!teamId) {
    // 未登录/无队伍：只暴露未设置白名单的赛事
    return db.query(
      base + 'AND NOT EXISTS (SELECT 1 FROM event_teams et WHERE et.event_id = e.id)' + order
    );
  }

  // 白名单为空 或 本队在白名单内
  return db.query(
    base +
      'AND (NOT EXISTS (SELECT 1 FROM event_teams et WHERE et.event_id = e.id) ' +
      '     OR EXISTS (SELECT 1 FROM event_teams et2 WHERE et2.event_id = e.id AND et2.team_id = ?))' +
      order,
    [teamId]
  );
}

/**
 * 前台首页：指定赛事的环节列表 (project.md 7.1)
 *
 * @param {number|string} [eventId] 学生选中的赛事；不传时回退到最近启用的赛事，
 *   以兼容旧链接与未做选择的首次访问。
 */
async function currentForStudent(eventId, teamId) {
  const events = await listForStudent(teamId);
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

// ---------------- 赛事可见范围（队伍白名单） ----------------

/** 查询某赛事的可见队伍 ID 列表；空数组表示对全体开放 */
async function getVisibleTeams(eventId) {
  const rows = await db.query(
    'SELECT et.team_id, t.name AS team_name, t.leader_name ' +
    'FROM event_teams et LEFT JOIN teams t ON t.id = et.team_id ' +
    'WHERE et.event_id = ? ORDER BY t.name ASC',
    [eventId]
  );
  return rows.map((r) => ({
    teamId: Number(r.team_id),
    teamName: r.team_name || ('队伍#' + r.team_id),
    leaderName: r.leader_name || ''
  }));
}

/** 查询某队伍可见的赛事 ID 列表 */
async function getVisibleEvents(teamId) {
  const rows = await db.query('SELECT event_id FROM event_teams WHERE team_id = ?', [teamId]);
  return rows.map((r) => Number(r.event_id));
}

/**
 * 覆盖式设置某赛事的可见队伍。
 * @param {number[]} teamIds 空数组 = 对全体队伍开放
 */
async function setVisibleTeams(eventId, teamIds) {
  await getById(eventId); // 赛事不存在时抛 404
  const ids = [...new Set((teamIds || []).map((x) => Number(x)).filter((x) => Number.isInteger(x) && x > 0))];

  await db.transaction(async (conn) => {
    await conn.execute('DELETE FROM event_teams WHERE event_id = ?', [eventId]);
    for (const tid of ids) {
      await conn.execute(
        'INSERT INTO event_teams (event_id, team_id) VALUES (?, ?)',
        [eventId, tid]
      );
    }
  });

  return { eventId: Number(eventId), teamIds: ids, restricted: ids.length > 0 };
}

/** 覆盖式设置某队伍可见的赛事 */
async function setVisibleEvents(teamId, eventIds) {
  const team = await db.queryOne('SELECT id FROM teams WHERE id = ?', [teamId]);
  if (!team) throw new AppError('队伍不存在', 404, 404);
  const ids = [...new Set((eventIds || []).map((x) => Number(x)).filter((x) => Number.isInteger(x) && x > 0))];

  await db.transaction(async (conn) => {
    await conn.execute('DELETE FROM event_teams WHERE team_id = ?', [teamId]);
    for (const eid of ids) {
      await conn.execute(
        'INSERT INTO event_teams (event_id, team_id) VALUES (?, ?)',
        [eid, teamId]
      );
    }
  });

  return { teamId: Number(teamId), eventIds: ids };
}

/** 所有赛事的可见范围总览（管理端一次拉取） */
async function visibilityOverview() {
  const rows = await db.query(
    'SELECT event_id, team_id FROM event_teams ORDER BY event_id, team_id'
  );
  const byEvent = {};
  rows.forEach((r) => {
    const k = String(r.event_id);
    if (!byEvent[k]) byEvent[k] = [];
    byEvent[k].push(Number(r.team_id));
  });
  return byEvent;
}

module.exports = {
  list,
  listForStudent,
  getById,
  create,
  update,
  remove,
  currentForStudent,
  getVisibleTeams,
  getVisibleEvents,
  setVisibleTeams,
  setVisibleEvents,
  visibilityOverview
};
