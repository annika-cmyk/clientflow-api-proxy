/**
 * Kundresa-UI (Lager C fas 2) — stegs koordinator på kundkortet.
 * VH-steget utelämnas för enskild firma / fysisk person.
 * När VH visas: byråns bekräftelse mot register (inte samma sak som kundformulär-steget).
 */
(function (global) {
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function statusClass(status) {
    if (status === 'done') return 'is-done';
    if (status === 'next') return 'is-next';
    if (status === 'attention') return 'is-attention';
    if (status === 'gated') return 'is-gated';
    if (status === 'soon') return 'is-soon';
    return 'is-pending';
  }

  function alignmentClass(status) {
    if (status === 'match') return 'is-match';
    if (status === 'mismatch') return 'is-mismatch';
    if (status === 'pending' || status === 'byra_only' || status === 'kund_only') return 'is-pending';
    return 'is-na';
  }

  function labelVh(v) {
    if (v === 'Osaker') return 'Osäker';
    return v || '—';
  }

  function alignTitle(status) {
    if (status === 'match') return 'Överens';
    if (status === 'mismatch') return 'Avvikelse';
    if (status === 'byra_only') return 'Byrån klar';
    if (status === 'kund_only') return 'Väntar byrå';
    if (status === 'pending') return 'Att göra';
    return 'Status';
  }

  function renderRegisterList(register) {
    const list = Array.isArray(register) ? register.filter((p) => p && p.namn) : [];
    if (!list.length) {
      return `<p class="kundresa-vh-empty">Ingen VH i formuläret ännu. Hämta från Bolagsverket i steg 1.</p>`;
    }
    return `<ul class="kundresa-vh-register">
      ${list.map((p) => `<li>
        <strong>${esc(p.namn)}</strong>
        ${p.personnr ? `<span class="kundresa-vh-meta">${esc(p.personnr)}</span>` : ''}
        ${p.hemvist ? `<span class="kundresa-vh-meta">${esc(p.hemvist)}</span>` : ''}
      </li>`).join('')}
    </ul>`;
  }

  function render(container, summary, opts) {
    if (!container) return;
    const onStep = typeof opts?.onStep === 'function' ? opts.onStep : null;
    const onVh = typeof opts?.onVhSave === 'function' ? opts.onVhSave : null;
    const s = summary || {};
    const steps = Array.isArray(s.steps) ? s.steps : [];
    const gate = s.vhGate || {};
    const align = s.vhAlignment || {};
    const register = s.vhRegister || align.register || [];
    // Endast byråns sparade värde — aldrig kundens svar i dropdownen.
    const byraVal = s.byraVhBekraftelse || (gate.source === 'byra' ? gate.value : '') || '';
    const showNote = byraVal === 'Osaker' || byraVal === 'Nej' || !!(s.byraVhNote || '').trim();
    const activeStepId = s.nextStepId || (steps.find((st) => st.status === 'attention') || {}).id || null;
    const showAlign = align.relevant !== false && align.status && align.status !== 'n/a'
      && (align.status !== 'pending' || !byraVal);

    container.innerHTML = `
      <section class="kundresa-shell" aria-label="Kundresa onboarding">
        <div class="kundresa-shell-head">
          <div>
            <h3 class="kundresa-shell-title">Kundresa</h3>
            <p class="kundresa-shell-lead">${esc(s.progressLabel || '')} · 3 kap PTL</p>
          </div>
        </div>
        ${gate.blocked ? `<div class="kundresa-gate-banner" role="alert">
          <strong>VH blockerar.</strong> ${esc(gate.message || 'Bekräfta verklig huvudman innan ni går vidare.')}
        </div>` : ''}
        <ol class="kundresa-steps">
          ${steps.map((step) => {
            const isFocus = Number(step.id) === Number(activeStepId);
            const showDesc = isFocus || step.status === 'next' || step.status === 'attention';
            const displayNum = step.number != null ? step.number : step.id;
            return `
            <li class="kundresa-step ${statusClass(step.status)}${step.comingSoonBankId ? ' is-soon' : ''}${isFocus ? ' is-active-panel' : ''}"
                data-kundresa-step="${esc(String(step.id))}">
              <button type="button" class="kundresa-step-btn"
                data-kundresa-goto="${esc(step.tab || '')}"
                data-kundresa-focus="${esc(step.focus || '')}"
                data-kundresa-step-id="${esc(String(step.id))}"
                ${step.gated ? 'disabled' : ''}
                title="${esc(step.gated ? 'Blockerad tills VH är bekräftad' : step.linkLabel || step.title)}">
                <span class="kundresa-step-icon" aria-hidden="true"><i class="fas ${esc(step.icon || 'fa-circle')}"></i></span>
                <span class="kundresa-step-body">
                  <span class="kundresa-step-meta">${esc(String(displayNum))} · ${esc(step.label || '')}</span>
                  <span class="kundresa-step-title">${esc(step.title)}</span>
                  ${showDesc ? `<span class="kundresa-step-desc">${esc(step.desc || '')}</span>` : ''}
                </span>
              </button>
            </li>`;
          }).join('')}
        </ol>

        ${gate.relevant !== false ? `<div class="kundresa-vh-box" id="kundresa-vh-panel" data-kundresa-vh-panel>
          <div class="kundresa-vh-box-head">
            <h4>Steg 2 — Verklig huvudman</h4>
            <p class="kundresa-hint">Byråns kontroll mot registret. Kundens intygande sker i formuläret (steg 4) och ska stämma med samma lista.</p>
          </div>

          <div class="kundresa-vh-layout">
            <div class="kundresa-vh-block">
              <p class="kundresa-vh-label">Registrerad VH</p>
              ${renderRegisterList(register)}
            </div>

            <div class="kundresa-vh-form">
              ${showAlign ? `<div class="kundresa-vh-align ${alignmentClass(align.status)}" role="status">
                <strong>${esc(alignTitle(align.status))}</strong>
                <span>${esc(align.message || '')}</span>
                ${align.kund ? `<span class="kundresa-vh-align-meta">Kund: ${esc(labelVh(align.kund))}</span>` : ''}
              </div>` : ''}
              <label class="kundresa-vh-field">
                <span>Stämmer listan mot Bolagsverket?</span>
                <select class="form-control" data-kundresa-vh>
                  <option value="">— Välj —</option>
                  <option value="Ja"${byraVal === 'Ja' ? ' selected' : ''}>Ja</option>
                  <option value="Osaker"${byraVal === 'Osaker' ? ' selected' : ''}>Osäker</option>
                  <option value="Nej"${byraVal === 'Nej' ? ' selected' : ''}>Nej</option>
                </select>
              </label>
              <label class="kundresa-vh-field kundresa-vh-note-field"${showNote ? '' : ' hidden'} data-kundresa-vh-note-wrap>
                <span>Anteckning${byraVal === 'Osaker' || byraVal === 'Nej' ? '' : ' (valfritt)'}</span>
                <input type="text" class="form-control" data-kundresa-vh-note
                  placeholder="Utredningsstatus, källa…"
                  value="${esc(s.byraVhNote || '')}">
              </label>
              <div class="kundresa-vh-actions">
                <button type="button" class="btn btn-primary btn-sm" data-kundresa-vh-save>
                  <i class="fas fa-save"></i> Spara
                </button>
              </div>
            </div>
          </div>
        </div>` : ''}
      </section>
    `;

    const noteWrap = container.querySelector('[data-kundresa-vh-note-wrap]');
    const vhSelect = container.querySelector('[data-kundresa-vh]');
    if (vhSelect && noteWrap) {
      vhSelect.addEventListener('change', () => {
        const v = vhSelect.value;
        const need = v === 'Osaker' || v === 'Nej' || !!(container.querySelector('[data-kundresa-vh-note]')?.value || '').trim();
        noteWrap.hidden = !need;
      });
    }

    container.querySelectorAll('[data-kundresa-goto]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        const tab = btn.getAttribute('data-kundresa-goto') || '';
        const focus = btn.getAttribute('data-kundresa-focus') || '';
        const stepId = Number(btn.getAttribute('data-kundresa-step-id') || 0);
        if (focus === 'vh' || stepId === 2) {
          const panel = container.querySelector('[data-kundresa-vh-panel]');
          if (panel && panel.scrollIntoView) {
            panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
          panel?.classList.add('is-flash');
          setTimeout(() => panel?.classList.remove('is-flash'), 900);
          if (onStep) onStep({ tab: '', focus: 'vh', stepId: 2 }, btn);
          return;
        }
        if (onStep) onStep({ tab, focus, stepId }, btn);
      });
    });

    const saveBtn = container.querySelector('[data-kundresa-vh-save]');
    if (saveBtn && onVh) {
      saveBtn.addEventListener('click', () => {
        const sel = container.querySelector('[data-kundresa-vh]');
        const note = container.querySelector('[data-kundresa-vh-note]');
        onVh({
          byraVhBekraftelse: sel ? sel.value : '',
          byraVhNote: note ? note.value : ''
        }, saveBtn);
      });
    }
  }

  global.KundresaUi = { render };
})(typeof window !== 'undefined' ? window : global);
