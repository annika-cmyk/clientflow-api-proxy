/**
 * ClientFlow – AI-prompt/råsvar-blobb
 * Visar senaste AI-anropets instructions, prompt och råsvar.
 * Öppnas automatiskt efter riskfaktor-/tjänstanalys (och kan fyllas från chatten).
 */
(function () {
  const STORAGE_OPEN_KEY = 'aiPromptDebugOpen';
  const STORAGE_LARGE_KEY = 'aiPromptDebugLarge';
  const STORAGE_LAST_KEY = 'aiPromptDebugLast';

  let root = null;
  let bodyEl = null;
  let metaEl = null;
  let titleEl = null;
  let lastPayload = null;

  function escapeHtmlRaw(text) {
    const p = document.createElement('p');
    p.textContent = text == null ? '' : String(text);
    return p.innerHTML;
  }

  function loadLast() {
    try {
      const raw = sessionStorage.getItem(STORAGE_LAST_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function saveLast(payload) {
    try {
      if (!payload) {
        sessionStorage.removeItem(STORAGE_LAST_KEY);
        return;
      }
      const trim = (s, n) => {
        const t = s == null ? '' : String(s);
        return t.length > n ? t.slice(0, n) + '…' : t;
      };
      sessionStorage.setItem(STORAGE_LAST_KEY, JSON.stringify({
        ...payload,
        instructions: trim(payload.instructions, 12000),
        prompt: trim(payload.prompt, 20000),
        rawResponse: trim(payload.rawResponse, 12000),
        rawResponseJsonText: trim(payload.rawResponseJsonText, 40000)
      }));
    } catch (_) {}
  }

  function section(title, body) {
    const t = body == null ? '' : String(body);
    if (!t.trim()) return '';
    return '<div class="ai-prompt-debug__section"><div class="ai-prompt-debug__heading">'
      + escapeHtmlRaw(title) + '</div><pre class="ai-prompt-debug__pre">'
      + escapeHtmlRaw(t) + '</pre></div>';
  }

  function renderBody(payload) {
    if (!bodyEl || !metaEl || !titleEl) return;
    if (!payload || typeof payload !== 'object') {
      titleEl.textContent = 'AI-prompt';
      metaEl.textContent = 'Inget AI-anrop ännu. Generera en analys eller chatta — då visas prompt och råsvar här.';
      bodyEl.innerHTML = '';
      return;
    }
    const label = payload.label || payload.route || 'AI-anrop';
    titleEl.textContent = label;
    const metaParts = [];
    if (payload.model) metaParts.push('Modell: ' + payload.model);
    if (payload.temperature != null && payload.temperature !== '') metaParts.push('Temp: ' + payload.temperature);
    if (payload.hasFileSearch) metaParts.push('file_search: ja');
    if (payload.status) metaParts.push('Status: ' + payload.status);
    if (payload.conversationId) metaParts.push('Conversation: ' + payload.conversationId);
    if (payload.route) metaParts.push(payload.route);
    metaEl.textContent = metaParts.join(' · ') || 'Senaste AI-svar';
    const err = payload.error
      ? '<div class="ai-prompt-debug__error">' + escapeHtmlRaw(payload.error) + '</div>'
      : '';
    bodyEl.innerHTML = err
      + section('Instructions (system)', payload.instructions)
      + section('Prompt (input)', payload.prompt)
      + section('Råsvar (extraherad text)', payload.rawResponse)
      + section('Råsvar (JSON)', payload.rawResponseJsonText);
  }

  function ensure() {
    if (root) return root;
    const div = document.createElement('div');
    div.id = 'ai-prompt-debug';
    div.className = 'ai-prompt-debug ai-prompt-debug--closed';
    div.innerHTML = ''
      + '<button type="button" class="ai-prompt-debug__fab" id="ai-prompt-debug-fab" aria-label="Visa AI-prompt">'
      + '<i class="fas fa-code"></i><span class="ai-prompt-debug__fab-label">AI-prompt</span>'
      + '<span class="ai-prompt-debug__fab-dot" hidden></span>'
      + '</button>'
      + '<div class="ai-prompt-debug__panel" role="dialog" aria-label="AI-prompt och råsvar">'
      + '  <div class="ai-prompt-debug__header">'
      + '    <div class="ai-prompt-debug__titles">'
      + '      <h3 id="ai-prompt-debug-title">AI-prompt</h3>'
      + '      <p class="ai-prompt-debug__meta" id="ai-prompt-debug-meta"></p>'
      + '    </div>'
      + '    <div class="ai-prompt-debug__actions">'
      + '      <button type="button" class="ai-prompt-debug__btn" id="ai-prompt-debug-copy" title="Kopiera allt">Kopiera</button>'
      + '      <button type="button" class="ai-prompt-debug__btn" id="ai-prompt-debug-size" title="Förstora">Förstora</button>'
      + '      <button type="button" class="ai-prompt-debug__btn ai-prompt-debug__btn--close" id="ai-prompt-debug-close" aria-label="Stäng"><i class="fas fa-times"></i></button>'
      + '    </div>'
      + '  </div>'
      + '  <div class="ai-prompt-debug__body" id="ai-prompt-debug-body"></div>'
      + '</div>';
    document.body.appendChild(div);
    root = div;
    bodyEl = document.getElementById('ai-prompt-debug-body');
    metaEl = document.getElementById('ai-prompt-debug-meta');
    titleEl = document.getElementById('ai-prompt-debug-title');

    document.getElementById('ai-prompt-debug-fab').addEventListener('click', function () {
      openPanel();
    });
    document.getElementById('ai-prompt-debug-close').addEventListener('click', closePanel);
    document.getElementById('ai-prompt-debug-size').addEventListener('click', toggleLarge);
    document.getElementById('ai-prompt-debug-copy').addEventListener('click', copyAll);

    lastPayload = loadLast();
    renderBody(lastPayload);
    try {
      if (sessionStorage.getItem(STORAGE_LARGE_KEY) === '1') {
        root.classList.add('ai-prompt-debug--large');
        const sizeBtn = document.getElementById('ai-prompt-debug-size');
        if (sizeBtn) sizeBtn.textContent = 'Förminska';
      }
      if (sessionStorage.getItem(STORAGE_OPEN_KEY) === '1' && lastPayload) openPanel();
    } catch (_) {}
    return root;
  }

  function setDot(on) {
    const dot = root && root.querySelector('.ai-prompt-debug__fab-dot');
    if (dot) dot.hidden = !on;
  }

  function openPanel() {
    ensure();
    root.classList.remove('ai-prompt-debug--closed');
    root.classList.add('ai-prompt-debug--open');
    setDot(false);
    try { sessionStorage.setItem(STORAGE_OPEN_KEY, '1'); } catch (_) {}
  }

  function closePanel() {
    if (!root) return;
    root.classList.remove('ai-prompt-debug--open');
    root.classList.add('ai-prompt-debug--closed');
    try { sessionStorage.setItem(STORAGE_OPEN_KEY, '0'); } catch (_) {}
  }

  function toggleLarge() {
    ensure();
    const large = root.classList.toggle('ai-prompt-debug--large');
    const sizeBtn = document.getElementById('ai-prompt-debug-size');
    if (sizeBtn) sizeBtn.textContent = large ? 'Förminska' : 'Förstora';
    try { sessionStorage.setItem(STORAGE_LARGE_KEY, large ? '1' : '0'); } catch (_) {}
  }

  function copyAll() {
    if (!lastPayload) return;
    const parts = [
      lastPayload.label || lastPayload.route || 'AI-anrop',
      'Modell: ' + (lastPayload.model || ''),
      '',
      '--- Instructions ---',
      lastPayload.instructions || '',
      '',
      '--- Prompt ---',
      lastPayload.prompt || '',
      '',
      '--- Råsvar text ---',
      lastPayload.rawResponse || '',
      '',
      '--- Råsvar JSON ---',
      lastPayload.rawResponseJsonText || ''
    ];
    const text = parts.join('\n');
    const done = function () {
      const btn = document.getElementById('ai-prompt-debug-copy');
      if (!btn) return;
      const prev = btn.textContent;
      btn.textContent = 'Kopierat';
      setTimeout(function () { btn.textContent = prev; }, 1200);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function () {});
    }
  }

  function show(debug, extras) {
    ensure();
    if (!debug || typeof debug !== 'object') return;
    lastPayload = Object.assign({}, debug, extras && typeof extras === 'object' ? extras : {});
    saveLast(lastPayload);
    renderBody(lastPayload);
    setDot(true);
    openPanel();
  }

  window.AiPromptDebug = {
    show: show,
    open: openPanel,
    close: closePanel,
    getLast: function () { return lastPayload; }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensure);
  } else {
    ensure();
  }
})();
