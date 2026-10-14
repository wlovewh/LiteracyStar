'use strict';
const service = require('../services/examService');
const rankService = require('../services/rankService');
const stageService = require('../services/stageService');
const cfgMod = require('../config/stageConfig');
const { ok, asyncHandler } = require('../utils/response');

exports.ready = asyncHandler(async (req, res) => ok(res, await service.getReadyInfo(req.params.id, req.user)));
exports.start = asyncHandler(async (req, res) => ok(res, await service.startExam(req.params.id, req.user)));
exports.submitAnswer = asyncHandler(async (req, res) => ok(res, await service.submitAnswer(req.params.id, req.user, req.body || {})));
exports.submit = asyncHandler(async (req, res) => ok(res, await service.submitStage(req.params.id, req.user, req.body || {}), '交卷成功'));
exports.result = asyncHandler(async (req, res) => ok(res, await service.getResult(req.params.id, req.user)));
exports.wrong = asyncHandler(async (req, res) => ok(res, await service.getWrongBook(req.params.id, req.user)));

/** 排行榜数据（快照） */
exports.rank = asyncHandler(async (req, res) => {
  const stage = await stageService.getRow(req.params.id);
  const cfg = cfgMod.normalizeConfig(stage.config);
  const individual = cfg.mode !== 'team';
  const list = individual
    ? await rankService.getIndividualRanking(req.params.id, { limit: Number(req.query.limit) || 200 })
    : await rankService.getRanking(req.params.id, { limit: Number(req.query.limit) || 200 });
  return ok(res, {
    stage: cfgMod.summarize(stage),
    mode: cfg.mode,
    individual,
    list,
    updatedAt: new Date().toISOString()
  });
});

/**
 * SSE 实时排行榜 (project.md 8.2)
 * GET /api/rank/stream?stageId=xxx
 * 服务端每 3 秒检查一次数据变化，有变化才推送。
 */
exports.stream = asyncHandler(async (req, res) => {
  const stageId = req.params.id || req.query.stageId;
  if (!stageId) return res.status(400).json({ code: 400, message: '缺少 stageId' });

  const stage = await stageService.getRow(stageId);
  const cfg = cfgMod.normalizeConfig(stage.config);
  const individual = cfg.mode !== 'team';

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.write(': connected\n\n');

  let lastPayload = '';
  let closed = false;

  const fetchList = async () => (individual
    ? rankService.getIndividualRanking(stageId, { limit: 200 })
    : rankService.getRanking(stageId, { limit: 200 }));

  const push = async () => {
    if (closed) return;
    try {
      const list = await fetchList();
      const payload = JSON.stringify({ stageId: Number(stageId), individual, list, updatedAt: new Date().toISOString() });
      if (payload !== lastPayload) {
        lastPayload = payload;
        res.write('event: rank\ndata: ' + payload + '\n\n');
      } else {
        res.write(': keepalive\n\n');
      }
    } catch (err) {
      res.write('event: error\ndata: ' + JSON.stringify({ message: err.message }) + '\n\n');
    }
  };

  await push();
  const timer = setInterval(push, 3000);

  req.on('close', () => {
    closed = true;
    clearInterval(timer);
    res.end();
  });
});
