/*
 * Pagina "Borsellini" (#borsellini, solo amministratori): contanti in mano a ogni concierge, totale della carta di credito
 * (una sola, aziendale) e dei bonifici.
 * - Contanti: + prelievi (borsellino/{id} tipo 'prelievo'), − note spese delle ville pagate in contanti (scontrini, del concierge
 *   scontrini.contantiDi o, se manca, chi le ha inserite), − restituzioni del deposito, + addebiti cliente/proprietario incassati,
 *   − spese personali in contanti (tipo 'spesa'), − contanti riconsegnati (tipo 'riconsegna').
 * - Carta e Bonifici: tutte le note spese delle ville e le spese personali con quel metodo, senza dividerle per persona.
 * Le spese personali (pausa pranzo, benzina, rimborso…) sono fuori dalle ville: voci in meta/settings.vociBorsellino.
 * Correzioni (modifica, cancellazione): solo l'amministratore.
 */
(function () {
  const fmtEuro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', useGrouping: 'always' });
  const euro = n => fmtEuro.format(Number(n) || 0);
  const euroS = n => (n > 0 ? '+' : n < 0 ? '−' : '') + fmtEuro.format(Math.abs(Number(n) || 0));
  const daIso = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); };
  const dataIt = s => (s ? daIso(s).toLocaleDateString('it-IT') : '');
  const oggi = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const parseImp = v => { let t = String(v || '').trim().replace(/\s|€/g, ''); if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.'); const n = parseFloat(t); return isFinite(n) ? Math.round(n * 100) / 100 : NaN; };
  const VOCI_DEF = ['Pausa pranzo', 'Benzina', 'Rimborso', 'Altro'];
  const METODI = [['contanti', 'Contanti'], ['carta', 'Carta di credito'], ['bonifico', 'Bonifico']];
  const metLabel = k => (METODI.find(x => x[0] === k) || [])[1] || '';
  const TIPI = { prelievo: 'Prelievo contanti', spesa: 'Spesa personale', riconsegna: 'Contanti riconsegnati' };
  // categorie degli scontrini che sono entrate (soldi incassati) e restituzione del deposito (soldi restituiti al cliente)
  const ENTRATE = ['Addebito cliente', 'Addebito proprietario'], REST = 'Restituzione deposito sicurezza';
  const vociDi = st => (Array.isArray(st && st.vociBorsellino) && st.vociBorsellino.length ? st.vociBorsellino : VOCI_DEF);

  /* movimenti unificati: { id, src: 'sc'|'bs', data, chi, metodo, segno, importo, tipo, desc, villa, raw } */
  function movimenti(ctx, bors) {
    const villaN = id => { const v = ctx.data().villas.find(x => x.id === id); return v ? v.name : (id ? 'Villa ' + id : ''); };
    const out = []; let senza = 0;
    (ctx.spese.list || []).forEach(s => {
      const m = s.pagamento; if (!m) { senza++; return; }
      const entr = ENTRATE.includes(s.categoria), rest = s.categoria === REST;
      out.push({ id: s.id, src: 'sc', data: s.data || '', metodo: m, chi: m === 'contanti' ? String(s.contantiDi || s.creatoDa || '').toLowerCase() : String(s.creatoDa || '').toLowerCase(),
        segno: entr ? 1 : -1, importo: Number(s.importo) || 0, tipo: entr ? s.categoria + ' (incasso)' : rest ? 'Restituzione deposito' : 'Spesa villa',
        desc: [s.categoria, s.motivo].filter(Boolean).join(' · '), villa: villaN(s.villaId), pren: s.prenotazione ? s.prenotazione.cliente : (s.prenotazioneId ? '' : 'spese generali'), raw: s });
    });
    (bors || []).forEach(x => {
      const met = x.tipo === 'spesa' ? (x.pagamento || 'contanti') : 'contanti';
      out.push({ id: x.id, src: 'bs', data: x.data || '', metodo: met, chi: String(x.email || '').toLowerCase(), segno: x.tipo === 'prelievo' ? 1 : -1, importo: Number(x.importo) || 0,
        tipo: TIPI[x.tipo] || x.tipo, desc: [x.tipo === 'spesa' ? x.voce : '', x.nota].filter(Boolean).join(' · '), villa: '', pren: '', raw: x });
    });
    out.sort((a, b) => String(a.data).localeCompare(String(b.data)) || String(a.id).localeCompare(String(b.id)));
    return { l: out, senza };
  }

  function mount(main, ctx) {
    const { ui, saveUI, esc, store, toast } = ctx;
    const root = document.createElement('div'); root.className = 'page'; main.innerHTML = ''; main.appendChild(root);
    let bors = null, errB = null, off = null;
    try { off = store.listenBorsellino(l => { bors = l; errB = null; render(); }, e => { errB = e; bors = bors || []; render(); }); } catch (e) { errB = e; bors = []; }
    const persone = () => { const p = (ctx.accScontrini() || []).map(a => ({ email: a.email, nome: a.nome || a.email })); const io = String(store.user || '').toLowerCase();
      if (io && !p.some(x => x.email === io)) p.push({ email: io, nome: 'Io (' + io + ')' }); return p; };
    const nomeDi = e => { const p = persone().find(x => x.email === e); return p ? p.nome : (e || '—'); };
    const inPer = m => (!ui.bsDa || m.data >= ui.bsDa) && (!ui.bsA || m.data <= ui.bsA);
    const cerca = m => { const q = String(ui.bsQ || '').trim().toLowerCase(); return !q || [m.tipo, m.desc, m.villa, m.pren, nomeDi(m.chi)].join(' ').toLowerCase().includes(q); };

    function render() {
      if (!document.body.contains(root)) { if (off) try { off(); } catch (_) {} return; }
      const tab = ['contanti', 'carta', 'bonifico'].includes(ui.bsTab) ? ui.bsTab : 'contanti';
      if (store.mode !== 'online') { root.innerHTML = '<div class="wrap"><div class="head"><div><h1>Borsellini</h1></div></div><div class="card"><p class="note">I borsellini si vedono con i dati online (note spese dell\'app Scontrini).</p></div></div>'; return; }
      if (!ctx.spese.ready || bors === null) { root.innerHTML = `<div class="wrap"><div class="head"><div><h1>Borsellini</h1></div></div>${ctx.spese.error ? `<div class="warn err">Non riesco a leggere le note spese: ${esc(ctx.spese.error.message || ctx.spese.error)}</div>` : '<p class="note">Caricamento…</p>'}</div>`; return; }
      const { l: tutti, senza } = movimenti(ctx, bors);
      const cont = tutti.filter(m => m.metodo === 'contanti');
      // saldo di ogni persona su tutti i movimenti (il periodo filtra solo l'elenco e i totali del periodo)
      const ppl = persone(); cont.forEach(m => { if (m.chi && !ppl.some(p => p.email === m.chi)) ppl.push({ email: m.chi, nome: m.chi }); });
      const saldo = e => cont.filter(m => m.chi === e).reduce((t, m) => t + m.segno * m.importo, 0);
      const totCont = ppl.reduce((t, p) => t + saldo(p.email), 0);
      const perP = tutti.filter(inPer);
      const uscite = met => perP.filter(m => m.metodo === met && m.segno < 0).reduce((t, m) => t + m.importo, 0);
      const entrate = met => perP.filter(m => m.metodo === met && m.segno > 0).reduce((t, m) => t + m.importo, 0);
      const tabBtn = (k, l) => `<button type="button" data-bt="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`;
      let corpo = '';
      if (tab === 'contanti') {
        const sel = ui.bsChi && ppl.some(p => p.email === ui.bsChi) ? ui.bsChi : '';
        const somma = (e, f) => cont.filter(m => m.chi === e && inPer(m) && f(m)).reduce((t, m) => t + m.importo, 0);
        const cards = ppl.map(p => { const sa = saldo(p.email);
          return `<button type="button" class="card bs-card${sel === p.email ? ' on' : ''}" data-bp="${esc(p.email)}"><span class="bs-nome">${esc(p.nome)}</span><b class="bs-saldo${sa < 0 ? ' neg' : ''}">${euro(sa)}</b><span class="note">in mano</span>
            <dl class="bs-kv"><dt>Prelevato</dt><dd>${euro(somma(p.email, m => m.src === 'bs' && m.raw.tipo === 'prelievo'))}</dd>
            <dt>Spese ville</dt><dd>${euro(somma(p.email, m => m.src === 'sc' && m.segno < 0))}</dd>
            <dt>Incassato</dt><dd>${euro(somma(p.email, m => m.src === 'sc' && m.segno > 0))}</dd>
            <dt>Spese personali</dt><dd>${euro(somma(p.email, m => m.src === 'bs' && m.raw.tipo === 'spesa'))}</dd>
            <dt>Riconsegnato</dt><dd>${euro(somma(p.email, m => m.src === 'bs' && m.raw.tipo === 'riconsegna'))}</dd></dl></button>`; }).join('');
        let det = '';
        if (sel) {
          let run = 0; const righe = cont.filter(m => m.chi === sel).map(m => { run += m.segno * m.importo; return Object.assign({ run }, m); }).filter(m => inPer(m) && cerca(m)).reverse();
          det = `<div class="card bs-det"><div class="bs-det-h"><h2>${esc(nomeDi(sel))} · <span class="${saldo(sel) < 0 ? 'neg' : ''}">${euro(saldo(sel))} in mano</span></h2>
            <div class="actions"><button class="btn primary" type="button" data-bn="prelievo">+ Prelievo</button><button class="btn" type="button" data-bn="spesa">+ Spesa personale</button><button class="btn" type="button" data-bn="riconsegna">+ Riconsegna</button></div></div>
            ${tabella(righe, true)}</div>`;
        } else det = ppl.length ? '<p class="note">Scegli una persona per vedere i movimenti.</p>' : '<div class="empty">Nessun concierge: abilita gli account all\'app Scontrini in Impostazioni → Account e accessi.</div>';
        corpo = `<div class="bs-cards">${cards}</div>${det}`;
      } else {
        const righe = perP.filter(m => m.metodo === tab && cerca(m)).slice().reverse();
        const perVilla = new Map(); righe.forEach(m => { const k = m.villa || 'Spese personali (fuori dalle ville)'; perVilla.set(k, (perVilla.get(k) || 0) + m.segno * m.importo); });
        corpo = `<div class="card bs-det"><div class="bs-det-h"><h2>${tab === 'carta' ? 'Carta di credito' : 'Bonifici'} · uscite ${euro(uscite(tab))}${entrate(tab) ? ` · entrate ${euro(entrate(tab))}` : ''}</h2>
            <div class="actions"><button class="btn" type="button" data-bn="spesa">+ Spesa personale</button></div></div>
          ${perVilla.size ? `<div class="bs-pv">${[...perVilla.entries()].sort((a, b) => a[1] - b[1]).map(([k, v]) => `<span><b>${esc(k)}</b> ${euroS(v)}</span>`).join('')}</div>` : ''}
          ${tabella(righe, false)}</div>`;
      }
      root.innerHTML = `<div class="wrap">
        <div class="head"><div><h1>Borsellini</h1><div class="sub">Contanti in mano a ogni concierge, carta di credito e bonifici · note spese delle ville e spese personali</div></div>
          <div class="actions no-print"><button class="btn" type="button" id="bs-exp">Scarica Excel</button><button class="btn" type="button" id="bs-voci">Voci delle spese personali</button></div></div>
        ${errB ? `<div class="warn err">Non riesco a leggere i borsellini${errB.code === 'permission-denied' ? ': pubblica le regole nuove (borsellino) nella console Firebase' : ': ' + esc(errB.message || errB)}.</div>` : ''}
        ${senza ? `<div class="warn">${senza} ${senza === 1 ? 'nota spese senza metodo di pagamento' : 'note spese senza metodo di pagamento'}: non contano qui. Correggile dalla pagina Prenotazioni scegliendo contanti, carta o bonifico.</div>` : ''}
        <div class="sp-summary" style="grid-template-columns:repeat(3,minmax(0,1fr))">
          <div><b>${euro(totCont)}</b><span>Contanti in mano (tutti)</span></div>
          <div><b>${euro(uscite('carta'))}</b><span>Carta di credito · uscite${ui.bsDa || ui.bsA ? ' nel periodo' : ''}</span></div>
          <div><b>${euro(uscite('bonifico'))}</b><span>Bonifici · uscite${ui.bsDa || ui.bsA ? ' nel periodo' : ''}${entrate('bonifico') ? ' · entrate ' + euro(entrate('bonifico')) : ''}</span></div></div>
        <div class="card sp-filters no-print">
          <div class="seg" id="bs-tab">${tabBtn('contanti', 'Contanti')}${tabBtn('carta', 'Carta di credito')}${tabBtn('bonifico', 'Bonifici')}</div>
          <label class="field sp-q"><span>Cerca</span><input type="search" id="bs-q" value="${esc(ui.bsQ || '')}" placeholder="Voce, villa, cliente, persona"></label>
          <label class="field"><span>Dal</span><input type="date" id="bs-da" value="${esc(ui.bsDa || '')}"></label>
          <label class="field"><span>Al</span><input type="date" id="bs-a" value="${esc(ui.bsA || '')}"></label></div>
        ${corpo}</div>`;
      root.querySelectorAll('[data-bt]').forEach(b => b.onclick = () => { ui.bsTab = b.dataset.bt; saveUI(); render(); });
      root.querySelectorAll('[data-bp]').forEach(b => b.onclick = () => { ui.bsChi = ui.bsChi === b.dataset.bp ? '' : b.dataset.bp; saveUI(); render(); });
      root.querySelectorAll('[data-bn]').forEach(b => b.onclick = () => apri({ tipo: b.dataset.bn, email: tab === 'contanti' ? ui.bsChi : String(store.user || '').toLowerCase(), pagamento: tab === 'contanti' ? 'contanti' : tab }));
      root.querySelectorAll('[data-bm]').forEach(b => b.onclick = () => { const x = (bors || []).find(y => y.id === b.dataset.bm); if (x) apri(x); });
      root.querySelectorAll('[data-bf]').forEach(b => b.onclick = async () => { try { const img = await store.getFotoBors(b.dataset.bf); if (img) window.open(img, '_blank'); else toast('Foto non trovata'); } catch (e) { toast('Foto non leggibile'); } });
      const setF = (k, v) => { ui[k] = v; saveUI(); render(); };
      root.querySelector('#bs-da').onchange = e => setF('bsDa', e.target.value);
      root.querySelector('#bs-a').onchange = e => setF('bsA', e.target.value);
      let t; root.querySelector('#bs-q').addEventListener('input', e => { ui.bsQ = e.target.value; saveUI(); clearTimeout(t); t = setTimeout(() => { const pos = e.target.selectionStart; render(); const n = root.querySelector('#bs-q'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }, 200); });
      root.querySelector('#bs-voci').onclick = vociDlg;
      root.querySelector('#bs-exp').onclick = () => esporta(tab, tab === 'contanti' ? cont.filter(m => (!ui.bsChi || m.chi === ui.bsChi) && inPer(m) && cerca(m)) : perP.filter(m => m.metodo === tab && cerca(m)));
    }
    function tabella(righe, run) {
      if (!righe.length) return '<div class="empty">Nessun movimento per questi filtri.</div>';
      return `<div class="tbl-wrap"><table class="prices bs-t"><thead><tr><th>Data</th><th>Movimento</th><th>Descrizione</th><th>Villa</th>${run ? '' : '<th>Inserito da</th>'}<th class="r">Importo</th>${run ? '<th class="r">In mano</th>' : ''}<th></th></tr></thead><tbody>
        ${righe.map(m => `<tr><td>${esc(dataIt(m.data))}</td><td>${esc(m.tipo)}</td><td>${esc(m.desc)}</td><td>${esc(m.villa)}${m.pren ? ` <small class="note">${esc(m.pren)}</small>` : ''}</td>${run ? '' : `<td><small>${esc(nomeDi(m.chi))}</small></td>`}
          <td class="r ${m.segno > 0 ? 'pos' : 'neg'}">${euroS(m.segno * m.importo)}</td>${run ? `<td class="r">${euro(m.run)}</td>` : ''}
          <td class="r">${m.src === 'bs' ? `${m.raw.hasFoto ? `<button class="btn small" type="button" data-bf="${esc(m.id)}">Foto</button> ` : ''}<button class="btn small" type="button" data-bm="${esc(m.id)}">Modifica</button>` : `<a class="btn small" href="#prenotazioni-${encodeURIComponent(m.raw.prenotazioneId || ('gen|' + m.raw.villaId))}">Apri</a>`}</td></tr>`).join('')}
        </tbody></table></div>`;
    }
    function esporta(tab, righe) {
      if (!righe.length) { toast('Niente da esportare'); return; }
      const cella = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
      const rows = [['Data', 'Metodo', 'Persona', 'Movimento', 'Descrizione', 'Villa', 'Prenotazione', 'Importo']].concat(righe.map(m => [dataIt(m.data), metLabel(m.metodo), nomeDi(m.chi), m.tipo, m.desc, m.villa, m.pren, (m.segno * m.importo).toFixed(2).replace('.', ',')]));
      const blob = new Blob(['﻿' + rows.map(r => r.map(cella).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `borsellini-${tab}-${oggi()}.csv`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    }
    const dlgEl = () => { let d = document.getElementById('dlg-bors'); if (!d) { d = document.createElement('dialog'); d.id = 'dlg-bors'; document.body.appendChild(d); } return d; };
    function apri(x) {
      const nuovo = !x.id, st = ctx.data().settings || {}, voci = vociDi(st), d = dlgEl(); let foto = null;
      const tipo = x.tipo || 'spesa', met0 = tipo === 'spesa' ? (x.pagamento || 'contanti') : 'contanti';
      const pp = persone(); if (x.email && !pp.some(p => p.email === x.email)) pp.push({ email: x.email, nome: x.email });
      d.innerHTML = `<form class="dlg" id="bm-form" autocomplete="off"><h3>${nuovo ? '' : 'Modifica · '}${esc(TIPI[tipo] || tipo)}</h3>
        <section class="dsec sec-cli"><h4>Persona e importo</h4>
          <label class="field"><span>Persona</span><select id="bm-chi">${pp.map(p => `<option value="${esc(p.email)}" ${p.email === x.email ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}</select></label>
          <div class="row"><label class="field"><span>Importo €</span><input id="bm-imp" inputmode="decimal" required value="${x.importo != null ? esc(String(x.importo).replace('.', ',')) : ''}" placeholder="0,00"></label>
          <label class="field"><span>Data</span><input type="date" id="bm-data" required value="${esc(x.data || oggi())}"></label></div></section>
        ${tipo === 'spesa' ? `<section class="dsec sec-srv"><h4>Spesa personale (fuori dalle ville)</h4>
          <label class="field"><span>Voce</span><select id="bm-voce">${voci.concat(x.voce && !voci.includes(x.voce) ? [x.voce] : []).map(v => `<option ${v === x.voce ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
          <div class="field"><span>Metodo di pagamento <span class="req">*</span></span><div class="pag-opts">${METODI.map(([k, l]) => `<label class="pag-opt"><input type="radio" name="bm-pag" value="${k}" ${met0 === k ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div></div>
          ${nuovo ? `<div class="nw-photo"><img id="bm-prev" alt="" hidden><label class="btn small" for="bm-foto">Foto dello scontrino</label><input type="file" id="bm-foto" accept="image/*" hidden></div>` : ''}</section>` : ''}
        <label class="field"><span>Nota</span><input id="bm-nota" value="${esc(x.nota || '')}" placeholder="${tipo === 'prelievo' ? 'es. prelievo bancomat, dati da Paolo' : tipo === 'riconsegna' ? 'es. riconsegnati a fine stagione' : ''}"></label>
        <div id="bm-msg"></div>
        <div class="foot">${nuovo ? '' : '<button type="button" class="btn danger left" id="bm-del">Elimina</button>'}<button type="button" class="btn" id="bm-no">Annulla</button><button type="submit" class="btn primary" id="bm-ok">Salva</button></div></form>`;
      const $d = s => d.querySelector(s);
      $d('#bm-no').onclick = () => d.close();
      if ($d('#bm-foto')) $d('#bm-foto').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; try { foto = await ctx.compressImage(f, 1500, 750000); const im = $d('#bm-prev'); im.src = foto; im.hidden = false; } catch (_) { toast('Non riesco a leggere questa foto'); } };
      if ($d('#bm-del')) $d('#bm-del').onclick = async () => { if (!(await window.SDBConferma(`Eliminare questo movimento da ${euro(x.importo)}? Non si può annullare.`, { titolo: 'Borsellini', ok: 'Elimina', danger: true }))) return;
        try { await store.delMovBors(x.id, !!x.hasFoto); d.close(); toast('Movimento eliminato'); } catch (e) { $d('#bm-msg').innerHTML = `<div class="warn err">Non riuscito: ${esc(e.message || e)}</div>`; } };
      $d('#bm-form').onsubmit = async e => { e.preventDefault();
        const importo = parseImp($d('#bm-imp').value); if (!(importo > 0)) { $d('#bm-msg').innerHTML = '<div class="warn err">Importo non valido.</div>'; return; }
        const chi = $d('#bm-chi').value; if (!chi) { $d('#bm-msg').innerHTML = '<div class="warn err">Scegli la persona.</div>'; return; }
        const r = d.querySelector('input[name="bm-pag"]:checked'); if (tipo === 'spesa' && !r) { $d('#bm-msg').innerHTML = '<div class="warn err">Scegli il metodo di pagamento: contanti, carta o bonifico.</div>'; return; }
        const dati = { email: chi, tipo, importo, data: $d('#bm-data').value, nota: $d('#bm-nota').value.trim(), voce: tipo === 'spesa' ? $d('#bm-voce').value : null, pagamento: tipo === 'spesa' ? r.value : 'contanti' };
        $d('#bm-ok').disabled = true;
        try { if (nuovo) await store.addMovBors(dati, foto); else await store.updMovBors(x.id, dati); d.close(); ui.bsChi = dati.pagamento === 'contanti' ? chi : ui.bsChi; saveUI(); toast('Salvato'); render(); }
        catch (e2) { $d('#bm-ok').disabled = false; $d('#bm-msg').innerHTML = `<div class="warn err">Salvataggio non riuscito${e2 && e2.code === 'permission-denied' ? ': pubblica le regole nuove (borsellino) nella console Firebase' : ': ' + esc(e2.message || e2)}</div>`; } };
      if (d.showModal) d.showModal(); else d.setAttribute('open', '');
      setTimeout(() => { const i = $d('#bm-imp'); if (i) i.focus(); }, 50);
    }
    function vociDlg() {
      const d = dlgEl(); let l = vociDi(ctx.data().settings || {}).slice();
      const draw = () => { d.innerHTML = `<div class="dlg"><h3>Voci delle spese personali</h3><p class="note">Spese fuori dalle ville (es. pausa pranzo, benzina, rimborso). Le vedono anche i concierge nell'app Scontrini. Rinominare o togliere una voce non cambia i movimenti già inseriti.</p>
        <div class="bs-voci">${l.map((v, i) => `<div class="row"><input data-vv="${i}" value="${esc(v)}"><button class="btn small" type="button" data-vx="${i}">Togli</button></div>`).join('')}</div>
        <div class="row"><input id="bv-new" placeholder="Nuova voce"><button class="btn small" type="button" id="bv-add">Aggiungi</button></div>
        <div class="foot"><button type="button" class="btn" id="bv-no">Annulla</button><button type="button" class="btn primary" id="bv-ok">Salva</button></div></div>`;
        d.querySelectorAll('[data-vv]').forEach(i => i.oninput = () => { l[+i.dataset.vv] = i.value; });
        d.querySelectorAll('[data-vx]').forEach(b => b.onclick = () => { l.splice(+b.dataset.vx, 1); draw(); });
        d.querySelector('#bv-add').onclick = () => { const v = d.querySelector('#bv-new').value.trim(); if (v && !l.includes(v)) { l.push(v); draw(); } };
        d.querySelector('#bv-no').onclick = () => d.close();
        d.querySelector('#bv-ok').onclick = () => { const n = [...new Set(l.map(v => String(v).trim()).filter(Boolean))]; if (!n.length) { toast('Serve almeno una voce'); return; }
          const s2 = JSON.parse(JSON.stringify(ctx.data().settings || {})); s2.vociBorsellino = n; store.setSettings(s2); d.close(); toast('Voci salvate'); }; };
      draw(); if (d.showModal) d.showModal(); else d.setAttribute('open', '');
    }
    render();
    return { render };
  }
  window.SDBBorsellini = { mount, movimenti, VOCI_DEF };
})();
