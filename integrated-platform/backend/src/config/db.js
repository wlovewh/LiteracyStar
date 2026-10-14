'use strict';
const mysql = require('mysql2/promise');
const config = require('./index');
const logger = require('../utils/logger');

let pool = null;

function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      database: config.db.database,
      waitForConnections: true,
      connectionLimit: config.db.connectionLimit,
      queueLimit: 0,
      charset: 'utf8mb4_unicode_ci',
      timezone: '+08:00',
      dateStrings: ['DATE', 'DATETIME']
    });
  }
  return pool;
}

/** 查询多行 */
async function query(sql, params = []) {
  const [rows] = await getPool().execute(sql, params);
  return rows;
}

/** 查询单行，无结果返回 null */
async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows.length ? rows[0] : null;
}

/** 执行写操作，返回 { insertId, affectedRows } */
async function execute(sql, params = []) {
  const [result] = await getPool().execute(sql, params);
  return result;
}

/**
 * 事务包装器。回调收到 conn 对象，方法签名与 query/execute 一致。
 * 回调抛出异常时自动回滚。
 */
async function transaction(handler) {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const tx = {
      query: async (sql, params = []) => (await conn.execute(sql, params))[0],
      queryOne: async (sql, params = []) => {
        const rows = (await conn.execute(sql, params))[0];
        return rows.length ? rows[0] : null;
      },
      execute: async (sql, params = []) => (await conn.execute(sql, params))[0]
    };
    const result = await handler(tx);
    await conn.commit();
    return result;
  } catch (err) {
    try {
      await conn.rollback();
    } catch (_) {
      /* 回滚失败时保留原始错误 */
    }
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * 跨库查询：读取模拟竞赛平台的 questions 表。
 * 两个平台共用同一份题库，通过显式库名限定实现双向同步。
 */
async function queryCompetition(sql, params = []) {
  const [rows] = await getPool().execute(sql.replace(/\bquestions\b/g, config.competitionDb + '.questions'), params);
  return rows;
}

/** 健康检查 */
async function ping() {
  try {
    await getPool().query('SELECT 1');
    return { connected: true, error: null };
  } catch (err) {
    return { connected: false, error: err.message };
  }
}

async function close() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = { getPool, query, queryOne, execute, transaction, queryCompetition, ping, close };
