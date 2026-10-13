import { defineStore } from 'pinia';
import { authApi } from '@/api';
import { setAuth, clearAuth, getToken, getUser } from '@/api/http';

export const useUserStore = defineStore('user', {
  state: () => ({
    token: getToken(),
    user: getUser()
  }),

  getters: {
    isLoggedIn: (s) => !!s.token,
    isAdmin: (s) => s.user?.role === 'admin',
    isLeader: (s) => s.user?.role === 'leader',
    isMember: (s) => s.user?.role === 'member',
    displayName: (s) => s.user?.name || s.user?.username || '未登录',
    // 队长可见全部环节，队员仅可见个人环节 (6.4)
    canViewAllStages: (s) => s.user?.role === 'leader'
  },

  actions: {
    async adminLogin(username, password) {
      const data = await authApi.adminLogin({ username, password });
      this.token = data.token;
      this.user = data.user;
      setAuth(data.token, data.user);
      return data.user;
    },

    async studentLogin(studentId, password) {
      const data = await authApi.studentLogin({ studentId, password });
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
