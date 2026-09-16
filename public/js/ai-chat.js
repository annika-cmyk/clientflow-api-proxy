/**
 * ClientFlow AI – PTL-assistent
 * Öppnas via "Chatta med PTL-AI" i sidofältet (window.openAiChat()).
 */
(function () {
  /** Samma logik som config.js: aldrig gissa bara location.origin (fel port med Live Server etc.). */
  function getChatApiBaseUrl() {
    if (typeof window === 'undefined') return 'http://localhost:3001';
    if (window.apiConfig && window.apiConfig.baseUrl) return window.apiConfig.baseUrl.replace(/\/$/, '');
    const h = window.location.hostname;
    if (h === 'localhost' || h === '127.0.0.1') return 'http://localhost:3001';
    return (window.location.origin || 'http://localhost:3001').replace(/\/$/, '');
  }
  const annikaAvatarUrl = 'images/annika-avatar.webp';
  let panel = null;
  let messagesEl = null;
  let inputEl = null;
  let history = [];
  /** OpenAI thread-id för Assistants API (återanvänds mellan meddelanden). */
  let chatThreadId = null;
  const STORAGE_OPEN_KEY = 'aiChatOpen';
  const STORAGE_HISTORY_KEY = 'aiChatHistory';
  const STORAGE_THREAD_KEY = 'aiChatThreadId';

  function loadHistory() {
    try {
      const raw = sessionStorage.getItem(STORAGE_HISTORY_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .map(m => ({
          role: m.role,
          content: m.content,
          ...(m.debug && typeof m.debug === 'object' ? { debug: m.debug } : {})
        }))
        .slice(-60);
    } catch (_) {
      return [];
    }
  }

  function saveHistory() {
    try {
      const slim = history.slice(-60).map((m) => {
        if (!m || !m.debug) return { role: m.role, content: m.content };
        const d = m.debug;
        const trim = (s, n) => {
          const t = s == null ? '' : String(s);
          return t.length > n ? t.slice(0, n) + '…' : t;
        };
        return {
          role: m.role,
          content: m.content,
          debug: {
            model: d.model || null,
            temperature: d.temperature ?? null,
            hasFileSearch: !!d.hasFileSearch,
            instructions: trim(d.instructions, 8000),
            prompt: trim(d.prompt, 12000),
            conversationId: d.conversationId || null,
            status: d.status || null,
            rawResponse: trim(d.rawResponse, 8000),
            rawResponseJsonText: trim(d.rawResponseJsonText, 20000),
            error: d.error || null
          }
        };
      });
      sessionStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(slim));
    } catch (_) {}
  }

  function loadThreadId() {
    try {
      return sessionStorage.getItem(STORAGE_THREAD_KEY) || null;
    } catch (_) {
      return null;
    }
  }

  function saveThreadId(id) {
    try {
      if (id) sessionStorage.setItem(STORAGE_THREAD_KEY, id);
      else sessionStorage.removeItem(STORAGE_THREAD_KEY);
    } catch (_) {}
  }

  function renderHistory() {
    if (!messagesEl) return;
    messagesEl.innerHTML = '';
    for (const m of history) {
      appendMessage(m.role, m.content, m.debug || null);
    }
  }

  function getAuthOpts() {
    return (window.AuthManager && AuthManager.getAuthFetchOptions && AuthManager.getAuthFetchOptions()) || { credentials: 'include', headers: { 'Content-Type': 'application/json' } };
  }

  function createPanel() {
    if (document.getElementById('ai-chat-panel')) return;
    const div = document.createElement('div');
    div.id = 'ai-chat-panel';
    div.className = 'ai-chat-panel ai-chat-panel--closed';
    div.innerHTML = `
      <div class="ai-chat-panel__header">
        <div class="ai-chat-panel__header-annika">
          <img src="${annikaAvatarUrl}" alt="ClientFlow AI" class="ai-chat-avatar ai-chat-avatar--header" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
          <span class="ai-chat-avatar-fallback" style="display:none;">CF</span>
          <div class="ai-chat-panel__header-titles">
            <h3>ClientFlow AI</h3>
            <span class="ai-chat-panel__header-subtitle">Chatta med vår PTL-assistent</span>
          </div>
        </div>
        <button type="button" class="ai-chat-panel__close" aria-label="Stäng" onclick="window.closeAiChat()">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <p class="ai-chat-panel__intro">Ställ frågor om ClientFlow, riskbedömningar, KYC och AML (PTL). På kundkort får AI med kundens underlag. Under varje AI-svar kan du öppna exakt prompt och råsvar.</p>
      <div class="ai-chat-panel__messages" id="ai-chat-messages"></div>
      <div class="ai-chat-panel__input-wrap">
        <textarea id="ai-chat-input" class="ai-chat-panel__input" rows="2" placeholder="Skriv till ClientFlow AI..." maxlength="2000"></textarea>
        <button type="button" class="ai-chat-panel__send" id="ai-chat-send" aria-label="Skicka">
          <i class="fas fa-paper-plane"></i>
        </button>
      </div>
    `;
    document.body.appendChild(div);
    panel = div;
    messagesEl = document.getElementById('ai-chat-messages');
    inputEl = document.getElementById('ai-chat-input');
    const sendBtn = document.getElementById('ai-chat-send');

    sendBtn.addEventListener('click', sendMessage);
    inputEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    history = loadHistory();
    chatThreadId = loadThreadId();
    if (history.length === 0) {
      chatThreadId = null;
      saveThreadId(null);
    }
    renderHistory();
  }

  function escapeHtmlRaw(text) {
    const p = document.createElement('p');
    p.textContent = text == null ? '' : String(text);
    return p.innerHTML;
  }

  function escapeHtml(text) {
    return escapeHtmlRaw(text).replace(/\n/g, '<br>');
  }

  function buildDebugHtml(debug) {
    if (!debug || typeof debug !== 'object') return '';
    const metaParts = [];
    if (debug.model) metaParts.push('Modell: ' + debug.model);
    if (debug.temperature != null && debug.temperature !== '') metaParts.push('Temp: ' + debug.temperature);
    if (debug.hasFileSearch) metaParts.push('file_search: ja');
    if (debug.status) metaParts.push('Status: ' + debug.status);
    if (debug.conversationId) metaParts.push('Conversation: ' + debug.conversationId);
    const meta = metaParts.length
      ? '<div class="ai-chat-msg__debug-meta">' + escapeHtmlRaw(metaParts.join(' · ')) + '</div>'
      : '';
    const section = (title, body) => {
      const t = body == null ? '' : String(body);
      if (!t.trim()) return '';
      return '<div class="ai-chat-msg__debug-section"><div class="ai-chat-msg__debug-heading">'
        + escapeHtmlRaw(title) + '</div><pre class="ai-chat-msg__debug-pre">'
        + escapeHtmlRaw(t) + '</pre></div>';
    };
    const err = debug.error
      ? '<div class="ai-chat-msg__debug-error">' + escapeHtmlRaw(debug.error) + '</div>'
      : '';
    return '<details class="ai-chat-msg__debug">'
      + '<summary>Visa prompt / råsvar</summary>'
      + '<div class="ai-chat-msg__debug-body">'
      + meta
      + err
      + section('Instructions (system)', debug.instructions)
      + section('Prompt (input)', debug.prompt)
      + section('Råsvar (extraherad text)', debug.rawResponse)
      + section('Råsvar (JSON)', debug.rawResponseJsonText)
      + '</div></details>';
  }

  function appendMessage(role, content, debug) {
    if (!messagesEl) return;
    const div = document.createElement('div');
    div.className = 'ai-chat-msg ai-chat-msg--' + role;
    const isAnnika = role === 'assistant';
    const avatarHtml = isAnnika
      ? '<img src="' + annikaAvatarUrl + '" alt="ClientFlow AI" class="ai-chat-msg__avatar" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\';"><span class="ai-chat-avatar-fallback ai-chat-msg__avatar-fallback" style="display:none;">CF</span>'
      : '';
    const label = isAnnika ? 'ClientFlow AI' : 'Du';
    const debugHtml = isAnnika ? buildDebugHtml(debug) : '';
    div.innerHTML = '<div class="ai-chat-msg__inner">' + avatarHtml + '<div class="ai-chat-msg__body"><span class="ai-chat-msg__label">' + label + '</span><div class="ai-chat-msg__text">' + escapeHtml(content) + '</div>' + debugHtml + '</div></div>';
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function setLoading(on) {
    const sendBtn = document.getElementById('ai-chat-send');
    if (!sendBtn) return;
    if (on) {
      sendBtn.disabled = true;
      sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
      if (typeof window.showAiThinking === 'function') window.showAiThinking();
    } else {
      if (typeof window.hideAiThinking === 'function') window.hideAiThinking();
      sendBtn.disabled = false;
      sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
    }
  }

  function getCurrentCustomerIdForChat() {
    try {
      if (window.customerCardManager && window.customerCardManager.customerId) {
        return String(window.customerCardManager.customerId).trim();
      }
      const params = new URLSearchParams(window.location.search || '');
      const fromQuery = params.get('id') || params.get('customerId') || params.get('kundId');
      if (fromQuery && /^rec[A-Za-z0-9]{10,}$/.test(fromQuery)) return fromQuery;
      if (/kundkort/i.test(window.location.pathname || '')) {
        const m = String(window.location.href || '').match(/rec[A-Za-z0-9]{10,}/);
        if (m) return m[0];
      }
    } catch (_) {}
    return null;
  }

  async function sendMessage() {
    if (!inputEl || !messagesEl) return;
    const text = inputEl.value.trim();
    if (!text) return;
    if (!(window.AuthManager && AuthManager.getCurrentUser && AuthManager.getCurrentUser())) {
      appendMessage('assistant', 'Du måste logga in för att chatta. Logga in och försök igen.');
      return;
    }

    inputEl.value = '';
    appendMessage('user', text);
    history.push({ role: 'user', content: text });
    saveHistory();
    setLoading(true);

    try {
      const apiBase = getChatApiBaseUrl();
      const url = apiBase + '/api/ai-chat';
      const customerId = getCurrentCustomerIdForChat();
      const res = await fetch(url, {
        method: 'POST',
        ...getAuthOpts(),
        body: JSON.stringify({
          message: text,
          history: history.slice(0, -1).map((m) => ({ role: m.role, content: m.content })),
          threadId: chatThreadId || undefined,
          ...(customerId ? { customerId } : {})
        })
      });
      const raw = await res.text();
      let data = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch (_) {
        const preview = raw.length > 120 ? raw.slice(0, 120) + '…' : raw;
        data = { error: 'Servern svarade inte med JSON (status ' + res.status + '). Kontrollera att API kör på ' + (apiBase || 'servern') + '. Svar: ' + (preview || '(tomt)') };
      }
      const debug = (data && data.debug && typeof data.debug === 'object') ? data.debug : null;
      if (!res.ok) {
        const msg = (data && (data.error || data.message)) ? (data.error || data.message) : ('HTTP ' + res.status);
        appendMessage('assistant', 'Kunde inte få svar: ' + msg, debug);
        history.push({ role: 'assistant', content: 'Kunde inte få svar: ' + msg, ...(debug ? { debug } : {}) });
        saveHistory();
        return;
      }
      const reply = (data && data.reply) ? data.reply : 'Inget svar.';
      if (data && data.threadId) {
        chatThreadId = data.threadId;
        saveThreadId(chatThreadId);
      }
      appendMessage('assistant', reply, debug);
      history.push({ role: 'assistant', content: reply, ...(debug ? { debug } : {}) });
      saveHistory();
      if (debug && window.AiPromptDebug && typeof window.AiPromptDebug.show === 'function') {
        window.AiPromptDebug.show(debug, { label: 'Chatta med AI', route: '/api/ai-chat' });
      }
    } catch (err) {
      const msg = err.message || 'Något gick fel';
      appendMessage('assistant', 'Kunde inte få svar: ' + msg);
      if (typeof console !== 'undefined' && console.error) console.error('Annika-chat fel:', err);
    } finally {
      setLoading(false);
    }
  }

  function openPanel() {
    createPanel();
    if (!panel) return;
    panel.classList.remove('ai-chat-panel--closed');
    panel.classList.add('ai-chat-panel--open');
    try {
      sessionStorage.setItem(STORAGE_OPEN_KEY, '1');
    } catch (_) {}
    if (inputEl) {
      inputEl.focus();
    }
  }

  function closePanel() {
    if (panel) {
      panel.classList.remove('ai-chat-panel--open');
      panel.classList.add('ai-chat-panel--closed');
    }
    try {
      sessionStorage.setItem(STORAGE_OPEN_KEY, '0');
    } catch (_) {}
  }

  window.openAiChat = openPanel;
  window.closeAiChat = closePanel;

  createPanel();
  if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(STORAGE_OPEN_KEY) === '1') {
    openPanel();
  }
})();
