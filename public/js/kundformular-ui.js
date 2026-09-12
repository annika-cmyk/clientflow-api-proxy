/**
 * Kundformulär-UI (kundkort). Byråvy av samma formulär kunden ska besvara.
 * Fältnamn följer lib/kundformular.js answers-schema.
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

  function collectAnswers(root) {
    const g = (key) => (root.querySelector(`[data-kf="${key}"]`)?.value || '').trim();
    return {
      foretagsnamn: g('foretagsnamn'),
      orgnr: g('orgnr'),
      syfte_affarsrelation: g('syfte_affarsrelation'),
      verksamhet: g('verksamhet'),
      kapitalUrsprung: g('kapitalUrsprung'),
      anstallda: g('anstallda'),
      omsattning: g('omsattning'),
      foretradare: collectPeople(root, 'foretradare'),
      huvudman: collectPeople(root, 'huvudman'),
      pep: g('pep'),
      pepDetaljer: g('pepDetaljer'),
      pepFamilj: g('pepFamilj'),
      pepFamiljDetaljer: g('pepFamiljDetaljer'),
      internationellHandel: g('internationellHandel'),
      internationellaLander: g('internationellaLander'),
      kontanter: g('kontanter'),
      kontanterAndel: g('kontanterAndel'),
      kryptovaluta: g('kryptovaluta'),
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

  function render(container, payload, opts = {}) {
    if (!container) return;
    const form = payload?.form || {};
    const a = form.answers || {};
    const summary = payload?.summary || {};
    const onAction = typeof opts.onAction === 'function' ? opts.onAction : null;

    const metaBits = [];
    if (summary.answeredAt) {
      metaBits.push(`Kunden svarade <strong>${esc(fmtDate(summary.answeredAt))}</strong>${summary.answeredBy ? ` (${esc(summary.answeredBy)})` : ''}.`);
    } else {
      metaBits.push('Inget kundsvar registrerat ännu.');
    }
    if (summary.sentAt) metaBits.push(`Skickat ${esc(fmtDate(summary.sentAt))}.`);
    if (summary.signedAt) metaBits.push(`Signerat ${esc(fmtDate(summary.signedAt))}.`);
    if (summary.prefacedAt) metaBits.push(`Senast prefillat ${esc(fmtDate(summary.prefacedAt))}.`);

    container.innerHTML = `
      <div class="kundformular-panel" id="kundformular-root">
        <div class="kundformular-header">
          <div>
            <h3 class="kundformular-title">Kundformulär</h3>
            <p class="kundformular-lead">Samma formulär som kunden ska fylla i. Byrån kan prefilla uppgifter ni redan har – kunden bekräftar och kompletterar det som enligt lag ska komma från kunden själv. BankID-signering byggs ut härnäst.</p>
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
            <p class="kundformular-hint">Hämtas från kundkortet. Kunden ser men behöver normalt inte ändra.</p>
            <div class="kundformular-grid">
              <label>Företagsnamn
                <input type="text" class="form-control" data-kf="foretagsnamn" value="${esc(a.foretagsnamn || '')}" readonly>
              </label>
              <label>Organisationsnummer
                <input type="text" class="form-control" data-kf="orgnr" value="${esc(a.orgnr || '')}" readonly>
              </label>
            </div>
          </section>

          <section class="kundformular-section">
            <h4>2. Syfte och verksamhet</h4>
            <p class="kundformular-hint">Uppgifter som enligt penningtvättsregelverket ska komma från / bekräftas av kunden.</p>
            <label>Syfte med affärsförbindelsen
              <textarea class="form-control" rows="2" data-kf="syfte_affarsrelation" placeholder="t.ex. sedvanliga redovisningstjänster">${esc(a.syfte_affarsrelation || '')}</textarea>
            </label>
            <label>Beskrivning av verksamheten
              <textarea class="form-control" rows="3" data-kf="verksamhet" placeholder="Vad gör företaget?">${esc(a.verksamhet || '')}</textarea>
            </label>
            <label>Kapitalets / medlens ursprung
              <textarea class="form-control" rows="2" data-kf="kapitalUrsprung" placeholder="t.ex. vinst från verksamheten, ägartillskott">${esc(a.kapitalUrsprung || '')}</textarea>
            </label>
            <div class="kundformular-grid">
              <label>Ungefärlig omsättning
                <input type="text" class="form-control" data-kf="omsattning" value="${esc(a.omsattning || '')}">
              </label>
              <label>Antal anställda
                <input type="text" class="form-control" data-kf="anstallda" value="${esc(a.anstallda || '')}">
              </label>
            </div>
          </section>

          <section class="kundformular-section">
            <h4>3. Företrädare / ombud</h4>
            <div class="kundformular-person-list" data-kf-person-list="foretradare">
              ${personRows(a.foretradare, 'foretradare')}
            </div>
            <button type="button" class="btn btn-ghost btn-sm" data-add-person="foretradare"><i class="fas fa-plus"></i> Lägg till företrädare</button>
          </section>

          <section class="kundformular-section">
            <h4>4. Verklig huvudman</h4>
            <div class="kundformular-person-list" data-kf-person-list="huvudman">
              ${personRows(a.huvudman, 'huvudman')}
            </div>
            <button type="button" class="btn btn-ghost btn-sm" data-add-person="huvudman"><i class="fas fa-plus"></i> Lägg till verklig huvudman</button>
          </section>

          <section class="kundformular-section">
            <h4>5. PEP</h4>
            <div class="kundformular-grid">
              <label>Är någon företrädare eller verklig huvudman en PEP?
                ${jaNejSelect('pep', a.pep)}
              </label>
              <label>Detaljer
                <input type="text" class="form-control" data-kf="pepDetaljer" value="${esc(a.pepDetaljer || '')}" placeholder="Namn och roll">
              </label>
              <label>Närstående till PEP?
                ${jaNejSelect('pepFamilj', a.pepFamilj)}
              </label>
              <label>Detaljer närstående
                <input type="text" class="form-control" data-kf="pepFamiljDetaljer" value="${esc(a.pepFamiljDetaljer || '')}">
              </label>
            </div>
          </section>

          <section class="kundformular-section">
            <h4>6. Internationellt, kontanter och krypto</h4>
            <div class="kundformular-grid">
              <label>Internationell handel / utlandstransaktioner?
                ${jaNejSelect('internationellHandel', a.internationellHandel)}
              </label>
              <label>Länder
                <input type="text" class="form-control" data-kf="internationellaLander" value="${esc(a.internationellaLander || '')}" placeholder="t.ex. Norge, Tyskland">
              </label>
              <label>Kontanthantering?
                ${jaNejSelect('kontanter', a.kontanter)}
              </label>
              <label>Andel kontanter (om ja)
                <input type="text" class="form-control" data-kf="kontanterAndel" value="${esc(a.kontanterAndel || '')}">
              </label>
              <label>Kryptovaluta?
                ${jaNejSelect('kryptovaluta', a.kryptovaluta)}
              </label>
            </div>
          </section>

          <section class="kundformular-section">
            <h4>7. Intygande</h4>
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
