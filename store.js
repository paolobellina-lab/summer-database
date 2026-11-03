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

    // scritture: aggiorno subito lo stato locale, poi Firestore (che funziona anche offline e sincronizza dopo)
    Object.assign(api, {
      upsertVilla(v) { upsertLocal(state.villas, v); db.collection('villas').doc(v.id).set(strip(v)).catch(fail); emit('local'); },
      removeVilla(id) {
        const bk = state.bookings.filter(b => b.villaId === id);
        state.villas = state.villas.filter(v => v.id !== id); state.bookings = state.bookings.filter(b => b.villaId !== id);
        const batch = db.batch(); batch.delete(db.collection('villas').doc(id)); bk.forEach(b => batch.delete(db.collection('bookings').doc(b.id)));
        batch.commit().catch(fail); emit('local');
      },
      upsertBooking(b) { upsertLocal(state.bookings, b); db.collection('bookings').doc(b.id).set(strip(b)).catch(fail); emit('local'); },
      removeBooking(id) { state.bookings = state.bookings.filter(b => b.id !== id); db.collection('bookings').doc(id).delete().catch(fail); emit('local'); },
      setSettings(s) { state.settings = s; db.collection('meta').doc('settings').set(strip(s)).catch(fail); emit('local'); },
      setNotes(t) { state.notes = t; db.collection('meta').doc('notes').set({ text: t }).catch(fail); emit('local'); },
      // elenchi dei preferiti, condivisi tra gli account: meta/preferiti
      setPreferiti(l) { state.preferiti = l; db.collection('meta').doc('preferiti').set({ liste: strip(l) }).catch(fail); emit('local'); },
      // account dell'app Scontrini con le ville/prenotazioni assegnate: meta/assegnazioni (letto anche dall'app Scontrini)
      setAssegnazioni(l) { state.assegnazioni = l; db.collection('meta').doc('assegnazioni').set({ account: strip(l), aggiornatoDa: api.user || '', aggiornatoIl: firebase.firestore.FieldValue.serverTimestamp() }).catch(fail); emit('local'); },
      // Import di un backup: AGGIUNGE e AGGIORNA ville e prenotazioni, non cancella mai nulla (ID stabili, scontrini collegati al sicuro).
      // Agisce SOLO su villas, bookings e meta. Le collezioni scontrini / scontrini_foto (altre app) non vanno mai toccate.
      async mergeAll(data) {
        const d = clone(data);
        const ops = [];
        (d.villas || []).forEach(v => { if (v && v.id) ops.push(['villas', v.id, v]); });
        (d.bookings || []).forEach(b => { if (b && b.id) ops.push(['bookings', b.id, b]); });
        if (d.settings) ops.push(['meta', 'settings', d.settings]);
        if (typeof d.notes === 'string') ops.push(['meta', 'notes', { text: d.notes }]);
        for (let i = 0; i < ops.length; i += 400) {
          const batch = db.batch();
          ops.slice(i, i + 400).forEach(([col, id, val]) => batch.set(db.collection(col).doc(id), strip(val)));
          await batch.commit();
        }
        (d.villas || []).forEach(v => v && v.id && upsertLocal(state.villas, v));
        (d.bookings || []).forEach(b => b && b.id && upsertLocal(state.bookings, b));
        if (d.settings) state.settings = Object.assign(window.SDB.defaultSettings(), d.settings);
        if (typeof d.notes === 'string') state.notes = d.notes;
        emit('local');
        return { villas: (d.villas || []).length, bookings: (d.bookings || []).length };
      },
      resetToSeed() { return Promise.reject(new Error('non disponibile online')); },
      // Scontrini (dell'app Scontrini): lettura, modifica con storico, cancellazione. Nessuna altra scrittura.
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
      // Cancellazione: lo scontrino e, se c'è, la sua foto (stesso ID).
      deleteScontrino(id, hasFoto) {
        const batch = db.batch();
        batch.delete(db.collection('scontrini').doc(id));
        if (hasFoto) batch.delete(db.collection('scontrini_foto').doc(id));
        return batch.commit();
      },
      setSicurezza(x) { state.sicurezza = x; return db.collection('meta').doc('sicurezza').set(strip(x)); },
      /* Account autorizzati (meta/accessi): le regole Firestore leggono "emails" per decidere chi entra.
         Solo gli amministratori scritti nelle regole possono modificarlo. */
      setAccessi(utenti) {
        const clean = utenti.map(u => ({ email: String(u.email || '').trim().toLowerCase(), nome: u.nome || '', app: Array.isArray(u.app) ? u.app : [] })).filter(u => u.email);
        const doc = { utenti: clean, emails: Array.from(new Set(clean.map(u => u.email))), aggiornatoDa: api.user || '', aggiornatoIl: firebase.firestore.FieldValue.serverTimestamp() };
        return db.collection('meta').doc('accessi').set(doc).then(() => { state.accessi = Object.assign({}, doc, { aggiornatoIl: new Date().toISOString() }); emit('local'); });
      },
      /* ---- Pulizia di fine stagione: richiesta esplicitamente dal proprietario, protetta da password nell'interfaccia.
         wipeBookings: cancella tutti i documenti di "bookings" (e svuota le prenotazioni assegnate agli account).
         wipeScontrini: cancella tutti gli scontrini e le loro foto (stesso ID). Nessun'altra collezione viene toccata. ---- */
      async wipeBookings() {
        const q = await db.collection('bookings').get();
        const ids = q.docs.map(d => d.id);
        for (let i = 0; i < ids.length; i += 400) { const b = db.batch(); ids.slice(i, i + 400).forEach(id => b.delete(db.collection('bookings').doc(id))); await b.commit(); }
        const acc = JSON.parse(JSON.stringify(state.assegnazioni || []));
        if (acc.some(a => (a.prenotazioni || []).length)) { acc.forEach(a => { a.prenotazioni = []; }); await db.collection('meta').doc('assegnazioni').set({ account: acc, aggiornatoDa: api.user || '', aggiornatoIl: firebase.firestore.FieldValue.serverTimestamp() }); }
        state.bookings = []; emit('local');
        return ids.length;
      },
      async listScontriniArchivio() {
        const q = await db.collection('scontrini').get();
        return q.docs.map(d => { const x = Object.assign({}, d.data(), { id: d.id }); ['creatoIl', 'modificatoIl'].forEach(k => { if (x[k] && x[k].toDate) x[k] = x[k].toDate().toISOString(); }); return x; });
      },
      async wipeScontrini(list) {
        const ids = list.map(x => x.id);
        // ogni scontrino conta 2 operazioni (scontrino + foto)
        for (let i = 0; i < ids.length; i += 200) { const b = db.batch(); ids.slice(i, i + 200).forEach(id => { b.delete(db.collection('scontrini').doc(id)); b.delete(db.collection('scontrini_foto').doc(id)); }); await b.commit(); }
        return ids.length;
      },
      /* ---- foto delle ville: villas_foto (immagini) e villas_thumb/{villaId} (copertina piccola per le schede) ----
         Non stanno in "villas" per non appesantire le altre app che leggono quella collezione. */
      listenThumbs(cb, onErr) {
        return db.collection('villas_thumb').onSnapshot(snap => { const m = {}; snap.docs.forEach(d => { m[d.id] = d.data(); }); cb(m); }, onErr);
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
            <button class="btn primary login-btn" id="login-google">Accedi con Google</button>
            <p class="login-note" id="login-err"></p>`);
          el.querySelector('#login-google').addEventListener('click', () => {
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
            if (u && !(u.app || []).includes('summer')) { block(); return; }
            markOk(user.email); start();
          }, () => { markOk(user.email); start(); });
        });
        function start() {
          let got = { villas: false, bookings: false, meta: false };
          const maybeStart = () => { if (!blocked && !started && got.villas && got.bookings && got.meta) { started = true; document.getElementById('app').innerHTML = ''; resolve(); } };
          // 2) se in seguito l'accesso viene revocato, l'app si chiude e i dati sul dispositivo vengono cancellati
          const denied = err => { if (err && err.code === 'permission-denied') block(); else fail(err); };
          const opts = { includeMetadataChanges: false };
          const on = (col, fn) => db.collection(col).onSnapshot(opts, snap => {
            if (blocked) return;
            fn(snap);
            if (started) emit(snap.metadata.hasPendingWrites ? 'local' : 'remote'); else maybeStart();
          }, denied);
          on('villas', snap => { state.villas = snap.docs.map(d => d.data()); got.villas = true; });
          on('bookings', snap => { state.bookings = snap.docs.map(d => d.data()); got.bookings = true; });
          on('meta', snap => {
            snap.docs.forEach(d => {
              if (d.id === 'settings') state.settings = Object.assign(window.SDB.defaultSettings(), d.data());
              if (d.id === 'notes') state.notes = d.data().text || '';
              if (d.id === 'preferiti') state.preferiti = (d.data() || {}).liste || [];
              if (d.id === 'assegnazioni') state.assegnazioni = (d.data() || {}).account || [];
              if (d.id === 'sicurezza') state.sicurezza = d.data() || null;
              if (d.id === 'accessi') state.accessi = d.data() || null;
            });
            got.meta = true;
          });
        }
      });
    });
    return api;
  }

  const cfg = window.SDB_FIREBASE_CONFIG;
  const useFirebase = cfg && cfg.apiKey && cfg.projectId && window.firebase && firebase.initializeApp;
  window.SDBStore = useFirebase ? FirebaseStore(cfg) : LocalStore();
})();
