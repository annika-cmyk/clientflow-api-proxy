/**
 * Delad modal för kundlista + bransch-drilldown (Statistik för riskbedömning
 * och Vilka är våra kunder). Använder GET /api/statistik-riskbedomning/...
 */
(function (global) {
  const baseUrl = function () {
    return (global.apiConfig && global.apiConfig.baseUrl) || 'http://localhost:3001';
  };

  /** @type {{ mode: string, typ?: string, namn?: string, titel?: string, data?: object, parentData?: object } | null} */
  let modalNav = null;

  const MODAL_HTML =
    '<div id="statistik-kunder-modal-overlay" class="statistik-kunder-modal-overlay" style="display:none;" aria-hidden="true">' +
      '<div class="statistik-kunder-modal statistik-kunder-modal--wide" role="dialog" aria-labelledby="statistik-kunder-modal-title">' +
        '<div class="statistik-kunder-modal-header">' +
          '<button type="button" class="statistik-kunder-modal-back" id="statistik-kunder-modal-back" style="display:none;" aria-label="Tillbaka">← Tillbaka</button>' +
          '<h4 id="statistik-kunder-modal-title">Kunder</h4>' +
          '<button type="button" class="statistik-kunder-modal-close" id="statistik-kunder-modal-close" aria-label="Stäng">&times;</button>' +
        '</div>' +
        '<div class="statistik-kunder-modal-body">' +
          '<div class="statistik-kunder-modal-loading" id="statistik-kunder-modal-loading" style="display:none;">Laddar kunder...</div>' +
          '<div id="statistik-bransch-drilldown" class="statistik-bransch-drilldown" style="display:none;"></div>' +
          '<ul class="statistik-kunder-lista" id="statistik-kunder-lista"></ul>' +
          '<p class="statistik-kunder-modal-empty" id="statistik-kunder-modal-empty" style="display:none;">Inga kunder hittades.</p>' +
          '<p class="statistik-kunder-modal-error" id="statistik-kunder-modal-error" style="display:none;"></p>' +
        '</div>' +
      '</div>' +
    '</div>';

  function getAuthOpts() {
    return (global.AuthManager && AuthManager.getAuthFetchOptions && AuthManager.getAuthFetchOptions()) ||
      { credentials: 'include', headers: { 'Content-Type': 'application/json' } };
  }

  function escapeAttr(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML.replace(/"/g, '&quot;');
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  function foldKey(s) {
    return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function ensureModal() {
    if (document.getElementById('statistik-kunder-modal-overlay')) return;
    document.body.insertAdjacentHTML('beforeend', MODAL_HTML);
  }

  function modalEls() {
    ensureModal();
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
        listEl.innerHTML = kunder.map((k) => `
          <li><a href="kundkort.html?id=${encodeURIComponent(k.id)}">${escapeHtml(k.namn)}</a></li>
        `).join('');
      }
    }
    openOverlay();
  }

  function showKunderFromDrill(titel, kunder, nav) {
    showKunderModal(titel, kunder, false, null);
    setBackVisible(true);
    modalNav = Object.assign({ mode: 'kunder' }, nav || {});
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
      const res = await fetch(baseUrl() + '/api/statistik-riskbedomning/kunder?' + params.toString(), getAuthOpts());
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

  function resolveKundBranschNamn(namn) {
    const Aggregat = global.KundBranschAggregat;
    if (Aggregat && typeof Aggregat.mapToCommonKundBransch === 'function') {
      return Aggregat.mapToCommonKundBransch(namn) || namn;
    }
    return namn;
  }

  async function fetchBranschDrilldown(typ, namn, sniFilter, titel) {
    let bucket = namn;
    if (typ === 'kund-bransch') bucket = resolveKundBranschNamn(namn);
    const params = new URLSearchParams({ typ, namn: bucket });
    if (sniFilter) params.set('sni', sniFilter);
    const parentNav = modalNav && (modalNav.mode === 'drilldown' || modalNav.mode === 'under-kunder')
      ? { typ: modalNav.typ, namn: modalNav.namn, titel: modalNav.titel, data: modalNav.data || modalNav.parentData }
      : null;

    setBackVisible(Boolean(sniFilter));
    showKunderModal(titel || namn, null, true, null);
    try {
      const res = await fetch(baseUrl() + '/api/statistik-riskbedomning/bransch-drilldown?' + params.toString(), getAuthOpts());
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
          namn: bucket,
          titel: parentNav ? parentNav.titel : namn,
          parentData: parentNav ? parentNav.data : null,
          data: parentNav ? parentNav.data : data
        });
        return;
      }
      showDrilldownView(titel || namn, data, typ, bucket);
    } catch (e) {
      document.getElementById('statistik-kunder-modal-loading').style.display = 'none';
      showKunderModal(titel || namn, null, false, e.message || 'Nätverksfel');
    }
  }

  function bindChrome() {
    ensureModal();
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
  }

  function handleRowClick(row) {
    const typ = row.getAttribute('data-typ');
    const titel = row.getAttribute('data-titel') || row.getAttribute('data-namn') || 'Kunder';
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
  }

  function bindRowClicks(root) {
    bindChrome();
    const scope = root || document;
    scope.querySelectorAll('.stat-card-clickable').forEach((card) => {
      card.removeEventListener('click', card._statistikCardClick);
      card._statistikCardClick = function () {
        handleRowClick(card);
      };
      card.addEventListener('click', card._statistikCardClick);
    });
    scope.querySelectorAll('.stat-list-row-clickable').forEach((row) => {
      row.removeEventListener('click', row._statistikClick);
      row._statistikClick = function () {
        handleRowClick(row);
      };
      row.addEventListener('click', row._statistikClick);
    });
    bindStatChips(scope);
  }

  function bindStatChips(root) {
    bindChrome();
    const scope = root || document;
    scope.querySelectorAll('.statistik-stat-chip, .kundrisker-bransch-chip').forEach((el) => {
      if (el._statChipBound) return;
      el._statChipBound = true;
      el.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        handleRowClick(el);
      });
    });
  }

  function bindBranschTriggers(root) {
    bindStatChips(root);
  }

  function openBransch(typ, namn, titel) {
    fetchBranschDrilldown(typ, namn, '', titel || namn);
  }

  global.StatistikKunderModal = {
    ensureModal,
    bindRowClicks,
    bindStatChips,
    bindBranschTriggers,
    fetchKunderForRow,
    fetchBranschDrilldown,
    openBransch,
    close: closeKunderModal,
    resolveKundBranschNamn
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindChrome);
  } else {
    bindChrome();
  }
})(typeof window !== 'undefined' ? window : globalThis);
