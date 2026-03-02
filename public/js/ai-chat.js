/**
 * Annika Chat – fråga om systemet och riskbedömningar
 * Öppnas via "Chatta med Annika" i sidofältet (window.openAiChat()).
 */
(function () {
  const baseUrl = (typeof window !== 'undefined' && window.apiConfig?.baseUrl) || (typeof window !== 'undefined' && window.location.origin) || 'http://localhost:3001';
  const annikaAvatarUrl = 'images/annika-avatar.webp';
  let panel = null;
  let messagesEl = null;
  let inputEl = null;
  let history = [];

  function getToken() {
    return localStorage.getItem('authToken');
  }

  function createPanel() {
    if (document.getElementById('ai-chat-panel')) return;
    const div = document.createElement('div');
    div.id = 'ai-chat-panel';
    div.className = 'ai-chat-panel ai-chat-panel--closed';
    div.innerHTML = `
      <div class="ai-chat-panel__header">
        <div class="ai-chat-panel__header-annika">
          <img src="${annikaAvatarUrl}" alt="Annika AI" class="ai-chat-avatar ai-chat-avatar--header" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
          <span class="ai-chat-avatar-fallback" style="display:none;">A</span>
          <div class="ai-chat-panel__header-titles">
            <h3>Annika AI</h3>
            <span class="ai-chat-panel__header-subtitle">en mänskligare version av Annika</span>
          </div>
        </div>
        <button type="button" class="ai-chat-panel__close" aria-label="Stäng" onclick="window.closeAiChat()">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <p class="ai-chat-panel__intro">Ställ frågor till mig om ClientFlow, riskbedömningar, KYC eller hur du tänker kring kunder och tjänster.</p>
      <div class="ai-chat-panel__messages" id="ai-chat-messages"></div>
      <div class="ai-chat-panel__input-wrap">
        <textarea id="ai-chat-input" class="ai-chat-panel__input" rows="2" placeholder="Skriv till Annika AI..." maxlength="2000"></textarea>
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
  }

  function appendMessage(role, content) {
    if (!messagesEl) return;
    const div = document.createElement('div');
    div.className = 'ai-chat-msg ai-chat-msg--' + role;
    const isAnnika = role === 'assistant';
    const avatarHtml = isAnnika
      ? '<img src="' + annikaAvatarUrl + '" alt="Annika AI" class="ai-chat-msg__avatar" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\';"><span class="ai-chat-avatar-fallback ai-chat-msg__avatar-fallback" style="display:none;">A</span>'
      : '';
    const label = isAnnika ? 'Annika AI' : 'Du';
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
    const token = getToken();
    if (!token) {
      appendMessage('assistant', 'Du måste logga in för att chatta. Logga in och försök igen.');
      return;
    }

    inputEl.value = '';
    appendMessage('user', text);
    history.push({ role: 'user', content: text });
    setLoading(true);

    try {
      const url = (baseUrl.replace(/\/$/, '')) + '/api/ai-chat';
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ message: text, history: history.slice(0, -1) })
      });
      const raw = await res.text();
      let data = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch (_) {
        const preview = raw.length > 120 ? raw.slice(0, 120) + '…' : raw;
        data = { error: 'Servern svarade inte med JSON (status ' + res.status + '). Kontrollera att API kör på ' + (baseUrl || 'servern') + '. Svar: ' + (preview || '(tomt)') };
      }
      if (!res.ok) {
        const msg = (data && data.error) ? data.error : ('Status ' + res.status);
        throw new Error(msg);
      }
      const reply = (data && data.reply) ? data.reply : 'Inget svar.';
      appendMessage('assistant', reply);
      history.push({ role: 'assistant', content: reply });
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
      sessionStorage.setItem('aiChatOpen', '1');
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
      sessionStorage.setItem('aiChatOpen', '0');
    } catch (_) {}
  }

  window.openAiChat = openPanel;
  window.closeAiChat = closePanel;

  createPanel();
  if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('aiChatOpen') === '1') {
    openPanel();
  }
})();
