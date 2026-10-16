'use strict';
/** 第九轮：综合平台备份功能验证 */
const BASE = 'http://127.0.0.1:3001/platform-api';
let pass = 0, fail = 0;
const fails = [];
function check(n, c, x) {
  if (c) { pass++; console.log('  PASS ' + n); }
  else { fail++; fails.push(n); console.log('  FAIL ' + n + (x !== undefined ? ' :: ' + JSON.stringify(x).slice(0, 300) : '')); }
}
async function api(m, p, { token, body } = {}) {
  const h = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = 'Bearer ' + token;
  const r = await fetch(BASE + p, { method: m, headers: h, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch (_) {}
  return { status: r.status, json: j };
}
(async () => {
  const lg = await api('POST', '/auth/login', { body: { keyValue: 'ADMIN2026KEY' } });
  if (lg.json.code !== 0) { console.error('管理员登录失败: ' + lg.json.message); process.exit(1); }
  const tk = lg.json.data.token;

  console.log('');
  console.log('=== 备份设置 ===');
  {
    const ov = await api('GET', '/admin/backup', { token: tk });
    check('读取备份总览', ov.json.code === 0, ov.json.message);
    check('返回 config 与 list', ov.json.data.config !== undefined && Array.isArray(ov.json.data.list), Object.keys(ov.json.data || {}));

    const sv = await api('PUT', '/admin/backup/config', { token: tk, body: { enabled: true, hour: 4, minute: 30, keep: 5 } });
    check('保存备份设置', sv.json.code === 0, sv.json.message);
    check('时间已保存 4:30', sv.json.data.hour === 4 && sv.json.data.minute === 30, sv.json.data);
    check('保留份数已保存 5', sv.json.data.keep === 5, sv.json.data);

    const re = await api('GET', '/admin/backup', { token: tk });
    check('重新读取配置一致', re.json.data.config.hour === 4 && re.json.data.config.enabled === true, re.json.data.config);

    // 边界值收敛
    const cl = await api('PUT', '/admin/backup/config', { token: tk, body: { hour: 99, minute: 99, keep: 999 } });
    check('越界时间被收敛到 23:59', cl.json.data.hour === 23 && cl.json.data.minute === 59, cl.json.data);
    check('越界保留份数收敛到 90', cl.json.data.keep === 90, cl.json.data);
  }

  console.log('');
  console.log('=== 手动备份 ===');
  let backupId = null;
  {
    const rb = await api('POST', '/admin/backup/run', { token: tk });
    if (rb.json.code === 0) {
      backupId = rb.json.data.id;
      check('手动备份成功', rb.json.data.status === 'ok', rb.json.data);
      check('备份文件有大小', rb.json.data.fileSize > 0, rb.json.data.fileSize);
      check('文件名以 backup_ 开头', String(rb.json.data.filename).startsWith('backup_'), rb.json.data.filename);

      const ls = await api('GET', '/admin/backup', { token: tk });
      check('列表中出现该备份', (ls.json.data.list || []).some((b) => b.id === backupId), ls.json.data.list.length);

      const dl = await fetch(BASE + '/admin/backup/download/' + rb.json.data.filename, { headers: { Authorization: 'Bearer ' + tk } });
      check('可下载备份文件', dl.status === 200, dl.status);
      const text = await dl.text();
      check('下载内容为 SQL 转储', text.includes('CREATE TABLE') || text.includes('INSERT INTO'), text.slice(0, 80));
    } else {
      check('手动备份成功', false, rb.json.message);
    }
  }

  console.log('');
  console.log('=== 删除备份 ===');
  if (backupId) {
    const rm = await api('DELETE', '/admin/backup/' + backupId, { token: tk });
    check('删除单条备份', rm.json.code === 0, rm.json.message);
    const ls2 = await api('GET', '/admin/backup', { token: tk });
    check('删除后不在列表中', !(ls2.json.data.list || []).some((b) => b.id === backupId), 'still present');
  }

  console.log('');
  console.log('=== 权限 ===');
  {
    const anon = await api('GET', '/admin/backup');
    check('未登录访问备份接口被拒', anon.status === 401 || anon.status === 403, anon.status);
  }

  // 恢复为未启用，避免本地反复生成备份
  await api('PUT', '/admin/backup/config', { token: tk, body: { enabled: false, hour: 3, minute: 0, keep: 7 } });

  console.log('');
  console.log('=== 题库检索准入（第十一轮修复）===');
  {
    // 开关只约束访客；已登录用户始终可检索。
    // 之前的 bug：前端把开关当成"全站开关"，登录后反而看不到题库。
    await api('PUT', '/questions/settings', { token: tk, body: { searchEnabled: true } });

    const anon = await api('GET', '/questions/search?keyword=' + encodeURIComponent('信息'));
    check('匿名访客无邀请码被拒绝', anon.status === 401, { s: anon.status, m: anon.json && anon.json.message });

    const ul = await api('POST', '/auth/login', { body: { keyValue: 'USER2026KEY' } });
    const ut = ul.json.data.token;
    const authed = await api('GET', '/questions/search?keyword=' + encodeURIComponent('信息'), { token: ut });
    check('已登录用户可检索', authed.json.code === 0 && authed.json.data.total > 0, authed.json.message);

    await api('PUT', '/questions/settings', { token: tk, body: { searchEnabled: false } });
    const authed2 = await api('GET', '/questions/search?keyword=' + encodeURIComponent('信息'), { token: ut });
    check('关闭开关后已登录用户仍可检索', authed2.json.code === 0 && authed2.json.data.total > 0, authed2.json.message);
    const anon2 = await api('GET', '/questions/search?keyword=x');
    check('关闭开关后匿名仍被拒绝', anon2.status === 401 || anon2.status === 403, anon2.status);

    // 邀请码访客：开关开启时可用，关闭时不可用
    await api('PUT', '/questions/settings', { token: tk, body: { searchEnabled: true } });
    const room = await api('POST', '/chat/rooms', { token: tk, body: { teamId: 96, name: 'R11 准入测试室' } });
    const rid = room.json.data.id;
    const inv = await api('POST', '/chat/rooms/' + rid + '/invite', { token: tk });
    const code = inv.json.data.inviteCode;

    const guestOk = await fetch(BASE + '/questions/search?keyword=' + encodeURIComponent('信息'), { headers: { 'X-Invite-Code': code } });
    const guestOkJ = await guestOk.json();
    check('持有效邀请码的访客可检索', guestOkJ.code === 0 && guestOkJ.data.total > 0, guestOkJ.message);

    const guestBad = await fetch(BASE + '/questions/search?keyword=x', { headers: { 'X-Invite-Code': '000000' } });
    check('无效邀请码被拒绝', guestBad.status !== 200, guestBad.status);

    await api('PUT', '/questions/settings', { token: tk, body: { searchEnabled: false } });
    const guestOff = await fetch(BASE + '/questions/search?keyword=x', { headers: { 'X-Invite-Code': code } });
    check('关闭开关后邀请码访客被拒绝', guestOff.status === 403, guestOff.status);

    await api('PUT', '/questions/settings', { token: tk, body: { searchEnabled: true } });
    await api('DELETE', '/chat/rooms/' + rid + '/messages', { token: tk });
  }

  console.log('');
  console.log('RESULT: ' + pass + ' passed, ' + fail + ' failed');
  if (fails.length) console.log('FAILED: ' + fails.join(' | '));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
