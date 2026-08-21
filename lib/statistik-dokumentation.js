'use strict';

const SECTION_TITLE = 'Statistik för riskbedömning';
const SECTION_INTRO = 'Siffror baserade på byråns kunder.';

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function namedCounts(list) {
  return (Array.isArray(list) ? list : [])
    .filter((x) => x && (x.namn || x.name))
    .map((x) => ({
      namn: String(x.namn || x.name).trim(),
      antal: Number(x.antal) || 0
    }))
    .filter((x) => x.namn);
}

function normalizeStatistik(data) {
  const d = data || {};
  const riskniva = d.riskniva || {};
  const riskfaktorerPerTyp = Array.isArray(d.riskfaktorerPerTyp) ? d.riskfaktorerPerTyp : [];
  return {
    antalKunder: Number(d.antalKunder) || 0,
    riskniva: {
      Låg: Number(riskniva['Låg']) || 0,
      Normal: (Number(riskniva['Normal']) || 0) + (Number(riskniva['Medel']) || 0),
      Förhöjd: Number(riskniva['Förhöjd']) || 0,
      Hög: Number(riskniva['Hög']) || 0,
      Oacceptabel: Number(riskniva['Oacceptabel']) || 0,
      Övrigt: Number(riskniva['Övrigt']) || 0
    },
    antalPepEllerSanktion: Number(d.antalPepEllerSanktion) || 0,
    tjanster: namedCounts(d.tjänster || d.tjanster),
    hogriskbransch: namedCounts(d.högriskbransch || d.hogriskbransch),
    riskfaktorerPerTyp: riskfaktorerPerTyp.map((kort) => ({
      typ: String((kort && kort.typ) || 'Övriga').trim() || 'Övriga',
      antalKunder: Number(kort && kort.antalKunder) || 0,
      riskfaktorer: namedCounts(kort && kort.riskfaktorer)
    }))
  };
}

function summaryRows(stat) {
  return [
    { label: 'Antal kunder (byrån)', value: stat.antalKunder },
    { label: 'Låg risk', value: stat.riskniva.Låg },
    { label: 'Normal risk', value: stat.riskniva.Normal },
    { label: 'Förhöjd risk', value: stat.riskniva.Förhöjd },
    { label: 'Hög risk', value: stat.riskniva.Hög },
    { label: 'Oacceptabel', value: stat.riskniva.Oacceptabel },
    { label: 'Övrig risknivå', value: stat.riskniva.Övrigt },
    { label: 'PEP eller på sanktionslistor', value: stat.antalPepEllerSanktion }
  ];
}

function countTableHtml(escape, rows, emptyText) {
  if (!rows.length) return `<p class="doc-text">${escape(emptyText)}</p>`;
  return '<table class="doc-table"><thead><tr><th>Namn</th><th>Antal kunder</th></tr></thead><tbody>' +
    rows.map((r) => `<tr><td>${escape(r.namn)}</td><td>${r.antal}</td></tr>`).join('') +
    '</tbody></table>';
}

function renderStatistikPdfHtml(data, escapeFn) {
  const escape = typeof escapeFn === 'function' ? escapeFn : escapeHtml;
  const stat = normalizeStatistik(data);
  const summary = '<table class="doc-table"><thead><tr><th>Mått</th><th>Antal</th></tr></thead><tbody>' +
    summaryRows(stat).map((r) => `<tr><td>${escape(r.label)}</td><td>${r.value}</td></tr>`).join('') +
    '</tbody></table>';

  const riskKort = stat.riskfaktorerPerTyp.length
    ? stat.riskfaktorerPerTyp.map((kort) => {
      const header = `<p class="doc-text"><strong>${escape(kort.typ)}</strong> – ${kort.antalKunder} kunder har denna typ</p>`;
      return header + countTableHtml(escape, kort.riskfaktorer, 'Inga specifika riskfaktorer registrerade.');
    }).join('')
    : '<p class="doc-text">Inga kunder med riskfaktorer registrerade.</p>';

  return [
    `<h3>${escape(SECTION_TITLE)}</h3>`,
    `<p class="doc-text">${escape(SECTION_INTRO)}</p>`,
    summary,
    '<h3>Kunder per tjänst</h3>',
    countTableHtml(escape, stat.tjanster, 'Inga tjänster valda hos kunderna.'),
    '<h3>Högriskbransch</h3>',
    countTableHtml(escape, stat.hogriskbransch, 'Inga kunder med högriskbransch registrerad.'),
    '<h3>Riskfaktorer per typ</h3>',
    riskKort
  ].join('');
}

function countListHtml(escape, rows, emptyText) {
  if (!rows.length) return `<p class="stat-list-empty">${escape(emptyText)}</p>`;
  return '<div class="stat-list">' + rows.map((r) =>
    `<div class="stat-list-row"><span class="stat-list-namn">${escape(r.namn)}</span><span class="stat-list-antal">${r.antal} kunder</span></div>`
  ).join('') + '</div>';
}

function renderStatistikWebHtml(data, escapeFn) {
  const escape = typeof escapeFn === 'function' ? escapeFn : escapeHtml;
  const stat = normalizeStatistik(data);
  const cards = [
    { label: 'Antal kunder (byrån)', value: stat.antalKunder, icon: 'fa-users' },
    { label: 'Låg risk', value: stat.riskniva.Låg, icon: 'fa-shield-alt', klass: 'stat-number--low' },
    { label: 'Normal risk', value: stat.riskniva.Normal, icon: 'fa-balance-scale', klass: 'stat-number--normal' },
    { label: 'Förhöjd risk', value: stat.riskniva.Förhöjd, icon: 'fa-exclamation-circle', klass: 'stat-number--elevated' },
    { label: 'Hög risk', value: stat.riskniva.Hög, icon: 'fa-exclamation-triangle', klass: 'stat-number--high' },
    { label: 'Oacceptabel', value: stat.riskniva.Oacceptabel, icon: 'fa-ban', klass: 'stat-number--unacceptable' },
    { label: 'Övrig risknivå', value: stat.riskniva.Övrigt, icon: 'fa-question-circle' },
    { label: 'PEP eller på sanktionslistor', value: stat.antalPepEllerSanktion, icon: 'fa-user-secret' }
  ].map((c) => `
          <div class="stat-card">
            <div class="stat-icon"><i class="fas ${c.icon}"></i></div>
            <div class="stat-content">
              <h3>${escape(c.label)}</h3>
              <div class="stat-number${c.klass ? ' ' + c.klass : ''}">${c.value}</div>
            </div>
          </div>`).join('');

  const riskKort = stat.riskfaktorerPerTyp.length
    ? `<div class="statistik-riskfaktorer-kort">${stat.riskfaktorerPerTyp.map((kort) => `
          <div class="statistik-riskfaktor-kort">
            <h4><i class="fas fa-exclamation-circle"></i> ${escape(kort.typ)}</h4>
            <div class="riskfaktor-kort-antal">${kort.antalKunder} kunder har denna typ</div>
            ${countListHtml(escape, kort.riskfaktorer, 'Inga specifika riskfaktorer registrerade.')}
          </div>`).join('')}</div>`
    : '<p class="stat-list-empty">Inga kunder med riskfaktorer registrerade.</p>';

  return `
      <div class="dokumentation-field dokumentation-statistik">
        <strong>${escape(SECTION_TITLE)}</strong>
        <div class="dokumentation-value">
          <p class="statistik-section-desc">${escape(SECTION_INTRO)}</p>
          <div class="stats-cards-row">${cards}</div>
          <div class="statistik-sections">
            <section class="statistik-section">
              <h3><i class="fas fa-cogs"></i> Kunder per tjänst</h3>
              ${countListHtml(escape, stat.tjanster, 'Inga tjänster valda hos kunderna.')}
            </section>
            <section class="statistik-section">
              <h3><i class="fas fa-industry"></i> Högriskbransch</h3>
              ${countListHtml(escape, stat.hogriskbransch, 'Inga kunder med högriskbransch registrerad.')}
            </section>
            <section class="statistik-section" style="grid-column:1/-1;">
              <h3><i class="fas fa-exclamation-circle"></i> Riskfaktorer per typ</h3>
              ${riskKort}
            </section>
          </div>
        </div>
      </div>`;
}

module.exports = {
  SECTION_TITLE,
  SECTION_INTRO,
  normalizeStatistik,
  renderStatistikPdfHtml,
  renderStatistikWebHtml
};
