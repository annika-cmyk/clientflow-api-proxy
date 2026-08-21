/**
 * Gemensamma uppdragstyper och frekvensval.
 */
(function (global) {
    var EGET_UPPDRAG_TYP = 'Eget uppdrag';
    var STANDARD_TYPER = [
        'Löneuppdrag',
        'Löneuppdrag innevarande',
        'Löneuppdrag efterhand',
        'Momsredovisning',
        'Bokslut',
        'Deklaration'
    ];

    function isEgetUppdragTyp(typ) {
        return String(typ || '').trim() === EGET_UPPDRAG_TYP;
    }

    function isStandardUppdragTyp(typ) {
        return STANDARD_TYPER.indexOf(String(typ || '').trim()) >= 0;
    }

    function uppdragDisplayName(typ, fields) {
        var t = String(typ || (fields && fields.Typ) || '').trim();
        if (isEgetUppdragTyp(t)) {
            var namn = String((fields && (fields.Namn || fields.namn)) || '').trim();
            return namn || EGET_UPPDRAG_TYP;
        }
        return t;
    }

    function frekvensChoicesForTyp(typ, isLone) {
        if (isLone) return ['Varje månad'];
        if (String(typ || '').trim() === 'Momsredovisning') {
            return ['Varje månad', 'Varje kvartal', 'Årsvis', 'Årsvis med deklaration', 'Veckovis', 'Engång'];
        }
        return ['Veckovis', 'Varje månad', 'Varje kvartal', 'Årsvis', 'Engång'];
    }

    var api = {
        EGET_UPPDRAG_TYP: EGET_UPPDRAG_TYP,
        STANDARD_TYPER: STANDARD_TYPER,
        isEgetUppdragTyp: isEgetUppdragTyp,
        isStandardUppdragTyp: isStandardUppdragTyp,
        uppdragDisplayName: uppdragDisplayName,
        frekvensChoicesForTyp: frekvensChoicesForTyp
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    global.UppdragTyp = api;
})(typeof window !== 'undefined' ? window : globalThis);
