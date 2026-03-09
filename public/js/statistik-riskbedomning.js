/**
 * Statistik för riskbedömning – hämtar och visar statistik för inloggad byrå
 */
(function () {
  const baseUrl = window.apiConfig?.baseUrl || 'http://localhost:3001';

  function getAuthOpts() {
    return (window.AuthManager && AuthManager.getAuthFetchOptions && AuthManager.getAuthFetchOptions()) || { credentials: 'include', headers: { 'Content-Type': 'application/json' } };
  }

  async function fetchStatistik() {
    const res = await fetch(baseUrl + '/api/statistik-riskbedomning', getAuthOpts());
    if (res.status === 401) return null;
    if (!res.ok) throw new Error('Kunde inte hämta statistik');
    return res.json();
  }

  function renderStatistik(data) {
    const wrap = document.getElementById('statistik-riskbedomning-content');
    if (!wrap) return;

    const n = data.antalKunder || 0;
    const r = data.riskniva || {};
    const tj = data.tjänster || [];
    const hr = data.högriskbransch || [];

    document.getElementById('stat-antal-kunder').textContent = n;
    document.getElementById('stat-lag').textContent = r['Låg'] || 0;
    document.getElementById('stat-medel').textContent = r['Medel'] || 0;
    document.getElementById('stat-hog').textContent = r['Hög'] || 0;
    document.getElementById('stat-ovrigt').textContent = r['Övrigt'] || 0;
    const pepEl = document.getElementById('stat-pep-sanktion');
    if (pepEl) pepEl.textContent = typeof data.antalPepEllerSanktion === 'number' ? data.antalPepEllerSanktion : '–';

    const tjansterList = document.getElementById('statistik-tjanster-lista');
    if (tjansterList) {
      if (tj.length === 0) {
        tjansterList.innerHTML = '<p class="stat-list-empty">Inga tjänster valda hos kunderna.</p>';
      } else {
        tjansterList.innerHTML = tj.map(t => `
          <div class="stat-list-row stat-list-row-clickable" data-typ="tjanst" data-namn="${escapeAttr(t.namn)}" data-titel="${escapeAttr(t.namn)}" title="Klicka för att se kunder">
            <span class="stat-list-namn">${escapeHtml(t.namn)}</span>
            <span class="stat-list-antal">${t.antal} kunder</span>
          </div>
        `).join('');
      }
    }

    const hrList = document.getElementById('statistik-hogriskbransch-lista');
    if (hrList) {
      if (hr.length === 0) {
        hrList.innerHTML = '<p class="stat-list-empty">Inga kunder med högriskbransch registrerad.</p>';
      } else {
        hrList.innerHTML = hr.map(h => `
          <div class="stat-list-row stat-list-row-clickable" data-typ="hogriskbransch" data-namn="${escapeAttr(h.namn)}" data-titel="${escapeAttr(h.namn)}" title="Klicka för att se kunder">
            <span class="stat-list-namn">${escapeHtml(h.namn)}</span>
            <span class="stat-list-antal">${h.antal} kunder</span>
          </div>
        `).join('');
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
            <div class="riskfaktor-kort-antal stat-list-row-clickable" data-typ="riskfaktor" data-namn="${escapeAttr(kort.typ)}" data-titel="${escapeAttr(kort.typ)}" title="Klicka för att se kunder">${kort.antalKunder} kunder har denna typ</div>
            <div class="stat-list">
              ${(kort.riskfaktorer || []).map(r => `
                <div class="stat-list-row stat-list-row-clickable" data-typ="riskfaktor" data-id="${escapeAttr(r.id)}" data-titel="${escapeAttr(r.namn)}" title="Klicka för att se kunder">
                  <span class="stat-list-namn">${escapeHtml(r.namn)}</span>
                  <span class="stat-list-antal">${r.antal} kunder</span>
                </div>
              `).join('')}
            </div>
          </div>
        `).join('');
      }
    }

    bindStatistikRowClicks();
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

  function showKunderModal(titel, kunder, loading, error) {
    const overlay = document.getElementById('statistik-kunder-modal-overlay');
    const titleEl = document.getElementById('statistik-kunder-modal-title');
    const listEl = document.getElementById('statistik-kunder-lista');
    const loadingEl = document.getElementById('statistik-kunder-modal-loading');
    const emptyEl = document.getElementById('statistik-kunder-modal-empty');
    const errorEl = document.getElementById('statistik-kunder-modal-error');
    if (!overlay) return;
    titleEl.textContent = titel || 'Kunder';
    loadingEl.style.display = loading ? 'block' : 'none';
    emptyEl.style.display = 'none';
    errorEl.style.display = 'none';
    listEl.innerHTML = '';
    if (error) {
      errorEl.textContent = error;
      errorEl.style.display = 'block';
      overlay.style.display = 'flex';
      overlay.setAttribute('aria-hidden', 'false');
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
    overlay.style.display = 'flex';
    overlay.setAttribute('aria-hidden', 'false');
  }

  function closeKunderModal() {
    const overlay = document.getElementById('statistik-kunder-modal-overlay');
    if (overlay) {
      overlay.style.display = 'none';
      overlay.setAttribute('aria-hidden', 'true');
    }
  }

  async function fetchKunderForRow(typ, paramId, paramNamn, titel) {
    const params = new URLSearchParams({ typ });
    if (paramId) params.set('id', paramId);
    if (paramNamn !== undefined && paramNamn !== '') params.set('namn', paramNamn);
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

  function bindStatistikRowClicks() {
    const closeBtn = document.getElementById('statistik-kunder-modal-close');
    const overlay = document.getElementById('statistik-kunder-modal-overlay');
    if (closeBtn && !closeBtn._bound) {
      closeBtn._bound = true;
      closeBtn.addEventListener('click', closeKunderModal);
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
      };
      card.addEventListener('click', card._statistikCardClick);
    });
    document.querySelectorAll('.stat-list-row-clickable').forEach(row => {
      row.removeEventListener('click', row._statistikClick);
      row._statistikClick = function () {
        const typ = row.getAttribute('data-typ');
        const titel = row.getAttribute('data-titel') || 'Kunder';
        if (typ === 'tjanst') {
          fetchKunderForRow('tjanst', null, row.getAttribute('data-namn'), titel);
        } else if (typ === 'hogriskbransch') {
          fetchKunderForRow('hogriskbransch', null, row.getAttribute('data-namn'), titel);
        } else if (typ === 'riskfaktor') {
          const id = row.getAttribute('data-id');
          const namn = row.getAttribute('data-namn');
          fetchKunderForRow('riskfaktor', id || null, namn || undefined, titel);
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
