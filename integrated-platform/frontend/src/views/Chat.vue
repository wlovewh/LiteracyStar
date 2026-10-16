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
          <div class="text-sub">房间码</div>
          <div class="invite-code">{{ room.invite_code }}</div>
          <el-button size="small" link type="primary" @click="copyInvite">复制房间码</el-button>
          <el-button size="small" link type="primary" @click="refreshInvite">随机重生成</el-button>
          <el-button size="small" link type="primary" @click="openCodeDialog">自定义</el-button>
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
            placeholder="搜索聊天记录，回车定位"
            size="small"
            style="width: 200px"
            clearable
            @keyup.enter="searchHistory"
            @clear="clearSearch"
          >
            <template #append>
              <el-button :icon="Search" @click="searchHistory" />
            </template>
          </el-input>
        </div>

        <!-- 消息列表 -->
        <div ref="msgBox" class="chat-messages" @scroll="onScroll">
          <div v-if="searchResults.length" class="search-banner">
            <span>
              找到 {{ searchResults.length }} 条匹配消息
              <template v-if="searchHitCount">，当前第 {{ searchIndex + 1 }} / {{ searchHitCount }} 条</template>
            </span>
            <span>
              <el-button link type="primary" size="small" :disabled="searchHitCount < 2" @click="stepSearch(-1)">上一条</el-button>
              <el-button link type="primary" size="small" :disabled="searchHitCount < 2" @click="stepSearch(1)">下一条</el-button>
              <el-button link type="primary" size="small" @click="clearSearch">清除搜索</el-button>
            </span>
          </div>

          <div v-if="!messages.length" class="chat-empty">
            还没有消息，发送第一条吧
          </div>

          <div
            v-for="m in messages"
            :key="m.id"
            :ref="(el) => setRowRef(m.id, el)"
            class="msg-row"
            :class="[rowClass(m), { 'is-highlight': highlightedId === m.id }]"
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
                  <div
                    v-for="o in (m.extra?.options || [])"
                    :key="o.letter"
                    :class="{ 'is-correct-option': isCorrectOption(m, o.letter) }"
                  >
                    {{ o.letter }}. {{ o.text }}
                  </div>
                </div>
                <!-- 直接给出正确答案，无需再翻题库 -->
                <div v-if="m.extra?.answer" class="msg-question-answer">
                  <span class="q-answer-label">正确答案</span>
                  <span class="q-answer-value">{{ m.extra.answer }}</span>
                  <span v-if="m.extra?.analysis" class="q-answer-analysis">{{ m.extra.analysis }}</span>
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

            <!-- 图片消息 -->
            <template v-else-if="m.messageType === 'image'">
              <div class="msg-bubble msg-bubble-image">
                <div v-if="m.quotedMessageId" class="msg-quote">
                  <template v-if="m.quoted">
                    <span class="quote-author">{{ m.quoted.senderName }}：</span>
                    <span class="quote-text">{{ quotePreview(m.quoted) }}</span>
                  </template>
                  <span v-else class="quote-text">原消息已被删除</span>
                </div>
                <el-image
                  :src="imageUrlOf(m)"
                  :preview-src-list="[imageUrlOf(m)]"
                  fit="cover"
                  class="msg-image"
                  preview-teleported
                />
              </div>
            </template>

            <!-- 普通文本 -->
            <template v-else>
              <div class="msg-bubble">
                <div v-if="m.quotedMessageId" class="msg-quote">
                <template v-if="m.quoted">
                  <span class="quote-author">{{ m.quoted.senderName }}：</span>
                  <span class="quote-text">{{ quotePreview(m.quoted) }}</span>
                </template>
                <span v-else class="quote-text">原消息已被删除</span>
              </div>
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
              placeholder="输入消息，Enter 发送，Shift+Enter 换行，Ctrl+V 粘贴图片"
              @keydown="onDraftKeydown"
            />
            <el-button
              :icon="Picture"
              :loading="uploading"
              title="发送图片"
              @click="pickImage"
            />
            <el-button type="primary" :disabled="!draft.trim()" @click="sendText">发送</el-button>
          </div>
          <input
            ref="fileInput"
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            style="display: none"
            @change="onImagePicked"
          />
        </div>
      </section>
    </div>

    <!-- 自定义房间码 -->
    <el-dialog v-model="codeDialog" title="自定义房间码" width="420px">
      <el-form label-width="80px">
        <el-form-item label="房间码">
          <el-input
            v-model="codeDraft"
            maxlength="6"
            placeholder="请输入 6 位数字"
            @keyup.enter="saveCustomCode"
          />
        </el-form-item>
      </el-form>
      <div class="text-sub" style="line-height: 1.7">
        房间码为 6 位数字，需全平台唯一。设置后原房间码立即失效，有效期重新计算 24 小时。
      </div>
      <template #footer>
        <el-button @click="codeDialog = false">取消</el-button>
        <el-button type="primary" :loading="savingCode" @click="saveCustomCode">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import { Picture, Search } from '@element-plus/icons-vue';
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

/**
 * 聊天室会话持久化。
 * 用户切到其他页面再回来时自动恢复，只有主动点「离开聊天室」才清除。
 * 默认保持 24 小时，超时后需重新进入。
 */
const SESSION_KEY = 'chat_session';
const SESSION_TTL = 24 * 60 * 60 * 1000;

function saveSession() {
  if (!room.value) return;
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      room: room.value,
      memberKey: myKey.value,
      memberName: myName.value,
      // 记录进入本聊天室所用的邀请码：题库检索凭它放行访客身份
      inviteCode: room.value.invite_code || inviteCode.value || '',
      joinedAt: Date.now()
    }));
  } catch (e) { /* 隐私模式下写入失败可忽略 */ }
}

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || !s.room || !s.room.id) return null;
    if (Date.now() - Number(s.joinedAt || 0) > SESSION_TTL) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return s;
  } catch (e) {
    return null;
  }
}

function clearSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* 忽略 */ }
}

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

/**
 * 判断一条消息是否为自己发送。
 * 优先用服务端写入的 senderKey（稳定、不受昵称修改影响）；
 * 历史消息没有 senderKey 时回落到昵称比对。
 */
function isMine(m) {
  if (!m) return false;
  if (m.senderKey && myKey.value) return m.senderKey === myKey.value;
  return m.senderName === myName.value;
}

function rowClass(m) {
  if (m.messageType === 'system') return 'is-system';
  return isMine(m) ? 'is-self' : 'is-other';
}

/** 判断某选项是否为题目卡片里的正确答案（用于高亮） */
function isCorrectOption(m, letter) {
  const ans = String((m.extra && m.extra.answer) || '');
  if (!ans) return false;
  return ans.toUpperCase().includes(String(letter).toUpperCase());
}

function myAnswerOf(questionId) {
  const mine = messages.value.filter(
    (m) => m.messageType === 'answer' && Number(m.extra?.questionId) === Number(questionId) && isMine(m)
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
    // 记录邀请码，供题库检索以访客身份放行
    if (r) r.invite_code = code;
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

/**
 * 建立身份：登录用户用密钥身份，否则用访客身份（localStorage 记住）。
 * 昵称优先级：本次输入 > 已保存的昵称 > 登录身份名 / 访客。
 */
function resolveIdentity(roomId) {
  const typed = (nickname.value || '').trim();
  const saved = getGuest(roomId);

  if (auth.isLoggedIn) {
    const name = typed || (saved && saved.name) || auth.roleLabel;
    setGuest(roomId, { key: 'key-' + auth.user.keyId, name });
    return { key: 'key-' + auth.user.keyId, name };
  }

  const key = (saved && saved.key) || 'guest-' + Math.random().toString(36).slice(2, 10);
  const name = typed || (saved && saved.name) || '访客';
  setGuest(roomId, { key, name });
  return { key, name };
}

async function enterRoom(r, opts = {}) {
  room.value = r;
  const identity = resolveIdentity(r.id);
  myKey.value = identity.key;
  myName.value = identity.name;

  await Promise.all([loadMessages(), loadPhrases(), loadOnline()]);
  connect();
  saveSession();
  if (!opts.silent) ElMessage.success('已进入聊天室');
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
    ElMessage.success('房间码已重新生成');
  } catch (e) { /* 错误已提示 */ }
}

// ---------------- 自定义房间码 ----------------
const codeDialog = ref(false);
const codeDraft = ref('');
const savingCode = ref(false);

function openCodeDialog() {
  codeDraft.value = room.value.invite_code || '';
  codeDialog.value = true;
}

async function saveCustomCode() {
  const code = codeDraft.value.trim();
  if (!/^\d{6}$/.test(code)) return ElMessage.warning('房间码必须是 6 位数字');
  savingCode.value = true;
  try {
    const r = await chatApi.refreshInvite(room.value.id, code);
    room.value.invite_code = r.inviteCode;
    room.value.invite_expires_at = r.expiresAt;
    // 本地记录的邀请码同步更新，否则题库检索的访客身份会失效
    inviteCode.value = r.inviteCode;
    const saved = JSON.parse(localStorage.getItem('chat_session') || '{}');
    saved.inviteCode = r.inviteCode;
    localStorage.setItem('chat_session', JSON.stringify(saved));
    ElMessage.success('房间码已更新为 ' + r.inviteCode);
    codeDialog.value = false;
  } catch (e) { /* 错误已提示 */ } finally {
    savingCode.value = false;
  }
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
  clearSession();
  resetTimer();
  room.value = null;
  messages.value = [];
  onlineMembers.value = [];
  searchResults.value = [];
  quoted.value = null;
  draft.value = '';
  ElMessage.success('已离开聊天室');
}

// ---------------- WebSocket ----------------
function wsUrl() {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const params = new URLSearchParams({ roomId: String(room.value.id) });
  const token = getToken();
  // 始终带上昵称：登录用户也需要显示自己填的称呼，而不是"用户/管理员"
  if (token) params.set('token', token);
  else params.set('memberKey', myKey.value);
  if (myName.value) params.set('name', myName.value);
  return proto + '//' + window.location.host + '/platform-ws?' + params.toString();
}

function connect() {
  // 已有连接（含正在建立的连接）时直接复用，避免反复重连。
  // 旧实现无条件先 disconnect()：若上一个 socket 还处于 CONNECTING，
  // close() 会触发浏览器报 "WebSocket is closed before the connection is established"，
  // 并且每次进入页面都要重连一次，在线列表因此长时间为空。
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

  disconnect();
  try {
    ws = new WebSocket(wsUrl());
  } catch (e) {
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    connected.value = true;
    // 补发连接建立前排队等待的消息
    flushPendingSends();
    // 连上后主动拉一次在线成员，不必等下一次推送
    loadOnline();
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

/**
 * 输入框回车处理。
 *
 * 之前用 @keydown.enter.exact.prevent 绑定在 el-input 上：
 *  - el-input 内部包了一层 textarea，某些浏览器下事件不会按预期冒泡；
 *  - .exact 修饰符要求"没有其他修饰键"，中文输入法确认候选词时也会触发回车，
 *    导致要么没反应、要么直接把拼音发出去。
 * 这里改为显式判断，并过滤输入法组合态。
 */
function onDraftKeydown(e) {
  if (e.key !== 'Enter') return;
  // 中文输入法选词中的回车不算发送
  if (e.isComposing || e.keyCode === 229) return;
  // Shift+Enter / Ctrl+Enter / Alt+Enter 保留换行
  if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
  e.preventDefault();
  sendText();
}

function sendText() {
  const content = draft.value.trim();
  if (!content) return;
  sendVia({ type: 'message', content, quotedMessageId: quoted.value ? quoted.value.id : null });
  draft.value = '';
  quoted.value = null;
}

// ---------------- 图片发送 ----------------
const fileInput = ref(null);
const uploading = ref(false);

function pickImage() {
  if (fileInput.value) {
    fileInput.value.value = '';
    fileInput.value.click();
  }
}

/** 图片消息的完整 URL（后端存的是 /platform-api/... 相对路径） */
function imageUrlOf(m) {
  const url = m.extra?.url || m.content || '';
  if (/^https?:\/\//i.test(url)) return url;
  return url.startsWith('/') ? url : '/' + url;
}

async function onImagePicked(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  await uploadAndSendImage(file);
}

/** 上传图片并作为消息发送 */
async function uploadAndSendImage(file) {
  if (!room.value) return;
  if (!/^image\/(png|jpe?g|gif|webp)$/i.test(file.type)) {
    ElMessage.warning('仅支持 PNG / JPG / GIF / WEBP 图片');
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    ElMessage.warning('图片不能超过 5MB');
    return;
  }
  uploading.value = true;
  try {
    const r = await chatApi.uploadImage(room.value.id, file);
    sendVia({
      type: 'message',
      messageType: 'image',
      content: r.url,
      extra: { url: r.url, name: file.name || '粘贴的图片', size: file.size },
      quotedMessageId: quoted.value ? quoted.value.id : null
    });
    quoted.value = null;
  } catch (err) {
    /* 错误已提示 */
  } finally {
    uploading.value = false;
  }
}

/**
 * Ctrl+V 粘贴上传图片。
 * 从剪贴板取出图片文件直接发送，不经过文件选择框。
 */
function onPaste(e) {
  if (!room.value) return;
  const items = (e.clipboardData && e.clipboardData.items) || [];
  for (const it of items) {
    if (it.kind === 'file' && /^image\//.test(it.type)) {
      const file = it.getAsFile();
      if (file) {
        e.preventDefault();
        uploadAndSendImage(file);
        return;
      }
    }
  }
}

function sendPhrase(content) {
  draft.value = content;
  sendText();
}

/**
 * 待发送队列。
 *
 * 之前连接未就绪时只弹一句"连接已断开，正在重连"就把消息丢掉了，
 * 但调用方（如"题目已发送到聊天室"）已经提示成功——于是出现
 * "提示已发送，实际没发出去"。现在先入队，连上后自动补发。
 */
const pendingSends = [];

function sendVia(payload) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    // 正在建立连接：入队等待，不丢消息
    if (ws && ws.readyState === WebSocket.CONNECTING) {
      pendingSends.push(payload);
      return;
    }
    // 完全断开：先入队再重连，连上后补发
    pendingSends.push(payload);
    ElMessage.warning('连接已断开，正在重连，消息将在连接恢复后发送');
    connect();
    return;
  }
  ws.send(JSON.stringify(payload));
}

/** 连接建立后补发排队中的消息 */
function flushPendingSends() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  while (pendingSends.length) {
    const payload = pendingSends.shift();
    try { ws.send(JSON.stringify(payload)); } catch (e) {
      pendingSends.unshift(payload);
      break;
    }
  }
}

function submitAnswer(questionId, answer) {
  sendVia({ type: 'answer', questionId, answer, studentId: null });
}

function quote(m) {
  quoted.value = m;
}

/** 引用摘要：题目/图片等非文本消息给出可读描述 */
function quotePreview(q) {
  if (!q) return '';
  if (q.messageType === 'question') return '[题目] ' + String(q.content || '').slice(0, 40);
  if (q.messageType === 'answer') return '[答案] ' + String(q.content || '').slice(0, 40);
  if (q.messageType === 'system') return String(q.content || '').slice(0, 40);
  return String(q.content || '').slice(0, 40);
}

async function removeMessage(m) {
  try {
    await chatApi.deleteMessage(m.id);
    messages.value = messages.value.filter((x) => x.id !== m.id);
    ElMessage.success('已删除');
  } catch (e) { /* 错误已提示 */ }
}

// ---------------- 搜索与滚动 ----------------

/** 消息 id -> DOM 节点，用于搜索后定位 */
const rowRefs = new Map();
function setRowRef(id, el) {
  if (el) rowRefs.set(id, el);
  else rowRefs.delete(id);
}

/** 搜索命中的消息 id（按时间升序），以及当前定位到第几条 */
const searchHits = ref([]);
const searchIndex = ref(0);
const searchHitCount = computed(() => searchHits.value.length);
const highlightedId = ref(null);

async function searchHistory() {
  const k = searchKeyword.value.trim();
  if (!k) return clearSearch();
  try {
    const list = await chatApi.searchMessages(room.value.id, k);
    searchResults.value = list || [];

    if (!searchResults.value.length) {
      searchHits.value = [];
      highlightedId.value = null;
      ElMessage.info('没有找到匹配的消息');
      return;
    }

    // 命中的消息可能不在当前已加载的最近 50 条里：先把它们并进列表再定位
    mergeSearchResultsIntoMessages();
    // 按时间升序排列，默认定位到最早的一条（从前往后看更符合翻找习惯）
    searchHits.value = searchResults.value
      .map((m) => m.id)
      .filter((id) => messages.value.some((x) => x.id === id))
      .sort((a, b) => a - b);
    searchIndex.value = 0;

    await jumpToHit();
  } catch (e) { /* 错误已提示 */ }
}

/** 把搜索结果中尚未加载的消息并入消息列表，并按 id 排序 */
function mergeSearchResultsIntoMessages() {
  const known = new Set(messages.value.map((m) => m.id));
  const extra = searchResults.value.filter((m) => !known.has(m.id));
  if (!extra.length) return;
  messages.value = [...messages.value, ...extra].sort((a, b) => Number(a.id) - Number(b.id));
}

/** 滚动到当前命中项并高亮 */
async function jumpToHit() {
  const id = searchHits.value[searchIndex.value];
  if (id === undefined) return;
  highlightedId.value = id;

  await nextTick();
  const el = rowRefs.get(id);
  const box = msgBox.value;
  if (!el || !box) return;

  // 用 getBoundingClientRect 计算「相对滚动容器」的位置。
  // 之前用 el.offsetTop：它相对最近的定位祖先计算，而 .chat-messages 没有
  // position: relative，offsetTop 于是相对更外层的元素，导致滚动位置整体偏移——
  // 命中的消息落在可视区之外，用户还得自己上滑才能看到。
  const boxRect = box.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  const offsetInBox = elRect.top - boxRect.top + box.scrollTop;

  // 定位到容器偏上位置（留出一点上下文），确保命中内容一定在可视区内
  const target = Math.max(0, offsetInBox - Math.min(60, box.clientHeight / 4));
  box.scrollTo({ top: target, behavior: 'smooth' });

  // 平滑滚动期间元素可能仍在动，稍后再校正一次，确保结果精确可见
  setTimeout(() => {
    const b2 = box.getBoundingClientRect();
    const e2 = el.getBoundingClientRect();
    const off2 = e2.top - b2.top + box.scrollTop;
    const want = Math.max(0, off2 - Math.min(60, box.clientHeight / 4));
    if (Math.abs(box.scrollTop - want) > 8) box.scrollTo({ top: want, behavior: 'auto' });
  }, 380);
}

/** 上一条 / 下一条 */
async function stepSearch(delta) {
  if (!searchHits.value.length) return;
  const n = searchHits.value.length;
  searchIndex.value = (searchIndex.value + delta + n) % n;
  await jumpToHit();
}

function clearSearch() {
  searchKeyword.value = '';
  searchResults.value = [];
  searchHits.value = [];
  searchIndex.value = 0;
  highlightedId.value = null;
}

function scrollToBottom() {
  nextTick(() => {
    if (msgBox.value) msgBox.value.scrollTop = msgBox.value.scrollHeight;
  });
}

function onScroll() { /* 保留钩子，供后续加载历史消息 */ }

/**
 * 从题库检索页跳转过来时，自动把题目发到聊天室 (7.3)。
 *
 * 必须先等 WebSocket 真正连上再发：进入页面时 connect() 刚发出，
 * 套接字还在 CONNECTING，此时发送会被丢弃（旧实现只弹提示不发送）。
 */
async function sendIncomingQuestion() {
  const qid = route.query.questionId;
  if (!qid) return;

  let q;
  try {
    const { questionApi } = await import('@/api');
    q = await questionApi.detail(qid);
  } catch (e) {
    return; // 错误已提示
  }
  if (!q) return;

  const payload = {
    type: 'message',
    messageType: 'question',
    content: q.content,
    extra: { questionId: q.id, content: q.content, options: q.options, answer: q.answer, analysis: q.analysis || '' }
  };

  // 等待连接就绪（最多 5 秒），就绪后立即发送
  const ready = await waitForSocket(5000);
  sendVia(payload);
  if (ready) ElMessage.success('题目已发送到聊天室');
  else ElMessage.info('连接较慢，题目将在连接恢复后自动发送');
}

/** 等待 WebSocket 进入 OPEN 状态；返回是否在超时前就绪 */
function waitForSocket(timeoutMs) {
  if (ws && ws.readyState === WebSocket.OPEN) return Promise.resolve(true);
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;
    const check = () => {
      if (ws && ws.readyState === WebSocket.OPEN) return resolve(true);
      if (Date.now() >= deadline) return resolve(false);
      setTimeout(check, 100);
    };
    check();
  });
}

watch(() => route.query.questionId, (v) => { if (v && room.value) sendIncomingQuestion(); });

/** 页面重新可见时立即恢复连接并刷新在线列表 */
function onVisible() {
  if (document.visibilityState !== 'visible') return;
  if (!room.value) return;
  connect();
  if (ws && ws.readyState === WebSocket.OPEN) loadOnline();
}

onMounted(async () => {
  // Ctrl+V 粘贴图片：在页面任意位置粘贴都能上传
  window.addEventListener('paste', onPaste);
  // 从其他标签页/页面切回时立刻恢复连接，避免在线列表长时间为空
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', onVisible);

  // 支持 URL 直接带邀请码进入
  if (route.query.invite) {
    inviteCode.value = String(route.query.invite);
    joinMode.value = 'invite';
  }
  if (route.query.teamId) teamId.value = Number(route.query.teamId);

  // 恢复上次的聊天室会话（24 小时内且未主动离开）
  const s = loadSession();
  if (s) {
    room.value = s.room;
    myKey.value = s.memberKey || '';
    myName.value = s.memberName || '访客';
    await Promise.all([loadMessages(), loadPhrases(), loadOnline()]);
    connect();
    if (route.query.questionId) await sendIncomingQuestion();
  }
});

onBeforeUnmount(() => {
  // 切到其他页面时保留会话：只断开连接并暂停计时，不清除房间状态。
  // 房间状态已写入 localStorage，返回本页会自动恢复。
  window.removeEventListener('paste', onPaste);
  document.removeEventListener('visibilitychange', onVisible);
  window.removeEventListener('focus', onVisible);
  disconnect();
  pauseTimer();
  saveSession();
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
.msg-bubble-image {
  padding: 8px;
  max-width: 260px;
}

.msg-image {
  display: block;
  width: 100%;
  max-width: 240px;
  max-height: 240px;
  border-radius: var(--r-tag);
  cursor: zoom-in;
}

.msg-quote {
  font-size: var(--f-xs);
  color: var(--c-text-sub);
  background: var(--c-bg);
  border-left: 3px solid var(--c-primary-2);
  border-radius: var(--r-tag);
  padding: 5px 10px;
  margin-bottom: 6px;
  line-height: 1.6;
  word-break: break-all;
}

.quote-author {
  font-weight: 600;
  color: var(--c-primary);
}

.quote-text {
  opacity: 0.85;
}

.search-banner {
  display: flex; align-items: center; justify-content: space-between;
  background: var(--c-selected); color: var(--c-primary);
  border-radius: var(--r-tag); padding: 6px 12px; font-size: var(--f-xs);
}
</style>
