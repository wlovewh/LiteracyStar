import axios from 'axios';
import { ElMessage } from 'element-plus';

const TOKEN_KEY = 'il_token';
const USER_KEY = 'il_user';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setAuth(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user || {}));
}

export function getUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
  } catch (e) {
    return null;
  }
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

const http = axios.create({
  baseURL: '/api',
  timeout: 30000
});

http.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = 'Bearer ' + token;
  return config;
});

http.interceptors.response.use(
  (res) => {
    // 文件下载直接返回原始响应
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

    // 登录接口自身的 401 属于"账号或密码错误"，不是会话过期，
    // 必须原样提示后端返回的原因，且绝不能触发登出跳转。
    const isLoginRequest = /\/auth\/(admin|student)\/login/.test(url);

    if (status === 401 && !isLoginRequest) {
      clearAuth();
      const onAdminSide = window.location.pathname.startsWith('/admin');
      ElMessage.error('登录已过期，请重新登录');
      setTimeout(() => {
        window.location.href = onAdminSide ? '/admin/login' : '/login';
      }, 600);
    } else {
      ElMessage.error(message);
    }
    return Promise.reject(error);
  }
);

export default http;
