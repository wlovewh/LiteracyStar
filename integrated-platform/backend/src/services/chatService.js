'use strict';
const db = require('../config/db');
const config = require('../config');
const redis = require('../config/redis');
const { AppError } = require('../utils/response');

/**
 * 聊天室 (project.md 追加文档 7)
 */

/** 生成不重复的 6 位数字邀请码 */
async function generateInviteCode() {
  for (let i = 0; i < 20; i += 1) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const dup = await db.queryOne('SELECT id FROM chat_rooms WHERE invite_code = ?', [code]);
    if (!dup) return code;
  }
  throw new AppError('邀请码生成失败，请重试', 500, 500);
}

/**
 * 校验自定义房间码。
 *
 * 规则：6 位数字（与自动生成格式一致，便于学生端统一用数字键盘输入）。
 * 由管理员/队长自定义，必须全局唯一。
 *
 * @param {string} code      待校验的房间码
 * @param {number} [excludeRoomId] 排除自身的房间 id（改码时用）
 * @returns {Promise<string>} 规范化后的房间码
 */
async function assertCustomCode(code, excludeRoomId) {
  const c = String(code === undefined || code === null ? '' : code).trim();
  if (!/^\d{6}$/.test(c)) throw new AppError('房间码必须是 6 位数字', 400);
  const dup = excludeRoomId
    ? await db.queryOne('SELECT id FROM chat_rooms WHERE invite_code = ? AND id <> ? LIMIT 1', [c, excludeRoomId])
    : await db.queryOne('SELECT id FROM chat_rooms WHERE invite_code = ? LIMIT 1', [c]);
  if (dup) throw new AppError('该房间码已被占用，请换一个', 409, 409);
  return c;
}

/**
 * 设置自定义房间码（同时续期 24 小时）。
 * 不传 code 时退化为随机重新生成，与 refreshInviteCode 行为一致。
 */
async function setInviteCode(roomId, code) {
  const room = await db.queryOne('SELECT * FROM chat_rooms WHERE id = ?', [roomId]);
  if (!room) throw new AppError('聊天室不存在', 404, 404);

  const finalCode = code === undefined || code === null || String(code).trim() === ''
    ? await generateInviteCode()
    : await assertCustomCode(code, Number(roomId));

  const expires = new Date(Date.now() + config.chat.inviteCodeTtlHours * 3600 * 1000);
  await db.execute('UPDATE chat_rooms SET invite_code = ?, invite_expires_at = ? WHERE id = ?', [finalCode, expires, roomId]);
  return { inviteCode: finalCode, expiresAt: expires };
}

/** 确保队伍聊天室存在，返回房间记录 */
async function ensureRoom({ teamId, name, maxMembers, retentionDays } = {}) {
  const tid = Number(teamId);
  if (!tid) throw new AppError('缺少队伍ID');

  let room = await db.queryOne('SELECT * FROM chat_rooms WHERE team_id = ? LIMIT 1', [tid]);
  if (room) return room;

  const code = await generateInviteCode();
  const expires = new Date(Date.now() + config.chat.inviteCodeTtlHours * 3600 * 1000);
  const res = await db.execute(
    'INSERT INTO chat_rooms (team_id, name, invite_code, invite_expires_at, max_members, retention_days) VALUES (?,?,?,?,?,?)',
    [
      tid,
      name || ('队伍#' + tid + ' 聊天室'),
      code,
      expires,
      Number(maxMembers) || config.chat.defaultMaxMembers,
      Number(retentionDays) >= 0 ? Number(retentionDays) : config.chat.defaultRetentionDays
    ]
  );
  room = await db.queryOne('SELECT * FROM chat_rooms WHERE id = ?', [res.insertId]);
  return room;
}

/** 重新生成邀请码（续期 24 小时） */
async function refreshInviteCode(roomId) {
  const room = await db.queryOne('SELECT * FROM chat_rooms WHERE id = ?', [roomId]);
  if (!room) throw new AppError('聊天室不存在', 404, 404);

  const code = await generateInviteCode();
  const expires = new Date(Date.now() + config.chat.inviteCodeTtlHours * 3600 * 1000);
  await db.execute('UPDATE chat_rooms SET invite_code = ?, invite_expires_at = ? WHERE id = ?', [code, expires, roomId]);
  return { inviteCode: code, expiresAt: expires };
}

/** 通过邀请码查找聊天室 */
async function findByInviteCode(code) {
  const c = String(code || '').trim();
  if (!/^\d{6}$/.test(c)) throw new AppError('邀请码应为 6 位数字');

  const room = await db.queryOne('SELECT * FROM chat_rooms WHERE invite_code = ? LIMIT 1', [c]);
  if (!room) throw new AppError('邀请码无效，请确认后重试', 404, 404);
  if (room.invite_expires_at && new Date(room.invite_expires_at).getTime() < Date.now()) {
    throw new AppError('邀请码已过期，请向队长索取新的邀请码', 403, 403);
  }
  return room;
}

async function getRoomById(roomId) {
  const room = await db.queryOne('SELECT * FROM chat_rooms WHERE id = ?', [roomId]);
  if (!room) throw new AppError('聊天室不存在', 404, 404);
  return room;
}

/** 拉取最近消息（断线重连用） */
async function recentMessages(roomId, limit = config.chat.recentMessageLimit) {
  const room = await getRoomById(roomId);
  const lim = Math.max(1, Math.min(200, Number(limit) || 50));

  let clause = '';
  if (Number(room.retention_days) > 0) {
    clause = ' AND created_at >= DATE_SUB(NOW(), INTERVAL ' + Number(room.retention_days) + ' DAY)';
  }

  const rows = await db.query(
    'SELECT * FROM chat_messages WHERE room_id = ?' + clause + ' ORDER BY id DESC LIMIT ' + lim,
    [roomId]
  );
  const list = rows.reverse().map(normalizeMessage);
  await attachQuoted(list);
  return list;
}

/**
 * 为引用了其他消息的记录补充被引用内容 (project.md 10.1)
 * 前端需要展示「谁说了什么」，只给 id 无法渲染。
 */
async function attachQuoted(list) {
  const ids = [...new Set(list.map((m) => m.quotedMessageId).filter(Boolean))];
  if (!ids.length) return;

  const rows = await db.query(
    'SELECT id, sender_name, sender_key, content, message_type, created_at FROM chat_messages WHERE id IN (' + ids.map(() => '?').join(',') + ')',
    ids
  );
  const byId = new Map(rows.map((r) => [Number(r.id), r]));

  list.forEach((m) => {
    if (!m.quotedMessageId) return;
    const q = byId.get(Number(m.quotedMessageId));
    m.quoted = q
      ? { id: Number(q.id), senderName: q.sender_name, senderKey: q.sender_key || null, content: q.content, messageType: q.message_type, createdAt: q.created_at }
      : null; // 原消息已被删除或超出保留期
  });
}

/** 统一消息结构，extra 解析为对象 */
function normalizeMessage(row) {
  let extra = row.extra;
  if (typeof extra === 'string') {
    try { extra = JSON.parse(extra); } catch (_) { extra = null; }
  }
  return {
    id: Number(row.id),
    roomId: Number(row.room_id),
    senderRole: row.sender_role,
    senderName: row.sender_name,
    senderStudentId: row.sender_student_id,
    // 发送者稳定标识：前端据此判断"自己发的消息"，不依赖可改的昵称
    senderKey: row.sender_key || null,
    messageType: row.message_type,
    content: row.content,
    extra: extra || null,
    quotedMessageId: row.quoted_message_id ? Number(row.quoted_message_id) : null,
    createdAt: row.created_at
  };
}

/** 写入一条消息并广播 */
async function saveMessage(roomId, payload = {}) {
  const room = await getRoomById(roomId);
  const type = ['text', 'question', 'answer', 'system', 'image'].includes(payload.messageType)
    ? payload.messageType : 'text';

  const res = await db.execute(
    'INSERT INTO chat_messages (room_id, sender_role, sender_name, sender_student_id, sender_key, message_type, content, extra, quoted_message_id) ' +
    'VALUES (?,?,?,?,?,?,?,?,?)',
    [
      roomId,
      payload.senderRole || 'member1',
      payload.senderName || '匿名',
      payload.senderStudentId || null,
      payload.senderKey || null,
      type,
      payload.content || '',
      payload.extra ? JSON.stringify(payload.extra) : null,
      payload.quotedMessageId || null
    ]
  );

  const row = await db.queryOne('SELECT * FROM chat_messages WHERE id = ?', [res.insertId]);
  const msg = normalizeMessage(row);
  await attachQuoted([msg]);

  // 通过 Redis Pub/Sub 广播（内存降级时为本进程投递）
  await redis.publish('chat:room:' + roomId, JSON.stringify({ type: 'message', message: msg }));
  return msg;
}

/**
 * 答案提交卡片 (project.md 追加文档 7.4)
 * 保存答案消息后，检查同一题目其他成员是否提交了不同答案，冲突则发系统消息。
 */
async function submitAnswer(roomId, payload = {}) {
  const { questionId, answer, senderName, senderRole, senderStudentId } = payload;
  if (!questionId) throw new AppError('缺少题目ID');
  if (!answer) throw new AppError('请选择答案');

  const msg = await saveMessage(roomId, {
    senderRole: senderRole || 'member1',
    senderName: senderName || '匿名',
    senderStudentId,
    messageType: 'answer',
    content: '提交答案：' + answer,
    extra: { questionId: Number(questionId), answer: String(answer) }
  });

  // 检查冲突：同一 questionId 下其他成员的不同答案
  const rows = await db.query(
    "SELECT sender_name, extra FROM chat_messages " +
    "WHERE room_id = ? AND message_type = 'answer' AND id <> ? ORDER BY id DESC LIMIT 50",
    [roomId, msg.id]
  );

  const conflicts = [];
  for (const r of rows) {
    let extra = r.extra;
    if (typeof extra === 'string') { try { extra = JSON.parse(extra); } catch (_) { continue; } }
    if (!extra || Number(extra.questionId) !== Number(questionId)) continue;
    if (String(extra.answer) !== String(answer) && r.sender_name !== senderName) {
      conflicts.push({ name: r.sender_name, answer: extra.answer });
    }
  }

  let conflictMessage = null;
  if (conflicts.length) {
    const other = conflicts[0];
    const text = '答案冲突：' + senderName + '选' + answer + '，' + other.name + '选' + other.answer + '，请队长确认';
    conflictMessage = await saveMessage(roomId, {
      senderRole: 'system',
      senderName: '系统',
      messageType: 'system',
      content: text
    });
  }

  return { message: msg, conflict: !!conflictMessage, conflictMessage };
}

/** 关键词搜索消息（仅当前聊天室未过期消息） */
async function searchMessages(roomId, keyword) {
  const room = await getRoomById(roomId);
  const k = String(keyword || '').trim();
  if (!k) return [];

  let clause = '';
  if (Number(room.retention_days) > 0) {
    clause = ' AND created_at >= DATE_SUB(NOW(), INTERVAL ' + Number(room.retention_days) + ' DAY)';
  }

  const rows = await db.query(
    'SELECT * FROM chat_messages WHERE room_id = ? AND content LIKE ?' + clause + ' ORDER BY id DESC LIMIT 100',
    [roomId, '%' + k + '%']
  );
  return rows.map(normalizeMessage);
}

/** 删除单条消息 (7.12) */
async function deleteMessage(messageId) {
  const row = await db.queryOne('SELECT * FROM chat_messages WHERE id = ?', [messageId]);
  if (!row) throw new AppError('消息不存在', 404, 404);
  await db.execute('DELETE FROM chat_messages WHERE id = ?', [messageId]);
  await redis.publish('chat:room:' + row.room_id, JSON.stringify({ type: 'delete', messageId: Number(messageId) }));
  return { id: Number(messageId) };
}

/** 清空整个聊天室消息 (7.12) */
async function clearRoom(roomId) {
  const room = await getRoomById(roomId);
  const res = await db.execute('DELETE FROM chat_messages WHERE room_id = ?', [roomId]);
  await redis.publish('chat:room:' + roomId, JSON.stringify({ type: 'clear' }));
  return { roomId: Number(roomId), deleted: res.affectedRows || 0 };
}

/** 清理过期消息（保留天数 > 0 时生效） */
async function purgeExpired() {
  const rooms = await db.query('SELECT id, retention_days FROM chat_rooms WHERE retention_days > 0');
  let total = 0;
  for (const r of rooms) {
    const res = await db.execute(
      'DELETE FROM chat_messages WHERE room_id = ? AND created_at < DATE_SUB(NOW(), INTERVAL ' + Number(r.retention_days) + ' DAY)',
      [r.id]
    );
    total += res.affectedRows || 0;
  }
  return total;
}

// ---------------- 在线状态 (7.10) ----------------
const onlineKey = (roomId) => 'chat:online:' + roomId;

async function setOnline(roomId, memberKey, name) {
  await redis.hset(onlineKey(roomId), memberKey, JSON.stringify({ name, at: Date.now() }));
}

async function setOffline(roomId, memberKey) {
  await redis.hdel(onlineKey(roomId), memberKey);
}

async function getOnlineMembers(roomId) {
  const all = await redis.hgetall(onlineKey(roomId));
  const threshold = config.chat.offlineThresholdMs;
  const out = [];
  for (const [key, raw] of Object.entries(all)) {
    let info = { name: key, at: 0 };
    try { info = JSON.parse(raw); } catch (_) { /* 使用默认值 */ }
    out.push({ key, name: info.name, online: Date.now() - Number(info.at || 0) < threshold });
  }
  return out;
}

// ---------------- 聊天室管理 (8.2) ----------------
async function listRooms() {
  const rows = await db.query(
    'SELECT r.*, (SELECT COUNT(*) FROM chat_messages m WHERE m.room_id = r.id) AS message_count ' +
    'FROM chat_rooms r ORDER BY r.id ASC'
  );
  return rows;
}

async function updateRoom(roomId, payload = {}) {
  const room = await getRoomById(roomId);
  await db.execute(
    'UPDATE chat_rooms SET max_members = ?, retention_days = ?, name = ? WHERE id = ?',
    [
      payload.maxMembers !== undefined ? Math.max(1, Number(payload.maxMembers) || 1) : room.max_members,
      payload.retentionDays !== undefined ? Math.max(0, Number(payload.retentionDays) || 0) : room.retention_days,
      payload.name !== undefined ? payload.name : room.name,
      roomId
    ]
  );
  return getRoomById(roomId);
}

/** 校验加入人数是否超过上限 */
async function assertCapacity(room, currentMembers) {
  if (currentMembers >= Number(room.max_members)) {
    throw new AppError('该聊天室人数已达上限（' + room.max_members + ' 人）', 403, 403);
  }
}

// ---------------- 快速短语 (7.6) ----------------
async function listPhrases({ onlyEnabled = false } = {}) {
  const where = onlyEnabled ? ' WHERE status = 1' : '';
  return db.query('SELECT * FROM quick_phrases' + where + ' ORDER BY sort_order ASC, id ASC');
}

async function createPhrase(payload = {}) {
  const content = String(payload.content || '').trim();
  if (!content) throw new AppError('短语内容不能为空');
  const res = await db.execute(
    'INSERT INTO quick_phrases (content, sort_order, status) VALUES (?,?,?)',
    [content, Number(payload.sortOrder) || 0, payload.status === 0 ? 0 : 1]
  );
  return db.queryOne('SELECT * FROM quick_phrases WHERE id = ?', [res.insertId]);
}

async function updatePhrase(id, payload = {}) {
  const row = await db.queryOne('SELECT * FROM quick_phrases WHERE id = ?', [id]);
  if (!row) throw new AppError('短语不存在', 404, 404);
  await db.execute(
    'UPDATE quick_phrases SET content = ?, sort_order = ?, status = ? WHERE id = ?',
    [
      payload.content !== undefined ? String(payload.content).trim() : row.content,
      payload.sortOrder !== undefined ? Number(payload.sortOrder) || 0 : row.sort_order,
      payload.status !== undefined ? (Number(payload.status) === 1 ? 1 : 0) : row.status,
      id
    ]
  );
  return db.queryOne('SELECT * FROM quick_phrases WHERE id = ?', [id]);
}

async function removePhrase(id) {
  const row = await db.queryOne('SELECT id FROM quick_phrases WHERE id = ?', [id]);
  if (!row) throw new AppError('短语不存在', 404, 404);
  await db.execute('DELETE FROM quick_phrases WHERE id = ?', [id]);
  return { id: Number(id) };
}

module.exports = {
  ensureRoom, refreshInviteCode, setInviteCode, assertCustomCode, findByInviteCode, getRoomById,
  recentMessages, saveMessage, submitAnswer, searchMessages,
  deleteMessage, clearRoom, purgeExpired,
  setOnline, setOffline, getOnlineMembers,
  listRooms, updateRoom, assertCapacity,
  listPhrases, createPhrase, updatePhrase, removePhrase,
  normalizeMessage
};
