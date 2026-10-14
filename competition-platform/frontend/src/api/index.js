import http from './http';

// ---------------- 鉴权 ----------------
export const authApi = {
  adminLogin: (data) => http.post('/auth/admin/login', data),
  studentLogin: (data) => http.post('/auth/student/login', data),
  me: () => http.get('/auth/me')
};

// ---------------- 赛事 ----------------
export const eventApi = {
  list: (params) => http.get('/events', { params }),
  get: (id) => http.get('/events/' + id),
  create: (data) => http.post('/events', data),
  update: (id, data) => http.put('/events/' + id, data),
  remove: (id) => http.delete('/events/' + id),
  stages: (id) => http.get('/events/' + id + '/stages'),
  createStage: (id, data) => http.post('/events/' + id + '/stages', data),
  reorderStages: (id, ids) => http.put('/events/' + id + '/stages/reorder', { ids }),
  current: (eventId) => http.get('/events/current', { params: eventId ? { eventId } : {} }),
  available: () => http.get('/events/available')
};

// ---------------- 环节 ----------------
export const stageApi = {
  get: (id) => http.get('/stages/' + id),
  update: (id, data) => http.put('/stages/' + id, data),
  remove: (id) => http.delete('/stages/' + id),
  copy: (id) => http.post('/stages/' + id + '/copy'),
  setStatus: (id, status) => http.post('/stages/' + id + '/status', { status }),
  move: (id, direction) => http.post('/stages/' + id + '/move', { direction })
};

// ---------------- 题库 ----------------
export const questionApi = {
  list: (params) => http.get('/questions', { params }),
  facets: () => http.get('/questions/facets'),
  get: (id) => http.get('/questions/' + id),
  create: (data) => http.post('/questions', data),
  update: (id, data) => http.put('/questions/' + id, data),
  remove: (id) => http.delete('/questions/' + id),
  removeMany: (ids) => http.post('/questions/batch-delete', { ids }),
  importFile: (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return http.post('/questions/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  templateUrl: '/api/questions/import/template',
  exportUrl: '/api/questions/export'
};

// ---------------- 队伍 ----------------
export const teamApi = {
  list: (params) => http.get('/teams', { params }),
  get: (id) => http.get('/teams/' + id),
  create: (data) => http.post('/teams', data),
  update: (id, data) => http.put('/teams/' + id, data),
  remove: (id) => http.delete('/teams/' + id),
  removeMany: (ids) => http.post('/teams/batch-delete', { ids }),
  // 清空答题数据，允许队伍重新作答（stageId 可选）
  clearAnswers: (id, stageId) => http.post('/teams/' + id + '/clear-answers', { stageId: stageId || null }),
  importFile: (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return http.post('/teams/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  templateUrl: '/api/teams/import/template',
  exportUrl: '/api/teams/export'
};

// ---------------- 答题 ----------------
export const examApi = {
  ready: (id) => http.get('/stages/' + id + '/ready'),
  start: (id) => http.post('/stages/' + id + '/start'),
  answer: (id, data) => http.post('/stages/' + id + '/answer', data),
  submit: (id, data) => http.post('/stages/' + id + '/submit', data),
  result: (id) => http.get('/stages/' + id + '/result'),
  wrong: (id) => http.get('/stages/' + id + '/wrong'),
  rank: (id) => http.get('/stages/' + id + '/rank')
};

// ---------------- 排行榜 ----------------
export const rankApi = {
  rank: (id) => http.get('/rank/' + id),
  // 排行榜快照（与 SSE 推送结构一致，用于提交答案后立即刷新）
  snapshot: (id) => http.get('/rank/' + id)
};

// ---------------- 预警 ----------------
export const cheatApi = {
  report: (data) => http.post('/cheat/report', data)
};

// ---------------- 管理后台 ----------------
export const adminApi = {
  dashboard: () => http.get('/admin/dashboard'),
  stats: (stageId) => http.get('/admin/stats', { params: { stageId } }),
  cheatLogs: (params) => http.get('/admin/cheat-logs', { params }),
  cheatSummary: () => http.get('/admin/cheat-logs/summary'),
  cheatExportUrl: '/api/admin/cheat-logs/export',
  systemLogs: (params) => http.get('/admin/system-logs', { params }),
  settings: () => http.get('/admin/settings'),
  rebuildRank: (stageId) => http.post('/admin/stages/' + stageId + '/rebuild-rank')
};

export { http };
