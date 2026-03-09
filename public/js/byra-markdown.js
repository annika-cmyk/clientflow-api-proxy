/**
 * Enkel markdown-rendering för Byrårutiner och Allmän riskbedömning
 * Stöder: **fet** *kursiv* - punkt 1. numrerad
 */
window.renderByraMarkdown = function (text) {
  if (text == null || text === '') return '';
  var s = String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  var lines = s.split('\n');
  var out = [];
  var inList = false;
  var listTag = null;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var bullet = /^- (.+)$/.exec(line);
    var numbered = /^(\d+)\. (.+)$/.exec(line);
    if (bullet) {
      if (!inList || listTag !== 'ul') {
        if (inList) out.push(listTag === 'ul' ? '</ul>' : '</ol>');
        out.push('<ul>');
        inList = true;
        listTag = 'ul';
      }
      out.push('<li>' + bullet[1] + '</li>');
    } else if (numbered) {
      if (!inList || listTag !== 'ol') {
        if (inList) out.push(listTag === 'ul' ? '</ul>' : '</ol>');
        out.push('<ol>');
        inList = true;
        listTag = 'ol';
      }
      out.push('<li>' + numbered[2] + '</li>');
    } else {
      if (inList) {
        out.push(listTag === 'ul' ? '</ul>' : '</ol>');
        inList = false;
      }
      if (line.trim()) out.push('<p>' + line + '</p>');
      else out.push('<br>');
    }
  }
  if (inList) out.push(listTag === 'ul' ? '</ul>' : '</ol>');
  return out.join('');
};
