/**
 * Modal-wizard: ställ klargörandefrågor innan AI genererar AR-/rutintexter.
 */
(function (global) {
  'use strict';

  function getBaseUrl() {
    return (global.apiConfig && global.apiConfig.baseUrl) || '';
  }

  function getAuthOpts() {
    return (global.AuthManager && global.AuthManager.getAuthFetchOptions && global.AuthManager.getAuthFetchOptions())
      || { credentials: 'include', headers: { 'Content-Type': 'application/json' } };
  }

  function esc(s) {
    if (!s) return '';
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function removeModal() {
    var el = document.getElementById('ai-klargorande-modal');
    if (el) el.remove();
  }

  /**
   * @param {object} opts
   * @param {string} opts.context - ar_beskrivning | ar_vardering | ar_kartlaggning | rutin
   * @param {string} [opts.section] - kunder | distribution | geografi | verksamhet
   * @param {string} [opts.fieldKey] - rutinfält
   * @param {function} opts.onGenerate - async (clarifications) => { ok, text?, auditLogId?, error? }
   */
  function open(opts) {
    if (!opts || typeof opts.onGenerate !== 'function') return;
    removeModal();

    var modal = document.createElement('div');
    modal.id = 'ai-klargorande-modal';
    modal.className = 'modal-overlay ai-klargorande-modal is-open';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = [
      '<div class="modal-content ai-klargorande-content">',
      '  <div class="ai-klargorande-header">',
      '    <h3><i class="fas fa-comments"></i> <span id="ai-klargorande-title">Förbered AI-text</span></h3>',
      '    <button type="button" class="modal-close" id="ai-klargorande-close" aria-label="Stäng"><i class="fas fa-times"></i></button>',
      '  </div>',
      '  <p class="ai-klargorande-intro" id="ai-klargorande-intro">Laddar frågor...</p>',
      '  <div class="ai-klargorande-questions" id="ai-klargorande-questions"></div>',
      '  <div class="ai-klargorande-actions">',
      '    <button type="button" class="btn btn-ghost btn-sm" id="ai-klargorande-skip">Generera utan svar</button>',
      '    <button type="button" class="btn btn-primary" id="ai-klargorande-generate"><i class="fas fa-robot"></i> Generera utkast</button>',
      '  </div>',
      '  <p class="ai-klargorande-status" id="ai-klargorande-status" aria-live="polite"></p>',
      '</div>'
    ].join('\n');
    document.body.appendChild(modal);

    var titleEl = document.getElementById('ai-klargorande-title');
    var introEl = document.getElementById('ai-klargorande-intro');
    var questionsEl = document.getElementById('ai-klargorande-questions');
    var statusEl = document.getElementById('ai-klargorande-status');
    var generateBtn = document.getElementById('ai-klargorande-generate');
    var skipBtn = document.getElementById('ai-klargorande-skip');
    var questions = [];

    function close() {
      removeModal();
    }

    function collectClarifications() {
      return questions.map(function (q) {
        var input = document.getElementById('ai-klq-' + q.id);
        return {
          id: q.id,
          question: q.text,
          answer: input ? String(input.value || '').trim() : ''
        };
      }).filter(function (c) { return c.answer; });
    }

    async function runGenerate(skipQuestions) {
      statusEl.textContent = '';
      generateBtn.disabled = true;
      skipBtn.disabled = true;
      generateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Genererar...';
      if (typeof global.showAiThinking === 'function') global.showAiThinking();
      try {
        var clarifications = skipQuestions ? [] : collectClarifications();
        var result = await opts.onGenerate(clarifications);
        if (result && result.ok) {
          close();
        } else {
          statusEl.textContent = (result && result.error) || 'Kunde inte generera text.';
        }
      } catch (err) {
        statusEl.textContent = err.message || 'Kunde inte generera text.';
      } finally {
        if (typeof global.hideAiThinking === 'function') global.hideAiThinking();
        generateBtn.disabled = false;
        skipBtn.disabled = false;
        generateBtn.innerHTML = '<i class="fas fa-robot"></i> Generera utkast';
      }
    }

    document.getElementById('ai-klargorande-close').addEventListener('click', close);
    modal.addEventListener('click', function (e) {
      if (e.target === modal) close();
    });
    generateBtn.addEventListener('click', function () { runGenerate(false); });
    skipBtn.addEventListener('click', function () { runGenerate(true); });

    fetch(getBaseUrl() + '/api/ai-dokument-klargorande', {
      method: 'POST',
      ...getAuthOpts(),
      body: JSON.stringify({
        context: opts.context,
        section: opts.section || '',
        fieldKey: opts.fieldKey || ''
      })
    })
      .then(function (res) { return res.json().then(function (data) { return { res: res, data: data }; }); })
      .then(function (_ref) {
        var res = _ref.res;
        var data = _ref.data;
        if (!res.ok) throw new Error(data.error || 'Kunde inte hämta frågor');
        if (titleEl && data.title) titleEl.textContent = data.title;
        if (introEl) introEl.textContent = data.intro || '';
        questions = Array.isArray(data.questions) ? data.questions : [];
        if (!questions.length) {
          questionsEl.innerHTML = '<p class="ai-klargorande-empty">Inga frågor för detta avsnitt – klicka Generera utkast.</p>';
          return;
        }
        questionsEl.innerHTML = questions.map(function (q) {
          return [
            '<div class="ai-klargorande-q">',
            '  <label for="ai-klq-' + q.id + '">' + esc(q.text) + '</label>',
            q.hint ? '<p class="ai-klargorande-hint">' + esc(q.hint) + '</p>' : '',
            '  <textarea id="ai-klq-' + q.id + '" class="form-input form-textarea" rows="2" placeholder="Ditt svar (valfritt)"></textarea>',
            '</div>'
          ].join('');
        }).join('');
        var first = document.getElementById('ai-klq-' + questions[0].id);
        if (first) first.focus();
      })
      .catch(function (err) {
        introEl.textContent = err.message || 'Kunde inte ladda frågor.';
        questionsEl.innerHTML = '';
      });
  }

  global.AiKlargorandeWizard = { open: open };
})(typeof window !== 'undefined' ? window : global);
