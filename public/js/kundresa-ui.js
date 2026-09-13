/**
 * Kundresa-UI (Lager C fas 2) — tunn sexstegs koordinator på kundkortet.
 * Pekar in i befintliga flikar; VH-gate visas tydligt.
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

  function render(container, summary, opts) {
    if (!container) return;
    const onStep = typeof opts?.onStep === 'function' ? opts.onStep : null;
    const onVh = typeof opts?.onVhSave === 'function' ? opts.onVhSave : null;
    const s = summary || {};
    const steps = Array.isArray(s.steps) ? s.steps : [];
    const gate = s.vhGate || {};
    const byraVal = gate.source === 'byra' ? (gate.value || '') : (s.byraVhBekraftelse || gate.value || '');

    container.innerHTML = `
      <section class="kundresa-shell" aria-label="Kundresa onboarding">
        <div class="kundresa-shell-head">
          <div>
            <h3 class="kundresa-shell-title">Kundresa</h3>
            <p class="kundresa-shell-lead">Onboarding enligt 3 kap PTL — ${esc(s.progressLabel || '')}. BankID-signering kommer senare.</p>
          </div>
        </div>
        ${gate.blocked ? `<div class="kundresa-gate-banner" role="alert">
          <strong>VH-gate aktiv.</strong> ${esc(gate.message || 'Bekräfta verklig huvudman innan ni går vidare.')}
        </div>` : ''}
        <ol class="kundresa-steps">
          ${steps.map((step) => `
            <li class="kundresa-step ${statusClass(step.status)}${step.comingSoonBankId ? ' is-soon' : ''}" data-kundresa-step="${esc(String(step.id))}" data-tab="${esc(step.tab || '')}">
              <button type="button" class="kundresa-step-btn" data-kundresa-goto="${esc(step.tab || '')}" ${step.gated ? 'disabled' : ''} title="${esc(step.gated ? 'Blockerad tills VH är bekräftad' : step.linkLabel || step.title)}">
                <span class="kundresa-step-icon" aria-hidden="true"><i class="fas ${esc(step.icon || 'fa-circle')}"></i></span>
                <span class="kundresa-step-body">
                  <span class="kundresa-step-meta">${esc(String(step.id))} · ${esc(step.label || '')}${step.comingSoonBankId ? ' · BankID snart' : ''}</span>
                  <span class="kundresa-step-title">${esc(step.title)}</span>
                  <span class="kundresa-step-desc">${esc(step.desc)}</span>
                </span>
              </button>
            </li>`).join('')}
        </ol>
        ${gate.relevant !== false ? `<div class="kundresa-vh-box">
          <h4>Byråns VH-bekräftelse</h4>
          <p class="kundresa-hint">Aktiv bekräftelse mot register — Osäker/Nej blockerar steg 3–6 tills utredningen är klar.</p>
          <div class="kundresa-vh-row">
            <label>Stämmer VH?
              <select class="form-control" data-kundresa-vh>
                <option value="">—</option>
                <option value="Ja"${byraVal === 'Ja' ? ' selected' : ''}>Ja</option>
                <option value="Osaker"${byraVal === 'Osaker' ? ' selected' : ''}>Osäker</option>
                <option value="Nej"${byraVal === 'Nej' ? ' selected' : ''}>Nej</option>
              </select>
            </label>
            <label class="kundresa-vh-note">Anteckning
              <input type="text" class="form-control" data-kundresa-vh-note placeholder="Valfritt — t.ex. utredningsstatus" value="${esc(s.byraVhNote || '')}">
            </label>
            <button type="button" class="btn btn-secondary btn-sm" data-kundresa-vh-save><i class="fas fa-save"></i> Spara VH</button>
          </div>
        </div>` : `<p class="kundresa-hint">VH är inte aktuell för enskild firma / fysisk person.</p>`}
      </section>
    `;

    container.querySelectorAll('[data-kundresa-goto]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        const tab = btn.getAttribute('data-kundresa-goto');
        if (onStep) onStep(tab, btn);
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
