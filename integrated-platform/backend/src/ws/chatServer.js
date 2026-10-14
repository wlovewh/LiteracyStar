'use strict';
const { WebSocketServer } = require('ws');
const config = require('../config');
const logger = require('../utils/logger');
const jwtUtil = require('../utils/jwt');
const redis = require('../config/redis');
const chatService = require('../services/chatService');

/**
 * WebSocket 聊天服务 (project.md 追加文档 7.1)
 *
 * 客户端连接: ws://host/platform-ws?roomId=1&token=xxx
 *             或 ws://host/platform-ws?roomId=1&memberKey=guest-xxx&name=张三
 *
 * 消息协议（JSON）:
 *   客户端 -> 服务端: { type:'message'|'answer'|'typing'|'heartbeat', ... }
 *   服务端 -> 客户端: { type:'message'|'delete'|'clear'|'online'|'error', ... }
 */

// roomId -> Set<ws>
const rooms = new Map();

function addClient(roomId, ws) {
  if (!rooms.has(roomId)) rooms.set(roomId, new Set());
  rooms.get(roomId).add(ws);
}

function removeClient(roomId, ws) {
  const set = rooms.get(roomId);
  if (!set) return;
  set.delete(ws);
  if (!set.size) rooms.delete(roomId);
}

function broadcastLocal(roomId, payload) {
  const set = rooms.get(roomId);
  if (!set) return;
  const data = JSON.stringify(payload);
  for (const ws of set) {
    if (ws.readyState === ws.OPEN) {
      try { ws.send(data); } catch (_) { /* 忽略单个连接异常 */ }
    }
  }
}

/** 在线成员列表广播 */
async function broadcastOnline(roomId) {
  try {
    const list = await chatService.getOnlineMembers(roomId);
    broadcastLocal(roomId, { type: 'online', members: list });
  } catch (err) {
    logger.warn('在线状态广播失败: ' + err.message);
  }
}

function parseQuery(url) {
  const idx = url.indexOf('?');
  const q = idx >= 0 ? url.slice(idx + 1) : '';
  const out = {};
  for (const pair of q.split('&')) {
    if (!pair) continue;
    const [k, v] = pair.split('=');
    out[decodeURIComponent(k)] = decodeURIComponent(v || '');
  }
  return out;
}

function init(server) {
  const wss = new WebSocketServer({ server, path: '/platform-ws' });

  wss.on('connection', async (ws, req) => {
    const query = parseQuery(req.url || '');
    const roomId = Number(query.roomId);
    if (!roomId) {
      ws.close(1008, 'missing roomId');
      return;
    }

    // 身份：优先使用密钥令牌，其次使用访客身份
    let identity = null;
    if (query.token) {
      try {
        const payload = jwtUtil.verify(query.token);
        identity = { key: 'key-' + payload.keyId, name: payload.role === 'admin' ? '管理员' : '用户', role: payload.role };
      } catch (_) {
        /* 令牌无效则回落为访客 */
      }
    }
    if (!identity) {
      const memberKey = query.memberKey || ('guest-' + Math.random().toString(36).slice(2, 10));
      identity = { key: memberKey, name: query.name || '访客', role: 'guest' };
    }

    ws.roomId = roomId;
    ws.identity = identity;
    ws.isAlive = true;

    addClient(roomId, ws);
    await chatService.setOnline(roomId, identity.key, identity.name);

    ws.send(JSON.stringify({ type: 'ready', identity, roomId }));
    await broadcastOnline(roomId);

    // 订阅 Redis 频道，接收跨进程广播
    const unsubscribe = await redis.subscribe('chat:room:' + roomId, (raw) => {
      try {
        broadcastLocal(roomId, JSON.parse(raw));
      } catch (_) { /* 忽略非法消息 */ }
    });

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', async (buf) => {
      let msg;
      try { msg = JSON.parse(buf.toString()); } catch (_) { return; }

      try {
        if (msg.type === 'heartbeat') {
          ws.isAlive = true;
          await chatService.setOnline(roomId, identity.key, identity.name);
          ws.send(JSON.stringify({ type: 'heartbeat', at: Date.now() }));
          return;
        }

        if (msg.type === 'typing') {
          broadcastLocal(roomId, { type: 'typing', name: identity.name });
          return;
        }

        if (msg.type === 'answer') {
          const result = await chatService.submitAnswer(roomId, {
            questionId: msg.questionId,
            answer: msg.answer,
            senderName: identity.name,
            senderRole: identity.role === 'guest' ? 'member1' : identity.role,
            senderStudentId: msg.studentId || null
          });
          return result;
        }

        if (msg.type === 'message') {
          await chatService.saveMessage(roomId, {
            senderRole: identity.role === 'guest' ? 'member1' : identity.role,
            senderName: identity.name,
            senderStudentId: msg.studentId || null,
            messageType: msg.messageType || 'text',
            content: msg.content || '',
            extra: msg.extra || null,
            quotedMessageId: msg.quotedMessageId || null
          });
          return;
        }
      } catch (err) {
        ws.send(JSON.stringify({ type: 'error', message: err.message }));
      }
    });

    ws.on('close', async () => {
      unsubscribe();
      removeClient(roomId, ws);
      await chatService.setOffline(roomId, identity.key);
      await broadcastOnline(roomId);
    });

    ws.on('error', (err) => {
      logger.warn('WebSocket 异常: ' + err.message);
    });
  });

  // 心跳检测：30 秒一次，超时未响应则断开 (7.10)
  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) return ws.terminate();
      ws.isAlive = false;
      try { ws.ping(); } catch (_) { /* 忽略 */ }
    });
  }, config.chat.heartbeatIntervalMs);

  wss.on('close', () => clearInterval(interval));

  logger.info('WebSocket 聊天服务已就绪: /platform-ws');
  return wss;
}

module.exports = { init, broadcastLocal, rooms };
