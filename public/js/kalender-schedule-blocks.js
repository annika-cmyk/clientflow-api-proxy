/**
 * Flera tidblock per uppdragskörning (Planerade block JSON + legacy Planerad start/slut).
 * Används av kalender.js i webbläsaren och av API/tester i Node.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.KalenderScheduleBlocks = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const FIELD_BLOCKS = 'Planerade block (JSON)';
  const FIELD_START = 'Planerad start';
  const FIELD_END = 'Planerad slut';
  const FIELD_ESTIMATE = 'Uppskattad tid (t)';

  /**
   * Uppskattad tidsåtgång i timmar (null = snabbuppgift utan planeringsmål).
   */
  function parseEstimatedHours(fields) {
    const raw = fields && fields[FIELD_ESTIMATE];
    if (raw == null || raw === '') return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.round(n * 100) / 100;
  }

  /**
   * Planeringsstatus: dölj som valbar när all uppskattad tid är utlagd i kalendern.
   * Utan uppskattning = alltid valbar (enklare/snabba uppgifter).
   */
  function planningProgress(estimatedHours, scheduledHours) {
    const estimated = estimatedHours == null ? null : Number(estimatedHours);
    const scheduled = Math.max(0, Math.round((Number(scheduledHours) || 0) * 100) / 100);
    const hasEstimate = estimated != null && Number.isFinite(estimated) && estimated > 0;
    const est = hasEstimate ? Math.round(estimated * 100) / 100 : null;
    const remaining = hasEstimate
      ? Math.round(Math.max(0, est - scheduled) * 100) / 100
      : null;
    const fullyPlanned = hasEstimate && scheduled + 1e-9 >= est;
    return {
      estimated: est,
      scheduled,
      remaining,
      hasEstimate,
      fullyPlanned,
      label: hasEstimate
        ? (fullyPlanned ? `${scheduled}/${est} t inplanerad` : `${scheduled}/${est} t · ${remaining} t kvar`)
        : (scheduled > 0 ? `${scheduled} t avsatt` : '')
    };
  }

  function isSelectableInPool(estimatedHours, scheduledHours) {
    return !planningProgress(estimatedHours, scheduledHours).fullyPlanned;
  }

  function trimIso(v) {
    const s = String(v || '').trim();
    if (!s) return '';
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) {
      return s.length >= 19 ? s.slice(0, 19) : `${s}:00`.slice(0, 19);
    }
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 19);
  }

  function newBlockId() {
    return `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  }

  function sortBlocks(blocks) {
    return (blocks || []).slice().sort((a, b) => String(a.start || '').localeCompare(String(b.start || '')));
  }

  function isBlockDone(raw) {
    if (!raw || typeof raw !== 'object') return false;
    if (raw.done === true || raw.done === 1 || raw.done === '1' || raw.done === 'true') return true;
    const st = String(raw.status || '').trim().toLowerCase();
    return st === 'klar' || st === 'avslutad' || st === 'done' || st === 'completed';
  }

  function isRunDoneStatus(status) {
    const st = String(status || '').trim();
    return st === 'Klar' || st === 'Avslutad';
  }

  /** True when every tidblock is klarmarkerat (tom lista = inget kvar → betraktas som klart). */
  function allBlocksDone(blocks) {
    const list = (blocks || []).map((b) => normalizeBlock(b)).filter(Boolean);
    if (!list.length) return true;
    return list.every((b) => isBlockDone(b));
  }

  /**
   * Status för en kalenderinstans (ett tillfälle).
   * Klarmarkering av ett block får inte måla syskon-block gröna via körningens Status.
   * Legacy: körning Klar utan några done-flaggor → alla block syns som Klar.
   */
  function instanceStatus(runStatus, block, allBlocks) {
    if (block && isBlockDone(block)) return 'Klar';
    const runDone = isRunDoneStatus(runStatus);
    if (!runDone) {
      const st = String(runStatus || '').trim();
      return st || 'Planerad';
    }
    const list = (allBlocks || []).map((b) => normalizeBlock(b)).filter(Boolean);
    const anyTracked = list.some((b) => isBlockDone(b));
    // Legacy hel-körning-klar innan per-block done fanns
    if (!anyTracked) return 'Klar';
    // Körning markerad Klar men detta tillfälle saknar done → visa som öppen (ska inte hända efter fix)
    return 'Pågående';
  }

  /** Markera ett eller alla tillfällen som klara (behålls i kalendern). */
  function markBlocksDone(blocks, onlyBlockId) {
    const list = sortBlocks((blocks || []).map((b) => normalizeBlock(b)).filter(Boolean));
    const wantId = onlyBlockId != null && onlyBlockId !== ''
      ? String(onlyBlockId).trim()
      : null;
    return list.map((b) => {
      if (wantId && b.id !== wantId) return { ...b };
      return { ...b, done: true };
    });
  }

  /** Ta bort done-flagga från ett eller alla tillfällen (ångra klarmarkering). */
  function clearBlockDone(block) {
    if (!block || typeof block !== 'object') return block;
    const next = { id: block.id, start: block.start, end: block.end };
    if (block.note) next.note = block.note;
    return next;
  }

  function markBlocksUndone(blocks, onlyBlockId) {
    const list = sortBlocks((blocks || []).map((b) => normalizeBlock(b)).filter(Boolean));
    const wantId = onlyBlockId != null && onlyBlockId !== ''
      ? String(onlyBlockId).trim()
      : null;
    if (!wantId) {
      return list.map((b) => clearBlockDone(b));
    }
    const anyTracked = list.some((b) => isBlockDone(b));
    // Legacy: körning Klar utan per-block done — materialisera övriga som done
    // så bara det ångrade tillfället öppnas.
    if (!anyTracked && list.length > 1) {
      return list.map((b) => (b.id === wantId ? clearBlockDone(b) : { ...b, done: true }));
    }
    return list.map((b) => (b.id === wantId ? clearBlockDone(b) : { ...b }));
  }

  const NOTE_MAX_LEN = 2000;

  /** Kort anteckning per tidblock (t.ex. vad som ska göras just då). */
  function normalizeNote(raw) {
    if (raw == null) return '';
    const s = String(raw).replace(/\r\n/g, '\n').trim();
    if (!s) return '';
    return s.length > NOTE_MAX_LEN ? s.slice(0, NOTE_MAX_LEN) : s;
  }

  function normalizeBlock(raw, fallbackId) {
    if (!raw || typeof raw !== 'object') return null;
    const start = trimIso(raw.start);
    const end = trimIso(raw.end);
    if (!start || !end) return null;
    const a = new Date(start).getTime();
    const b = new Date(end).getTime();
    if (!(b > a)) return null;
    const id = String(raw.id || fallbackId || '').trim() || newBlockId();
    const block = { id, start, end };
    if (isBlockDone(raw)) block.done = true;
    const note = normalizeNote(raw.note);
    if (note) block.note = note;
    return block;
  }

  function parseJsonBlocks(raw) {
    if (raw == null || raw === '') return null;
    if (Array.isArray(raw)) return raw;
    const s = String(raw).trim();
    if (!s) return null;
    try {
      const parsed = JSON.parse(s);
      return Array.isArray(parsed) ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  /**
   * Läs tidblock från körningsfält. Legacy Planerad start/slut blir ett block om JSON saknas.
   * @returns {{id:string,start:string,end:string}[]}
   */
  function parseBlocksFromFields(fields) {
    const f = fields || {};
    const fromJson = parseJsonBlocks(f[FIELD_BLOCKS]);
    if (fromJson) {
      const blocks = [];
      fromJson.forEach((item, i) => {
        const b = normalizeBlock(item, `legacy${i + 1}`);
        if (b) blocks.push(b);
      });
      if (blocks.length) return sortBlocks(blocks);
    }
    const start = trimIso(f[FIELD_START]);
    const end = trimIso(f[FIELD_END]);
    if (start && end) {
      const b = normalizeBlock({ id: 'legacy', start, end }, 'legacy');
      return b ? [b] : [];
    }
    if (start) {
      const b = normalizeBlock({ id: 'legacy', start, end: start }, 'legacy');
      // normalizeBlock rejects end<=start; synthesize +1h via caller if needed — skip here
      return [];
    }
    return [];
  }

  function serializeBlocks(blocks) {
    const list = sortBlocks(blocks)
      .map((b) => normalizeBlock(b))
      .filter(Boolean);
    return JSON.stringify(list.map((b) => {
      const row = { id: b.id, start: b.start, end: b.end };
      if (b.done) row.done = true;
      if (b.note) row.note = b.note;
      return row;
    }));
  }

  function primaryFromBlocks(blocks) {
    const sorted = sortBlocks((blocks || []).map((b) => normalizeBlock(b)).filter(Boolean));
    if (!sorted.length) return { start: null, end: null };
    return { start: sorted[0].start, end: sorted[0].end };
  }

  /**
   * Mutera blocklista.
   * @param {Array} current
   * @param {{ mode?: string, blockId?: string|null, start?: string|null, end?: string|null, done?: boolean, note?: string|null }} mutation
   *   mode: 'set' (ersätt allt med ett block / rensa), 'add', 'update', 'remove',
   *         'complete' / 'done' (markera tillfälle som klart — behålls i kalendern),
   *         'complete-all' (markera alla tillfällen som klara),
   *         'uncomplete' / 'reopen' (ångra klarmarkering på ett tillfälle),
   *         'uncomplete-all' / 'reopen-all' (ångra alla tillfällens klarmarkering)
   */
  function applyMutation(current, mutation) {
    const mode = String(mutation?.mode || 'set').trim().toLowerCase();
    const blockId = mutation?.blockId != null && mutation.blockId !== ''
      ? String(mutation.blockId).trim()
      : null;
    const hasStart = Object.prototype.hasOwnProperty.call(mutation || {}, 'start');
    const hasEnd = Object.prototype.hasOwnProperty.call(mutation || {}, 'end');
    const hasDone = Object.prototype.hasOwnProperty.call(mutation || {}, 'done');
    const hasNote = Object.prototype.hasOwnProperty.call(mutation || {}, 'note');
    const startVal = hasStart ? (mutation.start == null || mutation.start === '' ? null : trimIso(mutation.start)) : undefined;
    const endVal = hasEnd ? (mutation.end == null || mutation.end === '' ? null : trimIso(mutation.end)) : undefined;

    if (hasStart && mutation.start != null && mutation.start !== '' && startVal === '') {
      throw new Error('Ogiltig start-tid');
    }
    if (hasEnd && mutation.end != null && mutation.end !== '' && endVal === '') {
      throw new Error('Ogiltig slut-tid');
    }

    let blocks = sortBlocks((current || []).map((b) => normalizeBlock(b)).filter(Boolean));

    if (mode === 'complete-all' || mode === 'done-all') {
      return markBlocksDone(blocks, null);
    }

    if (mode === 'uncomplete-all' || mode === 'reopen-all' || mode === 'undone-all') {
      return markBlocksUndone(blocks, null);
    }

    if (mode === 'complete' || mode === 'done') {
      if (!blockId) throw new Error('blockId krävs för att klarmarkera tidblock');
      const idx = blocks.findIndex((b) => b.id === blockId);
      if (idx < 0) throw new Error('Tidblocket hittades inte');
      blocks[idx] = { ...blocks[idx], done: true };
      return sortBlocks(blocks);
    }

    if (mode === 'uncomplete' || mode === 'reopen' || mode === 'undone') {
      if (!blockId) throw new Error('blockId krävs för att ångra klarmarkering');
      const idx = blocks.findIndex((b) => b.id === blockId);
      if (idx < 0) throw new Error('Tidblocket hittades inte');
      return markBlocksUndone(blocks, blockId);
    }

    if (mode === 'remove') {
      if (!blockId) throw new Error('blockId krävs för att ta bort tidblock');
      blocks = blocks.filter((b) => b.id !== blockId);
      return blocks;
    }

    if (mode === 'add') {
      if (!startVal || !endVal) throw new Error('Ange start och end för nytt tidblock');
      if (!(new Date(endVal).getTime() > new Date(startVal).getTime())) {
        throw new Error('Slut måste vara efter start');
      }
      const id = blockId || newBlockId();
      const next = { id, start: startVal, end: endVal };
      if (hasNote) {
        const note = normalizeNote(mutation.note);
        if (note) next.note = note;
      }
      blocks.push(next);
      return sortBlocks(blocks);
    }

    if (mode === 'update') {
      if (!blockId) throw new Error('blockId krävs för att uppdatera tidblock');
      const idx = blocks.findIndex((b) => b.id === blockId);
      if (idx < 0) throw new Error('Tidblocket hittades inte');
      const prev = blocks[idx];
      // Note-only: behåll tider utan att kräva start/end i mutationen
      if (hasNote && !hasStart && !hasEnd && !hasDone) {
        const note = normalizeNote(mutation.note);
        const next = { id: blockId, start: prev.start, end: prev.end };
        if (prev.done) next.done = true;
        if (note) next.note = note;
        blocks[idx] = next;
        return sortBlocks(blocks);
      }
      const nextStart = hasStart ? startVal : prev.start;
      const nextEnd = hasEnd ? endVal : prev.end;
      if (nextStart == null || nextEnd == null) {
        // null = ta bort
        blocks.splice(idx, 1);
        return blocks;
      }
      if (!(new Date(nextEnd).getTime() > new Date(nextStart).getTime())) {
        throw new Error('Slut måste vara efter start');
      }
      const next = { id: blockId, start: nextStart, end: nextEnd };
      const nextDone = hasDone ? !!mutation.done : !!prev.done;
      if (nextDone) next.done = true;
      if (hasNote) {
        const note = normalizeNote(mutation.note);
        if (note) next.note = note;
      } else if (prev.note) {
        next.note = prev.note;
      }
      blocks[idx] = next;
      return sortBlocks(blocks);
    }

    // mode === 'set' (legacy): ersätt hela listan med ett block, eller rensa
    if ((hasStart && startVal == null) || (hasEnd && endVal == null && !hasStart)) {
      if ((hasStart && startVal == null) && (hasEnd && endVal == null)) return [];
    }
    if (startVal == null && endVal == null && (hasStart || hasEnd)) {
      return [];
    }
    if (!startVal || !endVal) {
      throw new Error('Ange start och end (ISO-datetime), eller null för att rensa.');
    }
    if (!(new Date(endVal).getTime() > new Date(startVal).getTime())) {
      throw new Error('Slut måste vara efter start');
    }
    const id = blockId || (blocks[0] && blocks[0].id) || newBlockId();
    return [{ id, start: startVal, end: endVal }];
  }

  /** Airtable-fält att spara för given blocklista. */
  function fieldsForBlocks(blocks) {
    const list = sortBlocks((blocks || []).map((b) => normalizeBlock(b)).filter(Boolean));
    const primary = primaryFromBlocks(list);
    return {
      [FIELD_BLOCKS]: serializeBlocks(list),
      [FIELD_START]: primary.start,
      [FIELD_END]: primary.end
    };
  }

  /**
   * Expandera körnings-events till en kalenderinstans per tidblock.
   * Utan block behålls en oschemalagd instans.
   */
  function expandScheduleInstances(events) {
    const out = [];
    (events || []).forEach((ev) => {
      if (!ev) return;
      if (ev.source === 'google' || String(ev.key || '').startsWith('gcal:')
        || ev.source === 'meeting' || String(ev.key || '').startsWith('meeting:')) {
        out.push(ev);
        return;
      }
      const blocks = Array.isArray(ev.scheduleBlocks)
        ? sortBlocks(ev.scheduleBlocks.map((b) => normalizeBlock(b)).filter(Boolean))
        : [];
      const runKey = String(ev.runKey || ev.key || '').split('#')[0];
      if (!blocks.length) {
        out.push({
          ...ev,
          runKey,
          blockId: null,
          scheduleBlocks: []
        });
        return;
      }
      blocks.forEach((b) => {
        const blockDone = !!b.done;
        out.push({
          ...ev,
          key: `${runKey}#${b.id}`,
          runKey,
          blockId: b.id,
          scheduledStart: b.start,
          scheduledEnd: b.end,
          scheduleBlocks: blocks,
          blockDone,
          blockNote: b.note || '',
          // Per tillfälle: syskon ärver inte Klar bara för att körningen har Status Klar
          status: instanceStatus(ev.status, b, blocks)
        });
      });
    });
    return out;
  }

  /** Unika körningar för sidopanel (en rad per uppdragskörning). */
  function uniqueRunEvents(events) {
    const map = new Map();
    (events || []).forEach((ev) => {
      if (!ev) return;
      if (ev.source === 'google' || String(ev.key || '').startsWith('gcal:')
        || ev.source === 'meeting' || String(ev.key || '').startsWith('meeting:')) return;
      const runKey = String(ev.runKey || String(ev.key || '').split('#')[0] || '').trim();
      if (!runKey) return;
      const prev = map.get(runKey);
      if (!prev) {
        map.set(runKey, {
          ...ev,
          key: runKey,
          runKey,
          blockId: null,
          scheduledStart: ev.scheduledStart || '',
          scheduledEnd: ev.scheduledEnd || '',
          scheduleBlocks: Array.isArray(ev.scheduleBlocks) ? ev.scheduleBlocks : [],
          estimatedHours: ev.estimatedHours != null ? ev.estimatedHours : null
        });
        return;
      }
      // Behåll tidigaste blockets start för meta/placering i listan
      const a = String(prev.scheduledStart || '');
      const b = String(ev.scheduledStart || '');
      if (b && (!a || b < a)) {
        prev.scheduledStart = ev.scheduledStart;
        prev.scheduledEnd = ev.scheduledEnd;
      }
      if (Array.isArray(ev.scheduleBlocks) && ev.scheduleBlocks.length > (prev.scheduleBlocks || []).length) {
        prev.scheduleBlocks = ev.scheduleBlocks;
      }
      if (prev.estimatedHours == null && ev.estimatedHours != null) {
        prev.estimatedHours = ev.estimatedHours;
      }
    });
    return Array.from(map.values());
  }

  function totalHours(blocks, durationHoursFn) {
    const dur = typeof durationHoursFn === 'function'
      ? durationHoursFn
      : (start, end) => {
        const a = new Date(start).getTime();
        const b = new Date(end).getTime();
        if (!(b > a)) return 0;
        return Math.round(((b - a) / 3600000) * 100) / 100;
      };
    return (blocks || []).reduce((sum, b) => {
      const h = dur(b.start, b.end);
      return sum + (Number(h) > 0 ? Number(h) : 0);
    }, 0);
  }

  return {
    FIELD_BLOCKS,
    FIELD_START,
    FIELD_END,
    FIELD_ESTIMATE,
    trimIso,
    newBlockId,
    sortBlocks,
    isBlockDone,
    isRunDoneStatus,
    allBlocksDone,
    instanceStatus,
    markBlocksDone,
    markBlocksUndone,
    NOTE_MAX_LEN,
    normalizeNote,
    normalizeBlock,
    parseBlocksFromFields,
    serializeBlocks,
    primaryFromBlocks,
    applyMutation,
    fieldsForBlocks,
    expandScheduleInstances,
    uniqueRunEvents,
    totalHours,
    parseEstimatedHours,
    planningProgress,
    isSelectableInPool
  };
});
