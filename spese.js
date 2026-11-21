/*
 * Pagina "Prenotazioni" (#prenotazioni, prima "Spese"): le prenotazioni della stagione come schede (stessa grafica
 * delle ville), dalle prossime alle passate, con vendita, acquisto previsto e spese reali (scontrini dell'app Scontrini).
 * Cliccando una scheda (#prenotazioni-<chiave>) si apre il riepilogo: valori, servizi e le singole spese, con
 * Nuova spesa, Stampa, Esporta. Le spese si modificano (con storico), si cancellano e hanno allegati (foto o PDF).
 * Esporta: Excel (CSV) o Word per prenotazione con lo zip delle foto. "scontrini_foto" e "scontrini_allegati"
 * si leggono solo quando servono.
 */
(function () {
  const fmtEuro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', useGrouping: 'always' });
  const euro = n => fmtEuro.format(Number(n) || 0);
  const daIso = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); };
  const dataIt = s => (s ? daIso(s).toLocaleDateString('it-IT') : '');
  const dataBreve = s => (s ? daIso(s).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
  const isoLocale = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  /* "Restituzione deposito sicurezza": importo salvato positivo ma mostrato in negativo; riduce quanto ricevuto dal cliente
     (deposito trattenuto), non è una spesa della villa: fuori da tutti i totali delle spese. "Danni villa" è una spesa normale. */
  const REST_DEP = 'Restituzione deposito sicurezza';
  const isRest = s => s && s.categoria === REST_DEP;
  // "Addebito proprietario": quanto si fa pagare al proprietario (es. spese a suo carico). È un'entrata, come una vendita:
  // fuori dalle spese, si somma al margine.
  const ADD_PROP = 'Addebito proprietario';
  const isAddP = s => s && s.categoria === ADD_PROP;
  const sommaAddP = l => l.reduce((t, s) => t + (isAddP(s) ? Number(s.importo) || 0 : 0), 0);
  // "Addebito cliente": quanto si fa pagare al cliente oltre il deposito di sicurezza. Entrata come una vendita (come Addebito proprietario).
  const ADD_CLI = 'Addebito cliente';
  const isAddC = s => s && s.categoria === ADD_CLI;
  const sommaAddC = l => l.reduce((t, s) => t + (isAddC(s) ? Number(s.importo) || 0 : 0), 0);
  const isEntr = s => isAddP(s) || isAddC(s);
  const sommaEntr = l => sommaAddP(l) + sommaAddC(l);
  const somma = l => l.reduce((t, s) => t + (isRest(s) || isEntr(s) ? 0 : Number(s.importo) || 0), 0);
  const sommaRest = l => l.reduce((t, s) => t + (isRest(s) ? Number(s.importo) || 0 : 0), 0);
  /* "Affitto proprietario": quanto pagato davvero al proprietario (affitto ed eventuali extra). È l'acquisto reale dell'affitto,
     da confrontare con l'acquisto concordato della prenotazione (previsto); non è un servizio incluso né aggiuntivo. */
  const AFF = 'Affitto proprietario';
  // commissione riconosciuta all'agenzia che ha portato il cliente: spesa normale della prenotazione, mai aggiuntiva
  const COMM = 'Commissione agenzia';
  const isAff = s => s && s.categoria === AFF;
  const sommaAff = l => l.reduce((t, s) => t + (isAff(s) ? Number(s.importo) || 0 : 0), 0);
  // casella "servizio aggiuntivo": Danni villa la spunta, Affitto proprietario la toglie e la nasconde
  /* Categorie (da ctx.catSpese, Impostazioni → Servizi e inclusioni): servizi = automatiche, legate al servizio offerto
     (scontrino.servizio = chiave; vale anche il solo nome uguale, per gli scontrini dell'app Scontrini); libere = modificabili,
     con agg = quelle "aggiuntive" (da addebitare al cliente); fisse = Affitto proprietario, Danni villa (aggiuntiva), Restituzione deposito.
     Offerta o aggiuntiva la decide la categoria (niente più casella); scontrino.aggiuntiva si salva comunque, per l'app Scontrini. */
  let CATS = { prop: [], servizi: [], libere: ['Pulizie', 'Manutenzione', 'Lavanderia', 'Spesa e forniture', 'Utenze', 'Giardino e piscina', 'Benvenuto ospiti', 'Commissioni e tasse', 'Altro'], fisse: [AFF, COMM, 'Danni villa', REST_DEP, ADD_CLI, ADD_PROP], agg: [] };
  let CTX = null;
  const setCats = ctx => { if (ctx && ctx.catSpese) { CATS = ctx.catSpese(); CTX = ctx; } };
  // spesa di un servizio che la prenotazione non ha: è un servizio aggiuntivo (richiesto durante il soggiorno)
  const srvNonOfferto = (srv, bk) => !!(srv && bk && CTX && CTX.hasSrv && !CTX.hasSrv(bk, srv.key));
  const bkDi = s => s && s.prenotazioneId && CTX ? CTX.data().bookings.find(b => b.id === s.prenotazioneId && b.villaId === s.villaId) : null;
  // servizio di una nota spese: per chiave (scontrino.servizio) o per nome; un servizio tolto dall'offerta (off) conta solo se la prenotazione
  // lo ha ancora spuntato, altrimenti la nota segue la voce delle note spese con lo stesso nome (il suo "a carico di")
  const srvDiSpesa = s => { if (!s) return null; const x = (s.servizio && CATS.servizi.find(z => z.key === s.servizio)) || CATS.servizi.find(z => z.label === s.categoria && !z.off) || CATS.servizi.find(z => z.label === s.categoria);
    if (!x) return null; if (x.off) { const bk = bkDi(s); if (!(bk && CTX && CTX.hasSrv && CTX.hasSrv(bk, x.key))) return null; } return x; };
  // voce a carico del cliente che c'era nell'offerta (inclusa o a parte): non è aggiuntiva. bookings.vociOfferta = voci dell'offerta
  // (prenotazione fatta da un'offerta); senza, valgono le voci Predefinite di Impostazioni. Senza prenotazione (spese generali): aggiuntiva.
  const voceInOff = (cat, bk) => { if (!bk) return false; if (Array.isArray(bk.vociOfferta)) return bk.vociOfferta.includes(cat);
    const st = CTX && CTX.data && CTX.data().settings; const S0 = window.SDB; return !!(st && S0 && S0.predefSet(st, S0.voceKey(cat), S0.tarDaNotti(S0.diffDays(bk.from, bk.to)))); };
  const aggPerCat = (cat, srv) => cat === 'Danni villa' ? true : cat === AFF || cat === COMM || cat === REST_DEP || cat === ADD_PROP || cat === ADD_CLI || srv ? false : CATS.agg.includes(cat) ? true : CATS.libere.includes(cat) ? false : null;
  const tipoCat = (cat, srv) => cat === ADD_CLI ? 'Addebitato al cliente oltre il deposito: è un\'entrata come una vendita, si somma al margine' : cat === ADD_PROP ? 'Addebitato al proprietario: è un\'entrata come una vendita, si somma al margine' : srv ? 'Servizio offerto: si confronta con l\'acquisto previsto del servizio' : cat === AFF ? 'Pagato al proprietario: si confronta con l\'acquisto concordato' : cat === REST_DEP ? 'Restituito al cliente: riduce il deposito, non è una spesa' : aggPerCat(cat) ? 'Servizio aggiuntivo: da addebitare al cliente o trattenere dal deposito' : 'Altra spesa della prenotazione: non addebitata al cliente (es. manutenzione)';
  // menu Categoria: <optgroup> servizi (value "srv:chiave") · altre · fisse; cur = scontrino in modifica
  const catOpts = (esc, cur, bk) => {
    const sv = srvDiSpesa(cur), sel = sv ? 'srv:' + sv.key : cur ? cur.categoria || '' : '';
    const op = (v, l) => `<option value="${esc(v)}" ${v === sel ? 'selected' : ''}>${esc(l)}</option>`;
    const servizi = CATS.servizi.filter(x => !x.off || (sv && sv.key === x.key));
    const noti = new Set(servizi.map(x => 'srv:' + x.key).concat(CATS.libere, CATS.fisse));
    return (sel && !noti.has(sel) ? op(sel, sel) : '')
      // due gruppi soltanto: spese non aggiuntive (servizi, altre categorie senza "Aggiuntiva", affitto, restituzione) e aggiuntive
      // i servizi seguono la prenotazione: spuntati nella prenotazione = non aggiuntivi, non spuntati = aggiuntivi
      + `<optgroup label="Non aggiuntive">${servizi.filter(x => !srvNonOfferto(x, bk)).map(x => op('srv:' + x.key, x.label)).join('')}${CATS.libere.filter(c => !CATS.agg.includes(c) || voceInOff(c, bk)).map(c => op(c, c)).join('')}${CATS.fisse.filter(c => aggPerCat(c) !== true).map(c => op(c, c)).join('')}</optgroup>`
      + `<optgroup label="Aggiuntive">${servizi.filter(x => srvNonOfferto(x, bk)).map(x => op('srv:' + x.key, x.label)).join('')}${CATS.libere.filter(c => CATS.agg.includes(c) && !voceInOff(c, bk)).map(c => op(c, c)).join('')}${CATS.fisse.filter(c => aggPerCat(c) === true).map(c => op(c, c)).join('')}</optgroup>`;
  };
  const catLetta = v => { if (String(v).startsWith('srv:')) { const k = v.slice(4); const x = CATS.servizi.find(y => y.key === k); return { categoria: x ? x.label : k, servizio: k }; } return { categoria: v, servizio: null }; };
  const catSalva = (v, bk) => { const c = catLetta(v); const sv = c.servizio ? (CATS.servizi.find(y => y.key === c.servizio) || { key: c.servizio }) : null; return Object.assign(c, { aggiuntiva: srvNonOfferto(sv, bk) || (aggPerCat(c.categoria, c.servizio) === true && !(!c.servizio && CATS.agg.includes(c.categoria) && voceInOff(c.categoria, bk))) }); };
  const catInfo = (sel, out, bk) => { const c = document.querySelector(sel), o = document.querySelector(out); if (!c || !o) return; const x = catLetta(c.value); const sv = x.servizio ? { key: x.servizio } : null; o.textContent = srvNonOfferto(sv, bk) ? 'Servizio non offerto in questa prenotazione: conta come servizio aggiuntivo, da addebitare al cliente' : !x.servizio && CATS.agg.includes(x.categoria) && voceInOff(x.categoria, bk) ? 'Voce compresa nell\'offerta di questa prenotazione: spesa offerta, non da addebitare al cliente' : tipoCat(x.categoria, x.servizio); };
  /* Spese aggiuntive: richieste durante il soggiorno, da addebitare al cliente o trattenere dal deposito (scontrino.aggiuntiva = true;
     se il campo manca, "Danni villa" conta come aggiuntiva). Le altre sono le spese dei servizi offerti nella prenotazione. */
  const isAgg = s => { if (!s || isRest(s) || isAff(s) || isEntr(s)) return false; const sv = srvDiSpesa(s); if (srvNonOfferto(sv, bkDi(s))) return true; if (!sv && CATS.agg.includes(s.categoria) && voceInOff(s.categoria, bkDi(s))) return false; const a = aggPerCat(s.categoria, sv); return a === null ? s.aggiuntiva === true : a; };
  const sommaAgg = l => l.reduce((t, s) => t + (isAgg(s) ? Number(s.importo) || 0 : 0), 0);
  // commissione dell'agenzia: nelle spese totali, ma né spesa offerta né aggiuntiva (riquadro a parte)
  const isComm = s => s && s.categoria === COMM;
  const sommaComm = l => l.reduce((t, s) => t + (isComm(s) ? Number(s.importo) || 0 : 0), 0);
  const sommaInc = l => somma(l) - sommaAgg(l) - sommaAff(l) - sommaComm(l);
  // deposito trattenuto: conta solo dopo aver registrato una "Restituzione deposito sicurezza" (anche di 0 €)
  const haRest = l => l.some(isRest);
  // metodo di pagamento della spesa (scontrini.pagamento): contanti, carta di credito, bonifico; null = non indicato
  // letture dei contatori: bookings.utenze = { acqua|gas|luce: { in, out, tariffa } }; consumo = out − in, importo = consumo × tariffa
  // tariffe predefinite in meta/settings.tariffeUtenze = { acqua, gas, luce } (€ per unità)
  const UTENZE = [['acqua', 'Acqua', 'm³'], ['gas', 'Gas', 'm³'], ['luce', 'Elettricità', 'kWh']];
  // numeri all'italiana: con la virgola i punti sono migliaia; senza virgola "12.345" = migliaia, "0.45" = decimali
  const numU = x => { if (typeof x === 'number') return isFinite(x) ? x : null; if (x === null || x === undefined) return null; let t = String(x).trim().replace(/\s/g, ''); if (!t) return null;
    if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.'); else if (/^[1-9]\d{0,2}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
    const n = Number(t); return isFinite(n) ? n : null; };
  const fmtU = n => n === null || n === undefined ? '' : String(Math.round(n * 1000) / 1000).replace('.', ',');
  const utCalc = (b, st) => { const u = (b && b.utenze) || {}, td = (st && st.tariffeUtenze) || {}; let tot = 0, ok = false;
    const righe = UTENZE.map(([k, l, un]) => { const r = u[k] || {}, i0 = numU(r.in), o0 = numU(r.out), t0 = numU(r.tariffa) !== null ? numU(r.tariffa) : numU(td[k]);
      const cons = i0 !== null && o0 !== null ? o0 - i0 : null, imp = cons !== null && t0 !== null ? Math.round(cons * t0 * 100) / 100 : null; if (imp !== null) { tot += imp; ok = true; }
      return { k, l, un, i0, o0, t0, tPred: numU(r.tariffa) === null && numU(td[k]) !== null, cons, imp }; });
    return { righe, tot: ok ? Math.round(tot * 100) / 100 : null }; };
  // servizio "Utenze" della prenotazione: spuntato come incluso nel prezzo = i consumi non si fanno pagare;
  // a parte o non spuntato = il totale delle utenze va nelle spese aggiuntive da addebitare al cliente
  const utSrv = () => (CATS.servizi || []).find(z => z.key === 'utenze' || String(z.label || '').trim().toLowerCase() === 'utenze') || null;
  const utIncluse = b => { const z = utSrv(); return !!(z && b && CTX && CTX.hasSrv && CTX.hasSrv(b, z.key) && CTX.srvDet && CTX.srvDet(b, z.key).incluso); };
  const utDa = b => { if (!b || !CTX) return 0; const t = utCalc(b, CTX.data().settings).tot; return t && !utIncluse(b) ? t : 0; };
  const PAGAMENTI = [['contanti', 'Contanti'], ['carta', 'Carta di credito'], ['bonifico', 'Bonifico']];
  const pagLabel = k => (PAGAMENTI.find(x => x[0] === k) || [])[1] || '';
  const pagSec = (pre, cur) => `<section class="dsec sec-pag"><h4>Metodo di pagamento</h4><div class="pag-opts">${PAGAMENTI.map(([k, l]) => `<label class="pag-opt"><input type="radio" name="${pre}-pag" value="${k}" ${cur === k ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div></section>`;
  const pagLetto = pre => { const r = document.querySelector(`input[name="${pre}-pag"]:checked`); return r ? r.value : null; };
  const trattDi = (dep, l) => haRest(l) ? (Number(dep) || 0) - sommaRest(l) : 0;
  // aggiuntive: quanto trattenere sul deposito, quanto restituire, quanto addebitare oltre il deposito
  const sulDeposito = (dep, agg) => { const d = Number(dep) || 0; const tr = Math.min(agg, d); return { tr, resta: d - tr, oltre: Math.max(0, agg - d) }; };
  // nota della riga "Totale da addebitare al cliente": la cifra si trattiene sul deposito
  const notaAdd = (dep, agg, euro) => { if (!dep) return 'nessun deposito di sicurezza: da far pagare al cliente'; const sd = sulDeposito(dep, agg);
    return sd.oltre ? `da trattenere sul deposito (${euro(sd.tr)}, tutto il deposito) + ${euro(sd.oltre)} da addebitare al cliente (nota "Addebito cliente")` : `da trattenere sul deposito: restituire ${euro(sd.resta)} dei ${euro(Number(dep))} ricevuti`; };
  // dentro le spese non aggiuntive: quelle legate a un servizio offerto e le altre spese della prenotazione (es. manutenzione)
  // spesa di un servizio che la prenotazione ha "a carico del proprietario": va nelle spese a carico del proprietario
  const srvProp = s => { const sv = srvDiSpesa(s), bk = sv ? bkDi(s) : null; return !!(sv && bk && CTX && CTX.hasSrv(bk, sv.key) && CTX.srvDet && CTX.srvDet(bk, sv.key).carico === 'proprietario'); };
  const isSrvOff = s => !isRest(s) && !isEntr(s) && !isAff(s) && !isAgg(s) && !!srvDiSpesa(s) && !srvProp(s);
  // spese a carico del proprietario (categorie con la spunta in Impostazioni): fuori dalle spese offerte, riquadro a parte
  const isPropS = s => !!s && !isRest(s) && !isEntr(s) && !isAff(s) && !isAgg(s) && ((!srvDiSpesa(s) && (CATS.prop || []).includes(s.categoria)) || srvProp(s));
  const sommaPropS = l => l.reduce((t, s) => t + (isPropS(s) ? Number(s.importo) || 0 : 0), 0);
  const isAltra = s => !isRest(s) && !isEntr(s) && !isAff(s) && !isComm(s) && !isAgg(s) && !srvDiSpesa(s) && !isPropS(s);
  const sommaSrv = l => l.reduce((t, s) => t + (isSrvOff(s) ? Number(s.importo) || 0 : 0), 0);
  const sommaAltre = l => sommaInc(l) - sommaSrv(l) - sommaPropS(l);
  const importoTxt = s => (isRest(s) ? '−' : isEntr(s) ? '+' : '') + euro(s.importo);
  function parseImporto(v) { v = String(v).trim().replace(/[€\s]/g, ''); if (v.includes(',')) v = v.replace(/\./g, '').replace(',', '.'); return Math.round(parseFloat(v) * 100) / 100; }
  const quando = x => { try { const d = typeof x === 'string' ? new Date(x) : x && x.toDate ? x.toDate() : null; return d ? d.toLocaleString('it-IT', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''; } catch (_) { return ''; } };

  const normPren = b => ({ id: b.id, villaId: b.villaId, cliente: (b.cliente || '').trim() || 'Prenotazione senza nome', from: b.from, to: b.to, status: b.status || '' });

  /* Collegamento scontrino → prenotazione, nell'ordine concordato:
     1) per ID (stessa villa, anche con date cambiate)            2) stessa villa + stesse date della copia
     3) la copia, segnata "non più in calendario"                  4) null = spese generali della villa */
  function trovaPren(s, bookings) {
    if (!s.prenotazioneId && !s.prenotazione) return null;
    const snap = s.prenotazione || null;
    // per ID (stessa villa): anche se le date della prenotazione sono state cambiate dopo lo scontrino
    const perId = s.prenotazioneId ? bookings.find(b => b.id === s.prenotazioneId && b.villaId === s.villaId) : null;
    if (perId) return normPren(perId);
    if (snap) {
      const perDate = bookings.find(b => b.villaId === s.villaId && b.from === snap.from && b.to === snap.to);
      if (perDate) return normPren(perDate);
      return { id: 'old:' + snap.from + '_' + snap.to, villaId: s.villaId, cliente: (snap.cliente || '').trim() || 'Prenotazione', from: snap.from, to: snap.to, nonInCalendario: true };
    }
    return null;
  }

  // totali usati da altre schermate (finestra prenotazione, scheda villa)
  function totaleBooking(list, bookings, bookingId) {
    const r = list.filter(s => { const p = trovaPren(s, bookings); return p && p.id === bookingId; });
    return { tot: somma(r), n: r.length };
  }
  function totaleVillaAnno(list, villaId, anno) {
    const r = list.filter(s => s.villaId === villaId && String(s.data || '').startsWith(String(anno)));
    return { tot: somma(r), n: r.length };
  }

  const ggMese = s => (s ? daIso(s).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }) : '');
  const nNotti = (a, b) => Math.round((daIso(b) - daIso(a)) / 864e5);
  const segno = n => (n > 0 ? '+' : n < 0 ? '−' : '') + euro(Math.abs(n));

  /* ---------------------------------------------------------------- finestre delle spese (nuova, modifica, allegati, esporta) */
  function azioni(ctx) {
    setCats(ctx);
    const { ui, esc, data, spese, store, $, $$, toast } = ctx;
    const X = window.SDBExport;
    const ville = () => data().villas.slice().sort((a, b) => String(a.name).localeCompare(String(b.name), 'it', { numeric: true }));
    const nomeVilla = id => { const v = data().villas.find(x => x.id === id); return v ? v.name : 'Villa ' + id; };
    const descPren = o => { const p = trovaPren(o, data().bookings); return nomeVilla(o.villaId) + ' · ' + (p ? p.cliente + ' ' + dataBreve(p.from) : 'spese generali'); };
    const nAll = s => (s.hasFoto ? 1 : 0) + Math.max(0, Number(s.allegati) || 0);
    const A = { ville, nomeVilla, nAll, righe: () => [] };

    // una riga di spesa (con la versione precedente barrata in rosso se è stata modificata)
    A.rigaSpesa = s => `<div class="sp-rc${Array.isArray(s.storico) && s.storico.length ? ' edited' : ''}">
      <span class="d">${dataIt(s.data)}</span>
      <div class="m">${esc(s.motivo || '—')}${isAgg(s) ? ' <span class="sp-agg">aggiuntiva</span>' : ''}<small>${esc(s.categoria || '')}${s.pagamento ? ' · ' + esc(pagLabel(s.pagamento)) : ''}${s.creatoDa ? ' · ' + esc(s.creatoDa) : ''}${s.modificatoDa ? ` · <span class="sp-mod">modificato da ${esc(s.modificatoDa)}${s.modificatoIl ? ' il ' + esc(quando(s.modificatoIl)) : ''}</span>` : ''}</small></div>
      <span class="amount${isRest(s) ? ' sp-neg' : ''}">${importoTxt(s)}</span>
      <div class="sp-act no-print">
        <button class="btn small" type="button" data-foto="${esc(s.id)}">${nAll(s) ? 'Allegati · ' + nAll(s) : '+ Allegato'}</button>
        <button class="btn small" type="button" data-edit="${esc(s.id)}">Modifica</button>
      </div>
      ${Array.isArray(s.storico) && s.storico.length ? `<div class="sp-old">${s.storico.slice().reverse().map(o => `<div class="sp-old-row"><s><span>${dataIt(o.data)}</span> ${esc(o.motivo || '—')} · ${esc(o.categoria || '')}${o.villaId !== s.villaId || (o.prenotazioneId || null) !== (s.prenotazioneId || null) ? ' · ' + esc(descPren(o)) : ''} · <b>${euro(o.importo)}</b></s><small>versione sostituita${o.sostituitoDa ? ' da ' + esc(o.sostituitoDa) : ''}${o.sostituitoIl ? ' il ' + esc(quando(o.sostituitoIl)) : ''}</small></div>`).join('')}</div>` : ''}
    </div>`;

    // modifica / cancellazione dello scontrino (lo storico conserva la versione precedente)
    A.openEdit = function (s) {
      const dlg = $('#dlg');
      const bookings = data().bookings;
      const cur = trovaPren(s, bookings);
      const prenOpts = vid => {
        const list = bookings.filter(x => x.villaId === vid).slice().sort((x, y) => String(y.from).localeCompare(String(x.from)));
        const curId = cur && !cur.nonInCalendario && s.villaId === vid ? cur.id : '';
        return `<option value="">Spese generali della villa</option>` + (cur && cur.nonInCalendario && s.villaId === vid ? `<option value="__keep" selected>${esc(cur.cliente)} · ${dataBreve(cur.from)} → ${dataBreve(cur.to)} (non più in calendario)</option>` : '')
          + list.map(x => `<option value="${esc(x.id)}" ${x.id === curId ? 'selected' : ''}>${esc((x.cliente || '').trim() || 'Senza nome')} · ${dataBreve(x.from)} → ${dataBreve(x.to)}</option>`).join('');
      };
      dlg.innerHTML = `<form class="dlg" id="ed-form" autocomplete="off">
        <h3>Modifica scontrino</h3>
        <p class="note">La versione attuale resta nello storico, barrata in rosso, dentro lo stesso scontrino.</p>
        <section class="dsec sec-cli"><h4>Importo e data</h4>
          <div class="row"><label class="field"><span>Importo €</span><input id="ed-imp" inputmode="decimal" value="${esc(String(s.importo ?? '').replace('.', ','))}" required></label>
          <label class="field"><span>Data</span><input type="date" id="ed-data" value="${esc(s.data || '')}" required></label></div></section>
        <section class="dsec sec-srv"><h4>Descrizione</h4>
          <label class="field"><span>Categoria</span><select id="ed-cat">${catOpts(esc, s, cur && !cur.nonInCalendario ? bookings.find(b => b.id === cur.id) : null)}</select><small class="note cat-tipo" id="ed-tipo"></small></label>
          <label class="field"><span>Motivo</span><input id="ed-mot" value="${esc(s.motivo || '')}"></label>
</section>
        ${pagSec('ed', s.pagamento || null)}
        <section class="dsec sec-date"><h4>Villa e prenotazione</h4>
          <label class="field"><span>Villa</span><select id="ed-villa">${ville().map(v => `<option value="${esc(v.id)}" ${v.id === s.villaId ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select></label>
          <label class="field"><span>Prenotazione</span><select id="ed-pren">${prenOpts(s.villaId)}</select></label></section>
        <div id="ed-msg"></div>
        <div class="foot">
          <button type="button" class="btn danger left" id="ed-del">Elimina</button>
          <button type="button" class="btn" id="ed-cancel">Annulla</button>
          <button type="submit" class="btn primary" id="ed-save">Salva</button>
        </div></form>`;
      const edBk = () => { const pv = $('#ed-pren').value; return pv === '__keep' ? null : pv ? bookings.find(x => x.id === pv) : null; };
      const edInfo = () => catInfo('#ed-cat', '#ed-tipo', edBk());
      const edMenu = () => { const c = catLetta($('#ed-cat').value); $('#ed-cat').innerHTML = catOpts(esc, c, edBk()); edInfo(); };
      $('#ed-cat').addEventListener('change', edInfo); $('#ed-pren').addEventListener('change', edMenu); edInfo();
      $('#ed-villa').addEventListener('change', e => { $('#ed-pren').innerHTML = prenOpts(e.target.value); });
      $('#ed-cancel').onclick = () => dlg.close();
      $('#ed-form').addEventListener('submit', async e => {
        e.preventDefault();
        const importo = parseImporto($('#ed-imp').value);
        if (!(importo > 0)) { $('#ed-msg').innerHTML = '<div class="warn err">Importo non valido.</div>'; return; }
        const villaId = $('#ed-villa').value, pv = $('#ed-pren').value;
        let prenotazioneId, prenotazione;
        if (pv === '__keep') { prenotazioneId = s.prenotazioneId || null; prenotazione = s.prenotazione || null; }
        else if (pv) { const bk = bookings.find(x => x.id === pv); prenotazioneId = pv; prenotazione = { cliente: (bk.cliente || '').trim() || 'Prenotazione senza nome', from: bk.from, to: bk.to }; }
        else { prenotazioneId = null; prenotazione = null; }
        const changes = Object.assign({ importo, data: $('#ed-data').value }, catSalva($('#ed-cat').value, prenotazioneId ? bookings.find(x => x.id === prenotazioneId) : null), { motivo: $('#ed-mot').value.trim(), villaId, prenotazioneId, prenotazione, pagamento: pagLetto('ed') });
        const prevFields = { importo: s.importo, data: s.data, categoria: s.categoria || '', motivo: s.motivo || '', villaId: s.villaId, prenotazioneId: s.prenotazioneId || null, prenotazione: s.prenotazione || null , aggiuntiva: isAgg(s), servizio: s.servizio || null, pagamento: s.pagamento || null };
        const same = Object.keys(changes).every(k => JSON.stringify(changes[k] ?? null) === JSON.stringify(prevFields[k] ?? null));
        if (same) { dlg.close(); return; }
        const previous = Object.assign({}, prevFields, { autore: s.modificatoDa || s.creatoDa || '', sostituitoDa: store.user || '', sostituitoIl: new Date().toISOString() });
        $('#ed-save').disabled = true;
        try { await store.updateScontrino(s.id, changes, previous); dlg.close(); toast('Scontrino modificato'); }
        catch (x) { $('#ed-save').disabled = false; $('#ed-msg').innerHTML = `<div class="warn err">Salvataggio non riuscito: ${esc(x.message || x)}</div>`; }
      });
      $('#ed-del').onclick = () => {
        $('#ed-msg').innerHTML = `<div class="confirm-bar"><div><b>Eliminare questo scontrino da ${euro(s.importo)}?</b> Sparisce anche dalle app Scontrini e Spese Ville${s.hasFoto ? ', insieme alla sua foto' : ''}. Non si può annullare.</div><button type="button" class="btn small danger solid" id="ed-del-ok">Elimina</button><button type="button" class="btn small" id="ed-del-no">Annulla</button></div>`;
        $('#ed-del-no').onclick = () => { $('#ed-msg').innerHTML = ''; };
        $('#ed-del-ok').onclick = async () => {
          try { await store.deleteScontrino(s.id, !!s.hasFoto); dlg.close(); toast('Scontrino eliminato'); }
          catch (x) { $('#ed-msg').innerHTML = `<div class="warn err">Eliminazione non riuscita: ${esc(x.message || x)}</div>`; }
        };
      };
      if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    };

    /* allegati: la foto principale (scontrini_foto, vista anche dall'app Scontrini) e gli altri allegati
       (scontrini_allegati). Si leggono solo quando si apre la finestra. */
    const MAXPDF = 700 * 1024;
    async function leggiFile(f) {
      if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
        if (f.size > MAXPDF) throw new Error(`${f.name}: il PDF supera 700 KB`);
        const dati = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('file non leggibile')); r.readAsDataURL(f); });
        return { nome: f.name, tipo: 'application/pdf', dati: String(dati).replace(/^data:[^;]*;/, 'data:application/pdf;') };
      }
      return { nome: f.name.replace(/\.[^.]+$/, '') + '.jpg', tipo: 'image/jpeg', dati: await ctx.compressImage(f, 1500, 750000) };
    }
    A.openAllegati = async function (id) {
      const dlg = $('#dlg'); const s = () => spese.list.find(x => x.id === id) || {};
      const p = trovaPren(s(), data().bookings);
      dlg.innerHTML = `<div class="dlg sp-photo">
        <h3>${euro(s().importo)} · ${dataIt(s().data)}</h3>
        <div class="note">${esc(nomeVilla(s().villaId))} · ${esc(p ? p.cliente : 'spesa generale')} · ${esc(s().motivo || '')}${s().creatoDa ? ' · inserito da ' + esc(s().creatoDa) : ''}</div>
        <div id="al-list" class="al-list"><p class="note">Caricamento allegati…</p></div>
        <div id="al-msg"></div>
        <div class="foot"><label class="btn left" for="al-file">+ Aggiungi allegato</label><input type="file" id="al-file" accept="image/*,application/pdf" multiple hidden>
          <button type="button" class="btn primary" id="ph-close">Chiudi</button></div></div>`;
      $('#ph-close').onclick = () => dlg.close();
      dlg.onclick = ev => { if (ev.target === dlg) dlg.close(); };
      if (!dlg.open) { if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', ''); }
      const draw = async () => {
        const box = $('#al-list'); if (!box) return;
        try {
          const items = [];
          if (s().hasFoto) { const img = await store.getFoto(id); if (img) items.push({ id: '', nome: 'Foto dello scontrino', tipo: 'image/jpeg', dati: img, principale: true }); }
          (await store.listAllegati(id)).forEach(a => items.push(a));
          if (!$('#al-list')) return;
          box.innerHTML = items.length ? items.map(a => `<figure class="al-item">${a.tipo === 'application/pdf' ? `<div class="al-pdf">PDF</div>` : `<img src="${a.dati}" alt="${esc(a.nome)}">`}
            <figcaption><span>${esc(a.nome || 'Allegato')}${a.principale ? '' : a.creatoDa ? `<small>aggiunto da ${esc(a.creatoDa)}</small>` : ''}</span>
              <a class="btn small" href="${a.dati}" download="${esc(X.nomeFile((a.nome || 'allegato').replace(/\.(jpg|pdf)$/i, '')) + (a.tipo === 'application/pdf' ? '.pdf' : '.jpg'))}">Scarica</a>
              ${a.principale ? '' : `<button type="button" class="btn small danger" data-aldel="${esc(a.id)}">Togli</button>`}</figcaption></figure>`).join('')
            : '<p class="note">Nessun allegato. Aggiungi una foto o un PDF.</p>';
        } catch (x) { box.innerHTML = `<p class="note">Errore: ${esc(x.message || x)}</p>`; }
      };
      draw();
      $('#al-list').addEventListener('click', async e => {
        const b = e.target.closest('[data-aldel]'); if (!b) return;
        b.disabled = true;
        try { await store.deleteAllegato(s(), b.dataset.aldel); toast('Allegato tolto'); draw(); } catch (x) { b.disabled = false; $('#al-msg').innerHTML = `<div class="warn err">${esc(x.message || x)}</div>`; }
      });
      $('#al-file').addEventListener('change', async e => {
        const files = [...e.target.files]; e.target.value = ''; if (!files.length) return;
        const m = $('#al-msg'); m.innerHTML = '<p class="note">Salvataggio…</p>';
        try {
          for (const f of files) { const a = await leggiFile(f); await store.addAllegato(Object.assign({}, s()), a); await new Promise(r => setTimeout(r, 250)); }
          m.innerHTML = ''; toast(files.length === 1 ? 'Allegato aggiunto' : files.length + ' allegati aggiunti'); draw();
        } catch (x) { m.innerHTML = `<div class="warn err">${esc(x.code === 'permission-denied' ? 'Le regole di Firestore non permettono ancora gli allegati: pubblica le regole aggiornate.' : x.message || x)}</div>`; draw(); }
      });
    };

    // nuova spesa: stessa struttura dell'app Scontrini (villa e prenotazione già scelte se si parte da una prenotazione)
    A.openNuova = function (villa0, pren0) {
      const dlg = $('#dlg'); const bookings = data().bookings;
      villa0 = villa0 || ui.prVilla || (ville()[0] || {}).id || '';
      const prenOpts = (vid, sel) => `<option value="">Spese generali della villa</option>` + bookings.filter(x => x.villaId === vid && !x._nd).sort((x, y) => String(y.from).localeCompare(String(x.from)))
        .map(x => `<option value="${esc(x.id)}" ${x.id === sel ? 'selected' : ''}>${esc((x.cliente || '').trim() || 'Senza nome')} · ${dataBreve(x.from)} → ${dataBreve(x.to)}</option>`).join('');
      let foto = null;
      dlg.innerHTML = `<form class="dlg" id="nw-form" autocomplete="off">
        <h3>Nuova spesa</h3>
        <section class="dsec sec-date"><h4>Villa e prenotazione</h4>
          <label class="field"><span>Villa</span><select id="nw-villa">${ville().map(v => `<option value="${esc(v.id)}" ${v.id === villa0 ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select></label>
          <label class="field"><span>Prenotazione</span><select id="nw-pren">${prenOpts(villa0, pren0 || '')}</select></label></section>
        <section class="dsec sec-cli"><h4>Importo e data</h4>
          <div class="row"><label class="field"><span>Importo €</span><input id="nw-imp" inputmode="decimal" required placeholder="0,00"></label>
          <label class="field"><span>Data</span><input type="date" id="nw-data" value="${isoLocale(new Date())}" required></label></div></section>
        <section class="dsec sec-srv"><h4>Descrizione</h4>
          <label class="field"><span>Categoria</span><select id="nw-cat">${catOpts(esc, null)}</select><small class="note cat-tipo" id="nw-tipo"></small></label>
          <label class="field"><span>Motivo</span><input id="nw-mot" placeholder="es. pulizia finale, lampadina…"></label></section>
        ${pagSec('nw', null)}
        <section class="dsec sec-st"><h4>Foto dello scontrino</h4>
          <div class="nw-photo"><img id="nw-prev" alt="" hidden><span class="note" id="nw-none">Nessuna foto</span>
            <label class="btn small" for="nw-cam">Scatta foto</label><input type="file" id="nw-cam" accept="image/*" capture="environment" hidden>
            <label class="btn small" for="nw-gal">Scegli file</label><input type="file" id="nw-gal" accept="image/*" hidden></div>
          <p class="note">Altri allegati, anche PDF, si aggiungono dopo con il pulsante Allegati.</p></section>
        <div id="nw-msg"></div>
        <div class="foot"><button type="button" class="btn" id="nw-cancel">Annulla</button><button type="submit" class="btn primary" id="nw-save">Salva</button></div></form>`;
      $('#nw-villa').addEventListener('change', e => { $('#nw-pren').innerHTML = prenOpts(e.target.value, ''); nwMenu(); });
      const nwBk = () => { const pv = $('#nw-pren').value; return pv ? bookings.find(x => x.id === pv) : null; };
      const nwInfo = () => catInfo('#nw-cat', '#nw-tipo', nwBk());
      const nwMenu = () => { const c = catLetta($('#nw-cat').value); $('#nw-cat').innerHTML = catOpts(esc, c, nwBk()); nwInfo(); };
      $('#nw-cat').addEventListener('change', nwInfo); $('#nw-pren').addEventListener('change', nwMenu); nwMenu();
      const onFile = async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; try { foto = await ctx.compressImage(f, 1500, 750000); const im = $('#nw-prev'); im.src = foto; im.hidden = false; $('#nw-none').hidden = true; } catch (_) { toast('Non riesco a leggere questa foto'); } };
      $('#nw-cam').addEventListener('change', onFile); $('#nw-gal').addEventListener('change', onFile);
      $('#nw-cancel').onclick = () => dlg.close();
      $('#nw-form').addEventListener('submit', async e => {
        e.preventDefault();
        const importo = parseImporto($('#nw-imp').value);
        if (!(importo > 0)) { $('#nw-msg').innerHTML = '<div class="warn err">Importo non valido.</div>'; return; }
        const pv = $('#nw-pren').value; const bk = pv ? bookings.find(x => x.id === pv) : null;
        const dati = { villaId: $('#nw-villa').value, prenotazioneId: bk ? bk.id : null, prenotazione: bk ? { cliente: (bk.cliente || '').trim() || 'Prenotazione senza nome', from: bk.from, to: bk.to } : null, data: $('#nw-data').value, importo, motivo: $('#nw-mot').value.trim(), pagamento: pagLetto('nw') }; Object.assign(dati, catSalva($('#nw-cat').value, bk));
        $('#nw-save').disabled = true;
        try { await store.addScontrino(dati, foto); dlg.close(); toast('Spesa salvata: la vede anche l\'app Scontrini'); }
        catch (x) { $('#nw-save').disabled = false; $('#nw-msg').innerHTML = `<div class="warn err">Salvataggio non riuscito: ${esc(x.message || x)}</div>`; }
      });
      if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
      setTimeout(() => $('#nw-imp') && $('#nw-imp').focus(), 50);
    };

    // CSV per Excel: separatore ";", BOM UTF-8, importi con la virgola
    function exportCsv(righe, nomeFile) {
      if (!righe.length) { toast('Niente da esportare'); return; }
      const cella = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
      const rows = [['Villa', 'Prenotazione', 'Check-in', 'Check-out', 'Data scontrino', 'Categoria', 'Tipo', 'Motivo', 'Pagamento', 'Importo', 'Inserito da', 'Allegati']];
      righe.forEach(({ s, villa, p }) => rows.push([villa, p ? p.cliente : 'Spese generali', p ? dataIt(p.from) : '', p ? dataIt(p.to) : '', dataIt(s.data), s.categoria || '', isRest(s) ? 'Restituzione deposito' : isAddP(s) ? 'Addebito proprietario (entrata)' : isAddC(s) ? 'Addebito cliente (entrata)' : isAff(s) ? 'Affitto proprietario' : isComm(s) ? 'Commissione agenzia' : isAgg(s) ? 'Servizio aggiuntivo' : isSrvOff(s) ? 'Servizio offerto' : isPropS(s) ? 'A carico del proprietario' : 'Altra spesa della prenotazione', s.motivo || '', pagLabel(s.pagamento), ((isRest(s) ? -1 : 1) * (Number(s.importo) || 0)).toFixed(2).replace('.', ','), s.creatoDa || '', nAll(s)]));
      const testo = '﻿' + rows.map(r => r.map(cella).join(';')).join('\r\n');
      X.scarica(nomeFile || `spese-ville_${isoLocale(new Date())}.csv`, new Blob([testo], { type: 'text/csv;charset=utf-8' }));
    }

    /* Word: un file per prenotazione (una villa alla volta) con la scheda prenotazione, le note spese e i totali;
       a parte uno zip con le foto e gli allegati di tutti gli scontrini esportati. */
    const speseDi = (villaId, pid, bookings) => spese.list.filter(s => { if (s.villaId !== villaId) return false; const p = trovaPren(s, bookings); return pid === '__gen' ? !p : p && p.id === pid; }).sort((x, y) => String(x.data).localeCompare(String(y.data)));
    const ctxMoney = n => euro(n).replace(/,00\s?€$/, ' €');
    function wordDoc(villaId, pid, bookings) {
      const l = speseDi(villaId, pid, bookings);
      const sc = pid !== '__gen' && ctx.schedaPren ? ctx.schedaPren(pid) : null;
      const old = !sc && pid !== '__gen' ? (l.map(s => trovaPren(s, bookings)).find(Boolean) || null) : null;
      const titolo = pid === '__gen' ? 'Spese generali della villa' : sc ? sc.cliente : old ? old.cliente : 'Prenotazione';
      const B = [{ h1: nomeVilla(villaId) + ' · ' + titolo }];
      if (sc) B.push({ p: `${dataIt(sc.from)} → ${dataIt(sc.to)}`, small: true }, { h2: 'Scheda prenotazione' }, { kv: sc.righe });
      else if (old) B.push({ p: `${dataIt(old.from)} → ${dataIt(old.to)} · prenotazione non più in calendario`, small: true });
      else B.push({ p: 'Spese non legate a una prenotazione', small: true });
      if (sc && sc.servizi.length) B.push({ h2: 'Servizi' }, { table: sc.acq ? { head: ['Servizio', 'Modalità', 'Acquisto', 'Vendita', 'Note'], widths: [2100, 1800, 1300, 1300, 3138], right: [2, 3], rows: sc.servizi } : { head: ['Servizio', 'Modalità', 'Vendita', 'Note'], widths: [2400, 2000, 1500, 3738], right: [2], rows: sc.servizi } });
      B.push({ h2: 'Note spese' });
      if (l.length) B.push({ table: { head: ['Data', 'Categoria', 'Motivo', 'Inserito da', 'All.', 'Importo'], widths: [1150, 1650, 2900, 2050, 600, 1288], right: [4, 5], rows: l.map(s => [dataIt(s.data), s.categoria || '', s.motivo || '', s.creatoDa || '', String(nAll(s) || ''), importoTxt(s)]), total: ['', '', '', 'Totale spese', '', euro(somma(l))] } });
      else B.push({ p: 'Nessuna nota spese.' });
      B.push({ h2: 'Totali' });
      const tot = [];
      if (sc) tot.push(['Totale vendita (affitto + servizi a parte)', sc.haPrezzo ? ctxMoney(sc.totVendita) : 'prezzo di vendita non inserito']);
      if (sc && sc.acq && sc.totAcquisto) tot.push(['Acquisto previsto (affitto + servizi a parte)', ctxMoney(sc.totAcquisto)]);
      if (sommaAff(l)) tot.push(['Affitto proprietario reale', euro(sommaAff(l))]);
      const bW = sc ? (ctx.data().bookings || []).find(b => b.id === pid) : null, utW = utDa(bW), aggW = sommaAgg(l) + utW;
      tot.push(['Spese reali servizi offerti', euro(sommaSrv(l))], ['Altre spese della prenotazione', euro(sommaAltre(l))], ['Commissione agenzia', euro(sommaComm(l))], ['Spese a carico del proprietario', euro(sommaPropS(l))], ['Spese reali servizi aggiuntivi' + (utW ? ' (con le utenze)' : ''), euro(aggW)], ['Acquisto reale (totale spese)', euro(somma(l) + utW)]);
      const depR = sc && typeof sc.deposito === 'number' ? sc.deposito : 0, restW = sommaRest(l);
      const trW = trattDi(depR, l);
      if (depR || restW) tot.push(['Deposito di sicurezza ricevuto', euro(depR)], ['Deposito restituito', haRest(l) ? '−' + euro(restW) : 'non ancora registrato'], ['Deposito trattenuto', haRest(l) ? euro(trW) : '—']);
      if (utW) tot.push(['di cui utenze (consumi, servizio non incluso)', euro(utW)]);
      if (aggW) tot.push(['Totale da addebitare al cliente (' + notaAdd(depR, aggW, euro) + ')', euro(aggW)]);
      if (sc && sc.haPrezzo) tot.push([trW ? 'Margine reale (vendita + deposito trattenuto − spese)' : 'Margine reale (vendita − spese)', ctxMoney(sc.totVendita + trW + sommaEntr(l) - somma(l) - utW)]);
      B.push({ kv: tot });
      B.push({ p: `Esportato il ${new Date().toLocaleString('it-IT')} da ${store.user || ''}. Foto e allegati sono nel file zip scaricato insieme.`, small: true });
      const nome = X.nomeFile(`Spese ${nomeVilla(villaId)} - ${titolo}${sc ? ' ' + sc.from : old ? ' ' + old.from : ''}`) + '.docx';
      return { nome, blob: new Blob([X.docx(B)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), spese: l, cartella: X.nomeFile(nomeVilla(villaId) + ' ' + titolo + (sc ? ' ' + sc.from : old ? ' ' + old.from : '')) };
    }
    async function zipAllegati(gruppi, onStep) {
      const entries = []; const used = new Set(); let n = 0; const tot = gruppi.reduce((t, g) => t + g.spese.length, 0);
      for (const g of gruppi) for (const s of g.spese) {
        n++; onStep(`Foto e allegati: scontrino ${n} di ${tot}…`);
        const base = `${g.cartella}/${s.data || 'senza-data'}_${(Number(s.importo) || 0).toFixed(2).replace('.', ',')}_${X.nomeFile(s.categoria || 'spesa')}`;
        const add = (u, ext) => { const b = X.dataUrlBytes(u); if (!b) return; let nm = base + '.' + ext, i = 2; while (used.has(nm)) nm = base + '_' + (i++) + '.' + ext; used.add(nm); entries.push({ name: nm, data: b.bytes }); };
        if (s.hasFoto) { try { const img = await store.getFoto(s.id); if (img) add(img, 'jpg'); } catch (_) {} }
        if (Number(s.allegati) > 0) { try { (await store.listAllegati(s.id)).forEach(a => add(a.dati, a.tipo === 'application/pdf' ? 'pdf' : 'jpg')); } catch (_) {} }
      }
      return entries;
    }
    // Esporta: pre = { villa, pid } dal riepilogo di una prenotazione (solo quella spuntata); senza pre: generale
    A.openExport = function (pre) {
      const dlg = $('#dlg'); const bookings = data().bookings;
      const righeX = A.righe();
      const villeCon = ville().filter(v => bookings.some(b => b.villaId === v.id && !b._nd) || spese.list.some(s => s.villaId === v.id));
      // tutte le spese di tutte le ville (senza filtri), con la prenotazione collegata come nell'elenco
      const righeTutte = () => spese.list.map(s => { const p = trovaPren(s, bookings);
        return { s, villa: (ville().find(v => v.id === s.villaId) || { name: 'Villa ' + s.villaId }).name, p: p ? { cliente: (p.cliente || '').trim() || 'Senza nome', from: p.from, to: p.to } : null }; })
        .sort((a, b) => a.villa.localeCompare(b.villa, 'it') || String(a.s.data || '').localeCompare(String(b.s.data || '')));
      let xTutte = false;
      let modo = 'word'; let villa = pre && pre.villa ? pre.villa : ui.prVilla && villeCon.some(v => v.id === ui.prVilla) ? ui.prVilla : (villeCon[0] || {}).id || '';
      const voci = vid => {
        const l = bookings.filter(b => b.villaId === vid && !b._nd).sort((x, y) => String(y.from).localeCompare(String(x.from))).map(b => ({ id: b.id, label: `${(b.cliente || '').trim() || 'Senza nome'} · ${dataBreve(b.from)} → ${dataBreve(b.to)}` }));
        const old = new Map(); spese.list.filter(s => s.villaId === vid).forEach(s => { const p = trovaPren(s, bookings); if (p && p.nonInCalendario && !old.has(p.id)) old.set(p.id, { id: p.id, label: `${p.cliente} · ${dataBreve(p.from)} → ${dataBreve(p.to)} (non più in calendario)` }); });
        const gen = spese.list.some(s => s.villaId === vid && !trovaPren(s, bookings)) ? [{ id: '__gen', label: 'Spese generali della villa' }] : [];
        return l.concat([...old.values()], gen).map(o => Object.assign(o, { spese: speseDi(vid, o.id, bookings) }));
      };
      const spunta = o => pre && pre.pid ? o.id === pre.pid : o.spese.length > 0;
      // "Tutte le ville": le voci di ogni villa, con id "villaId::id prenotazione"
      const vociDi = sel => sel === '__all' ? villeCon.flatMap(vv => voci(vv.id).map(o => Object.assign({}, o, { id: vv.id + '::' + o.id, label: vv.name + ' · ' + o.label }))) : voci(sel);
      const draw = () => {
        const v = vociDi(villa);
        dlg.innerHTML = `<div class="dlg" id="ex-dlg"><h3>Esporta${pre && pre.pid ? ' questa prenotazione' : ''}</h3>
          <div class="seg ex-seg"><button type="button" data-m="word" class="${modo === 'word' ? 'on' : ''}">Word per prenotazione</button><button type="button" data-m="xls" class="${modo === 'xls' ? 'on' : ''}">Excel – scontrini</button></div>
          ${modo === 'xls' ? (pre && pre.pid ? `<p class="note">Un file con gli scontrini di questa prenotazione: <b>${righeX.length}</b> ${righeX.length === 1 ? 'scontrino' : 'scontrini'}. Si apre con Excel.</p>`
            : `<div class="ex-list"><label class="flag"><input type="radio" name="ex-x" value="vis" ${xTutte ? '' : 'checked'}><span><b>Le spese mostrate</b><small>prenotazioni mostrate in questo momento (filtri attuali): ${righeX.length} ${righeX.length === 1 ? 'scontrino' : 'scontrini'}</small></span></label>
              <label class="flag"><input type="radio" name="ex-x" value="tutte" ${xTutte ? 'checked' : ''}><span><b>Tutte le spese di tutte le ville</b><small>senza filtri, comprese spese generali e prenotazioni non più in calendario: ${spese.list.length} ${spese.list.length === 1 ? 'scontrino' : 'scontrini'}</small></span></label></div>
              <p class="note">Un file che si apre con Excel.</p>`)
          : `<label class="field"><span>Villa</span><select id="ex-villa">${villeCon.length > 1 ? `<option value="__all" ${villa === '__all' ? 'selected' : ''}>Tutte le ville</option>` : ''}${villeCon.map(x => `<option value="${esc(x.id)}" ${x.id === villa ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
            <div class="ex-head"><span class="note">Un file Word per ogni prenotazione scelta: scheda prenotazione, note spese, vendita, acquisto previsto e reale.</span><button type="button" class="btn small" id="ex-all">Seleziona tutte</button></div>
            <div class="ex-list">${v.length ? v.map(o => `<label class="flag"><input type="checkbox" data-ex="${esc(o.id)}" ${spunta(o) ? 'checked' : ''}><span><b>${esc(o.label)}</b><small>${o.spese.length ? o.spese.length + (o.spese.length === 1 ? ' scontrino · ' : ' scontrini · ') + euro(somma(o.spese)) : 'nessuna nota spese'}</small></span></label>`).join('') : '<p class="note">Nessuna prenotazione per questa villa.</p>'}</div>
            <label class="flag"><input type="checkbox" id="ex-zip" checked><span><b>Scarica anche lo zip con foto e allegati</b><small>Un solo file zip, con una cartella per prenotazione.</small></span></label>`}
          <div id="ex-msg"></div>
          <div class="foot"><button type="button" class="btn" id="ex-close">Chiudi</button><button type="button" class="btn primary" id="ex-go">Scarica</button></div></div>`;
        $$('.ex-seg button', dlg).forEach(b => b.onclick = () => { modo = b.dataset.m; draw(); });
        $('#ex-close').onclick = () => dlg.close();
        $$('input[name="ex-x"]', dlg).forEach(r => r.onchange = () => { xTutte = r.value === 'tutte' && r.checked; });
        if ($('#ex-villa')) $('#ex-villa').onchange = e => { villa = e.target.value; pre = null; draw(); };
        if ($('#ex-all')) $('#ex-all').onclick = () => { const cbs = $$('[data-ex]', dlg); const all = cbs.every(c => c.checked); cbs.forEach(c => { c.checked = !all; }); };
        $('#ex-go').onclick = async () => {
          if (modo === 'xls') { if (xTutte && !(pre && pre.pid)) exportCsv(righeTutte(), `spese-tutte-le-ville_${isoLocale(new Date())}.csv`); else exportCsv(righeX); dlg.close(); return; }
          const ids = $$('[data-ex]', dlg).filter(c => c.checked).map(c => c.dataset.ex);
          if (!ids.length) { $('#ex-msg').innerHTML = '<div class="warn err">Scegli almeno una prenotazione.</div>'; return; }
          const go = $('#ex-go'); go.disabled = true; const step = t => { const m = $('#ex-msg'); if (m) m.innerHTML = `<p class="note">${esc(t)}</p>`; };
          try {
            const docs = ids.map(id => villa === '__all' ? wordDoc(id.split('::')[0], id.split('::').slice(1).join('::'), bookings) : wordDoc(villa, id, bookings));
            for (let i = 0; i < docs.length; i++) { step(`File Word ${i + 1} di ${docs.length}…`); X.scarica(docs[i].nome, docs[i].blob); await new Promise(r => setTimeout(r, 450)); }
            let nz = 0;
            if ($('#ex-zip') && $('#ex-zip').checked) {
              const entries = await zipAllegati(docs, step); nz = entries.length;
              if (nz) X.scarica(X.nomeFile(`Allegati ${villa === '__all' ? 'tutte le ville' : nomeVilla(villa)} ${isoLocale(new Date())}`) + '.zip', X.zip(entries));
            }
            step(`Scaricati ${docs.length} file Word${$('#ex-zip') && $('#ex-zip').checked ? (nz ? ` e lo zip con ${nz} ${nz === 1 ? 'allegato' : 'allegati'}` : '; nessuna foto o allegato da mettere nello zip') : ''}.`);
          } catch (x) { $('#ex-msg').innerHTML = `<div class="warn err">Esportazione non riuscita: ${esc(x.message || x)}</div>`; }
          go.disabled = false;
        };
      };
      draw();
      if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    };
    return A;
  }

  /* ---------------------------------------------------------------- dati della pagina
     Una voce per ogni prenotazione in calendario (anche senza spese), più le prenotazioni "non più in calendario"
     che hanno scontrini e, per villa, le spese generali. chiave: id prenotazione | old|villa|id | gen|villa */
  function voci(ctx) {
    const { data, spese } = ctx;
    const bks = data().bookings.filter(b => !b._nd);
    const conSpese = ctx.online && spese.ready;
    const per = new Map(), old = new Map(), gen = new Map();
    if (conSpese) spese.list.forEach(s => {
      const p = trovaPren(s, bks);
      if (!p) { (gen.get(s.villaId) || gen.set(s.villaId, []).get(s.villaId)).push(s); return; }
      const k = p.nonInCalendario ? 'old|' + s.villaId + '|' + p.id : p.id;
      if (p.nonInCalendario && !old.has(k)) old.set(k, p);
      (per.get(k) || per.set(k, []).get(k)).push(s);
    });
    const l = bks.map(b => ({ chiave: b.id, b, villaId: b.villaId, cliente: (b.cliente || '').trim() || 'Senza nome', from: b.from, to: b.to, spese: per.get(b.id) || [] }))
      .concat([...old.entries()].map(([k, p]) => ({ chiave: k, b: null, old: true, villaId: p.villaId, cliente: p.cliente, from: p.from, to: p.to, spese: per.get(k) || [] })));
    const generali = [...gen.entries()].map(([vid, sp]) => ({ chiave: 'gen|' + vid, b: null, gen: true, villaId: vid, cliente: 'Spese generali della villa', spese: sp }));
    l.concat(generali).forEach(x => x.spese.sort((a, b) => String(a.data).localeCompare(String(b.data))));
    return { l, generali, conSpese };
  }

  /* ---------------------------------------------------------------- pagina */
  function mount(main, ctx, sub) {
    const { ui, saveUI, esc, data, spese, store, $, $$ } = ctx;
    ctx.online = store.mode === 'online' && !!store.listenScontrini;
    const A = azioni(ctx);
    const villaDi = id => data().villas.find(v => v.id === id) || { id, name: 'Villa ' + id };
    const cover = id => (ctx.cover && ctx.cover(id)) || '';
    const media = (vid, extra) => { const v = villaDi(vid), th = cover(vid);
      return `<div class="vc-media">${th ? `<img src="${esc(th)}" alt="${esc(v.name)}" loading="lazy">` : `<div class="vc-ph"><span>${esc(String(v.name || '?').trim().charAt(0))}</span><small>Nessuna foto</small></div>`}${extra || ''}</div>`; };
    const pill = x => x.gen ? '<span class="pc-stato gen">Spese generali</span>' : x.old ? '<span class="pc-stato old">Non più in calendario</span>'
      : `<span class="pc-stato" style="background:${esc(ctx.bookingColor(x.b))};color:${ctx.S.inkFor(ctx.bookingColor(x.b))}">${esc(ctx.statoLabel(x.b.status))}</span>`;
    const val = x => x.b ? ctx.valori(x.b) : { vendita: null, acquisto: null };
    // affitto al proprietario reale (note "Affitto proprietario" di tutto il gruppo, inserite una volta sola) ripartito a mano:
    // root.ripartizioneReale = { idCollegata: euro }, la principale tiene il resto; vale solo con la ripartizione del previsto (v.quota)
    const affGrp = (V, g) => g.membri.reduce((t, m) => { const it = V.l.find(y => y.b && y.b.id === m.id); return t + (it ? sommaAff(it.spese) : 0); }, 0);
    const quotaReale = (V, x) => { if (!x.b || !ctx.gruppoAcq || !ctx.ripDi || !val(x).quota) return null; const g = ctx.gruppoAcq(x.b); if (!g) return null;
      return ctx.ripDi(g, g.root.ripartizioneReale, affGrp(V, g)).q[x.b.id]; };
    const ripMan = (g, k) => !!ctx.ripDi(g, g.root[k], 0).manuale;
    const affR = (V, x) => { const q = quotaReale(V, x); return q == null ? sommaAff(x.spese) : q; };
    // spese totali = spese − affitto delle sue note + quota reale dell'affitto + utenze da far pagare (spesa aggiuntiva se il servizio Utenze non è incluso)
    const spTot = (V, x) => somma(x.spese) - sommaAff(x.spese) + affR(V, x) + utDa(x.b);
    const aggTot = x => sommaAgg(x.spese) + utDa(x.b);
    const acq = ctx.canAcq();
    const vuoto = '<span class="pc-nd">—</span>';
    const root = document.createElement('div'); main.innerHTML = ''; main.appendChild(root); root.className = 'page';
    if (ctx.onThumbs) ctx.onThumbs(() => render());

    // azioni comuni (delegate sulla pagina)
    root.addEventListener('click', e => {
      const t = e.target;
      const ed = t.closest('[data-edit]'); if (ed) { const s = spese.list.find(x => x.id === ed.dataset.edit); if (s) A.openEdit(s); return; }
      const fo = t.closest('[data-foto]'); if (fo) { A.openAllegati(fo.dataset.foto); return; }
      const card = t.closest('[data-pk]'); if (!card) return;
      const k = card.dataset.pk, V0 = voci(ctx), it = V0.l.concat(V0.generali).find(x => x.chiave === k);
      const act = t.closest('[data-act]'); const a = act ? act.dataset.act : 'open';
      if (a === 'spesa' && it) { A.openNuova(it.villaId, it.b ? it.b.id : ''); return; }
      if (a === 'mod' && it && it.b) { ctx.openBooking({ id: it.b.id }); return; }
      location.hash = 'prenotazioni-' + encodeURIComponent(k);
    });
    root.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches && e.target.matches('.vcard[data-pk]')) e.target.click(); });

    const render = () => { if (!document.body.contains(root)) return; setCats(ctx); if (sub === 'verifica') verifica(); else if (sub) dettaglio(); else elenco(); };

    /* ---------- elenco delle prenotazioni ---------- */
    function elenco() {
      const V = voci(ctx); const oggi = isoLocale(new Date());
      const q = (ui.prQ || '').trim().toLowerCase(), vf = ui.prVilla || '', sf = ui.prStato || '';
      const filtra = x => (!vf || x.villaId === vf) && (!sf || (sf === '_old' ? x.old : x.b && x.b.status === sf)) && (!ui.prSoloSpese || x.spese.length)
        && (!q || `${x.cliente} ${villaDi(x.villaId).name} ${villaDi(x.villaId).location || ''}`.toLowerCase().includes(q));
      const lista = V.l.filter(filtra);
      const prossime = lista.filter(x => String(x.to) >= oggi).sort((a, b) => String(a.from).localeCompare(String(b.from)));
      const passate = lista.filter(x => String(x.to) < oggi).sort((a, b) => String(b.from).localeCompare(String(a.from)));
      const generali = V.generali.filter(x => (!vf || x.villaId === vf) && !sf && (!q || villaDi(x.villaId).name.toLowerCase().includes(q))).sort((a, b) => villaDi(a.villaId).name.localeCompare(villaDi(b.villaId).name, 'it'));
      A.righe = () => lista.concat(generali).flatMap(x => x.spese.map(s => ({ s, villa: villaDi(x.villaId).name, p: x.gen ? null : { cliente: x.cliente, from: x.from, to: x.to } })));
      const tot = { vendita: 0, acquisto: 0, spese: 0 };
      lista.forEach(x => { const v = val(x); tot.vendita += v.vendita || 0; tot.acquisto += v.acquisto || 0; tot.spese += spTot(V, x); });
      generali.forEach(x => { tot.spese += somma(x.spese); });
      const stati = ctx.stati();
      // vendita totale = vendita + deposito trattenuto (dopo la restituzione) + addebiti al cliente e al proprietario
      const totVend = x => { const v = val(x), dep = v.deposito, tr = haRest(x.spese) ? trattDi(dep, x.spese) : 0, extra = tr + sommaEntr(x.spese);
        return { tot: v.vendita == null && !extra ? null : (v.vendita || 0) + extra, extra }; };
      // stato del soggiorno: in arrivo, in corso, partiti, conteggi conclusi (partiti e niente più da chiudere)
      const daChiudere = x => { const v = val(x), dep = v.deposito, out = [];
        if (dep && !haRest(x.spese)) out.push('restituzione deposito');
        const agg = sommaAgg(x.spese) + utDa(x.b), oltre = dep ? sulDeposito(dep, agg).oltre : agg; if (oltre - sommaAddC(x.spese) > 0.5) out.push('addebito cliente');
        if (sommaPropS(x.spese) - sommaAddP(x.spese) > 0.5) out.push('addebito proprietario');
        if (acq && v.affAcq && !affR(V, x)) out.push('affitto proprietario');
        return out; };
      const soggHtml = x => { const f = x.from, t = x.to; if (!f || !t) return '';
        if (oggi < f) return '<span class="pc-sogg arr">In arrivo</span>';
        if (oggi < t) return '<span class="pc-sogg cor">Soggiorno in corso</span>';
        if (x.b && x.b.conteggiConclusi) return '<span class="pc-sogg fin">Conteggi conclusi</span>';
        if (!ctx.online || !V.conSpese) return '<span class="pc-sogg par">Partiti</span>';
        const dc = daChiudere(x);
        return dc.length ? `<span class="pc-sogg par" title="Da chiudere: ${esc(dc.join(', '))}">Partiti · da chiudere: ${esc(dc.join(', '))}</span>` : '<span class="pc-sogg par" title="Spunta &quot;Conteggi conclusi&quot; nella prenotazione">Partiti · tutto inserito, da segnare come conclusi</span>'; };
      const card = x => {
        const v = val(x), sp = spTot(V, x), villa = villaDi(x.villaId);
        return `<article class="vcard pcard${x.old ? ' is-old' : ''}${x.gen ? ' is-gen' : ''}" data-pk="${esc(x.chiave)}" tabindex="0">
          ${media(x.villaId, pill(x) + (villa.location ? `<span class="vc-badge">${esc(villa.location)}</span>` : ''))}
          <div class="vc-body">
            <h3 class="vc-name">${esc(villa.name)}</h3>
            <p class="vc-desc">${x.gen ? 'Spese non legate a una prenotazione' : esc(x.cliente)}</p>
            ${x.b && ctx.pagatiLiberi && ctx.pagatiLiberi(x.b) ? `<span class="pc-pag" title="Notti pagate al proprietario ma senza affitto">${ctx.pagatiLiberi(x.b)} ${ctx.pagatiLiberi(x.b) === 1 ? 'notte pagata libera' : 'notti pagate libere'}</span>` : ''}
            ${x.gen ? '' : `<div class="vc-stats2"><div><span>Arrivo</span><b>${esc(ggMese(x.from))}</b></div><div><span>Partenza</span><b>${esc(ggMese(x.to))}</b></div><div><span>Notti</span><b>${nNotti(x.from, x.to)}</b></div></div>`}
            <hr>
            ${x.b ? soggHtml(x) : ''}
            <div class="pc-val">
              ${!x.b ? '' : (() => { const t = totVend(x); return `<div><span>Vendita totale</span><b>${t.tot == null ? vuoto : euro(t.tot)}</b>${t.extra ? `<small>di cui addebiti e trattenute ${euro(t.extra)}</small>` : '<small>affitto + servizi</small>'}</div>`; })()}
              <div><span>Spese totali</span><b>${ctx.online ? (V.conSpese ? euro(sp) : '…') : vuoto}</b>${ctx.online && V.conSpese ? `<small>${aggTot(x) ? `di cui aggiuntive ${euro(aggTot(x))}` : `${x.spese.length} ${x.spese.length === 1 ? 'scontrino' : 'scontrini'}`}</small>` : ''}</div>
              ${!x.b || !ctx.online || !V.conSpese ? '' : (() => { const t = totVend(x); return t.tot == null ? '' : `<div><span>Margine</span><b class="${t.tot - sp < 0 ? 'pc-neg' : ''}">${euro(t.tot - sp)}</b><small>vendita totale − spese</small></div>`; })()}
            </div>
          </div>
          <footer class="vc-foot no-print">
            <button type="button" class="btn dark" data-act="open">Riepilogo ↗</button>
            ${ctx.online ? '<button type="button" class="btn" data-act="spesa">+ Spesa</button>' : ''}
            ${x.b && ctx.canEdit() ? '<button type="button" class="btn" data-act="mod">Modifica</button>' : ''}
          </footer>
        </article>`;
      };
      /* prenotazioni con acquisto unico dal proprietario: nello stesso riquadro, una scheda per prenotazione (vendita e spese separate) */
      const blocchi = l => { const out = [], fatti = new Set();
        l.forEach(x => { if (fatti.has(x.chiave)) return; const g0 = x.b && ctx.gruppoAcq ? ctx.gruppoAcq(x.b) : null;
          if (!g0) { out.push(card(x)); return; }
          const ids = g0.membri.map(m => m.id); const vis0 = l.filter(y => y.b && ids.includes(y.b.id)); vis0.forEach(y => fatti.add(y.chiave));
          const vr = ctx.valori(g0.root, true), ven = g0.membri.reduce((t, m) => t + (ctx.valori(m).vendita || 0), 0), spG = vis0.reduce((t, y) => t + somma(y.spese) + utDa(y.b), 0);
          out.push(`<div class="pr-group"><div class="pr-group-h"><b>Acquisto unico dal proprietario</b><span>${esc(villaDi(g0.root.villaId).name)} · ${g0.membri.length} prenotazioni · pagata ${esc(ggMese(g0.root.pagatoDal || g0.root.from))} → ${esc(ggMese(g0.root.pagatoAl || g0.root.to))}</span>
            <span class="pr-group-v">Vendita ${euro(ven)}${acq ? ` · Acquisto ${vr.acquisto == null ? '—' : euro(vr.acquisto)}` : ''}${ctx.online && V.conSpese ? ` · Spese ${euro(spG)}` : ''}</span></div>
            <div class="vcards">${vis0.map(card).join('')}</div></div>`); });
        return out.join(''); };
      const sez = (tit, l) => l.length ? `<section class="pr-sec"><h2 class="pr-h">${tit} <span>${l.length}</span></h2><div class="vcards">${blocchi(l)}</div></section>` : '';
      const celle = [['Prenotazioni', String(lista.length)], ['Vendita', euro(tot.vendita)]].concat(acq ? [['Acquisto previsto', euro(tot.acquisto)]] : [], ctx.online ? [['Spese reali', V.conSpese ? euro(tot.spese) : '…']] : []);
      root.innerHTML = `<div class="wrap">
        <div class="head"><div><h1>Prenotazioni</h1><div class="sub">Gli stessi periodi del calendario Disponibilità${ctx.online ? ' · vendita, acquisto previsto e spese reali (scontrini aggiornati in tempo reale)' : ' · le spese si vedono con i dati online'}</div></div>
          <div class="actions no-print">${ctx.canEdit() ? '<button class="btn primary" type="button" id="pr-book">+ Nuova prenotazione</button>' : ''}${ctx.online ? `<button class="btn${ctx.canEdit() ? '' : ' primary'}" type="button" id="pr-new">+ Nuova spesa</button>
            <button class="btn" type="button" id="pr-exp">Esporta spese</button>
            <button class="btn" type="button" id="pr-assign">Account e assegnazioni</button>` : ''}${ctx.online && acq ? '<a class="btn" href="#prenotazioni-verifica">Verifica di stagione</a>' : ''}</div></div>
        <div class="card sp-filters no-print">
          <label class="field sp-q"><span>Cerca</span><input type="search" id="pr-q" placeholder="Cliente, villa o zona" value="${esc(ui.prQ || '')}"></label>
          <label class="field"><span>Villa</span><select id="pr-villa"><option value="">Tutte le ville</option>${A.ville().map(v => `<option value="${esc(v.id)}" ${vf === v.id ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select></label>
          <label class="field"><span>Stato</span><select id="pr-stato"><option value="">Tutti gli stati</option>${stati.map(s => `<option value="${esc(s.key)}" ${sf === s.key ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}${ctx.online ? `<option value="_old" ${sf === '_old' ? 'selected' : ''}>Non più in calendario</option>` : ''}</select></label>
          ${ctx.online ? `<label class="flag pr-solo"><input type="checkbox" id="pr-solo" ${ui.prSoloSpese ? 'checked' : ''}><span><b>Solo con spese</b></span></label>` : ''}
        </div>
        ${spese.error ? `<div class="warn err">Non riesco a leggere gli scontrini: ${esc(spese.error.code === 'permission-denied' ? 'questo account non è autorizzato.' : spese.error.message || spese.error)}</div>` : ''}
        <div class="sp-summary" style="grid-template-columns:repeat(${celle.length},minmax(0,1fr))">${celle.map(([l, v]) => `<div><b>${v}</b><span>${l}</span></div>`).join('')}</div>
        ${sez('In corso e prossime', prossime)}${sez('Passate', passate)}${sez('Spese generali delle ville', generali)}
        ${!prossime.length && !passate.length && !generali.length ? `<div class="empty">${V.l.length ? 'Nessuna prenotazione per questi filtri.' : 'Nessuna prenotazione in calendario.'}</div>` : ''}
      </div>`;
      const set = (k, v) => { ui[k] = v; saveUI(); render(); };
      let t; $('#pr-q', root).addEventListener('input', e => { ui.prQ = e.target.value; saveUI(); clearTimeout(t); t = setTimeout(() => { const pos = e.target.selectionStart; render(); const n = $('#pr-q', root); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }, 150); });
      $('#pr-villa', root).onchange = e => set('prVilla', e.target.value);
      $('#pr-stato', root).onchange = e => set('prStato', e.target.value);
      if ($('#pr-solo', root)) $('#pr-solo', root).onchange = e => set('prSoloSpese', e.target.checked);
      if ($('#pr-new', root)) $('#pr-new', root).onclick = () => A.openNuova(vf, '');
      // stessa finestra del calendario Disponibilità: la prenotazione compare in tutte e due le pagine
      if ($('#pr-book', root)) $('#pr-book', root).onclick = () => ctx.nuovaPren(vf);
      if ($('#pr-exp', root)) $('#pr-exp', root).onclick = () => A.openExport(null);
      if ($('#pr-assign', root)) $('#pr-assign', root).onclick = () => openAssign(ctx);
    }

    /* ---------- verifica di stagione: acquisto previsto (Impostazioni) dei servizi e delle voci delle note spese
       a confronto con le note spese reali. Previsto di una prenotazione = acquisto predefinito × settimane (se settimanale),
       solo per le prenotazioni che hanno note di quella voce; le spese generali si mostrano a parte. Mai usato nelle spese. ---------- */
    function verifica() {
      const S = window.SDB, st = data().settings || {}, acqP = data().serviziAcquisto || {};
      if (!acq || !ctx.online) { root.innerHTML = '<div class="wrap"><a href="#prenotazioni" class="pr-back">← Tutte le prenotazioni</a><div class="card"><p class="note">La verifica di stagione è disponibile con i dati online e con l\'accesso ai prezzi di acquisto.</p></div></div>'; return; }
      const V = voci(ctx); if (!V.conSpese) { root.innerHTML = '<div class="wrap"><p class="note">Caricamento…</p></div>'; return; }
      const vf = ui.vsVilla || '', da = ui.vsDa || '', a0 = ui.vsA || '';
      const fisse = new Set(CATS.fisse);
      const keyDi = sp => { const sv = srvDiSpesa(sp); if (sv) return { k: sv.key, label: sv.label, voce: false }; const c = String(sp.categoria || '').trim(); if (!c || fisse.has(c)) return null; return { k: S.voceKey(c), label: c, voce: true, fuori: !CATS.libere.includes(c) }; };
      const R0 = new Map(); const riga = (k, label, voce, fuori) => { if (!R0.has(k)) R0.set(k, { k, label, voce, fuori, pren: 0, note: 0, reale: 0, prev: 0, realeP: 0, nPrev: 0, gen: 0 }); return R0.get(k); };
      CATS.servizi.filter(x => !x.off).forEach(x => { if (typeof acqP[x.key] === 'number') riga(x.key, x.label, false); });
      CATS.libere.forEach(c => { const k = S.voceKey(c); if (typeof acqP[k] === 'number') riga(k, c, true); });
      const inPer = x => (!da || String(x.from || '') >= da) && (!a0 || String(x.from || '') <= a0);
      V.l.filter(x => (!vf || x.villaId === vf) && inPer(x)).forEach(x => { const per = new Map();
        x.spese.forEach(sp => { const kd = keyDi(sp); if (!kd) return; const r = riga(kd.k, kd.label, kd.voce, kd.fuori); r.note++; per.set(kd.k, (per.get(kd.k) || 0) + (Number(sp.importo) || 0)); });
        const notti = x.from && x.to ? S.diffDays(x.from, x.to) : 0;
        per.forEach((tot, k) => { const r = R0.get(k); r.pren++; r.reale += tot; const pv0 = S.srvPrezzoV(st, k, typeof acqP[k] === 'number' ? acqP[k] : null, notti, { villa: villaDi(x.villaId), ospiti: x.b && x.b.ospiti, acq: acqP }); if (typeof pv0 === 'number') { r.prev += pv0; r.realeP += tot; r.nPrev++; } }); });
      if (!da && !a0) V.generali.filter(x => !vf || x.villaId === vf).forEach(x => x.spese.forEach(sp => { const kd = keyDi(sp); if (!kd) return; const r = riga(kd.k, kd.label, kd.voce, kd.fuori); r.note++; r.gen += Number(sp.importo) || 0; }));
      const righe = [...R0.values()].sort((p, q) => (p.voce - q.voce) || p.label.localeCompare(q.label, 'it'));
      const pctS = (r0, p0) => p0 ? ((r0 - p0) / p0 * 100) : null;
      const pctTxt = v => v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(1).replace('.', ',') + '%';
      const esito = v => v == null ? '' : Math.abs(v) <= 5 ? 'ok' : v > 0 ? 'oltre' : 'sotto';
      const unita = k => { const u = S.srvUnita(st, k); const b = u.giornaliero ? 'al giorno' : u.settimanale ? `a settimana${u.coeff !== 1 ? ' (dalla 2ª × ' + String(u.coeff).replace('.', ',') + ')' : ''}` : 'a soggiorno'; return S.isOre(st, k) ? b + ' · personale' : b; };
      const T = righe.reduce((t, r) => ({ reale: t.reale + r.reale, prev: t.prev + r.prev, realeP: t.realeP + r.realeP, gen: t.gen + r.gen }), { reale: 0, prev: 0, realeP: 0, gen: 0 });
      const ville = [...new Set(V.l.concat(V.generali).map(x => x.villaId))].map(villaDi).sort((p, q) => String(p.name).localeCompare(String(q.name), 'it', { numeric: true }));
      root.innerHTML = `<div class="wrap">
        <a href="#prenotazioni" class="pr-back no-print">← Tutte le prenotazioni</a>
        <div class="head"><div><h1>Verifica di stagione</h1><div class="sub">Acquisto previsto dei servizi e delle voci delle note spese (Impostazioni → Servizi e inclusioni) a confronto con le note spese reali. Il previsto di ogni prenotazione è l'acquisto predefinito (× settimane se il prezzo è settimanale), solo per le prenotazioni con note di quella voce.</div></div>
          <div class="actions no-print"><button class="btn" type="button" id="vs-csv">Scarica Excel</button><button class="btn" type="button" onclick="window.print()">Stampa</button></div></div>
        <div class="card sp-filters no-print">
          <label class="field"><span>Villa</span><select id="vs-villa"><option value="">Tutte le ville</option>${ville.map(v => `<option value="${esc(v.id)}" ${vf === v.id ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select></label>
          <label class="field"><span>Arrivo dal</span><input type="date" id="vs-da" value="${esc(da)}"></label>
          <label class="field"><span>al</span><input type="date" id="vs-a" value="${esc(a0)}"></label>
        </div>
        <div class="sp-summary" style="grid-template-columns:repeat(4,minmax(0,1fr))">
          <div><b>${euro(T.prev)}</b><span>Acquisto previsto</span></div><div><b>${euro(T.realeP)}</b><span>Reale (voci con previsto)</span></div>
          <div><b>${T.prev ? (T.realeP - T.prev >= 0 ? '+' : '') + euro(T.realeP - T.prev) : '—'}</b><span>Differenza ${pctTxt(pctS(T.realeP, T.prev))}</span></div><div><b>${euro(T.reale + T.gen)}</b><span>Tutte le note di queste voci</span></div></div>
        ${righe.length ? `<div class="card"><div class="tbl-wrap"><table class="prices vs-tbl"><thead><tr><th>Voce</th><th>Prezzo</th><th style="text-align:right">Acquisto previsto</th><th style="text-align:right">Prenot.</th><th style="text-align:right">Note</th><th style="text-align:right">Previsto</th><th style="text-align:right">Reale</th><th style="text-align:right">Differenza</th><th style="text-align:right">Scostamento</th><th style="text-align:right">Media reale per prenot.</th><th style="text-align:right">Spese generali</th></tr></thead><tbody>
          ${righe.map(r => { const ap = acqP[r.k], d = r.nPrev ? r.realeP - r.prev : null, pc = r.nPrev ? pctS(r.realeP, r.prev) : null, es = esito(pc);
            return `<tr><td><b>${esc(r.label)}</b> <small class="note">${r.voce ? (r.fuori ? 'voce non più in elenco' : 'voce delle note spese') : 'servizio'}</small></td><td class="note">${esc(unita(r.k))}</td>
              <td style="text-align:right">${typeof ap === 'number' ? euro(ap) : '<span class="note">—</span>'}</td><td style="text-align:right">${r.pren}</td><td style="text-align:right">${r.note}</td>
              <td style="text-align:right">${r.nPrev ? euro(r.prev) : '—'}</td><td style="text-align:right">${euro(r.reale)}</td>
              <td style="text-align:right">${d == null ? '—' : (d >= 0 ? '+' : '') + euro(d)}</td><td style="text-align:right">${pc == null ? '<span class="note">senza previsto</span>' : `<span class="chk ${es === 'oltre' ? 'chk-bad' : es === 'ok' ? 'chk-ok' : 'chk-warn'} vs-chip">${pctTxt(pc)}</span>`}</td>
              <td style="text-align:right">${r.pren ? euro(r.reale / r.pren) : '—'}</td><td style="text-align:right">${r.gen ? euro(r.gen) : '—'}</td></tr>`; }).join('')}
          </tbody></table></div><p class="note">Scostamento entro ±5% = in linea. Le note "non più in calendario" contano se rientrano nei filtri; le spese generali (senza prenotazione) si vedono a parte e solo senza filtro di date.</p></div>`
          : '<div class="empty">Nessuna nota spese e nessun acquisto previsto per questi filtri.</div>'}
      </div>`;
      const set = (k, v) => { ui[k] = v; saveUI(); render(); };
      $('#vs-villa', root).onchange = e => set('vsVilla', e.target.value);
      $('#vs-da', root).onchange = e => set('vsDa', e.target.value);
      $('#vs-a', root).onchange = e => set('vsA', e.target.value);
      $('#vs-csv', root).onclick = () => { const cella = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`, n = v => v == null ? '' : v.toFixed(2).replace('.', ',');
        const rows = [['Voce', 'Tipo', 'Prezzo', 'Acquisto previsto', 'Prenotazioni', 'Note', 'Previsto', 'Reale', 'Differenza', 'Scostamento %', 'Media reale per prenotazione', 'Spese generali']];
        righe.forEach(r => { const ap = acqP[r.k]; rows.push([r.label, r.voce ? 'Voce delle note spese' : 'Servizio', unita(r.k), typeof ap === 'number' ? n(ap) : '', r.pren, r.note, r.nPrev ? n(r.prev) : '', n(r.reale), r.nPrev ? n(r.realeP - r.prev) : '', r.nPrev && r.prev ? n(pctS(r.realeP, r.prev)) : '', r.pren ? n(r.reale / r.pren) : '', r.gen ? n(r.gen) : '']); });
        window.SDBExport.scarica(`verifica-stagione_${isoLocale(new Date())}.csv`, new Blob(['\ufeff' + rows.map(r => r.map(cella).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' })); };
    }

    /* ---------- riepilogo di una prenotazione ---------- */
    function dettaglio() {
      const V = voci(ctx); const k = sub;
      const x = V.l.concat(V.generali).find(y => y.chiave === k) || (V.conSpese || !ctx.online ? null : 'attesa');
      if (x === 'attesa') { root.innerHTML = '<div class="wrap"><p class="note">Caricamento…</p></div>'; return; }
      if (!x) { root.innerHTML = `<div class="wrap"><a href="#prenotazioni" class="pr-back">← Tutte le prenotazioni</a><div class="card"><p class="note">Questa prenotazione non c'è più (cancellata o spostata).</p></div></div>`; return; }
      const villa = villaDi(x.villaId), v = val(x), sp = spTot(V, x);
      // deposito di sicurezza: ricevuto (nella prenotazione) − restituito (note spese "Restituzione deposito sicurezza")
      const dep = v.deposito, rest = sommaRest(x.spese), haDep = dep != null || rest > 0, depChiuso = haRest(x.spese), tratt = trattDi(dep, x.spese);
      const cella = (l, val0, nota, cls) => `<div class="pr-cell${cls ? ' ' + cls : ''}"><span>${l}</span><b>${val0}</b>${nota ? `<small>${nota}</small>` : ''}</div>`;
      let grp = x.b && ctx.gruppoAcq ? ctx.gruppoAcq(x.b) : null;
      // riquadro del gruppo: ogni prenotazione con vendita e spese, l'acquisto contato una volta sola, margini del gruppo
      let grpHtml = '';
      if (grp) {
        const righeG = grp.membri.map(m => { const it = V.l.find(y => y.b && y.b.id === m.id); const vm = ctx.valori(m), sm = it ? somma(it.spese) : 0, dm = it ? sommaRest(it.spese) : 0;
          return { m, vm, sm, si: it ? sommaInc(it.spese) : 0, sa: it ? sommaAgg(it.spese) : 0, tr: trattDi(m.deposito, it ? it.spese : []) }; });
        const tsi = righeG.reduce((t, r) => t + r.si, 0), tsa = righeG.reduce((t, r) => t + r.sa, 0);
        const tv = righeG.reduce((t, r) => t + (r.vm.vendita || 0), 0), ts = righeG.reduce((t, r) => t + r.sm, 0), tt = righeG.reduce((t, r) => t + r.tr, 0);
        const ta = ctx.valori(grp.root, true).acquisto, bil = !!v.quota, totAff = typeof grp.root.prezzoAcquisto === 'number' ? grp.root.prezzoAcquisto : null;
        // ripartizione manuale dell'affitto al proprietario tra le prenotazioni del gruppo (la principale tiene il resto)
        const bilHtml = () => { const totRe = affGrp(V, grp), manP = ripMan(grp, 'ripartizione'), manR = ripMan(grp, 'ripartizioneReale'), rip = manP ? grp.root.ripartizione : {}, ripR = manR ? grp.root.ripartizioneReale : {}, autoP = ctx.ripDi(grp, null, totAff || 0).q, autoR = ctx.ripDi(grp, null, totRe).q;
          const righe = grp.membri.map(m => { const nt = nNotti(m.from, m.to), root0 = m.id === grp.root.id;
            return `<tr><td>${esc((m.cliente || '').trim() || 'Senza nome')}${root0 ? ' <small class="note">(principale: il resto)</small>' : ''}</td><td>${esc(dataBreve(m.from))} → ${esc(dataBreve(m.to))}</td><td class="r">${nt}</td>
              <td class="r">${root0 ? `<b id="bil-resto">—</b>` : `<input type="number" step="0.01" min="0" class="bil-in" data-id="${esc(m.id)}" data-notti="${nt}" value="${typeof rip[m.id] === 'number' ? rip[m.id] : ''}" placeholder="${autoP[m.id]}" style="width:120px;text-align:right">`}</td>
              <td class="r">${root0 ? `<b id="bil-resto-re">—</b>` : `<input type="number" step="0.01" min="0" class="bil-re" data-id="${esc(m.id)}" data-notti="${nt}" value="${typeof ripR[m.id] === 'number' ? ripR[m.id] : ''}" placeholder="${autoR[m.id]}" style="width:120px;text-align:right">`}</td></tr>`; }).join('');
          return `<dialog id="dlg-bil" class="dlg-bil"><div class="dlg"><h3>Bilancia l'affitto tra le prenotazioni</h3><p class="note"><b>${manP ? 'Previsto a mano' : 'Previsto per notti'} · ${manR ? 'pagato a mano' : 'pagato per notti'}</b></p>
            <p class="note">Finché non lo bilanci, l'affitto si divide in proporzione alle notti (valori in grigio). Scrivi quanto dell'affitto al proprietario (${totAff == null ? 'acquisto concordato non inserito' : euro(totAff)}) va a ogni prenotazione collegata: la principale tiene il resto. Con la ripartizione, ogni prenotazione ha il suo acquisto previsto, il suo margine e i quattro riquadri.<br>Colonna <b>Pagato (reale)</b>: le note "Affitto proprietario" di tutto il gruppo (${euro(totRe)}, inserite una volta sola su una qualsiasi delle prenotazioni) divise a mano allo stesso modo, indipendenti dal previsto: così ogni prenotazione ha il suo previsto e il suo reale.</p>
            <div class="tbl-wrap"><table class="prices"><thead><tr><th>Prenotazione</th><th>Date</th><th class="r">Notti</th><th class="r">Affitto previsto</th><th class="r">Pagato (reale)</th></tr></thead><tbody>${righe}</tbody>
            <tfoot><tr><td colspan="3"><b>Totale</b></td><td class="r"><b>${totAff == null ? '—' : euro(totAff)}</b></td><td class="r"><b>${euro(totRe)}</b></td></tr></tfoot></table></div>
            <p class="note" id="bil-msg"></p>
            <div class="actions" style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" type="button" id="bil-notti">Dividi per notti</button><button class="btn primary" type="button" id="bil-save">Salva la ripartizione</button>${(manP || manR) ? '<button class="btn" type="button" id="bil-del">Togli la ripartizione</button>' : ''}<button class="btn" type="button" id="bil-close" style="margin-left:auto">Chiudi</button></div></div></dialog>`; };
        grpHtml = `<div class="card pr-grp"><h2>Acquisto unico dal proprietario</h2>
          <p class="note">Pagata al proprietario ${esc(dataBreve(grp.root.pagatoDal || grp.root.from))} → ${esc(dataBreve(grp.root.pagatoAl || grp.root.to))}. L'acquisto si conta una volta sola; vendita e spese restano di ogni prenotazione.</p>
          <div class="tbl-wrap"><table class="prices"><thead><tr><th>Prenotazione</th><th>Date</th><th class="r">Vendita</th>${ctx.online ? '<th class="r">Spese reali offerti e altre</th><th class="r">Spese reali servizi aggiuntivi</th>' : ''}</tr></thead><tbody>
          ${righeG.map(r => `<tr${r.m.id === x.b.id ? ' class="on"' : ''}><td><a href="#prenotazioni-${encodeURIComponent(r.m.id)}">${esc((r.m.cliente || '').trim() || 'Senza nome')}</a>${r.m.id === grp.root.id ? ' <small class="note">(acquisto)</small>' : ''}</td><td>${esc(dataBreve(r.m.from))} → ${esc(dataBreve(r.m.to))}</td><td class="r">${r.vm.vendita == null ? '—' : euro(r.vm.vendita)}</td>${ctx.online ? `<td class="r">${euro(r.si)}</td><td class="r">${euro(r.sa)}</td>` : ''}</tr>`).join('')}
          </tbody><tfoot><tr><td colspan="2"><b>Totale gruppo</b></td><td class="r"><b>${euro(tv)}</b></td>${ctx.online ? `<td class="r"><b>${euro(tsi)}</b></td><td class="r"><b>${euro(tsa)}</b></td>` : ''}</tr></tfoot></table></div>
          ${acq ? `<div class="pr-grid" style="grid-template-columns:repeat(3,minmax(0,1fr));margin-top:12px">${cella('Acquisto previsto', ta == null ? vuoto : euro(ta), 'una volta sola')}${cella('Margine previsto', ta == null ? vuoto : euro(tv - ta), 'vendite − acquisto')}${cella('Margine reale', ctx.online ? euro(tv + tt - ts) : vuoto, 'vendite' + (tt ? ' + depositi trattenuti' : '') + ' − spese reali', tv + tt - ts < 0 ? 'neg' : '')}</div>` : ''}${acq && ctx.canEdit() && ctx.online !== undefined ? bilHtml() : ''}</div>`;
      }
      const grpBil = grp && v.quota ? grp : null; if (grpBil) grp = null; // ripartito: questa prenotazione vale da sola
      const sc = x.b && ctx.schedaPren ? ctx.schedaPren(x.b.id) : null;
      A.righe = () => x.spese.map(s => ({ s, villa: villa.name, p: x.gen ? null : { cliente: x.cliente, from: x.from, to: x.to } }));
      const E = n => (n == null ? vuoto : euro(n));
      let celle = '', tab4 = false;
      const rowV = (l, val0, nota, cls) => `<tr${cls ? ` class="${cls}"` : ''}><td>${l}${nota ? `<small>${nota}</small>` : ''}</td><td class="r">${val0}</td></tr>`;
      if (!x.b) celle = rowV('Spese reali', ctx.online ? euro(sp) : vuoto, `${x.spese.length} ${x.spese.length === 1 ? 'scontrino' : 'scontrini'}`);
      else if (grp) {
        // acquisto unico: qui solo i valori di questa prenotazione; l'acquisto e i margini sono nel riquadro del gruppo
        celle = rowV('Vendita', E(v.vendita), 'affitto + servizi a parte')
          + (acq ? rowV('Acquisto previsto', grp.root.id === x.b.id ? E(v.acquisto) : '<span class="pc-nd">nel gruppo</span>', grp.root.id === x.b.id ? `unico per ${grp.membri.length} prenotazioni` : 'acquisto unico con ' + esc(grp.root.cliente || '')) : '')
          + rowV('Spese reali servizi offerti', ctx.online ? euro(sommaSrv(x.spese)) : vuoto, 'servizi della prenotazione')
          + rowV('Altre spese della prenotazione', ctx.online ? euro(sommaAltre(x.spese)) : vuoto, 'categorie non aggiuntive (es. manutenzione)')
          + rowV('Spese reali servizi aggiuntivi', ctx.online ? euro(aggTot(x)) : vuoto, 'da addebitare o trattenere dal deposito');
      } else if (acq) {
        // tabella previsto / reale: i valori della prenotazione sono ipotizzati (tranne la vendita), le note spese sono reali
        tab4 = true;
        const on = ctx.online, marP = v.vendita != null && v.acquisto != null ? v.vendita - v.acquisto : null;
        const marR = v.vendita != null && on ? v.vendita + (haDep ? tratt : 0) + sommaEntr(x.spese) - sp : null;
        const r4 = (voce, nota, pr, re, cls, diffCls) => { const d = pr != null && re != null ? re - pr : null;
          return `<tr${cls ? ` class="${cls}"` : ''}><td>${voce}${nota ? `<small>${nota}</small>` : ''}</td><td class="r">${pr == null ? '—' : euro(pr)}</td><td class="r">${re == null ? (on ? '—' : vuoto) : euro(re)}</td><td class="r${d && diffCls ? ' ' + diffCls(d) : d === 0 ? ' ok' : ''}">${d == null ? '—' : d === 0 ? 'OK' : segno(d)}</td></tr>`; };
        const num0 = n => typeof n === 'number' ? n : null;
        const piuCaro = d => d > 0 ? 'neg' : 'pos', piuAlto = d => d > 0 ? 'pos' : 'neg';
        celle = r4('Vendita', 'affitto + servizi a parte, prezzo al cliente', v.vendita, v.vendita)
          + r4('Acquisto', on ? `${affR(V, x) ? `affitto ${euro(affR(V, x))} · ` : ''}offerti ${euro(sommaSrv(x.spese))} · altre ${euro(sommaAltre(x.spese))}${sommaComm(x.spese) ? ` · agenzia ${euro(sommaComm(x.spese))}` : ''} · aggiuntivi ${euro(aggTot(x))}` : 'affitto + servizi a parte', v.acquisto, on ? sp : null, '', piuCaro)
          + r4('di cui affitto proprietario', v.quota ? 'quota dell\'acquisto unico · note spese "Affitto proprietario"' : 'note spese "Affitto proprietario"', num0(v.affAcq), on ? affR(V, x) : null, 'sub', piuCaro)
          + r4('di cui servizi offerti', 'categorie dei servizi della prenotazione (incluso nel prezzo o a parte)', v.acquisto == null ? null : v.acquisto - (num0(v.affAcq) || 0), on ? sommaSrv(x.spese) : null, 'sub', piuCaro)
          + r4('di cui altre spese della prenotazione', 'categorie non aggiuntive (es. manutenzione)', null, on ? sommaAltre(x.spese) : null, 'sub')
          + r4('di cui servizi aggiuntivi', 'richiesti durante il soggiorno (anche le utenze non incluse): da addebitare o trattenere dal deposito', null, on ? aggTot(x) : null, 'sub')
          + (haDep ? r4('Deposito trattenuto', depChiuso ? 'ricevuto − restituito' : 'si conta quando registri la restituzione', null, on && depChiuso ? tratt : null) : '')
          + r4('Margine', haDep ? 'vendita + deposito trattenuto − acquisto' : 'vendita − acquisto', marP, marR, 'tot', piuAlto)
          + r4('Totale da addebitare al cliente', on ? notaAdd(dep, sommaAgg(x.spese) + utDa(x.b), euro) : 'spese aggiuntive', null, on ? sommaAgg(x.spese) + utDa(x.b) : null);
      } else celle = rowV('Vendita', E(v.vendita), 'affitto + servizi a parte') + rowV('Spese reali servizi offerti', ctx.online ? euro(sommaSrv(x.spese)) : vuoto, 'servizi della prenotazione') + rowV('Altre spese della prenotazione', ctx.online ? euro(sommaAltre(x.spese)) : vuoto, 'categorie non aggiuntive') + rowV('Spese reali servizi aggiuntivi', ctx.online ? euro(sommaAgg(x.spese)) : vuoto, 'da addebitare o trattenere dal deposito') + rowV(haDep ? 'Vendita + deposito trattenuto − spese' : 'Vendita − spese', v.vendita != null && ctx.online ? euro(v.vendita + (haDep ? tratt : 0) - sp) : vuoto);
      // controllo previsto / reale: i valori della prenotazione sono quelli ipotizzati (tranne la vendita), le note spese quelle reali
      let chkHtml = '', quad = false;
      if (x.b && acq && ctx.online && V.conSpese) {
        const num = n => typeof n === 'number' ? n : null;
        const rootB = grp ? grp.root : x.b;
        const affPrev = grp ? num(rootB.prezzoAcquisto) : num(v.affAcq);
        const spGruppo = grp ? grp.membri.flatMap(m => { const it = V.l.find(y => y.b && y.b.id === m.id); return it ? it.spese : []; }) : x.spese;
        const affReal = grp ? sommaAff(spGruppo) : affR(V, x), qReale = quotaReale(V, x);
        const srvPrev = v.acquisto == null ? null : v.acquisto - (num(v.affAcq) || 0);
        const srvReal = sommaInc(x.spese), aggSp = sommaAgg(x.spese), utC = utDa(x.b), aggReal = aggSp + utC;
        const srvNomi = sc ? sc.servizi.filter(r => sc.acq && r[2]).map(r => r[0]) : [];
        const esito = (pr, re, daInserire) => {
          if (pr == null && !re) return ['—', ''];
          if (pr == null) return ['non previsto', 'chk-warn'];
          if (!re && pr > 0) return [daInserire || 'da inserire', 'chk-wait'];
          const d = re - pr, tol = Math.max(50, Math.abs(pr) * 0.05);
          if (Math.abs(d) <= tol) return ['in linea', 'chk-ok'];
          const pc = pr ? ` (${d > 0 ? '+' : '−'}${Math.round(Math.abs(d) / pr * 100)}%)` : '';
          return d > 0 ? ['oltre il previsto' + pc, 'chk-bad'] : ['sotto il previsto' + pc, 'chk-ok'];
        };
        const riga = (voce, nota, pr, re, daIns) => { const [t, c] = esito(pr, re, daIns); const d = pr == null ? null : re - pr;
          return `<tr><td><b>${voce}</b>${nota ? `<small>${nota}</small>` : ''}</td><td class="r">${pr == null ? '—' : euro(pr)}</td><td class="r">${euro(re)}</td><td class="r">${d == null || (!re && pr > 0) ? '—' : d === 0 ? 'OK' : segno(d)}</td><td><span class="chk ${c}">${t}</span></td></tr>`; };
        const totPrev = affPrev == null && srvPrev == null ? null : (grp && grp.root.id !== x.b.id ? 0 : affPrev || 0) + (srvPrev || 0);
        const totReal = (grp && grp.root.id !== x.b.id ? 0 : affReal) + srvReal;
        if (!grp) {
          // quattro riquadri con il solo reale; il previsto in una finestrella da aprire
          quad = true;
          const perCat = f => { const m = {}; x.spese.filter(f).forEach(z => { const c = z.categoria || 'Altro'; m[c] = (m[c] || 0) + (Number(z.importo) || 0); }); return Object.entries(m).sort((a, b) => b[1] - a[1]); };
          const tab = (righe, piede) => `<div class="tbl-wrap"><table class="prices pr-q-t"><tbody>${righe}</tbody>${piede ? `<tfoot>${piede}</tfoot>` : ''}</table></div>`;
          const r2 = (voce, nota, val, cls) => `<tr${cls ? ` class="${cls}"` : ''}><td>${voce}${nota ? `<small>${nota}</small>` : ''}</td><td class="r">${val}</td></tr>`;
          const prev = righe => `<details class="pr-prev"><summary>Mostra il previsto</summary><div class="tbl-wrap"><table class="prices pr-chk-t"><thead><tr><th>Voce</th><th class="r">Previsto</th><th class="r">Reale</th><th class="r">Differenza</th><th>Esito</th></tr></thead><tbody>${righe}</tbody></table></div></details>`;
          const marR = v.vendita != null ? v.vendita + (haDep ? tratt : 0) + sommaEntr(x.spese) - sp : null;
          // esito sempre in vista accanto al valore (come nella tabella del previsto, senza il titolo)
          const chip = (pr, re, daIns) => { if (pr == null) return ''; const [t, c] = esito(pr, re, daIns); return t && t !== '—' ? ` <span class="chk ${c} pr-chip">${t}</span>` : ''; };
          const chipM = (pr, re) => { if (pr == null || re == null) return ''; const d = re - pr, tol = Math.max(50, Math.abs(pr) * 0.05);
            const pc = pr ? ` (${d > 0 ? '+' : '−'}${Math.round(Math.abs(d) / Math.abs(pr) * 100)}%)` : '';
            return Math.abs(d) <= tol ? ' <span class="chk chk-ok pr-chip">in linea</span>' : d > 0 ? ` <span class="chk chk-ok pr-chip">sopra il previsto${pc}</span>` : ` <span class="chk chk-bad pr-chip">sotto il previsto${pc}</span>`; };
          const marP = v.vendita != null && v.acquisto != null ? v.vendita - v.acquisto : null;
          const rigaM = (voce, pr, re, piuAlto) => { const d = pr != null && re != null ? re - pr : null; return `<tr><td><b>${voce}</b></td><td class="r">${pr == null ? '—' : euro(pr)}</td><td class="r">${re == null ? '—' : euro(re)}</td><td class="r">${d == null ? '—' : d === 0 ? 'OK' : segno(d)}</td><td>${d == null ? '' : d === 0 ? '<span class="chk chk-ok">OK</span>' : (piuAlto ? d > 0 : d < 0) ? '<span class="chk chk-ok">meglio del previsto</span>' : '<span class="chk chk-bad">peggio del previsto</span>'}</td></tr>`; };
          // 1. riepilogo
          // vendita = solo affitto al cliente + servizi a parte (mai deposito trattenuto né addebiti): la nota mostra le parti
          const venNota = () => { if (!sc) return 'affitto + servizi a parte, prezzo al cliente'; const iv = sc.acq ? 3 : 2;
            const parti = [x.b && typeof x.b.prezzoVendita === 'number' ? 'affitto ' + euro(x.b.prezzoVendita) : null]
              .concat(sc.servizi.filter(z => z[1] === window.SDB.CARICO_LABEL.parte && z[iv]).map(z => esc(z[0]) + ' ' + z[iv])).filter(Boolean);
            return (parti.length ? parti.join(' + ') : 'affitto + servizi a parte') + ' · senza deposito e addebiti'; };
          const q1 = `<div class="card pr-q"><h2>Riepilogo</h2>${tab(
              r2('Vendita', venNota(), E(v.vendita))
            + r2('Spese totali', 'affitto proprietario + spese offerte + aggiuntive (anche le utenze) + a carico del proprietario', euro(sp))
            + (() => { const reg = x.spese.filter(z => z.categoria === COMM), regT = reg.reduce((t, z) => t + (Number(z.importo) || 0), 0), c = x.b && x.b.agenziaId && ctx.commAgenzia ? ctx.commAgenzia(x.b) : null;
                if (!reg.length && !c) return ''; const chi = c ? `${esc(c.nome)} ${String(Math.round(c.perc * 1000) / 10).replace('.', ',')}%` : 'agenzia';
                const da = c && c.importo != null ? c.importo : null;
                return r2('Commissione agenzia', reg.length ? `${chi} · ${reg.length} ${reg.length === 1 ? 'nota' : 'note'} "${COMM}", già nelle spese totali${da != null && Math.abs(da - regT) >= 1 ? ` · da riconoscere ${euro(da)}` : ''}` : `${chi} · da riconoscere ${da != null ? euro(da) : '—'}`, reg.length ? euro(regT) : '—'); })()
            + (haDep ? (depChiuso ? r2('Deposito di sicurezza trattenuto', `ricevuto ${dep == null ? '—' : euro(dep)} − restituito ${euro(rest)}`, euro(tratt), tratt < 0 ? 'neg' : '')
                : r2('Deposito di sicurezza trattenuto', `ricevuto ${dep == null ? '—' : euro(dep)}: si conta dopo la nota "Restituzione deposito"`, '—')) : ''),
              (() => { const ac = sommaAddC(x.spese), n = x.spese.filter(isAddC).length, oltre = dep ? sulDeposito(dep, aggReal).oltre : aggReal;
                return n || oltre ? r2('Addebito cliente', n ? `${n} ${n === 1 ? 'nota' : 'note'} "Addebito cliente"${oltre > ac ? ` · da addebitare ${euro(oltre - ac)}` : ''}` : `da addebitare ${euro(oltre)} (spese aggiuntive oltre il deposito): registralo con la nota "Addebito cliente"`, n ? euro(ac) : '—') : ''; })()
              + (() => { const ap = sommaAddP(x.spese), n = x.spese.filter(isAddP).length, daP = x.spese.filter(z => !isRest(z) && !isAff(z) && !isAddP(z) && (CATS.prop || []).includes(z.categoria)).reduce((t, z) => t + (Number(z.importo) || 0), 0);
                return r2('Addebito proprietario', n ? `${n} ${n === 1 ? 'nota' : 'note'} "Addebito proprietario"${daP && daP !== ap ? ` · da addebitare ${euro(daP)}` : ''}` : daP ? `da addebitare ${euro(daP)}: registralo con la nota "Addebito proprietario"` : 'note spese "Addebito proprietario"', n ? euro(ap) : '—'); })()
              + r2('<b>Margine</b>', (haDep ? 'vendita + deposito trattenuto' : 'vendita') + ' + addebiti − spese', marR == null ? vuoto : `<b>${euro(marR)}</b>${chipM(marP, marR)}`, marR != null && marR < 0 ? 'tot neg' : 'tot'))}
            ${prev(rigaM('Vendita', v.vendita, v.vendita, true) + rigaM('Spese totali', v.acquisto, sp, false) + rigaM('Margine', marP, marR, true))}
            ${v.vendita == null ? '<p class="note">Prezzo di vendita non inserito nella prenotazione.</p>' : ''}</div>`;
          // 2. affitto al proprietario
          const affN = x.spese.filter(isAff).length;
          // commissione dell'agenzia: quanto spetta (perc × vendita) e note "Commissione agenzia" registrate
          const q6 = (() => { const reg = x.spese.filter(z => z.categoria === COMM), regT = reg.reduce((t, z) => t + (Number(z.importo) || 0), 0), c = x.b && x.b.agenziaId && ctx.commAgenzia ? ctx.commAgenzia(x.b) : null;
            if (!reg.length && !c) return ''; const da = c && c.importo != null ? c.importo : null;
            const chi = c ? `${esc(c.nome)} · ${esc(String(Math.round(c.perc * 1000) / 10).replace('.', ','))}%` : 'agenzia';
            return `<div class="card pr-q"><h2>Commissione agenzia</h2>${tab(
                r2('Pagato all\'agenzia', `${chi}${reg.length ? ` · ${reg.length} ${reg.length === 1 ? 'nota spese' : 'note spese'} "${COMM}"` : ''}`, (reg.length ? euro(regT) : '—') + chip(da, regT, 'da inserire'), 'tot'))}
            ${da != null ? prev(riga('Commissione agenzia', c && c.base != null ? `${esc(String(Math.round(c.perc * 1000) / 10).replace('.', ','))}% della vendita ${euro(Math.round(c.base))}` : 'percentuale dell\'agenzia × vendita', da, regT, 'da inserire tra le spese')) : ''}</div>`; })();
          const q2 = `<div class="card pr-q"><h2>Affitto al proprietario</h2>${tab(
              r2('Pagato al proprietario', qReale != null ? `quota del pagato per tutto il gruppo (${euro(affGrp(V, grpBil))}), ${ripMan(grpBil, 'ripartizioneReale') ? 'ripartito a mano' : 'diviso per notti: bilancialo con il tasto qui sotto'}` : affN ? `${affN} ${affN === 1 ? 'nota spese' : 'note spese'} "Affitto proprietario", anche extra` : 'nessuna nota spese "Affitto proprietario"', euro(affReal) + chip(affPrev, affReal, 'da inserire'), 'tot'))}
            ${qReale != null ? (() => { const nn = grpBil.membri.flatMap(m => { const it = V.l.find(y => y.b && y.b.id === m.id); return it ? it.spese.filter(isAff).map(z => [m, z]) : []; });
              return nn.length ? `<p class="note" style="margin:8px 0 2px">Note "Affitto proprietario" del gruppo (inserite una volta sola, valgono per tutte le prenotazioni):</p>${tab(nn.map(([m, z]) => r2(esc(dataBreve(z.data || '')) + (z.motivo ? ' · ' + esc(z.motivo) : ''), m.id === x.b.id ? 'inserita qui' : `inserita su <a href="#prenotazioni-${encodeURIComponent(m.id)}">${esc((m.cliente || '').trim() || 'Senza nome')}</a>`, euro(Number(z.importo) || 0))).join(''))}` : ''; })() : ''}
            ${grpBil && acq && ctx.canEdit() ? `<p style="margin:10px 0 4px" class="no-print"><button class="btn" type="button" id="bil-open">Bilancia l'affitto tra le prenotazioni</button></p>` : ''}
            ${prev(riga('Affitto proprietario', v.quota ? 'quota prevista dell\'acquisto unico' + (ripMan(grpBil, 'ripartizione') ? ', a mano' : ', per notti') : 'acquisto concordato nella prenotazione', affPrev, affReal, 'da inserire tra le spese'))}
            ${affPrev != null && !affReal ? '<p class="note">Inserisci l\'affitto pagato come nota spese "Affitto proprietario" (con eventuali extra).</p>' : ''}${affPrev == null ? '<p class="note">Acquisto concordato non inserito nella prenotazione.</p>' : ''}</div>`;
          // 3. spese offerte: servizi della prenotazione + altre spese non aggiuntive, per categoria
          const off = CATS.servizi.filter(z => ctx.hasSrv && ctx.hasSrv(x.b, z.key));
          const di = k => x.spese.filter(z => isSrvOff(z) && (srvDiSpesa(z) || {}).key === k);
          const srvR = off.map(z => { const d = ctx.srvDet ? ctx.srvDet(x.b, z.key) : {}; return { z, d, re: somma(di(z.key)) }; }).filter(r => r.d.carico !== 'proprietario'); // a carico del proprietario: nel suo riquadro
          const altre = perCat(isAltra);
          const q3 = `<div class="card pr-q"><h2>Spese offerte</h2>${(srvR.length || altre.length) ? tab(
              srvR.map(({ z, d, re }) => r2(esc(z.label), d.carico === 'parte' ? 'servizio offerto, a parte (pagato dal cliente)' : 'servizio offerto, a carico di Esmeralda', euro(re))).join('')
            + altre.map(([c, t]) => r2(esc(c), 'altra spesa della prenotazione', euro(t))).join(''),
              r2('<b>Totale spese offerte</b>', '', `<b>${euro(sommaSrv(x.spese) + sommaAltre(x.spese))}</b>${chip(srvPrev, sommaSrv(x.spese) + sommaAltre(x.spese))}`, 'tot')) : '<p class="note">Nessun servizio nella prenotazione e nessuna spesa.</p>'}
            ${srvR.length ? prev(srvR.map(({ z, d, re }) => riga(esc(z.label), d.incluso ? 'incluso nel prezzo: nessun acquisto previsto' : 'a parte', d.incluso ? null : num(d.acquisto), re, 'da inserire tra le spese')).join('')
              + altre.map(([c, t]) => riga(esc(c), 'altra spesa della prenotazione', null, t)).join('')
              + riga('Totale spese offerte', '', srvPrev, sommaSrv(x.spese) + sommaAltre(x.spese))) : ''}</div>`;
          // 4. spese aggiuntive
          const agg = perCat(isAgg);
          const propL = perCat(isPropS), propT = propL.reduce((t, r) => t + r[1], 0), addP = sommaAddP(x.spese), nAddP = x.spese.filter(isAddP).length;
          const q5 = `<div class="card pr-q"><h2>Spese a carico del proprietario</h2>${tab(
              propL.map(([c, t]) => r2(esc(c), 'a carico del proprietario', euro(t))).join('') || r2('Nessuna spesa a carico del proprietario', 'categorie con la spunta "A carico del proprietario" (Impostazioni → Categorie delle spese)', euro(0)),
              r2('<b>Totale da addebitare al proprietario</b>', '', `<b>${euro(propT)}</b>`, 'tot')
              + r2('Addebitato al proprietario', nAddP ? `${nAddP} ${nAddP === 1 ? 'nota' : 'note'} "Addebito proprietario"` : 'nessuna nota "Addebito proprietario"', euro(addP))
              + (propT - addP > 0 ? r2('Ancora da addebitare', 'registralo con la nota "Addebito proprietario"', euro(propT - addP), 'neg') : ''))}</div>`;
          const sdq = sulDeposito(dep, aggReal), oltreC = dep ? sdq.oltre : aggReal, addC = sommaAddC(x.spese), nAddC = x.spese.filter(isAddC).length;
          const q4 = `<div class="card pr-q"><h2>Spese aggiuntive</h2>${tab(
              (agg.map(([c, t]) => r2(esc(c), 'richiesta durante il soggiorno', euro(t))).join('') + (utC ? r2('Utenze (consumi)', utSrv() && ctx.hasSrv(x.b, utSrv().key) ? 'letture dei contatori · servizio Utenze a parte (spesa aggiuntiva)' : 'letture dei contatori · servizio Utenze non offerto (spesa aggiuntiva)', euro(utC)) : '')) || r2('Nessuna spesa aggiuntiva', '', euro(0)),
              r2('<b>Totale da addebitare al cliente</b>', notaAdd(dep, aggReal, euro), `<b>${euro(aggReal)}</b>`, 'tot')
              + (oltreC || nAddC ? r2('Addebitato al cliente', nAddC ? `${nAddC} ${nAddC === 1 ? 'nota' : 'note'} "Addebito cliente" (oltre il deposito)` : 'nessuna nota "Addebito cliente"', euro(addC)) : '')
              + (haDep ? r2('Deposito di sicurezza trattenuto', depChiuso ? `ricevuto ${dep == null ? '—' : euro(dep)} − restituito ${euro(rest)}` : `ricevuto ${dep == null ? '—' : euro(dep)}: si conta dopo la nota "Restituzione deposito"`, depChiuso ? euro(tratt) : '—', depChiuso && tratt < 0 ? 'neg' : '') : '')
              + (oltreC || nAddC ? (oltreC - addC > 0 ? r2('Ancora da addebitare', 'registralo con la nota "Addebito cliente"', euro(oltreC - addC), 'neg') : '') : ''))}</div>`;
          chkHtml = `<div class="pr-quad">${q1}<div class="pr-col">${q6}${q2}${q5}</div>${q3}${q4}</div>`; // riga 1: Riepilogo | Affitto + a carico del proprietario; riga 2: Spese offerte | Spese aggiuntive (stesso lato superiore)
        } else {
          chkHtml = `<div class="card pr-chk"><h2>Previsto e reale</h2>
          <p class="note">Previsto = valori della prenotazione (acquisto concordato e servizi). Reale = note spese. In linea entro il 5% (almeno 50 €).</p>
          <div class="tbl-wrap"><table class="prices pr-chk-t"><thead><tr><th>Voce</th><th class="r">Previsto</th><th class="r">Reale</th><th class="r">Differenza</th><th>Esito</th></tr></thead><tbody>
          ${riga('Affitto proprietario', grp ? 'acquisto unico: tutto il gruppo' + (grp.root.id !== x.b.id ? ', previsto nella principale' : '') : 'note spese "Affitto proprietario", anche extra', affPrev, affReal, 'da inserire tra le spese')}
          ${(() => { // un servizio offerto alla volta: acquisto previsto (a parte) contro le spese con quella categoria
            const off = CATS.servizi.filter(z => ctx.hasSrv && ctx.hasSrv(x.b, z.key));
            const di = k => x.spese.filter(z => !isAgg(z) && !isRest(z) && !isAff(z) && (srvDiSpesa(z) || {}).key === k);
            let legate = 0;
            const righe = off.map(z => { const d = ctx.srvDet ? ctx.srvDet(x.b, z.key) : {}; const re = somma(di(z.key)); legate += re;
              return riga(esc(z.label), d.incluso ? 'incluso nel prezzo: nessun acquisto previsto' : 'a parte', d.incluso ? (re ? null : null) : num(d.acquisto), re, 'da inserire tra le spese'); });
            // spese degli scontrini legati a un servizio che non è nella prenotazione: sono già aggiuntive (non entrano qui)
            const altre = srvReal - legate;
            // le altre spese, una riga per categoria (nessun previsto: non sono nella prenotazione)
            const perCat = f => { const m = {}; x.spese.filter(f).forEach(z => { const c = z.categoria || 'Altro'; m[c] = (m[c] || 0) + (Number(z.importo) || 0); }); return Object.entries(m).sort((a, b) => b[1] - a[1]); };
            return righe.join('') + perCat(isAltra).map(([c, t]) => riga(esc(c), 'altra spesa della prenotazione', null, t)).join('');
          })()}
          ${(() => { const m = {}; x.spese.filter(isAgg).forEach(z => { const c = z.categoria || 'Altro'; m[c] = (m[c] || 0) + (Number(z.importo) || 0); });
            return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([c, t]) => `<tr><td><b>${esc(c)}</b><small>servizio aggiuntivo: da addebitare al cliente</small></td><td class="r">—</td><td class="r">${euro(t)}</td><td class="r">—</td><td><span class="chk chk-warn">non previsto</span></td></tr>`).join(''); })()}
          </tbody><tfoot><tr><td><b>Totale (senza aggiuntivi)</b></td><td class="r"><b>${totPrev == null ? '—' : euro(totPrev)}</b></td><td class="r"><b>${euro(totReal)}</b></td><td class="r"><b>${totPrev == null ? '—' : segno(totReal - totPrev)}</b></td><td>${(() => { const [t, c] = esito(totPrev, totReal); return `<span class="chk ${c}">${t}</span>`; })()}</td></tr></tfoot></table></div>
          ${affPrev != null && !affReal ? '<p class="note">L\'affitto pagato al proprietario non è ancora tra le spese: inseriscilo come nota spese "Affitto proprietario" (con eventuali extra) per confrontarlo con l\'acquisto concordato.</p>' : ''}</div>`;
        }
      }
      const cats = {}; x.spese.forEach(s => { const c = s.categoria || 'Altro'; cats[c] = (cats[c] || 0) + (isRest(s) ? -1 : 1) * (Number(s.importo) || 0); });
      const info = sc ? (() => { // affitto al cliente e vendita dei servizi offerti, sopra il deposito di sicurezza
          const r = sc.righe.filter(([l]) => !/^Prezzo di (vendita|acquisto)/.test(l));
          const iv = sc.acq ? 3 : 2;
          const add = [['Affitto villa al cliente', x.b && typeof x.b.prezzoVendita === 'number' ? euro(x.b.prezzoVendita) : '—']]
            .concat(sc.servizi.map(z => [z[0], z[1] !== window.SDB.CARICO_LABEL.parte ? 'incluso · ' + z[1].replace(/^A carico/, 'a carico') : (z[iv] || '—')]));
          let k = r.findIndex(([l]) => /^(Deposito di sicurezza|Pagata al proprietario|Notti pagate libere|Assegnata a|Note)/.test(l)); if (k < 0) k = r.length;
          r.splice(k, 0, ...add); return r; })() : x.gen ? [['Villa', villa.name], ['Località', villa.location || '']] : [['Villa', villa.name], ['Cliente', x.cliente], ['Check-in', dataIt(x.from)], ['Check-out', dataIt(x.to)], ['Stato', 'Non più in calendario']];
      root.innerHTML = `<div class="wrap pr-det">
        <a href="#prenotazioni" class="pr-back no-print">← Tutte le prenotazioni</a>
        <div class="head"><div><h1>${esc(villa.name)}</h1><div class="sub">${x.gen ? 'Spese generali della villa' : `${esc(x.cliente)} · ${esc(dataBreve(x.from))} → ${esc(dataBreve(x.to))} · ${nNotti(x.from, x.to)} notti`}</div></div>
          <div class="actions no-print">${ctx.online ? '<button class="btn primary" type="button" id="pd-new">+ Nuova spesa</button>' : ''}
            <button class="btn" type="button" id="pd-print">Stampa</button>
            ${ctx.online ? '<button class="btn" type="button" id="pd-exp">Esporta</button>' : ''}
            ${x.b && ctx.contratto ? '<button class="btn" type="button" id="pd-contr">Contratto</button>' : ''}
            ${x.b && ctx.canEdit() ? '<button class="btn" type="button" id="pd-mod">Modifica prenotazione</button>' : ''}</div></div>
        <div class="pr-top">
          ${media(x.villaId, pill(x))}
          <div class="card pr-info"><h2>${x.gen ? 'Villa' : 'Prenotazione'}</h2><dl class="pr-kv">${info.map(([l, val0]) => `<dt>${esc(l)}</dt><dd>${esc(val0)}</dd>`).join('')}</dl>
            ${x.b && ctx.commAgenzia && x.b.agenziaId ? (() => { const c = ctx.commAgenzia(x.b), reg = x.spese.filter(s => s.categoria === COMM), regT = reg.reduce((t, s) => t + (Number(s.importo) || 0), 0);
              return `<div class="pr-ag"><h3>Agenzia</h3><dl class="pr-kv"><dt>Agenzia</dt><dd>${esc(c.nome)} · ${esc(String(Math.round(c.perc * 1000) / 10).replace('.', ','))}%</dd>
                <dt>Da riconoscere</dt><dd><b>${c.importo === null ? '—' : esc(euro(c.importo))}</b> <small class="note">${c.base === null ? 'manca la vendita' : `sulla vendita ${esc(euro(Math.round(c.base)))}`}</small></dd>
                ${reg.length ? `<dt>Registrata</dt><dd>${esc(euro(regT))} <small class="note">${reg.length} ${reg.length === 1 ? 'nota' : 'note'} "${COMM}"</small></dd>` : ''}</dl>
</div>`; })() : ''}
            ${x.b ? (() => { const uc = utCalc(x.b, ctx.data().settings), ed = ctx.canEdit();
              const cel = (k, f, v0, ph) => ed ? `<input class="ut-in" data-ut="${k}|${f}" inputmode="decimal" value="${esc(fmtU(v0))}"${ph ? ` placeholder="${esc(ph)}"` : ''}>` : esc(fmtU(v0) || '—');
              return `<div class="pr-ut"><h3>Utenze</h3><p class="note">Letture dei contatori all'arrivo e all'uscita: il consumo × la tariffa dà quanto far pagare al cliente.</p>
                <div class="tbl-wrap"><table class="prices ut-t"><thead><tr><th></th><th class="r">Check-in</th><th class="r">Check-out</th><th class="r">Consumo</th><th class="r">€ / unità</th><th class="r">Importo</th></tr></thead><tbody>
                ${uc.righe.map(r => `<tr data-utr="${r.k}"><td><b>${esc(r.l)}</b> <small class="note">${esc(r.un)}</small></td><td class="r">${cel(r.k, 'in', r.i0)}</td><td class="r">${cel(r.k, 'out', r.o0)}</td>
                  <td class="r" data-utc>${r.cons === null ? '—' : esc(fmtU(r.cons)) + ' ' + esc(r.un)}</td><td class="r">${cel(r.k, 'tariffa', r.tPred ? null : r.t0, r.tPred ? fmtU(r.t0) : '')}</td><td class="r" data-uti>${r.imp === null ? '—' : esc(euro(r.imp))}</td></tr>`).join('')}
                </tbody><tfoot><tr><td colspan="5"><b>Totale utenze da far pagare</b></td><td class="r"><b id="ut-tot">${uc.tot === null ? '—' : esc(euro(uc.tot))}</b></td></tr></tfoot></table></div>
                ${ed ? `<p class="note no-print" style="margin:6px 0 0"><span id="ut-stato">Si salva da solo quando esci dalla tabella.</span> <span id="ut-msg"></span></p>` : ''}
                <p class="note">${utIncluse(x.b) ? '<b>Utenze incluse nel prezzo</b> (servizio Utenze spuntato come incluso): i consumi non si fanno pagare.' : '<b>Il totale è una spesa aggiuntiva</b> (servizio Utenze a parte o non spuntato): conta nelle spese totali e nel totale da addebitare al cliente; trattienilo dal deposito o registra una nota "Addebito cliente".'}</p></div>`; })() : ''}
            ${x.b ? `<label class="flag pr-concl no-print" style="margin-top:12px"><input type="checkbox" id="pd-concl" ${x.b.conteggiConclusi ? 'checked' : ''} ${ctx.canEdit() ? '' : 'disabled'}><span><b>Conteggi conclusi</b><small>Deposito, addebiti e affitto al proprietario chiusi: nell'elenco la scheda risulta "Conteggi conclusi"</small></span></label>` : ''}</div>
        </div>
        ${quad ? '' : `<div class="card pr-valori"><h2>Valori</h2><div class="tbl-wrap"><table class="prices pr-val-t"><thead><tr><th>Voce</th>${tab4 ? '<th class="r">Previsto</th><th class="r">Reale</th><th class="r">Differenza</th>' : '<th class="r">Importo</th>'}</tr></thead><tbody>${celle}</tbody></table></div>
          ${x.b && v.vendita == null ? '<p class="note">Prezzo di vendita non inserito nella prenotazione.</p>' : ''}${!x.gen && acq && x.b && v.acquisto == null ? '<p class="note">Prezzo di acquisto non inserito nella prenotazione.</p>' : ''}</div>`}
        ${chkHtml}
        ${grpHtml}
        ${!x.gen && haDep && !quad ? `<div class="card pr-dep"><h2>Deposito di sicurezza</h2><div class="pr-grid" style="grid-template-columns:repeat(3,minmax(0,1fr))">
          ${cella('Ricevuto dal cliente', dep == null ? vuoto : euro(dep), x.b ? 'dalla prenotazione' : '')}${cella('Restituito', rest ? '−' + euro(rest) : euro(0), 'note spese "Restituzione deposito"')}${cella('Trattenuto', depChiuso ? euro(tratt) : '—', depChiuso ? (tratt > 0 ? 'trattenuto sul deposito' : '') : 'si conta quando registri la restituzione', tratt < 0 ? 'neg' : '')}</div>
          <p class="note">La restituzione riduce quanto ricevuto dal cliente: non è una spesa della villa e non entra nell'acquisto reale. I danni si inseriscono come spesa "Danni villa".</p></div>` : ''}

        <div class="card pr-spese">
          <div class="pr-sp-head"><h2>Spese <span id="sp-n">${x.spese.length}</span></h2>${ctx.online ? `<b id="sp-tot">${euro(sp)}</b>` : ''}</div>
          ${ctx.online && V.conSpese && x.spese.length ? `<div class="sp-tools">
            <input type="search" id="sp-q" placeholder="Cerca (descrizione, categoria, importo)" value="${esc(ui.spQ || '')}">
            <label class="field"><span>Categoria</span><select id="sp-cat"><option value="">Tutte</option>${[...new Set(x.spese.map(z => z.categoria || 'Altro'))].sort((a, b) => a.localeCompare(b, 'it')).map(c => `<option ${ui.spCat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
            <label class="field"><span>Ordina</span><select id="sp-ord">${[['dataD', 'Data, più recenti'], ['dataA', 'Data, più vecchie'], ['impD', 'Importo, più alto'], ['impA', 'Importo, più basso'], ['cat', 'Categoria A–Z']].map(([k, l]) => `<option value="${k}" ${(ui.spOrd || 'dataD') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
            <label class="field"><span>Raggruppa</span><select id="sp-grp">${[['tipo', 'Per tipo'], ['cat', 'Per categoria'], ['no', 'Nessun gruppo']].map(([k, l]) => `<option value="${k}" ${(ui.spGrp || 'tipo') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          </div>` : ''}
          <div id="sp-list">${!ctx.online ? '<p class="note">Le spese si vedono con i dati online.</p>' : !V.conSpese ? '<p class="note">Caricamento scontrini…</p>'
            : x.spese.length ? '' : '<p class="note">Nessuna spesa inserita per questa prenotazione.</p>'}</div>
        </div>
      </div>`;
      // elenco spese: filtro, ordine e raggruppamento (ui.spQ, ui.spCat, ui.spOrd, ui.spGrp)
      const disegnaSpese = () => {
        const box = $('#sp-list', root); if (!box || !ctx.online || !V.conSpese || !x.spese.length) return;
        const q = String(ui.spQ || '').trim().toLowerCase();
        if (ui.spCat && !x.spese.some(z => (z.categoria || 'Altro') === ui.spCat)) ui.spCat = '';
        let l = x.spese.filter(z => (!ui.spCat || (z.categoria || 'Altro') === ui.spCat)
          && (!q || `${z.motivo || ''} ${z.categoria || ''} ${z.creatoDa || ''} ${z.importo} ${euro(Number(z.importo) || 0)} ${z.data || ''}`.toLowerCase().includes(q)));
        const ord = { dataD: (a, b) => String(b.data || '').localeCompare(String(a.data || '')), dataA: (a, b) => String(a.data || '').localeCompare(String(b.data || '')),
          impD: (a, b) => (Number(b.importo) || 0) - (Number(a.importo) || 0), impA: (a, b) => (Number(a.importo) || 0) - (Number(b.importo) || 0),
          cat: (a, b) => String(a.categoria || '').localeCompare(String(b.categoria || ''), 'it') || String(b.data || '').localeCompare(String(a.data || '')) }[ui.spOrd || 'dataD'] || null;
        if (ord) l = l.slice().sort(ord);
        const blk = (t, ll, tot) => ll.length ? `<h4 class="sp-sub">${t} <span>${ll.length}</span>${tot != null ? `<b>${euro(tot)}</b>` : ''}</h4>${ll.map(A.rigaSpesa).join('')}` : '';
        const grp = ui.spGrp || 'tipo';
        let html;
        if (!l.length) html = '<p class="note">Nessuna spesa con questi filtri.</p>';
        else if (grp === 'no') html = l.map(A.rigaSpesa).join('');
        else if (grp === 'cat') { const m = new Map(); l.forEach(z => { const c = z.categoria || 'Altro'; if (!m.has(c)) m.set(c, []); m.get(c).push(z); });
          html = [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'it')).map(([c, ll]) => blk(esc(c), ll, ll.some(z => isRest(z) || isEntr(z)) ? null : somma(ll))).join(''); }
        else html = blk('Affitto proprietario', l.filter(isAff), sommaAff(l)) + blk('Commissione agenzia', l.filter(isComm), sommaComm(l)) + blk('Servizi offerti', l.filter(isSrvOff), sommaSrv(l)) + blk('Altre spese della prenotazione', l.filter(isAltra), sommaAltre(l)) + blk('A carico del proprietario', l.filter(isPropS), sommaPropS(l)) + blk('Servizi aggiuntivi', l.filter(isAgg), sommaAgg(l)) + blk('Restituzione deposito', l.filter(isRest), null) + blk('Addebiti al cliente', l.filter(isAddC), null) + blk('Addebiti al proprietario', l.filter(isAddP), null);
        box.innerHTML = html;
        const filtrato = q || ui.spCat;
        $('#sp-n', root).textContent = filtrato ? `${l.length} di ${x.spese.length}` : x.spese.length;
        if ($('#sp-tot', root)) $('#sp-tot', root).textContent = euro(filtrato ? somma(l) : sp);
      };
      disegnaSpese();
      if ($('#sp-q', root)) { let tq; $('#sp-q', root).addEventListener('input', e => { ui.spQ = e.target.value; saveUI(); clearTimeout(tq); tq = setTimeout(disegnaSpese, 120); });
        ['cat', 'ord', 'grp'].forEach(k => $('#sp-' + k, root).addEventListener('change', e => { ui['sp' + k[0].toUpperCase() + k.slice(1)] = e.target.value; saveUI(); disegnaSpese(); })); }
      if ($('#pd-new', root)) $('#pd-new', root).onclick = () => A.openNuova(x.villaId, x.b ? x.b.id : '');
      $('#pd-print', root).onclick = () => window.print();
      // utenze: calcolo mentre si scrive, salvataggio con il tasto
      const utIns = $$('.ut-in', root);
      if (utIns.length && x.b) { const st0 = ctx.data().settings || {};
        const leggi = () => { const u = {}; utIns.forEach(i => { const [k, f] = i.dataset.ut.split('|'); u[k] = u[k] || {}; u[k][f] = numU(i.value); }); return u; };
        const ricalc = () => { const uc = utCalc({ utenze: leggi() }, st0);
          uc.righe.forEach(r => { const tr = $(`tr[data-utr="${r.k}"]`, root); if (!tr) return; tr.querySelector('[data-utc]').textContent = r.cons === null ? '—' : fmtU(r.cons) + ' ' + r.un; tr.querySelector('[data-uti]').textContent = r.imp === null ? '—' : euro(r.imp); });
          $('#ut-tot', root).textContent = uc.tot === null ? '—' : euro(uc.tot);
          const neg = uc.righe.filter(r => r.cons !== null && r.cons < 0).map(r => r.l); $('#ut-msg', root).textContent = neg.length ? `Attenzione: ${neg.join(', ')} con la lettura di uscita più bassa di quella di arrivo.` : ''; };
        utIns.forEach(i => i.addEventListener('input', ricalc));
        // salvataggio automatico quando il cursore esce dalla tabella (non a ogni tasto, per non ridisegnare la pagina mentre si scrive)
        const box = $('.pr-ut', root); let ultimo = JSON.stringify(leggi());
        const salva = () => { const u = leggi(), js = JSON.stringify(u); if (js === ultimo) return; const b0 = ctx.data().bookings.find(b => b.id === x.b.id); if (!b0) return;
          ultimo = js; ctx.store.upsertBooking(Object.assign(JSON.parse(JSON.stringify(b0)), { utenze: u })); const el = $('#ut-stato', root); if (el) el.textContent = 'Letture salvate.'; };
        box.addEventListener('focusout', e => { if (!box.contains(e.relatedTarget)) salva(); });
        utIns.forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); salva(); } }));
        window.addEventListener('hashchange', salva, { once: true }); }
      const cc = $('#pd-concl', root); if (cc && x.b) cc.onchange = () => { const b0 = ctx.data().bookings.find(b => b.id === x.b.id); if (!b0) return;
        ctx.store.upsertBooking(Object.assign(JSON.parse(JSON.stringify(b0)), { conteggiConclusi: cc.checked })); ctx.toast(cc.checked ? 'Conteggi conclusi' : 'Conteggi riaperti'); };
      if (grpBil || grp) { const g = grpBil || grp, tot0 = typeof g.root.prezzoAcquisto === 'number' ? g.root.prezzoAcquisto : null, ins = $$('.bil-in', root), inR = $$('.bil-re', root), totR0 = affGrp(V, g);
        const resto = () => { const s0 = ins.reduce((t, i) => t + (Number(i.value || i.placeholder) || 0), 0), r = tot0 == null ? null : tot0 - s0, el = $('#bil-resto', root);
          if (el) { el.textContent = r == null ? '—' : euro(r); el.style.color = r != null && r < 0 ? 'var(--danger, #c0392b)' : ''; } return r; };
        const restoR = () => { const r = totR0 - inR.reduce((t, i) => t + (Number(i.value || i.placeholder) || 0), 0), el = $('#bil-resto-re', root);
          if (el) { el.textContent = euro(r); el.style.color = r < 0 ? 'var(--danger, #c0392b)' : ''; } return r; };
        const dB = $('#dlg-bil', root), bo = $('#bil-open', root), bc = $('#bil-close', root);
        if (bo && dB) bo.onclick = () => dB.showModal(); if (bc && dB) bc.onclick = () => dB.close();
        ins.forEach(i => i.addEventListener('input', resto)); resto(); inR.forEach(i => i.addEventListener('input', restoR)); restoR();
        const bn = $('#bil-notti', root); if (bn) bn.onclick = () => { if (tot0 == null) { ctx.toast('Prima inserisci l\'acquisto concordato nella prenotazione principale'); return; }
          const nt = g.membri.reduce((t, m) => t + nNotti(m.from, m.to), 0) || 1; ins.forEach(i => { i.value = Math.round(tot0 * Number(i.dataset.notti) / nt * 100) / 100; }); resto();
          if (totR0) { inR.forEach(i => { i.value = Math.round(totR0 * Number(i.dataset.notti) / nt * 100) / 100; }); restoR(); } };
        const bs = $('#bil-save', root); if (bs) bs.onclick = () => { if (tot0 == null) { ctx.toast('Prima inserisci l\'acquisto concordato nella prenotazione principale'); return; }
          const vuotiP = ins.filter(i => i.value === '').length;
          if (vuotiP && vuotiP < ins.length) { $('#bil-msg', root).textContent = 'Affitto previsto: scrivi un importo per ogni prenotazione collegata (anche 0), oppure lascia vuota tutta la colonna (si divide per notti).'; return; }
          if (ins.some(i => i.value !== '' && !(Number(i.value) >= 0))) { $('#bil-msg', root).textContent = 'Affitto previsto: importo non valido.'; return; }
          if (resto() < 0) { $('#bil-msg', root).textContent = 'Le quote superano l\'acquisto concordato: alla principale resterebbe un importo negativo.'; return; }
          const vuotiR = inR.filter(i => i.value === '').length;
          if (vuotiR && vuotiR < inR.length) { $('#bil-msg', root).textContent = 'Pagato (reale): scrivi un importo per ogni prenotazione collegata, oppure lascia vuota tutta la colonna (si divide per notti).'; return; }
          if (!vuotiR && (inR.some(i => !(Number(i.value) >= 0)) || restoR() < 0)) { $('#bil-msg', root).textContent = 'Pagato (reale): le quote superano le note "Affitto proprietario" del gruppo.'; return; }
          let rip = null; if (ins.length && !vuotiP) { rip = {}; ins.forEach(i => { rip[i.dataset.id] = Math.round(Number(i.value) * 100) / 100; }); }
          let ripR = null; if (inR.length && !vuotiR) { ripR = {}; inR.forEach(i => { ripR[i.dataset.id] = Math.round(Number(i.value) * 100) / 100; }); }
          const b0 = ctx.data().bookings.find(b => b.id === g.root.id); if (!b0) return;
          ctx.store.upsertBooking(Object.assign(JSON.parse(JSON.stringify(b0)), { ripartizione: rip, ripartizioneReale: ripR })); ctx.toast('Ripartizione salvata'); if (ctx.ridisegna) ctx.ridisegna(); };
        const bd = $('#bil-del', root); if (bd) bd.onclick = async () => { if (!(await window.SDBConferma('Togliere la ripartizione? L\'acquisto torna unico nella prenotazione principale.', { titolo: 'Ripartizione dell\'affitto', ok: 'Togli' }))) return;
          const b0 = ctx.data().bookings.find(b => b.id === g.root.id); if (!b0) return; const c = JSON.parse(JSON.stringify(b0)); c.ripartizione = null; c.ripartizioneReale = null;
          ctx.store.upsertBooking(c); ctx.toast('Ripartizione tolta'); if (ctx.ridisegna) ctx.ridisegna(); }; }
      if ($('#pd-exp', root)) $('#pd-exp', root).onclick = () => A.openExport({ villa: x.villaId, pid: x.gen ? '__gen' : x.old ? x.chiave.split('|').slice(2).join('|') : x.b.id });
      if ($('#pd-mod', root)) $('#pd-mod', root).onclick = () => ctx.openBooking({ id: x.b.id });
      const pdC = $('#pd-contr', root); if (pdC) { const info = () => ctx.contrInfo && ctx.contrInfo(x.b.id).then(t => { pdC.textContent = t ? 'Contratto · ' + t : 'Contratto'; }); info(); pdC.onclick = () => ctx.contratto(x.b, info); }
    }

    render();
    return { render };
  }

  /* finestra "Account e assegnazioni" (app Scontrini), aperta dalla pagina Prenotazioni o da Impostazioni → Account */
  let selAcc = '';
  function openAssign(ctx, email) {
    const { data, store, esc, $, $$ } = ctx;
    const ville = () => data().villas.slice().sort((a, b) => String(a.name).localeCompare(String(b.name), 'it', { numeric: true }));
    if (email) selAcc = email;
    // account abilitati all'app Scontrini (meta/accessi)
    const scAccounts = () => (((data().accessi || {}).utenti) || []).filter(u => (u.app || []).includes('scontrini'));
      const dlg = $('#dlg');
      let q = '';
      const accs = () => (data().assegnazioni || []);
      const save = l => store.setAssegnazioni(l);
      /* elenco = gli account abilitati all'app Scontrini (Impostazioni → Account autorizzati), con le loro assegnazioni;
         più quelli che hanno ancora assegnazioni ma non sono più abilitati (si possono togliere) */
      const elenco = () => {
        const as = accs(), out = scAccounts().map(u => { const e = String(u.email || '').toLowerCase(); const a = as.find(x => x.email === e) || {};
          return { email: e, nome: u.nome || a.nome || '', ville: a.ville || [], prenotazioni: a.prenotazioni || [], abilitato: true }; });
        as.filter(a => !out.some(x => x.email === a.email)).forEach(a => out.push(Object.assign({}, a, { abilitato: false })));
        return out;
      };
      const draw = () => {
        const list = elenco();
        if (selAcc && !list.some(a => a.email === selAcc)) selAcc = '';
        if (!selAcc && list.length) selAcc = list[0].email;
        const acc = list.find(a => a.email === selAcc);
        const vSet = new Set(acc ? acc.ville || [] : []), bSet = new Set(acc ? acc.prenotazioni || [] : []);
        const bookings = data().bookings;
        const vl = ville().filter(v => !q || String(v.name).toLowerCase().includes(q) || bookings.some(b => b.villaId === v.id && String(b.cliente || '').toLowerCase().includes(q)));
        const nAss = a => (a.ville || []).length + ' ville · ' + (a.prenotazioni || []).length + ' prenotazioni';
        dlg.innerHTML = `<div class="dlg assign">
          <h3>Account e assegnazioni</h3>
          <p class="note">Qui ci sono tutti gli account abilitati all'app Scontrini in Impostazioni → Account autorizzati. Ognuno vede nell'app Scontrini solo le ville e le prenotazioni spuntate qui; senza nessuna spunta non vede niente.</p>
          <div class="as-accs">${list.map(a => `<button type="button" class="fav-chip ${a.email === selAcc ? 'on' : ''}${a.abilitato ? '' : ' off'}" data-acc="${esc(a.email)}">${esc(a.nome || a.email)} <em>${esc(a.abilitato ? nAss(a) : 'non più abilitato')}</em></button>`).join('')}</div>
          ${!list.length ? '<div class="warn">Nessun account abilitato all\'app Scontrini. Abilitalo in Impostazioni → Account autorizzati (app "Scontrini") e comparirà qui.</div>' : ''}
          ${acc ? `<div class="as-head"><div><b>${esc(acc.nome || acc.email)}</b><small>${esc(acc.email)}${acc.abilitato ? '' : ' · non più abilitato all\'app Scontrini'}</small></div>${acc.abilitato ? ((acc.ville || []).length || (acc.prenotazioni || []).length ? '<button type="button" class="btn small" id="as-rm">Togli tutte le spunte</button>' : '') : '<button type="button" class="btn small danger" id="as-rm">Togli dall\'elenco</button>'}</div>
          <input type="search" id="as-q" placeholder="Cerca villa o cliente" value="${esc(q)}">
          ${(() => {
            // due blocchi: ville con qualcosa di assegnato (tutta la villa o alcune prenotazioni) e, sotto, quelle da assegnare
            const riga = v => {
            const bs = bookings.filter(b => b.villaId === v.id && b.status !== 'richiesta').sort((x, y) => String(y.from).localeCompare(String(x.from)));
            const all = vSet.has(v.id); const nb = bs.filter(b => bSet.has(b.id)).length;
            return `<details class="as-villa${all || nb ? ' has' : ''}${bs.length ? ' can-open' : ''}" ${q || nb ? 'open' : ''}><summary><label class="as-check" onclick="event.stopPropagation()"><input type="checkbox" data-av="${esc(v.id)}" ${all ? 'checked' : ''}> <b>${esc(v.name)}</b></label><span>${all ? 'tutta la villa' : nb ? nb + (nb === 1 ? ' prenotazione' : ' prenotazioni') + ' su ' + bs.length : bs.length ? bs.length + (bs.length === 1 ? ' prenotazione' : ' prenotazioni') : 'nessuna prenotazione'}</span></summary>
              ${bs.length ? `<div class="as-bks">${bs.map(b => `<label class="as-check"><input type="checkbox" data-ab="${esc(b.id)}" ${all || bSet.has(b.id) ? 'checked' : ''} ${all ? 'disabled' : ''}> ${esc((b.cliente || '').trim() || 'Senza nome')} · ${dataBreve(b.from)} → ${dataBreve(b.to)}</label>`).join('')}</div>` : ''}
            </details>`;
          };
            // sopra: una riga per ogni assegnazione (villa intera o singola prenotazione), togliendo la spunta si toglie;
            // sotto: tutte le ville, con le loro prenotazioni, per assegnare
            const vNome = id => (data().villas.find(v => v.id === id) || {}).name || id;
            const okQ = (vid, cli) => !q || String(vNome(vid)).toLowerCase().includes(q) || String(cli || '').toLowerCase().includes(q);
            const intere = [...vSet].filter(id => okQ(id, '')).sort((x, y) => String(vNome(x)).localeCompare(String(vNome(y)), 'it', { numeric: true }));
            const singole = bookings.filter(b => bSet.has(b.id) && !vSet.has(b.villaId) && okQ(b.villaId, b.cliente))
              .sort((x, y) => String(vNome(x.villaId)).localeCompare(String(vNome(y.villaId)), 'it', { numeric: true }) || String(x.from).localeCompare(String(y.from)));
            const nAss2 = intere.length + singole.length;
            const righe = intere.map(id => `<label class="as-row"><input type="checkbox" data-av="${esc(id)}" checked><b>${esc(vNome(id))}</b><span>tutta la villa</span></label>`).join('')
              + singole.map(b => `<label class="as-row"><input type="checkbox" data-ab="${esc(b.id)}" checked><b>${esc(vNome(b.villaId))}</b><span>${esc((b.cliente || '').trim() || 'Senza nome')} · ${dataBreve(b.from)} → ${dataBreve(b.to)}</span></label>`).join('');
            return `<h4 class="as-tit">Assegnate <span>${nAss2}</span></h4><div class="as-list as-si">${righe || '<p class="note">Nessuna villa o prenotazione assegnata.</p>'}</div>
              <h4 class="as-tit">Da assegnare <span>${vl.length} ville</span></h4><div class="as-list as-no">${vl.map(riga).join('') || '<p class="note">Nessuna villa.</p>'}</div>`;
          })()}` : ''}
          <div class="foot"><button type="button" class="btn primary" id="as-ok">Fatto</button></div></div>`;
        // la prima spunta crea da sola la riga dell'account in meta/assegnazioni
        const upd = fn => { const l = JSON.parse(JSON.stringify(accs())); let a = l.find(x => x.email === selAcc);
          if (!a) { const u = list.find(x => x.email === selAcc); if (!u) return; a = { email: u.email, nome: u.nome || '', ville: [], prenotazioni: [] }; l.push(a); }
          a.ville = a.ville || []; a.prenotazioni = a.prenotazioni || []; fn(a); save(l); draw(); };
        $$('#dlg [data-acc]').forEach(b => b.onclick = () => { selAcc = b.dataset.acc; draw(); });
        const rm = $('#as-rm'); if (rm) rm.onclick = () => {
          if (acc.abilitato) { upd(a => { a.ville = []; a.prenotazioni = []; }); return; }
          rm.outerHTML = `<span class="as-rmq">Togliere le sue assegnazioni? <button type="button" class="btn small danger solid" id="as-rmok">Togli</button></span>`;
          $('#as-rmok').onclick = () => { save(accs().filter(a => a.email !== selAcc)); selAcc = ''; draw(); };
        };
        const qi = $('#as-q'); if (qi) qi.oninput = e => { q = e.target.value.trim().toLowerCase(); const pos = e.target.selectionStart; draw(); const n = $('#as-q'); n.focus(); n.setSelectionRange(pos, pos); };
        $$('#dlg [data-av]').forEach(cb => cb.onchange = () => upd(a => { a.ville = a.ville.filter(id => id !== cb.dataset.av); if (cb.checked) a.ville.push(cb.dataset.av); }));
        $$('#dlg [data-ab]').forEach(cb => cb.onchange = () => upd(a => { a.prenotazioni = a.prenotazioni.filter(id => id !== cb.dataset.ab); if (cb.checked) a.prenotazioni.push(cb.dataset.ab); }));
        $('#as-ok').onclick = () => dlg.close();
      };
      draw();
      if (!dlg.open) { if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', ''); }
    }


  window.SDBSpese = { mount, openAssign, trovaPren, totaleBooking, totaleVillaAnno, euro };
})();
