/**
 * Kundresa-UI — popup «Din resa» (analyskorts-design) med INBÄDDAT steg-innehåll.
 * Stegytan (#kundresa-step-host) fylls av CustomerCardManager via reparent av befintliga kort.
 */
(function (global) {
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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

  function tabStateClass(step, activeStepId) {
    const classes = [];
    if (Number(step.id) === Number(activeStepId)) classes.push('is-active');
    if (step.status === 'done' || step.done) classes.push('is-done');
    if (step.status === 'attention') classes.push('is-attention');
    if (step.status === 'gated' || step.gated) classes.push('is-gated');
    if (step.status === 'next') classes.push('is-next');
    return classes.join(' ');
  }

  function progressMeta(summary) {
    const s = summary || {};
    const total = Number(s.total) || (Array.isArray(s.steps) ? s.steps.length : 0);
    const done = Number(s.completed) || 0;
    const complete = total > 0 && done >= total;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    let stateClass = 'is-empty';
    if (complete || pct >= 100) stateClass = 'is-complete';
    else if (done > 0) stateClass = 'is-partial';
    return { done, total, complete, pct, stateClass };
  }

  function renderProgressIcon(summary) {
    const p = progressMeta(summary);
    const label = p.complete
      ? 'Alla steg i kunduppläggningen är klara'
      : (p.done > 0
        ? `${p.done} av ${p.total} steg klara`
        : 'Inget steg klart ännu');
    const style = p.stateClass === 'is-partial' ? ` style="--progress:${p.pct}"` : '';
    return `<span class="tjanst-mall-progress ${p.stateClass}" role="img" aria-label="${esc(label)}"${style}></span>`;
  }

  function renderRegisterList(register) {
    const list = Array.isArray(register) ? register.filter((p) => p && p.namn) : [];
    if (!list.length) {
      return `<p class="kundresa-vh-empty">Ingen VH i formuläret ännu. Lägg till verklig huvudman under Roller nedan.</p>`;
    }
    return `<ul class="kundresa-vh-register">
      ${list.map((p) => `<li>
        <strong>${esc(p.namn)}</strong>
        ${p.personnr ? `<span class="kundresa-vh-meta">${esc(p.personnr)}</span>` : ''}
        ${p.hemvist ? `<span class="kundresa-vh-meta">${esc(p.hemvist)}</span>` : ''}
      </li>`).join('')}
    </ul>`;
  }

  function isVhStep(step) {
    if (!step) return false;
    return step.focus === 'foretag_personer'
      || step.key === 'foretag_personer'
      || Number(step.id) === 1;
  }

  function render(container, summary, opts) {
    if (!container) return;
    const onStep = typeof opts?.onStep === 'function' ? opts.onStep : null;
    const onVhSave = typeof opts?.onVhSave === 'function' ? opts.onVhSave : null;
    const onReady = typeof opts?.onReady === 'function' ? opts.onReady : null;
    const s = summary || {};
    const steps = Array.isArray(s.steps) ? s.steps : [];
    const gate = s.vhGate || {};
    const align = s.vhAlignment || {};
    const register = s.vhRegister || align.register || [];
    const byraVal = s.byraVhBekraftelse || (gate.source === 'byra' ? gate.value : '') || '';
    const showNote = byraVal === 'Osaker' || byraVal === 'Nej' || !!(s.byraVhNote || '').trim();
    const activeStepId = s.activeStepId != null
      ? s.activeStepId
      : (s.nextStepId || (steps.find((st) => st.status === 'attention') || {}).id || null);
    const activeStep = steps.find((st) => Number(st.id) === Number(activeStepId))
      || steps.find((st) => st.status === 'next')
      || steps[0]
      || null;
    const showAlign = align.relevant !== false && align.status && align.status !== 'n/a'
      && (align.status !== 'pending' || !byraVal);
    const showVhPanel = gate.relevant !== false
      && (isVhStep(activeStep) || gate.blocked || Number(activeStepId) === 1);

    container.innerHTML = `
      <div class="kundresa-popup-layout tjanst-modal-layout kundresa-popup-layout--embed">
        <nav class="tjanst-tabs kundresa-popup-tabs" role="tablist" aria-label="Kunduppläggning">
          <p class="tjanst-tabs-kicker">Din resa</p>
          <div class="tjanst-tabs-steps">
            ${steps.map((step) => {
              const displayNum = step.number != null ? step.number : step.id;
              const disabled = step.gated ? 'disabled' : '';
              return `
              <button type="button" class="tjanst-tab ${tabStateClass(step, activeStepId)}"
                role="tab"
                aria-selected="${Number(step.id) === Number(activeStepId) ? 'true' : 'false'}"
                data-kundresa-goto="${esc(step.tab || '')}"
                data-kundresa-focus="${esc(step.focus || '')}"
                data-kundresa-step-id="${esc(String(step.id))}"
                data-kundresa-key="${esc(step.key || '')}"
                ${disabled}
                title="${esc(step.gated ? 'Blockerad tills VH är bekräftad' : step.title)}">
                <span class="tjanst-tab-dot" data-resa-blob="${esc(String(step.id))}" aria-hidden="true"></span>
                <span class="tjanst-tab-label">
                  <span class="kundresa-tab-num">${esc(String(displayNum))}.</span>
                  ${esc(step.title)}
                  <span class="kundresa-tab-status">${esc(step.label || '')}</span>
                </span>
              </button>`;
            }).join('')}
          </div>
        </nav>
        <div class="tjanst-modal-body kundresa-popup-body kundresa-popup-body--embed">
          ${gate.blocked ? `<div class="kundresa-gate-banner" role="alert">
            <strong>VH blockerar.</strong> ${esc(gate.message || 'Bekräfta verklig huvudman innan ni går vidare.')}
          </div>` : ''}

          ${activeStep ? `<header class="kundresa-popup-stepinfo kundresa-popup-stepinfo--compact">
            <p class="kundresa-popup-stepmeta">${esc(String(activeStep.number != null ? activeStep.number : activeStep.id))} · ${esc(activeStep.label || '')}</p>
            <h4 class="kundresa-popup-steptitle">${esc(activeStep.title)}</h4>
            <p class="kundresa-popup-stepdesc">${esc(activeStep.desc || '')}</p>
          </header>` : ''}

          ${gate.relevant !== false ? `<div class="kundresa-vh-box"${showVhPanel ? '' : ' hidden'} id="kundresa-vh-panel" data-kundresa-vh-panel>
            <div class="kundresa-vh-box-head">
              <h4>Verifiera verklig huvudman</h4>
              <p class="kundresa-hint">Gäller aktiebolag. Lägg till VH med e-post och telefon under Roller, screena, och bekräfta listan här.</p>
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

          <div id="kundresa-step-host" class="kundresa-step-host" data-kundresa-step-host
            data-active-focus="${esc(activeStep?.focus || '')}"
            data-active-key="${esc(activeStep?.key || '')}"
            data-active-step-id="${esc(String(activeStep?.id || ''))}">
            <div class="kundresa-step-loading lead-empty">
              <i class="fas fa-spinner fa-spin"></i> Laddar steg…
            </div>
          </div>

          ${activeStep && !activeStep.gated ? `<div class="kundresa-step-nav">
            <button type="button" class="btn btn-ghost btn-sm" data-kundresa-prev
              ${Number(activeStep.number) <= 1 ? 'disabled' : ''}
              data-kundresa-step-id="${esc(String(activeStep.id))}">
              <i class="fas fa-arrow-left"></i> Föregående
            </button>
            <button type="button" class="btn btn-primary btn-sm" data-kundresa-next
              ${!steps.some((st) => Number(st.number) === Number(activeStep.number) + 1) ? 'disabled' : ''}
              data-kundresa-step-id="${esc(String(activeStep.id))}">
              Nästa steg <i class="fas fa-arrow-right"></i>
            </button>
          </div>` : ''}
        </div>
      </div>
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

    function emitStep(stepLike) {
      if (!stepLike || stepLike.gated) return;
      if (onStep) {
        onStep({
          tab: stepLike.tab || '',
          focus: stepLike.focus || '',
          stepId: stepLike.id != null ? Number(stepLike.id) : Number(stepLike.stepId || 0),
          key: stepLike.key || '',
          closeAfter: false,
          embed: true
        });
      }
    }

    container.querySelectorAll('.tjanst-tab[data-kundresa-step-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        emitStep({
          tab: btn.getAttribute('data-kundresa-goto') || '',
          focus: btn.getAttribute('data-kundresa-focus') || '',
          id: Number(btn.getAttribute('data-kundresa-step-id') || 0),
          key: btn.getAttribute('data-kundresa-key') || ''
        });
      });
    });

    const prevBtn = container.querySelector('[data-kundresa-prev]');
    const nextBtn = container.querySelector('[data-kundresa-next]');
    if (prevBtn && activeStep) {
      prevBtn.addEventListener('click', () => {
        const prev = steps.find((st) => Number(st.number) === Number(activeStep.number) - 1);
        if (prev && !prev.gated) emitStep(prev);
      });
    }
    if (nextBtn && activeStep) {
      nextBtn.addEventListener('click', () => {
        const next = steps.find((st) => Number(st.number) === Number(activeStep.number) + 1);
        if (next && !next.gated) emitStep(next);
      });
    }

    const saveBtn = container.querySelector('[data-kundresa-vh-save]');
    if (saveBtn && onVhSave) {
      saveBtn.addEventListener('click', () => {
        const sel = container.querySelector('[data-kundresa-vh]');
        const note = container.querySelector('[data-kundresa-vh-note]');
        onVhSave({
          byraVhBekraftelse: sel ? sel.value : '',
          byraVhNote: note ? note.value : ''
        }, saveBtn);
      });
    }

    if (onReady) {
      onReady({
        host: container.querySelector('#kundresa-step-host'),
        activeStep,
        activeStepId: activeStep ? activeStep.id : null
      });
    }
  }

  global.KundresaUi = { render, renderProgressIcon, progressMeta };
})(typeof window !== 'undefined' ? window : global);
