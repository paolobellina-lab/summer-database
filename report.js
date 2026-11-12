/*
 * Impostazioni → Schede incomplete: per ogni villa i campi della scheda non ancora compilati,
 * più foto, brochure e prezzi. Si scelgono i campi da controllare (ricordati su questo dispositivo),
 * si filtra per campo e si scarica l'elenco in Excel (CSV).
 */
(function () {
  const KEY = 'sdb-report-campi';
  const lsGet = k => { try { return localStorage.getItem(k); } catch (_) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} };
  const vuoto = x => x === undefined || x === null || String(x).trim() === '';
  // campi che di solito non servono per tutte le ville: spenti all'inizio
  const SPENTI = ['realEstate', 'nomeReale', 'pax', 'staff', 'staffBedrooms', 'doubleBedrooms', 'twinBedrooms', 'singleBedrooms', 'parking', 'kitchens', 'mediaProprietario', 'youtube', 'vimeo', 'psw', 'note'];
  let filtro = '', cerca = '';

  function mount(box, ctx) {
    const { data, esc, store, FIELDS, hiddenField, coverOf, S } = ctx;
    const gruppi = [
      ['Anagrafica', FIELDS.anagrafica.filter(([k]) => k !== 'name')],
      ['Caratteristiche', FIELDS.caratteristiche],
      ['Servizi e note', [['descrizione', 'Descrizione'], ['servizi', 'Servizi inclusi'], ['note', 'Note']]],
      ['Link e media', FIELDS.link],
      ['Altro', [['_foto', 'Foto'], ['_brochure', 'Brochure'], ['_prezzi', 'Prezzi di acquisto']]]
    ].map(([g, l]) => [g, l.filter(([k]) => k[0] === '_' || !hiddenField(k))]);
    const tutti = gruppi.flatMap(([, l]) => l);
    const nome = Object.fromEntries(tutti.map(([k, l]) => [k, l.replace(/\s*\(.*\)$/, '')]));
    let scelti; try { scelti = JSON.parse(lsGet(KEY) || 'null'); } catch (_) { scelti = null; }
    if (!Array.isArray(scelti)) scelti = tutti.map(([k]) => k).filter(k => !SPENTI.includes(k));
    let bro = null; // villaId -> true
    if (store.listAllBrochure) store.listAllBrochure().then(l => { bro = {}; l.forEach(b => { bro[b.villaId] = true; }); draw(); }, () => { bro = false; draw(); });

    const haPrezzi = v => !!(v.pricing && Object.values(v.pricing).some(t => t && Array.isArray(t.acquisto) && t.acquisto.some(x => !vuoto(x))));
    const manca = (v, k) => k === '_foto' ? !coverOf(v.id) : k === '_brochure' ? (bro ? !bro[v.id] : false) : k === '_prezzi' ? (v.pricing ? !haPrezzi(v) : false) : vuoto(v[k]);
    const righe = () => data().villas.slice().sort((a, b) => String(a.name).localeCompare(String(b.name), 'it', { numeric: true }))
      .map(v => ({ v, m: scelti.filter(k => nome[k] && manca(v, k)) }));

    function draw() {
      const R = righe(); const conta = {}; R.forEach(r => r.m.forEach(k => { conta[k] = (conta[k] || 0) + 1; }));
      if (filtro && !scelti.includes(filtro)) filtro = '';
      const q = cerca.trim().toLowerCase();
      const vis = R.filter(r => r.m.length && (!filtro || r.m.includes(filtro)) && (!q || String(r.v.name).toLowerCase().includes(q))).sort((a, b) => b.m.length - a.m.length);
      const complete = R.filter(r => !r.m.length).length;
      box.innerHTML = `<h2>Schede incomplete</h2>
        <p class="note">${R.length} ville · <b>${complete}</b> complete · <b>${R.length - complete}</b> con campi da compilare (tra quelli scelti qui sotto).${bro === null && scelti.includes('_brochure') ? ' Controllo delle brochure in corso…' : bro === false && scelti.includes('_brochure') ? ' Brochure non controllate: pubblica le nuove regole di Firestore.' : ''}</p>
        <details class="rp-campi"><summary>Campi da controllare (${scelti.filter(k => nome[k]).length} di ${tutti.length})</summary>
          ${gruppi.map(([g, l]) => `<div class="rp-gr"><b>${esc(g)}</b><div>${l.map(([k, lab]) => `<label class="rp-ck"><input type="checkbox" data-rk="${esc(k)}" ${scelti.includes(k) ? 'checked' : ''}> ${esc(lab)}</label>`).join('')}</div></div>`).join('')}
        </details>
        <div class="rp-tot">${scelti.filter(k => conta[k]).sort((a, b) => conta[b] - conta[a]).map(k => `<button type="button" class="rp-chip${filtro === k ? ' on' : ''}" data-rf="${esc(k)}">${esc(nome[k])} <b>${conta[k]}</b></button>`).join('') || '<span class="note">Nessun campo mancante.</span>'}</div>
        <div class="rp-bar"><input type="search" id="rp-q" placeholder="Cerca villa…" value="${esc(cerca)}">${filtro ? `<span class="note">Ville senza <b>${esc(nome[filtro])}</b> · <a href="#" id="rp-all">mostra tutte</a></span>` : ''}<button type="button" class="btn" id="rp-csv">Scarica Excel</button></div>
        <div class="tbl-wrap"><table class="prices rp-tbl"><thead><tr><th>Villa</th><th>Mancano</th><th>Campi da compilare</th></tr></thead><tbody>
          ${vis.map(r => `<tr><td><a href="#villa-${esc(r.v.id)}"><b>${esc(r.v.name)}</b></a></td><td class="rp-n">${r.m.length}</td><td>${r.m.map(k => `<span class="rp-m${k === filtro ? ' on' : ''}">${esc(nome[k])}</span>`).join('')}</td></tr>`).join('') || `<tr><td colspan="3" class="note">${R.length ? 'Nessuna villa da completare per questi filtri.' : 'Nessuna villa.'}</td></tr>`}
        </tbody></table></div>`;
      box.querySelectorAll('[data-rk]').forEach(c => c.onchange = () => { const k = c.dataset.rk; scelti = c.checked ? scelti.concat(k) : scelti.filter(x => x !== k); lsSet(KEY, JSON.stringify(scelti)); const op = box.querySelector('.rp-campi').open; draw(); box.querySelector('.rp-campi').open = op; });
      box.querySelectorAll('[data-rf]').forEach(b => b.onclick = () => { filtro = filtro === b.dataset.rf ? '' : b.dataset.rf; draw(); });
      const all = box.querySelector('#rp-all'); if (all) all.onclick = e => { e.preventDefault(); filtro = ''; draw(); };
      const qi = box.querySelector('#rp-q'); qi.oninput = () => { cerca = qi.value; const pos = qi.selectionStart; draw(); const n = box.querySelector('#rp-q'); n.focus(); n.setSelectionRange(pos, pos); };
      box.querySelector('#rp-csv').onclick = () => {
        const cell = x => '"' + String(x).replace(/"/g, '""') + '"';
        const ks = scelti.filter(k => nome[k]);
        const rows = [['Villa', 'Mancano'].concat(ks.map(k => nome[k]))].concat(vis.map(r => [r.v.name, r.m.length].concat(ks.map(k => r.m.includes(k) ? 'MANCA' : ''))));
        const csv = '﻿' + rows.map(r => r.map(cell).join(';')).join('\r\n');
        window.SDBExport.scarica('Schede incomplete ' + S.iso(new Date()) + '.csv', new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      };
    }
    draw();
  }
  window.SDBReport = { mount };
})();
