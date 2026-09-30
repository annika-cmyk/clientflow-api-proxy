/**
 * Publikt KYC-formulär (kundvy via invite-länk).
 * Speglar fälten i kundkortets _collectKYCFormularData — utan byråinterna kontroller.
 */
(function (global) {
  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function janejSelect(name, val) {
    const v = String(val || '');
    return `<select class="uppdrag-input" name="${name}">
      <option value="">Välj…</option>
      <option value="Ja"${v === 'Ja' ? ' selected' : ''}>Ja</option>
      <option value="Nej"${v === 'Nej' ? ' selected' : ''}>Nej</option>
    </select>`;
  }

  function personRow(prefix, p, idx) {
    const hemvist = p.skatterattslig_hemvist || p.hemvist || 'Sverige';
    const visaTin = hemvist.trim() !== '' && hemvist.trim().toLowerCase() !== 'sverige';
    return `<div class="kyc-pub-person" data-prefix="${prefix}" data-idx="${idx}" style="padding-top:0.75rem;margin-top:0.75rem;border-top:1px solid #e2e8f0;">
      <div class="uppdrag-grid">
        <div class="uppdrag-field"><label>Namn</label>
          <input type="text" class="uppdrag-input" name="${prefix}-namn" value="${esc(p.namn || '')}"></div>
        <div class="uppdrag-field"><label>Personnummer</label>
          <input type="text" class="uppdrag-input" name="${prefix}-pnr" value="${esc(p.personnr || '')}" placeholder="ÅÅÅÅMMDD-XXXX"></div>
        <div class="uppdrag-field"><label>Skatterättslig hemvist</label>
          <input type="text" class="uppdrag-input kyc-pub-hemvist" name="${prefix}-hemvist" value="${esc(hemvist)}" placeholder="Sverige"></div>
        <div class="uppdrag-field kyc-pub-tin-wrap" style="display:${visaTin ? 'block' : 'none'};">
          <label>TIN</label>
          <input type="text" class="uppdrag-input" name="${prefix}-tin" value="${esc(p.tin || '')}">
        </div>
      </div>
      <button type="button" class="kyc-pub-remove-person" data-prefix="${prefix}" style="margin-top:0.4rem;background:none;border:none;color:#dc2626;font-size:0.82rem;cursor:pointer;padding:0;">
        <i class="fas fa-times"></i> Ta bort
      </button>
    </div>`;
  }

  function collectPersons(root, prefix) {
    return Array.from(root.querySelectorAll(`.kyc-pub-person[data-prefix="${prefix}"]`)).map((row) => ({
      namn: (row.querySelector(`[name="${prefix}-namn"]`)?.value || '').trim(),
      personnr: (row.querySelector(`[name="${prefix}-pnr"]`)?.value || '').trim(),
      skatterattslig_hemvist: (row.querySelector(`[name="${prefix}-hemvist"]`)?.value || '').trim() || 'Sverige',
      hemvist: (row.querySelector(`[name="${prefix}-hemvist"]`)?.value || '').trim() || 'Sverige',
      tin: (row.querySelector(`[name="${prefix}-tin"]`)?.value || '').trim()
    })).filter((p) => p.namn || p.personnr || p.tin);
  }

  function g(root, name) {
    return (root.querySelector(`[name="${name}"]`)?.value || '').trim();
  }

  function collectAnswers(root) {
    const foretradare = collectPersons(root, 'ftr');
    const huvudman = collectPersons(root, 'vh');
    const HM = global.KycHuvudman;
    const utlandska = HM
      ? (HM.hasForeignHemvist(huvudman) || HM.hasForeignHemvist(foretradare))
      : false;
    return {
      foretagsnamn: g(root, 'foretagsnamn'),
      orgnr: g(root, 'orgnr'),
      bolagsform: g(root, 'bolagsform'),
      skatterattslig_hemvist_foretag: g(root, 'hemvist-foretag') || 'Sverige',
      tin_foretag: g(root, 'tin-foretag'),
      foretradare,
      huvudman,
      huvudmanAnnatSatt: g(root, 'huvudman-annat'),
      vh_agarandel: (() => {
        const v = g(root, 'vh-agarandel');
        return v === '' ? null : Number(v);
      })(),
      vh_noterat_bolag: g(root, 'vh-noterat') === 'Ja',
      vh_utlandska_agare: utlandska || g(root, 'vh-utlandska') === 'Ja',
      pep: g(root, 'pep'),
      pepDetaljer: g(root, 'pep-detaljer'),
      pepFamilj: g(root, 'pep-familj'),
      pepFamiljDetaljer: g(root, 'pep-familj-detaljer'),
      verksamhet: g(root, 'verksamhet'),
      kostnader: g(root, 'kostnader'),
      intakterna: g(root, 'intakterna'),
      syfte_affarsrelation: g(root, 'syfte'),
      tjanster: g(root, 'tjanster'),
      kapitalUrsprung: g(root, 'kapital'),
      anstallda: g(root, 'anstallda'),
      omsattning: g(root, 'omsattning'),
      internationellHandel: g(root, 'internationell'),
      internationellaLander: g(root, 'lander'),
      kontanter: g(root, 'kontanter'),
      kontanterAndel: g(root, 'kontanter-andel'),
      kryptovaluta: g(root, 'krypto'),
      bekraftelse: !!root.querySelector('[name="bekraftelse"]')?.checked
    };
  }

  function render(container, payload, { onSave, onSubmit } = {}) {
    if (!container) return;
    const a = payload?.answers || {};
    const company = payload?.companyName || a.foretagsnamn || '';
    const byra = payload?.byraName || '';
    const bolagsform = payload?.bolagsform || a.bolagsform || '';
    const arEnskild = /enskild/i.test(bolagsform);
    let foretradare = Array.isArray(a.foretradare) && a.foretradare.length
      ? a.foretradare
      : [{ namn: '', personnr: '', hemvist: 'Sverige', tin: '' }];
    let huvudman = Array.isArray(a.huvudman) && a.huvudman.length
      ? a.huvudman
      : [{ namn: '', personnr: '', hemvist: 'Sverige', tin: '' }];

    const visaTinForetag = (a.skatterattslig_hemvist_foretag || 'Sverige').trim().toLowerCase() !== 'sverige';

    container.innerHTML = `
      <div class="uppdrag-wrap" id="kyc-pub-root">
        <div class="uppdrag-doc-header">
          <div class="uppdrag-doc-titel">KYC — Kundkännedomsformulär</div>
          <div class="uppdrag-doc-välkommen">
            Formellt intygande enligt penningtvättslagen (2017:630) för
            <strong>${esc(company || 'ert företag')}</strong>${byra ? ` hos ${esc(byra)}` : ''}.
            Detta är <em>inte</em> samma sak som kundformuläret — här intygar ni kundkännedomsuppgifter som sedan signeras med BankID.
          </div>
        </div>

        <form id="kyc-pub-form" onsubmit="return false;">
          <div class="uppdrag-section uppdrag-section--card">
            <div class="uppdrag-section-title" style="margin-bottom:0.75rem;"><i class="fas fa-building"></i> 1. Grunduppgifter</div>
            <div class="uppdrag-grid">
              <div class="uppdrag-field"><label>Företagets namn</label>
                <input type="text" class="uppdrag-input" name="foretagsnamn" value="${esc(a.foretagsnamn || company)}"></div>
              <div class="uppdrag-field"><label>Organisationsnummer</label>
                <input type="text" class="uppdrag-input" name="orgnr" value="${esc(a.orgnr || '')}"></div>
              <input type="hidden" name="bolagsform" value="${esc(bolagsform)}">
              <div class="uppdrag-field"><label>Skatterättslig hemvist *</label>
                <input type="text" class="uppdrag-input kyc-pub-hemvist-foretag" name="hemvist-foretag" value="${esc(a.skatterattslig_hemvist_foretag || 'Sverige')}" placeholder="Sverige"></div>
              <div class="uppdrag-field" id="kyc-pub-tin-foretag-wrap" style="display:${visaTinForetag ? 'block' : 'none'};">
                <label>TIN</label>
                <input type="text" class="uppdrag-input" name="tin-foretag" value="${esc(a.tin_foretag || '')}">
              </div>
            </div>
          </div>

          <div class="uppdrag-section uppdrag-section--card" style="margin-top:1rem;">
            <div class="uppdrag-section-title" style="margin-bottom:0.5rem;"><i class="fas fa-user-tie"></i> 2. Företrädare</div>
            <div id="kyc-pub-ftr-list">${foretradare.map((p, i) => personRow('ftr', p, i)).join('')}</div>
            <button type="button" class="btn btn-secondary btn-sm" id="kyc-pub-add-ftr" style="margin-top:0.75rem;"><i class="fas fa-plus"></i> Lägg till</button>
          </div>

          ${arEnskild ? '' : `
          <div class="uppdrag-section uppdrag-section--card" style="margin-top:1rem;">
            <div class="uppdrag-section-title" style="margin-bottom:0.5rem;"><i class="fas fa-users"></i> 3. Verklig huvudman</div>
            <div id="kyc-pub-vh-list">${huvudman.map((p, i) => personRow('vh', p, i)).join('')}</div>
            <button type="button" class="btn btn-secondary btn-sm" id="kyc-pub-add-vh" style="margin-top:0.75rem;"><i class="fas fa-plus"></i> Lägg till</button>
            <div class="uppdrag-field" style="margin-top:0.75rem;">
              <label>Kontroll genom avtal el. dyl.</label>
              <textarea class="uppdrag-input" name="huvudman-annat" rows="2">${esc(a.huvudmanAnnatSatt || '')}</textarea>
            </div>
            <div class="uppdrag-grid" style="margin-top:0.75rem;">
              <div class="uppdrag-field"><label>Total ägarandel (%)</label>
                <input type="number" class="uppdrag-input" name="vh-agarandel" value="${esc(a.vh_agarandel == null ? 100 : a.vh_agarandel)}"></div>
              <div class="uppdrag-field"><label>Börsnoterat bolag?</label>${janejSelect('vh-noterat', a.vh_noterat_bolag ? 'Ja' : 'Nej')}</div>
              <div class="uppdrag-field"><label>Utländska ägare?</label>${janejSelect('vh-utlandska', a.vh_utlandska_agare ? 'Ja' : 'Nej')}</div>
            </div>
          </div>`}

          <div class="uppdrag-section uppdrag-section--card" style="margin-top:1rem;">
            <div class="uppdrag-section-title" style="margin-bottom:0.5rem;"><i class="fas fa-landmark"></i> 4. PEP</div>
            <div class="uppdrag-field"><label>Är någon PEP?</label>${janejSelect('pep', a.pep || '')}</div>
            <div class="uppdrag-field" style="margin-top:0.5rem;"><label>Detaljer</label>
              <input type="text" class="uppdrag-input" name="pep-detaljer" value="${esc(a.pepDetaljer || '')}"></div>
            <div class="uppdrag-field" style="margin-top:0.5rem;"><label>Familj/medarbetare till PEP?</label>${janejSelect('pep-familj', a.pepFamilj || '')}</div>
            <div class="uppdrag-field" style="margin-top:0.5rem;"><label>Detaljer</label>
              <input type="text" class="uppdrag-input" name="pep-familj-detaljer" value="${esc(a.pepFamiljDetaljer || '')}"></div>
          </div>

          <div class="uppdrag-section uppdrag-section--card" style="margin-top:1rem;">
            <div class="uppdrag-section-title" style="margin-bottom:0.5rem;"><i class="fas fa-briefcase"></i> 5. Affärsförbindelsens syfte</div>
            <div class="uppdrag-field"><label>Verksamhet</label>
              <textarea class="uppdrag-input" name="verksamhet" rows="3">${esc(a.verksamhet || '')}</textarea></div>
            <div class="uppdrag-field" style="margin-top:0.5rem;"><label>Kostnader</label>
              <textarea class="uppdrag-input" name="kostnader" rows="2">${esc(a.kostnader || '')}</textarea></div>
            <div class="uppdrag-field" style="margin-top:0.5rem;"><label>Intäkterna</label>
              <textarea class="uppdrag-input" name="intakterna" rows="2">${esc(a.intakterna || '')}</textarea></div>
            <div class="uppdrag-field" style="margin-top:0.5rem;"><label>Syfte med affärsrelationen</label>
              <input type="text" class="uppdrag-input" name="syfte" value="${esc(a.syfte_affarsrelation || '')}"></div>
            <div class="uppdrag-field" style="margin-top:0.5rem;"><label>Byråns tjänster</label>
              <input type="text" class="uppdrag-input" name="tjanster" value="${esc(a.tjanster || '')}"></div>
            <div class="uppdrag-field" style="margin-top:0.5rem;"><label>Pengarnas ursprung</label>
              <input type="text" class="uppdrag-input" name="kapital" value="${esc(a.kapitalUrsprung || '')}"></div>
            <div class="uppdrag-grid" style="margin-top:0.5rem;">
              <div class="uppdrag-field"><label>Antal anställda</label>
                <input type="text" class="uppdrag-input" name="anstallda" value="${esc(a.anstallda || '')}"></div>
              <div class="uppdrag-field"><label>Uppskattad årsomsättning</label>
                <input type="text" class="uppdrag-input" name="omsattning" value="${esc(a.omsattning || '')}"></div>
            </div>
          </div>

          <div class="uppdrag-section uppdrag-section--card" style="margin-top:1rem;">
            <div class="uppdrag-section-title" style="margin-bottom:0.5rem;"><i class="fas fa-globe"></i> 6–8. Handel, kontanter, krypto</div>
            <div class="uppdrag-field"><label>Handel utanför Sverige?</label>${janejSelect('internationell', a.internationellHandel || '')}</div>
            <div class="uppdrag-field" style="margin-top:0.5rem;"><label>Länder</label>
              <input type="text" class="uppdrag-input" name="lander" value="${esc(a.internationellaLander || '')}" placeholder="t.ex. Tyskland, Norge"></div>
            <div class="uppdrag-field" style="margin-top:0.5rem;"><label>Kontanthantering?</label>${janejSelect('kontanter', a.kontanter || '')}</div>
            <div class="uppdrag-field" style="margin-top:0.5rem;"><label>Andel kontanter</label>
              <input type="text" class="uppdrag-input" name="kontanter-andel" value="${esc(a.kontanterAndel || '')}"></div>
            <div class="uppdrag-field" style="margin-top:0.5rem;"><label>Transaktioner i kryptovaluta?</label>${janejSelect('krypto', a.kryptovaluta || '')}</div>
          </div>

          <div class="uppdrag-section uppdrag-section--card" style="margin-top:1rem;border-left:3px solid #4f6ef7;">
            <label style="display:flex;gap:0.6rem;align-items:flex-start;cursor:pointer;">
              <input type="checkbox" name="bekraftelse" style="margin-top:0.25rem;" ${a.bekraftelse ? 'checked' : ''}>
              <span>Jag intygar att lämnade uppgifter är korrekta och fullständiga. Jag förbinder mig att meddela byrån vid väsentliga förändringar.</span>
            </label>
          </div>

          <div class="uppdrag-actions" style="margin-top:1.25rem;display:flex;gap:0.75rem;flex-wrap:wrap;">
            <button type="button" class="btn btn-secondary" id="kyc-pub-save"><i class="fas fa-save"></i> Spara utkast</button>
            <button type="button" class="btn btn-primary" id="kyc-pub-submit"><i class="fas fa-paper-plane"></i> Skicka in</button>
          </div>
        </form>
      </div>`;

    const root = container.querySelector('#kyc-pub-root');

    function bindHemvistToggles(scope) {
      scope.querySelectorAll('.kyc-pub-hemvist').forEach((input) => {
        input.addEventListener('input', () => {
          const wrap = input.closest('.kyc-pub-person')?.querySelector('.kyc-pub-tin-wrap');
          if (!wrap) return;
          const v = input.value.trim().toLowerCase();
          wrap.style.display = v && v !== 'sverige' ? 'block' : 'none';
        });
      });
    }
    bindHemvistToggles(root);

    root.querySelector('.kyc-pub-hemvist-foretag')?.addEventListener('input', (e) => {
      const wrap = root.querySelector('#kyc-pub-tin-foretag-wrap');
      if (!wrap) return;
      const v = e.target.value.trim().toLowerCase();
      wrap.style.display = v && v !== 'sverige' ? 'block' : 'none';
    });

    root.addEventListener('click', (e) => {
      const removeBtn = e.target.closest('.kyc-pub-remove-person');
      if (removeBtn) {
        const prefix = removeBtn.getAttribute('data-prefix');
        const list = root.querySelector(`#kyc-pub-${prefix === 'ftr' ? 'ftr' : 'vh'}-list`);
        const row = removeBtn.closest('.kyc-pub-person');
        if (!list || !row) return;
        const rows = list.querySelectorAll('.kyc-pub-person');
        if (rows.length <= 1) {
          row.querySelectorAll('input').forEach((inp) => {
            if (inp.name?.endsWith('-hemvist')) inp.value = 'Sverige';
            else inp.value = '';
          });
          return;
        }
        row.remove();
        return;
      }
    });

    root.querySelector('#kyc-pub-add-ftr')?.addEventListener('click', () => {
      const list = root.querySelector('#kyc-pub-ftr-list');
      list.insertAdjacentHTML('beforeend', personRow('ftr', {}, list.children.length));
      bindHemvistToggles(list.lastElementChild);
    });
    root.querySelector('#kyc-pub-add-vh')?.addEventListener('click', () => {
      const list = root.querySelector('#kyc-pub-vh-list');
      if (!list) return;
      list.insertAdjacentHTML('beforeend', personRow('vh', {}, list.children.length));
      bindHemvistToggles(list.lastElementChild);
    });

    root.querySelector('#kyc-pub-save')?.addEventListener('click', async (e) => {
      if (typeof onSave === 'function') await onSave(collectAnswers(root), e.currentTarget);
    });
    root.querySelector('#kyc-pub-submit')?.addEventListener('click', async (e) => {
      const answers = collectAnswers(root);
      if (!answers.skatterattslig_hemvist_foretag) {
        alert('Fyll i skatterättslig hemvist (företag).');
        return;
      }
      if (!answers.bekraftelse) {
        alert('Bekräfta att uppgifterna är korrekta innan ni skickar in.');
        return;
      }
      if (typeof onSubmit === 'function') await onSubmit(answers, e.currentTarget);
    });
  }

  const api = { render, collectAnswers };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.KycFormularPublic = api;
})(typeof window !== 'undefined' ? window : globalThis);
