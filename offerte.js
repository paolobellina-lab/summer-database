/*
 * Pagina "Offerte": scegli tariffa e periodo, scegli le ville, e prepara per il cliente
 *  - un documento Word con foto, informazioni e prezzo di ogni villa;
 *  - una mail da incollare in Gmail (testo e foto copiati negli appunti), con "Apri Gmail".
 * Italiano o inglese a scelta. Usa solo i dati che l'account può vedere (campi riservati esclusi).
 */
(function () {
  const T = {
    it: {
      titolo: 'Proposta ville', per: 'Periodo', ospiti: 'Ospiti', camere: 'Camere', bagni: 'Bagni', interni: 'Interni', esterni: 'Esterni',
      piscina: 'Piscina', spa: 'Spa', palestra: 'Palestra', mare: 'Posizione', localita: 'Località', servizi: 'Servizi inclusi', sito: 'Scopri di più',
      prezzo: 'Prezzo per il periodo', richiesta: 'Su richiesta', dal: 'dal', al: 'al', saluti: 'Cordiali saluti',
      intro: (c, p) => `${c ? 'Gentile ' + c + ',' : 'Gentile cliente,'}\ncome richiesto, di seguito le nostre proposte per il periodo ${p}.`,
      chiusa: 'I prezzi si intendono per l\'intero periodo indicato. Restiamo a disposizione per qualsiasi informazione o per organizzare una visita.',
      oggetto: p => `La sua richiesta · ${p}`,
      proposte: 'Ecco le nostre proposte:', video: 'Guarda il video', qui: 'qui', tariffa: 'Tariffa', inclusiTit: 'Le tariffe includono:',
      inclusi: 'Pulizia giornaliera della casa\nGiardinaggio e pulizia della piscina regolari\nCambio biancheria e asciugamani due volte a settimana\nProdotti da bagno di lusso all\'arrivo\nServizio concierge per tutte le prenotazioni in Costa Smeralda\nPulizia finale e lavanderia finale standard\nTutte le utenze, escluso il riscaldamento della piscina se presente',
      chiusaMail: 'Il nostro Concierge sarà a disposizione per qualsiasi servizio extra durante il soggiorno.',
      soggetta: 'Offerta soggetta a disponibilità e ad approvazione finale del proprietario.'
    },
    en: {
      titolo: 'Villa proposal', per: 'Dates', ospiti: 'Guests', camere: 'Bedrooms', bagni: 'Bathrooms', interni: 'Indoor', esterni: 'Outdoor',
      piscina: 'Pool', spa: 'Spa', palestra: 'Gym', mare: 'Position', localita: 'Location', servizi: 'Included services', sito: 'Discover more',
      prezzo: 'Price for the period', richiesta: 'On request', dal: 'from', al: 'to', saluti: 'Kind regards',
      intro: (c, p) => `${c ? 'Dear ' + c + ',' : 'Dear guest,'}\nplease find our suggested options below for the period ${p}.`,
      chiusa: 'Prices refer to the whole period indicated. We remain at your disposal for any further information.',
      oggetto: p => `Your Enquiry · ${p}`,
      proposte: 'Herewith our suggestions:', video: 'Watch the video', qui: 'here', tariffa: 'Rate', inclusiTit: 'The rates do include:',
      inclusi: 'Daily Cleaning for the resetting of the house\nRegular Gardening and pool cleaning\nLinen & towel change twice per week\nLuxury bath products on arrival\nConcierge Services for all reservations in Costa Smeralda\nStandard Final Cleaning and Final Laundry\nAll Utilities except the cost for the pool heating if present',
      chiusaMail: 'Our Concierge will be ready to accommodate any requests for extra services needed during your stay.',
      soggetta: 'Offer subject to availability and owner\'s final approval.'
    }
  };
  const FIRMA = 'Esmeralda Luxury Villas';

  function mount(main, ctx) {
    const { ui, saveUI, esc, data, store, $, $$, toast, S, settings, blocks, hiddenField } = ctx;
    const X = window.SDBExport;
    const o = ui.off = Object.assign({ tariff: 'settimanale', idx: 0, ville: [], prezzi: {}, cliente: '', email: '', lingua: 'it', nFoto: 3, soloLibere: true, q: '', intro: '', chiusa: '', introMod: false, chiusaMod: false, note: {}, incSel: null, incExtra: '', firma: 'Esmeralda Luxury Villas' }, ui.off || {});
    const L = () => T[o.lingua] || T.it;
    if (!o.note) o.note = {};
    const st = settings();
    const fmtD = (iso, lang) => new Date(S.parse(iso)).toLocaleDateString(lang === 'en' ? 'en-GB' : 'it-IT', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
    const rangeTxt = (p, lang) => lang === 'en' ? `${fmtD(p.from, lang)} – ${fmtD(p.to, lang)}` : `dal ${fmtD(p.from, lang)} al ${fmtD(p.to, lang)}`;
    const ville = () => data().villas.slice().sort((a, b) => String(a.name).localeCompare(String(b.name), 'it', { numeric: true }));
    const perOf = v => S.periodsFor(st, v, o.tariff)[o.idx] || null;
    const listinoOf = v => { const x = S.priceAt(v, o.tariff, o.idx, 'listino'); return x; };
    const stato = v => {
      const p = perOf(v); if (!p) return 'nd';
      const pr = listinoOf(v); if (pr === 'ND') return 'nd';
      const busy = data().bookings.some(b => b.villaId === v.id && blocks(b.status) && b.from < p.to && b.to > p.from);
      return busy ? 'occupata' : 'libera';
    };
    const prezzoDi = v => { const k = o.prezzi[v.id]; if (k !== undefined && k !== '') { const n = S.parseMoney(k); return typeof n === 'number' ? n : null; } const x = listinoOf(v); return typeof x === 'number' ? x : null; };
    const euro = n => new Intl.NumberFormat(o.lingua === 'en' ? 'en-GB' : 'it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
    const baseP = () => S.periodsFor(st, null, o.tariff);
    const periodoTxt = () => {
      const sel = ville().filter(v => o.ville.includes(v.id)); const ps = sel.map(perOf).filter(Boolean);
      const same = ps.length && ps.every(p => p.from === ps[0].from && p.to === ps[0].to);
      const p = same ? ps[0] : baseP()[o.idx]; if (!p) return '';
      return same || o.tariff === 'settimanale' ? rangeTxt(p, o.lingua) : (p.label + ' ' + String(p.from).slice(0, 4));
    };
    const save = () => saveUI();

    main.innerHTML = `<div class="page"><div class="wrap off-page">
      <div class="head"><div><h1>Offerte</h1><div class="sub">Scegli il periodo e le ville: prepari un documento Word o una mail per il cliente, con foto, informazioni e prezzo</div></div></div>
      <section class="card"><h2>1 · Periodo</h2>
        <div class="seg off-tar" id="off-tar">${S.TARIFFE.map(t => `<button type="button" data-t="${t.key}" class="${o.tariff === t.key ? 'on' : ''}">${t.label}</button>`).join('')}</div>
        <div class="off-pernav"><button type="button" class="btn" id="off-prev" aria-label="Periodo precedente">‹</button><div class="off-persel" id="off-persel"></div><button type="button" class="btn" id="off-next" aria-label="Periodo successivo">›</button></div>
        <div class="off-cal" id="off-cal"></div>
        <p class="note">Le ville con giorno di cambio o periodi diversi mostrano le loro date esatte.</p>
      </section>
      <section class="card"><h2>2 · Ville <span class="off-count" id="off-count"></span></h2>
        <div class="off-tools"><label class="flag off-all" title="Seleziona o deseleziona tutte le ville dell'elenco"><input type="checkbox" id="off-all"><span><b>Tutte</b></span></label><input type="search" id="off-q" placeholder="Cerca villa o località" value="${esc(o.q)}">
          <label class="flag off-free"><input type="checkbox" id="off-free" ${o.soloLibere ? 'checked' : ''}><span><b>Solo ville libere</b></span></label></div>
        <div id="off-list" class="off-list"></div>
      </section>
      <section class="card"><h2>3 · Offerta</h2>
        <div class="row off-row">
          <label class="field"><span>Cliente</span><input id="off-cli" value="${esc(o.cliente)}" placeholder="es. Mr Smith"></label>
          <label class="field"><span>Email del cliente</span><input id="off-mail" type="email" value="${esc(o.email)}" placeholder="facoltativa"></label>
          <div class="field"><span>Lingua</span><div class="seg" id="off-lang"><button type="button" data-l="it" class="${o.lingua === 'it' ? 'on' : ''}">Italiano</button><button type="button" data-l="en" class="${o.lingua === 'en' ? 'on' : ''}">English</button></div></div>
          <label class="field"><span>Foto per villa (Word)</span><select id="off-nf">${[1, 3, 5, 8].map(n => `<option value="${n}" ${Number(o.nFoto) === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        </div>
        <label class="field"><span>Testo iniziale</span><textarea id="off-intro" rows="3"></textarea></label>
        <div class="field"><span>Le tariffe includono</span><div class="off-incl" id="off-incl"></div>
          <textarea id="off-incx" rows="2" placeholder="Altre voci solo per questa offerta (una per riga)">${esc(o.incExtra || '')}</textarea>
          <small class="note">L'elenco e le voci spuntate di norma si cambiano in Impostazioni → Servizi e inclusioni.</small></div>
        <label class="field"><span>Testo finale</span><textarea id="off-chiusa" rows="2"></textarea></label>
        <label class="field"><span>Firma</span><textarea id="off-firma" rows="2">${esc(o.firma || '')}</textarea></label>
        ${store.listBrochure ? `<label class="flag off-bro"><input type="checkbox" id="off-bro" ${o.brochure ? 'checked' : ''}><span><b>Allega brochure</b><small id="off-bro-info">Scarica i PDF delle ville scelte, nella lingua dell'offerta, da trascinare nella mail.</small></span></label>` : ''}
        <div class="off-actions">
          <button type="button" class="btn primary" id="off-word">Scarica Word</button>
          <button type="button" class="btn" id="off-copy">Copia per email</button>
          <button type="button" class="btn" id="off-gmail">Apri Gmail</button>
          <button type="button" class="btn" id="off-bro-dl" ${o.brochure ? '' : 'hidden'}>Scarica brochure</button>
        </div>
        <p class="note">Per la mail: premi <b>Copia per email</b>, poi <b>Apri Gmail</b> e incolla nel testo del messaggio (Ctrl+V, o ⌘V sul Mac). La mail elenca le ville con link, codice, video e prezzo, senza foto. Con <b>Allega brochure</b> i PDF si scaricano insieme: trascinali dalla cartella Download nella mail di Gmail.</p>
        <div id="off-msg"></div>
      </section>
    </div></div>`;

    // periodi della tariffa (date del giorno di cambio predefinito)
    const iso = t => new Date(t).toISOString().slice(0, 10);
    const MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
    const drawPer = () => {
      const ps = baseP(); if (o.idx >= ps.length) o.idx = 0;
      const p = ps[o.idx];
      $('#off-persel').innerHTML = p ? `<b>${esc(o.tariff === 'settimanale' ? 'Settimana ' + (o.idx + 1) : p.label)}</b><span>${esc(S.dm(p.from) + ' → ' + S.dm(p.to))}</span>` : '<span class="note">Nessun periodo</span>';
      $('#off-prev').disabled = o.idx <= 0; $('#off-next').disabled = o.idx >= ps.length - 1;
      if (!ps.length) { $('#off-cal').innerHTML = ''; return; }
      const idxOf = d => { for (let i = 0; i < ps.length; i++) if (ps[i].from <= d && d < ps[i].to) return i; return -1; };
      const first = new Date(ps[0].from + 'T00:00:00Z'), last = new Date(ps[ps.length - 1].to + 'T00:00:00Z');
      let html = '';
      for (let y = first.getUTCFullYear(), m = first.getUTCMonth(); y < last.getUTCFullYear() || (y === last.getUTCFullYear() && m <= last.getUTCMonth()); m === 11 ? (y++, m = 0) : m++) {
        const start = Date.UTC(y, m, 1), n = new Date(Date.UTC(y, m + 1, 0)).getUTCDate(), lead = (new Date(start).getUTCDay() + 6) % 7;
        let cells = '<i></i>'.repeat(lead);
        for (let k = 0; k < n; k++) {
          const d = iso(start + k * 864e5), i = idxOf(d), sel = i === o.idx, out = p && d === p.to;
          const cls = ['d', i < 0 ? 'off' : 'p' + (i % 2), sel ? 'sel' : '', sel && d === p.from ? 'first' : '', out ? 'out' : ''].filter(Boolean).join(' ');
          cells += i < 0 && !out ? `<span class="${cls}">${k + 1}</span>` : `<button type="button" class="${cls}" data-i="${i < 0 ? o.idx : i}" title="${esc(i < 0 ? '' : ps[i].label)}">${k + 1}</button>`;
        }
        html += `<div class="off-month"><div class="off-mname">${MESI[m]} ${y}</div><div class="off-wd">${['L', 'M', 'M', 'G', 'V', 'S', 'D'].map(x => `<i>${x}</i>`).join('')}</div><div class="off-days">${cells}</div></div>`;
      }
      $('#off-cal').innerHTML = html;
    };
    const setIdx = i => { const ps = baseP(); if (i < 0 || i >= ps.length || i === o.idx) return; o.idx = i; o.prezzi = {}; drawPer(); drawList(); drawTexts(); save(); };
    let visibili = [];
    const drawList = () => {
      const q = (o.q || '').trim().toLowerCase();
      const list = ville().filter(v => !q || `${v.name} ${v.location || ''}`.toLowerCase().includes(q)).map(v => ({ v, s: stato(v), p: perOf(v), pr: listinoOf(v) }))
        .filter(x => !o.soloLibere || x.s === 'libera' || o.ville.includes(x.v.id));
      visibili = list.map(x => x.v.id);
      const nSel = visibili.filter(id => o.ville.includes(id)).length, all = $('#off-all');
      all.checked = !!visibili.length && nSel === visibili.length; all.indeterminate = nSel > 0 && nSel < visibili.length; all.disabled = !visibili.length;
      $('#off-list').innerHTML = list.length ? list.map(({ v, s, p, pr }) => {
        const on = o.ville.includes(v.id);
        return `<div class="off-item${on ? ' on' : ''}${s !== 'libera' ? ' busy' : ''}" data-v="${esc(v.id)}">
          <label class="off-pick"><input type="checkbox" data-pick="${esc(v.id)}" ${on ? 'checked' : ''} ${s === 'nd' ? 'disabled' : ''}>
            <span><b>${esc(v.name)}</b><small>${esc(v.location || '')}${p ? ' · ' + S.dm(p.from) + ' → ' + S.dm(p.to) : ''}</small></span></label>
          <span class="off-st st-${s}">${s === 'libera' ? 'Libera' : s === 'occupata' ? 'Occupata' : 'ND'}</span>
          <span class="off-list-pr">${typeof pr === 'number' ? S.money(pr) : pr === 'ND' ? 'ND' : 'Senza listino'}</span>
          ${on ? `<label class="off-price"><span>Prezzo in offerta €</span><input data-price="${esc(v.id)}" inputmode="numeric" value="${esc(o.prezzi[v.id] !== undefined ? o.prezzi[v.id] : typeof pr === 'number' ? String(pr) : '')}" placeholder="su richiesta"></label>
            <label class="off-price off-nota"><span>Nota</span><input data-nota="${esc(v.id)}" value="${esc(o.note[v.id] || '')}" placeholder="es. In trattativa di vendita"></label>` : ''}
        </div>`; }).join('') : '<p class="note">Nessuna villa per questi filtri.</p>';
      $('#off-count').textContent = o.ville.length ? `· ${o.ville.length} ${o.ville.length === 1 ? 'scelta' : 'scelte'}` : '';
      updBro();
    };
    // voci "Le tariffe includono": di norma quelle spuntate in Impostazioni; in questa offerta si spuntano e tolgono a mano
    const incSel = () => Array.isArray(o.incSel) ? o.incSel : S.inclusioniDi(st).filter(x => x.on !== false).map(x => x.id);
    const incTesti = () => { const sel = incSel(); return S.inclusioniDi(st).filter(x => sel.includes(x.id)).map(x => (o.lingua === 'en' ? x.en : x.it) || x.it || x.en)
      .concat(String(o.incExtra || '').split('\n').map(t => t.trim()).filter(Boolean)); };
    const drawTexts = () => {
      if (!o.introMod) o.intro = L().intro(o.cliente.trim(), periodoTxt());
      if (!o.chiusaMod) o.chiusa = L().chiusaMail;
      $('#off-intro').value = o.intro; $('#off-chiusa').value = o.chiusa;
      const sel = incSel();
      $('#off-incl').innerHTML = S.inclusioniDi(st).map(x => `<label class="off-inc"><input type="checkbox" data-inc="${esc(x.id)}" ${sel.includes(x.id) ? 'checked' : ''}><span>${esc((o.lingua === 'en' ? x.en : x.it) || x.it || x.en)}</span></label>`).join('');
      updBro();
    };
    // brochure PDF delle ville scelte: quella nella lingua dell'offerta, altrimenti un'altra
    const broCache = {};
    const broDi = id => (broCache[id] = broCache[id] || store.listBrochure(id).catch(() => []));
    const broScelta = l => l.find(b => b.lingua === o.lingua) || l.find(b => !b.lingua) || l[0] || null;
    let broTok = 0;
    function updBro() { setTimeout(updBro0, 0); }
    function updBro0() {
      const info = document.getElementById('off-bro-info'); if (!info || !store.listBrochure) return;
      if (!o.brochure) { info.textContent = "Scarica i PDF delle ville scelte, nella lingua dell'offerta, da trascinare nella mail."; return; }
      if (!o.ville.length) { info.textContent = 'Scegli le ville.'; return; }
      const tok = ++broTok; const vv = scelte();
      Promise.all(vv.map(v => broDi(v.id))).then(ls => {
        if (tok !== broTok) return;
        const manca = vv.filter((v, i) => !broScelta(ls[i])).map(v => v.name);
        const altra = vv.filter((v, i) => { const b = broScelta(ls[i]); return b && b.lingua && b.lingua !== o.lingua; }).map(v => v.name);
        info.innerHTML = `Brochure trovate: <strong>${vv.length - manca.length} di ${vv.length}</strong>${manca.length ? ` · mancano: ${esc(manca.join(', '))}` : ''}${altra.length ? ` · in un'altra lingua: ${esc(altra.join(', '))}` : ''}`;
      });
    }
    async function scaricaBro() {
      const vv = scelte(); let n = 0;
      for (const v of vv) {
        const b = broScelta(await broDi(v.id)); if (!b) continue;
        msg(`<p class="note">Scarico la brochure di ${esc(v.name)}…</p>`);
        try { window.SDBExport.scarica(b.nome, await store.getBrochure(b)); n++; await new Promise(r => setTimeout(r, 600)); } catch (_) {}
      }
      return n;
    }
    drawPer(); drawList(); drawTexts();

    $('#off-tar').addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (!b) return; o.tariff = b.dataset.t; o.idx = 0; o.prezzi = {}; $$('#off-tar button').forEach(x => x.classList.toggle('on', x === b)); drawPer(); drawList(); drawTexts(); save(); });
    $('#off-cal').addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) setIdx(Number(b.dataset.i)); });
    $('#off-prev').addEventListener('click', () => setIdx(o.idx - 1));
    $('#off-next').addEventListener('click', () => setIdx(o.idx + 1));
    // seleziona / deseleziona tutte le ville dell'elenco (con i filtri di ricerca e "solo libere")
    $('#off-all').addEventListener('change', e => {
      if (e.target.checked) visibili.forEach(id => { if (!o.ville.includes(id)) o.ville.push(id); });
      else o.ville = o.ville.filter(id => !visibili.includes(id));
      drawList(); drawTexts(); save();
    });
    $('#off-q').addEventListener('input', e => { o.q = e.target.value; drawList(); save(); });
    $('#off-free').addEventListener('change', e => { o.soloLibere = e.target.checked; drawList(); save(); });
    $('#off-list').addEventListener('change', e => {
      const cb = e.target.closest('[data-pick]'); if (cb) { const id = cb.dataset.pick; o.ville = o.ville.filter(x => x !== id); if (cb.checked) o.ville.push(id); drawList(); drawTexts(); save(); }
    });
    $('#off-list').addEventListener('input', e => { const i = e.target.closest('[data-price]'); if (i) { o.prezzi[i.dataset.price] = i.value; save(); } const n = e.target.closest('[data-nota]'); if (n) { o.note[n.dataset.nota] = n.value; save(); } });
    $('#off-incl').addEventListener('change', e => { const c = e.target.closest('[data-inc]'); if (!c) return; const sel = incSel().filter(x => x !== c.dataset.inc); if (c.checked) sel.push(c.dataset.inc); o.incSel = sel; save(); });
    $('#off-incx').addEventListener('input', e => { o.incExtra = e.target.value; save(); });
    $('#off-firma').addEventListener('input', e => { o.firma = e.target.value; save(); });
    $('#off-cli').addEventListener('input', e => { o.cliente = e.target.value; drawTexts(); save(); });
    $('#off-mail').addEventListener('input', e => { o.email = e.target.value.trim(); save(); });
    $('#off-lang').addEventListener('click', e => { const b = e.target.closest('[data-l]'); if (!b) return; o.lingua = b.dataset.l; o.introMod = false; o.chiusaMod = false; $$('#off-lang button').forEach(x => x.classList.toggle('on', x === b)); drawTexts(); save(); });
    $('#off-nf').addEventListener('change', e => { o.nFoto = Number(e.target.value); save(); });
    $('#off-intro').addEventListener('input', e => { o.intro = e.target.value; o.introMod = true; save(); });
    $('#off-chiusa').addEventListener('input', e => { o.chiusa = e.target.value; o.chiusaMod = true; save(); });

    /* ---------- contenuto dell'offerta ---------- */
    const scelte = () => ville().filter(v => o.ville.includes(v.id));
    const vis = (v, k) => !hiddenField(k) && v[k] !== undefined && v[k] !== null && String(v[k]).trim() !== '';
    function infoVilla(v) {
      const l = L(); const r = [];
      if (vis(v, 'location')) r.push([l.localita, v.location]);
      if (vis(v, 'seafront')) r.push([l.mare, v.seafront]);
      const osp = vis(v, 'guests') ? v.guests : vis(v, 'pax') ? v.pax : null; if (osp) r.push([l.ospiti, osp]);
      const cam = vis(v, 'guestBedrooms') ? v.guestBedrooms : vis(v, 'totalBedrooms') ? v.totalBedrooms : null; if (cam) r.push([l.camere, cam]);
      if (vis(v, 'bathrooms')) r.push([l.bagni, v.bathrooms]);
      if (vis(v, 'indoorSqm')) r.push([l.interni, v.indoorSqm + ' m²']);
      if (vis(v, 'outdoorSqm')) r.push([l.esterni, v.outdoorSqm + ' m²']);
      [['pool', l.piscina], ['spa', l.spa], ['gym', l.palestra]].forEach(([k, lab]) => { if (vis(v, k)) r.push([lab, v[k]]); });
      return r;
    }
    // foto ridimensionate (larghezza massima) per non appesantire Word e mail
    const resize = (src, max, q) => new Promise(res => { const im = new Image(); im.onload = () => { const k = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight)); const c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); res({ url: c.toDataURL('image/jpeg', q), w: c.width, h: c.height }); }; im.onerror = () => res(null); im.src = src; });
    async function fotoDi(v, max, q) {
      let l = []; try { l = await store.listFoto(v.id); } catch (_) { l = []; }
      const cov = ctx.coverOf ? ctx.coverOf(v.id) : null;
      l.sort((a, b) => (a.id === cov ? -1 : b.id === cov ? 1 : 0));
      const out = []; for (const f of l.slice(0, Number(o.nFoto) || 3)) { const r = await resize(f.img, max, q); if (r) out.push(r); }
      return out;
    }
    const pronto = () => { if (!o.ville.length) { $('#off-msg').innerHTML = '<div class="warn err">Scegli almeno una villa.</div>'; return false; } return true; };
    const msg = h => { $('#off-msg').innerHTML = h; };
    const nomeFile = () => X.nomeFile(`${L().titolo} ${o.cliente || ''} ${periodoTxt()}`);

    $('#off-word').addEventListener('click', async () => {
      if (!pronto()) return; const btn = $('#off-word'); btn.disabled = true;
      try {
        const l = L(); const B = [];
        try { const r = await fetch('icons/logo-240.png'); const bytes = new Uint8Array(await r.arrayBuffer()); B.push({ logo: { bytes, ext: 'png', w: 240, h: 240, width: 1500 } }); } catch (_) {}
        B.push({ p: l.titolo.toUpperCase(), center: true, bold: true, color: 'B29362', after: 40 }, { p: periodoTxt(), center: true, big: true, color: '142861', after: 240 });
        o.intro.split('\n').forEach(t => B.push({ p: t }));
        const sel = scelte();
        for (let i = 0; i < sel.length; i++) {
          const v = sel[i]; msg(`<p class="note">Preparo ${esc(v.name)} (${i + 1} di ${sel.length})…</p>`);
          const fs = await fotoDi(v, 1400, 0.8);
          B.push({ pageBreak: true }, { h1: v.name });
          const p = perOf(v); if (p) B.push({ p: rangeTxt(p, o.lingua), small: true });
          // copertina grande, poi le altre foto tre per riga: così ogni villa sta in una pagina
          if (fs[0]) B.push({ img: { bytes: X.dataUrlBytes(fs[0].url).bytes, w: fs[0].w, h: fs[0].h, width: 7800 } });
          const rest = fs.slice(1); for (let k = 0; k < rest.length; k += 3) { const row = rest.slice(k, k + 3).map(f => ({ bytes: X.dataUrlBytes(f.url).bytes, w: f.w, h: f.h })); while (row.length < 3) row.push(null); B.push({ imgs: row }); }
          const info = infoVilla(v); if (info.length) B.push({ kv: info });
          if (vis(v, 'descrizione')) B.push({ p: String(v.descrizione) });
          if (vis(v, 'servizi')) B.push({ h2: l.servizi }, { p: String(v.servizi) });
          if (vis(v, 'linkSito')) B.push({ p: `${l.sito}: ${v.linkSito}`, small: true });
          const pr = prezzoDi(v); B.push({ price: [l.prezzo, pr === null ? l.richiesta : euro(pr)] });
          if ((o.note[v.id] || '').trim()) B.push({ p: o.note[v.id].trim(), small: true });
        }
        B.push({ pageBreak: true }); o.chiusa.split('\n').forEach(t => B.push({ p: t }));
        B.push({ p: l.soggetta, bold: true }, { p: l.saluti, after: 0 }); (o.firma || FIRMA).split('\n').forEach((t, k) => B.push({ p: t, bold: k === 0, after: 0 }));
        X.scarica(nomeFile() + '.docx', new Blob([X.docx(B)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
        msg(`<div class="warn ok">Documento Word scaricato: ${sel.length} ${sel.length === 1 ? 'villa' : 'ville'}.</div>`);
      } catch (x) { msg(`<div class="warn err">Non riuscito: ${esc(x.message || x)}</div>`); }
      btn.disabled = false;
    });

    // mail: HTML con stili in linea e foto incorporate, copiato negli appunti per incollarlo in Gmail
    async function htmlMail() {
      const l = L();
      const P = (x, st) => `<p style="margin:0${st ? ';' + st : ''}">${x}</p>`, BR = '<p style="margin:0"><br></p>';
      const eur = n => new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0 }).format(n) + ' €';
      const tar = (S.TARIFFE.find(t => t.key === o.tariff) || {}).label || '';
      const tarEn = { settimanale: 'Weekly', bisettimanale: 'BiWeekly', mensile: 'Monthly', bimensile: 'Two-month' }[o.tariff] || tar;
      const base = baseP()[o.idx];
      const link = (u, t) => `<a href="${esc(u)}" target="_blank">${t}</a>`;
      let h = `<div style="font-family:tahoma,sans-serif;color:#000000;font-size:14px">`;
      h += o.intro.split('\n').map(t => P(esc(t) || '<br>')).join('') + BR;
      h += P(`<b><u>${esc(l.proposte)}</u></b>`) + BR;
      const mese = base ? new Date(S.parse(base.from)).toLocaleDateString(o.lingua === 'en' ? 'en-GB' : 'it-IT', { month: 'long', timeZone: 'UTC' }) : '';
      // come nell'esempio: dalla villa più cara, quelle su richiesta in fondo
      const ord = scelte().map(v => ({ v, pr: prezzoDi(v) })).sort((a, b) => (b.pr === null ? -1 : b.pr) - (a.pr === null ? -1 : a.pr));
      for (const { v } of ord) {
        const p = perOf(v); const pr = prezzoDi(v); const nota = (o.note[v.id] || '').trim();
        const nome = esc(v.name.replace(/^villa\s+/i, '').replace(/\b\w+/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase()));
        const titolo = `Villa ${nome}`;
        h += P(`<b>${vis(v, 'linkSito') ? link(v.linkSito, titolo) : titolo}${vis(v, 'codice') ? ' ' + esc(v.codice) : ''}</b>`);
        const vid = vis(v, 'vimeo') ? v.vimeo : vis(v, 'youtube') ? v.youtube : '';
        if (vid) h += P(`${esc(l.video)} ${link(vid, esc(l.qui))}${vis(v, 'psw') ? ' (psw: ' + esc(v.psw) + ')' : ''}`);
        const diverso = p && base && (p.from !== base.from || p.to !== base.to);
        const lab = (o.lingua === 'en' ? `${mese ? mese[0].toUpperCase() + mese.slice(1) + ' ' : ''}${tarEn} ${l.tariffa}` : `${l.tariffa} ${tar.toLowerCase()}${mese ? ' ' + mese : ''}`) + (diverso ? ' ' + rangeTxt(p, o.lingua) : '');
        h += P(`<b>${esc(lab)}:</b> ${pr === null ? esc(l.richiesta) : eur(pr)}${nota ? ' - ' + esc(nota) + ' -' : ''}`) + BR;
      }
      const inc = incTesti();
      if (inc.length) h += P(`<b><u>${esc(l.inclusiTit)}</u></b>`) + `<ul style="margin:6px 0 12px">${inc.map(t => `<li>${esc(t)}</li>`).join('')}</ul>`;
      h += o.chiusa.split('\n').filter(t => t.trim()).map(t => P(esc(t))).join('');
      h += P(`<b><i>${esc(l.soggetta)}</i></b>`);
      h += P(esc(l.saluti) + ',', 'margin-top:8px') + (o.firma || FIRMA).split('\n').map((t, k) => P(k === 0 ? `<b>${esc(t)}</b>` : esc(t))).join('');
      return h + '</div>';
    }
    $('#off-copy').addEventListener('click', async () => {
      if (!pronto()) return; const btn = $('#off-copy'); btn.disabled = true;
      try {
        const html = await htmlMail();
        const txt = (() => { const d = document.createElement('div'); d.innerHTML = html; return d.innerText; })();
        let ok = false;
        try { if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) { await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([txt], { type: 'text/plain' }) })]); ok = true; } } catch (_) {}
        if (!ok) {
          // ripiego: seleziono l'anteprima e uso il comando Copia del browser
          const box = document.createElement('div'); box.innerHTML = html; box.style.cssText = 'position:fixed;left:-9999px;top:0;width:640px'; box.contentEditable = 'true'; document.body.appendChild(box);
          const r = document.createRange(); r.selectNodeContents(box); const s = getSelection(); s.removeAllRanges(); s.addRange(r); ok = document.execCommand('copy'); s.removeAllRanges(); box.remove();
        }
        const nb = ok && o.brochure && store.listBrochure ? await scaricaBro() : 0;
        msg(ok ? `<div class="warn ok">Offerta copiata. Ora premi <b>Apri Gmail</b> e incolla nel testo del messaggio.${nb ? ` Poi trascina nella mail ${nb === 1 ? 'la brochure scaricata' : `le ${nb} brochure scaricate`} (cartella Download).` : ''}</div>` : '<div class="warn err">Il browser non ha permesso di copiare: usa Scarica Word e allega il documento.</div>');
      } catch (x) { msg(`<div class="warn err">Non riuscito: ${esc(x.message || x)}</div>`); }
      btn.disabled = false;
    });
    if ($('#off-bro')) $('#off-bro').addEventListener('change', e => { o.brochure = e.target.checked; $('#off-bro-dl').hidden = !o.brochure; save(); updBro(); });
    $('#off-bro-dl').addEventListener('click', async () => {
      if (!pronto()) return; const btn = $('#off-bro-dl'); btn.disabled = true;
      const n = await scaricaBro();
      msg(n ? `<div class="warn ok">${n} ${n === 1 ? 'brochure scaricata' : 'brochure scaricate'}: trascinale dalla cartella Download nella mail.</div>` : '<div class="warn err">Nessuna brochure per le ville scelte: caricale nella scheda di ogni villa.</div>');
      btn.disabled = false;
    });
    $('#off-gmail').addEventListener('click', () => {
      const u = `https://mail.google.com/mail/?view=cm&fs=1${o.email ? '&to=' + encodeURIComponent(o.email) : ''}&su=${encodeURIComponent(L().oggetto(periodoTxt()))}`;
      window.open(u, '_blank', 'noopener');
    });
  }

  window.SDBOfferte = { mount };
})();
