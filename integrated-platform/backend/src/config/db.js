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
 * 为 questions 表加上跨库限定名。
 *
 * 注意：必须幂等——调用方可能已经写成 `info_literacy.questions`，
 * 若再次替换会得到 `info_literacy.info_literacy.questions` 而报语法错误。
 * 因此先排除已被限定（前面带库名点号）的情况。
 */
function qualifyQuestions(sql) {
  return sql.replace(/(?<![\w.])(questions)\b/g, config.competitionDb + '.questions');
}

/**
 * 跨库查询：读取模拟竞赛平台的 questions 表。
 * 两个平台共用同一份题库，通过显式库名限定实现双向同步。
 */
async function queryCompetition(sql, params = []) {
  const [rows] = await getPool().execute(qualifyQuestions(sql), params);
  return rows;
}

/**
 * 跨库写操作：对模拟竞赛平台的 questions 表执行 INSERT/UPDATE/DELETE。
 * 注意 mysql2 的 execute 返回 [result, fields] 元组，这里统一解包为 result，
 * 避免调用方误用 result.insertId（实为 undefined）。
 */
async function executeCompetition(sql, params = []) {
  const [result] = await getPool().execute(qualifyQuestions(sql), params);
  return result;
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

module.exports = { getPool, query, queryOne, execute, transaction, queryCompetition, executeCompetition, ping, close };
