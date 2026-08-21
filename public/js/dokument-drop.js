/**
 * Drag-and-drop av dokument på kundkortets Dokumentationsflik.
 */
(function (global) {
  const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.png', '.jpg', '.jpeg'];
  const MAX_BYTES = 10 * 1024 * 1024;

  function extensionOf(name) {
    const n = String(name || '').trim().toLowerCase();
    const i = n.lastIndexOf('.');
    return i >= 0 ? n.slice(i) : '';
  }

  function isAllowedDokumentFile(file) {
    if (!file || !file.name) return false;
    return ALLOWED_EXTENSIONS.includes(extensionOf(file.name));
  }

  function hasFileDrag(dataTransfer) {
    if (!dataTransfer) return false;
    const types = Array.from(dataTransfer.types || []);
    return types.includes('Files') || types.includes('application/x-moz-file');
  }

  function rejectReason(file) {
    if (!file || !file.name) return 'ogiltig fil';
    if (!isAllowedDokumentFile(file)) return 'filtypen stöds inte';
    if (Number(file.size) > MAX_BYTES) return 'för stor (max 10 MB)';
    return null;
  }

  function collectDroppedFiles(fileList) {
    const incoming = Array.from(fileList || []).filter((f) => f && f.name);
    const accepted = [];
    const rejected = [];
    incoming.forEach((file) => {
      const reason = rejectReason(file);
      if (reason) rejected.push({ name: file.name, reason });
      else accepted.push(file);
    });
    return { accepted, rejected };
  }

  function formatRejectedMessage(rejected) {
    const list = Array.isArray(rejected) ? rejected : [];
    if (!list.length) return '';
    const names = list.map((item) => {
      if (typeof item === 'string') return item;
      const name = item.name || 'fil';
      return item.reason ? `${name} (${item.reason})` : name;
    });
    return `Hoppar över: ${names.join(', ')}. Tillåtna format: PDF, Word, Excel och bilder.`;
  }

  function categoryFromDropTarget(target, root) {
    const el = target && target.closest ? target.closest('[data-doc-category]') : null;
    if (!el) return null;
    if (root && !root.contains(el)) return null;
    const cat = String(el.getAttribute('data-doc-category') || '').trim();
    return cat || null;
  }

  const api = {
    ALLOWED_EXTENSIONS,
    MAX_BYTES,
    extensionOf,
    isAllowedDokumentFile,
    hasFileDrag,
    rejectReason,
    collectDroppedFiles,
    formatRejectedMessage,
    categoryFromDropTarget
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  global.DokumentDrop = api;
})(typeof window !== 'undefined' ? window : globalThis);
