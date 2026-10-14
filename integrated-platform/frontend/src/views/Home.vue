<template>
  <div class="app-container">
    <!-- 欢迎区 -->
    <section class="hero app-card">
      <h1 class="hero-title">信息素养大赛综合平台</h1>
      <p class="hero-sub">
        资源收录 · 题库检索 · 团队协作 —— 备赛所需工具集中在一处
      </p>
      <div class="hero-actions">
        <el-button type="primary" @click="$router.push('/resources')">浏览资源收录</el-button>
        <el-button @click="$router.push('/questions')">进入题库检索</el-button>
        <el-button @click="$router.push('/chat')">团队协作答题</el-button>
      </div>
    </section>

    <!-- 功能入口 -->
    <section class="feature-grid">
      <div v-for="f in features" :key="f.path" class="feature-card app-card" @click="$router.push(f.path)">
        <div class="feature-head">
          <el-icon class="feature-icon"><component :is="f.icon" /></el-icon>
          <span class="feature-name">{{ f.name }}</span>
        </div>
        <p class="feature-desc">{{ f.desc }}</p>
      </div>
    </section>

    <!-- 资源分类概览 -->
    <section class="app-card">
      <div class="page-header">
        <div class="page-title">资源分类概览</div>
        <el-button link type="primary" @click="$router.push('/resources')">查看全部</el-button>
      </div>
      <div v-loading="loading" class="category-grid">
        <div
          v-for="c in categories"
          :key="c.id"
          class="category-chip"
          @click="$router.push({ path: '/resources', query: { category: c.id } })"
        >
          <span class="category-name">{{ c.name }}</span>
          <span class="category-count">{{ c.site_count }} 个网站</span>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { resourceApi } from '@/api';

const categories = ref([]);
const loading = ref(false);

const features = [
  { name: '资源收录', path: '/resources', icon: 'Collection', desc: '九大分类的学术、政府、检索与学习资源，一键直达' },
  { name: '题库检索', path: '/questions', icon: 'Search', desc: '按题干、模块、题型、难度快速定位题目与解析' },
  { name: '团队协作', path: '/chat', icon: 'ChatDotRound', desc: '三人聊天室实时讨论，题目卡片与答案冲突提醒' }
];

onMounted(async () => {
  loading.value = true;
  try {
    categories.value = await resourceApi.categories({ withSites: 1 });
  } catch (e) {
    /* 错误已提示 */
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.hero { text-align: center; padding: 48px 24px; margin-bottom: var(--sp); }
.hero-title { font-size: 32px; margin-bottom: 12px; }
.hero-sub { color: var(--c-text-sub); font-size: var(--f-base); margin: 0 0 24px; }
.hero-actions { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }

.feature-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: var(--sp);
  margin-bottom: var(--sp);
}

.feature-card { cursor: pointer; transition: border-color .2s ease, box-shadow .2s ease; }
.feature-card:hover { border-color: var(--c-primary-2); box-shadow: 0 4px 14px rgba(26,58,92,.12); }
.feature-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.feature-icon { font-size: 22px; color: var(--c-primary-2); }
.feature-name { font-size: var(--f-md); font-weight: 600; color: var(--c-primary); }
.feature-desc { color: var(--c-text-sub); font-size: var(--f-sm); line-height: 1.7; margin: 0; }

.category-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
}

.category-chip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 14px 16px;
  background: var(--c-bg);
  border: 1px solid var(--c-border);
  border-radius: var(--r-btn);
  cursor: pointer;
  transition: background-color .18s ease, border-color .18s ease;
}

.category-chip:hover { background: var(--c-selected); border-color: var(--c-primary-2); }
.category-name { font-size: var(--f-sm); color: var(--c-text); font-weight: 500; }
.category-count { font-size: var(--f-xs); color: var(--c-text-sub); white-space: nowrap; }
</style>
