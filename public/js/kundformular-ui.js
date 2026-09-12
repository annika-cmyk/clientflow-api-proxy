/**
 * Kundformulär-UI (kundkort). Byråvy av samma formulär kunden ska besvara.
 * Fältnamn följer lib/kundformular.js answers-schema (Lager C fas 2 steg 4).
 * Neutral faktayta — ingen riskpoäng synlig.
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

  function sourceBadge(key, meta) {
    const sources = meta?.fieldSources || {};
    const labels = meta?.fieldSourceLabels || {
      hamtas: 'Hämtas',
      byra: 'Byråns val',
      sjalvrapport: 'Självrapport'
    };
    const src = sources[key] || 'sjalvrapport';
    const label = labels[src] || 'Självrapport';
    return `<span class="kundformular-badge kundformular-badge--${esc(src)}" title="Datakälla">${esc(label)}</span>`;
  }

  function labelWithBadge(text, key, meta) {
    return `<span class="kundformular-label-row"><span>${esc(text)}</span>${sourceBadge(key, meta)}</span>`;
  }

  function jaNejSelect(name, selected) {
    const v = String(selected || '');
    const opts = ['', 'Ja', 'Nej']
      .map((opt) => {
        const label = opt || '—';
        return `<option value="${esc(opt)}"${opt === v ? ' selected' : ''}>${esc(label)}</option>`;
      })
      .join('');
    return `<select class="form-control" data-kf="${esc(name)}">${opts}</select>`;
  }

  function vhBekraftelseSelect(selected) {
    const v = String(selected || '');
    const opts = [
      { value: '', label: '—' },
      { value: 'Ja', label: 'Ja, stämmer' },
      { value: 'Osaker', label: 'Osäker' },
      { value: 'Nej', label: 'Nej' }
    ].map((opt) =>
      `<option value="${esc(opt.value)}"${opt.value === v ? ' selected' : ''}>${esc(opt.label)}</option>`
    ).join('');
    return `<select class="form-control" data-kf="vh_bekraftelse">${opts}</select>`;
  }

  function personRows(list, prefix) {
    const rows = Array.isArray(list) && list.length
      ? list
      : [{ namn: '', personnr: '', hemvist: 'Sverige', tin: '', agarandel: '', roll: '' }];
    return rows.map((p, idx) => `
      <div class="kundformular-person-row" data-kf-person-row="${esc(prefix)}" data-idx="${idx}">
        <div class="kundformular-grid kundformular-grid--person">
          <label>Namn
            <input type="text" class="form-control" data-kf-field="namn" value="${esc(p.namn || '')}" autocomplete="off">
          </label>
          <label>Personnummer
            <input type="text" class="form-control" data-kf-field="personnr" value="${esc(p.personnr || '')}" autocomplete="off">
          </label>
          <label>Skatterättslig hemvist
            <input type="text" class="form-control" data-kf-field="hemvist" value="${esc(p.hemvist || 'Sverige')}" autocomplete="off">
          </label>
          <label>TIN (om ej Sverige)
            <input type="text" class="form-control" data-kf-field="tin" value="${esc(p.tin || '')}" autocomplete="off">
          </label>
          ${prefix === 'huvudman'
            ? `<label>Ägarandel %
                <input type="text" class="form-control" data-kf-field="agarandel" value="${esc(p.agarandel || '')}" autocomplete="off">
              </label>`
            : `<label>Roll
                <input type="text" class="form-control" data-kf-field="roll" value="${esc(p.roll || '')}" autocomplete="off">
              </label>`}
        </div>
        <button type="button" class="btn btn-ghost btn-sm" data-remove-person title="Ta bort rad"><i class="fas fa-times"></i></button>
      </div>`).join('');
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

  function statusClass(status) {
    const s = String(status || 'utkast');
    if (s === 'besvarat' || s === 'signerat') return 'ok';
    if (s === 'skickat') return 'sent';
    if (s === 'prefillad') return 'prefill';
    return 'draft';
  }

  function tjansterHtml(selected, options, meta) {
    const sel = Array.isArray(selected) ? selected : [];
    const selKeys = new Set(sel.map((t) => `${t.id || ''}|${(t.namn || '').toLowerCase()}`));
    const opts = Array.isArray(options) && options.length
      ? options
      : sel.map((t) => ({ id: t.id || '', namn: t.namn || '' }));
    if (!opts.length) {
      return `<p class="kundformular-hint">Inga tjänster i byråns katalog ännu. Koppla tjänster på kundkortet först.</p>`;
    }
    const boxes = opts.map((t) => {
      const id = t.id || '';
      const namn = t.namn || id;
      const key = `${id}|${namn.toLowerCase()}`;
      const checked = sel.some((s) => {
        if (id && s.id && s.id === id) return true;
        return (s.namn || '').toLowerCase() === namn.toLowerCase();
      }) || selKeys.has(key);
      return `<label class="kundformular-check kundformular-check--tjanst">
        <input type="checkbox" data-kf-tjanst data-kf-tjanst-id="${esc(id)}" data-kf-tjanst-namn="${esc(namn)}" value="${esc(namn)}"${checked ? ' checked' : ''}>
        <span>${esc(namn)}</span>
      </label>`;
    }).join('');
    return `<div class="kundformular-tjanster" data-kf-tjanster>${boxes}</div>`;
  }

  function matchVillkorade(katalog, tjanster) {
    const names = (Array.isArray(tjanster) ? tjanster : [])
      .map((t) => t.namn || t.id)
      .filter(Boolean);
    const list = Array.isArray(katalog) ? katalog : [];
    if (!names.length) return [];
    return list.filter((c) => {
      let re = null;
      try {
        const src = c.tjanstMatchSource || '';
        const m = src.match(/^\/(.*)\/([a-z]*)$/i);
        re = m ? new RegExp(m[1], m[2]) : (c.tjanstMatch || null);
      } catch (_) { re = null; }
      if (!re) return false;
      return names.some((n) => re.test(String(n)));
    }).map((c) => ({ id: c.id, frage: c.frage, typ: c.typ }));
  }

  function villkoradeHtml(kontroller, svarMap) {
    const list = Array.isArray(kontroller) ? kontroller : [];
    if (!list.length) {
      return `<p class="kundformular-hint">Inga villkorade frågor för valda tjänster just nu.</p>`;
    }
    const svar = svarMap && typeof svarMap === 'object' ? svarMap : {};
    return list.map((c) => {
      const row = svar[c.id] || {};
      const needsVarfor = c.typ === 'ja_nej_varfor';
      return `<div class="kundformular-villkorad" data-kf-villkorad="${esc(c.id)}">
        <label>${esc(c.frage)}
          <select class="form-control" data-kf-villkorad-svar>
            <option value="">—</option>
            <option value="Ja"${row.svar === 'Ja' ? ' selected' : ''}>Ja</option>
            <option value="Nej"${row.svar === 'Nej' ? ' selected' : ''}>Nej</option>
          </select>
        </label>
        <label class="kundformular-villkorad-varfor"${row.svar === 'Ja' || needsVarfor ? '' : ' hidden'}>Kort förklaring
          <input type="text" class="form-control" data-kf-villkorad-varfor value="${esc(row.varfor || '')}" placeholder="Valfritt vid Nej">
        </label>
      </div>`;
    }).join('');
  }

  function computeLocalMeta(answers, meta) {
    const next = { ...(meta || {}) };
    const vh = String(answers.vh_bekraftelse || '');
    next.vhKraverAgarstruktur = vh === 'Osaker' || vh === 'Nej' || !!meta?.vhKomplex;
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
    const liveMeta = computeLocalMeta(a, meta);

    const metaBits = [];
    if (summary.answeredAt) {
      metaBits.push(`Kunden svarade <strong>${esc(fmtDate(summary.answeredAt))}</strong>${summary.answeredBy ? ` (${esc(summary.answeredBy)})` : ''}.`);
    } else {
      metaBits.push('Inget kundsvar registrerat ännu.');
    }
    if (summary.sentAt) metaBits.push(`Skickat ${esc(fmtDate(summary.sentAt))}.`);
    if (summary.signedAt) metaBits.push(`Signerat ${esc(fmtDate(summary.signedAt))}.`);
    if (summary.prefacedAt) metaBits.push(`Senast prefillat ${esc(fmtDate(summary.prefacedAt))}.`);

    const showAgarstruktur = liveMeta.vhKraverAgarstruktur;
    const showOmbud = a.ombud_annan === 'Ja';
    const showSkarpt = liveMeta.skarptKapital;

    container.innerHTML = `
      <div class="kundformular-panel" id="kundformular-root">
        <div class="kundformular-header">
          <div>
            <h3 class="kundformular-title">Kundformulär</h3>
            <p class="kundformular-lead">Samma formulär som kunden ska fylla i — neutral faktayta utan riskpoäng. Byrån prefyller det som hämtats eller satts upp; kunden bekräftar och kompletterar självrapportfält. BankID-signering byggs ut härnäst.</p>
          </div>
          <div class="kundformular-header-status">
            <span class="kundformular-status kundformular-status--${esc(statusClass(summary.status))}">${esc(summary.statusLabel || summary.status || 'Utkast')}</span>
            <div class="kundformular-meta">${metaBits.map((t) => `<p>${t}</p>`).join('')}</div>
          </div>
        </div>

        <div class="kundformular-actions">
          <button type="button" class="btn btn-secondary" data-kf-action="prefill"><i class="fas fa-magic"></i> Prefylla från kundkort</button>
          <button type="button" class="btn btn-primary" data-kf-action="save"><i class="fas fa-save"></i> Spara</button>
          <button type="button" class="btn btn-secondary" data-kf-action="mark_answered" title="Tills kundportalen finns"><i class="fas fa-check"></i> Markera som besvarat</button>
          <button type="button" class="btn btn-ghost" data-kf-action="mark_sent" disabled title="Kommer med BankID-utskick"><i class="fas fa-id-card"></i> Skicka med BankID</button>
        </div>

        <form class="kundformular-form" id="kundformular-form" autocomplete="off">
          <section class="kundformular-section">
            <h4>1. Företag</h4>
            <p class="kundformular-hint">Hämtas från kundkortet / Bolagsverket. Kunden ser men behöver normalt inte ändra.</p>
            <div class="kundformular-grid">
              <label>${labelWithBadge('Företagsnamn', 'foretagsnamn', meta)}
                <input type="text" class="form-control" data-kf="foretagsnamn" value="${esc(a.foretagsnamn || '')}" readonly>
              </label>
              <label>${labelWithBadge('Organisationsnummer', 'orgnr', meta)}
                <input type="text" class="form-control" data-kf="orgnr" value="${esc(a.orgnr || '')}" readonly>
              </label>
            </div>
          </section>

          <section class="kundformular-section">
            <h4>2. Tjänster</h4>
            <p class="kundformular-hint">Prefyllt från vad byrån kopplat till kunden. Redigering uppdaterar villkorade kontrollfrågor nedan.</p>
            <div class="kundformular-label-row" style="margin-bottom:0.5rem">${labelWithBadge('Uppdrag / tjänster', 'tjanster', meta)}</div>
            ${tjansterHtml(a.tjanster, meta.tjansterOptions, meta)}
          </section>

          <section class="kundformular-section">
            <h4>3. Syfte, verksamhet och omfattning</h4>
            <p class="kundformular-hint">Självrapport enligt 3 kap PTL — syfte, verksamhetens art i praktiken (inte bara SNI), förväntad omfattning/art av transaktioner, källa till kapital och internationell koppling.</p>
            <label>${labelWithBadge('Syfte med affärsförbindelsen', 'syfte_affarsrelation', meta)}
              <textarea class="form-control" rows="2" data-kf="syfte_affarsrelation" placeholder="t.ex. sedvanliga redovisningstjänster">${esc(a.syfte_affarsrelation || '')}</textarea>
            </label>
            <label>${labelWithBadge('Verksamhetens art i praktiken', 'verksamhet', meta)}
              <textarea class="form-control" rows="3" data-kf="verksamhet" placeholder="Vad gör företaget konkret — inte bara SNI-kod">${esc(a.verksamhet || '')}</textarea>
            </label>
            <label>${labelWithBadge('Förväntad omfattning och art av transaktioner', 'forvantad_omfattning', meta)}
              <textarea class="form-control" rows="2" data-kf="forvantad_omfattning" placeholder="Baslinje för senare avvikelser: volym, frekvens, typiska motparter">${esc(a.forvantad_omfattning || '')}</textarea>
            </label>
            <label>${labelWithBadge('Källa till kapital / medlens ursprung', 'kapitalUrsprung', meta)}
              <textarea class="form-control" rows="2" data-kf="kapitalUrsprung" placeholder="t.ex. vinst från verksamheten, ägartillskott">${esc(a.kapitalUrsprung || '')}</textarea>
            </label>
            <div class="kundformular-skarpt"${showSkarpt ? '' : ' hidden'} data-kf-skarpt>
              <label>${labelWithBadge('Källa till de specifika tillgångarna (skärpta åtgärder)', 'kapitalUrsprungSkarpt', meta)}
                <textarea class="form-control" rows="2" data-kf="kapitalUrsprungSkarpt" placeholder="Krävs vid PEP, högriskland eller distansrelation — ursprung till de aktuella medlen">${esc(a.kapitalUrsprungSkarpt || '')}</textarea>
              </label>
            </div>
            <div class="kundformular-grid">
              <label>${labelWithBadge('Internationell koppling / utlandstransaktioner?', 'internationellHandel', meta)}
                ${jaNejSelect('internationellHandel', a.internationellHandel)}
              </label>
              <label>${labelWithBadge('Kundens nätverksgeografi (länder)', 'internationellaLander', meta)}
                <input type="text" class="form-control" data-kf="internationellaLander" value="${esc(a.internationellaLander || '')}" placeholder="t.ex. Norge, Tyskland">
              </label>
            </div>
          </section>

          <section class="kundformular-section">
            <h4>4. Verklig huvudman</h4>
            <p class="kundformular-hint">Prefyllt från register. Kunden bekräftar aktivt. Vid komplex ägarstruktur (fler led, utländskt bolag i kedjan, eller andel under 25 %) beskrivs kedjan.</p>
            <div class="kundformular-label-row" style="margin-bottom:0.5rem">${labelWithBadge('Registrerade verkliga huvudmän', 'huvudman', meta)}</div>
            <div class="kundformular-person-list" data-kf-person-list="huvudman">
              ${personRows(a.huvudman, 'huvudman')}
            </div>
            <button type="button" class="btn btn-ghost btn-sm" data-add-person="huvudman"><i class="fas fa-plus"></i> Lägg till verklig huvudman</button>
            <div class="kundformular-grid" style="margin-top:0.75rem">
              <label>${labelWithBadge('Stämmer detta?', 'vh_bekraftelse', meta)}
                ${vhBekraftelseSelect(a.vh_bekraftelse)}
              </label>
            </div>
            <div class="kundformular-agarstruktur"${showAgarstruktur ? '' : ' hidden'} data-kf-agarstruktur>
              <label>${labelWithBadge('Beskriv ägarstrukturen / kedjan', 'vh_agarstruktur', meta)}
                <textarea class="form-control" rows="3" data-kf="vh_agarstruktur" placeholder="Ägarled, utländska bolag, andelar under 25 % …">${esc(a.vh_agarstruktur || '')}</textarea>
              </label>
            </div>
          </section>

          <section class="kundformular-section">
            <h4>5. Ombud</h4>
            <p class="kundformular-hint">Den som faktiskt för dialogen, om annan än verklig huvudman — identifieras separat.</p>
            <div class="kundformular-grid">
              <label>${labelWithBadge('Ombud annan än verklig huvudman?', 'ombud_annan', meta)}
                ${jaNejSelect('ombud_annan', a.ombud_annan)}
              </label>
            </div>
            <div class="kundformular-ombud"${showOmbud ? '' : ' hidden'} data-kf-ombud>
              <div class="kundformular-label-row" style="margin-bottom:0.5rem">${labelWithBadge('Ombud', 'ombud', meta)}</div>
              <div class="kundformular-person-list" data-kf-person-list="ombud">
                ${personRows(a.ombud, 'ombud')}
              </div>
              <button type="button" class="btn btn-ghost btn-sm" data-add-person="ombud"><i class="fas fa-plus"></i> Lägg till ombud</button>
            </div>
          </section>

          <section class="kundformular-section">
            <h4>6. Företrädare</h4>
            <p class="kundformular-hint">Firmatecknare / styrelse — hämtas när tillgängligt.</p>
            <div class="kundformular-label-row" style="margin-bottom:0.5rem">${labelWithBadge('Företrädare', 'foretradare', meta)}</div>
            <div class="kundformular-person-list" data-kf-person-list="foretradare">
              ${personRows(a.foretradare, 'foretradare')}
            </div>
            <button type="button" class="btn btn-ghost btn-sm" data-add-person="foretradare"><i class="fas fa-plus"></i> Lägg till företrädare</button>
          </section>

          <section class="kundformular-section">
            <h4>7. Villkorade kontrollfrågor</h4>
            <p class="kundformular-hint">Kopplade till valda tjänster. Uppdateras när tjänstelistan ändras.</p>
            <div data-kf-villkorade-root>
              ${villkoradeHtml(meta.villkoradeKontroller, a.villkorade_svar)}
            </div>
          </section>

          <section class="kundformular-section">
            <h4>8. Övriga fakta</h4>
            <p class="kundformular-hint">Faktiska uppgifter — ingen riskklassificering visas här.</p>
            <div class="kundformular-grid">
              <label>${labelWithBadge('PEP (politiskt exponerad person)?', 'pep', meta)}
                ${jaNejSelect('pep', a.pep)}
              </label>
              <label>${labelWithBadge('Detaljer PEP', 'pepDetaljer', meta)}
                <input type="text" class="form-control" data-kf="pepDetaljer" value="${esc(a.pepDetaljer || '')}" placeholder="Namn och roll">
              </label>
              <label>${labelWithBadge('Närstående till PEP?', 'pepFamilj', meta)}
                ${jaNejSelect('pepFamilj', a.pepFamilj)}
              </label>
              <label>${labelWithBadge('Detaljer närstående', 'pepFamiljDetaljer', meta)}
                <input type="text" class="form-control" data-kf="pepFamiljDetaljer" value="${esc(a.pepFamiljDetaljer || '')}">
              </label>
              <label>${labelWithBadge('Kontanthantering?', 'kontanter', meta)}
                ${jaNejSelect('kontanter', a.kontanter)}
              </label>
              <label>${labelWithBadge('Andel kontanter (om ja)', 'kontanterAndel', meta)}
                <input type="text" class="form-control" data-kf="kontanterAndel" value="${esc(a.kontanterAndel || '')}">
              </label>
              <label>${labelWithBadge('Kryptovaluta?', 'kryptovaluta', meta)}
                ${jaNejSelect('kryptovaluta', a.kryptovaluta)}
              </label>
              <label>${labelWithBadge('Ungefärlig omsättning', 'omsattning', meta)}
                <input type="text" class="form-control" data-kf="omsattning" value="${esc(a.omsattning || '')}">
              </label>
              <label>${labelWithBadge('Antal anställda', 'anstallda', meta)}
                <input type="text" class="form-control" data-kf="anstallda" value="${esc(a.anstallda || '')}">
              </label>
            </div>
          </section>

          <section class="kundformular-section">
            <h4>9. Intygande</h4>
            <label class="kundformular-check">
              <input type="checkbox" data-kf="bekraftelse" ${a.bekraftelse ? 'checked' : ''}>
              <span>Jag intygar att uppgifterna är korrekta och fullständiga såvitt jag känner till.</span>
            </label>
          </section>
        </form>
      </div>
    `;

    const root = container.querySelector('#kundformular-root');
    if (!root || !onAction) return;

    function syncConditionalUi() {
      const answers = collectAnswers(root);
      const local = computeLocalMeta(answers, meta);
      const agar = root.querySelector('[data-kf-agarstruktur]');
      if (agar) agar.hidden = !local.vhKraverAgarstruktur;
      const ombud = root.querySelector('[data-kf-ombud]');
      if (ombud) ombud.hidden = answers.ombud_annan !== 'Ja';
      const skarpt = root.querySelector('[data-kf-skarpt]');
      if (skarpt) skarpt.hidden = !local.skarptKapital;
      root.querySelectorAll('[data-kf-villkorad]').forEach((wrap) => {
        const svar = (wrap.querySelector('[data-kf-villkorad-svar]')?.value || '').trim();
        const varfor = wrap.querySelector('.kundformular-villkorad-varfor');
        if (varfor) varfor.hidden = !(svar === 'Ja');
      });
    }

    function refreshVillkoradeFromTjanster() {
      const holder = root.querySelector('[data-kf-villkorade-root]');
      if (!holder) return;
      const answers = collectAnswers(root);
      const prev = answers.villkorade_svar || {};
      const matched = matchVillkorade(meta.villkoradeKatalog || meta.villkoradeKontroller, answers.tjanster);
      holder.innerHTML = villkoradeHtml(matched, prev);
    }

    root.addEventListener('change', (e) => {
      if (e.target.matches('[data-kf-tjanst]')) {
        refreshVillkoradeFromTjanster();
        syncConditionalUi();
        return;
      }
      if (e.target.matches('[data-kf="vh_bekraftelse"], [data-kf="ombud_annan"], [data-kf="pep"], [data-kf="pepFamilj"], [data-kf-villkorad-svar]')) {
        syncConditionalUi();
      }
    });

    root.addEventListener('click', (e) => {
      const addBtn = e.target.closest('[data-add-person]');
      if (addBtn) {
        e.preventDefault();
        const prefix = addBtn.getAttribute('data-add-person');
        const list = root.querySelector(`[data-kf-person-list="${prefix}"]`);
        if (!list) return;
        const wrap = document.createElement('div');
        wrap.innerHTML = personRows([{}], prefix);
        list.appendChild(wrap.firstElementChild);
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
            wrap.innerHTML = personRows([{}], prefix);
            list.appendChild(wrap.firstElementChild);
          }
        }
        return;
      }
      const actionBtn = e.target.closest('[data-kf-action]');
      if (actionBtn && !actionBtn.disabled) {
        e.preventDefault();
        onAction(actionBtn.getAttribute('data-kf-action'), collectAnswers(root), actionBtn);
      }
    });
  }

  global.KundformularUi = { render, collectAnswers, fmtDate };
})(typeof window !== 'undefined' ? window : global);
