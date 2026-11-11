/*
 * Archivio dati dell'app.
 *  - Modalità LOCALE: se firebase-config.js è vuoto, i dati restano in questo browser.
 *  - Modalità ONLINE: se firebase-config.js contiene la configurazione, i dati stanno
 *    in Cloud Firestore, protetti da accesso Google + regole di sicurezza (firestore.rules).
 *
 * Interfaccia comune (usata da app.js):
 *   ready (Promise)  get()  upsertVilla(v)  removeVilla(id)  upsertBooking(b)  removeBooking(id)
 *   setSettings(s)  setNotes(t)  mergeAll(data)  resetToSeed() [solo locale]  subscribe(fn)  signOut()
 *   mode: 'local' | 'online'   user: email dell'account collegato
 */
(function () {
  const KEY = 'summer-db-2027';
  const clone = x => JSON.parse(JSON.stringify(x));
  const strip = x => JSON.parse(JSON.stringify(x, (k, v) => (v === undefined ? null : v)));

  function emptyState() {
    return { version: 1, villas: [], bookings: [], notes: '', preferiti: [], assegnazioni: [], settings: window.SDB.defaultSettings(), updatedAt: Date.now() };
  }
  function fromSeed() {
    const s = window.SDB_SEED;
    if (!s) return emptyState();
    return Object.assign(emptyState(), { villas: clone(s.villas || []), bookings: clone(s.bookings || []), notes: s.notes || '' });
  }

  /* ------------------------------------------------------------------ LOCALE */
  function LocalStore() {
    let state = null, canPersist = true;
    const subs = new Set();
    const read = () => { try { const raw = localStorage.getItem(KEY); if (raw) return JSON.parse(raw); } catch (e) { canPersist = false; } return null; };
    const persist = () => {
      state.updatedAt = Date.now();
      try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { canPersist = false; }
      subs.forEach(fn => fn(state));
    };
    state = read() || fromSeed();
    if (!state.settings) state.settings = window.SDB.defaultSettings();
    if (!read()) persist();
    try {
      window.addEventListener('storage', e => {
        if (e.key !== KEY || !e.newValue) return;
        try { state = JSON.parse(e.newValue); subs.forEach(fn => fn(state, 'remote')); } catch (_) {}
      });
    } catch (_) {}
    const upsert = (list, item) => { const i = list.findIndex(x => x.id === item.id); if (i >= 0) list[i] = item; else list.push(item); };
    return {
      mode: 'local', ready: Promise.resolve(),
      get canPersist() { return canPersist; },
      get: () => state,
      upsertVilla(v) { upsert(state.villas, v); persist(); },
      removeVilla(id) { state.villas = state.villas.filter(v => v.id !== id); state.bookings = state.bookings.filter(b => b.villaId !== id); persist(); },
      upsertBooking(b) { upsert(state.bookings, b); persist(); },
      removeBooking(id) { state.bookings = state.bookings.filter(b => b.id !== id); persist(); },
      setSettings(s) { state.settings = s; persist(); },
      setNotes(t) { state.notes = t; persist(); },
      setPreferiti(l) { state.preferiti = l; persist(); },
      setSicurezza(x) { state.sicurezza = x; persist(); },
      // pulizia di fine stagione (protetta da password nell'interfaccia)
      wipeBookings() { const n = state.bookings.length; state.bookings = []; (state.assegnazioni || []).forEach(a => { a.prenotazioni = []; }); persist(); return Promise.resolve(n); },
      setAssegnazioni(l) { state.assegnazioni = l; persist(); },
      setProfili(m) { state.profili = m; persist(); return Promise.resolve(); },
      separaCampi() { return Promise.reject(new Error('non disponibile senza i dati online')); },
      replaceAll(data) { state = Object.assign(emptyState(), clone(data)); if (!state.settings) state.settings = window.SDB.defaultSettings(); persist(); },
      mergeAll(data) {
        const d = clone(data);
        (d.villas || []).forEach(v => v && v.id && upsert(state.villas, v));
        (d.bookings || []).forEach(b => b && b.id && upsert(state.bookings, b));
        if (d.settings) state.settings = d.settings;
        if (typeof d.notes === 'string') state.notes = d.notes;
        persist();
        return { villas: (d.villas || []).length, bookings: (d.bookings || []).length };
      },
      resetToSeed() { state = fromSeed(); persist(); },
      subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
      signOut() {}
    };
  }

  /* ------------------------------------------------------------------ ONLINE */
  function loginScreen(html) {
    const el = document.getElementById('app');
    el.innerHTML = `<div class="login"><div class="login-card">
      <div class="login-brand"><img src="icons/logo-240.png" alt="Esmeralda Luxury Villas" width="120" height="120"><b>Summer Database</b><span>Ville · Disponibilità & listini</span></div>${html}</div></div>`;
    return el;
  }

  function FirebaseStore(cfg) {
    firebase.initializeApp(cfg);
    const auth = firebase.auth(), db = firebase.firestore();
    // "Resta collegato": accesso salvato sul dispositivo (si riapre l'app già collegati) oppure solo per questa sessione
    const KEEPKEY = 'summer-db-resta-collegato';
    const keepOn = () => { try { return localStorage.getItem(KEEPKEY) !== 'no'; } catch (_) { return true; } };
    try { auth.setPersistence(keepOn() ? firebase.auth.Auth.Persistence.LOCAL : firebase.auth.Auth.Persistence.SESSION).catch(() => {}); } catch (_) {}
    try { db.enablePersistence({ synchronizeTabs: true }).catch(() => {}); } catch (_) {}
    let state = emptyState();
    const subs = new Set();
    const api = {
      mode: 'online', user: '', online: navigator.onLine, canPersist: true,
      get: () => state,
      subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
      // uscendo cancello anche la copia dei dati salvata sul dispositivo
      signOut() { wipeAndSignOut().then(() => location.reload()); }
    };
    const OKKEY = 'summer-db-autorizzato';
    const markOk = email => { try { localStorage.setItem(OKKEY, String(email).toLowerCase()); } catch (_) {} };
    const wasOk = email => { try { return localStorage.getItem(OKKEY) === String(email).toLowerCase(); } catch (_) { return false; } };
    const forgetOk = () => { try { localStorage.removeItem(OKKEY); } catch (_) {} };
    async function wipeAndSignOut() {
      forgetOk();
      try { await auth.signOut(); } catch (_) {}
      try { await db.terminate(); await db.clearPersistence(); } catch (_) {}
    }
    window.addEventListener('online', () => { api.online = true; });
    window.addEventListener('offline', () => { api.online = false; });
    const emit = origin => subs.forEach(fn => fn(state, origin));
    const fail = err => { console.error(err); showError(err); };
    function showError(err) {
      let t = document.querySelector('.toast');
      if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
      t.hidden = false;
      t.textContent = err && err.code === 'permission-denied' ? 'Salvataggio rifiutato: questo account non è autorizzato.' : 'Salvataggio non riuscito: ' + (err && err.message || err);
      setTimeout(() => { t.hidden = true; }, 5000);
    }
    const upsertLocal = (list, item) => { const i = list.findIndex(x => x.id === item.id); if (i >= 0) list[i] = item; else list.push(item); };
    const FV = () => firebase.firestore.FieldValue;
    const col = c => db.collection(c);

    /* ---------------- Profili e dati protetti ----------------
       Con la protezione attiva (meta/profili.protezione) i dati sensibili stanno in collezioni a parte:
         villas/{id}             dati della villa + "listino" (solo prezzi di vendita già calcolati)
         villas_acquisto/{id}    { villaId, pricing }  prezzi di acquisto e parametri della formula
         bookings/{id}           prenotazione senza prezzi di acquisto (campi letti dalle altre app invariati)
         bookings_acquisto/{id}  { villaId, prezzoAcquisto, servizi: { chiave: acquisto } }
         occupazione/{villaId}   { villaId, periodi: [{ from, to, earlyIn, lateOut }] }  per i profili "solo ND"
       Le regole Firestore danno a ogni profilo solo le collezioni e le ville che gli spettano. */
    const raw = { villas: {}, villasAcq: {}, villasRis: {}, villasCampi: {}, bookings: {}, bookingsAcq: {}, occ: {} };
    /* Campi della scheda che un profilo può non vedere (S.CAMPI_SCHEDA).
       Con meta/profili.campiSeparati ogni campo sta in villas_campi/{villaId}/campi/{campo} = { villaId, valore }:
       le regole danno a ogni profilo solo i campi che non ha tra i "nascosti".
       (villas_riservati / campiRiservati: versione precedente, un blocco unico; viene convertita dal pulsante.) */
    const CAMPI = window.SDB.CAMPI_SCHEDA.map(c => c[0]);
    const separati = () => !!state.campiSeparati;
    const riservati = () => separati() ? CAMPI : (Array.isArray(state.campiRiservati) ? state.campiRiservati : []);
    const nascosti = () => prof.full ? [] : (prof.nascosti || []);
    const campoPath = (villaId) => 'villas_campi/' + villaId + '/campi';
    let prof = { full: true, admin: false, none: false, acquisto: true, modifica: true, dettaglio: true, pagine: null, ville: [], id: '' };
    const protetto = () => !!state.protezione;
    const canAcq = () => prof.full || prof.acquisto;
    const S = window.SDB;
    function listinoOf(v) {
      const out = {};
      S.TARIFFE.forEach(t => {
        const p = v.pricing && v.pricing[t.key]; if (!p) return;
        out[t.key] = (p.acquisto || []).map((a, i) => { const x = S.salePrice(a, p, p.rettifica ? p.rettifica[i] : 0, p.fisso ? p.fisso[i] : null); return x === undefined ? null : x; });
      });
      return out;
    }
    const villaPub = v => { const x = clone(v); delete x.pricing; x.listino = listinoOf(v); riservati().forEach(k => { delete x[k]; }); return x; };
    // valore di un campo separato: il listino si ricalcola sempre dai prezzi di acquisto
    const valOf = (v, k) => k === 'listino' ? (v.pricing ? listinoOf(v) : (v.listino || {})) : (v[k] === undefined || v[k] === null ? '' : v[k]);
    const villaRis = v => { const x = { villaId: v.id }; riservati().forEach(k => { if (v[k] !== undefined) x[k] = v[k]; }); return x; };
    const villaPriv = v => ({ villaId: v.id, pricing: clone(v.pricing || {}) });
    const bookingPub = b => { const x = clone(b); delete x.prezzoAcquisto; delete x._nd; if (x.serviziDett) Object.keys(x.serviziDett).forEach(k => { if (x.serviziDett[k]) delete x.serviziDett[k].acquisto; }); return x; };
    const bookingPriv = b => { const servizi = {}; Object.keys(b.serviziDett || {}).forEach(k => { const d = b.serviziDett[k]; if (d && typeof d.acquisto === 'number') servizi[k] = d.acquisto; }); return { villaId: b.villaId, prezzoAcquisto: typeof b.prezzoAcquisto === 'number' ? b.prezzoAcquisto : null, servizi }; };
    const blocca = st => { if (st === 'richiesta') return false; const c = ((state.settings || {}).stati || []).find(x => x && x.key === st); if (c && typeof c.blocks === 'boolean') return c.blocks; const b = S.STATI.find(x => x.key === st); return b ? b.blocks : true; };
    const occOf = villaId => ({ villaId, periodi: Object.values(raw.bookings).filter(b => b.villaId === villaId && blocca(b.status)).sort((a, b) => (a.from < b.from ? -1 : 1)).map(b => ({ from: b.from, to: b.to, earlyIn: !!b.earlyIn, lateOut: !!b.lateOut })) });
    const sameOcc = (a, b) => JSON.stringify((a && a.periodi) || []) === JSON.stringify((b && b.periodi) || []);
    // ricompongo ville e prenotazioni per l'app, togliendo quello che il profilo non deve vedere
    function rebuild() {
      state.villas = Object.values(raw.villas).map(v => {
        const x = clone(v); const a = raw.villasAcq[v.id]; const r = raw.villasRis[v.id]; const c = raw.villasCampi[v.id];
        if (r) Object.keys(r).forEach(k => { if (k !== 'villaId') x[k] = r[k]; });
        if (c) Object.keys(c).forEach(k => { x[k] = c[k]; });
        nascosti().forEach(k => { delete x[k]; });
        if (nascosti().includes('listino')) { delete x.pricing; delete x.listino; return x; }
        if (a && a.pricing) x.pricing = a.pricing;
        if (x.pricing && (!x.listino || !Object.keys(x.listino).length)) x.listino = listinoOf(x);
        if (!canAcq()) delete x.pricing;
        return x;
      });
      if (!prof.full && !prof.dettaglio) {
        // solo ND: periodi occupati senza alcun dettaglio
        const src = protetto() ? Object.values(raw.occ) : Object.keys(raw.villas).map(occOf);
        state.bookings = [];
        src.forEach(o => (o.periodi || []).forEach((p, i) => state.bookings.push({ id: 'nd-' + o.villaId + '-' + i, villaId: o.villaId, from: p.from, to: p.to, earlyIn: !!p.earlyIn, lateOut: !!p.lateOut, status: '_nd', _nd: true, cliente: '', note: '' })));
        return;
      }
      state.bookings = Object.values(raw.bookings).map(b => {
        const x = clone(b); const a = raw.bookingsAcq[b.id];
        if (a) {
          if (typeof a.prezzoAcquisto === 'number') x.prezzoAcquisto = a.prezzoAcquisto;
          Object.keys(a.servizi || {}).forEach(k => { x.serviziDett = x.serviziDett || {}; x.serviziDett[k] = Object.assign({}, x.serviziDett[k] || {}, { acquisto: a.servizi[k] }); });
        }
        if (!canAcq()) { delete x.prezzoAcquisto; if (x.serviziDett) Object.keys(x.serviziDett).forEach(k => { if (x.serviziDett[k]) delete x.serviziDett[k].acquisto; }); }
        return x;
      });
    }
    // occupazione: la tiene aggiornata chi modifica le prenotazioni; chi ha accesso completo la riallinea
    function writeOcc(villaId) { if (!protetto() || !villaId) return; const o = occOf(villaId); if (sameOcc(o, raw.occ[villaId])) return; raw.occ[villaId] = o; col('occupazione').doc(villaId).set(o).catch(fail); }
    let occT; const reconcileOcc = () => { if (!prof.full || !protetto()) return; clearTimeout(occT); occT = setTimeout(() => { Object.keys(raw.villas).forEach(writeOcc); }, 1500); };

    // proprietà calcolate (Object.assign copierebbe solo il valore del momento)
    Object.defineProperty(api, 'profile', { get: () => prof });
    Object.defineProperty(api, 'needsProtection', { get: () => !protetto() && (Object.values(raw.villas).some(v => v.pricing) || Object.values(raw.bookings).some(b => typeof b.prezzoAcquisto === 'number')) });
    // scritture: aggiorno subito lo stato locale, poi Firestore (che funziona anche offline e sincronizza dopo)
    Object.assign(api, {
      upsertVilla(v) {
        if (protetto()) {
          raw.villas[v.id] = villaPub(v); raw.villasAcq[v.id] = villaPriv(v);
          const b = db.batch(); b.set(col('villas_acquisto').doc(v.id), strip(villaPriv(v)));
          if (separati()) {
            const cur = raw.villasCampi[v.id] = raw.villasCampi[v.id] || {};
            CAMPI.forEach(k => { const val = valOf(v, k); if (JSON.stringify(cur[k]) !== JSON.stringify(val)) { cur[k] = val; b.set(col(campoPath(v.id)).doc(k), strip({ villaId: v.id, valore: val })); } });
          } else if (riservati().length) { raw.villasRis[v.id] = villaRis(v); b.set(col('villas_riservati').doc(v.id), strip(villaRis(v))); }
          b.set(col('villas').doc(v.id), strip(villaPub(v))); b.commit().catch(fail);
        } else { const x = Object.assign(clone(v), { listino: listinoOf(v) }); raw.villas[v.id] = x; col('villas').doc(v.id).set(strip(x)).catch(fail); }
        rebuild(); emit('local');
      },
      removeVilla(id) {
        const bk = Object.values(raw.bookings).filter(b => b.villaId === id);
        delete raw.villas[id]; delete raw.villasAcq[id]; delete raw.villasRis[id]; delete raw.occ[id]; bk.forEach(b => { delete raw.bookings[b.id]; delete raw.bookingsAcq[b.id]; });
        const batch = db.batch(); batch.delete(col('villas').doc(id));
        if (protetto()) { batch.delete(col('villas_acquisto').doc(id)); batch.delete(col('occupazione').doc(id)); if (separati()) CAMPI.forEach(k => batch.delete(col(campoPath(id)).doc(k))); else if (riservati().length) batch.delete(col('villas_riservati').doc(id)); }
        delete raw.villasCampi[id];
        bk.forEach(b => { batch.delete(col('bookings').doc(b.id)); if (protetto()) batch.delete(col('bookings_acquisto').doc(b.id)); });
        batch.commit().catch(fail); rebuild(); emit('local');
      },
      upsertBooking(b0) {
        const b = clone(b0); delete b._nd;
        const old = raw.bookings[b.id]; const oldVilla = old && old.villaId;
        // chi non vede i prezzi di acquisto non deve cancellarli salvando
        if (!canAcq() && !protetto() && old) {
          if ('prezzoAcquisto' in old) b.prezzoAcquisto = old.prezzoAcquisto;
          Object.keys(old.serviziDett || {}).forEach(k => { const d = old.serviziDett[k]; if (d && 'acquisto' in d) { b.serviziDett = b.serviziDett || {}; b.serviziDett[k] = Object.assign({}, b.serviziDett[k] || {}, { acquisto: d.acquisto }); } });
        }
        if (protetto()) {
          raw.bookings[b.id] = bookingPub(b);
          const batch = db.batch(); batch.set(col('bookings').doc(b.id), strip(bookingPub(b)));
          if (canAcq()) { raw.bookingsAcq[b.id] = bookingPriv(b); batch.set(col('bookings_acquisto').doc(b.id), strip(bookingPriv(b))); }
          batch.commit().catch(fail);
          writeOcc(b.villaId); if (oldVilla && oldVilla !== b.villaId) writeOcc(oldVilla);
        } else { raw.bookings[b.id] = b; col('bookings').doc(b.id).set(strip(b)).catch(fail); }
        rebuild(); emit('local');
      },
      removeBooking(id) {
        const old = raw.bookings[id]; delete raw.bookings[id]; delete raw.bookingsAcq[id];
        col('bookings').doc(id).delete().catch(fail);
        if (protetto()) { if (canAcq()) col('bookings_acquisto').doc(id).delete().catch(() => {}); if (old) writeOcc(old.villaId); }
        rebuild(); emit('local');
      },
      setSettings(s) { state.settings = s; col('meta').doc('settings').set(strip(s)).catch(fail); emit('local'); },
      setNotes(t) { state.notes = t; col('meta').doc('notes').set({ text: t }).catch(fail); emit('local'); },
      // elenchi dei preferiti, condivisi tra gli account: meta/preferiti
      setPreferiti(l) { state.preferiti = l; col('meta').doc('preferiti').set({ liste: strip(l) }).catch(fail); emit('local'); },
      // account dell'app Scontrini con le ville/prenotazioni assegnate: meta/assegnazioni (letto anche dall'app Scontrini)
      setAssegnazioni(l) { state.assegnazioni = l; col('meta').doc('assegnazioni').set({ account: strip(l), aggiornatoDa: api.user || '', aggiornatoIl: FV().serverTimestamp() }).catch(fail); emit('local'); },
      // Import di un backup: AGGIUNGE e AGGIORNA ville e prenotazioni, non cancella mai nulla (ID stabili, scontrini collegati al sicuro).
      // Agisce SOLO su villas, bookings (e le loro parti protette) e meta. Le collezioni scontrini / scontrini_foto (altre app) non vanno mai toccate.
      async mergeAll(data) {
        const d = clone(data);
        const ops = [];
        (d.villas || []).forEach(v => { if (!v || !v.id) return; if (protetto()) { ops.push(['villas_acquisto', v.id, villaPriv(v)]); if (separati()) CAMPI.forEach(k => ops.push([campoPath(v.id), k, { villaId: v.id, valore: valOf(v, k) }])); else if (riservati().length) ops.push(['villas_riservati', v.id, villaRis(v)]); ops.push(['villas', v.id, villaPub(v)]); } else ops.push(['villas', v.id, Object.assign(clone(v), { listino: listinoOf(v) })]); });
        (d.bookings || []).forEach(b => { if (!b || !b.id) return; if (protetto()) { ops.push(['bookings_acquisto', b.id, bookingPriv(b)]); ops.push(['bookings', b.id, bookingPub(b)]); } else ops.push(['bookings', b.id, b]); });
        if (d.settings) ops.push(['meta', 'settings', d.settings]);
        if (typeof d.notes === 'string') ops.push(['meta', 'notes', { text: d.notes }]);
        for (let i = 0; i < ops.length; i += 400) {
          const batch = db.batch();
          ops.slice(i, i + 400).forEach(([c, id, val]) => batch.set(col(c).doc(id), strip(val)));
          await batch.commit();
        }
        ops.forEach(([c, id, val]) => { if (c === 'villas') raw.villas[id] = val; if (c === 'villas_acquisto') raw.villasAcq[id] = val; if (c === 'villas_riservati') raw.villasRis[id] = val; if (/^villas_campi\//.test(c)) { const vid = c.split('/')[1]; (raw.villasCampi[vid] = raw.villasCampi[vid] || {})[id] = val.valore; } if (c === 'bookings') raw.bookings[id] = val; if (c === 'bookings_acquisto') raw.bookingsAcq[id] = val; });
        if (d.settings) state.settings = Object.assign(window.SDB.defaultSettings(), d.settings);
        if (typeof d.notes === 'string') state.notes = d.notes;
        rebuild(); reconcileOcc(); emit('local');
        return { villas: (d.villas || []).length, bookings: (d.bookings || []).length };
      },
      resetToSeed() { return Promise.reject(new Error('non disponibile online')); },
      /* Protezione dei dati (una volta sola, da un amministratore, dopo aver pubblicato le nuove regole):
         copia prezzi di acquisto e dettagli riservati nelle collezioni protette, poi li toglie da villas e bookings.
         Prima scrive le copie protette: se le regole non sono ancora pubblicate si ferma senza togliere nulla. */
      async protectData(onStep) {
        const step = t => { if (onStep) onStep(t); };
        const run = async ops => { for (let i = 0; i < ops.length; i += 400) { const b = db.batch(); ops.slice(i, i + 400).forEach(([c, id, val]) => b.set(col(c).doc(id), strip(val))); await b.commit(); } };
        const villas = Object.values(raw.villas).map(v => Object.assign(clone(v), raw.villasAcq[v.id] && !v.pricing ? { pricing: raw.villasAcq[v.id].pricing } : {}));
        const books = Object.values(raw.bookings).map(b => { const x = clone(b); const a = raw.bookingsAcq[b.id]; if (a && typeof x.prezzoAcquisto !== 'number') x.prezzoAcquisto = a.prezzoAcquisto; return x; });
        step('Copia dei prezzi di acquisto nelle collezioni protette…');
        await run(villas.map(v => ['villas_acquisto', v.id, villaPriv(v)]).concat(books.map(b => ['bookings_acquisto', b.id, bookingPriv(b)])));
        step('Pulizia delle schede ville e delle prenotazioni…');
        await run(villas.map(v => ['villas', v.id, villaPub(v)]).concat(books.map(b => ['bookings', b.id, bookingPub(b)])));
        villas.forEach(v => { raw.villas[v.id] = villaPub(v); raw.villasAcq[v.id] = villaPriv(v); });
        books.forEach(b => { raw.bookings[b.id] = bookingPub(b); raw.bookingsAcq[b.id] = bookingPriv(b); });
        step('Calendario per i profili senza dettagli…');
        await run(villas.map(v => ['occupazione', v.id, occOf(v.id)]));
        await col('meta').doc('profili').set({ protezione: true, protezioneDa: api.user || '', protezioneIl: FV().serverTimestamp() }, { merge: true });
        state.protezione = true; rebuild(); emit('local');
        return { villas: villas.length, bookings: books.length };
      },
      /* Campi della scheda per profilo (una volta sola, dopo aver pubblicato le regole aggiornate):
         scrive ogni campo in villas_campi/{villaId}/campi/{campo}, poi toglie quei campi da villas,
         cancella i vecchi villas_riservati e fissa per ogni profilo l'elenco dei campi nascosti.
         Se le regole non permettono la prima scrittura si ferma senza togliere nulla. */
      async separaCampi(onStep) {
        if (!protetto()) throw new Error('Attiva prima la protezione dei dati');
        const step = t => { if (onStep) onStep(t); };
        const run = async ops => { for (let i = 0; i < ops.length; i += 400) { const b = db.batch(); ops.slice(i, i + 400).forEach(([c, id, val]) => val === null ? b.delete(col(c).doc(id)) : b.set(col(c).doc(id), strip(val))); await b.commit(); } };
        const full = Object.values(raw.villas).map(v => { const x = clone(v); const r = raw.villasRis[v.id]; if (r) Object.keys(r).forEach(k => { if (k !== 'villaId') x[k] = r[k]; }); const a = raw.villasAcq[v.id]; if (a && a.pricing) x.pricing = a.pricing; return x; });
        step('Copia dei campi della scheda…');
        await run([].concat(...full.map(v => CAMPI.map(k => [campoPath(v.id), k, { villaId: v.id, valore: valOf(v, k) }]))));
        const prev = state.campiSeparati; state.campiSeparati = true;
        try {
          step('Aggiornamento delle schede…');
          await run(full.map(v => ['villas', v.id, villaPub(v)]));
          const old = Object.keys(raw.villasRis); if (old.length) { step('Pulizia della versione precedente…'); await run(old.map(id => ['villas_riservati', id, null])).catch(() => {}); }
          const pm = clone(state.profili || {}); Object.keys(pm).forEach(k => { pm[k].nascosti = window.SDB.nascostiDi(pm[k]); delete pm[k].scheda; });
          await col('meta').doc('profili').set({ campiSeparati: true }, { merge: true });
          await col('meta').doc('profili').update({ profili: strip(pm) });
          state.profili = pm;
        } catch (e) { state.campiSeparati = prev; throw e; }
        full.forEach(v => { raw.villas[v.id] = villaPub(v); const m = {}; CAMPI.forEach(k => { m[k] = valOf(v, k); }); raw.villasCampi[v.id] = m; });
        raw.villasRis = {};
        rebuild(); emit('local');
        return full.length;
      },
      // profili utente: meta/profili.profili = { id: { nome, completo, acquisto, modifica, dettaglio, pagine, ville } }
      setProfili(map) {
        state.profili = clone(map);
        emit('local');
        return col('meta').doc('profili').set({ profili: strip(map), aggiornatoDa: api.user || '', aggiornatoIl: FV().serverTimestamp() }, { merge: true })
          .then(() => col('meta').doc('profili').update({ profili: strip(map) }));
      },
      // Scontrini (dell'app Scontrini): lettura, nuova spesa, modifica con storico, allegati, cancellazione.
      listenScontrini(cb, onErr) {
        return db.collection('scontrini').onSnapshot(snap => cb(snap.docs.map(d => Object.assign({}, d.data(), { id: d.id }))), onErr);
      },
      getFoto(id) { return db.collection('scontrini_foto').doc(id).get().then(d => (d.exists ? (d.data() || {}).img || null : null)); },
      // Modifica: aggiorna solo i campi cambiati (update, mai set) e aggiunge la versione precedente a "storico".
      updateScontrino(id, changes, previous) {
        const FV = firebase.firestore.FieldValue;
        const upd = Object.assign({}, strip(changes), { modificatoDa: api.user || '', modificatoIl: FV.serverTimestamp() });
        if (previous) upd.storico = FV.arrayUnion(strip(previous));
        return db.collection('scontrini').doc(id).update(upd);
      },
      // Cancellazione: lo scontrino, la sua foto (stesso ID) e gli eventuali allegati aggiunti da Summer Database.
      async deleteScontrino(id, hasFoto) {
        const all = await db.collection('scontrini_allegati').where('scontrinoId', '==', id).get().then(q => q.docs.map(d => d.id), () => []);
        const batch = db.batch();
        batch.delete(db.collection('scontrini').doc(id));
        if (hasFoto) batch.delete(db.collection('scontrini_foto').doc(id));
        all.forEach(a => batch.delete(db.collection('scontrini_allegati').doc(a)));
        return batch.commit();
      },
      /* Nuova spesa da Summer Database: stessa struttura dell'app Scontrini (scontrini + scontrini_foto con lo stesso ID). */
      addScontrino(dati, foto) {
        const FV = firebase.firestore.FieldValue;
        const ref = db.collection('scontrini').doc();
        const b = db.batch();
        b.set(ref, Object.assign({}, strip(dati), { hasFoto: !!foto, creatoDa: api.user || '', creatoIl: FV.serverTimestamp() }));
        if (foto) b.set(db.collection('scontrini_foto').doc(ref.id), { img: foto });
        return b.commit().then(() => ref.id);
      },
      /* Allegati di uno scontrino. La prima foto va in scontrini_foto/{id} (la vede anche l'app Scontrini);
         gli altri allegati (foto o PDF) in scontrini_allegati/{auto} = { scontrinoId, villaId, nome, tipo, dati, creatoDa, creatoIl },
         con il loro numero in scontrini.allegati. */
      addAllegato(sc, a) {
        const FV = firebase.firestore.FieldValue; const b = db.batch(); const ref = db.collection('scontrini').doc(sc.id);
        if (!sc.hasFoto && a.tipo === 'image/jpeg') { b.set(db.collection('scontrini_foto').doc(sc.id), { img: a.dati }); b.update(ref, { hasFoto: true }); }
        else { b.set(db.collection('scontrini_allegati').doc(), { scontrinoId: sc.id, villaId: sc.villaId || '', nome: a.nome || '', tipo: a.tipo, dati: a.dati, creatoDa: api.user || '', creatoIl: FV.serverTimestamp() }); b.update(ref, { allegati: FV.increment(1) }); }
        return b.commit();
      },
      listAllegati(scontrinoId) {
        return db.collection('scontrini_allegati').where('scontrinoId', '==', scontrinoId).get().then(q => q.docs.map(d => Object.assign({}, d.data(), { id: d.id })).sort((x, y) => String(x.nome).localeCompare(String(y.nome))));
      },
      deleteAllegato(sc, allegatoId) {
        const FV = firebase.firestore.FieldValue; const b = db.batch();
        b.delete(db.collection('scontrini_allegati').doc(allegatoId)); b.update(db.collection('scontrini').doc(sc.id), { allegati: FV.increment(-1) });
        return b.commit();
      },
      setSicurezza(x) { state.sicurezza = x; return db.collection('meta').doc('sicurezza').set(strip(x)); },
      /* Conferma dell'identità prima di reimpostare la password di pulizia: nuovo accesso con Google
         (stesso account già collegato). Se l'account scelto è diverso, Firebase rifiuta. */
      reauthGoogle() {
        const u = auth.currentUser; if (!u) return Promise.reject(new Error('Nessun account collegato'));
        const p = new firebase.auth.GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account', login_hint: u.email || '' });
        return u.reauthenticateWithPopup(p).then(() => u.email);
      },
      /* Account autorizzati (meta/accessi): le regole Firestore leggono "emails" per decidere chi entra.
         Solo gli amministratori scritti nelle regole possono modificarlo. */
      setAccessi(utenti) {
        const clean = utenti.map(u => Object.assign({ email: String(u.email || '').trim().toLowerCase(), nome: u.nome || '', app: Array.isArray(u.app) ? u.app : [] }, u.profilo ? { profilo: u.profilo } : {})).filter(u => u.email);
        const profiloDi = {}; clean.forEach(u => { if (u.profilo) profiloDi[u.email] = u.profilo; });
        // emails: chi entra (regole); scontrini: chi usa le app Scontrini / Spese Ville; profiloDi: profilo di ogni account (regole)
        const doc = { utenti: clean, emails: Array.from(new Set(clean.map(u => u.email))), scontrini: clean.filter(u => u.app.includes('scontrini')).map(u => u.email), profiloDi, aggiornatoDa: api.user || '', aggiornatoIl: FV().serverTimestamp() };
        return col('meta').doc('accessi').set(doc).then(() => { state.accessi = Object.assign({}, doc, { aggiornatoIl: new Date().toISOString() }); emit('local'); });
      },
      /* ---- Pulizia di fine stagione: richiesta esplicitamente dal proprietario, protetta da password nell'interfaccia.
         wipeBookings: cancella tutti i documenti di "bookings" (e svuota le prenotazioni assegnate agli account).
         wipeScontrini: cancella tutti gli scontrini e le loro foto (stesso ID). Nessun'altra collezione viene toccata. ---- */
      async wipeBookings() {
        const cols = protetto() ? ['bookings', 'bookings_acquisto', 'occupazione'] : ['bookings'];
        let n = 0;
        for (const c of cols) {
          const q = await col(c).get(); const ids = q.docs.map(d => d.id); if (c === 'bookings') n = ids.length;
          for (let i = 0; i < ids.length; i += 400) { const b = db.batch(); ids.slice(i, i + 400).forEach(id => b.delete(col(c).doc(id))); await b.commit(); }
        }
        const acc = JSON.parse(JSON.stringify(state.assegnazioni || []));
        if (acc.some(a => (a.prenotazioni || []).length)) { acc.forEach(a => { a.prenotazioni = []; }); await col('meta').doc('assegnazioni').set({ account: acc, aggiornatoDa: api.user || '', aggiornatoIl: FV().serverTimestamp() }); }
        raw.bookings = {}; raw.bookingsAcq = {}; raw.occ = {}; rebuild(); emit('local');
        return n;
      },
      async listScontriniArchivio() {
        const q = await db.collection('scontrini').get();
        return q.docs.map(d => { const x = Object.assign({}, d.data(), { id: d.id }); ['creatoIl', 'modificatoIl'].forEach(k => { if (x[k] && x[k].toDate) x[k] = x[k].toDate().toISOString(); }); return x; });
      },
      async wipeScontrini(list) {
        const ids = list.map(x => x.id);
        // ogni scontrino conta 2 operazioni (scontrino + foto)
        for (let i = 0; i < ids.length; i += 200) { const b = db.batch(); ids.slice(i, i + 200).forEach(id => { b.delete(db.collection('scontrini').doc(id)); b.delete(db.collection('scontrini_foto').doc(id)); }); await b.commit(); }
        // allegati aggiunti da Summer Database
        const al = await db.collection('scontrini_allegati').get().then(q => q.docs.map(d => d.id), () => []);
        for (let i = 0; i < al.length; i += 400) { const b = db.batch(); al.slice(i, i + 400).forEach(id => b.delete(db.collection('scontrini_allegati').doc(id))); await b.commit(); }
        return ids.length;
      },
      /* ---- foto delle ville: villas_foto (immagini) e villas_thumb/{villaId} (copertina piccola per le schede) ----
         Non stanno in "villas" per non appesantire le altre app che leggono quella collezione. */
      listenThumbs(cb, onErr) {
        if (prof.full) return col('villas_thumb').onSnapshot(snap => { const m = {}; snap.docs.forEach(d => { m[d.id] = d.data(); }); cb(m); }, onErr);
        // profilo limitato: solo le copertine delle ville condivise, una per una
        const m = {}; const offs = prof.ville.map(id => col('villas_thumb').doc(id).onSnapshot(d => { if (d.exists) m[id] = d.data(); else delete m[id]; cb(Object.assign({}, m)); }, () => {}));
        cb({}); return () => offs.forEach(f => f());
      },
      listFoto(villaId) {
        return db.collection('villas_foto').where('villaId', '==', villaId).get()
          .then(q => q.docs.map(d => Object.assign({}, d.data(), { id: d.id })).sort((a, b) => (a.ordine || 0) - (b.ordine || 0)));
      },
      async addFoto(villaId, img, thumb, ordine, makeCover) {
        const ref = db.collection('villas_foto').doc();
        await ref.set({ villaId, img, thumb, ordine: ordine || Date.now(), creatoDa: api.user || '', creatoIl: firebase.firestore.FieldValue.serverTimestamp() });
        if (makeCover) await db.collection('villas_thumb').doc(villaId).set({ thumb, fotoId: ref.id });
        return ref.id;
      },
      setCover(villaId, fotoId, thumb) { return db.collection('villas_thumb').doc(villaId).set({ thumb, fotoId }); },
      async deleteFoto(villaId, fotoId, next) {
        await db.collection('villas_foto').doc(fotoId).delete();
        const t = await db.collection('villas_thumb').doc(villaId).get();
        if (t.exists && t.data().fotoId === fotoId) {
          if (next) await db.collection('villas_thumb').doc(villaId).set({ thumb: next.thumb, fotoId: next.id });
          else await db.collection('villas_thumb').doc(villaId).delete();
        }
      }
    });

    api.ready = new Promise(resolve => {
      loginScreen('<p class="login-msg">Caricamento…</p>');
      auth.onAuthStateChanged(user => {
        if (!user) {
          const el = loginScreen(`<p class="login-msg">Accedi con il tuo account Google autorizzato.</p>
            <label class="login-keep"><input type="checkbox" id="login-keep" ${keepOn() ? 'checked' : ''}> <span><b>Resta collegato</b><small>Su questo dispositivo non dovrai accedere ogni volta. Toglilo su computer condivisi.</small></span></label>
            <button class="btn primary login-btn" id="login-google">Accedi con Google</button>
            <p class="login-note" id="login-err"></p>`);
          el.querySelector('#login-google').addEventListener('click', async () => {
            const keep = el.querySelector('#login-keep').checked;
            try { localStorage.setItem(KEEPKEY, keep ? 'si' : 'no'); } catch (_) {}
            try { await auth.setPersistence(keep ? firebase.auth.Auth.Persistence.LOCAL : firebase.auth.Auth.Persistence.SESSION); } catch (_) {}
            const p = new firebase.auth.GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' });
            auth.signInWithPopup(p).catch(err => {
              if (err.code === 'auth/popup-blocked' || err.code === 'auth/operation-not-supported-in-this-environment') return auth.signInWithRedirect(p);
              el.querySelector('#login-err').textContent = 'Accesso non riuscito: ' + err.message;
            });
          });
          return;
        }
        api.user = user.email;
        // 1) nessun dato e nessuna pagina finché il server non conferma che l'account è autorizzato
        let blocked = false, started = false;
        const block = () => {
          if (blocked) return; blocked = true;
          state = emptyState(); subs.clear();
          const email = user.email;
          document.getElementById('app').innerHTML = '';
          wipeAndSignOut().then(() => {
            const el = loginScreen(`<p class="login-msg"><b>${String(email).replace(/[<>&"]/g, '')}</b> non è autorizzato ad accedere.</p>
              <p class="login-note">Accedi con un account autorizzato oppure chiedi all'amministratore.</p>
              <button class="btn primary login-btn" id="login-other">Accedi con un altro account</button>`);
            el.querySelector('#login-other').addEventListener('click', () => location.reload());
          });
        };
        const verify = () => db.collection('meta').doc('settings').get({ source: 'server' }).then(() => true, err => {
          if (err && err.code === 'permission-denied') return false;
          // senza rete: entro solo se questo account era già stato verificato su questo dispositivo
          return wasOk(user.email) ? true : null;
        });
        loginScreen('<p class="login-msg">Verifica dell\'account…</p>');
        verify().then(ok => {
          if (ok === false) { block(); return; }
          if (ok === null) {
            const el = loginScreen(`<p class="login-msg">Serve la connessione per verificare l'account la prima volta.</p><button class="btn" id="login-retry">Riprova</button>`);
            el.querySelector('#login-retry').addEventListener('click', () => location.reload());
            return;
          }
          // account presente nell'elenco ma abilitato solo all'app Scontrini: non entra in Summer Database
          db.collection('meta').doc('accessi').get().then(d => {
            const u = d.exists ? ((d.data() || {}).utenti || []).find(x => String(x.email).toLowerCase() === String(user.email).toLowerCase()) : null;
            if (u && !(u.app || []).includes('summer')) {
              // un amministratore non deve mai restare chiuso fuori: se può scrivere meta/accessi (solo gli
              // amministratori possono), riabilito da solo il suo accesso a Summer Database; altrimenti blocco.
              const fixed = ((d.data() || {}).utenti || []).map(x => String(x.email).toLowerCase() === String(user.email).toLowerCase() ? Object.assign({}, x, { app: Array.from(new Set((x.app || []).concat(['summer']))) }) : x);
              db.collection('meta').doc('accessi').update({ utenti: fixed, aggiornatoDa: user.email, aggiornatoIl: FV().serverTimestamp() })
                .then(() => { markOk(user.email); setAdmin(user.email); begin(); }, () => block());
              return;
            }
            markOk(user.email); begin();
          }, () => { markOk(user.email); begin(); });
        });
        /* Profilo dell'account:
           - non presente nell'elenco account → è un amministratore scritto nelle regole: vede tutto;
           - con un profilo → quello del profilo ("completo" = vede e modifica tutto);
           - senza profilo → se è un amministratore (può scrivere meta/accessi) vede tutto, altrimenti niente. */
        const ADMKEY = 'summer-db-amministratore';
        function setAdmin(e) { try { localStorage.setItem(ADMKEY, String(e).toLowerCase()); } catch (_) {} }
        const isAdminCached = e => { try { return localStorage.getItem(ADMKEY) === String(e).toLowerCase(); } catch (_) { return false; } };
        const email = String(user.email).toLowerCase();
        let mySig = '';
        const FULL = { full: true, admin: false, none: false, scheda: true, nascosti: [], acquisto: true, modifica: true, dettaglio: true, pagine: null, ville: [], id: '' };
        function profileFrom(acc, pm) {
          const u = ((acc || {}).utenti || []).find(x => String(x.email).toLowerCase() === email);
          if (!u) return Object.assign({}, FULL, { admin: true });
          const pr = u.profilo && ((pm || {}).profili || {})[u.profilo];
          if (pr && pr.completo) return Object.assign({}, FULL, { id: u.profilo, nome: pr.nome || '' });
          if (pr) return { full: false, admin: false, none: false, id: u.profilo, nome: pr.nome || '', scheda: !!pr.scheda, nascosti: window.SDB.nascostiDi(pr), acquisto: !!pr.acquisto, dettaglio: !!pr.dettaglio, modifica: !!pr.modifica && !!pr.dettaglio, pagine: Array.isArray(pr.pagine) ? pr.pagine : [], ville: Array.isArray(pr.ville) ? pr.ville.slice() : [] };
          return { full: false, admin: false, none: true, id: '', acquisto: false, dettaglio: false, modifica: false, pagine: [], ville: [] };
        }
        const sigOf = p => JSON.stringify([p.full, p.none, p.id, (p.nascosti || []).slice().sort(), p.acquisto, p.dettaglio, p.modifica, p.pagine, (p.ville || []).slice().sort()]);
        async function begin() {
          let acc = {}, pm = {};
          try { const d = await col('meta').doc('accessi').get(); acc = d.exists ? d.data() : {}; } catch (_) {}
          try { const d = await col('meta').doc('profili').get(); pm = d.exists ? d.data() : {}; } catch (_) {}
          let p = profileFrom(acc, pm);
          if (p.none) {
            // amministratore presente nell'elenco senza profilo: lo riconosco perché può scrivere meta/accessi
            if (isAdminCached(email)) p = Object.assign({}, FULL, { admin: true });
            else {
              try { await col('meta').doc('accessi').update({ verificaAmministratore: email }); setAdmin(email); p = Object.assign({}, FULL, { admin: true }); } catch (_) {}
            }
          }
          prof = p; state.protezione = !!pm.protezione; state.profili = pm.profili || {}; state.accessi = acc; state.campiRiservati = Array.isArray(pm.campiRiservati) ? pm.campiRiservati : null; state.campiSeparati = !!pm.campiSeparati;
          // amministratore: aggiungo a meta/accessi i campi letti dalle nuove regole (scontrini, profiloDi), se mancano
          if (p.admin && Array.isArray(acc.utenti) && (!Array.isArray(acc.scontrini) || !acc.profiloDi)) { try { await api.setAccessi(acc.utenti); acc = state.accessi; } catch (_) {} }
          mySig = sigOf(p);
          start();
        }
        function start() {
          const need = new Set(); const ready = k => { need.delete(k); maybeStart(); };
          const maybeStart = () => { if (!blocked && !started && !need.size) { started = true; rebuild(); document.getElementById('app').innerHTML = ''; resolve(); if (prof.full && state.campiSeparati) setTimeout(spostaListino, 1500); } };
          // ville già separate prima che "Listino prezzi" diventasse un campo: lo sposto in villas_campi (prima la copia, poi la pulizia)
          async function spostaListino() {
            const todo = Object.values(raw.villas).filter(v => v.listino !== undefined);
            if (!todo.length) return;
            try {
              const b1 = db.batch(); todo.forEach(v => { const a = raw.villasAcq[v.id]; const full = Object.assign(clone(v), a && a.pricing ? { pricing: a.pricing } : {}); b1.set(col(campoPath(v.id)).doc('listino'), strip({ villaId: v.id, valore: valOf(full, 'listino') })); }); await b1.commit();
              const b2 = db.batch(); todo.forEach(v => { const x = clone(v); delete x.listino; b2.set(col('villas').doc(v.id), strip(x)); }); await b2.commit();
            } catch (_) {}
          }
          // 2) se in seguito l'accesso viene revocato, l'app si chiude e i dati sul dispositivo vengono cancellati
          const denied = err => { if (err && err.code === 'permission-denied') block(); else fail(err); };
          const opts = { includeMetadataChanges: false };
          const changed = meta => { if (blocked) return; rebuild(); if (started) emit(meta && meta.hasPendingWrites ? 'local' : 'remote'); };
          // collezione intera (accesso completo); "core" = un rifiuto vuol dire account revocato
          const onCol = (c, key, core, fn) => { need.add(key); col(c).onSnapshot(opts, snap => { fn(snap); changed(snap.metadata); ready(key); }, err => { if (core) denied(err); ready(key); }); };
          const onDoc = (c, id, key, fn) => { need.add(key); col(c).doc(id).onSnapshot(opts, d => { fn(d); changed(d.metadata); ready(key); }, () => { ready(key); }); };
          const onQuery = (c, villaId, key, fn) => { need.add(key); col(c).where('villaId', '==', villaId).onSnapshot(opts, snap => { fn(snap); changed(snap.metadata); ready(key); }, () => { ready(key); }); };
          const toMap = snap => { const m = {}; snap.docs.forEach(d => { m[d.id] = d.data(); }); return m; };
          if (prof.full) {
            onCol('villas', 'v', true, snap => { raw.villas = {}; snap.docs.forEach(d => { raw.villas[d.id] = Object.assign({ id: d.id }, d.data()); }); });
            onCol('bookings', 'b', true, snap => { raw.bookings = {}; snap.docs.forEach(d => { raw.bookings[d.id] = Object.assign({ id: d.id }, d.data()); }); reconcileOcc(); });
            if (state.protezione) {
              onCol('villas_acquisto', 'va', false, snap => { raw.villasAcq = toMap(snap); });
              if (state.campiRiservati && !state.campiSeparati) onCol('villas_riservati', 'vr', false, snap => { raw.villasRis = toMap(snap); });
              if (state.campiSeparati) { need.add('vc'); db.collectionGroup('campi').onSnapshot(opts, snap => { raw.villasCampi = {}; snap.docs.forEach(d => { const x = d.data(); if (!x || !x.villaId) return; (raw.villasCampi[x.villaId] = raw.villasCampi[x.villaId] || {})[d.id] = x.valore; }); changed(snap.metadata); ready('vc'); }, () => ready('vc')); }
              onCol('bookings_acquisto', 'ba', false, snap => { raw.bookingsAcq = toMap(snap); });
              onCol('occupazione', 'o', false, snap => { raw.occ = toMap(snap); reconcileOcc(); });
            }
          } else {
            // profilo limitato: solo le ville condivise, documento per documento (le regole non permettono di leggere le altre)
            const bySet = (obj, villaId, snap) => { Object.keys(obj).forEach(k => { if (obj[k].villaId === villaId) delete obj[k]; }); snap.docs.forEach(d => { obj[d.id] = Object.assign({ id: d.id }, d.data()); }); };
            prof.ville.forEach(id => {
              onDoc('villas', id, 'v' + id, d => { if (d.exists) raw.villas[id] = Object.assign({ id }, d.data()); else delete raw.villas[id]; });
              if (state.campiSeparati) CAMPI.filter(k => !(prof.nascosti || []).includes(k)).forEach(k => onDoc(campoPath(id), k, 'vc' + id + k, d => { const m = raw.villasCampi[id] = raw.villasCampi[id] || {}; if (d.exists) m[k] = (d.data() || {}).valore; else delete m[k]; }));
              if (prof.scheda && state.campiRiservati && !state.campiSeparati) onDoc('villas_riservati', id, 'vr' + id, d => { if (d.exists) raw.villasRis[id] = d.data(); else delete raw.villasRis[id]; });
              if (prof.acquisto && state.protezione) onDoc('villas_acquisto', id, 'va' + id, d => { if (d.exists) raw.villasAcq[id] = d.data(); else delete raw.villasAcq[id]; });
              if (prof.dettaglio || !state.protezione) onQuery('bookings', id, 'b' + id, snap => bySet(raw.bookings, id, snap));
              if (prof.dettaglio && prof.acquisto && state.protezione) onQuery('bookings_acquisto', id, 'ba' + id, snap => { Object.keys(raw.bookingsAcq).forEach(k => { if (raw.bookingsAcq[k].villaId === id) delete raw.bookingsAcq[k]; }); snap.docs.forEach(d => { raw.bookingsAcq[d.id] = d.data(); }); });
              if (!prof.dettaglio && state.protezione) onDoc('occupazione', id, 'o' + id, d => { if (d.exists) raw.occ[id] = d.data(); else delete raw.occ[id]; });
            });
          }
          // meta: un documento alla volta (gli appunti si leggono solo se il profilo ha la pagina Appunti)
          onDoc('meta', 'settings', 'ms', d => { state.settings = Object.assign(window.SDB.defaultSettings(), d.exists ? d.data() : {}); });
          if (prof.full || (prof.pagine || []).includes('appunti')) onDoc('meta', 'notes', 'mn', d => { state.notes = d.exists ? d.data().text || '' : ''; });
          onDoc('meta', 'preferiti', 'mp', d => { state.preferiti = d.exists ? (d.data() || {}).liste || [] : []; });
          onDoc('meta', 'assegnazioni', 'mg', d => { state.assegnazioni = d.exists ? (d.data() || {}).account || [] : []; });
          onDoc('meta', 'sicurezza', 'mz', d => { state.sicurezza = d.exists ? d.data() || null : null; });
          // se cambia il mio profilo (ville condivise, permessi) o si attiva la protezione, ricarico l'app
          let accNow = state.accessi, pmNow = { profili: state.profili, protezione: state.protezione };
          const recheck = () => { if (!started) return; const p = profileFrom(accNow, pmNow); const keep = prof.admin && p.none; if (!keep && sigOf(p) !== mySig) location.reload(); };
          onDoc('meta', 'accessi', 'ma', d => { accNow = d.exists ? d.data() : {}; state.accessi = accNow; recheck(); });
          onDoc('meta', 'profili', 'mf', d => { pmNow = d.exists ? d.data() : {}; state.profili = pmNow.profili || {}; if (!!pmNow.protezione !== !!state.protezione || JSON.stringify(pmNow.campiRiservati || null) !== JSON.stringify(state.campiRiservati || null) || !!pmNow.campiSeparati !== !!state.campiSeparati) { if (started) location.reload(); } recheck(); });
          maybeStart();
        }
      });
    });
    return api;
  }

  const cfg = window.SDB_FIREBASE_CONFIG;
  const useFirebase = cfg && cfg.apiKey && cfg.projectId && window.firebase && firebase.initializeApp;
  window.SDBStore = useFirebase ? FirebaseStore(cfg) : LocalStore();
})();
