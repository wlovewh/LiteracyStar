import http from './http';

// ---------------- 鉴权与密钥 ----------------
export const authApi = {
  login: (keyValue) => http.post('/auth/login', { keyValue }),
  me: () => http.get('/auth/me'),
  listKeys: (params) => http.get('/auth/keys', { params }),
  generateKey: () => http.get('/auth/keys/generate'),
  createKey: (data) => http.post('/auth/keys', data),
  updateKey: (id, data) => http.put('/auth/keys/' + id, data),
  removeKey: (id) => http.delete('/auth/keys/' + id)
};

// ---------------- 资源收录 ----------------
export const resourceApi = {
  categories: (params) => http.get('/resources/categories', { params }),
  createCategory: (data) => http.post('/resources/categories', data),
  updateCategory: (id, data) => http.put('/resources/categories/' + id, data),
  removeCategory: (id) => http.delete('/resources/categories/' + id),
  reorderCategories: (ids) => http.post('/resources/categories/reorder', { ids }),

  sites: (params) => http.get('/resources/sites', { params }),
  createSite: (data) => http.post('/resources/sites', data),
  updateSite: (id, data) => http.put('/resources/sites/' + id, data),
  removeSite: (id) => http.delete('/resources/sites/' + id),
  trackVisit: (id) => http.post('/resources/sites/' + id + '/visit'),

  // 图标上传
  uploadIcon: (file, siteId) => {
    const fd = new FormData();
    fd.append('icon', file);
    if (siteId) fd.append('siteId', siteId);
    return http.post('/resources/icons', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  removeIcon: (filename) => http.delete('/resources/icons/' + filename)
};

// ---------------- 题库检索 ----------------
export const questionApi = {
  search: (params) => http.get('/questions/search', { params }),
  facets: () => http.get('/questions/facets'),
  detail: (id) => http.get('/questions/' + id),
  extractKeywords: (content) => http.post('/questions/extract-keywords', { content }),
  checkDuplicate: (roomId, content) => http.post('/questions/check-duplicate', { roomId, content }),
  exportCsv: (params) => http.get('/questions/export', { params, responseType: 'blob' }),
  getSettings: () => http.get('/questions/settings'),
  setSettings: (searchEnabled) => http.put('/questions/settings', { searchEnabled }),

  // 题库管理（管理端）
  template: () => http.get('/questions/manage/template'),
  create: (data) => http.post('/questions/manage', data),
  update: (id, data) => http.put('/questions/manage/' + id, data),
  remove: (id) => http.delete('/questions/manage/' + id),
  batchRemove: (ids) => http.post('/questions/manage/batch-remove', { ids }),
  importRows: (rows, skipDuplicate = true) => http.post('/questions/manage/import', { rows, skipDuplicate }),
  importFile: (file, skipDuplicate = true) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('skipDuplicate', skipDuplicate ? '1' : '0');
    return http.post('/questions/manage/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  }
};

// ---------------- 聊天室 ----------------
export const chatApi = {
  ensureRoom: (data) => http.post('/chat/rooms', data),
  byInvite: (code) => http.get('/chat/rooms/by-invite', { params: { code } }),
  rooms: () => http.get('/chat/rooms'),
  room: (id) => http.get('/chat/rooms/' + id),
  updateRoom: (id, data) => http.put('/chat/rooms/' + id, data),
  refreshInvite: (id) => http.post('/chat/rooms/' + id + '/invite'),
  messages: (id, limit) => http.get('/chat/rooms/' + id + '/messages', { params: { limit } }),
  send: (id, data) => http.post('/chat/rooms/' + id + '/messages', data),
  submitAnswer: (id, data) => http.post('/chat/rooms/' + id + '/answer', data),
  searchMessages: (id, keyword) => http.get('/chat/rooms/' + id + '/search', { params: { keyword } }),
  online: (id) => http.get('/chat/rooms/' + id + '/online'),
  heartbeat: (id, data) => http.post('/chat/rooms/' + id + '/heartbeat', data),
  clearRoom: (id) => http.delete('/chat/rooms/' + id + '/messages'),
  deleteMessage: (messageId) => http.delete('/chat/messages/' + messageId),

  phrases: () => http.get('/chat/phrases'),
  createPhrase: (data) => http.post('/chat/phrases', data),
  updatePhrase: (id, data) => http.put('/chat/phrases/' + id, data),
  removePhrase: (id) => http.delete('/chat/phrases/' + id)
};

// ---------------- 管理端 ----------------
export const adminApi = {
  dashboard: () => http.get('/admin/dashboard'),
  stats: (days) => http.get('/admin/stats', { params: { days } }),
  settings: () => http.get('/admin/settings'),
  purgeMessages: () => http.post('/admin/purge-messages')
};