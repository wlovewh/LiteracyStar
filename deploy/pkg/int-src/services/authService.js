'use strict';
const crypto = require('crypto');
const db = require('../config/db');
const jwtUtil = require('../utils/jwt');
const { AppError } = require('../utils/response');

/** 生成随机密钥值 */
function randomKey(prefix = '') {
  return prefix + crypto.randomBytes(8).toString('hex').toUpperCase();
}

/**
 * 密钥登录 (project.md 追加文档 4.3)
 * 校验密钥存在、启用、未过期，返回对应权限的令牌。
 */
async function loginByKey(keyValue) {
  const key = String(keyValue || '').trim();
  if (!key) throw new AppError('请输入访问密钥');

  const row = await db.queryOne('SELECT * FROM access_keys WHERE key_value = ? LIMIT 1', [key]);
  if (!row) throw new AppError('密钥无效，请检查后重试', 401, 401);
  if (Number(row.status) !== 1) throw new AppError('该密钥已被禁用，请联系管理员', 403, 403);
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
    throw new AppError('该密钥已过期，请联系管理员', 403, 403);
  }

  const role = Number(row.key_type) === 1 ? 'admin' : 'user';
  const token = jwtUtil.sign({ role, keyId: row.id, keyValue: row.key_value });

  return {
    token,
    user: { role, keyId: row.id, keyType: Number(row.key_type), remark: row.remark || '' }
  };
}

/** 密钥列表 */
async function listKeys({ page = 1, pageSize = 20, keyType, keyword } = {}) {
  const where = [];
  const params = [];
  if (keyType) { where.push('key_type = ?'); params.push(Number(keyType)); }
  if (keyword) { where.push('(key_value LIKE ? OR remark LIKE ?)'); params.push('%' + keyword + '%', '%' + keyword + '%'); }
  const clause = where.length ? ' WHERE ' + where.join(' AND ') : '';

  const totalRow = await db.queryOne('SELECT COUNT(*) AS c FROM access_keys' + clause, params);
  const limit = Math.max(1, Math.min(200, Number(pageSize) || 20));
  const offset = (Math.max(1, Number(page) || 1) - 1) * limit;

  const rows = await db.query(
    'SELECT * FROM access_keys' + clause + ' ORDER BY id DESC LIMIT ' + limit + ' OFFSET ' + offset,
    params
  );
  return { list: rows, total: totalRow ? Number(totalRow.c) : 0, page: Number(page) || 1, pageSize: limit };
}

async function createKey(payload = {}) {
  const value = String(payload.keyValue || '').trim() || randomKey('KEY');
  const type = Number(payload.keyType) === 1 ? 1 : 2;

  const dup = await db.queryOne('SELECT id FROM access_keys WHERE key_value = ?', [value]);
  if (dup) throw new AppError('该密钥值已存在');

  const res = await db.execute(
    'INSERT INTO access_keys (key_value, key_type, remark, expires_at, status) VALUES (?,?,?,?,?)',
    [value, type, payload.remark || null, payload.expiresAt || null, payload.status === 0 ? 0 : 1]
  );
  return db.queryOne('SELECT * FROM access_keys WHERE id = ?', [res.insertId]);
}

async function updateKey(id, payload = {}) {
  const row = await db.queryOne('SELECT * FROM access_keys WHERE id = ?', [id]);
  if (!row) throw new AppError('密钥不存在', 404, 404);

  const value = payload.keyValue !== undefined ? String(payload.keyValue).trim() : row.key_value;
  if (!value) throw new AppError('密钥值不能为空');
  if (value !== row.key_value) {
    const dup = await db.queryOne('SELECT id FROM access_keys WHERE key_value = ? AND id <> ?', [value, id]);
    if (dup) throw new AppError('该密钥值已存在');
  }

  await db.execute(
    'UPDATE access_keys SET key_value = ?, key_type = ?, remark = ?, expires_at = ?, status = ? WHERE id = ?',
    [
      value,
      payload.keyType !== undefined ? (Number(payload.keyType) === 1 ? 1 : 2) : row.key_type,
      payload.remark !== undefined ? payload.remark : row.remark,
      payload.expiresAt !== undefined ? (payload.expiresAt || null) : row.expires_at,
      payload.status !== undefined ? (Number(payload.status) === 1 ? 1 : 0) : row.status,
      id
    ]
  );
  return db.queryOne('SELECT * FROM access_keys WHERE id = ?', [id]);
}

async function removeKey(id) {
  const row = await db.queryOne('SELECT * FROM access_keys WHERE id = ?', [id]);
  if (!row) throw new AppError('密钥不存在', 404, 404);
  await db.execute('DELETE FROM access_keys WHERE id = ?', [id]);
  return { id: Number(id) };
}

module.exports = { loginByKey, listKeys, createKey, updateKey, removeKey, randomKey };
