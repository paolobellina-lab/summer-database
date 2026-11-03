/*
 * Pagina "Spese": scontrini inseriti con l'app Scontrini, in SOLA LETTURA.
 * Legge "scontrini" in tempo reale e "scontrini_foto" solo quando si apre una foto.
 * Non scrive mai su queste collezioni e non tocca villas/bookings.
 */
(function () {
  const fmtEuro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
  const euro = n => fmtEuro.format(Number(n) || 0);
  const daIso = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); };
  const dataIt = s => (s ? daIso(s).toLocaleDateString('it-IT') : '');
  const dataBreve = s => (s ? daIso(s).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
  const isoLocale = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const somma = l => l.reduce((t, s) => t + (Number(s.importo) || 0), 0);
  const CATEGORIE = ['Pulizie', 'Manutenzione', 'Lavanderia', 'Spesa e forniture', 'Utenze', 'Giardino e piscina', 'Benvenuto ospiti', 'Commissioni e tasse', 'Altro'];
  function parseImporto(v) { v = String(v).trim().replace(/[€\s]/g, ''); if (v.includes(',')) v = v.replace(/\./g, '').replace(',', '.'); return Math.round(parseFloat(v) * 100) / 100; }
  const quando = x => { try { const d = typeof x === 'string' ? new Date(x) : x && x.toDate ? x.toDate() : null; return d ? d.toLocaleString('it-IT', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''; } catch (_) { return ''; } };

  const normPren = b => ({ id: b.id, villaId: b.villaId, cliente: (b.cliente || '').trim() || 'Prenotazione senza nome', from: b.from, to: b.to, status: b.status || '' });

  /* Collegamento scontrino → prenotazione, nell'ordine concordato:
     1) per ID (stessa villa e, se c'è la copia, stesso check-in)  2) stessa villa + stesse date della copia
     3) la copia, segnata "non più in calendario"                  4) null = spese generali della villa */
  function trovaPren(s, bookings) {
    if (!s.prenotazioneId && !s.prenotazione) return null;
    const snap = s.prenotazione || null;
    const perId = s.prenotazioneId ? bookings.find(b => b.id === s.prenotazioneId && b.villaId === s.villaId) : null;
    if (perId && (!snap || perId.from === snap.from)) return normPren(perId);
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

  const OPEN_KEY = 'summer-db-spese-aperti';
  let aperti = new Set();
  try { aperti = new Set(JSON.parse(localStorage.getItem(OPEN_KEY) || '[]')); } catch (_) {}
  const saveOpen = () => { try { localStorage.setItem(OPEN_KEY, JSON.stringify([...aperti])); } catch (_) {} };

  function periodo(ui) {
    const t = new Date(), y = t.getFullYear();
    switch (ui.spPeriodo) {
      case 'mese': return [isoLocale(new Date(y, t.getMonth(), 1)), null];
      case '3m': return [isoLocale(new Date(y, t.getMonth() - 2, 1)), null];
      case 'anno': return [`${y}-01-01`, null];
      case 'annoprec': return [`${y - 1}-01-01`, `${y - 1}-12-31`];
      case 'custom': return [ui.spDa || null, ui.spA || null];
      default: return [null, null];
    }
  }

  /* ---------------------------------------------------------------- pagina */
  function mount(main, ctx) {
    const { ui, saveUI, esc, data, spese, store, $, $$, toast } = ctx;
    if (!ui.spPeriodo) ui.spPeriodo = 'anno';
    let ordinati = [];

    if (store.mode !== 'online') {
      main.innerHTML = `<div class="page"><div class="wrap"><div class="head"><div><h1>Spese</h1><div class="sub">Scontrini inseriti con l'app Scontrini</div></div></div>
        <div class="card"><p class="note">Disponibile solo con i dati online: apri l'app dall'indirizzo pubblicato e accedi con Google.</p></div></div></div>`;
      return;
    }

    const ville = () => data().villas.slice().sort((a, b) => String(a.name).localeCompare(String(b.name), 'it', { numeric: true }));
    const nomeVilla = id => { const v = data().villas.find(x => x.id === id); return v ? v.name : 'Villa ' + id; };
    const descPren = o => { const p = trovaPren(o, data().bookings); return nomeVilla(o.villaId) + ' · ' + (p ? p.cliente + ' ' + dataBreve(p.from) : 'spese generali'); };
    const P = [['tutto', 'Tutto'], ['mese', 'Questo mese'], ['3m', 'Ultimi 3 mesi'], ['anno', "Quest'anno"], ['annoprec', 'Anno scorso'], ['custom', 'Scegli date…']];

    main.innerHTML = `<div class="page"><div class="wrap">
      <div class="head"><div><h1>Spese</h1><div class="sub">Scontrini dell'app Scontrini · modificabili, aggiornati in tempo reale</div></div>
        <div class="actions no-print">
          <button class="btn" type="button" id="sp-exp">Espandi tutto</button>
          <button class="btn" type="button" id="sp-csv">Esporta per Excel</button>
          <button class="btn" type="button" id="sp-print">Stampa</button>
        </div></div>
      <div class="card sp-filters no-print">
        <label class="field"><span>Villa</span><select id="sp-villa"><option value="">Tutte le ville</option>${ville().map(v => `<option value="${esc(v.id)}" ${ui.spVilla === v.id ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select></label>
        <label class="field sp-pren"><span>Prenotazione</span><select id="sp-pren"><option value="">Tutte le prenotazioni</option></select></label>
        <label class="field"><span>Periodo</span><select id="sp-per">${P.map(([k, l]) => `<option value="${k}" ${ui.spPeriodo === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="field sp-date" ${ui.spPeriodo === 'custom' ? '' : 'hidden'}><span>Dal</span><input type="date" id="sp-da" value="${esc(ui.spDa || '')}"></label>
        <label class="field sp-date" ${ui.spPeriodo === 'custom' ? '' : 'hidden'}><span>Al</span><input type="date" id="sp-a" value="${esc(ui.spA || '')}"></label>
        <label class="field sp-q"><span>Cerca</span><input type="search" id="sp-q" placeholder="Motivo, categoria o cliente" value="${esc(ui.spQ || '')}"></label>
      </div>
      <div class="sp-summary"><div><b id="sp-tot">€ 0,00</b><span>Totale spese</span></div><div><b id="sp-n">0</b><span>Scontrini</span></div><div><b id="sp-p">0</b><span>Prenotazioni con spese</span></div></div>
      <div id="sp-out"></div>
    </div></div>`;

    const out = $('#sp-out');
    function render() {
      if (!document.body.contains(out)) return;
      const bookings = data().bookings;
      if (spese.error) { out.innerHTML = `<div class="card"><p class="note">Non riesco a leggere gli scontrini: ${esc(spese.error.code === 'permission-denied' ? 'questo account non è autorizzato.' : spese.error.message || spese.error)}</p></div>`; return; }
      if (!spese.ready) { out.innerHTML = '<p class="note">Caricamento scontrini…</p>'; return; }
      const [da, a] = periodo(ui);
      const q = (ui.spQ || '').trim().toLowerCase();
      const vf = ui.spVilla || '';
      const only = ui.spPren || '';
      const prenById = new Map();
      const prenDi = s => { if (!('_p' in s)) { s._p = trovaPren(s, bookings); } if (s._p) prenById.set(s._p.id, s._p); return s._p; };
      const lista = spese.list.map(s => Object.assign({}, s));

      const righe = lista.filter(s => {
        if (vf && s.villaId !== vf) return false;
        if (da && String(s.data) < da) return false;
        if (a && String(s.data) > a) return false;
        const p = prenDi(s);
        if (only === '__gen' && p) return false;
        if (only && only !== '__gen' && (!p || p.id !== only)) return false;
        if (q && !`${s.motivo || ''} ${s.categoria || ''} ${p ? p.cliente : ''}`.toLowerCase().includes(q)) return false;
        return true;
      });

      // menu "Prenotazione": prenotazioni che hanno scontrini (della villa scelta, se c'è)
      const opts = new Map(); let hasGen = false;
      lista.forEach(s => {
        if (vf && s.villaId !== vf) return;
        const p = prenDi(s);
        if (!p) { hasGen = true; return; }
        if (!opts.has(p.id)) opts.set(p.id, { p, villa: s.villaId });
      });
      if (only && only !== '__gen' && !opts.has(only)) { const bb = bookings.find(x => x.id === only); if (bb) opts.set(only, { p: normPren(bb), villa: bb.villaId }); }
      const ordered = [...opts.values()].sort((x, y) => String(y.p.from).localeCompare(String(x.p.from)));
      const optHtml = '<option value="">Tutte le prenotazioni</option>'
        + (hasGen || only === '__gen' ? `<option value="__gen" ${only === '__gen' ? 'selected' : ''}>Spese generali della villa</option>` : '')
        + ordered.map(({ p, villa }) => `<option value="${esc(p.id)}" ${only === p.id ? 'selected' : ''}>${vf ? '' : esc(nomeVilla(villa)) + ' · '}${esc(p.cliente)} · ${dataBreve(p.from)} → ${dataBreve(p.to)}${p.nonInCalendario ? ' (non più in calendario)' : ''}</option>`).join('');
      const sel = $('#sp-pren');
      if (sel && sel.dataset.h !== optHtml) { sel.innerHTML = optHtml; sel.dataset.h = optHtml; sel.value = only || ''; }

      const perVilla = new Map();
      righe.forEach(s => {
        const pid = (prenDi(s) || {}).id || '';
        if (!perVilla.has(s.villaId)) perVilla.set(s.villaId, new Map());
        const g = perVilla.get(s.villaId); if (!g.has(pid)) g.set(pid, []); g.get(pid).push(s);
      });
      const villeOrd = [...perVilla.keys()].sort((x, y) => String(nomeVilla(x)).localeCompare(String(nomeVilla(y)), 'it', { numeric: true }));

      ordinati = []; let html = '', nPren = 0;
      villeOrd.forEach(vid => {
        const gruppi = perVilla.get(vid);
        const pids = [...gruppi.keys()].filter(Boolean).sort((x, y) => String(prenById.get(y).from).localeCompare(String(prenById.get(x).from)));
        if (gruppi.has('')) pids.push('');
        nPren += pids.filter(Boolean).length;
        html += `<section class="sp-villa"><div class="sp-villa-head"><h2><a href="#villa-${esc(vid)}">${esc(nomeVilla(vid))}</a></h2><span class="amount">${euro(somma([...gruppi.values()].flat()))}</span></div>`;
        pids.forEach(pid => {
          const l = gruppi.get(pid).sort((x, y) => String(x.data).localeCompare(String(y.data)));
          const p = prenById.get(pid);
          const key = vid + '|' + (pid || 'generali');
          const open = aperti.has(key) || !!only;
          const cats = {}; l.forEach(s => { const c = s.categoria || 'Altro'; cats[c] = (cats[c] || 0) + (Number(s.importo) || 0); });
          l.forEach(s => ordinati.push({ s, villa: nomeVilla(vid), p }));
          html += `<details class="sp-group${p ? '' : ' generale'}${p && p.nonInCalendario ? ' old' : ''}" data-key="${esc(key)}" ${open ? 'open' : ''}>
            <summary>
              <div class="sp-main"><strong>${p ? esc(p.cliente) : 'Spese generali della villa'}</strong>
                <span>${p ? `${dataBreve(p.from)} → ${dataBreve(p.to)}${p.nonInCalendario ? ' · <em>non più in calendario</em>' : ''}` : 'Non legate a una prenotazione'} · ${l.length} ${l.length === 1 ? 'scontrino' : 'scontrini'}</span></div>
              <span class="amount">${euro(somma(l))}</span>
            </summary>
            <div class="sp-body">
              <div class="sp-cats">${Object.entries(cats).sort((x, y) => y[1] - x[1]).map(([c, t]) => `<span>${esc(c)} <b>${euro(t)}</b></span>`).join('')}</div>
              ${l.map(s => `<div class="sp-rc${Array.isArray(s.storico) && s.storico.length ? ' edited' : ''}">
                <span class="d">${dataIt(s.data)}</span>
                <div class="m">${esc(s.motivo || '—')}<small>${esc(s.categoria || '')}${s.creatoDa ? ' · ' + esc(s.creatoDa) : ''}${s.modificatoDa ? ` · <span class="sp-mod">modificato da ${esc(s.modificatoDa)}${s.modificatoIl ? ' il ' + esc(quando(s.modificatoIl)) : ''}</span>` : ''}</small></div>
                <span class="amount">${euro(s.importo)}</span>
                <div class="sp-act no-print">
                  <button class="btn small" type="button" data-foto="${esc(s.id)}" ${s.hasFoto ? '' : 'disabled'}>${s.hasFoto ? 'Foto' : 'Nessuna foto'}</button>
                  <button class="btn small" type="button" data-edit="${esc(s.id)}">Modifica</button>
                </div>
                ${Array.isArray(s.storico) && s.storico.length ? `<div class="sp-old">${s.storico.slice().reverse().map(o => `<div class="sp-old-row"><s><span>${dataIt(o.data)}</span> ${esc(o.motivo || '—')} · ${esc(o.categoria || '')}${o.villaId !== s.villaId || (o.prenotazioneId || null) !== (s.prenotazioneId || null) ? ' · ' + esc(descPren(o)) : ''} · <b>${euro(o.importo)}</b></s><small>versione sostituita${o.sostituitoDa ? ' da ' + esc(o.sostituitoDa) : ''}${o.sostituitoIl ? ' il ' + esc(quando(o.sostituitoIl)) : ''}</small></div>`).join('')}</div>` : ''}
              </div>`).join('')}
            </div>
          </details>`;
        });
        html += '</section>';
      });
      out.innerHTML = html || '<div class="empty">Nessuno scontrino per questi filtri.</div>';
      $('#sp-tot').textContent = euro(somma(righe));
      $('#sp-n').textContent = righe.length;
      $('#sp-p').textContent = nPren;
      const all = $$('details.sp-group', out);
      $('#sp-exp').textContent = all.length && all.every(d => d.open) ? 'Comprimi tutto' : 'Espandi tutto';
    }

    // filtri
    const bind = (id, k, ev) => $('#' + id).addEventListener(ev, e => { ui[k] = e.target.value; saveUI(); render(); });
    $('#sp-villa').addEventListener('change', e => { ui.spVilla = e.target.value; ui.spPren = ''; saveUI(); render(); });
    bind('sp-pren', 'spPren', 'change'); bind('sp-da', 'spDa', 'change'); bind('sp-a', 'spA', 'change');
    let t; $('#sp-q').addEventListener('input', e => { ui.spQ = e.target.value; saveUI(); clearTimeout(t); t = setTimeout(render, 120); });
    $('#sp-per').addEventListener('change', e => { ui.spPeriodo = e.target.value; saveUI(); $$('.sp-date').forEach(x => { x.hidden = ui.spPeriodo !== 'custom'; }); render(); });

    out.addEventListener('toggle', e => {
      const k = e.target.dataset && e.target.dataset.key; if (!k) return;
      if (e.target.open) aperti.add(k); else aperti.delete(k); saveOpen();
    }, true);
    $('#sp-exp').addEventListener('click', () => {
      const all = $$('details.sp-group', out); const apri = all.some(d => !d.open);
      all.forEach(d => { d.open = apri; const k = d.dataset.key; if (apri) aperti.add(k); else aperti.delete(k); });
      saveOpen(); $('#sp-exp').textContent = apri ? 'Comprimi tutto' : 'Espandi tutto';
    });
    $('#sp-print').addEventListener('click', () => { $$('details.sp-group', out).forEach(d => { d.open = true; }); setTimeout(() => window.print(), 60); });

    // modifica / cancellazione dello scontrino (lo storico conserva la versione precedente)
    out.addEventListener('click', e => {
      const b = e.target.closest('[data-edit]'); if (!b) return;
      const s = spese.list.find(x => x.id === b.dataset.edit); if (s) openEdit(s);
    });
    function openEdit(s) {
      const dlg = $('#dlg');
      const bookings = data().bookings;
      const cur = trovaPren(s, bookings);
      const prenOpts = vid => {
        const list = bookings.filter(x => x.villaId === vid).slice().sort((x, y) => String(y.from).localeCompare(String(x.from)));
        const curId = cur && !cur.nonInCalendario && s.villaId === vid ? cur.id : '';
        return `<option value="">Spese generali della villa</option>` + (cur && cur.nonInCalendario && s.villaId === vid ? `<option value="__keep" selected>${esc(cur.cliente)} · ${dataBreve(cur.from)} → ${dataBreve(cur.to)} (non più in calendario)</option>` : '')
          + list.map(x => `<option value="${esc(x.id)}" ${x.id === curId ? 'selected' : ''}>${esc((x.cliente || '').trim() || 'Senza nome')} · ${dataBreve(x.from)} → ${dataBreve(x.to)}</option>`).join('');
      };
      const cats = CATEGORIE.includes(s.categoria) || !s.categoria ? CATEGORIE : [s.categoria].concat(CATEGORIE);
      dlg.innerHTML = `<form class="dlg" id="ed-form" autocomplete="off">
        <h3>Modifica scontrino</h3>
        <p class="note">La versione attuale resta nello storico, barrata in rosso, dentro lo stesso scontrino.</p>
        <section class="dsec sec-cli"><h4>Importo e data</h4>
          <div class="row"><label class="field"><span>Importo €</span><input id="ed-imp" inputmode="decimal" value="${esc(String(s.importo ?? '').replace('.', ','))}" required></label>
          <label class="field"><span>Data</span><input type="date" id="ed-data" value="${esc(s.data || '')}" required></label></div></section>
        <section class="dsec sec-srv"><h4>Descrizione</h4>
          <label class="field"><span>Categoria</span><select id="ed-cat">${cats.map(c => `<option ${c === s.categoria ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
          <label class="field"><span>Motivo</span><input id="ed-mot" value="${esc(s.motivo || '')}"></label></section>
        <section class="dsec sec-date"><h4>Villa e prenotazione</h4>
          <label class="field"><span>Villa</span><select id="ed-villa">${ville().map(v => `<option value="${esc(v.id)}" ${v.id === s.villaId ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select></label>
          <label class="field"><span>Prenotazione</span><select id="ed-pren">${prenOpts(s.villaId)}</select></label></section>
        <div id="ed-msg"></div>
        <div class="foot">
          <button type="button" class="btn danger left" id="ed-del">Elimina</button>
          <button type="button" class="btn" id="ed-cancel">Annulla</button>
          <button type="submit" class="btn primary" id="ed-save">Salva</button>
        </div></form>`;
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
        const changes = { importo, data: $('#ed-data').value, categoria: $('#ed-cat').value, motivo: $('#ed-mot').value.trim(), villaId, prenotazioneId, prenotazione };
        const prevFields = { importo: s.importo, data: s.data, categoria: s.categoria || '', motivo: s.motivo || '', villaId: s.villaId, prenotazioneId: s.prenotazioneId || null, prenotazione: s.prenotazione || null };
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
    }

    // foto: letta da scontrini_foto solo adesso
    out.addEventListener('click', async e => {
      const b = e.target.closest('[data-foto]'); if (!b || b.disabled) return;
      const s = spese.list.find(x => x.id === b.dataset.foto); if (!s) return;
      const p = trovaPren(s, data().bookings);
      const dlg = $('#dlg');
      dlg.innerHTML = `<div class="dlg sp-photo">
        <h3>${euro(s.importo)} · ${dataIt(s.data)}</h3>
        <div class="note">${esc(nomeVilla(s.villaId))} · ${esc(p ? p.cliente : 'spesa generale')} · ${esc(s.motivo || '')}</div>
        <div class="sp-photo-box"><p class="note" id="ph-msg">Caricamento foto…</p><img id="ph-img" alt="Foto dello scontrino" hidden></div>
        <div class="foot"><a class="btn" id="ph-down" hidden>Scarica</a><button type="button" class="btn primary" id="ph-close">Chiudi</button></div></div>`;
      $('#ph-close').onclick = () => dlg.close();
      dlg.onclick = ev => { if (ev.target === dlg) dlg.close(); };
      if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
      try {
        const img = await store.getFoto(s.id);
        if (!img) { $('#ph-msg').textContent = 'Foto non trovata.'; return; }
        const im = $('#ph-img'); im.src = img; im.hidden = false; $('#ph-msg').hidden = true;
        const dl = $('#ph-down'); dl.href = img; dl.download = `scontrino_${s.data}_${String(s.id).slice(0, 6)}.jpg`; dl.hidden = false;
      } catch (x) { $('#ph-msg').textContent = 'Errore: ' + (x.message || x); }
    });

    // CSV per Excel: separatore ";", BOM UTF-8, importi con la virgola
    $('#sp-csv').addEventListener('click', () => {
      if (!ordinati.length) { toast('Niente da esportare'); return; }
      const cella = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
      const rows = [['Villa', 'Prenotazione', 'Check-in', 'Check-out', 'Data scontrino', 'Categoria', 'Motivo', 'Importo', 'Inserito da']];
      ordinati.forEach(({ s, villa, p }) => rows.push([villa, p ? p.cliente : 'Spese generali', p ? dataIt(p.from) : '', p ? dataIt(p.to) : '', dataIt(s.data), s.categoria || '', s.motivo || '', (Number(s.importo) || 0).toFixed(2).replace('.', ','), s.creatoDa || '']));
      const testo = '﻿' + rows.map(r => r.map(cella).join(';')).join('\r\n');
      const aEl = document.createElement('a');
      aEl.href = URL.createObjectURL(new Blob([testo], { type: 'text/csv;charset=utf-8' }));
      aEl.download = `spese-ville_${isoLocale(new Date())}.csv`;
      document.body.appendChild(aEl); aEl.click(); aEl.remove();
      setTimeout(() => URL.revokeObjectURL(aEl.href), 1500);
    });

    render();
    return { render };
  }

  window.SDBSpese = { mount, trovaPren, totaleBooking, totaleVillaAnno, euro };
})();
