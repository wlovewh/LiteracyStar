'use strict';
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { sign } = require('../utils/jwt');
const { AppError } = require('../utils/response');

const ADMIN_USERNAME = 'admin';
const ADMIN_DEFAULT_PASSWORD = 'admin123';

/**
 * 管理员登录 (project.md 1.2: admin / admin123)
 * 若 admins 表不存在或未初始化，回落到内置账号，保证首次部署可登录。
 */
async function adminLogin(username, password) {
  if (!username || !password) throw new AppError('请输入账号和密码');

  let admin = null;
  try {
    admin = await db.queryOne('SELECT id, username, password, real_name FROM admins WHERE username = ? LIMIT 1', [username]);
  } catch (_) {
    admin = null; // 表尚未创建时使用内置账号
  }

  if (!admin) {
    if (username === ADMIN_USERNAME && password === ADMIN_DEFAULT_PASSWORD) {
      const token = sign({ role: 'admin', adminId: 0, username: ADMIN_USERNAME });
      return { token, user: { role: 'admin', username: ADMIN_USERNAME, name: '系统管理员' } };
    }
    throw new AppError('账号或密码错误', 401, 401);
  }

  const matched = await bcrypt.compare(password, admin.password);
  if (!matched) throw new AppError('账号或密码错误', 401, 401);

  const token = sign({ role: 'admin', adminId: admin.id, username: admin.username });
  return {
    token,
    user: { role: 'admin', adminId: admin.id, username: admin.username, name: admin.real_name || admin.username }
  };
}

/**
 * 学生登录 (project.md 6.4)
 *   账号 = 学号, 默认密码 = 学号
 * 队长可见全部环节，队员默认仅可见个人环节。
 */
async function studentLogin(studentId, password) {
  if (!studentId || !password) throw new AppError('请输入学号和密码');

  const sid = String(studentId).trim();

  // 先按队长学号查
  let team = await db.queryOne(
    'SELECT id, name, leader_name, leader_id, member1_name, member1_id, member2_name, member2_id, status FROM teams WHERE leader_id = ? LIMIT 1',
    [sid]
  );

  let role = 'leader';
  let name = team ? team.leader_name : null;

  if (!team) {
    team = await db.queryOne(
      'SELECT id, name, leader_name, leader_id, member1_name, member1_id, member2_name, member2_id, status FROM teams WHERE member1_id = ? OR member2_id = ? LIMIT 1',
      [sid, sid]
    );
    if (team) {
      role = 'member';
      name = team.member1_id === sid ? team.member1_name : team.member2_name;
    }
  }

  if (!team) throw new AppError('学号不存在，请联系管理员', 401, 401);
  if (Number(team.status) !== 1) throw new AppError('该队伍已被禁用，请联系管理员', 403, 403);

  // 默认密码 = 学号；若存在自定义密码表则以表为准
  let expected = sid;
  try {
    const row = await db.queryOne('SELECT password FROM student_accounts WHERE student_id = ? LIMIT 1', [sid]);
    if (row) expected = row.password;
  } catch (_) {
    /* student_accounts 为可选扩展表，不存在时使用默认规则 */
  }

  if (String(password) !== String(expected)) throw new AppError('账号或密码错误', 401, 401);

  const token = sign({ role, studentId: sid, teamId: team.id, name, isLeader: role === 'leader' });
  return {
    token,
    user: {
      role,
      studentId: sid,
      teamId: team.id,
      teamName: team.name,
      name,
      isLeader: role === 'leader',
      canViewAllStages: role === 'leader'
    }
  };
}

/**
 * 按令牌载荷补齐当前登录者信息。
 *
 * /auth/me 之前直接回显令牌内容，缺少 teamName / canViewAllStages 等字段，
 * 前端刷新后用它覆盖本地缓存会丢掉这些信息。这里按令牌里的身份重新查库补全，
 * 与登录接口返回的结构保持一致。
 */
async function profileOf(payload) {
  if (!payload) throw new AppError('登录状态无效，请重新登录', 401, 401);

  if (payload.role === 'admin') {
    return { role: 'admin', username: payload.username || ADMIN_USERNAME, name: payload.name || '系统管理员' };
  }

  const sid = payload.studentId;
  if (!sid) throw new AppError('登录状态无效，请重新登录', 401, 401);

  const team = await db.queryOne(
    'SELECT id, name, leader_name, leader_id, member1_name, member1_id, member2_name, member2_id, status ' +
      'FROM teams WHERE id = ? LIMIT 1',
    [payload.teamId]
  );
  if (!team) throw new AppError('账号已失效，请重新登录', 401, 401);
  if (Number(team.status) !== 1) throw new AppError('该队伍已被禁用，请联系管理员', 403, 403);

  const role = payload.role === 'member' ? 'member' : 'leader';
  const name =
    role === 'leader'
      ? team.leader_name
      : team.member1_id === sid
        ? team.member1_name
        : team.member2_name;

  return {
    role,
    studentId: sid,
    teamId: team.id,
    teamName: team.name,
    name: name || payload.name || '',
    isLeader: role === 'leader',
    canViewAllStages: role === 'leader'
  };
}

module.exports = { adminLogin, studentLogin, profileOf, ADMIN_USERNAME, ADMIN_DEFAULT_PASSWORD };
