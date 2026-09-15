/**
 * Kundformulär-UI (kundkort).
 * Byråvyn = kundvyn: samma fält, samma synlighet, samma inskickade svar.
 * Fältnamn följer lib/kundformular.js. Neutral faktayta — ingen riskpoäng.
 */
(function (global) {
  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleString('sv-SE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function statusClass(status) {
    const s = String(status || 'utkast');
    if (s === 'besvarat' || s === 'signerat') return 'ok';
    if (s === 'skickat') return 'sent';
    if (s === 'prefillad') return 'prefill';
    return 'draft';
  }

  function fieldLabel(text) {
    return `<span class="kundformular-label-row"><span>${esc(text)}</span></span>`;
  }

  function jaNejSelect(name, selected, readOnly) {
    const v = String(selected || '');
    const opts = ['', 'Ja', 'Nej']
      .map((opt) => {
        const label = opt || '—';
        return `<option value="${esc(opt)}"${opt === v ? ' selected' : ''}>${esc(label)}</option>`;
      })
      .join('');
    return `<select class="form-control kundformular-select--compact" data-kf="${esc(name)}"${readOnly ? ' disabled' : ''}>${opts}</select>`;
  }

  function vhBekraftelseSelect(selected, readOnly) {
    const v = String(selected || '');
    const opts = [
      { value: '', label: '—' },
      { value: 'Ja', label: 'Ja, stämmer' },
      { value: 'Osaker', label: 'Osäker' },
      { value: 'Nej', label: 'Nej' }
    ].map((opt) =>
      `<option value="${esc(opt.value)}"${opt.value === v ? ' selected' : ''}>${esc(opt.label)}</option>`
    ).join('');
    return `<select class="form-control" data-kf="vh_bekraftelse"${readOnly ? ' disabled' : ''}>${opts}</select>`;
  }

  function isSwedenHemvist(value) {
    const v = String(value || '').trim();
    return !v || /^sverige$/i.test(v);
  }

  function personRows(list, prefix, readOnly) {
    const rows = Array.isArray(list) && list.length
      ? list
      : [{ namn: '', personnr: '', hemvist: 'Sverige', tin: '', agarandel: '', roll: '' }];
    const ro = readOnly ? ' readonly' : '';
    return rows.map((p, idx) => {
      const hemvist = p.hemvist || 'Sverige';
      const showTin = !isSwedenHemvist(hemvist);
      return `
      <div class="kundformular-person-row" data-kf-person-row="${esc(prefix)}" data-idx="${idx}">
        <div class="kundformular-grid kundformular-grid--person">
          <label>Namn
            <input type="text" class="form-control" data-kf-field="namn" value="${esc(p.namn || '')}" autocomplete="off"${ro}>
          </label>
          <label>Personnummer
            <input type="text" class="form-control" data-kf-field="personnr" value="${esc(p.personnr || '')}" autocomplete="off"${ro}>
          </label>
          <label>Skatterättslig hemvist
            <input type="text" class="form-control" data-kf-field="hemvist" value="${esc(hemvist)}" autocomplete="off"${ro}>
          </label>
          <label data-kf-tin${showTin ? '' : ' hidden'}>TIN (om ej Sverige)
            <input type="text" class="form-control" data-kf-field="tin" value="${esc(p.tin || '')}" autocomplete="off"${ro}>
          </label>
          ${prefix === 'huvudman'
            ? `<label>Ägarandel %
                <input type="text" class="form-control" data-kf-field="agarandel" value="${esc(p.agarandel || '')}" autocomplete="off"${ro}>
              </label>`
            : `<label>Roll
                <input type="text" class="form-control" data-kf-field="roll" value="${esc(p.roll || '')}" autocomplete="off"${ro}>
              </label>`}
        </div>
        ${readOnly ? '' : '<button type="button" class="btn btn-ghost btn-sm" data-remove-person title="Ta bort rad"><i class="fas fa-times"></i></button>'}
      </div>`;
    }).join('');
  }

  function collectPeople(root, prefix) {
    return Array.from(root.querySelectorAll(`[data-kf-person-row="${prefix}"]`))
      .map((row) => ({
        namn: (row.querySelector('[data-kf-field="namn"]')?.value || '').trim(),
        personnr: (row.querySelector('[data-kf-field="personnr"]')?.value || '').trim(),
        hemvist: (row.querySelector('[data-kf-field="hemvist"]')?.value || '').trim(),
        tin: (row.querySelector('[data-kf-field="tin"]')?.value || '').trim(),
        agarandel: (row.querySelector('[data-kf-field="agarandel"]')?.value || '').trim(),
        roll: (row.querySelector('[data-kf-field="roll"]')?.value || '').trim()
      }))
      .filter((p) => p.namn || p.personnr || p.tin);
  }

  function collectTjanster(root) {
    return Array.from(root.querySelectorAll('[data-kf-tjanst]:checked'))
      .map((el) => ({
        id: (el.getAttribute('data-kf-tjanst-id') || '').trim(),
        namn: (el.getAttribute('data-kf-tjanst-namn') || el.value || '').trim()
      }))
      .filter((t) => t.namn || t.id);
  }

  function collectVillkorade(root) {
    const out = {};
    root.querySelectorAll('[data-kf-villkorad]').forEach((wrap) => {
      const id = wrap.getAttribute('data-kf-villkorad');
      if (!id) return;
      const svar = (wrap.querySelector('[data-kf-villkorad-svar]')?.value || '').trim();
      const varfor = (wrap.querySelector('[data-kf-villkorad-varfor]')?.value || '').trim();
      if (svar || varfor) out[id] = { svar, varfor };
    });
    return out;
  }

  function collectAnswers(root) {
    const g = (key) => (root.querySelector(`[data-kf="${key}"]`)?.value || '').trim();
    return {
      foretagsnamn: g('foretagsnamn'),
      orgnr: g('orgnr'),
      tjanster: collectTjanster(root),
      syfte_affarsrelation: g('syfte_affarsrelation'),
      verksamhet: g('verksamhet'),
      forvantad_omfattning: g('forvantad_omfattning'),
      kapitalUrsprung: g('kapitalUrsprung'),
      kapitalUrsprungSkarpt: g('kapitalUrsprungSkarpt'),
      anstallda: g('anstallda'),
      omsattning: g('omsattning'),
      foretradare: collectPeople(root, 'foretradare'),
      huvudman: collectPeople(root, 'huvudman'),
      vh_bekraftelse: g('vh_bekraftelse'),
      vh_agarstruktur: g('vh_agarstruktur'),
      ombud_annan: g('ombud_annan'),
      ombud: collectPeople(root, 'ombud'),
      pep: g('pep'),
      pepDetaljer: g('pepDetaljer'),
      pepFamilj: g('pepFamilj'),
      pepFamiljDetaljer: g('pepFamiljDetaljer'),
      internationellHandel: g('internationellHandel'),
      internationellaLander: g('internationellaLander'),
      kontanter: g('kontanter'),
      kontanterAndel: g('kontanterAndel'),
      kryptovaluta: g('kryptovaluta'),
      villkorade_svar: collectVillkorade(root),
      bekraftelse: !!root.querySelector('[data-kf="bekraftelse"]')?.checked
    };
  }

  function tjansterHtml(selected, options, readOnly) {
    const sel = Array.isArray(selected) ? selected : [];
    const opts = Array.isArray(options) && options.length
      ? options
      : sel.map((t) => ({ id: t.id || '', namn: t.namn || '' }));
    if (!opts.length) {
      return '<p class="kundformular-hint">Inga tjänster i byråns katalog ännu. Koppla tjänster på kundkortet först.</p>';
    }
    return `<div class="kundformular-tjanster" data-kf-tjanster>${opts.map((t) => {
      const id = t.id || '';
      const namn = t.namn || id;
      const checked = sel.some((s) => (id && s.id && s.id === id)
        || ((s.namn || '').toLowerCase() === namn.toLowerCase()));
      return `<label class="kundformular-check kundformular-check--tjanst">
        <input type="checkbox" data-kf-tjanst data-kf-tjanst-id="${esc(id)}" data-kf-tjanst-namn="${esc(namn)}" value="${esc(namn)}"${checked ? ' checked' : ''}${readOnly ? ' disabled' : ''}>
        <span>${esc(namn)}</span>
      </label>`;
    }).join('')}</div>`;
  }

  function matchVillkorade(katalog, tjanster) {
    const names = (Array.isArray(tjanster) ? tjanster : []).map((t) => t.namn || t.id).filter(Boolean);
    const list = Array.isArray(katalog) ? katalog : [];
    if (!names.length) return [];
    return list.filter((c) => {
      let re = null;
      try {
        const src = c.tjanstMatchSource || '';
        const m = String(src).match(/^\/(.*)\/([a-z]*)$/i);
        re = m ? new RegExp(m[1], m[2]) : null;
      } catch (_) { re = null; }
      if (!re) return false;
      return names.some((n) => re.test(String(n)));
    }).map((c) => ({ id: c.id, frage: c.frage, typ: c.typ }));
  }

  function villkoradeHtml(kontroller, svarMap, readOnly) {
    const list = Array.isArray(kontroller) ? kontroller : [];
    if (!list.length) {
      return '<p class="kundformular-hint">Inga villkorade frågor för valda tjänster just nu.</p>';
    }
    const svar = svarMap && typeof svarMap === 'object' ? svarMap : {};
    return list.map((c) => {
      const row = svar[c.id] || {};
      const showVarfor = row.svar === 'Ja';
      const needsVarfor = c.typ === 'ja_nej_varfor';
      return `<div class="kundformular-villkorad" data-kf-villkorad="${esc(c.id)}" data-kf-villkorad-typ="${esc(c.typ || 'ja_nej')}">
        <label class="kundformular-villkorad-svar">${esc(c.frage)}
          <select class="form-control kundformular-select--compact" data-kf-villkorad-svar${readOnly ? ' disabled' : ''}>
            <option value="">—</option>
            <option value="Ja"${row.svar === 'Ja' ? ' selected' : ''}>Ja</option>
            <option value="Nej"${row.svar === 'Nej' ? ' selected' : ''}>Nej</option>
          </select>
        </label>
        <label class="kundformular-villkorad-varfor"${showVarfor ? '' : ' hidden'}>Kort förklaring
          <input type="text" class="form-control" data-kf-villkorad-varfor value="${esc(row.varfor || '')}" placeholder="${needsVarfor ? 'Beskriv kort' : 'Valfritt'}"${readOnly ? ' readonly' : ''}>
        </label>
      </div>`;
    }).join('');
  }

  function computeLocalMeta(answers, meta) {
    const next = { ...(meta || {}) };
    const vhRelevant = meta?.vhRelevant !== false;
    const vh = String(answers.vh_bekraftelse || '');
    next.vhKraverAgarstruktur = vhRelevant
      && (vh === 'Osaker' || vh === 'Nej' || !!meta?.vhKomplex);
    const pep = answers.pep === 'Ja' || answers.pepFamilj === 'Ja';
    next.skarptKapital = pep || !!meta?.skarptKapital;
    return next;
  }

  function render(container, payload, opts = {}) {
    if (!container) return;
    const form = payload?.form || {};
    const a = form.answers || {};
    const summary = payload?.summary || {};
    const meta = payload?.meta || {};
    const onAction = typeof opts.onAction === 'function' ? opts.onAction : null;
    const customerMode = !!(opts.customerMode || meta.customerMode);
    const readOnly = !!meta.readOnly || (!!opts.readOnly);
    const vhRelevant = meta.vhRelevant !== false;
    const liveMeta = computeLocalMeta(a, meta);
    const submitted = !!meta.submitted
      || summary.status === 'besvarat'
      || summary.status === 'signerat';
    const inviteUrl = String(summary.inviteUrl || payload?.inviteUrl || '').trim();
    const kundresa = payload?.kundresa || opts.kundresa || null;
    const vhGate = kundresa?.vhGate || null;
    const vhBlocked = !!(vhGate && vhGate.blocked);

    const metaBits = [];
    if (customerMode) {
      if (submitted) {
        metaBits.push('Tack — era uppgifter är inskickade till byrån.');
      } else {
        metaBits.push('Fyll i uppgifterna nedan och skicka in till byrån. Inga riskbedömningar visas här.');
      }
    } else if (summary.answeredAt || summary.isAnswered) {
      metaBits.push(`Kunden svarade <strong>${esc(fmtDate(summary.answeredAt))}</strong>${summary.answeredBy ? ` (${esc(summary.answeredBy)})` : ''}.`);
    } else {
      metaBits.push('Inget kundsvar registrerat ännu.');
    }
    if (!customerMode && summary.sentAt) metaBits.push(`Skickat ${esc(fmtDate(summary.sentAt))}.`);
    if (!customerMode && summary.signedAt) metaBits.push(`Signerat ${esc(fmtDate(summary.signedAt))}.`);
    if (customerMode && summary.inviteExpiresAt && !submitted) {
      metaBits.push(`Länken gäller till ${esc(fmtDate(summary.inviteExpiresAt))}.`);
    }

    const showAgarstruktur = liveMeta.vhKraverAgarstruktur;
    const showOmbud = a.ombud_annan === 'Ja';
    const showSkarpt = liveMeta.skarptKapital;

    let n = 1;
    const nextSec = () => n++;
    const sForetag = nextSec();
    const sTjanster = nextSec();
    const sSyfte = nextSec();
    const sVh = vhRelevant ? nextSec() : null;
    const sOmbud = nextSec();
    const sForetradare = nextSec();
    const sVillkorade = nextSec();
    const sOvrigt = nextSec();
    const sIntyg = nextSec();

    const ombudLabel = vhRelevant
      ? 'Ombud annan än verklig huvudman?'
      : 'Ombud annan än ägaren/företrädaren?';
    const ombudHint = vhRelevant
      ? 'Den som faktiskt för dialogen, om annan än verklig huvudman — identifieras separat.'
      : 'Den som faktiskt för dialogen, om annan än ägaren — identifieras separat. Verklig huvudman är inte aktuell för enskild firma / fysisk person.';

    const ro = readOnly ? ' readonly' : '';
    const tjansterOptions = meta.tjansterOptions || meta.tjansterOptions || [];
    const villkorade = meta.villkoradeKontroller
      || matchVillkorade(meta.villkoradeKatalog, a.tjanster);

    container.innerHTML = `
      <div class="kundformular-panel" id="kundformular-root">
        <div class="kundformular-header">
          <div>
            <h3 class="kundformular-title">Kundformulär</h3>
            <p class="kundformular-lead">${customerMode
              ? 'Uppgifter till er redovisningsbyrå — neutral faktayta utan riskpoäng eller interna bedömningar.'
              : 'Exakt samma formulär som kunden ser och skickar in — neutral faktayta utan riskpoäng.'}</p>
          </div>
          <div class="kundformular-header-status">
            <span class="kundformular-status kundformular-status--${esc(statusClass(summary.status))}">${esc(summary.statusLabel || summary.status || 'Utkast')}</span>
            <div class="kundformular-meta">${metaBits.map((t) => `<p>${t}</p>`).join('')}</div>
          </div>
        </div>

        ${submitted ? '<div class="kundformular-submitted-banner" role="status">Visar det kunden skickat in. Samma innehåll som kundvyn.</div>' : ''}

        ${!customerMode && vhBlocked ? `<div class="kundformular-vh-gate-banner" role="alert">
          <strong>VH-gate:</strong> ${esc(vhGate.message || 'Osäker/Nej blockerar kundlänk och KYC-synk tills byrån bekräftar Ja.')}
        </div>` : ''}

        ${!customerMode && Array.isArray(summary.statusStrip) && summary.statusStrip.length ? `
        <ol class="kundformular-status-strip" aria-label="Kundformulärstatus">
          ${summary.statusStrip.map((step) => `
            <li class="kundformular-status-step kundformular-status-step--${esc(step.state)}${step.comingSoon ? ' kundformular-status-step--soon' : ''}" title="${esc(step.comingSoon ? `${step.label} (kommer snart)` : step.label)}">
              <span class="kundformular-status-step-dot" aria-hidden="true"></span>
              <span class="kundformular-status-step-label">${esc(step.label)}${step.comingSoon ? ' <em>snart</em>' : ''}</span>
            </li>`).join('')}
        </ol>` : ''}

        ${inviteUrl && !customerMode ? `<div class="kundformular-invite-box" role="status">
          <p><strong>Kundlänk</strong> (giltig tills formuläret besvarats${summary.inviteExpiresAt ? ` eller till ${esc(fmtDate(summary.inviteExpiresAt))}` : ''}):</p>
          <div class="kundformular-invite-row">
            <input type="text" class="form-control" readonly value="${esc(inviteUrl)}" data-kf-invite-url>
            <button type="button" class="btn btn-secondary btn-sm" data-kf-copy-invite title="Kopiera länk"><i class="fas fa-copy"></i> Kopiera</button>
            ${summary.canRemind ? `<button type="button" class="btn btn-ghost btn-sm" data-kf-action="remind" title="Skicka påminnelsemejl till kundens e-post"><i class="fas fa-envelope"></i> Skicka påminnelse</button>` : ''}
          </div>
          <p class="kundformular-hint">Dela länken med kunden. BankID-signering kommer i nästa steg — tills dess räcker det att kunden fyller i och skickar in.${summary.reminderCount ? ` Senast påmind ${esc(fmtDate(summary.lastRemindedAt))} (${esc(String(summary.reminderCount))} ggr).` : ''}</p>
        </div>` : ''}

        <div class="kundformular-actions">
          ${customerMode
            ? (readOnly
              ? ''
              : `<button type="button" class="btn btn-secondary" data-kf-action="save"><i class="fas fa-save"></i> Spara utkast</button>
                 <button type="button" class="btn btn-primary" data-kf-action="mark_answered"><i class="fas fa-paper-plane"></i> Skicka in svar</button>`)
            : (readOnly ? '' : `<button type="button" class="btn btn-secondary" data-kf-action="prefill"><i class="fas fa-magic"></i> Prefylla från kundkort/KYC</button>
          <button type="button" class="btn btn-ghost" data-kf-action="sync_to_kyc" title="Kopiera overlappande svar till KYC-utkast utan att röra utskick/signering" ${vhBlocked ? 'disabled' : ''}><i class="fas fa-right-left"></i> Synka till KYC</button>
          <button type="button" class="btn btn-primary" data-kf-action="save"><i class="fas fa-save"></i> Spara</button>
          <button type="button" class="btn btn-secondary" data-kf-action="mark_answered" title="Om kunden svarat utanför länken"><i class="fas fa-check"></i> Markera som besvarat</button>
          <button type="button" class="btn btn-ghost" data-kf-action="mark_sent" title="Skapa delbar länk till kunden" ${vhBlocked ? 'disabled' : ''}><i class="fas fa-link"></i> Skapa kundlänk</button>`)}
        </div>

        <form class="kundformular-form${readOnly ? ' kundformular-form--readonly' : ''}" id="kundformular-form" autocomplete="off">
          <section class="kundformular-section">
            <h4>${sForetag}. Företag</h4>
            <div class="kundformular-grid">
              <label>${fieldLabel('Företagsnamn')}
                <input type="text" class="form-control" data-kf="foretagsnamn" value="${esc(a.foretagsnamn || '')}" readonly>
              </label>
              <label>${fieldLabel('Organisationsnummer')}
                <input type="text" class="form-control" data-kf="orgnr" value="${esc(a.orgnr || '')}" readonly>
              </label>
            </div>
          </section>

          <section class="kundformular-section">
            <h4>${sTjanster}. Tjänster</h4>
            <p class="kundformular-hint">Vilka av byråns tjänster omfattas av uppdraget.</p>
            <div class="kundformular-label-row" style="margin-bottom:0.5rem">${fieldLabel('Uppdrag / tjänster')}</div>
            ${tjansterHtml(a.tjanster, tjansterOptions, readOnly)}
          </section>

          <section class="kundformular-section">
            <h4>${sSyfte}. Syfte, verksamhet och omfattning</h4>
            <label>${fieldLabel('Syfte med affärsförbindelsen')}
              <textarea class="form-control" rows="2" data-kf="syfte_affarsrelation" placeholder="t.ex. sedvanliga redovisningstjänster"${ro}>${esc(a.syfte_affarsrelation || '')}</textarea>
            </label>
            <label>${fieldLabel('Verksamhetens art i praktiken')}
              <textarea class="form-control" rows="3" data-kf="verksamhet" placeholder="Vad gör företaget konkret — inte bara SNI-kod"${ro}>${esc(a.verksamhet || '')}</textarea>
            </label>
            <label>${fieldLabel('Förväntad omfattning och art av transaktioner')}
              <textarea class="form-control" rows="2" data-kf="forvantad_omfattning" placeholder="Volym, frekvens, typiska motparter"${ro}>${esc(a.forvantad_omfattning || '')}</textarea>
            </label>
            <label>${fieldLabel('Källa till kapital / medlens ursprung')}
              <textarea class="form-control" rows="2" data-kf="kapitalUrsprung" placeholder="t.ex. vinst från verksamheten, ägartillskott"${ro}>${esc(a.kapitalUrsprung || '')}</textarea>
            </label>
            <div class="kundformular-skarpt"${showSkarpt ? '' : ' hidden'} data-kf-skarpt>
              <label>${fieldLabel('Källa till de specifika tillgångarna (skärpta åtgärder)')}
                <textarea class="form-control" rows="2" data-kf="kapitalUrsprungSkarpt" placeholder="Ursprung till de aktuella medlen"${ro}>${esc(a.kapitalUrsprungSkarpt || '')}</textarea>
              </label>
            </div>
            <div class="kundformular-grid kundformular-grid--pair">
              <label class="kundformular-field--ja-nej">${fieldLabel('Internationell koppling / utlandstransaktioner?')}
                ${jaNejSelect('internationellHandel', a.internationellHandel, readOnly)}
              </label>
              <label data-kf-internationella-lander${a.internationellHandel === 'Ja' ? '' : ' hidden'}>${fieldLabel('Kundens nätverksgeografi (länder)')}
                <input type="text" class="form-control" data-kf="internationellaLander" value="${esc(a.internationellaLander || '')}" placeholder="t.ex. Norge, Tyskland"${ro}>
              </label>
            </div>
          </section>

          ${vhRelevant ? `
          <section class="kundformular-section" data-kf-vh-section>
            <h4>${sVh}. Verklig huvudman</h4>
            <p class="kundformular-hint">Prefyllt från Bolagsverkets register (när kopplingen är aktiv). <strong>Ja</strong> betyder att listan stämmer med registret — samma bedömning som byrån gör i kundresans steg 2.</p>
            <div class="kundformular-label-row" style="margin-bottom:0.5rem">${fieldLabel('Registrerade verkliga huvudmän')}</div>
            <div class="kundformular-person-list" data-kf-person-list="huvudman">
              ${personRows(a.huvudman, 'huvudman', readOnly)}
            </div>
            ${readOnly ? '' : '<button type="button" class="btn btn-ghost btn-sm" data-add-person="huvudman"><i class="fas fa-plus"></i> Lägg till verklig huvudman</button>'}
            <div class="kundformular-grid" style="margin-top:0.75rem">
              <label>${fieldLabel('Stämmer detta med Bolagsverkets register?')}
                ${vhBekraftelseSelect(a.vh_bekraftelse, readOnly)}
              </label>
            </div>
            <div class="kundformular-agarstruktur"${showAgarstruktur ? '' : ' hidden'} data-kf-agarstruktur>
              <label>${fieldLabel('Beskriv ägarstrukturen / kedjan')}
                <textarea class="form-control" rows="3" data-kf="vh_agarstruktur" placeholder="Ägarled, utländska bolag, andelar under 25 % …"${ro}>${esc(a.vh_agarstruktur || '')}</textarea>
              </label>
            </div>
          </section>` : `
          <input type="hidden" data-kf="vh_bekraftelse" value="">
          <input type="hidden" data-kf="vh_agarstruktur" value="">
          `}

          <section class="kundformular-section">
            <h4>${sOmbud}. Ombud</h4>
            <p class="kundformular-hint">${esc(ombudHint)}</p>
            <div class="kundformular-grid kundformular-grid--pair">
              <label class="kundformular-field--ja-nej">${fieldLabel(ombudLabel)}
                ${jaNejSelect('ombud_annan', a.ombud_annan, readOnly)}
              </label>
            </div>
            <div class="kundformular-ombud"${showOmbud ? '' : ' hidden'} data-kf-ombud>
              <div class="kundformular-label-row" style="margin-bottom:0.5rem">${fieldLabel('Ombud')}</div>
              <div class="kundformular-person-list" data-kf-person-list="ombud">
                ${personRows(a.ombud, 'ombud', readOnly)}
              </div>
              ${readOnly ? '' : '<button type="button" class="btn btn-ghost btn-sm" data-add-person="ombud"><i class="fas fa-plus"></i> Lägg till ombud</button>'}
            </div>
          </section>

          <section class="kundformular-section">
            <h4>${sForetradare}. Företrädare</h4>
            <p class="kundformular-hint">Firmatecknare / styrelse / ägare.</p>
            <div class="kundformular-label-row" style="margin-bottom:0.5rem">${fieldLabel('Företrädare')}</div>
            <div class="kundformular-person-list" data-kf-person-list="foretradare">
              ${personRows(a.foretradare, 'foretradare', readOnly)}
            </div>
            ${readOnly ? '' : '<button type="button" class="btn btn-ghost btn-sm" data-add-person="foretradare"><i class="fas fa-plus"></i> Lägg till företrädare</button>'}
          </section>

          <section class="kundformular-section">
            <h4>${sVillkorade}. Villkorade kontrollfrågor</h4>
            <p class="kundformular-hint">Kopplade till valda tjänster.</p>
            <div data-kf-villkorade-root>
              ${villkoradeHtml(villkorade, a.villkorade_svar, readOnly)}
            </div>
          </section>

          <section class="kundformular-section">
            <h4>${sOvrigt}. Övriga fakta</h4>
            <div class="kundformular-conditional-stack">
              <div class="kundformular-conditional-pair">
                <label class="kundformular-field--ja-nej">${fieldLabel('PEP (politiskt exponerad person)?')}
                  ${jaNejSelect('pep', a.pep, readOnly)}
                </label>
                <label data-kf-pep-detaljer${a.pep === 'Ja' ? '' : ' hidden'}>${fieldLabel('Detaljer PEP')}
                  <input type="text" class="form-control" data-kf="pepDetaljer" value="${esc(a.pepDetaljer || '')}" placeholder="Namn och roll"${ro}>
                </label>
              </div>
              <div class="kundformular-conditional-pair">
                <label class="kundformular-field--ja-nej">${fieldLabel('Närstående till PEP?')}
                  ${jaNejSelect('pepFamilj', a.pepFamilj, readOnly)}
                </label>
                <label data-kf-pep-familj-detaljer${a.pepFamilj === 'Ja' ? '' : ' hidden'}>${fieldLabel('Detaljer närstående')}
                  <input type="text" class="form-control" data-kf="pepFamiljDetaljer" value="${esc(a.pepFamiljDetaljer || '')}"${ro}>
                </label>
              </div>
              <div class="kundformular-conditional-pair">
                <label class="kundformular-field--ja-nej">${fieldLabel('Kontanthantering?')}
                  ${jaNejSelect('kontanter', a.kontanter, readOnly)}
                </label>
                <label data-kf-kontanter-andel${a.kontanter === 'Ja' ? '' : ' hidden'}>${fieldLabel('Andel kontanter')}
                  <input type="text" class="form-control" data-kf="kontanterAndel" value="${esc(a.kontanterAndel || '')}" placeholder="t.ex. 10 %"${ro}>
                </label>
              </div>
            </div>
            <div class="kundformular-grid" style="margin-top:0.35rem">
              <label class="kundformular-field--ja-nej">${fieldLabel('Kryptovaluta?')}
                ${jaNejSelect('kryptovaluta', a.kryptovaluta, readOnly)}
              </label>
              <label>${fieldLabel('Ungefärlig omsättning')}
                <input type="text" class="form-control" data-kf="omsattning" value="${esc(a.omsattning || '')}"${ro}>
              </label>
              <label>${fieldLabel('Antal anställda')}
                <input type="text" class="form-control" data-kf="anstallda" value="${esc(a.anstallda || '')}"${ro}>
              </label>
            </div>
          </section>

          <section class="kundformular-section">
            <h4>${sIntyg}. Intygande</h4>
            <label class="kundformular-check">
              <input type="checkbox" data-kf="bekraftelse" ${a.bekraftelse ? 'checked' : ''}${readOnly ? ' disabled' : ''}>
              <span>Jag intygar att uppgifterna är korrekta och fullständiga såvitt jag känner till.</span>
            </label>
          </section>
        </form>
      </div>
    `;

    const root = container.querySelector('#kundformular-root');
    if (!root) return;
    // Attach listeners even without onAction so invite-copy works in read-only views.

    function syncConditionalUi() {
      const answers = collectAnswers(root);
      const local = computeLocalMeta(answers, meta);
      const agar = root.querySelector('[data-kf-agarstruktur]');
      if (agar) agar.hidden = !local.vhKraverAgarstruktur;
      const ombud = root.querySelector('[data-kf-ombud]');
      if (ombud) ombud.hidden = answers.ombud_annan !== 'Ja';
      const skarpt = root.querySelector('[data-kf-skarpt]');
      if (skarpt) skarpt.hidden = !local.skarptKapital;
      const lander = root.querySelector('[data-kf-internationella-lander]');
      if (lander) lander.hidden = answers.internationellHandel !== 'Ja';
      const pepDet = root.querySelector('[data-kf-pep-detaljer]');
      if (pepDet) pepDet.hidden = answers.pep !== 'Ja';
      const pepFamDet = root.querySelector('[data-kf-pep-familj-detaljer]');
      if (pepFamDet) pepFamDet.hidden = answers.pepFamilj !== 'Ja';
      const kontAndel = root.querySelector('[data-kf-kontanter-andel]');
      if (kontAndel) kontAndel.hidden = answers.kontanter !== 'Ja';
      root.querySelectorAll('[data-kf-person-row]').forEach((row) => {
        const hemvist = (row.querySelector('[data-kf-field="hemvist"]')?.value || '').trim();
        const tin = row.querySelector('[data-kf-tin]');
        if (tin) tin.hidden = isSwedenHemvist(hemvist);
      });
      root.querySelectorAll('[data-kf-villkorad]').forEach((wrap) => {
        const svar = (wrap.querySelector('[data-kf-villkorad-svar]')?.value || '').trim();
        const varfor = wrap.querySelector('.kundformular-villkorad-varfor');
        if (!varfor) return;
        varfor.hidden = svar !== 'Ja';
      });
    }

    function refreshVillkoradeFromTjanster() {
      if (readOnly) return;
      const holder = root.querySelector('[data-kf-villkorade-root]');
      if (!holder) return;
      const answers = collectAnswers(root);
      const matched = matchVillkorade(meta.villkoradeKatalog || meta.villkoradeKontroller, answers.tjanster);
      holder.innerHTML = villkoradeHtml(matched, answers.villkorade_svar || {}, readOnly);
    }

    root.addEventListener('change', (e) => {
      if (readOnly) return;
      if (e.target.matches('[data-kf-tjanst]')) {
        refreshVillkoradeFromTjanster();
        syncConditionalUi();
        return;
      }
      if (e.target.matches('[data-kf="vh_bekraftelse"], [data-kf="ombud_annan"], [data-kf="pep"], [data-kf="pepFamilj"], [data-kf="kontanter"], [data-kf="internationellHandel"], [data-kf-villkorad-svar], [data-kf-field="hemvist"]')) {
        syncConditionalUi();
      }
    });

    root.addEventListener('input', (e) => {
      if (readOnly) return;
      if (e.target.matches('[data-kf-field="hemvist"]')) {
        syncConditionalUi();
      }
    });

    root.addEventListener('click', (e) => {
      const copyBtn = e.target.closest('[data-kf-copy-invite]');
      if (copyBtn) {
        e.preventDefault();
        const input = root.querySelector('[data-kf-invite-url]');
        const url = input?.value || '';
        if (url && navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(url).then(() => {
            copyBtn.innerHTML = '<i class="fas fa-check"></i> Kopierad';
            setTimeout(() => { copyBtn.innerHTML = '<i class="fas fa-copy"></i> Kopiera'; }, 1500);
          }).catch(() => {});
        } else if (input) {
          input.select();
          try { document.execCommand('copy'); } catch (_) {}
        }
        return;
      }
      if (readOnly) return;
      const addBtn = e.target.closest('[data-add-person]');
      if (addBtn) {
        e.preventDefault();
        const prefix = addBtn.getAttribute('data-add-person');
        const list = root.querySelector(`[data-kf-person-list="${prefix}"]`);
        if (!list) return;
        const wrap = document.createElement('div');
        wrap.innerHTML = personRows([{}], prefix, false);
        list.appendChild(wrap.firstElementChild);
        syncConditionalUi();
        return;
      }
      const rm = e.target.closest('[data-remove-person]');
      if (rm) {
        e.preventDefault();
        const row = rm.closest('[data-kf-person-row]');
        const list = row?.parentElement;
        if (row && list) {
          row.remove();
          if (!list.querySelector('[data-kf-person-row]')) {
            const prefix = list.getAttribute('data-kf-person-list');
            const wrap = document.createElement('div');
            wrap.innerHTML = personRows([{}], prefix, false);
            list.appendChild(wrap.firstElementChild);
          }
        }
        return;
      }
      const actionBtn = e.target.closest('[data-kf-action]');
      if (actionBtn && !actionBtn.disabled && onAction) {
        e.preventDefault();
        onAction(actionBtn.getAttribute('data-kf-action'), collectAnswers(root), actionBtn);
      }
    });

    syncConditionalUi();
  }

  global.KundformularUi = { render, collectAnswers, fmtDate };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
