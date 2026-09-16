/**
 * Hanteringsstatus per Gmail-meddelande
 * (hanterat / att hantera / uppgift skapad).
 * Ren logik – persistence sker i klienten (localStorage).
 */
'use strict';

const HANDLED = 'handled';
const TODO = 'todo';
const TASK_CREATED = 'task_created';
const NONE = '';

function normalizeStatus(value) {
  const v = String(value || '')
    .trim()
    .toLowerCase();
  if (v === HANDLED || v === 'hanterat') return HANDLED;
  if (v === TODO || v === 'att-hantera' || v === 'att_hantera' || v === 'att hantera') {
    return TODO;
  }
  if (
    v === TASK_CREATED ||
    v === 'uppgift-skapad' ||
    v === 'uppgift_skapad' ||
    v === 'uppgift skapad'
  ) {
    return TASK_CREATED;
  }
  return NONE;
}

/** Sätt status; klick på aktiv status rensar (toggle). */
function toggleStatus(current, next) {
  const cur = normalizeStatus(current);
  const n = normalizeStatus(next);
  if (!n) return NONE;
  return cur === n ? NONE : n;
}

function listItemClass(status) {
  const s = normalizeStatus(status);
  if (s === HANDLED) return 'is-handled';
  if (s === TODO) return 'is-todo';
  if (s === TASK_CREATED) return 'is-task-created';
  return '';
}

/** Kort svensk etikett för UI-badge. */
function statusLabel(status) {
  const s = normalizeStatus(status);
  if (s === HANDLED) return 'Hanterat';
  if (s === TODO) return 'Att hantera';
  if (s === TASK_CREATED) return 'Uppgift skapad';
  return '';
}

function storageBucketKey(userKey) {
  const key = String(userKey || 'anon')
    .trim()
    .toLowerCase();
  return 'cf-mejl-handle-status:' + (key || 'anon');
}

module.exports = {
  HANDLED,
  TODO,
  TASK_CREATED,
  NONE,
  normalizeStatus,
  toggleStatus,
  listItemClass,
  statusLabel,
  storageBucketKey
};
