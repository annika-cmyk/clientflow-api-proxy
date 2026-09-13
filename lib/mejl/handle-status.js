/**
 * Hanteringsstatus per Gmail-meddelande (hanterat / att hantera).
 * Ren logik – persistence sker i klienten (localStorage).
 */
'use strict';

const HANDLED = 'handled';
const TODO = 'todo';
const NONE = '';

function normalizeStatus(value) {
  const v = String(value || '')
    .trim()
    .toLowerCase();
  if (v === HANDLED || v === 'hanterat') return HANDLED;
  if (v === TODO || v === 'att-hantera' || v === 'att_hantera' || v === 'att hantera') {
    return TODO;
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
  NONE,
  normalizeStatus,
  toggleStatus,
  listItemClass,
  storageBucketKey
};
