<template>
  <div>
    <!-- 分类与网站并排管理 -->
    <div class="mgmt-layout">
      <!-- 左：分类列表 -->
      <div class="app-card cat-panel">
        <div class="panel-head">
          <span class="panel-title">资源分类</span>
          <el-button size="small" type="primary" @click="openCatDialog()">新增</el-button>
        </div>
        <div class="cat-list">
          <div
            v-for="(c, ci) in categories"
            :key="c.id"
            class="cat-item"
            :class="{ 'is-active': activeCat === c.id }"
            @click="selectCat(c.id)"
          >
            <span class="cat-name">{{ c.name }}</span>
            <span class="cat-count">{{ c.site_count }}</span>
            <span class="cat-ops" @click.stop>
              <el-button
                link
                type="primary"
                size="small"
                :disabled="ci === 0"
                :loading="sortingCat === c.id"
                @click="moveCategory(ci, -1)"
              >上移</el-button>
              <el-button
                link
                type="primary"
                size="small"
                :disabled="ci === categories.length - 1"
                :loading="sortingCat === c.id"
                @click="moveCategory(ci, 1)"
              >下移</el-button>
            </span>
          </div>
        </div>
      </div>

      <!-- 右：网站管理 -->
      <div class="app-card site-panel">
        <div class="panel-head">
          <span class="panel-title">
            网站管理
            <span class="text-sub">（{{ activeCatName }}）</span>
          </span>
          <div class="panel-actions">
            <el-input
              v-model="siteKeyword"
              placeholder="搜索网站"
              size="small"
              clearable
              style="width: 160px"
              @keyup.enter="loadSites"
            />
            <el-button size="small" @click="loadSites">查询</el-button>
            <el-button size="small" type="primary" @click="openSiteDialog()">新增网站</el-button>
          </div>
        </div>

        <el-table v-loading="loading" :data="sites" stripe style="width: 100%">
          <el-table-column label="图标" width="80">
            <template #default="{ row }">
              <div class="tbl-icon">
                <img v-if="row.icon_url" :src="row.icon_url" alt="" @error="onIconError" />
                <span v-else>{{ (row.name || '?').charAt(0) }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="name" label="网站名称" min-width="150" />
          <el-table-column prop="url" label="网址" min-width="200" show-overflow-tooltip />
          <el-table-column prop="description" label="简介" min-width="180" show-overflow-tooltip />
          <el-table-column prop="visit_count" label="访问" width="80" />
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <el-tag :type="row.status === 1 ? 'primary' : 'info'" effect="plain" size="small">
                {{ row.status === 1 ? '启用' : '禁用' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="排序" width="130" align="center">
            <template #default="{ row }">
              <el-button link type="primary" size="small" :disabled="row.sort_order <= 0" @click="bumpSiteSort(row, -1)">减小</el-button>
              <el-button link type="primary" size="small" @click="bumpSiteSort(row, 1)">增大</el-button>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="180" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" size="small" @click="openSiteDialog(row)">编辑</el-button>
              <el-button link type="primary" size="small" @click="openIconDialog(row)">图标</el-button>
              <el-button link type="danger" size="small" @click="removeSite(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>

        <AppPager
          v-model:page="page"
          v-model:page-size="pageSize"
          :total="total"
          @update:page="loadSites"
          @update:page-size="loadSites"
        />
      </div>
    </div>

    <!-- 分类弹窗 -->
    <el-dialog v-model="catDialog" :title="catForm.id ? '分类排序设置' : '新增分类'" width="440px">
      <el-form :model="catForm" label-width="90px">
        <el-form-item label="分类名称" required>
          <!-- 已有分类的名称不可修改（分类名是稳定标识，改名会让学生端已收藏的入口失效） -->
          <el-input
            v-model="catForm.name"
            :disabled="!!catForm.id"
            placeholder="例如：学术信息资源"
          />
          <span v-if="catForm.id" class="field-hint">分类名称创建后不可修改</span>
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="catForm.sortOrder" :min="0" :max="999" />
        </el-form-item>
        <el-form-item label="状态">
          <el-switch v-model="catForm.status" :active-value="1" :inactive-value="0" active-text="启用" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="catDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveCategory">保存</el-button>
      </template>
    </el-dialog>

    <!-- 网站弹窗 -->
    <el-dialog v-model="siteDialog" :title="siteForm.id ? '编辑网站' : '新增网站'" width="560px">
      <el-form :model="siteForm" label-width="90px">
        <el-form-item label="所属分类" required>
          <el-select v-model="siteForm.categoryId" placeholder="请选择分类" style="width: 100%">
            <el-option v-for="c in categories" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="网站名称" required>
          <el-input v-model="siteForm.name" placeholder="例如：中国知网" />
        </el-form-item>
        <el-form-item label="网址" required>
          <el-input v-model="siteForm.url" placeholder="https://" />
        </el-form-item>
        <el-form-item label="简介">
          <el-input v-model="siteForm.description" type="textarea" :rows="2" placeholder="一句话说明该资源的用途" />
        </el-form-item>
        <el-form-item label="图标">
          <div class="icon-editor">
            <div class="icon-preview">
              <img v-if="siteForm.iconUrl" :src="siteForm.iconUrl" alt="" @error="onIconError" />
              <span v-else>无</span>
            </div>
            <div class="icon-actions">
              <input
                ref="fileInput"
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml,image/x-icon"
                style="display: none"
                @change="onFilePicked"
              />
              <el-button size="small" :loading="uploading" @click="fileInput && fileInput.click()">上传图标</el-button>
              <el-button v-if="siteForm.iconUrl" size="small" link type="danger" @click="siteForm.iconUrl = ''">移除</el-button>
            </div>
            <div class="text-sub">支持 PNG / JPG / GIF / WEBP / SVG / ICO，不超过 2MB；留空则自动使用站点 favicon</div>
          </div>
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="siteForm.sortOrder" :min="0" :max="999" />
        </el-form-item>
        <el-form-item label="状态">
          <el-switch v-model="siteForm.status" :active-value="1" :inactive-value="0" active-text="启用" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="siteDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveSite">保存</el-button>
      </template>
    </el-dialog>

    <!-- 单独上传图标弹窗 -->
    <el-dialog v-model="iconDialog" title="上传网站图标" width="420px">
      <div class="icon-editor">
        <div class="icon-preview">
          <img v-if="iconTarget && iconTarget.icon_url" :src="iconTarget.icon_url" alt="" @error="onIconError" />
          <span v-else>无</span>
        </div>
        <input
          ref="iconInput"
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml,image/x-icon"
          style="display: none"
          @change="onIconPicked"
        />
        <el-button type="primary" :loading="uploading" @click="iconInput && iconInput.click()">选择并上传</el-button>
      </div>
      <template #footer>
        <el-button @click="iconDialog = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { resourceApi } from '@/api';
import AppPager from '@/components/AppPager.vue';

const emit = defineEmits(['changed']);

const categories = ref([]);
const sites = ref([]);
const loading = ref(false);
const saving = ref(false);
const uploading = ref(false);

const activeCat = ref(null);
const siteKeyword = ref('');
const page = ref(1);
const pageSize = ref(10);
const total = ref(0);

const catDialog = ref(false);
const catForm = ref({ id: null, name: '', sortOrder: 0, status: 1 });
// 正在调整排序的分类 id（用于按钮 loading，避免重复点击）
const sortingCat = ref(null);

const siteDialog = ref(false);
const siteForm = ref(emptySite());

const iconDialog = ref(false);
const iconTarget = ref(null);
const fileInput = ref(null);
const iconInput = ref(null);

const activeCatName = computed(() => {
  if (!activeCat.value) return '全部分类';
  const c = categories.value.find((x) => x.id === activeCat.value);
  return c ? c.name : '全部分类';
});

function emptySite() {
  return { id: null, categoryId: null, name: '', url: '', description: '', iconUrl: '', sortOrder: 0, status: 1 };
}

function onIconError(e) {
  e.target.style.display = 'none';
}

async function loadCategories() {
  try {
    categories.value = await resourceApi.categories({ withSites: 1, all: 1 });
  } catch (e) { /* 错误已提示 */ }
}

async function loadSites() {
  loading.value = true;
  try {
    const data = await resourceApi.sites({
      categoryId: activeCat.value || undefined,
      keyword: siteKeyword.value || undefined,
      page: page.value,
      pageSize: pageSize.value,
      all: 1
    });
    sites.value = data.list;
    total.value = data.total;
  } catch (e) { /* 错误已提示 */ } finally {
    loading.value = false;
  }
}

function selectCat(id) {
  activeCat.value = activeCat.value === id ? null : id;
  page.value = 1;
  loadSites();
}

function openCatDialog(row) {
  catForm.value = row
    ? { id: row.id, name: row.name, sortOrder: row.sort_order, status: row.status }
    : { id: null, name: '', sortOrder: 0, status: 1 };
  catDialog.value = true;
}

async function saveCategory() {
  if (!catForm.value.name.trim()) return ElMessage.warning('请填写分类名称');
  saving.value = true;
  try {
    const payload = { name: catForm.value.name, sortOrder: catForm.value.sortOrder, status: catForm.value.status };
    if (catForm.value.id) await resourceApi.updateCategory(catForm.value.id, payload);
    else await resourceApi.createCategory(payload);
    ElMessage.success('保存成功');
    catDialog.value = false;
    await loadCategories();
    emit('changed');
  } catch (e) { /* 错误已提示 */ } finally {
    saving.value = false;
  }
}

/**
 * 分类上移 / 下移。
 *
 * 排序值按列表顺序重新分配（0,1,2...），保证连续且唯一，
 * 避免手工输入的数字出现重复或空洞导致排序不稳定。
 */
async function moveCategory(index, delta) {
  const next = index + delta;
  if (next < 0 || next >= categories.value.length) return;

  const list = categories.value.slice();
  const [moved] = list.splice(index, 1);
  list.splice(next, 0, moved);

  sortingCat.value = moved.id;
  try {
    // 后端按传入的 id 顺序整体重排，避免逐个提交产生中间态
    await resourceApi.reorderCategories(list.map((c) => c.id));
    await loadCategories();
    ElMessage.success('排序已更新');
    emit('changed');
  } catch (e) {
    /* 错误已提示 */
  } finally {
    sortingCat.value = null;
  }
}

/** 网站排序值 ±1（减小 / 增大按钮） */
async function bumpSiteSort(row, delta) {
  const next = Math.max(0, Number(row.sort_order || 0) + delta);
  if (next === Number(row.sort_order || 0)) return;
  try {
    await resourceApi.updateSite(row.id, {
      categoryId: row.category_id,
      name: row.name,
      url: row.url,
      description: row.description,
      iconUrl: row.icon_url,
      sortOrder: next,
      status: row.status
    });
    row.sort_order = next;
    await loadSites();
    ElMessage.success('排序值已更新为 ' + next);
  } catch (e) {
    /* 错误已提示 */
  }
}

function openSiteDialog(row) {
  siteForm.value = row
    ? {
        id: row.id, categoryId: row.category_id, name: row.name, url: row.url,
        description: row.description || '', iconUrl: row.icon_url || '',
        sortOrder: row.sort_order, status: row.status
      }
    : emptySite();
  if (!row && activeCat.value) siteForm.value.categoryId = activeCat.value;
  siteDialog.value = true;
}

async function saveSite() {
  if (!siteForm.value.name.trim()) return ElMessage.warning('请填写网站名称');
  if (!siteForm.value.url.trim()) return ElMessage.warning('请填写网址');
  if (!siteForm.value.categoryId) return ElMessage.warning('请选择所属分类');

  saving.value = true;
  try {
    const payload = {
      categoryId: siteForm.value.categoryId,
      name: siteForm.value.name,
      url: siteForm.value.url,
      description: siteForm.value.description,
      iconUrl: siteForm.value.iconUrl,
      sortOrder: siteForm.value.sortOrder,
      status: siteForm.value.status
    };
    if (siteForm.value.id) await resourceApi.updateSite(siteForm.value.id, payload);
    else await resourceApi.createSite(payload);
    ElMessage.success('保存成功');
    siteDialog.value = false;
    await Promise.all([loadCategories(), loadSites()]);
    emit('changed');
  } catch (e) { /* 错误已提示 */ } finally {
    saving.value = false;
  }
}

async function removeSite(row) {
  try {
    await ElMessageBox.confirm('确定删除「' + row.name + '」吗？', '删除确认', { type: 'warning' });
  } catch (e) { return; }
  try {
    await resourceApi.removeSite(row.id);
    ElMessage.success('已删除');
    await Promise.all([loadCategories(), loadSites()]);
    emit('changed');
  } catch (e) { /* 错误已提示 */ }
}

/** 弹窗内选择图标文件后立即上传并回填 */
async function onFilePicked(ev) {
  const file = ev.target.files && ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  uploading.value = true;
  try {
    const r = await resourceApi.uploadIcon(file, siteForm.value.id || undefined);
    siteForm.value.iconUrl = r.iconUrl;
    ElMessage.success('图标上传成功');
  } catch (e) { /* 错误已提示 */ } finally {
    uploading.value = false;
  }
}

function openIconDialog(row) {
  iconTarget.value = row;
  iconDialog.value = true;
}

async function onIconPicked(ev) {
  const file = ev.target.files && ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  uploading.value = true;
  try {
    const r = await resourceApi.uploadIcon(file, iconTarget.value.id);
    iconTarget.value.icon_url = r.iconUrl;
    ElMessage.success('图标上传成功');
    await loadSites();
  } catch (e) { /* 错误已提示 */ } finally {
    uploading.value = false;
  }
}

onMounted(() => {
  loadCategories();
  loadSites();
});
</script>

<style scoped>
.mgmt-layout {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  gap: var(--sp);
  align-items: start;
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}

.panel-title { font-size: var(--f-base); font-weight: 600; color: var(--c-primary); }
.panel-actions { display: flex; align-items: center; gap: 8px; }

.cat-list { max-height: 520px; overflow-y: auto; }

.cat-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-radius: var(--r-btn);
  cursor: pointer;
  font-size: var(--f-sm);
  margin-bottom: 4px;
}

.cat-item:hover { background: var(--c-bg); }
.cat-item.is-active { background: var(--c-selected); color: var(--c-primary-2); font-weight: 600; }
.cat-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cat-count { font-size: var(--f-xs); color: var(--c-text-sub); }

.tbl-icon {
  width: 32px;
  height: 32px;
  border-radius: var(--r-tag);
  background: var(--c-selected);
  color: var(--c-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--f-xs);
  font-weight: 600;
  overflow: hidden;
}

.tbl-icon img { width: 100%; height: 100%; object-fit: contain; }

.icon-editor { display: flex; flex-direction: column; gap: 10px; align-items: flex-start; }

.icon-preview {
  width: 64px;
  height: 64px;
  border-radius: var(--r-btn);
  background: var(--c-bg);
  border: 1px solid var(--c-border);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--f-xs);
  color: var(--c-text-sub);
  overflow: hidden;
}

.icon-preview img { width: 100%; height: 100%; object-fit: contain; }
.icon-actions { display: flex; gap: 8px; align-items: center; }

@media (max-width: 900px) {
  .mgmt-layout { grid-template-columns: 1fr; }
}
</style>
