/*
 * Pagina "Offerte": scegli tariffa e periodo, scegli le ville, e prepara per il cliente
 *  - un documento Word con foto, informazioni e prezzo di ogni villa;
 *  - una mail da incollare in Gmail (testo e foto copiati negli appunti), con "Apri Gmail";
 *  - un messaggio WhatsApp (testo, aperto già scritto nella chat del cliente) oppure un PDF da mandare su WhatsApp.
 * Italiano o inglese a scelta. Usa solo i dati che l'account può vedere (campi riservati esclusi).
 */
(function () {
  const T = {
    it: {
      titolo: 'Proposta ville', per: 'Periodo', ospiti: 'Ospiti', camere: 'Camere', bagni: 'Bagni', interni: 'Interni', esterni: 'Esterni',
      piscina: 'Piscina', spa: 'Spa', palestra: 'Palestra', mare: 'Posizione', localita: 'Località', servizi: 'Servizi inclusi', sito: 'Scopri di più',
      prezzo: 'Prezzo per il periodo', richiesta: 'Su richiesta', dal: 'dal', al: 'al', saluti: 'Cordiali saluti',
      intro: (c, p) => `${c ? 'Gentile ' + c + ',' : 'Gentile cliente,'}\ncome richiesto, di seguito le nostre proposte per il periodo ${p}.`,
      chiusa: 'I prezzi si intendono per l\'intero periodo indicato. Restiamo a disposizione per qualsiasi informazione o per organizzare una visita.',
      oggetto: p => `La sua richiesta · ${p}`,
      proposte: 'Ecco le nostre proposte:', extra: 'Servizi a parte', totale: 'Totale con i servizi', inclVilla: 'Compreso per questa villa', webBro: 'Web brochure', video: 'Guarda il video', qui: 'qui', tariffa: 'Tariffa', inclusiTit: 'Le tariffe includono:',
      inclusi: 'Pulizia giornaliera della casa\nGiardinaggio e pulizia della piscina regolari\nCambio biancheria e asciugamani due volte a settimana\nProdotti da bagno di lusso all\'arrivo\nServizio concierge per tutte le prenotazioni in Costa Smeralda\nPulizia finale e lavanderia finale standard\nTutte le utenze, escluso il riscaldamento della piscina se presente',
      chiusaMail: 'Il nostro Concierge sarà a disposizione per qualsiasi servizio extra durante il soggiorno.',
      soggetta: 'Offerta soggetta a disponibilità e ad approvazione finale del proprietario.',
      villeTit: 'Ville proposte', sitoWeb: 'Sito web',
      waBreve: (c, p) => `${c ? 'Gentile ' + c : 'Buongiorno'},\nin allegato la nostra proposta di ville per il periodo ${p}.\nRestiamo a disposizione per qualsiasi informazione.`
    },
    en: {
      titolo: 'Villa proposal', per: 'Dates', ospiti: 'Guests', camere: 'Bedrooms', bagni: 'Bathrooms', interni: 'Indoor', esterni: 'Outdoor',
      piscina: 'Pool', spa: 'Spa', palestra: 'Gym', mare: 'Position', localita: 'Location', servizi: 'Included services', sito: 'Discover more',
      prezzo: 'Price for the period', richiesta: 'On request', dal: 'from', al: 'to', saluti: 'Kind regards',
      intro: (c, p) => `${c ? 'Dear ' + c + ',' : 'Dear guest,'}\nplease find our suggested options below for the period ${p}.`,
      chiusa: 'Prices refer to the whole period indicated. We remain at your disposal for any further information.',
      oggetto: p => `Your Enquiry · ${p}`,
      proposte: 'Herewith our suggestions:', extra: 'Extra services', totale: 'Total including services', inclVilla: 'Included for this villa', webBro: 'Web brochure', video: 'Watch the video', qui: 'here', tariffa: 'Rate', inclusiTit: 'The rates do include:',
      inclusi: 'Daily Cleaning for the resetting of the house\nRegular Gardening and pool cleaning\nLinen & towel change twice per week\nLuxury bath products on arrival\nConcierge Services for all reservations in Costa Smeralda\nStandard Final Cleaning and Final Laundry\nAll Utilities except the cost for the pool heating if present',
      chiusaMail: 'Our Concierge will be ready to accommodate any requests for extra services needed during your stay.',
      soggetta: 'Offer subject to availability and owner\'s final approval.',
      villeTit: 'Proposed villas', sitoWeb: 'Website',
      waBreve: (c, p) => `${c ? 'Dear ' + c : 'Hello'},\nplease find attached our villa proposal for the period ${p}.\nWe remain at your disposal for any further information.`
    }
  };
  const FIRMA = 'Esmeralda Luxury Villas';
  // esito delle offerte e tipo dei contatti (salvati nei documenti di offerte/)
  const ESITI = [['corso', 'In corso'], ['sollecitata', 'Sollecitata'], ['presa', 'Presa'], ['persa', 'Persa']];
  const esitoDi = x => ESITI.some(e => e[0] === x.esito) ? x.esito : 'corso';
  const aperta = x => !['presa', 'persa'].includes(esitoDi(x));
  const TIPI_C = [['lead', 'Lead'], ['prospect', 'Prospect']];
  // numero di telefono con il prefisso internazionale, solo cifre (+39 / 0039 / cellulare italiano senza prefisso → 39…)
  const telN = t => { let d = String(t || '').trim(); const piu = d.startsWith('+'); d = d.replace(/\D/g, '');
    if (!d) return ''; if (!piu && d.startsWith('00')) d = d.slice(2); else if (!piu && /^3\d{8,9}$/.test(d)) d = '39' + d; return d; };
  const chiaveCli = x => x.email ? 'm:' + String(x.email).toLowerCase() : x.telefono ? 't:' + (telN(x.telefono) || x.telefono) : x.cliente ? 'n:' + String(x.cliente).trim().toLowerCase() : '-';
  // un contatto = le offerte con la stessa email (o telefono, o nome); il tipo è quello dell'offerta più recente che lo ha
  function contatti(lista) {
    const g = {}; lista.forEach(x => { const k = chiaveCli(x); (g[k] = g[k] || []).push(x); });
    return Object.entries(g).map(([k, l]) => { l.sort((a, b) => String(b.quando).localeCompare(String(a.quando)));
      const c = l.find(x => x.cliente) || l[0], em = l.find(x => x.email), tl = l.find(x => x.telefono), tp = l.find(x => TIPI_C.some(t => t[0] === x.tipoContatto));
      return { k, l, ultimo: l[0].quando, nome: c.cliente || '', email: em ? em.email : '', tel: tl ? tl.telefono : '', tipo: tp ? tp.tipoContatto : '' }; })
      .sort((a, b) => String(b.ultimo).localeCompare(String(a.ultimo)));
  }
  const setTipo = (store, c, tipo) => Promise.all(c.l.map(x => store.updateOfferta(x.id, { tipoContatto: tipo })));
  const setEsito = (store, id, esito) => store.updateOfferta(id, { esito, esitoIl: new Date().toISOString() });
  const dataBreve = iso => { try { return new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }); } catch (_) { return ''; } };
  const escH = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const selEsito = x => `<select class="off-esito es-${esitoDi(x)}" data-esito="${escH(x.id)}" aria-label="Esito dell'offerta">${ESITI.map(([k, t]) => `<option value="${k}" ${esitoDi(x) === k ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
  const segTipo = c => `<div class="seg off-tipo" data-tipo-c="${escH(c.k)}">${TIPI_C.map(([k, t]) => `<button type="button" data-tipo="${k}" class="${c.tipo === k ? 'on' : ''}">${t}</button>`).join('')}</div>`;

  function mount(main, ctx) {
    const { ui, saveUI, esc, data, store, $, $$, toast, S, settings, blocks, hiddenField } = ctx;
    const favLists = ctx.favLists || (() => []), locations = ctx.locations || (() => []), normLoc = ctx.normLoc || (x => String(x || '').trim().toUpperCase());
    const X = window.SDBExport;
    const o = ui.off = Object.assign({ tariff: 'settimanale', idx: 0, ville: [], prezzi: {}, cliente: '', email: '', tel: '', lingua: 'it', nFoto: 3, soloLibere: true, q: '', intro: '', chiusa: '', introMod: false, chiusaMod: false, note: {}, incSel: null, incExtra: '', firma: 'Esmeralda Luxury Villas' }, ui.off || {});
    const L = () => T[o.lingua] || T.it;
    if (!o.note) o.note = {};
    if (!o.f || typeof o.f !== 'object') o.f = {};
    if (!o.srv || typeof o.srv !== 'object') o.srv = {};
    if (!o.srvVilla || typeof o.srvVilla !== 'object') o.srvVilla = {}; // prezzi dei servizi scritti per una sola villa nel riepilogo: { villaId: { chiave: '1.200' } }
    // servizi dell'offerta: quelli delle prenotazioni (Impostazioni → Servizi e inclusioni), con prezzo di vendita modificabile qui
    const SRV_EN = { pulizia: 'Final cleaning', cuoco: 'Private chef', transfer: 'Transfer' };
    // servizi di base (rinominabili o tolti in Impostazioni: settings.serviziBase) + quelli aggiunti
    const srvList = () => [['pulizia', 'Pulizia finale'], ['cuoco', 'Cuoco'], ['transfer', 'Transfer']].filter(([key]) => !((st.serviziBase || {})[key] || {}).off).map(([key, label]) => ({ key, label: String(((st.serviziBase || {})[key] || {}).label || '').trim() || label }))
      .concat(((st.servizi) || []).filter(x => x && x.key && !x.off).map(x => ({ key: x.key, label: x.label })))
      // voci delle note spese con un prezzo di vendita in Impostazioni: si possono proporre (prezzo e carico), ma senza testi nella mail
      .concat(Object.keys(st.prezziServizi || {}).filter(k => S.isVoceKey(k) && typeof st.prezziServizi[k].vendita === 'number' && (!Array.isArray(st.categorieSpese) || st.categorieSpese.includes(S.voceNome(k)))).map(k => ({ key: k, label: S.voceNome(k), voce: true })));
    // spuntati di norma: i Predefiniti di Impostazioni e quelli compresi nella scheda di una villa scelta (a carico del proprietario)
    const srvDefOn = k => S.predefSet(st, k) || (o.ville || []).some(id => { const v = (data().villas || []).find(z => z.id === id); return v && (v.serviziInclusi || []).includes(k); });
    const srvDi = k => { const d = (st.prezziServizi || {})[k] || {}; const x = o.srv[k] || {};
      const modo = ['pred', 'inc', 'parte'].includes(x.modo) ? x.modo : x.incluso === true ? 'inc' : x.incluso === false ? 'parte' : 'pred';
      // non ancora toccato nell'offerta: spuntato di norma se compreso nel prezzo (a carico di Esmeralda o del proprietario, in Impostazioni
      // o nella scheda di una delle ville scelte); togliendo la spunta il servizio non c'è più (né testo né valore)
      return { on: x.on === undefined ? srvDefOn(k) : !!x.on, modo, prezzo: x.prezzo !== undefined && String(x.prezzo).trim() !== '' ? String(x.prezzo) : '' }; };
    // prezzo di un servizio per una villa: quello scritto qui nell'offerta (uguale per tutte), altrimenti quello della scheda villa, altrimenti Impostazioni
    // prezzo "di base" (senza modifiche nell'offerta): scheda villa, altrimenti Impostazioni; se settimanale, sulle settimane del periodo
    const prezzoSrvBase = (v, k) => { const pe = v ? perOf(v) : null, notti = pe && pe.from && pe.to ? S.diffDays(pe.from, pe.to) : 0;
      const pv = (v && v.prezziServizi || {})[k]; if (typeof pv === 'number') return S.srvPrezzo(st, k, pv, notti); const d = (st.prezziServizi || {})[k] || {}; return typeof d.vendita === 'number' ? S.srvPrezzo(st, k, d.vendita, notti) : null; };
    // ordine: prezzo scritto per questa villa nel riepilogo → prezzo scritto per tutte al punto 3 → base
    const prezzoSrv = (v, k) => { const y = v && (o.srvVilla[v.id] || {})[k]; if (y !== undefined && String(y).trim() !== '') return S.parseMoney(y);
      const x = (o.srv[k] || {}).prezzo; if (x !== undefined && String(x).trim() !== '') return S.parseMoney(x); return prezzoSrvBase(v, k); };
    // stili della mail: due di base + quelli salvati da tutti in meta/settings.stiliMail
    const FONT = [['tahoma,sans-serif', 'Tahoma'], ['Arial,Helvetica,sans-serif', 'Arial'], ['Verdana,Geneva,sans-serif', 'Verdana'], ["'Trebuchet MS',Helvetica,sans-serif", 'Trebuchet'],
      ["Georgia,'Times New Roman',serif", 'Georgia'], ["'Palatino Linotype',Palatino,'Book Antiqua',serif", 'Palatino'], ["Garamond,'EB Garamond',Georgia,serif", 'Garamond'], ["'Times New Roman',Times,serif", 'Times']];
    const STILI_BASE = [
      { id: 'classico', nome: 'Classico', font: 'tahoma,sans-serif', size: 14, testo: '#000000', accento: '#000000', titoli: 'sottolineato', separatori: false },
      { id: 'elegante', nome: 'Elegante', font: "Georgia,'Times New Roman',serif", size: 15, testo: '#2b2b2b', accento: '#9a7b4f', titoli: 'maiuscoletto', separatori: true }];
    const stiliSalvati = () => (Array.isArray(settings().stiliMail) ? settings().stiliMail : []).filter(x => x && x.id);
    const stili = () => { const sv = stiliSalvati(); return STILI_BASE.map(b => sv.find(x => x.id === b.id) || b).concat(sv.filter(x => !STILI_BASE.some(b => b.id === x.id)).sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'it'))); };
    if (!o.stile || typeof o.stile !== 'object') o.stile = Object.assign({}, stili().find(x => x.id === settings().stileMailDi) || STILI_BASE[0]);
    const salvaStili = l => { const cur = JSON.parse(JSON.stringify(settings())); cur.stiliMail = l; return Promise.resolve(store.setSettings(cur)); };
    // link alle web brochure (normale e/o anonima) sotto il prezzo di ogni villa
    const linkWb = v => [o.linkWB && vis(v, 'webBrochure') && String(v.webBrochure || '').trim(), o.linkWBA && vis(v, 'webBrochureAnonima') && String(v.webBrochureAnonima || '').trim()].filter(u => u && /^https?:\/\//i.test(u));
    const srvNome = x => o.lingua === 'en' ? (SRV_EN[x.key] || x.label) : x.label;
    // un servizio è incluso per una villa se "Includi tutti", oppure con "Predefinito" se la scheda villa lo ha tra i servizi compresi nel prezzo
    // compreso nel prezzo della villa: a carico di Esmeralda (già nelle spese servizi del listino) o del proprietario (scheda villa)
    // compreso nel prezzo per questa villa: omaggio di Esmeralda, a carico del proprietario, o del cliente ma Predefinito (già nel listino)
    const inclVilla = (v, k) => { const c = S.caricoDef(settings(), v, k); return c !== 'parte' || S.predefSet(settings(), k); };
    const inclusoPer = (v, k) => { const d = srvDi(k); return d.modo === 'inc' || (d.modo === 'pred' && inclVilla(v, k)); };
    const srvAttivi = () => srvList().map(x => Object.assign({}, x, srvDi(x.key))).filter(x => x.on).map(x => Object.assign(x, { eur: S.parseMoney(x.prezzo) }));
    const srvAparte = v => srvAttivi().filter(x => !inclusoPer(v, x.key)).map(x => Object.assign({}, x, { eur: prezzoSrv(v, x.key) }));
    // inclusi divisi per chi li paga: a carico del proprietario (scheda villa o Impostazioni), altrimenti Esmeralda
    const incRighe = (v, inc) => { const c = x => S.caricoDef(st, v, x.key), pr = inc.filter(x => c(x) === 'proprietario'), om = inc.filter(x => c(x) === 'esmeralda'), cl = inc.filter(x => !pr.includes(x) && !om.includes(x));
      const r = (t, l) => l.length ? `<small class="off-riep-l">${t}: ${esc(l.map(x => x.label).join(', '))}</small>` : '';
      return r('Inclusi nel prezzo', cl) + r('Omaggio Esmeralda', om) + r('Inclusi proprietario', pr); };
    const srvInclVilla = v => srvList().filter(x => srvDi(x.key).on && inclusoPer(v, x.key));
    const extraTot = v => srvAparte(v).reduce((t, x) => t + (typeof x.eur === 'number' ? x.eur : 0), 0);
    // inclusi per tutte le ville scelte: vanno nell'elenco comune "Le tariffe includono"; gli altri inclusi si scrivono sotto la singola villa
    // per il cliente: un servizio a parte con prezzo risulta incluso (il prezzo è già nel totale); a parte senza prezzo non compare
    const incluseVilla = v => srvAttivi().filter(x => inclusoPer(v, x.key) || (typeof x.eur === 'number' && x.eur > 0));
    const prezzoTot = v => { const pr = prezzoDi(v); return pr === null ? null : pr + extraTot(v); };
    // elenco comune: "Includi tutti", oppure "A parte tutti" con un prezzo; con "Predefinito" il servizio va sempre sotto le singole ville
    const prezzato = x => typeof x.eur === 'number' && x.eur > 0;
    // il cliente "ha" il servizio in questa villa: se non è spuntato nell'offerta, mai (tolto dall'offerta);
    // se è spuntato: Includi tutti → sì; A parte tutti → se ha un prezzo; Predefinito → se la scheda lo comprende o se ha un prezzo
    const haServ = (v, k) => { const d = srvDi(k), sch = inclVilla(v, k); if (!d.on) return false;
      if (d.modo === 'inc') return true; const pr = prezzoSrv(v, k), conPrezzo = typeof pr === 'number' && pr > 0;
      return d.modo === 'parte' ? conPrezzo : sch || conPrezzo; };
    // elenco comune: i servizi che hanno tutte le ville dell'offerta (compresi o a pagamento); gli altri vanno sotto le ville che li hanno
    const inclTutte = () => { const vv = scelte(); return vv.length ? srvList().filter(x => vv.every(v => haServ(v, x.key))).map(x => x.key) : srvAttivi().filter(x => x.modo === 'inc').map(x => x.key); };
    const descrSel = k => { const sel = incSel(); return S.inclusioniDi(st).filter(i => i.servizio === k && sel.includes(i.id)); };
    const testiSrv = k => { if (S.isVoceKey(k)) return []; const l = descrSel(k).map(i => (o.lingua === 'en' ? i.en : i.it) || i.it || i.en); const x = srvList().find(z => z.key === k); return l.length ? l : S.inclusioniDi(st).some(i => i.servizio === k) ? [] : [srvNome(x || { key: k, label: k })]; };
    const srvInclusi = () => inclTutte().filter(k => !S.isVoceKey(k) && !S.inclusioniDi(st).some(i => i.servizio === k)).map(k => srvNome(srvList().find(z => z.key === k) || { key: k, label: k }));
    const inclSoloVilla = v => { const tutti = inclTutte(); return srvList().filter(x => haServ(v, x.key) && !tutti.includes(x.key) && testiSrv(x.key).length); };
    const st = settings();
    const fmtD = (iso, lang) => new Date(S.parse(iso)).toLocaleDateString(lang === 'en' ? 'en-GB' : 'it-IT', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
    const rangeTxt = (p, lang) => lang === 'en' ? `${fmtD(p.from, lang)} – ${fmtD(p.to, lang)}` : `dal ${fmtD(p.from, lang)} al ${fmtD(p.to, lang)}`;
    const ville = () => data().villas.slice().sort((a, b) => String(a.name).localeCompare(String(b.name), 'it', { numeric: true }));
    const perOf = v => S.periodsFor(st, v, o.tariff)[o.idx] || null;
    const listinoOf = v => { const x = S.priceAt(v, o.tariff, o.idx, 'listino'); return x; };
    const stato = v => {
      const p = perOf(v); if (!p) return 'nd';
      const pr = listinoOf(v); if (pr === 'ND') return 'nd';
      const busy = data().bookings.some(b => b.villaId === v.id && blocks(b.status) && b.from < p.to && b.to > p.from);
      return busy ? 'occupata' : 'libera';
    };
    const prezzoDi = v => { const k = o.prezzi[v.id]; if (k !== undefined && k !== '') { const n = S.parseMoney(k); return typeof n === 'number' ? n : null; } const x = listinoOf(v); return typeof x === 'number' ? x : null; };
    const euro = n => new Intl.NumberFormat(o.lingua === 'en' ? 'en-GB' : 'it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0, useGrouping: 'always' }).format(n);
    const baseP = () => S.periodsFor(st, null, o.tariff);
    const periodoTxt = () => {
      const sel = ville().filter(v => o.ville.includes(v.id)); const ps = sel.map(perOf).filter(Boolean);
      const same = ps.length && ps.every(p => p.from === ps[0].from && p.to === ps[0].to);
      const p = same ? ps[0] : baseP()[o.idx]; if (!p) return '';
      return same || o.tariff === 'settimanale' ? rangeTxt(p, o.lingua) : (p.label + ' ' + String(p.from).slice(0, 4));
    };
    // anteprima della mail, aggiornata a ogni modifica
    let tPrev = null;
    const schedPrev = () => { clearTimeout(tPrev); tPrev = setTimeout(async () => { const el = document.getElementById('off-anteprima'); if (!el) return;
      const og = document.getElementById('off-ogg'); if (og) og.innerHTML = `<b>Oggetto:</b> ${esc(oggettoMail())}${o.email ? ` · <b>A:</b> ${esc(o.email)}` : ''}`;
      if (!o.ville.length) { el.innerHTML = '<p class="note">Scegli almeno una villa per vedere l\'anteprima.</p>'; return; }
      try { el.innerHTML = await htmlMail(); } catch (err) { console.warn('anteprima', err); } }, 150); };
    const oggettoMail = () => (o.oggettoMod && String(o.oggetto || '').trim()) ? o.oggetto.trim() : L().oggetto(periodoTxt());
    const save = () => { saveUI(); schedPrev(); };

    main.innerHTML = `<div class="page"><div class="wrap off-page">
      <div class="head"><div><h1>Offerte</h1><div class="sub">Scegli il periodo e le ville: prepari un documento Word o una mail per il cliente, con foto, informazioni e prezzo</div></div>
        <div class="seg off-tabs" id="off-tabs"><button type="button" data-tab="nuova" class="${!['storico', 'contatti'].includes(o.tab) ? 'on' : ''}">Nuova offerta</button><button type="button" data-tab="storico" class="${o.tab === 'storico' ? 'on' : ''}">Storico<span id="off-st-n"></span></button><button type="button" data-tab="contatti" class="${o.tab === 'contatti' ? 'on' : ''}">Contatti<span id="off-ct-n"></span></button></div>
        <button type="button" class="btn small" id="off-reset" title="Svuota l'offerta in corso: cliente, ville, prezzi e servizi tornano quelli di partenza (le Impostazioni non cambiano)">Ricomincia da zero</button></div>
      <div id="off-storico" ${o.tab === 'storico' ? '' : 'hidden'}></div>
      <div id="off-contatti" ${o.tab === 'contatti' ? '' : 'hidden'}></div>
      <div id="off-editor" ${['storico', 'contatti'].includes(o.tab) ? 'hidden' : ''}>
      <section class="card"><h2>1 · Periodo</h2>
        <div class="seg off-tar" id="off-tar">${S.TARIFFE.map(t => `<button type="button" data-t="${t.key}" class="${o.tariff === t.key ? 'on' : ''}">${t.label}</button>`).join('')}</div>
        <div class="off-pernav"><button type="button" class="btn" id="off-prev" aria-label="Periodo precedente">‹</button><div class="off-persel" id="off-persel"></div><button type="button" class="btn" id="off-next" aria-label="Periodo successivo">›</button></div>
        <div class="off-cal" id="off-cal"></div>
        <p class="note">Le ville con giorno di cambio o periodi diversi mostrano le loro date esatte.</p>
      </section>
      <section class="card"><h2>2 · Ville <span class="off-count" id="off-count"></span></h2>
        <div class="off-tools"><label class="flag off-all" title="Seleziona o deseleziona tutte le ville dell'elenco"><input type="checkbox" id="off-all"><span><b>Tutte</b></span></label><input type="search" id="off-q" placeholder="Cerca villa o località" value="${esc(o.q)}">
          <label class="flag off-free"><input type="checkbox" id="off-free" ${o.soloLibere ? 'checked' : ''}><span><b>Solo ville libere</b></span></label>
          <button type="button" class="btn off-ftog" id="off-ftog" aria-expanded="${o.fOpen ? 'true' : 'false'}"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M3 5h18l-7 8v6l-4-2v-4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>Filtri<span class="off-fn" id="off-fn"></span></button></div>
        <div class="off-filters" id="off-filters" ${o.fOpen ? '' : 'hidden'}>
          <label class="field"><span>Location</span><select id="off-f-loc"><option value="">Tutte</option>${locations().map(l => `<option ${o.f.loc === l ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
          <label class="field"><span>Preferiti</span><select id="off-f-fav"><option value="">Tutte le ville</option>${favLists().map(l => `<option value="${esc(l.id)}" ${o.f.fav === l.id ? 'selected' : ''}>♥ ${esc(l.nome)} (${(l.ville || []).length})</option>`).join('')}</select></label>
          <label class="field"><span>Seafront – Seaview</span><select id="off-f-mare"><option value="">Tutte</option>${S.MARE.filter(m => m[2] > 0).map(([, t, n]) => `<option value="${n}" ${String(o.f.mare || '') === String(n) ? 'selected' : ''}>${esc(t)}${n < 3 ? ' o superiore' : ''}</option>`).join('')}</select></label>
          <label class="field f-num"><span>Ospiti min</span><input id="off-f-osp" inputmode="numeric" value="${esc(o.f.osp || '')}"></label>
          <label class="field f-num"><span>Camere min</span><input id="off-f-cam" inputmode="numeric" value="${esc(o.f.cam || '')}"></label>
          <label class="field f-num"><span>Prezzo da</span><input id="off-f-da" inputmode="numeric" placeholder="es. 25k" value="${esc(o.f.da || '')}"></label>
          <label class="field f-num"><span>Prezzo a</span><input id="off-f-a" inputmode="numeric" placeholder="es. 75k" value="${esc(o.f.a || '')}"></label>
          <label class="flag"><input type="checkbox" id="off-f-pisc" ${o.f.pisc ? 'checked' : ''}><span><b>Con piscina</b></span></label>
          <button type="button" class="btn ghost" id="off-f-reset">Azzera filtri</button>
        </div>
        <div id="off-list" class="off-list"></div>
      </section>
      <section class="card"><h2>3 · Servizi e prezzi</h2>
        <div class="field"><span>Servizi</span><div class="tbl-wrap"><table class="prices off-srv"><thead><tr><th>Servizio</th><th>Nell'offerta</th><th>Prezzo €</th></tr></thead><tbody id="off-srv"></tbody></table></div>
          <small class="note">Spunta i servizi da proporre. <b>Predefinito</b>: incluso nelle ville che lo hanno tra i "Servizi compresi nel prezzo" della scheda, a parte (con il prezzo sommato) nelle altre. <b>Includi tutti</b>: incluso per tutte le ville. <b>A parte tutti</b>: si somma al prezzo di ogni villa. Nella mail il cliente vede i servizi sempre come <b>compresi</b> e un solo prezzo, già con i servizi a parte sommati; un servizio a parte senza prezzo non compare. Con il prezzo vuoto ogni villa usa il prezzo della sua scheda (Listino prezzi → Servizi non compresi), o quello di Impostazioni se la scheda non lo ha; un prezzo scritto qui vale per tutte le ville di questa offerta (0 = senza prezzo).</small></div>
        <div class="field"><span>Le tariffe includono</span><div class="off-incl" id="off-incl"></div>
          <textarea id="off-incx" rows="2" placeholder="Altre voci solo per questa offerta (una per riga)">${esc(o.incExtra || '')}</textarea>
          <small class="note">L'elenco e le voci spuntate di norma si cambiano in Impostazioni → Servizi e inclusioni.</small></div>
        <div class="field"><span>Riepilogo prezzi per villa</span><div class="tbl-wrap"><table class="prices off-riep"><thead><tr><th>Villa</th><th>Affitto</th><th title="Valore di vendita dei servizi compresi nel prezzo: solo per riferimento, non si somma al totale">Servizi inclusi</th><th>Servizi a parte</th><th>Totale</th></tr></thead><tbody id="off-riep"></tbody></table></div></div>
      </section>
      <section class="card"><h2>4 · Offerta</h2>
        <div class="row off-row">
          <label class="field"><span>Cliente</span><input id="off-cli" value="${esc(o.cliente)}" placeholder="es. Mr Smith"></label>
          <label class="field"><span>Email del cliente</span><input id="off-mail" type="text" inputmode="email" autocomplete="off" value="${esc(o.email)}" placeholder="facoltativa"></label>
          <label class="field"><span>Telefono (WhatsApp)</span><input id="off-tel" type="tel" inputmode="tel" autocomplete="off" value="${esc(o.tel || '')}" placeholder="es. +39 333 1234567"></label>
          <div class="field"><span>Lingua</span><div class="seg" id="off-lang"><button type="button" data-l="it" class="${o.lingua === 'it' ? 'on' : ''}">Italiano</button><button type="button" data-l="en" class="${o.lingua === 'en' ? 'on' : ''}">English</button></div></div>
          <label class="field"><span>Foto per villa (Word e PDF)</span><select id="off-nf">${[1, 3, 5, 8].map(n => `<option value="${n}" ${Number(o.nFoto) === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        </div>
        <label class="field off-ogg-f"><span>Oggetto della mail</span><input id="off-ogg-in"></label>
        <div class="off-prevbar"><span class="note" id="off-ogg" hidden></span><div class="off-prevact"><label class="off-st-pick"><span>Stile</span><select id="off-st-sel" aria-label="Stile della mail"></select></label><button type="button" class="btn off-ftog" id="off-pers-t" aria-expanded="${o.persOpen ? 'true' : 'false'}"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z M13 7l4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>Personalizza</button></div></div>
        <div class="off-pers" id="off-pers" ${o.persOpen ? '' : 'hidden'}>
        <div class="field off-stile"><span>Stile della mail</span>
          <div class="off-st-row">
            <select id="off-st-font" aria-label="Carattere">${FONT.map(([v, t]) => `<option value="${esc(v)}">${t}</option>`).join('')}</select>
            <select id="off-st-size" aria-label="Dimensione">${[13, 14, 15, 16, 17].map(n => `<option value="${n}">${n} px</option>`).join('')}</select>
            <label class="off-col" title="Colore del testo"><input type="color" id="off-st-testo"> Testo</label>
            <label class="off-col" title="Colore di titoli, nomi delle ville e link"><input type="color" id="off-st-acc"> Accento</label>
            <select id="off-st-tit" aria-label="Titoli"><option value="sottolineato">Titoli sottolineati</option><option value="maiuscoletto">Titoli in maiuscoletto</option></select>
            <label class="off-col"><input type="checkbox" id="off-st-sep"> Linee tra le ville</label></div>
          <div class="off-st-row"><input id="off-st-nome" placeholder="Nome per salvare questo stile"><button type="button" class="btn small" id="off-st-new">Salva come nuovo</button><button type="button" class="btn small" id="off-st-upd">Aggiorna lo stile scelto</button><button type="button" class="btn small" id="off-st-def">Usa di norma</button><button type="button" class="btn small danger" id="off-st-del">Elimina</button></div>
        </div>
        <label class="field"><span>Testo iniziale</span><textarea id="off-intro" rows="3"></textarea></label>
        <label class="field"><span>Testo finale</span><textarea id="off-chiusa" rows="2"></textarea></label>
        <label class="field"><span>Firma</span><textarea id="off-firma" rows="2">${esc(o.firma || '')}</textarea></label>
        </div>
        <div class="off-prev" id="off-anteprima"><p class="note">Scegli almeno una villa per vedere l'anteprima.</p></div>
        <div class="off-allega">
        ${store.listBrochure ? `<label class="flag off-bro"><input type="checkbox" id="off-bro" ${o.brochure ? 'checked' : ''}><span><b>Allega brochure</b><small id="off-bro-info">Scarica i PDF delle ville scelte, nella lingua dell'offerta, da trascinare nella mail.</small></span></label>` : ''}
          <label class="flag off-wb"><input type="checkbox" id="off-wb" ${o.linkWB ? 'checked' : ''}><span><b>Link Web Brochure</b><small>Sotto il prezzo di ogni villa che ce l'ha.</small></span></label>
          <label class="flag off-wb"><input type="checkbox" id="off-wba" ${o.linkWBA ? 'checked' : ''}><span><b>Link Web Brochure anonima</b><small>La versione senza logo, sotto il prezzo di ogni villa che ce l'ha.</small></span></label>
        </div>
        <div class="off-actions off-act-gr">
          <div class="off-act"><span>Email</span><div><button type="button" class="btn primary" id="off-copy">Copia per email</button><button type="button" class="btn" id="off-gmail">Apri Gmail</button></div></div>
          <div class="off-act"><span>WhatsApp</span><div><button type="button" class="btn off-wa" id="off-wa-txt">Messaggio</button><button type="button" class="btn off-wa" id="off-wa-pdf">PDF</button></div></div>
          <div class="off-act"><span>File</span><div><button type="button" class="btn" id="off-word">Scarica Word</button><button type="button" class="btn" id="off-pdf">Scarica PDF</button>${store.listBrochure ? '<button type="button" class="btn" id="off-bro-dl">Scarica brochure</button>' : ''}</div></div>
        </div>
        <p class="note">Qui sopra vedi la mail come arriverà al cliente. <b>Email</b>: premi <b>Copia per email</b>, poi <b>Apri Gmail</b> e incolla nel messaggio (Ctrl+V, o ⌘V sul Mac). <b>WhatsApp → Messaggio</b>: apre la chat del cliente con l'offerta già scritta in testo. <b>WhatsApp → PDF</b>: prepara l'offerta in PDF con le foto e la invia con due righe di accompagnamento (dal telefono si allegano da soli; dal computer si trascinano dalla cartella Download, come le brochure). Cliente, lingua, testi e voci incluse si cambiano con <b>Personalizza</b>.</p>
        <div id="off-msg"></div>
      </section>
      </div>
    </div></div>`;

    // periodi della tariffa (date del giorno di cambio predefinito)
    const iso = t => new Date(t).toISOString().slice(0, 10);
    const MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
    const drawPer = () => {
      const ps = baseP(); if (o.idx >= ps.length) o.idx = 0;
      const p = ps[o.idx];
      $('#off-persel').innerHTML = p ? `<b>${esc(o.tariff === 'settimanale' ? 'Settimana ' + (o.idx + 1) : p.label)}</b><span>${esc(S.dm(p.from) + ' → ' + S.dm(p.to))}</span>` : '<span class="note">Nessun periodo</span>';
      $('#off-prev').disabled = o.idx <= 0; $('#off-next').disabled = o.idx >= ps.length - 1;
      if (!ps.length) { $('#off-cal').innerHTML = ''; return; }
      const idxOf = d => { for (let i = 0; i < ps.length; i++) if (ps[i].from <= d && d < ps[i].to) return i; return -1; };
      const first = new Date(ps[0].from + 'T00:00:00Z'), last = new Date(ps[ps.length - 1].to + 'T00:00:00Z');
      let html = '';
      for (let y = first.getUTCFullYear(), m = first.getUTCMonth(); y < last.getUTCFullYear() || (y === last.getUTCFullYear() && m <= last.getUTCMonth()); m === 11 ? (y++, m = 0) : m++) {
        const start = Date.UTC(y, m, 1), n = new Date(Date.UTC(y, m + 1, 0)).getUTCDate(), lead = (new Date(start).getUTCDay() + 6) % 7;
        let cells = '<i></i>'.repeat(lead);
        for (let k = 0; k < n; k++) {
          const d = iso(start + k * 864e5), i = idxOf(d), sel = i === o.idx, out = p && d === p.to;
          const cls = ['d', i < 0 ? 'off' : 'p' + (i % 2), sel ? 'sel' : '', sel && d === p.from ? 'first' : '', out ? 'out' : ''].filter(Boolean).join(' ');
          cells += i < 0 && !out ? `<span class="${cls}">${k + 1}</span>` : `<button type="button" class="${cls}" data-i="${i < 0 ? o.idx : i}" title="${esc(i < 0 ? '' : ps[i].label)}">${k + 1}</button>`;
        }
        html += `<div class="off-month"><div class="off-mname">${MESI[m]} ${y}</div><div class="off-wd">${['L', 'M', 'M', 'G', 'V', 'S', 'D'].map(x => `<i>${x}</i>`).join('')}</div><div class="off-days">${cells}</div></div>`;
      }
      $('#off-cal').innerHTML = html;
    };
    const setIdx = i => { const ps = baseP(); if (i < 0 || i >= ps.length || i === o.idx) return; o.idx = i; o.prezzi = {}; o.srvVilla = {}; drawPer(); drawList(); drawTexts(); save(); };
    let visibili = [];
    const drawList = () => {
      const q = (o.q || '').trim().toLowerCase();
      const f = o.f, nr = x => { const m = /\d+/.exec(String(x || '')); return m ? Number(m[0]) : 0; };
      const fav = f.fav ? (favLists().find(l => l.id === f.fav) || {}).ville || [] : null;
      const da = f.da ? S.parseMoney(f.da) : null, a = f.a ? S.parseMoney(f.a) : null;
      const nF = ['loc', 'mare', 'fav', 'osp', 'cam', 'da', 'a', 'pisc'].filter(k => f[k]).length; $('#off-fn').textContent = nF ? ' · ' + nF : ''; $('#off-ftog').classList.toggle('on', !!nF);
      const list = ville().filter(v => !q || `${v.name} ${v.location || ''}`.toLowerCase().includes(q))
        .filter(v => (!f.loc || normLoc(v.location) === f.loc) && (!f.mare || (S.mareLivello(v.seafront) || 0) >= Number(f.mare)) && (!fav || fav.includes(v.id)) && (!f.osp || nr(v.guests) >= Number(f.osp)) && (!f.cam || nr(v.guestBedrooms || v.totalBedrooms) >= Number(f.cam))
          && (!f.pisc || String(v.pool || '').trim() && !/^(no|n\/?a|-)$/i.test(String(v.pool).trim())))
        .filter(v => { if (typeof da !== 'number' && typeof a !== 'number') return true; const pr = listinoOf(v); return typeof pr === 'number' && (typeof da !== 'number' || pr >= da) && (typeof a !== 'number' || pr <= a); }).map(v => ({ v, s: stato(v), p: perOf(v), pr: listinoOf(v) }))
        .filter(x => !o.soloLibere || x.s === 'libera' || o.ville.includes(x.v.id));
      visibili = list.map(x => x.v.id);
      const nSel = visibili.filter(id => o.ville.includes(id)).length, all = $('#off-all');
      all.checked = !!visibili.length && nSel === visibili.length; all.indeterminate = nSel > 0 && nSel < visibili.length; all.disabled = !visibili.length;
      $('#off-list').innerHTML = list.length ? list.map(({ v, s, p, pr }) => {
        const on = o.ville.includes(v.id);
        return `<div class="off-item${on ? ' on' : ''}${s !== 'libera' ? ' busy' : ''}" data-v="${esc(v.id)}">
          <label class="off-pick"><input type="checkbox" data-pick="${esc(v.id)}" ${on ? 'checked' : ''} ${s === 'nd' ? 'disabled' : ''}>
            <span><b>${esc(v.name)}</b><small>${esc(v.location || '')}${p ? ' · ' + S.dm(p.from) + ' → ' + S.dm(p.to) : ''}</small></span></label>
          <span class="off-st st-${s}">${s === 'libera' ? 'Libera' : s === 'occupata' ? 'Occupata' : 'ND'}</span>
          <span class="off-list-pr">${typeof pr === 'number' ? S.money(pr) : pr === 'ND' ? 'ND' : 'Senza listino'}</span>
          ${on ? `<label class="off-price"><span>Prezzo in offerta €</span><input data-price="${esc(v.id)}" inputmode="numeric" value="${esc(o.prezzi[v.id] !== undefined ? o.prezzi[v.id] : typeof pr === 'number' ? String(pr) : '')}" placeholder="su richiesta"></label>
            <label class="off-price off-nota"><span>Nota</span><input data-nota="${esc(v.id)}" value="${esc(o.note[v.id] || '')}" placeholder="es. In trattativa di vendita"></label>` : ''}
        </div>`; }).join('') : '<p class="note">Nessuna villa per questi filtri.</p>';
      $('#off-count').textContent = o.ville.length ? `· ${o.ville.length} ${o.ville.length === 1 ? 'scelta' : 'scelte'}` : '';
      updBro();
    };
    // voci "Le tariffe includono": di norma quelle spuntate in Impostazioni; in questa offerta si spuntano e tolgono a mano
    const incSel = () => Array.isArray(o.incSel) ? o.incSel : S.inclusioniDi(st).filter(x => x.on !== false).map(x => x.id);
    // voci collegate a un servizio: attive solo se quel servizio è spuntato come incluso
    const incAttiva = x => { if (!x.servizio) return true; const vv = scelte(); return vv.length ? vv.some(v => haServ(v, x.servizio)) : srvDi(x.servizio).on; };
    const incTesti = () => { const sel = incSel(); return S.inclusioniDi(st).filter(x => sel.includes(x.id) && (x.servizio ? inclTutte().includes(x.servizio) : true)).map(x => (o.lingua === 'en' ? x.en : x.it) || x.it || x.en).concat(srvInclusi())
      .concat(String(o.incExtra || '').split('\n').map(t => t.trim()).filter(Boolean)); };
    const chiInclude = k => { const vv = scelte(); if (!vv.length) return 'Secondo la scheda di ogni villa'; const si = vv.filter(v => inclVilla(v, k)).length;
      return si === vv.length ? 'Compreso in tutte le ville scelte' : si ? `Compreso in ${si} ${si === 1 ? 'villa' : 'ville'} su ${vv.length}, a parte ${vv.length - si === 1 ? "nell'altra" : 'nelle altre'}` : 'A parte in tutte le ville scelte'; };
    const drawSrv = () => {
      // in alto i servizi predefiniti (compresi nel prezzo: Esmeralda o proprietario), sotto gli extra (a parte); l'ordine non cambia con la spunta
      const lst = srvList(), pre = lst.filter(x => srvDefOn(x.key)), ext = lst.filter(x => !srvDefOn(x.key));
      const tit = t => `<tr class="off-srv-grp"><td colspan="3">${t}</td></tr>`;
      $('#off-srv').innerHTML = (pre.length ? tit('Servizi predefiniti') : '') + pre.concat(ext).map((x, i) => { const d = srvDi(x.key); return (i === pre.length && ext.length ? tit('Servizi extra') : '') + `<tr data-ok="${esc(x.key)}" class="${d.on ? 'on' : ''}">
        <td><label class="off-inc"><input type="checkbox" data-son ${d.on ? 'checked' : ''}><span>${esc(x.label)}${x.voce ? ' <small class="note" title="Voce delle note spese: entra nel prezzo, ma non è scritta nella mail">· voce</small>' : ''}</span></label></td>
        <td><div class="seg small" data-smode>${[['pred', 'Predefinito'], ['inc', 'Includi tutti'], ['parte', 'A parte tutti']].map(([m, t]) => `<button type="button" data-m="${m}" class="${d.modo === m ? 'on' : ''}" ${d.on ? '' : 'disabled'}>${t}</button>`).join('')}</div>${d.on && d.modo === 'pred' ? `<small class="note off-srv-who">${esc(chiInclude(x.key))}</small>` : ''}</td>
        <td><input data-sprz inputmode="numeric" value="${esc(d.prezzo)}" placeholder="da scheda villa" title="Vuoto: per ogni villa il prezzo della sua scheda (o quello di Impostazioni). Scritto: uguale per tutte le ville; 0 = senza prezzo" ${d.on && d.modo !== 'inc' ? '' : 'disabled'} aria-label="Prezzo di ${esc(x.label)}"></td></tr>`; }).join('');
    };
    const drawRiep = () => {
      const vv = scelte();
      $('#off-riep').innerHTML = vv.length ? vv.map(v => { const pr = prezzoDi(v), et = extraTot(v), inc = srvInclVilla(v), ag = srvAparte(v), li = listinoOf(v);
        const affIn = `<input class="off-rp" data-rp="${esc(v.id)}" inputmode="numeric" value="${esc(o.prezzi[v.id] !== undefined ? o.prezzi[v.id] : typeof li === 'number' ? String(li) : '')}" placeholder="su richiesta">${typeof li === 'number' && pr !== null && pr !== li ? `<small class="note off-mod">listino ${esc(S.money(li))}</small>` : ''}`;
        const srvIn = ag.length ? ag.map(x => { const b0 = prezzoSrvBase(v, x.key), cur = (o.srvVilla[v.id] || {})[x.key]; const val0 = cur !== undefined ? cur : typeof x.eur === 'number' ? String(x.eur) : '';
          return `<label class="off-rs-l"><span>${esc(x.label)}</span><input class="off-rs" data-rs="${esc(v.id)}|${esc(x.key)}" inputmode="numeric" value="${esc(val0)}" placeholder="—">${typeof b0 === 'number' && typeof x.eur === 'number' && x.eur !== b0 ? `<small class="note off-mod">scheda ${esc(S.money(b0))}</small>` : ''}</label>`; }).join('') : '<span class="note">—</span>';
        // valore di vendita dei servizi inclusi (scheda villa o Impostazioni, o il prezzo scritto nell'offerta): solo da vedere, non entra nel totale
        const incV = inc.map(x => ({ x, eur: prezzoSrv(v, x.key), prop: S.caricoDef(st, v, x.key) === 'proprietario', om: S.caricoDef(st, v, x.key) === 'esmeralda' })), incT = incV.reduce((t, y) => t + (typeof y.eur === 'number' ? y.eur : 0), 0);
        const incIn = incV.length ? incV.map(y => `<div class="off-ri-l"><span>${esc(y.x.label)}${y.prop ? ' <small class="note">· proprietario</small>' : y.om ? ' <small class="note">· omaggio</small>' : ''}</span><b>${typeof y.eur === 'number' ? esc(S.money(y.eur)) : '—'}</b></div>`).join('') + (incT ? `<small class="note">valore ${esc(S.money(incT))} · non sommato</small>` : '') : '<span class="note">—</span>';
        return `<tr data-rv="${esc(v.id)}"><td><b>${esc(v.name)}</b>${incRighe(v, inc)}</td><td>${affIn}</td><td class="off-ri-c">${incIn}</td><td class="off-rs-c">${srvIn}<small class="note" data-rt>${et ? 'totale servizi ' + esc(S.money(et)) : ''}</small></td><td><b data-rtot>${pr === null ? '—' : S.money(pr + et)}</b></td></tr>`; }).join('')
        : '<tr><td colspan="5" class="note">Scegli le ville al punto 2.</td></tr>';
    };
    const drawTexts = () => {
      if (!o.introMod) o.intro = L().intro(o.cliente.trim(), periodoTxt());
      if (!o.chiusaMod) o.chiusa = L().chiusaMail;
      if (!o.oggettoMod) o.oggetto = L().oggetto(periodoTxt());
      $('#off-ogg-in').value = o.oggetto;
      $('#off-intro').value = o.intro; $('#off-chiusa').value = o.chiusa;
      const sel = incSel();
      const nomeSrv = k => (srvList().find(z => z.key === k) || {}).label || k;
      $('#off-incl').innerHTML = S.inclusioniDi(st).map(x => { const att = incAttiva(x); return `<label class="off-inc${att ? '' : ' off-dis'}"${x.servizio && !att ? ` title="Si attiva spuntando il servizio ${esc(nomeSrv(x.servizio))}"` : ''}><input type="checkbox" data-inc="${esc(x.id)}" ${sel.includes(x.id) && att ? 'checked' : ''} ${att ? '' : 'disabled'}><span>${esc((o.lingua === 'en' ? x.en : x.it) || x.it || x.en)}${x.servizio ? ` <em class="off-link">· ${esc(nomeSrv(x.servizio))}</em>` : ''}</span></label>`; }).join('');
      updBro();
    };
    // brochure PDF delle ville scelte: quella nella lingua dell'offerta, altrimenti un'altra
    const broCache = {};
    const broDi = id => (broCache[id] = broCache[id] || store.listBrochure(id).catch(() => []));
    const broScelta = l => l.find(b => b.lingua === o.lingua) || l.find(b => !b.lingua) || l[0] || null;
    let broTok = 0;
    function updBro() { setTimeout(() => { drawRiep(); if (document.getElementById('off-srv')) drawSrv(); updBro0(); }, 0); }
    function updBro0() {
      const info = document.getElementById('off-bro-info'); if (!info || !store.listBrochure) return;
      if (!o.brochure) { info.textContent = "Scarica i PDF delle ville scelte, nella lingua dell'offerta, da trascinare nella mail."; return; }
      if (!o.ville.length) { info.textContent = 'Scegli le ville.'; return; }
      const tok = ++broTok; const vv = scelte();
      Promise.all(vv.map(v => broDi(v.id))).then(ls => {
        if (tok !== broTok) return;
        const manca = vv.filter((v, i) => !broScelta(ls[i])).map(v => v.name);
        const altra = vv.filter((v, i) => { const b = broScelta(ls[i]); return b && b.lingua && b.lingua !== o.lingua; }).map(v => v.name);
        info.innerHTML = `Brochure trovate: <strong>${vv.length - manca.length} di ${vv.length}</strong>${manca.length ? ` · mancano: ${esc(manca.join(', '))}` : ''}${altra.length ? ` · in un'altra lingua: ${esc(altra.join(', '))}` : ''}`;
      });
    }
    async function scaricaBro() {
      const vv = scelte(); let n = 0;
      for (const v of vv) {
        const b = broScelta(await broDi(v.id)); if (!b) continue;
        msg(`<p class="note">Scarico la brochure di ${esc(v.name)}…</p>`);
        try { window.SDBExport.scarica(b.nome, await store.getBrochure(b)); n++; await new Promise(r => setTimeout(r, 600)); } catch (_) {}
      }
      return n;
    }
    drawPer(); drawList(); drawTexts();

    $('#off-tar').addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (!b) return; o.tariff = b.dataset.t; o.idx = 0; o.prezzi = {}; o.srvVilla = {}; $$('#off-tar button').forEach(x => x.classList.toggle('on', x === b)); drawPer(); drawList(); drawTexts(); save(); });
    $('#off-cal').addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) setIdx(Number(b.dataset.i)); });
    $('#off-prev').addEventListener('click', () => setIdx(o.idx - 1));
    $('#off-next').addEventListener('click', () => setIdx(o.idx + 1));
    // seleziona / deseleziona tutte le ville dell'elenco (con i filtri di ricerca e "solo libere")
    $('#off-all').addEventListener('change', e => {
      if (e.target.checked) visibili.forEach(id => { if (!o.ville.includes(id)) o.ville.push(id); });
      else o.ville = o.ville.filter(id => !visibili.includes(id));
      drawList(); drawTexts(); save();
    });
    const drawStile = () => {
      const l = stili(); const cur = l.find(x => x.id === o.stile.id);
      $('#off-st-sel').innerHTML = (cur ? '' : `<option value="">${esc(o.stile.nome || 'Personalizzato')} (non salvato)</option>`) + l.map(x => `<option value="${esc(x.id)}" ${cur && x.id === cur.id ? 'selected' : ''}>${esc(x.nome)}${x.id === settings().stileMailDi ? ' · di norma' : ''}</option>`).join('');
      $('#off-st-font').value = o.stile.font; if ($('#off-st-font').value !== o.stile.font) $('#off-st-font').selectedIndex = 0;
      $('#off-st-size').value = String(o.stile.size || 14); $('#off-st-testo').value = o.stile.testo || '#000000'; $('#off-st-acc').value = o.stile.accento || '#000000';
      $('#off-st-tit').value = o.stile.titoli || 'sottolineato'; $('#off-st-sep').checked = !!o.stile.separatori;
      $('#off-st-del').disabled = !stiliSalvati().some(x => x.id === o.stile.id) ; $('#off-st-upd').disabled = !cur;
    };
    drawStile();
    $('#off-st-sel').addEventListener('change', e => { const x = stili().find(y => y.id === e.target.value); if (x) { o.stile = Object.assign({}, x); drawStile(); save(); } });
    [['off-st-font', 'font'], ['off-st-size', 'size'], ['off-st-testo', 'testo'], ['off-st-acc', 'accento'], ['off-st-tit', 'titoli']].forEach(([id, k]) => $('#' + id).addEventListener('input', e => { o.stile[k] = k === 'size' ? Number(e.target.value) : e.target.value; save(); }));
    $('#off-st-sep').addEventListener('change', e => { o.stile.separatori = e.target.checked; save(); });
    const errSt = err => toast(err && err.code === 'permission-denied' ? 'Solo chi ha accesso completo può salvare gli stili' : 'Errore: ' + (err && err.message || err));
    $('#off-st-new').addEventListener('click', () => { const nome = $('#off-st-nome').value.trim(); if (!nome) { $('#off-st-nome').focus(); toast('Scrivi un nome per lo stile'); return; }
      const x = Object.assign({}, o.stile, { id: S.uid('st'), nome }); salvaStili(stiliSalvati().concat([x])).then(() => { o.stile = x; $('#off-st-nome').value = ''; drawStile(); save(); toast('Stile salvato'); }, errSt); });
    $('#off-st-upd').addEventListener('click', () => { const x = Object.assign({}, o.stile); const l = stiliSalvati().filter(y => y.id !== x.id).concat([x]); salvaStili(l).then(() => { drawStile(); toast('Stile aggiornato'); }, errSt); });
    $('#off-st-def').addEventListener('click', () => { const go = () => { const cur = JSON.parse(JSON.stringify(settings())); cur.stileMailDi = o.stile.id; return Promise.resolve(store.setSettings(cur)); };
      (stili().some(x => x.id === o.stile.id) ? go() : Promise.reject(new Error('salva prima lo stile con un nome'))).then(() => { drawStile(); toast('Stile usato di norma'); }, errSt); });
    $('#off-st-del').addEventListener('click', async () => { if (!(await (window.SDBConferma ? window.SDBConferma : t => Promise.resolve(confirm(t)))(`Lo stile "${o.stile.nome}" verrà tolto per tutti gli account.`, { titolo: 'Eliminare lo stile?', ok: 'Elimina', danger: true }))) return; salvaStili(stiliSalvati().filter(y => y.id !== o.stile.id)).then(() => { o.stile = Object.assign({}, stili().find(x => x.id === o.stile.id) || STILI_BASE[0]); drawStile(); save(); toast('Stile eliminato'); }, errSt); });
    $('#off-pers-t').addEventListener('click', () => { o.persOpen = !o.persOpen; $('#off-pers').hidden = !o.persOpen; $('#off-pers-t').setAttribute('aria-expanded', o.persOpen ? 'true' : 'false'); saveUI(); });
    schedPrev();
    $('#off-ftog').addEventListener('click', () => { o.fOpen = !o.fOpen; $('#off-filters').hidden = !o.fOpen; $('#off-ftog').setAttribute('aria-expanded', o.fOpen ? 'true' : 'false'); save(); });
    [['off-f-loc', 'loc'], ['off-f-mare', 'mare'], ['off-f-fav', 'fav'], ['off-f-osp', 'osp'], ['off-f-cam', 'cam'], ['off-f-da', 'da'], ['off-f-a', 'a']].forEach(([id, k]) => $('#' + id).addEventListener('input', e => { o.f[k] = e.target.value.trim(); drawList(); save(); }));
    $('#off-f-pisc').addEventListener('change', e => { o.f.pisc = e.target.checked; drawList(); save(); });
    $('#off-f-reset').addEventListener('click', () => { o.f = {}; ['off-f-loc', 'off-f-mare', 'off-f-fav', 'off-f-osp', 'off-f-cam', 'off-f-da', 'off-f-a'].forEach(id => { $('#' + id).value = ''; }); $('#off-f-pisc').checked = false; drawList(); save(); });
    $('#off-q').addEventListener('input', e => { o.q = e.target.value; drawList(); save(); });
    $('#off-free').addEventListener('change', e => { o.soloLibere = e.target.checked; drawList(); save(); });
    $('#off-list').addEventListener('change', e => {
      const cb = e.target.closest('[data-pick]'); if (cb) { const id = cb.dataset.pick; o.ville = o.ville.filter(x => x !== id); if (cb.checked) o.ville.push(id); drawList(); drawTexts(); save(); }
    });
    $('#off-list').addEventListener('input', e => { const i = e.target.closest('[data-price]'); if (i) { o.prezzi[i.dataset.price] = i.value; drawRiep(); save(); } const n = e.target.closest('[data-nota]'); if (n) { o.note[n.dataset.nota] = n.value; save(); } });
    drawSrv();
    $('#off-srv').addEventListener('change', e => { const c = e.target.closest('[data-son]'); if (!c) return; const k = c.closest('[data-ok]').dataset.ok; o.srv[k] = Object.assign({}, o.srv[k], { on: c.checked });
      // spuntando il servizio si spuntano anche le sue descrizioni collegate (poi si possono togliere una per una)
      if (c.checked) { const sel = incSel().slice(); S.inclusioniDi(st).filter(i => i.servizio === k).forEach(i => { if (!sel.includes(i.id)) sel.push(i.id); }); o.incSel = sel; } drawSrv(); drawTexts(); save(); });
    $('#off-srv').addEventListener('click', e => { const bt = e.target.closest('[data-smode] button'); if (!bt || bt.disabled) return; const k = bt.closest('[data-ok]').dataset.ok; const cur = Object.assign({}, o.srv[k]); delete cur.incluso; o.srv[k] = Object.assign(cur, { modo: bt.dataset.m }); drawSrv(); drawTexts(); save(); });
    // riepilogo prezzi per villa: affitto e servizi modificabili qui (l'affitto è lo stesso campo del punto 2)
    const totRiga = vid => { const v = scelte().find(z => z.id === vid), tr = $(`#off-riep tr[data-rv="${CSS.escape(vid)}"]`); if (!v || !tr) return;
      const pr = prezzoDi(v), et = extraTot(v); tr.querySelector('[data-rtot]').textContent = pr === null ? '—' : S.money(pr + et); tr.querySelector('[data-rt]').textContent = et ? 'totale servizi ' + S.money(et) : ''; };
    $('#off-riep').addEventListener('input', e => { const a = e.target.closest('[data-rp]'), r = e.target.closest('[data-rs]'); if (!a && !r) return;
      if (a) { o.prezzi[a.dataset.rp] = a.value; const li = $(`#off-list [data-price="${CSS.escape(a.dataset.rp)}"]`); if (li) li.value = a.value; totRiga(a.dataset.rp); }
      else { const [vid, k] = r.dataset.rs.split('|'); o.srvVilla[vid] = Object.assign({}, o.srvVilla[vid]); if (r.value.trim() === '') delete o.srvVilla[vid][k]; else o.srvVilla[vid][k] = r.value; totRiga(vid); }
      save(); });
    $('#off-srv').addEventListener('input', e => { if (!e.target.matches('[data-sprz]')) return; const k = e.target.closest('[data-ok]').dataset.ok; o.srv[k] = Object.assign({}, o.srv[k], { prezzo: e.target.value }); drawRiep(); save(); });
    $('#off-incl').addEventListener('change', e => { const c = e.target.closest('[data-inc]'); if (!c) return; const sel = incSel().filter(x => x !== c.dataset.inc); if (c.checked) sel.push(c.dataset.inc); o.incSel = sel; save(); });
    $('#off-incx').addEventListener('input', e => { o.incExtra = e.target.value; save(); });
    $('#off-firma').addEventListener('input', e => { o.firma = e.target.value; save(); });
    $('#off-cli').addEventListener('input', e => { o.cliente = e.target.value; drawTexts(); save(); });
    $('#off-mail').addEventListener('input', e => { o.email = e.target.value.trim(); save(); });
    $('#off-tel').addEventListener('input', e => { o.tel = e.target.value.trim(); save(); });
    $('#off-lang').addEventListener('click', e => { const b = e.target.closest('[data-l]'); if (!b) return; o.lingua = b.dataset.l; o.introMod = false; o.chiusaMod = false; o.oggettoMod = false; $$('#off-lang button').forEach(x => x.classList.toggle('on', x === b)); drawTexts(); save(); });
    $('#off-nf').addEventListener('change', e => { o.nFoto = Number(e.target.value); save(); });
    $('#off-ogg-in').addEventListener('input', e => { o.oggetto = e.target.value; o.oggettoMod = !!e.target.value.trim(); save(); });
    $('#off-intro').addEventListener('input', e => { o.intro = e.target.value; o.introMod = true; save(); });
    $('#off-chiusa').addEventListener('input', e => { o.chiusa = e.target.value; o.chiusaMod = true; save(); });

    /* ---------- contenuto dell'offerta ---------- */
    function scelte() { return ville().filter(v => o.ville.includes(v.id)); }
    const vis = (v, k) => !hiddenField(k) && v[k] !== undefined && v[k] !== null && String(v[k]).trim() !== '';
    function infoVilla(v) {
      const l = L(); const r = [];
      if (vis(v, 'location')) r.push([l.localita, v.location]);
      if (vis(v, 'seafront')) r.push([l.mare, S.mareLabel(v.seafront)]);
      const osp = vis(v, 'guests') ? v.guests : vis(v, 'pax') ? v.pax : null; if (osp) r.push([l.ospiti, osp]);
      const cam = vis(v, 'guestBedrooms') ? v.guestBedrooms : vis(v, 'totalBedrooms') ? v.totalBedrooms : null; if (cam) r.push([l.camere, cam]);
      if (vis(v, 'bathrooms')) r.push([l.bagni, v.bathrooms]);
      if (vis(v, 'indoorSqm')) r.push([l.interni, v.indoorSqm + ' m²']);
      if (vis(v, 'outdoorSqm')) r.push([l.esterni, v.outdoorSqm + ' m²']);
      [['pool', l.piscina], ['spa', l.spa], ['gym', l.palestra]].forEach(([k, lab]) => { if (vis(v, k)) r.push([lab, v[k]]); });
      return r;
    }
    // foto ridimensionate (larghezza massima) per non appesantire Word e mail
    const resize = (src, max, q) => new Promise(res => { const im = new Image(); im.onload = () => { const k = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight)); const c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); res({ url: c.toDataURL('image/jpeg', q), w: c.width, h: c.height }); }; im.onerror = () => res(null); im.src = src; });
    async function fotoDi(v, max, q) {
      let l = []; try { l = await store.listFoto(v.id); } catch (_) { l = []; }
      const cov = ctx.coverOf ? ctx.coverOf(v.id) : null;
      l.sort((a, b) => (a.id === cov ? -1 : b.id === cov ? 1 : 0));
      const out = []; for (const f of l.slice(0, Number(o.nFoto) || 3)) { const r = await resize(f.img, max, q); if (r) out.push(r); }
      return out;
    }
    const pronto = () => { if (!o.ville.length) { $('#off-msg').innerHTML = '<div class="warn err">Scegli almeno una villa.</div>'; return false; } return true; };
    const msg = h => { $('#off-msg').innerHTML = h; };
    const nomeFile = () => X.nomeFile(`${L().titolo} ${o.cliente || ''} ${periodoTxt()}`);

    $('#off-word').addEventListener('click', async () => {
      if (!pronto()) return; const btn = $('#off-word'); btn.disabled = true;
      try {
        const l = L(); const B = [];
        try { const r = await fetch('icons/logo-240.png'); const bytes = new Uint8Array(await r.arrayBuffer()); B.push({ logo: { bytes, ext: 'png', w: 240, h: 240, width: 1500 } }); } catch (_) {}
        B.push({ p: l.titolo.toUpperCase(), center: true, bold: true, color: 'B29362', after: 40 }, { p: periodoTxt(), center: true, big: true, color: '142861', after: 240 });
        o.intro.split('\n').forEach(t => B.push({ p: t }));
        const sel = scelte();
        for (let i = 0; i < sel.length; i++) {
          const v = sel[i]; msg(`<p class="note">Preparo ${esc(v.name)} (${i + 1} di ${sel.length})…</p>`);
          const fs = await fotoDi(v, 1400, 0.8);
          B.push({ pageBreak: true }, { h1: v.name });
          const p = perOf(v); if (p) B.push({ p: rangeTxt(p, o.lingua), small: true });
          // copertina grande, poi le altre foto tre per riga: così ogni villa sta in una pagina
          if (fs[0]) B.push({ img: { bytes: X.dataUrlBytes(fs[0].url).bytes, w: fs[0].w, h: fs[0].h, width: 7800 } });
          const rest = fs.slice(1); for (let k = 0; k < rest.length; k += 3) { const row = rest.slice(k, k + 3).map(f => ({ bytes: X.dataUrlBytes(f.url).bytes, w: f.w, h: f.h })); while (row.length < 3) row.push(null); B.push({ imgs: row }); }
          const info = infoVilla(v); if (info.length) B.push({ kv: info });
          if (vis(v, 'descrizione')) B.push({ p: String(v.descrizione) });
          if (vis(v, 'servizi')) B.push({ h2: l.servizi }, { p: String(v.servizi) });
          if (vis(v, 'linkSito')) B.push({ p: `${l.sito}: ${v.linkSito}`, small: true });
          const pr = prezzoTot(v); B.push({ price: [l.prezzo, pr === null ? l.richiesta : euro(pr)] });
          linkWb(v).forEach(u => B.push({ p: `${l.webBro}: ${u}`, small: true }));
          const iv = inclSoloVilla(v); if (iv.length) B.push({ p: `${l.inclVilla}: ${iv.map(x => testiSrv(x.key).join(', ')).join('; ')}`, small: true });
          if ((o.note[v.id] || '').trim()) B.push({ p: o.note[v.id].trim(), small: true });
        }
        B.push({ pageBreak: true }); o.chiusa.split('\n').forEach(t => B.push({ p: t }));
        B.push({ p: l.soggetta, bold: true }, { p: l.saluti, after: 0 }); (o.firma || FIRMA).split('\n').forEach((t, k) => B.push({ p: t, bold: k === 0, after: 0 }));
        X.scarica(nomeFile() + '.docx', new Blob([X.docx(B)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
        msg(`<div class="warn ok">Documento Word scaricato: ${sel.length} ${sel.length === 1 ? 'villa' : 'ville'}.</div>`);
        salvaStorico('word');
      } catch (x) { msg(`<div class="warn err">Non riuscito: ${esc(x.message || x)}</div>`); }
      btn.disabled = false;
    });

    // dati di ogni villa per mail, WhatsApp e PDF: dalla villa più cara, quelle su richiesta in fondo (come nell'esempio delle offerte)
    const eurT = n => new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0, useGrouping: 'always' }).format(n) + ' €';
    function righeVille() {
      const l = L();
      const tar = (S.TARIFFE.find(t => t.key === o.tariff) || {}).label || '';
      const tarEn = { settimanale: 'Weekly', bisettimanale: 'BiWeekly', mensile: 'Monthly', bimensile: 'Two-month' }[o.tariff] || tar;
      const base = baseP()[o.idx];
      const mese = base ? new Date(S.parse(base.from)).toLocaleDateString(o.lingua === 'en' ? 'en-GB' : 'it-IT', { month: 'long', timeZone: 'UTC' }) : '';
      return scelte().map(v => ({ v, pr: prezzoTot(v) })).sort((a, b) => (b.pr === null ? -1 : b.pr) - (a.pr === null ? -1 : a.pr)).map(({ v, pr }) => {
        const p = perOf(v); const diverso = p && base && (p.from !== base.from || p.to !== base.to);
        const lab = (o.lingua === 'en' ? `${mese ? mese[0].toUpperCase() + mese.slice(1) + ' ' : ''}${tarEn} ${l.tariffa}` : `${l.tariffa} ${tar.toLowerCase()}${mese ? ' ' + mese : ''}`) + (diverso ? ' ' + rangeTxt(p, o.lingua) : '');
        const iv = inclSoloVilla(v);
        return { v, p, pr, lab, prTxt: pr === null ? l.richiesta : eurT(pr), nota: (o.note[v.id] || '').trim(),
          titolo: 'Villa ' + v.name.replace(/^villa\s+/i, '').replace(/\b\w+/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase()),
          codice: vis(v, 'codice') ? String(v.codice).trim() : '', sito: vis(v, 'linkSito') ? String(v.linkSito).trim() : '',
          video: vis(v, 'vimeo') ? String(v.vimeo).trim() : vis(v, 'youtube') ? String(v.youtube).trim() : '', psw: vis(v, 'psw') ? String(v.psw).trim() : '',
          wb: linkWb(v), incl: iv.length ? iv.map(x => testiSrv(x.key).join(', ')).join('; ') : '' };
      });
    }
    // mail: HTML con stili in linea e foto incorporate, copiato negli appunti per incollarlo in Gmail
    async function htmlMail() {
      const l = L();
      const P = (x, st) => `<p style="margin:0${st ? ';' + st : ''}">${x}</p>`, BR = '<p style="margin:0"><br></p>';
      const z = Object.assign({}, STILI_BASE[0], o.stile || {}); const acc = z.accento || '#000000', sep = !!z.separatori;
      const link = (u, t) => `<a href="${esc(u)}" target="_blank" style="color:${acc === '#000000' ? '#1155cc' : acc}${acc === '#000000' ? '' : ';text-decoration:none;border-bottom:1px solid ' + acc + '66'}">${t}</a>`;
      const TIT = t => z.titoli === 'maiuscoletto' ? P(`<span style="font-size:${Math.max(11, z.size - 3)}px;letter-spacing:2px;text-transform:uppercase;font-weight:bold;color:${acc}">${esc(t)}</span>`) : P(`<b><u>${esc(t)}</u></b>`);
      const HR = `<div style="border-top:1px solid ${acc === '#000000' ? '#cccccc' : acc + '55'};margin:14px 0;height:0;line-height:0;font-size:0">&nbsp;</div>`;
      let h = `<div style="font-family:${z.font};color:${z.testo};font-size:${z.size}px;line-height:1.55">`;
      h += o.intro.split('\n').map(t => P(esc(t) || '<br>')).join('') + BR;
      h += TIT(l.proposte) + (sep ? HR : BR);
      for (const r of righeVille()) {
        const titolo = esc(r.titolo);
        h += P(`<b${acc !== '#000000' ? ` style="color:${acc};font-size:${z.size + 2}px"` : ''}>${r.sito ? link(r.sito, titolo) : titolo}</b>${r.codice ? ` <b style="${acc !== '#000000' ? 'font-weight:normal;font-size:' + (z.size - 2) + 'px;letter-spacing:1px;color:' + z.testo : ''}">${esc(r.codice)}</b>` : ''}`);
        if (r.video) h += P(`${esc(l.video)} ${link(r.video, esc(l.qui))}${r.psw ? ' (psw: ' + esc(r.psw) + ')' : ''}`);
        h += P(`<b>${esc(r.lab)}:</b> ${r.pr === null ? esc(l.richiesta) : eurT(r.pr)}${r.nota ? ' - ' + esc(r.nota) + ' -' : ''}`);
        r.wb.forEach(u => { h += P(`${esc(l.webBro)}: ${link(u, esc(l.qui))}`); });
        if (r.incl) h += P(`${esc(l.inclVilla)}: ${esc(r.incl)}`);
        h += sep ? HR : BR;
      }
      const inc = incTesti();
      if (inc.length) h += TIT(l.inclusiTit) + `<ul style="margin:6px 0 12px;padding-left:22px">${inc.map(t => `<li>${esc(t)}</li>`).join('')}</ul>`;
      h += o.chiusa.split('\n').filter(t => t.trim()).map(t => P(esc(t))).join('');
      h += P(`<b><i>${esc(l.soggetta)}</i></b>`, acc !== '#000000' ? 'color:' + acc : '');
      h += P(esc(l.saluti) + ',', 'margin-top:8px') + (o.firma || FIRMA).split('\n').map((t, k) => P(k === 0 ? `<b>${esc(t)}</b>` : esc(t))).join('');
      return h + '</div>';
    }
    /* ---------- WhatsApp ---------- */
    // numero per wa.me: solo cifre con il prefisso internazionale (+39 / 0039 / cellulare italiano senza prefisso → 39…)
    const telWA = telN;
    const apriWA = testo => { const n = telWA(o.tel); window.open(`https://wa.me/${n}?text=${encodeURIComponent(testo)}`, '_blank', 'noopener'); };
    // l'offerta in testo semplice, con *grassetto* e _corsivo_ di WhatsApp; i link si vedono per intero
    function testoWA() {
      const l = L(); const B = t => `*${String(t).replace(/\*/g, '')}*`; const r0 = [];
      r0.push(o.intro.trim(), '', B(l.proposte), '');
      righeVille().forEach(r => {
        r0.push(B(r.titolo) + (r.codice ? ' (' + r.codice + ')' : ''));
        if (r.sito) r0.push(r.sito);
        if (r.video) r0.push(`${l.video}: ${r.video}${r.psw ? ' (psw: ' + r.psw + ')' : ''}`);
        r0.push(`${r.lab}: ${B(r.prTxt)}${r.nota ? ' – ' + r.nota : ''}`);
        r.wb.forEach(u => r0.push(`${l.webBro}: ${u}`));
        if (r.incl) r0.push(`${l.inclVilla}: ${r.incl}`);
        r0.push('');
      });
      const inc = incTesti(); if (inc.length) r0.push(B(l.inclusiTit), ...inc.map(t => '• ' + t), '');
      o.chiusa.split('\n').filter(t => t.trim()).forEach(t => r0.push(t.trim()));
      r0.push(`_${l.soggetta}_`, '', l.saluti + ',');
      (o.firma || FIRMA).split('\n').forEach((t, k) => { if (t.trim()) r0.push(k === 0 ? B(t.trim()) : t.trim()); });
      return r0.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    }
    const testoBreve = () => L().waBreve(o.cliente.trim(), periodoTxt()) + '\n\n' + L().saluti + ',\n' + String(o.firma || FIRMA).split('\n')[0].trim();

    /* ---------- PDF ---------- */
    // pagine A4 disegnate su un canvas (1240×1754 px, 150 dpi), poi un PDF con un'immagine per pagina e i link cliccabili
    const caricaImg = src => new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
    async function pdfOfferta(passo) {
      const l = L(); const W = 1240, H = 1754, M = 96, CW = W - 2 * M, FONDO = H - M - 36;
      const z = Object.assign({}, STILI_BASE[0], o.stile || {}); const FF = z.font || 'Georgia,serif';
      const GOLD = '#B29362', NAVY = '#142861', TXT = '#2b2b2b', GREY = '#777777';
      const pagine = []; let c = null, g = null, y = 0, links = [];
      const font = (px, b, it) => `${it ? 'italic ' : ''}${b ? 'bold ' : ''}${px}px ${FF}`;
      const chiudi = async () => {
        if (!c) return; const n = pagine.length + 1;
        g.strokeStyle = GOLD; g.lineWidth = 1.5; g.beginPath(); g.moveTo(M, H - M + 6); g.lineTo(W - M, H - M + 6); g.stroke();
        g.font = font(18); g.fillStyle = GREY; g.textAlign = 'left'; g.fillText(String(o.firma || FIRMA).split('\n')[0].trim(), M, H - M + 36);
        g.textAlign = 'right'; g.fillText(String(n), W - M, H - M + 36); g.textAlign = 'left';
        const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.86));
        pagine.push({ jpeg: new Uint8Array(await blob.arrayBuffer()), w: W, h: H, links }); c = null;
      };
      const nuova = async () => { await chiudi(); c = document.createElement('canvas'); c.width = W; c.height = H; g = c.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H); y = M; links = []; };
      const spezza = (t, maxW) => { const out = [];
        String(t == null ? '' : t).split('\n').forEach(par => { const ws = par.split(/\s+/).filter(Boolean); if (!ws.length) { out.push(''); return; } let cur = '';
          ws.forEach(w => { const prova = cur ? cur + ' ' + w : w; if (g.measureText(prova).width <= maxW) { cur = prova; return; } if (cur) out.push(cur);
            cur = w; while (g.measureText(cur).width > maxW && cur.length > 1) { let k = cur.length - 1; while (k > 1 && g.measureText(cur.slice(0, k)).width > maxW) k--; out.push(cur.slice(0, k)); cur = cur.slice(k); } });
          out.push(cur); });
        return out; };
      // testo a capo automatico; maxRighe/fino: si ferma e mette "…" invece di andare alla pagina dopo
      const testo = async (t, op = {}) => {
        const px = op.px || 25, LH = Math.round(px * (op.lh || 1.45)), x = op.x || M, w = op.w || CW;
        g.font = font(px, op.b, op.it); let righe = spezza(t, w);
        if (op.tronca) { const n = Math.max(1, Math.floor((FONDO - y) / LH)); if (righe.length > n) { righe = righe.slice(0, n); righe[n - 1] = righe[n - 1].replace(/\s*\S*$/, '') + ' …'; } }
        for (const r of righe) {
          if (y + LH > FONDO) { await nuova(); g.font = font(px, op.b, op.it); }
          const rw = g.measureText(r).width; const rx = op.center ? (W - rw) / 2 : x;
          if (op.spazio) { g.save(); g.letterSpacing = op.spazio + 'px'; }
          g.fillStyle = op.col || TXT; g.fillText(r, rx, y + px);
          if (op.spazio) g.restore();
          if (op.link && r) { links.push({ x: rx - 4, y: y - 4, w: rw + 8, h: LH + 4, url: op.link }); g.fillRect(rx, y + px + 5, rw, 1.5); }
          y += LH;
        }
        y += op.dopo != null ? op.dopo : 8;
      };
      const linea = (yy, col) => { g.strokeStyle = col || GOLD; g.lineWidth = 2; g.beginPath(); g.moveTo(M, yy); g.lineTo(W - M, yy); g.stroke(); };
      const copri = (im, x, yy, w, h) => { const k = Math.max(w / im.naturalWidth, h / im.naturalHeight); const sw = w / k, sh = h / k; g.drawImage(im, (im.naturalWidth - sw) / 2, (im.naturalHeight - sh) / 2, sw, sh, x, yy, w, h); };
      // etichetta: valore (valore con link)
      const riga = async (lab, val, link) => {
        const px = 23; g.font = font(px, true); const lw = g.measureText(lab + ': ').width;
        if (y + px * 1.5 > FONDO) await nuova();
        g.font = font(px, true); g.fillStyle = TXT; g.fillText(lab + ':', M, y + px);
        const yy = y; await testo(val, { px, x: M + lw, w: CW - lw, link, col: link ? NAVY : TXT, dopo: 4 }); if (y === yy) y += px * 1.45;
      };
      const R = righeVille();

      // copertina: logo, titolo, periodo, testo iniziale e riepilogo delle ville con i prezzi
      await nuova();
      try { const lg = await caricaImg('icons/logo-240.png'); if (lg) { g.drawImage(lg, (W - 200) / 2, y, 200, 200); y += 230; } } catch (_) {}
      await testo(l.titolo.toUpperCase(), { px: 30, b: true, col: GOLD, center: true, spazio: 6, dopo: 6 });
      await testo(periodoTxt(), { px: 40, col: NAVY, center: true, dopo: 40 });
      linea(y); y += 40;
      await testo(o.intro.trim(), { px: 26, dopo: 36 });
      await testo(l.villeTit.toUpperCase(), { px: 22, b: true, col: GOLD, spazio: 3, dopo: 10 });
      for (const r of R) {
        if (y + 56 > FONDO) await nuova();
        g.font = font(27, true); g.fillStyle = NAVY; g.fillText(r.titolo, M, y + 34);
        g.font = font(27, true); g.textAlign = 'right'; g.fillText(r.prTxt, W - M, y + 34); g.textAlign = 'left';
        g.strokeStyle = '#e4dccd'; g.lineWidth = 1; g.beginPath(); g.moveTo(M, y + 52); g.lineTo(W - M, y + 52); g.stroke(); y += 60;
      }

      // una pagina per villa
      for (let i = 0; i < R.length; i++) {
        const r = R[i], v = r.v; passo && passo(`Preparo ${v.name} (${i + 1} di ${R.length})…`);
        await nuova();
        await testo(r.titolo, { px: 46, b: true, col: NAVY, link: r.sito || null, dopo: 0 });
        const sub = [r.codice, r.p ? rangeTxt(r.p, o.lingua) : ''].filter(Boolean).join('  ·  ');
        if (sub) await testo(sub, { px: 22, col: GREY, dopo: 16 }); else y += 16;
        const fs = await fotoDi(v, 1400, 0.82); const ims = (await Promise.all(fs.slice(0, 4).map(f => caricaImg(f.url)))).filter(Boolean);
        if (ims[0]) { const h0 = ims.length > 1 ? 560 : 700; copri(ims[0], M, y, CW, h0); y += h0 + 12; }
        const resto = ims.slice(1, 4);
        if (resto.length) { const gap = 12, tw = (CW - gap * (resto.length - 1)) / resto.length, th = 230; resto.forEach((im, k) => copri(im, M + k * (tw + gap), y, tw, th)); y += th + 24; }
        // caratteristiche su due colonne
        const info = infoVilla(v);
        if (info.length) { const colW = CW / 2, rh = 40;
          for (let k = 0; k < info.length; k += 2) { if (y + rh > FONDO) await nuova();
            [info[k], info[k + 1]].forEach((kv, j) => { if (!kv) return; const x = M + j * colW; g.font = font(21); g.fillStyle = GREY; g.fillText(String(kv[0]), x, y + 26); g.font = font(23, true); g.fillStyle = TXT; g.fillText(String(kv[1]).slice(0, 40), x + 190, y + 26); });
            g.strokeStyle = '#eee6d8'; g.lineWidth = 1; g.beginPath(); g.moveTo(M, y + rh - 2); g.lineTo(W - M, y + rh - 2); g.stroke(); y += rh; }
          y += 20; }
        // riquadro del prezzo
        if (y + 110 > FONDO) await nuova();
        linea(y); g.font = font(23, true); g.fillStyle = GOLD; g.fillText(r.lab.toUpperCase().slice(0, 60), M, y + 62);
        g.font = font(40, true); g.fillStyle = NAVY; g.textAlign = 'right'; g.fillText(r.prTxt, W - M, y + 66); g.textAlign = 'left';
        linea(y + 96); y += 116;
        if (r.nota) await testo(r.nota, { px: 23, it: true, dopo: 8 });
        if (r.incl) await riga(l.inclVilla, r.incl);
        if (r.video) await riga(l.video, l.qui, r.video);
        if (r.video && r.psw) await riga('Password', r.psw);
        for (const u of r.wb) await riga(l.webBro, l.qui, u);
        if (r.sito) await riga(l.sitoWeb, l.sito, r.sito);
        y += 8;
        if (vis(v, 'descrizione')) await testo(String(v.descrizione), { px: 22, lh: 1.5, col: TXT, tronca: true });
      }

      // ultima pagina: cosa comprendono le tariffe, testo finale e firma
      await nuova();
      const inc = incTesti();
      if (inc.length) { await testo(l.inclusiTit.toUpperCase(), { px: 24, b: true, col: GOLD, spazio: 3, dopo: 14 });
        for (const t of inc) { if (y + 40 > FONDO) await nuova(); g.fillStyle = GOLD; g.beginPath(); g.arc(M + 8, y + 17, 5, 0, 7); g.fill(); await testo(t, { px: 25, x: M + 32, w: CW - 32, dopo: 4 }); }
        y += 30; }
      for (const t of o.chiusa.split('\n').filter(x => x.trim())) await testo(t.trim(), { px: 25, dopo: 10 });
      y += 10; await testo(l.soggetta, { px: 25, b: true, it: true, col: GOLD, dopo: 30 });
      await testo(l.saluti + ',', { px: 25, dopo: 4 });
      for (const [k, t] of String(o.firma || FIRMA).split('\n').entries()) if (t.trim()) await testo(t.trim(), { px: 25, b: k === 0, col: k === 0 ? NAVY : TXT, dopo: 2 });
      await chiudi();
      return X.pdf(pagine, `${l.titolo} ${o.cliente || ''} ${periodoTxt()}`.trim());
    }
    // ---- storico delle offerte ----
    let storico = [], aperte = {}, cercaSt = '', cercaCt = '', fEsito = '', fTipo = '';
    async function salvaStorico(tipo, html) {
      if (!store.saveOfferta) return;
      try {
        html = html || await htmlMail();
        const stato = JSON.parse(JSON.stringify(o)); ['tab', 'q', 'f', 'fOpen', 'persOpen', 'ultima'].forEach(k => delete stato[k]);
        const rec = { cliente: o.cliente.trim(), email: String(o.email || '').trim().toLowerCase(), telefono: String(o.tel || '').trim(), lingua: o.lingua, oggetto: oggettoMail(), periodo: periodoTxt(), tariffa: o.tariff,
          ville: scelte().map(v => { const li = listinoOf(v);
            return { id: v.id, name: v.name, prezzo: prezzoTot(v), affitto: prezzoDi(v), listino: typeof li === 'number' ? li : null,
              voci: srvList().filter(x => x.voce && haServ(v, x.key)).map(x => x.label),
              servizi: srvAparte(v).map(x => { const b0 = prezzoSrvBase(v, x.key); return { k: x.key, label: x.label, prezzo: typeof x.eur === 'number' ? x.eur : null, base: typeof b0 === 'number' ? b0 : null }; }) }; }), html, stato, creatoDa: String(store.user || '').toLowerCase(), quando: new Date().toISOString() };
        // stessa offerta salvata poco fa (stesso testo): aggiorno quella invece di crearne un'altra
        const u = o.ultima; const firma = rec.html.length + '|' + rec.cliente + '|' + rec.email + '|' + rec.telefono + '|' + rec.oggetto + '|' + rec.ville.map(v => v.id + v.prezzo).join(',');
        if (u && u.firma === firma && storico.some(x => x.id === u.id)) { const x = storico.find(y => y.id === u.id); rec.id = u.id; rec.tipi = Array.from(new Set((x.tipi || []).concat(tipo))); rec.quando = x.quando; ['esito', 'esitoIl', 'tipoContatto'].forEach(k => { if (x[k] !== undefined) rec[k] = x[k]; }); }
        else { rec.tipi = [tipo]; rec.esito = 'corso'; const c = contatti(storico).find(z => z.k === chiaveCli(rec)); if (c && c.tipo) rec.tipoContatto = c.tipo; }
        const id = await store.saveOfferta(rec); o.ultima = { id, firma }; saveUI();
      } catch (err) { console.warn('storico offerte', err); toast(err && err.code === 'permission-denied' ? 'Offerta non salvata nello storico: bisogna pubblicare la nuova regola di Firestore' : 'Offerta non salvata nello storico'); }
    }
    const TIPI = { word: 'Word', mail: 'Mail', whatsapp: 'WhatsApp', pdf: 'PDF' };
    const dataOra = iso => { try { const d = new Date(iso); return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }); } catch (_) { return ''; } };
    // report dei prezzi modificati nelle offerte rispetto a listino (affitto) e scheda villa / Impostazioni (servizi)
    let repPrezzi = false;
    const reportPrezzi = () => { const R = {}; const pc = (a, b) => b ? (a - b) / b * 100 : null;
      storico.forEach(x => (x.ville || []).forEach(v => { const r = R[v.id] = R[v.id] || { id: v.id, name: v.name, n: 0, mod: 0, d: [], srv: {} };
        r.n++; const stp = x.stato && x.stato.prezzi ? x.stato.prezzi[v.id] : undefined;
        if (typeof v.listino === 'number' && typeof v.affitto === 'number') { if (v.affitto !== v.listino) { r.mod++; r.d.push(pc(v.affitto, v.listino)); } }
        else if (stp !== undefined && String(stp).trim() !== '') r.mod++;
        (v.servizi || []).forEach(z => { if (typeof z.base !== 'number') return; const q = r.srv[z.k] = r.srv[z.k] || { label: z.label, n: 0, mod: 0, d: [] }; q.n++;
          if (typeof z.prezzo === 'number' && z.prezzo !== z.base) { q.mod++; q.d.push(pc(z.prezzo, z.base)); } }); }));
      const media = l => { const a = l.filter(n => typeof n === 'number'); if (!a.length) return ''; const m = a.reduce((t, n) => t + n, 0) / a.length; return ` (in media ${m > 0 ? '+' : ''}${Math.round(m)}%)`; };
      const L0 = Object.values(R).map(r => Object.assign(r, { srvMod: Object.values(r.srv).reduce((t, q) => t + q.mod, 0) })).filter(r => r.mod || r.srvMod)
        .sort((a, b) => (b.mod + b.srvMod) - (a.mod + a.srvMod) || a.name.localeCompare(b.name, 'it'));
      return `<section class="card off-rep"><h3>Prezzi modificati nelle offerte</h3>
        <p class="note">Quante volte hai cambiato nell'offerta l'affitto rispetto al listino della villa, o il prezzo di un servizio rispetto alla scheda villa / Impostazioni. Se una villa compare spesso, probabilmente il valore nella scheda va aggiornato. Le offerte salvate prima di oggi contano solo l'affitto (senza la differenza).</p>
        ${L0.length ? `<div class="tbl-wrap"><table class="prices"><thead><tr><th>Villa</th><th class="r">Offerte</th><th>Affitto modificato</th><th>Servizi modificati</th></tr></thead><tbody>
          ${L0.map(r => `<tr><td><a href="#villa-${encodeURIComponent(r.id)}"><b>${esc(r.name)}</b></a></td><td class="r">${r.n}</td>
            <td>${r.mod ? `<b>${r.mod}</b> su ${r.n}${media(r.d)}` : '<span class="note">mai</span>'}</td>
            <td>${Object.values(r.srv).filter(q => q.mod).map(q => `${esc(q.label)}: <b>${q.mod}</b> su ${q.n}${media(q.d)}`).join('<br>') || '<span class="note">mai</span>'}</td></tr>`).join('')}
        </tbody></table></div>` : '<p class="note">Nessun prezzo modificato nelle offerte salvate.</p>'}</section>`; };
    function drawStorico() {
      const box = $('#off-storico'); if (!box) return;
      $('#off-st-n').textContent = storico.length ? ` · ${storico.length}` : '';
      const q = cercaSt.trim().toLowerCase();
      const conta = {}; storico.forEach(x => { conta[esitoDi(x)] = (conta[esitoDi(x)] || 0) + 1; });
      const lista = storico.filter(x => (!fEsito || (fEsito === 'aperte' ? aperta(x) : esitoDi(x) === fEsito)) && (!q || [x.cliente, x.email, x.telefono, x.oggetto, x.periodo].concat((x.ville || []).map(v => v.name)).join(' ').toLowerCase().includes(q)));
      const gruppi = {}; lista.forEach(x => { const k = chiaveCli(x); (gruppi[k] = gruppi[k] || []).push(x); });
      const G = Object.entries(gruppi).map(([k, l]) => { l.sort((a, b) => String(b.quando).localeCompare(String(a.quando))); return { k, l, ultimo: l[0].quando }; }).sort((a, b) => String(b.ultimo).localeCompare(String(a.ultimo)));
      box.innerHTML = `<section class="card"><h2>Storico delle offerte</h2>
        <p class="note">Ogni offerta si salva da sola quando la copi per la mail, la mandi su WhatsApp o scarichi Word o PDF, divisa per cliente (email, poi telefono, poi nome). Da qui la rivedi, la ricopi o la riapri per modificarla.</p>
        <div class="off-tools"><input type="search" id="off-st-q" placeholder="Cerca cliente, email, telefono, villa o periodo" value="${esc(cercaSt)}"><button type="button" class="btn${repPrezzi ? ' primary' : ''}" id="off-st-rep">Prezzi modificati</button></div>
        ${repPrezzi ? reportPrezzi() : ''}
        <div class="off-chips" id="off-st-f">${[['', 'Tutte', storico.length], ['aperte', 'Da chiudere', storico.filter(aperta).length]].concat(ESITI.map(([k, t]) => [k, t, conta[k] || 0])).map(([k, t, n]) => `<button type="button" class="rp-chip${fEsito === k ? ' on' : ''}" data-fe="${k}">${t} <b>${n}</b></button>`).join('')}</div>
        ${G.length ? G.map(g => { const c = g.l.find(x => x.cliente) || g.l[0]; const em = g.l.find(x => x.email); const tl = g.l.find(x => x.telefono); const open = aperte[g.k] !== false;
          return `<details class="off-cli" data-g="${esc(g.k)}" ${open ? 'open' : ''}><summary><b>${esc(c.cliente || (em ? em.email : tl ? tl.telefono : 'Senza cliente'))}</b>${em && c.cliente ? ` <span class="note">${esc(em.email)}</span>` : ''}${tl && (c.cliente || em) ? ` <span class="note">${esc(tl.telefono)}</span>` : ''}<span class="note off-cli-n">${g.l.length} ${g.l.length === 1 ? 'offerta' : 'offerte'} · ultima ${esc(dataOra(g.ultimo))}</span></summary>
            ${g.l.map(x => `<div class="off-rec" data-rec="${esc(x.id)}">
              <div class="off-rec-h"><div><b>${esc(x.oggetto || x.periodo || '')}</b><small class="note">${esc(dataOra(x.quando))} · ${esc((x.tipi || []).map(t => TIPI[t] || t).join(' + '))} · ${esc(x.lingua === 'en' ? 'inglese' : 'italiano')}${x.creatoDa && x.creatoDa !== String(store.user || '').toLowerCase() ? ' · ' + esc(x.creatoDa) : ''}</small>
                <small class="off-rec-v">${(x.ville || []).map(v => `${esc(v.name)} <span class="note">${typeof v.prezzo === 'number' ? esc(S.money(v.prezzo)) : 'su richiesta'}</span>`).join(' · ')}</small></div>
                <div class="off-rec-b">${selEsito(x)}<button type="button" class="btn small" data-act="vedi">${aperte['r' + x.id] ? 'Chiudi' : 'Vedi'}</button><button type="button" class="btn small" data-act="copia">Copia per email</button><button type="button" class="btn small" data-act="riapri">Riapri</button>${ctx.openBooking && ctx.canEdit && ctx.canEdit() ? `<button type="button" class="btn small${(x.prenotazioni || []).length ? '' : ' primary'}" data-act="pren">${(x.prenotazioni || []).length ? 'Prenotata ✓' : 'Prenota'}</button>` : ''}<button type="button" class="btn small danger" data-act="del">Elimina</button></div></div>
              ${aperte['r' + x.id] ? `<div class="off-prev off-rec-prev">${x.html || '<p class="note">Anteprima non disponibile.</p>'}</div>` : ''}</div>`).join('')}
          </details>`; }).join('') : `<p class="note">${storico.length ? 'Nessuna offerta corrisponde alla ricerca.' : 'Ancora nessuna offerta salvata: compariranno qui quando copi una mail, mandi un WhatsApp o scarichi Word o PDF.'}</p>`}
      </section>`;
      const qi = $('#off-st-q'); qi.oninput = () => { cercaSt = qi.value; const pos = qi.selectionStart; drawStorico(); const n = $('#off-st-q'); n.focus(); n.setSelectionRange(pos, pos); };
      $$('.off-cli', box).forEach(d => d.addEventListener('toggle', () => { aperte[d.dataset.g] = d.open; }));
      $$('[data-fe]', box).forEach(b => b.onclick = () => { fEsito = b.dataset.fe; drawStorico(); });
      const rb = $('#off-st-rep'); if (rb) rb.onclick = () => { repPrezzi = !repPrezzi; drawStorico(); };
    }
    // esito di un'offerta (Storico e Contatti)
    const cambiaEsito = e => { const sl = e.target.closest('[data-esito]'); if (!sl) return; sl.className = 'off-esito es-' + sl.value;
      Promise.resolve(setEsito(store, sl.dataset.esito, sl.value)).then(() => toast('Offerta: ' + (ESITI.find(z => z[0] === sl.value) || [, ''])[1].toLowerCase()), err => toast('Non salvato: ' + (err && err.code === 'permission-denied' ? 'solo chi ha fatto l\'offerta o ha accesso completo' : (err && err.message || err)))); };
    $('#off-storico').addEventListener('change', cambiaEsito);

    /* ---------- contatti: tutti i clienti dello storico, da classificare come Lead o Prospect ---------- */
    function drawContatti() {
      const box = $('#off-contatti'); if (!box) return;
      const C = contatti(storico); const da = C.filter(c => !c.tipo).length;
      $('#off-ct-n').textContent = da ? ` · ${da} da classificare` : C.length ? ` · ${C.length}` : '';
      const q = cercaCt.trim().toLowerCase();
      const vis2 = C.filter(c => (!fTipo || (fTipo === 'da' ? !c.tipo : c.tipo === fTipo)) && (!q || [c.nome, c.email, c.tel].concat(c.l.flatMap(x => (x.ville || []).map(v => v.name))).join(' ').toLowerCase().includes(q)));
      const chip = (k, t, n) => `<button type="button" class="rp-chip${fTipo === k ? ' on' : ''}" data-ft="${k}">${t} <b>${n}</b></button>`;
      box.innerHTML = `<section class="card"><h2>Contatti</h2>
        <p class="note">Tutti i clienti a cui hai fatto un'offerta (dallo Storico). Segna per ognuno se è un <b>Lead</b> o un <b>Prospect</b>; ogni settimana un promemoria ti ricorda quelli ancora da classificare. Il tipo vale anche per le prossime offerte allo stesso cliente.</p>
        <div class="off-tools"><input type="search" id="off-ct-q" placeholder="Cerca nome, email, telefono o villa" value="${esc(cercaCt)}"><button type="button" class="btn" id="off-promo" title="Contatti da classificare e offerte non ancora prese o perse">Promemoria</button></div>
        <div class="off-chips">${chip('', 'Tutti', C.length)}${chip('da', 'Da classificare', da)}${TIPI_C.map(([k, t]) => chip(k, t, C.filter(c => c.tipo === k).length)).join('')}</div>
        ${vis2.length ? `<div class="tbl-wrap"><table class="prices off-ct"><thead><tr><th>Cliente</th><th>Contatti</th><th>Offerte</th><th>Tipo</th></tr></thead><tbody>
          ${vis2.map(c => { const n = {}; c.l.forEach(x => { n[esitoDi(x)] = (n[esitoDi(x)] || 0) + 1; });
            return `<tr class="${c.tipo ? '' : 'off-ct-da'}"><td><b>${esc(c.nome || c.email || c.tel || 'Senza nome')}</b></td>
              <td>${c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ''}${c.email && c.tel ? '<br>' : ''}${c.tel ? (telN(c.tel) ? `<a href="https://wa.me/${telN(c.tel)}" target="_blank" rel="noopener">${esc(c.tel)}</a>` : esc(c.tel)) : ''}${!c.email && !c.tel ? '<span class="note">—</span>' : ''}</td>
              <td><a href="#" data-vedi-c="${esc(c.k)}">${c.l.length} ${c.l.length === 1 ? 'offerta' : 'offerte'}</a><small class="note"> · ultima ${esc(dataBreve(c.ultimo))}</small><br><small>${ESITI.filter(([k]) => n[k]).map(([k, t]) => `<span class="off-es-b es-${k}">${n[k]} ${t.toLowerCase()}</span>`).join(' ')}</small></td>
              <td>${segTipo(c)}</td></tr>`; }).join('')}
        </tbody></table></div>` : `<p class="note">${C.length ? 'Nessun contatto per questi filtri.' : 'Ancora nessun contatto: compariranno qui con le offerte salvate nello Storico.'}</p>`}
      </section>`;
      const qi = $('#off-ct-q'); qi.oninput = () => { cercaCt = qi.value; const pos = qi.selectionStart; drawContatti(); const nq = $('#off-ct-q'); nq.focus(); nq.setSelectionRange(pos, pos); };
    }
    $('#off-contatti').addEventListener('click', e => {
      if (e.target.closest('#off-promo')) { promemoria(ctx, true); return; }
      const f = e.target.closest('[data-ft]'); if (f) { fTipo = f.dataset.ft; drawContatti(); return; }
      const v = e.target.closest('[data-vedi-c]'); if (v) { e.preventDefault(); const c = contatti(storico).find(z => z.k === v.dataset.vediC); if (!c) return;
        cercaSt = c.email || c.tel || c.nome; fEsito = ''; o.tab = 'storico'; $$('#off-tabs button').forEach(z => z.classList.toggle('on', z.dataset.tab === 'storico')); $('#off-storico').hidden = false; $('#off-contatti').hidden = true; drawStorico(); saveUI(); window.scrollTo(0, 0); return; }
      const b = e.target.closest('[data-tipo]'); if (!b) return; const c = contatti(storico).find(z => z.k === b.closest('[data-tipo-c]').dataset.tipoC); if (!c) return;
      const tipo = c.tipo === b.dataset.tipo ? '' : b.dataset.tipo;
      setTipo(store, c, tipo).then(() => toast(tipo ? `${c.nome || c.email || c.tel}: ${tipo === 'lead' ? 'Lead' : 'Prospect'}` : 'Tipo tolto'), err => toast('Non salvato: ' + (err && err.code === 'permission-denied' ? 'solo chi ha fatto le offerte o ha accesso completo' : (err && err.message || err))));
    });
    /* offerta → prenotazione: si sceglie la villa tra quelle proposte e lo stato (Opzione, Confermato…), poi si apre la
       finestra della prenotazione già compilata (villa, date del periodo dell'offerta, cliente, prezzo) da controllare e salvare.
       Salvata, l'offerta ricorda la prenotazione (prenotazioni: [id]) e, se lo stato è confermato, diventa "Presa". */
    function daOffertaAPrenotazione(x) {
      const tar = (x.stato && x.stato.tariff) || x.tariffa || o.tariff, idx = x.stato && typeof x.stato.idx === 'number' ? x.stato.idx : null;
      const vl = (x.ville || []).map(r => { const v = data().villas.find(z => z.id === r.id); const p = v && idx != null ? S.periodsFor(st, v, tar)[idx] : null; return { r, v, p }; }).filter(z => z.v);
      if (!vl.length) { toast('Le ville di questa offerta non ci sono più'); return; }
      const fatte = (x.prenotazioni || []).map(id => data().bookings.find(bk => bk.id === id)).filter(Boolean);
      const stList = (ctx.stati ? ctx.stati() : []).filter(z => z.key !== 'owner');
      const d = $('#dlg');
      d.innerHTML = `<form class="dlg" id="op-form"><h3>Trasforma in prenotazione</h3>
        <p class="note">${esc(x.cliente || x.email || x.telefono || 'Cliente')} · ${esc(x.periodo || '')}</p>
        ${fatte.length ? `<div class="warn">Da questa offerta c'è già ${fatte.length === 1 ? 'una prenotazione' : fatte.length + ' prenotazioni'}: ${fatte.map(bk => esc((data().villas.find(v => v.id === bk.villaId) || {}).name || '') + ' · ' + esc(S.dm(bk.from)) + ' → ' + esc(S.dm(bk.to))).join(', ')}.</div>` : ''}
        <section class="dsec sec-date"><h4>Villa</h4><div class="op-ville">
          ${vl.map((z, i) => `<label class="flag"><input type="radio" name="op-v" value="${esc(z.v.id)}" ${i === 0 ? 'checked' : ''}><span><b>${esc(z.v.name)}</b><small>${z.p ? esc(S.dm(z.p.from)) + ' → ' + esc(S.dm(z.p.to)) : 'date da scegliere'} · ${typeof z.r.prezzo === 'number' ? esc(S.money(z.r.prezzo)) : 'prezzo su richiesta'}</small></span></label>`).join('')}</div></section>
        <section class="dsec sec-st"><h4>Stato</h4><div class="seg" id="op-st">${stList.map(z => `<button type="button" data-st="${esc(z.key)}" class="${z.key === 'opzione' ? 'on' : ''}">${esc(z.label)}</button>`).join('')}</div>
          <p class="note">Nella finestra che si apre controlli date, prezzo e servizi prima di salvare. Il prezzo è quello dell'offerta (affitto più servizi a parte).</p></section>
        <div class="foot"><button type="button" class="btn" id="op-no">Annulla</button><button type="submit" class="btn primary">Continua</button></div></form>`;
      let stato = stList.some(z => z.key === 'opzione') ? 'opzione' : (stList[0] || {}).key || 'occupato';
      $$('#op-st button', d).forEach(bt => bt.onclick = () => { stato = bt.dataset.st; $$('#op-st button', d).forEach(z => z.classList.toggle('on', z === bt)); });
      $('#op-no').onclick = () => d.close();
      $('#op-form').onsubmit = ev => { ev.preventDefault();
        const z = vl.find(y => y.v.id === (d.querySelector('[name="op-v"]:checked') || {}).value) || vl[0]; d.close();
        const from = z.p ? z.p.from : S.iso(new Date()), to = z.p ? z.p.to : S.iso(new Date(Date.now() + 7 * 864e5));
        ctx.openBooking({ villaId: z.v.id, from, to,
          pre: { cliente: x.cliente || '', status: stato, prezzoVendita: typeof z.r.prezzo === 'number' ? z.r.prezzo : undefined, vociOfferta: Array.isArray(z.r.voci) ? z.r.voci : undefined, note: `Da offerta del ${dataBreve(x.quando)}${x.email ? ' · ' + x.email : ''}${x.telefono ? ' · ' + x.telefono : ''}` },
          onSaved: bk => { const patch = { prenotazioni: Array.from(new Set((x.prenotazioni || []).concat(bk.id))) };
            const conf = (ctx.stati ? ctx.stati() : []).find(s0 => s0.key === bk.status);
            if (bk.status === 'confermato' || bk.status === 'occupato' || (conf && /conferm/i.test(conf.label))) { patch.esito = 'presa'; patch.esitoIl = new Date().toISOString(); }
            Promise.resolve(store.updateOfferta(x.id, patch)).then(() => toast(patch.esito ? 'Prenotazione inserita: offerta segnata come presa' : 'Prenotazione inserita e collegata all\'offerta'), () => {}); } });
      };
      if (d.showModal) d.showModal(); else d.setAttribute('open', '');
    }
    $('#off-storico').addEventListener('click', async e => {
      const b = e.target.closest('[data-act]'); if (!b) return; const id = b.closest('[data-rec]').dataset.rec; const x = storico.find(y => y.id === id); if (!x) return;
      if (b.dataset.act === 'vedi') { aperte['r' + id] = !aperte['r' + id]; drawStorico(); }
      if (b.dataset.act === 'copia') { const txt = (() => { const d = document.createElement('div'); d.innerHTML = x.html || ''; return d.innerText; })();
        try { await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([x.html || ''], { type: 'text/html' }), 'text/plain': new Blob([txt], { type: 'text/plain' }) })]); toast('Offerta copiata: incollala in Gmail'); } catch (_) { toast('Il browser non ha permesso di copiare'); } }
      if (b.dataset.act === 'pren') { daOffertaAPrenotazione(x); return; }
      if (b.dataset.act === 'riapri') { if (!(await (window.SDBConferma ? window.SDBConferma : t => Promise.resolve(confirm(t)))("L'offerta che stai preparando verrà sostituita da questa.", { titolo: "Riaprire l'offerta?", ok: 'Riapri' }))) return;
        Object.keys(o).forEach(k => { if (!['tab', 'q', 'f', 'fOpen', 'persOpen'].includes(k)) delete o[k]; }); Object.assign(o, JSON.parse(JSON.stringify(x.stato || {})), { tab: 'nuova', ultima: null }); saveUI(); mount(main, ctx); }
      if (b.dataset.act === 'del') { if (!(await (window.SDBConferma ? window.SDBConferma : t => Promise.resolve(confirm(t)))('L\'offerta verrà tolta dallo storico.', { titolo: "Eliminare l'offerta?", ok: 'Elimina', danger: true }))) return; try { await store.deleteOfferta(id); toast('Offerta eliminata'); } catch (err) { toast('Errore: ' + (err && err.message || err)); } }
    });
    // le scelte fatte nell'offerta (servizi tolti, prezzi cambiati…) valgono solo per l'offerta in corso: Ricomincia le azzera
    $('#off-reset').addEventListener('click', async () => { if (!(await (window.SDBConferma ? window.SDBConferma : t => Promise.resolve(confirm(t)))("Cliente, ville, prezzi, servizi e testi dell'offerta in corso tornano quelli di partenza. Le offerte già inviate restano nello storico.", { titolo: 'Ricominciare da zero?', ok: 'Ricomincia' }))) return;
      Object.keys(o).forEach(k => { if (!['tab', 'q', 'f', 'fOpen', 'persOpen', 'tariff', 'lingua', 'nFoto', 'firma', 'stile', 'soloLibere'].includes(k)) delete o[k]; }); o.tab = 'nuova'; saveUI(); mount(main, ctx); toast('Nuova offerta'); });
    $('#off-tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (!b) return; o.tab = b.dataset.tab; $$('#off-tabs button').forEach(z => z.classList.toggle('on', z === b)); $('#off-storico').hidden = o.tab !== 'storico'; $('#off-contatti').hidden = o.tab !== 'contatti'; $('#off-editor').hidden = ['storico', 'contatti'].includes(o.tab); saveUI(); window.scrollTo(0, 0); });
    if (store.listenOfferte) {
      if (window.__sdbOffOff) { try { window.__sdbOffOff(); } catch (_) {} }
      window.__sdbOffOff = store.listenOfferte(l => { storico = l; drawStorico(); drawContatti(); }, err => { $('#off-storico').innerHTML = `<section class="card"><h2>Storico delle offerte</h2><div class="warn err">${err && err.code === 'permission-denied' ? 'Per lo storico bisogna pubblicare la nuova regola di Firestore (offerte).' : 'Errore: ' + esc(err && err.message || err)}</div></section>`; });
    } else { $('#off-tabs [data-tab="storico"]').hidden = true; $('#off-tabs [data-tab="contatti"]').hidden = true; }
    $('#off-copy').addEventListener('click', async () => {
      if (!pronto()) return; const btn = $('#off-copy'); btn.disabled = true;
      try {
        const html = await htmlMail();
        const txt = (() => { const d = document.createElement('div'); d.innerHTML = html; return d.innerText; })();
        let ok = false;
        try { if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) { await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([txt], { type: 'text/plain' }) })]); ok = true; } } catch (_) {}
        if (!ok) {
          // ripiego: seleziono l'anteprima e uso il comando Copia del browser
          const box = document.createElement('div'); box.innerHTML = html; box.style.cssText = 'position:fixed;left:-9999px;top:0;width:640px'; box.contentEditable = 'true'; document.body.appendChild(box);
          const r = document.createRange(); r.selectNodeContents(box); const s = getSelection(); s.removeAllRanges(); s.addRange(r); ok = document.execCommand('copy'); s.removeAllRanges(); box.remove();
        }
        const nb = ok && o.brochure && store.listBrochure ? await scaricaBro() : 0;
        if (ok) salvaStorico('mail', html);
        msg(ok ? `<div class="warn ok">Offerta copiata. Ora premi <b>Apri Gmail</b> e incolla nel testo del messaggio.${nb ? ` Poi trascina nella mail ${nb === 1 ? 'la brochure scaricata' : `le ${nb} brochure scaricate`} (cartella Download).` : ''}</div>` : '<div class="warn err">Il browser non ha permesso di copiare: usa Scarica Word e allega il documento.</div>');
      } catch (x) { msg(`<div class="warn err">Non riuscito: ${esc(x.message || x)}</div>`); }
      btn.disabled = false;
    });
    $('#off-wb').addEventListener('change', e => { o.linkWB = e.target.checked; save(); });
    $('#off-wba').addEventListener('change', e => { o.linkWBA = e.target.checked; save(); });
    if ($('#off-bro')) $('#off-bro').addEventListener('change', e => { o.brochure = e.target.checked; save(); updBro(); });
    if ($('#off-bro-dl')) $('#off-bro-dl').addEventListener('click', async () => {
      if (!pronto()) return; const btn = $('#off-bro-dl'); btn.disabled = true;
      const n = await scaricaBro();
      msg(n ? `<div class="warn ok">${n} ${n === 1 ? 'brochure scaricata' : 'brochure scaricate'}: trascinale dalla cartella Download nella mail.</div>` : '<div class="warn err">Nessuna brochure per le ville scelte: caricale nella scheda di ogni villa.</div>');
      btn.disabled = false;
    });
    // WhatsApp, messaggio di testo: apre la chat del cliente (o la scelta del contatto) con l'offerta già scritta; il testo resta anche negli appunti
    $('#off-wa-txt').addEventListener('click', () => {
      if (!pronto()) return; const t = testoWA();
      try { navigator.clipboard && navigator.clipboard.writeText(t).catch(() => {}); } catch (_) {}
      apriWA(t); salvaStorico('whatsapp');
      msg(`<div class="warn ok">WhatsApp aperto con l'offerta già scritta${telWA(o.tel) ? '' : ': scegli il contatto'}. Controlla e premi Invia. Il testo è anche negli appunti, se servisse incollarlo.${o.brochure ? ' Per le brochure usa <b>WhatsApp → PDF</b> dal telefono, oppure Scarica brochure e trascinale nella chat.' : ''}</div>`);
    });
    // PDF: prima si prepara (foto comprese), poi un tasto lo manda: dal telefono con Condividi (PDF e brochure già allegati),
    // dal computer si scarica e si apre WhatsApp con due righe di accompagnamento
    let pdfPronto = null;
    async function preparaPdf(btn) {
      if (!pronto()) return null; btn.disabled = true;
      try {
        const blob = await pdfOfferta(t => msg(`<p class="note">${esc(t)}</p>`));
        const file = new File([blob], nomeFile() + '.pdf', { type: 'application/pdf' });
        const bro = [];
        if (o.brochure && store.listBrochure) for (const v of scelte()) { const b = broScelta(await broDi(v.id)); if (!b) continue; msg(`<p class="note">Preparo la brochure di ${esc(v.name)}…</p>`);
          try { const bl = await store.getBrochure(b); bro.push(new File([bl], b.nome || (v.name + '.pdf'), { type: 'application/pdf' })); } catch (_) {} }
        pdfPronto = { file, bro }; salvaStorico('pdf'); return pdfPronto;
      } catch (x) { msg(`<div class="warn err">PDF non riuscito: ${esc(x.message || x)}</div>`); return null; }
      finally { btn.disabled = false; }
    }
    const mb = n => (n / 1e6).toFixed(1).replace('.', ',') + ' MB';
    $('#off-pdf').addEventListener('click', async () => {
      const r = await preparaPdf($('#off-pdf')); if (!r) return;
      X.scarica(r.file.name, r.file); msg(`<div class="warn ok">PDF scaricato (${mb(r.file.size)}).</div>`);
    });
    $('#off-wa-pdf').addEventListener('click', async () => {
      const r = await preparaPdf($('#off-wa-pdf')); if (!r) return;
      const files = [r.file].concat(r.bro);
      const condividi = !!(navigator.canShare && (() => { try { return navigator.canShare({ files }); } catch (_) { return false; } })());
      msg(`<div class="warn ok">PDF pronto: ${r.file.name} (${mb(r.file.size)})${r.bro.length ? ` + ${r.bro.length} brochure` : ''}.
        <div class="off-wa-go"><button type="button" class="btn primary off-wa" id="off-wa-send">${condividi ? 'Invia su WhatsApp' : 'Scarica e apri WhatsApp'}</button></div>
        <small>${condividi ? 'Si apre la scelta dell\'app: scegli WhatsApp e il contatto. Il PDF' + (r.bro.length ? ' e le brochure arrivano' : ' arriva') + ' con due righe di accompagnamento.' : 'Il PDF' + (r.bro.length ? ' e le brochure si scaricano' : ' si scarica') + ' nella cartella Download e si apre WhatsApp con due righe già scritte: trascina i file nella chat e invia.'}</small></div>`);
      $('#off-wa-send').addEventListener('click', async () => {
        const breve = testoBreve();
        if (condividi) { try { await navigator.share({ files, text: breve }); } catch (err) { if (err && err.name !== 'AbortError') toast('Condivisione non riuscita: ' + (err.message || err)); } return; }
        apriWA(breve); X.scarica(r.file.name, r.file); r.bro.forEach((f, k) => setTimeout(() => X.scarica(f.name, f), 600 * (k + 1)));
      });
    });
    $('#off-gmail').addEventListener('click', () => {
      const u = `https://mail.google.com/mail/?view=cm&fs=1${o.email ? '&to=' + encodeURIComponent(o.email) : ''}&su=${encodeURIComponent(oggettoMail())}`;
      window.open(u, '_blank', 'noopener');
    });
  }

  /* ---------- promemoria settimanale (all'apertura dell'app, al massimo una volta ogni 7 giorni su questo dispositivo) ----------
   * contatti ancora da classificare (Lead/Prospect) e offerte non ancora prese o perse: si sistemano direttamente nella finestra */
  const SETTIMANA = 7 * 864e5;
  const chiavePromo = u => 'sdb-off-promemoria:' + String(u || '').toLowerCase();
  function promemoria(ctx, forza) {
    const { store, toast, ui, saveUI } = ctx;
    if (!store.listenOfferte || !store.updateOfferta) return;
    let last = 0; try { last = Number(localStorage.getItem(chiavePromo(store.user))) || 0; } catch (_) {}
    if (!forza && Date.now() - last < SETTIMANA) return;
    let stop = null, fatto = false;
    stop = store.listenOfferte(l => { if (fatto) return; fatto = true; setTimeout(() => { try { stop && stop(); } catch (_) {} }); mostra(l); }, () => {});
    function mostra(l) {
      const C = contatti(l).filter(c => !c.tipo);
      const O = l.filter(aperta).sort((a, b) => String(a.quando).localeCompare(String(b.quando)));
      if (!C.length && !O.length) { if (forza) toast('Niente da aggiornare: contatti classificati e offerte chiuse'); return; }
      try { localStorage.setItem(chiavePromo(store.user), String(Date.now())); } catch (_) {}
      const MAX = 25;
      let d = document.getElementById('dlg-promo'); if (!d) { d = document.createElement('dialog'); d.id = 'dlg-promo'; d.className = 'dlg-conf dlg-promo'; document.body.appendChild(d); }
      d.innerHTML = `<form class="dlg" method="dialog"><h3>Promemoria della settimana</h3>
        ${C.length ? `<h4>Contatti da classificare <span class="note">${C.length}</span></h4><div class="promo-l">${C.slice(0, MAX).map(c => `<div class="promo-r"><div><b>${escH(c.nome || c.email || c.tel || 'Senza nome')}</b><small class="note">${escH([c.email, c.tel].filter(Boolean).join(' · '))}${c.email || c.tel ? ' · ' : ''}${c.l.length} ${c.l.length === 1 ? 'offerta' : 'offerte'}</small></div>${segTipo(c)}</div>`).join('')}${C.length > MAX ? `<p class="note">… e altri ${C.length - MAX} nella pagina Contatti.</p>` : ''}</div>` : ''}
        ${O.length ? `<h4>Offerte non ancora prese o perse <span class="note">${O.length}</span></h4><div class="promo-l">${O.slice(0, MAX).map(x => `<div class="promo-r"><div><b>${escH(x.cliente || x.email || x.telefono || 'Senza cliente')}</b><small class="note">${escH(dataBreve(x.quando))} · ${escH(x.periodo || x.oggetto || '')}${(x.ville || []).length ? ' · ' + escH(x.ville.map(v => v.name).join(', ')) : ''}</small></div>${selEsito(x)}</div>`).join('')}${O.length > MAX ? `<p class="note">… e altre ${O.length - MAX} nello Storico.</p>` : ''}</div>` : ''}
        <div class="foot"><button type="button" class="btn" data-dopo="1" title="La finestra si chiude e ricompare la prossima volta che apri l'app">Ricordamelo alla prossima apertura</button><button type="button" class="btn" data-vai="contatti">Apri Contatti</button><button type="button" class="btn" data-vai="storico">Apri Storico</button><button type="button" class="btn primary" data-chiudi="1">Fatto</button></div></form>`;
      const chiudi = () => { try { d.close(); } catch (_) { d.removeAttribute('open'); } };
      const errore = err => toast('Non salvato: ' + (err && err.code === 'permission-denied' ? 'solo chi ha fatto l\'offerta o ha accesso completo' : (err && err.message || err)));
      d.onclick = e => {
        if (e.target === d) { chiudi(); return; }
        if (e.target.closest('[data-chiudi]')) { chiudi(); return; }
        // rimanda: tolgo la data dell'ultimo promemoria, così ricompare alla prossima apertura dell'app
        if (e.target.closest('[data-dopo]')) { try { localStorage.removeItem(chiavePromo(store.user)); } catch (_) {} chiudi(); toast('Te lo ricordo alla prossima apertura'); return; }
        const v = e.target.closest('[data-vai]'); if (v) { chiudi(); ui.off = Object.assign(ui.off || {}, { tab: v.dataset.vai }); saveUI();
          if (location.hash === '#offerte') window.dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = 'offerte'; return; }
        const b = e.target.closest('[data-tipo]'); if (!b) return; const c = C.find(z => z.k === b.closest('[data-tipo-c]').dataset.tipoC); if (!c) return;
        const tipo = c.tipo === b.dataset.tipo ? '' : b.dataset.tipo; c.tipo = tipo;
        b.parentNode.querySelectorAll('button').forEach(z => z.classList.toggle('on', z.dataset.tipo === tipo));
        setTipo(store, c, tipo).catch(errore);
      };
      d.onchange = e => { const sl = e.target.closest('[data-esito]'); if (!sl) return; sl.className = 'off-esito es-' + sl.value; Promise.resolve(setEsito(store, sl.dataset.esito, sl.value)).catch(errore); };
      d.oncancel = ev => { ev.preventDefault(); chiudi(); };
      if (d.showModal) d.showModal(); else d.setAttribute('open', '');
    }
  }

  window.SDBOfferte = { mount, promemoria };
})();
