'use strict';
const jsonwebtoken = require('jsonwebtoken');
const config = require('../config');

function sign(payload) {
  return jsonwebtoken.sign(payload, config.jwt.secret, { expiresIn: config.jwt.expiresIn });
}

function verify(token) {
  return jsonwebtoken.verify(token, config.jwt.secret);
}

module.exports = { sign, verify };
