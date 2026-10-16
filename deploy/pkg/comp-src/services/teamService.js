'use strict';
const db = require('../config/db');
const redis = require('../config/redis');
const { AppError } = require('../utils/response');

function trimOrNull(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

async function list(query = {}) {
  const where = [];
  const params = [];
  const { keyword, status } = query;

  if (keyword) {
    where.push('(name LIKE ? OR leader_id LIKE ? OR leader_name LIKE ? OR member1_id LIKE ? OR member2_id LIKE ?)');
    const kw = '%' + keyword + '%';
    params.push(kw, kw, kw, kw, kw);
  }
  if (status !== undefined && status !== null && status !== '') {
    where.push('status = ?');
    params.push(Number(status));
  }

  const whereSql = where.length ? ' WHERE ' + where.join(' AND ') : '';
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(500, Math.max(1, Number(query.pageSize) || 20));

  const countRow = await db.queryOne('SELECT COUNT(*) AS total FROM teams' + whereSql, params);
  const rows = await db.query(
    'SELECT * FROM teams' + whereSql + ' ORDER BY id DESC LIMIT ' + pageSize + ' OFFSET ' + ((page - 1) * pageSize),
    params
  );

  return { list: rows, total: countRow ? Number(countRow.total) : 0, page, pageSize };
}

async function getById(id) {
  const row = await db.queryOne('SELECT * FROM teams WHERE id = ?', [id]);
  if (!row) throw new AppError('队伍不存在', 404, 404);
  return row;
}

/**
 * 学号唯一性校验 (project.md 6.2)
 * 队长学号与队员学号不能与已有队伍重复。
 */
async function assertUniqueStudentIds(payload, excludeId = null) {
  const ids = [payload.leader_id, payload.member1_id, payload.member2_id]
    .map(trimOrNull)
    .filter(Boolean);

  const dupInPayload = ids.filter((v, i) => ids.indexOf(v) !== i);
  if (dupInPayload.length) {
    throw new AppError('同一队伍内学号重复: ' + [...new Set(dupInPayload)].join('、'));
  }

  for (const sid of ids) {
    const rows = await db.query(
      'SELECT id, name FROM teams WHERE (leader_id = ? OR member1_id = ? OR member2_id = ?)' + (excludeId ? ' AND id <> ?' : ''),
      excludeId ? [sid, sid, sid, excludeId] : [sid, sid, sid]
    );
    if (rows.length) {
      throw new AppError('学号 ' + sid + ' 已被队伍「' + rows[0].name + '」使用');
    }
  }
}

function validateTeam(payload) {
  const errors = [];
  if (!trimOrNull(payload.name)) errors.push('队伍名称不能为空');
  if (!trimOrNull(payload.leader_name)) errors.push('队长姓名不能为空');
  if (!trimOrNull(payload.leader_id)) errors.push('队长学号不能为空');
  if (!trimOrNull(payload.leader_phone)) errors.push('队长联系电话不能为空');
  return errors;
}

async function create(payload) {
  const errors = validateTeam(payload);
  if (errors.length) throw new AppError(errors.join('；'));

  const row = {
    name: trimOrNull(payload.name),
    leader_name: trimOrNull(payload.leader_name),
    leader_id: trimOrNull(payload.leader_id),
    leader_phone: trimOrNull(payload.leader_phone),
    member1_name: trimOrNull(payload.member1_name),
    member1_id: trimOrNull(payload.member1_id),
    member2_name: trimOrNull(payload.member2_name),
    member2_id: trimOrNull(payload.member2_id),
    status: payload.status === undefined ? 1 : Number(payload.status) ? 1 : 0
  };

  await assertUniqueStudentIds(row);

  const result = await db.execute(
    'INSERT INTO teams (name, leader_name, leader_id, leader_phone, member1_name, member1_id, member2_name, member2_id, status) VALUES (?,?,?,?,?,?,?,?,?)',
    [row.name, row.leader_name, row.leader_id, row.leader_phone, row.member1_name, row.member1_id, row.member2_name, row.member2_id, row.status]
  );
  return getById(result.insertId);
}

async function update(id, payload) {
  const existing = await getById(id);
  const merged = {
    name: payload.name !== undefined ? trimOrNull(payload.name) : existing.name,
    leader_name: payload.leader_name !== undefined ? trimOrNull(payload.leader_name) : existing.leader_name,
    leader_id: payload.leader_id !== undefined ? trimOrNull(payload.leader_id) : existing.leader_id,
    leader_phone: payload.leader_phone !== undefined ? trimOrNull(payload.leader_phone) : existing.leader_phone,
    member1_name: payload.member1_name !== undefined ? trimOrNull(payload.member1_name) : existing.member1_name,
    member1_id: payload.member1_id !== undefined ? trimOrNull(payload.member1_id) : existing.member1_id,
    member2_name: payload.member2_name !== undefined ? trimOrNull(payload.member2_name) : existing.member2_name,
    member2_id: payload.member2_id !== undefined ? trimOrNull(payload.member2_id) : existing.member2_id,
    status: payload.status !== undefined ? (Number(payload.status) ? 1 : 0) : existing.status
  };

  const errors = validateTeam(merged);
  if (errors.length) throw new AppError(errors.join('；'));
  await assertUniqueStudentIds(merged, id);

  await db.execute(
    'UPDATE teams SET name=?, leader_name=?, leader_id=?, leader_phone=?, member1_name=?, member1_id=?, member2_name=?, member2_id=?, status=? WHERE id=?',
    [merged.name, merged.leader_name, merged.leader_id, merged.leader_phone, merged.member1_name, merged.member1_id, merged.member2_name, merged.member2_id, merged.status, id]
  );
  return getById(id);
}

async function remove(id) {
  await getById(id);
  const used = await db.queryOne('SELECT COUNT(*) AS c FROM answers WHERE team_id = ?', [id]);
  if (used && Number(used.c) > 0) throw new AppError('该队伍已存在答题记录，无法删除。可改为禁用。', 409, 409);
  await db.execute('DELETE FROM stage_scores WHERE team_id = ?', [id]);
  await db.execute('DELETE FROM teams WHERE id = ?', [id]);
  return { id };
}

/**
 * 清空答题数据，允许队伍重新作答
 *
 * 清空范围：该队伍的答题记录、成绩、抽题快照、预警记录与排行榜缓存。
 * stageId 为空时清空该队伍全部环节的数据；传入时只清空指定环节。
 *
 * 注意：只清空"数据"，不改动环节本身的开启状态与配置。
 */
async function clearAnswerData(id, stageId = null) {
  const team = await getById(id);

  // stage_papers 无 team_id 字段，其 scope_key 为 'common' 或学号，
  // 因此需要按该队伍所有成员的学号来清理抽题快照。
  const studentIds = [team.leader_id, team.member1_id, team.member2_id].filter(Boolean).map(String);

  const stageFilter = stageId ? ' AND stage_id = ?' : '';
  const params = stageId ? [id, stageId] : [id];

  const affected = await db.query(
    'SELECT DISTINCT stage_id FROM answers WHERE team_id = ?' + stageFilter,
    params
  );
  const stageIds = affected.map((r) => r.stage_id);
  if (stageId && !stageIds.includes(Number(stageId))) stageIds.push(Number(stageId));

  // 注意: db.transaction 的 conn.execute 已解包，直接返回 result 对象（非 [rows, fields] 元组）
  const stats = await db.transaction(async (conn) => {
    const a = await conn.execute('DELETE FROM answers WHERE team_id = ?' + stageFilter, params);
    const s = await conn.execute('DELETE FROM stage_scores WHERE team_id = ?' + stageFilter, params);

    // 按学号清理抽题快照
    let paperCount = 0;
    if (studentIds.length) {
      const marks = studentIds.map(() => '?').join(',');
      const paperParams = stageId ? [...studentIds, stageId] : studentIds;
      const p = await conn.execute(
        'DELETE FROM stage_papers WHERE scope_key IN (' + marks + ')' + stageFilter,
        paperParams
      );
      paperCount = p.affectedRows || 0;
    }
    return {
      answers: a.affectedRows || 0,
      scores: s.affectedRows || 0,
      papers: paperCount
    };
  });

  // 清理预警记录（cheat_logs 按环节+队伍记录）
  let cheatCleared = 0;
  try {
    const c = await db.execute(
      'DELETE FROM cheat_logs WHERE team_id = ?' + (stageId ? ' AND stage_id = ?' : ''),
      params
    );
    cheatCleared = c.affectedRows || 0;
  } catch (_) {
    /* cheat_logs 结构差异时忽略 */
  }

  // 清理排行榜缓存（Redis ZSET）
  const clearedKeys = [];
  for (const sid of stageIds) {
    try {
      await redis.del(redis.rankKey(sid, 'common'));
      await redis.del(redis.rankKey(sid, String(id)));
      clearedKeys.push(sid);
    } catch (_) {
      /* Redis 不可用时跳过 */
    }
  }

  return { teamId: Number(id), stageIds, ...stats, cheatCleared, rankKeysCleared: clearedKeys };
}

async function removeMany(ids) {
  if (!Array.isArray(ids) || !ids.length) throw new AppError('请选择要删除的队伍');
  let deleted = 0;
  const skipped = [];
  for (const id of ids) {
    try {
      await remove(id);
      deleted += 1;
    } catch (err) {
      skipped.push({ id, reason: err.message });
    }
  }
  return { deleted, skipped };
}

/**
 * 批量导入 (project.md 6.3)
 * 表头: *队伍名称 | *队长姓名 | *队长学号 | *队长联系电话 | 队员1姓名 | 队员1学号 | 队员2姓名 | 队员2学号
 * 导入后自动为每个学号创建账号，密码默认与学号相同。
 */
async function importRows(rows) {
  const errors = [];
  const valid = [];
  const seenIds = new Set();

  const existing = await db.query('SELECT leader_id, member1_id, member2_id FROM teams');
  existing.forEach((t) => {
    [t.leader_id, t.member1_id, t.member2_id].filter(Boolean).forEach((v) => seenIds.add(String(v).trim()));
  });

  const get = (raw, key) => {
    // 兼容带 * 前缀的表头
    if (raw[key] !== undefined) return raw[key];
    const starKey = '*' + key;
    if (raw[starKey] !== undefined) return raw[starKey];
    return undefined;
  };

  for (let i = 0; i < rows.length; i += 1) {
    const raw = rows[i];
    const rowNo = i + 2;

    const row = {
      name: trimOrNull(get(raw, '队伍名称')),
      leader_name: trimOrNull(get(raw, '队长姓名')),
      leader_id: trimOrNull(get(raw, '队长学号')),
      leader_phone: trimOrNull(get(raw, '队长联系电话')),
      member1_name: trimOrNull(get(raw, '队员1姓名')),
      member1_id: trimOrNull(get(raw, '队员1学号')),
      member2_name: trimOrNull(get(raw, '队员2姓名')),
      member2_id: trimOrNull(get(raw, '队员2学号'))
    };

    const errs = validateTeam(row);
    if (errs.length) {
      errors.push({ row: rowNo, reason: errs.join('；') });
      continue;
    }

    const ids = [row.leader_id, row.member1_id, row.member2_id].filter(Boolean);
    const dup = ids.filter((v, idx) => ids.indexOf(v) !== idx);
    if (dup.length) {
      errors.push({ row: rowNo, reason: '同一队伍内学号重复: ' + [...new Set(dup)].join('、') });
      continue;
    }
    const conflict = ids.filter((v) => seenIds.has(v));
    if (conflict.length) {
      errors.push({ row: rowNo, reason: '学号已存在: ' + conflict.join('、') });
      continue;
    }

    ids.forEach((v) => seenIds.add(v));
    valid.push(row);
  }

  let success = 0;
  if (valid.length) {
    await db.transaction(async (tx) => {
      for (const row of valid) {
        await tx.execute(
          'INSERT INTO teams (name, leader_name, leader_id, leader_phone, member1_name, member1_id, member2_name, member2_id, status) VALUES (?,?,?,?,?,?,?,?,1)',
          [row.name, row.leader_name, row.leader_id, row.leader_phone, row.member1_name, row.member1_id, row.member2_name, row.member2_id]
        );
        success += 1;
      }
    });
  }

  return { success, failed: errors.length, total: rows.length, errors: errors.slice(0, 200) };
}

async function exportRows(query = {}) {
  const result = await list(Object.assign({}, query, { page: 1, pageSize: 100000 }));
  return result.list.map((t) => ({
    队伍名称: t.name,
    队长姓名: t.leader_name,
    队长学号: t.leader_id,
    队长联系电话: t.leader_phone || '',
    队员1姓名: t.member1_name || '',
    队员1学号: t.member1_id || '',
    队员2姓名: t.member2_name || '',
    队员2学号: t.member2_id || '',
    状态: Number(t.status) === 1 ? '启用' : '禁用'
  }));
}

/** 按学号定位成员所属队伍与角色，供答题鉴权使用 */
async function findByStudentId(studentId) {
  const sid = String(studentId).trim();
  const team = await db.queryOne('SELECT * FROM teams WHERE leader_id = ? OR member1_id = ? OR member2_id = ? LIMIT 1', [sid, sid, sid]);
  if (!team) return null;
  let role = 'member';
  let name = null;
  let memberIndex = 2;
  if (team.leader_id === sid) { role = 'leader'; name = team.leader_name; memberIndex = 1; }
  else if (team.member1_id === sid) { role = 'member'; name = team.member1_name; memberIndex = 2; }
  else if (team.member2_id === sid) { role = 'member'; name = team.member2_name; memberIndex = 3; }
  return { team, role, name, memberIndex };
}

module.exports = { list, getById, create, update, remove, removeMany, importRows, exportRows, findByStudentId, assertUniqueStudentIds, clearAnswerData };
