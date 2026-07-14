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

    function handleInput(el) {
        normalizeYearLength(el);
        if (el.validity.badInput) {
            revertInvalid(el, 'Året får bara ha fyra siffror.');
            return;
        }
        const v = el.value;
        if (!v) {
            el.setCustomValidity('');
            return;
        }
        if (isValidDateIso(v)) {
            el.dataset.dateInputLastValid = v;
            el.setCustomValidity('');
            return;
        }
        revertInvalid(el, 'Datumet finns inte (t.ex. 30 februari).');
    }

    function handleBlur(el) {
        normalizeYearLength(el);
        if (el.validity.badInput) {
            revertInvalid(el, 'Året får bara ha fyra siffror.', true);
            return;
        }
        const v = el.value;
        if (!v) {
            el.setCustomValidity('');
            return;
        }
        if (isValidDateIso(v)) {
            el.dataset.dateInputLastValid = v;
            el.setCustomValidity('');
            return;
        }
        revertInvalid(el, 'Datumet finns inte (t.ex. 30 februari).', true);
    }

    function bindDateInput(el) {
        if (!el || el.type !== 'date' || el.dataset.dateInputBound === '1') return;
        el.dataset.dateInputBound = '1';
        el.setAttribute('max', MAX_ISO);
        if (!el.hasAttribute('min')) el.setAttribute('min', MIN_ISO);
        rememberValid(el);

        el.addEventListener('input', () => handleInput(el));
        el.addEventListener('blur', () => handleBlur(el));
        el.addEventListener('change', () => {
            normalizeYearLength(el);
            if (el.value && !isValidDateIso(el.value)) {
                revertInvalid(el, 'Ange ett giltigt datum.', true);
            } else {
                rememberValid(el);
            }
        });
    }

    function bindDateInputs(root, selector) {
        const scope = root && root.querySelectorAll ? root : document;
        scope.querySelectorAll(selector || 'input[type="date"]').forEach(bindDateInput);
    }

    function validateDateInput(el, label) {
        if (!el) return true;
        if (el.validity.badInput) {
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

    global.DateInput = {
        isValidDateIso,
        bindDateInput,
        bindDateInputs,
        validateDateInput
    };
})(window);
