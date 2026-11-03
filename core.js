/* Logica condivisa: date della stagione, periodi tariffari, calcolo prezzo di vendita. */
(function () {
  const DAY = 86400000;
  const MESI = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
  const MESI_L = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
  const GG = ['D', 'L', 'M', 'M', 'G', 'V', 'S'];

  function parse(iso) { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d); }
  function iso(t) { return new Date(t).toISOString().slice(0, 10); }
  function addDays(isoDate, n) { return iso(parse(isoDate) + n * DAY); }
  function diffDays(a, b) { return Math.round((parse(b) - parse(a)) / DAY); }
  function dm(isoDate) { const d = new Date(parse(isoDate)); return String(d.getUTCDate()).padStart(2, '0') + '/' + String(d.getUTCMonth() + 1).padStart(2, '0'); }
  function dmy(isoDate) { const d = new Date(parse(isoDate)); return d.getUTCDate() + ' ' + MESI[d.getUTCMonth()] + ' ' + d.getUTCFullYear(); }

  const TARIFFE = [
    { key: 'settimanale', label: 'Settimanale' },
    { key: 'bisettimanale', label: 'Bisettimanale' },
    { key: 'mensile', label: 'Mensile' },
    { key: 'bimensile', label: 'Bimensile' }
  ];
  const STATI = [
    { key: 'occupato', label: 'Occupato', blocks: true },
    { key: 'confermato', label: 'Confermato (nostro)', blocks: true },
    { key: 'opzione', label: 'Opzione', blocks: true },
    { key: 'richiesta', label: 'Su richiesta', blocks: false },
    { key: 'owner', label: 'Proprietario', blocks: true }
  ];

  const STATUS_COLOR = { occupato: '#d93025', confermato: '#3f9b3a', opzione: '#f0a000', richiesta: '#f2d73a', owner: '#5c4a72' };
  const PALETTE = ['#d93025', '#a3172b', '#e8590c', '#f0a000', '#f2d73a', '#3f9b3a', '#0b7a75', '#2f6fd6', '#23408e', '#7b4bc4', '#d14d8b', '#8a5a2b', '#6b7470'];
  // testo bianco o scuro a seconda della luminosità del colore della barra
  function inkFor(hex) {
    const h = String(hex || '').replace('#', ''); if (h.length !== 6) return '#ffffff';
    const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(x => x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.36 ? '#1f1a00' : '#ffffff';
  }

  function P(label, from, to) { return { label, from, to }; }

  // Stessi periodi dell'Excel 2027 (cambi di domenica). Modificabili in Impostazioni.
  function defaultPeriods() {
    const week = [];
    let d = '2027-05-02';
    for (let i = 0; i < 26; i++) { const e = addDays(d, 7); week.push(P(dm(d) + ' – ' + dm(e), d, e)); d = e; }
    return {
      settimanale: week,
      bisettimanale: [
        P('Maggio 1ª–2ª sett.', '2027-05-02', '2027-05-16'), P('Maggio 3ª–4ª sett.', '2027-05-16', '2027-05-30'),
        P('Giugno 1ª–2ª sett.', '2027-05-30', '2027-06-13'), P('Giugno 3ª–4ª sett.', '2027-06-13', '2027-06-27'),
        P('Luglio 1ª metà', '2027-06-27', '2027-07-11'), P('Luglio 2ª metà', '2027-07-11', '2027-08-01'),
        P('Agosto 1ª–2ª sett.', '2027-08-01', '2027-08-15'), P('Agosto 3ª–4ª sett.', '2027-08-15', '2027-08-29'),
        P('Settembre 1ª–2ª sett.', '2027-08-29', '2027-09-12'), P('Settembre 3ª–4ª sett.', '2027-09-12', '2027-09-26'),
        P('Ottobre 1ª metà', '2027-10-03', '2027-10-17'), P('Ottobre 2ª metà', '2027-10-17', '2027-10-31')
      ],
      mensile: [
        P('Maggio', '2027-05-02', '2027-05-30'), P('Giugno', '2027-05-30', '2027-06-27'), P('Luglio', '2027-06-27', '2027-08-01'),
        P('Agosto', '2027-08-01', '2027-08-29'), P('Settembre', '2027-08-29', '2027-09-26'), P('Ottobre', '2027-09-26', '2027-10-31')
      ],
      bimensile: [
        P('Maggio – Giugno', '2027-05-02', '2027-06-27'), P('Luglio – Agosto', '2027-06-27', '2027-08-29'), P('Settembre – Ottobre', '2027-08-29', '2027-10-31')
      ]
    };
  }

  /* Periodi tariffari per una villa: quelli dell'Excel (cambio di domenica) oppure gli stessi
     anticipati di un giorno (cambio di sabato). Il numero e l'ordine dei periodi non cambia,
     così i prezzi restano collegati al periodo giusto. villa.cambio vince sul predefinito. */
  const _perCache = {};
  function cambioDi(settings, villa) { return (villa && (villa.cambio === 'sabato' || villa.cambio === 'domenica') && villa.cambio) || (settings && settings.cambio) || 'domenica'; }
  function periodsFor(settings, villa, tariff) {
    const cambio = cambioDi(settings, villa); const key = cambio + '|' + tariff;
    if (_perCache[key]) return _perCache[key];
    const base = defaultPeriods()[tariff] || [];
    const out = cambio === 'domenica' ? base : base.map(p => {
      const from = addDays(p.from, -1), to = addDays(p.to, -1);
      return { label: tariff === 'settimanale' ? dm(from) + ' – ' + dm(to) : p.label, from, to };
    });
    return (_perCache[key] = out);
  }

  function defaultSettings() {
    return {
      seasonName: 'Summer 2027',
      seasonStart: '2027-05-01',
      seasonEnd: '2027-10-31',
      cambio: 'domenica',   // giorno di cambio predefinito: 'sabato' o 'domenica'
      periods: defaultPeriods(),
      defaults: {
        settimanale: { spese: 2500, arrotonda: 5000, margine: 0.2 },
        bisettimanale: { spese: 2500, arrotonda: 5000, margine: 0.2 },
        mensile: { spese: 5000, arrotonda: 5000, margine: 0.2 },
        bimensile: { spese: 5000, arrotonda: 5000, margine: 0.2 }
      }
    };
  }

  /* Stessa formula dell'Excel:
     ARROTONDA.ECCESSO( acquisto / (1 - margine) + spese ; arrotonda ) + rettifica */
  function salePrice(acq, params, rett, fisso) {
    if (fisso !== null && fisso !== undefined && fisso !== '') return Number(fisso);
    if (acq === null || acq === undefined || acq === '') return null;
    if (String(acq).toUpperCase() === 'ND') return 'ND';
    const a = Number(acq); if (!isFinite(a)) return null;
    const m = Number(params.margine) || 0;
    const x = a / (1 - m) + (Number(params.spese) || 0);
    const r = Number(params.arrotonda) || 0;
    const base = r > 0 ? Math.ceil(Math.round((x / r) * 1e6) / 1e6) * r : x;
    return base + (Number(rett) || 0);
  }

  function priceAt(villa, tariff, i, mode) {
    const p = villa.pricing && villa.pricing[tariff];
    if (!p) return null;
    const acq = p.acquisto ? p.acquisto[i] : null;
    if (mode === 'netto') {
      if (acq === null || acq === undefined || acq === '') return null;
      return String(acq).toUpperCase() === 'ND' ? 'ND' : Number(acq);
    }
    return salePrice(acq, p, p.rettifica ? p.rettifica[i] : 0, p.fisso ? p.fisso[i] : null);
  }

  function emptyPricing(settings) {
    const out = {};
    TARIFFE.forEach(t => {
      const n = settings.periods[t.key].length; const d = settings.defaults[t.key];
      out[t.key] = { spese: d.spese, arrotonda: d.arrotonda, margine: d.margine, acquisto: Array(n).fill(null), rettifica: Array(n).fill(0), fisso: Array(n).fill(null) };
    });
    return out;
  }

  const eur = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0 });
  function money(v) { if (v === null || v === undefined) return ''; if (v === 'ND') return 'ND'; return eur.format(v) + ' €'; }
  function short(v) {
    if (v === null || v === undefined) return ''; if (v === 'ND') return 'ND';
    if (Math.abs(v) >= 1000) { const k = v / 1000; return (Number.isInteger(k) ? k : k.toFixed(1).replace('.', ',')) + 'k'; }
    return String(v);
  }
  function parseMoney(s) {
    if (s === null || s === undefined) return null;
    s = String(s).trim(); if (!s) return null;
    if (s.toUpperCase() === 'ND') return 'ND';
    let t = s.replace(/[€\s]/g, '').toLowerCase();
    let mult = 1; if (t.endsWith('k')) { mult = 1000; t = t.slice(0, -1); }
    t = t.replace(/\./g, '').replace(',', '.');
    const n = Number(t); return isFinite(n) ? Math.round(n * mult) : null;
  }
  function uid(p) { return (p || 'id') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  window.SDB = { periodsFor, cambioDi, STATUS_COLOR, PALETTE, inkFor, DAY, MESI, MESI_L, GG, parse, iso, addDays, diffDays, dm, dmy, TARIFFE, STATI, defaultSettings, defaultPeriods, salePrice, priceAt, emptyPricing, money, short, parseMoney, uid };
})();
