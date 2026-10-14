<template>
  <div class="page">
    <div class="exam-shell">
      <div class="page-header">
        <div>
          <h2 class="page-title">实时排行榜</h2>
          <p class="text-sub rank-sub">{{ stageName }}</p>
        </div>
        <div class="toolbar">
          <el-tag :type="connected ? 'primary' : 'info'" effect="plain" size="small">
            <el-icon v-if="connected" class="tag-icon"><Connection /></el-icon>
            {{ connected ? '实时更新中' : '连接中断' }}
          </el-tag>
          <el-button :icon="Refresh" @click="load" :loading="loading">刷新</el-button>
          <el-button :icon="ArrowLeft" @click="router.push('/')">返回首页</el-button>
        </div>
      </div>

      <el-radio-group v-if="hasIndividual" v-model="viewMode" class="view-switch" @change="onSwitchBoard">
        <el-radio-button label="team">队伍总榜</el-radio-button>
        <el-radio-button label="individual">个人榜</el-radio-button>
      </el-radio-group>

      <div class="app-card">
        <el-table
          :data="list"
          v-loading="loading"
          :row-class-name="rowClass"
          stripe
          empty-text="暂无成绩数据"
        >
          <el-table-column label="排名" width="90" align="center">
            <template #default="{ row }">
              <span class="rank-badge" :class="'rank-badge-' + row.rank" v-if="row.rank <= 3">{{ row.rank }}</span>
              <span v-else>{{ row.rank }}</span>
            </template>
          </el-table-column>

          <el-table-column v-if="viewMode === 'team'" label="队伍名称" prop="teamName" min-width="180" />
          <template v-else>
            <el-table-column label="姓名" prop="studentName" min-width="120" />
            <el-table-column label="学号" prop="studentId" min-width="130" />
            <el-table-column label="队伍" prop="teamName" min-width="150" />
          </template>

          <el-table-column label="总分" prop="totalScore" width="120" align="right" sortable>
            <template #default="{ row }">
              <span class="score-cell">{{ row.totalScore }}</span>
            </template>
          </el-table-column>

          <el-table-column label="用时" width="130" align="right">
            <template #default="{ row }">{{ formatDuration(row.totalTime) }}</template>
          </el-table-column>
        </el-table>

        <div class="update-time text-sub">
          最后更新：{{ updatedAt ? formatDateTime(updatedAt) : '-' }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Refresh, ArrowLeft, Connection } from '@element-plus/icons-vue';
import { rankApi } from '@/api';
import { formatDuration, formatDateTime } from '@/utils/format';
import { getToken } from '@/api/http';

const route = useRoute();
const router = useRouter();
const stageId = route.params.id;

const loading = ref(false);
const connected = ref(false);
const list = ref([]);
const updatedAt = ref(null);
const stageName = ref('');
const mode = ref('individual');
const viewMode = ref('team');
// 用户是否手动切过榜单：切过后刷新与实时推送都不再覆盖其选择
const tabTouched = ref(false);

let source = null;
let lastSnapshot = '';

const hasIndividual = computed(() => mode.value !== 'team');

/** 切换榜单：记住用户选择，并重新订阅对应榜单的实时推送 */
function onSwitchBoard() {
  tabTouched.value = true;
  list.value = [];
  lastSnapshot = '';
  load();
  subscribe();
}

function rowClass({ row }) {
  const cls = ['rank-row-' + row.rank];
  // 实时更新时行淡入动画 (8.3)
  if (row.__updated) cls.push('row-updated');
  return cls;
}

async function load() {
  loading.value = true;
  try {
    const data = await rankApi.rank(stageId, viewMode.value);
    stageName.value = data.stage?.name || '';
    mode.value = data.mode;
    // 首次加载按环节默认榜；之后尊重用户手动切换的榜单，不再被覆盖
    if (!tabTouched.value) {
      viewMode.value = data.individual ? 'individual' : 'team';
    }

    const next = data.list || [];
    const key = JSON.stringify(next);
    if (key !== lastSnapshot) {
      // 标记发生变化的行，用于淡入动画
      const prevMap = new Map(list.value.map((r) => [r.teamId + '|' + (r.studentId || ''), r]));
      next.forEach((r) => {
        const k = r.teamId + '|' + (r.studentId || '');
        const prev = prevMap.get(k);
        r.__updated = !prev || prev.totalScore !== r.totalScore;
      });
      lastSnapshot = key;
    }
    list.value = next;
    updatedAt.value = data.updatedAt;
  } catch (e) {
    /* 拦截器已提示 */
  } finally {
    loading.value = false;
  }
}

/** SSE 订阅 (project.md 8.2) —— EventSource 无法设置请求头，改用 query.token */
function subscribe() {
  if (source) source.close();

  const token = getToken();
  const board = viewMode.value === 'team' ? 'team' : 'individual';
  source = new EventSource(
    '/api/rank/stream?stageId=' + stageId + '&board=' + board + '&token=' + encodeURIComponent(token)
  );

  source.onopen = () => { connected.value = true; };

  source.addEventListener('rank', (evt) => {
    connected.value = true;
    try {
      const payload = JSON.parse(evt.data);
      const next = payload.list || [];
      const prevMap = new Map(list.value.map((r) => [r.teamId + '|' + (r.studentId || ''), r]));
      next.forEach((r) => {
        const k = r.teamId + '|' + (r.studentId || '');
        const prev = prevMap.get(k);
        r.__updated = !prev || prev.totalScore !== r.totalScore;
      });
      list.value = next;
      updatedAt.value = payload.updatedAt;
    } catch (e) {
      /* 忽略解析错误 */
    }
  });

  source.onerror = () => {
    connected.value = false;
    // 浏览器会自动重连，无需手动处理
  };
}

onMounted(async () => {
  await load();
  subscribe();
});

onBeforeUnmount(() => {
  if (source) {
    source.close();
    source = null;
  }
});
</script>

<style scoped>
.rank-sub {
  margin: 6px 0 0;
}

.view-switch {
  margin-bottom: var(--sp);
}

.rank-badge {
  display: inline-block;
  width: 26px;
  height: 26px;
  line-height: 26px;
  border-radius: 50%;
  font-weight: 600;
  color: #FFFFFF;
  background: var(--c-text-sub);
}

.rank-badge-1 { background: #D4AF37; }
.rank-badge-2 { background: #A8B0B8; }
.rank-badge-3 { background: #C08457; }

.score-cell {
  font-weight: 600;
  color: var(--c-primary);
  font-variant-numeric: tabular-nums;
}

.tag-icon {
  margin-right: 4px;
  vertical-align: -2px;
}

.update-time {
  margin-top: 12px;
  text-align: right;
}
</style>
