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

  function normalizeBlock(raw, fallbackId) {
    if (!raw || typeof raw !== 'object') return null;
    const start = trimIso(raw.start);
    const end = trimIso(raw.end);
    if (!start || !end) return null;
    const a = new Date(start).getTime();
    const b = new Date(end).getTime();
    if (!(b > a)) return null;
    const id = String(raw.id || fallbackId || '').trim() || newBlockId();
    return { id, start, end };
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
    return JSON.stringify(list.map((b) => ({ id: b.id, start: b.start, end: b.end })));
  }

  function primaryFromBlocks(blocks) {
    const sorted = sortBlocks((blocks || []).map((b) => normalizeBlock(b)).filter(Boolean));
    if (!sorted.length) return { start: null, end: null };
    return { start: sorted[0].start, end: sorted[0].end };
  }

  /**
   * Mutera blocklista.
   * @param {Array} current
   * @param {{ mode?: string, blockId?: string|null, start?: string|null, end?: string|null }} mutation
   *   mode: 'set' (ersätt allt med ett block / rensa), 'add', 'update', 'remove'
   */
  function applyMutation(current, mutation) {
    const mode = String(mutation?.mode || 'set').trim().toLowerCase();
    const blockId = mutation?.blockId != null && mutation.blockId !== ''
      ? String(mutation.blockId).trim()
      : null;
    const hasStart = Object.prototype.hasOwnProperty.call(mutation || {}, 'start');
    const hasEnd = Object.prototype.hasOwnProperty.call(mutation || {}, 'end');
    const startVal = hasStart ? (mutation.start == null || mutation.start === '' ? null : trimIso(mutation.start)) : undefined;
    const endVal = hasEnd ? (mutation.end == null || mutation.end === '' ? null : trimIso(mutation.end)) : undefined;

    if (hasStart && mutation.start != null && mutation.start !== '' && startVal === '') {
      throw new Error('Ogiltig start-tid');
    }
    if (hasEnd && mutation.end != null && mutation.end !== '' && endVal === '') {
      throw new Error('Ogiltig slut-tid');
    }

    let blocks = sortBlocks((current || []).map((b) => normalizeBlock(b)).filter(Boolean));

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
      blocks.push({ id, start: startVal, end: endVal });
      return sortBlocks(blocks);
    }

    if (mode === 'update') {
      if (!blockId) throw new Error('blockId krävs för att uppdatera tidblock');
      const idx = blocks.findIndex((b) => b.id === blockId);
      if (idx < 0) throw new Error('Tidblocket hittades inte');
      const nextStart = hasStart ? startVal : blocks[idx].start;
      const nextEnd = hasEnd ? endVal : blocks[idx].end;
      if (nextStart == null || nextEnd == null) {
        // null = ta bort
        blocks.splice(idx, 1);
        return blocks;
      }
      if (!(new Date(nextEnd).getTime() > new Date(nextStart).getTime())) {
        throw new Error('Slut måste vara efter start');
      }
      blocks[idx] = { id: blockId, start: nextStart, end: nextEnd };
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
      if (ev.source === 'google' || String(ev.key || '').startsWith('gcal:')) {
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
        out.push({
          ...ev,
          key: `${runKey}#${b.id}`,
          runKey,
          blockId: b.id,
          scheduledStart: b.start,
          scheduledEnd: b.end,
          scheduleBlocks: blocks
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
      if (ev.source === 'google' || String(ev.key || '').startsWith('gcal:')) return;
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
          scheduleBlocks: Array.isArray(ev.scheduleBlocks) ? ev.scheduleBlocks : []
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
    trimIso,
    newBlockId,
    sortBlocks,
    normalizeBlock,
    parseBlocksFromFields,
    serializeBlocks,
    primaryFromBlocks,
    applyMutation,
    fieldsForBlocks,
    expandScheduleInstances,
    uniqueRunEvents,
    totalHours
  };
});
