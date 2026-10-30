/**
 * Popup «Riskbedömning & beslut» — samma skal som kundresa-ui (sidomeny + steg + footer).
 * Stegstatus från RiskBeslut.computeStepStatuses. Stegytan fylls av CustomerCardManager.
 */
(function (global) {
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function rb() {
    return global.RiskBeslut || null;
  }

  function defaultSteps() {
    var api = rb();
    return (api && api.STEPS) ? api.STEPS.map(function (s) {
      return Object.assign({}, s, {
        state: s.id === 1 ? 'current' : 'pending',
        status: s.id === 1 ? 'current' : 'pending',
        label: '–',
        locked: s.id === 4,
        gated: s.id === 4,
        number: s.id,
        remaining: []
      });
    }) : [];
  }

  function tabStateClass(step, activeStepId) {
    var classes = [];
    if (Number(step.id) === Number(activeStepId)) classes.push('is-active');
    if (step.state === 'done' || step.status === 'done' || step.done) classes.push('is-done');
    if (step.state === 'attention' || step.status === 'attention' || step.attention) classes.push('is-attention');
    if (step.state === 'locked' || step.locked || step.gated) classes.push('is-gated');
    if (step.state === 'current' || step.state === 'pending') {
      if (Number(step.id) === Number(activeStepId)) classes.push('is-next');
    }
    return classes.join(' ');
  }

  function progressMeta(steps) {
    var total = Array.isArray(steps) ? steps.length : 0;
    var done = (steps || []).filter(function (s) {
      return s.state === 'done' || s.status === 'done';
    }).length;
    var complete = total > 0 && done >= total;
    var pct = total > 0 ? Math.round((done / total) * 100) : 0;
    var stateClass = 'is-empty';
    if (complete || pct >= 100) stateClass = 'is-complete';
    else if (done > 0) stateClass = 'is-partial';
    return { done: done, total: total, complete: complete, pct: pct, stateClass: stateClass };
  }

  function buildSummary(opts) {
    opts = opts || {};
    var api = rb();
    var fields = opts.fields || {};
    var computed = api && typeof api.computeStepStatuses === 'function'
      ? api.computeStepStatuses({
        fields: fields,
        isReviewer: !!opts.isReviewer,
        avtalStatusLabel: opts.avtalStatusLabel || ''
      })
      : { steps: defaultSteps(), remainingFooter: '', canOpenAvtal: false, decision: { status: 'Utkast' } };

    var steps = (computed.steps || defaultSteps()).map(function (s) {
      return Object.assign({}, s, {
        number: s.number != null ? s.number : s.id,
        status: s.state || s.status || 'pending',
        gated: !!(s.locked || s.gated),
        done: (s.state || s.status) === 'done'
      });
    });

    var activeStepId = opts.activeStepId != null
      ? Number(opts.activeStepId)
      : (function () {
        var attn = steps.find(function (s) { return s.state === 'attention' || s.state === 'current'; });
        return attn ? attn.id : 1;
      })();

    if (!steps.some(function (s) { return Number(s.id) === Number(activeStepId); })) {
      activeStepId = steps[0] ? steps[0].id : 1;
    }

    var activeStep = steps.find(function (s) { return Number(s.id) === Number(activeStepId); }) || steps[0];
    var remainingLabel = '';
    if (activeStep && Array.isArray(activeStep.remaining) && activeStep.remaining.length) {
      remainingLabel = 'Kvar: ' + activeStep.remaining.join(', ');
    } else if (computed.remainingFooter) {
      remainingLabel = computed.remainingFooter;
    }

    return {
      steps: steps,
      activeStepId: activeStepId,
      activeStep: activeStep,
      customerName: opts.customerName || '',
      customerOrgnr: opts.customerOrgnr || '',
      remainingLabel: remainingLabel,
      remainingFooter: computed.remainingFooter || '',
      decision: computed.decision || {},
      canOpenAvtal: !!computed.canOpenAvtal,
      kycWarning: !!opts.kycWarning,
      catalogDirty: !!computed.catalogDirty,
      reviewPending: computed.reviewPending || 0,
      step1Done: !!computed.step1Done,
      step2Done: !!computed.step2Done,
      lockedAfterSend: !!computed.lockedAfterSend,
      byranHar: computed.byranHar || null
    };
  }

  function render(container, summary, opts) {
    if (!container) return null;
    opts = opts || {};
    var s = summary || buildSummary(opts);
    var steps = s.steps || [];
    var activeStep = s.activeStep || steps.find(function (st) {
      return Number(st.id) === Number(s.activeStepId);
    }) || steps[0];
    var activeStepId = activeStep ? activeStep.id : 1;
    var totalSteps = steps.length || 4;
    var stepNum = activeStep ? (activeStep.number != null ? activeStep.number : activeStep.id) : '';
    var companyLabel = [s.customerName, s.customerOrgnr].filter(Boolean).join(' · ');
    var remainingLabel = s.remainingLabel || '';
    var isLast = activeStep && Number(activeStep.id) === 4;
    var layoutStepClass = activeStep
      ? (' kundresa-popup-layout--steg' + Number(activeStep.id))
      : '';
    var progress = progressMeta(steps);

    container.innerHTML =
      '<div class="kundresa-popup-layout tjanst-modal-layout kundresa-popup-layout--embed risk-avtal-popup-layout' + layoutStepClass + '" data-risk-avtal-shell>'
      + '<nav class="tjanst-tabs kundresa-popup-tabs" role="tablist" aria-label="Riskbedömning &amp; beslut">'
      + '<p class="tjanst-tabs-kicker">Riskbedömning</p>'
      + '<div class="tjanst-tabs-steps">'
      + steps.map(function (step) {
        var displayNum = step.number != null ? step.number : step.id;
        var disabled = step.gated || step.locked ? 'disabled' : '';
        var done = step.state === 'done' || step.status === 'done' || step.done;
        var blob = done
          ? '<i class="fas fa-check" aria-hidden="true"></i>'
          : esc(String(displayNum));
        var calmTitle = displayNum + '. ' + (step.title || '');
        var calmStatus = step.label
          || (done ? 'Klart' : (Number(step.id) === Number(activeStepId) ? 'Pågår' : ''));
        return '<button type="button" class="tjanst-tab ' + tabStateClass(step, activeStepId) + '"'
          + ' role="tab"'
          + ' aria-selected="' + (Number(step.id) === Number(activeStepId) ? 'true' : 'false') + '"'
          + ' data-risk-avtal-step="' + esc(String(step.id)) + '"'
          + ' data-risk-avtal-key="' + esc(step.key || '') + '"'
          + ' ' + disabled
          + ' title="' + esc(step.gated || step.locked ? 'Låst tills riskbedömningen är godkänd' : step.title) + '">'
          + '<span class="tjanst-tab-dot kundresa-tab-blob" aria-hidden="true">' + blob + '</span>'
          + '<span class="tjanst-tab-label kundresa-tab-label">'
          + '<span class="kundresa-tab-title">' + esc(calmTitle) + '</span>'
          + '<span class="kundresa-tab-status">' + esc(calmStatus) + '</span>'
          + '</span></button>';
      }).join('')
      + '</div></nav>'
      + '<div class="tjanst-modal-body kundresa-popup-body kundresa-popup-body--embed">'
      + (s.kycWarning
        ? '<div class="kundresa-gate-banner risk-avtal-kyc-warn" role="status">'
          + '<strong>KYC ej signerat.</strong> Bedömningen blir preliminär tills kunden svarat/signerat.'
          + '</div>'
        : '')
      + (activeStep ? '<header class="kundresa-popup-stepinfo kundresa-popup-stepinfo--compact">'
        + '<p class="kundresa-popup-stepmeta">Steg ' + esc(String(stepNum)) + ' av ' + esc(String(totalSteps)) + '</p>'
        + '<h4 class="kundresa-popup-steptitle">' + esc(activeStep.title || '') + '</h4>'
        + (companyLabel ? '<p class="kundresa-popup-company">' + esc(companyLabel) + '</p>' : '')
        + '<p class="kundresa-popup-stepdesc">' + esc(activeStep.desc || '') + '</p>'
        + '</header>' : '')
      + '<div class="kundresa-popup-scroll" data-risk-avtal-scroll>'
      + '<div id="risk-avtal-step-host" class="kundresa-step-host risk-avtal-step-host" data-risk-avtal-step-host'
      + ' data-active-key="' + esc(activeStep && activeStep.key || '') + '"'
      + ' data-active-step-id="' + esc(String(activeStep && activeStep.id || '')) + '">'
      + '<div class="kundresa-step-loading lead-empty">'
      + '<i class="fas fa-spinner fa-spin"></i> Laddar steg…'
      + '</div></div></div>'
      + (activeStep && !(activeStep.gated || activeStep.locked)
        ? '<div class="kundresa-step-nav risk-avtal-step-nav">'
          + '<button type="button" class="btn btn-ghost btn-sm" data-risk-avtal-prev'
          + (Number(stepNum) <= 1 ? ' disabled' : '') + '>'
          + '<i class="fas fa-arrow-left"></i> Föregående</button>'
          + (remainingLabel
            ? '<span class="kundresa-step-remaining" role="status">'
              + '<i class="fas fa-exclamation-circle" aria-hidden="true"></i> '
              + esc(remainingLabel) + '</span>'
            : '<span class="kundresa-step-remaining is-ok" role="status">'
              + esc(progress.complete ? 'Alla steg klara' : '') + '</span>')
          + (isLast
            ? '<button type="button" class="btn btn-ghost btn-sm" data-risk-avtal-close>Stäng</button>'
            : '<button type="button" class="btn btn-primary btn-sm" data-risk-avtal-next'
              + (!steps.some(function (st) { return Number(st.id) === Number(activeStep.id) + 1; }) ? ' disabled' : '')
              + '>Nästa steg <i class="fas fa-arrow-right"></i></button>')
          + '</div>'
        : (activeStep && (activeStep.gated || activeStep.locked)
          ? '<div class="kundresa-step-nav risk-avtal-step-nav">'
            + '<button type="button" class="btn btn-ghost btn-sm" data-risk-avtal-prev>'
            + '<i class="fas fa-arrow-left"></i> Föregående</button>'
            + '<span class="kundresa-step-remaining" role="status">'
            + '<i class="fas fa-lock" aria-hidden="true"></i> Låst tills godkänd</span>'
            + '<button type="button" class="btn btn-ghost btn-sm" data-risk-avtal-close>Stäng</button>'
            + '</div>'
          : ''))
      + '</div></div>';

    bind(container, opts, s);
    return {
      host: container.querySelector('#risk-avtal-step-host'),
      activeStep: activeStep,
      activeStepId: activeStepId,
      summary: s
    };
  }

  function bind(container, opts, summary) {
    opts = opts || {};
    var s = summary || {};
    var steps = s.steps || [];
    var onStep = typeof opts.onStep === 'function' ? opts.onStep : null;
    var onClose = typeof opts.onClose === 'function' ? opts.onClose : null;
    var onReady = typeof opts.onReady === 'function' ? opts.onReady : null;

    function emitStep(stepLike) {
      if (!stepLike || stepLike.gated || stepLike.locked) return;
      if (onStep) {
        onStep({
          stepId: stepLike.id != null ? Number(stepLike.id) : Number(stepLike.stepId || 0),
          key: stepLike.key || '',
          locked: !!(stepLike.locked || stepLike.gated)
        });
      }
    }

    container.querySelectorAll('[data-risk-avtal-step]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (btn.disabled) return;
        var id = Number(btn.getAttribute('data-risk-avtal-step') || 0);
        var step = steps.find(function (st) { return Number(st.id) === id; });
        if (step) emitStep(step);
      });
    });

    var prev = container.querySelector('[data-risk-avtal-prev]');
    var next = container.querySelector('[data-risk-avtal-next]');
    var closeBtn = container.querySelector('[data-risk-avtal-close]');
    var active = s.activeStep;
    if (prev && active) {
      prev.addEventListener('click', function () {
        var p = steps.find(function (st) { return Number(st.id) === Number(active.id) - 1; });
        if (p) emitStep(p);
      });
    }
    if (next && active) {
      next.addEventListener('click', function () {
        var n = steps.find(function (st) { return Number(st.id) === Number(active.id) + 1; });
        if (n && !(n.gated || n.locked)) emitStep(n);
      });
    }
    if (closeBtn && onClose) closeBtn.addEventListener('click', function () { onClose(); });

    if (onReady) {
      onReady({
        host: container.querySelector('#risk-avtal-step-host'),
        activeStep: active,
        activeStepId: active ? active.id : null,
        summary: s
      });
    }
  }

  function updateActiveStep(container, summary, opts) {
    if (!container) return null;
    var layout = container.querySelector('[data-risk-avtal-shell]');
    var host = container.querySelector('#risk-avtal-step-host');
    if (!layout || !host) {
      return render(container, summary, opts);
    }
    return render(container, summary, opts);
  }

  var api = {
    buildSummary: buildSummary,
    render: render,
    updateActiveStep: updateActiveStep,
    progressMeta: progressMeta,
    /** @deprecated stub API — prefer render() */
    renderShell: function (opts) {
      var wrap = document.createElement('div');
      render(wrap, buildSummary(opts), opts);
      return wrap.innerHTML;
    },
    bind: function () { /* handled by render */ },
    STEPS: defaultSteps()
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.RiskAvtalModal = api;
})(typeof window !== 'undefined' ? window : globalThis);
