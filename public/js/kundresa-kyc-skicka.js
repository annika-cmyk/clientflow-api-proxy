/**
 * Kundresa steg 4 — review-and-send (popup only).
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
    if (/signerat/i.test(status) || signedAt) return signedAt ? `Signerat (BankID) ${signedAt}` : 'Signerat (BankID)';
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
    return { label, value: meaningful(value), prefilled: o.prefilled || '', note: o.note || '', empty: !meaningful(value) && !o.prefilled };
  }

  function buildSections(ctx) {
    const saved = ctx.kyc || {};
    const f = ctx.fields || {};
    const arEnskild = /enskild/i.test(String(f.Bolagsform || saved.bolagsform || ''));
    const verksamhetField = meaningful(f.Verksamhet) || meaningful(f['Beskrivning av kunden']);
    const kostnaderField = meaningful(f.Kostnader);
    const intakterField = meaningful(f['Intäkterna']);
    const foretradare = Array.isArray(saved.foretradare) ? saved.foretradare : [];
    const huvudman = Array.isArray(saved.huvudman) ? saved.huvudman : [];
    const sections = [
      { num: 1, name: 'Företaget', questions: [
        q('Företagets namn', saved.foretagsnamn || f.Namn || ''),
        q('Organisationsnummer', saved.orgnr || f.Orgnr || ''),
        q('Skatterättslig hemvist', saved.skatterattslig_hemvist_foretag || 'Sverige')
      ]},
      { num: 2, name: 'Företrädare', questions: foretradare.length
        ? foretradare.map((p, i) => q(foretradare.length > 1 ? `Företrädare ${i + 1}` : 'Företrädare', [p.namn, p.personnr, p.hemvist || p.skatterattslig_hemvist].filter(Boolean).join(' · ')))
        : [q('Företrädare', '', { note: 'Kunden anger företrädare' })] }
    ];
    if (!arEnskild) {
      sections.push({ num: 3, name: 'Verklig huvudman', questions: [
        ...(huvudman.length
          ? huvudman.map((p, i) => q(huvudman.length > 1 ? `Huvudman ${i + 1}` : 'Verklig huvudman', [p.namn, p.personnr, p.hemvist || p.skatterattslig_hemvist].filter(Boolean).join(' · ')))
          : [q('Verklig huvudman', '', { note: 'Kunden anger verklig huvudman' })]),
        q('Noterat bolag eller ägt av noterat bolag', saved.vh_noterat_bolag === true || saved.vh_noterat_bolag === 'Ja' ? 'Ja' : (saved.vh_noterat_bolag === false || saved.vh_noterat_bolag === 'Nej' ? 'Nej' : '')),
        q('Utländska ägare eller styrelseledamöter', saved.vh_utlandska_agare === true || saved.vh_utlandska_agare === 'Ja' ? 'Ja' : (saved.vh_utlandska_agare === false || saved.vh_utlandska_agare === 'Nej' ? 'Nej' : ''))
      ]});
    }
    const nPep = arEnskild ? 3 : 4;
    sections.push(
      { num: nPep, name: 'PEP', questions: [q('PEP-status', saved.pep), q('Familjemedlem/medarbetare till PEP', saved.pepFamilj)] },
      { num: nPep + 1, name: 'Affärsförbindelsens syfte', questions: [
        q('Syfte med affärsrelationen', saved.syfte_affarsrelation || 'sedvanliga redovisningstjänster'),
        q('Byråns tjänster', saved.tjanster || ctx.tjanster || ''),
        q('Pengarnas ursprung', saved.kapitalUrsprung),
        q('Antal anställda', saved.anstallda),
        q('Uppskattad årsomsättning', saved.omsattning || f['Omsättning']),
        q('Verksamhet', saved.verksamhet && !verksamhetField ? saved.verksamhet : '', verksamhetField ? { prefilled: verksamhetField, note: 'Förifyllt från steg 2' } : { note: 'Kunden beskriver verksamheten' }),
        q('Kostnader', saved.kostnader && !kostnaderField ? saved.kostnader : '', kostnaderField ? { prefilled: kostnaderField, note: 'Förifyllt från steg 2' } : { note: 'Kunden beskriver kostnaderna' }),
        q('Intäkterna', saved.intakterna && !intakterField ? saved.intakterna : '', intakterField ? { prefilled: intakterField, note: 'Förifyllt från steg 2' } : { note: 'Kunden beskriver intäkterna' })
      ]},
      { num: nPep + 2, name: 'Internationell handel', questions: [q('Handel utanför Sverige', saved.internationellHandel), q('Länder', saved.internationellaLander)] },
      { num: nPep + 3, name: 'Kontanter', questions: [q('Hanterar kontanter', saved.kontanter), q('Andel kontanter', saved.kontanterAndel)] },
      { num: nPep + 4, name: 'Krypto', questions: [q('Transaktioner i kryptovaluta', saved.kryptovaluta)] }
    );
    return sections.map((sec) => {
      const qs = sec.questions.filter(Boolean);
      return { ...sec, questions: qs, count: qs.length };
    });
  }

  function prefilledHint(sec) {
    const pref = (sec.questions || []).find((x) => x.prefilled);
    if (!pref) return '';
    const short = trimStr(pref.prefilled);
    return `Förifyllt: ${short.length > 48 ? short.slice(0, 46) + '…' : short}`;
  }

  function renderQuestion(qItem) {
    if (qItem.prefilled) {
      return `<div class="kundresa-kyc-q"><div class="kundresa-kyc-q-label">${esc(qItem.label)}</div><div class="kundresa-kyc-q-prefilled">Förifyllt från steg 2: ${esc(qItem.prefilled)}</div><div class="kundresa-kyc-q-note">Kunden behöver inte fylla i detta igen.</div></div>`;
    }
    if (qItem.value) {
      return `<div class="kundresa-kyc-q"><div class="kundresa-kyc-q-label">${esc(qItem.label)}</div><div class="kundresa-kyc-q-value">${esc(qItem.value)}</div>${qItem.note ? `<div class="kundresa-kyc-q-note">${esc(qItem.note)}</div>` : ''}</div>`;
    }
    return `<div class="kundresa-kyc-q"><div class="kundresa-kyc-q-label">${esc(qItem.label)}</div><div class="kundresa-kyc-q-empty">${esc(qItem.note || 'Kunden svarar')}</div></div>`;
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
    const blockers = Array.isArray(ctx.blockers) ? ctx.blockers : [];
    const canSend = blockers.length === 0 && !!selected;
    const sections = buildSections(ctx);
    const sendLabel = sent ? 'Skicka igen' : 'Skicka till kund';
    const recipientHtml = recipients.length
      ? `<div class="kundresa-kyc-recipient" data-kundresa-kyc-recipient>
          <div class="kundresa-kyc-recipient-main">
            <strong class="kundresa-kyc-recipient-name">${esc(selected?.namn || 'Mottagare')}</strong>
            <span class="kundresa-kyc-recipient-email">${esc(selected?.epost || '')}</span>
          </div>
          ${recipients.length > 1 ? `<button type="button" class="btn-link kundresa-kyc-swap" data-kundresa-kyc-swap>Byt mottagare</button>` : ''}
          <select class="kundresa-kyc-recipient-select" data-kundresa-kyc-recipient-select hidden aria-label="Välj mottagare">
            ${recipients.map((p, i) => {
              const isSel = selected && trimStr(selected.epost) === trimStr(p.epost) && trimStr(selected.namn) === trimStr(p.namn);
              return `<option value="${i}"${isSel ? ' selected' : ''}>${esc(p.namn || 'Namnlös')} — ${esc(p.epost)}</option>`;
            }).join('')}
          </select>
        </div>`
      : `<div class="kundresa-kyc-recipient is-missing" data-kundresa-kyc-recipient>
          <p class="kundresa-kyc-missing">Ingen person med e-post – <a href="#kundresa-step-1" data-kundresa-goto-step="1">lägg till i steg 1</a></p>
        </div>`;

    return `<div class="kundresa-kyc-skicka" data-kundresa-kyc-skicka>
      <section class="kundresa-kyc-send-panel" aria-label="Skicka KYC">
        ${recipientHtml}
        <p class="kundresa-kyc-status-line" role="status">${esc(statusLine)}</p>
        <div class="kundresa-kyc-send-actions">
          <button type="button" class="btn btn-primary btn-sm" data-kundresa-kyc-send-panel ${canSend ? '' : 'disabled'} title="${esc(canSend ? sendLabel : (blockers[0] || 'Kan inte skicka ännu'))}">${esc(sendLabel)}</button>
          <button type="button" class="btn btn-secondary btn-sm" data-kundresa-kyc-copy ${inviteUrl ? '' : 'disabled'} title="${esc(inviteUrl ? 'Kopiera kundlänk' : 'Skicka först för att få en länk')}">Kopiera länk</button>
          <a class="kundresa-kyc-open-link" data-kundresa-kyc-open href="${esc(inviteUrl || '#')}" target="_blank" rel="noopener noreferrer" ${inviteUrl ? '' : 'aria-disabled="true" tabindex="-1"'}>Öppna som kunden ser det</a>
        </div>
        <p class="kundresa-kyc-help">Kunden fyller i och intygar uppgifterna själv (Kundens uppgifter). Ingen riskinformation visas i formuläret.</p>
        ${sent ? `<div class="kundresa-kyc-next" role="status">
          <strong>Vad händer sen?</strong>
          <p>När kunden svarat (Besvarat/Signerat) fortsätter ni med <em>Riskbedömning &amp; avtal</em> — ett separat flöde efter uppläggningen. Kedjan: Kunden lämnar uppgifter → byrån bedömer risken → beslut → avtal. Kunden ser aldrig riskbedömningen.</p>
        </div>` : `<p class="kundresa-kyc-next-hint">Efter utskick: vänta på kundens svar, därefter Riskbedömning &amp; avtal (inte i samma steg som uppläggningen).</p>`}
      </section>
      <section class="kundresa-kyc-preview" aria-label="Förhandsgranskning">
        <h5 class="kundresa-kyc-preview-title">Det här får kunden svara på</h5>
        <ul class="kundresa-kyc-section-list">
          ${sections.map((sec) => {
            const hint = prefilledHint(sec);
            return `<li class="kundresa-kyc-section is-collapsed" data-kundresa-kyc-section>
              <button type="button" class="kundresa-kyc-section-row" data-kundresa-kyc-toggle aria-expanded="false">
                <span class="kundresa-kyc-section-num">${esc(String(sec.num))}.</span>
                <span class="kundresa-kyc-section-name">${esc(sec.name)}</span>
                <span class="kundresa-kyc-section-count">${esc(String(sec.count))} frågor</span>
                ${hint ? `<span class="kundresa-kyc-section-pref">${esc(hint)}</span>` : ''}
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
        const open = li.classList.contains('is-collapsed');
        li.classList.toggle('is-collapsed', !open);
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        const body = li.querySelector('.kundresa-kyc-section-body');
        if (body) body.hidden = !open;
      });
    });
    const swap = root.querySelector('[data-kundresa-kyc-swap]');
    const sel = root.querySelector('[data-kundresa-kyc-recipient-select]');
    if (swap && sel) {
      swap.addEventListener('click', () => { sel.hidden = !sel.hidden; if (!sel.hidden) sel.focus(); });
      sel.addEventListener('change', () => { if (typeof h.onRecipientChange === 'function') h.onRecipientChange(Number(sel.value)); });
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

  const api = { render, bind, pickRecipients, resolveStatusLine, buildSections };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.KundresaKycSkicka = api;
})(typeof window !== 'undefined' ? window : globalThis);
