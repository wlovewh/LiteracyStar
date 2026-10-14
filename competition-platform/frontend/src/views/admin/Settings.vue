<template>
  <div v-loading="loading">
    <div class="page-header">
      <h2 class="page-title">系统设置</h2>
      <el-button :icon="Refresh" @click="load">刷新</el-button>
    </div>

    <div class="app-card section-card">
      <h3 class="section-title">服务状态</h3>
      <el-descriptions :column="2" border>
        <el-descriptions-item label="运行环境">{{ data.env }}</el-descriptions-item>
        <el-descriptions-item label="服务端口">{{ data.port }}</el-descriptions-item>
        <el-descriptions-item label="MySQL 连接">
          <el-tag :type="data.database?.connected ? 'primary' : 'danger'" effect="plain" size="small">
            {{ data.database?.connected ? '正常' : '异常' }}
          </el-tag>
          <span class="text-sub detail-text">{{ data.database?.host }}:{{ data.database?.port }}/{{ data.database?.name }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="Redis 连接">
          <el-tag :type="data.redis?.driver === 'redis' ? 'primary' : 'warning'" effect="plain" size="small">
            {{ data.redis?.driver === 'redis' ? '正常（ZSET）' : '降级（内存）' }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="排行榜推送间隔">{{ data.rankPushIntervalMs }} 毫秒</el-descriptions-item>
        <el-descriptions-item label="切屏阈值">
          切屏 {{ data.cheat?.maxSwitchCount }} 次 或 累计 {{ data.cheat?.maxSwitchSeconds }} 秒
        </el-descriptions-item>
      </el-descriptions>

      <el-alert
        v-if="data.redis && data.redis.driver !== 'redis'"
        type="warning"
        :closable="false"
        show-icon
        class="status-alert"
        title="Redis 当前不可用，排行榜已自动降级为内存实现"
      >
        <div>内存模式功能完整，但服务重启后排名数据会丢失。生产部署请确保 Redis 正常运行。</div>
        <div v-if="data.redis.lastError" class="text-sub">原因：{{ data.redis.lastError }}</div>
      </el-alert>
    </div>

    <div class="app-card section-card">
      <h3 class="section-title">排行榜维护</h3>
      <p class="text-sub">若排行榜数据异常（如 Redis 重启导致数据丢失），可从数据库重建指定环节的排行榜。</p>
      <div class="rebuild-row">
        <el-select v-model="rebuildStageId" placeholder="选择环节" style="width: 300px">
          <el-option v-for="s in stages" :key="s.id" :label="s.name" :value="s.id" />
        </el-select>
        <el-button type="primary" :loading="rebuilding" :disabled="!rebuildStageId" @click="handleRebuild">重建排行榜</el-button>
      </div>
    </div>

    <div class="app-card section-card">
      <h3 class="section-title">系统日志</h3>
      <el-table :data="logs" size="small" max-height="360" empty-text="暂无日志">
        <el-table-column label="时间" width="180">
          <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
        </el-table-column>
        <el-table-column label="级别" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="row.level === 'error' ? 'danger' : (row.level === 'warn' ? 'warning' : 'info')" effect="plain" size="small">
              {{ row.level }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="模块" prop="module" width="120" />
        <el-table-column label="内容" prop="message" min-width="300" show-overflow-tooltip />
      </el-table>
    </div>

    <div class="app-card">
      <h3 class="section-title">环境变量配置</h3>
      <p class="text-sub">敏感配置请修改后端 <code>backend/.env</code> 文件后重启服务。</p>
      <el-table :data="envRows" size="small">
        <el-table-column label="变量名" prop="key" width="220" />
        <el-table-column label="说明" prop="desc" />
      </el-table>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { Refresh } from '@element-plus/icons-vue';
import { adminApi, eventApi } from '@/api';
import { formatDateTime } from '@/utils/format';

const loading = ref(false);
const rebuilding = ref(false);
const data = ref({});
const logs = ref([]);
const stages = ref([]);
const rebuildStageId = ref(null);

const envRows = [
  { key: 'PORT', desc: '后端服务端口，默认 3000' },
  { key: 'DB_HOST / DB_PORT', desc: 'MySQL 地址与端口' },
  { key: 'DB_USER / DB_PASSWORD', desc: 'MySQL 账号与密码' },
  { key: 'DB_NAME', desc: '数据库名，默认 info_literacy' },
  { key: 'REDIS_HOST / REDIS_PORT', desc: 'Redis 地址与端口，用于排行榜 ZSET' },
  { key: 'REDIS_DISABLED', desc: '设为 true 可强制使用内存排行榜' },
  { key: 'JWT_SECRET', desc: 'JWT 签名密钥，生产环境务必修改' },
  { key: 'JWT_EXPIRES_IN', desc: '登录有效期，默认 12h' },
  { key: 'CORS_ORIGIN', desc: '允许的前端来源，多个用逗号分隔' }
];

async function load() {
  loading.value = true;
  try {
    const [s, l] = await Promise.all([adminApi.settings(), adminApi.systemLogs({ pageSize: 50 })]);
    data.value = s;
    logs.value = l.list || [];
  } catch (e) {
    /* 拦截器已提示 */
  } finally {
    loading.value = false;
  }
}

async function loadStages() {
  try {
    const events = await eventApi.list();
    if (!events.length) return;
    stages.value = await eventApi.stages(events[0].id);
  } catch (e) {
    /* 拦截器已提示 */
  }
}

async function handleRebuild() {
  rebuilding.value = true;
  try {
    const res = await adminApi.rebuildRank(rebuildStageId.value);
    ElMessage.success('排行榜已重建，共 ' + res.teams + ' 支队伍');
  } catch (e) {
    /* 拦截器已提示 */
  } finally {
    rebuilding.value = false;
  }
}

onMounted(() => {
  load();
  loadStages();
});
</script>

<style scoped>
.section-card {
  margin-bottom: var(--sp);
}

.section-title {
  font-size: 16px;
  color: var(--c-primary);
  margin: 0 0 14px;
}

.detail-text {
  margin-left: 10px;
}

.status-alert {
  margin-top: var(--sp);
  border-radius: var(--r-btn);
  line-height: 1.9;
}

.rebuild-row {
  display: flex;
  gap: var(--sp-tight);
  align-items: center;
}

code {
  background: var(--c-bg-sub);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
}
</style>
