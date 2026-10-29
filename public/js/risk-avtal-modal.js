/**
 * Popup-skal «Riskbedömning & avtal» (steg 1–4 stubs).
 * Separat från kunduppläggningspopupen. Kundens uppgifter syns aldrig här som risk.
 */
(function (global) {
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  var STEPS = [
    {
      id: 1,
      key: 'riskfaktorer',
      title: 'Riskfaktorer',
      desc: 'Auto från Kundens uppgifter (KYC) + manuella. Källa visas per faktor. Automation lägger till men tar aldrig bort manuellt satta.'
    },
    {
      id: 2,
      key: 'bedomning',
      title: 'Bedömning',
      desc: 'Beräknad → bedömd residual, motivering, DD-nivå och nästa uppföljning. Byråns interna bedömning.'
    },
    {
      id: 3,
      key: 'beslut',
      title: 'Beslut',
      desc: 'CFA godkänner. Hög kräver beslut; Oacceptabel → avslag/avveckling. Inget avtal före godkännande.'
    },
    {
      id: 4,
      key: 'avtal',
      title: 'Uppdragsavtal',
      desc: 'Genereras från valda tjänster, BankID. Kräver godkänd riskbedömning.'
    }
  ];

  function renderShell(opts) {
    opts = opts || {};
    var active = Number(opts.activeStep || 1);
    var customerName = esc(opts.customerName || '');
    var bridgeNote = opts.bridgeToTab
      ? '<p class="risk-avtal-bridge-note">Stegen byggs ut här. Just nu öppnas befintlig <strong>Riskbedömning</strong>-flik för arbetet — samma kedja: Kundens uppgifter → byråns bedömning → beslut → avtal.</p>'
      : '';
    var nav = STEPS.map(function (s) {
      var st = s.id < active ? 'done' : (s.id === active ? 'current' : 'pending');
      return '<button type="button" class="risk-avtal-nav-item is-' + st + '" data-risk-avtal-step="' + s.id + '">'
        + '<span class="risk-avtal-nav-num">' + s.id + '</span>'
        + '<span class="risk-avtal-nav-label">' + esc(s.title) + '</span>'
        + '</button>';
    }).join('');
    var panels = STEPS.map(function (s) {
      var hidden = s.id !== active ? ' hidden' : '';
      return '<section class="risk-avtal-panel" data-risk-avtal-panel="' + s.id + '"' + hidden + '>'
        + '<h4 class="risk-avtal-panel-title">' + esc(s.title) + '</h4>'
        + '<p class="risk-avtal-panel-desc">' + esc(s.desc) + '</p>'
        + '<div class="risk-avtal-panel-body" data-risk-avtal-body="' + s.id + '">'
        + '<p class="risk-avtal-stub">Steg ' + s.id + ' — underlag. Använd «Öppna riskflik» för att arbeta i befintlig riskbedömning under tiden.</p>'
        + '</div>'
        + '</section>';
    }).join('');

    return '<div class="risk-avtal-shell" data-risk-avtal-shell>'
      + '<aside class="risk-avtal-nav" aria-label="Steg">' + nav + '</aside>'
      + '<div class="risk-avtal-main">'
      + '<p class="risk-avtal-kicker">Riskbedömning &amp; avtal · intern · kunden ser aldrig detta</p>'
      + (customerName ? '<p class="risk-avtal-customer">' + customerName + '</p>' : '')
      + '<p class="risk-avtal-chain">Kunden lämnar uppgifter → byrån bedömer risken → beslut → avtal.</p>'
      + bridgeNote
      + panels
      + '<div class="risk-avtal-footer">'
      + '<button type="button" class="btn btn-secondary btn-sm" data-risk-avtal-open-tab>Öppna riskflik</button>'
      + '<button type="button" class="btn btn-primary btn-sm" data-risk-avtal-continue>Fortsätt i riskflik</button>'
      + '</div>'
      + '</div></div>';
  }

  function bind(root, handlers) {
    if (!root) return;
    var h = handlers || {};
    root.querySelectorAll('[data-risk-avtal-step]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var n = Number(btn.getAttribute('data-risk-avtal-step') || 1);
        root.querySelectorAll('[data-risk-avtal-step]').forEach(function (b) {
          var id = Number(b.getAttribute('data-risk-avtal-step'));
          b.classList.toggle('is-current', id === n);
          b.classList.toggle('is-done', id < n);
          b.classList.toggle('is-pending', id > n);
        });
        root.querySelectorAll('[data-risk-avtal-panel]').forEach(function (p) {
          p.hidden = Number(p.getAttribute('data-risk-avtal-panel')) !== n;
        });
        if (typeof h.onStep === 'function') h.onStep(n);
      });
    });
    var openTab = root.querySelector('[data-risk-avtal-open-tab]');
    var cont = root.querySelector('[data-risk-avtal-continue]');
    if (openTab && typeof h.onOpenTab === 'function') openTab.addEventListener('click', function () { h.onOpenTab(); });
    if (cont && typeof h.onContinue === 'function') cont.addEventListener('click', function () { h.onContinue(); });
  }

  var api = { STEPS: STEPS, renderShell: renderShell, bind: bind };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.RiskAvtalModal = api;
})(typeof window !== 'undefined' ? window : globalThis);
