/**
 * Datumfält: skriv ÅÅÅÅ-MM-DD med tangenterna och behåll kalendern.
 */
(function (global) {
    'use strict';

    const MAX_ISO = '9999-12-31';
    const MIN_ISO = '1000-01-01';

    function isValidDateIso(str) {
        if (!str || typeof str !== 'string') return false;
        const m = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!m) return false;
        const y = Number(m[1]);
        const mo = Number(m[2]);
        const d = Number(m[3]);
        if (y < 1000 || y > 9999 || mo < 1 || mo > 12 || d < 1 || d > 31) return false;
        const dt = new Date(y, mo - 1, d);
        return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
    }

    function pad2(n) {
        return String(n).padStart(2, '0');
    }

    function parseTypedDate(raw) {
        const s = String(raw == null ? '' : raw).trim();
        if (!s) return '';
        if (isValidDateIso(s)) return s;
        const digits = s.replace(/\D/g, '');
        if (digits.length === 8) {
            const iso = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
            return isValidDateIso(iso) ? iso : '';
        }
        const parts = s.split(/[./-]/).filter(Boolean);
        if (parts.length === 3 && parts[0].length === 4) {
            const iso = `${parts[0]}-${pad2(parts[1])}-${pad2(parts[2])}`;
            return isValidDateIso(iso) ? iso : '';
        }
        return '';
    }

    function formatWhileTyping(raw) {
        const digits = String(raw == null ? '' : raw).replace(/\D/g, '').slice(0, 8);
        if (digits.length <= 4) return digits;
        if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
        return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
    }

    function lastValidFrom(el) {
        const saved = el.dataset.dateInputLastValid || '';
        return isValidDateIso(saved) ? saved : '';
    }

    function rememberValid(el) {
        if (el.value && isValidDateIso(el.value)) {
            el.dataset.dateInputLastValid = el.value;
        }
    }

    function normalizeYearLength(el) {
        const v = el.value;
        if (!v) return v;
        const m = v.match(/^(\d+)-(\d{2})-(\d{2})$/);
        if (m && m[1].length > 4) {
            const fixed = `${m[1].slice(0, 4)}-${m[2]}-${m[3]}`;
            el.value = fixed;
            return fixed;
        }
        return v;
    }

    function revertInvalid(el, message, report) {
        el.value = lastValidFrom(el);
        if (message) {
            el.setCustomValidity(message);
            if (report) el.reportValidity();
            setTimeout(() => el.setCustomValidity(''), 0);
        }
    }

    function syncTextFromDate(dateEl, textEl) {
        if (!textEl) return;
        textEl.value = dateEl.value || '';
    }

    function applyParsedToDate(dateEl, textEl, report) {
        const typed = textEl.value;
        if (!String(typed || '').trim()) {
            dateEl.value = '';
            dateEl.dataset.dateInputLastValid = '';
            dateEl.setCustomValidity('');
            textEl.setCustomValidity('');
            return true;
        }
        const iso = parseTypedDate(typed);
        if (!iso) {
            textEl.setCustomValidity('Ange datum som ÅÅÅÅ-MM-DD.');
            if (report) textEl.reportValidity();
            setTimeout(() => textEl.setCustomValidity(''), 0);
            return false;
        }
        dateEl.value = iso;
        textEl.value = iso;
        rememberValid(dateEl);
        dateEl.setCustomValidity('');
        textEl.setCustomValidity('');
        return true;
    }

    function dispatchChange(el) {
        try {
            el.dispatchEvent(new Event('change', { bubbles: true }));
        } catch (_) {
            const ev = document.createEvent('HTMLEvents');
            ev.initEvent('change', true, false);
            el.dispatchEvent(ev);
        }
    }

    function wrapWithTextField(el) {
        if (!el || !el.parentNode) return null;
        if (el.closest && el.closest('.date-input-wrap')) {
            return el.parentNode.querySelector('.date-input-text');
        }
        const wrap = document.createElement('div');
        wrap.className = 'date-input-wrap';
        el.parentNode.insertBefore(wrap, el);
        const text = document.createElement('input');
        text.type = 'text';
        text.className = `${el.className || ''} date-input-text`.trim();
        text.setAttribute('inputmode', 'numeric');
        text.setAttribute('placeholder', 'ÅÅÅÅ-MM-DD');
        text.setAttribute('autocomplete', 'off');
        text.setAttribute('spellcheck', 'false');
        text.setAttribute('maxlength', '10');
        if (el.id) {
            text.id = `${el.id}-text`;
            const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
            if (label) label.setAttribute('for', text.id);
        }
        text.value = el.value || '';
        text.setAttribute('aria-label', el.getAttribute('aria-label') || 'Datum, skriv ÅÅÅÅ-MM-DD');
        el.classList.add('date-input-picker');
        el.setAttribute('aria-label', 'Välj datum i kalender');
        el.setAttribute('title', 'Öppna kalender');
        wrap.appendChild(text);
        wrap.appendChild(el);
        return text;
    }

    function handlePickerInput(el) {
        normalizeYearLength(el);
        if (el.validity.badInput) {
            revertInvalid(el, 'Året får bara ha fyra siffror.');
            return;
        }
        if (el.value && isValidDateIso(el.value)) rememberValid(el);
    }

    function handlePickerBlur(el) {
        normalizeYearLength(el);
        if (el.validity.badInput) {
            revertInvalid(el, 'Året får bara ha fyra siffror.', true);
            return;
        }
        if (el.value && !isValidDateIso(el.value)) {
            revertInvalid(el, 'Datumet finns inte (t.ex. 30 februari).', true);
        }
    }

    function bindDateInput(el) {
        if (!el || el.type !== 'date' || el.dataset.dateInputBound === '1') return;
        el.dataset.dateInputBound = '1';
        el.setAttribute('max', MAX_ISO);
        if (!el.hasAttribute('min')) el.setAttribute('min', MIN_ISO);
        rememberValid(el);

        const textEl = wrapWithTextField(el);

        el.addEventListener('input', () => {
            handlePickerInput(el);
            syncTextFromDate(el, textEl);
        });
        el.addEventListener('blur', () => handlePickerBlur(el));
        el.addEventListener('change', () => {
            normalizeYearLength(el);
            if (el.value && !isValidDateIso(el.value)) {
                revertInvalid(el, 'Ange ett giltigt datum.', true);
            } else {
                rememberValid(el);
            }
            syncTextFromDate(el, textEl);
        });

        if (!textEl) return;
        textEl.addEventListener('input', () => {
            const formatted = formatWhileTyping(textEl.value);
            if (formatted !== textEl.value) textEl.value = formatted;
            const iso = parseTypedDate(textEl.value);
            if (iso) {
                dateSilentSet(el, iso);
                rememberValid(el);
                textEl.setCustomValidity('');
            }
        });
        textEl.addEventListener('blur', () => {
            const before = el.value;
            if (!applyParsedToDate(el, textEl, true)) return;
            if (el.value !== before) dispatchChange(el);
        });
        textEl.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            const before = el.value;
            if (!applyParsedToDate(el, textEl, true)) return;
            if (el.value !== before) dispatchChange(el);
        });
    }

    function dateSilentSet(el, iso) {
        if (el.value === iso) return;
        el.value = iso;
    }

    function bindDateInputs(root, selector) {
        const scope = root && root.querySelectorAll ? root : document;
        scope.querySelectorAll(selector || 'input[type="date"]').forEach(bindDateInput);
    }

    function validateDateInput(el, label) {
        if (!el) return true;
        const wrap = el.closest && el.closest('.date-input-wrap');
        const textEl = wrap ? wrap.querySelector('.date-input-text') : null;
        if (textEl && String(textEl.value || '').trim() && !parseTypedDate(textEl.value)) {
            textEl.setCustomValidity(`${label || 'Datum'} är ogiltigt.`);
            textEl.reportValidity();
            return false;
        }
        if (el.validity && el.validity.badInput) {
            el.setCustomValidity(`${label || 'Datum'} är ogiltigt.`);
            el.reportValidity();
            return false;
        }
        if (!el.value) return true;
        if (isValidDateIso(el.value)) return true;
        el.setCustomValidity(`${label || 'Datum'} är ogiltigt.`);
        el.reportValidity();
        return false;
    }

    const api = {
        isValidDateIso,
        parseTypedDate,
        formatWhileTyping,
        bindDateInput,
        bindDateInputs,
        validateDateInput
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) global.DateInput = api;
})(typeof window !== 'undefined' ? window : globalThis);
