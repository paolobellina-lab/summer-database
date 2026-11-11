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
      intro: (c, p) => `${c ? 'Gentile ' + c + ',' : 'Gentile cliente,'}\ncome richiesto, le proponiamo la nostra selezione di ville per il periodo ${p}.`,
      chiusa: 'I prezzi si intendono per l\'intero periodo indicato. Restiamo a disposizione per qualsiasi informazione o per organizzare una visita.',
      oggetto: p => `Proposta ville · ${p}`
    },
    en: {
      titolo: 'Villa proposal', per: 'Dates', ospiti: 'Guests', camere: 'Bedrooms', bagni: 'Bathrooms', interni: 'Indoor', esterni: 'Outdoor',
      piscina: 'Pool', spa: 'Spa', palestra: 'Gym', mare: 'Position', localita: 'Location', servizi: 'Included services', sito: 'Discover more',
      prezzo: 'Price for the period', richiesta: 'On request', dal: 'from', al: 'to', saluti: 'Kind regards',
      intro: (c, p) => `${c ? 'Dear ' + c + ',' : 'Dear guest,'}\nas requested, please find below our selection of villas for the period ${p}.`,
      chiusa: 'Prices refer to the whole period indicated. We remain at your disposal for any further information.',
      oggetto: p => `Villa proposal · ${p}`
    }
  };
  const FIRMA = 'Esmeralda Luxury Villas';

  function mount(main, ctx) {
    const { ui, saveUI, esc, data, store, $, $$, toast, S, settings, blocks, hiddenField } = ctx;
    const X = window.SDBExport;
    const o = ui.off = Object.assign({ tariff: 'settimanale', idx: 0, ville: [], prezzi: {}, cliente: '', email: '', lingua: 'it', nFoto: 3, soloLibere: true, q: '', intro: '', chiusa: '', introMod: false, chiusaMod: false }, ui.off || {});
    const L = () => T[o.lingua] || T.it;
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
        <div class="off-tools"><input type="search" id="off-q" placeholder="Cerca villa o località" value="${esc(o.q)}">
          <label class="flag off-free"><input type="checkbox" id="off-free" ${o.soloLibere ? 'checked' : ''}><span><b>Solo ville libere</b></span></label></div>
        <div id="off-list" class="off-list"></div>
      </section>
      <section class="card"><h2>3 · Offerta</h2>
        <div class="row off-row">
          <label class="field"><span>Cliente</span><input id="off-cli" value="${esc(o.cliente)}" placeholder="es. Mr Smith"></label>
          <label class="field"><span>Email del cliente</span><input id="off-mail" type="email" value="${esc(o.email)}" placeholder="facoltativa"></label>
          <div class="field"><span>Lingua</span><div class="seg" id="off-lang"><button type="button" data-l="it" class="${o.lingua === 'it' ? 'on' : ''}">Italiano</button><button type="button" data-l="en" class="${o.lingua === 'en' ? 'on' : ''}">English</button></div></div>
          <label class="field"><span>Foto per villa</span><select id="off-nf">${[1, 3, 5, 8].map(n => `<option value="${n}" ${Number(o.nFoto) === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        </div>
        <label class="field"><span>Testo iniziale</span><textarea id="off-intro" rows="3"></textarea></label>
        <label class="field"><span>Testo finale</span><textarea id="off-chiusa" rows="2"></textarea></label>
        <div class="off-actions">
          <button type="button" class="btn primary" id="off-word">Scarica Word</button>
          <button type="button" class="btn" id="off-copy">Copia per email</button>
          <button type="button" class="btn" id="off-gmail">Apri Gmail</button>
        </div>
        <p class="note">Per la mail: premi <b>Copia per email</b>, poi <b>Apri Gmail</b> e incolla nel testo del messaggio (Ctrl+V, o ⌘V sul Mac). Testo e foto entrano insieme.</p>
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
    const drawList = () => {
      const q = (o.q || '').trim().toLowerCase();
      const list = ville().filter(v => !q || `${v.name} ${v.location || ''}`.toLowerCase().includes(q)).map(v => ({ v, s: stato(v), p: perOf(v), pr: listinoOf(v) }))
        .filter(x => !o.soloLibere || x.s === 'libera' || o.ville.includes(x.v.id));
      $('#off-list').innerHTML = list.length ? list.map(({ v, s, p, pr }) => {
        const on = o.ville.includes(v.id);
        return `<div class="off-item${on ? ' on' : ''}${s !== 'libera' ? ' busy' : ''}" data-v="${esc(v.id)}">
          <label class="off-pick"><input type="checkbox" data-pick="${esc(v.id)}" ${on ? 'checked' : ''} ${s === 'nd' ? 'disabled' : ''}>
            <span><b>${esc(v.name)}</b><small>${esc(v.location || '')}${p ? ' · ' + S.dm(p.from) + ' → ' + S.dm(p.to) : ''}</small></span></label>
          <span class="off-st st-${s}">${s === 'libera' ? 'Libera' : s === 'occupata' ? 'Occupata' : 'ND'}</span>
          <span class="off-list-pr">${typeof pr === 'number' ? S.money(pr) : pr === 'ND' ? 'ND' : 'Senza listino'}</span>
          ${on ? `<label class="off-price"><span>Prezzo in offerta €</span><input data-price="${esc(v.id)}" inputmode="numeric" value="${esc(o.prezzi[v.id] !== undefined ? o.prezzi[v.id] : typeof pr === 'number' ? String(pr) : '')}" placeholder="su richiesta"></label>` : ''}
        </div>`; }).join('') : '<p class="note">Nessuna villa per questi filtri.</p>';
      $('#off-count').textContent = o.ville.length ? `· ${o.ville.length} ${o.ville.length === 1 ? 'scelta' : 'scelte'}` : '';
    };
    const drawTexts = () => {
      if (!o.introMod) o.intro = L().intro(o.cliente.trim(), periodoTxt());
      if (!o.chiusaMod) o.chiusa = L().chiusa;
      $('#off-intro').value = o.intro; $('#off-chiusa').value = o.chiusa;
    };
    drawPer(); drawList(); drawTexts();

    $('#off-tar').addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (!b) return; o.tariff = b.dataset.t; o.idx = 0; o.prezzi = {}; $$('#off-tar button').forEach(x => x.classList.toggle('on', x === b)); drawPer(); drawList(); drawTexts(); save(); });
    $('#off-cal').addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) setIdx(Number(b.dataset.i)); });
    $('#off-prev').addEventListener('click', () => setIdx(o.idx - 1));
    $('#off-next').addEventListener('click', () => setIdx(o.idx + 1));
    $('#off-q').addEventListener('input', e => { o.q = e.target.value; drawList(); save(); });
    $('#off-free').addEventListener('change', e => { o.soloLibere = e.target.checked; drawList(); save(); });
    $('#off-list').addEventListener('change', e => {
      const cb = e.target.closest('[data-pick]'); if (cb) { const id = cb.dataset.pick; o.ville = o.ville.filter(x => x !== id); if (cb.checked) o.ville.push(id); drawList(); drawTexts(); save(); }
    });
    $('#off-list').addEventListener('input', e => { const i = e.target.closest('[data-price]'); if (i) { o.prezzi[i.dataset.price] = i.value; save(); } });
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
        }
        B.push({ pageBreak: true }); o.chiusa.split('\n').forEach(t => B.push({ p: t }));
        B.push({ p: l.saluti, after: 0 }, { p: FIRMA, bold: true });
        X.scarica(nomeFile() + '.docx', new Blob([X.docx(B)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
        msg(`<div class="warn ok">Documento Word scaricato: ${sel.length} ${sel.length === 1 ? 'villa' : 'ville'}.</div>`);
      } catch (x) { msg(`<div class="warn err">Non riuscito: ${esc(x.message || x)}</div>`); }
      btn.disabled = false;
    });

    // mail: HTML con stili in linea e foto incorporate, copiato negli appunti per incollarlo in Gmail
    async function htmlMail() {
      const l = L(); const navy = '#142861', gold = '#b29362';
      let h = `<div style="font-family:Arial,Helvetica,sans-serif;color:#1f2430;max-width:640px">`;
      h += `<p style="margin:0 0 4px;color:${gold};letter-spacing:2px;font-size:12px;font-weight:bold">${esc(l.titolo.toUpperCase())}</p><p style="margin:0 0 16px;color:${navy};font-size:18px">${esc(periodoTxt())}</p>`;
      h += o.intro.split('\n').map(t => `<p style="margin:0 0 8px">${esc(t)}</p>`).join('');
      const sel = scelte();
      for (let i = 0; i < sel.length; i++) {
        const v = sel[i]; msg(`<p class="note">Preparo ${esc(v.name)} (${i + 1} di ${sel.length})…</p>`);
        const fs = await fotoDi(v, 900, 0.72); const p = perOf(v); const pr = prezzoDi(v);
        h += `<hr style="border:0;border-top:1px solid #e3d9c6;margin:22px 0">`;
        h += `<h2 style="margin:0 0 2px;color:${navy};font-size:20px">${esc(v.name)}</h2>${p ? `<p style="margin:0 0 10px;color:#6b6b6b;font-size:13px">${esc(rangeTxt(p, o.lingua))}</p>` : ''}`;
        if (fs[0]) h += `<img src="${fs[0].url}" alt="${esc(v.name)}" width="600" style="width:100%;max-width:600px;height:auto;display:block;margin:0 0 6px">`;
        if (fs.length > 1) h += `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:600px"><tr>${fs.slice(1, 5).map(f => `<td style="padding:0 6px 6px 0;vertical-align:top"><img src="${f.url}" alt="" width="${Math.floor(600 / Math.min(4, fs.length - 1)) - 6}" style="width:100%;height:auto;display:block"></td>`).join('')}</tr></table>`;
        const info = infoVilla(v);
        if (info.length) h += `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:8px 0;font-size:14px">${info.map(([k, x]) => `<tr><td style="padding:3px 18px 3px 0;color:#6b6b6b">${esc(k)}</td><td style="padding:3px 0">${esc(x)}</td></tr>`).join('')}</table>`;
        if (vis(v, 'descrizione')) h += `<p style="margin:8px 0;font-size:14px;line-height:1.5">${esc(v.descrizione).replace(/\n/g, '<br>')}</p>`;
        if (vis(v, 'servizi')) h += `<p style="margin:8px 0 4px;color:${gold};font-size:12px;font-weight:bold;letter-spacing:1px">${esc(l.servizi.toUpperCase())}</p><p style="margin:0 0 8px;font-size:14px">${esc(v.servizi).replace(/\n/g, '<br>')}</p>`;
        h += `<p style="margin:10px 0 0;padding:10px 12px;background:#fbf8f2;border-top:2px solid ${gold};border-bottom:2px solid ${gold};color:${navy};font-size:15px"><b>${esc(l.prezzo)}: ${esc(pr === null ? l.richiesta : euro(pr))}</b></p>`;
        if (vis(v, 'linkSito')) h += `<p style="margin:6px 0 0;font-size:13px"><a href="${esc(v.linkSito)}" style="color:${navy}">${esc(l.sito)}</a></p>`;
      }
      h += `<hr style="border:0;border-top:1px solid #e3d9c6;margin:22px 0">` + o.chiusa.split('\n').map(t => `<p style="margin:0 0 8px">${esc(t)}</p>`).join('') + `<p style="margin:12px 0 0">${esc(l.saluti)}<br><b>${FIRMA}</b></p></div>`;
      return h;
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
        msg(ok ? '<div class="warn ok">Offerta copiata. Ora premi <b>Apri Gmail</b> e incolla nel testo del messaggio.</div>' : '<div class="warn err">Il browser non ha permesso di copiare: usa Scarica Word e allega il documento.</div>');
      } catch (x) { msg(`<div class="warn err">Non riuscito: ${esc(x.message || x)}</div>`); }
      btn.disabled = false;
    });
    $('#off-gmail').addEventListener('click', () => {
      const u = `https://mail.google.com/mail/?view=cm&fs=1${o.email ? '&to=' + encodeURIComponent(o.email) : ''}&su=${encodeURIComponent(L().oggetto(periodoTxt()))}`;
      window.open(u, '_blank', 'noopener');
    });
  }

  window.SDBOfferte = { mount };
})();
