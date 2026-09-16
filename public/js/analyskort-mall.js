/**
 * Gemensam mall för analyskort (lista + Din resa-modal).
 * Tjänsteanalysen är referens — samma struktur används för riskfaktorer
 * (Övriga riskfaktorer / Vilka är våra kunder) så ändringar landar på alla.
 *
 * Browser: window.AnalyskortMall
 * Node: module.exports
 */
(function (global) {
  'use strict';

  var RESA_STEPS = [
    { id: 'utforande', label: 'Frågor från din ClientFlow AI', ai: false },
    { id: 'oversikt', label: 'Översikt', ai: true },
    { id: 'hot', label: 'Hot och modus', ai: true },
    { id: 'sarbarhet', label: 'Sårbarheter', ai: true },
    { id: 'inneboende', label: 'Inneboende risk', ai: true },
    { id: 'atgard', label: 'Riskreducerande åtgärder', ai: true },
    { id: 'residual', label: 'Residualrisk', ai: true }
  ];

  var TYPE_OPTIONS = {
    ovriga: [
      { value: 'Verksamhetsspecifika riskfaktorer', label: 'Verksamhetsspecifika riskfaktorer' },
      { value: 'Distrubutionskanaler', label: 'Distrubutionskanaler - såhär möter vi våra kunder' }
    ],
    kundrisker: [
      { value: 'Riskfaktorer kopplat till kund', label: 'Riskfaktorer kopplat till kund' },
      {
        value: 'Geografisk riskfaktorer - här finns byråns kunder',
        label: 'Geografisk riskfaktorer – egen hemvist'
      },
      {
        value: 'Geografisk riskfaktorer - här finns kundens kunder & leverantörer',
        label: 'Geografisk riskfaktorer – motparters geografi'
      }
    ]
  };

  function esc(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function scoreOptionsHtml(kind) {
    if (global.RiskSkala && typeof global.RiskSkala.scoreOptionHtml === 'function') {
      return global.RiskSkala.scoreOptionHtml(null, { kind: kind, emptyLabel: 'Ej satt' });
    }
    var labels = kind === 'konsekvens'
      ? ['', 'Obetydlig', 'Lindrig', 'Kännbar', 'Allvarlig', 'Katastrofal']
      : ['', 'Mycket låg', 'Låg', 'Medel', 'Hög', 'Mycket hög'];
    var html = '<option value="">Ej satt</option>';
    for (var i = 1; i <= 5; i++) {
      html += '<option value="' + i + '">' + i + ' — ' + labels[i] + '</option>';
    }
    return html;
  }

  /** Circular progress for Din resa klarmarkering (tjänst-referens). */
  function renderProgressIcon(progress) {
    var done = Number(progress && progress.doneCount) || 0;
    var total = Number(progress && progress.total) || RESA_STEPS.length;
    var complete = !!(progress && progress.complete);
    var pct = total > 0 ? Math.round((done / total) * 100) : 0;
    var stateClass = 'is-empty';
    if (complete || pct >= 100) stateClass = 'is-complete';
    else if (done > 0) stateClass = 'is-partial';
    var label = (complete || pct >= 100)
      ? 'Alla analysdelar är klarmarkerade'
      : (done > 0
        ? done + ' av ' + total + ' delar klarmarkerade'
        : 'Ingen del klarmarkerad ännu');
    var style = stateClass === 'is-partial' ? ' style="--progress:' + pct + '"' : '';
    return '<span class="tjanst-mall-progress ' + stateClass + '" role="img" aria-label="' +
      esc(label) + '"' + style + '></span>';
  }

  function formatCatalogRiskBadge(label) {
    return String(label || '')
      .replace(/\(S\s*[×xX]\s*K\s+(\d+)\)/g, '($1)')
      .replace(/:\s*([^\s(]+)/, function (_, level) {
        return ': ' + String(level).toLocaleLowerCase('sv-SE');
      });
  }

  function renderRiskMeta(opts) {
    opts = opts || {};
    var badges = opts.badges || {};
    var progress = opts.progress || { doneCount: 0, total: RESA_STEPS.length, complete: false };
    var riskLevelClass = opts.riskLevelClass || '';
    var residualClass = opts.residualClass || '';
    var klarHtml = progress.complete
      ? '<span class="tjanst-mall-klar-badge is-complete" title="Alla analysdelar är klarmarkerade"><i class="fas fa-check" aria-hidden="true"></i> Klar</span>'
      : (progress.doneCount > 0
        ? '<span class="tjanst-mall-klar-badge" title="Klarmarkerade delar i Din resa">' +
          progress.doneCount + '/' + progress.total + ' klara</span>'
        : '');
    if (!badges.inneboende && !badges.residual && !klarHtml) {
      return opts.emptyMetaHtml || '<span class="tjanst-mall-status">AML-analys finns</span>';
    }
    var inneboende = formatCatalogRiskBadge(badges.inneboende);
    var residual = formatCatalogRiskBadge(badges.residual);
    return (
      '<span class="tjanst-mall-meta">' +
        klarHtml +
        (inneboende
          ? '<span class="risk-level-badge ' + esc(riskLevelClass) + '"' +
            (badges.inneboendeTitle ? ' title="' + esc(badges.inneboendeTitle) + '"' : '') +
            '>' + esc(inneboende) + '</span>'
          : '') +
        (residual
          ? '<span class="risk-level-badge ' + esc(residualClass) + '"' +
            (badges.residualTitle ? ' title="' + esc(badges.residualTitle) + '"' : '') +
            '>' + esc(residual) + '</span>'
          : '') +
        (opts.extraMetaHtml || '') +
      '</span>'
    );
  }

  /**
   * Lista-analyskort — samma tjanst-mall-card-struktur för tjänst och riskfaktor.
   * @param {object} opts
   */
  function renderCard(opts) {
    opts = opts || {};
    var aktiv = opts.aktiv !== false;
    var progress = opts.progress || { doneCount: 0, total: RESA_STEPS.length, complete: false };
    var progressIcon = renderProgressIcon(progress);
    var resaComplete = !!(progress.complete);
    var rowRiskClass = opts.rowRiskClass || '';
    var hasOverview = !!(opts.overviewHtml);
    var overviewAttrs = hasOverview ? ' data-has-overview tabindex="0" aria-expanded="false"' : '';
    var dataAttrs = opts.dataAttrsHtml || '';
    var titleHtml = opts.titleHtml != null ? opts.titleHtml : esc(opts.title || 'Namnlös');
    var descHtml = opts.description
      ? '<p class="tjanst-mall-desc">' + esc(opts.description) + '</p>'
      : (opts.descriptionHtml || '');
    var draftBadge = opts.draftBadgeHtml || '';
    var toolbarMeta = opts.hasAnalysis
      ? renderRiskMeta({
          badges: opts.badges,
          progress: progress,
          riskLevelClass: opts.riskLevelClass,
          residualClass: opts.residualClass,
          extraMetaHtml: opts.extraMetaHtml,
          emptyMetaHtml: opts.emptyMetaHtml
        })
      : (opts.noAnalysisHtml || '<span class="tjanst-mall-status">Ingen analys ännu</span>');
    var analysHtml = hasOverview
      ? '<div class="tjanst-mall-overview" hidden>' + opts.overviewHtml + '</div>'
      : (opts.emptyBodyHtml || '');
    var body = analysHtml
      ? '<div class="tjanst-mall-body">' + analysHtml + '</div>'
      : '';

    return (
      '<article class="analyskort tjanst-mall-card' +
        (aktiv ? '' : ' is-inactive') +
        (rowRiskClass ? ' ' + rowRiskClass : '') +
        (resaComplete ? ' is-resa-complete' : '') +
        (opts.extraCardClass ? ' ' + opts.extraCardClass : '') +
        '"' +
        dataAttrs +
        overviewAttrs +
      '>' +
        '<div class="tjanst-mall-top">' +
          '<div class="tjanst-mall-identity">' +
            progressIcon +
            '<div class="tjanst-mall-copy">' +
              '<h4 class="tjanst-mall-title"><span class="tjanst-mall-title-btn">' + titleHtml + '</span></h4>' +
              draftBadge +
              descHtml +
            '</div>' +
          '</div>' +
          '<div class="tjanst-mall-top-actions">' +
            '<div class="risk-row-menu">' +
              '<button type="button" class="risk-row-menu-btn" data-risk-menu-toggle aria-haspopup="true" aria-expanded="false" aria-label="Fler åtgärder">' +
                '<i class="fas fa-ellipsis" aria-hidden="true"></i>' +
              '</button>' +
              '<div class="risk-row-menu-panel" hidden role="menu">' +
                (opts.menuHtml || '') +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="tjanst-mall-toolbar">' +
          toolbarMeta +
          (opts.toolbarRightHtml || '') +
        '</div>' +
        body +
      '</article>'
    );
  }

  function renderTabs(cfg) {
    var tabAttr = cfg.tabAttr;
    var ariaLabel = cfg.tabsAriaLabel || 'Analysdelar';
    var steps = RESA_STEPS.map(function (step, idx) {
      var active = idx === 0;
      return (
        '<button type="button" class="tjanst-tab' + (active ? ' is-active' : '') + '" ' +
          tabAttr + '="' + step.id + '" role="tab" aria-selected="' + (active ? 'true' : 'false') + '">' +
          '<span class="tjanst-tab-dot" data-resa-blob="' + step.id +
            '" title="Klarmarkera" aria-hidden="true"></span>' +
          '<span class="tjanst-tab-label">' + esc(step.label) + '</span>' +
          (step.ai
            ? '<span class="tjanst-tab-ai" data-ai-for="' + step.id + '" hidden title="AI-förslag" aria-label="AI-förslag">' +
              '<i class="fas fa-wand-magic-sparkles" aria-hidden="true"></i></span>'
            : '') +
        '</button>'
      );
    }).join('');
    return (
      '<nav class="tjanst-tabs" role="tablist" aria-label="' + esc(ariaLabel) + '">' +
        '<p class="tjanst-tabs-kicker">Din resa</p>' +
        '<div class="tjanst-tabs-steps">' + steps + '</div>' +
      '</nav>'
    );
  }

  /**
   * Bind Din resa-tabbar: klick på bloben klarmarkerar steget; klick på etiketten byter flik.
   * @param {ParentNode} root
   * @param {{ tabAttr: string, onNavigate: function(string): void, onToggleKlar: function(string): void }} opts
   */
  function bindResaTabClicks(root, opts) {
    if (!root || !opts || !opts.tabAttr) return;
    var tabAttr = opts.tabAttr;
    var selector = '.tjanst-tab[' + tabAttr + ']';
    root.querySelectorAll(selector).forEach(function (tab) {
      if (tab.dataset.resaBlobBound === '1') return;
      tab.dataset.resaBlobBound = '1';
      tab.addEventListener('click', function (e) {
        var id = tab.getAttribute(tabAttr);
        if (!id) return;
        var blob = e.target && e.target.closest ? e.target.closest('[data-resa-blob]') : null;
        if (blob && tab.contains(blob)) {
          e.preventDefault();
          if (typeof opts.onToggleKlar === 'function') opts.onToggleKlar(id);
          return;
        }
        if (typeof opts.onNavigate === 'function') opts.onNavigate(id);
      });
    });
  }

  function renderDynListPanel(cfg, panelId, opts) {
    var panelAttr = cfg.panelAttr;
    var emptyId = opts.emptyId;
    var listId = opts.listId;
    var aiId = opts.aiId;
    var addKind = opts.addKind;
    return (
      '<section class="tjanst-panel" ' + panelAttr + '="' + panelId + '" hidden>' +
        '<div class="form-group-head">' +
          '<div>' +
            '<label>' + esc(opts.label) + '</label>' +
            '<p class="tjanst-panel-hint">' + esc(opts.hint) + '</p>' +
          '</div>' +
          '<button type="button" class="btn-add-row" data-add="' + addKind + '">' +
            '<i class="fas fa-plus"></i> Lägg till eget</button>' +
        '</div>' +
        '<div class="tjanst-panel-scroll">' +
          (aiId ? '<div id="' + aiId + '" class="ai-review ai-review--inline" hidden></div>' : '') +
          '<div id="' + emptyId + '" class="tjanst-empty">' + esc(opts.emptyText) + '</div>' +
          '<div id="' + listId + '" class="dyn-list"></div>' +
        '</div>' +
      '</section>'
    );
  }

  function renderSxkBlock(cfg, kind) {
    var isInneboende = kind === 'inneboende';
    var sannolikhetId = cfg.ids[isInneboende ? 'sannolikhet' : 'sannolikhetEfter'];
    var konsekvensId = cfg.ids[isInneboende ? 'konsekvens' : 'konsekvensEfter'];
    var badgeId = cfg.ids[isInneboende ? 'inneboendeBadge' : 'residualBadge'];
    var legacyWrapId = cfg.ids[isInneboende ? 'motInneboendeLegacyWrap' : 'motResidualLegacyWrap'];
    var legacyId = cfg.ids[isInneboende ? 'motInneboendeLegacy' : 'motResidualLegacy'];
    var motS = cfg.ids[isInneboende ? 'motInneboendeS' : 'motResidualS'];
    var motK = cfg.ids[isInneboende ? 'motInneboendeK' : 'motResidualK'];
    var motHidden = cfg.ids[isInneboende ? 'motInneboende' : 'motResidual'];
    var warnId = cfg.ids[isInneboende ? 'motInneboendeWarn' : 'motResidualWarn'];
    var proposeSplit = cfg.ids[isInneboende ? 'proposeInneboende' : 'proposeResidual'];
    var badgeLabel = isInneboende ? 'Inneboende risk: Ej satt' : 'Residualrisk: Ej satt';
    var sannolikhetLabel = isInneboende
      ? 'Sannolikhet (1–5)'
      : 'Sannolikhet efter åtgärder (1–5)';
    var konsekvensLabel = isInneboende
      ? 'Konsekvens (1–5)'
      : 'Konsekvens efter åtgärder (1–5)';
    var hint = isInneboende
      ? (cfg.inneboendeHint ||
        'Inneboende risk är risken i tjänsten i sig, innan era kontroller och åtgärder. Den räknas som sannolikhet × konsekvens (S×K).')
      : 'Residualrisk efter åtgärder. Sätt sannolikhet och konsekvens när riskreducerande åtgärder är på plats — det är också S×K.';
    var motHint = isInneboende
      ? 'Förklara varför just denna sannolikhet respektive konsekvens gäller. Minst 25 tecken vardera vid Förhöjd/Hög/Oacceptabel.'
      : 'Förklara hur åtgärderna påverkat sannolikhet respektive konsekvens. Vid Hög/Oacceptabel: hänvisa till riskaptitbeslut.';

    var scores = (
      '<div class="tjanst-risk-scores' + (isInneboende ? '' : ' tjanst-residual-scores') + '">' +
        '<div class="form-group">' +
          '<label for="' + sannolikhetId + '"' +
            (isInneboende ? ' title="Hur troligt är det att något av de listade hoten realiseras, givet sårbarheterna"' : '') +
          '>' + sannolikhetLabel + '</label>' +
          '<select id="' + sannolikhetId + '" name="' + (isInneboende ? 'sannolikhet' : 'sannolikhet-efter') + '">' +
            scoreOptionsHtml('sannolikhet') +
          '</select>' +
        '</div>' +
        '<div class="form-group">' +
          '<label for="' + konsekvensId + '"' +
            (isInneboende ? ' title="Hur allvarlig är skadan om det händer"' : '') +
          '>' + konsekvensLabel + '</label>' +
          '<select id="' + konsekvensId + '" name="' + (isInneboende ? 'konsekvens' : 'konsekvens-efter') + '">' +
            scoreOptionsHtml('konsekvens') +
          '</select>' +
        '</div>' +
        '<div id="' + badgeId + '" class="tjanst-risk-badge is-empty" role="status"' +
          (isInneboende ? ' title="Inneboende risk är risken innan era åtgärder. Räknas som S×K."' : '') +
        '>' + badgeLabel + '</div>' +
      '</div>'
    );

    var motivering = (
      '<div class="form-group risk-motivering-field risk-motivering-legacy" id="' + legacyWrapId + '" hidden>' +
        '<label for="' + legacyId + '">Tidigare motivering (' + (isInneboende ? 'inneboende risk' : 'residualrisk') + ')</label>' +
        '<p class="tjanst-panel-hint">Sparad innan uppdelning i S och K. Kan användas som utgångspunkt.</p>' +
        '<textarea id="' + legacyId + '" name="' + legacyId + '" rows="2" readonly></textarea>' +
        '<button type="button" class="btn btn-ghost btn-sm risk-motivering-propose" data-propose-split="' +
          proposeSplit + '">Föreslå uppdelning</button>' +
      '</div>' +
      '<div class="form-group risk-motivering-field">' +
        '<label for="' + motS + '">Motivering av sannolikhet (' + (isInneboende ? 'inneboende risk' : 'residualrisk') + ')' +
          '<span id="' + warnId + '" class="risk-motivering-warn" hidden title="Obligatorisk vid Förhöjd/Hög/Oacceptabel">✗</span>' +
        '</label>' +
        '<p class="tjanst-panel-hint">' + esc(motHint) + '</p>' +
        '<textarea id="' + motS + '" name="' + motS + '" rows="2" placeholder="Varför denna sannolikhet?"></textarea>' +
      '</div>' +
      '<div class="form-group risk-motivering-field">' +
        '<label for="' + motK + '">Motivering av konsekvens (' + (isInneboende ? 'inneboende risk' : 'residualrisk') + ')</label>' +
        '<textarea id="' + motK + '" name="' + motK + '" rows="2" placeholder="Varför denna konsekvens?"></textarea>' +
      '</div>' +
      '<textarea id="' + motHidden + '" name="' + (isInneboende ? 'motivering-inneboende' : 'motivering-residual') +
        '" rows="1" hidden aria-hidden="true"></textarea>'
    );

    if (isInneboende) {
      return (
        '<section class="tjanst-panel" ' + cfg.panelAttr + '="inneboende" hidden>' +
          '<div class="tjanst-panel-scroll">' +
            '<div class="tjanst-modal-identity">' +
              scores +
              '<p class="tjanst-panel-hint tjanst-sxk-hint">' + esc(hint) + '</p>' +
            '</div>' +
            (cfg.ids.aiInneboende
              ? '<div id="' + cfg.ids.aiInneboende + '" class="ai-review ai-review--inline" hidden></div>'
              : '') +
            motivering +
          '</div>' +
        '</section>'
      );
    }

    return (
      '<section class="tjanst-panel" ' + cfg.panelAttr + '="residual" hidden>' +
        '<div class="tjanst-panel-scroll">' +
          '<div class="tjanst-residual-bar">' +
            '<div>' +
              '<p class="tjanst-residual-title">Vilken risk återstår?</p>' +
              '<p class="tjanst-panel-hint">' + esc(hint) + '</p>' +
            '</div>' +
            scores +
            (cfg.ids.aiResidual
              ? '<div id="' + cfg.ids.aiResidual + '" class="ai-review ai-review--inline" hidden></div>'
              : '') +
            motivering +
          '</div>' +
          (cfg.residualFeedbackHtml || '') +
        '</div>' +
      '</section>'
    );
  }

  function typeOptionsHtml(pageKind) {
    var opts = TYPE_OPTIONS[pageKind] || TYPE_OPTIONS.ovriga;
    return '<option value="">Välj typ av riskfaktor</option>' +
      opts.map(function (o) {
        return '<option value="' + esc(o.value) + '">' + esc(o.label) + '</option>';
      }).join('');
  }

  function buildTjanstConfig() {
    return {
      kind: 'tjanst',
      modalId: 'tjanst-modal',
      formId: 'tjanst-form',
      titleId: 'tjanst-modal-title',
      titleText: 'Lägg till tjänst',
      tabsAriaLabel: 'Tjänstdelar',
      tabAttr: 'data-tjanst-tab',
      panelAttr: 'data-tjanst-panel',
      nameLabel: 'Tjänstens namn *',
      nameId: 'tjanst-name',
      nameName: 'task-name',
      namePlaceholder: 't.ex. Löpande bokföring',
      nameFormAttr: '',
      aiSummaryId: 'tjanst-ai-summary',
      progressId: 'tjanst-resa-progress',
      klarmarkeraId: 'tjanst-klarmarkera-btn',
      saveLabel: 'Spara tjänst',
      showDraftSave: true,
      draftSaveId: 'tjanst-save-draft-btn',
      hiddenRecordId: 'tjanst-record-id',
      formNovValidate: false,
      inneboendeHint:
        'Inneboende risk är risken i tjänsten i sig, innan era kontroller och åtgärder. Den räknas som sannolikhet × konsekvens (S×K).',
      ids: {
        sannolikhet: 'tjanst-sannolikhet',
        konsekvens: 'tjanst-konsekvens',
        sannolikhetEfter: 'tjanst-sannolikhet-efter',
        konsekvensEfter: 'tjanst-konsekvens-efter',
        inneboendeBadge: 'tjanst-inneboende-badge',
        residualBadge: 'tjanst-residual-badge',
        motInneboendeLegacyWrap: 'tjanst-motivering-inneboende-legacy-wrap',
        motInneboendeLegacy: 'tjanst-motivering-inneboende-legacy',
        motInneboendeS: 'tjanst-motivering-inneboende-s',
        motInneboendeK: 'tjanst-motivering-inneboende-k',
        motInneboende: 'tjanst-motivering-inneboende',
        motInneboendeWarn: 'tjanst-motivering-inneboende-warn',
        proposeInneboende: 'tjanst-motivering-inneboende',
        motResidualLegacyWrap: 'tjanst-motivering-residual-legacy-wrap',
        motResidualLegacy: 'tjanst-motivering-residual-legacy',
        motResidualS: 'tjanst-motivering-residual-s',
        motResidualK: 'tjanst-motivering-residual-k',
        motResidual: 'tjanst-motivering-residual',
        motResidualWarn: 'tjanst-motivering-residual-warn',
        proposeResidual: 'tjanst-motivering-residual',
        aiInneboende: 'tjanst-ai-inneboende',
        aiResidual: 'tjanst-ai-residual',
        hotEmpty: 'hot-empty',
        hotList: 'hot-list',
        hotAi: 'tjanst-ai-hot',
        sarEmpty: 'sarbarhet-empty',
        sarList: 'sarbarhet-list',
        sarAi: 'tjanst-ai-sarbarhet',
        atgardEmpty: 'atgard-empty',
        atgardList: 'atgard-list',
        atgardAi: 'tjanst-ai-atgard'
      },
      utforandeHtml:
        '<div class="tjanst-panel-scroll">' +
          '<div id="tjanst-modal-utforande" class="tjanst-modal-utforande" hidden></div>' +
          '<div id="tjanst-ai-utforande" class="ai-review ai-review--inline" hidden></div>' +
        '</div>' +
        '<div class="tjanst-utforande-ai-bar">' +
          '<div class="tjanst-ai-extra-underlag">' +
            '<label for="tjanst-ai-extra-underlag">Extra underlag till analysen</label>' +
            '<p class="tjanst-panel-hint">Berätta mer för AI — t.ex. hot ni sett som frågorna inte fångar. Valfritt, sparas med tjänsten.</p>' +
            '<textarea id="tjanst-ai-extra-underlag" rows="3" placeholder="T.ex. falska mejl som ser ut att komma från kunden och ber om betalning…"></textarea>' +
          '</div>' +
          '<button type="button" id="ai-suggest-btn" class="btn btn-ai">' +
            '<i class="fas fa-wand-magic-sparkles"></i>' +
            '<span class="ai-btn-label">Generera AI-analys</span>' +
          '</button>' +
        '</div>',
      oversicktHtml:
        '<div class="tjanst-panel-scroll">' +
          '<label for="tjanst-beskrivning">Tjänsten</label>' +
          '<p class="tjanst-panel-hint">Beskriv vad tjänsten innebär hos er — gärna med bekräftade fakta som antal kunder och hur underlag tas emot. Nämn INTE kontroller, rutiner eller åtgärder här; de hör hemma i Åtgärder-fliken. Hitta inte på bemanning eller kapacitet som systemet inte vet.</p>' +
          '<textarea id="tjanst-beskrivning" name="tjanstebeskrivning" rows="8" placeholder="Vad tjänsten innebär hos er, med bekräftade fakta. Inte era kontroller."></textarea>' +
          '<div id="tjanst-ai-oversikt" class="ai-review ai-review--inline" hidden></div>' +
        '</div>',
      atgardMode: 'dynlist',
      residualFeedbackHtml:
        '<div class="tjanst-residual-feedback" id="tjanst-residual-feedback">' +
          '<label for="tjanst-residual-feedback-text">Feedback till ClientFlow</label>' +
          '<p class="tjanst-panel-hint">Synpunkter på residualriskbedömningen skickas till feedback@clientflow.se (med byrå och inloggad användare).</p>' +
          '<div class="tjanst-residual-feedback-row">' +
            '<textarea id="tjanst-residual-feedback-text" name="residual-feedback" rows="2" maxlength="4000" placeholder="Skriv en kort synpunkt…" autocomplete="off"></textarea>' +
            '<button type="button" class="btn btn-secondary btn-sm" id="tjanst-residual-feedback-send">Skicka</button>' +
          '</div>' +
          '<p id="tjanst-residual-feedback-status" class="tjanst-residual-feedback-status" hidden></p>' +
        '</div>'
    };
  }

  function buildRiskConfig(mode, pageKind) {
    var isEdit = mode === 'edit';
    var prefix = isEdit ? 'edit-' : '';
    var listPrefix = isEdit ? 'edit-' : 'add-';
    var modalId = isEdit ? 'edit-risk-modal' : 'add-risk-modal';
    var formId = isEdit ? 'edit-risk-form' : 'add-risk-form';
    var nameId = isEdit ? 'edit-risk-factor' : 'risk-factor';
    var typeId = isEdit ? 'edit-risk-type' : 'risk-type';
    var ptId = isEdit ? 'edit-pt-tf' : 'pt-tf';
    var descId = isEdit ? 'edit-description' : 'description';
    var actionId = isEdit ? 'edit-action' : 'action';
    var underlagId = isEdit ? 'edit-risk-ai-extra-underlag' : 'risk-ai-extra-underlag';
    var aiBtnId = isEdit ? 'edit-ai-suggest-btn' : 'add-ai-suggest-btn';
    var aiSummaryId = isEdit ? 'edit-ai-summary' : 'add-ai-summary';
    var aiOversiktId = isEdit ? 'edit-ai-review' : 'add-ai-review';

    return {
      kind: 'riskfaktor',
      pageKind: pageKind,
      mode: mode,
      modalId: modalId,
      formId: formId,
      titleId: modalId + '-title',
      titleText: isEdit ? 'Redigera riskfaktor' : 'Lägg till ny riskfaktor',
      tabsAriaLabel: 'Riskfaktoranalys',
      tabAttr: 'data-risk-tab',
      panelAttr: 'data-risk-panel',
      nameLabel: 'Riskfaktor *',
      nameId: nameId,
      nameName: 'risk-factor',
      namePlaceholder: 't.ex. Distansmöte utan BankID',
      nameFormAttr: ' form="' + formId + '"',
      hiddenRecordId: isEdit ? 'edit-record-id' : undefined,
      aiSummaryId: aiSummaryId,
      progressId: listPrefix + 'risk-resa-progress',
      klarmarkeraId: listPrefix + 'risk-klarmarkera-btn',
      saveLabel: isEdit ? 'Uppdatera riskfaktor' : 'Spara riskfaktor',
      showDraftSave: false,
      formNovValidate: true,
      reviewFlagHtml: isEdit
        ? '<span id="edit-review-flag" class="tjanst-review-flag" hidden title="Kräver manuell översyn">!</span>'
        : '',
      inneboendeHint:
        'Inneboende risk är risken i faktorn i sig, innan era kontroller och åtgärder. Den räknas som sannolikhet × konsekvens (S×K).',
      ids: {
        sannolikhet: prefix + 'sannolikhet',
        konsekvens: prefix + 'konsekvens',
        sannolikhetEfter: prefix + 'sannolikhet-efter',
        konsekvensEfter: prefix + 'konsekvens-efter',
        inneboendeBadge: listPrefix + 'inneboende-badge',
        residualBadge: listPrefix + 'residual-badge',
        motInneboendeLegacyWrap: prefix + 'motivering-inneboende-legacy-wrap',
        motInneboendeLegacy: prefix + 'motivering-inneboende-legacy',
        motInneboendeS: prefix + 'motivering-inneboende-s',
        motInneboendeK: prefix + 'motivering-inneboende-k',
        motInneboende: prefix + 'motivering-inneboende',
        motInneboendeWarn: listPrefix + 'motivering-inneboende-warn',
        proposeInneboende: prefix + 'motivering-inneboende',
        motResidualLegacyWrap: prefix + 'motivering-residual-legacy-wrap',
        motResidualLegacy: prefix + 'motivering-residual-legacy',
        motResidualS: prefix + 'motivering-residual-s',
        motResidualK: prefix + 'motivering-residual-k',
        motResidual: prefix + 'motivering-residual',
        motResidualWarn: listPrefix + 'motivering-residual-warn',
        proposeResidual: prefix + 'motivering-residual',
        aiInneboende: '',
        aiResidual: '',
        hotEmpty: listPrefix + 'hot-empty',
        hotList: listPrefix + 'hot-list',
        hotAi: listPrefix + 'ai-hot',
        sarEmpty: listPrefix + 'sarbarhet-empty',
        sarList: listPrefix + 'sarbarhet-list',
        sarAi: listPrefix + 'ai-sarbarhet',
        atgardEmpty: '',
        atgardList: '',
        atgardAi: ''
      },
      utforandeHtml:
        '<div class="tjanst-panel-scroll">' +
          '<h4 class="tjanst-mall-group-title">Frågor från din ClientFlow AI</h4>' +
          '<p class="tjanst-panel-hint">Ge AI mer kontext om riskfaktorn — t.ex. hur ni möter kunderna, vad ni sett i praktiken, eller vad som skiljer er från en typisk byrå. AI:n använder också byråprofilen och riskfaktorns namn.</p>' +
          '<div class="tjanst-ai-extra-underlag">' +
            '<label for="' + underlagId + '">Extra underlag till analysen</label>' +
            '<p class="tjanst-panel-hint">Valfritt. Sparas med riskfaktorn och vägs in när ni genererar AI-analys.</p>' +
            '<textarea id="' + underlagId + '" name="ai-extra-underlag" rows="4" placeholder="T.ex. kunder bokar möten via Zoom utan BankID, eller att ni ofta får underlag sent…"></textarea>' +
          '</div>' +
        '</div>' +
        '<div class="tjanst-utforande-ai-bar">' +
          '<button type="button" class="btn btn-ai" id="' + aiBtnId + '">' +
            '<i class="fas fa-wand-magic-sparkles"></i>' +
            '<span class="ai-btn-label">Generera AI-analys</span>' +
          '</button>' +
        '</div>',
      oversicktHtml:
        '<div class="tjanst-panel-scroll">' +
          '<div class="form-group">' +
            '<label for="' + typeId + '">Typ av riskfaktor *</label>' +
            '<select id="' + typeId + '" name="risk-type" required>' +
              typeOptionsHtml(pageKind) +
            '</select>' +
          '</div>' +
          '<div class="form-group">' +
            '<label for="' + ptId + '">PT/TF-relevans *</label>' +
            '<select id="' + ptId + '" name="pt-tf" required>' +
              '<option value="">Välj PT eller TF</option>' +
              '<option value="PT">PT</option>' +
              '<option value="TF">TF</option>' +
              '<option value="Båda">Båda</option>' +
            '</select>' +
          '</div>' +
          '<label for="' + descId + '">Beskrivning *</label>' +
          '<p class="tjanst-panel-hint">Beskriv riskfaktorn — nämn INTE byrån, personal, kapacitet, kontroller, rutiner eller åtgärder här; de hör hemma under Riskreducerande åtgärder.</p>' +
          '<textarea id="' + descId + '" name="description" rows="8" required placeholder="Vad riskfaktorn innebär — inte byrån, personal eller era kontroller."></textarea>' +
          '<div id="' + aiOversiktId + '" class="ai-review ai-review--inline" hidden></div>' +
        '</div>',
      atgardMode: 'textarea',
      atgardHtml:
        '<div class="tjanst-panel-scroll">' +
          '<label for="' + actionId + '">Hur hanteras risken? *</label>' +
          '<p class="tjanst-panel-hint">Riskreducerande åtgärder — vad ni gör för att hantera risken. Kontroller och rutiner hör hit, inte i översikten.</p>' +
          '<textarea id="' + actionId + '" name="action" rows="8" required placeholder="T.ex. Underlag för alla transaktioner dokumenteras i bokslutsprogrammet."></textarea>' +
        '</div>',
      residualFeedbackHtml: ''
    };
  }

  function renderModal(cfg) {
    var ids = cfg.ids;
    var atgardSection = cfg.atgardMode === 'dynlist'
      ? renderDynListPanel(cfg, 'atgard', {
          label: 'Hur hanteras risken?',
          hint: 'Riskreducerande åtgärder. Markera varje åtgärd som byrårutin (ingår i det normala arbetssättet), kundspecifik åtgärd (bedöms per kund) eller risksänkande åtgärd som ska kopplas till specifika uppdragskörningar. Kontroller och rutiner hör hit, inte i översikten.',
          emptyText: 'Inga åtgärder ännu.',
          emptyId: ids.atgardEmpty,
          listId: ids.atgardList,
          aiId: ids.atgardAi,
          addKind: 'atgard'
        })
      : (
        '<section class="tjanst-panel" ' + cfg.panelAttr + '="atgard" hidden>' +
          (cfg.atgardHtml || '') +
        '</section>'
      );

    var footerButtons =
      '<button type="button" class="btn btn-secondary" onclick="closeModal(\'' + cfg.modalId + '\')">Avbryt</button>' +
      (cfg.showDraftSave
        ? '<button type="button" id="' + cfg.draftSaveId + '" class="btn btn-secondary">Spara utkast</button>'
        : '') +
      '<button type="submit" class="btn btn-primary">' +
        '<i class="fas fa-save"></i> ' + esc(cfg.saveLabel) +
      '</button>';

    return (
      '<div id="' + cfg.modalId + '" class="modal" style="display: none;" data-analyskort-modal="' + esc(cfg.kind) + '">' +
        '<div class="modal-content tjanst-modal-content">' +
          '<div class="modal-header">' +
            '<div class="tjanst-modal-head">' +
              '<div class="form-group tjanst-name-field tjanst-name-field--top">' +
                '<label for="' + cfg.nameId + '">' + esc(cfg.nameLabel) + '</label>' +
                '<input type="text" id="' + cfg.nameId + '" name="' + cfg.nameName + '"' +
                  (cfg.nameFormAttr || '') +
                  ' class="tjanst-modal-name" placeholder="' + esc(cfg.namePlaceholder) + '" required>' +
              '</div>' +
              (cfg.reviewFlagHtml || '') +
              '<button class="modal-close" type="button" onclick="closeModal(\'' + cfg.modalId + '\')">' +
                '<i class="fas fa-times"></i>' +
              '</button>' +
            '</div>' +
            '<div id="' + cfg.aiSummaryId + '" class="ai-review-summary tjanst-ai-summary" hidden></div>' +
            '<h3 id="' + cfg.titleId + '" class="visually-hidden">' + esc(cfg.titleText) + '</h3>' +
          '</div>' +
          '<form id="' + cfg.formId + '" class="modal-form tjanst-form"' +
            (cfg.formNovValidate ? ' novalidate' : '') + '>' +
            (cfg.hiddenRecordId
              ? '<input type="hidden" id="' + cfg.hiddenRecordId + '" name="record-id">'
              : '') +
            '<div class="tjanst-modal-layout">' +
              renderTabs(cfg) +
              '<div class="tjanst-modal-body">' +
                '<div class="tjanst-panel-klar-bar">' +
                  '<span id="' + cfg.progressId + '" class="tjanst-resa-progress" hidden></span>' +
                '</div>' +
                '<section class="tjanst-panel is-active" ' + cfg.panelAttr + '="utforande">' +
                  cfg.utforandeHtml +
                '</section>' +
                '<section class="tjanst-panel" ' + cfg.panelAttr + '="oversikt" hidden>' +
                  cfg.oversicktHtml +
                '</section>' +
                renderDynListPanel(cfg, 'hot', {
                  label: 'Vad kan gå fel?',
                  hint: 'Hot och modus. Ett hot per rad. Klicka på en rad för att skriva beskrivning. Källa är valfritt.',
                  emptyText: 'Inga hot ännu.',
                  emptyId: ids.hotEmpty,
                  listId: ids.hotList,
                  aiId: ids.hotAi,
                  addKind: 'hot'
                }) +
                renderDynListPanel(cfg, 'sarbarhet', {
                  label: 'Varför kan det hända hos byrån?',
                  hint: 'Sårbarheter hos er. Klicka på en rad för att redigera.',
                  emptyText: 'Inga sårbarheter ännu.',
                  emptyId: ids.sarEmpty,
                  listId: ids.sarList,
                  aiId: ids.sarAi,
                  addKind: 'sarbarhet'
                }) +
                renderSxkBlock(cfg, 'inneboende') +
                atgardSection +
                renderSxkBlock(cfg, 'residual') +
                '<div class="tjanst-panel-klar-footer">' +
                  '<button type="button" id="' + cfg.klarmarkeraId +
                    '" class="tjanst-klarmarkera-btn" aria-pressed="false">' +
                    '<i class="fas fa-check" aria-hidden="true"></i>' +
                    '<span class="tjanst-klarmarkera-label">Klarmarkera</span>' +
                  '</button>' +
                '</div>' +
              '</div>' +
            '</div>' +
            '<div class="form-actions tjanst-modal-footer">' + footerButtons + '</div>' +
          '</form>' +
        '</div>' +
      '</div>'
    );
  }

  function renderPageModals(pageKind) {
    if (pageKind === 'tjanst') {
      return renderModal(buildTjanstConfig());
    }
    return renderModal(buildRiskConfig('add', pageKind)) +
      renderModal(buildRiskConfig('edit', pageKind));
  }

  /**
   * Ersätt placeholder eller befintliga modaler med den gemensamma mallen.
   * @param {Document} doc
   * @param {'tjanst'|'ovriga'|'kundrisker'} pageKind
   */
  function mountPageModals(doc, pageKind) {
    doc = doc || (typeof document !== 'undefined' ? document : null);
    if (!doc) return false;
    var host = doc.querySelector('[data-analyskort-modals="' + pageKind + '"]');
    var html = renderPageModals(pageKind);
    if (host) {
      host.innerHTML = html;
      return true;
    }
    // Fallback: replace known modal nodes if host missing (legacy pages).
    if (pageKind === 'tjanst') {
      var old = doc.getElementById('tjanst-modal');
      if (!old || !old.parentNode) return false;
      var wrap = doc.createElement('div');
      wrap.innerHTML = html;
      old.parentNode.replaceChild(wrap.firstElementChild, old);
      return true;
    }
    var add = doc.getElementById('add-risk-modal');
    var edit = doc.getElementById('edit-risk-modal');
    if (!add || !edit || !add.parentNode) return false;
    var box = doc.createElement('div');
    box.innerHTML = html;
    var parent = add.parentNode;
    parent.insertBefore(box.children[0], add);
    parent.insertBefore(box.children[0], edit);
    add.remove();
    edit.remove();
    return true;
  }

  var api = {
    RESA_STEPS: RESA_STEPS,
    TYPE_OPTIONS: TYPE_OPTIONS,
    esc: esc,
    renderProgressIcon: renderProgressIcon,
    formatCatalogRiskBadge: formatCatalogRiskBadge,
    renderRiskMeta: renderRiskMeta,
    renderCard: renderCard,
    renderModal: renderModal,
    renderPageModals: renderPageModals,
    buildTjanstConfig: buildTjanstConfig,
    buildRiskConfig: buildRiskConfig,
    mountPageModals: mountPageModals,
    bindResaTabClicks: bindResaTabClicks
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  global.AnalyskortMall = api;
})(typeof window !== 'undefined' ? window : global);
