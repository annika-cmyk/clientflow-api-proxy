/**
 * Statistik för riskbedömning – hämtar och visar statistik för inloggad byrå
 */
(function () {
  const baseUrl = window.apiConfig?.baseUrl || 'http://localhost:3001';

  /** @type {{ mode: string, typ?: string, namn?: string, titel?: string, data?: object } | null} */
  let modalNav = null;

  function getAuthOpts() {
    return (window.AuthManager && AuthManager.getAuthFetchOptions && AuthManager.getAuthFetchOptions()) || { credentials: 'include', headers: { 'Content-Type': 'application/json' } };
  }

  async function fetchStatistik() {
    const res = await fetch(baseUrl + '/api/statistik-riskbedomning', getAuthOpts());
    if (res.status === 401) return null;
    if (!res.ok) throw new Error('Kunde inte hämta statistik');
    return res.json();
  }

  function chipHtml(opts) {
    const typ = opts.typ || '';
    const namn = opts.namn == null ? '' : String(opts.namn);
    const id = opts.id == null ? '' : String(opts.id);
    const titel = opts.titel || namn || 'Kunder';
    const label = opts.label == null ? namn : String(opts.label);
    const antal = opts.antal;
    const text = (antal != null && antal !== '') ? (label + ' · ' + antal) : label;
    const idAttr = id ? ` data-id="${escapeAttr(id)}"` : '';
    const namnAttr = namn !== '' ? ` data-namn="${escapeAttr(namn)}"` : '';
    return (
      `<button type="button" class="statistik-stat-chip" data-typ="${escapeAttr(typ)}"${namnAttr}${idAttr} ` +
      `data-titel="${escapeAttr(titel)}" title="Klicka för att se kunder">${escapeHtml(text)}</button>`
    );
  }

  function chipsWrap(html) {
    return `<div class="statistik-stat-chips">${html}</div>`;
  }

  function renderStatistik(data) {
    const wrap = document.getElementById('statistik-riskbedomning-content');
    if (!wrap) return;

    const n = data.antalKunder || 0;
    const r = data.riskniva || {};
    const tj = data.tjänster || [];
    const hr = data.högriskbransch || [];
    const oms = data.omsattning || [];
    const anst = data.anstallda || [];
    const bolagsform = data.bolagsform || [];
    const branschBuckets = data.kundBranschBuckets || [];
    const utsatt = (data.utsattOmrade && data.utsattOmrade.rader) || [];

    document.getElementById('stat-antal-kunder').textContent = n;
    document.getElementById('stat-lag').textContent = r['Låg'] || 0;
    const normalEl = document.getElementById('stat-normal') || document.getElementById('stat-medel');
    if (normalEl) normalEl.textContent = r['Normal'] || r['Medel'] || 0;
    const forhojdEl = document.getElementById('stat-forhojd');
    if (forhojdEl) forhojdEl.textContent = r['Förhöjd'] || 0;
    document.getElementById('stat-hog').textContent = r['Hög'] || 0;
    const oaccEl = document.getElementById('stat-oacceptabel');
    if (oaccEl) oaccEl.textContent = r['Oacceptabel'] || 0;
    document.getElementById('stat-ovrigt').textContent = r['Övrigt'] || 0;
    const pepEl = document.getElementById('stat-pep-sanktion');
    if (pepEl) pepEl.textContent = typeof data.antalPepEllerSanktion === 'number' ? data.antalPepEllerSanktion : '–';

    const bolagsformList = document.getElementById('statistik-bolagsform-lista');
    if (bolagsformList) {
      if (bolagsform.length === 0) {
        bolagsformList.innerHTML = '<p class="stat-list-empty">Ingen bolagsform registrerad hos kunderna.</p>';
      } else {
        bolagsformList.innerHTML = chipsWrap(bolagsform.map(b => chipHtml({
          typ: 'bolagsform', namn: b.namn, titel: b.namn, label: b.namn, antal: b.antal
        })).join(''));
      }
    }

    const tjansterList = document.getElementById('statistik-tjanster-lista');
    if (tjansterList) {
      if (tj.length === 0) {
        tjansterList.innerHTML = '<p class="stat-list-empty">Inga tjänster valda hos kunderna.</p>';
      } else {
        tjansterList.innerHTML = chipsWrap(tj.map(t => chipHtml({
          typ: 'tjanst', namn: t.namn, titel: t.namn, label: t.namn, antal: t.antal
        })).join(''));
      }
    }

    const omsList = document.getElementById('statistik-omsattning-lista');
    if (omsList) {
      if (oms.length === 0) {
        omsList.innerHTML = '<p class="stat-list-empty">Ingen omsättning registrerad hos kunderna.</p>';
      } else {
        omsList.innerHTML = chipsWrap(oms.map(o => chipHtml({
          typ: 'omsattning', namn: o.namn, titel: 'Omsättning: ' + o.namn, label: o.namn, antal: o.antal
        })).join(''));
      }
    }

    const anstList = document.getElementById('statistik-anstallda-lista');
    if (anstList) {
      if (anst.length === 0) {
        anstList.innerHTML = '<p class="stat-list-empty">Inget antal anställda registrerat hos kunderna.</p>';
      } else {
        anstList.innerHTML = chipsWrap(anst.map(a => chipHtml({
          typ: 'anstallda', namn: a.namn, titel: 'Anställda: ' + a.namn, label: a.namn, antal: a.antal
        })).join(''));
      }
    }

    const branschList = document.getElementById('statistik-bransch-lista');
    if (branschList) {
      if (branschBuckets.length === 0) {
        branschList.innerHTML = '<p class="stat-list-empty">Ingen branschstatistik tillgänglig.</p>';
      } else {
        branschList.innerHTML = chipsWrap(branschBuckets.map(b => chipHtml({
          typ: 'kund-bransch', namn: b.namn, titel: b.namn, label: b.namn, antal: b.antal
        })).join(''));
      }
    }

    const hrList = document.getElementById('statistik-hogriskbransch-lista');
    if (hrList) {
      if (hr.length === 0) {
        hrList.innerHTML = '<p class="stat-list-empty">Inga kunder med högriskbransch registrerad.</p>';
      } else {
        hrList.innerHTML = chipsWrap(hr.map(h => chipHtml({
          typ: 'hogriskbransch', namn: h.namn, titel: h.namn, label: h.namn, antal: h.antal
        })).join(''));
      }
    }

    const utsattList = document.getElementById('statistik-utsatt-omrade-lista');
    if (utsattList) {
      if (utsatt.length === 0) {
        utsattList.innerHTML = '<p class="stat-list-empty">Inga adresser har kontrollerats mot Polisens utsatta områden ännu.</p>';
      } else {
        const summary = data.utsattOmrade || {};
        const meta = typeof summary.antalTrff === 'number'
          ? `<p class="statistik-section-desc">${summary.antalKontrollerade || 0} kontrollerade adresser, ${summary.antalTrff} träffar. Endast pågående kunder. Klicka på en kategori för kundlista.</p>`
          : '';
        utsattList.innerHTML = meta + chipsWrap(utsatt.map(u => chipHtml({
          typ: 'utsatt-omrade',
          namn: u.namn,
          titel: 'Utsatt område: ' + u.namn,
          label: u.namn,
          antal: u.antal
        })).join(''));
      }
    }

    const riskfaktorKortWrap = document.getElementById('statistik-riskfaktorer-kort');
    if (riskfaktorKortWrap) {
      const rpt = data.riskfaktorerPerTyp || [];
      if (rpt.length === 0) {
        riskfaktorKortWrap.innerHTML = '<p class="stat-list-empty" style="grid-column:1/-1;">Inga kunder med riskfaktorer registrerade.</p>';
      } else {
        riskfaktorKortWrap.innerHTML = rpt.map(kort => `
          <div class="statistik-riskfaktor-kort">
            <h4><i class="fas fa-exclamation-circle"></i> ${escapeHtml(kort.typ)}</h4>
            ${chipHtml({
              typ: 'riskfaktor',
              namn: kort.typ,
              titel: kort.typ,
              label: kort.antalKunder + ' kunder har denna typ'
            })}
            <div class="statistik-stat-chips statistik-stat-chips--nested">
              ${(kort.riskfaktorer || []).map(r => chipHtml({
                typ: 'riskfaktor',
                id: r.id,
                titel: r.namn,
                label: r.namn,
                antal: r.antal
              })).join('')}
            </div>
          </div>
        `).join('');
      }
    }

    if (window.StatistikKunderModal && StatistikKunderModal.bindRowClicks) {
      StatistikKunderModal.bindRowClicks();
    } else {
      bindStatistikRowClicks();
    }
  }

  function escapeAttr(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML.replace(/"/g, '&quot;');
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function modalEls() {
    return {
      overlay: document.getElementById('statistik-kunder-modal-overlay'),
      titleEl: document.getElementById('statistik-kunder-modal-title'),
      listEl: document.getElementById('statistik-kunder-lista'),
      loadingEl: document.getElementById('statistik-kunder-modal-loading'),
      emptyEl: document.getElementById('statistik-kunder-modal-empty'),
      errorEl: document.getElementById('statistik-kunder-modal-error'),
      drillEl: document.getElementById('statistik-bransch-drilldown'),
      backBtn: document.getElementById('statistik-kunder-modal-back')
    };
  }

  function openOverlay() {
    const { overlay } = modalEls();
    if (!overlay) return;
    overlay.style.display = 'flex';
    overlay.setAttribute('aria-hidden', 'false');
  }

  function setBackVisible(show) {
    const { backBtn } = modalEls();
    if (backBtn) backBtn.style.display = show ? 'inline-flex' : 'none';
  }

  function showKunderModal(titel, kunder, loading, error) {
    const { overlay, titleEl, listEl, loadingEl, emptyEl, errorEl, drillEl } = modalEls();
    if (!overlay) return;
    titleEl.textContent = titel || 'Kunder';
    loadingEl.style.display = loading ? 'block' : 'none';
    emptyEl.style.display = 'none';
    errorEl.style.display = 'none';
    if (drillEl) {
      drillEl.style.display = 'none';
      drillEl.innerHTML = '';
    }
    listEl.innerHTML = '';
    listEl.style.display = '';
    if (error) {
      errorEl.textContent = error;
      errorEl.style.display = 'block';
      openOverlay();
      return;
    }
    if (!loading && kunder) {
      if (kunder.length === 0) {
        emptyEl.style.display = 'block';
      } else {
        listEl.innerHTML = kunder.map(k => `
          <li><a href="kundkort.html?id=${encodeURIComponent(k.id)}">${escapeHtml(k.namn)}</a></li>
        `).join('');
      }
    }
    openOverlay();
  }

  function showDrilldownView(titel, data, typ, namn) {
    const { titleEl, listEl, loadingEl, emptyEl, errorEl, drillEl } = modalEls();
    if (!drillEl) return;
    titleEl.textContent = titel || namn || 'Bransch';
    loadingEl.style.display = 'none';
    emptyEl.style.display = 'none';
    errorEl.style.display = 'none';
    listEl.innerHTML = '';
    listEl.style.display = 'none';

    const undersni = data.undersni || [];
    const antal = typeof data.antalKunder === 'number' ? data.antalKunder : (data.kunder || []).length;
    const hasFine = undersni.length > 1 || (undersni.length === 1 && foldKey(undersni[0].namn) !== foldKey(namn));

    let html = `
      <p class="statistik-bransch-drilldown-summary">${antal} kunder i gruppen</p>
      <button type="button" class="btn btn-secondary statistik-bransch-visa-alla" data-action="visa-alla">
        Visa alla kunder
      </button>
    `;
    if (hasFine && undersni.length) {
      html += `
        <h5 class="statistik-bransch-drilldown-heading">Underbranscher</h5>
        <div class="stat-list">
          ${undersni.map((u) => `
            <div class="stat-list-row stat-list-row-clickable" data-action="underbransch" data-namn="${escapeAttr(u.namn)}" title="Visa kunder i underbranschen">
              <span class="stat-list-namn">${escapeHtml(u.namn)}</span>
              <span class="stat-list-antal">${u.antal} kunder</span>
            </div>
          `).join('')}
        </div>
      `;
    } else if (!undersni.length) {
      html += '<p class="stat-list-empty">Inga underbranscher registrerade — visa kundlistan ovan.</p>';
    }

    drillEl.innerHTML = html;
    drillEl.style.display = 'block';
    setBackVisible(false);
    modalNav = { mode: 'drilldown', typ, namn, titel, data };
    openOverlay();

    const visaAlla = drillEl.querySelector('[data-action="visa-alla"]');
    if (visaAlla) {
      visaAlla.addEventListener('click', () => {
        showKunderFromDrill(titel, data.kunder || [], { fromDrill: true, typ, namn, titel, data });
      });
    }
    drillEl.querySelectorAll('[data-action="underbransch"]').forEach((row) => {
      row.addEventListener('click', () => {
        const under = row.getAttribute('data-namn') || '';
        fetchBranschDrilldown(typ, namn, under, under || titel);
      });
    });
  }

  function showKunderFromDrill(titel, kunder, nav) {
    showKunderModal(titel, kunder, false, null);
    setBackVisible(true);
    modalNav = Object.assign({ mode: 'kunder' }, nav || {});
  }

  function foldKey(s) {
    return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function closeKunderModal() {
    const { overlay } = modalEls();
    if (overlay) {
      overlay.style.display = 'none';
      overlay.setAttribute('aria-hidden', 'true');
    }
    modalNav = null;
    setBackVisible(false);
  }

  function goBackInModal() {
    if (!modalNav) {
      closeKunderModal();
      return;
    }
    if (modalNav.mode === 'kunder' && modalNav.data) {
      showDrilldownView(modalNav.titel || modalNav.namn, modalNav.data, modalNav.typ, modalNav.namn);
      return;
    }
    if (modalNav.mode === 'under-kunder' && modalNav.parentData) {
      showDrilldownView(modalNav.titel || modalNav.namn, modalNav.parentData, modalNav.typ, modalNav.namn);
      return;
    }
    closeKunderModal();
  }

  async function fetchKunderForRow(typ, paramId, paramNamn, titel) {
    const params = new URLSearchParams({ typ });
    if (paramId) params.set('id', paramId);
    if (paramNamn !== undefined && paramNamn !== '') params.set('namn', paramNamn);
    setBackVisible(false);
    modalNav = null;
    showKunderModal(titel, null, true, null);
    try {
      const res = await fetch(baseUrl + '/api/statistik-riskbedomning/kunder?' + params.toString(), getAuthOpts());
      const data = await res.json();
      document.getElementById('statistik-kunder-modal-loading').style.display = 'none';
      if (!res.ok) {
        showKunderModal(titel, null, false, data.error || 'Kunde inte hämta kunder');
        return;
      }
      showKunderModal(titel, data.kunder || [], false, null);
    } catch (e) {
      document.getElementById('statistik-kunder-modal-loading').style.display = 'none';
      showKunderModal(titel, null, false, e.message || 'Nätverksfel');
    }
  }

  async function fetchBranschDrilldown(typ, namn, sniFilter, titel) {
    const params = new URLSearchParams({ typ, namn });
    if (sniFilter) params.set('sni', sniFilter);
    const parent = modalNav && modalNav.data && !sniFilter ? null : (modalNav && modalNav.data);
    const parentNav = modalNav && (modalNav.mode === 'drilldown' || modalNav.mode === 'under-kunder')
      ? { typ: modalNav.typ, namn: modalNav.namn, titel: modalNav.titel, data: modalNav.data || modalNav.parentData }
      : null;

    setBackVisible(Boolean(sniFilter));
    showKunderModal(titel || namn, null, true, null);
    try {
      const res = await fetch(baseUrl + '/api/statistik-riskbedomning/bransch-drilldown?' + params.toString(), getAuthOpts());
      const data = await res.json();
      document.getElementById('statistik-kunder-modal-loading').style.display = 'none';
      if (!res.ok) {
        showKunderModal(titel || namn, null, false, data.error || 'Kunde inte hämta branschdetaljer');
        return;
      }
      if (sniFilter) {
        showKunderFromDrill(titel || sniFilter, data.kunder || [], {
          mode: 'under-kunder',
          typ,
          namn,
          titel: parentNav ? parentNav.titel : namn,
          parentData: parentNav ? parentNav.data : parent,
          data: parentNav ? parentNav.data : data
        });
        return;
      }
      showDrilldownView(titel || namn, data, typ, namn);
    } catch (e) {
      document.getElementById('statistik-kunder-modal-loading').style.display = 'none';
      showKunderModal(titel || namn, null, false, e.message || 'Nätverksfel');
    }
  }

  function bindStatistikRowClicks() {
    const closeBtn = document.getElementById('statistik-kunder-modal-close');
    const backBtn = document.getElementById('statistik-kunder-modal-back');
    const overlay = document.getElementById('statistik-kunder-modal-overlay');
    if (closeBtn && !closeBtn._bound) {
      closeBtn._bound = true;
      closeBtn.addEventListener('click', closeKunderModal);
    }
    if (backBtn && !backBtn._bound) {
      backBtn._bound = true;
      backBtn.addEventListener('click', goBackInModal);
    }
    if (overlay && !overlay._bound) {
      overlay._bound = true;
      overlay.addEventListener('click', function (e) {
        if (e.target === this) closeKunderModal();
      });
    }
    document.querySelectorAll('.stat-card-clickable').forEach(card => {
      card.removeEventListener('click', card._statistikCardClick);
      card._statistikCardClick = function () {
        const typ = card.getAttribute('data-typ');
        const titel = card.getAttribute('data-titel') || 'Kunder';
        if (typ === 'pep-sanktion') fetchKunderForRow('pep-sanktion', null, null, titel);
        else if (typ === 'riskniva') fetchKunderForRow('riskniva', null, card.getAttribute('data-namn'), titel);
        else if (typ === 'alla') fetchKunderForRow('alla', null, null, titel);
      };
      card.addEventListener('click', card._statistikCardClick);
    });
    document.querySelectorAll('.stat-list-row-clickable, .statistik-stat-chip').forEach(row => {
      row.removeEventListener('click', row._statistikClick);
      row._statistikClick = function () {
        const typ = row.getAttribute('data-typ');
        const titel = row.getAttribute('data-titel') || 'Kunder';
        if (typ === 'tjanst') {
          fetchKunderForRow('tjanst', null, row.getAttribute('data-namn'), titel);
        } else if (typ === 'kund-bransch') {
          fetchBranschDrilldown('kund-bransch', row.getAttribute('data-namn'), '', titel);
        } else if (typ === 'hogriskbransch') {
          fetchBranschDrilldown('hogriskbransch', row.getAttribute('data-namn'), '', titel);
        } else if (typ === 'riskfaktor') {
          const id = row.getAttribute('data-id');
          const namn = row.getAttribute('data-namn');
          fetchKunderForRow('riskfaktor', id || null, namn || undefined, titel);
        } else if (typ === 'omsattning') {
          fetchKunderForRow('omsattning', null, row.getAttribute('data-namn'), titel);
        } else if (typ === 'anstallda') {
          fetchKunderForRow('anstallda', null, row.getAttribute('data-namn'), titel);
        } else if (typ === 'utsatt-omrade') {
          fetchKunderForRow('utsatt-omrade', null, row.getAttribute('data-namn'), titel);
        } else if (typ === 'bolagsform') {
          fetchKunderForRow('bolagsform', null, row.getAttribute('data-namn'), titel);
        } else if (typ === 'riskniva') {
          fetchKunderForRow('riskniva', null, row.getAttribute('data-namn'), titel);
        } else if (typ === 'pep-sanktion') {
          fetchKunderForRow('pep-sanktion', null, null, titel);
        } else if (typ === 'alla') {
          fetchKunderForRow('alla', null, null, titel);
        }
      };
      row.addEventListener('click', row._statistikClick);
    });
  }

  function showError(msg) {
    const wrap = document.getElementById('statistik-riskbedomning-content');
    if (wrap) {
      const err = document.getElementById('statistik-fel');
      if (err) {
        err.textContent = msg;
        err.style.display = 'block';
      }
    }
  }

  function hideError() {
    const err = document.getElementById('statistik-fel');
    if (err) err.style.display = 'none';
  }

  async function init() {
    const wrap = document.getElementById('statistik-riskbedomning-content');
    if (!wrap) return;

    hideError();
    const loading = document.getElementById('statistik-loading');
    if (loading) loading.style.display = 'block';

    try {
      const data = await fetchStatistik();
      if (loading) loading.style.display = 'none';
      if (data) renderStatistik(data);
      else showError('Du måste vara inloggad för att se statistik.');
    } catch (e) {
      if (loading) loading.style.display = 'none';
      showError(e.message || 'Kunde inte ladda statistik.');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
