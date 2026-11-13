/* Summer Database 2027 — interfaccia. Dipende da core.js (window.SDB) e store.js (window.SDBStore). */
window.SDBStore.ready.then(function () {
  const S = window.SDB, store = window.SDBStore;
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  /* Stati delle prenotazioni: quelli di base (chiavi fisse, lette anche dalle altre app) più quelli
     aggiunti in Impostazioni → Aspetto predefiniti. Nome, colore e "blocca il calendario" modificabili. */
  function stati(cfgIn) {
    const cfg = Array.isArray(cfgIn) ? cfgIn : (data().settings && Array.isArray(data().settings.stati)) ? data().settings.stati : [];
    const base = S.STATI.map(s => Object.assign({ color: S.STATUS_COLOR[s.key] }, s, cfg.find(c => c.key === s.key) || {}, { base: true }));
    return base.concat(cfg.filter(c => c && c.key && !S.STATI.some(s => s.key === c.key)).map(c => Object.assign({ blocks: true, color: '#6b7470' }, c, { base: false })));
  }
  const statoOf = k => stati().find(s => s.key === k);
  const statoLabel = k => k === '_nd' ? 'Non disponibile' : (statoOf(k) || { label: k }).label;
  const blocks = k => (statoOf(k) || { blocks: true }).blocks;
  const statoColor = k => (statoOf(k) || statoOf('occupato')).color;
  // colore "di stato": nessun colore salvato, oppure ancora quello originale dello stato → segue il predefinito
  const isDefaultColor = b => !b.color || String(b.color).toLowerCase() === String(S.STATUS_COLOR[b.status] || '').toLowerCase();
  const ND_COLOR = '#8a8f94';
  const bookingColor = b => b._nd ? ND_COLOR : isDefaultColor(b) ? statoColor(b.status) : b.color;
  // periodi ND del listino trasformati in "prenotazioni simulate" grigie (non salvate, calcolate dal listino)
  function ndSpans(v, tariff) {
    const per = S.periodsFor(settings(), v, tariff); const out = [];
    per.forEach((p, i) => {
      if (S.priceAt(v, tariff, i, 'netto') !== 'ND') return;
      const last = out[out.length - 1];
      if (last && last.to >= p.from) last.to = p.to > last.to ? p.to : last.to; else out.push({ from: p.from, to: p.to });
    });
    return out;
  }
  // prezzo di listino per le date scelte: periodo identico in una tariffa, oppure somma di settimane intere
  function listinoFor(v, from, to) {
    if (!v || !from || !to) return null;
    const st = settings(); const order = [ui.tariff].concat(S.TARIFFE.map(t => t.key).filter(k => k !== ui.tariff));
    for (const t of order) {
      const pt = S.periodsFor(st, v, t); const i = pt.findIndex(p => p.from === from && p.to === to);
      if (i >= 0) { const s = S.priceAt(v, t, i, 'listino'), n = S.priceAt(v, t, i, 'netto'); if (typeof s === 'number') return { sale: s, net: typeof n === 'number' ? n : null, label: S.TARIFFE.find(x => x.key === t).label + ' · ' + pt[i].label }; }
    }
    const wk = S.periodsFor(st, v, 'settimanale'); let d = from, sale = 0, net = 0, k = 0;
    while (d < to) {
      const i = wk.findIndex(p => p.from === d); if (i < 0) return null;
      const s = S.priceAt(v, 'settimanale', i, 'listino'), n = S.priceAt(v, 'settimanale', i, 'netto');
      if (typeof s !== 'number') return null; sale += s; net += typeof n === 'number' ? n : 0; d = wk[i].to; k++;
    }
    return d === to && k ? { sale, net: net || null, label: k + (k === 1 ? ' settimana' : ' settimane') + ' di listino' } : null;
  }
  // stima per date non allineate: somma delle settimane di listino in cui cadono almeno 4 notti del soggiorno
  function listinoApprox(v, from, to) {
    const ex = listinoFor(v, from, to); if (ex) return ex;
    const wk = S.periodsFor(settings(), v, 'settimanale'); let sale = 0, k = 0;
    wk.forEach((p, i) => {
      const a = p.from > from ? p.from : from, b = p.to < to ? p.to : to;
      if (S.diffDays(a, b) >= 4) { const s = S.priceAt(v, 'settimanale', i, ui.mode); if (typeof s === 'number') { sale += s; k++; } }
    });
    return k ? { approx: true, sale, net: sale } : null;
  }
  const EXTRAS = [['pulizia', 'Pulizia finale'], ['cuoco', 'Cuoco'], ['transfer', 'Transfer']];
  /* Servizi: i 3 di base (campi pulizia/cuoco/transfer della prenotazione) più quelli aggiunti in
     Impostazioni → Aspetto predefiniti (settings.servizi), salvati nella prenotazione in "servizi: [chiave]". */
  const servizi = cfgIn => EXTRAS.map(([k, l]) => ({ key: k, label: l, base: true })).concat((Array.isArray(cfgIn) ? cfgIn : ((data().settings || {}).servizi || [])).filter(x => x && x.key).map(x => ({ key: x.key, label: x.label, base: false })));
  const hasSrv = (b, x) => x.base ? !!b[x.key] : (Array.isArray(b.servizi) && b.servizi.includes(x.key));
  const srvLabels = b => servizi().filter(x => hasSrv(b, x)).map(x => x.label);
  /* Dettaglio dei servizi nella prenotazione: serviziDett[chiave] = { incluso, acquisto, vendita, note }.
     "incluso" = compreso nel prezzo di vendita dell'affitto; altrimenti ha prezzi propri, sommati al totale. */
  const srvDet = (b, k) => Object.assign({ incluso: true, acquisto: null, vendita: null, note: '' }, (b.serviziDett || {})[k] || {});
  const srvTot = b => { let v = 0, a = 0; servizi().forEach(x => { if (!hasSrv(b, x)) return; const d = srvDet(b, x.key); if (d.incluso) return; if (typeof d.vendita === 'number') v += d.vendita; if (typeof d.acquisto === 'number') a += d.acquisto; }); return { vendita: v, acquisto: a }; };
  const isMobile = () => window.matchMedia('(max-width: 760px)').matches;

  /* ---------- preferenze di vista (solo su questo dispositivo) ---------- */
  const UIKEY = 'summer-db-2027-ui';
  let ui = { tariff: 'settimanale', mode: 'listino', q: '', loc: '', da: '', a: '', guests: '', beds: '', dal: '', al: '', zoom: isMobile() ? 16 : 22, open: false };
  try { Object.assign(ui, JSON.parse(localStorage.getItem(UIKEY) || '{}')); } catch (_) {}
  function saveUI() { try { localStorage.setItem(UIKEY, JSON.stringify(ui)); } catch (_) {} }
  // tema: chiaro (panna) di base; "auto" segue il telefono/computer
  if (!ui.theme) ui.theme = 'light';
  const applyTheme = () => {
    const r = document.documentElement;
    if (ui.theme === 'auto') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', ui.theme);
    const dark = ui.theme === 'dark' || (ui.theme === 'auto' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    const m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute('content', dark ? '#07131c' : '#f5eee0');
    const cs = document.querySelector('meta[name="color-scheme"]'); if (cs) cs.setAttribute('content', ui.theme === 'dark' ? 'only dark' : ui.theme === 'auto' ? 'light dark' : 'only light');
  };
  applyTheme();

  const data = () => store.get();
  const settings = () => data().settings;
  const villaById = id => data().villas.find(v => v.id === id);
  // ville in ordine alfabetico (calendario, menu, elenchi)
  const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'it', { numeric: true, sensitivity: 'base' });
  const sortedVillas = () => data().villas.slice().sort(byName);
  const num = v => { const n = parseInt(String(v == null ? '' : v), 10); return isFinite(n) ? n : null; };

  /* ---------- toast ---------- */
  let toastT;
  function toast(msg) {
    let t = $('.toast'); if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2200);
  }

  /* ---------- shell ---------- */
  const app = $('#app');
  app.innerHTML = `
    <header class="topbar">
      <div class="brand"><b id="brand-name"></b><span>Ville · Disponibilità & listini</span></div>
      <nav class="nav" aria-label="Sezioni">
        <a href="#disponibilita" data-r="disponibilita"><span class="l-full">Disponibilità</span><span class="l-short">Calendario</span></a>
        <a href="#ville" data-r="ville">Ville</a>
        <a href="#offerte" data-r="offerte">Offerte</a>
        <a href="#spese" data-r="spese">Spese</a>
        <a href="#appunti" data-r="appunti">Appunti</a>
        <a href="#impostazioni" data-r="impostazioni"><span class="l-full">Impostazioni</span><span class="l-short">Impost.</span></a>
      </nav>
      <button class="btn small primary" id="install" hidden>Installa app</button>
      <div class="sync" id="sync"><i></i><span></span></div>
    </header>
    <main id="main"></main>
    <dialog id="dlg"></dialog>`;
  const main = $('#main');
  // scontrini dell'app Scontrini: sola lettura, un unico ascolto in tempo reale
  /* Profilo dell'account collegato (store.profile, deciso all'accesso):
     full = vede e modifica tutto; altrimenti acquisto (prezzi di acquisto), modifica (prenotazioni),
     dettaglio (false = prenotazioni solo come ND), pagine visibili, ville condivise. */
  const PAGES = [['disponibilita', 'Disponibilità'], ['ville', 'Ville'], ['offerte', 'Offerte'], ['spese', 'Spese'], ['appunti', 'Appunti'], ['impostazioni', 'Impostazioni']];
  const ME = () => store.profile || { full: true, acquisto: true, modifica: true, dettaglio: true, pagine: null, ville: [] };
  const isFull = () => !!ME().full;
  const canAcq = () => isFull() || !!ME().acquisto;
  const canEdit = () => isFull() || (!!ME().modifica && !!ME().dettaglio);
  const canDetail = () => isFull() || !!ME().dettaglio;
  const isAdmin = () => store.mode !== 'online' || !!ME().admin;
  const allowedPages = () => isFull() ? PAGES.map(p => p[0]) : PAGES.map(p => p[0]).filter(k => (ME().pagine || []).includes(k));
  const canSee = p => store.mode !== 'online' || allowedPages().includes(p);

  /* ---------- Backup ----------
     File JSON con ville (listini completi), prenotazioni, impostazioni, appunti, profili e account.
     Con accesso completo comprende anche le note spese dell'app Scontrini, senza foto, solo come archivio:
     l'importazione non le rimette mai (vincolo 1 di CLAUDE.md).
     Backup automatico: attivabile per dispositivo; quando l'app si apre, se oggi non è ancora stato fatto,
     scarica il file nella cartella Download (un sito può solo aggiungere file lì, non cancellarli). */
  const oggiLocale = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  async function buildBackup() {
    const out = Object.assign({ exportedAt: new Date().toISOString(), app: 'Summer Database' }, JSON.parse(JSON.stringify(data())));
    if (store.mode === 'online' && isFull() && store.listScontriniArchivio) {
      try { out.scontrini = await store.listScontriniArchivio(); out.notaScontrini = 'Note spese dell\'app Scontrini, senza foto: solo archivio, non vengono importate.'; } catch (_) {}
    }
    return JSON.stringify(out, null, 1);
  }
  function downloadText(name, txt) {
    const blob = new Blob([txt], { type: 'application/json' }); const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }
  const AUTOKEY = 'summer-db-backup-auto', LASTKEY = 'summer-db-backup-ultimo';
  const lsGet = k => { try { return localStorage.getItem(k); } catch (_) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} };
  async function autoBackup(force) {
    if (store.mode !== 'online' || !isFull()) return false;
    if (!force && (lsGet(AUTOKEY) !== 'si' || lsGet(LASTKEY) === oggiLocale())) return false;
    const txt = await buildBackup();
    downloadText('summer-database-backup-' + oggiLocale() + '.json', txt);
    lsSet(LASTKEY, oggiLocale());
    return true;
  }
  const spese = { list: [], ready: false, error: null };
  let spesePage = null; const speseHooks = new Set();
  const speseChanged = () => { if (spesePage) spesePage.render(); speseHooks.forEach(f => { try { f(); } catch (_) {} }); };
  let speseUnsub = null;
  const startSpese = () => {
    if (speseUnsub || !(store.mode === 'online' && store.listenScontrini && window.SDBSpese) || !canSee('spese')) return;
    speseUnsub = store.listenScontrini(l => { spese.list = isFull() ? l : l.filter(x => data().villas.some(v => v.id === x.villaId)); spese.ready = true; spese.error = null; speseChanged(); }, err => { spese.error = err; speseChanged(); });
  };
  const stopSpese = () => { if (speseUnsub) { try { speseUnsub(); } catch (_) {} speseUnsub = null; spese.list = []; spese.ready = false; } };
  startSpese();
  // copertine delle ville (villas_thumb): una sola lettura in tempo reale, solo online
  const thumbs = { map: {}, ready: false, error: null };
  let villasRedraw = null;
  if (store.mode === 'online' && store.listenThumbs) {
    store.listenThumbs(m => { thumbs.map = m; thumbs.ready = true; thumbs.error = null; if (villasRedraw) villasRedraw(); }, err => { thumbs.error = err; });
  }
  // elenchi dei preferiti (meta/preferiti, condivisi)
  const favLists = () => (data().preferiti || []);
  const isFav = id => favLists().some(l => (l.ville || []).includes(id));
  const HEART = on => `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.6-9.2C.9 7.9 3 4.5 6.6 4.5c2.1 0 3.7 1.2 4.4 2.6h2c.7-1.4 2.3-2.6 4.4-2.6 3.6 0 5.7 3.4 4.2 6.8-2.1 4.6-9.6 9.2-9.6 9.2z" fill="${on ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
  /* condivisione di una villa con i profili utente (solo amministratori): meta/profili.profili[id].ville */
  function openShare(villaId, after) {
    const dlg = $('#dlg'); const v = villaById(villaId);
    const draw = () => {
      const pm = data().profili || {};
      const ids = Object.keys(pm).filter(k => !pm[k].completo).sort((a, b) => String(pm[a].nome).localeCompare(String(pm[b].nome), 'it'));
      const full = Object.keys(pm).filter(k => pm[k].completo);
      dlg.innerHTML = `<form class="dlg" id="share-form" autocomplete="off">
        <h3>Condivisa con</h3><p class="note">Scegli quali profili utente vedono <b>${esc(v ? v.name : '')}</b>. Gli amministratori${full.length ? ' e i profili con accesso completo (' + full.map(k => esc(pm[k].nome)).join(', ') + ')' : ''} la vedono sempre.</p>
        <div class="fav-list">${ids.length ? ids.map(k => `<label class="flag"><input type="checkbox" data-share="${esc(k)}" ${(pm[k].ville || []).includes(villaId) ? 'checked' : ''}><span><b>${esc(pm[k].nome || 'Profilo')}</b><small>${(pm[k].ville || []).filter(x => villaById(x)).length} ville condivise</small></span></label>`).join('') : '<p class="note">Nessun profilo limitato: creali in Impostazioni → Account e accessi.</p>'}</div>
        <div class="foot"><button type="button" class="btn primary" id="share-ok">Fatto</button></div></form>`;
      $$('#share-form [data-share]').forEach(cb => cb.addEventListener('change', () => {
        const pm2 = JSON.parse(JSON.stringify(data().profili || {})); const pr = pm2[cb.dataset.share]; if (!pr) return;
        pr.ville = (pr.ville || []).filter(x => x !== villaId); if (cb.checked) pr.ville.push(villaId);
        Promise.resolve(store.setProfili(pm2)).then(() => draw(), err => { cb.checked = !cb.checked; toast(err && err.code === 'permission-denied' ? 'Solo un amministratore può cambiare la condivisione' : 'Salvataggio non riuscito'); });
      }));
      $('#share-ok').onclick = () => dlg.close();
    };
    draw();
    dlg.onclose = () => { dlg.onclose = null; if (after) after(); };
    if (!dlg.open) { if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', ''); }
  }
  function openFav(villaId, after) {
    const dlg = $('#dlg'); const v = villaById(villaId);
    const draw = () => {
      const lists = favLists();
      dlg.innerHTML = `<form class="dlg" id="fav-form" autocomplete="off">
        <h3>Preferiti</h3><p class="note">Scegli in quali elenchi mettere <b>${esc(v ? v.name : '')}</b>. Gli elenchi sono condivisi con il tuo collega.</p>
        <div class="fav-list">${lists.length ? lists.map(l => `<label class="flag"><input type="checkbox" data-l="${esc(l.id)}" ${(l.ville || []).includes(villaId) ? 'checked' : ''}><span><b>${esc(l.nome)}</b><small>${(l.ville || []).length} ville</small></span></label>`).join('') : '<p class="note">Non hai ancora elenchi: creane uno qui sotto.</p>'}</div>
        <div class="fav-new"><input id="fav-name" placeholder="Nuovo elenco, es. Clienti agosto"><button type="submit" class="btn">Crea e aggiungi</button></div>
        <div class="foot"><button type="button" class="btn primary" id="fav-ok">Fatto</button></div></form>`;
      $$('#fav-form [data-l]').forEach(cb => cb.addEventListener('change', () => {
        const ls = JSON.parse(JSON.stringify(favLists())); const l = ls.find(x => x.id === cb.dataset.l); if (!l) return;
        l.ville = (l.ville || []).filter(x => x !== villaId); if (cb.checked) l.ville.push(villaId);
        store.setPreferiti(ls); draw();
      }));
      $('#fav-form').addEventListener('submit', e => {
        e.preventDefault(); const nome = $('#fav-name').value.trim(); if (!nome) { $('#fav-name').focus(); return; }
        store.setPreferiti(favLists().concat([{ id: S.uid('l'), nome, ville: [villaId] }])); draw();
      });
      $('#fav-ok').onclick = () => dlg.close();
    };
    draw();
    dlg.onclose = () => { dlg.onclose = null; if (after) after(); };
    if (!dlg.open) { if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', ''); }
  }
  // compressione foto (stesso metodo dell'app Scontrini): JPEG ridimensionato sotto il limite di un documento
  async function compressImage(file, lato, maxLen) {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('immagine non leggibile')); i.src = URL.createObjectURL(file); });
    let w = img.naturalWidth, h = img.naturalHeight; const k = Math.min(1, lato / Math.max(w, h));
    const c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(img.src);
    let q = 0.78, url = c.toDataURL('image/jpeg', q);
    while (url.length > maxLen && q > 0.35) { q -= 0.08; url = c.toDataURL('image/jpeg', q); }
    let cc = c;
    while (url.length > maxLen && cc.width > 300) { const c2 = document.createElement('canvas'); c2.width = Math.round(cc.width * 0.75); c2.height = Math.round(cc.height * 0.75); c2.getContext('2d').drawImage(cc, 0, 0, c2.width, c2.height); cc = c2; url = cc.toDataURL('image/jpeg', 0.6); }
    return url;
  }
  /* Dati della scheda prenotazione per l'esportazione Word della pagina Spese.
     I prezzi di acquisto compaiono solo per chi li può vedere. */
  function schedaPren(bookingId) {
    const b = data().bookings.find(x => x.id === bookingId); if (!b) return null;
    const v = villaById(b.villaId) || { name: b.villaId };
    const notti = S.diffDays(b.from, b.to);
    const acq = canAcq();
    const assegn = (data().assegnazioni || []).filter(a => (a.prenotazioni || []).includes(b.id) || (a.ville || []).includes(b.villaId)).map(a => a.nome || a.email);
    const righe = [
      ['Villa', v.name], ['Località', v.location || ''], ['Cliente', b.cliente || ''],
      ['Check-in', S.dmy(b.from) + (b.earlyIn ? ' · early check-in' : '')], ['Check-out', S.dmy(b.to) + (b.lateOut ? ' · late check-out' : '')],
      ['Notti', String(notti)], ['Stato', statoLabel(b.status)],
      ['Prezzo di vendita concordato', typeof b.prezzoVendita === 'number' ? S.money(b.prezzoVendita) : '—']
    ];
    if (acq) righe.push(['Prezzo di acquisto concordato', typeof b.prezzoAcquisto === 'number' ? S.money(b.prezzoAcquisto) : '—']);
    if (assegn.length) righe.push(['Assegnata a (app Scontrini)', assegn.join(', ')]);
    if (b.note) righe.push(['Note', b.note]);
    const srvRighe = servizi().filter(x => hasSrv(b, x)).map(x => { const d = srvDet(b, x.key); return [x.label, d.incluso ? 'Incluso nel prezzo' : 'A parte'].concat(acq ? [d.incluso || typeof d.acquisto !== 'number' ? '' : S.money(d.acquisto)] : [], [d.incluso || typeof d.vendita !== 'number' ? '' : S.money(d.vendita), d.note || '']); });
    const sv = srvTot(b);
    const totVendita = (typeof b.prezzoVendita === 'number' ? b.prezzoVendita : 0) + sv.vendita;
    const totAcquisto = acq ? (typeof b.prezzoAcquisto === 'number' ? b.prezzoAcquisto : 0) + sv.acquisto : null;
    return { id: b.id, villaId: b.villaId, villa: v.name, cliente: b.cliente || 'Senza nome', from: b.from, to: b.to, righe, servizi: srvRighe, acq, totVendita, totAcquisto, haPrezzo: typeof b.prezzoVendita === 'number' };
  }
  const goSpese = (opts) => { Object.assign(ui, { spVilla: '', spPren: '', spQ: '' }, opts); saveUI(); location.hash = 'spese'; };
  // pulsante "Installa app" (Chrome/Edge su Android, Windows, Mac)
  let installEvt = window.__sdbInstall || null;
  const isInstalled = () => { try { return window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: minimal-ui)').matches || navigator.standalone === true; } catch (_) { return false; } };
  const showInstall = () => { const b = $('#install'); if (b) b.hidden = !installEvt || isInstalled(); };
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; showInstall(); });
  window.addEventListener('appinstalled', () => { installEvt = null; showInstall(); toast('App installata'); });
  $('#install').addEventListener('click', async () => { if (!installEvt) return; installEvt.prompt(); try { await installEvt.userChoice; } catch (_) {} installEvt = null; showInstall(); });
  showInstall();

  function refreshShell(route) {
    $('#brand-name').textContent = settings().seasonName || 'Summer 2027';
    $$('.nav a').forEach(a => { a.classList.toggle('on', a.dataset.r === route || (route === 'villa' && a.dataset.r === 'ville')); a.hidden = !canSee(a.dataset.r); });
    const nv = $('.nav'); if (nv) nv.style.setProperty('--n', $$('.nav a').filter(a => !a.hidden).length);
    const sy = $('#sync');
    sy.className = 'sync ' + store.mode;
    sy.querySelector('span').textContent = store.mode === 'online' ? (store.online === false ? 'Offline · si sincronizza appena torna la rete' : 'Online') : (store.canPersist ? 'Salvato su questo dispositivo' : 'Memoria non disponibile');
  }

  /* ---------- router ---------- */
  function route() {
    let h = (location.hash || '#disponibilita').slice(1);
    spesePage = null; speseHooks.clear(); villasRedraw = null;
    if (canSee('spese')) startSpese(); else stopSpese();
    // pagina non permessa a questo account: vado alla prima consentita
    const pageOf = h.startsWith('villa-') ? (canSee('ville') ? 'ville' : 'disponibilita') : h.startsWith('impostazioni-') ? 'impostazioni' : (PAGES.some(p => p[0] === h) ? h : 'disponibilita');
    if (!canSee(pageOf)) {
      const first = allowedPages()[0];
      if (!first) { refreshShell(''); main.innerHTML = `<div class="page"><div class="wrap"><div class="card"><p class="note">${ME().none ? 'Al tuo account non è ancora stato assegnato un profilo. Chiedi all\'amministratore.' : 'Al tuo profilo non è stata assegnata nessuna pagina. Chiedi all\'amministratore.'}</p></div></div></div>`; return; }
      if (location.hash !== '#' + first) { location.hash = first; return; }
      h = first;
    }
    if (h.startsWith('villa-')) { refreshShell('villa'); return viewVilla(h.slice(6)); }
    if (h.startsWith('impostazioni-')) { refreshShell('impostazioni'); return viewSettings(h.slice(13)); }
    refreshShell(h);
    if (h === 'ville') return viewVillas();
    if (h === 'spese' && window.SDBSpese) { spesePage = window.SDBSpese.mount(main, { ui, saveUI, esc, data, spese, store, $, $$, toast, schedaPren, compressImage, canAcq }); return; }
    if (h === 'appunti') return viewNotes();
    if (h === 'offerte' && window.SDBOfferte) { return window.SDBOfferte.mount(main, { ui, saveUI, esc, data, store, $, $$, toast, S, settings, blocks, hiddenField, favLists, locations, normLoc, coverOf: id => (thumbs.map[id] || {}).fotoId || null }); }
    if (h === 'impostazioni') return viewSettings();
    return viewAvail();
  }
  window.addEventListener('hashchange', route);
  store.subscribe((st, origin) => {
    if (origin !== 'remote') return;
    const a = document.activeElement;
    if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && main.contains(a)) return;
    route();
  });

  /* =====================================================================
     DISPONIBILITÀ
     ===================================================================== */
  /* Quale listino usare per una villa con la tariffa scelta:
     - Settimanale: serve almeno un prezzo settimanale, altrimenti la villa non si affitta a settimana e non compare.
     - Altre tariffe: se la villa ha prezzi per quella tariffa li uso; se non li ha ma ha prezzi settimanali,
       mostro quelli (si sommano le settimane); se non ha né l'una né l'altra, non compare. */
  const hasNumPrice = (v, t) => S.periodsFor(settings(), v, t).some((p, i) => typeof S.priceAt(v, t, i, 'netto') === 'number' || typeof S.priceAt(v, t, i, 'listino') === 'number');
  function tariffFor(v, t) {
    // profilo che non vede il listino: la villa compare comunque, con le sole disponibilità
    if (hiddenField('listino')) return t;
    if (hasNumPrice(v, t)) return t;
    if (t !== 'settimanale' && hasNumPrice(v, 'settimanale')) return 'settimanale';
    return null;
  }
  let hiddenNoPrice = 0;
  function filteredVillas() {
    const st = settings();
    const per = st.periods[ui.tariff] || [];
    const q = ui.q.trim().toLowerCase();
    const da = S.parseMoney(ui.da), a = S.parseMoney(ui.a);
    const g = num(ui.guests), bd = num(ui.beds);
    const hasRange = ui.dal && ui.al && ui.al > ui.dal;
    const priceFilter = (typeof da === 'number') || (typeof a === 'number');
    const bookings = data().bookings;
    hiddenNoPrice = 0;
    return sortedVillas().filter(v => {
      const tv = tariffFor(v, ui.tariff);
      if (!tv) { hiddenNoPrice++; return false; }
      const perV = S.periodsFor(st, v, tv);
      if (q && !(`${v.name} ${v.nomeReale} ${v.proprietario} ${v.location} ${v.indirizzo}`.toLowerCase().includes(q))) return false;
      if (ui.loc && String(v.location || '').trim().toUpperCase() !== ui.loc) return false;
      if (ui.fav) { const fl = favLists().find(l => l.id === ui.fav); if (fl && !(fl.ville || []).includes(v.id)) return false; }
      if (g !== null) { const vg = num(v.guests) ?? num(v.pax); if (vg === null || vg < g) return false; }
      if (bd !== null) { const vb = num(v.totalBedrooms) ?? num(v.guestBedrooms); if (vb === null || vb < bd) return false; }
      if (hasRange) {
        if (bookings.some(b => b.villaId === v.id && blocks(b.status) && b.from < ui.al && b.to > ui.dal)) return false;
        if (ndSpans(v, tv).some(s => s.from < ui.al && s.to > ui.dal)) return false;
      }
      if (priceFilter) {
        let hit = false;
        perV.forEach((p, i) => {
          if (hasRange && !(p.from < ui.al && p.to > ui.dal)) return;
          const pr = S.priceAt(v, tv, i, ui.mode);
          if (typeof pr === 'number' && (typeof da !== 'number' || pr >= da) && (typeof a !== 'number' || pr <= a)) hit = true;
        });
        if (!hit) return false;
      }
      return true;
    });
  }

  const normLoc = s => String(s || '').trim().replace(/\s+/g, ' ').toUpperCase();
  // elenco località (Impostazioni → Località), condiviso; comprende anche quelle già usate dalle ville
  function locList() {
    const set = new Set((settings().localita || []).map(normLoc).filter(Boolean));
    data().villas.forEach(v => { const l = normLoc(v.location); if (l) set.add(l); });
    return Array.from(set).sort((x, y) => x.localeCompare(y, 'it'));
  }
  function locations() {
    const set = new Set(); data().villas.forEach(v => { const l = normLoc(v.location); if (l) set.add(l); });
    return Array.from(set).sort();
  }
  function addLocation(name) {
    const n = normLoc(name); if (!n) return '';
    const st = JSON.parse(JSON.stringify(settings())); st.localita = locList();
    if (!st.localita.includes(n)) { st.localita.push(n); st.localita.sort((x, y) => x.localeCompare(y, 'it')); store.setSettings(st); }
    return n;
  }

  function viewAvail() {
    const st = settings();
    if (!canAcq() && ui.mode !== 'listino') { ui.mode = 'listino'; saveUI(); }
    main.innerHTML = `
      <form class="toolbar${ui.open ? ' open' : ''}" id="tb" autocomplete="off">
        <label class="field f-search"><span>Cerca villa</span><input type="search" id="f-q" placeholder="Nome, proprietario, zona" value="${esc(ui.q)}"></label>
        <button type="button" class="btn filters-toggle" id="f-more" aria-expanded="${ui.open}">Filtri</button>
        <div class="field"><span>Tariffa</span><div class="seg" id="f-tariff">${S.TARIFFE.map(t => `<button type="button" data-v="${t.key}" class="${ui.tariff === t.key ? 'on' : ''}">${t.label}</button>`).join('')}</div></div>
        <div class="field"${canAcq() ? '' : ' hidden'}><span>Prezzi</span><div class="seg" id="f-mode"><button type="button" data-v="listino" class="${ui.mode === 'listino' ? 'on' : ''}">Listino</button><button type="button" data-v="netto" class="${ui.mode === 'netto' ? 'on' : ''}">Netto</button></div></div>
        <div class="more">
          <label class="field f-num"><span>Prezzo da</span><input id="f-da" inputmode="numeric" placeholder="es. 25k" value="${esc(ui.da)}"></label>
          <label class="field f-num"><span>Prezzo a</span><input id="f-a" inputmode="numeric" placeholder="es. 75k" value="${esc(ui.a)}"></label>
          <label class="field f-date"><span>Libera dal</span><input type="date" id="f-dal" min="${st.seasonStart}" max="${st.seasonEnd}" value="${esc(ui.dal)}"></label>
          <label class="field f-date"><span>al</span><input type="date" id="f-al" min="${st.seasonStart}" max="${st.seasonEnd}" value="${esc(ui.al)}"></label>
          <label class="field f-sel"><span>Preferiti</span><select id="f-fav"><option value="">Tutte le ville</option>${favLists().map(l => `<option value="${esc(l.id)}" ${ui.fav === l.id ? 'selected' : ''}>♥ ${esc(l.nome)} (${(l.ville || []).length})</option>`).join('')}</select></label>
          <label class="field f-sel"><span>Location</span><select id="f-loc"><option value="">Tutte</option>${locations().map(l => `<option ${ui.loc === l ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
          <label class="field f-num"><span>Ospiti min</span><input id="f-guests" inputmode="numeric" value="${esc(ui.guests)}"></label>
          <label class="field f-num"><span>Camere min</span><input id="f-beds" inputmode="numeric" value="${esc(ui.beds)}"></label>
          <div class="field"><span>Zoom</span><div class="seg" id="f-zoom">${[[12, 'S'], [18, 'M'], [26, 'L']].map(([z, l]) => `<button type="button" data-v="${z}" class="${Math.abs(ui.zoom - z) <= 4 ? 'on' : ''}">${l}</button>`).join('')}</div></div>
          <button type="button" class="btn ghost" id="f-reset">Azzera filtri</button>
        </div>
        <span class="count" id="count"></span>
        <div class="legend" style="width:100%">${stati().map(s => `<span><i style="background:${esc(s.color)}"></i>${esc(s.label)}</span>`).join('')}<span>${canEdit() ? 'Colori predefiniti: ogni affitto può avere il suo. Tocca un prezzo per prenotare quel periodo; tocca un giorno senza prezzo per una settimana da quel giorno; col mouse puoi anche trascinare.' : canDetail() ? 'Tocca una prenotazione per vederne il dettaglio.' : 'ND = periodo non disponibile.'}</span></div>
      </form>
      <div class="cal" id="cal"></div>`;
    bindToolbar();
    drawCalendar();
  }

  function bindToolbar() {
    const tb = $('#tb');
    tb.addEventListener('submit', e => e.preventDefault());
    if (ui.fav && !favLists().some(l => l.id === ui.fav)) { ui.fav = ''; saveUI(); }
    const map = { 'f-fav': 'fav', 'f-q': 'q', 'f-da': 'da', 'f-a': 'a', 'f-dal': 'dal', 'f-al': 'al', 'f-loc': 'loc', 'f-guests': 'guests', 'f-beds': 'beds' };
    let t;
    Object.entries(map).forEach(([id, k]) => {
      const el = $('#' + id);
      el.addEventListener(el.tagName === 'SELECT' || el.type === 'date' ? 'change' : 'input', () => {
        ui[k] = el.value;
        if (k === 'dal' && ui.dal && (!ui.al || ui.al <= ui.dal)) { ui.al = S.addDays(ui.dal, 7); $('#f-al').value = ui.al; }
        saveUI(); clearTimeout(t); t = setTimeout(drawCalendar, 120);
      });
    });
    const seg = (id, k, cast) => $('#' + id).addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      ui[k] = cast ? cast(b.dataset.v) : b.dataset.v; saveUI();
      $$('#' + id + ' button').forEach(x => x.classList.toggle('on', x === b));
      drawCalendar();
    });
    seg('f-tariff', 'tariff'); seg('f-mode', 'mode'); seg('f-zoom', 'zoom', Number);
    $('#f-more').addEventListener('click', () => { ui.open = !ui.open; saveUI(); tb.classList.toggle('open', ui.open); $('#f-more').setAttribute('aria-expanded', ui.open); });
    $('#f-reset').addEventListener('click', () => {
      Object.assign(ui, { fav: '', q: '', loc: '', da: '', a: '', guests: '', beds: '', dal: '', al: '' }); saveUI(); viewAvail();
    });
  }

  function drawCalendar() {
    const cal = $('#cal'); if (!cal) return;
    const keepX = cal.scrollLeft, keepY = cal.scrollTop;
    const st = settings();
    const W = ui.zoom;
    const start = st.seasonStart;
    const nDays = S.diffDays(start, st.seasonEnd) + 1;
    const days = Array.from({ length: nDays }, (_, i) => S.addDays(start, i));
    const width = nDays * W;
    const nameW = isMobile() ? 112 : 168;

    // intestazione mesi e giorni
    const months = []; days.forEach((d, i) => { const m = d.slice(0, 7); if (!months.length || months[months.length - 1].m !== m) months.push({ m, i, n: 0 }); months[months.length - 1].n++; });
    const mHtml = months.map((m, k) => `<div style="width:${m.n * W}px;background:var(--m${(k % 6) + 1})">${m.n * W > 60 ? S.MESI_L[Number(m.m.slice(5)) - 1] : S.MESI[Number(m.m.slice(5)) - 1]}</div>`).join('');
    const dHtml = days.map((d, i) => {
      const dt = new Date(S.parse(d)); const dow = dt.getUTCDay(); const dd = dt.getUTCDate();
      return `<div class="${dow === 0 || dow === 6 ? 'we' : ''}${dd === 1 && i ? ' som' : ''}" style="width:${W}px">${W >= 14 ? dd : (dd % 5 === 1 ? dd : '')}${W >= 16 ? `<small>${S.GG[dow]}</small>` : ''}</div>`;
    }).join('');

    const dow0 = new Date(S.parse(start)).getUTCDay();
    const sat0 = (6 - dow0 + 7) % 7; // primo sabato
    const trackBg = `background-image:repeating-linear-gradient(90deg, var(--weekend) 0 ${2 * W}px, transparent ${2 * W}px ${7 * W}px),repeating-linear-gradient(90deg, var(--line-soft) 0 1px, transparent 1px ${W}px);background-position:${sat0 * W}px 0,0 0;width:${width}px`;
    const mLines = months.slice(1).map(m => `<span class="mline" style="left:${m.i * W}px"></span>`).join('');

    const vs = filteredVillas();
    const per = st.periods[ui.tariff] || [];
    const da = S.parseMoney(ui.da), a = S.parseMoney(ui.a);
    const priceFilter = (typeof da === 'number') || (typeof a === 'number');
    const byVilla = {}; data().bookings.forEach(b => { (byVilla[b.villaId] = byVilla[b.villaId] || []).push(b); });
    const X = d => S.diffDays(start, d) * W;

    const rows = vs.map(v => {
      const tv = tariffFor(v, ui.tariff) || ui.tariff;
      const perV = S.periodsFor(st, v, tv);
      const fallback = tv !== ui.tariff;
      const spans = [];
      const bars = (byVilla[v.id] || []).map(b => {
        let l = X(b.from) + (b.earlyIn ? 0 : W / 2), r = X(b.to) + (b.lateOut ? W : W / 2);
        if (r < 0 || l > width) return '';
        l = Math.max(l, 0); r = Math.min(r, width); const w = Math.max(r - l, W / 2);
        const col = bookingColor(b);
        spans.push({ l, r: l + w, ink: S.inkFor(col) });
        const txt = b._nd ? 'ND' : b.cliente || (b.status === 'owner' ? 'OWNER' : b.status === 'richiesta' ? 'SU RICHIESTA' : '');
        // prezzo complessivo: concordato, altrimenti stima da listino
        let tot = '';
        if (b._nd) tot = '';
        else if (ui.mode === 'netto' ? typeof b.prezzoAcquisto === 'number' : typeof b.prezzoVendita === 'number') { const sv = srvTot(b); tot = S.money(ui.mode === 'netto' ? b.prezzoAcquisto + sv.acquisto : b.prezzoVendita + sv.vendita); }
        else if (b.status !== 'owner' && b.status !== 'richiesta') { const li = listinoApprox(v, b.from, b.to); const val = li && (li.approx ? li.sale : (ui.mode === 'netto' ? li.net : li.sale)); if (typeof val === 'number') tot = '≈ ' + S.money(val); }
        if (tot && w < 74) tot = tot.replace(' €', '').replace(/\.000$/, 'k');
        const extras = srvLabels(b);
        const tip = [statoLabel(b.status), S.dm(b.from) + ' → ' + S.dm(b.to), b.cliente, typeof b.prezzoVendita === 'number' ? 'Vendita ' + S.money(b.prezzoVendita) : '', typeof b.prezzoAcquisto === 'number' ? 'Acquisto ' + S.money(b.prezzoAcquisto) : '', b.earlyIn ? 'Early check-in' : '', b.lateOut ? 'Late check-out' : ''].concat(extras).filter(Boolean).join(' · ');
        return `<div class="bar" data-b="${esc(b.id)}" style="left:${l}px;width:${w}px;background:${esc(col)};color:${S.inkFor(col)}" title="${esc(tip)}"><span class="who">${esc(txt)}</span>${tot ? `<span class="tot">${esc(tot)}</span>` : ''}</div>`;
      }).join('');
      const nds = ndSpans(v, tv).map(s => {
        const l = Math.max(X(s.from) + W / 2, 0), r = Math.min(X(s.to) + W / 2, width);
        if (r <= 0 || l >= width) return '';
        spans.push({ l, r, ink: '#fff', nd: true });
        return `<div class="bar ndbar" data-nd="${esc(v.id)}" style="left:${l}px;width:${r - l}px" title="Non disponibile da listino · ${S.dm(s.from)} → ${S.dm(s.to)}"><span class="tot">ND</span></div>`;
      }).join('');
      // il prezzo resta sullo sfondo; se il periodo è impegnato il testo prende il colore leggibile sopra la barra
      const pills = perV.map((p, i) => {
        const pr = S.priceAt(v, tv, i, ui.mode); if (pr === null) return '';
        const l = X(p.from), w = Math.max(X(p.to) - l, W);
        const hit = priceFilter && typeof pr === 'number' && (typeof da !== 'number' || pr >= da) && (typeof a !== 'number' || pr <= a);
        const txt = pr === 'ND' ? 'ND' : (w >= 74 ? S.money(pr) : S.short(pr));
        const mid = l + w / 2; const cov = spans.find(s => s.l <= mid && s.r >= mid);
        if (cov || pr === 'ND') return ''; // periodo impegnato o ND: niente prezzo settimanale sotto
        return `<div class="pill${pr === 'ND' ? ' nd' : ''}${hit ? ' hit' : ''}${cov ? ' on' : ''}${fallback ? ' wk' : ''}" data-from="${p.from}" data-to="${p.to}" style="left:${l}px;width:${w}px${cov ? ';color:' + cov.ink : ''}"${cov ? '' : ` role="button" tabindex="0" aria-label="Prenota ${esc(v.name)} ${esc(p.label)}" title="${fallback ? 'Solo prezzo settimanale · ' : ''}Prenota ${esc(p.label)}"`}>${esc(txt)}${fallback && w >= 60 ? '<small>/sett.</small>' : ''}</div>`;
      }).join('');
      const sub = [fallback ? 'solo settimanale' : '', v.location, v.guests || v.pax ? (v.guests || v.pax) + ' osp.' : '', v.totalBedrooms ? v.totalBedrooms + ' cam.' : ''].filter(Boolean).join(' · ');
      return `<div class="vrow" data-v="${esc(v.id)}">
        <div class="vname" data-open="${esc(v.id)}" title="Apri scheda ${esc(v.name)}"><b>${esc(v.name)}</b><small>${esc(sub || ' ')}</small></div>
        <div class="track" style="${trackBg}">${mLines}<div class="lane-a">${nds}${bars}${pills}</div></div>
      </div>`;
    }).join('');

    const hasRange = ui.dal && ui.al && ui.al > ui.dal;
    cal.style.setProperty('--name-w', nameW + 'px');
    cal.innerHTML = `<div class="cal-inner" style="width:${nameW + width}px">
        <div class="cal-head"><div class="corner">${esc(S.TARIFFE.find(t => t.key === ui.tariff).label)} · ${ui.mode === 'netto' ? 'Netto' : 'Listino'}</div>
          <div class="days" style="width:${width}px"><div class="months">${mHtml}</div><div class="dnums">${dHtml}</div></div></div>
        ${rows || `<div class="empty">Nessuna villa corrisponde ai filtri. <button type="button" class="btn small" id="empty-reset">Azzera filtri</button></div>`}
        ${hasRange ? `<div class="selrange" style="left:${nameW + X(ui.dal) + W / 2}px;width:${(S.diffDays(ui.dal, ui.al)) * W}px;top:52px;bottom:0;z-index:1"></div>` : ''}
        <div class="hover-col" hidden></div><div class="hover-tag" hidden></div>
      </div>`;
    cal.scrollLeft = keepX; cal.scrollTop = keepY;
    $('#count').textContent = `${vs.length} di ${data().villas.length} ville` + (hiddenNoPrice ? ` · ${hiddenNoPrice} senza prezzo ${ui.tariff === 'settimanale' ? 'settimanale' : S.TARIFFE.find(t => t.key === ui.tariff).label.toLowerCase() + ' né settimanale'} non mostrate` : '');
    const er = $('#empty-reset'); if (er) er.addEventListener('click', () => $('#f-reset').click());
    bindCalendar(cal, { W, start, nDays, nameW });
  }

  function bindCalendar(cal, g) {
    const inner = $('.cal-inner', cal), hc = $('.hover-col', cal), ht = $('.hover-tag', cal);
    const dayAt = (lane, clientX) => {
      const r = lane.getBoundingClientRect();
      return Math.max(0, Math.min(g.nDays - 1, Math.floor((clientX - r.left) / g.W)));
    };
    inner.addEventListener('click', e => {
      const open = e.target.closest('[data-open]'); if (open) { location.hash = 'villa-' + open.dataset.open; return; }
      const nd = e.target.closest('.ndbar'); if (nd) { location.hash = 'villa-' + nd.dataset.nd; return; }
      const bar = e.target.closest('.bar'); if (bar) { openBooking({ id: bar.dataset.b }); return; }
      const pill = e.target.closest('.pill:not(.on)');
      if (pill) { openBooking({ villaId: pill.closest('.vrow').dataset.v, from: pill.dataset.from, to: pill.dataset.to }); return; }
    });
    inner.addEventListener('keydown', e => {
      const pill = e.target.closest('.pill:not(.on)'); if (!pill || (e.key !== 'Enter' && e.key !== ' ')) return;
      e.preventDefault(); openBooking({ villaId: pill.closest('.vrow').dataset.v, from: pill.dataset.from, to: pill.dataset.to });
    });
    // inserimento: click o trascinamento sulla riga disponibilità
    let drag = null;
    inner.addEventListener('pointerdown', e => {
      const lane = e.target.closest('.lane-a'); if (!lane || e.target.closest('.bar') || e.target.closest('.pill:not(.on)') || e.button !== 0) return;
      const d0 = dayAt(lane, e.clientX);
      drag = { lane, d0, d1: d0, villa: lane.closest('.vrow').dataset.v, type: e.pointerType, x: e.clientX, y: e.clientY, el: null };
    });
    inner.addEventListener('pointermove', e => {
      // mirino con la data
      const r = inner.getBoundingClientRect();
      const x = e.clientX - r.left - g.nameW;
      if (x >= 0 && e.pointerType === 'mouse') {
        const i = Math.floor(x / g.W);
        if (i < g.nDays) {
          hc.hidden = false; ht.hidden = false;
          hc.style.left = (g.nameW + i * g.W + g.W / 2) + 'px'; hc.style.height = inner.scrollHeight + 'px';
          ht.style.left = (g.nameW + i * g.W + g.W / 2) + 'px'; ht.style.top = (cal.scrollTop + 2) + 'px';
          ht.textContent = S.dmy(S.addDays(g.start, i));
        }
      } else { hc.hidden = true; ht.hidden = true; }
      if (!drag || drag.type !== 'mouse') return;
      drag.d1 = dayAt(drag.lane, e.clientX);
      if (drag.d1 !== drag.d0) {
        if (!drag.el) { drag.el = document.createElement('div'); drag.el.className = 'selrange'; drag.lane.appendChild(drag.el); }
        const a = Math.min(drag.d0, drag.d1), b = Math.max(drag.d0, drag.d1);
        drag.el.style.left = (a * g.W + g.W / 2) + 'px'; drag.el.style.width = ((b - a) * g.W) + 'px';
      }
    });
    inner.addEventListener('pointerleave', () => { hc.hidden = true; ht.hidden = true; });
    window.addEventListener('pointerup', function up(e) {
      if (!document.body.contains(inner)) { window.removeEventListener('pointerup', up); return; }
      if (!drag) return;
      const d = drag; drag = null;
      if (d.el) d.el.remove();
      if (d.type !== 'mouse' && (Math.abs(e.clientX - d.x) > 8 || Math.abs(e.clientY - d.y) > 8)) return; // era uno scroll
      const a = Math.min(d.d0, d.d1), b = Math.max(d.d0, d.d1);
      const from = S.addDays(g.start, a), to = b > a ? S.addDays(g.start, b) : S.addDays(from, 7);
      openBooking({ villaId: d.villa, from, to });
    });
  }

  /* =====================================================================
     PRENOTAZIONE (finestra)
     ===================================================================== */
  const julyWeek = v => { const wk = S.periodsFor(settings(), v, 'settimanale'); const p = wk.find(x => x.from >= '2027-07-01') || wk[0]; return p ? { from: p.from, to: p.to } : { from: '2027-07-04', to: '2027-07-11' }; };
  const fmtNum = x => new Intl.NumberFormat('it-IT').format(x);
  function openBooking(init) {
    const dlg = $('#dlg');
    const existing = init.id ? data().bookings.find(b => b.id === init.id) : null;
    // profilo "solo ND": nessun dettaglio da mostrare; profilo in sola lettura: niente nuove prenotazioni
    if (existing && existing._nd) { toast('Periodo non disponibile'); return; }
    if (!existing && !canEdit()) { toast('Il tuo profilo può solo visualizzare le prenotazioni'); return; }
    const ro = !canEdit();
    const b = existing ? Object.assign({}, existing) : { id: S.uid('b'), villaId: init.villaId, status: 'occupato', from: init.from, to: init.to, cliente: '', note: '' };
    let color = bookingColor(b); let colorTouched = !isDefaultColor(b);
    const villas = sortedVillas();
    dlg.innerHTML = `<form class="dlg" method="dialog" id="bform">
      <h3>${ro ? 'Prenotazione' : existing ? 'Modifica periodo' : 'Nuovo periodo'}</h3>
      <section class="dsec sec-date"><h4>Villa e date</h4>
      <label class="field"><span>Villa</span><select id="b-villa">${villas.map(v => `<option value="${esc(v.id)}" ${v.id === b.villaId ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select></label>
      <div class="row">
        <label class="field"><span>Check-in</span><input type="date" id="b-from" value="${esc(b.from)}" required></label>
        <label class="field"><span>Check-out</span><input type="date" id="b-to" value="${esc(b.to)}" required></label>
      </div>
      <div class="nights" id="b-nights"></div>
      <div class="flags">
        <label class="flag"><input type="checkbox" id="b-early" ${b.earlyIn ? 'checked' : ''}><span><b>Early check-in</b><small>Il giorno di arrivo resta tutto a questo affitto</small></span></label>
        <label class="flag"><input type="checkbox" id="b-late" ${b.lateOut ? 'checked' : ''}><span><b>Late check-out</b><small>Il giorno di partenza resta tutto a questo affitto</small></span></label>
      </div>
      </section>
      <section class="dsec sec-cli"><h4>Cliente e prezzo</h4>
      <label class="field"><span>Cliente</span><input id="b-cliente" value="${esc(b.cliente)}" placeholder="Cognome cliente"></label>
      <div class="row">
        <label class="field"><span>Vendita concordata €</span><input id="b-sale" inputmode="numeric" value="${typeof b.prezzoVendita === 'number' ? esc(fmtNum(b.prezzoVendita)) : ''}"></label>
        <label class="field"${canAcq() ? '' : ' hidden'}><span>Acquisto concordato €</span><input id="b-buy" inputmode="numeric" value="${typeof b.prezzoAcquisto === 'number' ? esc(fmtNum(b.prezzoAcquisto)) : ''}"></label>
      </div>
      <div class="pricehint" id="b-hint"></div>
      <div id="b-spese"></div>
      ${canSee('spese') && (data().assegnazioni || []).length ? `<div class="field"><span>Assegnata a (app Scontrini)</span><div class="as-mini">${(data().assegnazioni || []).map(ac => `<label class="as-check"><input type="checkbox" data-bacc="${esc(ac.email)}" ${(ac.prenotazioni || []).includes(b.id) || (ac.ville || []).includes(b.villaId) ? 'checked' : ''} ${(ac.ville || []).includes(b.villaId) ? 'disabled title="Ha già tutta la villa"' : ''}> ${esc(ac.nome || ac.email)}</label>`).join('')}</div></div>` : ''}
      </section>
      <section class="dsec sec-srv"><h4>Servizi</h4>
      <div class="srv-list">
        ${servizi().map(x => { const d = srvDet(b, x.key); const on = hasSrv(b, x); return `<div class="srv-item${on ? ' on' : ''}" data-sk="${esc(x.key)}">
          <label class="flag"><input type="checkbox" class="srv-cb" ${x.base ? `id="b-${x.key}"` : `data-srv="${esc(x.key)}"`} ${on ? 'checked' : ''}><span><b>${esc(x.label)}</b></span></label>
          <div class="srv-det"${on ? '' : ' hidden'}>
            <div class="seg small srv-mode"><button type="button" data-inc="1" class="${d.incluso ? 'on' : ''}">Incluso nel prezzo</button><button type="button" data-inc="0" class="${d.incluso ? '' : 'on'}">A parte</button></div>
            <div class="row srv-prices"${d.incluso ? ' hidden' : ''}>
              <label class="field"${canAcq() ? '' : ' hidden'}><span>Acquisto €</span><input data-sa inputmode="numeric" value="${typeof d.acquisto === 'number' ? esc(fmtNum(d.acquisto)) : ''}"></label>
              <label class="field"><span>Vendita €</span><input data-sv inputmode="numeric" value="${typeof d.vendita === 'number' ? esc(fmtNum(d.vendita)) : ''}"></label>
            </div>
            <label class="field"><span>Note</span><input data-sn value="${esc(d.note)}" placeholder="es. 3 cene, orari, fornitore"></label>
          </div></div>`; }).join('')}
      </div>
      <div class="pricehint" id="b-srv-hint"></div>
      </section>
      <section class="dsec sec-look"><h4>Stato e colore</h4>
      <div class="row">
        <label class="field"><span>Stato</span><select id="b-status">${stati().map(s => `<option value="${esc(s.key)}" ${s.key === b.status ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}</select></label>
        <div class="field"><span>Colore</span><div class="swatch-prev" id="b-prev"></div></div>
      </div>
      <div class="swatches" id="b-sw" role="radiogroup" aria-label="Colore dell'affitto">
        ${S.PALETTE.map(c => `<button type="button" role="radio" class="sw" data-c="${c}" style="background:${c}" aria-label="Colore ${c}"></button>`).join('')}
        <label class="sw custom" title="Altro colore"><input type="color" id="b-color" value="${esc(color)}" aria-label="Altro colore"></label>
      </div>
      </section>
      <label class="field"><span>Note</span><textarea id="b-note" rows="2">${esc(b.note)}</textarea></label>
      <div id="b-warn"></div>
      <div id="b-confirm"></div>
      <div class="foot">
        ${existing && !ro ? '<button type="button" class="btn danger left" id="b-del">Elimina</button>' : ''}
        <button type="button" class="btn" id="b-cancel">${ro ? 'Chiudi' : 'Annulla'}</button>
        ${ro ? '' : '<button type="submit" class="btn primary" id="b-save">Salva</button>'}
      </div>
    </form>`;
    const f = $('#bform', dlg);
    if (ro) { f.classList.add('readonly'); $$('input,select,textarea,button.sw,.srv-mode button,#b-uselist', f).forEach(el => { el.disabled = true; }); }
    const paint = () => {
      const p = $('#b-prev'); p.style.background = color; p.style.color = S.inkFor(color); p.textContent = $('#b-cliente').value.trim() || 'Anteprima';
      $$('#b-sw .sw[data-c]').forEach(s => { const on = s.dataset.c.toLowerCase() === color.toLowerCase(); s.classList.toggle('on', on); s.setAttribute('aria-checked', on); });
      $('#b-color').value = color;
    };
    $('#b-sw').addEventListener('click', e => { const s = e.target.closest('.sw[data-c]'); if (!s) return; color = s.dataset.c; colorTouched = true; paint(); });
    $('#b-color').addEventListener('input', e => { color = e.target.value; colorTouched = true; paint(); });
    $('#b-status').addEventListener('change', e => { if (!colorTouched) { color = statoColor(e.target.value); paint(); } });
    const read = () => ({ villaId: $('#b-villa').value, status: $('#b-status').value, from: $('#b-from').value, to: $('#b-to').value, cliente: $('#b-cliente').value.trim(), note: $('#b-note').value.trim(), color: colorTouched ? color : null, earlyIn: $('#b-early').checked, lateOut: $('#b-late').checked, prezzoVendita: money('#b-sale'), prezzoAcquisto: money('#b-buy'), pulizia: $('#b-pulizia').checked, cuoco: $('#b-cuoco').checked, transfer: $('#b-transfer').checked, serviziDett: readSrv(), servizi: $$('#bform [data-srv]').filter(c => c.checked).map(c => c.dataset.srv).concat((b.servizi || []).filter(k => !servizi().some(x => x.key === k))) });
    function money(sel) { const v = S.parseMoney($(sel).value); return typeof v === 'number' ? v : null; }
    const num = el => { const v = S.parseMoney(el.value); return typeof v === 'number' ? v : null; };
    // dettagli dei servizi: tengo anche quelli di servizi non spuntati o non più in elenco, così non si perdono
    function readSrv() {
      const out = JSON.parse(JSON.stringify(b.serviziDett || {}));
      $$('#bform .srv-item').forEach(it => {
        const k = it.dataset.sk; const cb = it.querySelector('.srv-cb');
        const d = { incluso: it.querySelector('.srv-mode .on').dataset.inc === '1', acquisto: num(it.querySelector('[data-sa]')), vendita: num(it.querySelector('[data-sv]')), note: it.querySelector('[data-sn]').value.trim() };
        if (!cb.checked && d.incluso && d.acquisto === null && d.vendita === null && !d.note) delete out[k]; else out[k] = d;
      });
      return out;
    }
    $$('#bform .srv-item').forEach(it => {
      // prezzi predefiniti (Impostazioni → Servizi e inclusioni): riempiono solo le caselle vuote
      const k = it.dataset.sk; const def = Object.assign({}, ((settings().prezziServizi || {})[k]) || {}); const defA = (data().serviziAcquisto || {})[k];
      const riempi = () => { const v = it.querySelector('[data-sv]'), a = it.querySelector('[data-sa]');
        if (!v.value.trim() && typeof def.vendita === 'number') v.value = fmtNum(def.vendita);
        if (canAcq() && !a.value.trim() && typeof defA === 'number') a.value = fmtNum(defA); };
      const modo = inc => { it.querySelectorAll('.srv-mode button').forEach(z => z.classList.toggle('on', (z.dataset.inc === '1') === inc)); it.querySelector('.srv-prices').hidden = inc; if (!inc) riempi(); };
      it.querySelector('.srv-cb').addEventListener('change', e => { it.classList.toggle('on', e.target.checked); it.querySelector('.srv-det').hidden = !e.target.checked;
        if (e.target.checked && !(b.serviziDett || {})[k]) { modo(def.incluso !== false); check(); } });
      it.querySelector('.srv-mode').addEventListener('click', e => { const bt = e.target.closest('button'); if (!bt) return; modo(bt.dataset.inc === '1'); check(); });
    });
    // regola: check-out e check-in possono cadere nello stesso giorno (massimo 2 affitti in quel giorno);
    // se due affitti condividono anche una sola notte il salvataggio è bloccato.
    let blocked = false;
    const check = () => {
      const x = read(); const n = x.from && x.to ? S.diffDays(x.from, x.to) : 0;
      $('#b-nights').textContent = n > 0 ? `${n} notti · ${S.dmy(x.from)} → ${S.dmy(x.to)}` : 'Il check-out deve essere dopo il check-in.';
      const others = x.status === 'richiesta' ? [] : data().bookings.filter(o => o.id !== b.id && o.villaId === x.villaId && o.status !== 'richiesta');
      const clash = others.filter(o => o.from < x.to && o.to > x.from);
      const swap = others.filter(o => o.to === x.from || o.from === x.to);
      const desc = o => `${o.cliente ? esc(o.cliente) : esc(statoLabel(o.status))} ${S.dm(o.from)} → ${S.dm(o.to)}`;
      // giorno di cambio non condivisibile se c'è un early check-in o un late check-out
      const swapBad = [];
      swap.forEach(o => {
        if (o.to === x.from && (x.earlyIn || o.lateOut)) swapBad.push(`${S.dmy(x.from)}: ${x.earlyIn ? 'questo affitto ha l\'early check-in' : ''}${x.earlyIn && o.lateOut ? ' e ' : ''}${o.lateOut ? desc(o) + ' ha il late check-out' : ''}`);
        if (o.from === x.to && (x.lateOut || o.earlyIn)) swapBad.push(`${S.dmy(x.to)}: ${x.lateOut ? 'questo affitto ha il late check-out' : ''}${x.lateOut && o.earlyIn ? ' e ' : ''}${o.earlyIn ? desc(o) + ' ha l\'early check-in' : ''}`);
      });
      blocked = clash.length > 0 || swapBad.length > 0;
      $('#b-warn').innerHTML = clash.length
        ? `<div class="warn err"><b>Non disponibile.</b> Oltre al giorno di cambio coincidono altri giorni con ${clash.map(desc).join(', ')}.</div>`
        : swapBad.length ? `<div class="warn err"><b>Giorno di cambio non disponibile.</b> ${swapBad.join('; ')}.</div>`
        : swap.length ? `<div class="warn ok">Coincide solo il giorno di cambio con ${swap.map(desc).join(', ')}.</div>` : '';
      // ND da listino: avviso (non blocca)
      const vv = villaById(x.villaId);
      const ndHit = vv && n > 0 ? ndSpans(vv, ui.tariff).filter(s => s.from < x.to && s.to > x.from) : [];
      if (!clash.length && !swapBad.length && ndHit.length) $('#b-warn').innerHTML += `<div class="warn">Il listino segna ND dal ${ndHit.map(s => S.dm(s.from) + ' al ' + S.dm(s.to)).join(', ')}. Puoi salvare se la villa è stata confermata.</div>`;
      // prezzi
      const li = n > 0 ? listinoFor(vv, x.from, x.to) : null;
      $('#b-sale').placeholder = li ? fmtNum(li.sale) : '';
      $('#b-buy').placeholder = li && li.net ? fmtNum(li.net) : '';
      const sv = srvTot(x); const hasSv = sv.vendita || sv.acquisto;
      const mg = typeof x.prezzoVendita === 'number' && typeof x.prezzoAcquisto === 'number' ? x.prezzoVendita + sv.vendita - x.prezzoAcquisto - sv.acquisto : null;
      const totV = typeof x.prezzoVendita === 'number' ? x.prezzoVendita + sv.vendita : null;
      $('#b-hint').innerHTML = [
        li ? `Listino: <b>${S.money(li.sale)}</b>${li.net ? ` · netto ${S.money(li.net)}` : ''} <span class="muted">(${esc(li.label)})</span>${ro ? '' : ' <button type="button" class="btn small" id="b-uselist">Usa listino</button>'}` : '<span class="muted">Nessun prezzo di listino per queste date esatte.</span>',
        hasSv ? `Servizi a parte: vendita <b>${S.money(sv.vendita)}</b>${canAcq() ? ` · acquisto ${S.money(sv.acquisto)}` : ''}${totV !== null ? ` · <b>Totale cliente ${S.money(totV)}</b>` : ''}` : '',
        mg !== null && canAcq() ? `Guadagno${hasSv ? ' con i servizi' : ''}: <b>${S.money(mg)}</b>${totV ? ` (${Math.round(mg / totV * 1000) / 10}%)` : ''}` : ''
      ].filter(Boolean).join('<br>');
      const sh = $('#b-srv-hint'); if (sh) sh.innerHTML = hasSv ? `Servizi a parte: vendita <b>${S.money(sv.vendita)}</b>${canAcq() ? ` · acquisto ${S.money(sv.acquisto)}` : ''} · si sommano al prezzo dell'affitto.` : '';
      const ul = $('#b-uselist'); if (ul) ul.onclick = () => { $('#b-sale').value = fmtNum(li.sale); if (li.net) $('#b-buy').value = fmtNum(li.net); check(); };
      const sb = $('#b-save'); if (sb) sb.disabled = !(n > 0) || blocked;
      paint();
    };
    f.addEventListener('input', check); f.addEventListener('change', check); check();
    if (existing && store.mode === 'online' && window.SDBSpese && canSee('spese')) {
      const drawSp = () => {
        const el = $('#b-spese'); if (!el) return;
        if (!spese.ready) { el.innerHTML = ''; return; }
        const t = window.SDBSpese.totaleBooking(spese.list, data().bookings, b.id);
        el.innerHTML = `<div class="sp-inline"><span>Spese: <b>${window.SDBSpese.euro(t.tot)}</b> · ${t.n} ${t.n === 1 ? 'scontrino' : 'scontrini'}</span>${t.n ? '<button type="button" class="btn small" id="b-spese-go">Vedi spese</button>' : ''}</div>`;
        const g = $('#b-spese-go'); if (g) g.onclick = () => { dlg.close(); goSpese({ spVilla: b.villaId, spPren: b.id, spPeriodo: 'tutto' }); };
      };
      drawSp(); speseHooks.add(drawSp);
    }
    $('#b-cancel').addEventListener('click', () => dlg.close());
    f.addEventListener('submit', e => {
      e.preventDefault(); if (ro) return; check(); const x = read(); if (!(S.diffDays(x.from, x.to) > 0) || blocked) return;
      store.upsertBooking(Object.assign(b, x));
      const accBoxes = $$('[data-bacc]', dlg);
      if (accBoxes.length) {
        const l = JSON.parse(JSON.stringify(data().assegnazioni || [])); let changed = false;
        accBoxes.forEach(cb => { if (cb.disabled) return; const ac = l.find(z => z.email === cb.dataset.bacc); if (!ac) return; ac.prenotazioni = ac.prenotazioni || []; const has = ac.prenotazioni.includes(b.id); if (cb.checked && !has) { ac.prenotazioni.push(b.id); changed = true; } if (!cb.checked && has) { ac.prenotazioni = ac.prenotazioni.filter(z => z !== b.id); changed = true; } });
        if (changed) store.setAssegnazioni(l);
      }
      dlg.close(); toast(existing ? 'Periodo aggiornato' : 'Periodo inserito'); route();
    });
    const del = $('#b-del');
    if (del) del.addEventListener('click', () => {
      $('#b-confirm').innerHTML = `<div class="confirm-bar">Eliminare questo periodo? <button type="button" class="btn small danger solid" id="b-del-ok">Elimina</button><button type="button" class="btn small" id="b-del-no">No</button></div>`;
      $('#b-del-ok').addEventListener('click', () => { store.removeBooking(b.id); dlg.close(); toast('Periodo eliminato'); route(); });
      $('#b-del-no').addEventListener('click', () => { $('#b-confirm').innerHTML = ''; });
    });
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    setTimeout(() => (existing ? $('#b-cliente') : $('#b-status')).focus(), 30);
  }

  /* =====================================================================
     ELENCO VILLE
     ===================================================================== */
  function weeklyRange(v) {
    const n = (settings().periods.settimanale || []).length; const vals = [];
    for (let i = 0; i < n; i++) { const p = S.priceAt(v, 'settimanale', i, 'listino'); if (typeof p === 'number') vals.push(p); }
    if (!vals.length) return '';
    const mn = Math.min(...vals), mx = Math.max(...vals);
    return mn === mx ? S.money(mn) : `${S.short(mn)} – ${S.short(mx)}`;
  }
  const LOC_TONES = ['--m1', '--m2', '--m3', '--m4', '--m5', '--m6'];
  function villaStats(v) {
    const st = settings(); const wk = S.periodsFor(st, v, 'settimanale');
    const bks = data().bookings.filter(b => b.villaId === v.id);
    let free = 0, nd = 0, booked = 0;
    const prices = wk.map((p, i) => {
      const pr = S.priceAt(v, 'settimanale', i, 'listino');
      const busy = bks.some(b => blocks(b.status) && b.from < p.to && b.to > p.from && S.diffDays(b.from > p.from ? b.from : p.from, b.to < p.to ? b.to : p.to) >= 3);
      if (pr === 'ND') nd++; else if (busy) booked++; else free++;
      return { pr, busy };
    });
    return { prices, free, nd, booked, bks, total: wk.length };
  }
  const ICON = {
    ospiti: '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><circle cx="12" cy="8" r="3.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M4.5 20c.8-4 3.7-6 7.5-6s6.7 2 7.5 6" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
    camere: '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path d="M3 18V7m0 6h18v5M7 13V10h5v3" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
    bagni: '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path d="M4 12h16v2a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM7 12V6a2 2 0 0 1 4 0" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
    area: '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><rect x="4.5" y="4.5" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>'
  };
  function viewVillas() {
    const locs = locations();
    const sortOpts = [['name', 'Nome A–Z'], ['priceAsc', 'Prezzo più basso'], ['priceDesc', 'Prezzo più alto'], ['guests', 'Più ospiti'], ['free', 'Più settimane libere']];
    if (!ui.vsort || ui.vsort === 'order') ui.vsort = 'name'; ui.vloc = ui.vloc || ''; ui.vlist = ui.vlist || '';
    main.innerHTML = `<div class="page"><div class="wrap">
      <div class="head"><div><h1>Ville</h1><div class="sub" id="vl-sub"></div></div>
        <div class="actions">${isFull() ? '<button class="btn primary" id="vl-add">+ Nuova villa</button>' : ''}</div></div>
      <div class="vl-tools">
        <input type="search" id="vl-q" placeholder="Cerca per nome, proprietario, zona" value="${esc(ui.q)}">
        <label class="field vl-sort"><span>Ordina</span><select id="vl-sort">${sortOpts.map(([k, l]) => `<option value="${k}" ${ui.vsort === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      </div>
      <div class="fav-bar" id="vl-lists"></div>
      <div class="loc-chips" id="vl-locs">
        <button type="button" data-l="" class="${!ui.vloc ? 'on' : ''}">Tutte le zone</button>
        ${locs.map((l, i) => `<button type="button" data-l="${esc(l)}" class="${ui.vloc === l ? 'on' : ''}" style="--tone:var(${LOC_TONES[i % 6]})"><i></i>${esc(l)} <em>${data().villas.filter(v => String(v.location || '').trim().toUpperCase() === l).length}</em></button>`).join('')}
      </div>
      <div class="vcards" id="vl-body"></div>
    </div></div>`;
    const body = $('#vl-body');
    const st = settings(); const total = S.diffDays(st.seasonStart, st.seasonEnd) + 1;
    const drawLists = () => {
      const ls = favLists();
      if (ui.vlist && !ls.some(l => l.id === ui.vlist)) ui.vlist = '';
      const cur = ls.find(l => l.id === ui.vlist);
      $('#vl-lists').innerHTML = `<span class="fav-lbl">Elenchi preferiti</span>
        <button type="button" data-fl="" class="fav-chip ${!ui.vlist ? 'on' : ''}">Tutte le ville</button>
        ${ls.map(l => `<button type="button" data-fl="${esc(l.id)}" class="fav-chip ${ui.vlist === l.id ? 'on' : ''}">${HEART(true)}${esc(l.nome)} <em>${(l.ville || []).length}</em></button>`).join('')}
        <button type="button" class="fav-chip add" id="fl-new">+ Nuovo elenco</button>
        ${cur ? `<span class="fav-tools"><button type="button" class="btn small" id="fl-ren">Rinomina</button><button type="button" class="btn small danger" id="fl-del">Elimina elenco</button></span>` : ''}
        <div id="fl-edit" class="fav-edit" hidden></div>`;
      const edit = $('#fl-edit');
      const ask = (label, val, ok) => {
        edit.hidden = false;
        edit.innerHTML = `<input id="fl-in" value="${esc(val)}" placeholder="Nome dell'elenco"><button type="button" class="btn small primary" id="fl-ok">${label}</button><button type="button" class="btn small" id="fl-no">Annulla</button>`;
        const inp = $('#fl-in'); inp.focus(); inp.select();
        const go = () => { const n = inp.value.trim(); if (!n) { inp.focus(); return; } ok(n); };
        $('#fl-ok').onclick = go; inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); go(); } };
        $('#fl-no').onclick = () => { edit.hidden = true; };
      };
      $('#fl-new').onclick = () => ask('Crea', '', n => { const id = S.uid('l'); store.setPreferiti(favLists().concat([{ id, nome: n, ville: [] }])); ui.vlist = id; saveUI(); drawLists(); draw(); toast('Elenco creato: tocca il cuore sulle ville per aggiungerle'); });
      const ren = $('#fl-ren'); if (ren) ren.onclick = () => ask('Salva', cur.nome, n => { store.setPreferiti(favLists().map(l => l.id === cur.id ? Object.assign({}, l, { nome: n }) : l)); drawLists(); });
      const del = $('#fl-del'); if (del) del.onclick = () => {
        edit.hidden = false;
        edit.innerHTML = `<span>Eliminare l'elenco <b>${esc(cur.nome)}</b>? Le ville restano, si toglie solo l'elenco.</span><button type="button" class="btn small danger solid" id="fl-dok">Elimina</button><button type="button" class="btn small" id="fl-no">Annulla</button>`;
        $('#fl-dok').onclick = () => { store.setPreferiti(favLists().filter(l => l.id !== cur.id)); ui.vlist = ''; saveUI(); drawLists(); draw(); };
        $('#fl-no').onclick = () => { edit.hidden = true; };
      };
    };
    const draw = () => {
      const q = $('#vl-q').value.trim().toLowerCase();
      const cur = favLists().find(l => l.id === ui.vlist);
      let list = sortedVillas().filter(v => (!q || `${v.name} ${v.location} ${v.proprietario} ${v.nomeReale}`.toLowerCase().includes(q)) && (!ui.vloc || String(v.location || '').trim().toUpperCase() === ui.vloc) && (!cur || (cur.ville || []).includes(v.id)))
        .map(v => ({ v, s: villaStats(v) }));
      const minP = x => { const n = x.s.prices.map(p => p.pr).filter(p => typeof p === 'number'); return n.length ? Math.min(...n) : null; };
      const maxP = x => { const n = x.s.prices.map(p => p.pr).filter(p => typeof p === 'number'); return n.length ? Math.max(...n) : null; };
      const cmp = {
        name: (a, b) => byName(a.v, b.v),
        priceAsc: (a, b) => (minP(a) ?? 1e12) - (minP(b) ?? 1e12),
        priceDesc: (a, b) => (maxP(b) ?? -1) - (maxP(a) ?? -1),
        guests: (a, b) => ((num(b.v.guests) ?? num(b.v.pax) ?? -1) - (num(a.v.guests) ?? num(a.v.pax) ?? -1)),
        free: (a, b) => b.s.free - a.s.free
      }[ui.vsort];
      list.sort(cmp);
      $('#vl-sub').textContent = `${list.length} ville${cur ? ' nell\'elenco ' + cur.nome : ''}${ui.vloc ? ' a ' + ui.vloc : ''} · prezzi di vendita settimanali`;
      body.innerHTML = list.length ? list.map(({ v, s }) => {
        const mn = minP({ s }), mx = maxP({ s });
        const area = v.indoorSqm ? (/mq|m2|m²/i.test(String(v.indoorSqm)) ? v.indoorSqm : v.indoorSqm + ' mq') : '';
        const statList = [[v.guests || v.pax, 'Ospiti', ICON.ospiti], [v.totalBedrooms || v.guestBedrooms, 'Camere da letto', ICON.camere], [v.bathrooms, 'Bagni', ICON.bagni], [area, 'Area', ICON.area]].filter(([x]) => x !== '' && x != null);
        const strip = ndSpans(v, 'settimanale').map(x => `<i class="ndseg" style="left:${S.diffDays(st.seasonStart, x.from) / total * 100}%;width:${S.diffDays(x.from, x.to) / total * 100}%"></i>`).join('')
          + s.bks.map(b => `<i style="background:${esc(bookingColor(b))};left:${(S.diffDays(st.seasonStart, b.from) + .5) / total * 100}%;width:${Math.max(S.diffDays(b.from, b.to), .5) / total * 100}%"></i>`).join('');
        const desc = String((!hiddenField('servizi') && v.servizi) || (!hiddenField('note') && v.note) || '').replace(/\s+/g, ' ').trim();
        const th = thumbs.map[v.id];
        const badge = [v.location, v.seafront].filter(Boolean).map(x => String(x).trim()).join(', ');
        const fav = isFav(v.id);
        return `<article class="vcard" data-id="${esc(v.id)}" tabindex="0">
          <div class="vc-media">
            ${th && th.thumb ? `<img src="${esc(th.thumb)}" alt="${esc(v.name)}" loading="lazy">` : `<div class="vc-ph"><span>${esc(String(v.name || '?').trim().charAt(0))}</span><small>${store.mode === 'online' ? 'Aggiungi foto dalla scheda' : 'Nessuna foto'}</small></div>`}
            <button type="button" class="vc-heart${fav ? ' on' : ''}" data-act="fav" aria-label="${fav ? 'Nei preferiti' : 'Aggiungi ai preferiti'}" title="Preferiti">${HEART(fav)}</button>
            ${badge ? `<span class="vc-badge">${esc(badge)}</span>` : ''}
          </div>
          <div class="vc-body">
            <h3 class="vc-name">${esc(v.name)}</h3>
            <p class="vc-desc">${desc ? esc(desc) : (v.proprietario && !hiddenField('proprietario') ? 'Proprietario: ' + esc(v.proprietario) : isFull() ? 'Descrizione da completare' : '')}</p>
            ${statList.length ? `<div class="vc-stats2">${statList.map(([x, l, ic]) => `<div><span>${l}</span><b>${ic}${esc(x)}</b></div>`).join('')}</div>` : '<div class="vc-missing">Caratteristiche da completare</div>'}
            <hr>
            ${hiddenField('listino') ? '' : `<div class="vc-price2"><span>Affitto settimanale</span><b${mn === null ? ' class="missing"' : ''}>${mn === null ? 'Prezzi da inserire' : mn === mx ? S.money(mn) : `€ ${S.short(mn)} – ${S.short(mx)}`}</b></div>`}
            <div class="vc-avail"><div class="strip">${strip}</div><div class="vc-free"><b>${s.free}</b> settimane libere su ${s.total}${s.nd ? ` · <span class="ndtxt">${s.nd} ND</span>` : ''}</div></div>
          </div>
          <footer class="vc-foot">
            <button type="button" class="btn dark" data-act="open">Scheda ↗</button>
            ${canEdit() ? '<button type="button" class="btn" data-act="book">Prenota</button>' : ''}
            <button type="button" class="btn" data-act="cal">Calendario</button>
          </footer>
        </article>`;
      }).join('') : `<div class="empty">${cur ? 'Questo elenco è vuoto: tocca il cuore su una villa per aggiungerla.' : 'Nessuna villa trovata.'}</div>`;
    };
    drawLists(); draw();
    villasRedraw = () => { drawLists(); draw(); };
    let t; $('#vl-q').addEventListener('input', e => { ui.q = e.target.value; saveUI(); clearTimeout(t); t = setTimeout(draw, 100); });
    $('#vl-sort').addEventListener('change', e => { ui.vsort = e.target.value; saveUI(); draw(); });
    $('#vl-locs').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; ui.vloc = b.dataset.l; saveUI(); $$('#vl-locs button').forEach(x => x.classList.toggle('on', x === b)); draw(); });
    $('#vl-lists').addEventListener('click', e => { const b = e.target.closest('[data-fl]'); if (!b) return; ui.vlist = b.dataset.fl; saveUI(); drawLists(); draw(); });
    const go = e => {
      const c = e.target.closest('.vcard'); if (!c) return;
      const act = e.target.closest('[data-act]'); const v = villaById(c.dataset.id);
      if (act && act.dataset.act === 'fav') { e.stopPropagation(); openFav(v.id, () => { drawLists(); draw(); }); return; }
      if (act && act.dataset.act === 'book') { openBooking(Object.assign({ villaId: v.id }, julyWeek(v))); return; }
      if (act && act.dataset.act === 'cal') { ui.q = v.name; saveUI(); location.hash = 'disponibilita'; return; }
      location.hash = 'villa-' + c.dataset.id;
    };
    body.addEventListener('click', go);
    body.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.classList.contains('vcard')) go(e); });
    if ($('#vl-add')) $('#vl-add').addEventListener('click', newVilla);
  }

  function newVilla() {
    const st = settings();
    const order = Math.max(-1, ...data().villas.map(v => v.order ?? 0)) + 1;
    const v = { id: S.uid('v'), order, name: 'NUOVA VILLA', codice: '', realEstate: '', nomeReale: '', proprietario: '', indirizzo: '', servizi: '', note: '', location: '', seafront: '', indoorSqm: '', outdoorSqm: '', pax: '', guests: '', staff: '', totalBedrooms: '', guestBedrooms: '', staffBedrooms: '', doubleBedrooms: '', twinBedrooms: '', singleBedrooms: '', bathrooms: '', pool: '', gym: '', spa: '', parking: '', kitchens: '', linkSito: '', webBrochure: '', mediaProprietario: '', googleMaps: '', youtube: '', vimeo: '', psw: '', pricing: S.emptyPricing(st) };
    store.upsertVilla(v);
    location.hash = 'villa-' + v.id;
    setTimeout(() => { const n = $('[data-k="name"]'); if (n) { n.focus(); n.select(); } }, 50);
  }

  /* =====================================================================
     SCHEDA VILLA
     ===================================================================== */
  const FIELDS = {
    anagrafica: [['name', 'Nome'], ['codice', 'Codice (es. MRN-PRT)'], ['nomeReale', 'Nome reale'], ['proprietario', 'Proprietario'], ['realEstate', 'Real estate'], ['indirizzo', 'Indirizzo'], ['location', 'Location'], ['seafront', 'Seafront – Seaview']],
    caratteristiche: [['indoorSqm', 'Indoor mq'], ['outdoorSqm', 'Outdoor mq'], ['pax', 'Pax'], ['guests', 'N° ospiti'], ['staff', 'N° staff'], ['totalBedrooms', 'Camere totali'], ['guestBedrooms', 'Camere ospiti'], ['staffBedrooms', 'Camere staff'], ['doubleBedrooms', 'Matrimoniali'], ['twinBedrooms', 'Twin'], ['singleBedrooms', 'Singole'], ['bathrooms', 'Bagni'], ['pool', 'Piscina'], ['gym', 'Palestra'], ['spa', 'Spa'], ['parking', 'Parcheggio'], ['kitchens', 'Cucine']],
    link: [['linkSito', 'Link sito'], ['webBrochure', 'Web brochure'], ['mediaProprietario', 'Media proprietario'], ['googleMaps', 'Google Maps'], ['youtube', 'Video YouTube'], ['vimeo', 'Video Vimeo'], ['psw', 'Password']]
  };
  let villaTab = 'settimanale';
  const RIS_FIELDS = S.CAMPI_SCHEDA;
  const hiddenField = k => !isFull() && (ME().nascosti || S.CAMPI_NASCOSTI_DEFAULT).includes(k);

  function viewVilla(id) {
    const v0 = villaById(id);
    if (!v0) { main.innerHTML = `<div class="page"><div class="wrap"><a class="crumb" href="#ville">← Ville</a><p>Questa villa non esiste più.</p></div></div>`; return; }
    let v = JSON.parse(JSON.stringify(v0));
    const st = settings();
    // profilo limitato: scheda in sola lettura; senza prezzi di acquisto c'è solo il listino di vendita
    const ro = !isFull();
    if (!ro && !v.pricing) v.pricing = S.emptyPricing(st);
    if (v.pricing) S.TARIFFE.forEach(t => {
      const n = st.periods[t.key].length;
      if (!v.pricing[t.key]) v.pricing[t.key] = S.emptyPricing(st)[t.key];
      const p = v.pricing[t.key];
      ['acquisto', 'rettifica', 'fisso'].forEach(k => { p[k] = p[k] || []; while (p[k].length < n) p[k].push(k === 'rettifica' ? 0 : null); });
    });
    const locSelect = () => `<label class="field"><span>Location</span><div class="loc-pick"><select id="v-loc"><option value="">— scegli —</option>${locList().map(l => `<option ${normLoc(v.location) === l ? 'selected' : ''}>${esc(l)}</option>`).join('')}<option value="__new">+ Nuova località…</option></select></div><div class="loc-new" id="v-loc-new" hidden><input id="v-loc-in" placeholder="Nome della località, es. PORTO CERVO"><button type="button" class="btn small primary" id="v-loc-add">Aggiungi</button><button type="button" class="btn small" id="v-loc-x">Annulla</button></div></label>`;
    const inp = (k, label, wide) => `<label class="field"${wide ? ' style="grid-column:1/-1"' : ''}><span>${label}</span><input data-k="${k}" value="${esc(v[k])}"></label>`;
    const linkInp = (k, label) => {
      const val = String(v[k] || ''); const isUrl = /^https?:\/\//i.test(val.trim());
      return `<label class="field"><span>${label}</span><div class="linkrow"><input data-k="${k}" value="${esc(val)}">${isUrl ? `<a href="${esc(val.trim().split(/\s+/)[0])}" target="_blank" rel="noopener">Apri ↗</a>` : ''}</div></label>`;
    };
    main.innerHTML = `<div class="page"><div class="wrap">
      <a class="crumb" href="#disponibilita">← Disponibilità</a>
      <div class="head">
        <div><h1 id="v-title">${esc(v.name)}</h1><div class="sub">${esc([v.location, !hiddenField('seafront') && v.seafront, !hiddenField('proprietario') && v.proprietario && 'Prop. ' + v.proprietario].filter(Boolean).join(' · '))}</div><div id="v-spese"></div></div>
        <div class="actions"><span class="saved" id="saved" aria-live="polite"></span>
          ${isAdmin() && store.mode === 'online' ? '<button class="btn" id="v-share" title="Profili che vedono questa villa"></button>' : ''}
          <button class="btn vfav${isFav(v.id) ? ' on' : ''}" id="v-fav" title="Preferiti">${HEART(isFav(v.id))} Preferiti</button>
          ${canEdit() ? '<button class="btn" id="v-book">+ Periodo</button>' : ''}${ro ? '' : '<button class="btn" id="v-dup">Duplica</button><button class="btn danger" id="v-del">Elimina villa</button>'}</div>
      </div>
      <div id="v-confirm"></div>
      <div class="cols2">
        <section class="card"><h2>Anagrafica</h2><div class="grid wide">${FIELDS.anagrafica.filter(([k]) => !hiddenField(k)).map(([k, l]) => k === 'location' ? locSelect() : inp(k, l)).join('')}</div></section>
        <section class="card"><h2>Servizi e note</h2>
          <label class="field"><span>Descrizione (per offerte e clienti)</span><textarea data-k="descrizione" rows="5">${esc(v.descrizione || '')}</textarea></label>
          ${hiddenField('servizi') ? '' : `<label class="field"><span>Servizi inclusi</span><textarea data-k="servizi" rows="4">${esc(v.servizi)}</textarea></label>`}
          ${hiddenField('note') ? '' : `<label class="field"><span>Note</span><textarea data-k="note" rows="4">${esc(v.note)}</textarea></label>`}${hiddenField('servizi') && hiddenField('note') ? '<p class="note">Riservati.</p>' : ''}</section>
      </div>
      <section class="card"><h2>Caratteristiche</h2><div class="grid">${FIELDS.caratteristiche.map(([k, l]) => inp(k, l)).join('')}</div></section>
      <section class="card"><h2>Servizi compresi nel prezzo</h2>
        <p class="note">Spunta i servizi che questa villa ha già compresi nel prezzo d'affitto: nelle Offerte, con "Predefinito", per questa villa risultano inclusi e non si sommano al prezzo.</p>
        <div class="v-srv" id="v-srv">${servizi(settings().servizi).map(x => `<label class="flag"><input type="checkbox" data-vsrv="${esc(x.key)}" ${(v.serviziInclusi || []).includes(x.key) ? 'checked' : ''} ${ro ? 'disabled' : ''}><span><b>${esc(x.label)}</b></span></label>`).join('')}</div>
      </section>
      <section class="card" id="v-photos"><h2>Foto</h2>
        <div class="ph-grid" id="ph-grid"></div>
        <div class="ph-tools">${store.mode === 'online' && !ro ? `<label class="btn" for="ph-add">+ Aggiungi foto</label><input type="file" id="ph-add" accept="image/*" multiple hidden>` : ''}<span class="note" id="ph-msg"></span></div>
      </section>
      ${store.listBrochure ? `<section class="card" id="v-bro"><h2>Brochure</h2>
        <div class="bro-list" id="bro-list"><p class="note">Caricamento…</p></div>
        ${ro ? '' : `<div class="ph-tools"><select id="bro-lang" aria-label="Lingua della brochure"><option value="en">Inglese</option><option value="it">Italiano</option><option value="">Altra lingua</option></select><label class="btn" for="bro-add">+ Carica brochure PDF</label><input type="file" id="bro-add" accept="application/pdf,.pdf" hidden><span class="note" id="bro-msg"></span></div>`}
      </section>` : ''}
      <section class="card"><h2>Link e media</h2><div class="grid wide">${FIELDS.link.filter(([k]) => !hiddenField(k)).map(([k, l]) => linkInp(k, l)).join('')}</div></section>
      ${hiddenField('listino') ? '' : '<section class="card" id="prices"></section>'}
      <section class="card"><h2>Disponibilità ${esc(st.seasonName)}</h2><div class="minitl" id="v-tl"></div><div class="blist" id="v-blist"></div></section>
    </div></div>`;

    if (ro) $$('[data-k], #v-loc', main).forEach(el => { el.disabled = true; });
    // condivisione con i profili (solo amministratori): pulsante accanto a Preferiti
    const drawShareBtn = () => {
      const b = $('#v-share'); if (!b) return;
      const pm = data().profili || {}; const n = Object.keys(pm).filter(k => !pm[k].completo && (pm[k].ville || []).includes(v.id)).length;
      b.classList.toggle('on', n > 0);
      b.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3 2.8-4.8 5.5-4.8s4.9 1.8 5.5 4.8"/><circle cx="17" cy="9" r="2.6"/><path d="M15.5 14.4c2.4.1 4.3 1.7 4.9 4.6"/></svg> Condivisa con${n ? ' · ' + n : ''}`;
    };
    drawShareBtn();
    if ($('#v-share')) $('#v-share').addEventListener('click', () => openShare(v.id, drawShareBtn));
    // salvataggio automatico
    let saveT;
    const save = () => {
      clearTimeout(saveT); $('#saved').textContent = 'Modifiche in corso…';
      saveT = setTimeout(() => { store.upsertVilla(JSON.parse(JSON.stringify(v))); $('#saved').textContent = 'Salvato'; }, 350);
    };
    $$('[data-vsrv]').forEach(el => el.addEventListener('change', () => {
      v.serviziInclusi = $$('[data-vsrv]').filter(x => x.checked).map(x => x.dataset.vsrv); save();
    }));
    $$('[data-k]').forEach(el => el.addEventListener('input', () => {
      v[el.dataset.k] = el.value;
      if (el.dataset.k === 'name') $('#v-title').textContent = el.value || 'Senza nome';
      save();
    }));
    const locSel = $('#v-loc');
    if (locSel) {
      const showNew = on => { $('#v-loc-new').hidden = !on; if (on) $('#v-loc-in').focus(); };
      locSel.addEventListener('change', () => {
        if (locSel.value === '__new') { showNew(true); return; }
        showNew(false); v.location = locSel.value; save();
      });
      const addIt = () => {
        const n = $('#v-loc-in').value; const norm = normLoc(n); if (!norm) { $('#v-loc-in').focus(); return; }
        const similar = locList().find(l => l !== norm && (l.replace(/[^A-Z]/g, '') === norm.replace(/[^A-Z]/g, '') || l.replace(/^P\.?\s*/, 'PORTO ') === norm || norm.replace(/^P\.?\s*/, 'PORTO ') === l));
        if (similar && !$('#v-loc-new').dataset.ok) { $('#v-loc-new').dataset.ok = '1'; toast(`Esiste già "${similar}": premi di nuovo Aggiungi per crearla comunque`); return; }
        const val = addLocation(norm); v.location = val; save();
        locSel.insertAdjacentHTML('beforeend', ''); // l'elenco si aggiorna al prossimo disegno
        const opt = document.createElement('option'); opt.textContent = val; locSel.insertBefore(opt, locSel.querySelector('option[value="__new"]')); locSel.value = val;
        showNew(false); toast('Località aggiunta');
      };
      $('#v-loc-add').onclick = addIt;
      $('#v-loc-in').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); addIt(); } };
      $('#v-loc-x').onclick = () => { showNew(false); locSel.value = normLoc(v.location) || ''; };
    }

    if ($('#prices')) drawPrices();
    function drawPrices() {
      if (ro) return drawPricesRO();
      const box = $('#prices'); const t = villaTab; const p = v.pricing[t]; const per = S.periodsFor(st, v, t);
      const defC = st.cambio || 'domenica';
      box.innerHTML = `<h2>Listino prezzi</h2>
        <div class="cambio-row"><span class="lbl">Giorno di cambio</span><div class="seg" id="p-cambio">${[['', 'Predefinito (' + defC + ')'], ['sabato', 'Sabato'], ['domenica', 'Domenica']].map(([k, l]) => `<button type="button" data-c="${k}" class="${(v.cambio || '') === k ? 'on' : ''}">${l}</button>`).join('')}</div>
          <span class="note">${v.cambio ? 'Questa villa usa un giorno diverso dal predefinito.' : 'Segue il giorno impostato in Impostazioni.'}</span></div>
        <div class="tabs" id="p-tabs">${S.TARIFFE.map(x => `<button type="button" data-t="${x.key}" class="${x.key === t ? 'on' : ''}">${x.label}</button>`).join('')}</div>
        ${t !== 'settimanale' ? `<div class="cambio-row"><span class="lbl">Date dei periodi</span><div class="seg" id="p-perm">${[['def', 'Predefinite'], ['own', 'Personalizzate per questa villa']].map(([k, l]) => `<button type="button" data-m="${k}" class="${(v.periodi && v.periodi[t] ? 'own' : 'def') === k ? 'on' : ''}">${l}</button>`).join('')}</div>
          <span class="note">${v.periodi && v.periodi[t] ? 'Modifica le date direttamente nella tabella.' : 'Uguali per tutte le ville (Impostazioni).'}</span></div>` : ''}
        <div class="params">
          <label class="field"><span>Spese servizi €</span><input data-p="spese" inputmode="numeric" value="${esc(p.spese)}"><small class="lbl-sub">Netto vendita</small></label>
          <label class="field"><span>Arrotonda a €</span><input data-p="arrotonda" inputmode="numeric" value="${esc(p.arrotonda)}"></label>
          <label class="field"><span>Margine %</span><input data-p="margine" inputmode="decimal" value="${esc(Math.round((Number(p.margine) || 0) * 1000) / 10)}"></label>
          <div class="formula">Vendita = acquisto ÷ (1 − margine) + spese, arrotondato per eccesso, + rettifica. Scrivi ND se non disponibile.</div>
        </div>
        <div class="tbl-wrap"><table class="prices"><thead><tr><th>Periodo</th><th>Acquisto (netto)</th><th>Rettifica</th><th style="text-align:right">Vendita (listino)</th><th style="text-align:right">Guadagno</th></tr></thead><tbody>
          ${per.map((pp, i) => `<tr data-i="${i}"><td class="per">${t !== 'settimanale' && v.periodi && v.periodi[t] ? `${esc(pp.label)}<span class="per-edit"><input type="date" data-vp="${i}" data-vk="from" value="${esc(pp.from)}"><input type="date" data-vp="${i}" data-vk="to" value="${esc(pp.to)}"></span>` : `${esc(pp.label)}${pp.label.includes(S.dm(pp.from)) ? '' : `<small>${S.dm(pp.from)} → ${S.dm(pp.to)}</small>`}`}</td>
            <td><input data-f="acquisto" data-i="${i}" inputmode="numeric" value="${esc(fmtIn(p.acquisto[i]))}" placeholder="—"></td>
            <td><input class="adj" data-f="rettifica" data-i="${i}" inputmode="numeric" value="${esc(p.rettifica[i] ? fmtIn(p.rettifica[i]) : '')}" placeholder="0"></td>
            <td class="sale" data-sale="${i}"></td><td class="mg" data-mg="${i}"></td></tr>`).join('')}
        </tbody></table></div>`;
      per.forEach((_, i) => upd(i));
      const pm = $('#p-perm', box);
      if (pm) pm.addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b) return;
        v.periodi = v.periodi || {};
        if (b.dataset.m === 'own' && !v.periodi[t]) v.periodi[t] = JSON.parse(JSON.stringify(S.autoPeriodsFor(st, v, t)));
        if (b.dataset.m === 'def') delete v.periodi[t];
        save(); drawPrices();
      });
      $$('[data-vp]', box).forEach(el => el.addEventListener('change', () => {
        const p = v.periodi[t][Number(el.dataset.vp)]; const prev = p[el.dataset.vk]; if (!el.value) return; p[el.dataset.vk] = el.value;
        if (!(p.to > p.from)) { p[el.dataset.vk] = prev; toast('Il check-out deve essere dopo il check-in'); drawPrices(); return; }
        save(); drawPrices();
      }));
      $('#p-cambio', box).addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; v.cambio = b.dataset.c; save(); drawPrices(); });
      $('#p-tabs', box).addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; villaTab = b.dataset.t; drawPrices(); });
      $$('[data-p]', box).forEach(el => el.addEventListener('input', () => {
        const k = el.dataset.p; let val = S.parseMoney(el.value);
        if (k === 'margine') { const n = Number(String(el.value).replace(',', '.')); val = isFinite(n) ? n / 100 : 0; }
        p[k] = typeof val === 'number' ? val : 0;
        per.forEach((_, i) => upd(i)); save();
      }));
      $$('[data-f]', box).forEach(el => el.addEventListener('input', () => {
        const i = Number(el.dataset.i), f = el.dataset.f; const val = S.parseMoney(el.value);
        if (f === 'acquisto') { p.acquisto[i] = val; p.fisso[i] = null; }
        else p.rettifica[i] = typeof val === 'number' ? val : 0;
        upd(i); save();
      }));
      function upd(i) {
        const sale = S.salePrice(p.acquisto[i], p, p.rettifica[i], p.fisso[i]);
        const c = $(`[data-sale="${i}"]`, box); c.textContent = sale === null ? '—' : S.money(sale); c.classList.toggle('nd', sale === 'ND' || sale === null);
        const acq = p.acquisto[i];
        $(`[data-mg="${i}"]`, box).textContent = typeof sale === 'number' && typeof acq === 'number' ? S.money(sale - acq) : '';
      }
    }
    function drawPricesRO() {
      const box = $('#prices'); const t = villaTab; const per = S.periodsFor(st, v, t);
      box.innerHTML = `<h2>Listino prezzi</h2>
        <div class="tabs" id="p-tabs">${S.TARIFFE.map(x => `<button type="button" data-t="${x.key}" class="${x.key === t ? 'on' : ''}">${x.label}</button>`).join('')}</div>
        <div class="tbl-wrap"><table class="prices"><thead><tr><th>Periodo</th>${canAcq() ? '<th style="text-align:right">Acquisto (netto)</th>' : ''}<th style="text-align:right">Vendita (listino)</th></tr></thead><tbody>
          ${per.map((pp, i) => { const sale = S.priceAt(v, t, i, 'listino'); const net = canAcq() ? S.priceAt(v, t, i, 'netto') : null;
            return `<tr><td class="per">${esc(pp.label)}${pp.label.includes(S.dm(pp.from)) ? '' : `<small>${S.dm(pp.from)} → ${S.dm(pp.to)}</small>`}</td>${canAcq() ? `<td class="sale">${net === null ? '—' : S.money(net)}</td>` : ''}<td class="sale${sale === 'ND' || sale === null ? ' nd' : ''}">${sale === null ? '—' : S.money(sale)}</td></tr>`; }).join('')}
        </tbody></table></div>`;
      $('#p-tabs', box).addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; villaTab = b.dataset.t; drawPrices(); });
    }
    function fmtIn(x) { if (x === null || x === undefined || x === '') return ''; if (x === 'ND') return 'ND'; return new Intl.NumberFormat('it-IT').format(x); }

    // periodi della villa
    const drawBookings = () => {
      const list = data().bookings.filter(b => b.villaId === v.id).sort((a, b) => a.from < b.from ? -1 : 1);
      const total = S.diffDays(st.seasonStart, st.seasonEnd) + 1;
      $('#v-tl').innerHTML = list.map(b => `<div class="bar" style="background:${esc(bookingColor(b))};left:${(S.diffDays(st.seasonStart, b.from) + .5) / total * 100}%;width:${Math.max(S.diffDays(b.from, b.to), .5) / total * 100}%" title="${esc(S.dm(b.from) + ' → ' + S.dm(b.to))}"></div>`).join('');
      $('#v-blist').innerHTML = list.length ? list.map(b => `<div class="bitem" data-b="${esc(b.id)}" tabindex="0"><span class="chip" style="background:${esc(bookingColor(b))};color:${S.inkFor(bookingColor(b))}">${esc(statoLabel(b.status))}</span><span class="dates">${S.dm(b.from)} → ${S.dm(b.to)}</span><span class="nights">${S.diffDays(b.from, b.to)} notti${b.earlyIn ? ' · early check-in' : ''}${b.lateOut ? ' · late check-out' : ''}${srvLabels(b).map(l => ' · ' + esc(l.toLowerCase())).join('')}</span>${typeof b.prezzoVendita === 'number' ? `<span class="dates">${S.money(b.prezzoVendita)}</span>` : ''}<span class="who">${esc([b.cliente, b.note].filter(Boolean).join(' · '))}</span></div>`).join('')
        : '<div class="note">Nessun periodo inserito. Usa “+ Periodo” o clicca sul calendario.</div>';
    };
    drawBookings();
    if (store.mode === 'online' && window.SDBSpese && canSee('spese')) {
      const anno = new Date().getFullYear();
      const drawSp = () => {
        const el = $('#v-spese'); if (!el || !spese.ready) return;
        const t = window.SDBSpese.totaleVillaAnno(spese.list, v.id, anno);
        el.innerHTML = `<div class="sp-inline">Spese ${anno}: <b>${window.SDBSpese.euro(t.tot)}</b> · ${t.n} ${t.n === 1 ? 'scontrino' : 'scontrini'} <button type="button" class="btn small" id="v-spese-go">Vedi spese</button></div>`;
        $('#v-spese-go').onclick = () => goSpese({ spVilla: v.id, spPeriodo: 'anno' });
      };
      drawSp(); speseHooks.add(drawSp);
    }
    $('#v-blist').addEventListener('click', e => { const it = e.target.closest('[data-b]'); if (it) openBooking({ id: it.dataset.b }); });
    $('#v-blist').addEventListener('keydown', e => { if (e.key === 'Enter') { const it = e.target.closest('[data-b]'); if (it) openBooking({ id: it.dataset.b }); } });
    if ($('#v-book')) $('#v-book').addEventListener('click', () => openBooking(Object.assign({ villaId: v.id }, julyWeek(v))));
    $('#v-fav').addEventListener('click', () => openFav(v.id, () => { const f = isFav(v.id); const b = $('#v-fav'); if (b) { b.classList.toggle('on', f); b.innerHTML = HEART(f) + ' Preferiti'; } }));
    // foto della villa
    let foto = [];
    const phMsg = t => { const m = $('#ph-msg'); if (m) m.textContent = t || ''; };
    const rulesMsg = err => err && err.code === 'permission-denied' ? 'Per salvare le foto bisogna prima aggiornare le regole di Firestore (vedi istruzioni).' : 'Errore: ' + (err && err.message || err);
    const drawFoto = () => {
      const g = $('#ph-grid'); if (!g) return;
      const coverId = (thumbs.map[v.id] || {}).fotoId;
      g.innerHTML = foto.length ? foto.map(f => `<figure class="ph-item${f.id === coverId ? ' cover' : ''}" data-f="${esc(f.id)}">
          <button type="button" class="ph-open" data-open-f="${esc(f.id)}"><img src="${esc(f.thumb || f.img)}" alt="Foto di ${esc(v.name)}" loading="lazy"></button>
          <figcaption>${ro ? '' : f.id === coverId ? '<span class="ph-badge">Copertina</span>' : `<button type="button" class="btn small" data-cover="${esc(f.id)}">Copertina</button>`}<button type="button" class="btn small danger" data-delf="${esc(f.id)}">Elimina</button></figcaption>
        </figure>`).join('') : `<p class="note">${ro ? 'Nessuna foto.' : store.mode === 'online' ? 'Nessuna foto. Aggiungi la prima: diventa la copertina della scheda.' : 'Le foto si possono caricare solo con i dati online.'}</p>`;
    };
    const loadFoto = () => {
      if (store.mode !== 'online' || !store.listFoto) { drawFoto(); return; }
      $('#ph-grid').innerHTML = '<p class="note">Caricamento foto…</p>';
      store.listFoto(v.id).then(l => { foto = l; drawFoto(); }, err => { $('#ph-grid').innerHTML = ''; phMsg(rulesMsg(err)); });
    };
    loadFoto();
    // brochure PDF della villa (si allegano alle offerte)
    if ($('#v-bro')) {
      const LING = { it: 'Italiano', en: 'Inglese', '': 'Altra lingua' };
      let bro = [];
      const broMsg = t => { const m = $('#bro-msg'); if (m) m.textContent = t || ''; };
      const kb = n => n >= 1e6 ? (n / 1e6).toFixed(1).replace('.', ',') + ' MB' : Math.round(n / 1000) + ' KB';
      const drawBro = () => { const el = $('#bro-list'); if (!el) return;
        el.innerHTML = bro.length ? bro.map(b => `<div class="bro-item"><span class="bro-ico">PDF</span><span class="bro-nm"><b>${esc(b.nome)}</b><small>${esc(LING[b.lingua || ''] || b.lingua)} · ${kb(b.size || 0)}</small></span>
            <button type="button" class="btn small" data-bro-dl="${esc(b.id)}">Scarica</button>${ro ? '' : `<button type="button" class="btn small danger" data-bro-del="${esc(b.id)}">Elimina</button>`}</div>`).join('')
          : `<p class="note">${ro ? 'Nessuna brochure.' : 'Nessuna brochure. Carica il PDF (fino a 10 MB): nelle Offerte potrai allegarlo alla mail.'}</p>`; };
      const loadBro = () => store.listBrochure(v.id).then(l => { bro = l.sort((a, b) => String(a.lingua).localeCompare(String(b.lingua))); drawBro(); }, err => { $('#bro-list').innerHTML = ''; broMsg(err && err.code === 'permission-denied' ? 'Per le brochure bisogna prima pubblicare le nuove regole di Firestore.' : 'Errore: ' + (err && err.message || err)); });
      loadBro();
      $('#bro-list').addEventListener('click', async e => {
        const d = e.target.closest('[data-bro-dl]'), x = e.target.closest('[data-bro-del]');
        const b = bro.find(y => y.id === (d || x || {}).dataset?.[d ? 'broDl' : 'broDel']); if (!b) return;
        if (d) { broMsg('Scaricamento…'); try { window.SDBExport.scarica(b.nome, await store.getBrochure(b)); broMsg(''); } catch (err) { broMsg('Errore: ' + (err.message || err)); } }
        if (x) { if (!confirm(`Eliminare la brochure "${b.nome}"?`)) return; try { await store.deleteBrochure(b); toast('Brochure eliminata'); loadBro(); } catch (err) { broMsg('Errore: ' + (err.message || err)); } }
      });
      const ba = $('#bro-add');
      if (ba) ba.addEventListener('change', async () => {
        const f = ba.files[0]; ba.value = ''; if (!f) return;
        if (!/pdf$/i.test(f.type) && !/\.pdf$/i.test(f.name)) { broMsg('Serve un file PDF.'); return; }
        if (f.size > 10e6) { broMsg(`Il file è ${kb(f.size)}: il massimo è 10 MB. Esportalo più leggero (es. "dimensione file ridotta").`); return; }
        try { await store.addBrochure(v.id, f, $('#bro-lang').value, (k, n) => broMsg(n > 1 ? `Caricamento ${k} di ${n}…` : 'Caricamento…')); broMsg(''); toast('Brochure caricata'); loadBro(); }
        catch (err) { broMsg(err && err.code === 'permission-denied' ? 'Per le brochure bisogna prima pubblicare le nuove regole di Firestore.' : 'Errore: ' + (err.message || err)); }
      });
    }
    const add = $('#ph-add');
    if (add) add.addEventListener('change', async () => {
      const files = Array.from(add.files || []); add.value = ''; if (!files.length) return;
      for (let i = 0; i < files.length; i++) {
        phMsg(`Caricamento ${i + 1} di ${files.length}…`);
        try {
          const img = await compressImage(files[i], 1600, 700000);
          const th = await compressImage(files[i], 640, 70000);
          await store.addFoto(v.id, img, th, Date.now() + i, !thumbs.map[v.id] && i === 0 && !foto.length);
        } catch (err) { phMsg(rulesMsg(err)); return; }
      }
      phMsg(files.length === 1 ? 'Foto aggiunta' : files.length + ' foto aggiunte'); loadFoto();
    });
    $('#ph-grid').addEventListener('click', async e => {
      const o = e.target.closest('[data-open-f]');
      if (o) {
        const f = foto.find(x => x.id === o.dataset.openF); if (!f) return;
        const dlg = $('#dlg');
        dlg.innerHTML = `<div class="dlg sp-photo"><h3>${esc(v.name)}</h3><div class="sp-photo-box"><img src="${esc(f.img)}" alt="Foto di ${esc(v.name)}"></div><div class="foot"><a class="btn" href="${esc(f.img)}" download="${esc(v.name)}-${esc(f.id.slice(0, 6))}.jpg">Scarica</a><button type="button" class="btn primary" id="ph-close">Chiudi</button></div></div>`;
        $('#ph-close').onclick = () => dlg.close(); dlg.onclick = ev => { if (ev.target === dlg) dlg.close(); };
        if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
        return;
      }
      const c = e.target.closest('[data-cover]');
      if (c) { const f = foto.find(x => x.id === c.dataset.cover); try { await store.setCover(v.id, f.id, f.thumb); thumbs.map[v.id] = { thumb: f.thumb, fotoId: f.id }; drawFoto(); phMsg('Copertina aggiornata'); } catch (err) { phMsg(rulesMsg(err)); } return; }
      const d = e.target.closest('[data-delf]');
      if (d) {
        const fig = d.closest('figure'); const id = d.dataset.delf;
        fig.querySelector('figcaption').innerHTML = `<span class="ph-q">Eliminare?</span><button type="button" class="btn small danger solid" data-delok="${esc(id)}">Sì</button><button type="button" class="btn small" data-delno="1">No</button>`;
        return;
      }
      if (e.target.closest('[data-delno]')) { drawFoto(); return; }
      const ok = e.target.closest('[data-delok]');
      if (ok) {
        const id = ok.dataset.delok; const rest = foto.filter(x => x.id !== id);
        try { await store.deleteFoto(v.id, id, rest[0] || null); foto = rest; if ((thumbs.map[v.id] || {}).fotoId === id) thumbs.map[v.id] = rest[0] ? { thumb: rest[0].thumb, fotoId: rest[0].id } : undefined; drawFoto(); phMsg('Foto eliminata'); }
        catch (err) { phMsg(rulesMsg(err)); }
      }
    });
    if (!ro) $('#v-dup').addEventListener('click', () => {
      store.upsertVilla(JSON.parse(JSON.stringify(v)));
      const c = JSON.parse(JSON.stringify(v)); c.id = S.uid('v'); c.name = v.name + ' (copia)'; c.order = (v.order ?? 0) + 0.5;
      store.upsertVilla(c); toast('Villa duplicata'); location.hash = 'villa-' + c.id;
    });
    if (!ro) $('#v-del').addEventListener('click', () => {
      const n = data().bookings.filter(b => b.villaId === v.id).length;
      $('#v-confirm').innerHTML = `<div class="confirm-bar"><div><b>Eliminare ${esc(v.name)}?</b> ${n ? `Verranno eliminati anche i suoi <b>${n} periodi</b> dal calendario. ` : ''}Gli scontrini collegati restano nell'app Scontrini, ma non saranno più agganciati ${n ? 'a queste prenotazioni' : 'a questa villa'}. L'operazione non si può annullare.</div><button class="btn small danger solid" id="vd-ok">Elimina</button><button class="btn small" id="vd-no">Annulla</button></div>`;
      $('#vd-ok').addEventListener('click', () => { clearTimeout(saveT); store.removeVilla(v.id); toast('Villa eliminata'); location.hash = 'ville'; });
      $('#vd-no').addEventListener('click', () => { $('#v-confirm').innerHTML = ''; });
    });
  }

  /* =====================================================================
     APPUNTI
     ===================================================================== */
  function viewNotes() {
    main.innerHTML = `<div class="page"><div class="wrap">
      <div class="head"><div><h1>Appunti</h1><div class="sub">Ville da valutare, prezzi da chiedere, promemoria. Era il foglio “90”.</div></div><div class="actions"><span class="saved" id="saved"></span></div></div>
      <textarea class="notes-area" id="notes" aria-label="Appunti">${esc(data().notes)}</textarea></div></div>`;
    let t; $('#notes').addEventListener('input', e => { $('#saved').textContent = 'Modifiche in corso…'; clearTimeout(t); t = setTimeout(() => { store.setNotes(e.target.value); $('#saved').textContent = 'Salvato'; }, 400); });
  }

  /* =====================================================================
     IMPOSTAZIONI
     ===================================================================== */
  let perTab = 'bisettimanale';
  /* Impostazioni divise in pagine: al computer menu a sinistra, sul cellulare un indice a voci
     (#impostazioni) che apre ogni pagina (#impostazioni-<pagina>) con "‹ Impostazioni" per tornare. */
  function setPages() {
    const nAcc = ((data().accessi && data().accessi.utenti) || []).length; const nLoc = locList().length;
    return [
      ['generale', 'Generale', 'Tema, nome e date della stagione'],
      ['listini', 'Listini e periodi', 'Giorno di cambio, periodi, valori per le nuove ville'],
      ['aspetto', 'Aspetto predefiniti', 'Stati e colori, ' + nLoc + ' località'],
      ['servizi', 'Servizi e inclusioni', 'Prezzi predefiniti dei servizi, voci incluse nelle offerte'],
      store.mode === 'online' && isFull() ? ['account', 'Account e accessi', nAcc ? nAcc + (nAcc === 1 ? ' account autorizzato' : ' account autorizzati') : 'Chi può entrare e in quali pagine'] : null,
      window.SDBReport ? ['schede', 'Schede incomplete', 'Campi non compilati di ogni villa'] : null,
      ['dati', 'Dati e backup', 'Backup e pulizia di fine stagione']
    ].filter(Boolean).filter(p => isFull() || p[0] === 'generale');
  }
  function viewSettings(sub) {
    const st = JSON.parse(JSON.stringify(settings()));
    const pages = setPages();
    if (sub && !pages.some(p => p[0] === sub)) { location.hash = 'impostazioni'; return; }
    const cur = sub || 'generale'; const curP = pages.find(p => p[0] === cur);
    const pg = (k, html) => `<div class="set-page" data-sp="${k}"${k === cur ? '' : ' hidden'}>${html}</div>`;
    window.scrollTo(0, 0);
    main.innerHTML = `<div class="page"><div class="wrap">
      <div class="head set-head ${sub ? 'has-sub' : 'is-index'}"><div><a class="set-back" href="#impostazioni">‹ Impostazioni</a><h1><span class="t-main">Impostazioni</span><span class="t-sub">${esc(curP[1])}</span></h1></div><div class="actions"><span class="saved" id="saved"></span></div></div>
      <div class="set-layout ${sub ? 'has-sub' : 'is-index'}">
      <nav class="set-nav" aria-label="Pagine delle impostazioni">${pages.map(([k, l, d]) => `<a href="#impostazioni-${k}" class="${k === cur ? 'on' : ''}"><span class="sn-t">${esc(l)}<small>${esc(d)}</small></span><span class="sn-chev" aria-hidden="true">›</span></a>`).join('')}</nav>
      <div class="set-body"><h2 class="set-title">${esc(curP[1])}</h2>
      ${pg('generale', `      <section class="card"><h2>Tema</h2>
        <div class="field"><span>Tema</span><div class="seg" id="s-theme">${[['light', 'Chiaro (panna)'], ['dark', 'Scuro'], ['auto', 'Come il dispositivo']].map(([k, l]) => `<button type="button" data-v="${k}" class="${ui.theme === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
        <p class="note">La scelta vale solo per questo dispositivo.</p></section>
      <section class="card"><h2>Stagione</h2><div class="grid">
        <label class="field"><span>Nome</span><input id="s-name" value="${esc(st.seasonName)}"></label>
        <label class="field"><span>Inizio calendario</span><input type="date" id="s-start" value="${esc(st.seasonStart)}"></label>
        <label class="field"><span>Fine calendario</span><input type="date" id="s-end" value="${esc(st.seasonEnd)}"></label></div></section>`)}
      ${store.mode === 'online' && isFull() ? pg('account', `${isAdmin() ? `<section class="card${data().protezione ? '' : ' danger-card'}" id="prot-card"></section>` : ''}
      <section class="card" id="acc-card"><h2>Account autorizzati</h2>
        <p class="note">Chi è in questo elenco può accedere con il proprio account Google. Scegli a quale app può entrare e, per Summer Database, il suo profilo. Senza profilo l'account non vede nessuna villa. Solo gli amministratori possono modificare l'elenco.</p>
        <div id="acc-list"></div>
        <form class="loc-new" id="acc-add" autocomplete="off"><input id="acc-email" type="email" placeholder="email Google"><input id="acc-nome" placeholder="Nome (facoltativo)"><button class="btn small">Aggiungi account</button></form>
        <div id="acc-msg"></div>
      </section>
      <section class="card" id="prof-card"><h2>Profili utente</h2>
        <p class="note">Ogni account usa un profilo, che decide cosa vede e cosa può fare. Le ville si condividono dalla scheda di ogni villa, nella sezione "Condivisa con": un profilo nuovo e una villa nuova non sono condivisi con nessuno. Gli amministratori vedono sempre tutto.</p>
        <div id="prof-list"></div>
        ${isAdmin() ? '<form class="loc-new" id="prof-add" autocomplete="off"><input id="prof-name" placeholder="Nome del profilo (es. Agenti esterni)"><button class="btn small">Aggiungi profilo</button></form>' : ''}
        <div id="prof-msg"></div>
      </section>
      <section class="card"><h2>Questo dispositivo</h2>
        <p class="note">Accesso come <b>${esc(store.user || '')}</b>.</p>
        <div><button class="btn" id="s-logout">Esci da questo dispositivo</button></div></section>`) : ''}
      ${pg('aspetto', `<section class="card"><h2>Stati delle prenotazioni</h2>
        <p class="note">Sono gli stati che scegli nella finestra della prenotazione, con il loro colore predefinito. Nella prenotazione puoi sempre dare un colore diverso al singolo affitto. Le prenotazioni con un colore scelto a mano lo mantengono; le altre seguono il colore dello stato. "Blocca" indica se lo stato rende la villa non disponibile.</p>
        <div id="st-list" class="st-admin"></div>
        <form class="loc-new st-new" id="st-add" autocomplete="off"><input id="st-add-n" placeholder="Nuovo stato (es. Manutenzione)"><input type="color" class="dot" id="st-add-c" value="#2f6fd6" aria-label="Colore"><label class="st-blk"><input type="checkbox" id="st-add-b" checked> Blocca</label><button class="btn small">Aggiungi stato</button></form>
      </section>
      <section class="card"><h2>Località</h2>
        <p class="note">È l'elenco da cui scegli la località nella scheda di ogni villa e che usi come filtro. Se due nomi indicano lo stesso posto (es. P.CERVO e PORTO CERVO), usa "Unisci in…": tutte le ville passano al nome scelto.</p>
        <div id="loc-list" class="loc-admin"></div>
        <div class="loc-new"><input id="loc-add-in" placeholder="Nuova località"><button type="button" class="btn small" id="loc-add">Aggiungi</button></div>
      </section>`)}
      ${pg('servizi', `<section class="card"><h2>Servizi delle prenotazioni</h2>
        <p class="note">Sono le caselle della sezione Servizi nella finestra della prenotazione. Qui scegli per ognuno se di norma è <b>incluso</b> nel prezzo dell'affitto o <b>a parte</b>, e i prezzi predefiniti: quando spunti il servizio in una prenotazione si compilano da soli, e lì puoi sempre cambiarli. Pulizia finale, cuoco e transfer sono di base; gli altri si rinominano e si tolgono se nessuna prenotazione li usa.${canAcq() ? ' I prezzi di acquisto li vede solo chi vede gli acquisti.' : ''}</p>
        <div class="tbl-wrap"><table class="prices srv-tbl"><thead><tr><th>Servizio</th><th>Di norma</th>${canAcq() ? '<th>Acquisto €</th>' : ''}<th>Vendita €</th><th>Usato</th><th></th></tr></thead><tbody id="srv-list"></tbody></table></div>
        <form class="loc-new" id="srv-add" autocomplete="off"><input id="srv-add-n" placeholder="Nuovo servizio (es. Baby sitter)"><button class="btn small">Aggiungi servizio</button></form>
      </section>
      <section class="card"><h2>Inclusioni delle offerte</h2>
        <p class="note">Sono le voci "Le tariffe includono" della mail di offerta, in italiano e in inglese. Quelle con la spunta sono già selezionate in ogni nuova offerta; nell'offerta le puoi togliere o aggiungere una alla volta. Puoi <b>collegare una voce a un servizio</b>: nell'offerta quella voce si attiva solo quando spunti il servizio come incluso (es. "Pulizia finale e lavanderia finale standard" con il servizio Pulizia finale).</p>
        <div id="inc-list" class="inc-admin"></div>
        <form class="inc-new" id="inc-add" autocomplete="off"><input id="inc-add-it" placeholder="Nuova voce in italiano"><input id="inc-add-en" placeholder="In inglese"><button class="btn small">Aggiungi</button></form>
      </section>`)}
      ${pg('listini', `<section class="card"><h2>Giorno di cambio</h2>
        <div class="field"><span>Le settimane predefinite vanno</span><div class="seg" id="s-cambio">${[['sabato', 'Da sabato a sabato'], ['domenica', 'Da domenica a domenica']].map(([k, l]) => `<button type="button" data-c="${k}" class="${(st.cambio || 'domenica') === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
        <p class="note">Vale per tutte le ville. Nella scheda di ogni villa, sopra il listino prezzi, puoi scegliere un giorno diverso solo per quella villa. Anche le tariffe bisettimanali, mensili e bimensili seguono lo stesso giorno. I prezzi già inseriti restano collegati alla stessa settimana.</p>
        <p class="note" id="s-cambio-n"></p></section>
      <section class="card"><h2>Periodi di bisettimanale, mensile e bimensile</h2>
        <div class="tabs" id="sp-tabs">${S.TARIFFE.filter(x => x.key !== 'settimanale').map(x => `<button type="button" data-t="${x.key}" class="${x.key === perTab ? 'on' : ''}">${x.label}</button>`).join('')}</div>
        <div id="sp-state" class="cambio-row"></div>
        <div class="tbl-wrap"><table class="prices ptable"><thead><tr><th>Periodo</th><th>Dal (check-in)</th><th>Al (check-out)</th><th>Notti</th></tr></thead><tbody id="sp-per"></tbody></table></div>
        <p class="note">Sono le date predefinite per tutte le ville. Nella scheda di una villa puoi sostituirle solo per quella villa. Il numero dei periodi resta fisso, così ogni prezzo resta collegato al suo periodo.</p></section>
      <section class="card"><h2>Valori iniziali per una nuova villa</h2><div class="tbl-wrap"><table class="prices ptable"><thead><tr><th>Tariffa</th><th>Spese servizi €<small class="lbl-sub">Netto vendita</small></th><th>Arrotonda a €</th><th>Margine %</th></tr></thead><tbody>
        ${S.TARIFFE.map(x => `<tr><td class="per">${x.label}</td><td><input data-d="${x.key}" data-k="spese" value="${esc(st.defaults[x.key].spese)}"></td><td><input data-d="${x.key}" data-k="arrotonda" value="${esc(st.defaults[x.key].arrotonda)}"></td><td><input data-d="${x.key}" data-k="margine" value="${esc(Math.round(st.defaults[x.key].margine * 1000) / 10)}"></td></tr>`).join('')}
      </tbody></table></div></section>`)}
      ${window.SDBReport ? pg('schede', '<section class="card" id="rp-card"></section>') : ''}
      ${pg('dati', `${store.mode === 'online' && isFull() ? `<section class="card" id="ab-card"><h2>Backup automatico su questo dispositivo</h2>
        <p class="note">Ogni giorno, la prima volta che apri l'app, scarica da solo un backup completo nella cartella <b>Download</b>: ville con listini di acquisto e vendita, prenotazioni, impostazioni, profili e note spese (senza foto). Una volta a settimana copia i file su una chiavetta e staccala: una copia scollegata resta al sicuro anche se Firebase venisse cancellato.</p>
        <label class="flag ab-flag"><input type="checkbox" id="ab-on" ${lsGet(AUTOKEY) === 'si' ? 'checked' : ''}><span><b>Scarica un backup ogni giorno</b><small>Vale solo per questo computer o telefono. Consigliato sul computer.</small></span></label>
        <p class="note" id="ab-last">${lsGet(LASTKEY) ? 'Ultimo backup automatico su questo dispositivo: ' + esc(S.dmy(lsGet(LASTKEY))) + '.' : 'Nessun backup automatico ancora su questo dispositivo.'}</p>
      </section>` : ''}
      ${store.mode === 'online' && isFull() && window.SDBImportaSito ? '<section class="card" id="is-card"></section>' : ''}
      ${isFull() && window.SDBCaricaCartella ? '<section class="card" id="cc-card"></section>' : ''}
      <section class="card"><h2>Backup e dati</h2>
        <p class="note">${store.mode === 'online' ? `Dati online, condivisi tra gli account autorizzati. Accesso come <b>${esc(store.user || '')}</b>. Esporta comunque un backup ogni tanto.` : 'I dati sono salvati solo in questo browser. Esporta un backup ogni tanto.'}</p>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          <button class="btn" id="s-export">Esporta backup (.json)</button>
          <label class="btn" for="s-import" title="Aggiunge e aggiorna ville e periodi. Non cancella nulla.">Importa backup</label><input type="file" id="s-import" accept=".json,.txt,application/json,text/plain,*/*" hidden>
          <button class="btn" id="s-copy">Copia backup negli appunti</button>
          ${window.SDB_SEED && store.mode === 'local' ? `<button class="btn danger" id="s-reset">Ripristina dati dall'Excel</button>` : ''}
        </div>
        <p class="note">L'importazione aggiunge e aggiorna ville e periodi presenti nel file. Non cancella nulla e non tocca gli scontrini.</p>
        <div id="s-msg"></div>
      </section>
      <section class="card danger-card"><h2>Pulizia per la nuova stagione</h2>
        <p class="note">Svuota il calendario e le note spese per ripartire con l'anno successivo. <b>Le schede delle ville restano intatte</b>: dati, prezzi settimanali, bisettimanali, mensili e bimensili, foto, preferiti e impostazioni. Prima di cancellare l'app scarica un archivio con tutto quello che sta per eliminare. Serve la password di pulizia.</p>
        <div id="wipe-pass"></div>
        <div class="wipe-btns">
          <button class="btn danger" id="w-book">Cancella tutte le prenotazioni (${data().bookings.length})</button>
          ${store.mode === 'online' ? `<button class="btn danger" id="w-sc">Cancella tutte le note spese${spese.ready ? ' (' + spese.list.length + ')' : ''}</button>` : ''}
        </div>
        <div id="wipe-box"></div>
      </section>`)}
    </div></div></div></div>`;
    $('#s-theme').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; ui.theme = b.dataset.v; saveUI(); applyTheme(); $$('#s-theme button').forEach(x => x.classList.toggle('on', x === b)); });
    let t;
    const save = () => { $('#saved').textContent = 'Modifiche in corso…'; clearTimeout(t); t = setTimeout(() => { store.setSettings(JSON.parse(JSON.stringify(st))); refreshShell('impostazioni'); $('#saved').textContent = 'Salvato'; }, 400); };
    if (!isFull()) ['#s-name', '#s-start', '#s-end'].forEach(q => { const el = $(q); if (el) el.disabled = true; });
    $('#s-name').addEventListener('input', e => { st.seasonName = e.target.value; save(); });
    $('#s-start').addEventListener('change', e => { if (e.target.value) { st.seasonStart = e.target.value; save(); } });
    $('#s-end').addEventListener('change', e => { if (e.target.value) { st.seasonEnd = e.target.value; save(); } });
    const drawPerDef = () => {
      const t = perTab; const custom = !!(st.periodiPredefiniti && st.periodiPredefiniti[t]);
      const list = S.periodsFor(st, null, t);
      $('#sp-state').innerHTML = custom
        ? `<span class="note">Date modificate a mano.</span><button type="button" class="btn small" id="sp-reset">Torna alle date automatiche</button>`
        : `<span class="note">Date automatiche: seguono il giorno di cambio (${esc(st.cambio || 'domenica')}). Modificane una per personalizzarle.</span>`;
      $('#sp-per').innerHTML = list.map((p, i) => `<tr><td><input data-pi="${i}" data-pk="label" value="${esc(p.label)}"></td><td><input type="date" data-pi="${i}" data-pk="from" value="${esc(p.from)}"></td><td><input type="date" data-pi="${i}" data-pk="to" value="${esc(p.to)}"></td><td class="mg">${S.diffDays(p.from, p.to)}</td></tr>`).join('');
      const r = $('#sp-reset'); if (r) r.onclick = () => { delete st.periodiPredefiniti[t]; save(); drawPerDef(); };
    };
    drawPerDef();
    $('#sp-tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; perTab = b.dataset.t; $$('#sp-tabs button').forEach(x => x.classList.toggle('on', x === b)); drawPerDef(); });
    $('#sp-per').addEventListener('change', e => {
      const el = e.target; if (!el.dataset.pk || !el.value) return;
      const t = perTab; st.periodiPredefiniti = st.periodiPredefiniti || {};
      if (!st.periodiPredefiniti[t]) st.periodiPredefiniti[t] = JSON.parse(JSON.stringify(S.periodsFor(st, null, t)));
      const p = st.periodiPredefiniti[t][Number(el.dataset.pi)]; const prev = p[el.dataset.pk]; p[el.dataset.pk] = el.value;
      if (!(p.to > p.from)) { p[el.dataset.pk] = prev; toast('Il check-out deve essere dopo il check-in'); drawPerDef(); return; }
      save(); drawPerDef();
    });
    // ---- account autorizzati (meta/accessi) ----
    const APPS = [['summer', 'Summer Database'], ['scontrini', 'Scontrini']];
    const accUsers = () => JSON.parse(JSON.stringify((data().accessi && data().accessi.utenti) || []));
    const accSave = list => Promise.resolve(store.setAccessi(list)).then(() => { $('#acc-msg').innerHTML = ''; drawAcc(); toast('Account aggiornati'); }, err => {
      $('#acc-msg').innerHTML = `<div class="warn err">${err && err.code === 'permission-denied' ? 'Non puoi modificare l\'elenco: serve un account amministratore, e le regole di Firestore devono essere aggiornate (vedi istruzioni).' : 'Salvataggio non riuscito: ' + esc(err.message || err)}</div>`;
    });
    const profMap = () => data().profili || {};
    const profIds = () => Object.keys(profMap()).sort((a, b) => String(profMap()[a].nome || '').localeCompare(String(profMap()[b].nome || ''), 'it'));
    const drawAcc = () => {
      const box = $('#acc-list'); if (!box) return;
      const list = accUsers(); const pm = profMap();
      box.innerHTML = list.length ? `<div class="tbl-wrap"><table class="prices acc-tbl"><thead><tr><th>Account</th>${APPS.map(([, l]) => `<th>${l}</th>`).join('')}<th>Profilo in Summer Database</th><th></th></tr></thead><tbody>
        ${list.map((u, i) => `<tr><td><b>${esc(u.nome || u.email)}</b>${u.nome ? `<small class="note">${esc(u.email)}</small>` : ''}</td>${APPS.map(([k, l]) => `<td class="acc-app" data-l="${l}"><input type="checkbox" data-ui="${i}" data-app="${k}" ${(u.app || []).includes(k) ? 'checked' : ''} aria-label="${l}"></td>`).join('')}
          <td class="acc-prof">${(u.app || []).includes('summer') ? `<select data-up="${i}" aria-label="Profilo"><option value="">— nessun profilo (non vede niente) —</option>${profIds().map(k => `<option value="${esc(k)}" ${u.profilo === k ? 'selected' : ''}>${esc(pm[k].nome || 'Profilo')}${pm[k].completo ? ' · completo' : ''}</option>`).join('')}</select>` : '<span class="note">—</span>'}</td>
          <td><button type="button" class="btn small danger" data-urm="${i}">Togli</button></td></tr>`).join('')}
        </tbody></table></div>` : '<p class="note">Nessun account nell\'elenco: per ora entrano solo gli amministratori scritti nelle regole di Firestore.</p>';
    };
    if ($('#acc-card')) {
      drawAcc();
      $('#acc-list').addEventListener('change', e => {
        const sel = e.target.closest('[data-up]'); if (!sel) return;
        const l = accUsers(); const u = l[Number(sel.dataset.up)]; const pr = profMap()[sel.value];
        if (u.email === String(store.user || '').toLowerCase() && !(pr && pr.completo)) { sel.value = u.profilo || ''; toast('Al tuo account puoi dare solo un profilo con accesso completo'); return; }
        if (sel.value) u.profilo = sel.value; else delete u.profilo;
        accSave(l);
      });
      $('#acc-list').addEventListener('change', e => { const cb = e.target.closest('[data-ui]'); if (!cb) return; const l = accUsers(); const u = l[Number(cb.dataset.ui)];
        if (u.email === String(store.user || '').toLowerCase() && cb.dataset.app === 'summer' && !cb.checked) { cb.checked = true; toast('Non puoi togliere a te stesso l\'accesso a Summer Database'); return; } u.app = (u.app || []).filter(x => x !== cb.dataset.app); if (cb.checked) u.app.push(cb.dataset.app); accSave(l); });
      $('#acc-list').addEventListener('click', e => {
        const b = e.target.closest('[data-urm]'); if (!b) return;
        const l = accUsers(); const u = l[Number(b.dataset.urm)];
        if (u.email === String(store.user || '').toLowerCase()) { toast('Non puoi togliere il tuo account mentre lo stai usando'); return; }
        b.outerHTML = `<span class="as-rmq">Togliere ${esc(u.email)}? Non potrà più entrare. <button type="button" class="btn small danger solid" data-urmok="${b.dataset.urm}">Togli</button></span>`;
      });
      $('#acc-list').addEventListener('click', e => { const b = e.target.closest('[data-urmok]'); if (!b) return; const l = accUsers(); l.splice(Number(b.dataset.urmok), 1); accSave(l); });
      $('#acc-add').addEventListener('submit', e => {
        e.preventDefault(); const email = $('#acc-email').value.trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { toast('Email non valida'); $('#acc-email').focus(); return; }
        const l = accUsers(); if (l.some(u => u.email === email)) { toast('Account già presente'); return; }
        l.push({ email, nome: $('#acc-nome').value.trim(), app: email === String(store.user || '').toLowerCase() ? ['summer', 'scontrini'] : ['scontrini'] }); $('#acc-email').value = ''; $('#acc-nome').value = ''; accSave(l);
      });
    }
    // ---- profili utente (meta/profili) ----
    const PROF_OPTS = [
      ['acquisto', 'Prezzi', [[false, 'Solo listino di vendita'], [true, 'Anche prezzi di acquisto']]],
      ['dettaglio', 'Prenotazioni nel calendario', [[true, 'Con tutti i dettagli'], [false, 'Solo ND, senza dettagli']]],
      ['modifica', 'Prenotazioni', [[false, 'Solo visualizzare'], [true, 'Aggiungere e modificare']]]
    ];
    const profMsg = h => { const m = $('#prof-msg'); if (m) m.innerHTML = h || ''; };
    const profSave = map => Promise.resolve(store.setProfili(map)).then(() => { profMsg(''); drawProf(); drawAcc(); }, err => profMsg(`<div class="warn err">${err && err.code === 'permission-denied' ? 'Solo un amministratore può modificare i profili.' : 'Salvataggio non riuscito: ' + esc(err.message || err)}</div>`));
    // profili aperti/chiusi (si ricordano su questo dispositivo); il profilo appena creato si apre
    const PROFKEY = 'summer-db-profili-aperti';
    const profOpen = (() => { try { return new Set(JSON.parse(localStorage.getItem(PROFKEY) || '[]')); } catch (_) { return new Set(); } })();
    const saveOpen = () => { try { localStorage.setItem(PROFKEY, JSON.stringify(Array.from(profOpen))); } catch (_) {} };
    const drawProf = () => {
      const box = $('#prof-list'); if (!box) return; const pm = profMap(); const users = accUsers(); const adm = isAdmin();
      box.innerHTML = profIds().length ? profIds().map(k => { const p = pm[k]; const nAcc = users.filter(u => u.profilo === k).length; const nV = (p.ville || []).filter(id => villaById(id)).length;
        const riass = p.completo ? 'Completo: vede e modifica tutto' : [(p.pagine || []).length ? (p.pagine || []).map(x => (PAGES.find(y => y[0] === x) || [x, x])[1]).join(', ') : 'nessuna pagina', p.acquisto ? 'anche acquisto' : 'solo vendita', (p.pagine || []).includes('disponibilita') ? (!p.dettaglio ? 'solo ND' : p.modifica ? 'modifica prenotazioni' : 'vede prenotazioni') : ''].filter(Boolean).join(' · ');
        return `<details class="prof-item" data-pid="${esc(k)}"${profOpen.has(k) ? ' open' : ''}>
          <summary class="prof-sum"><b>${esc(p.nome || 'Profilo')}</b><span class="note">${nAcc} account · ${p.completo ? 'tutte le ville' : nV + (nV === 1 ? ' villa' : ' ville')} · ${esc(riass)}</span><i class="chev" aria-hidden="true"></i></summary>
          <div class="prof-body">
          <div class="prof-top"><input data-pn value="${esc(p.nome || '')}" aria-label="Nome del profilo" ${adm ? '' : 'disabled'}>
            ${adm && !nAcc ? '<button type="button" class="btn small danger" data-pdel>Elimina</button>' : ''}</div>
          <div class="prof-opt"><span class="lbl">Accesso</span><div class="seg small" data-pk="completo">${[[false, 'Limitato'], [true, 'Completo: vede e modifica tutto']].map(([v, l]) => `<button type="button" data-v="${v}" class="${!!p.completo === v ? 'on' : ''}" ${adm ? '' : 'disabled'}>${l}</button>`).join('')}</div></div>
          ${p.completo ? '' : `<div class="prof-opt"><span class="lbl">Pagine</span><div class="pg-chips">${PAGES.map(([pk, l]) => `<label class="pg-chip"><input type="checkbox" data-ppg="${pk}" ${(p.pagine || []).includes(pk) ? 'checked' : ''} ${adm ? '' : 'disabled'}><span>${l}</span></label>`).join('')}</div></div>`}
          ${p.completo ? '' : PROF_OPTS.filter(([pk]) => pk === 'acquisto' ? (p.pagine || []).includes('disponibilita') || (p.pagine || []).includes('ville') : (p.pagine || []).includes('disponibilita')).map(([pk, lbl, opts]) => { const off = pk === 'modifica' && !p.dettaglio; return `<div class="prof-opt"><span class="lbl">${lbl}</span><div class="seg small" data-pk="${pk}">${opts.map(([v, l]) => `<button type="button" data-v="${v}" class="${(off ? false : !!p[pk]) === v ? 'on' : ''}" ${adm && !off ? '' : 'disabled'}>${l}</button>`).join('')}</div>${off ? '<span class="note">Con "Solo ND" le prenotazioni si possono solo vedere.</span>' : ''}</div>`; }).join('')}
          ${p.completo || !(p.pagine || []).includes('ville') ? '' : `<div class="prof-opt"><span class="lbl">Dati della scheda villa nascosti</span><div class="pg-chips ris-chips">${RIS_FIELDS.map(([fk, l]) => `<label class="pg-chip"><input type="checkbox" data-pris="${fk}" ${S.nascostiDi(p).includes(fk) ? 'checked' : ''} ${adm ? '' : 'disabled'}><span>${l}</span></label>`).join('')}</div></div>`}
        </div></details>`; }).join('') : '<p class="note">Nessun profilo. Creane uno, poi assegnalo agli account qui sopra.</p>';
    };
    if ($('#prof-card')) {
      drawProf();
      $('#prof-list').addEventListener('toggle', e => { const d = e.target; if (!d.matches || !d.matches('details.prof-item')) return; if (d.open) profOpen.add(d.dataset.pid); else profOpen.delete(d.dataset.pid); saveOpen(); }, true);
      const upd = (pid, f) => { const pm = JSON.parse(JSON.stringify(profMap())); if (!pm[pid]) return; f(pm[pid]); profSave(pm); };
      $('#prof-list').addEventListener('click', e => {
        const it = e.target.closest('[data-pid]'); if (!it) return; const pid = it.dataset.pid;
        const b = e.target.closest('[data-pk] button'); if (b && !b.disabled) { const pk = b.closest('[data-pk]').dataset.pk; upd(pid, p => { p[pk] = b.dataset.v === 'true'; if (pk === 'dettaglio' && !p.dettaglio) p.modifica = false; }); return; }
        if (e.target.closest('[data-pdel]')) { const pm = JSON.parse(JSON.stringify(profMap())); delete pm[pid]; profSave(pm); toast('Profilo eliminato'); }
      });
      $('#prof-list').addEventListener('change', e => {
        const it = e.target.closest('[data-pid]'); if (!it) return; const pid = it.dataset.pid;
        const rc = e.target.closest('[data-pris]'); if (rc) { upd(pid, p => { const s0 = new Set(S.nascostiDi(p)); if (rc.checked) s0.add(rc.dataset.pris); else s0.delete(rc.dataset.pris); p.nascosti = RIS_FIELDS.map(f => f[0]).filter(k => s0.has(k)); delete p.scheda; }); return; }
        const cb = e.target.closest('[data-ppg]'); if (cb) { upd(pid, p => { const s0 = new Set(p.pagine || []); if (cb.checked) s0.add(cb.dataset.ppg); else s0.delete(cb.dataset.ppg); p.pagine = PAGES.map(x => x[0]).filter(k => s0.has(k)); }); return; }
        const nm = e.target.closest('[data-pn]'); if (nm && nm.value.trim()) upd(pid, p => { p.nome = nm.value.trim(); });
      });
      const pa = $('#prof-add'); if (pa) pa.addEventListener('submit', e => {
        e.preventDefault(); const nome = $('#prof-name').value.trim(); if (!nome) { $('#prof-name').focus(); return; }
        const pm = JSON.parse(JSON.stringify(profMap())); const id = S.uid('p'); profOpen.add(id); saveOpen();
        pm[id] = { nome, completo: false, acquisto: false, dettaglio: true, modifica: false, nascosti: S.CAMPI_NASCOSTI_DEFAULT.slice(), pagine: ['disponibilita', 'ville'], ville: [] };
        $('#prof-name').value = ''; profSave(pm); toast(`Profilo ${nome} creato: ora condividi le ville dalla loro scheda`);
      });
    }
    // ---- protezione dei dati nel database (una volta sola) ----
    const drawProt = () => {
      const box = $('#prot-card'); if (!box) return;
      if (data().protezione && data().campiSeparati) { box.className = 'card'; box.innerHTML = `<h2>Protezione dei dati</h2><div class="warn ok">Attiva. Prezzi di acquisto, dettagli delle prenotazioni e campi delle schede stanno in archivi separati: ogni profilo riceve solo le ville e i dati che gli spettano.</div>`; return; }
      if (data().protezione) {
        box.className = 'card danger-card';
        box.innerHTML = `<h2>Protezione dei campi delle schede: da aggiornare</h2>
          <p class="note">Per scegliere i campi nascosti profilo per profilo, ogni campo della scheda va salvato a parte. Una volta sola:</p>
          <ol class="prot-steps"><li>Pubblica le <b>regole di Firestore aggiornate</b>.</li><li>Premi <b>Aggiorna la protezione</b>. Le schede restano identiche; finché non lo fai, i campi nascosti si nascondono solo sullo schermo.</li></ol>
          <div><button type="button" class="btn danger solid" id="sep-go">Aggiorna la protezione</button></div><div id="sep-msg"></div>`;
        $('#sep-go').onclick = async () => {
          const m = $('#sep-msg'); const go = $('#sep-go'); go.disabled = true;
          try { const n = await store.separaCampi(t => { m.innerHTML = `<p class="note">${esc(t)}</p>`; }); m.innerHTML = `<div class="warn ok">Fatto: ${n} schede aggiornate. L'app si ricarica…</div>`; setTimeout(() => location.reload(), 1500); }
          catch (x) { go.disabled = false; m.innerHTML = `<div class="warn err">${x && x.code === 'permission-denied' ? 'Le regole di Firestore aggiornate non sono ancora pubblicate: pubblicale e riprova. Non è stato modificato nulla.' : 'Operazione non riuscita: ' + esc(x.message || x)}</div>`; }
        };
        return;
      }
      box.innerHTML = `<h2>Protezione dei dati: da attivare</h2>
        <p class="note">Finché non è attiva, i profili limitano solo quello che si vede nell'app. Per attivarla:</p>
        <ol class="prot-steps"><li>Pubblica le <b>nuove regole di Firestore</b> nella console Firebase (Firestore → Regole).</li><li>Torna qui e premi <b>Attiva la protezione</b>. L'app scarica prima un backup completo, poi sposta prezzi di acquisto e dettagli riservati negli archivi protetti. Ville, prezzi e prenotazioni restano gli stessi.</li></ol>
        <div><button type="button" class="btn danger solid" id="prot-go">Attiva la protezione</button></div><div id="prot-msg"></div>`;
      $('#prot-go').onclick = async () => {
        const m = $('#prot-msg'); const go = $('#prot-go'); go.disabled = true;
        try {
          const blob = new Blob([JSON.stringify(Object.assign({ exportedAt: new Date().toISOString(), nota: 'backup prima della protezione dei dati' }, data()), null, 1)], { type: 'application/json' });
          const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'summer-database-backup-prima-protezione-' + new Date().toISOString().slice(0, 10) + '.json'; document.body.appendChild(a); a.click(); a.remove();
          const r = await store.protectData(t => { m.innerHTML = `<p class="note">${esc(t)}</p>`; });
          m.innerHTML = `<div class="warn ok">Protezione attiva: ${r.villas} ville e ${r.bookings} prenotazioni. L'app si ricarica…</div>`;
          setTimeout(() => location.reload(), 1500);
        } catch (x) {
          go.disabled = false;
          m.innerHTML = `<div class="warn err">${x && x.code === 'permission-denied' ? 'Le nuove regole di Firestore non sono ancora pubblicate: pubblicale e riprova. Non è stato modificato nulla.' : 'Operazione non riuscita: ' + esc(x.message || x)}</div>`;
        }
      };
    };
    drawProt();
    // ---- stati delle prenotazioni (settings.stati) ----
    const stSave = list => { st.stati = list.map(x => ({ key: x.key, label: x.label, color: x.color, blocks: !!x.blocks })); save(); };
    const stDraft = cfg => stati(cfg).map(x => ({ key: x.key, label: x.label, color: x.color, blocks: x.blocks, base: x.base }));
    const drawStati = () => {
      const cfgNow = st.stati; const list = stDraft(cfgNow);
      const count = k => data().bookings.filter(b => b.status === k).length;
      $('#st-list').innerHTML = list.map((x, i) => `<div class="st-row" data-si="${i}">
        <input data-sl value="${esc(x.label)}" aria-label="Nome dello stato">
        <input type="color" class="dot" data-sc value="${esc(x.color)}" aria-label="Colore di ${esc(x.label)}">
        <label class="st-blk"><input type="checkbox" data-sb ${x.blocks ? 'checked' : ''}> Blocca</label>
        <span class="note">${count(x.key)} ${count(x.key) === 1 ? 'prenotazione' : 'prenotazioni'}</span>
        <span class="chip" style="background:${esc(x.color)};color:${S.inkFor(x.color)}">${esc(x.label)}</span>
        <span class="loc-act">${x.base && String(x.color).toLowerCase() !== S.STATUS_COLOR[x.key] ? `<button type="button" class="btn small" data-sr>Colore originale</button>` : ''}${!x.base && !count(x.key) ? '<button type="button" class="btn small danger" data-sd>Togli</button>' : ''}</span></div>`).join('');
      return list;
    };
    let stList = drawStati();
    const stUpd = (i, f, redraw) => { f(stList[i]); stSave(stList); if (redraw) stList = drawStati(); else { const r = $(`#st-list [data-si="${i}"] .chip`); r.style.background = stList[i].color; r.style.color = S.inkFor(stList[i].color); r.textContent = stList[i].label; } };
    $('#st-list').addEventListener('input', e => { const row = e.target.closest('[data-si]'); if (!row) return; const i = Number(row.dataset.si);
      if (e.target.matches('[data-sc]')) stUpd(i, x => { x.color = e.target.value; });
      if (e.target.matches('[data-sl]')) { const v = e.target.value.trim(); if (v) stUpd(i, x => { x.label = v; }); } });
    $('#st-list').addEventListener('change', e => { const row = e.target.closest('[data-si]'); if (!row) return; const i = Number(row.dataset.si);
      if (e.target.matches('[data-sb]')) stUpd(i, x => { x.blocks = e.target.checked; }, true);
      if (e.target.matches('[data-sc]')) stList = drawStati();
      if (e.target.matches('[data-sl]') && !e.target.value.trim()) e.target.value = stList[i].label; });
    $('#st-list').addEventListener('click', e => { const row = e.target.closest('[data-si]'); if (!row) return; const i = Number(row.dataset.si);
      if (e.target.closest('[data-sr]')) stUpd(i, x => { x.color = S.STATUS_COLOR[x.key]; }, true);
      if (e.target.closest('[data-sd]')) { stList.splice(i, 1); stSave(stList); stList = drawStati(); toast('Stato tolto'); } });
    $('#st-add').addEventListener('submit', e => {
      e.preventDefault(); const label = $('#st-add-n').value.trim(); if (!label) { $('#st-add-n').focus(); return; }
      if (stList.some(x => x.label.toLowerCase() === label.toLowerCase())) { toast('Esiste già uno stato con questo nome'); return; }
      const slug = label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'stato';
      let key = slug; let n = 2; while (stList.some(x => x.key === key)) key = slug + '-' + n++;
      stList.push({ key, label, color: $('#st-add-c').value, blocks: $('#st-add-b').checked }); stSave(stList); stList = drawStati();
      $('#st-add-n').value = ''; toast(`Aggiunto lo stato ${label}`);
    });
    // ---- servizi (settings.servizi) ----
    const srvUsed = k => data().bookings.filter(b => Array.isArray(b.servizi) && b.servizi.includes(k)).length;
    const srvBaseUsed = k => data().bookings.filter(b => b[k]).length;
    const prezziSrv = () => (st.prezziServizi = st.prezziServizi || {});
    let acqSrv = JSON.parse(JSON.stringify(data().serviziAcquisto || {})); let tAcq = null;
    const fmtP = x => typeof x === 'number' ? fmtNum(x) : '';
    const drawSrv = () => {
      const list = servizi(st.servizi);
      $('#srv-list').innerHTML = list.map(x => { const n = x.base ? srvBaseUsed(x.key) : srvUsed(x.key); const pz = prezziSrv()[x.key] || {}; const inc = pz.incluso !== false; return `<tr class="srv-tr" data-sk="${esc(x.key)}">
        <td>${x.base ? `<b class="srv-n">${esc(x.label)}</b> <span class="note">di base</span>` : `<input data-sl value="${esc(x.label)}" aria-label="Nome del servizio">`}</td>
        <td><div class="seg small" data-pi><button type="button" data-i="1" class="${inc ? 'on' : ''}">Incluso</button><button type="button" data-i="0" class="${inc ? '' : 'on'}">A parte</button></div></td>
        ${canAcq() ? `<td><input data-pa inputmode="numeric" value="${esc(fmtP(acqSrv[x.key]))}" placeholder="—" aria-label="Acquisto predefinito"></td>` : ''}
        <td><input data-pv inputmode="numeric" value="${esc(fmtP(pz.vendita))}" placeholder="—" aria-label="Vendita predefinita"></td>
        <td class="note">${n} ${n === 1 ? 'prenot.' : 'prenot.'}</td>
        <td class="loc-act">${!x.base && !n ? '<button type="button" class="btn small danger" data-sd>Togli</button>' : ''}</td></tr>`; }).join('');
    };
    $('#srv-list').addEventListener('input', e => { const row = e.target.closest('[data-sk]'); if (!row) return; const k = row.dataset.sk;
      if (e.target.matches('[data-pv]')) { const v = S.parseMoney(e.target.value); prezziSrv()[k] = Object.assign({}, prezziSrv()[k], { vendita: typeof v === 'number' ? v : null }); save(); }
      if (e.target.matches('[data-pa]')) { const v = S.parseMoney(e.target.value); if (typeof v === 'number') acqSrv[k] = v; else delete acqSrv[k];
        $('#saved').textContent = 'Modifiche in corso…'; clearTimeout(tAcq); tAcq = setTimeout(() => { Promise.resolve(store.setServiziAcquisto(JSON.parse(JSON.stringify(acqSrv)))).then(() => { $('#saved').textContent = 'Salvato'; }, err => { $('#saved').textContent = ''; toast(err && err.code === 'permission-denied' ? 'Per i prezzi di acquisto predefiniti bisogna pubblicare la nuova regola di Firestore' : 'Errore: ' + (err && err.message || err)); }); }, 500); }
    });
    $('#srv-list').addEventListener('click', e => { const bt = e.target.closest('[data-pi] button'); if (!bt) return; const k = bt.closest('[data-sk]').dataset.sk;
      prezziSrv()[k] = Object.assign({}, prezziSrv()[k], { incluso: bt.dataset.i === '1' }); bt.parentNode.querySelectorAll('button').forEach(z => z.classList.toggle('on', z === bt)); save(); });
    // ---- inclusioni delle offerte (settings.inclusioni) ----
    const incList = () => (st.inclusioni = JSON.parse(JSON.stringify(S.inclusioniDi(st))));
    const drawInc = () => {
      $('#inc-list').innerHTML = S.inclusioniDi(st).map((x, i, l) => `<div class="inc-row" data-ii="${esc(x.id)}">
        <label class="inc-on" title="Spuntata di norma nelle nuove offerte"><input type="checkbox" data-ion ${x.on !== false ? 'checked' : ''}></label>
        <input data-iit value="${esc(x.it || '')}" placeholder="Italiano" aria-label="Voce in italiano"><input data-ien value="${esc(x.en || '')}" placeholder="English" aria-label="Voce in inglese">
        <select data-isrv aria-label="Servizio collegato" title="Se la colleghi a un servizio, nell'offerta la voce si attiva solo quando quel servizio è spuntato come incluso"><option value="">Sempre disponibile</option>${servizi(st.servizi).map(z => `<option value="${esc(z.key)}" ${x.servizio === z.key ? 'selected' : ''}>Servizio: ${esc(z.label)}</option>`).join('')}</select>
        <span class="inc-act"><button type="button" class="btn small" data-imv="-1" ${i ? '' : 'disabled'} aria-label="Sposta su">↑</button><button type="button" class="btn small" data-imv="1" ${i < l.length - 1 ? '' : 'disabled'} aria-label="Sposta giù">↓</button><button type="button" class="btn small danger" data-idel>Togli</button></span></div>`).join('') || '<p class="note">Nessuna voce.</p>';
    };
    drawInc();
    $('#inc-list').addEventListener('input', e => { const row = e.target.closest('[data-ii]'); if (!row) return; const l = incList(); const x = l.find(y => y.id === row.dataset.ii); if (!x) return;
      if (e.target.matches('[data-iit]')) x.it = e.target.value; else if (e.target.matches('[data-ien]')) x.en = e.target.value; else if (e.target.matches('[data-ion]')) x.on = e.target.checked; else return; st.inclusioni = l; save(); });
    $('#inc-list').addEventListener('change', e => { if (e.target.matches('[data-isrv]')) { const l = incList(); const x = l.find(y => y.id === e.target.closest('[data-ii]').dataset.ii); if (x) { x.servizio = e.target.value || ''; st.inclusioni = l; save(); } return; }
      if (!e.target.matches('[data-ion]')) return; const row = e.target.closest('[data-ii]'); const l = incList(); const x = l.find(y => y.id === row.dataset.ii); if (x) { x.on = e.target.checked; st.inclusioni = l; save(); } });
    $('#inc-list').addEventListener('click', e => { const row = e.target.closest('[data-ii]'); if (!row) return; const l = incList(); const i = l.findIndex(y => y.id === row.dataset.ii); if (i < 0) return;
      const mv = e.target.closest('[data-imv]'); if (mv) { const j = i + Number(mv.dataset.imv); if (j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]]; st.inclusioni = l; save(); drawInc(); return; }
      if (e.target.closest('[data-idel]')) { l.splice(i, 1); st.inclusioni = l; save(); drawInc(); toast('Voce tolta'); } });
    $('#inc-add').addEventListener('submit', e => { e.preventDefault(); const it = $('#inc-add-it').value.trim(), en = $('#inc-add-en').value.trim(); if (!it && !en) { $('#inc-add-it').focus(); return; }
      const l = incList(); l.push({ id: S.uid('i'), it, en, on: true }); st.inclusioni = l; save(); drawInc(); $('#inc-add-it').value = ''; $('#inc-add-en').value = ''; toast('Voce aggiunta'); });
    const srvCustom = () => JSON.parse(JSON.stringify(st.servizi || (settings().servizi || [])));
    drawSrv();
    $('#srv-list').addEventListener('input', e => { const row = e.target.closest('[data-sk]'); if (!row || !e.target.matches('[data-sl]')) return; const v = e.target.value.trim(); if (!v) return;
      const l = srvCustom(); const x = l.find(y => y.key === row.dataset.sk); if (x) { x.label = v; st.servizi = l; save(); } });
    $('#srv-list').addEventListener('change', e => { const row = e.target.closest('[data-sk]'); if (row && e.target.matches('[data-sl]') && !e.target.value.trim()) drawSrv(); });
    $('#srv-list').addEventListener('click', e => { const row = e.target.closest('[data-sk]'); if (!row || !e.target.closest('[data-sd]')) return;
      st.servizi = srvCustom().filter(y => y.key !== row.dataset.sk); save(); drawSrv(); toast('Servizio tolto'); });
    $('#srv-add').addEventListener('submit', e => {
      e.preventDefault(); const label = $('#srv-add-n').value.trim(); if (!label) { $('#srv-add-n').focus(); return; }
      if (servizi(st.servizi).some(x => x.label.toLowerCase() === label.toLowerCase())) { toast('Esiste già questo servizio'); return; }
      const slug = label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'servizio';
      const l = srvCustom(); let key = slug; let n = 2; while (l.some(x => x.key === key) || EXTRAS.some(([k]) => k === key)) key = slug + '-' + n++;
      l.push({ key, label }); st.servizi = l; save(); drawSrv(); $('#srv-add-n').value = ''; toast(`Aggiunto il servizio ${label}`);
    });
    const drawLocs = () => {
      const list = locList(); const count = l => data().villas.filter(v => normLoc(v.location) === l).length;
      $('#loc-list').innerHTML = list.length ? list.map(l => `<div class="loc-row" data-l="${esc(l)}"><b>${esc(l)}</b><span class="note">${count(l)} ville</span>
        <span class="loc-act"><button type="button" class="btn small" data-lact="ren">Rinomina</button>${list.length > 1 ? `<button type="button" class="btn small" data-lact="merge">Unisci in…</button>` : ''}${count(l) ? '' : '<button type="button" class="btn small danger" data-lact="del">Togli</button>'}</span><div class="loc-edit"></div></div>`).join('') : '<p class="note">Nessuna località.</p>';
    };
    // rinomina/unisci: aggiorna il campo "location" delle ville interessate (un documento per villa) e l'elenco
    const renameLoc = (from, to) => {
      const t = normLoc(to); if (!t || t === from) return;
      data().villas.filter(v => normLoc(v.location) === from).forEach(v => store.upsertVilla(Object.assign(JSON.parse(JSON.stringify(v)), { location: t })));
      const s2 = JSON.parse(JSON.stringify(settings())); s2.localita = locList().filter(x => x !== from); if (!s2.localita.includes(t)) s2.localita.push(t); s2.localita.sort((x, y) => x.localeCompare(y, 'it'));
      store.setSettings(s2); Object.assign(st, { localita: s2.localita });
      if (ui.loc === from) { ui.loc = t; saveUI(); } if (ui.vloc === from) { ui.vloc = t; saveUI(); }
      drawLocs();
    };
    drawLocs();
    $('#loc-list').addEventListener('click', e => {
      const b = e.target.closest('[data-lact]'); if (!b) return;
      const row = b.closest('.loc-row'); const l = row.dataset.l; const ed = row.querySelector('.loc-edit');
      if (b.dataset.lact === 'ren') {
        ed.innerHTML = `<input value="${esc(l)}"><button type="button" class="btn small primary">Salva</button>`;
        const inp = ed.querySelector('input'); inp.focus(); inp.select();
        ed.querySelector('button').onclick = () => { const t = normLoc(inp.value); if (locList().includes(t) && t !== l) { toast('Esiste già: usa "Unisci in…"'); return; } renameLoc(l, t); toast('Località rinominata'); };
      } else if (b.dataset.lact === 'merge') {
        ed.innerHTML = `<select>${locList().filter(x => x !== l).map(x => `<option>${esc(x)}</option>`).join('')}</select><button type="button" class="btn small primary">Unisci</button>`;
        ed.querySelector('button').onclick = () => { const t = ed.querySelector('select').value; renameLoc(l, t); toast(`Unita in ${t}`); };
      } else if (b.dataset.lact === 'del') {
        const s2 = JSON.parse(JSON.stringify(settings())); s2.localita = locList().filter(x => x !== l); store.setSettings(s2); Object.assign(st, { localita: s2.localita }); drawLocs();
      }
    });
    const addLocUi = () => { const n = $('#loc-add-in').value; if (!normLoc(n)) return; const val = addLocation(n); st.localita = locList(); $('#loc-add-in').value = ''; drawLocs(); toast(`Aggiunta ${val}`); };
    $('#loc-add').onclick = addLocUi; $('#loc-add-in').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); addLocUi(); } };
    const cambioNote = () => { const n = data().villas.filter(v => v.cambio && v.cambio !== (st.cambio || 'domenica')).length; $('#s-cambio-n').textContent = n ? `${n} ${n === 1 ? 'villa usa' : 'ville usano'} un giorno diverso, impostato ${n === 1 ? 'nella sua scheda' : 'nelle loro schede'}.` : ''; };
    cambioNote();
    $('#s-cambio').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; st.cambio = b.dataset.c; $$('#s-cambio button').forEach(x => x.classList.toggle('on', x === b)); save(); cambioNote(); drawPerDef(); });
    $$('[data-d]').forEach(el => el.addEventListener('input', () => {
      const k = el.dataset.k; let val = k === 'margine' ? Number(el.value.replace(',', '.')) / 100 : S.parseMoney(el.value);
      st.defaults[el.dataset.d][k] = isFinite(val) && val !== null ? val : 0; save();
    }));
    const msg = h => { $('#s-msg').innerHTML = h; };
    // ---- password di pulizia: salvata solo come impronta (SHA-256 con sale), mai in chiaro ----
    const hashPw = async (pw, salt) => { const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + '|' + pw)); return Array.from(new Uint8Array(buf)).map(x => x.toString(16).padStart(2, '0')).join(''); };
    const sec = () => data().sicurezza || null;
    const checkPw = async pw => { const s0 = sec(); return !!(s0 && s0.hash && pw && (await hashPw(pw, s0.salt)) === s0.hash); };
    const drawPass = () => {
      const box = $('#wipe-pass'); const has = !!(sec() && sec().hash);
      // solo gli amministratori impostano, cambiano o reimpostano la password (anche le regole lo impongono)
      const adm = isAdmin();
      box.innerHTML = `<div class="wipe-pass"><span>${has ? 'Password di pulizia impostata.' : '<b>Prima imposta una password di pulizia.</b>'}</span>${adm ? `<button type="button" class="btn small" id="pw-set">${has ? 'Cambia password' : 'Imposta password'}</button>${has && store.reauthGoogle ? '<button type="button" class="linkbtn" id="pw-forgot">Password dimenticata?</button>' : ''}` : '<span class="note">Solo un amministratore può impostarla o cambiarla.</span>'}</div><div id="pw-form"></div>`;
      if (!adm) return;
      // password dimenticata: nuovo accesso con Google per confermare che è l'amministratore, poi password nuova
      if ($('#pw-forgot')) $('#pw-forgot').onclick = async () => {
        const f = $('#pw-form'); f.innerHTML = '<p class="note">Conferma il tuo account Google nella finestra che si apre…</p>';
        try { const em = await store.reauthGoogle(); showForm(false, `Accesso confermato come <b>${esc(em)}</b>. Scegli la nuova password di pulizia.`); }
        catch (x) { f.innerHTML = `<div class="warn err">${x && /popup/i.test(x.code || '') ? 'Il browser ha bloccato la finestra di accesso: consenti i popup per questo sito e riprova.' : x && /mismatch|user-mismatch/i.test(x.code || '') ? 'Devi scegliere lo stesso account Google con cui sei collegato.' : 'Accesso non confermato: la password non è stata cambiata.'}</div>`; }
      };
      $('#pw-set').onclick = () => showForm(has);
      function showForm(askOld, intro) {
        $('#pw-form').innerHTML = `${intro ? `<p class="note">${intro}</p>` : ''}<form class="wipe-form" id="pw-f" autocomplete="off">${askOld ? '<input type="password" id="pw-old" placeholder="Password attuale" autocomplete="current-password">' : ''}<input type="password" id="pw-new" placeholder="Nuova password (almeno 6 caratteri)" autocomplete="new-password"><input type="password" id="pw-new2" placeholder="Ripeti la nuova password" autocomplete="new-password"><button class="btn small primary">Salva password</button><span class="wipe-err" id="pw-err"></span></form>`;
        $('#pw-f').addEventListener('submit', async e => {
          e.preventDefault(); const err = $('#pw-err');
          if (askOld && !(await checkPw($('#pw-old').value))) { err.textContent = 'La password attuale non è corretta.'; return; }
          const n1 = $('#pw-new').value, n2 = $('#pw-new2').value;
          if (n1.length < 6) { err.textContent = 'Usa almeno 6 caratteri.'; return; }
          if (n1 !== n2) { err.textContent = 'Le due password non coincidono.'; return; }
          const salt = S.uid('s'); const hash = await hashPw(n1, salt);
          try { await Promise.resolve(store.setSicurezza({ salt, hash, impostataDa: store.user || '', impostataIl: new Date().toISOString() })); toast(askOld === false && intro ? 'Nuova password di pulizia salvata' : 'Password di pulizia salvata'); drawPass(); }
          catch (x) { err.textContent = x && x.code === 'permission-denied' ? 'Solo un amministratore può cambiare la password.' : 'Salvataggio non riuscito: ' + (x.message || x); }
        });
      }
    };
    drawPass();
    const downloadJson = (obj, name) => {
      const blob = new Blob([JSON.stringify(obj, null, 1)], { type: 'application/json' }); const aEl = document.createElement('a');
      aEl.href = URL.createObjectURL(blob); aEl.download = name; document.body.appendChild(aEl); aEl.click(); aEl.remove(); setTimeout(() => URL.revokeObjectURL(aEl.href), 2000);
    };
    const askWipe = (what) => {
      const box = $('#wipe-box');
      if (!(sec() && sec().hash)) { box.innerHTML = '<div class="warn err">Imposta prima la password di pulizia.</div>'; return; }
      const label = what === 'book' ? `tutte le ${data().bookings.length} prenotazioni` : 'tutte le note spese (scontrini e foto), anche nelle app Scontrini e Spese Ville';
      box.innerHTML = `<form class="wipe-confirm" id="w-f" autocomplete="off"><div><b>Stai per cancellare ${label}.</b> L'operazione non si può annullare. Prima viene scaricato l'archivio${what === 'sc' ? ' (senza le foto)' : ''}.</div>
        <input type="password" id="w-pw" placeholder="Password di pulizia" autocomplete="off">
        <div class="wipe-actions"><button class="btn danger solid" id="w-go">Scarica archivio e cancella</button><button type="button" class="btn" id="w-no">Annulla</button></div><span class="wipe-err" id="w-err"></span></form>`;
      $('#w-pw').focus();
      $('#w-no').onclick = () => { box.innerHTML = ''; };
      $('#w-f').addEventListener('submit', async e => {
        e.preventDefault(); const err = $('#w-err'); const go = $('#w-go');
        if (!(await checkPw($('#w-pw').value))) { err.textContent = 'Password non corretta.'; $('#w-pw').select(); return; }
        go.disabled = true; err.textContent = 'Preparazione dell\'archivio…';
        const day = new Date().toISOString().slice(0, 10);
        try {
          if (what === 'book') {
            downloadJson({ tipo: 'archivio prenotazioni', creatoIl: new Date().toISOString(), da: store.user || '', bookings: data().bookings, assegnazioni: data().assegnazioni || [] }, `archivio-prenotazioni-${day}.json`);
            err.textContent = 'Cancellazione in corso…';
            const n = await store.wipeBookings();
            box.innerHTML = `<div class="warn ok">Cancellate ${n} prenotazioni. L'archivio è stato scaricato.</div>`; toast(`Cancellate ${n} prenotazioni · ville e listini intatti`);
          } else {
            const list = await store.listScontriniArchivio();
            downloadJson({ tipo: 'archivio note spese', creatoIl: new Date().toISOString(), da: store.user || '', nota: 'Le foto degli scontrini non sono incluse.', scontrini: list }, `archivio-note-spese-${day}.json`);
            err.textContent = 'Cancellazione in corso…';
            const n = await store.wipeScontrini(list);
            box.innerHTML = `<div class="warn ok">Cancellate ${n} note spese con le loro foto. L'archivio è stato scaricato.</div>`; toast(`Cancellate ${n} note spese · ville e listini intatti`);
          }
        } catch (x) { go.disabled = false; err.textContent = 'Operazione non riuscita: ' + (x.message || x); }
      });
    };
    $('#w-book').addEventListener('click', () => askWipe('book'));
    if ($('#w-sc')) $('#w-sc').addEventListener('click', () => askWipe('sc'));
    if ($('#rp-card') && cur === 'schede') window.SDBReport.mount($('#rp-card'), { data, esc, store, FIELDS, hiddenField, S, coverOf: id => (thumbs.map[id] || {}).fotoId || null });
    if ($('#cc-card')) window.SDBCaricaCartella.mount($('#cc-card'), { data, store, esc, $, $$, toast, compressImage, coverOf: id => (thumbs.map[id] || {}).fotoId || null });
    if ($('#is-card')) window.SDBImportaSito.mount($('#is-card'), { data, store, esc, $, $$, toast, compressImage, coverOf: id => (thumbs.map[id] || {}).fotoId || null });
    if ($('#ab-on')) $('#ab-on').addEventListener('change', e => {
      lsSet(AUTOKEY, e.target.checked ? 'si' : 'no');
      if (e.target.checked) autoBackup(true).then(() => { toast('Backup automatico attivo: primo backup scaricato'); const l = $('#ab-last'); if (l) l.textContent = 'Ultimo backup automatico su questo dispositivo: ' + S.dmy(oggiLocale()) + '.'; }, () => toast('Backup non riuscito'));
      else toast('Backup automatico disattivato su questo dispositivo');
    });
    $('#s-export').addEventListener('click', async () => {
      try {
        downloadText('summer-database-backup-' + oggiLocale() + '.json', await buildBackup());
        msg('<p class="note">Se il download non parte, usa “Copia backup negli appunti” e incolla il testo in un file.</p>');
      } catch (e) { msg('<p class="note">Il download non è disponibile qui: usa “Copia backup negli appunti”.</p>'); }
    });
    $('#s-copy').addEventListener('click', async () => {
      const txt = await buildBackup();
      navigator.clipboard && navigator.clipboard.writeText(txt).then(() => toast('Backup copiato'), () => {
        msg(`<textarea readonly rows="6" id="s-bk">${esc(txt)}</textarea>`); const ta = $('#s-bk'); ta.focus(); ta.select();
      });
    });
    $('#s-import').addEventListener('change', e => {
      const f = e.target.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        let d; try { d = JSON.parse(r.result); if (!Array.isArray(d.villas)) throw new Error('formato'); }
        catch (err) { msg('<p class="note">Questo file non è un backup valido di Summer Database.</p>'); return; }
        msg('<p class="note">Importazione in corso…</p>');
        Promise.resolve(store.mergeAll(d)).then(r => { toast(`Backup importato: ${r.villas} ville e ${r.bookings} periodi aggiunti o aggiornati`); route(); }, err => msg(`<p class="note">Importazione non riuscita: ${esc(err.message || err)}</p>`));
      };
      r.readAsText(f);
    });
    const lo = $('#s-logout'); if (lo) lo.addEventListener('click', () => store.signOut());
    if ($('#s-reset')) $('#s-reset').addEventListener('click', () => {
      msg(`<div class="confirm-bar">Sostituire tutti i dati con quelli importati dall'Excel? Le modifiche fatte nell'app andranno perse. <button class="btn small danger solid" id="s-reset-ok">Ripristina</button><button class="btn small" id="s-reset-no">Annulla</button></div>`);
      $('#s-reset-ok').addEventListener('click', () => { store.resetToSeed(); toast('Dati ripristinati'); route(); });
      $('#s-reset-no').addEventListener('click', () => msg(''));
    });
  }

  window.addEventListener('resize', (() => { let t; return () => { clearTimeout(t); t = setTimeout(() => { if ($('#cal')) drawCalendar(); }, 200); }; })());
  route();
  // backup automatico del giorno (se attivo su questo dispositivo)
  setTimeout(() => { autoBackup().then(ok => { if (ok) toast('Backup del giorno scaricato nella cartella Download'); }, () => {}); }, 2500);
});
