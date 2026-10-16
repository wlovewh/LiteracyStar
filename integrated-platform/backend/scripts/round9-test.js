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

  // ============ 第十二轮：资源分类保护 / 自定义房间码 ============
  console.log('');
  console.log('=== ⑩ 资源分类编辑与删除 ===');
  {
    const cats = await api('GET', '/resources/categories', { token: tk });
    const first = (cats.json.data || [])[0];
    check('存在资源分类', !!first, cats.json.data && cats.json.data.length);

    // 建一个临时分类，专门验证改名 / 删除，避免动到真实数据
    const tmpName = '临时分类' + Date.now().toString().slice(-6);
    const made = await api('POST', '/resources/categories', { token: tk, body: { name: tmpName, sortOrder: 99, status: 1 } });
    check('新建分类', made.json.code === 0, made.json.message);
    const tmpId = made.json.data && made.json.data.id;

    if (tmpId) {
      const renamed = '改名后' + Date.now().toString().slice(-6);
      const re = await api('PUT', '/resources/categories/' + tmpId, { token: tk, body: { name: renamed } });
      check('分类可以改名', re.json.code === 0 && re.json.data.name === renamed, re.json);

      const dup = await api('POST', '/resources/categories', { token: tk, body: { name: renamed } });
      const dupId = dup.json.data && dup.json.data.id;
      const dupTry = await api('PUT', '/resources/categories/' + dupId, { token: tk, body: { name: renamed + 'X' } });
      check('改名后与自身不冲突', dupTry.json.code === 0, dupTry.json);
      if (dupId) await api('DELETE', '/resources/categories/' + dupId, { token: tk });

      // 空分类可以删除
      const del = await api('DELETE', '/resources/categories/' + tmpId, { token: tk });
      check('空分类可以删除', del.json.code === 0, del.json);
      const gone = await api('GET', '/resources/categories', { token: tk });
      check('删除后列表不再包含', !(gone.json.data || []).some((c) => c.id === tmpId), tmpId);
    }

    // 有网站的分类不允许直接删除（避免级联清空）
    if (first) {
      const hasSites = Number(first.site_count) > 0;
      if (hasSites) {
        const del = await api('DELETE', '/resources/categories/' + first.id, { token: tk });
        check('有网站的分类不允许删除', del.json.code !== 0 && del.status === 409, { status: del.status, msg: del.json.message });
      } else {
        check('有网站的分类不允许删除（本环境该分类为空，跳过）', true);
      }
    }

    // 分类整体重排（上移/下移按钮走这个接口）
    const list = (cats.json.data || []).map((c) => c.id);
    if (list.length >= 2) {
      const swapped = list.slice();
      const tmp = swapped[0]; swapped[0] = swapped[1]; swapped[1] = tmp;
      const re = await api('POST', '/resources/categories/reorder', { token: tk, body: { ids: swapped } });
      check('分类重排接口可用', re.json.code === 0, re.json.message);
      const after = await api('GET', '/resources/categories', { token: tk });
      check('重排后顺序已生效', after.json.data[0].id === swapped[0], { got: after.json.data[0].id, expect: swapped[0] });
      // 还原
      await api('POST', '/resources/categories/reorder', { token: tk, body: { ids: list } });
    }
  }

  console.log('');
  console.log('=== ⑪ 自定义房间码 ===');
  {
    const rooms = await api('GET', '/chat/rooms', { token: tk });
    const room = (rooms.json.data && (rooms.json.data.list || rooms.json.data))[0];
    check('存在聊天室', !!room, rooms.json.data);

    if (room) {
      const original = room.invite_code;

      const bad = await api('POST', '/chat/rooms/' + room.id + '/invite', { token: tk, body: { code: 'abc' } });
      check('非 6 位数字被拒绝', bad.json.code !== 0, bad.json);

      const custom = '777888';
      const set = await api('POST', '/chat/rooms/' + room.id + '/invite', { token: tk, body: { code: custom } });
      check('自定义 6 位房间码成功', set.json.code === 0 && set.json.data.inviteCode === custom, set.json);

      const found = await api('GET', '/chat/rooms/by-invite?code=' + custom, { token: tk });
      check('可用自定义码进入房间', found.json.code === 0 && found.json.data.id === room.id, found.json);

      // 还原原房间码
      await api('POST', '/chat/rooms/' + room.id + '/invite', { token: tk, body: { code: original } });
      const restored = await api('GET', '/chat/rooms/' + room.id, { token: tk });
      check('已还原原房间码', restored.json.data.invite_code === original, restored.json.data.invite_code);

      // 随机重生成（不传 code）
      const rand = await api('POST', '/chat/rooms/' + room.id + '/invite', { token: tk, body: {} });
      check('不传 code 时随机重生成', rand.json.code === 0 && /^\d{6}$/.test(rand.json.data.inviteCode), rand.json);
      await api('POST', '/chat/rooms/' + room.id + '/invite', { token: tk, body: { code: original } });
    }
  }

  console.log('');
  console.log('=== ⑫ 资源网站批量导入 ===');
  {
    const catName = '导入测试分类' + Date.now().toString().slice(-6);

    // 通过 rows 数组导入：验证必填校验 + 分类自动创建 + 去重
    const rows = [
      { 所属分类: catName, 网站名称: '测试站A', 网址: 'https://a.example.com', 简介: '说明A', 图标: '', 排序: '1', 状态: '开启' },
      { 所属分类: catName, 网站名称: '测试站B', 网址: 'https://b.example.com', 简介: '', 图标: 'https://cdn.example.com/i.png', 排序: '2', 状态: '关闭' },
      // 重复网址：应被跳过
      { 所属分类: catName, 网站名称: '测试站A重复', 网址: 'https://a.example.com', 简介: '', 图标: '', 排序: '3', 状态: '开启' },
      // 缺必填：应失败
      { 所属分类: catName, 网站名称: '', 网址: 'https://c.example.com', 简介: '', 图标: '', 排序: '', 状态: '' },
      // 缺网址：应失败
      { 所属分类: catName, 网站名称: '测试站D', 网址: '', 简介: '', 图标: '', 排序: '', 状态: '' }
    ];

    const im = await api('POST', '/resources/sites/import', { token: tk, body: { rows } });
    check('批量导入接口可用', im.json.code === 0, im.json.message);
    const r = im.json.data || {};
    check('总行数 5', r.total === 5, r.total);
    check('成功 2 条', r.inserted === 2, r.inserted);
    check('重复跳过 1 条', r.skipped === 1, r.skipped);
    check('失败 2 条', r.failed === 2, r.failed);
    check('自动创建了分类', (r.createdCategories || []).includes(catName), r.createdCategories);
    check('错误信息带行号', (r.errors || []).length === 2 && r.errors.every((e) => e.line >= 2), r.errors);

    // 状态列：关闭 -> status 0
    // all=1 时统计全部网站（含禁用），这里应为 2
    const cats = await api('GET', '/resources/categories?all=1', { token: tk });
    const cat = (cats.json.data || []).find((c) => c.name === catName);
    check('分类已落库', !!cat, catName);
    if (cat) {
      check('分类下 2 个网站', Number(cat.site_count) === 2, cat.site_count);

      const sites = await api('GET', '/resources/sites?categoryId=' + cat.id + '&all=1&pageSize=50', { token: tk });
      const list = (sites.json.data && sites.json.data.list) || [];
      const b = list.find((x) => x.name === '测试站B');
      check('状态「关闭」写入为 0', b && Number(b.status) === 0, b && b.status);
      check('图标链接已写入', b && b.icon_url === 'https://cdn.example.com/i.png', b && b.icon_url);
      const a = list.find((x) => x.name === '测试站A');
      check('排序值已写入', a && Number(a.sort_order) === 1, a && a.sort_order);

      // 清理：先删网站再删分类
      for (const x of list) await api('DELETE', '/resources/sites/' + x.id, { token: tk });
      const del = await api('DELETE', '/resources/categories/' + cat.id, { token: tk });
      check('清理测试分类', del.json.code === 0, del.json.message);
    }

    // 模板下载
    const tpl = await fetch(BASE + '/resources/sites/import-template', { headers: { Authorization: 'Bearer ' + tk } });
    check('模板下载返回 200', tpl.status === 200, tpl.status);
    check('模板为 xlsx 类型', (tpl.headers.get('content-type') || '').includes('spreadsheetml'), tpl.headers.get('content-type'));
    const buf = Buffer.from(await tpl.arrayBuffer());
    check('模板文件非空', buf.length > 500, buf.length);
  }

  console.log('');
  console.log('=== ⑬ 删除聊天室 ===');
  {
    // 建一个临时房间用于删除验证
    // ensureRoom 需要真实队伍 ID（team_id 有外键约束），用现有房间的 team_id 造一个临时房间
    const allRooms = await api('GET', '/chat/rooms', { token: tk });
    const roomList = (allRooms.json.data && (allRooms.json.data.list || allRooms.json.data)) || [];
    const someTeam = roomList.length && roomList[0].team_id ? roomList[0].team_id : 1;
    const mk = await api('POST', '/chat/rooms', {
      body: { teamId: someTeam, name: '删除测试房间' + Date.now().toString().slice(-5) }
    });
    check('创建临时聊天室', mk.json.code === 0, mk.json.message);
    const rid = mk.json.data && (mk.json.data.id || (mk.json.data.room && mk.json.data.room.id));

    if (rid) {
      // 发一条消息，验证删除时一并清理
      await api('POST', '/chat/rooms/' + rid + '/messages', {
        body: { memberKey: 'tester', name: '测试', type: 'message', content: '待删除消息' }
      });

      const before = await api('GET', '/chat/rooms/' + rid, { token: tk });
      check('房间存在', before.json.code === 0, before.json.message);

      const del = await api('DELETE', '/chat/rooms/' + rid, { token: tk });
      check('删除聊天室成功', del.json.code === 0, del.json.message);
      check('返回已清理消息数', del.json.data && del.json.data.messages >= 1, del.json.data);

      const after = await api('GET', '/chat/rooms/' + rid, { token: tk });
      check('删除后房间不存在', after.json.code !== 0, after.json);

      const list = await api('GET', '/chat/rooms', { token: tk });
      const rooms = (list.json.data && (list.json.data.list || list.json.data)) || [];
      check('列表中不再包含', !rooms.some((x) => Number(x.id) === Number(rid)), rid);
    }

    // 非管理员不能删除
    const noAuth = await api('DELETE', '/chat/rooms/1', {});
    check('未登录不能删除聊天室', noAuth.json.code !== 0, noAuth.json);
  }

  console.log('');
  console.log('RESULT: ' + pass + ' passed, ' + fail + ' failed');
  if (fails.length) console.log('FAILED: ' + fails.join(' | '));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
