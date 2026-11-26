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
    { key: 'owner', label: 'Proprietario', blocks: true },
    // villa pagata al proprietario ma non ancora affittata: i giorni liberi si comportano come quelli pagati in più (fascia arancione, acquisto unico)
    { key: 'vuoto', label: 'Vuoto per pieno', blocks: false }
  ];

  const STATUS_COLOR = { occupato: '#d93025', confermato: '#3f9b3a', opzione: '#f0a000', richiesta: '#f2d73a', owner: '#5c4a72', vuoto: '#e9801c' };
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
  function autoPeriods(cambio, tariff) {
    const key = cambio + '|' + tariff;
    if (_perCache[key]) return _perCache[key];
    const base = defaultPeriods()[tariff] || [];
    const out = cambio === 'domenica' ? base : base.map(p => {
      const from = addDays(p.from, -1), to = addDays(p.to, -1);
      return { label: tariff === 'settimanale' ? dm(from) + ' – ' + dm(to) : p.label, from, to };
    });
    return (_perCache[key] = out);
  }
  /* Ordine di precedenza per bisettimanale/mensile/bimensile:
     1) periodi personalizzati della villa (villa.periodi[tariffa])
     2) periodi predefiniti modificati in Impostazioni (settings.periodiPredefiniti[tariffa])
     3) periodi automatici dell'Excel, spostati in base al giorno di cambio.
     Il settimanale segue sempre il giorno di cambio. Il numero dei periodi non cambia mai. */
  const validList = (l, n) => Array.isArray(l) && l.length === n && l.every(p => p && p.from && p.to && p.to > p.from);
  function periodsFor(settings, villa, tariff) {
    const auto = autoPeriods(cambioDi(settings, villa), tariff);
    if (tariff === 'settimanale') return auto;
    const vp = villa && villa.periodi && villa.periodi[tariff];
    if (validList(vp, auto.length)) return vp;
    const sp = settings && settings.periodiPredefiniti && settings.periodiPredefiniti[tariff];
    if (validList(sp, auto.length)) return sp;
    return auto;
  }
  function autoPeriodsFor(settings, villa, tariff) {
    if (tariff === 'settimanale') return autoPeriods(cambioDi(settings, villa), tariff);
    const sp = settings && settings.periodiPredefiniti && settings.periodiPredefiniti[tariff];
    return validList(sp, autoPeriods('domenica', tariff).length) ? sp : autoPeriods(cambioDi(settings, villa), tariff);
  }

  function defaultSettings() {
    return {
      seasonName: 'Summer 2027',
      seasonStart: '2027-05-01',
      seasonEnd: '2027-10-31',
      cambio: 'domenica',   // giorno di cambio predefinito: 'sabato' o 'domenica'
      periods: defaultPeriods(),
      defaults: {
        settimanale: { spese: 2500, arrotonda: 5000, margine: 0.2, minimo: 7000, agenzia: 0.1 },
        bisettimanale: { spese: 2500, arrotonda: 5000, margine: 0.2, minimo: 7000, agenzia: 0.1 },
        mensile: { spese: 5000, arrotonda: 5000, margine: 0.2, minimo: 7000, agenzia: 0.1 },
        bimensile: { spese: 5000, arrotonda: 5000, margine: 0.2, minimo: 7000, agenzia: 0.1 }
      }
    };
  }

  /* Stessa formula dell'Excel, con un margine minimo in euro e la commissione dell'agenzia:
     ARROTONDA.ECCESSO( MAX( acquisto / (1 - margine) + spese ; (acquisto + minimo + spese) × (1 + agenzia) ) ; arrotonda ) + rettifica
     minimo: params.minimo (euro), se manca MARGINE_MIN (7.000 €); agenzia: params.agenzia (0,10 = 10%), se manca AGENZIA_DEF.
     Il margine % comprende già l'agenzia; il minimo € no (l'agenzia si aggiunge sopra). Commissione = agenzia × prezzo finale. */
  const MARGINE_MIN = 7000, AGENZIA_DEF = 0.1;
  function salePrice(acq, params, rett, fisso) {
    if (fisso !== null && fisso !== undefined && fisso !== '') return Number(fisso);
    if (acq === null || acq === undefined || acq === '') return null;
    if (String(acq).toUpperCase() === 'ND') return 'ND';
    const a = Number(acq); if (!isFinite(a)) return null;
    const m = Number(params.margine) || 0;
    const mn = params.minimo === undefined || params.minimo === null || params.minimo === '' ? MARGINE_MIN : (Number(params.minimo) || 0);
    const ag = params.agenzia === undefined || params.agenzia === null || params.agenzia === '' ? AGENZIA_DEF : (Number(params.agenzia) || 0);
    const sp = Number(params.spese) || 0;
    // il margine % comprende già l'agenzia; il minimo € è netto, quindi l'agenzia si aggiunge sopra
    const x = Math.max(a / (1 - m) + sp, (a + mn + sp) * (1 + ag));
    const r = Number(params.arrotonda) || 0;
    const base = r > 0 ? Math.ceil(Math.round((x / r) * 1e6) / 1e6) * r : Math.round(x * 100) / 100;
    return base + (Number(rett) || 0);
  }

  function priceAt(villa, tariff, i, mode) {
    const p = villa.pricing && villa.pricing[tariff];
    if (!p) {
      // profili senza prezzi di acquisto: solo il listino di vendita già calcolato (villa.listino)
      const l = villa.listino && villa.listino[tariff]; const x = l ? l[i] : null;
      if (x === undefined || x === null) return null;
      if (x === 'ND') return 'ND';
      return mode === 'netto' ? null : Number(x);
    }
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
      out[t.key] = { spese: d.spese, arrotonda: d.arrotonda, margine: d.margine, minimo: d.minimo === undefined ? MARGINE_MIN : d.minimo, agenzia: d.agenzia === undefined ? AGENZIA_DEF : d.agenzia, acquisto: Array(n).fill(null), rettifica: Array(n).fill(0), fisso: Array(n).fill(null) };
    });
    return out;
  }

  const eur = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0, useGrouping: 'always' });
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

  // campi della scheda villa che un profilo può non vedere (salvati a parte: villas_campi/{villaId}/campi/{campo})
  const CAMPI_SCHEDA = [['listino', 'Listino prezzi'], ['nomeReale', 'Nome reale'], ['proprietario', 'Proprietario'], ['realEstate', 'Real estate (prezzo di vendita)'], ['indirizzo', 'Indirizzo'], ['seafront', 'Seafront – Seaview'], ['servizi', 'Servizi inclusi'], ['note', 'Note'], ['linkSito', 'Link sito'], ['mediaProprietario', 'Media proprietario'], ['googleMaps', 'Google Maps'], ['youtube', 'Video YouTube'], ['vimeo', 'Video Vimeo'], ['psw', 'Password']];
  const CAMPI_NASCOSTI_DEFAULT = ['nomeReale', 'proprietario', 'realEstate', 'indirizzo', 'note', 'mediaProprietario', 'googleMaps', 'psw'];
  // campi nascosti a un profilo: elenco del profilo; per i profili creati prima, dalla vecchia scelta "scheda"
  const nascostiDi = pr => Array.isArray(pr && pr.nascosti) ? pr.nascosti : (pr && pr.scheda ? [] : CAMPI_NASCOSTI_DEFAULT.slice());
  // voci "Le tariffe includono" delle offerte (Impostazioni → Servizi e inclusioni: settings.inclusioni)
  const INCLUSIONI = [
    ['pulizia', 'Pulizia giornaliera della casa', 'Daily Cleaning for the resetting of the house'],
    ['giardino', 'Giardinaggio e pulizia della piscina regolari', 'Regular Gardening and pool cleaning'],
    ['biancheria', 'Cambio biancheria e asciugamani due volte a settimana', 'Linen & towel change twice per week'],
    ['bagno', 'Prodotti da bagno di lusso all\'arrivo', 'Luxury bath products on arrival'],
    ['concierge', 'Servizio concierge per tutte le prenotazioni in Costa Smeralda', 'Concierge Services for all reservations in Costa Smeralda'],
    ['finale', 'Pulizia finale e lavanderia finale standard', 'Standard Final Cleaning and Final Laundry'],
    ['utenze', 'Tutte le utenze, escluso il riscaldamento della piscina se presente', 'All Utilities except the cost for the pool heating if present']
  ].map(([id, it, en]) => ({ id, it, en, on: true }));
  // posizione sul mare, dalla migliore: si sceglie da un menu; i valori scritti a mano (sito, Excel) si riconoscono
  const MARE = [['pieds', "Pieds dans l'eau", 3], ['seafront', 'Seafront', 2], ['seaview', 'Seaview', 1], ['none', 'None', 0]];
  function mareLivello(s) { const t = String(s || '').trim().toLowerCase(); if (!t) return null;
    if (/pied|dans l.?eau|feet in the water|on the water|direct (sea|beach) access/.test(t)) return 3;
    if (/beach ?front|sea ?fri?ont|fronte ?mare|waterfront/.test(t)) return 2;
    if (/sea ?view|vista ?mare|panoram/.test(t)) return 1;
    if (/^(none|no|nessun[ao]?|-)$/.test(t)) return 0;
    return null; }
  const mareLabel = s => { const n = mareLivello(s); return n === null ? String(s || '') : MARE.find(m => m[2] === n)[1]; };
  const inclusioniDi = st => (Array.isArray(st && st.inclusioni) ? st.inclusioni : INCLUSIONI).filter(x => x && x.id);
  // prezzo di un servizio: a soggiorno (fisso, fattore 1) o settimanale: la prima settimana a prezzo pieno,
  // ogni settimana successiva × coeff (1 = stesso prezzo, 0,8 = ridotta del 20%); settimane = notti / 7, almeno 1
  // settings.prezziServizi[k] = { incluso, vendita, unita: 'soggiorno'|'settimana', coeff }
  // unità: 'soggiorno' (una volta), 'settimana' (× settimane, coeff dalla 2ª), 'giorno' (× giorni = notti + 1); il vecchio 'ore' vale come 'giorno' + personale secondo gli ospiti
  // dal 26/11/2026 (prezziServizi[k].v2 = true, scritto dalla finestra Modifica…): unità 'soggiorno'|'settimana'|'giorno'|'ore' e il personale le segue
  // (figure a € per soggiorno, settimana, giorno o €/h × ore al giorno × giorni). Senza v2: il vecchio 'ore' = a ore + personale secondo gli ospiti;
  // il vecchio personale "a ore" al giorno = 'ore'; il vecchio personale "al giorno" = 'giorno'; il vecchio personale "a ore" a settimana / a soggiorno resta come prima
  const psD = (st, k) => ((st && st.prezziServizi) || {})[k] || {};
  const unitaDi = (st, k) => { const d = psD(st, k), r = d.regola, u = d.unita;
    if (r && REG_GIORNO.includes(r.tipo)) return 'giorno';
    if (!d.v2 && isOre(st, k) && (u === 'giorno' || u === 'ore' || !u)) return 'ore';
    return u === 'ore' || u === 'giorno' || u === 'settimana' ? u : 'soggiorno'; };
  // personale con le ore (€/h × ore): unità "a ore", o il vecchio personale "a ore" non ancora risalvato
  const oreOrarie = (st, k) => { if (!isOre(st, k)) return false; const d = psD(st, k); if (d.regola && REG_GIORNO.includes(d.regola.tipo)) return false; return d.v2 ? d.unita === 'ore' : true; };
  const srvUnita = (st, k) => { const d = psD(st, k); const c = Number(d.coeff), un = unitaDi(st, k), pers = isOre(st, k);
    return { unita: un, settimanale: un === 'settimana', giornaliero: un === 'giorno' || (un === 'ore' && pers), orario: un === 'ore' && !pers, coeff: c >= 0 && d.coeff !== null && d.coeff !== undefined && d.coeff !== '' ? c : 1 }; };
  // etichetta del prezzo (figure del personale e prezzo normale)
  const lblPrezzo = (st, k) => oreOrarie(st, k) ? '€/h' : ({ ore: '€/h', giorno: '€/giorno', settimana: '€/settimana', soggiorno: '€ a soggiorno' })[unitaDi(st, k)];
  const srvSettimane = notti => Math.max(1, (Number(notti) || 0) / 7);
  const srvGiorni = notti => (Number(notti) || 0) + 1;
  // opz.giorni / opz.settimane: valori scritti nella singola offerta (es. solo weekend, 1 settimana su 2)
  const srvFattore = (st, k, notti, opz) => { const u = srvUnita(st, k), o = opz || {};
    if (u.giornaliero) return o.giorni != null && o.giorni !== '' ? Math.max(0, Number(o.giorni) || 0) : srvGiorni(notti);
    if (u.settimanale) { const sw = o.settimane != null && o.settimane !== '' ? Math.max(0, Number(o.settimane) || 0) : srvSettimane(notti); return sw <= 0 ? 0 : 1 + (sw - 1) * u.coeff; }
    // a ore (senza personale): × ore scritte nell'offerta o nella prenotazione, altrimenti le ore di norma (prezziServizi[k].ore), altrimenti 1
    if (u.orario) { const h = nOr(o.ore, nOr(psD(st, k).ore, 1)); return h >= 0 ? h : 1; }
    return 1; };
  const srvPrezzo = (st, k, base, notti, opz) => typeof base === 'number' ? Math.round(base * srvFattore(st, k, notti, opz)) : null;
  /* Prezzo che cambia secondo la villa (fasce: { da, a, vendita }, acquisto '<k>@f:<da>') (Impostazioni → "Prezzi variabili" del servizio o della voce), prima del fattore settimanale:
     prezziServizi[k].loc = { LOCALITÀ: { vendita } } (es. transfer) → sostituisce il prezzo normale nella località della villa;
     prezziServizi[k].regola = { tipo: 'gruppiOspiti'|'gruppiCamere'|'fasceOspiti'|'fasceCamere', n, fasce: [{ fino, vendita }] }:
     gruppi = prezzo × gruppi di n (1–6 ospiti × 1, 7–12 × 2…); fasce = il prezzo della prima fascia con quantità ≤ "fino", oltre l'ultima il prezzo normale.
     Ospiti = quelli dell'offerta / prenotazione, se no la capienza della villa (guests); camere = camere della villa (totalBedrooms).
     Acquisto: stessi criteri, importi in meta/servizi_acquisto con chiavi '<k>@loc:<LOCALITÀ>' e '<k>@f:<fino>' (opz.acq = quella mappa). */
  const numCampo = x => { const m = String(x == null ? '' : x).match(/\d+/g); return m ? m.map(Number).reduce((a, b) => a + b, 0) : 0; };
  const REGOLE = [['', 'Prezzo fisso'], ['gruppiOspiti', 'A gruppi di ospiti'], ['gruppiCamere', 'A gruppi di camere'], ['fasceOspiti', 'A fasce di ospiti'], ['fasceCamere', 'A fasce di camere'], ['personaleOspiti', 'Personale secondo gli ospiti'], ['personaleCamere', 'Personale secondo le camere']];
  // personale: a ore (€/h × ore × giorni) o al giorno (€/giorno × giorni), con le figure che entrano secondo gli ospiti o le camere
  // personale: figure che entrano secondo gli ospiti o le camere; il prezzo di ogni figura segue "Il prezzo vale" (REG_GIORNO = vecchie regole "al giorno", lette come personale + al giorno)
  const REG_PERS = ['personaleOspiti', 'personaleCamere'], REG_GIORNO = ['personaleGiornoOspiti', 'personaleGiornoCamere'];
  const regolaDi = (st, k) => { const d = psD(st, k), r = d.regola;
    if (r && REG_GIORNO.includes(r.tipo)) return Object.assign({}, r, { tipo: r.tipo === 'personaleGiornoCamere' ? 'personaleCamere' : 'personaleOspiti' });
    if (r && REG_PERS.includes(r.tipo)) return r;
    if (!d.v2 && d.unita === 'ore' && !(r && r.tipo)) return { tipo: 'personaleOspiti' };
    return r && r.tipo ? r : null; };
  const srvAdatta = (st, k, base, opz) => { opz = opz || {}; const d = ((st && st.prezziServizi) || {})[k] || {}, v = opz.villa || null; let p = base;
    const loc = v && v.location ? String(v.location).trim().toUpperCase() : '';
    if (loc) { const lv = opz.acq ? opz.acq[k + '@loc:' + loc] : ((d.loc || {})[loc] || {}).vendita; if (typeof lv === 'number') p = lv; }
    const r = d.regola; if (!r || !r.tipo || REG_PERS.includes(r.tipo)) return p;
    const q = /Ospiti$/.test(r.tipo) ? (Number(opz.ospiti) > 0 ? Number(opz.ospiti) : numCampo(v && v.guests)) : numCampo(v && v.totalBedrooms);
    if (!q) return p;
    if (r.tipo.indexOf('gruppi') === 0) { const n = Number(r.n) || 0; return n > 0 && typeof p === 'number' ? p * Math.ceil(q / n) : p; }
    const f = fasceDi(r).find(x => q >= x.da && (x.a == null || q <= x.a)); if (!f) return p;
    const fv = opz.acq ? (typeof opz.acq[k + '@f:' + f.da] === 'number' ? opz.acq[k + '@f:' + f.da] : opz.acq[k + '@f:' + f.a]) : f.vendita; return typeof fv === 'number' ? fv : p; };
  // fasce "da … a …" (a vuoto = e oltre); le vecchie con solo "fino" partono dalla fine della precedente
  function fasceDi(r) { let prev = 0; return (r.fasce || []).map(x => Object.assign({}, x)).sort((x, y) => (x.da != null ? x.da : x.fino || 0) - (y.da != null ? y.da : y.fino || 0))
    .map(x => { const da = typeof x.da === 'number' ? x.da : prev + 1, a = typeof x.a === 'number' ? x.a : typeof x.fino === 'number' ? x.fino : null; prev = a != null ? a : prev; return { da, a, vendita: x.vendita }; }); }
  /* Prezzo "a ore, con il personale" (prezziServizi[k].unita = 'ore', es. cuoco): figure = [{ id, it, en, da, vendita (€/h), ore (al giorno) }];
     una figura entra quando gli ospiti sono almeno "da" (cuoco 1, butler 7, extra waiter e kitchen aid 13). Acquisto €/h di ogni figura nella parte
     protetta: chiave '<k>@h:<id>'. Totale = Σ figure attive (€/h × ore × giorni), giorni = notti del soggiorno. opz.over = { id: { vendita, ore } }
     = valori cambiati nella singola offerta; opz.giorni = giorni effettivi se il servizio non è tutti i giorni (es. solo weekend). */
  const isOre = (st, k) => { const r = regolaDi(st, k); return !!(r && REG_PERS.includes(r.tipo)); };
  const perCamere = (st, k) => { const r = regolaDi(st, k); return !!(r && r.tipo === 'personaleCamere'); };
  // personale senza ore (prezzo della figura a soggiorno, a settimana o al giorno)
  const isGiorn = (st, k) => isOre(st, k) && !oreOrarie(st, k);
  const FIG_DEF = [{ id: 'f1', it: 'Cuoco', en: 'Chef', da: 1, vendita: null, ore: 6 }];
  const figureDi = (st, k) => { const f = ((((st && st.prezziServizi) || {})[k]) || {}).figure; return Array.isArray(f) && f.length ? f : FIG_DEF; };
  const nOr = (x, y) => { const z = typeof x === 'string' ? Number(x.replace(/\./g, '').replace(',', '.')) : x; return typeof z === 'number' && isFinite(z) && String(x).trim() !== '' ? z : y; };
  const oreCalc = (st, k, notti, opz) => { opz = opz || {}; const v = opz.villa || null, over = opz.over || {};
    const osp = (Number(opz.ospiti) > 0 ? Number(opz.ospiti) : numCampo(v && v.guests)) || 1, cam = numCampo(v && v.totalBedrooms) || 1, cc = perCamere(st, k), q = cc ? cam : osp;
    // le figure danno il prezzo di base (€/h × ore); l'unità moltiplica: al giorno × giorni, a settimana × settimane (coeff), a soggiorno una volta
    const gd = !oreOrarie(st, k), g = srvFattore(st, k, notti, { giorni: opz.giorni, settimane: opz.settimane }), u = srvUnita(st, k);
    const righe = figureDi(st, k).filter(f => q >= (Number(f.da) || 1)).map(f => { const o2 = over[f.id] || {};
      const ore = gd ? 1 : nOr(o2.ore, typeof f.ore === 'number' ? f.ore : null), vh = nOr(o2.vendita, typeof f.vendita === 'number' ? f.vendita : null), ah = opz.acq ? nOr(o2.acquisto, opz.acq[k + '@h:' + f.id]) : null;
      return { id: f.id, it: f.it, en: f.en, ore, giorni: g, vh, ah, v: vh != null && ore != null ? Math.round(vh * ore * g) : null, a: ah != null && ore != null ? Math.round(ah * ore * g) : null }; });
    const tot = c => righe.some(r => typeof r[c] === 'number') ? righe.reduce((t, r) => t + (r[c] || 0), 0) : null;
    return { righe, ospiti: osp, camere: cam, perCamere: cc, giorn: gd, lbl: lblPrezzo(st, k), unita: u.unita, giorni: g, vendita: tot('v'), acquisto: tot('a') }; };
  // nomi delle figure attive per la mail: "Chef", "Chef and Butler", "Chef, Butler, extra Waiter and Kitchen Aid"
  const nomeFigure = (righe, lingua) => { const n = righe.map(r => (lingua === 'en' ? r.en : r.it) || r.it || r.en).filter(Boolean); const e = lingua === 'en' ? ' and ' : ' e ';
    return n.length < 2 ? (n[0] || '') : n.slice(0, -1).join(', ') + e + n[n.length - 1]; };
  const srvPrezzoV = (st, k, base, notti, opz) => { if (isOre(st, k)) { const r = oreCalc(st, k, notti, opz); return opz && opz.acq ? r.acquisto : r.vendita; } return srvPrezzo(st, k, srvAdatta(st, k, base, opz), notti, opz); };
  // a carico di chi è un servizio: 'esmeralda' (incluso, lo paghiamo noi: spese servizi del listino), 'parte' (si somma al prezzo),
  // 'proprietario' (incluso, lo fornisce il proprietario). Di norma da Impostazioni (prezziServizi[k].carico, vecchio "incluso"),
  // per la villa "Servizi compresi nel prezzo" (villas.serviziInclusi) = a carico del proprietario. Mai impostato = a parte.
  const CARICHI = ['esmeralda', 'parte', 'proprietario'];
  const CARICO_LABEL = { esmeralda: 'A carico di Esmeralda', parte: 'A carico del cliente', proprietario: 'A carico del proprietario' };
  const CARICO_BREVE = { esmeralda: 'Esmeralda', parte: 'Cliente', proprietario: 'Proprietario' };
  // voci delle note spese con prezzo: chiave 'voce:<nome>' in prezziServizi / servizi_acquisto; il carico viene dalle liste
  // categorieAggiuntive (cliente) e categorieProprietario (proprietario), altrimenti Esmeralda (come per le note spese)
  const VOCE = 'voce:';
  const voceKey = nome => VOCE + nome;
  const isVoceKey = k => String(k || '').startsWith(VOCE);
  const voceNome = k => String(k || '').slice(VOCE.length);
  // tar (facoltativo): carico della tariffa (prezziServizi[k].caricoTar = { tariffa: carico }, solo servizi); senza = carico generale
  const caricoSet = (st, k, tar) => { if (tar && !isVoceKey(k)) { const ct = ((((st && st.prezziServizi) || {})[k] || {}).caricoTar) || {}; if (CARICHI.includes(ct[tar])) return ct[tar]; }
    if (isVoceKey(k)) { const n = voceNome(k); return ((st && st.categorieAggiuntive) || []).includes(n) ? 'parte' : ((st && st.categorieProprietario) || []).includes(n) ? 'proprietario' : 'esmeralda'; }
    const c = caricoGrezzo(st, k); return c === 'esmeralda' && !(st && st.caricoV2) ? 'parte' : c; };
  // carico com'era salvato (prima del 20/11/2026 "Esmeralda" voleva dire "compreso nel listino": ora è Cliente + Predefinito; caricoV2 = convertito)
  function caricoGrezzo(st, k) { const d = ((st && st.prezziServizi) || {})[k] || {}; return CARICHI.includes(d.carico) ? d.carico : d.incluso === true ? 'esmeralda' : 'parte'; }
  // Predefinito: entra da solo nel listino (spese servizi della scheda villa, se a carico del cliente) e nell'offerta parte già spuntato
  // tar (facoltativo): Predefinito solo per le tariffe di predefTar (mancante = tutte)
  const TAR_BREVE = { settimanale: 'Sett.', bisettimanale: 'Bisett.', mensile: 'Mese', bimensile: '2 mesi' };
  const predefTarDi = (st, k) => { const a = ((((st && st.prezziServizi) || {})[k] || {}).predefTar); return Array.isArray(a) ? a : null; };
  // tariffa di una prenotazione dalle notti: < 14 settimanale, 14–27 bisettimanale, 28–55 mensile, 56+ bimensile
  // come si presenta al cliente un servizio offerto di default in quella tariffa: 'totale' (nel totale unico e nel listino) o 'separato' (a parte);
  // prezziServizi[k].quotaTar = { tariffa: 'separato'|'totale' }, altrimenti il vecchio prezziServizi[k].quota (Sommato / Non sommato)
  const quotaTarDi = (st, k, tar) => { const d = ((st && st.prezziServizi) || {})[k] || {}; const q = d.quotaTar && tar ? d.quotaTar[tar] : null; return q === 'separato' || q === 'totale' ? q : (d.quota === 'separato' ? 'separato' : 'totale'); };
  const tarDaNotti = n => n >= 56 ? 'bimensile' : n >= 28 ? 'mensile' : n >= 14 ? 'bisettimanale' : 'settimanale';
  const predefSet = (st, k, tar) => { const b = predefBase(st, k); if (!b || !tar) return b; const a = predefTarDi(st, k); return !a || a.includes(tar); };
  const predefBase = (st, k) => { const d = ((st && st.prezziServizi) || {})[k] || {}; if (typeof d.predef === 'boolean') return d.predef; if (st && st.caricoV2) return false;
    if (isVoceKey(k)) { const n = voceNome(k); return !((st.categorieAggiuntive || []).includes(n) || (st.categorieProprietario || []).includes(n)) && typeof d.vendita === 'number'; }
    return caricoGrezzo(st, k) === 'esmeralda'; };
  // conversione una tantum delle impostazioni al nuovo significato (servizi "Esmeralda" → Cliente + Predefinito; voci Esmeralda con prezzo → Predefinite)
  const migraCarichi = st0 => { const st = JSON.parse(JSON.stringify(st0 || {})); if (st.caricoV2) return st; const ps = st.prezziServizi = st.prezziServizi || {};
    Object.keys(ps).forEach(k => { const pd = predefSet(st0, k); if (!isVoceKey(k) && caricoGrezzo(st0, k) === 'esmeralda') { ps[k].carico = 'parte'; ps[k].incluso = false; } ps[k].predef = pd; });
    st.caricoV2 = true; return st; };
  const caricoDef = (st, villa, k, tar) => villa && (villa.serviziInclusi || []).includes(k) ? 'proprietario' : caricoSet(st, k, tar);
  // dettaglio di una prenotazione: carico salvato, altrimenti il vecchio "incluso" (incluso = a carico di Esmeralda)
  const caricoDi = d => d && CARICHI.includes(d.carico) ? d.carico : d && d.incluso === false ? 'parte' : 'esmeralda';
  const TAR_SETT = { settimanale: 1, bisettimanale: 2, mensile: 4, bimensile: 8 };
  window.SDB = { lblPrezzo, oreOrarie, isGiorn, REG_GIORNO, quotaTarDi, TAR_BREVE, predefTarDi, tarDaNotti, isOre, perCamere, regolaDi, unitaDi, srvGiorni, REG_PERS, figureDi, oreCalc, nomeFigure, fasceDi, srvAdatta, srvPrezzoV, REGOLE, numCampo, predefSet, migraCarichi, voceKey, isVoceKey, voceNome, CARICHI, CARICO_LABEL, CARICO_BREVE, caricoSet, caricoDef, caricoDi, TAR_SETT, MARGINE_MIN, AGENZIA_DEF, srvUnita, srvSettimane, srvFattore, srvPrezzo, MARE, mareLivello, mareLabel, INCLUSIONI, inclusioniDi, CAMPI_SCHEDA, CAMPI_NASCOSTI_DEFAULT, nascostiDi, periodsFor, autoPeriods, autoPeriodsFor, cambioDi, STATUS_COLOR, PALETTE, inkFor, DAY, MESI, MESI_L, GG, parse, iso, addDays, diffDays, dm, dmy, TARIFFE, STATI, defaultSettings, defaultPeriods, salePrice, priceAt, emptyPricing, money, short, parseMoney, uid };
})();
