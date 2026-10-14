'use strict';
const service = require('../services/authService');
const { ok, asyncHandler } = require('../utils/response');

exports.login = asyncHandler(async (req, res) => {
  const result = await service.loginByKey(req.body && req.body.keyValue);
  return ok(res, result, '登录成功');
});

exports.me = asyncHandler(async (req, res) => ok(res, { role: req.auth.role, keyId: req.auth.keyId }));

exports.list = asyncHandler(async (req, res) => ok(res, await service.listKeys(req.query)));
exports.create = asyncHandler(async (req, res) => ok(res, await service.createKey(req.body || {}), '创建成功'));
exports.update = asyncHandler(async (req, res) => ok(res, await service.updateKey(req.params.id, req.body || {}), '保存成功'));
exports.remove = asyncHandler(async (req, res) => ok(res, await service.removeKey(req.params.id), '删除成功'));
exports.generate = asyncHandler(async (req, res) => ok(res, { keyValue: service.randomKey('KEY') }));
