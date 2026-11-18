/*
 * Pagina "Prenotazioni" (#prenotazioni, prima "Spese"): le prenotazioni della stagione come schede (stessa grafica
 * delle ville), dalle prossime alle passate, con vendita, acquisto previsto e spese reali (scontrini dell'app Scontrini).
 * Cliccando una scheda (#prenotazioni-<chiave>) si apre il riepilogo: valori, servizi e le singole spese, con
 * Nuova spesa, Stampa, Esporta. Le spese si modificano (con storico), si cancellano e hanno allegati (foto o PDF).
 * Esporta: Excel (CSV) o Word per prenotazione con lo zip delle foto. "scontrini_foto" e "scontrini_allegati"
 * si leggono solo quando servono.
 */
(function () {
  const fmtEuro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
  const euro = n => fmtEuro.format(Number(n) || 0);
  const daIso = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); };
  const dataIt = s => (s ? daIso(s).toLocaleDateString('it-IT') : '');
  const dataBreve = s => (s ? daIso(s).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
  const isoLocale = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  /* "Restituzione deposito sicurezza": importo salvato positivo ma mostrato in negativo; riduce quanto ricevuto dal cliente
     (deposito trattenuto), non è una spesa della villa: fuori da tutti i totali delle spese. "Danni villa" è una spesa normale. */
  const REST_DEP = 'Restituzione deposito sicurezza';
  const isRest = s => s && s.categoria === REST_DEP;
  const somma = l => l.reduce((t, s) => t + (isRest(s) ? 0 : Number(s.importo) || 0), 0);
  const sommaRest = l => l.reduce((t, s) => t + (isRest(s) ? Number(s.importo) || 0 : 0), 0);
  /* "Affitto proprietario": quanto pagato davvero al proprietario (affitto ed eventuali extra). È l'acquisto reale dell'affitto,
     da confrontare con l'acquisto concordato della prenotazione (previsto); non è un servizio incluso né aggiuntivo. */
  const AFF = 'Affitto proprietario';
  const isAff = s => s && s.categoria === AFF;
  const sommaAff = l => l.reduce((t, s) => t + (isAff(s) ? Number(s.importo) || 0 : 0), 0);
  // casella "servizio aggiuntivo": Danni villa la spunta, Affitto proprietario la toglie e la nasconde
  const aggFlag = (sel, cb) => { const c = document.querySelector(sel), k = document.querySelector(cb); if (!c || !k) return; const v = c.value; if (v === 'Danni villa') k.checked = true; if (v === AFF) k.checked = false; k.closest('.flag').hidden = v === AFF; };
  const CATEGORIE = ['Pulizie', 'Manutenzione', 'Lavanderia', 'Spesa e forniture', 'Utenze', 'Giardino e piscina', 'Benvenuto ospiti', 'Commissioni e tasse', AFF, 'Danni villa', REST_DEP, 'Altro'];
  /* Spese aggiuntive: richieste durante il soggiorno, da addebitare al cliente o trattenere dal deposito (scontrino.aggiuntiva = true;
     se il campo manca, "Danni villa" conta come aggiuntiva). Le altre sono le spese dei servizi offerti nella prenotazione. */
  const isAgg = s => !isRest(s) && !isAff(s) && (s.aggiuntiva === true || (s.aggiuntiva === undefined && s.categoria === 'Danni villa'));
  const sommaAgg = l => l.reduce((t, s) => t + (isAgg(s) ? Number(s.importo) || 0 : 0), 0);
  const sommaInc = l => somma(l) - sommaAgg(l) - sommaAff(l);
  const importoTxt = s => (isRest(s) ? '−' : '') + euro(s.importo);
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
      <div class="m">${esc(s.motivo || '—')}${isAgg(s) ? ' <span class="sp-agg">aggiuntiva</span>' : ''}<small>${esc(s.categoria || '')}${s.creatoDa ? ' · ' + esc(s.creatoDa) : ''}${s.modificatoDa ? ` · <span class="sp-mod">modificato da ${esc(s.modificatoDa)}${s.modificatoIl ? ' il ' + esc(quando(s.modificatoIl)) : ''}</span>` : ''}</small></div>
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
      const cats = CATEGORIE.includes(s.categoria) || !s.categoria ? CATEGORIE : [s.categoria].concat(CATEGORIE);
      dlg.innerHTML = `<form class="dlg" id="ed-form" autocomplete="off">
        <h3>Modifica scontrino</h3>
        <p class="note">La versione attuale resta nello storico, barrata in rosso, dentro lo stesso scontrino.</p>
        <section class="dsec sec-cli"><h4>Importo e data</h4>
          <div class="row"><label class="field"><span>Importo €</span><input id="ed-imp" inputmode="decimal" value="${esc(String(s.importo ?? '').replace('.', ','))}" required></label>
          <label class="field"><span>Data</span><input type="date" id="ed-data" value="${esc(s.data || '')}" required></label></div></section>
        <section class="dsec sec-srv"><h4>Descrizione</h4>
          <label class="field"><span>Categoria</span><select id="ed-cat">${cats.map(c => `<option ${c === s.categoria ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
          <label class="field"><span>Motivo</span><input id="ed-mot" value="${esc(s.motivo || '')}"></label>
          <label class="flag"><input type="checkbox" id="ed-agg" ${isAgg(s) ? 'checked' : ''}><span><b>Spesa per servizio aggiuntivo</b><small>Richiesto durante il soggiorno: da addebitare al cliente o trattenere dal deposito. Senza spunta è una spesa dei servizi offerti.</small></span></label></section>
        <section class="dsec sec-date"><h4>Villa e prenotazione</h4>
          <label class="field"><span>Villa</span><select id="ed-villa">${ville().map(v => `<option value="${esc(v.id)}" ${v.id === s.villaId ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select></label>
          <label class="field"><span>Prenotazione</span><select id="ed-pren">${prenOpts(s.villaId)}</select></label></section>
        <div id="ed-msg"></div>
        <div class="foot">
          <button type="button" class="btn danger left" id="ed-del">Elimina</button>
          <button type="button" class="btn" id="ed-cancel">Annulla</button>
          <button type="submit" class="btn primary" id="ed-save">Salva</button>
        </div></form>`;
      $('#ed-cat').addEventListener('change', () => aggFlag('#ed-cat', '#ed-agg')); if ($('#ed-cat').value === AFF) aggFlag('#ed-cat', '#ed-agg');
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
        const changes = { importo, data: $('#ed-data').value, categoria: $('#ed-cat').value, motivo: $('#ed-mot').value.trim(), villaId, prenotazioneId, prenotazione, aggiuntiva: $('#ed-agg').checked && $('#ed-cat').value !== AFF };
        const prevFields = { importo: s.importo, data: s.data, categoria: s.categoria || '', motivo: s.motivo || '', villaId: s.villaId, prenotazioneId: s.prenotazioneId || null, prenotazione: s.prenotazione || null , aggiuntiva: isAgg(s) };
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
          <label class="field"><span>Categoria</span><select id="nw-cat">${CATEGORIE.map(c => `<option>${esc(c)}</option>`).join('')}</select></label>
          <label class="field"><span>Motivo</span><input id="nw-mot" placeholder="es. pulizia finale, lampadina…"></label>
          <label class="flag"><input type="checkbox" id="nw-agg"><span><b>Spesa per servizio aggiuntivo</b><small>Richiesto durante il soggiorno: da addebitare al cliente o trattenere dal deposito. Senza spunta è una spesa dei servizi offerti.</small></span></label></section>
        <section class="dsec sec-st"><h4>Foto dello scontrino</h4>
          <div class="nw-photo"><img id="nw-prev" alt="" hidden><span class="note" id="nw-none">Nessuna foto</span>
            <label class="btn small" for="nw-cam">Scatta foto</label><input type="file" id="nw-cam" accept="image/*" capture="environment" hidden>
            <label class="btn small" for="nw-gal">Scegli file</label><input type="file" id="nw-gal" accept="image/*" hidden></div>
          <p class="note">Altri allegati, anche PDF, si aggiungono dopo con il pulsante Allegati.</p></section>
        <div id="nw-msg"></div>
        <div class="foot"><button type="button" class="btn" id="nw-cancel">Annulla</button><button type="submit" class="btn primary" id="nw-save">Salva</button></div></form>`;
      $('#nw-villa').addEventListener('change', e => { $('#nw-pren').innerHTML = prenOpts(e.target.value, ''); });
      $('#nw-cat').addEventListener('change', () => aggFlag('#nw-cat', '#nw-agg')); aggFlag('#nw-cat', '#nw-agg');
      const onFile = async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; try { foto = await ctx.compressImage(f, 1500, 750000); const im = $('#nw-prev'); im.src = foto; im.hidden = false; $('#nw-none').hidden = true; } catch (_) { toast('Non riesco a leggere questa foto'); } };
      $('#nw-cam').addEventListener('change', onFile); $('#nw-gal').addEventListener('change', onFile);
      $('#nw-cancel').onclick = () => dlg.close();
      $('#nw-form').addEventListener('submit', async e => {
        e.preventDefault();
        const importo = parseImporto($('#nw-imp').value);
        if (!(importo > 0)) { $('#nw-msg').innerHTML = '<div class="warn err">Importo non valido.</div>'; return; }
        const pv = $('#nw-pren').value; const bk = pv ? bookings.find(x => x.id === pv) : null;
        const dati = { villaId: $('#nw-villa').value, prenotazioneId: bk ? bk.id : null, prenotazione: bk ? { cliente: (bk.cliente || '').trim() || 'Prenotazione senza nome', from: bk.from, to: bk.to } : null, data: $('#nw-data').value, importo, categoria: $('#nw-cat').value, motivo: $('#nw-mot').value.trim() , aggiuntiva: $('#nw-agg').checked };
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
      const rows = [['Villa', 'Prenotazione', 'Check-in', 'Check-out', 'Data scontrino', 'Categoria', 'Tipo', 'Motivo', 'Importo', 'Inserito da', 'Allegati']];
      righe.forEach(({ s, villa, p }) => rows.push([villa, p ? p.cliente : 'Spese generali', p ? dataIt(p.from) : '', p ? dataIt(p.to) : '', dataIt(s.data), s.categoria || '', isRest(s) ? 'Restituzione deposito' : isAff(s) ? 'Affitto proprietario' : isAgg(s) ? 'Servizio aggiuntivo' : 'Servizi offerti', s.motivo || '', ((isRest(s) ? -1 : 1) * (Number(s.importo) || 0)).toFixed(2).replace('.', ','), s.creatoDa || '', nAll(s)]));
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
      tot.push(['Spese reali servizi offerti', euro(sommaInc(l))], ['Spese reali servizi aggiuntivi', euro(sommaAgg(l))], ['Acquisto reale (totale spese)', euro(somma(l))]);
      const depR = sc && typeof sc.deposito === 'number' ? sc.deposito : 0, restW = sommaRest(l);
      if (depR || restW) tot.push(['Deposito di sicurezza ricevuto', euro(depR)], ['Deposito restituito', '−' + euro(restW)], ['Deposito trattenuto', euro(depR - restW)]);
      if (sc && sc.haPrezzo) tot.push([depR || restW ? 'Margine reale (vendita + deposito trattenuto − spese)' : 'Margine reale (vendita − spese)', ctxMoney(sc.totVendita + depR - restW - somma(l))]);
      B.push({ kv: tot });
      B.push({ p: `Esportato il ${new Date().toLocaleString('it-IT')} da ${store.user || ''}. Foto e allegati sono nel file zip scaricato insieme.`, small: true });
      const nome = X.nomeFile(`Spese ${nomeVilla(villaId)} - ${titolo}${sc ? ' ' + sc.from : old ? ' ' + old.from : ''}`) + '.docx';
      return { nome, blob: new Blob([X.docx(B)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), spese: l, cartella: X.nomeFile(titolo + (sc ? ' ' + sc.from : old ? ' ' + old.from : '')) };
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
      let modo = 'word'; let villa = pre && pre.villa ? pre.villa : ui.prVilla && villeCon.some(v => v.id === ui.prVilla) ? ui.prVilla : (villeCon[0] || {}).id || '';
      const voci = vid => {
        const l = bookings.filter(b => b.villaId === vid && !b._nd).sort((x, y) => String(y.from).localeCompare(String(x.from))).map(b => ({ id: b.id, label: `${(b.cliente || '').trim() || 'Senza nome'} · ${dataBreve(b.from)} → ${dataBreve(b.to)}` }));
        const old = new Map(); spese.list.filter(s => s.villaId === vid).forEach(s => { const p = trovaPren(s, bookings); if (p && p.nonInCalendario && !old.has(p.id)) old.set(p.id, { id: p.id, label: `${p.cliente} · ${dataBreve(p.from)} → ${dataBreve(p.to)} (non più in calendario)` }); });
        const gen = spese.list.some(s => s.villaId === vid && !trovaPren(s, bookings)) ? [{ id: '__gen', label: 'Spese generali della villa' }] : [];
        return l.concat([...old.values()], gen).map(o => Object.assign(o, { spese: speseDi(vid, o.id, bookings) }));
      };
      const spunta = o => pre && pre.pid ? o.id === pre.pid : o.spese.length > 0;
      const draw = () => {
        const v = voci(villa);
        dlg.innerHTML = `<div class="dlg" id="ex-dlg"><h3>Esporta${pre && pre.pid ? ' questa prenotazione' : ''}</h3>
          <div class="seg ex-seg"><button type="button" data-m="word" class="${modo === 'word' ? 'on' : ''}">Word per prenotazione</button><button type="button" data-m="xls" class="${modo === 'xls' ? 'on' : ''}">Excel – scontrini</button></div>
          ${modo === 'xls' ? `<p class="note">Un file con ${pre && pre.pid ? 'gli scontrini di questa prenotazione' : 'gli scontrini delle prenotazioni mostrate in questo momento (filtri attuali)'}: <b>${righeX.length}</b> ${righeX.length === 1 ? 'scontrino' : 'scontrini'}. Si apre con Excel.</p>`
          : `<label class="field"><span>Villa</span><select id="ex-villa">${villeCon.map(x => `<option value="${esc(x.id)}" ${x.id === villa ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
            <div class="ex-head"><span class="note">Un file Word per ogni prenotazione scelta: scheda prenotazione, note spese, vendita, acquisto previsto e reale.</span><button type="button" class="btn small" id="ex-all">Seleziona tutte</button></div>
            <div class="ex-list">${v.length ? v.map(o => `<label class="flag"><input type="checkbox" data-ex="${esc(o.id)}" ${spunta(o) ? 'checked' : ''}><span><b>${esc(o.label)}</b><small>${o.spese.length ? o.spese.length + (o.spese.length === 1 ? ' scontrino · ' : ' scontrini · ') + euro(somma(o.spese)) : 'nessuna nota spese'}</small></span></label>`).join('') : '<p class="note">Nessuna prenotazione per questa villa.</p>'}</div>
            <label class="flag"><input type="checkbox" id="ex-zip" checked><span><b>Scarica anche lo zip con foto e allegati</b><small>Un solo file zip, con una cartella per prenotazione.</small></span></label>`}
          <div id="ex-msg"></div>
          <div class="foot"><button type="button" class="btn" id="ex-close">Chiudi</button><button type="button" class="btn primary" id="ex-go">Scarica</button></div></div>`;
        $$('.ex-seg button', dlg).forEach(b => b.onclick = () => { modo = b.dataset.m; draw(); });
        $('#ex-close').onclick = () => dlg.close();
        if ($('#ex-villa')) $('#ex-villa').onchange = e => { villa = e.target.value; pre = null; draw(); };
        if ($('#ex-all')) $('#ex-all').onclick = () => { const cbs = $$('[data-ex]', dlg); const all = cbs.every(c => c.checked); cbs.forEach(c => { c.checked = !all; }); };
        $('#ex-go').onclick = async () => {
          if (modo === 'xls') { exportCsv(righeX); dlg.close(); return; }
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

    const render = () => { if (!document.body.contains(root)) return; if (sub) dettaglio(); else elenco(); };

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
      lista.forEach(x => { const v = val(x); tot.vendita += v.vendita || 0; tot.acquisto += v.acquisto || 0; tot.spese += somma(x.spese); });
      generali.forEach(x => { tot.spese += somma(x.spese); });
      const stati = ctx.stati();
      const card = x => {
        const v = val(x), sp = somma(x.spese), villa = villaDi(x.villaId);
        return `<article class="vcard pcard${x.old ? ' is-old' : ''}${x.gen ? ' is-gen' : ''}" data-pk="${esc(x.chiave)}" tabindex="0">
          ${media(x.villaId, pill(x) + (villa.location ? `<span class="vc-badge">${esc(villa.location)}</span>` : ''))}
          <div class="vc-body">
            <h3 class="vc-name">${esc(villa.name)}</h3>
            <p class="vc-desc">${x.gen ? 'Spese non legate a una prenotazione' : esc(x.cliente)}</p>
            ${x.b && ctx.pagatiLiberi && ctx.pagatiLiberi(x.b) ? `<span class="pc-pag" title="Notti pagate al proprietario ma senza affitto">${ctx.pagatiLiberi(x.b)} ${ctx.pagatiLiberi(x.b) === 1 ? 'notte pagata libera' : 'notti pagate libere'}</span>` : ''}
            ${x.gen ? '' : `<div class="vc-stats2"><div><span>Arrivo</span><b>${esc(ggMese(x.from))}</b></div><div><span>Partenza</span><b>${esc(ggMese(x.to))}</b></div><div><span>Notti</span><b>${nNotti(x.from, x.to)}</b></div></div>`}
            <hr>
            <div class="pc-val">
              ${!x.b ? '' : `<div><span>Vendita</span><b>${v.vendita == null ? vuoto : euro(v.vendita)}</b></div>`}
              ${!x.b || !acq ? '' : (g0 => g0 && g0.root.id !== x.b.id ? `<div><span>Acquisto previsto</span><b class="pc-nd">nel gruppo</b><small>acquisto unico</small></div>`
                : `<div><span>Acquisto previsto</span><b>${v.acquisto == null ? vuoto : euro(v.acquisto)}</b>${g0 ? `<small>unico per ${g0.membri.length} prenotazioni</small>` : ''}</div>`)(ctx.gruppoAcq && ctx.gruppoAcq(x.b))}
              <div><span>Spese reali</span><b>${ctx.online ? (V.conSpese ? euro(sp) : '…') : vuoto}</b>${ctx.online && V.conSpese ? `<small>${sommaAgg(x.spese) ? `di cui aggiuntive ${euro(sommaAgg(x.spese))}` : `${x.spese.length} ${x.spese.length === 1 ? 'scontrino' : 'scontrini'}`}</small>` : ''}</div>
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
          const vr = ctx.valori(g0.root), ven = g0.membri.reduce((t, m) => t + (ctx.valori(m).vendita || 0), 0), spG = vis0.reduce((t, y) => t + somma(y.spese), 0);
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
            <button class="btn" type="button" id="pr-assign">Account e assegnazioni</button>` : ''}</div></div>
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

    /* ---------- riepilogo di una prenotazione ---------- */
    function dettaglio() {
      const V = voci(ctx); const k = sub;
      const x = V.l.concat(V.generali).find(y => y.chiave === k) || (V.conSpese || !ctx.online ? null : 'attesa');
      if (x === 'attesa') { root.innerHTML = '<div class="wrap"><p class="note">Caricamento…</p></div>'; return; }
      if (!x) { root.innerHTML = `<div class="wrap"><a href="#prenotazioni" class="pr-back">← Tutte le prenotazioni</a><div class="card"><p class="note">Questa prenotazione non c'è più (cancellata o spostata).</p></div></div>`; return; }
      const villa = villaDi(x.villaId), v = val(x), sp = somma(x.spese);
      // deposito di sicurezza: ricevuto (nella prenotazione) − restituito (note spese "Restituzione deposito sicurezza")
      const dep = v.deposito, rest = sommaRest(x.spese), haDep = dep != null || rest > 0, tratt = (dep || 0) - rest;
      const cella = (l, val0, nota, cls) => `<div class="pr-cell${cls ? ' ' + cls : ''}"><span>${l}</span><b>${val0}</b>${nota ? `<small>${nota}</small>` : ''}</div>`;
      const grp = x.b && ctx.gruppoAcq ? ctx.gruppoAcq(x.b) : null;
      // riquadro del gruppo: ogni prenotazione con vendita e spese, l'acquisto contato una volta sola, margini del gruppo
      let grpHtml = '';
      if (grp) {
        const righeG = grp.membri.map(m => { const it = V.l.find(y => y.b && y.b.id === m.id); const vm = ctx.valori(m), sm = it ? somma(it.spese) : 0, dm = it ? sommaRest(it.spese) : 0;
          return { m, vm, sm, si: it ? sommaInc(it.spese) : 0, sa: it ? sommaAgg(it.spese) : 0, tr: (typeof m.deposito === 'number' ? m.deposito : 0) - dm }; });
        const tsi = righeG.reduce((t, r) => t + r.si, 0), tsa = righeG.reduce((t, r) => t + r.sa, 0);
        const tv = righeG.reduce((t, r) => t + (r.vm.vendita || 0), 0), ts = righeG.reduce((t, r) => t + r.sm, 0), tt = righeG.reduce((t, r) => t + r.tr, 0);
        const ta = ctx.valori(grp.root).acquisto;
        grpHtml = `<div class="card pr-grp"><h2>Acquisto unico dal proprietario</h2>
          <p class="note">Pagata al proprietario ${esc(dataBreve(grp.root.pagatoDal || grp.root.from))} → ${esc(dataBreve(grp.root.pagatoAl || grp.root.to))}. L'acquisto si conta una volta sola; vendita e spese restano di ogni prenotazione.</p>
          <div class="tbl-wrap"><table class="prices"><thead><tr><th>Prenotazione</th><th>Date</th><th class="r">Vendita</th>${ctx.online ? '<th class="r">Spese reali servizi offerti</th><th class="r">Spese reali servizi aggiuntivi</th>' : ''}</tr></thead><tbody>
          ${righeG.map(r => `<tr${r.m.id === x.b.id ? ' class="on"' : ''}><td><a href="#prenotazioni-${encodeURIComponent(r.m.id)}">${esc((r.m.cliente || '').trim() || 'Senza nome')}</a>${r.m.id === grp.root.id ? ' <small class="note">(acquisto)</small>' : ''}</td><td>${esc(dataBreve(r.m.from))} → ${esc(dataBreve(r.m.to))}</td><td class="r">${r.vm.vendita == null ? '—' : euro(r.vm.vendita)}</td>${ctx.online ? `<td class="r">${euro(r.si)}</td><td class="r">${euro(r.sa)}</td>` : ''}</tr>`).join('')}
          </tbody><tfoot><tr><td colspan="2"><b>Totale gruppo</b></td><td class="r"><b>${euro(tv)}</b></td>${ctx.online ? `<td class="r"><b>${euro(tsi)}</b></td><td class="r"><b>${euro(tsa)}</b></td>` : ''}</tr></tfoot></table></div>
          ${acq ? `<div class="pr-grid" style="grid-template-columns:repeat(3,minmax(0,1fr));margin-top:12px">${cella('Acquisto previsto', ta == null ? vuoto : euro(ta), 'una volta sola')}${cella('Margine previsto', ta == null ? vuoto : euro(tv - ta), 'vendite − acquisto')}${cella('Margine reale', ctx.online ? euro(tv + tt - ts) : vuoto, 'vendite' + (tt ? ' + depositi trattenuti' : '') + ' − spese reali', tv + tt - ts < 0 ? 'neg' : '')}</div>` : ''}</div>`;
      }
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
          + rowV('Spese reali servizi offerti', ctx.online ? euro(sommaInc(x.spese)) : vuoto, 'servizi della prenotazione')
          + rowV('Spese reali servizi aggiuntivi', ctx.online ? euro(sommaAgg(x.spese)) : vuoto, 'da addebitare o trattenere dal deposito');
      } else if (acq) {
        // tabella previsto / reale: i valori della prenotazione sono ipotizzati (tranne la vendita), le note spese sono reali
        tab4 = true;
        const on = ctx.online, marP = v.vendita != null && v.acquisto != null ? v.vendita - v.acquisto : null;
        const marR = v.vendita != null && on ? v.vendita + (haDep ? tratt : 0) - sp : null;
        const r4 = (voce, nota, pr, re, cls, diffCls) => { const d = pr != null && re != null ? re - pr : null;
          return `<tr${cls ? ` class="${cls}"` : ''}><td>${voce}${nota ? `<small>${nota}</small>` : ''}</td><td class="r">${pr == null ? '—' : euro(pr)}</td><td class="r">${re == null ? (on ? '—' : vuoto) : euro(re)}</td><td class="r${d && diffCls ? ' ' + diffCls(d) : d === 0 ? ' ok' : ''}">${d == null ? '—' : d === 0 ? 'OK' : segno(d)}</td></tr>`; };
        const num0 = n => typeof n === 'number' ? n : null;
        const piuCaro = d => d > 0 ? 'neg' : 'pos', piuAlto = d => d > 0 ? 'pos' : 'neg';
        celle = r4('Vendita', 'affitto + servizi a parte, prezzo al cliente', v.vendita, v.vendita)
          + r4('Acquisto', on ? `${sommaAff(x.spese) ? `affitto ${euro(sommaAff(x.spese))} · ` : ''}offerti ${euro(sommaInc(x.spese))} · aggiuntivi ${euro(sommaAgg(x.spese))}` : 'affitto + servizi a parte', v.acquisto, on ? sp : null, '', piuCaro)
          + r4('di cui affitto proprietario', 'note spese "Affitto proprietario"', num0(x.b.prezzoAcquisto), on ? sommaAff(x.spese) : null, 'sub', piuCaro)
          + r4('di cui servizi offerti', 'servizi della prenotazione (incluso nel prezzo o a parte)', v.acquisto == null ? null : v.acquisto - (num0(x.b.prezzoAcquisto) || 0), on ? sommaInc(x.spese) : null, 'sub', piuCaro)
          + r4('di cui servizi aggiuntivi', 'richiesti durante il soggiorno: da addebitare o trattenere dal deposito', null, on ? sommaAgg(x.spese) : null, 'sub')
          + (haDep ? r4('Deposito trattenuto', 'ricevuto − restituito', null, on ? tratt : null) : '')
          + r4('Margine', haDep ? 'vendita + deposito trattenuto − acquisto' : 'vendita − acquisto', marP, marR, 'tot', piuAlto)
          + r4('Da addebitare al cliente', haDep ? 'aggiuntivi − deposito trattenuto' : 'spese aggiuntive', null, on ? Math.max(0, sommaAgg(x.spese) - (haDep ? Math.max(0, tratt) : 0)) : null);
      } else celle = rowV('Vendita', E(v.vendita), 'affitto + servizi a parte') + rowV('Spese reali servizi offerti', ctx.online ? euro(sommaInc(x.spese)) : vuoto, 'servizi della prenotazione') + rowV('Spese reali servizi aggiuntivi', ctx.online ? euro(sommaAgg(x.spese)) : vuoto, 'da addebitare o trattenere dal deposito') + rowV(haDep ? 'Vendita + deposito trattenuto − spese' : 'Vendita − spese', v.vendita != null && ctx.online ? euro(v.vendita + (haDep ? tratt : 0) - sp) : vuoto);
      // controllo previsto / reale: i valori della prenotazione sono quelli ipotizzati (tranne la vendita), le note spese quelle reali
      let chkHtml = '';
      if (x.b && acq && ctx.online && V.conSpese) {
        const num = n => typeof n === 'number' ? n : null;
        const rootB = grp ? grp.root : x.b;
        const affPrev = num(rootB.prezzoAcquisto);
        const spGruppo = grp ? grp.membri.flatMap(m => { const it = V.l.find(y => y.b && y.b.id === m.id); return it ? it.spese : []; }) : x.spese;
        const affReal = sommaAff(spGruppo);
        const srvPrev = v.acquisto == null ? null : v.acquisto - (num(x.b.prezzoAcquisto) || 0);
        const srvReal = sommaInc(x.spese), aggReal = sommaAgg(x.spese);
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
        chkHtml = `<div class="card pr-chk"><h2>Previsto e reale</h2>
          <p class="note">Previsto = valori della prenotazione (acquisto concordato e servizi). Reale = note spese. In linea entro il 5% (almeno 50 €).</p>
          <div class="tbl-wrap"><table class="prices pr-chk-t"><thead><tr><th>Voce</th><th class="r">Previsto</th><th class="r">Reale</th><th class="r">Differenza</th><th>Esito</th></tr></thead><tbody>
          ${riga('Affitto proprietario', grp ? 'acquisto unico: tutto il gruppo' + (grp.root.id !== x.b.id ? ', previsto nella principale' : '') : 'note spese "Affitto proprietario", anche extra', affPrev, affReal, 'da inserire tra le spese')}
          ${riga('Servizi della prenotazione', srvNomi.length ? esc(srvNomi.join(', ')) : 'spese dei servizi offerti', srvPrev || (srvReal ? 0 : null), srvReal)}
          ${aggReal ? `<tr><td><b>Servizi aggiuntivi</b><small>richiesti durante il soggiorno, da addebitare al cliente</small></td><td class="r">—</td><td class="r">${euro(aggReal)}</td><td class="r">—</td><td><span class="chk chk-warn">non previsti</span></td></tr>` : ''}
          </tbody><tfoot><tr><td><b>Totale (senza aggiuntivi)</b></td><td class="r"><b>${totPrev == null ? '—' : euro(totPrev)}</b></td><td class="r"><b>${euro(totReal)}</b></td><td class="r"><b>${totPrev == null ? '—' : segno(totReal - totPrev)}</b></td><td>${(() => { const [t, c] = esito(totPrev, totReal); return `<span class="chk ${c}">${t}</span>`; })()}</td></tr></tfoot></table></div>
          ${affPrev != null && !affReal ? '<p class="note">L\'affitto pagato al proprietario non è ancora tra le spese: inseriscilo come nota spese "Affitto proprietario" (con eventuali extra) per confrontarlo con l\'acquisto concordato.</p>' : ''}</div>`;
      }
      const cats = {}; x.spese.forEach(s => { const c = s.categoria || 'Altro'; cats[c] = (cats[c] || 0) + (isRest(s) ? -1 : 1) * (Number(s.importo) || 0); });
      const info = sc ? sc.righe.filter(([l]) => !/^Prezzo di (vendita|acquisto)/.test(l)) : x.gen ? [['Villa', villa.name], ['Località', villa.location || '']] : [['Villa', villa.name], ['Cliente', x.cliente], ['Check-in', dataIt(x.from)], ['Check-out', dataIt(x.to)], ['Stato', 'Non più in calendario']];
      root.innerHTML = `<div class="wrap pr-det">
        <a href="#prenotazioni" class="pr-back no-print">← Tutte le prenotazioni</a>
        <div class="head"><div><h1>${esc(villa.name)}</h1><div class="sub">${x.gen ? 'Spese generali della villa' : `${esc(x.cliente)} · ${esc(dataBreve(x.from))} → ${esc(dataBreve(x.to))} · ${nNotti(x.from, x.to)} notti`}</div></div>
          <div class="actions no-print">${ctx.online ? '<button class="btn primary" type="button" id="pd-new">+ Nuova spesa</button>' : ''}
            <button class="btn" type="button" id="pd-print">Stampa</button>
            ${ctx.online ? '<button class="btn" type="button" id="pd-exp">Esporta</button>' : ''}
            ${x.b && ctx.canEdit() ? '<button class="btn" type="button" id="pd-mod">Modifica prenotazione</button>' : ''}</div></div>
        <div class="pr-top">
          ${media(x.villaId, pill(x))}
          <div class="card pr-info"><h2>${x.gen ? 'Villa' : 'Prenotazione'}</h2><dl class="pr-kv">${info.map(([l, val0]) => `<dt>${esc(l)}</dt><dd>${esc(val0)}</dd>`).join('')}</dl></div>
        </div>
        <div class="card pr-valori"><h2>Valori</h2><div class="tbl-wrap"><table class="prices pr-val-t"><thead><tr><th>Voce</th>${tab4 ? '<th class="r">Previsto</th><th class="r">Reale</th><th class="r">Differenza</th>' : '<th class="r">Importo</th>'}</tr></thead><tbody>${celle}</tbody></table></div>
          ${x.b && v.vendita == null ? '<p class="note">Prezzo di vendita non inserito nella prenotazione.</p>' : ''}${!x.gen && acq && x.b && v.acquisto == null ? '<p class="note">Prezzo di acquisto non inserito nella prenotazione.</p>' : ''}</div>
        ${chkHtml}
        ${grpHtml}
        ${!x.gen && haDep ? `<div class="card pr-dep"><h2>Deposito di sicurezza</h2><div class="pr-grid" style="grid-template-columns:repeat(3,minmax(0,1fr))">
          ${cella('Ricevuto dal cliente', dep == null ? vuoto : euro(dep), x.b ? 'dalla prenotazione' : '')}${cella('Restituito', rest ? '−' + euro(rest) : euro(0), 'note spese "Restituzione deposito"')}${cella('Trattenuto', euro(tratt), tratt > 0 ? 'resta a copertura dei danni' : '', tratt < 0 ? 'neg' : '')}</div>
          <p class="note">La restituzione riduce quanto ricevuto dal cliente: non è una spesa della villa e non entra nell'acquisto reale. I danni si inseriscono come spesa "Danni villa".</p></div>` : ''}
        ${sc && sc.servizi.length ? `<div class="card"><h2>Servizi</h2><div class="tbl-wrap"><table class="prices pr-srv"><thead><tr><th>Servizio</th><th>Modalità</th>${sc.acq ? '<th class="r">Acquisto</th>' : ''}<th class="r">Vendita</th><th>Note</th></tr></thead><tbody>
          ${sc.servizi.map(r => `<tr>${r.map((c, i) => `<td${(sc.acq ? [2, 3] : [2]).includes(i) ? ' class="r"' : ''}>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>` : ''}
        <div class="card pr-spese">
          <div class="pr-sp-head"><h2>Spese <span>${x.spese.length}</span></h2>${ctx.online ? `<b>${euro(sp)}</b>` : ''}</div>
          ${!ctx.online ? '<p class="note">Le spese si vedono con i dati online.</p>' : !V.conSpese ? '<p class="note">Caricamento scontrini…</p>'
            : x.spese.length ? `<div class="sp-cats">${Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([c, t]) => `<span>${esc(c)} <b>${t < 0 ? '−' + euro(-t) : euro(t)}</b></span>`).join('')}</div>${(() => { const aff = x.spese.filter(isAff), inc = x.spese.filter(z => !isAgg(z) && !isRest(z) && !isAff(z)), agg = x.spese.filter(isAgg), rst = x.spese.filter(isRest);
              const blk = (t, l, tot) => l.length ? `<h4 class="sp-sub">${t} <span>${l.length}</span>${tot != null ? `<b>${euro(tot)}</b>` : ''}</h4>${l.map(A.rigaSpesa).join('')}` : '';
              return blk('Affitto proprietario', aff, sommaAff(x.spese)) + blk('Servizi offerti', inc, sommaInc(x.spese)) + blk('Servizi aggiuntivi', agg, sommaAgg(x.spese)) + blk('Restituzione deposito', rst, null); })()}`
            : '<p class="note">Nessuna spesa inserita per questa prenotazione.</p>'}
        </div>
      </div>`;
      if ($('#pd-new', root)) $('#pd-new', root).onclick = () => A.openNuova(x.villaId, x.b ? x.b.id : '');
      $('#pd-print', root).onclick = () => window.print();
      if ($('#pd-exp', root)) $('#pd-exp', root).onclick = () => A.openExport({ villa: x.villaId, pid: x.gen ? '__gen' : x.old ? x.chiave.split('|').slice(2).join('|') : x.b.id });
      if ($('#pd-mod', root)) $('#pd-mod', root).onclick = () => ctx.openBooking({ id: x.b.id });
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
