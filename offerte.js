/*
 * Pagina "Offerte": scegli tariffa e periodo, scegli le ville, e prepara per il cliente
 *  - un documento Word con foto, informazioni e prezzo di ogni villa;
 *  - una mail da incollare in Gmail (testo e foto copiati negli appunti), con "Apri Gmail".
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
      proposte: 'Ecco le nostre proposte:', extra: 'Servizi a parte', totale: 'Totale con i servizi', inclVilla: 'Compreso per questa villa', video: 'Guarda il video', qui: 'qui', tariffa: 'Tariffa', inclusiTit: 'Le tariffe includono:',
      inclusi: 'Pulizia giornaliera della casa\nGiardinaggio e pulizia della piscina regolari\nCambio biancheria e asciugamani due volte a settimana\nProdotti da bagno di lusso all\'arrivo\nServizio concierge per tutte le prenotazioni in Costa Smeralda\nPulizia finale e lavanderia finale standard\nTutte le utenze, escluso il riscaldamento della piscina se presente',
      chiusaMail: 'Il nostro Concierge sarà a disposizione per qualsiasi servizio extra durante il soggiorno.',
      soggetta: 'Offerta soggetta a disponibilità e ad approvazione finale del proprietario.'
    },
    en: {
      titolo: 'Villa proposal', per: 'Dates', ospiti: 'Guests', camere: 'Bedrooms', bagni: 'Bathrooms', interni: 'Indoor', esterni: 'Outdoor',
      piscina: 'Pool', spa: 'Spa', palestra: 'Gym', mare: 'Position', localita: 'Location', servizi: 'Included services', sito: 'Discover more',
      prezzo: 'Price for the period', richiesta: 'On request', dal: 'from', al: 'to', saluti: 'Kind regards',
      intro: (c, p) => `${c ? 'Dear ' + c + ',' : 'Dear guest,'}\nplease find our suggested options below for the period ${p}.`,
      chiusa: 'Prices refer to the whole period indicated. We remain at your disposal for any further information.',
      oggetto: p => `Your Enquiry · ${p}`,
      proposte: 'Herewith our suggestions:', extra: 'Extra services', totale: 'Total including services', inclVilla: 'Included for this villa', video: 'Watch the video', qui: 'here', tariffa: 'Rate', inclusiTit: 'The rates do include:',
      inclusi: 'Daily Cleaning for the resetting of the house\nRegular Gardening and pool cleaning\nLinen & towel change twice per week\nLuxury bath products on arrival\nConcierge Services for all reservations in Costa Smeralda\nStandard Final Cleaning and Final Laundry\nAll Utilities except the cost for the pool heating if present',
      chiusaMail: 'Our Concierge will be ready to accommodate any requests for extra services needed during your stay.',
      soggetta: 'Offer subject to availability and owner\'s final approval.'
    }
  };
  const FIRMA = 'Esmeralda Luxury Villas';

  function mount(main, ctx) {
    const { ui, saveUI, esc, data, store, $, $$, toast, S, settings, blocks, hiddenField } = ctx;
    const favLists = ctx.favLists || (() => []), locations = ctx.locations || (() => []), normLoc = ctx.normLoc || (x => String(x || '').trim().toUpperCase());
    const X = window.SDBExport;
    const o = ui.off = Object.assign({ tariff: 'settimanale', idx: 0, ville: [], prezzi: {}, cliente: '', email: '', lingua: 'it', nFoto: 3, soloLibere: true, q: '', intro: '', chiusa: '', introMod: false, chiusaMod: false, note: {}, incSel: null, incExtra: '', firma: 'Esmeralda Luxury Villas' }, ui.off || {});
    const L = () => T[o.lingua] || T.it;
    if (!o.note) o.note = {};
    if (!o.f || typeof o.f !== 'object') o.f = {};
    if (!o.srv || typeof o.srv !== 'object') o.srv = {};
    // servizi dell'offerta: quelli delle prenotazioni (Impostazioni → Servizi e inclusioni), con prezzo di vendita modificabile qui
    const SRV_EN = { pulizia: 'Final cleaning', cuoco: 'Private chef', transfer: 'Transfer' };
    const srvList = () => [['pulizia', 'Pulizia finale'], ['cuoco', 'Cuoco'], ['transfer', 'Transfer']].map(([key, label]) => ({ key, label }))
      .concat(((st.servizi) || []).filter(x => x && x.key).map(x => ({ key: x.key, label: x.label })));
    const srvDi = k => { const d = (st.prezziServizi || {})[k] || {}; const x = o.srv[k] || {};
      const modo = ['pred', 'inc', 'parte'].includes(x.modo) ? x.modo : x.incluso === true ? 'inc' : x.incluso === false ? 'parte' : 'pred';
      return { on: !!x.on, modo, prezzo: x.prezzo !== undefined ? x.prezzo : (typeof d.vendita === 'number' ? String(d.vendita) : '') }; };
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
    const srvNome = x => o.lingua === 'en' ? (SRV_EN[x.key] || x.label) : x.label;
    // un servizio è incluso per una villa se "Includi tutti", oppure con "Predefinito" se la scheda villa lo ha tra i servizi compresi nel prezzo
    const inclusoPer = (v, k) => { const d = srvDi(k); return d.modo === 'inc' || (d.modo === 'pred' && (v.serviziInclusi || []).includes(k)); };
    const srvAttivi = () => srvList().map(x => Object.assign({}, x, srvDi(x.key))).filter(x => x.on).map(x => Object.assign(x, { eur: S.parseMoney(x.prezzo) }));
    const srvAparte = v => srvAttivi().filter(x => !inclusoPer(v, x.key));
    const srvInclVilla = v => srvAttivi().filter(x => inclusoPer(v, x.key));
    const extraTot = v => srvAparte(v).reduce((t, x) => t + (typeof x.eur === 'number' ? x.eur : 0), 0);
    // inclusi per tutte le ville scelte: vanno nell'elenco comune "Le tariffe includono"; gli altri inclusi si scrivono sotto la singola villa
    // per il cliente: un servizio a parte con prezzo risulta incluso (il prezzo è già nel totale); a parte senza prezzo non compare
    const incluseVilla = v => srvAttivi().filter(x => inclusoPer(v, x.key) || (typeof x.eur === 'number' && x.eur > 0));
    const prezzoTot = v => { const pr = prezzoDi(v); return pr === null ? null : pr + extraTot(v); };
    const inclTutte = () => { const vv = scelte(); return srvAttivi().filter(x => vv.length ? vv.every(v => incluseVilla(v).some(y => y.key === x.key)) : x.modo === 'inc').map(x => x.key); };
    const testiSrv = k => { const l = S.inclusioniDi(st).filter(i => i.servizio === k).map(i => (o.lingua === 'en' ? i.en : i.it) || i.it || i.en); const x = srvList().find(z => z.key === k); return l.length ? l : [srvNome(x || { key: k, label: k })]; };
    const srvInclusi = () => inclTutte().filter(k => !S.inclusioniDi(st).some(i => i.servizio === k)).map(k => srvNome(srvList().find(z => z.key === k) || { key: k, label: k }));
    const inclSoloVilla = v => { const tutti = inclTutte(); return incluseVilla(v).filter(x => !tutti.includes(x.key)); };
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
    const euro = n => new Intl.NumberFormat(o.lingua === 'en' ? 'en-GB' : 'it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
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
        <div class="seg off-tabs" id="off-tabs"><button type="button" data-tab="nuova" class="${o.tab !== 'storico' ? 'on' : ''}">Nuova offerta</button><button type="button" data-tab="storico" class="${o.tab === 'storico' ? 'on' : ''}">Storico<span id="off-st-n"></span></button></div></div>
      <div id="off-storico" ${o.tab === 'storico' ? '' : 'hidden'}></div>
      <div id="off-editor" ${o.tab === 'storico' ? 'hidden' : ''}>
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
          <small class="note">Spunta i servizi da proporre. <b>Predefinito</b>: incluso nelle ville che lo hanno tra i "Servizi compresi nel prezzo" della scheda, a parte (con il prezzo sommato) nelle altre. <b>Includi tutti</b>: incluso per tutte le ville. <b>A parte tutti</b>: si somma al prezzo di ogni villa. Nella mail il cliente vede i servizi sempre come <b>compresi</b> e un solo prezzo, già con i servizi a parte sommati; un servizio a parte senza prezzo non compare. I prezzi partono da quelli di Impostazioni → Servizi e inclusioni e qui li puoi cambiare per questa offerta.</small></div>
        <div class="field"><span>Le tariffe includono</span><div class="off-incl" id="off-incl"></div>
          <textarea id="off-incx" rows="2" placeholder="Altre voci solo per questa offerta (una per riga)">${esc(o.incExtra || '')}</textarea>
          <small class="note">L'elenco e le voci spuntate di norma si cambiano in Impostazioni → Servizi e inclusioni.</small></div>
        <div class="field"><span>Riepilogo prezzi per villa</span><div class="tbl-wrap"><table class="prices off-riep"><thead><tr><th>Villa</th><th>Affitto</th><th>Servizi a parte</th><th>Totale</th></tr></thead><tbody id="off-riep"></tbody></table></div></div>
      </section>
      <section class="card"><h2>4 · Offerta</h2>
        <div class="off-prevbar"><span class="note" id="off-ogg"></span><div class="off-prevact"><label class="off-st-pick"><span>Stile</span><select id="off-st-sel" aria-label="Stile della mail"></select></label><button type="button" class="btn off-ftog" id="off-pers-t" aria-expanded="${o.persOpen ? 'true' : 'false'}"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z M13 7l4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>Personalizza</button></div></div>
        <div class="off-pers" id="off-pers" ${o.persOpen ? '' : 'hidden'}>
        <div class="row off-row">
          <label class="field"><span>Cliente</span><input id="off-cli" value="${esc(o.cliente)}" placeholder="es. Mr Smith"></label>
          <label class="field"><span>Email del cliente</span><input id="off-mail" type="email" value="${esc(o.email)}" placeholder="facoltativa"></label>
          <div class="field"><span>Lingua</span><div class="seg" id="off-lang"><button type="button" data-l="it" class="${o.lingua === 'it' ? 'on' : ''}">Italiano</button><button type="button" data-l="en" class="${o.lingua === 'en' ? 'on' : ''}">English</button></div></div>
          <label class="field"><span>Foto per villa (Word)</span><select id="off-nf">${[1, 3, 5, 8].map(n => `<option value="${n}" ${Number(o.nFoto) === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        </div>
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
        <label class="field"><span>Oggetto della mail</span><input id="off-ogg-in"></label>
        <label class="field"><span>Testo iniziale</span><textarea id="off-intro" rows="3"></textarea></label>
        <label class="field"><span>Testo finale</span><textarea id="off-chiusa" rows="2"></textarea></label>
        <label class="field"><span>Firma</span><textarea id="off-firma" rows="2">${esc(o.firma || '')}</textarea></label>
        ${store.listBrochure ? `<label class="flag off-bro"><input type="checkbox" id="off-bro" ${o.brochure ? 'checked' : ''}><span><b>Allega brochure</b><small id="off-bro-info">Scarica i PDF delle ville scelte, nella lingua dell'offerta, da trascinare nella mail.</small></span></label>` : ''}
        </div>
        <div class="off-prev" id="off-anteprima"><p class="note">Scegli almeno una villa per vedere l'anteprima.</p></div>
        <div class="off-actions">
          <button type="button" class="btn primary" id="off-word">Scarica Word</button>
          <button type="button" class="btn" id="off-copy">Copia per email</button>
          <button type="button" class="btn" id="off-gmail">Apri Gmail</button>
          ${store.listBrochure ? '<button type="button" class="btn" id="off-bro-dl">Scarica brochure</button>' : ''}
        </div>
        <p class="note">Qui sopra vedi la mail come arriverà al cliente. Premi <b>Copia per email</b>, poi <b>Apri Gmail</b> e incolla nel messaggio (Ctrl+V, o ⌘V sul Mac); le brochure scaricate si trascinano dalla cartella Download. Cliente, lingua, testi e voci incluse si cambiano con <b>Personalizza</b>.</p>
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
    const setIdx = i => { const ps = baseP(); if (i < 0 || i >= ps.length || i === o.idx) return; o.idx = i; o.prezzi = {}; drawPer(); drawList(); drawTexts(); save(); };
    let visibili = [];
    const drawList = () => {
      const q = (o.q || '').trim().toLowerCase();
      const f = o.f, nr = x => { const m = /\d+/.exec(String(x || '')); return m ? Number(m[0]) : 0; };
      const fav = f.fav ? (favLists().find(l => l.id === f.fav) || {}).ville || [] : null;
      const da = f.da ? S.parseMoney(f.da) : null, a = f.a ? S.parseMoney(f.a) : null;
      const nF = ['loc', 'fav', 'osp', 'cam', 'da', 'a', 'pisc'].filter(k => f[k]).length; $('#off-fn').textContent = nF ? ' · ' + nF : ''; $('#off-ftog').classList.toggle('on', !!nF);
      const list = ville().filter(v => !q || `${v.name} ${v.location || ''}`.toLowerCase().includes(q))
        .filter(v => (!f.loc || normLoc(v.location) === f.loc) && (!fav || fav.includes(v.id)) && (!f.osp || nr(v.guests) >= Number(f.osp)) && (!f.cam || nr(v.guestBedrooms || v.totalBedrooms) >= Number(f.cam))
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
    const incAttiva = x => !x.servizio || inclTutte().includes(x.servizio);
    const incTesti = () => { const sel = incSel(); return S.inclusioniDi(st).filter(x => sel.includes(x.id) && incAttiva(x)).map(x => (o.lingua === 'en' ? x.en : x.it) || x.it || x.en).concat(srvInclusi())
      .concat(String(o.incExtra || '').split('\n').map(t => t.trim()).filter(Boolean)); };
    const chiInclude = k => { const vv = scelte(); if (!vv.length) return 'Secondo la scheda di ogni villa'; const si = vv.filter(v => (v.serviziInclusi || []).includes(k)).length;
      return si === vv.length ? 'Compreso in tutte le ville scelte' : si ? `Compreso in ${si} ${si === 1 ? 'villa' : 'ville'} su ${vv.length}, a parte ${vv.length - si === 1 ? "nell'altra" : 'nelle altre'}` : 'A parte in tutte le ville scelte'; };
    const drawSrv = () => {
      $('#off-srv').innerHTML = srvList().map(x => { const d = srvDi(x.key); return `<tr data-ok="${esc(x.key)}" class="${d.on ? 'on' : ''}">
        <td><label class="off-inc"><input type="checkbox" data-son ${d.on ? 'checked' : ''}><span>${esc(x.label)}</span></label></td>
        <td><div class="seg small" data-smode>${[['pred', 'Predefinito'], ['inc', 'Includi tutti'], ['parte', 'A parte tutti']].map(([m, t]) => `<button type="button" data-m="${m}" class="${d.modo === m ? 'on' : ''}" ${d.on ? '' : 'disabled'}>${t}</button>`).join('')}</div>${d.on && d.modo === 'pred' ? `<small class="note off-srv-who">${esc(chiInclude(x.key))}</small>` : ''}</td>
        <td><input data-sprz inputmode="numeric" value="${esc(d.prezzo)}" placeholder="—" ${d.on && d.modo !== 'inc' ? '' : 'disabled'} aria-label="Prezzo di ${esc(x.label)}"></td></tr>`; }).join('');
    };
    const drawRiep = () => {
      const vv = scelte();
      $('#off-riep').innerHTML = vv.length ? vv.map(v => { const pr = prezzoDi(v), ex = srvAparte(v).filter(x => typeof x.eur === 'number' && x.eur > 0), et = extraTot(v), inc = srvInclVilla(v);
        const ag = srvAparte(v);
        return `<tr><td><b>${esc(v.name)}</b>${inc.length ? `<small class="off-riep-l">Inclusi: ${esc(inc.map(x => x.label).join(', '))}</small>` : ''}${ag.length ? `<small class="off-riep-l off-agg">In aggiunta: ${esc(ag.map(x => x.label + (typeof x.eur === 'number' && x.eur > 0 ? ' ' + S.money(x.eur) : ' (senza prezzo)')).join(', '))}</small>` : ''}</td><td>${pr === null ? '<span class="note">su richiesta</span>' : S.money(pr)}</td><td>${ex.length ? `${S.money(et)}<small class="note"> (${esc(ex.map(x => x.label).join(', '))})</small>` : '<span class="note">—</span>'}</td><td><b>${pr === null ? '—' : S.money(pr + et)}</b></td></tr>`; }).join('')
        : '<tr><td colspan="4" class="note">Scegli le ville al punto 2.</td></tr>';
    };
    const drawTexts = () => {
      if (!o.introMod) o.intro = L().intro(o.cliente.trim(), periodoTxt());
      if (!o.chiusaMod) o.chiusa = L().chiusaMail;
      if (!o.oggettoMod) o.oggetto = L().oggetto(periodoTxt());
      $('#off-ogg-in').value = o.oggetto;
      $('#off-intro').value = o.intro; $('#off-chiusa').value = o.chiusa;
      const sel = incSel();
      const nomeSrv = k => (srvList().find(z => z.key === k) || {}).label || k;
      $('#off-incl').innerHTML = S.inclusioniDi(st).map(x => { const att = incAttiva(x); return `<label class="off-inc${att ? '' : ' off-dis'}"${x.servizio && !att ? ` title="Si attiva spuntando il servizio ${esc(nomeSrv(x.servizio))} come incluso"` : ''}><input type="checkbox" data-inc="${esc(x.id)}" ${sel.includes(x.id) && att ? 'checked' : ''} ${att ? '' : 'disabled'}><span>${esc((o.lingua === 'en' ? x.en : x.it) || x.it || x.en)}${x.servizio ? ` <em class="off-link">· ${esc(nomeSrv(x.servizio))}</em>` : ''}</span></label>`; }).join('');
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

    $('#off-tar').addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (!b) return; o.tariff = b.dataset.t; o.idx = 0; o.prezzi = {}; $$('#off-tar button').forEach(x => x.classList.toggle('on', x === b)); drawPer(); drawList(); drawTexts(); save(); });
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
    $('#off-st-del').addEventListener('click', () => { if (!confirm(`Eliminare lo stile "${o.stile.nome}"?`)) return; salvaStili(stiliSalvati().filter(y => y.id !== o.stile.id)).then(() => { o.stile = Object.assign({}, stili().find(x => x.id === o.stile.id) || STILI_BASE[0]); drawStile(); save(); toast('Stile eliminato'); }, errSt); });
    $('#off-pers-t').addEventListener('click', () => { o.persOpen = !o.persOpen; $('#off-pers').hidden = !o.persOpen; $('#off-pers-t').setAttribute('aria-expanded', o.persOpen ? 'true' : 'false'); saveUI(); });
    schedPrev();
    $('#off-ftog').addEventListener('click', () => { o.fOpen = !o.fOpen; $('#off-filters').hidden = !o.fOpen; $('#off-ftog').setAttribute('aria-expanded', o.fOpen ? 'true' : 'false'); save(); });
    [['off-f-loc', 'loc'], ['off-f-fav', 'fav'], ['off-f-osp', 'osp'], ['off-f-cam', 'cam'], ['off-f-da', 'da'], ['off-f-a', 'a']].forEach(([id, k]) => $('#' + id).addEventListener('input', e => { o.f[k] = e.target.value.trim(); drawList(); save(); }));
    $('#off-f-pisc').addEventListener('change', e => { o.f.pisc = e.target.checked; drawList(); save(); });
    $('#off-f-reset').addEventListener('click', () => { o.f = {}; ['off-f-loc', 'off-f-fav', 'off-f-osp', 'off-f-cam', 'off-f-da', 'off-f-a'].forEach(id => { $('#' + id).value = ''; }); $('#off-f-pisc').checked = false; drawList(); save(); });
    $('#off-q').addEventListener('input', e => { o.q = e.target.value; drawList(); save(); });
    $('#off-free').addEventListener('change', e => { o.soloLibere = e.target.checked; drawList(); save(); });
    $('#off-list').addEventListener('change', e => {
      const cb = e.target.closest('[data-pick]'); if (cb) { const id = cb.dataset.pick; o.ville = o.ville.filter(x => x !== id); if (cb.checked) o.ville.push(id); drawList(); drawTexts(); save(); }
    });
    $('#off-list').addEventListener('input', e => { const i = e.target.closest('[data-price]'); if (i) { o.prezzi[i.dataset.price] = i.value; save(); } const n = e.target.closest('[data-nota]'); if (n) { o.note[n.dataset.nota] = n.value; save(); } });
    drawSrv();
    $('#off-srv').addEventListener('change', e => { const c = e.target.closest('[data-son]'); if (!c) return; const k = c.closest('[data-ok]').dataset.ok; o.srv[k] = Object.assign(srvDi(k), o.srv[k], { on: c.checked }); drawSrv(); drawTexts(); save(); });
    $('#off-srv').addEventListener('click', e => { const bt = e.target.closest('[data-smode] button'); if (!bt || bt.disabled) return; const k = bt.closest('[data-ok]').dataset.ok; const cur = Object.assign(srvDi(k), o.srv[k]); delete cur.incluso; o.srv[k] = Object.assign(cur, { modo: bt.dataset.m }); drawSrv(); drawTexts(); save(); });
    $('#off-srv').addEventListener('input', e => { if (!e.target.matches('[data-sprz]')) return; const k = e.target.closest('[data-ok]').dataset.ok; o.srv[k] = Object.assign(srvDi(k), o.srv[k], { prezzo: e.target.value }); drawRiep(); save(); });
    $('#off-incl').addEventListener('change', e => { const c = e.target.closest('[data-inc]'); if (!c) return; const sel = incSel().filter(x => x !== c.dataset.inc); if (c.checked) sel.push(c.dataset.inc); o.incSel = sel; save(); });
    $('#off-incx').addEventListener('input', e => { o.incExtra = e.target.value; save(); });
    $('#off-firma').addEventListener('input', e => { o.firma = e.target.value; save(); });
    $('#off-cli').addEventListener('input', e => { o.cliente = e.target.value; drawTexts(); save(); });
    $('#off-mail').addEventListener('input', e => { o.email = e.target.value.trim(); save(); });
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
      if (vis(v, 'seafront')) r.push([l.mare, v.seafront]);
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

    // mail: HTML con stili in linea e foto incorporate, copiato negli appunti per incollarlo in Gmail
    async function htmlMail() {
      const l = L();
      const P = (x, st) => `<p style="margin:0${st ? ';' + st : ''}">${x}</p>`, BR = '<p style="margin:0"><br></p>';
      const eur = n => new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0 }).format(n) + ' €';
      const tar = (S.TARIFFE.find(t => t.key === o.tariff) || {}).label || '';
      const tarEn = { settimanale: 'Weekly', bisettimanale: 'BiWeekly', mensile: 'Monthly', bimensile: 'Two-month' }[o.tariff] || tar;
      const base = baseP()[o.idx];
      const z = Object.assign({}, STILI_BASE[0], o.stile || {}); const acc = z.accento || '#000000', sep = !!z.separatori;
      const link = (u, t) => `<a href="${esc(u)}" target="_blank" style="color:${acc === '#000000' ? '#1155cc' : acc}${acc === '#000000' ? '' : ';text-decoration:none;border-bottom:1px solid ' + acc + '66'}">${t}</a>`;
      const TIT = t => z.titoli === 'maiuscoletto' ? P(`<span style="font-size:${Math.max(11, z.size - 3)}px;letter-spacing:2px;text-transform:uppercase;font-weight:bold;color:${acc}">${esc(t)}</span>`) : P(`<b><u>${esc(t)}</u></b>`);
      const HR = `<div style="border-top:1px solid ${acc === '#000000' ? '#cccccc' : acc + '55'};margin:14px 0;height:0;line-height:0;font-size:0">&nbsp;</div>`;
      let h = `<div style="font-family:${z.font};color:${z.testo};font-size:${z.size}px;line-height:1.55">`;
      h += o.intro.split('\n').map(t => P(esc(t) || '<br>')).join('') + BR;
      h += TIT(l.proposte) + (sep ? HR : BR);
      const mese = base ? new Date(S.parse(base.from)).toLocaleDateString(o.lingua === 'en' ? 'en-GB' : 'it-IT', { month: 'long', timeZone: 'UTC' }) : '';
      // come nell'esempio: dalla villa più cara, quelle su richiesta in fondo
      const ord = scelte().map(v => ({ v, pr: prezzoTot(v) })).sort((a, b) => (b.pr === null ? -1 : b.pr) - (a.pr === null ? -1 : a.pr));
      for (const { v } of ord) {
        const p = perOf(v); const pr = prezzoTot(v); const nota = (o.note[v.id] || '').trim();
        const nome = esc(v.name.replace(/^villa\s+/i, '').replace(/\b\w+/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase()));
        const titolo = `Villa ${nome}`;
        h += P(`<b${acc !== '#000000' ? ` style="color:${acc};font-size:${z.size + 2}px"` : ''}>${vis(v, 'linkSito') ? link(v.linkSito, titolo) : titolo}</b>${vis(v, 'codice') ? ` <b style="${acc !== '#000000' ? 'font-weight:normal;font-size:' + (z.size - 2) + 'px;letter-spacing:1px;color:' + z.testo : ''}">${esc(v.codice)}</b>` : ''}`);
        const vid = vis(v, 'vimeo') ? v.vimeo : vis(v, 'youtube') ? v.youtube : '';
        if (vid) h += P(`${esc(l.video)} ${link(vid, esc(l.qui))}${vis(v, 'psw') ? ' (psw: ' + esc(v.psw) + ')' : ''}`);
        const diverso = p && base && (p.from !== base.from || p.to !== base.to);
        const lab = (o.lingua === 'en' ? `${mese ? mese[0].toUpperCase() + mese.slice(1) + ' ' : ''}${tarEn} ${l.tariffa}` : `${l.tariffa} ${tar.toLowerCase()}${mese ? ' ' + mese : ''}`) + (diverso ? ' ' + rangeTxt(p, o.lingua) : '');
        h += P(`<b>${esc(lab)}:</b> ${pr === null ? esc(l.richiesta) : eur(pr)}${nota ? ' - ' + esc(nota) + ' -' : ''}`);
        const iv = inclSoloVilla(v); if (iv.length) h += P(`${esc(l.inclVilla)}: ${esc(iv.map(x => testiSrv(x.key).join(', ')).join('; '))}`);
        h += sep ? HR : BR;
      }
      const inc = incTesti();
      if (inc.length) h += TIT(l.inclusiTit) + `<ul style="margin:6px 0 12px;padding-left:22px">${inc.map(t => `<li>${esc(t)}</li>`).join('')}</ul>`;
      h += o.chiusa.split('\n').filter(t => t.trim()).map(t => P(esc(t))).join('');
      h += P(`<b><i>${esc(l.soggetta)}</i></b>`, acc !== '#000000' ? 'color:' + acc : '');
      h += P(esc(l.saluti) + ',', 'margin-top:8px') + (o.firma || FIRMA).split('\n').map((t, k) => P(k === 0 ? `<b>${esc(t)}</b>` : esc(t))).join('');
      return h + '</div>';
    }
    // ---- storico delle offerte ----
    let storico = [], aperte = {}, cercaSt = '';
    async function salvaStorico(tipo, html) {
      if (!store.saveOfferta) return;
      try {
        html = html || await htmlMail();
        const stato = JSON.parse(JSON.stringify(o)); ['tab', 'q', 'f', 'fOpen', 'persOpen', 'ultima'].forEach(k => delete stato[k]);
        const rec = { cliente: o.cliente.trim(), email: String(o.email || '').trim().toLowerCase(), lingua: o.lingua, oggetto: oggettoMail(), periodo: periodoTxt(), tariffa: o.tariff,
          ville: scelte().map(v => ({ id: v.id, name: v.name, prezzo: prezzoTot(v) })), html, stato, creatoDa: String(store.user || '').toLowerCase(), quando: new Date().toISOString() };
        // stessa offerta salvata poco fa (stesso testo): aggiorno quella invece di crearne un'altra
        const u = o.ultima; const firma = rec.html.length + '|' + rec.cliente + '|' + rec.email + '|' + rec.oggetto + '|' + rec.ville.map(v => v.id + v.prezzo).join(',');
        if (u && u.firma === firma && storico.some(x => x.id === u.id)) { const x = storico.find(y => y.id === u.id); rec.id = u.id; rec.tipi = Array.from(new Set((x.tipi || []).concat(tipo))); rec.quando = x.quando; }
        else rec.tipi = [tipo];
        const id = await store.saveOfferta(rec); o.ultima = { id, firma }; saveUI();
      } catch (err) { console.warn('storico offerte', err); toast(err && err.code === 'permission-denied' ? 'Offerta non salvata nello storico: bisogna pubblicare la nuova regola di Firestore' : 'Offerta non salvata nello storico'); }
    }
    const chiaveCli = x => x.email ? 'm:' + x.email : x.cliente ? 'n:' + x.cliente.trim().toLowerCase() : '-';
    const dataOra = iso => { try { const d = new Date(iso); return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }); } catch (_) { return ''; } };
    function drawStorico() {
      const box = $('#off-storico'); if (!box) return;
      $('#off-st-n').textContent = storico.length ? ` · ${storico.length}` : '';
      const q = cercaSt.trim().toLowerCase();
      const lista = storico.filter(x => !q || [x.cliente, x.email, x.oggetto, x.periodo].concat((x.ville || []).map(v => v.name)).join(' ').toLowerCase().includes(q));
      const gruppi = {}; lista.forEach(x => { const k = chiaveCli(x); (gruppi[k] = gruppi[k] || []).push(x); });
      const G = Object.entries(gruppi).map(([k, l]) => { l.sort((a, b) => String(b.quando).localeCompare(String(a.quando))); return { k, l, ultimo: l[0].quando }; }).sort((a, b) => String(b.ultimo).localeCompare(String(a.ultimo)));
      box.innerHTML = `<section class="card"><h2>Storico delle offerte</h2>
        <p class="note">Ogni offerta si salva da sola quando la copi per la mail o scarichi il Word, divisa per cliente (email, o nome se manca l'email). Da qui la rivedi, la ricopi o la riapri per modificarla.</p>
        <div class="off-tools"><input type="search" id="off-st-q" placeholder="Cerca cliente, email, villa o periodo" value="${esc(cercaSt)}"></div>
        ${G.length ? G.map(g => { const c = g.l.find(x => x.cliente) || g.l[0]; const em = g.l.find(x => x.email); const open = aperte[g.k] !== false;
          return `<details class="off-cli" data-g="${esc(g.k)}" ${open ? 'open' : ''}><summary><b>${esc(c.cliente || (em ? em.email : 'Senza cliente'))}</b>${em && c.cliente ? ` <span class="note">${esc(em.email)}</span>` : ''}<span class="note off-cli-n">${g.l.length} ${g.l.length === 1 ? 'offerta' : 'offerte'} · ultima ${esc(dataOra(g.ultimo))}</span></summary>
            ${g.l.map(x => `<div class="off-rec" data-rec="${esc(x.id)}">
              <div class="off-rec-h"><div><b>${esc(x.oggetto || x.periodo || '')}</b><small class="note">${esc(dataOra(x.quando))} · ${esc((x.tipi || []).map(t => t === 'word' ? 'Word' : 'Mail').join(' + '))} · ${esc(x.lingua === 'en' ? 'inglese' : 'italiano')}${x.creatoDa && x.creatoDa !== String(store.user || '').toLowerCase() ? ' · ' + esc(x.creatoDa) : ''}</small>
                <small class="off-rec-v">${(x.ville || []).map(v => `${esc(v.name)} <span class="note">${typeof v.prezzo === 'number' ? esc(S.money(v.prezzo)) : 'su richiesta'}</span>`).join(' · ')}</small></div>
                <div class="off-rec-b"><button type="button" class="btn small" data-act="vedi">${aperte['r' + x.id] ? 'Chiudi' : 'Vedi'}</button><button type="button" class="btn small" data-act="copia">Copia per email</button><button type="button" class="btn small" data-act="riapri">Riapri</button><button type="button" class="btn small danger" data-act="del">Elimina</button></div></div>
              ${aperte['r' + x.id] ? `<div class="off-prev off-rec-prev">${x.html || '<p class="note">Anteprima non disponibile.</p>'}</div>` : ''}</div>`).join('')}
          </details>`; }).join('') : `<p class="note">${storico.length ? 'Nessuna offerta corrisponde alla ricerca.' : 'Ancora nessuna offerta salvata: compariranno qui quando copi una mail o scarichi un Word.'}</p>`}
      </section>`;
      const qi = $('#off-st-q'); qi.oninput = () => { cercaSt = qi.value; const pos = qi.selectionStart; drawStorico(); const n = $('#off-st-q'); n.focus(); n.setSelectionRange(pos, pos); };
      $$('.off-cli', box).forEach(d => d.addEventListener('toggle', () => { aperte[d.dataset.g] = d.open; }));
    }
    $('#off-storico').addEventListener('click', async e => {
      const b = e.target.closest('[data-act]'); if (!b) return; const id = b.closest('[data-rec]').dataset.rec; const x = storico.find(y => y.id === id); if (!x) return;
      if (b.dataset.act === 'vedi') { aperte['r' + id] = !aperte['r' + id]; drawStorico(); }
      if (b.dataset.act === 'copia') { const txt = (() => { const d = document.createElement('div'); d.innerHTML = x.html || ''; return d.innerText; })();
        try { await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([x.html || ''], { type: 'text/html' }), 'text/plain': new Blob([txt], { type: 'text/plain' }) })]); toast('Offerta copiata: incollala in Gmail'); } catch (_) { toast('Il browser non ha permesso di copiare'); } }
      if (b.dataset.act === 'riapri') { if (!confirm("Riaprire questa offerta? L'offerta che stai preparando verrà sostituita.")) return;
        Object.keys(o).forEach(k => { if (!['tab', 'q', 'f', 'fOpen', 'persOpen'].includes(k)) delete o[k]; }); Object.assign(o, JSON.parse(JSON.stringify(x.stato || {})), { tab: 'nuova', ultima: null }); saveUI(); mount(main, ctx); }
      if (b.dataset.act === 'del') { if (!confirm(`Eliminare questa offerta dallo storico?`)) return; try { await store.deleteOfferta(id); toast('Offerta eliminata'); } catch (err) { toast('Errore: ' + (err && err.message || err)); } }
    });
    $('#off-tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (!b) return; o.tab = b.dataset.tab; $$('#off-tabs button').forEach(z => z.classList.toggle('on', z === b)); $('#off-storico').hidden = o.tab !== 'storico'; $('#off-editor').hidden = o.tab === 'storico'; saveUI(); window.scrollTo(0, 0); });
    if (store.listenOfferte) {
      if (window.__sdbOffOff) { try { window.__sdbOffOff(); } catch (_) {} }
      window.__sdbOffOff = store.listenOfferte(l => { storico = l; drawStorico(); }, err => { $('#off-storico').innerHTML = `<section class="card"><h2>Storico delle offerte</h2><div class="warn err">${err && err.code === 'permission-denied' ? 'Per lo storico bisogna pubblicare la nuova regola di Firestore (offerte).' : 'Errore: ' + esc(err && err.message || err)}</div></section>`; });
    } else $('#off-tabs [data-tab="storico"]').hidden = true;
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
    if ($('#off-bro')) $('#off-bro').addEventListener('change', e => { o.brochure = e.target.checked; save(); updBro(); });
    if ($('#off-bro-dl')) $('#off-bro-dl').addEventListener('click', async () => {
      if (!pronto()) return; const btn = $('#off-bro-dl'); btn.disabled = true;
      const n = await scaricaBro();
      msg(n ? `<div class="warn ok">${n} ${n === 1 ? 'brochure scaricata' : 'brochure scaricate'}: trascinale dalla cartella Download nella mail.</div>` : '<div class="warn err">Nessuna brochure per le ville scelte: caricale nella scheda di ogni villa.</div>');
      btn.disabled = false;
    });
    $('#off-gmail').addEventListener('click', () => {
      const u = `https://mail.google.com/mail/?view=cm&fs=1${o.email ? '&to=' + encodeURIComponent(o.email) : ''}&su=${encodeURIComponent(oggettoMail())}`;
      window.open(u, '_blank', 'noopener');
    });
  }

  window.SDBOfferte = { mount };
})();
