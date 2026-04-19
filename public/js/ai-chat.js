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
        .slice(-60);
    } catch (_) {
      return [];
    }
  }

  function saveHistory() {
    try {
      sessionStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(history.slice(-60)));
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
      appendMessage(m.role, m.content);
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
      <p class="ai-chat-panel__intro">Ställ frågor om ClientFlow, riskbedömningar, KYC och AML (PTL).</p>
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

    // Återställ konversation vid sidbyte/refresh
    history = loadHistory();
    chatThreadId = loadThreadId();
    if (history.length === 0) {
      chatThreadId = null;
      saveThreadId(null);
    }
    renderHistory();
  }

  function appendMessage(role, content) {
    if (!messagesEl) return;
    const div = document.createElement('div');
    div.className = 'ai-chat-msg ai-chat-msg--' + role;
    const isAnnika = role === 'assistant';
    const avatarHtml = isAnnika
      ? '<img src="' + annikaAvatarUrl + '" alt="ClientFlow AI" class="ai-chat-msg__avatar" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\';"><span class="ai-chat-avatar-fallback ai-chat-msg__avatar-fallback" style="display:none;">CF</span>'
      : '';
    const label = isAnnika ? 'ClientFlow AI' : 'Du';
    div.innerHTML = '<div class="ai-chat-msg__inner">' + avatarHtml + '<div class="ai-chat-msg__body"><span class="ai-chat-msg__label">' + label + '</span><div class="ai-chat-msg__text">' + escapeHtml(content) + '</div></div></div>';
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

  function escapeHtml(text) {
    const p = document.createElement('p');
    p.textContent = text;
    return p.innerHTML.replace(/\n/g, '<br>');
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
      const res = await fetch(url, {
        method: 'POST',
        ...getAuthOpts(),
        body: JSON.stringify({
          message: text,
          history: history.slice(0, -1),
          threadId: chatThreadId || undefined
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
      if (!res.ok) {
        const msg = (data && (data.error || data.message)) ? (data.error || data.message) : ('HTTP ' + res.status);
        throw new Error(msg);
      }
      const reply = (data && data.reply) ? data.reply : 'Inget svar.';
      if (data && data.threadId) {
        chatThreadId = data.threadId;
        saveThreadId(chatThreadId);
      }
      appendMessage('assistant', reply);
      history.push({ role: 'assistant', content: reply });
      saveHistory();
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
