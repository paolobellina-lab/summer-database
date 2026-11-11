/*
 * "Completa le schede dal sito": legge un file JSON con i dati delle ville presi dal sito Esmeralda
 * ({ ville: [{ nome, sito: { url, name, position, guests, bedrooms, bathrooms, indoorSqm, outdoorSqm,
 *   pool, spa, gym, includedServices, description, photos } }] }), abbina ogni villa per nome a quelle dell'app,
 * mostra cosa verrebbe compilato e salva solo i campi scelti (di norma solo quelli vuoti), una villa alla volta.
 * Le foto si scaricano dal sito solo se il sito lo permette al browser (CORS); altrimenti lo dice.
 */
(function () {
  const norm = s => String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/^VILLA\s+/, '').replace(/[^A-Z0-9]+/g, ' ').trim();
  const num = x => (x === null || x === undefined || x === '' ? null : x);
  // dal sito ai campi della scheda villa
  function campiDa(s) {
    const c = {};
    const set = (k, v) => { v = num(v); if (v !== null) c[k] = String(v).trim(); };
    set('seafront', s.position);
    set('guests', s.guests);
    set('totalBedrooms', s.bedrooms);
    const g = /^\s*(\d+)/.exec(String(s.bedrooms || '')); if (g) c.guestBedrooms = g[1];
    set('bathrooms', s.bathrooms);
    set('indoorSqm', s.indoorSqm);
    set('outdoorSqm', s.outdoorSqm);
    set('pool', s.pool); set('spa', s.spa); set('gym', s.gym);
    if (Array.isArray(s.includedServices) && s.includedServices.length) c.servizi = s.includedServices.join('\n');
    set('descrizione', s.description);
    set('linkSito', s.url);
    return c;
  }
  const ETICHETTE = { seafront: 'Seafront – Seaview', guests: 'N° ospiti', totalBedrooms: 'Camere totali', guestBedrooms: 'Camere ospiti', bathrooms: 'Bagni', indoorSqm: 'Indoor mq', outdoorSqm: 'Outdoor mq', pool: 'Piscina', spa: 'Spa', gym: 'Palestra', servizi: 'Servizi inclusi', descrizione: 'Descrizione', linkSito: 'Link sito' };

  // stato che sopravvive al ridisegno della pagina (le schede salvate fanno aggiornare le Impostazioni)
  const S0 = { file: null, msg: '', lavoro: false, sovrascrivi: false, conFoto: true, nFoto: 10, scelte: null };
  function mount(box, ctx) {
    const { data, store, esc, $, $$, toast, compressImage, coverOf } = ctx;
    let file = S0.file;
    box.innerHTML = `<h2>Completa le schede dal sito</h2>
      <p class="note">Carica il file con i dati del sito esmeraldaluxuryvillas.com: ospiti, camere, bagni, metri quadri, piscina, servizi inclusi, descrizione, link e foto. Le ville vengono abbinate per nome; prima di salvare vedi cosa cambia. Di norma si compilano <b>solo i campi vuoti</b>.</p>
      <div class="row"><label class="btn" for="is-file">Scegli il file…</label><input type="file" id="is-file" accept=".json,application/json" hidden></div>
      <div id="is-out"></div>`;
    const out = $('#is-out', box);
    if (file) setTimeout(() => draw());
    $('#is-file', box).addEventListener('change', async e => {
      const f = e.target.files[0]; e.target.value = ''; if (!f) return;
      try { file = JSON.parse(await f.text()); if (!Array.isArray(file.ville)) throw new Error('formato non riconosciuto'); S0.file = file; S0.msg = ''; S0.scelte = null; draw(); }
      catch (x) { out.innerHTML = `<div class="warn err">File non valido: ${esc(x.message || x)}</div>`; }
    });
    const ville = () => data().villas.slice().sort((a, b) => String(a.name).localeCompare(String(b.name), 'it', { numeric: true }));
    const trova = r => { const n = norm(r.nome); const n2 = norm(r.sito && r.sito.name); return data().villas.find(v => norm(v.name) === n) || data().villas.find(v => norm(v.name) === n2) || null; };
    let righe = [], sovrascrivi = S0.sovrascrivi, conFoto = S0.conFoto, nFoto = S0.nFoto;
    function draw() {
      righe = file.ville.filter(r => r.sito && !r.sito.error).map((r, i) => { const v = trova(r); return { r, villaId: S0.scelte && S0.scelte[i] !== undefined ? S0.scelte[i] : v ? v.id : '', campi: campiDa(r.sito), foto: (r.sito.photos || []).filter(u => /^https:\/\//.test(u)) }; });
      const conta = x => { const v = data().villas.find(y => y.id === x.villaId); if (!v) return { vuoti: 0, diversi: 0 }; let vuoti = 0, diversi = 0; Object.keys(x.campi).forEach(k => { const cur = v[k]; if (cur === undefined || cur === null || String(cur).trim() === '') vuoti++; else if (String(cur).trim() !== x.campi[k]) diversi++; }); return { vuoti, diversi }; };
      out.innerHTML = `<div class="is-opts">
          <label class="flag"><input type="checkbox" id="is-over" ${sovrascrivi ? 'checked' : ''}><span><b>Sovrascrivi anche i campi già compilati</b><small>Spento: si compilano solo i campi vuoti.</small></span></label>
          <label class="flag"><input type="checkbox" id="is-foto" ${conFoto ? 'checked' : ''}><span><b>Scarica le foto dal sito</b><small>Solo per le ville che non hanno ancora foto, fino a <select id="is-nf">${[5, 10, 15, 20].map(n => `<option ${n === nFoto ? 'selected' : ''}>${n}</option>`).join('')}</select> per villa.</small></span></label></div>
        <div class="tbl-wrap"><table class="prices is-tbl"><thead><tr><th>Villa sul sito</th><th>Villa nell'app</th><th>Campi</th><th>Foto sul sito</th></tr></thead><tbody>
        ${righe.map((x, i) => { const c = conta(x); return `<tr><td><b>${esc(x.r.sito.name || x.r.nome)}</b><small class="note"><a href="${esc(x.r.sito.url || '#')}" target="_blank" rel="noopener">pagina del sito</a></small></td>
          <td><select data-is="${i}"><option value="">— non importare —</option>${ville().map(v => `<option value="${esc(v.id)}" ${v.id === x.villaId ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select></td>
          <td>${x.villaId ? `${c.vuoti} da compilare${c.diversi ? ` · ${c.diversi} già compilati e diversi` : ''}` : '<span class="note">—</span>'}</td><td>${x.foto.length}</td></tr>`; }).join('')}
        </tbody></table></div>
        <div class="is-foot"><span class="note">${righe.filter(x => x.villaId).length} ville abbinate su ${righe.length}.</span><button type="button" class="btn primary" id="is-go">Completa le schede</button></div>
        <div id="is-msg">${S0.msg}</div>`;
      if (S0.lavoro) { const g = $('#is-go', out); if (g) g.disabled = true; }
      $('#is-over', out).onchange = e => { sovrascrivi = S0.sovrascrivi = e.target.checked; };
      $('#is-foto', out).onchange = e => { conFoto = S0.conFoto = e.target.checked; };
      $('#is-nf', out).onchange = e => { nFoto = S0.nFoto = Number(e.target.value); };
      $$('[data-is]', out).forEach(s => s.onchange = () => { righe[Number(s.dataset.is)].villaId = s.value; S0.scelte = righe.map(x => x.villaId); draw(); });
      $('#is-go', out).onclick = applica;
    }
    async function applica() {
      const go = $('#is-go', out); go.disabled = true; S0.lavoro = true;
      const step = t => { S0.msg = `<p class="note">${esc(t)}</p>`; const m = document.getElementById('is-msg'); if (m) m.innerHTML = S0.msg; };
      const scelte = righe.filter(x => x.villaId); let nVille = 0, nCampi = 0, nFotoOk = 0, fotoKo = 0, corsKo = false;
      for (let i = 0; i < scelte.length; i++) {
        const x = scelte[i]; const v0 = data().villas.find(v => v.id === x.villaId); if (!v0) continue;
        step(`Scheda ${i + 1} di ${scelte.length}: ${v0.name}…`);
        const v = JSON.parse(JSON.stringify(v0)); let ch = 0;
        Object.keys(x.campi).forEach(k => { const cur = v[k]; const vuoto = cur === undefined || cur === null || String(cur).trim() === ''; if ((vuoto || sovrascrivi) && String(cur || '').trim() !== x.campi[k]) { v[k] = x.campi[k]; ch++; } });
        if (ch) { store.upsertVilla(v); nVille++; nCampi += ch; await new Promise(r => setTimeout(r, 120)); }
        // foto: solo se la villa non ne ha e il sito permette al browser di scaricarle
        if (conFoto && !corsKo && x.foto.length && store.listFoto && store.addFoto) {
          let gia = []; try { gia = await store.listFoto(v0.id); } catch (_) {}
          if (!gia.length) {
            const urls = x.foto.slice(0, nFoto);
            for (let k = 0; k < urls.length; k++) {
              step(`Foto di ${v0.name}: ${k + 1} di ${urls.length}…`);
              try {
                const r = await fetch(urls[k], { mode: 'cors' }); if (!r.ok) throw new Error('HTTP ' + r.status);
                const b = await r.blob(); const fl = new File([b], 'foto.jpg', { type: b.type || 'image/jpeg' });
                const img = await compressImage(fl, 1600, 700000); const th = await compressImage(fl, 640, 70000);
                await store.addFoto(v0.id, img, th, Date.now() + k, k === 0 && !(coverOf && coverOf(v0.id)));
                nFotoOk++;
              } catch (err) { fotoKo++; if (err instanceof TypeError) { corsKo = true; break; } }
            }
          }
        }
      }
      S0.lavoro = false; const g2 = document.getElementById('is-go'); if (g2) g2.disabled = false;
      S0.msg = `<div class="warn ok">Fatto: ${nCampi} campi compilati in ${nVille} ${nVille === 1 ? 'villa' : 'ville'}${conFoto ? ` · ${nFotoOk} foto caricate` : ''}.</div>`
        + (corsKo ? '<div class="warn err">Il sito non permette al browser di scaricare le foto (protezione del sito). I dati sono stati compilati; le foto vanno scaricate dal sito e caricate a mano nella scheda villa, oppure va abilitato sul sito l\'accesso per questa app.</div>' : fotoKo ? `<p class="note">${fotoKo} foto non scaricate.</p>` : '');
      const m2 = document.getElementById('is-msg'); if (m2) m2.innerHTML = S0.msg;
      toast('Schede completate');
    }
  }
  window.SDBImportaSito = { mount, norm, campiDa };
})();
