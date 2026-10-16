import axios from 'axios';
import { ElMessage } from 'element-plus';

const TOKEN_KEY = 'ip_token';
const USER_KEY = 'ip_user';
// 访客身份持久化（追加文档 1: B方案 localStorage 记住）
const GUEST_KEY = 'ip_guest';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setAuth(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user || {}));
}

export function getUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch (e) { return null; }
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

/** 无密钥访客身份：按聊天室分别记住 */
export function getGuest(roomId) {
  try {
    const all = JSON.parse(localStorage.getItem(GUEST_KEY) || '{}');
    return all[String(roomId)] || null;
  } catch (e) { return null; }
}

export function setGuest(roomId, guest) {
  let all = {};
  try { all = JSON.parse(localStorage.getItem(GUEST_KEY) || '{}'); } catch (e) { all = {}; }
  all[String(roomId)] = guest;
  localStorage.setItem(GUEST_KEY, JSON.stringify(all));
}

const http = axios.create({
  baseURL: '/platform-api',
  timeout: 30000
});

/**
 * 取出当前聊天室会话的邀请码。
 *
 * 题库检索对访客的准入依据是「持有效邀请码的聊天室成员」（project.md 6.3），
 * 因此未登录访客请求时需要带上该邀请码。
 */
export function getInviteCode() {
  try {
    const s = JSON.parse(localStorage.getItem('chat_session') || 'null');
    return (s && s.inviteCode) || '';
  } catch (e) { return ''; }
}

http.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = 'Bearer ' + token;
  } else {
    // 未登录访客：带上邀请码以便按聊天室成员身份访问题库
    const code = getInviteCode();
    if (code) config.headers['X-Invite-Code'] = code;
  }
  return config;
});

http.interceptors.response.use(
  (res) => {
    if (res.config && res.config.responseType === 'blob') return res;
    const body = res.data;
    if (body && typeof body === 'object' && 'code' in body) {
      if (body.code === 0) return body.data;
      ElMessage.error(body.message || '请求失败');
      return Promise.reject(new Error(body.message || '请求失败'));
    }
    return body;
  },
  (error) => {
    const status = error.response?.status;
    const message = error.response?.data?.message || error.message || '网络异常';
    const url = error.config?.url || '';
    // 密钥登录自身的 401 是"密钥无效"，不是会话过期
    const isLoginRequest = /\/auth\/login/.test(url);
    // 未登录访客访问题库时的 401 是"请先登录"，不应清会话并跳转
    const isGuestQuestionRequest = !getToken() && /\/questions/.test(url);

    if (status === 401 && !isLoginRequest && !isGuestQuestionRequest) {
      clearAuth();
      ElMessage.error('登录已过期，请重新登录');
      setTimeout(() => { window.location.href = '/platform/'; }, 600);
    } else {
      ElMessage.error(message);
    }
    return Promise.reject(error);
  }
);

export default http;
