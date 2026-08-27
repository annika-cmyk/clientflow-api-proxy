/**
 * Allmän riskbedömning byrå - Kort med visnings-/redigeringsläge
 */
(function () {
  if (!document.getElementById('fld-syfte-omfattning')) return;

  const FIELD_MAP = [
    { id: 'fld-syfte-omfattning', airtable: '1. Syfte och Omfattning' },
    { id: 'fld-beskrivning', airtable: '2. Beskrivning av Byråns verksamhet' },
    { id: 'fld-metod-riskbedomning', airtable: '3. Metod för Riskbedömning ' },
    { id: 'fld-identifierade-risker', airtable: '4. Identifierade Risker och Sårbarheter' },
    { id: 'fld-riskreducerande', airtable: '5. Riskreducerande Åtgärder och Rutiner' },
    { id: 'fld-utvardering', airtable: '6. Utvärdering och Uppdatering' },
    { id: 'fld-kommunikation-risk', airtable: '7. Kommunikation.' },
    { id: 'fld-vardering-risk', airtable: '8. Värdering av sammantagen risk' },
    { id: 'fld-riskaptit-policy', airtable: '9. Riskaptit' },
    { id: 'fld-uppdaterad-datum', airtable: 'Uppdaterad datum', type: 'date' }
  ];

  const KARTLAGGNING_AIRTABLE = 'AR Kartläggning (JSON)';
  const KARTLAGGNING_FIELDS = [
    { id: 'fld-ar-kunder', key: 'kunder' },
    { id: 'fld-ar-distribution', key: 'distribution' },
    { id: 'fld-ar-geografi', key: 'geografi' },
    { id: 'fld-ar-verksamhet', key: 'verksamhet' }
  ];

  const LANSSTYRELSEN_INFOTEXT = {
    kunder: 'Länsstyrelsens krav: Finns det omständigheter hos dina kunder, dina kunders verksamheter och branscher som kan innebära risker för din verksamhet? I penningtvättslagen (kapitel 2, paragraf 4 och 5) finns exempel på omständigheter som kan tyda på låg eller hög risk. Observera! Exemplen i de två lagparagraferna är inte heltäckande och du måste utgå från relevanta omständigheter hos kundtyperna i din verksamhet.',
    distribution: 'Länsstyrelsens krav: Erbjuder din verksamhet produkter och tjänster som gör det svårare för dig att överblicka hur och vad kunden använder produkter och tjänster till? Det handlar om vilken kontroll du har över din verksamhets produkter och tjänster när du tillhandahåller dem till kunden. Till exempel om tjänsten erbjuds på distans, genom en tredje part eller via ett webbaserat forum. Det kan vara så att du erbjuder en produkt som i sig innebär en låg risk, men ditt leveranssätt innebär en hög risk, vilket i kombination kan göra att risken för att produkten kan utnyttjas blir högre. Om du använder en extern tjänsteleverantör för olika delar av dina skyldigheter avseende bekämpning av penningtvätt och finansiering av terrorism kan det också innebära risker, och ett sådant system är inte en ersättning för personalens vaksamhet.',
    geografi: 'Länsstyrelsens krav: Du behöver ha kunskap om de länder och områden som du och dina kunder är verksamma eller bosatta i, eller har anknytning till, och relevanta förhållanden kopplade till dessa länder och områden som kan leda till att dina produkter och tjänster utnyttjas. Du kan erbjuda en tjänst som i sig innebär en låg risk, men risken för att tjänsten kan utnyttjas blir högre när du till exempel erbjuder tjänsten i ett land där det förekommer korruption, det saknas ett effektivt regelverk mot penningtvätt, eller som är ett högrisktredjeland enligt EU-kommissionen.',
    verksamhet: 'Länsstyrelsens krav: Finns det specifika omständigheter i din verksamhet? Det handlar alltså inte om sårbarheter i allmänhet, utan du behöver analysera din egen verksamhet. Till exempel din verksamhets storlek eller hur komplex organisationen är.\n\nStäll dig frågan: Hur kan byråns organisation, arbetssätt, kompetens eller kontrollmiljö göra det lättare eller svårare att upptäcka att en redovisningstjänst utnyttjas för penningtvätt eller finansiering av terrorism?'
  };

  const BANKID_KYC_TEXT = 'I ClientFlow gör vi identifiering av kunden med BankID. Saknas möjlighet till BankID tas kopia av körkort eller pass och sparas i ClientFlow. För distanskunder begär vi vidimerad kopia av motsvarande handlingar.';

  function parseKartlaggningJson(raw) {
    if (!raw) return {};
    if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
    try {
      var parsed = JSON.parse(String(raw));
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  const AR_LAYOUT_BLOCKS = [
    'ar-tjanster-chart',
    'ar-kundtyper-body',
    'ar-flaggor-chart',
    'ar-distribution-live',
    'ar-distribution-chart',
    'ar-geografi-body',
    'ar-geografi-chart',
    'ar-bankid-text',
    'ar-kartlaggning-hint',
    'identifierade-risker-live',
    'ar-identifierade-nya-hint'
  ];

  var _arLayout = { titles: {}, hidden: [] };
  var _arLayoutDirty = false;

  function readKartlaggningFromForm() {
    var out = {};
    KARTLAGGNING_FIELDS.forEach(function (m) {
      var el = getEl(m.id);
      out[m.key] = el ? String(el.value || '').trim() : '';
    });
    return out;
  }

  function readFullKartlaggningJson() {
    var out = readKartlaggningFromForm();
    if (_arLayout.titles && Object.keys(_arLayout.titles).length) {
      out.layout = out.layout || {};
      out.layout.titles = Object.assign({}, _arLayout.titles);
    }
    if (_arLayout.hidden && _arLayout.hidden.length) {
      out.layout = out.layout || {};
      out.layout.hidden = _arLayout.hidden.slice();
    }
    return out;
  }

  function loadArLayoutFromData(data) {
    var layout = data && data.layout && typeof data.layout === 'object' ? data.layout : {};
    _arLayout = {
      titles: layout.titles && typeof layout.titles === 'object' ? Object.assign({}, layout.titles) : {},
      hidden: Array.isArray(layout.hidden) ? layout.hidden.filter(Boolean) : []
    };
  }

  function tagArTitleIds() {
    document.querySelectorAll('.byra-card[data-card-id] > .byra-card-view > .byra-card-label').forEach(function (el) {
      if (!el.getAttribute('data-ar-title-id')) {
        el.setAttribute('data-ar-title-id', el.closest('.byra-card').getAttribute('data-card-id'));
      }
    });
    document.querySelectorAll('.byra-card[data-field-id] > .byra-card-view > .byra-card-label').forEach(function (el) {
      if (!el.getAttribute('data-ar-title-id')) {
        el.setAttribute('data-ar-title-id', el.closest('.byra-card').getAttribute('data-field-id'));
      }
    });
  }

  function applyArLayout() {
    document.querySelectorAll('[data-ar-title-id]').forEach(function (el) {
      var id = el.getAttribute('data-ar-title-id');
      var custom = _arLayout.titles[id];
      if (!custom) return;
      var target = el.querySelector('[data-ar-title-text]') || el;
      target.textContent = custom;
    });
    AR_LAYOUT_BLOCKS.forEach(function (blockId) {
      var el = getEl(blockId);
      if (!el) return;
      var hidden = _arLayout.hidden.indexOf(blockId) !== -1;
      el.style.display = hidden ? 'none' : '';
      el.setAttribute('aria-hidden', hidden ? 'true' : 'false');
      var toolbar = el.previousElementSibling;
      if (toolbar && toolbar.classList && toolbar.classList.contains('ar-block-toolbar')) {
        var icon = toolbar.querySelector('.ar-block-hide-btn i');
        if (icon) icon.className = hidden ? 'fas fa-eye-slash' : 'fas fa-eye';
      }
    });
  }

  function markArLayoutDirty() {
    _arLayoutDirty = true;
    var btn = getEl('btn-ar-save-layout');
    if (btn) btn.classList.add('btn--dirty');
  }

  function initArTitleEditors(canEdit) {
    if (!canEdit) return;
    document.querySelectorAll('[data-ar-title-id]').forEach(function (el) {
      if (el.querySelector('.ar-title-edit-btn')) return;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ar-title-edit-btn';
      btn.title = 'Redigera rubrik';
      btn.innerHTML = '<i class="fas fa-pencil-alt"></i>';
      btn.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        var target = el.querySelector('[data-ar-title-text]') || el;
        var current = target.textContent.trim();
        var next = window.prompt('Rubrik:', current);
        if (next == null) return;
        var trimmed = next.trim();
        if (!trimmed) return;
        var id = el.getAttribute('data-ar-title-id');
        _arLayout.titles[id] = trimmed;
        target.textContent = trimmed;
        markArLayoutDirty();
      });
      el.classList.add('ar-title-editable');
      el.appendChild(btn);
    });
  }

  function toggleArBlockHidden(blockId) {
    var idx = _arLayout.hidden.indexOf(blockId);
    if (idx === -1) _arLayout.hidden.push(blockId);
    else _arLayout.hidden.splice(idx, 1);
    applyArLayout();
    markArLayoutDirty();
  }

  function initArBlockToggles(canEdit) {
    if (!canEdit) return;
    AR_LAYOUT_BLOCKS.forEach(function (blockId) {
      var el = getEl(blockId);
      if (!el) return;
      if (el.previousElementSibling && el.previousElementSibling.classList.contains('ar-block-toolbar')) return;
      var bar = document.createElement('div');
      bar.className = 'ar-block-toolbar';
      var hidden = _arLayout.hidden.indexOf(blockId) !== -1;
      bar.innerHTML = '<button type="button" class="ar-block-hide-btn" data-ar-block="' + blockId + '" title="Dölj eller visa detta block">'
        + '<i class="fas fa-' + (hidden ? 'eye-slash' : 'eye') + '"></i> Dölj/visa</button>';
      el.parentNode.insertBefore(bar, el);
      bar.querySelector('.ar-block-hide-btn').addEventListener('click', function (ev) {
        ev.preventDefault();
        toggleArBlockHidden(blockId);
      });
    });
  }

  async function saveArLayout() {
    var status = getEl('ar-layout-save-status');
    var btn = getEl('btn-ar-save-layout');
    var idEl = getEl('byra-rutiner-record-id');
    var recordId = idEl ? idEl.value.trim() : '';
    if (!recordId) {
      if (status) status.textContent = 'Ingen post att spara till.';
      return;
    }
    if (status) status.textContent = 'Sparar...';
    if (btn) btn.disabled = true;
    try {
      var fields = {};
      fields[KARTLAGGNING_AIRTABLE] = JSON.stringify(readFullKartlaggningJson());
      var res = await fetch(getBaseUrl() + '/api/byra-rutiner/' + encodeURIComponent(recordId), {
        method: 'PATCH',
        ...getAuthOpts(),
        body: JSON.stringify({ fields: fields })
      });
      var data = await res.json().catch(function () { return {}; });
      if (res.ok) {
        _arLayoutDirty = false;
        if (btn) btn.classList.remove('btn--dirty');
        if (status) {
          status.textContent = 'Anpassningar sparade';
          setTimeout(function () { status.textContent = ''; }, 2500);
        }
      } else {
        var errMsg = (data && data.error) || (data && data.message) || 'Kunde inte spara';
        if (status) status.textContent = errMsg;
      }
    } catch (err) {
      if (status) status.textContent = 'Fel vid sparande';
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function initArLayoutEditor(canEdit) {
    if (!canEdit) return;
    tagArTitleIds();
    initArTitleEditors(canEdit);
    initArBlockToggles(canEdit);
    applyArLayout();
    var btn = getEl('btn-ar-save-layout');
    if (btn) {
      btn.style.display = '';
      btn.addEventListener('click', function () { saveArLayout(); });
    }
  }

  function populateKartlaggning(fields) {
    var data = parseKartlaggningJson(getFieldValue(fields, KARTLAGGNING_AIRTABLE));
    KARTLAGGNING_FIELDS.forEach(function (m) {
      var el = getEl(m.id);
      if (el) el.value = data[m.key] == null ? '' : String(data[m.key]);
    });
    loadArLayoutFromData(data);
  }

  function initKartlaggningInfotext() {
    document.querySelectorAll('.ar-info-tip[data-lansstyrelse]').forEach(function (tip) {
      var key = tip.getAttribute('data-lansstyrelse');
      var bubble = tip.querySelector('.ar-info-tip-bubble');
      if (!bubble || !key || !LANSSTYRELSEN_INFOTEXT[key]) return;
      var text = LANSSTYRELSEN_INFOTEXT[key].replace(/^Länsstyrelsens krav:\s*/i, '');
      bubble.innerHTML = '<strong>Länsstyrelsens krav</strong><br>' + escapeHtml(text);
    });
    var bankId = getEl('ar-bankid-text');
    if (bankId) bankId.textContent = BANKID_KYC_TEXT;
  }

  const RISK_FALT_AIRTABLE = '4. Identifierade Risker och Sårbarheter';
  var tjanstIdToNamn = {};

  function getEl(id) { return document.getElementById(id); }
  function getAuthOpts() { return (window.AuthManager && AuthManager.getAuthFetchOptions && AuthManager.getAuthFetchOptions()) || { credentials: 'include', headers: { 'Content-Type': 'application/json' } }; }
  function getBaseUrl() { return (window.apiConfig && window.apiConfig.baseUrl) || ''; }

  function getFieldValue(fields, airtableKey) {
    var val = fields[airtableKey];
    if (val === undefined || val === null) val = fields[airtableKey.trim()];
    if (typeof val === 'object' && val !== null && !Array.isArray(val)) return '';
    if (Array.isArray(val)) return '';
    return val;
  }

  function escapeHtml(s) {
    if (!s) return '';
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function isAirtableRecordId(s) {
    return typeof s === 'string' && /^rec[a-zA-Z0-9]{10,}$/.test(String(s).trim());
  }

  function isEmptyRiskValue(v) {
    var t = String(v == null ? '' : v).trim();
    return !t || /^[—\-–\s.]+$/.test(t);
  }

  function isIdentifieradeDump(text) {
    return /\*\*Tjänst:|\*\*Produkter och tjänster\*\*|Tjänstebeskrivning och inneboende risk/.test(String(text || ''));
  }

  function sanitizeIdentifieradeRiskerText(text) {
    if (!text || typeof text !== 'string') return text || '';
    var out = text;
    Object.keys(tjanstIdToNamn).forEach(function (id) {
      var namn = tjanstIdToNamn[id];
      if (!id || !namn) return;
      var esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      out = out.replace(new RegExp('(\\*\\*Tjänst:\\s*)' + esc + '(\\s*\\*\\*)', 'gi'), '$1' + namn + '$2');
      out = out.replace(new RegExp('(^|\\r?\\n)(Tjänst:\\s*)' + esc + '(?=\\s*(?:\\r?\\n|$))', 'gim'), '$1$2' + namn);
    });
    out = out.replace(/(\*\*Tjänst:\s*)(rec[a-zA-Z0-9]{10,})(\s*\*\*)/gi, function (_, p1, id, p3) {
      return tjanstIdToNamn[id] ? p1 + tjanstIdToNamn[id] + p3 : _;
    });
    out = out.replace(/(^|\r?\n)(Tjänst:\s*)(rec[a-zA-Z0-9]{10,})(?=\s*(?:\r?\n|$))/gim, function (full, p1, p2, id) {
      return tjanstIdToNamn[id] ? p1 + p2 + tjanstIdToNamn[id] : full;
    });
    return stripEmptyTjanstRiskSections(out);
  }

  function stripEmptyTjanstRiskSections(text) {
    if (!text) return '';
    var blocks = text.split(/\n\n+/);
    var kept = blocks.filter(function (block) {
      var trimmed = block.trim();
      if (!/^\*\*Tjänst:|^Tjänst:/im.test(trimmed)) return true;
      var hotM = trimmed.match(/\*\*Hot:\*\*\s*([^\n]*?)(?:\n|$)|^Hot:\s*([^\n]*?)(?:\n|$)/im);
      var sarM = trimmed.match(/\*\*Sårbarhet:\*\*\s*([^\n]*?)(?:\n|$)|^Sårbarhet:\s*([^\n]*?)(?:\n|$)/im);
      var riskM = trimmed.match(/\*\*Risknivå och åtgärder:\*\*\s*([^\n]*?)(?:\n|$)|^Risknivå och åtgärder:\s*([^\n]*?)(?:\n|$)/im);
      var h = hotM ? (hotM[1] != null ? hotM[1] : hotM[2]) : '';
      var s = sarM ? (sarM[1] != null ? sarM[1] : sarM[2]) : '';
      var r = riskM ? (riskM[1] != null ? riskM[1] : riskM[2]) : '';
      if (!isEmptyRiskValue(h) || !isEmptyRiskValue(s) || !isEmptyRiskValue(r)) return true;
      var body = trimmed
        .replace(/^\*\*Tjänst:[^\n]+\*\*\s*/i, '')
        .replace(/^Tjänst:[^\n]+\s*/i, '')
        .replace(/\*\*Hot:\*\*[^\n]*/gi, '')
        .replace(/\*\*Sårbarhet:\*\*[^\n]*/gi, '')
        .replace(/\*\*Risknivå och åtgärder:\*\*[^\n]*/gi, '')
        .replace(/^Hot:[^\n]*/gim, '')
        .replace(/^Sårbarhet:[^\n]*/gim, '')
        .replace(/^Risknivå och åtgärder:[^\n]*/gim, '')
        .trim();
      if (!body || /^[—\-–\s.]*$/.test(body)) return false;
      return true;
    });
    return kept.join('\n\n');
  }

  function markdownToHtml(text) {
    if (!text || typeof text !== 'string') return '';
    var t = escapeHtml(sanitizeIdentifieradeRiskerText(text));
    t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/\*(.+?)\*/g, '<em>$1</em>');
    var lines = t.split(/\r?\n/);
    var out = [];
    var inUl = false, inOl = false;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      // Punktlista: stöd både "-" och "•" i början av raden
      if (/^(-|\u2022)\s/.test(line)) {
        if (!inUl) { if (inOl) { out.push('</ol>'); inOl = false; } out.push('<ul>'); inUl = true; }
        out.push('<li>' + line.replace(/^(-|\u2022)\s/, '') + '</li>');
      } else if (/^\d+\.\s/.test(line)) {
        if (!inOl) { if (inUl) { out.push('</ul>'); inUl = false; } out.push('<ol>'); inOl = true; }
        out.push('<li>' + line.replace(/^\d+\.\s/, '') + '</li>');
      } else {
        if (inUl) { out.push('</ul>'); inUl = false; }
        if (inOl) { out.push('</ol>'); inOl = false; }
        out.push(line ? '<p>' + line + '</p>' : '<br>');
      }
    }
    if (inUl) out.push('</ul>');
    if (inOl) out.push('</ol>');
    return out.length ? out.join('') : '—';
  }

  function getDisplayValue(el, m) {
    if (!el) return '';
    var v = el.value || '';
    if (m && m.type === 'number') return String(v);
    return String(v).trim() || '—';
  }

  function formatDateForDisplay(isoOrYyyyMmDd) {
    if (!isoOrYyyyMmDd || typeof isoOrYyyyMmDd !== 'string') return '';
    var m = String(isoOrYyyyMmDd).substring(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return isoOrYyyyMmDd;
    var months = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];
    var mo = months[parseInt(m[2], 10) - 1] || m[2];
    return m[3] + ' ' + mo + ' ' + m[1];
  }

  function updateCardView(card) {
    var fid = card.getAttribute('data-field-id');
    if (fid === 'fld-identifierade-risker') return;
    var kartField = KARTLAGGNING_FIELDS.find(function (x) { return x.id === fid; });
    if (kartField) {
      var elK = getEl(kartField.id);
      var viewK = card.querySelector('.byra-card-value');
      if (viewK && elK) {
        var rawK = String(elK.value || '').trim() || '—';
        viewK.innerHTML = rawK === '—' ? '—' : '<div class="byra-card-formatted">' + markdownToHtml(rawK) + '</div>';
      }
      return;
    }
    if (fid) {
      var el = getEl(fid);
      var m = FIELD_MAP.find(function (x) { return x.id === fid; });
      var view = card.querySelector('.byra-card-value');
      if (view && el) {
        var raw = getDisplayValue(el, m);
        if (m && m.type === 'number') {
          view.textContent = raw;
        } else if (m && m.type === 'date') {
          view.textContent = raw === '—' ? '—' : formatDateForDisplay(raw);
        } else if (m && m.id === 'fld-vardering-risk' && riskSkala()) {
          var nivaEl = getEl('fld-sammantagen-niva');
          var niva = riskSkala().riskLabelSv((nivaEl && nivaEl.value) || el.value);
          var body = riskSkala().stripRiskLevelPrefix(el.value);
          var badge = niva ? '<span class="risk-pill ' + riskSkala().riskPillClass(niva) + '">' + niva + '</span>' : '';
          var textHtml = body && body !== '—' ? '<div class="byra-card-formatted">' + markdownToHtml(body) + '</div>' : '';
          view.innerHTML = badge || textHtml ? badge + textHtml : '—';
        } else {
          view.innerHTML = raw === '—' ? '—' : '<div class="byra-card-formatted">' + markdownToHtml(raw) + '</div>';
        }
      }
    }
  }

  function cardDirectView(card) {
    return card.querySelector(':scope > .byra-card-view');
  }

  function cardDirectEdit(card) {
    return card.querySelector(':scope > .byra-card-edit');
  }

  function editButtonsOwnedByCard(card) {
    var view = cardDirectView(card);
    if (!view) return [];
    return Array.from(view.querySelectorAll('.byra-card-edit-btn')).filter(function (btn) {
      return btn.closest('.byra-card') === card;
    });
  }

  function showView(card) {
    var view = cardDirectView(card);
    var edit = cardDirectEdit(card);
    if (view) view.style.display = 'block';
    if (edit) edit.style.display = 'none';
  }

  function showEdit(card) {
    var view = cardDirectView(card);
    var edit = cardDirectEdit(card);
    if (view) view.style.display = 'none';
    if (edit) edit.style.display = 'block';
  }

  function riskSkala() {
    return window.RiskSkala || null;
  }

  function applySammantagenFromText(text) {
    var skala = riskSkala();
    var nivaEl = getEl('fld-sammantagen-niva');
    var ta = getEl('fld-vardering-risk');
    if (!nivaEl || !ta) return;
    if (skala) {
      var key = skala.normalizeRiskKey(text);
      nivaEl.value = key ? skala.riskLabelSv(key) : '';
      ta.value = skala.stripRiskLevelPrefix(text);
    } else {
      ta.value = text || '';
    }
  }

  function composeVarderingText() {
    var skala = riskSkala();
    var nivaEl = getEl('fld-sammantagen-niva');
    var ta = getEl('fld-vardering-risk');
    var body = ta ? ta.value : '';
    if (!skala || !nivaEl || !nivaEl.value) return body;
    return skala.withRiskLevelPrefix(body, nivaEl.value);
  }

  function populateForm(fields, canEdit) {
    FIELD_MAP.forEach(function (m) {
      var el = getEl(m.id);
      if (!el) return;
      var val = getFieldValue(fields, m.airtable);
      if (m.airtable === RISK_FALT_AIRTABLE) {
        val = val && isIdentifieradeDump(val) ? '' : val;
        if (val) val = sanitizeIdentifieradeRiskerText(String(val));
      }
      if (m.type === 'number') el.value = val === '' || val == null ? '' : Number(val);
      else if (m.type === 'date') el.value = val ? String(val).substring(0, 10) : '';
      else el.value = val == null ? '' : String(val);
    });
    applySammantagenFromText(getEl('fld-vardering-risk') ? getEl('fld-vardering-risk').value : '');
    populateKartlaggning(fields);
    initKartlaggningInfotext();
    var riskaptitEl = getEl('fld-riskaptit-policy');
    if (riskaptitEl && !String(riskaptitEl.value || '').trim() && window.Riskaptit && Riskaptit.policyText) {
      riskaptitEl.value = Riskaptit.policyText();
    }
    var defs = getEl('byra-riskskala-defs');
    if (defs && riskSkala()) defs.innerHTML = riskSkala().definitionsHtml();
    document.querySelectorAll('.byra-card').forEach(updateCardView);
  }

  function initPreviews(canEdit) {
    document.querySelectorAll('.byrarutiner-rich-field').forEach(function (field) {
      var ta = field.querySelector('textarea');
      if (!ta) return;
      ta.style.display = 'block';
      if (canEdit && field.querySelector('.byrarutiner-format-toolbar')) field.querySelector('.byrarutiner-format-toolbar').style.display = 'flex';
      else if (!canEdit && field.querySelector('.byrarutiner-format-toolbar')) field.querySelector('.byrarutiner-format-toolbar').style.display = 'none';
    });
  }

  async function saveFields(fields, card, onDone) {
    var idEl = getEl('byra-rutiner-record-id'), recordId = idEl ? idEl.value.trim() : '';
    if (!recordId) { if (onDone) onDone('Ingen post.', true); return; }
    var status = card ? card.querySelector('.card-save-status') : null;
    if (status) status.textContent = 'Sparar...';
    var btn = card ? card.querySelector('.card-save-btn') : null;
    if (btn) btn.disabled = true;
    try {
      var res = await fetch(getBaseUrl() + '/api/byra-rutiner/' + encodeURIComponent(recordId), {
        method: 'PATCH',
        ...getAuthOpts(),
        body: JSON.stringify({ fields, aiAudit: window._lastArAiAudit || undefined })
      });
      var data = await res.json().catch(function () { return {}; });
      if (res.ok) {
        window._lastArAiAudit = null;
        if (status) { status.textContent = 'Sparad'; setTimeout(function () { status.textContent = ''; }, 2000); }
        document.querySelectorAll('.byra-card').forEach(updateCardView);
        if (card) showView(card);
      } else {
        var errMsg = (data && data.error) || (data && data.message) || 'Kunde inte spara';
        var detail = (data && data.airtableError && (data.airtableError.error && data.airtableError.error.message || data.airtableError.message)) || '';
        if (detail) errMsg += ' (' + detail + ')';
        if (status) status.textContent = typeof errMsg === 'string' ? errMsg : 'Kunde inte spara';
        console.error('Sparfel riskbedömning:', data);
        if (data.attemptedPayload) console.log('Skickad payload:', data.attemptedPayload);
      }
    } catch (err) {
      if (status) status.textContent = 'Fel vid sparande';
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function initCards(canEdit) {
    document.querySelectorAll('.byra-card').forEach(function (card) {
      if (card.hasAttribute('data-card-id') && !card.hasAttribute('data-field-id')) return;
      var view = cardDirectView(card);
      var edit = cardDirectEdit(card);
      if (!view || !edit) return;
      var ownedEditBtns = editButtonsOwnedByCard(card);
      if (!view.querySelector('.byra-card-label') && !card.classList.contains('byra-card--flat')) {
        var labelText = '';
        var formGroup = edit.querySelector('.form-group.full-width');
        var lbl = formGroup ? formGroup.querySelector('label') : null;
        if (lbl) labelText = lbl.textContent;
        if (labelText) {
          var labelEl = document.createElement('div');
          labelEl.className = 'byra-card-label';
          labelEl.textContent = labelText;
          view.insertBefore(labelEl, view.querySelector('.byra-card-value'));
        }
      }
      edit.style.display = 'none';
      if (!canEdit) {
        ownedEditBtns.forEach(function (b) { b.style.display = 'none'; });
        if (ownedEditBtns.length) {
          edit.style.display = 'block';
          view.style.display = 'none';
        }
        return;
      }
      ownedEditBtns.forEach(function (btn) {
        btn.addEventListener('click', function () { showEdit(card); });
      });
    });
    document.querySelectorAll('.byra-card--live-source').forEach(function (card) {
      showView(card);
      card.querySelectorAll('.byra-card-edit-btn').forEach(function (b) { b.style.display = 'none'; });
    });
  }

  function initCardSaveButtons(canEdit) {
    if (!canEdit) return;
    document.querySelectorAll('.byra-card[data-field-id]').forEach(function (card) {
      var fid = card.getAttribute('data-field-id');
      if (fid === 'fld-identifierade-risker') return;
      var kartField = KARTLAGGNING_FIELDS.find(function (x) { return x.id === fid; });
      if (kartField) {
        var formGroup = card.querySelector('.form-group');
        if (!formGroup || formGroup.querySelector('.card-save-btn')) return;
        var wrapK = document.createElement('div');
        wrapK.className = 'card-save-wrap';
        var btnK = document.createElement('button');
        btnK.type = 'button';
        btnK.className = 'btn btn-primary btn-sm card-save-btn';
        btnK.innerHTML = '<i class="fas fa-save"></i> Spara';
        var statusK = document.createElement('span');
        statusK.className = 'card-save-status';
        wrapK.appendChild(btnK);
        wrapK.appendChild(statusK);
        formGroup.appendChild(wrapK);
        btnK.addEventListener('click', function () {
          var fieldsK = {};
          fieldsK[KARTLAGGNING_AIRTABLE] = JSON.stringify(readFullKartlaggningJson());
          saveFields(fieldsK, card);
        });
        return;
      }
      var m = FIELD_MAP.find(function (x) { return x.id === fid; });
      if (!m) return;
      var formGroup = card.querySelector('.form-group');
      if (!formGroup || formGroup.querySelector('.card-save-btn')) return;
      var wrap = document.createElement('div');
      wrap.className = 'card-save-wrap';
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-primary btn-sm card-save-btn';
      btn.innerHTML = '<i class="fas fa-save"></i> Spara';
      var status = document.createElement('span');
      status.className = 'card-save-status';
      wrap.appendChild(btn);
      wrap.appendChild(status);
      formGroup.appendChild(wrap);
      btn.addEventListener('click', function () {
        var el = getEl(m.id);
        if (!el) return;
        var val = el.value;
        if (m.type === 'number') { var n = parseFloat(String(val).trim()); val = isNaN(n) ? '' : String(n); }
        else if (m.type === 'date') val = String(val || '').trim().substring(0, 10);
        else val = String(val || '').trim();
        if (m.id === 'fld-vardering-risk') val = composeVarderingText();
        var fields = {}; fields[m.airtable] = val;
        saveFields(fields, card);
      });
    });
  }

  function applyFormat(ta, format) {
    var start = ta.selectionStart, end = ta.selectionEnd, text = ta.value, selected = text.substring(start, end);
    var before = text.substring(0, start), after = text.substring(end), replacement = '';
    if (format === 'bold') replacement = selected ? '**' + selected + '**' : '**';
    else if (format === 'italic') replacement = selected ? '*' + selected + '*' : '*';
    else if (format === 'bullet' || format === 'numbered') {
      var lineStart = text.lastIndexOf('\n', start - 1) + 1;
      replacement = format === 'bullet' ? '- ' : '1. ';
      ta.value = text.substring(0, lineStart) + replacement + text.substring(lineStart);
      ta.selectionStart = ta.selectionEnd = lineStart + replacement.length;
      ta.focus();
      return;
    } else return;
    if (format === 'bold' || format === 'italic') {
      ta.value = before + replacement + after;
      ta.selectionStart = ta.selectionEnd = start + replacement.length;
      ta.focus();
    }
  }

  function initFormatToolbars() {
    document.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest && e.target.closest('.format-btn');
      if (!btn) return;
      e.preventDefault();
      var field = btn.closest('.byrarutiner-rich-field'), ta = field ? field.querySelector('textarea') : null;
      if (!ta || ta.readOnly) return;
      applyFormat(ta, btn.getAttribute('data-format'));
    });
  }

  async function load() {
    var loading = getEl('loading'), noData = getEl('no-data'), content = getEl('content');
    var canEdit = true;
    try {
      var meRes = await fetch(getBaseUrl() + '/api/auth/me', getAuthOpts());
      if (meRes.ok) {
        var meData = await meRes.json();
        canEdit = (meData.user && ['ClientFlowAdmin', 'Ledare'].includes(meData.user.role));
      }
    } catch (_) {}
    try {
      tjanstIdToNamn = {};
      var res = await fetch(getBaseUrl() + '/api/byra-rutiner', getAuthOpts());
      var data = await res.json();
      if (loading) loading.style.display = 'none';
      if (!res.ok) {
        if (noData) { noData.style.display = 'block'; noData.querySelector('p').textContent = data.message || data.error || 'Kunde inte hämta.'; }
        return;
      }
      if (!data.record || !data.fields) {
        if (noData) noData.style.display = 'block';
        return;
      }
      var recordId = getEl('byra-rutiner-record-id');
      if (recordId) recordId.value = data.id || data.record.id || '';
      try {
        var meRes2 = await fetch(getBaseUrl() + '/api/auth/me', getAuthOpts());
        if (meRes2.ok) {
          var me2 = await meRes2.json();
          var byraId = me2.user && me2.user.byraId;
          if (byraId) {
            var tjRes = await fetch(getBaseUrl() + '/api/byra-tjanster?byraId=' + encodeURIComponent(byraId), getAuthOpts());
            if (tjRes.ok) {
              var tjData = await tjRes.json();
              (tjData.tjanster || []).forEach(function (t) {
                if (t.id && t.namn && !isAirtableRecordId(t.namn)) tjanstIdToNamn[t.id] = String(t.namn).trim();
              });
            }
          }
        }
      } catch (_) {}
      populateForm(data.fields, canEdit);
      initPreviews(canEdit);
      initCards(canEdit);
      initCardSaveButtons(canEdit);
      var live = getEl('identifierade-risker-live');
      var source = data.identifieradeRiskerSource || { tjanster: [], ovriga: [] };
      if (live && window.IdentifieradeRiskerView) {
        IdentifieradeRiskerView.mount(live, source, { only: 'tjanster' });
      }
      var distLive = getEl('ar-distribution-live');
      if (distLive && window.IdentifieradeRiskerView) {
        IdentifieradeRiskerView.mount(distLive, source, { only: 'distribution' });
      }
      window._arIdentifieradeSource = source;
      initCollapsibleCards();
      initArLayoutEditor(canEdit);
      loadArStatistikBlock();
      if (content) content.style.display = 'block';
      var headerActions = getEl('allman-risk-header-actions');
      if (headerActions) headerActions.style.display = 'flex';
      if (!canEdit) FIELD_MAP.forEach(function (m) { var el = getEl(m.id); if (el) el.readOnly = true; });
    } catch (err) {
      console.error('Allmän riskbedömning load error:', err);
      if (loading) loading.style.display = 'none';
      if (noData) { noData.style.display = 'block'; noData.querySelector('p').textContent = 'Ett fel uppstod vid hämtning.'; }
    }
  }

  function initAiVarderingRisk() {
    var btn = getEl('btn-ai-vardering-risk');
    var card = document.querySelector('.byra-card[data-field-id="fld-vardering-risk"]');
    var ta = getEl('fld-vardering-risk');
    if (!btn || !card || !ta) return;
    btn.addEventListener('click', async function () {
      var origHtml = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> AI tänker...';
      if (typeof window.showAiThinking === 'function') window.showAiThinking();
      showEdit(card);
      ta.focus();
      try {
        var res = await fetch(getBaseUrl() + '/api/ai-vardering-risk-byra', {
          method: 'POST',
          ...getAuthOpts()
        });
        var data = await res.json().catch(function () { return {}; });
        if (res.ok && data.text) {
          if (data.auditLogId) window._lastArAiAudit = { logId: data.auditLogId };
          applySammantagenFromText(data.text);
          updateCardView(card);
        } else {
          alert(data.error || data.message || 'Kunde inte generera AI-förslag');
        }
      } catch (err) {
        console.error('AI värdering risk:', err);
        alert('Kunde inte generera AI-förslag: ' + (err.message || 'Okänt fel'));
      } finally {
        if (typeof window.hideAiThinking === 'function') window.hideAiThinking();
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-robot"></i> Generera AI-förslag';
      }
    });
  }

  function initAiBeskrivning() {
    var btn = getEl('btn-ai-beskrivning');
    var card = document.querySelector('.byra-card[data-field-id="fld-beskrivning"]');
    var ta = getEl('fld-beskrivning');
    if (!btn || !card || !ta) return;
    btn.addEventListener('click', async function () {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> AI tänker...';
      if (typeof window.showAiThinking === 'function') window.showAiThinking();
      showEdit(card);
      ta.focus();
      try {
        var res = await fetch(getBaseUrl() + '/api/ai-beskrivning-byra', {
          method: 'POST',
          ...getAuthOpts()
        });
        var data = await res.json().catch(function () { return {}; });
        if (res.ok && data.text) {
          if (data.auditLogId) window._lastArAiAudit = { logId: data.auditLogId };
          ta.value = data.text;
          updateCardView(card);
        } else {
          alert(data.error || data.message || 'Kunde inte generera AI-förslag');
        }
      } catch (err) {
        console.error('AI beskrivning:', err);
        alert('Kunde inte generera AI-förslag: ' + (err.message || 'Okänt fel'));
      } finally {
        if (typeof window.hideAiThinking === 'function') window.hideAiThinking();
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-robot"></i> Generera AI-förslag';
      }
    });
  }

  function initCollapsibleCards() {
    document.querySelectorAll('.byra-card--collapsible').forEach(function (card) {
      if (card.getAttribute('data-collapse-bound') === '1') return;
      card.setAttribute('data-collapse-bound', '1');
      var toggle = card.querySelector('.byra-card-collapse-toggle');
      var label = card.querySelector('.byra-card-label');
      function flip() {
        var open = !card.classList.contains('is-collapsed');
        card.classList.toggle('is-collapsed', open);
        card.classList.toggle('open', !open);
        if (toggle) toggle.setAttribute('aria-expanded', open ? 'false' : 'true');
      }
      if (toggle) toggle.addEventListener('click', function (ev) { ev.preventDefault(); flip(); });
      if (label) {
        label.style.cursor = 'pointer';
        label.addEventListener('click', function () { flip(); });
      }
    });
  }

  var PIE_COLORS = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#f43f5e', '#64748b', '#d946ef'];

  function flaggKlassBadge(klass) {
    var Kat = window.OvrigaRiskKategorier;
    if (Kat && Kat.klassBadge) return Kat.klassBadge(klass) || '';
    if (klass === 'GOLV_HOG') return 'Hög-aktiv';
    if (klass === 'BIDRAR_VID_KOMBINATION') return 'Bidrar vid kombination';
    return '';
  }

  function renderBarChartHtml(rows, opts) {
    opts = opts || {};
    var list = (rows || []).filter(function (t) { return t && t.namn; });
    if (!list.length) {
      return '<p class="identifierade-empty">' + (opts.empty || 'Inga värden att visa.') + '</p>';
    }
    var max = list.reduce(function (m, t) { return Math.max(m, Number(t.antal) || 0); }, 0) || 1;
    var chartClass = 'ar-bar-chart' + (opts.chartClass ? ' ' + opts.chartClass : '');
    return (opts.title ? '<h4 class="ar-chart-title">' + opts.title + '</h4>' : '')
      + (opts.hint ? '<p class="byra-card-source-hint">' + opts.hint + '</p>' : '')
      + '<div class="' + chartClass + '" role="img" aria-label="' + escapeHtml(opts.aria || opts.title || 'Stapeldiagram') + '">'
      + list.map(function (t) {
        var n = Number(t.antal) || 0;
        var pct = Math.round((n / max) * 100);
        var badge = opts.showKlass ? flaggKlassBadge(t.klass) : '';
        var fillClass = t.klass === 'GOLV_HOG' ? ' ar-bar-fill--golv'
          : (t.klass === 'BIDRAR_VID_KOMBINATION' ? ' ar-bar-fill--bidrar' : '');
        return '<div class="ar-bar-row">'
          + '<span class="ar-bar-label">' + escapeHtml(t.namn)
          + (badge ? ' <em class="ar-flaggor-klass">' + escapeHtml(badge) + '</em>' : '')
          + '</span>'
          + '<div class="ar-bar-track"><div class="ar-bar-fill' + fillClass + '" style="width:' + pct + '%"></div></div>'
          + '<span class="ar-bar-value">' + n + '</span>'
          + '</div>';
      }).join('')
      + '</div>';
  }

  function renderTjansterBarChart(tjanster) {
    var wrap = getEl('ar-tjanster-chart');
    if (!wrap) return;
    wrap.innerHTML = renderBarChartHtml(tjanster, {
      aria: 'Antal kunder per tjänst',
      empty: 'Inga kunder har en kopplad tjänst ännu.'
    });
  }

  function pieSlicePath(cx, cy, radius, start, end) {
    var slice = end - start;
    if (slice >= Math.PI * 2 - 1e-6) {
      return 'M ' + (cx - radius) + ' ' + cy
        + ' a ' + radius + ' ' + radius + ' 0 1 0 ' + (radius * 2) + ' 0'
        + ' a ' + radius + ' ' + radius + ' 0 1 0 ' + (-radius * 2) + ' 0';
    }
    var x1 = cx + radius * Math.cos(start);
    var y1 = cy + radius * Math.sin(start);
    var x2 = cx + radius * Math.cos(end);
    var y2 = cy + radius * Math.sin(end);
    var large = slice > Math.PI ? 1 : 0;
    return 'M ' + cx + ' ' + cy + ' L ' + x1 + ' ' + y1
      + ' A ' + radius + ' ' + radius + ' 0 ' + large + ' 1 ' + x2 + ' ' + y2 + ' Z';
  }

  function renderPieChart(elId, rows, opts) {
    opts = opts || {};
    var el = getEl(elId);
    if (!el) return;
    var items = (rows || []).filter(function (r) { return r && r.namn && (Number(r.antal) || 0) > 0; });
    if (!items.length) {
      el.innerHTML = opts.empty ? '<p class="identifierade-empty">' + opts.empty + '</p>' : '';
      return;
    }
    var total = items.reduce(function (s, r) { return s + (Number(r.antal) || 0); }, 0) || 1;
    var angle = -Math.PI / 2;
    var paths = items.map(function (item, i) {
      var slice = ((Number(item.antal) || 0) / total) * Math.PI * 2;
      var start = angle;
      angle += slice;
      return '<path d="' + pieSlicePath(80, 80, 70, start, angle) + '" fill="' + PIE_COLORS[i % PIE_COLORS.length] + '"></path>';
    }).join('');
    var legend = items.map(function (item, i) {
      var pct = percentOf(item.antal, total);
      return '<li><span class="ar-pie-swatch" style="background:' + PIE_COLORS[i % PIE_COLORS.length] + '"></span>'
        + '<span class="ar-flaggor-namn">' + escapeHtml(item.namn) + '</span>'
        + ' <span class="ar-flaggor-antal">' + item.antal + ' kunder (' + pct + '%)</span></li>';
    }).join('');
    el.innerHTML = (opts.title ? '<h5 class="ar-chart-title">' + opts.title + '</h5>' : '')
      + (opts.hint ? '<p class="byra-card-source-hint">' + opts.hint + '</p>' : '')
      + '<div class="ar-pie-wrap">'
      + '<svg class="ar-pie-svg" viewBox="0 0 160 160" role="img" aria-label="' + escapeHtml(opts.aria || opts.title || 'Cirkeldiagram') + '">'
      + paths
      + '</svg>'
      + '<ul class="ar-pie-legend">' + legend + '</ul>'
      + '</div>';
  }

  function mergeVarningsflaggor(katalog, kategorier, counts) {
    var countMap = {};
    (counts || []).forEach(function (row) {
      if (!row || !row.namn) return;
      countMap[String(row.namn)] = Number(row.antal) || 0;
    });
    var Kat = window.OvrigaRiskKategorier;
    var KP = window.KundRiskprofil;
    var labels = [];
    if (katalog && typeof katalog === 'object') labels = Object.keys(katalog);
    else if (Kat && Kat.FACTORS) labels = Kat.FACTORS.map(function (f) { return f.label; });
    var seen = {};
    var out = [];
    labels.forEach(function (namn) {
      var label = KP && KP.canonicalRiskhojandeLabel ? KP.canonicalRiskhojandeLabel(namn) : namn;
      if (!label || seen[label.toLowerCase()]) return;
      seen[label.toLowerCase()] = true;
      var klass = (katalog && katalog[namn]) || (katalog && katalog[label]) || '';
      var cat = (kategorier && (kategorier[namn] || kategorier[label])) || (Kat && Kat.categoryFor && Kat.categoryFor(label)) || '';
      out.push({ namn: label, antal: countMap[label] || countMap[namn] || 0, klass: klass, category: cat });
    });
    (counts || []).forEach(function (row) {
      var label = row && row.namn;
      if (!label || seen[String(label).toLowerCase()]) return;
      seen[String(label).toLowerCase()] = true;
      out.push({ namn: label, antal: Number(row.antal) || 0, klass: '', category: '' });
    });
    out.sort(function (a, b) {
      if (b.antal !== a.antal) return b.antal - a.antal;
      return String(a.namn).localeCompare(String(b.namn), 'sv');
    });
    return out;
  }

  function foldNamn(namn) {
    return String(namn || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function isDistributionKanal(namn) {
    var Kat = window.OvrigaRiskKategorier;
    return !!(Kat && Kat.isDistributionKanal && Kat.isDistributionKanal(namn));
  }

  function linkedDistributionNameKeys(stat) {
    var Dim = window.RiskDimensioner;
    var keys = {};
    ((stat && stat.riskfaktorerPerTyp) || []).forEach(function (g) {
      if (!g || !Dim || !Dim.typMatchesDimension || !Dim.typMatchesDimension(g.typ, 'distribution')) return;
      (g.riskfaktorer || []).forEach(function (r) {
        if (r && r.namn) keys[foldNamn(r.namn)] = true;
      });
    });
    return keys;
  }

  function countsForDimension(stat, dimId, source) {
    var Dim = window.RiskDimensioner;
    var groups = (stat && stat.riskfaktorerPerTyp) || [];
    var byKey = {};
    function add(namn, antal) {
      var label = String(namn || '').trim();
      if (!label) return;
      var key = foldNamn(label);
      if (!byKey[key]) byKey[key] = { namn: label, antal: 0 };
      var n = Number(antal) || 0;
      if (n > byKey[key].antal) byKey[key].antal = n;
    }
    groups.forEach(function (g) {
      if (!g) return;
      if (Dim && Dim.typMatchesDimension && !Dim.typMatchesDimension(g.typ, dimId)) return;
      if (!Dim && String(g.typ || '').toLowerCase().indexOf(dimId) === -1) return;
      (g.riskfaktorer || []).forEach(function (r) {
        if (r && r.namn) add(r.namn, r.antal);
      });
    });
    var liveNames = [];
    ((source && source.ovriga) || []).forEach(function (r) {
      if (!r || !r.namn) return;
      if (Dim && Dim.typMatchesDimension && !Dim.typMatchesDimension(r.typ, dimId)) return;
      if (dimId === 'distribution' && !isDistributionKanal(r.namn)) return;
      liveNames.push(r.namn);
      if (!byKey[foldNamn(r.namn)]) add(r.namn, 0);
    });
    ((stat && stat.varningsflaggor) || []).forEach(function (f) {
      if (!f || !f.namn) return;
      var Kat = window.OvrigaRiskKategorier;
      var match = liveNames.some(function (n) { return foldNamn(n) === foldNamn(f.namn); });
      var catId = Kat && Kat.categoryFor ? Kat.categoryFor(f.namn) : '';
      if (dimId === 'distribution') {
        if (isDistributionKanal(f.namn) || match) add(f.namn, f.antal);
        return;
      }
      if (match
        || (dimId === 'verksamhet' && (catId === 'verksamheten' || /verksamhetsspecifik/i.test(f.namn)))) {
        add(f.namn, f.antal);
      }
    });
    var rows = Object.keys(byKey).map(function (k) { return byKey[k]; });
    if (dimId === 'distribution') {
      var linkedKeys = linkedDistributionNameKeys(stat);
      rows = rows.filter(function (row) {
        return isDistributionKanal(row.namn) || linkedKeys[foldNamn(row.namn)];
      });
    }
    return rows
      .sort(function (a, b) {
        if (b.antal !== a.antal) return b.antal - a.antal;
        return String(a.namn).localeCompare(String(b.namn), 'sv');
      });
  }

  function percentOf(antal, total) {
    if (!total) return 0;
    return Math.round((Number(antal) || 0) * 1000 / total) / 10;
  }

  function renderKanalStats(elId, rows, total, emptyText) {
    var el = getEl(elId);
    if (!el) return;
    if (!rows.length) {
      el.innerHTML = emptyText ? '<p class="identifierade-empty">' + emptyText + '</p>' : '';
      return;
    }
    el.innerHTML = '<ul class="ar-kanal-list">' + rows.map(function (r) {
      var pct = percentOf(r.antal, total);
      return '<li><span class="ar-flaggor-namn">' + escapeHtml(r.namn) + '</span>'
        + ' <span class="ar-flaggor-antal">' + r.antal + ' kunder (' + pct + '%)</span></li>';
    }).join('') + '</ul>';
  }

  function renderGeografi(stat) {
    var el = getEl('ar-geografi-body');
    if (!el) return;
    var rows = (stat && stat.hemvist) || [];
    var total = Number(stat && stat.antalKunder) || 0;
    var list = rows.length
      ? '<ul class="ar-kanal-list">' + rows.map(function (r) {
        var pct = percentOf(r.antal, total);
        var badge = r.badge ? ' <em class="ar-flaggor-klass">' + escapeHtml(r.badge) + '</em>' : '';
        return '<li><span class="ar-flaggor-namn">' + escapeHtml(r.namn) + '</span>' + badge
          + ' <span class="ar-flaggor-antal">' + r.antal + ' kunder (' + pct + '%)</span></li>';
      }).join('') + '</ul>'
      : '<p class="identifierade-empty">Inga skatterättsliga hemvister är ifyllda i KYC ännu.</p>';
    el.innerHTML = '<p>Företagen och deras verkliga huvudmän/företrädare som anlitar oss har sin skatterättsliga hemvist i följande länder:</p>'
      + list
      + renderNamedStatList('Länder kunderna handlar med (KYC avsnitt 6)', stat && stat.handelslander)
      + renderNamedStatList('Adresskontroll mot Polisens utsatta områden (uso_2025)', stat && stat.utsattOmrade && stat.utsattOmrade.rader, 'Inga adresser har kontrollerats mot Polisens utsatta områden ännu.')
      + '<p>Den skatterättsliga hemvisten kontrolleras mot EU:s lista gällande risknivåer i olika länder och påverkar kundens risknivå. Adresser i särskilt utsatta områden kopplas automatiskt till geografisk residualrisk.</p>';
    renderPieChart('ar-geografi-chart', rows, {
      title: 'Andel kunder per hemvist',
      hint: 'Fördelning av byråns kunder utifrån skatterättslig hemvist i KYC.',
      aria: 'Cirkeldiagram över skatterättslig hemvist',
      empty: 'Inga skatterättsliga hemvister är ifyllda i KYC ännu.'
    });
  }

  function renderNamedStatList(title, rows, emptyText) {
    if (!rows || !rows.length) return '';
    return '<p><strong>' + escapeHtml(title) + ':</strong> ' + rows.map(function (r) {
      return escapeHtml(r.namn) + ' (' + r.antal + ')';
    }).join(', ') + '</p>';
  }

  function renderKundtyper(stat, katalogPayload) {
    var el = getEl('ar-kundtyper-body');
    if (!el) return;
    var r = (stat && stat.riskniva) || {};
    var n = Number(stat && stat.antalKunder) || 0;
    var lagNormal = (Number(r['Låg']) || 0) + (Number(r['Normal']) || 0) + (Number(r['Medel']) || 0);
    var forhojd = Number(r['Förhöjd']) || 0;
    var hog = Number(r['Hög']) || 0;
    var oacc = Number(r['Oacceptabel']) || 0;
    var pep = Number(stat && stat.antalPepEllerSanktion) || 0;
    var flags = mergeVarningsflaggor(
      katalogPayload && katalogPayload.katalog,
      katalogPayload && katalogPayload.kategorier,
      stat && stat.varningsflaggor
    );
    var langRelation = (stat && stat.risksankande || []).find(function (x) {
      return /lång/i.test(String(x.namn || ''));
    });
    var branschText = (stat && stat.kundDisplay && stat.kundDisplay.bransch) || '';
    var omsText = (stat && stat.kundDisplay && stat.kundDisplay.omsAnstallda) || '';
    el.innerHTML = '<p>Vår byrå har <strong>' + n + '</strong> antal kunder. Av dessa har vi kategoriserat <strong>'
      + lagNormal + '</strong> som låg–normal risk, <strong>' + forhojd + '</strong> som förhöjd risk, <strong>'
      + hog + '</strong> som Hög risk och <strong>' + oacc + '</strong> som oacceptabel risk. Vi har <strong>'
      + pep + '</strong> antal kunder som enligt KYC-formuläret är PEP eller anhörig/nära medarbetare till PEP.</p>'
      + (omsText ? '<p>' + escapeHtml(omsText) + '</p>' : '')
      + renderNamedStatList('Bolagsformer', stat && stat.bolagsform)
      + (branschText ? '<p><strong>Branscher:</strong> ' + escapeHtml(branschText) + '</p>' : '')
      + (langRelation
        ? '<p><strong>Relationslängd:</strong> ' + langRelation.antal + ' kunder har risksänkande faktorn «' + escapeHtml(langRelation.namn) + '».</p>'
        : renderNamedStatList('Risksänkande faktorer (t.ex. långsiktig relation)', stat && stat.risksankande, 'Inga risksänkande faktorer registrerade.'))
      + '<p>Vid bedömning av våra kunders risknivåer utgår vi från de omständigheter som kan tyda på låg eller hög risk enligt penningtvättslagen (kapitel 2, paragraf 4 och 5) hos våra kunder.</p>';
    renderFlaggorBarChart(flags);
  }

  function renderFlaggorBarChart(flags) {
    var wrap = getEl('ar-flaggor-chart');
    if (!wrap) return;
    wrap.innerHTML = renderBarChartHtml(flags, {
      title: 'Kunder per varningsflagga',
      hint: 'Antal kunder på byrån som har respektive varningsflagga ibockad.',
      aria: 'Stapeldiagram över kunder per varningsflagga',
      empty: 'Inga varningsflaggor är inlagda ännu. Gå till <a href="ovriga-riskfaktorer.html">Övriga riskfaktorer</a>.',
      chartClass: 'ar-bar-chart--flaggor',
      showKlass: true
    });
  }

  async function loadArStatistikBlock() {
    try {
      var [statRes, katRes] = await Promise.all([
        fetch(getBaseUrl() + '/api/statistik-riskbedomning', getAuthOpts()),
        fetch(getBaseUrl() + '/api/riskhojande-katalog', getAuthOpts())
      ]);
      var stat = statRes.ok ? await statRes.json() : {};
      var kat = katRes.ok ? await katRes.json() : {};
      renderTjansterBarChart(stat.tjänster || stat.tjanster || []);
      renderKundtyper(stat, kat);
      renderPieChart('ar-distribution-chart', countsForDimension(stat, 'distribution', window._arIdentifieradeSource), {
        title: 'Andel kunder per distributionskanal',
        hint: 'Andel av kunderna som har respektive distributionskanal.',
        aria: 'Cirkeldiagram över distributionskanaler',
        empty: 'Inga kunder är kopplade till en distributionskanal ännu.'
      });
      renderGeografi(stat);
      applyArLayout();
    } catch (err) {
      console.warn('Kunde inte ladda AR-statistik:', err);
      var el = getEl('ar-kundtyper-body');
      if (el) el.innerHTML = '<p class="identifierade-empty">Kunde inte hämta kundstatistik för byrån.</p>';
      renderTjansterBarChart([]);
      renderFlaggorBarChart([]);
    }
  }

  function initAiKartlaggning() {
    document.querySelectorAll('[data-ai-kartlaggning]').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        var section = btn.getAttribute('data-ai-kartlaggning');
        var field = KARTLAGGNING_FIELDS.find(function (x) { return x.key === section; });
        if (!field) return;
        var card = document.querySelector('.byra-card[data-field-id="' + field.id + '"]');
        var ta = getEl(field.id);
        if (!card || !ta) return;
        var origHtml = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> AI tänker...';
        if (typeof window.showAiThinking === 'function') window.showAiThinking();
        showEdit(card);
        ta.focus();
        try {
          var res = await fetch(getBaseUrl() + '/api/ai-ar-kartlaggning', {
            method: 'POST',
            ...getAuthOpts(),
            body: JSON.stringify({ section: section })
          });
          var data = await res.json().catch(function () { return {}; });
          if (res.ok && data.text) {
            if (data.auditLogId) window._lastArAiAudit = { logId: data.auditLogId };
            ta.value = data.text;
            updateCardView(card);
          } else {
            alert(data.error || data.message || 'Kunde inte generera AI-förslag');
          }
        } catch (err) {
          console.error('AI kartläggning:', err);
          alert('Kunde inte generera AI-förslag: ' + (err.message || 'Okänt fel'));
        } finally {
          if (typeof window.hideAiThinking === 'function') window.hideAiThinking();
          btn.disabled = false;
          btn.innerHTML = origHtml;
        }
      });
    });
  }

  function init() {
    load();
    initFormatToolbars();
    initAiBeskrivning();
    initAiVarderingRisk();
    initAiKartlaggning();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
