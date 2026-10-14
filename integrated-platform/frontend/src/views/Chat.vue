<template>
  <div class="app-container">
    <!-- 入口：未加入聊天室 -->
    <div v-if="!room" class="join-wrap">
      <div class="app-card join-card">
        <div class="page-title">团队协作聊天室</div>
        <p class="join-sub">三人一队，实时讨论题目、共享答案、自动检测答案冲突</p>

        <el-tabs v-model="joinMode">
          <el-tab-pane label="我有邀请码" name="invite">
            <el-form @submit.prevent>
              <el-form-item label="邀请码">
                <el-input
                  v-model="inviteCode"
                  placeholder="请输入 6 位数字邀请码"
                  maxlength="6"
                  @keyup.enter="joinByInvite"
                />
              </el-form-item>
              <el-form-item label="我的称呼">
                <el-input v-model="nickname" placeholder="例如：张三" maxlength="20" />
              </el-form-item>
            </el-form>
            <el-button type="primary" :loading="joining" @click="joinByInvite">加入聊天室</el-button>
          </el-tab-pane>

          <el-tab-pane label="创建/进入本队聊天室" name="team">
            <el-form @submit.prevent>
              <el-form-item label="队伍编号">
                <el-input-number v-model="teamId" :min="1" :max="9999" />
              </el-form-item>
              <el-form-item label="我的称呼">
                <el-input v-model="nickname" placeholder="例如：张三" maxlength="20" />
              </el-form-item>
            </el-form>
            <el-button type="primary" :loading="joining" @click="joinTeamRoom">进入聊天室</el-button>
          </el-tab-pane>
        </el-tabs>
      </div>
    </div>

    <!-- 聊天室主体 -->
    <div v-else class="chat-layout">
      <!-- 成员列表 -->
      <aside class="app-card chat-members">
        <div class="side-title">{{ room.name }}</div>
        <div class="member-list">
          <div v-for="m in onlineMembers" :key="m.key" class="chat-member">
            <span class="status-dot" :class="{ 'is-online': m.online }"></span>
            <span class="member-name">{{ m.name }}</span>
            <span v-if="m.key === myKey" class="text-sub">（我）</span>
          </div>
          <div v-if="!onlineMembers.length" class="text-sub" style="padding: 8px 0">暂无成员在线</div>
        </div>

        <el-divider />
        <div class="invite-box">
          <div class="text-sub">邀请码</div>
          <div class="invite-code">{{ room.invite_code }}</div>
          <el-button size="small" link type="primary" @click="copyInvite">复制邀请码</el-button>
          <el-button size="small" link type="primary" @click="refreshInvite">刷新</el-button>
          <div class="text-sub" style="margin-top: 6px; line-height: 1.5">
            有效期至 {{ formatTime(room.invite_expires_at) }}
          </div>
        </div>

        <el-divider />
        <el-button size="small" @click="leaveRoom">离开聊天室</el-button>
      </aside>

      <!-- 聊天主区 -->
      <section class="app-card chat-main">
        <div class="chat-topbar">
          <div class="timer-box">
            <el-icon><Timer /></el-icon>
            <span>{{ elapsedText }}</span>
          </div>
          <el-button size="small" @click="timerRunning ? pauseTimer() : startTimer()">
            {{ timerRunning ? '暂停计时' : '开始计时' }}
          </el-button>
          <el-button size="small" @click="resetTimer">重置</el-button>
          <el-tag :type="connected ? 'primary' : 'info'" effect="plain" size="small">
            {{ connected ? '已连接' : '连接中' }}
          </el-tag>
          <div style="flex: 1"></div>
          <el-input
            v-model="searchKeyword"
            placeholder="搜索聊天记录"
            size="small"
            style="width: 180px"
            clearable
            @keyup.enter="searchHistory"
          />
        </div>

        <!-- 消息列表 -->
        <div ref="msgBox" class="chat-messages" @scroll="onScroll">
          <div v-if="searchResults.length" class="search-banner">
            <span>找到 {{ searchResults.length }} 条匹配消息</span>
            <el-button link type="primary" size="small" @click="clearSearch">清除搜索</el-button>
          </div>

          <div v-if="!messages.length" class="chat-empty">
            还没有消息，发送第一条吧
          </div>

          <div
            v-for="m in messages"
            :key="m.id"
            class="msg-row"
            :class="rowClass(m)"
          >
            <div v-if="m.messageType !== 'system'" class="msg-sender">
              {{ m.senderName }}
              <span class="text-sub">{{ formatTime(m.createdAt) }}</span>
            </div>

            <!-- 系统消息 -->
            <template v-if="m.messageType === 'system'">
              <div class="msg-bubble">{{ m.content }}</div>
            </template>

            <!-- 题目卡片 (7.3) -->
            <template v-else-if="m.messageType === 'question'">
              <div class="msg-question">
                <div class="msg-question-title">{{ m.extra?.content || m.content }}</div>
                <div class="msg-question-options">
                  <div v-for="o in (m.extra?.options || [])" :key="o.letter">
                    {{ o.letter }}. {{ o.text }}
                  </div>
                </div>
                <div class="msg-actions" style="opacity: 1; margin-top: 10px">
                  <el-button
                    v-for="o in (m.extra?.options || [])"
                    :key="o.letter"
                    size="small"
                    :type="myAnswerOf(m.extra.questionId) === o.letter ? 'primary' : 'default'"
                    @click="submitAnswer(m.extra.questionId, o.letter)"
                  >
                    {{ o.letter }}
                  </el-button>
                </div>
              </div>
            </template>

            <!-- 答案卡片 (7.4) -->
            <template v-else-if="m.messageType === 'answer'">
              <div class="msg-answer">
                <span class="answer-tag">{{ m.extra?.answer }}</span>
                <span>第 {{ m.extra?.questionId }} 题</span>
              </div>
            </template>

            <!-- 普通文本 -->
            <template v-else>
              <div class="msg-bubble">
                <div v-if="m.quotedMessageId" class="msg-quote">引用了一条消息</div>
                {{ m.content }}
              </div>
            </template>

            <div v-if="m.messageType !== 'system'" class="msg-actions">
              <el-button link size="small" @click="quote(m)">引用</el-button>
              <el-button v-if="auth.isAdmin" link type="danger" size="small" @click="removeMessage(m)">删除</el-button>
            </div>
          </div>
        </div>

        <!-- 输入区 -->
        <div class="chat-input-area">
          <div v-if="quoted" class="quote-preview">
            <span>引用：{{ quoted.senderName }} - {{ quoted.content.slice(0, 30) }}</span>
            <el-button link size="small" @click="quoted = null">取消</el-button>
          </div>

          <div class="phrase-bar">
            <button
              v-for="p in phrases"
              :key="p.id"
              class="phrase-btn"
              @click="sendPhrase(p.content)"
            >
              {{ p.content }}
            </button>
          </div>

          <div class="chat-input-row">
            <el-input
              v-model="draft"
              type="textarea"
              :rows="2"
              resize="none"
              placeholder="输入消息，Enter 发送，Shift+Enter 换行"
              @keydown.enter.exact.prevent="sendText"
            />
            <el-button type="primary" :disabled="!draft.trim()" @click="sendText">发送</el-button>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import { chatApi } from '@/api';
import { getGuest, setGuest, getToken } from '@/api/http';
import { useAuthStore } from '@/stores/auth';

const route = useRoute();
const auth = useAuthStore();

const room = ref(null);
const messages = ref([]);
const onlineMembers = ref([]);
const phrases = ref([]);
const msgBox = ref(null);

const joinMode = ref('invite');
const inviteCode = ref('');
const teamId = ref(1);
const nickname = ref('');
const joining = ref(false);

const draft = ref('');
const quoted = ref(null);
const searchKeyword = ref('');
const searchResults = ref([]);

const myKey = ref('');
const myName = ref('');

const connected = ref(false);
let ws = null;
let reconnectTimer = null;
let heartbeatTimer = null;

// 计时器 (10.2)
const seconds = ref(0);
const timerRunning = ref(false);
let timerHandle = null;

const elapsedText = computed(() => {
  const h = String(Math.floor(seconds.value / 3600)).padStart(2, '0');
  const m = String(Math.floor((seconds.value % 3600) / 60)).padStart(2, '0');
  const s = String(seconds.value % 60).padStart(2, '0');
  return h + ':' + m + ':' + s;
});

function startTimer() {
  if (timerRunning.value) return;
  timerRunning.value = true;
  timerHandle = setInterval(() => { seconds.value += 1; }, 1000);
}

function pauseTimer() {
  timerRunning.value = false;
  if (timerHandle) { clearInterval(timerHandle); timerHandle = null; }
}

function resetTimer() {
  pauseTimer();
  seconds.value = 0;
}

function formatTime(v) {
  if (!v) return '';
  const d = new Date(String(v).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return String(v);
  const p = (n) => String(n).padStart(2, '0');
  return p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

function rowClass(m) {
  if (m.messageType === 'system') return 'is-system';
  return m.senderName === myName.value ? 'is-self' : 'is-other';
}

function myAnswerOf(questionId) {
  const mine = messages.value.filter(
    (m) => m.messageType === 'answer' && Number(m.extra?.questionId) === Number(questionId) && m.senderName === myName.value
  );
  return mine.length ? mine[mine.length - 1].extra.answer : null;
}

// ---------------- 加入聊天室 ----------------
async function joinByInvite() {
  const code = inviteCode.value.trim();
  if (!/^\d{6}$/.test(code)) return ElMessage.warning('请输入 6 位数字邀请码');
  joining.value = true;
  try {
    const r = await chatApi.byInvite(code);
    await enterRoom(r);
  } catch (e) {
    /* 错误已提示 */
  } finally {
    joining.value = false;
  }
}

async function joinTeamRoom() {
  joining.value = true;
  try {
    const r = await chatApi.ensureRoom({ teamId: teamId.value, name: '队伍 #' + teamId.value + ' 聊天室' });
    await enterRoom(r);
  } catch (e) {
    /* 错误已提示 */
  } finally {
    joining.value = false;
  }
}

/** 建立身份：登录用户用密钥身份，否则用访客身份（localStorage 记住） */
function resolveIdentity(roomId) {
  if (auth.isLoggedIn) {
    return { key: 'key-' + auth.user.keyId, name: myName.value || auth.roleLabel };
  }
  const saved = getGuest(roomId);
  const key = (saved && saved.key) || 'guest-' + Math.random().toString(36).slice(2, 10);
  const name = myName.value || (saved && saved.name) || '访客';
  setGuest(roomId, { key, name });
  return { key, name };
}

async function enterRoom(r) {
  room.value = r;
  myName.value = (nickname.value || '').trim() || '访客';
  const identity = resolveIdentity(r.id);
  myKey.value = identity.key;
  myName.value = identity.name;

  await Promise.all([loadMessages(), loadPhrases(), loadOnline()]);
  connect();
  ElMessage.success('已进入聊天室');
}

async function loadMessages() {
  try {
    messages.value = await chatApi.messages(room.value.id, 50);
    scrollToBottom();
  } catch (e) { /* 错误已提示 */ }
}

async function loadPhrases() {
  try {
    phrases.value = await chatApi.phrases();
  } catch (e) { /* 错误已提示 */ }
}

async function loadOnline() {
  try {
    onlineMembers.value = await chatApi.online(room.value.id);
  } catch (e) { /* 错误已提示 */ }
}

async function refreshInvite() {
  try {
    const r = await chatApi.refreshInvite(room.value.id);
    room.value.invite_code = r.inviteCode;
    room.value.invite_expires_at = r.expiresAt;
    ElMessage.success('邀请码已刷新');
  } catch (e) { /* 错误已提示 */ }
}

function copyInvite() {
  const code = room.value.invite_code;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(code).then(
      () => ElMessage.success('邀请码已复制：' + code),
      () => ElMessage.info('邀请码：' + code)
    );
  } else {
    ElMessage.info('邀请码：' + code);
  }
}

function leaveRoom() {
  disconnect();
  pauseTimer();
  room.value = null;
  messages.value = [];
  onlineMembers.value = [];
  searchResults.value = [];
}

// ---------------- WebSocket ----------------
function wsUrl() {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const params = new URLSearchParams({ roomId: String(room.value.id) });
  const token = getToken();
  if (token) params.set('token', token);
  else { params.set('memberKey', myKey.value); params.set('name', myName.value); }
  return proto + '//' + window.location.host + '/platform-ws?' + params.toString();
}

function connect() {
  disconnect();
  try {
    ws = new WebSocket(wsUrl());
  } catch (e) {
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    connected.value = true;
    heartbeatTimer = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'heartbeat' }));
    }, 25000);
  };

  ws.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch (e) { return; }

    if (msg.type === 'message') {
      if (!messages.value.some((m) => m.id === msg.message.id)) {
        messages.value.push(msg.message);
        scrollToBottom();
      }
    } else if (msg.type === 'delete') {
      messages.value = messages.value.filter((m) => m.id !== msg.messageId);
    } else if (msg.type === 'clear') {
      messages.value = [];
    } else if (msg.type === 'online') {
      onlineMembers.value = msg.members || [];
    } else if (msg.type === 'error') {
      ElMessage.error(msg.message || '操作失败');
    }
  };

  ws.onclose = () => {
    connected.value = false;
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
    scheduleReconnect();
  };

  ws.onerror = () => { connected.value = false; };
}

function scheduleReconnect() {
  if (!room.value) return;
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (room.value) connect();
  }, 3000);
}

function disconnect() {
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (ws) {
    ws.onclose = null;
    ws.onerror = null;
    try { ws.close(); } catch (e) { /* 忽略 */ }
    ws = null;
  }
  connected.value = false;
}

// ---------------- 发送 ----------------
function sendText() {
  const content = draft.value.trim();
  if (!content) return;
  sendVia({ type: 'message', content, quotedMessageId: quoted.value ? quoted.value.id : null });
  draft.value = '';
  quoted.value = null;
}

function sendPhrase(content) {
  draft.value = content;
  sendText();
}

function sendVia(payload) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    ElMessage.warning('连接已断开，正在重连');
    connect();
    return;
  }
  ws.send(JSON.stringify(payload));
}

function submitAnswer(questionId, answer) {
  sendVia({ type: 'answer', questionId, answer, studentId: null });
}

function quote(m) {
  quoted.value = m;
}

async function removeMessage(m) {
  try {
    await chatApi.deleteMessage(m.id);
    messages.value = messages.value.filter((x) => x.id !== m.id);
    ElMessage.success('已删除');
  } catch (e) { /* 错误已提示 */ }
}

// ---------------- 搜索与滚动 ----------------
async function searchHistory() {
  const k = searchKeyword.value.trim();
  if (!k) return clearSearch();
  try {
    searchResults.value = await chatApi.searchMessages(room.value.id, k);
    if (!searchResults.value.length) ElMessage.info('没有找到匹配的消息');
  } catch (e) { /* 错误已提示 */ }
}

function clearSearch() {
  searchKeyword.value = '';
  searchResults.value = [];
}

function scrollToBottom() {
  nextTick(() => {
    if (msgBox.value) msgBox.value.scrollTop = msgBox.value.scrollHeight;
  });
}

function onScroll() { /* 保留钩子，供后续加载历史消息 */ }

/** 从题库检索页跳转过来时，自动把题目发到聊天室 (7.3) */
async function sendIncomingQuestion() {
  const qid = route.query.questionId;
  if (!qid) return;
  try {
    const { questionApi } = await import('@/api');
    const q = await questionApi.detail(qid);
    sendVia({
      type: 'message',
      messageType: 'question',
      content: q.content,
      extra: { questionId: q.id, content: q.content, options: q.options, answer: q.answer }
    });
    ElMessage.success('题目已发送到聊天室');
  } catch (e) { /* 错误已提示 */ }
}

watch(() => route.query.questionId, (v) => { if (v && room.value) sendIncomingQuestion(); });

onMounted(async () => {
  // 支持 URL 直接带邀请码进入
  if (route.query.invite) {
    inviteCode.value = String(route.query.invite);
    joinMode.value = 'invite';
  }
  if (route.query.teamId) teamId.value = Number(route.query.teamId);
});

onBeforeUnmount(() => {
  disconnect();
  pauseTimer();
});
</script>

<style scoped>
.join-wrap { display: flex; justify-content: center; padding-top: 40px; }
.join-card { width: 100%; max-width: 520px; }
.join-sub { color: var(--c-text-sub); font-size: var(--f-sm); margin: 10px 0 20px; line-height: 1.7; }
.side-title { font-size: var(--f-sm); font-weight: 600; color: var(--c-primary); margin-bottom: 12px; }
.member-list { max-height: 220px; overflow-y: auto; }
.member-name { font-size: var(--f-sm); }
.invite-code {
  font-size: var(--f-lg); font-weight: 600; color: var(--c-primary);
  letter-spacing: 3px; margin: 6px 0;
}
.search-banner {
  display: flex; align-items: center; justify-content: space-between;
  background: var(--c-selected); color: var(--c-primary);
  border-radius: var(--r-tag); padding: 6px 12px; font-size: var(--f-xs);
}
</style>
