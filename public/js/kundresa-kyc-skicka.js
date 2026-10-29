/**
 * Kundresa steg 4 — review-and-send (popup only).
 * Presentation: Steg 4 · Skicka KYC mock (send-panel + accordion-preview).
 */
(function (global) {
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function trimStr(v) { return v == null ? '' : String(v).trim(); }
  function meaningful(v) {
    const s = trimStr(v);
    if (!s || s === 'Välj...' || s === '—' || s === '-') return '';
    return s;
  }
  function personRoller(p) {
    if (!p) return [];
    if (Array.isArray(p.roller)) return p.roller.map((r) => String(r || '').trim()).filter(Boolean);
    if (p.roll) return [String(p.roll).trim()].filter(Boolean);
    return [];
  }
  function hasVhRole(p) { return personRoller(p).some((r) => /verklig\s+huvudman/i.test(r)); }
  function isoDate(raw) {
    const s = trimStr(raw);
    const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : '';
  }
  function questionsLabel(n) {
    const c = Number(n) || 0;
    return c === 1 ? '1 fråga' : `${c} frågor`;
  }

  function resolveStatusLine(kyc, fields, recipientEmail) {
    const k = kyc || {};
    const f = fields || {};
    const kycUi = global.KycStatusUi;
    const status = kycUi && kycUi.effectiveKycStatus ? kycUi.effectiveKycStatus(k) : trimStr(k.status);
    const sentAt = isoDate(k.inviteSentAt || k.utskickningsdatum || f['KYC skickad datum']);
    const answeredAt = isoDate(k.customerAnsweredAt);
    const signedAt = isoDate(k.signeringsdatum);
    const email = trimStr(recipientEmail)
      || trimStr((Array.isArray(k.pendingSignerare) && k.pendingSignerare[0] && k.pendingSignerare[0].epost) || '');
    if (f['KYC-formulär utanför ClientFlow'] === true || f['KYC-formulär utanför ClientFlow'] === 'Ja') {
      const d = isoDate(f['KYC UTFÖRD DATUM']);
      return d ? `Besvarat ${d}` : 'Besvarat (utanför ClientFlow)';
    }
    if (/signerat/i.test(status) || signedAt) return signedAt ? `Signerat ${signedAt}` : 'Signerat';
    if (/besvarat/i.test(status) || answeredAt) return answeredAt ? `Besvarat ${answeredAt}` : 'Besvarat';
    if (/skickat|ifyllnad|invite|länk/i.test(status) || k.inviteToken || sentAt || k.inleedDokumentId) {
      if (sentAt && email) return `Skickat ${sentAt} till ${email}`;
      if (sentAt) return `Skickat ${sentAt}`;
      if (email) return `Skickat till ${email}`;
      return 'Skickat';
    }
    return 'Inte skickat';
  }

  function pickRecipients(kontaktPersoner) {
    const list = Array.isArray(kontaktPersoner) ? kontaktPersoner : [];
    const withEmail = list.filter((p) => trimStr(p && p.epost));
    const vhs = withEmail.filter(hasVhRole);
    return { recipients: withEmail, defaultRecipient: vhs[0] || withEmail[0] || null };
  }

  function q(label, value, opts) {
    const o = opts || {};
    const prefilled = meaningful(o.prefilled);
    const val = meaningful(value);
    return {
      label,
      value: val,
      prefilled,
      empty: !val && !prefilled,
      display: val || prefilled || ''
    };
  }

  function yn(v) {
    if (v === true || v === 'Ja' || /^ja$/i.test(String(v || ''))) return 'Ja';
    if (v === false || v === 'Nej' || /^nej$/i.test(String(v || ''))) return 'Nej';
    return meaningful(v);
  }

  function buildSections(ctx) {
    const saved = ctx.kyc || {};
    const f = ctx.fields || {};
    const arEnskild = /enskild/i.test(String(f.Bolagsform || saved.bolagsform || ''));
    const verksamhetField = meaningful(f.Verksamhet) || meaningful(f['Beskrivning av kunden']);
    const kostnaderField = meaningful(f.Kostnader);
    const intakterField = meaningful(f['Intäkterna']);
    const personer = Array.isArray(ctx.kontaktPersoner) ? ctx.kontaktPersoner : [];
    let foretradare = Array.isArray(saved.foretradare) ? saved.foretradare : [];
    let huvudman = Array.isArray(saved.huvudman) ? saved.huvudman : [];
    if (!foretradare.length && personer.length) {
      foretradare = personer.filter((p) => !hasVhRole(p) || personRoller(p).length > 1);
      if (!foretradare.length) foretradare = personer.slice();
    }
    if (!arEnskild && !huvudman.length) {
      huvudman = personer.filter(hasVhRole);
    }
    const personCount = Math.max(personer.length, new Set([
      ...foretradare.map((p) => trimStr(p && p.namn)),
      ...huvudman.map((p) => trimStr(p && p.namn))
    ].filter(Boolean)).size, 0);

    const personLine = (p) => [p.namn, p.personnr || p.personnummer, p.hemvist || p.skatterattslig_hemvist]
      .filter(Boolean).join(' · ');

    const sections = [
      {
        num: 1,
        name: 'Företaget',
        questions: [
          q('Företagets namn', saved.foretagsnamn || f.Namn || ''),
          q('Organisationsnummer', saved.orgnr || f.Orgnr || ''),
          q('Skatterättslig hemvist', saved.skatterattslig_hemvist_foretag || 'Sverige')
        ]
      },
      {
        num: 2,
        name: 'Personer och verklig huvudman',
        personCount: personCount || Math.max(foretradare.length + (arEnskild ? 0 : huvudman.length), 1),
        questions: [
          ...(foretradare.length
            ? foretradare.map((p, i) => q(
              foretradare.length > 1 ? `Företrädare ${i + 1}` : 'Företrädare',
              personLine(p)
            ))
            : [q('Företrädare', '', {})]),
          ...(!arEnskild
            ? (huvudman.length
              ? huvudman.map((p, i) => q(
                huvudman.length > 1 ? `Verklig huvudman ${i + 1}` : 'Verklig huvudman',
                personLine(p)
              ))
              : [q('Verklig huvudman', '', {})])
            : [])
        ]
      }
    ];

    if (!arEnskild) {
      sections.push({
        num: 3,
        name: 'Ägande',
        questions: [
          q('Noterat bolag eller ägt av noterat bolag', yn(saved.vh_noterat_bolag)),
          q('Utländska ägare eller styrelseledamöter', yn(saved.vh_utlandska_agare))
        ]
      });
    }

    const nBase = arEnskild ? 3 : 4;
    sections.push(
      {
        num: nBase,
        name: 'Pengarnas ursprung',
        questions: [q('Pengarnas ursprung', saved.kapitalUrsprung)]
      },
      {
        num: nBase + 1,
        name: 'Verksamhet',
        questions: [
          q('Verksamhet', saved.verksamhet && !verksamhetField ? saved.verksamhet : '', verksamhetField ? { prefilled: verksamhetField } : {}),
          q('Kostnader', saved.kostnader && !kostnaderField ? saved.kostnader : '', kostnaderField ? { prefilled: kostnaderField } : {}),
          q('Intäkter', saved.intakterna && !intakterField ? saved.intakterna : '', intakterField ? { prefilled: intakterField } : {}),
          q('Anställda', saved.anstallda),
          q('Omsättning', saved.omsattning || f['Omsättning'])
        ]
      },
      {
        num: nBase + 2,
        name: 'Internationell handel',
        questions: [
          q('Handel utanför Sverige', yn(saved.internationellHandel)),
          q('Länder', saved.internationellaLander)
        ]
      },
      {
        num: nBase + 3,
        name: 'Kontanter',
        questions: [
          q('Hanterar kontanter', yn(saved.kontanter)),
          q('Andel kontanter', saved.kontanterAndel)
        ]
      },
      {
        num: nBase + 4,
        name: 'Kryptovaluta',
        questions: [q('Transaktioner i kryptovaluta', yn(saved.kryptovaluta))]
      }
    );

    return sections.map((sec) => {
      const qs = (sec.questions || []).filter(Boolean);
      return { ...sec, questions: qs, count: qs.length, status: sectionStatus({ ...sec, questions: qs }) };
    });
  }

  function sectionStatus(sec) {
    const qs = sec.questions || [];
    const filled = qs.filter((x) => !x.empty);
    const primary = qs[0];
    if (!filled.length) return { label: 'Kunden svarar', kind: 'customer' };
    if (primary && /^(Ja|Nej)$/i.test(primary.display) && qs.length <= 2) {
      return { label: `Förifyllt: ${primary.display}`, kind: 'prefilled' };
    }
    if (sec.name === 'Personer och verklig huvudman' && sec.personCount) {
      const n = sec.personCount;
      return { label: `Förifyllt · ${n} ${n === 1 ? 'person' : 'personer'}`, kind: 'prefilled' };
    }
    if (filled.length < qs.length && !filled.some((x) => x.display)) {
      return { label: 'Kunden svarar', kind: 'customer' };
    }
    return { label: 'Förifyllt', kind: 'prefilled' };
  }

  function renderQuestion(qItem) {
    const valueHtml = qItem.display
      ? `<span class="kundresa-kyc-q-value">${esc(qItem.display)}</span>`
      : `<span class="kundresa-kyc-q-empty">Kunden svarar</span>`;
    return `<div class="kundresa-kyc-q"><span class="kundresa-kyc-q-label">${esc(qItem.label)}</span>${valueHtml}</div>`;
  }

  function normalizeBlockers(blockers) {
    return (Array.isArray(blockers) ? blockers : []).map((b) => {
      if (b && typeof b === 'object') {
        return {
          reason: trimStr(b.reason || b.message || b.text || ''),
          step: Number(b.step || b.gotoStep || 1) || 1
        };
      }
      const text = trimStr(b);
      let step = 1;
      const m = text.match(/steg\s*(\d+)/i);
      if (m) step = Number(m[1]) || 1;
      return { reason: text, step };
    }).filter((b) => b.reason);
  }

  function recipientOptionLabel(p) {
    const namn = trimStr(p && p.namn) || 'Namnlös';
    const email = trimStr(p && p.epost);
    const vh = hasVhRole(p) ? ' (verklig huvudman)' : '';
    return email ? `${namn} · ${email}${vh}` : `${namn}${vh}`;
  }

  function render(ctx) {
    const fields = ctx.fields || {};
    const kyc = ctx.kyc || {};
    const picked = pickRecipients(ctx.kontaktPersoner);
    const selected = ctx.selectedRecipient || picked.defaultRecipient;
    const recipients = picked.recipients;
    const statusLine = resolveStatusLine(kyc, fields, selected && selected.epost);
    const sent = !/^Inte skickat$/i.test(statusLine);
    const inviteUrl = trimStr(ctx.inviteUrl || '');
    const blockers = normalizeBlockers(ctx.blockers);
    const canSend = blockers.length === 0 && !!selected;
    const sections = buildSections(ctx);
    const sendLabel = sent ? 'Skicka igen' : 'Skicka till kund';

    const recipientHtml = recipients.length
      ? `<div class="kundresa-kyc-recipient-field">
          <label class="kundresa-kyc-field-label" for="kundresa-kyc-mottagare">Skickas till</label>
          <select id="kundresa-kyc-mottagare" class="kundresa-kyc-recipient-select" data-kundresa-kyc-recipient-select aria-label="Välj mottagare">
            ${recipients.map((p, i) => {
              const isSel = selected
                && trimStr(selected.epost) === trimStr(p.epost)
                && trimStr(selected.namn) === trimStr(p.namn);
              return `<option value="${i}"${isSel ? ' selected' : ''}>${esc(recipientOptionLabel(p))}</option>`;
            }).join('')}
          </select>
        </div>`
      : `<div class="kundresa-kyc-recipient is-missing" data-kundresa-kyc-recipient>
          <p class="kundresa-kyc-missing">Ingen person med e-post – <a href="#kundresa-step-1" data-kundresa-goto-step="1">lägg till i steg 1</a></p>
        </div>`;

    const blockersHtml = blockers.length
      ? blockers.map((b) => `<div class="kundresa-kyc-blocker" role="status">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v6M12 16.5v.5"></path></svg>
          <span>${esc(b.reason)}. <a href="#kundresa-step-${esc(String(b.step))}" data-kundresa-goto-step="${esc(String(b.step))}">Gå till steg ${esc(String(b.step))}</a></span>
        </div>`).join('')
      : '';

    return `<div class="kundresa-kyc-skicka" data-kundresa-kyc-skicka>
      <section class="kundresa-kyc-send-panel" aria-label="Skicka KYC">
        <div class="kundresa-kyc-send-top">
          ${recipientHtml}
          <div class="kundresa-kyc-send-actions">
            <button type="button" class="btn btn-secondary btn-sm kundresa-kyc-copy-btn" data-kundresa-kyc-copy ${inviteUrl ? '' : 'disabled'} title="${esc(inviteUrl ? 'Kopiera kundlänk' : 'Skicka först för att få en länk')}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"></rect><path d="M5 15V5a1 1 0 011-1h10"></path></svg>
              Kopiera länk
            </button>
            <button type="button" class="btn btn-primary btn-sm" data-kundresa-kyc-send-panel ${canSend ? '' : 'disabled'} title="${esc(canSend ? sendLabel : (blockers[0]?.reason || 'Kan inte skicka ännu'))}">${esc(sendLabel)}</button>
          </div>
        </div>
        <div class="kundresa-kyc-status-row">
          <p class="kundresa-kyc-status-line" role="status">Status: <strong>${esc(statusLine)}</strong>${sent ? '' : ' · kunden fyller i, kompletterar och signerar med BankID'}</p>
          <a class="kundresa-kyc-open-link" data-kundresa-kyc-open href="${esc(inviteUrl || '#')}" target="_blank" rel="noopener noreferrer" ${inviteUrl ? '' : 'aria-disabled="true" tabindex="-1"'}>Öppna som kunden ser det</a>
        </div>
        ${blockersHtml}
      </section>
      <section class="kundresa-kyc-preview" aria-label="Förhandsgranskning">
        <div class="kundresa-kyc-preview-head">
          <h5 class="kundresa-kyc-preview-title">Det här får kunden se</h5>
          <span class="kundresa-kyc-preview-help">Förifyllt visas som förslag som kunden bekräftar</span>
        </div>
        <ul class="kundresa-kyc-section-list">
          ${sections.map((sec) => {
            const st = sec.status || { label: questionsLabel(sec.count), kind: 'prefilled' };
            return `<li class="kundresa-kyc-section is-collapsed" data-kundresa-kyc-section>
              <button type="button" class="kundresa-kyc-section-row" data-kundresa-kyc-toggle aria-expanded="false">
                <span class="kundresa-kyc-section-num">${esc(String(sec.num))}</span>
                <span class="kundresa-kyc-section-name">${esc(sec.name)}</span>
                <span class="kundresa-kyc-section-status is-${esc(st.kind)}">${esc(st.label)}</span>
                <span class="kundresa-kyc-section-chevron" aria-hidden="true"></span>
              </button>
              <div class="kundresa-kyc-section-body" hidden>${sec.questions.map(renderQuestion).join('')}</div>
            </li>`;
          }).join('')}
        </ul>
      </section>
    </div>`;
  }

  function bind(root, handlers) {
    if (!root) return;
    const h = handlers || {};
    root.querySelectorAll('[data-kundresa-kyc-toggle]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const li = btn.closest('[data-kundresa-kyc-section]');
        if (!li) return;
        const wasCollapsed = li.classList.contains('is-collapsed');
        root.querySelectorAll('[data-kundresa-kyc-section]').forEach((other) => {
          other.classList.add('is-collapsed');
          const ob = other.querySelector('[data-kundresa-kyc-toggle]');
          if (ob) ob.setAttribute('aria-expanded', 'false');
          const body = other.querySelector('.kundresa-kyc-section-body');
          if (body) body.hidden = true;
        });
        if (wasCollapsed) {
          li.classList.remove('is-collapsed');
          btn.setAttribute('aria-expanded', 'true');
          const body = li.querySelector('.kundresa-kyc-section-body');
          if (body) body.hidden = false;
        }
      });
    });
    const sel = root.querySelector('[data-kundresa-kyc-recipient-select]');
    if (sel) {
      sel.addEventListener('change', () => {
        if (typeof h.onRecipientChange === 'function') h.onRecipientChange(Number(sel.value));
      });
    }
    const sendBtn = root.querySelector('[data-kundresa-kyc-send-panel]');
    if (sendBtn && typeof h.onSend === 'function') sendBtn.addEventListener('click', () => h.onSend({ source: 'panel' }));
    const copyBtn = root.querySelector('[data-kundresa-kyc-copy]');
    if (copyBtn && typeof h.onCopy === 'function') copyBtn.addEventListener('click', () => h.onCopy());
    const openLink = root.querySelector('[data-kundresa-kyc-open]');
    if (openLink && typeof h.onOpen === 'function') {
      openLink.addEventListener('click', (e) => {
        if (openLink.getAttribute('aria-disabled') === 'true' || openLink.getAttribute('href') === '#') {
          e.preventDefault();
          h.onOpen();
        }
      });
    }
    root.querySelectorAll('[data-kundresa-goto-step]').forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        if (typeof h.onGotoStep === 'function') h.onGotoStep(Number(a.getAttribute('data-kundresa-goto-step') || 1));
      });
    });
  }

  const api = { render, bind, pickRecipients, resolveStatusLine, buildSections, questionsLabel };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.KundresaKycSkicka = api;
})(typeof window !== 'undefined' ? window : globalThis);
