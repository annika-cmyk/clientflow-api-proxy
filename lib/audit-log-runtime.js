'use strict';

const auditLog = require('./audit-log');

let service = null;

function initAuditRuntime(svc) {
  service = svc;
  return service;
}

function getAuditRuntime() {
  return service;
}

async function writeAudit(input, options) {
  if (!service) return null;
  try {
    return await service.insert(input, options);
  } catch (err) {
    console.warn('audit-log insert misslyckades:', err.message);
    return null;
  }
}

async function writeAuditSafe(input, options) {
  return writeAudit(input, options);
}

module.exports = {
  initAuditRuntime,
  getAuditRuntime,
  writeAudit,
  writeAuditSafe,
  auditLog
};
