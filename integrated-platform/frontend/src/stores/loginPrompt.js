import { defineStore } from 'pinia';

/**
 * 密钥登录弹窗的全局开关。
 *
 * 之前由路由 query（needAuth=1）驱动：被守卫拦截后跳回首页并带上 query，
 * 弹窗监听 query 变化。但用户取消后 query 仍留在地址栏，再次点击同一个
 * 受保护模块时路由目标完全相同（都是 /?needAuth=1&...），路由不发生变化，
 * 监听器不会再次触发——表现为「点一次没反应了」。
 *
 * 改为显式状态：任何需要登录的入口调用 requireLogin()，弹窗订阅该状态。
 */
export const useLoginPromptStore = defineStore('loginPrompt', {
  state: () => ({
    visible: false,
    /** 登录成功后要跳回的地址 */
    redirect: ''
  }),

  actions: {
    /** 请求弹出密钥登录框；redirect 为登录成功后应前往的页面 */
    requireLogin(redirect = '') {
      this.redirect = redirect || '';
      this.visible = true;
    },
    close() {
      this.visible = false;
    }
  }
});
