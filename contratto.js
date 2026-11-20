/* Contratto (Booking Form) della prenotazione — window.SDBContratto
 *  - modello Word caricato in Impostazioni → Contratto (contratti_modelli/{en|it}), predefiniti e dati bancari (contratti_modelli/cfg)
 *  - finestra del contratto dal Riepilogo della prenotazione: campi compilati dalla prenotazione e dalla villa, tutti modificabili
 *  - "Genera" riempie le caselle del modello (stessa grafica) e scarica il Word; salva in contratti/{bookingId} solo i DATI
 *    (anagrafica, passaporto, IBAN per il deposito, carta solo mascherata 6 + 4 cifre; il codice di sicurezza mai)
 *  Solo amministratori (regole Firestore). */
(function () {
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const enc = new TextEncoder(), dec = new TextDecoder();

  /* ---------- zip: lettura (deflate con DecompressionStream) ---------- */
  async function inflate(bytes) {
    const ds = new DecompressionStream('deflate-raw');
    const out = new Response(new Blob([bytes]).stream().pipeThrough(ds));
    return new Uint8Array(await out.arrayBuffer());
  }
  async function unzip(buf) {
    const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf); const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    let e = -1; for (let i = b.length - 22; i >= Math.max(0, b.length - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
    if (e < 0) throw new Error('il file non è un Word (.docx) valido');
    const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true); const out = [];
    for (let k = 0; k < n; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('archivio danneggiato');
      const met = dv.getUint16(p + 10, true), cs = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
      const name = dec.decode(b.subarray(p + 46, p + 46 + nl)); p += 46 + nl + xl + cl;
      const ds = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true); const raw = b.subarray(ds, ds + cs);
      if (name.endsWith('/')) continue;
      out.push({ name, data: met === 0 ? raw.slice() : met === 8 ? await inflate(raw) : (() => { throw new Error('compressione non supportata'); })() });
    }
    return out;
  }

  /* ---------- compilazione del document.xml ---------- */
  const kids = (el, tag) => Array.from(el.childNodes).filter(c => c.nodeType === 1 && c.namespaceURI === W && c.localName === tag);
  const all = (el, tag) => Array.from(el.getElementsByTagNameNS(W, tag));
  const testo = el => all(el, 't').map(t => t.textContent).join('');
  const norm = s => String(s || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim().toLowerCase().replace(/[\s:]+$/, '');
  function runCon(doc, rPr, s, noBold) {
    const r = doc.createElementNS(W, 'w:r');
    if (rPr) { const c = rPr.cloneNode(true); if (c.localName !== 'rPr') { /* pPr/rPr */ } if (noBold) ['b', 'bCs'].forEach(t => kids(c, t).forEach(x => c.removeChild(x))); r.appendChild(c); }
    String(s).split('\n').forEach((l, i) => { if (i) r.appendChild(doc.createElementNS(W, 'w:br')); const t = doc.createElementNS(W, 'w:t'); t.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve'); t.textContent = l; r.appendChild(t); });
    return r;
  }
  const rPrDi = p => { const r = all(p, 'r')[0]; const a = r && kids(r, 'rPr')[0]; if (a) return a; const pp = kids(p, 'pPr')[0]; const b = pp && kids(pp, 'rPr')[0]; if (!b) return null; const c = p.ownerDocument.createElementNS(W, 'w:rPr'); Array.from(b.childNodes).forEach(x => c.appendChild(x.cloneNode(true))); return c; };
  function scriviP(p, s) {
    const rPr = rPrDi(p); Array.from(p.childNodes).forEach(c => { if (!(c.nodeType === 1 && c.localName === 'pPr')) p.removeChild(c); });
    if (s !== '') p.appendChild(runCon(p.ownerDocument, rPr, s, true));
  }
  function scriviCella(tc, s) {
    const ps = kids(tc, 'p'); let p = ps[0]; if (!p) { p = tc.ownerDocument.createElementNS(W, 'w:p'); tc.appendChild(p); }
    ps.slice(1).forEach(x => tc.removeChild(x)); scriviP(p, s);
  }
  function aggiungi(p, s) { const rs = all(p, 'r'); const rPr = rs.length ? kids(rs[0], 'rPr')[0] : null; const r = runCon(p.ownerDocument, rPr, ' ' + s, true); kids(r, 'rPr').forEach(x => ['sz', 'szCs'].forEach(t => kids(x, t).forEach(y => x.removeChild(y)))); p.appendChild(r); }

  // etichette del modello (inglese; alcune in italiano per un modello IT) → campo
  const ETICHETTE = {
    'booking reference code': 'codice', 'codice di prenotazione': 'codice', 'property': 'villa', 'proprietà': 'villa', 'villa': 'villa', 'dates': 'date', 'date': 'date',
    'number of nights': 'notti', 'numero di notti': 'notti', 'party leader': 'leader', 'capogruppo': 'leader', 'party size': 'persone', 'numero di ospiti': 'persone',
    'maximum occupancy': 'maxOcc', 'occupazione massima': 'maxOcc', 'check in/out': 'checkio', 'total booking value': 'totaleE',
    'security deposit': 'depositoE', 'deposito di sicurezza': 'depositoE', 'total payable amounts': 'totPagE', 'totale da pagare': 'totPagE',
    'beneficiary': 'bBen', 'beneficiario': 'bBen', 'intermediary bank': 'bInt', 'banca intermediaria': 'bInt', 'for further credit to': 'bPer', 'a favore di': 'bPer', 'euro iban': 'bIban',
    'credit card number': 'cNum', 'numero della carta': 'cNum', 'name of the owner': 'cNome', 'intestatario della carta': 'cNome', 'date of expiration': 'cScad', 'scadenza': 'cScad', 'security code': 'cCvv', 'codice di sicurezza': 'cCvv',
    'name': 'nome', 'nome': 'nome', 'surname': 'cognome', 'cognome': 'cognome', 'street address': 'indirizzo', 'indirizzo': 'indirizzo', 'city': 'citta', 'città': 'citta',
    'postal code': 'cap', 'cap': 'cap', 'country': 'paese', 'paese': 'paese', 'place of birth': 'luogoN', 'luogo di nascita': 'luogoN', 'date of birth': 'dataN', 'data di nascita': 'dataN',
    'identity card n.': 'doc', 'identity card n': 'doc', 'passport n.': 'doc', 'documento n.': 'doc', 'e-mail': 'email', 'email': 'email', 'phone': 'tel', 'telefono': 'tel', 'alternative contact': 'altro', 'altro contatto': 'altro',
    'account holder': 'iInt', 'intestatario del conto': 'iInt', 'address of account holder': 'iInd', 'indirizzo dell\'intestatario': 'iInd', 'bic / swift code': 'iBic', 'iban': 'iIban'
  };
  function compila(xml, f) {
    const doc = new DOMParser().parseFromString(xml, 'application/xml'); if (doc.getElementsByTagName('parsererror').length) throw new Error('modello non leggibile');
    const val = k => f[k] == null ? '' : String(f[k]);
    let bic = 0; const fatti = new Set();
    all(doc, 'tr').forEach((tr, ri, trs) => {
      const tcs = kids(tr, 'tc');
      tcs.forEach((tc, ci) => {
        const ps = kids(tc, 'p').map(testo).filter(s => s.trim()); const full = norm(testo(tc)), last = norm(ps[ps.length - 1] || '');
        if (/^(total booking value of rental|valore totale)/.test(full) && ps.length > 1) { const pp = kids(tc, 'p').filter(p => testo(p).trim()); if (val('totaleE')) scriviP(pp[pp.length - 1], val('totaleE')); return; }
        if (full === 'included in your booking' || full === 'incluso nella prenotazione') { const nx = trs[ri + 1]; const c = nx && kids(nx, 'tc').slice(-1)[0]; if (c && val('inclusi')) scriviCella(c, val('inclusi')); return; }
        if (full === 'first payment' || full === 'primo pagamento' || full === 'balance payment' || full === 'saldo') {
          const a = /first|primo/.test(full); const v = tcs[ci + 1], s = tcs[ci + 2];
          if (v && val(a ? 'accontoE' : 'saldoE')) scriviCella(v, val(a ? 'accontoE' : 'saldoE')); if (s && val(a ? 'accontoScad' : 'saldoScad')) scriviCella(s, val(a ? 'accontoScad' : 'saldoScad')); return;
        }
        let k = ETICHETTE[full] || ETICHETTE[last]; if (!k) return;
        if (fatti.has(k) && !/^(bic\/swift code)$/.test(full || last)) return;
        if (full === 'bic/swift code' || last === 'bic/swift code') k = bic++ ? 'bBic' : 'bBicInt';
        const v = tcs[ci + 1]; if (!v || !val(k) || norm(testo(v)) && ETICHETTE[norm(testo(v))]) return;
        scriviCella(v, val(k)); fatti.add(k);
      });
    });
    // persone del gruppo: righe vuote sotto "Persons in your party"
    const pers = val('persone_l').split('\n').map(s => s.trim()).filter(Boolean);
    const trs = all(doc, 'tr');
    const iP = trs.findIndex(tr => /^(persons in your party|persone del gruppo)/.test(norm(testo(tr))));
    if (iP >= 0 && pers.length) { let j = iP + 1; while (j < trs.length && norm(testo(trs[j]))) j++; pers.forEach(s => { const tr = trs[j]; if (!tr || norm(testo(tr))) return; const c = kids(tr, 'tc')[0]; if (c && kids(tr, 'tc').length === 1) { scriviCella(c, s); j++; } }); }
    const iR = trs.findIndex(tr => /^(personal travel assistance)/.test(norm(testo(tr))));
    if (iR >= 0 && val('richieste')) { const tr = trs[iR + 2]; const c = tr && kids(tr, 'tc')[0]; if (c && !norm(testo(tr))) scriviCella(c, val('richieste')); }
    // paragrafi fuori dalle tabelle: Link / Layout / Location
    all(doc, 'p').forEach(p => { let a = p.parentNode; while (a && a.localName !== 'tc' && a.localName !== 'body') a = a.parentNode; if (a && a.localName === 'tc') return;
      const t = norm(testo(p)); const k = { link: 'link', layout: 'layout', location: 'location', 'località': 'location', 'disposizione': 'layout' }[t]; if (k && val(k)) aggiungi(p, val(k)); });
    return new XMLSerializer().serializeToString(doc);
  }
  async function genera(modello, f) {
    const files = await unzip(modello); const d = files.find(x => x.name === 'word/document.xml'); if (!d) throw new Error('nel file manca il documento Word');
    d.data = enc.encode(compila(dec.decode(d.data), f));
    files.sort((a, b) => (a.name === '[Content_Types].xml' ? -1 : 0) - (b.name === '[Content_Types].xml' ? -1 : 0));
    return new Blob([window.SDBExport.zip(files)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }

  /* ---------- carta: solo prime 6 e ultime 4 cifre ---------- */
  const cifre = s => String(s || '').replace(/\D/g, '');
  function maschera(s) { const d = cifre(s); if (!d) return ''; const m = d.length >= 13 ? d.slice(0, 6) + '#'.repeat(d.length - 10) + d.slice(-4) : '#'.repeat(Math.max(0, d.length - 4)) + d.slice(-4); return m.replace(/(.{4})(?=.)/g, '$1 '); }

  /* ---------- predefiniti ---------- */
  const CFG_DEF = { acconto: 50, saldoSett: 8, codice: 'auto', nome: 'calendario', lingua: 'en', checkio: '', banca: { ben: '', int: '', bicInt: '', per: '', bic: '', iban: '' } };
  const cfgDi = x => { const c = Object.assign({}, CFG_DEF, x || {}); c.banca = Object.assign({}, CFG_DEF.banca, (x || {}).banca || {}); return c; };
  const nomeSito = v => { const u = String(v.linkSito || '').replace(/[?#].*$/, '').replace(/\/+$/, ''); const sl = u.split('/').pop(); if (!sl || /\./.test(sl)) return ''; return decodeURIComponent(sl).replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); };
  const sigla = v => (String(v.codice || '').trim() || String(v.name || 'V').replace(/^villa\s+/i, '').split(/\s+/).map(w => w[0] || '').join('').slice(0, 4)).toUpperCase();
  const euroDi = (n, l) => n == null || n === '' || isNaN(Number(n)) ? '' : '€ ' + Math.round(Number(n)).toLocaleString(l === 'it' ? 'it-IT' : 'en-GB');
  const dataL = (iso, l) => { if (!iso) return ''; const d = new Date(iso + 'T12:00:00'); return d.toLocaleDateString(l === 'it' ? 'it-IT' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); };

  /* ---------- Impostazioni → Contratto ---------- */
  async function mountSettings(box, d) {
    const { store, esc, toast } = d;
    let cfg = cfgDi(await store.getContrCfg().catch(() => null)); const mods = {};
    const leggiMod = async () => { for (const l of ['en', 'it']) mods[l] = await store.getModello(l).catch(() => null); };
    await leggiMod();
    const salva = () => store.setContrCfg(JSON.parse(JSON.stringify(cfg))).then(() => toast('Salvato'), err => toast(err && err.code === 'permission-denied' ? 'Solo un amministratore (regole pubblicate) può salvare' : 'Salvataggio non riuscito'));
    const draw = () => {
      const modRow = l => { const m = mods[l]; return `<tr><td><b>${l === 'en' ? 'Inglese' : 'Italiano'}</b></td><td>${m ? `${esc(m.nome)} <small class="note">${Math.round(m.size / 1024)} KB${m.caricatoIl ? ' · ' + esc(String(m.caricatoIl).slice(0, 10).split('-').reverse().join('/')) : ''}</small>` : '<span class="note">non caricato</span>'}</td>
        <td class="r"><label class="btn small">${m ? 'Sostituisci' : 'Carica'}<input type="file" accept=".docx" data-cm="${l}" hidden></label>${m ? ` <button type="button" class="btn small" data-cd="${l}">Scarica</button> <button type="button" class="btn small" data-cx="${l}">Togli</button>` : ''}</td></tr>`; };
      const b = cfg.banca; const inp = (k, l, v, ph) => `<label class="field"><span>${l}</span><input data-cb="${k}" value="${esc(v || '')}" placeholder="${esc(ph || '')}"></label>`;
      box.innerHTML = `<section class="card"><h2>Modello del contratto</h2>
        <p class="note">Il Booking Form in Word (.docx). Il contratto si genera da questo file: stessa grafica, con le caselle riempite. Si salva su Firebase, visibile solo agli amministratori. Quando cambia il modello, carica quello nuovo.</p>
        <div class="tbl-wrap"><table class="prices"><thead><tr><th>Lingua</th><th>File</th><th></th></tr></thead><tbody>${modRow('en')}${modRow('it')}</tbody></table></div></section>
        <section class="card"><h2>Valori predefiniti</h2><p class="note">Si cambiano anche nel singolo contratto.</p>
        <div class="ct-grid">
          <label class="field"><span>Acconto %</span><input data-cc="acconto" inputmode="decimal" value="${esc(String(cfg.acconto))}"></label>
          <label class="field"><span>Saldo: settimane prima dell'arrivo</span><input data-cc="saldoSett" inputmode="numeric" value="${esc(String(cfg.saldoSett))}"></label>
          <label class="field"><span>Codice di riferimento</span><select data-cc="codice"><option value="auto"${cfg.codice === 'auto' ? ' selected' : ''}>Automatico (codice villa-anno-numero)</option><option value="mano"${cfg.codice === 'mano' ? ' selected' : ''}>Scritto a mano</option></select></label>
          <label class="field"><span>Nome della villa</span><select data-cc="nome"><option value="calendario"${cfg.nome === 'calendario' ? ' selected' : ''}>Quello del calendario</option><option value="sito"${cfg.nome === 'sito' ? ' selected' : ''}>Quello del sito (dal link)</option></select></label>
          <label class="field"><span>Lingua</span><select data-cc="lingua"><option value="en"${cfg.lingua === 'en' ? ' selected' : ''}>Inglese</option><option value="it"${cfg.lingua === 'it' ? ' selected' : ''}>Italiano</option></select></label>
          <label class="field"><span>Check in/out</span><input data-cc="checkio" value="${esc(cfg.checkio || '')}" placeholder="quello del modello"></label>
        </div>
        <p class="note"><b>Formato:</b> il contratto si scarica in Word. Per il PDF aprilo in Word e scegli "Salva come PDF": nel browser non si può convertire mantenendo la stessa grafica.</p></section>
        <section class="card"><h2>Dati bancari (Bank transfers to ELV)</h2><div class="ct-grid">
          ${inp('ben', 'Beneficiary', b.ben)}${inp('int', 'Intermediary Bank', b.int)}${inp('bicInt', 'BIC/SWIFT (intermediaria)', b.bicInt)}${inp('per', 'For further credit to', b.per)}${inp('bic', 'BIC/SWIFT', b.bic)}${inp('iban', 'EURO IBAN', b.iban)}</div></section>`;
      box.querySelectorAll('[data-cc]').forEach(el => el.addEventListener('change', () => { const k = el.dataset.cc; cfg[k] = /acconto|saldoSett/.test(k) ? (Number(String(el.value).replace(',', '.')) || 0) : el.value; salva(); }));
      box.querySelectorAll('[data-cb]').forEach(el => el.addEventListener('change', () => { cfg.banca[el.dataset.cb] = el.value.trim(); salva(); }));
      box.querySelectorAll('[data-cm]').forEach(el => el.addEventListener('change', async () => { const f = el.files[0]; if (!f) return;
        if (!/\.docx$/i.test(f.name)) { toast('Scegli un file Word .docx'); return; }
        try { await unzip(new Uint8Array(await f.arrayBuffer())); await store.setModello(el.dataset.cm, f); await leggiMod(); draw(); toast('Modello caricato'); } catch (err) { toast('Caricamento non riuscito: ' + (err.message || err)); } }));
      box.querySelectorAll('[data-cd]').forEach(el => el.onclick = () => { const m = mods[el.dataset.cd]; window.SDBExport.scarica(m.nome, new Blob([m.dati])); });
      box.querySelectorAll('[data-cx]').forEach(el => el.onclick = async () => { if (!(await window.SDBConferma('Togliere il modello ' + (el.dataset.cx === 'en' ? 'inglese' : 'italiano') + '?', { ok: 'Togli', danger: true }))) return; await store.delModello(el.dataset.cx); await leggiMod(); draw(); });
    };
    draw();
  }

  /* ---------- finestra del contratto ---------- */
  const CLI = [['nome', 'Name'], ['cognome', 'Surname'], ['indirizzo', 'Street Address'], ['citta', 'City'], ['cap', 'Postal Code'], ['paese', 'Country'], ['luogoN', 'Place of Birth'], ['dataN', 'Date of Birth'], ['doc', 'Passaporto / documento n.'], ['email', 'E-mail'], ['tel', 'Phone'], ['altro', 'Alternative Contact']];
  const IBAN = [['iInt', 'Account Holder'], ['iInd', 'Address of account holder'], ['iBic', 'BIC / SWIFT'], ['iIban', 'IBAN']];
  async function apri(b, d) {
    const { store, esc, toast, S } = d; const v = d.villa(b.villaId) || {};
    const [cfg0, salvato, mEn, mIt, lista, offerte] = await Promise.all([store.getContrCfg().catch(() => null), store.getContratto(b.id).catch(e => { throw e; }), store.getModello('en').catch(() => null), store.getModello('it').catch(() => null), store.listContratti().catch(() => []), d.offerte()]);
    const cfg = cfgDi(cfg0); const mods = { en: mEn, it: mIt };
    const lingua0 = (salvato && salvato.lingua) || (mods[cfg.lingua] ? cfg.lingua : mEn ? 'en' : mIt ? 'it' : cfg.lingua);
    const off = (offerte || []).filter(o => (o.prenotazioni || []).includes(b.id)).sort((a, z) => String(z.quando).localeCompare(String(a.quando)))[0];
    const normN = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const prec = !salvato && normN(b.cliente) ? lista.filter(c => c.id !== b.id && c.cliente && normN([c.cliente.nome, c.cliente.cognome].join(' ')) && (normN(c.leader) === normN(b.cliente) || normN([c.cliente.nome, c.cliente.cognome].join(' ')) === normN(b.cliente))).sort((a, z) => String(z.aggiornatoIl).localeCompare(String(a.aggiornatoIl)))[0] : null;
    const base = salvato || prec || {};
    const val = d.valori(b) || {}; const notti = S.diffDays(b.from, b.to);
    const calcolati = l => {
      const tot = val.vendita != null ? Math.round(val.vendita) : null, dep = typeof b.deposito === 'number' ? b.deposito : null;
      const acc = tot != null ? Math.round(tot * (Number(cfg.acconto) || 0) / 100) : null;
      const scad = S.addDays(b.from, -7 * (Number(cfg.saldoSett) || 0)); const oggi = S.iso(new Date());
      const prefix = sigla(v) + '-' + String(b.from || '').slice(0, 4) + '-';
      const nCod = 1 + lista.filter(c => c.id !== b.id && c.campi && String(c.campi.codice || '').startsWith(prefix)).length;
      const inc = d.inclusi(b, l);
      return { lingua: l, codice: cfg.codice === 'auto' ? prefix + String(nCod).padStart(2, '0') : '', villa: (cfg.nome === 'sito' && nomeSito(v)) || v.name || '', date: dataL(b.from, l) + ' – ' + dataL(b.to, l), notti: String(notti),
        leader: b.cliente || '', persone: b.ospiti ? String(b.ospiti) : '', maxOcc: String(v.guests || ''), checkio: cfg.checkio || '', inclusi: inc.join('\n'),
        totale: tot, accontoPerc: Number(cfg.acconto) || 0, acconto: acc, accontoScad: l === 'it' ? 'A vista' : 'At sight', saldo: tot != null && acc != null ? tot - acc : null, saldoScad: scad <= oggi ? (l === 'it' ? 'A vista' : 'At sight') : dataL(scad, l), deposito: dep,
        link: v.linkSito || '', layout: [v.totalBedrooms ? v.totalBedrooms + (l === 'it' ? ' camere' : ' bedrooms') : '', v.bathrooms ? v.bathrooms + (l === 'it' ? ' bagni' : ' bathrooms') : ''].filter(Boolean).join(' · '), location: v.location || '' };
    };
    let f = Object.assign(calcolati(lingua0), salvato && salvato.campi ? salvato.campi : {});
    const cli = Object.assign({}, base.cliente || {}); if (!cli.email && off && off.email) cli.email = off.email; if (!cli.tel && off && off.telefono) cli.tel = off.telefono;
    if (!cli.nome && !cli.cognome && b.cliente) { const p = String(b.cliente).trim().split(/\s+/); cli.nome = p[0]; cli.cognome = p.slice(1).join(' '); }
    const ib = Object.assign({}, base.iban || {}); const carta = Object.assign({}, base.carta || {});
    let persone = base.persone || '', richieste = salvato ? salvato.richieste || '' : '';
    let dlg = document.getElementById('dlg-contr'); if (dlg) dlg.remove();
    dlg = document.createElement('dialog'); dlg.id = 'dlg-contr'; dlg.className = 'dlg-contr'; document.body.appendChild(dlg);
    const inp = (k, l, v0, o = {}) => `<label class="field${o.cls ? ' ' + o.cls : ''}"><span>${esc(l)}</span>${o.area ? `<textarea data-${o.g || 'f'}="${k}" rows="${o.area}">${esc(v0 == null ? '' : v0)}</textarea>` : `<input data-${o.g || 'f'}="${k}" value="${esc(v0 == null ? '' : v0)}"${o.ph ? ` placeholder="${esc(o.ph)}"` : ''}${o.num ? ' inputmode="decimal"' : ''}${o.type ? ` type="${o.type}"` : ''}${o.ac ? ` autocomplete="${o.ac}"` : ''}>`}</label>`;
    const vers = (salvato && salvato.versioni) || [];
    const dmy = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '';
    const draw = () => {
      const l = f.lingua; const nessun = !mods.en && !mods.it;
      dlg.innerHTML = `<form class="dlg" method="dialog" autocomplete="off"><h3>Contratto · ${esc(v.name || '')}</h3>
        <p class="note">${esc(b.cliente || '')} · ${esc(dmy(b.from))} → ${esc(dmy(b.to))}${salvato && salvato.inviatoIl ? ` · <b>inviato il ${esc(dmy(salvato.inviatoIl))}</b>` : ''}${salvato && salvato.firmatoIl ? ` · <b>firmato il ${esc(dmy(salvato.firmatoIl))}</b>` : ''}</p>
        ${nessun ? '<div class="warn err">Prima carica il modello Word in Impostazioni → Contratto.</div>' : ''}
        ${prec ? `<div class="warn">Dati del cliente ripresi dal contratto precedente (${esc(prec.campi && prec.campi.villa || '')} ${esc(prec.campi && prec.campi.date || '')}): controllali.</div>` : ''}
        <h4 class="ct-h">Contratto</h4><div class="ct-grid">
          <label class="field"><span>Lingua del modello</span><select id="ct-ling">${['en', 'it'].map(x => `<option value="${x}"${x === l ? ' selected' : ''}${mods[x] ? '' : ' disabled'}>${x === 'en' ? 'Inglese' : 'Italiano'}${mods[x] ? '' : ' (non caricato)'}</option>`).join('')}</select></label>
          ${inp('codice', 'Booking reference code', f.codice, { ph: 'es. MRN-PRT-2027-01' })}
          <label class="field"><span>Nome della villa</span><select id="ct-nome"><option value="${esc(v.name || '')}">Calendario: ${esc(v.name || '')}</option>${nomeSito(v) ? `<option value="${esc(nomeSito(v))}"${f.villa === nomeSito(v) ? ' selected' : ''}>Sito: ${esc(nomeSito(v))}</option>` : ''}${f.villa && f.villa !== v.name && f.villa !== nomeSito(v) ? `<option selected>${esc(f.villa)}</option>` : ''}</select></label>
          ${inp('villa', 'Property (testo nel contratto)', f.villa)}
          <label class="field"><span>Firmato il</span><input type="date" id="ct-firm" value="${esc(salvato && salvato.firmatoIl ? String(salvato.firmatoIl).slice(0, 10) : '')}"></label>
        </div>
        <h4 class="ct-h">Prenotazione</h4><div class="ct-grid">
          ${inp('date', 'Dates', f.date)}${inp('notti', 'Number of nights', f.notti)}${inp('leader', 'Party Leader', f.leader)}${inp('persone', 'Party Size', f.persone)}${inp('maxOcc', 'Maximum Occupancy', f.maxOcc)}${inp('checkio', 'Check in/out', f.checkio, { ph: 'quello del modello' })}
          ${inp('inclusi', 'Included in your booking (una voce per riga)', f.inclusi, { area: 5, cls: 'ct-wide' })}
        </div>
        <h4 class="ct-h">Pagamenti</h4><div class="ct-grid">
          ${inp('totale', 'Total Booking Value €', f.totale, { num: 1 })}${inp('accontoPerc', 'Acconto %', f.accontoPerc, { num: 1 })}${inp('acconto', 'First Payment €', f.acconto, { num: 1 })}${inp('accontoScad', 'Scadenza acconto', f.accontoScad)}
          ${inp('saldo', 'Balance Payment €', f.saldo, { num: 1 })}${inp('saldoScad', 'Scadenza saldo', f.saldoScad)}${inp('deposito', 'Security Deposit €', f.deposito, { num: 1 })}
          <label class="field"><span>Total Payable €</span><input id="ct-totpag" disabled value="${esc(String((Number(f.totale) || 0) + (Number(f.deposito) || 0)))}"></label>
        </div>
        <h4 class="ct-h">Villa</h4><div class="ct-grid">${inp('link', 'Link', f.link, { cls: 'ct-wide' })}${inp('layout', 'Layout', f.layout)}${inp('location', 'Location', f.location)}</div>
        <h4 class="ct-h">Party leader <small class="note">salvati in modo protetto (solo amministratori)</small></h4><div class="ct-grid">${CLI.map(([k, lb]) => inp(k, lb, cli[k], { g: 'c' })).join('')}</div>
        <div class="ct-grid">${inp('persone_l', 'Persons in your party (una per riga, con l\'età dei minori)', persone, { area: 4, g: 'x', cls: 'ct-wide' })}${inp('richieste', 'Special requests', richieste, { area: 2, g: 'x', cls: 'ct-wide' })}</div>
        <h4 class="ct-h">Carta di credito <small class="note">si salvano solo le prime 6 e le ultime 4 cifre; il codice di sicurezza mai</small></h4><div class="ct-grid">
          ${inp('cNum', 'Credit Card Number', '', { g: 'k', ph: carta.mask ? carta.mask : 'numero intero', ac: 'off' })}${inp('cNome', 'Name of the Owner', carta.nome, { g: 'k' })}${inp('cScad', 'Date of Expiration', carta.scad, { g: 'k', ph: 'MM/AA' })}${inp('cCvv', 'Security Code', '', { g: 'k', ac: 'off' })}
          ${carta.mask ? `<p class="note ct-wide">Salvata: <b>${esc(carta.mask)}</b>. Per il contratto riscrivi il numero intero e il codice; lasciandoli vuoti nel Word va il numero mascherato.</p>` : ''}</div>
        <h4 class="ct-h">Account details for security deposit refund</h4><div class="ct-grid">${IBAN.map(([k, lb]) => inp(k, lb, ib[k], { g: 'i' })).join('')}</div>
        ${vers.length ? `<h4 class="ct-h">Versioni generate</h4><ul class="ct-vers">${vers.slice().reverse().map((x, i) => `<li>${esc(String(x.quando || '').slice(0, 16).replace('T', ' ').split(' ').map((s, j) => j ? s : dmy(s)).join(' '))} · ${esc(x.da || '')} · ${esc(x.campi && x.campi.codice || '')} · ${euroDi(x.campi && x.campi.totale, 'it')} <button type="button" class="linkbtn" data-ver="${vers.length - 1 - i}">Riscarica</button></li>`).join('')}</ul>` : ''}
        <p class="note" id="ct-msg"></p>
        <div class="foot"><button type="button" class="btn left" id="ct-close">Chiudi</button><button type="button" class="btn" id="ct-save">Salva i dati</button><button type="button" class="btn primary" id="ct-gen"${nessun ? ' disabled' : ''}>Genera contratto (Word)</button></div></form>`;
      const q = s => dlg.querySelector(s);
      dlg.querySelectorAll('[data-f]').forEach(el => el.addEventListener('input', () => { const k = el.dataset.f; f[k] = el.value;
        const n = x => x === '' || x == null ? null : Number(String(x).replace(/\./g, '').replace(',', '.'));
        if (k === 'accontoPerc' || k === 'totale') { const t = n(f.totale); if (t != null && !isNaN(t)) { const a = Math.round(t * (Number(String(f.accontoPerc).replace(',', '.')) || 0) / 100); f.acconto = a; f.saldo = t - a; q('[data-f="acconto"]').value = a; q('[data-f="saldo"]').value = t - a; } }
        if (k === 'acconto') { const t = n(f.totale), a = n(f.acconto); if (t != null && a != null) { f.saldo = t - a; q('[data-f="saldo"]').value = t - a; } }
        q('#ct-totpag').value = String((n(f.totale) || 0) + (n(f.deposito) || 0)); }));
      dlg.querySelectorAll('[data-c]').forEach(el => el.addEventListener('input', () => { cli[el.dataset.c] = el.value; }));
      dlg.querySelectorAll('[data-i]').forEach(el => el.addEventListener('input', () => { ib[el.dataset.i] = el.value; }));
      dlg.querySelectorAll('[data-x]').forEach(el => el.addEventListener('input', () => { if (el.dataset.x === 'persone_l') persone = el.value; else richieste = el.value; }));
      q('#ct-nome').onchange = e => { f.villa = e.target.value; q('[data-f="villa"]').value = f.villa; };
      q('#ct-ling').onchange = e => { const nl = e.target.value; const c = calcolati(nl); ['date', 'inclusi', 'accontoScad', 'saldoScad', 'layout'].forEach(k => { f[k] = c[k]; }); f.lingua = nl; leggiK(); draw(); };
      q('#ct-close').onclick = () => dlg.close();
      q('#ct-save').onclick = () => salvaDati(false);
      q('#ct-gen').onclick = () => salvaDati(true);
      dlg.querySelectorAll('[data-ver]').forEach(el => el.onclick = async () => { const x = vers[Number(el.dataset.ver)]; const m = mods[x.campi.lingua || 'en'] || mods.en || mods.it; if (!m) return;
        try { window.SDBExport.scarica(nomeFile(x.campi), await genera(m.dati, campiWord(x.campi, x.cliente || cli, x.iban || ib, x.persone || '', x.richieste || '', { num: (x.carta || {}).mask || '', nome: (x.carta || {}).nome, scad: (x.carta || {}).scad, cvv: '' }))); } catch (err) { msg('Errore: ' + (err.message || err)); } });
    };
    let kNow = {}; const leggiK = () => dlg.querySelectorAll('[data-k]').forEach(el => { kNow[el.dataset.k] = el.value; });
    const msg = s => { const m = dlg.querySelector('#ct-msg'); if (m) m.textContent = s; };
    const nomeFile = c => window.SDBExport.nomeFile ? window.SDBExport.nomeFile('Booking Form ' + (c.codice || '') + ' ' + (c.villa || '') + ' ' + (c.leader || '')) + '.docx' : 'Booking Form.docx';
    const num = x => x === '' || x == null ? null : Number(String(x).replace(/\./g, '').replace(',', '.'));
    function campiWord(c, cl, ibn, pers, rich, k) {
      const l = c.lingua || 'en'; const tot = num(c.totale), dep = num(c.deposito);
      return Object.assign({}, c, cl, ibn, { totaleE: euroDi(tot, l), accontoE: euroDi(num(c.acconto), l), saldoE: euroDi(num(c.saldo), l), depositoE: euroDi(dep, l), totPagE: tot == null && dep == null ? '' : euroDi((tot || 0) + (dep || 0), l),
        bBen: cfg.banca.ben, bInt: cfg.banca.int, bBicInt: cfg.banca.bicInt, bPer: cfg.banca.per, bBic: cfg.banca.bic, bIban: cfg.banca.iban,
        cNum: k.num || '', cNome: k.nome || '', cScad: k.scad || '', cCvv: k.cvv || '', persone_l: pers, richieste: rich });
    }
    async function salvaDati(gen) {
      leggiK(); const firm = dlg.querySelector('#ct-firm').value;
      const numero = cifre(kNow.cNum); if (kNow.cNum && numero.length < 12) { msg('Il numero della carta sembra incompleto.'); return; }
      const mask = numero ? maschera(numero) : carta.mask || '';
      const ora = new Date().toISOString(); const campi = Object.assign({}, f); ['totale', 'acconto', 'saldo', 'deposito'].forEach(k => { campi[k] = num(campi[k]); }); campi.accontoPerc = num(campi.accontoPerc);
      const cartaS = { mask, nome: kNow.cNome || '', scad: kNow.cScad || '' };
      const rec = { villaId: b.villaId, bookingId: b.id, lingua: f.lingua, leader: f.leader || b.cliente || '', cliente: cli, iban: ib, persone, richieste, carta: cartaS, campi,
        versioni: vers.slice(), inviatoIl: salvato && salvato.inviatoIl || null, firmatoIl: firm || null, aggiornatoDa: d.user(), aggiornatoIl: ora };
      if (gen) {
        const m = mods[f.lingua] || mods.en || mods.it; if (!m) { msg('Carica il modello in Impostazioni → Contratto.'); return; }
        let blob; try { blob = await genera(m.dati, campiWord(campi, cli, ib, persone, richieste, { num: numero ? numero.replace(/(.{4})(?=.)/g, '$1 ') : mask, nome: cartaS.nome, scad: cartaS.scad, cvv: kNow.cCvv || '' })); } catch (err) { msg('Contratto non generato: ' + (err.message || err)); return; }
        window.SDBExport.scarica(nomeFile(campi), blob);
        rec.versioni = rec.versioni.concat([{ quando: ora, da: d.user(), campi, cliente: cli, iban: ib, persone, richieste, carta: cartaS }]).slice(-15);
        if (!rec.inviatoIl) rec.inviatoIl = ora.slice(0, 10);
      }
      try { await store.setContratto(b.id, JSON.parse(JSON.stringify(rec))); }
      catch (err) { msg((gen ? 'Contratto scaricato, ma i dati non sono stati salvati: ' : 'Dati non salvati: ') + (err && err.code === 'permission-denied' ? 'pubblica le regole nuove (contratti) nella console Firebase.' : (err.message || err))); return; }
      toast(gen ? 'Contratto generato e dati salvati' : 'Dati del contratto salvati'); dlg.close(); if (d.onSaved) d.onSaved();
    }
    draw(); dlg.showModal();
  }
  window.SDBContratto = { mountSettings, apri, compila, genera, unzip, maschera };
})();
