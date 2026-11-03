/* Summer Database 2027 — interfaccia. Dipende da core.js (window.SDB) e store.js (window.SDBStore). */
window.SDBStore.ready.then(function () {
  const S = window.SDB, store = window.SDBStore;
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const statoLabel = k => (S.STATI.find(s => s.key === k) || { label: k }).label;
  const blocks = k => (S.STATI.find(s => s.key === k) || { blocks: true }).blocks;
  const bookingColor = b => b.color || S.STATUS_COLOR[b.status] || S.STATUS_COLOR.occupato;
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
  };
  applyTheme();

  const data = () => store.get();
  const settings = () => data().settings;
  const villaById = id => data().villas.find(v => v.id === id);
  const sortedVillas = () => data().villas.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
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
  const spese = { list: [], ready: false, error: null };
  let spesePage = null; const speseHooks = new Set();
  const speseChanged = () => { if (spesePage) spesePage.render(); speseHooks.forEach(f => { try { f(); } catch (_) {} }); };
  if (store.mode === 'online' && store.listenScontrini && window.SDBSpese) {
    store.listenScontrini(l => { spese.list = l; spese.ready = true; spese.error = null; speseChanged(); }, err => { spese.error = err; speseChanged(); });
  }
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
    $$('.nav a').forEach(a => a.classList.toggle('on', a.dataset.r === route || (route === 'villa' && a.dataset.r === 'ville')));
    const sy = $('#sync');
    sy.className = 'sync ' + store.mode;
    sy.querySelector('span').textContent = store.mode === 'online' ? (store.online === false ? 'Offline · si sincronizza appena torna la rete' : 'Online') : (store.canPersist ? 'Salvato su questo dispositivo' : 'Memoria non disponibile');
  }

  /* ---------- router ---------- */
  function route() {
    const h = (location.hash || '#disponibilita').slice(1);
    spesePage = null; speseHooks.clear(); villasRedraw = null;
    if (h.startsWith('villa-')) { refreshShell('villa'); return viewVilla(h.slice(6)); }
    refreshShell(h);
    if (h === 'ville') return viewVillas();
    if (h === 'spese' && window.SDBSpese) { spesePage = window.SDBSpese.mount(main, { ui, saveUI, esc, data, spese, store, $, $$, toast }); return; }
    if (h === 'appunti') return viewNotes();
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
    main.innerHTML = `
      <form class="toolbar${ui.open ? ' open' : ''}" id="tb" autocomplete="off">
        <label class="field f-search"><span>Cerca villa</span><input type="search" id="f-q" placeholder="Nome, proprietario, zona" value="${esc(ui.q)}"></label>
        <button type="button" class="btn filters-toggle" id="f-more" aria-expanded="${ui.open}">Filtri</button>
        <div class="field"><span>Tariffa</span><div class="seg" id="f-tariff">${S.TARIFFE.map(t => `<button type="button" data-v="${t.key}" class="${ui.tariff === t.key ? 'on' : ''}">${t.label}</button>`).join('')}</div></div>
        <div class="field"><span>Prezzi</span><div class="seg" id="f-mode"><button type="button" data-v="listino" class="${ui.mode === 'listino' ? 'on' : ''}">Listino</button><button type="button" data-v="netto" class="${ui.mode === 'netto' ? 'on' : ''}">Netto</button></div></div>
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
        <div class="legend" style="width:100%">${S.STATI.map(s => `<span><i style="background:${S.STATUS_COLOR[s.key]}"></i>${s.label}</span>`).join('')}<span>Colori predefiniti: ogni affitto può avere il suo. Tocca un prezzo per prenotare quel periodo; tocca un giorno senza prezzo per una settimana da quel giorno; col mouse puoi anche trascinare.</span></div>
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
        const txt = b.cliente || (b.status === 'owner' ? 'OWNER' : b.status === 'richiesta' ? 'SU RICHIESTA' : '');
        // prezzo complessivo: concordato, altrimenti stima da listino
        let tot = '';
        if (ui.mode === 'netto' ? typeof b.prezzoAcquisto === 'number' : typeof b.prezzoVendita === 'number') tot = S.money(ui.mode === 'netto' ? b.prezzoAcquisto : b.prezzoVendita);
        else if (b.status !== 'owner' && b.status !== 'richiesta') { const li = listinoApprox(v, b.from, b.to); const val = li && (li.approx ? li.sale : (ui.mode === 'netto' ? li.net : li.sale)); if (typeof val === 'number') tot = '≈ ' + S.money(val); }
        if (tot && w < 74) tot = tot.replace(' €', '').replace(/\.000$/, 'k');
        const extras = EXTRAS.filter(([k]) => b[k]).map(([, l]) => l);
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
    const b = existing ? Object.assign({}, existing) : { id: S.uid('b'), villaId: init.villaId, status: 'occupato', from: init.from, to: init.to, cliente: '', note: '' };
    let color = bookingColor(b); let colorTouched = !!b.color;
    const villas = sortedVillas();
    dlg.innerHTML = `<form class="dlg" method="dialog" id="bform">
      <h3>${existing ? 'Modifica periodo' : 'Nuovo periodo'}</h3>
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
        <label class="field"><span>Acquisto concordato €</span><input id="b-buy" inputmode="numeric" value="${typeof b.prezzoAcquisto === 'number' ? esc(fmtNum(b.prezzoAcquisto)) : ''}"></label>
      </div>
      <div class="pricehint" id="b-hint"></div>
      <div id="b-spese"></div>
      ${(data().assegnazioni || []).length ? `<div class="field"><span>Assegnata a (app Scontrini)</span><div class="as-mini">${(data().assegnazioni || []).map(ac => `<label class="as-check"><input type="checkbox" data-bacc="${esc(ac.email)}" ${(ac.prenotazioni || []).includes(b.id) || (ac.ville || []).includes(b.villaId) ? 'checked' : ''} ${(ac.ville || []).includes(b.villaId) ? 'disabled title="Ha già tutta la villa"' : ''}> ${esc(ac.nome || ac.email)}</label>`).join('')}</div></div>` : ''}
      </section>
      <section class="dsec sec-srv"><h4>Servizi</h4>
      <div class="flags three">
        ${EXTRAS.map(([k, l]) => `<label class="flag"><input type="checkbox" id="b-${k}" ${b[k] ? 'checked' : ''}><span><b>${l}</b></span></label>`).join('')}
      </div>
      </section>
      <section class="dsec sec-look"><h4>Stato e colore</h4>
      <div class="row">
        <label class="field"><span>Stato</span><select id="b-status">${S.STATI.map(s => `<option value="${s.key}" ${s.key === b.status ? 'selected' : ''}>${s.label}</option>`).join('')}</select></label>
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
        ${existing ? '<button type="button" class="btn danger left" id="b-del">Elimina</button>' : ''}
        <button type="button" class="btn" id="b-cancel">Annulla</button>
        <button type="submit" class="btn primary" id="b-save">Salva</button>
      </div>
    </form>`;
    const f = $('#bform', dlg);
    const paint = () => {
      const p = $('#b-prev'); p.style.background = color; p.style.color = S.inkFor(color); p.textContent = $('#b-cliente').value.trim() || 'Anteprima';
      $$('#b-sw .sw[data-c]').forEach(s => { const on = s.dataset.c.toLowerCase() === color.toLowerCase(); s.classList.toggle('on', on); s.setAttribute('aria-checked', on); });
      $('#b-color').value = color;
    };
    $('#b-sw').addEventListener('click', e => { const s = e.target.closest('.sw[data-c]'); if (!s) return; color = s.dataset.c; colorTouched = true; paint(); });
    $('#b-color').addEventListener('input', e => { color = e.target.value; colorTouched = true; paint(); });
    $('#b-status').addEventListener('change', e => { if (!colorTouched) { color = S.STATUS_COLOR[e.target.value]; paint(); } });
    const read = () => ({ villaId: $('#b-villa').value, status: $('#b-status').value, from: $('#b-from').value, to: $('#b-to').value, cliente: $('#b-cliente').value.trim(), note: $('#b-note').value.trim(), color, earlyIn: $('#b-early').checked, lateOut: $('#b-late').checked, prezzoVendita: money('#b-sale'), prezzoAcquisto: money('#b-buy'), pulizia: $('#b-pulizia').checked, cuoco: $('#b-cuoco').checked, transfer: $('#b-transfer').checked });
    function money(sel) { const v = S.parseMoney($(sel).value); return typeof v === 'number' ? v : null; }
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
      const mg = typeof x.prezzoVendita === 'number' && typeof x.prezzoAcquisto === 'number' ? x.prezzoVendita - x.prezzoAcquisto : null;
      $('#b-hint').innerHTML = [
        li ? `Listino: <b>${S.money(li.sale)}</b>${li.net ? ` · netto ${S.money(li.net)}` : ''} <span class="muted">(${esc(li.label)})</span> <button type="button" class="btn small" id="b-uselist">Usa listino</button>` : '<span class="muted">Nessun prezzo di listino per queste date esatte.</span>',
        mg !== null ? `Guadagno: <b>${S.money(mg)}</b>${x.prezzoVendita ? ` (${Math.round(mg / x.prezzoVendita * 1000) / 10}%)` : ''}` : ''
      ].filter(Boolean).join('<br>');
      const ul = $('#b-uselist'); if (ul) ul.onclick = () => { $('#b-sale').value = fmtNum(li.sale); if (li.net) $('#b-buy').value = fmtNum(li.net); check(); };
      $('#b-save').disabled = !(n > 0) || blocked;
      paint();
    };
    f.addEventListener('input', check); f.addEventListener('change', check); check();
    if (existing && store.mode === 'online' && window.SDBSpese) {
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
      e.preventDefault(); check(); const x = read(); if (!(S.diffDays(x.from, x.to) > 0) || blocked) return;
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
    const sortOpts = [['order', 'Ordine Excel'], ['name', 'Nome A–Z'], ['priceAsc', 'Prezzo più basso'], ['priceDesc', 'Prezzo più alto'], ['guests', 'Più ospiti'], ['free', 'Più settimane libere']];
    ui.vsort = ui.vsort || 'order'; ui.vloc = ui.vloc || ''; ui.vlist = ui.vlist || '';
    main.innerHTML = `<div class="page"><div class="wrap">
      <div class="head"><div><h1>Ville</h1><div class="sub" id="vl-sub"></div></div>
        <div class="actions"><button class="btn primary" id="vl-add">+ Nuova villa</button></div></div>
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
        order: () => 0,
        name: (a, b) => a.v.name.localeCompare(b.v.name),
        priceAsc: (a, b) => (minP(a) ?? 1e12) - (minP(b) ?? 1e12),
        priceDesc: (a, b) => (maxP(b) ?? -1) - (maxP(a) ?? -1),
        guests: (a, b) => ((num(b.v.guests) ?? num(b.v.pax) ?? -1) - (num(a.v.guests) ?? num(a.v.pax) ?? -1)),
        free: (a, b) => b.s.free - a.s.free
      }[ui.vsort];
      if (ui.vsort !== 'order') list.sort(cmp);
      $('#vl-sub').textContent = `${list.length} ville${cur ? ' nell\'elenco ' + cur.nome : ''}${ui.vloc ? ' a ' + ui.vloc : ''} · prezzi di vendita settimanali`;
      body.innerHTML = list.length ? list.map(({ v, s }) => {
        const mn = minP({ s }), mx = maxP({ s });
        const area = v.indoorSqm ? (/mq|m2|m²/i.test(String(v.indoorSqm)) ? v.indoorSqm : v.indoorSqm + ' mq') : '';
        const statList = [[v.guests || v.pax, 'Ospiti', ICON.ospiti], [v.totalBedrooms || v.guestBedrooms, 'Camere da letto', ICON.camere], [v.bathrooms, 'Bagni', ICON.bagni], [area, 'Area', ICON.area]].filter(([x]) => x !== '' && x != null);
        const strip = ndSpans(v, 'settimanale').map(x => `<i class="ndseg" style="left:${S.diffDays(st.seasonStart, x.from) / total * 100}%;width:${S.diffDays(x.from, x.to) / total * 100}%"></i>`).join('')
          + s.bks.map(b => `<i style="background:${esc(bookingColor(b))};left:${(S.diffDays(st.seasonStart, b.from) + .5) / total * 100}%;width:${Math.max(S.diffDays(b.from, b.to), .5) / total * 100}%"></i>`).join('');
        const desc = String(v.servizi || v.note || '').replace(/\s+/g, ' ').trim();
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
            <p class="vc-desc">${desc ? esc(desc) : (v.proprietario ? 'Proprietario: ' + esc(v.proprietario) : 'Descrizione da completare')}</p>
            ${statList.length ? `<div class="vc-stats2">${statList.map(([x, l, ic]) => `<div><span>${l}</span><b>${ic}${esc(x)}</b></div>`).join('')}</div>` : '<div class="vc-missing">Caratteristiche da completare</div>'}
            <hr>
            <div class="vc-price2"><span>Affitto settimanale</span><b${mn === null ? ' class="missing"' : ''}>${mn === null ? 'Prezzi da inserire' : mn === mx ? S.money(mn) : `€ ${S.short(mn)} – ${S.short(mx)}`}</b></div>
            <div class="vc-avail"><div class="strip">${strip}</div><div class="vc-free"><b>${s.free}</b> settimane libere su ${s.total}${s.nd ? ` · <span class="ndtxt">${s.nd} ND</span>` : ''}</div></div>
          </div>
          <footer class="vc-foot">
            <button type="button" class="btn dark" data-act="open">Scheda ↗</button>
            <button type="button" class="btn" data-act="book">Prenota</button>
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
    $('#vl-add').addEventListener('click', newVilla);
  }

  function newVilla() {
    const st = settings();
    const order = Math.max(-1, ...data().villas.map(v => v.order ?? 0)) + 1;
    const v = { id: S.uid('v'), order, name: 'NUOVA VILLA', realEstate: '', nomeReale: '', proprietario: '', indirizzo: '', servizi: '', note: '', location: '', seafront: '', indoorSqm: '', outdoorSqm: '', pax: '', guests: '', staff: '', totalBedrooms: '', guestBedrooms: '', staffBedrooms: '', doubleBedrooms: '', twinBedrooms: '', singleBedrooms: '', bathrooms: '', pool: '', gym: '', spa: '', parking: '', kitchens: '', linkSito: '', mediaProprietario: '', googleMaps: '', youtube: '', vimeo: '', psw: '', pricing: S.emptyPricing(st) };
    store.upsertVilla(v);
    location.hash = 'villa-' + v.id;
    setTimeout(() => { const n = $('[data-k="name"]'); if (n) { n.focus(); n.select(); } }, 50);
  }

  /* =====================================================================
     SCHEDA VILLA
     ===================================================================== */
  const FIELDS = {
    anagrafica: [['name', 'Nome'], ['nomeReale', 'Nome reale'], ['proprietario', 'Proprietario'], ['realEstate', 'Real estate'], ['indirizzo', 'Indirizzo'], ['location', 'Location'], ['seafront', 'Seafront – Seaview']],
    caratteristiche: [['indoorSqm', 'Indoor mq'], ['outdoorSqm', 'Outdoor mq'], ['pax', 'Pax'], ['guests', 'N° ospiti'], ['staff', 'N° staff'], ['totalBedrooms', 'Camere totali'], ['guestBedrooms', 'Camere ospiti'], ['staffBedrooms', 'Camere staff'], ['doubleBedrooms', 'Matrimoniali'], ['twinBedrooms', 'Twin'], ['singleBedrooms', 'Singole'], ['bathrooms', 'Bagni'], ['pool', 'Piscina'], ['gym', 'Palestra'], ['spa', 'Spa'], ['parking', 'Parcheggio'], ['kitchens', 'Cucine']],
    link: [['linkSito', 'Link sito'], ['mediaProprietario', 'Media proprietario'], ['googleMaps', 'Google Maps'], ['youtube', 'Video YouTube'], ['vimeo', 'Video Vimeo'], ['psw', 'Password']]
  };
  let villaTab = 'settimanale';

  function viewVilla(id) {
    const v0 = villaById(id);
    if (!v0) { main.innerHTML = `<div class="page"><div class="wrap"><a class="crumb" href="#ville">← Ville</a><p>Questa villa non esiste più.</p></div></div>`; return; }
    let v = JSON.parse(JSON.stringify(v0));
    const st = settings();
    S.TARIFFE.forEach(t => {
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
        <div><h1 id="v-title">${esc(v.name)}</h1><div class="sub">${esc([v.location, v.seafront, v.proprietario && 'Prop. ' + v.proprietario].filter(Boolean).join(' · '))}</div><div id="v-spese"></div></div>
        <div class="actions"><span class="saved" id="saved" aria-live="polite"></span>
          <button class="btn vfav${isFav(v.id) ? ' on' : ''}" id="v-fav" title="Preferiti">${HEART(isFav(v.id))} Preferiti</button>
          <button class="btn" id="v-book">+ Periodo</button><button class="btn" id="v-dup">Duplica</button><button class="btn danger" id="v-del">Elimina villa</button></div>
      </div>
      <div id="v-confirm"></div>
      <div class="cols2">
        <section class="card"><h2>Anagrafica</h2><div class="grid wide">${FIELDS.anagrafica.map(([k, l]) => k === 'location' ? locSelect() : inp(k, l)).join('')}</div></section>
        <section class="card"><h2>Servizi e note</h2>
          <label class="field"><span>Servizi inclusi</span><textarea data-k="servizi" rows="4">${esc(v.servizi)}</textarea></label>
          <label class="field"><span>Note</span><textarea data-k="note" rows="4">${esc(v.note)}</textarea></label></section>
      </div>
      <section class="card"><h2>Caratteristiche</h2><div class="grid">${FIELDS.caratteristiche.map(([k, l]) => inp(k, l)).join('')}</div></section>
      <section class="card" id="v-photos"><h2>Foto</h2>
        <div class="ph-grid" id="ph-grid"></div>
        <div class="ph-tools">${store.mode === 'online' ? `<label class="btn" for="ph-add">+ Aggiungi foto</label><input type="file" id="ph-add" accept="image/*" multiple hidden>` : ''}<span class="note" id="ph-msg"></span></div>
      </section>
      <section class="card"><h2>Link e media</h2><div class="grid wide">${FIELDS.link.map(([k, l]) => linkInp(k, l)).join('')}</div></section>
      <section class="card" id="prices"></section>
      <section class="card"><h2>Disponibilità ${esc(st.seasonName)}</h2><div class="minitl" id="v-tl"></div><div class="blist" id="v-blist"></div></section>
    </div></div>`;

    // salvataggio automatico
    let saveT;
    const save = () => {
      clearTimeout(saveT); $('#saved').textContent = 'Modifiche in corso…';
      saveT = setTimeout(() => { store.upsertVilla(JSON.parse(JSON.stringify(v))); $('#saved').textContent = 'Salvato'; }, 350);
    };
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

    drawPrices();
    function drawPrices() {
      const box = $('#prices'); const t = villaTab; const p = v.pricing[t]; const per = S.periodsFor(st, v, t);
      const defC = st.cambio || 'domenica';
      box.innerHTML = `<h2>Listino prezzi</h2>
        <div class="cambio-row"><span class="lbl">Giorno di cambio</span><div class="seg" id="p-cambio">${[['', 'Predefinito (' + defC + ')'], ['sabato', 'Sabato'], ['domenica', 'Domenica']].map(([k, l]) => `<button type="button" data-c="${k}" class="${(v.cambio || '') === k ? 'on' : ''}">${l}</button>`).join('')}</div>
          <span class="note">${v.cambio ? 'Questa villa usa un giorno diverso dal predefinito.' : 'Segue il giorno impostato in Impostazioni.'}</span></div>
        <div class="tabs" id="p-tabs">${S.TARIFFE.map(x => `<button type="button" data-t="${x.key}" class="${x.key === t ? 'on' : ''}">${x.label}</button>`).join('')}</div>
        ${t !== 'settimanale' ? `<div class="cambio-row"><span class="lbl">Date dei periodi</span><div class="seg" id="p-perm">${[['def', 'Predefinite'], ['own', 'Personalizzate per questa villa']].map(([k, l]) => `<button type="button" data-m="${k}" class="${(v.periodi && v.periodi[t] ? 'own' : 'def') === k ? 'on' : ''}">${l}</button>`).join('')}</div>
          <span class="note">${v.periodi && v.periodi[t] ? 'Modifica le date direttamente nella tabella.' : 'Uguali per tutte le ville (Impostazioni).'}</span></div>` : ''}
        <div class="params">
          <label class="field"><span>Spese servizi €</span><input data-p="spese" inputmode="numeric" value="${esc(p.spese)}"></label>
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
    function fmtIn(x) { if (x === null || x === undefined || x === '') return ''; if (x === 'ND') return 'ND'; return new Intl.NumberFormat('it-IT').format(x); }

    // periodi della villa
    const drawBookings = () => {
      const list = data().bookings.filter(b => b.villaId === v.id).sort((a, b) => a.from < b.from ? -1 : 1);
      const total = S.diffDays(st.seasonStart, st.seasonEnd) + 1;
      $('#v-tl').innerHTML = list.map(b => `<div class="bar" style="background:${esc(bookingColor(b))};left:${(S.diffDays(st.seasonStart, b.from) + .5) / total * 100}%;width:${Math.max(S.diffDays(b.from, b.to), .5) / total * 100}%" title="${esc(S.dm(b.from) + ' → ' + S.dm(b.to))}"></div>`).join('');
      $('#v-blist').innerHTML = list.length ? list.map(b => `<div class="bitem" data-b="${esc(b.id)}" tabindex="0"><span class="chip" style="background:${esc(bookingColor(b))};color:${S.inkFor(bookingColor(b))}">${esc(statoLabel(b.status))}</span><span class="dates">${S.dm(b.from)} → ${S.dm(b.to)}</span><span class="nights">${S.diffDays(b.from, b.to)} notti${b.earlyIn ? ' · early check-in' : ''}${b.lateOut ? ' · late check-out' : ''}${EXTRAS.filter(([k]) => b[k]).map(([, l]) => ' · ' + l.toLowerCase()).join('')}</span>${typeof b.prezzoVendita === 'number' ? `<span class="dates">${S.money(b.prezzoVendita)}</span>` : ''}<span class="who">${esc([b.cliente, b.note].filter(Boolean).join(' · '))}</span></div>`).join('')
        : '<div class="note">Nessun periodo inserito. Usa “+ Periodo” o clicca sul calendario.</div>';
    };
    drawBookings();
    if (store.mode === 'online' && window.SDBSpese) {
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
    $('#v-book').addEventListener('click', () => openBooking(Object.assign({ villaId: v.id }, julyWeek(v))));
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
          <figcaption>${f.id === coverId ? '<span class="ph-badge">Copertina</span>' : `<button type="button" class="btn small" data-cover="${esc(f.id)}">Copertina</button>`}<button type="button" class="btn small danger" data-delf="${esc(f.id)}">Elimina</button></figcaption>
        </figure>`).join('') : `<p class="note">${store.mode === 'online' ? 'Nessuna foto. Aggiungi la prima: diventa la copertina della scheda.' : 'Le foto si possono caricare solo con i dati online.'}</p>`;
    };
    const loadFoto = () => {
      if (store.mode !== 'online' || !store.listFoto) { drawFoto(); return; }
      $('#ph-grid').innerHTML = '<p class="note">Caricamento foto…</p>';
      store.listFoto(v.id).then(l => { foto = l; drawFoto(); }, err => { $('#ph-grid').innerHTML = ''; phMsg(rulesMsg(err)); });
    };
    loadFoto();
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
    $('#v-dup').addEventListener('click', () => {
      store.upsertVilla(JSON.parse(JSON.stringify(v)));
      const c = JSON.parse(JSON.stringify(v)); c.id = S.uid('v'); c.name = v.name + ' (copia)'; c.order = (v.order ?? 0) + 0.5;
      store.upsertVilla(c); toast('Villa duplicata'); location.hash = 'villa-' + c.id;
    });
    $('#v-del').addEventListener('click', () => {
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
  function viewSettings() {
    const st = JSON.parse(JSON.stringify(settings()));
    main.innerHTML = `<div class="page"><div class="wrap">
      <div class="head"><div><h1>Impostazioni</h1><div class="sub">Aspetto, stagione, giorno di cambio, valori per le nuove ville, backup.</div></div><div class="actions"><span class="saved" id="saved"></span></div></div>
      <section class="card"><h2>Aspetto</h2>
        <div class="field"><span>Tema</span><div class="seg" id="s-theme">${[['light', 'Chiaro (panna)'], ['dark', 'Scuro'], ['auto', 'Come il dispositivo']].map(([k, l]) => `<button type="button" data-v="${k}" class="${ui.theme === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
        <p class="note">La scelta vale solo per questo dispositivo.</p></section>
      <section class="card"><h2>Stagione</h2><div class="grid">
        <label class="field"><span>Nome</span><input id="s-name" value="${esc(st.seasonName)}"></label>
        <label class="field"><span>Inizio calendario</span><input type="date" id="s-start" value="${esc(st.seasonStart)}"></label>
        <label class="field"><span>Fine calendario</span><input type="date" id="s-end" value="${esc(st.seasonEnd)}"></label></div></section>
      <section class="card"><h2>Località</h2>
        <p class="note">È l'elenco da cui scegli la località nella scheda di ogni villa e che usi come filtro. Se due nomi indicano lo stesso posto (es. P.CERVO e PORTO CERVO), usa "Unisci in…": tutte le ville passano al nome scelto.</p>
        <div id="loc-list" class="loc-admin"></div>
        <div class="loc-new"><input id="loc-add-in" placeholder="Nuova località"><button type="button" class="btn small" id="loc-add">Aggiungi</button></div>
      </section>
      <section class="card"><h2>Giorno di cambio</h2>
        <div class="field"><span>Le settimane predefinite vanno</span><div class="seg" id="s-cambio">${[['sabato', 'Da sabato a sabato'], ['domenica', 'Da domenica a domenica']].map(([k, l]) => `<button type="button" data-c="${k}" class="${(st.cambio || 'domenica') === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
        <p class="note">Vale per tutte le ville. Nella scheda di ogni villa, sopra il listino prezzi, puoi scegliere un giorno diverso solo per quella villa. Anche le tariffe bisettimanali, mensili e bimensili seguono lo stesso giorno. I prezzi già inseriti restano collegati alla stessa settimana.</p>
        <p class="note" id="s-cambio-n"></p></section>
      <section class="card"><h2>Periodi di bisettimanale, mensile e bimensile</h2>
        <div class="tabs" id="sp-tabs">${S.TARIFFE.filter(x => x.key !== 'settimanale').map(x => `<button type="button" data-t="${x.key}" class="${x.key === perTab ? 'on' : ''}">${x.label}</button>`).join('')}</div>
        <div id="sp-state" class="cambio-row"></div>
        <div class="tbl-wrap"><table class="prices ptable"><thead><tr><th>Periodo</th><th>Dal (check-in)</th><th>Al (check-out)</th><th>Notti</th></tr></thead><tbody id="sp-per"></tbody></table></div>
        <p class="note">Sono le date predefinite per tutte le ville. Nella scheda di una villa puoi sostituirle solo per quella villa. Il numero dei periodi resta fisso, così ogni prezzo resta collegato al suo periodo.</p></section>
      <section class="card"><h2>Valori iniziali per una nuova villa</h2><div class="tbl-wrap"><table class="prices ptable"><thead><tr><th>Tariffa</th><th>Spese servizi €</th><th>Arrotonda a €</th><th>Margine %</th></tr></thead><tbody>
        ${S.TARIFFE.map(x => `<tr><td class="per">${x.label}</td><td><input data-d="${x.key}" data-k="spese" value="${esc(st.defaults[x.key].spese)}"></td><td><input data-d="${x.key}" data-k="arrotonda" value="${esc(st.defaults[x.key].arrotonda)}"></td><td><input data-d="${x.key}" data-k="margine" value="${esc(Math.round(st.defaults[x.key].margine * 1000) / 10)}"></td></tr>`).join('')}
      </tbody></table></div></section>
      <section class="card"><h2>Backup e dati</h2>
        <p class="note">${store.mode === 'online' ? `Dati online, condivisi tra gli account autorizzati. Accesso come <b>${esc(store.user || '')}</b>. Esporta comunque un backup ogni tanto.` : 'I dati sono salvati solo in questo browser. Esporta un backup ogni tanto.'}</p>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          <button class="btn" id="s-export">Esporta backup (.json)</button>
          <label class="btn" for="s-import" title="Aggiunge e aggiorna ville e periodi. Non cancella nulla.">Importa backup</label><input type="file" id="s-import" accept=".json,.txt,application/json,text/plain,*/*" hidden>
          <button class="btn" id="s-copy">Copia backup negli appunti</button>
          ${window.SDB_SEED && store.mode === 'local' ? `<button class="btn danger" id="s-reset">Ripristina dati dall'Excel</button>` : ''}
          ${store.mode === 'online' ? `<button class="btn" id="s-logout">Esci da questo dispositivo</button>` : ''}
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
      </section>
    </div></div>`;
    $('#s-theme').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; ui.theme = b.dataset.v; saveUI(); applyTheme(); $$('#s-theme button').forEach(x => x.classList.toggle('on', x === b)); });
    let t;
    const save = () => { $('#saved').textContent = 'Modifiche in corso…'; clearTimeout(t); t = setTimeout(() => { store.setSettings(JSON.parse(JSON.stringify(st))); refreshShell('impostazioni'); $('#saved').textContent = 'Salvato'; }, 400); };
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
      box.innerHTML = `<div class="wipe-pass"><span>${has ? 'Password di pulizia impostata.' : '<b>Prima imposta una password di pulizia.</b>'}</span><button type="button" class="btn small" id="pw-set">${has ? 'Cambia password' : 'Imposta password'}</button></div><div id="pw-form"></div>`;
      $('#pw-set').onclick = () => {
        $('#pw-form').innerHTML = `<form class="wipe-form" id="pw-f" autocomplete="off">${has ? '<input type="password" id="pw-old" placeholder="Password attuale" autocomplete="current-password">' : ''}<input type="password" id="pw-new" placeholder="Nuova password (almeno 6 caratteri)" autocomplete="new-password"><input type="password" id="pw-new2" placeholder="Ripeti la nuova password" autocomplete="new-password"><button class="btn small primary">Salva password</button><span class="wipe-err" id="pw-err"></span></form>`;
        $('#pw-f').addEventListener('submit', async e => {
          e.preventDefault(); const err = $('#pw-err');
          if (has && !(await checkPw($('#pw-old').value))) { err.textContent = 'La password attuale non è corretta.'; return; }
          const n1 = $('#pw-new').value, n2 = $('#pw-new2').value;
          if (n1.length < 6) { err.textContent = 'Usa almeno 6 caratteri.'; return; }
          if (n1 !== n2) { err.textContent = 'Le due password non coincidono.'; return; }
          const salt = S.uid('s'); const hash = await hashPw(n1, salt);
          try { await Promise.resolve(store.setSicurezza({ salt, hash, impostataDa: store.user || '', impostataIl: new Date().toISOString() })); toast('Password di pulizia salvata'); drawPass(); }
          catch (x) { err.textContent = 'Salvataggio non riuscito: ' + (x.message || x); }
        });
      };
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
    const backup = () => JSON.stringify(Object.assign({ exportedAt: new Date().toISOString() }, data()), null, 1);
    $('#s-export').addEventListener('click', () => {
      try {
        const blob = new Blob([backup()], { type: 'application/json' }); const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = 'summer-database-backup-' + new Date().toISOString().slice(0, 10) + '.json';
        document.body.appendChild(a); a.click(); a.remove();
        msg('<p class="note">Se il download non parte, usa “Copia backup negli appunti” e incolla il testo in un file.</p>');
      } catch (e) { msg('<p class="note">Il download non è disponibile qui: usa “Copia backup negli appunti”.</p>'); }
    });
    $('#s-copy').addEventListener('click', () => {
      const txt = backup();
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
        Promise.resolve(store.mergeAll(d)).then(r => { toast(`Backup importato: ${r.villas} ville e ${r.bookings} periodi aggiunti o aggiornati`); viewSettings(); }, err => msg(`<p class="note">Importazione non riuscita: ${esc(err.message || err)}</p>`));
      };
      r.readAsText(f);
    });
    const lo = $('#s-logout'); if (lo) lo.addEventListener('click', () => store.signOut());
    if ($('#s-reset')) $('#s-reset').addEventListener('click', () => {
      msg(`<div class="confirm-bar">Sostituire tutti i dati con quelli importati dall'Excel? Le modifiche fatte nell'app andranno perse. <button class="btn small danger solid" id="s-reset-ok">Ripristina</button><button class="btn small" id="s-reset-no">Annulla</button></div>`);
      $('#s-reset-ok').addEventListener('click', () => { store.resetToSeed(); toast('Dati ripristinati'); viewSettings(); });
      $('#s-reset-no').addEventListener('click', () => msg(''));
    });
  }

  window.addEventListener('resize', (() => { let t; return () => { clearTimeout(t); t = setTimeout(() => { if ($('#cal')) drawCalendar(); }, 200); }; })());
  route();
});
