/**
 * Kalender – mötesbokning / inbjudningar som synliga tidblock.
 * Används av kalender.js i webbläsaren och av tester i Node.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.KalenderMeetingEvents = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MEET_URL_RE =
    /https:\/\/(?:meet\.google\.com\/[a-z0-9-]+|teams\.microsoft\.com\/l\/meetup-join\/[^\s<>"']+|[\w.-]*zoom\.us\/j\/[^\s<>"']+)/i;

  function toDate(iso) {
    const s = String(iso || '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
  }

  function toLocalDateTime(iso) {
    const s = String(iso || '').trim();
    if (!s) return '';
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) {
      return s.length >= 19 ? s.slice(0, 19) : s.slice(0, 16) + ':00';
    }
    const ms = Date.parse(s);
    if (!Number.isFinite(ms)) return '';
    const d = new Date(ms);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  /** Extrahera videolänk från Plats / hangoutLink / description. */
  function meetingUrlFromInvite(invite) {
    const src = invite || {};
    const direct = String(src.hangoutLink || src.meetingUrl || '').trim();
    if (/^https?:\/\//i.test(direct)) return direct;
    const blob = [src.location, src.note, src.message, src.description]
      .map((x) => String(x || ''))
      .join('\n');
    const hit = blob.match(MEET_URL_RE);
    return hit ? hit[0].replace(/[),.;]+$/g, '') : '';
  }

  function shortMeetingLabel(url) {
    const u = String(url || '').trim();
    if (!u) return '';
    if (/meet\.google\.com/i.test(u)) return 'Google Meet';
    if (/teams\.microsoft\.com/i.test(u)) return 'Teams';
    if (/zoom\.us/i.test(u)) return 'Zoom';
    return 'Möteslänk';
  }

  /**
   * Airtable-mötesbokning → kalender-event (source: meeting).
   * @returns {object|null}
   */
  function mapInviteToCalendarEvent(invite) {
    const inv = invite || {};
    const id = String(inv.id || '').trim();
    const status = String(inv.status || '').trim();
    if (!id || status !== 'Bokad') return null;
    const start = toLocalDateTime(inv.bookedStart || inv.start);
    const end = toLocalDateTime(inv.bookedEnd || inv.end);
    if (!start || !end) return null;
    const day = toDate(start);
    if (!day) return null;

    const bookerName = String(inv.bookerName || '').trim();
    const customerName = String(inv.customerName || '').trim();
    const title = String(inv.title || 'Möte').trim() || 'Möte';
    const summary = bookerName
      ? `${title} · ${bookerName}`
      : (customerName ? `${title} · ${customerName}` : title);
    const meetingUrl = meetingUrlFromInvite(inv);
    const location = String(inv.location || '').trim();
    const meetingType = String(inv.meetingType || '').trim();

    return {
      key: `meeting:${id}`,
      source: 'meeting',
      inviteId: id,
      clientflowKey: `meeting:${id}`,
      typ: 'Möte',
      deadline: day,
      startDate: day,
      periodKey: '',
      periodLabel: '',
      status: 'Planerad',
      scheduledStart: start,
      scheduledEnd: end,
      allDay: false,
      transparency: 'opaque',
      summary,
      title,
      description: String(inv.note || inv.message || '').trim(),
      location,
      meetingType,
      bookerName,
      bookerEmail: String(inv.bookerEmail || '').trim(),
      hangoutLink: meetingUrl || null,
      meetingUrl: meetingUrl || '',
      htmlLink: String(inv.manageUrl || inv.bookingUrl || '').trim(),
      inRange: true,
      record: {
        id: `meeting:${id}`,
        fields: {
          Kundnamn: summary,
          Namn: summary,
          'Kund ID': String(inv.customerId || '').trim()
        }
      },
      runRec: null,
      invite: inv
    };
  }

  /**
   * Filtrera bokade inbjudningar i synligt intervall och mappa till events.
   */
  function buildMeetingEventsFromInvites(invites, range) {
    const start = String(range?.start || '').slice(0, 10);
    const end = String(range?.end || '').slice(0, 10);
    const out = [];
    (invites || []).forEach((inv) => {
      const mapped = mapInviteToCalendarEvent(inv);
      if (!mapped) return;
      if (start && end) {
        const day = mapped.deadline;
        if (day < start || day > end) return;
      }
      out.push(mapped);
    });
    return out;
  }

  /**
   * Slå ihop Airtable-möten med Google-pull: undvik dubbletter när samma
   * möte redan syns som gcal:* med clientflowKey meeting:id.
   * Prefererar Google-händelsen (hangoutLink) men berikar möteslänk från Airtable.
   */
  function mergeMeetingWithGoogleEvents(meetingEvents, googleEvents) {
    const meetings = Array.isArray(meetingEvents) ? meetingEvents.slice() : [];
    const google = Array.isArray(googleEvents) ? googleEvents.map((g) => ({ ...g })) : [];
    const covered = new Set();

    google.forEach((g) => {
      const cfKey = String(g.clientflowKey || '').trim();
      let inviteId = '';
      if (cfKey.startsWith('meeting:')) inviteId = cfKey.slice('meeting:'.length);
      const match = inviteId
        ? meetings.find((m) => m.inviteId === inviteId)
        : null;
      if (match) {
        covered.add(match.inviteId);
        if (!g.meetingUrl && match.meetingUrl) {
          g.meetingUrl = match.meetingUrl;
          g.hangoutLink = g.hangoutLink || match.meetingUrl;
        }
        if (!g.location && match.location) g.location = match.location;
      } else if (!g.meetingUrl) {
        // Fallback: samma starttid + liknande titel
        const gStart = String(g.scheduledStart || '').slice(0, 16);
        const soft = meetings.find((m) => {
          if (covered.has(m.inviteId)) return false;
          return String(m.scheduledStart || '').slice(0, 16) === gStart
            && String(m.summary || '').toLowerCase().includes(
              String(g.summary || '').split('·')[0].trim().toLowerCase()
            );
        });
        if (soft) {
          covered.add(soft.inviteId);
          if (soft.meetingUrl) {
            g.meetingUrl = soft.meetingUrl;
            g.hangoutLink = g.hangoutLink || soft.meetingUrl;
          }
        }
      }
    });

    const remaining = meetings.filter((m) => !covered.has(m.inviteId));
    return { googleEvents: google, meetingEvents: remaining };
  }

  return {
    MEET_URL_RE,
    meetingUrlFromInvite,
    shortMeetingLabel,
    mapInviteToCalendarEvent,
    buildMeetingEventsFromInvites,
    mergeMeetingWithGoogleEvents
  };
});
