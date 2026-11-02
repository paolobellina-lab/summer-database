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
    return { version: 1, villas: [], bookings: [], notes: '', settings: window.SDB.defaultSettings(), updatedAt: Date.now() };
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
      <div class="login-brand"><b>Summer Database</b><span>Ville · Disponibilità & listini</span></div>${html}</div></div>`;
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
      signOut() { auth.signOut().then(() => location.reload()); }
    };
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
      // SOLA LETTURA delle collezioni dell'app Scontrini: nessuna scrittura qui, mai.
      listenScontrini(cb, onErr) {
        return db.collection('scontrini').onSnapshot(snap => cb(snap.docs.map(d => Object.assign({}, d.data(), { id: d.id }))), onErr);
      },
      getFoto(id) { return db.collection('scontrini_foto').doc(id).get().then(d => (d.exists ? (d.data() || {}).img || null : null)); }
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
        let got = { villas: false, bookings: false, meta: false }, started = false;
        const maybeStart = () => { if (!started && got.villas && got.bookings && got.meta) { started = true; document.getElementById('app').innerHTML = ''; resolve(); } };
        const denied = err => {
          if (err && err.code === 'permission-denied') {
            const el = loginScreen(`<p class="login-msg"><b>${user.email}</b> non è tra gli account autorizzati.</p>
              <p class="login-note">Chiedi all'amministratore di aggiungerlo, oppure accedi con un altro account.</p>
              <button class="btn" id="login-out">Cambia account</button>`);
            el.querySelector('#login-out').addEventListener('click', () => auth.signOut());
          } else fail(err);
        };
        const opts = { includeMetadataChanges: false };
        db.collection('villas').onSnapshot(opts, snap => {
          state.villas = snap.docs.map(d => d.data()); got.villas = true;
          if (started) emit(snap.metadata.hasPendingWrites ? 'local' : 'remote'); else maybeStart();
        }, denied);
        db.collection('bookings').onSnapshot(opts, snap => {
          state.bookings = snap.docs.map(d => d.data()); got.bookings = true;
          if (started) emit(snap.metadata.hasPendingWrites ? 'local' : 'remote'); else maybeStart();
        }, denied);
        db.collection('meta').onSnapshot(opts, snap => {
          snap.docs.forEach(d => {
            if (d.id === 'settings') state.settings = Object.assign(window.SDB.defaultSettings(), d.data());
            if (d.id === 'notes') state.notes = d.data().text || '';
          });
          got.meta = true;
          if (started) emit(snap.metadata.hasPendingWrites ? 'local' : 'remote'); else maybeStart();
        }, denied);
      });
    });
    return api;
  }

  const cfg = window.SDB_FIREBASE_CONFIG;
  const useFirebase = cfg && cfg.apiKey && cfg.projectId && window.firebase && firebase.initializeApp;
  window.SDBStore = useFirebase ? FirebaseStore(cfg) : LocalStore();
})();
