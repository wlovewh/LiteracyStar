'use strict';
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
let pass = 0, fail = 0;
const issues = [];
function check(name, cond, detail) { if (cond) pass++; else { fail++; issues.push(name + (detail ? ' :: ' + detail : '')); } }

function read(p) { try { return fs.readFileSync(path.join(root, p), 'utf8'); } catch (e) { return ''; } }

console.log('=== project.md 11.5 禁止事项 ===');
// 扫描前端源码中的 emoji 与绿色系
function walk(dir, out = []) {
  for (const f of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = dir + '/' + f.name;
    if (f.isDirectory()) walk(rel, out);
    else if (/\.(vue|js|css)$/.test(f.name)) out.push(rel);
  }
  return out;
}
const files = walk('frontend/src');
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;
const GREEN = /#(00FF00|4CAF50|2E7D32|27AE60|00C853|388E3C|43A047|66BB6A|81C784|A5D6A7)/i;

let emojiHits = [], greenHits = [];
for (const f of files) {
  const txt = read(f);
  const lines = txt.split('\n');
  lines.forEach((l, i) => {
    if (EMOJI.test(l)) emojiHits.push(f + ':' + (i + 1) + ' ' + l.trim().slice(0, 80));
    if (GREEN.test(l)) greenHits.push(f + ':' + (i + 1) + ' ' + l.trim().slice(0, 80));
  });
}
check('前端无 emoji', emojiHits.length === 0, emojiHits.join(' | '));
check('前端无绿色系', greenHits.length === 0, greenHits.join(' | '));

console.log('=== project.md 11.6 底部版权 ===');
const copyright = '© 2026 空城星梦筏 · All Rights Reserved';
check('AppFooter 含版权声明', read('frontend/src/components/AppFooter.vue').includes(copyright));
const studentLayout = read('frontend/src/layouts/StudentLayout.vue');
const adminLayout = read('frontend/src/layouts/AdminLayout.vue');
check('学生布局引入 AppFooter', studentLayout.includes('AppFooter'));
check('管理布局引入 AppFooter', adminLayout.includes('AppFooter'));
check('登录页含版权', read('frontend/src/views/Login.vue').includes('AppFooter'));
check('管理员登录页含版权', read('frontend/src/views/AdminLogin.vue').includes('AppFooter'));

console.log('=== project.md 12 页面路由 ===');
const router = read('frontend/src/router/index.js');
const requiredRoutes = [
  "path: '/login'", "path: ''", "stage/:id/ready", "stage/:id/answer", "stage/:id/result",
  "stage/:id/wrong", "stage/:id/rank", "path: '/admin'", "events", "questions", "teams",
  "stats", "cheat-logs", "settings"
];
requiredRoutes.forEach((r) => check('路由含 ' + r, router.includes(r)));

console.log('=== project.md 7.4 防复制 ===');
const antiCheat = read('frontend/src/utils/useAntiCheat.js');
['copy', 'cut', 'contextmenu', 'dragstart', 'selectstart'].forEach((ev) =>
  check('监听 ' + ev + ' 事件', antiCheat.includes("'" + ev + "'")));
check('监听 visibilitychange (7.5)', antiCheat.includes('visibilitychange'));
check('监听 blur (7.5)', antiCheat.includes("'blur'"));
check('阈值 3 次 / 30 秒 (7.5)', antiCheat.includes('maxSwitchCount = 3') || antiCheat.includes('?? 3'));
const theme = read('frontend/src/styles/theme.css');
check('user-select: none (7.4)', theme.includes('user-select: none'));

console.log('=== project.md 8.2 排行榜 ===');
const rankSvc = read('backend/src/services/rankService.js');
check('使用 ZADD', rankSvc.includes('zadd'));
check('复合 score 公式', rankSvc.includes('compositeScore'));
const scoring = read('backend/src/services/scoringService.js');
check('score * 1000000 - timeSpent', scoring.includes('1000000'));
const examCtrl = read('backend/src/controllers/examController.js');
check('SSE stream 端点', examCtrl.includes('text/event-stream'));
check('每 3 秒推送', examCtrl.includes('3000'));

console.log('=== project.md 3.2 配置字段完整性 ===');
const cfgSrc = read('backend/src/config/stageConfig.js');
['mode','questionConfig','scoreConfig','timeConfig','specialConfig','paperStrategy','moduleFilter','difficultyFilter',
 'shuffleOptions','singleScore','multipleScore','judgeScore','wrongDeduct','wrongDeductScore','unansweredDeduct',
 'openedNotSubmitDeduct','totalTime','perQuestionTime','speedRanking','speedRankingPercent','speedRankingRoundUp',
 'timeAccumulate','firstPlayersNoDeduct','allowSkip','allowReturn','questionDifferent'
].forEach((f) => check('配置字段 ' + f, cfgSrc.includes(f)));

console.log('=== project.md 3.1 数据表 ===');
const initSql = read('database/init.sql');
['events','stages','questions','teams','answers','stage_scores','cheat_logs'].forEach((t) =>
  check('表 ' + t, new RegExp('CREATE TABLE ' + t + '\\b').test(initSql)));

console.log('');
console.log('AUDIT RESULT: ' + pass + ' passed, ' + fail + ' failed');
if (issues.length) { console.log('ISSUES:'); issues.forEach((i) => console.log('  - ' + i)); }
process.exit(fail ? 1 : 0);
