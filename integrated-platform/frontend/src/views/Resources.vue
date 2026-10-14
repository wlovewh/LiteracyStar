<template>
  <div class="app-container">
    <div class="page-header">
      <div>
        <div class="page-title">资源收录</div>
        <div class="text-sub">共 {{ totalSites }} 个资源网站，按分类浏览或直接搜索</div>
      </div>
      <el-button v-if="auth.isAdmin" type="primary" @click="openSiteDialog()">新增网站</el-button>
    </div>

    <div class="resource-layout">
      <!-- 分类侧栏 -->
      <aside class="app-card category-side">
        <div class="side-title">资源分类</div>
        <div
          class="category-item"
          :class="{ 'is-active': activeCategory === null }"
          @click="selectCategory(null)"
        >
          <span>全部资源</span>
          <span class="category-count">{{ totalSites }}</span>
        </div>
        <div
          v-for="c in categories"
          :key="c.id"
          class="category-item"
          :class="{ 'is-active': activeCategory === c.id }"
          @click="selectCategory(c.id)"
        >
          <span class="cat-name">{{ c.name }}</span>
          <span class="category-count">{{ c.site_count }}</span>
        </div>
      </aside>

      <!-- 网站列表 -->
      <section>
        <div class="app-card filter-card">
          <el-form inline>
            <el-form-item label="关键词">
              <el-input
                v-model="keyword"
                placeholder="网站名称 / 简介 / 网址"
                clearable
                style="width: 240px"
                @keyup.enter="handleSearch"
              />
            </el-form-item>
            <el-form-item label="分类">
              <el-select v-model="activeCategory" placeholder="全部分类" clearable style="width: 180px">
                <el-option v-for="c in categories" :key="c.id" :label="c.name" :value="c.id" />
              </el-select>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="handleSearch">查询</el-button>
              <el-button @click="handleReset">重置</el-button>
            </el-form-item>
          </el-form>
        </div>

        <div v-loading="loading">
          <div v-if="sites.length" class="site-grid">
            <div v-for="s in sites" :key="s.id" class="site-card" @click="visit(s)">
              <SiteIcon :name="s.name" :url="s.url" :icon-url="s.icon_url" />
              <div class="site-body">
                <div class="site-name">{{ s.name }}</div>
                <div class="site-desc">{{ s.description || s.url }}</div>
                <div class="site-meta">
                  <el-tag size="small" effect="plain">{{ s.category_name }}</el-tag>
                  <span class="text-sub">访问 {{ s.visit_count }} 次</span>
                  <span v-if="auth.isAdmin" class="admin-actions" @click.stop>
                    <el-button link type="primary" size="small" @click="openSiteDialog(s)">编辑</el-button>
                    <el-button link type="danger" size="small" @click="removeSite(s)">删除</el-button>
                  </span>
                </div>
              </div>
            </div>
          </div>
          <el-empty v-else-if="!loading" description="没有找到匹配的资源网站" />
        </div>

        <AppPager
          v-model:page="page"
          v-model:page-size="pageSize"
          :total="total"
          @update:page="loadSites"
          @update:page-size="handleSearch"
        />
      </section>
    </div>

    <!-- 网站编辑弹窗 -->
    <el-dialog v-model="siteDialog" :title="form.id ? '编辑网站' : '新增网站'" width="520px">
      <el-form :model="form" label-width="90px">
        <el-form-item label="所属分类" required>
          <el-select v-model="form.categoryId" placeholder="请选择分类" style="width: 100%">
            <el-option v-for="c in categories" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="网站名称" required>
          <el-input v-model="form.name" placeholder="例如：中国知网" />
        </el-form-item>
        <el-form-item label="网址" required>
          <el-input v-model="form.url" placeholder="https://" />
        </el-form-item>
        <el-form-item label="简介">
          <el-input v-model="form.description" type="textarea" :rows="2" placeholder="一句话说明该资源的用途" />
        </el-form-item>
        <el-form-item label="图标地址">
          <el-input v-model="form.iconUrl" placeholder="留空则自动使用站点 favicon" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sortOrder" :min="0" :max="999" />
        </el-form-item>
        <el-form-item label="状态">
          <el-switch v-model="form.status" :active-value="1" :inactive-value="0" active-text="启用" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="siteDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveSite">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { resourceApi } from '@/api';
import { useAuthStore } from '@/stores/auth';
import SiteIcon from '@/components/SiteIcon.vue';
import AppPager from '@/components/AppPager.vue';

const route = useRoute();
const auth = useAuthStore();

const categories = ref([]);
const sites = ref([]);
const loading = ref(false);
const keyword = ref('');
const activeCategory = ref(null);
const page = ref(1);
const pageSize = ref(20);
const total = ref(0);
const totalSites = ref(0);

const siteDialog = ref(false);
const saving = ref(false);
const form = ref(emptyForm());

function emptyForm() {
  return { id: null, categoryId: null, name: '', url: '', description: '', iconUrl: '', sortOrder: 0, status: 1 };
}

async function loadCategories() {
  categories.value = await resourceApi.categories({ withSites: 1 });
  totalSites.value = categories.value.reduce((s, c) => s + Number(c.site_count || 0), 0);
}

async function loadSites() {
  loading.value = true;
  try {
    const data = await resourceApi.sites({
      categoryId: activeCategory.value || undefined,
      keyword: keyword.value || undefined,
      page: page.value,
      pageSize: pageSize.value
    });
    sites.value = data.list;
    total.value = data.total;
  } catch (e) {
    /* 错误已提示 */
  } finally {
    loading.value = false;
  }
}

function selectCategory(id) {
  activeCategory.value = id;
  page.value = 1;
  loadSites();
}

function handleSearch() {
  page.value = 1;
  loadSites();
}

function handleReset() {
  keyword.value = '';
  activeCategory.value = null;
  page.value = 1;
  loadSites();
}

/** 记录访问次数后在新标签页打开 */
async function visit(site) {
  try {
    await resourceApi.trackVisit(site.id);
    site.visit_count = Number(site.visit_count) + 1;
  } catch (e) {
    /* 统计失败不影响跳转 */
  }
  window.open(site.url, '_blank', 'noopener');
}

function openSiteDialog(site) {
  form.value = site
    ? {
        id: site.id,
        categoryId: site.category_id,
        name: site.name,
        url: site.url,
        description: site.description || '',
        iconUrl: site.icon_url || '',
        sortOrder: site.sort_order,
        status: site.status
      }
    : emptyForm();
  if (!site && activeCategory.value) form.value.categoryId = activeCategory.value;
  siteDialog.value = true;
}

async function saveSite() {
  if (!form.value.name.trim()) return ElMessage.warning('请填写网站名称');
  if (!form.value.url.trim()) return ElMessage.warning('请填写网址');
  if (!form.value.categoryId) return ElMessage.warning('请选择所属分类');

  saving.value = true;
  try {
    const payload = {
      categoryId: form.value.categoryId,
      name: form.value.name,
      url: form.value.url,
      description: form.value.description,
      iconUrl: form.value.iconUrl,
      sortOrder: form.value.sortOrder,
      status: form.value.status
    };
    if (form.value.id) await resourceApi.updateSite(form.value.id, payload);
    else await resourceApi.createSite(payload);
    ElMessage.success('保存成功');
    siteDialog.value = false;
    await Promise.all([loadCategories(), loadSites()]);
  } catch (e) {
    /* 错误已提示 */
  } finally {
    saving.value = false;
  }
}

async function removeSite(site) {
  try {
    await ElMessageBox.confirm('确定删除「' + site.name + '」吗？', '删除确认', { type: 'warning' });
  } catch (e) {
    return;
  }
  try {
    await resourceApi.removeSite(site.id);
    ElMessage.success('已删除');
    await Promise.all([loadCategories(), loadSites()]);
  } catch (e) {
    /* 错误已提示 */
  }
}

onMounted(async () => {
  if (route.query.category) activeCategory.value = Number(route.query.category);
  await loadCategories();
  await loadSites();
});
</script>

<style scoped>
.side-title { font-size: var(--f-sm); font-weight: 600; color: var(--c-primary); margin-bottom: 12px; }
.cat-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.site-meta { display: flex; align-items: center; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
.admin-actions { margin-left: auto; display: inline-flex; gap: 4px; }
</style>
