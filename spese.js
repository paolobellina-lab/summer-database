/*
 * Pagina "Spese": scontrini dell'app Scontrini. Si possono inserire nuove spese, modificarle (con storico),
 * cancellarle e aggiungere allegati (foto o PDF). Esporta in Excel (CSV) o in Word per prenotazione,
 * con uno zip delle foto e degli allegati. "scontrini_foto" e "scontrini_allegati" si leggono solo quando servono.
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
    const X = window.SDBExport;
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
          <button class="btn primary" type="button" id="sp-new">+ Nuova spesa</button>
          <button class="btn" type="button" id="sp-assign">Account e assegnazioni</button>
          <button class="btn" type="button" id="sp-exp">Espandi tutto</button>
          <button class="btn" type="button" id="sp-csv">Esporta</button>
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
    const nAll = s => (s.hasFoto ? 1 : 0) + Math.max(0, Number(s.allegati) || 0);
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
                  <button class="btn small" type="button" data-foto="${esc(s.id)}">${nAll(s) ? 'Allegati · ' + nAll(s) : '+ Allegato'}</button>
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

    // account dell'app Scontrini: quali ville e prenotazioni vede ciascuno
    $('#sp-assign').addEventListener('click', () => openAssign(ctx));

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

    /* allegati: la foto principale (scontrini_foto, vista anche dall'app Scontrini) e gli altri allegati
       (scontrini_allegati). Si leggono solo quando si apre la finestra. */
    out.addEventListener('click', e => {
      const b = e.target.closest('[data-foto]'); if (!b) return;
      const s = spese.list.find(x => x.id === b.dataset.foto); if (s) openAllegati(s.id);
    });
    const MAXPDF = 700 * 1024;
    async function leggiFile(f) {
      if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
        if (f.size > MAXPDF) throw new Error(`${f.name}: il PDF supera 700 KB`);
        const dati = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('file non leggibile')); r.readAsDataURL(f); });
        return { nome: f.name, tipo: 'application/pdf', dati: String(dati).replace(/^data:[^;]*;/, 'data:application/pdf;') };
      }
      return { nome: f.name.replace(/\.[^.]+$/, '') + '.jpg', tipo: 'image/jpeg', dati: await ctx.compressImage(f, 1500, 750000) };
    }
    async function openAllegati(id) {
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
          box.innerHTML = items.length ? items.map((a, i) => `<figure class="al-item">${a.tipo === 'application/pdf' ? `<div class="al-pdf">PDF</div>` : `<img src="${a.dati}" alt="${esc(a.nome)}">`}
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
    }

    // nuova spesa: stessa struttura dell'app Scontrini
    $('#sp-new').addEventListener('click', () => {
      const dlg = $('#dlg'); const bookings = data().bookings;
      const villa0 = ui.spVilla || (ville()[0] || {}).id || '';
      const prenOpts = (vid, sel) => `<option value="">Spese generali della villa</option>` + bookings.filter(x => x.villaId === vid && !x._nd).sort((x, y) => String(y.from).localeCompare(String(x.from)))
        .map(x => `<option value="${esc(x.id)}" ${x.id === sel ? 'selected' : ''}>${esc((x.cliente || '').trim() || 'Senza nome')} · ${dataBreve(x.from)} → ${dataBreve(x.to)}</option>`).join('');
      let foto = null;
      dlg.innerHTML = `<form class="dlg" id="nw-form" autocomplete="off">
        <h3>Nuova spesa</h3>
        <section class="dsec sec-date"><h4>Villa e prenotazione</h4>
          <label class="field"><span>Villa</span><select id="nw-villa">${ville().map(v => `<option value="${esc(v.id)}" ${v.id === villa0 ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select></label>
          <label class="field"><span>Prenotazione</span><select id="nw-pren">${prenOpts(villa0, ui.spPren)}</select></label></section>
        <section class="dsec sec-cli"><h4>Importo e data</h4>
          <div class="row"><label class="field"><span>Importo €</span><input id="nw-imp" inputmode="decimal" required placeholder="0,00"></label>
          <label class="field"><span>Data</span><input type="date" id="nw-data" value="${isoLocale(new Date())}" required></label></div></section>
        <section class="dsec sec-srv"><h4>Descrizione</h4>
          <label class="field"><span>Categoria</span><select id="nw-cat">${CATEGORIE.map(c => `<option>${esc(c)}</option>`).join('')}</select></label>
          <label class="field"><span>Motivo</span><input id="nw-mot" placeholder="es. pulizia finale, lampadina…"></label></section>
        <section class="dsec sec-st"><h4>Foto dello scontrino</h4>
          <div class="nw-photo"><img id="nw-prev" alt="" hidden><span class="note" id="nw-none">Nessuna foto</span>
            <label class="btn small" for="nw-cam">Scatta foto</label><input type="file" id="nw-cam" accept="image/*" capture="environment" hidden>
            <label class="btn small" for="nw-gal">Scegli file</label><input type="file" id="nw-gal" accept="image/*" hidden></div>
          <p class="note">Altri allegati, anche PDF, si aggiungono dopo con il pulsante Allegati.</p></section>
        <div id="nw-msg"></div>
        <div class="foot"><button type="button" class="btn" id="nw-cancel">Annulla</button><button type="submit" class="btn primary" id="nw-save">Salva</button></div></form>`;
      $('#nw-villa').addEventListener('change', e => { $('#nw-pren').innerHTML = prenOpts(e.target.value, ''); });
      const onFile = async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; try { foto = await ctx.compressImage(f, 1500, 750000); const im = $('#nw-prev'); im.src = foto; im.hidden = false; $('#nw-none').hidden = true; } catch (_) { toast('Non riesco a leggere questa foto'); } };
      $('#nw-cam').addEventListener('change', onFile); $('#nw-gal').addEventListener('change', onFile);
      $('#nw-cancel').onclick = () => dlg.close();
      $('#nw-form').addEventListener('submit', async e => {
        e.preventDefault();
        const importo = parseImporto($('#nw-imp').value);
        if (!(importo > 0)) { $('#nw-msg').innerHTML = '<div class="warn err">Importo non valido.</div>'; return; }
        const pv = $('#nw-pren').value; const bk = pv ? bookings.find(x => x.id === pv) : null;
        const dati = { villaId: $('#nw-villa').value, prenotazioneId: bk ? bk.id : null, prenotazione: bk ? { cliente: (bk.cliente || '').trim() || 'Prenotazione senza nome', from: bk.from, to: bk.to } : null, data: $('#nw-data').value, importo, categoria: $('#nw-cat').value, motivo: $('#nw-mot').value.trim() };
        $('#nw-save').disabled = true;
        try { await store.addScontrino(dati, foto); dlg.close(); toast('Spesa salvata: la vede anche l\'app Scontrini'); }
        catch (x) { $('#nw-save').disabled = false; $('#nw-msg').innerHTML = `<div class="warn err">Salvataggio non riuscito: ${esc(x.message || x)}</div>`; }
      });
      if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
      setTimeout(() => $('#nw-imp') && $('#nw-imp').focus(), 50);
    });

    // CSV per Excel: separatore ";", BOM UTF-8, importi con la virgola
    function exportCsv() {
      if (!ordinati.length) { toast('Niente da esportare'); return; }
      const cella = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
      const rows = [['Villa', 'Prenotazione', 'Check-in', 'Check-out', 'Data scontrino', 'Categoria', 'Motivo', 'Importo', 'Inserito da', 'Allegati']];
      ordinati.forEach(({ s, villa, p }) => rows.push([villa, p ? p.cliente : 'Spese generali', p ? dataIt(p.from) : '', p ? dataIt(p.to) : '', dataIt(s.data), s.categoria || '', s.motivo || '', (Number(s.importo) || 0).toFixed(2).replace('.', ','), s.creatoDa || '', nAll(s)]));
      const testo = '﻿' + rows.map(r => r.map(cella).join(';')).join('\r\n');
      const aEl = document.createElement('a');
      aEl.href = URL.createObjectURL(new Blob([testo], { type: 'text/csv;charset=utf-8' }));
      aEl.download = `spese-ville_${isoLocale(new Date())}.csv`;
      document.body.appendChild(aEl); aEl.click(); aEl.remove();
      setTimeout(() => URL.revokeObjectURL(aEl.href), 1500);
    }


    /* Word: un file per prenotazione (una villa alla volta) con la scheda prenotazione, le note spese e i totali;
       a parte uno zip con le foto e gli allegati di tutti gli scontrini esportati. */
    const speseDi = (villaId, pid, bookings) => spese.list.filter(s => { if (s.villaId !== villaId) return false; const p = trovaPren(s, bookings); return pid === '__gen' ? !p : p && p.id === pid; }).sort((x, y) => String(x.data).localeCompare(String(y.data)));
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
      if (l.length) B.push({ table: { head: ['Data', 'Categoria', 'Motivo', 'Inserito da', 'All.', 'Importo'], widths: [1150, 1650, 2900, 2050, 600, 1288], right: [4, 5], rows: l.map(s => [dataIt(s.data), s.categoria || '', s.motivo || '', s.creatoDa || '', String(nAll(s) || ''), euro(s.importo)]), total: ['', '', '', 'Totale spese', '', euro(somma(l))] } });
      else B.push({ p: 'Nessuna nota spese.' });
      B.push({ h2: 'Totali' });
      const tot = [];
      if (sc) tot.push(['Totale vendita (affitto + servizi a parte)', sc.haPrezzo ? ctxMoney(sc.totVendita) : 'prezzo di vendita non inserito']);
      tot.push(['Totale spese', euro(somma(l))]);
      if (sc && sc.acq && sc.totAcquisto) tot.push(['Totale acquisto (affitto + servizi a parte)', ctxMoney(sc.totAcquisto)]);
      B.push({ kv: tot });
      B.push({ p: `Esportato il ${new Date().toLocaleString('it-IT')} da ${store.user || ''}. Foto e allegati sono nel file zip scaricato insieme.`, small: true });
      const nome = X.nomeFile(`Spese ${nomeVilla(villaId)} - ${titolo}${sc ? ' ' + sc.from : old ? ' ' + old.from : ''}`) + '.docx';
      return { nome, blob: new Blob([X.docx(B)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), spese: l, cartella: X.nomeFile(titolo + (sc ? ' ' + sc.from : old ? ' ' + old.from : '')) };
    }
    const ctxMoney = n => euro(n).replace(/,00\s?€$/, ' €');
    async function zipAllegati(gruppi, onStep) {
      const entries = []; const used = new Set(); let n = 0, tot = gruppi.reduce((t, g) => t + g.spese.length, 0);
      for (const g of gruppi) for (const s of g.spese) {
        n++; onStep(`Foto e allegati: scontrino ${n} di ${tot}…`);
        const base = `${g.cartella}/${s.data || 'senza-data'}_${(Number(s.importo) || 0).toFixed(2).replace('.', ',')}_${X.nomeFile(s.categoria || 'spesa')}`;
        const add = (u, ext) => { const b = X.dataUrlBytes(u); if (!b) return; let nm = base + '.' + ext, i = 2; while (used.has(nm)) nm = base + '_' + (i++) + '.' + ext; used.add(nm); entries.push({ name: nm, data: b.bytes }); };
        if (s.hasFoto) { try { const img = await store.getFoto(s.id); if (img) add(img, 'jpg'); } catch (_) {} }
        if (Number(s.allegati) > 0) { try { (await store.listAllegati(s.id)).forEach(a => add(a.dati, a.tipo === 'application/pdf' ? 'pdf' : 'jpg')); } catch (_) {} }
      }
      return entries;
    }
    $('#sp-csv').addEventListener('click', () => {
      const dlg = $('#dlg'); const bookings = data().bookings;
      const villeCon = ville().filter(v => bookings.some(b => b.villaId === v.id && !b._nd) || spese.list.some(s => s.villaId === v.id));
      let modo = 'word'; let villa = ui.spVilla && villeCon.some(v => v.id === ui.spVilla) ? ui.spVilla : (villeCon[0] || {}).id || '';
      const voci = vid => {
        const l = bookings.filter(b => b.villaId === vid && !b._nd).sort((x, y) => String(y.from).localeCompare(String(x.from))).map(b => ({ id: b.id, label: `${(b.cliente || '').trim() || 'Senza nome'} · ${dataBreve(b.from)} → ${dataBreve(b.to)}` }));
        // prenotazioni non più in calendario con scontrini
        const old = new Map(); spese.list.filter(s => s.villaId === vid).forEach(s => { const p = trovaPren(s, bookings); if (p && p.nonInCalendario && !old.has(p.id)) old.set(p.id, { id: p.id, label: `${p.cliente} · ${dataBreve(p.from)} → ${dataBreve(p.to)} (non più in calendario)` }); });
        const gen = spese.list.some(s => s.villaId === vid && !trovaPren(s, bookings)) ? [{ id: '__gen', label: 'Spese generali della villa' }] : [];
        return l.concat([...old.values()], gen).map(o => Object.assign(o, { spese: speseDi(vid, o.id, bookings) }));
      };
      const draw = () => {
        const v = voci(villa);
        dlg.innerHTML = `<div class="dlg" id="ex-dlg"><h3>Esporta</h3>
          <div class="seg ex-seg"><button type="button" data-m="word" class="${modo === 'word' ? 'on' : ''}">Word per prenotazione</button><button type="button" data-m="xls" class="${modo === 'xls' ? 'on' : ''}">Excel – tutti gli scontrini</button></div>
          ${modo === 'xls' ? `<p class="note">Un file con tutti gli scontrini mostrati in questo momento (filtri attuali): <b>${ordinati.length}</b> ${ordinati.length === 1 ? 'scontrino' : 'scontrini'}. Si apre con Excel.</p>`
          : `<label class="field"><span>Villa</span><select id="ex-villa">${villeCon.map(x => `<option value="${esc(x.id)}" ${x.id === villa ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
            <div class="ex-head"><span class="note">Un file Word per ogni prenotazione scelta: scheda prenotazione, note spese, totale spese e totale vendita.</span><button type="button" class="btn small" id="ex-all">Seleziona tutte</button></div>
            <div class="ex-list">${v.length ? v.map(o => `<label class="flag"><input type="checkbox" data-ex="${esc(o.id)}" ${o.spese.length ? 'checked' : ''}><span><b>${esc(o.label)}</b><small>${o.spese.length ? o.spese.length + (o.spese.length === 1 ? ' scontrino · ' : ' scontrini · ') + euro(somma(o.spese)) : 'nessuna nota spese'}</small></span></label>`).join('') : '<p class="note">Nessuna prenotazione per questa villa.</p>'}</div>
            <label class="flag"><input type="checkbox" id="ex-zip" checked><span><b>Scarica anche lo zip con foto e allegati</b><small>Un solo file zip, con una cartella per prenotazione.</small></span></label>`}
          <div id="ex-msg"></div>
          <div class="foot"><button type="button" class="btn" id="ex-close">Chiudi</button><button type="button" class="btn primary" id="ex-go">Scarica</button></div></div>`;
        $$('.ex-seg button', dlg).forEach(b => b.onclick = () => { modo = b.dataset.m; draw(); });
        $('#ex-close').onclick = () => dlg.close();
        if ($('#ex-villa')) $('#ex-villa').onchange = e => { villa = e.target.value; draw(); };
        if ($('#ex-all')) $('#ex-all').onclick = () => { const cbs = $$('[data-ex]', dlg); const all = cbs.every(c => c.checked); cbs.forEach(c => { c.checked = !all; }); };
        $('#ex-go').onclick = async () => {
          if (modo === 'xls') { exportCsv(); dlg.close(); return; }
          const ids = $$('[data-ex]', dlg).filter(c => c.checked).map(c => c.dataset.ex);
          if (!ids.length) { $('#ex-msg').innerHTML = '<div class="warn err">Scegli almeno una prenotazione.</div>'; return; }
          const go = $('#ex-go'); go.disabled = true; const step = t => { const m = $('#ex-msg'); if (m) m.innerHTML = `<p class="note">${esc(t)}</p>`; };
          try {
            const docs = ids.map(id => wordDoc(villa, id, bookings));
            for (let i = 0; i < docs.length; i++) { step(`File Word ${i + 1} di ${docs.length}…`); X.scarica(docs[i].nome, docs[i].blob); await new Promise(r => setTimeout(r, 450)); }
            let nz = 0;
            if ($('#ex-zip') && $('#ex-zip').checked) {
              const entries = await zipAllegati(docs, step); nz = entries.length;
              if (nz) X.scarica(X.nomeFile(`Allegati ${nomeVilla(villa)} ${isoLocale(new Date())}`) + '.zip', X.zip(entries));
            }
            step(`Scaricati ${docs.length} ${docs.length === 1 ? 'file Word' : 'file Word'}${$('#ex-zip') && $('#ex-zip').checked ? (nz ? ` e lo zip con ${nz} ${nz === 1 ? 'allegato' : 'allegati'}` : '; nessuna foto o allegato da mettere nello zip') : ''}.`);
          } catch (x) { $('#ex-msg').innerHTML = `<div class="warn err">Esportazione non riuscita: ${esc(x.message || x)}</div>`; }
          go.disabled = false;
        };
      };
      draw();
      if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    });

    render();
    return { render };
  }

  /* finestra "Account e assegnazioni" (app Scontrini), aperta dalla pagina Spese o da Impostazioni → Account */
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
      const draw = () => {
        const list = accs();
        if (selAcc && !list.some(a => a.email === selAcc)) selAcc = '';
        if (!selAcc && list.length) selAcc = list[0].email;
        const acc = list.find(a => a.email === selAcc);
        const vSet = new Set(acc ? acc.ville || [] : []), bSet = new Set(acc ? acc.prenotazioni || [] : []);
        const bookings = data().bookings;
        const vl = ville().filter(v => !q || String(v.name).toLowerCase().includes(q) || bookings.some(b => b.villaId === v.id && String(b.cliente || '').toLowerCase().includes(q)));
        const nAss = a => (a.ville || []).length + ' ville · ' + (a.prenotazioni || []).length + ' prenotazioni';
        dlg.innerHTML = `<div class="dlg assign">
          <h3>Account e assegnazioni</h3>
          <p class="note">Nell'app Scontrini un account con assegnazioni vede solo le ville e le prenotazioni scelte qui. Gli account si scelgono tra quelli autorizzati all'app Scontrini (Impostazioni → Account autorizzati).</p>
          <div class="as-accs">${list.map(a => `<button type="button" class="fav-chip ${a.email === selAcc ? 'on' : ''}" data-acc="${esc(a.email)}">${esc(a.nome || a.email)} <em>${esc(nAss(a))}</em></button>`).join('')}${scAccounts().filter(u => !list.some(a => a.email === u.email)).length ? '<button type="button" class="fav-chip add" id="as-new">+ Aggiungi account</button>' : ''}</div>
          <div id="as-form" hidden class="as-form"><select id="as-pick">${scAccounts().filter(u => !list.some(a => a.email === u.email)).map(u => `<option value="${esc(u.email)}">${esc(u.nome ? u.nome + ' · ' + u.email : u.email)}</option>`).join('')}</select><button type="button" class="btn small primary" id="as-add">Aggiungi</button><button type="button" class="btn small" id="as-x">Annulla</button></div>
          ${!scAccounts().length ? '<div class="warn">Nessun account autorizzato all\'app Scontrini. Aggiungili in Impostazioni → Account autorizzati.</div>' : ''}
          ${acc ? `<div class="as-head"><div><b>${esc(acc.nome || acc.email)}</b><small>${esc(acc.email)}</small></div><button type="button" class="btn small danger" id="as-rm">Rimuovi account</button></div>
          <input type="search" id="as-q" placeholder="Cerca villa o cliente" value="${esc(q)}">
          <div class="as-list">${vl.map(v => {
            const bs = bookings.filter(b => b.villaId === v.id && b.status !== 'richiesta').sort((x, y) => String(y.from).localeCompare(String(x.from)));
            const all = vSet.has(v.id); const nb = bs.filter(b => bSet.has(b.id)).length;
            return `<details class="as-villa${all || nb ? ' has' : ''}${bs.length ? ' can-open' : ''}" ${q || nb ? 'open' : ''}><summary><label class="as-check" onclick="event.stopPropagation()"><input type="checkbox" data-av="${esc(v.id)}" ${all ? 'checked' : ''}> <b>${esc(v.name)}</b></label><span>${all ? 'tutta la villa' : nb ? nb + (nb === 1 ? ' prenotazione' : ' prenotazioni') + ' su ' + bs.length : bs.length ? bs.length + (bs.length === 1 ? ' prenotazione' : ' prenotazioni') : 'nessuna prenotazione'}</span></summary>
              ${bs.length ? `<div class="as-bks">${bs.map(b => `<label class="as-check"><input type="checkbox" data-ab="${esc(b.id)}" ${all || bSet.has(b.id) ? 'checked' : ''} ${all ? 'disabled' : ''}> ${esc((b.cliente || '').trim() || 'Senza nome')} · ${dataBreve(b.from)} → ${dataBreve(b.to)}</label>`).join('')}</div>` : ''}
            </details>`;
          }).join('')}</div>` : '<p class="note">Aggiungi il primo account per scegliere cosa può vedere.</p>'}
          <div class="foot"><button type="button" class="btn primary" id="as-ok">Fatto</button></div></div>`;
        const upd = fn => { const l = JSON.parse(JSON.stringify(accs())); const a = l.find(x => x.email === selAcc); if (!a) return; a.ville = a.ville || []; a.prenotazioni = a.prenotazioni || []; fn(a); save(l); draw(); };
        $$('#dlg [data-acc]').forEach(b => b.onclick = () => { selAcc = b.dataset.acc; draw(); });
        const nb = $('#as-new'); if (nb) nb.onclick = () => { $('#as-form').hidden = false; $('#as-pick').focus(); };
        const x = $('#as-x'); if (x) x.onclick = () => { $('#as-form').hidden = true; };
        const ad = $('#as-add'); if (ad) ad.onclick = () => {
          const email = $('#as-pick').value; if (!email) return;
          const u = scAccounts().find(x => x.email === email);
          if (accs().some(a => a.email === email)) { selAcc = email; draw(); return; }
          save(accs().concat([{ email, nome: (u && u.nome) || '', ville: [], prenotazioni: [] }])); selAcc = email; draw();
        };
        const rm = $('#as-rm'); if (rm) rm.onclick = () => {
          rm.outerHTML = `<span class="as-rmq">Rimuovere? Vedrà di nuovo tutto. <button type="button" class="btn small danger solid" id="as-rmok">Rimuovi</button></span>`;
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
