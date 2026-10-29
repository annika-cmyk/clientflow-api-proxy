/**
 * Kundresa-UI — popup «Din resa» (analyskorts-design) med INBÄDDAT steg-innehåll.
 * Stegytan (#kundresa-step-host) fylls av CustomerCardManager via reparent av befintliga kort.
 * Steg 1: Förslag 1 · Företag & personer (#kundresa-step-host: statuschecklista + vita sektionskort).
 * övriga steg behåller Förslag 2 · Lugnare-chrome. Spar-API oförändrat.
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
    if (step.status === 'attention' || step.attention) classes.push('is-attention');
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

  function formatVhRegisterEntry(p) {
    const namn = String(p?.namn || '').trim();
    if (!namn) return '';
    const pn = String(p?.personnr || '').trim();
    return pn ? `${namn} (${pn})` : namn;
  }

  function renderRegisterList(register) {
    const list = Array.isArray(register) ? register.filter((p) => p && p.namn) : [];
    if (!list.length) {
      return `<p class="kundresa-vh-empty">Ingen VH registrerad ännu. Lägg till verklig huvudman under Personer ovan.</p>`;
    }
    const names = list.map(formatVhRegisterEntry).filter(Boolean).join(', ');
    return `<p class="kundresa-vh-register-line">Registrerad VH: ${esc(names)}</p>`;
  }

  function isVhStep(step) {
    if (!step) return false;
    return step.focus === 'foretag_personer'
      || step.key === 'foretag_personer'
      || Number(step.id) === 1;
  }

  function isStep1(step) {
    return isVhStep(step);
  }

  function isStep2(step) {
    if (!step) return false;
    return step.focus === 'beskrivning_fragor'
      || step.key === 'beskrivning_fragor'
      || Number(step.id) === 2;
  }

  function isStep3(step) {
    if (!step) return false;
    return step.focus === 'redovisning_tjanster'
      || step.key === 'redovisning_tjanster'
      || Number(step.id) === 3;
  }

  function isStep4(step) {
    if (!step) return false;
    return step.focus === 'kyc_skicka'
      || step.key === 'kyc_skicka'
      || Number(step.id) === 4;
  }

  function syncVhSegments(container) {
    const sel = container.querySelector('[data-kundresa-vh]');
    if (!sel) return;
    const val = sel.value || '';
    container.querySelectorAll('[data-kundresa-vh-seg]').forEach((btn) => {
      const on = btn.getAttribute('data-kundresa-vh-seg') === val;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function renderStep1Checklist(sub) {
    const items = Array.isArray(sub?.items) ? sub.items : [];
    if (!items.length) return '';
    return `<nav class="kundresa-step1-checklist" aria-label="Checklistor för steg 1">
      ${items.map((it) => {
        const st = it.status === 'done' ? 'is-done' : (it.status === 'attention' ? 'is-attention' : 'is-pending');
        const icon = it.status === 'done'
          ? '<i class="fas fa-check-circle" aria-hidden="true"></i>'
          : '<i class="fas fa-exclamation-circle" aria-hidden="true"></i>';
        return `<a href="#kundresa-sec-${esc(it.anchor || it.key)}" class="kundresa-step1-check ${st}" data-kundresa-check="${esc(it.anchor || it.key)}">
          <span class="kundresa-step1-check-icon">${icon}</span>
          <span class="kundresa-step1-check-text">
            <span class="kundresa-step1-check-title">${esc(it.title)}</span>
            <span class="kundresa-step1-check-detail">${esc(it.detail || '')}</span>
          </span>
        </a>`;
      }).join('')}
    </nav>`;
  }

  function render(container, summary, opts) {
    if (!container) return;
    const onStep = typeof opts?.onStep === 'function' ? opts.onStep : null;
    const onVhSave = typeof opts?.onVhSave === 'function' ? opts.onVhSave : null;
    const onReady = typeof opts?.onReady === 'function' ? opts.onReady : null;
    const onClose = typeof opts?.onClose === 'function' ? opts.onClose : null;
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
    const step1Sub = s.step1Substatus || null;
    const step2Sub = s.step2Substatus || null;
    const step3Sub = s.step3Substatus || null;
    const showChecklist = isStep1(activeStep) && step1Sub && Array.isArray(step1Sub.items) && step1Sub.items.length;
    const remainingLabel = isStep1(activeStep)
      ? (step1Sub?.remainingLabel || '')
      : (isStep2(activeStep)
        ? (step2Sub?.remainingLabel || '')
        : (isStep3(activeStep) ? (step3Sub?.remainingLabel || '') : ''));
    const totalSteps = steps.length || Number(s.total) || 4;
    const isLastStep = isStep4(activeStep);
    const stepNum = activeStep
      ? (activeStep.number != null ? activeStep.number : activeStep.id)
      : '';
    const companyLabel = [s.customerName, s.customerOrgnr].filter(Boolean).join(' · ');
    const progress = progressMeta(s);
    const vhBadge = byraVal === 'Ja' || align.status === 'byra_only' || align.status === 'match'
      ? '<span class="kundresa-vh-badge is-done">Byrån klar</span>'
      : (byraVal === 'Osaker' || byraVal === 'Nej'
        ? `<span class="kundresa-vh-badge is-attention">${esc(labelVh(byraVal))}</span>`
        : '');
    const showSavedFlash = !!s.vhJustSaved;
    const savedHint = `<span class="kundresa-vh-saved-hint${showSavedFlash ? ' is-saved is-fade' : ''}" data-kundresa-vh-saved${showSavedFlash ? '' : ' hidden'}>Sparat</span>`;
    const isSteg1 = isStep1(activeStep);
    const layoutStepClass = isSteg1
      ? ' kundresa-popup-layout--steg1'
      : (isStep2(activeStep)
        ? ' kundresa-popup-layout--steg2'
        : (isStep3(activeStep)
          ? ' kundresa-popup-layout--steg3'
          : (isStep4(activeStep) ? ' kundresa-popup-layout--steg4' : '')));

    container.innerHTML = `
      <div class="kundresa-popup-layout tjanst-modal-layout kundresa-popup-layout--embed${layoutStepClass}">
        <nav class="tjanst-tabs kundresa-popup-tabs" role="tablist" aria-label="Din resa">
          <p class="tjanst-tabs-kicker">Din resa</p>
          <div class="tjanst-tabs-steps">
            ${steps.map((step) => {
              const displayNum = step.number != null ? step.number : step.id;
              const disabled = step.gated ? 'disabled' : '';
              const done = step.status === 'done' || step.done;
              const blob = done
                ? '<i class="fas fa-check" aria-hidden="true"></i>'
                : esc(String(displayNum));
              const calmTitle = `${displayNum}. ${step.title || ''}`;
              const calmStatus = step.label
                || (done ? 'Klart' : (Number(step.id) === Number(activeStepId) ? 'Pågår' : ''));
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
                <span class="tjanst-tab-dot kundresa-tab-blob" data-resa-blob="${esc(String(step.id))}" aria-hidden="true">${blob}</span>
                <span class="tjanst-tab-label kundresa-tab-label">
                  <span class="kundresa-tab-title">${esc(calmTitle)}</span>
                  <span class="kundresa-tab-status">${esc(calmStatus)}</span>
                </span>
              </button>`;
            }).join('')}
          </div>
        </nav>
        <div class="tjanst-modal-body kundresa-popup-body kundresa-popup-body--embed">
          ${gate.blocked ? `<div class="kundresa-gate-banner" role="alert">
            <strong>VH blockerar.</strong> ${esc(gate.message || 'Bekräfta verklig huvudman innan ni går vidare.')}
          </div>` : ''}

          ${activeStep ? `<header class="kundresa-popup-stepinfo kundresa-popup-stepinfo--compact${(isStep2(activeStep) || isStep3(activeStep)) ? ' kundresa-popup-stepinfo--row' : ''}${isSteg1 ? ' kundresa-popup-stepinfo--steg1' : ''}">
            <p class="kundresa-popup-stepmeta">Steg ${esc(String(stepNum))} av ${esc(String(totalSteps))}</p>
            <h4 class="kundresa-popup-steptitle">${esc(activeStep.title)}</h4>
            ${(isStep2(activeStep) || isStep3(activeStep)) ? `<span class="kundresa-step2-autosave is-saved" data-kundresa-autosave><i class="fas fa-check" aria-hidden="true"></i> Sparas automatiskt</span>` : ''}
            ${companyLabel ? `<p class="kundresa-popup-company">${esc(companyLabel)}</p>` : ''}
            <p class="kundresa-popup-stepdesc">${esc(activeStep.desc || '')}</p>
          </header>` : ''}

          <div class="kundresa-popup-scroll" data-kundresa-scroll>
            ${showChecklist ? renderStep1Checklist(step1Sub) : ''}

            <div id="kundresa-step-host" class="kundresa-step-host" data-kundresa-step-host
              data-active-focus="${esc(activeStep?.focus || '')}"
              data-active-key="${esc(activeStep?.key || '')}"
              data-active-step-id="${esc(String(activeStep?.id || ''))}">
              <div class="kundresa-step-loading lead-empty">
                <i class="fas fa-spinner fa-spin"></i> Laddar steg…
              </div>
            </div>

            ${gate.relevant !== false ? `<div class="kundresa-vh-box"${showVhPanel ? '' : ' hidden'} id="kundresa-vh-panel" data-kundresa-vh-panel data-kundresa-sec="vh">
              <div class="kundresa-vh-box-head">
                <div class="kundresa-vh-box-lead">
                  <div class="kundresa-sec-icon" aria-hidden="true"><i class="fas fa-shield-alt"></i></div>
                  <div class="kundresa-vh-box-titles">
                    <h4>Verifiera verklig huvudman</h4>
                    <p class="kundresa-hint">Jämför personerna med rollen VH ovan mot Bolagsverkets register</p>
                  </div>
                </div>
                ${vhBadge}
              </div>
              ${showAlign ? `<div class="kundresa-vh-align kundresa-vh-status-banner ${alignmentClass(align.status)}" role="status">
                <strong>${esc(alignTitle(align.status))}</strong>
                <span>${esc(align.message || '')}</span>
                ${align.kund ? `<span class="kundresa-vh-align-meta">Kund: ${esc(labelVh(align.kund))}</span>` : ''}
              </div>` : ''}
              <div class="kundresa-vh-layout">
                <div class="kundresa-vh-form">
                  <div class="kundresa-vh-q">
                    <p class="kundresa-vh-label">Stämmer listan mot Bolagsverket?</p>
                    ${renderRegisterList(register)}
                  </div>
                  <div class="kundresa-vh-segment-row">
                    <div class="kundresa-vh-segments" role="group" aria-label="VH-bekräftelse">
                      <button type="button" class="kundresa-vh-seg${byraVal === 'Ja' ? ' is-active' : ''}"
                        data-kundresa-vh-seg="Ja" aria-pressed="${byraVal === 'Ja' ? 'true' : 'false'}">Ja</button>
                      <button type="button" class="kundresa-vh-seg${byraVal === 'Osaker' ? ' is-active' : ''}"
                        data-kundresa-vh-seg="Osaker" aria-pressed="${byraVal === 'Osaker' ? 'true' : 'false'}">Osäker</button>
                      <button type="button" class="kundresa-vh-seg${byraVal === 'Nej' ? ' is-active' : ''}"
                        data-kundresa-vh-seg="Nej" aria-pressed="${byraVal === 'Nej' ? 'true' : 'false'}">Nej</button>
                    </div>
                    <select class="form-control kundresa-vh-select-hidden" data-kundresa-vh hidden aria-hidden="true" tabindex="-1">
                      <option value="">— Välj —</option>
                      <option value="Ja"${byraVal === 'Ja' ? ' selected' : ''}>Ja</option>
                      <option value="Osaker"${byraVal === 'Osaker' ? ' selected' : ''}>Osäker</option>
                      <option value="Nej"${byraVal === 'Nej' ? ' selected' : ''}>Nej</option>
                    </select>
                    ${savedHint}
                  </div>
                  <label class="kundresa-vh-field kundresa-vh-note-field"${showNote ? '' : ' hidden'} data-kundresa-vh-note-wrap>
                    <span>Anteckning${byraVal === 'Osaker' || byraVal === 'Nej' ? '' : ' (valfritt)'}</span>
                    <input type="text" class="form-control" data-kundresa-vh-note
                      placeholder="Utredningsstatus, källa…"
                      value="${esc(s.byraVhNote || '')}">
                  </label>
                </div>
              </div>
              <p class="kundresa-vh-kyc-note">Kundens eget intygande om verklig huvudman samlas in i KYC-formuläret (steg 4).</p>
            </div>` : ''}
          </div>

          ${activeStep && !activeStep.gated ? `<div class="kundresa-step-nav">
            <button type="button" class="btn btn-ghost btn-sm" data-kundresa-prev
              ${Number(activeStep.number) <= 1 ? 'disabled' : ''}
              data-kundresa-step-id="${esc(String(activeStep.id))}">
              <i class="fas fa-arrow-left"></i> Föregående
            </button>
            ${isLastStep
              ? ''
              : (remainingLabel ? `<span class="kundresa-step-remaining" role="status">
              <i class="fas fa-exclamation-circle" aria-hidden="true"></i>
              ${esc(remainingLabel)}
            </span>` : `<span class="kundresa-step-remaining is-ok" role="status">${esc(
              progress.complete ? 'Alla steg klara' : ''
            )}</span>`)}
            ${isLastStep
              ? `<button type="button" class="btn btn-ghost btn-sm" data-kundresa-klar>
                    Stäng
                  </button>`
              : `<button type="button" class="btn btn-primary btn-sm" data-kundresa-next
                  ${!steps.some((st) => Number(st.number) === Number(activeStep.number) + 1) ? 'disabled' : ''}
                  data-kundresa-step-id="${esc(String(activeStep.id))}">
                  Nästa steg <i class="fas fa-arrow-right"></i>
                </button>`}

          </div>` : ''}
        </div>
      </div>
    `;

    const noteWrap = container.querySelector('[data-kundresa-vh-note-wrap]');
    const vhSelect = container.querySelector('[data-kundresa-vh]');
    const savedEl = container.querySelector('[data-kundresa-vh-saved]');

    if (vhSelect && noteWrap) {
      vhSelect.addEventListener('change', () => {
        const v = vhSelect.value;
        const need = v === 'Osaker' || v === 'Nej' || !!(container.querySelector('[data-kundresa-vh-note]')?.value || '').trim();
        noteWrap.hidden = !need;
        syncVhSegments(container);
      });
    }

    function markVhSaved() {
      if (!savedEl) return;
      savedEl.hidden = false;
      savedEl.classList.remove('is-fade');
      savedEl.classList.add('is-saved');
      savedEl.textContent = 'Sparat';
      window.clearTimeout(markVhSaved._t);
      markVhSaved._t = window.setTimeout(() => {
        if (!savedEl.isConnected) return;
        savedEl.classList.add('is-fade');
        window.setTimeout(() => {
          if (!savedEl.isConnected) return;
          savedEl.hidden = true;
          savedEl.classList.remove('is-saved', 'is-fade');
        }, 400);
      }, 2000);
    }

    function emitVhSave() {
      if (!onVhSave) return;
      const sel = container.querySelector('[data-kundresa-vh]');
      const note = container.querySelector('[data-kundresa-vh-note]');
      onVhSave({
        byraVhBekraftelse: sel ? sel.value : '',
        byraVhNote: note ? note.value : ''
      }, savedEl);
      markVhSaved();
    }

    if (showSavedFlash) {
      markVhSaved();
    }

    container.querySelectorAll('[data-kundresa-vh-seg]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sel = container.querySelector('[data-kundresa-vh]');
        if (!sel) return;
        const val = btn.getAttribute('data-kundresa-vh-seg') || '';
        sel.value = val;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        // Ja / Osäker / Nej sparas direkt (ingen separat Spara-knapp)
        emitVhSave();
      });
    });
    syncVhSegments(container);

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

    container.querySelectorAll('[data-kundresa-check]').forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const key = a.getAttribute('data-kundresa-check') || '';
        const target = container.querySelector(`[data-kundresa-sec="${key}"]`)
          || document.querySelector(`[data-kundresa-sec="${key}"]`);
        if (target && target.scrollIntoView) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });

    const prevBtn = container.querySelector('[data-kundresa-prev]');
    const nextBtn = container.querySelector('[data-kundresa-next]');
    const klarBtn = container.querySelector('[data-kundresa-klar]');
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
    if (klarBtn && onClose) {
      klarBtn.addEventListener('click', () => onClose());
    }

    if (onReady) {
      onReady({
        host: container.querySelector('#kundresa-step-host'),
        activeStep,
        activeStepId: activeStep ? activeStep.id : null
      });
    }
  }

  global.KundresaUi = { render, renderProgressIcon, progressMeta, isStep2, isStep3, isStep4 };
})(typeof window !== 'undefined' ? window : global);
