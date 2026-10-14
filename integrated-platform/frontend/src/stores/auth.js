import { defineStore } from 'pinia';
import { getToken, getUser, setAuth, clearAuth } from '@/api/http';
import { authApi } from '@/api';

/** 当前登录身份（管理员密钥 / 用户密钥），访客为 null */
export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: getToken(),
    user: getUser()
  }),
  getters: {
    isLoggedIn: (s) => !!s.token,
    isAdmin: (s) => !!s.user && s.user.role === 'admin',
    roleLabel: (s) => {
      if (!s.user) return '访客';
      return s.user.role === 'admin' ? '管理员' : '用户';
    }
  },
  actions: {
    async login(keyValue) {
      const data = await authApi.login(keyValue);
      this.token = data.token;
      this.user = data.user;
      setAuth(data.token, data.user);
      return data.user;
    },
    logout() {
      this.token = '';
      this.user = null;
      clearAuth();
    }
  }
});
