/**
 * Publikt KYC-formulär (kundvy via invite-länk) — stegvis, mobil-först.
 * Start + 5 delar. Fältkontrakt oförändrat (normalizeCustomerAnswers).
 */
(function (global) {
  const PARTS = [
    { id: 1, key: 'foretag', title: 'Företaget', hintDone: 'Bekräftat', hintTodo: 'Kontrollera uppgifter' },
    { id: 2, key: 'personer', title: 'Personer och ägare', hintDone: 'Bekräftat', hintTodo: 'Kontrollera personer' },
    { id: 3, key: 'verksamhet', title: 'Verksamheten', hintDone: 'Besvarat', hintTodo: 'Kontrollera och svara' },
    { id: 4, key: 'pengar', title: 'Pengar och betalningar', hintDone: 'Besvarat', hintTodo: '2 frågor' },
    { id: 5, key: 'granska', title: 'Granska och signera', hintDone: 'Klart', hintTodo: 'Med BankID' }
  ];

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function trim(v) {
    return String(v == null ? '' : v).trim();
  }

  function pluralSv(n, one, many) {
    return Number(n) === 1 ? one : many;
  }

  function firstName(full) {
    const s = trim(full);
    if (!s) return '';
    return s.split(/\s+/)[0];
  }

  function formatDeadline(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return '';
    try {
      return d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
    } catch (_) {
      return String(iso).slice(0, 10);
    }
  }

  function emptyPerson() {
    return { namn: '', personnr: '', skatterattslig_hemvist: 'Sverige', hemvist: 'Sverige', tin: '' };
  }

  function cloneAnswers(a) {
    return JSON.parse(JSON.stringify(a || {}));
  }

  function ynPressed(val, want) {
    return trim(val) === want;
  }

  function iconCheck() {
    return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L19 7"></path></svg>';
  }

  function iconBack() {
    return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"></path></svg>';
  }

  function iconMail() {
    return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="M3 7l9 6 9-6"></path></svg>';
  }

  function jaNejButtons(name, val, { jaLabel, nejLabel } = {}) {
    const ja = jaLabel || 'Ja';
    const nej = nejLabel || 'Nej';
    return `<div class="kyc-yn" data-yn="${esc(name)}" role="group" aria-label="${esc(name)}">
      <button type="button" class="kyc-yn-btn${ynPressed(val, 'Ja') ? ' is-on' : ''}" data-val="Ja" aria-pressed="${ynPressed(val, 'Ja')}">${esc(ja)}</button>
      <button type="button" class="kyc-yn-btn${ynPressed(val, 'Nej') ? ' is-on' : ''}" data-val="Nej" aria-pressed="${ynPressed(val, 'Nej')}">${esc(nej)}</button>
    </div>`;
  }

  function confirmEdit(name, confirmed, textHtml) {
    return `<section class="kyc-card" data-confirm="${esc(name)}">
      <div class="kyc-card-label">Det här har vi noterat</div>
      <div class="kyc-confirm-view"${confirmed === false ? ' hidden' : ''}>
        <div class="kyc-confirm-text">${textHtml}</div>
        <div class="kyc-confirm-ask">Stämmer det?</div>
        <div class="kyc-yn">
          <button type="button" class="kyc-yn-btn${confirmed !== false ? ' is-on' : ''}" data-confirm-yes aria-pressed="${confirmed !== false}">
            ${iconCheck()} Ja, stämmer
          </button>
          <button type="button" class="kyc-yn-btn${confirmed === false ? ' is-on' : ''}" data-confirm-edit aria-pressed="${confirmed === false}">Ändra</button>
        </div>
      </div>
      <div class="kyc-confirm-edit"${confirmed === false ? '' : ' hidden'} data-confirm-fields></div>
    </section>`;
  }

  function personLine(p) {
    return [p.namn, p.personnr, p.skatterattslig_hemvist || p.hemvist]
      .map(trim).filter(Boolean).join(' · ');
  }

  function personEditRow(prefix, p, idx, { canRemove }) {
    const hemvist = p.skatterattslig_hemvist || p.hemvist || 'Sverige';
    const visaTin = trim(hemvist).toLowerCase() !== 'sverige';
    return `<div class="kyc-person" data-prefix="${prefix}" data-idx="${idx}">
      <div class="kyc-field"><label>Namn</label>
        <input type="text" class="kyc-input" name="${prefix}-namn" value="${esc(p.namn || '')}"></div>
      <div class="kyc-field"><label>Personnummer</label>
        <input type="text" class="kyc-input" name="${prefix}-pnr" value="${esc(p.personnr || '')}" placeholder="ÅÅÅÅMMDD-XXXX" inputmode="numeric"></div>
      <div class="kyc-field"><label>Skatterättslig hemvist</label>
        <input type="text" class="kyc-input kyc-hemvist" name="${prefix}-hemvist" value="${esc(hemvist)}" placeholder="Sverige"></div>
      <div class="kyc-field kyc-tin-wrap"${visaTin ? '' : ' hidden'}>
        <label>TIN</label>
        <input type="text" class="kyc-input" name="${prefix}-tin" value="${esc(p.tin || '')}">
      </div>
      ${canRemove ? `<button type="button" class="kyc-link-btn kyc-remove-person" data-prefix="${prefix}">Ta bort</button>` : ''}
    </div>`;
  }

  function collectPersons(root, prefix) {
    return Array.from(root.querySelectorAll(`.kyc-person[data-prefix="${prefix}"]`)).map((row) => {
      const hemvist = trim(row.querySelector(`[name="${prefix}-hemvist"]`)?.value) || 'Sverige';
      return {
        namn: trim(row.querySelector(`[name="${prefix}-namn"]`)?.value),
        personnr: trim(row.querySelector(`[name="${prefix}-pnr"]`)?.value),
        skatterattslig_hemvist: hemvist,
        hemvist,
        tin: trim(row.querySelector(`[name="${prefix}-tin"]`)?.value)
      };
    }).filter((p) => p.namn || p.personnr || p.tin);
  }

  function deriveUtlandska(answers) {
    const HM = global.KycHuvudman;
    if (HM && typeof HM.hasForeignHemvist === 'function') {
      return HM.hasForeignHemvist(answers.huvudman) || HM.hasForeignHemvist(answers.foretradare);
    }
    const foreign = (list) => (Array.isArray(list) ? list : []).some((p) => {
      const h = trim(p.skatterattslig_hemvist || p.hemvist).toLowerCase();
      return h && h !== 'sverige' && h !== 'sweden' && h !== 'se';
    });
    return foreign(answers.huvudman) || foreign(answers.foretradare);
  }

  function collectAnswers(root, state) {
    const a = cloneAnswers(state.answers);
    const view = state.view;
    if (!root) return a;

    if (view === 'part' && state.part === 1) {
      a.foretagsnamn = trim(root.querySelector('[name="foretagsnamn"]')?.value) || a.foretagsnamn;
      a.orgnr = trim(root.querySelector('[name="orgnr"]')?.value) || a.orgnr;
      a.skatterattslig_hemvist_foretag = trim(root.querySelector('[name="hemvist-foretag"]')?.value) || 'Sverige';
      a.tin_foretag = trim(root.querySelector('[name="tin-foretag"]')?.value);
      a.bolagsform = trim(root.querySelector('[name="bolagsform"]')?.value) || a.bolagsform;
    }
    if (view === 'part' && state.part === 2) {
      const ftr = collectPersons(root, 'ftr');
      if (ftr.length) a.foretradare = ftr;
      if (!state.arEnskild) {
        const vh = collectPersons(root, 'vh');
        if (vh.length) a.huvudman = vh;
        a.huvudmanAnnatSatt = trim(root.querySelector('[name="huvudman-annat"]')?.value);
        const agar = trim(root.querySelector('[name="vh-agarandel"]')?.value);
        a.vh_agarandel = agar === '' ? (a.vh_agarandel ?? 100) : Number(agar);
        a.vh_noterat_bolag = trim(root.querySelector('[name="vh-noterat"]')?.value) === 'Ja'
          || !!root.querySelector('[data-yn="vh-noterat"] .is-on[data-val="Ja"]');
      }
      a.pep = ynFrom(root, 'pep', a.pep);
      a.pepDetaljer = trim(root.querySelector('[name="pep-detaljer"]')?.value);
      a.pepFamilj = ynFrom(root, 'pep-familj', a.pepFamilj);
      a.pepFamiljDetaljer = trim(root.querySelector('[name="pep-familj-detaljer"]')?.value);
      a.vh_utlandska_agare = deriveUtlandska(a);
    }
    if (view === 'part' && state.part === 3) {
      a.verksamhet = trim(root.querySelector('[name="verksamhet"]')?.value) || a.verksamhet;
      a.kostnader = trim(root.querySelector('[name="kostnader"]')?.value) || a.kostnader;
      a.intakterna = trim(root.querySelector('[name="intakterna"]')?.value) || a.intakterna;
      a.syfte_affarsrelation = trim(root.querySelector('[name="syfte"]')?.value) || a.syfte_affarsrelation;
      a.tjanster = trim(root.querySelector('[name="tjanster"]')?.value) || a.tjanster;
      a.anstallda = trim(root.querySelector('[name="anstallda"]')?.value);
      a.omsattning = trim(root.querySelector('[name="omsattning"]')?.value);
      a.internationellHandel = ynFrom(root, 'internationell', a.internationellHandel);
      a.internationellaLander = trim(root.querySelector('[name="lander"]')?.value);
    }
    if (view === 'part' && state.part === 4) {
      a.kapitalUrsprung = trim(root.querySelector('[name="kapital"]')?.value) || a.kapitalUrsprung;
      a.kontanter = ynFrom(root, 'kontanter', a.kontanter);
      a.kontanterAndel = trim(root.querySelector('[name="kontanter-andel"]')?.value);
      a.kryptovaluta = ynFrom(root, 'krypto', a.kryptovaluta);
    }
    if (view === 'part' && state.part === 5) {
      a.bekraftelse = !!root.querySelector('[name="bekraftelse"]')?.checked;
    }
    a.vh_utlandska_agare = deriveUtlandska(a) || !!a.vh_utlandska_agare;
    return a;
  }

  function ynFrom(root, name, fallback) {
    const on = root.querySelector(`[data-yn="${name}"] .kyc-yn-btn.is-on`);
    if (on) return on.getAttribute('data-val') || '';
    return trim(fallback) || '';
  }

  function partHint(part, state) {
    const done = (state.customerUi.completedParts || []).includes(part.id);
    if (done) return part.hintDone;
    if (part.id === 2) {
      const n = Math.max(
        (state.answers.foretradare || []).filter((p) => trim(p.namn)).length,
        1
      ) + (state.arEnskild ? 0 : Math.max((state.answers.huvudman || []).filter((p) => trim(p.namn)).length, 0));
      return `Kontrollera ${n} ${pluralSv(n, 'person', 'personer')}`;
    }
    if (part.id === 3) return 'Kontrollera och svara på frågor';
    if (part.id === 4) return '2 frågor';
    return part.hintTodo;
  }

  function diffSummary(baseline, current, arEnskild) {
    const changes = [];
    const push = (part, label, from, to) => {
      if (trim(from) === trim(to)) return;
      changes.push({ part, label, from: trim(from), to: trim(to) });
    };
    push(1, 'Företagsnamn', baseline.foretagsnamn, current.foretagsnamn);
    push(1, 'Organisationsnummer', baseline.orgnr, current.orgnr);
    push(1, 'Skatterättslig hemvist', baseline.skatterattslig_hemvist_foretag, current.skatterattslig_hemvist_foretag);
    const bF = (baseline.foretradare || []).map(personLine).join(' | ');
    const cF = (current.foretradare || []).map(personLine).join(' | ');
    push(2, 'Företrädare', bF, cF);
    if (!arEnskild) {
      const bH = (baseline.huvudman || []).map(personLine).join(' | ');
      const cH = (current.huvudman || []).map(personLine).join(' | ');
      push(2, 'Verklig huvudman', bH, cH);
    }
    push(2, 'PEP', baseline.pep, current.pep);
    push(3, 'Verksamhet', baseline.verksamhet, current.verksamhet);
    push(3, 'Anställda', baseline.anstallda, current.anstallda);
    push(3, 'Omsättning', baseline.omsattning, current.omsattning);
    push(3, 'Handel utanför Sverige', baseline.internationellHandel, current.internationellHandel);
    push(3, 'Länder', baseline.internationellaLander, current.internationellaLander);
    push(4, 'Pengarnas ursprung', baseline.kapitalUrsprung, current.kapitalUrsprung);
    push(4, 'Kontanter', baseline.kontanter, current.kontanter);
    push(4, 'Kryptovaluta', baseline.kryptovaluta, current.kryptovaluta);
    return changes;
  }

  function renderStart(state) {
    const hej = firstName(state.recipientName);
    const deadline = formatDeadline(state.inviteExpiresAt);
    const meta = [
      'Tar ungefär 5 minuter',
      deadline ? `svara senast ${deadline}` : ''
    ].filter(Boolean).join(' · ');

    return `<div class="kyc-shell">
      <header class="kyc-top">
        <span class="kyc-brand">${esc(state.byraName || 'ClientFlow')}</span>
        <span class="kyc-autosave" data-autosave>Sparas automatiskt</span>
      </header>
      <div class="kyc-body">
        <div class="kyc-hero">
          <h1>${hej ? `Hej ${esc(hej)}!` : 'Hej!'}</h1>
          <p>Vi behöver bekräfta uppgifterna om <strong>${esc(state.companyName || 'ert företag')}</strong>. Det mesta är redan ifyllt – kontrollera och ändra det som inte stämmer.</p>
          ${meta ? `<span class="kyc-meta">${esc(meta)}</span>` : ''}
        </div>
        <ol class="kyc-toc">
          ${PARTS.map((p) => {
            const done = (state.customerUi.completedParts || []).includes(p.id);
            return `<li class="kyc-toc-item${done ? ' is-done' : ''}" data-goto-part="${p.id}">
              <span class="kyc-toc-num">${done ? iconCheck() : p.id}</span>
              <span class="kyc-toc-text">
                <span class="kyc-toc-title">${esc(p.title)}</span>
                <span class="kyc-toc-hint">${esc(partHint(p, state))}</span>
              </span>
            </li>`;
          }).join('')}
        </ol>
        <details class="kyc-why">
          <summary>Varför frågar ni om det här?</summary>
          <p>Alla redovisningsbyråer måste enligt lag känna sina kunder och hålla uppgifterna aktuella. Uppgifterna används bara för det och hanteras konfidentiellt.</p>
        </details>
      </div>
      <footer class="kyc-foot kyc-foot--single">
        <button type="button" class="kyc-btn kyc-btn-primary" data-start>Fortsätt</button>
      </footer>
    </div>`;
  }

  function renderPartHeader(state) {
    const pct = Math.round((state.part / 5) * 100);
    return `<header class="kyc-top kyc-top--step">
      <div class="kyc-top-row">
        <button type="button" class="kyc-back-link" data-overview>${iconBack()}Översikt</button>
        <span class="kyc-part-label">Del ${state.part} av 5</span>
      </div>
      <div class="kyc-progress" aria-hidden="true"><div class="kyc-progress-bar" style="width:${pct}%"></div></div>
    </header>`;
  }

  function renderPart1(state) {
    const a = state.answers;
    const conf = state.customerUi.confirmations || {};
    const confirmed = conf.foretag;
    const summary = [
      a.foretagsnamn || state.companyName,
      a.orgnr,
      a.skatterattslig_hemvist_foretag || 'Sverige'
    ].filter(Boolean).join(' · ');
    const visaTin = trim(a.skatterattslig_hemvist_foretag || 'Sverige').toLowerCase() !== 'sverige';
    const editFields = `
      <div class="kyc-field"><label>Företagets namn</label>
        <input type="text" class="kyc-input" name="foretagsnamn" value="${esc(a.foretagsnamn || state.companyName)}"></div>
      <div class="kyc-field"><label>Organisationsnummer</label>
        <input type="text" class="kyc-input" name="orgnr" value="${esc(a.orgnr || '')}" inputmode="numeric"></div>
      <input type="hidden" name="bolagsform" value="${esc(a.bolagsform || state.bolagsform || '')}">
      <div class="kyc-field"><label>Skatterättslig hemvist</label>
        <input type="text" class="kyc-input" name="hemvist-foretag" value="${esc(a.skatterattslig_hemvist_foretag || 'Sverige')}" placeholder="Sverige"></div>
      <div class="kyc-field" id="kyc-tin-foretag-wrap"${visaTin ? '' : ' hidden'}>
        <label>TIN</label>
        <input type="text" class="kyc-input" name="tin-foretag" value="${esc(a.tin_foretag || '')}">
      </div>`;

    return `${renderPartHeader(state)}
      <div class="kyc-body">
        <h1 class="kyc-part-title">Företaget</h1>
        ${confirmEdit('foretag', confirmed, `<p>${esc(summary || 'Inga uppgifter ännu')}</p>`)}
        ${confirmed === false ? '' : `<div class="kyc-sr-only" hidden>${editFields}</div>`}
        ${confirmed === false ? `<section class="kyc-card">${editFields}</section>` : ''}
      </div>
      ${renderNav(state)}`;
  }

  function renderPart2(state) {
    const a = state.answers;
    let foretradare = Array.isArray(a.foretradare) && a.foretradare.length ? a.foretradare : [emptyPerson()];
    let huvudman = Array.isArray(a.huvudman) && a.huvudman.length ? a.huvudman : [emptyPerson()];
    const conf = state.customerUi.confirmations || {};
    const confirmed = conf.personer;
    const lines = [
      ...foretradare.filter((p) => trim(p.namn)).map((p) => `Företrädare: ${personLine(p)}`),
      ...(state.arEnskild ? [] : huvudman.filter((p) => trim(p.namn)).map((p) => `Verklig huvudman: ${personLine(p)}`))
    ];
    const summaryHtml = lines.length
      ? `<ul class="kyc-person-summary">${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`
      : '<p>Inga personer ifyllda ännu</p>';

    const editHtml = `
      <section class="kyc-card">
        <h2 class="kyc-card-title">Företrädare</h2>
        <div id="kyc-ftr-list">${foretradare.map((p, i) => personEditRow('ftr', p, i, { canRemove: foretradare.length > 1 })).join('')}</div>
        <button type="button" class="kyc-link-btn" id="kyc-add-ftr">+ Lägg till företrädare</button>
      </section>
      ${state.arEnskild ? '' : `
      <section class="kyc-card">
        <h2 class="kyc-card-title">Verklig huvudman</h2>
        <div id="kyc-vh-list">${huvudman.map((p, i) => personEditRow('vh', p, i, { canRemove: huvudman.length > 1 })).join('')}</div>
        <button type="button" class="kyc-link-btn" id="kyc-add-vh">+ Lägg till verklig huvudman</button>
        <div class="kyc-field" style="margin-top:12px">
          <label>Kontroll genom avtal el. dyl. (valfritt)</label>
          <textarea class="kyc-input" name="huvudman-annat" rows="2">${esc(a.huvudmanAnnatSatt || '')}</textarea>
        </div>
        <div class="kyc-field">
          <label>Total ägarandel (%)</label>
          <input type="number" class="kyc-input kyc-input--sm" name="vh-agarandel" value="${esc(a.vh_agarandel == null ? 100 : a.vh_agarandel)}">
        </div>
        <div class="kyc-field">
          <span class="kyc-q">Noterat bolag eller ägt av noterat bolag?</span>
          ${jaNejButtons('vh-noterat', a.vh_noterat_bolag ? 'Ja' : 'Nej')}
          <input type="hidden" name="vh-noterat" value="${a.vh_noterat_bolag ? 'Ja' : 'Nej'}">
        </div>
      </section>`}
      <section class="kyc-card">
        <span class="kyc-q">Är någon i företaget en person i politiskt utsatt ställning (PEP)?</span>
        ${jaNejButtons('pep', a.pep || '')}
        <div class="kyc-followup" data-follow="pep"${a.pep === 'Ja' ? '' : ' hidden'}>
          <div class="kyc-field"><label>Beskriv</label>
            <input type="text" class="kyc-input" name="pep-detaljer" value="${esc(a.pepDetaljer || '')}"></div>
        </div>
        <span class="kyc-q" style="margin-top:12px">Familj eller medarbetare till PEP?</span>
        ${jaNejButtons('pep-familj', a.pepFamilj || '')}
        <div class="kyc-followup" data-follow="pep-familj"${a.pepFamilj === 'Ja' ? '' : ' hidden'}>
          <div class="kyc-field"><label>Beskriv</label>
            <input type="text" class="kyc-input" name="pep-familj-detaljer" value="${esc(a.pepFamiljDetaljer || '')}"></div>
        </div>
      </section>`;

    return `${renderPartHeader(state)}
      <div class="kyc-body">
        <h1 class="kyc-part-title">Personer och ägare</h1>
        ${confirmEdit('personer', confirmed, summaryHtml)}
        ${confirmed === false ? editHtml : ''}
      </div>
      ${renderNav(state)}`;
  }

  function renderPart3(state) {
    const a = state.answers;
    const conf = state.customerUi.confirmations || {};
    const confirmed = conf.verksamhet;
    const summary = a.verksamhet || 'Ingen verksamhetsbeskrivning ännu';
    const editVerksamhet = `<div class="kyc-field"><label>Verksamhet</label>
      <textarea class="kyc-input" name="verksamhet" rows="4">${esc(a.verksamhet || '')}</textarea></div>
      <div class="kyc-field"><label>Kostnader</label>
      <textarea class="kyc-input" name="kostnader" rows="2">${esc(a.kostnader || '')}</textarea></div>
      <div class="kyc-field"><label>Intäkter</label>
      <textarea class="kyc-input" name="intakterna" rows="2">${esc(a.intakterna || '')}</textarea></div>
      <div class="kyc-field"><label>Syfte med affärsrelationen</label>
      <input type="text" class="kyc-input" name="syfte" value="${esc(a.syfte_affarsrelation || '')}"></div>
      <div class="kyc-field"><label>Byråns tjänster</label>
      <input type="text" class="kyc-input" name="tjanster" value="${esc(a.tjanster || '')}"></div>`;

    return `${renderPartHeader(state)}
      <div class="kyc-body">
        <h1 class="kyc-part-title">Verksamheten</h1>
        ${confirmEdit('verksamhet', confirmed, `<p>${esc(summary)}</p>`)}
        ${confirmed === false ? `<section class="kyc-card">${editVerksamhet}</section>` : `<div hidden>${editVerksamhet}</div>`}
        <section class="kyc-card">
          <span class="kyc-q">Säljer eller köper företaget från länder utanför Sverige?</span>
          ${jaNejButtons('internationell', a.internationellHandel || '')}
          <div class="kyc-followup" data-follow="internationell"${a.internationellHandel === 'Ja' ? '' : ' hidden'}>
            <div class="kyc-field"><label for="kyc-lander">Vilka länder?</label>
              <input id="kyc-lander" type="text" class="kyc-input" name="lander" value="${esc(a.internationellaLander || '')}"></div>
          </div>
        </section>
        <section class="kyc-card">
          <label class="kyc-q" for="kyc-anst">Hur många anställda har företaget?</label>
          ${a.anstallda !== '' && a.anstallda != null ? `<span class="kyc-hint">Förra gången: ${esc(a.anstallda)}</span>` : ''}
          <input id="kyc-anst" type="text" class="kyc-input kyc-input--sm" name="anstallda" inputmode="numeric" value="${esc(a.anstallda || '')}">
        </section>
        <section class="kyc-card">
          <label class="kyc-q" for="kyc-oms">Uppskattad årsomsättning</label>
          <input id="kyc-oms" type="text" class="kyc-input" name="omsattning" value="${esc(a.omsattning || '')}">
        </section>
      </div>
      ${renderNav(state)}`;
  }

  function renderPart4(state) {
    const a = state.answers;
    const conf = state.customerUi.confirmations || {};
    const confirmed = conf.kapital;
    const summary = a.kapitalUrsprung || 'Ingen uppgift ännu';
    const editKap = `<div class="kyc-field"><label>Pengarnas ursprung</label>
      <textarea class="kyc-input" name="kapital" rows="3">${esc(a.kapitalUrsprung || '')}</textarea></div>`;

    return `${renderPartHeader(state)}
      <div class="kyc-body">
        <h1 class="kyc-part-title">Pengar och betalningar</h1>
        ${confirmEdit('kapital', confirmed, `<p>${esc(summary)}</p>`)}
        ${confirmed === false ? `<section class="kyc-card">${editKap}</section>` : `<div hidden>${editKap}</div>`}
        <section class="kyc-card">
          <span class="kyc-q">Hanterar företaget kontanter?</span>
          ${jaNejButtons('kontanter', a.kontanter || '')}
          <div class="kyc-followup" data-follow="kontanter"${a.kontanter === 'Ja' ? '' : ' hidden'}>
            <div class="kyc-field"><label>Ungefär hur stor andel?</label>
              <input type="text" class="kyc-input" name="kontanter-andel" value="${esc(a.kontanterAndel || '')}"></div>
          </div>
        </section>
        <section class="kyc-card">
          <span class="kyc-q">Förekommer transaktioner i kryptovaluta?</span>
          ${jaNejButtons('krypto', a.kryptovaluta || '')}
        </section>
      </div>
      ${renderNav(state)}`;
  }

  function renderPart5(state) {
    const changes = diffSummary(state.baseline, state.answers, state.arEnskild);
    const changeCount = changes.length;
    const intro = changeCount
      ? `Du har ändrat ${changeCount} ${pluralSv(changeCount, 'uppgift', 'uppgifter')}. Allt annat är bekräftat som tidigare.`
      : 'Allt är bekräftat som tidigare.';
    const byPart = PARTS.slice(0, 4).map((p) => {
      const partChanges = changes.filter((c) => c.part === p.id);
      if (!partChanges.length) {
        const label = (state.customerUi.completedParts || []).includes(p.id) || p.id <= 4
          ? (p.id <= 2 ? 'Oförändrat' : 'Besvarat')
          : '—';
        return `<button type="button" class="kyc-review-row" data-goto-part="${p.id}">
          <span>${esc(p.title)}</span><span class="kyc-muted">${esc(label)}</span>
        </button>`;
      }
      const detail = partChanges.map((c) => {
        if (c.from && c.to) {
          return `${esc(c.label)}: <span class="kyc-strike">${esc(c.from)}</span> → ${esc(c.to)}`;
        }
        return `${esc(c.label)}: ${esc(c.to || c.from)}`;
      }).join('<br>');
      return `<button type="button" class="kyc-review-row" data-goto-part="${p.id}">
        <span class="kyc-review-left"><span>${esc(p.title)}</span><span class="kyc-review-detail">${detail}</span></span>
        <span class="kyc-badge">Ändrad</span>
      </button>`;
    }).join('');

    const email = state.signerEmail || '';

    return `${renderPartHeader(state)}
      <div class="kyc-body">
        <div class="kyc-hero" style="gap:4px">
          <h1 class="kyc-part-title">Granska och skicka in</h1>
          <p class="kyc-lead">${intro}</p>
        </div>
        <div class="kyc-review">${byPart}</div>
        <label class="kyc-check-card">
          <input type="checkbox" name="bekraftelse" ${state.answers.bekraftelse ? 'checked' : ''}>
          <span>Jag intygar att uppgifterna är riktiga och fullständiga, och att jag meddelar byrån om något ändras.</span>
        </label>
        <div class="kyc-info">
          ${iconMail()}
          <span>När du skickar in skapas ett dokument med dina svar. Du får det strax via e-post${email ? ` till <strong>${esc(email)}</strong>` : ''} och signerar det med BankID.</span>
        </div>
      </div>
      <footer class="kyc-foot kyc-foot--single">
        <button type="button" class="kyc-btn kyc-btn-primary" data-submit>Skicka in</button>
      </footer>`;
  }

  function renderNav(state) {
    return `<footer class="kyc-foot">
      <button type="button" class="kyc-btn kyc-btn-secondary" data-back>Tillbaka</button>
      <button type="button" class="kyc-btn kyc-btn-primary" data-next>Nästa</button>
    </footer>`;
  }

  function render(container, payload, { onSave, onSubmit, onSaveStatus } = {}) {
    if (!container) return;
    const answers = cloneAnswers(payload?.answers || {});
    const bolagsform = payload?.bolagsform || answers.bolagsform || '';
    const arEnskild = /enskild/i.test(bolagsform);
    const customerUi = {
      completedParts: Array.isArray(payload?.customerUi?.completedParts) ? payload.customerUi.completedParts.slice() : [],
      currentPart: Number(payload?.customerUi?.currentPart) || 0,
      confirmations: { ...(payload?.customerUi?.confirmations || {}) }
    };
    if (!answers.foretradare?.length) answers.foretradare = [emptyPerson()];
    if (!arEnskild && !answers.huvudman?.length) answers.huvudman = [emptyPerson()];

    const state = {
      answers,
      baseline: cloneAnswers(answers),
      companyName: payload?.companyName || answers.foretagsnamn || '',
      byraName: payload?.byraName || '',
      bolagsform,
      arEnskild,
      recipientName: payload?.recipientName || '',
      signerEmail: payload?.signerEmail || '',
      inviteExpiresAt: payload?.inviteExpiresAt || null,
      customerUi,
      view: 'start',
      part: 0,
      dirty: false,
      saving: false
    };

    let saveTimer = null;
    let rootEl = null;

    function setAutosave(label, ok) {
      const el = container.querySelector('[data-autosave]');
      if (!el) return;
      el.textContent = label;
      el.classList.toggle('is-saving', !ok && label.includes('Sparar'));
      el.classList.toggle('is-err', !ok && label.includes('kunde'));
      if (typeof onSaveStatus === 'function') onSaveStatus(label, ok);
    }

    function syncStateFromDom() {
      if (!rootEl) return;
      state.answers = collectAnswers(rootEl, state);
    }

    function scheduleSave() {
      state.dirty = true;
      setAutosave('Sparar…', true);
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => { persist('save'); }, 1000);
    }

    async function persist(action) {
      syncStateFromDom();
      const ui = {
        completedParts: state.customerUi.completedParts.slice(),
        currentPart: state.view === 'part' ? state.part : state.customerUi.currentPart,
        confirmations: { ...state.customerUi.confirmations }
      };
      if (typeof onSave !== 'function' && action === 'save') {
        setAutosave('Sparas automatiskt', true);
        return null;
      }
      state.saving = true;
      try {
        if (action === 'mark_answered') {
          if (typeof onSubmit !== 'function') return null;
          return await onSubmit(state.answers, null, { customerUi: ui });
        }
        const result = await onSave(state.answers, null, { customerUi: ui });
        state.dirty = false;
        setAutosave('Sparas automatiskt', true);
        return result;
      } catch (e) {
        setAutosave('Kunde inte spara', false);
        return null;
      } finally {
        state.saving = false;
      }
    }

    function markPartDone(partId) {
      if (!state.customerUi.completedParts.includes(partId)) {
        state.customerUi.completedParts.push(partId);
        state.customerUi.completedParts.sort((a, b) => a - b);
      }
      state.customerUi.currentPart = partId;
    }

    function goStart() {
      syncStateFromDom();
      state.view = 'start';
      state.part = 0;
      paint();
    }

    function goPart(n) {
      syncStateFromDom();
      state.view = 'part';
      state.part = Math.max(1, Math.min(5, n));
      state.customerUi.currentPart = state.part;
      paint();
    }

    function paint() {
      let html = '';
      if (state.view === 'start') html = renderStart(state);
      else if (state.part === 1) html = `<div class="kyc-shell">${renderPart1(state)}</div>`;
      else if (state.part === 2) html = `<div class="kyc-shell">${renderPart2(state)}</div>`;
      else if (state.part === 3) html = `<div class="kyc-shell">${renderPart3(state)}</div>`;
      else if (state.part === 4) html = `<div class="kyc-shell">${renderPart4(state)}</div>`;
      else html = `<div class="kyc-shell">${renderPart5(state)}</div>`;
      container.innerHTML = html;
      rootEl = container.querySelector('.kyc-shell') || container;
      bind(rootEl);
    }

    function bindConfirm(scope) {
      scope.querySelectorAll('[data-confirm]').forEach((card) => {
        const key = card.getAttribute('data-confirm');
        card.querySelector('[data-confirm-yes]')?.addEventListener('click', () => {
          state.customerUi.confirmations[key] = true;
          scheduleSave();
          paint();
        });
        card.querySelector('[data-confirm-edit]')?.addEventListener('click', () => {
          state.customerUi.confirmations[key] = false;
          scheduleSave();
          paint();
        });
      });
    }

    function bindYn(scope) {
      scope.querySelectorAll('[data-yn]').forEach((group) => {
        const name = group.getAttribute('data-yn');
        group.querySelectorAll('.kyc-yn-btn').forEach((btn) => {
          btn.addEventListener('click', () => {
            group.querySelectorAll('.kyc-yn-btn').forEach((b) => {
              b.classList.remove('is-on');
              b.setAttribute('aria-pressed', 'false');
            });
            btn.classList.add('is-on');
            btn.setAttribute('aria-pressed', 'true');
            const val = btn.getAttribute('data-val');
            const hidden = scope.querySelector(`[name="${name}"]`);
            if (hidden && hidden.type === 'hidden') hidden.value = val;
            const follow = scope.querySelector(`[data-follow="${name}"]`);
            if (follow) follow.hidden = val !== 'Ja';
            // Map yn into answers for known keys
            if (name === 'pep') state.answers.pep = val;
            if (name === 'pep-familj') state.answers.pepFamilj = val;
            if (name === 'internationell') state.answers.internationellHandel = val;
            if (name === 'kontanter') state.answers.kontanter = val;
            if (name === 'krypto') state.answers.kryptovaluta = val;
            if (name === 'vh-noterat') {
              state.answers.vh_noterat_bolag = val === 'Ja';
              const h = scope.querySelector('[name="vh-noterat"]');
              if (h) h.value = val;
            }
            scheduleSave();
          });
        });
      });
    }

    function bindHemvist(scope) {
      scope.querySelectorAll('.kyc-hemvist').forEach((input) => {
        input.addEventListener('input', () => {
          const wrap = input.closest('.kyc-person')?.querySelector('.kyc-tin-wrap');
          if (wrap) {
            const v = input.value.trim().toLowerCase();
            wrap.hidden = !(v && v !== 'sverige');
          }
          scheduleSave();
        });
      });
      scope.querySelector('[name="hemvist-foretag"]')?.addEventListener('input', (e) => {
        const wrap = scope.querySelector('#kyc-tin-foretag-wrap');
        if (wrap) {
          const v = e.target.value.trim().toLowerCase();
          wrap.hidden = !(v && v !== 'sverige');
        }
        scheduleSave();
      });
    }

    function bindPersons(scope) {
      scope.querySelector('#kyc-add-ftr')?.addEventListener('click', () => {
        syncStateFromDom();
        state.answers.foretradare = collectPersons(scope, 'ftr');
        state.answers.foretradare.push(emptyPerson());
        state.customerUi.confirmations.personer = false;
        paint();
        scheduleSave();
      });
      scope.querySelector('#kyc-add-vh')?.addEventListener('click', () => {
        syncStateFromDom();
        state.answers.huvudman = collectPersons(scope, 'vh');
        state.answers.huvudman.push(emptyPerson());
        state.customerUi.confirmations.personer = false;
        paint();
        scheduleSave();
      });
      scope.querySelectorAll('.kyc-remove-person').forEach((btn) => {
        btn.addEventListener('click', () => {
          const prefix = btn.getAttribute('data-prefix');
          const row = btn.closest('.kyc-person');
          const list = row?.parentElement;
          if (!list || list.querySelectorAll('.kyc-person').length <= 1) return;
          row.remove();
          scheduleSave();
        });
      });
    }

    function bind(scope) {
      bindConfirm(scope);
      bindYn(scope);
      bindHemvist(scope);
      bindPersons(scope);

      scope.querySelectorAll('input, textarea, select').forEach((el) => {
        el.addEventListener('input', () => scheduleSave());
        el.addEventListener('change', () => scheduleSave());
      });

      scope.querySelector('[data-start]')?.addEventListener('click', () => {
        const completed = state.customerUi.completedParts || [];
        let first = Number(payload?.resumePart) || 1;
        for (let i = 1; i <= 5; i += 1) {
          if (!completed.includes(i)) { first = i; break; }
        }
        if (completed.length >= 5) first = 5;
        goPart(first);
      });
      scope.querySelector('[data-overview]')?.addEventListener('click', () => goStart());
      scope.querySelectorAll('[data-goto-part]').forEach((el) => {
        el.addEventListener('click', () => goPart(Number(el.getAttribute('data-goto-part') || 1)));
      });
      scope.querySelector('[data-back]')?.addEventListener('click', () => {
        syncStateFromDom();
        if (state.part <= 1) goStart();
        else goPart(state.part - 1);
      });
      scope.querySelector('[data-next]')?.addEventListener('click', async () => {
        syncStateFromDom();
        markPartDone(state.part);
        // Auto-confirm if user continued without pressing Ja
        if (state.part === 1 && state.customerUi.confirmations.foretag == null) {
          state.customerUi.confirmations.foretag = true;
        }
        if (state.part === 2 && state.customerUi.confirmations.personer == null) {
          state.customerUi.confirmations.personer = true;
        }
        if (state.part === 3 && state.customerUi.confirmations.verksamhet == null) {
          state.customerUi.confirmations.verksamhet = true;
        }
        if (state.part === 4 && state.customerUi.confirmations.kapital == null) {
          state.customerUi.confirmations.kapital = true;
        }
        await persist('save');
        goPart(Math.min(5, state.part + 1));
      });
      scope.querySelector('[data-submit]')?.addEventListener('click', async (e) => {
        syncStateFromDom();
        if (!state.answers.bekraftelse) {
          alert('Bekräfta att uppgifterna är korrekta innan ni skickar in.');
          return;
        }
        markPartDone(5);
        const btn = e.currentTarget;
        const orig = btn.innerHTML;
        btn.disabled = true;
        btn.textContent = 'Skickar…';
        try {
          clearTimeout(saveTimer);
          const result = await persist('mark_answered');
          if (!result && typeof onSubmit === 'function') {
            // onSubmit handles UI transition
          }
        } finally {
          btn.disabled = false;
          btn.innerHTML = orig;
        }
      });
    }

    // Resume: if progress exists and not answered, open first incomplete after start
    // Always show start first per mock; Fortsätt resumes.
    paint();

    return {
      collectAnswers: () => {
        syncStateFromDom();
        return cloneAnswers(state.answers);
      },
      getState: () => state
    };
  }

  // Back-compat helpers used by tests / Node require
  function collectAnswersCompat(root) {
    // Legacy single-page collector (kept for tests that call collectAnswers on a form root)
    if (!root) return {};
    const g = (name) => trim(root.querySelector(`[name="${name}"]`)?.value);
    const foretradare = collectPersons(root, 'ftr');
    const huvudman = collectPersons(root, 'vh');
    const utlandska = deriveUtlandska({ foretradare, huvudman });
    return {
      foretagsnamn: g('foretagsnamn'),
      orgnr: g('orgnr'),
      bolagsform: g('bolagsform'),
      skatterattslig_hemvist_foretag: g('hemvist-foretag') || 'Sverige',
      tin_foretag: g('tin-foretag'),
      foretradare,
      huvudman,
      huvudmanAnnatSatt: g('huvudman-annat'),
      vh_agarandel: (() => {
        const v = g('vh-agarandel');
        return v === '' ? null : Number(v);
      })(),
      vh_noterat_bolag: g('vh-noterat') === 'Ja',
      vh_utlandska_agare: utlandska || g('vh-utlandska') === 'Ja',
      pep: g('pep') || ynFrom(root, 'pep', ''),
      pepDetaljer: g('pep-detaljer'),
      pepFamilj: g('pep-familj') || ynFrom(root, 'pep-familj', ''),
      pepFamiljDetaljer: g('pep-familj-detaljer'),
      verksamhet: g('verksamhet'),
      kostnader: g('kostnader'),
      intakterna: g('intakterna'),
      syfte_affarsrelation: g('syfte'),
      tjanster: g('tjanster'),
      kapitalUrsprung: g('kapital'),
      anstallda: g('anstallda'),
      omsattning: g('omsattning'),
      internationellHandel: g('internationell') || ynFrom(root, 'internationell', ''),
      internationellaLander: g('lander'),
      kontanter: g('kontanter') || ynFrom(root, 'kontanter', ''),
      kontanterAndel: g('kontanter-andel'),
      kryptovaluta: g('krypto') || ynFrom(root, 'krypto', ''),
      bekraftelse: !!root.querySelector('[name="bekraftelse"]')?.checked
    };
  }

  const api = { render, collectAnswers: collectAnswersCompat, PARTS, pluralSv };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.KycFormularPublic = api;
})(typeof window !== 'undefined' ? window : globalThis);
