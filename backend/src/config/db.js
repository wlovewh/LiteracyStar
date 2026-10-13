'use strict';
const mysql = require('mysql2/promise');
const config = require('./index');

let pool = null;

function getPool() {
  if (!pool) {
    pool = mysql.createPool(config.db);
  }
  return pool;
}

/** 执行查询，返回结果行数组 */
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
 * 事务包装器。回调收到一个 conn 对象，其方法签名与 query/execute 一致。
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

/** 健康检查：能否成功往返一次 */
async function ping() {
  const row = await queryOne('SELECT 1 AS ok');
  return !!row;
}

async function close() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = { getPool, query, queryOne, execute, transaction, ping, close };
