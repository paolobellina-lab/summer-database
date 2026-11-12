/*
 * "Carica brochure e foto da una cartella" (Impostazioni → Dati e backup, solo accesso completo).
 * Si sceglie una cartella del computer: ogni sottocartella è una villa (le foto e i PDF dentro),
 * oppure i file stanno tutti insieme e il nome del file dice la villa (es. "MARINELLA_en.pdf", "villa-marinella_n2_en.pdf").
 * Abbina per nome (o per il link del sito nella scheda), mostra l'anteprima e carica una villa alla volta:
 * brochure PDF (se la villa non ne ha già una nella stessa lingua) e foto (di norma solo nelle ville senza foto).
 */
(function () {
  const norm = s => String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[_\-.]+/g, ' ').replace(/^VILLA\s+/, '').replace(/[^A-Z0-9]+/g, ' ').trim();
  const IMG = /\.(jpe?g|png|webp)$/i, PDF = /\.pdf$/i;
  const linguaDi = n => /(^|[_\-\s.])(en|eng|english)([_\-\s.]|\.pdf$|$)/i.test(n) ? 'en' : /(^|[_\-\s.])(it|ita|italiano)([_\-\s.]|\.pdf$|$)/i.test(n) ? 'it' : '';
  // dal nome del file alla villa: toglie estensione, lingua e sigle tipo "n2"
  const chiaveFile = n => n.replace(/\.[^.]+$/, '').replace(/([_\-\s](n\d+|en|eng|it|ita|a\d|\d+))+$/i, '').replace(/[_\-\s]+\d+$/, '');
  const slugDi = v => { const m = /\/villa\/([^/?#]+)/.exec(v.linkSito || ''); return m ? m[1].toLowerCase() : ''; };
  const S0 = { gruppi: null, scelte: {}, msg: '', lavoro: false, soloSenzaFoto: true, nFoto: 20 };

  function mount(box, ctx) {
    const { data, store, esc, $, $$, toast, compressImage, coverOf } = ctx;
    box.innerHTML = `<h2>Carica brochure e foto da una cartella</h2>
      <p class="note">Scegli dal computer la cartella con le brochure PDF e le foto delle ville: <b>una sottocartella per villa</b> con il nome della villa, oppure tutti i file insieme con il nome della villa nel nome del file. Prima di caricare vedi l'abbinamento e lo puoi correggere. Funziona dal computer, non dal telefono.</p>
      <div class="row"><label class="btn" for="cc-dir">Scegli la cartella…</label><input type="file" id="cc-dir" webkitdirectory directory multiple hidden></div>
      <div id="cc-out"></div>`;
    const out = $('#cc-out', box);
    const ville = () => data().villas.slice().sort((a, b) => String(a.name).localeCompare(String(b.name), 'it', { numeric: true }));
    const trova = chiave => {
      const k = norm(chiave), ks = String(chiave).toLowerCase().replace(/\s+/g, '-');
      return data().villas.find(v => norm(v.name) === k) || data().villas.find(v => slugDi(v) && (slugDi(v) === ks || slugDi(v) === 'villa-' + ks)) || null;
    };
    $('#cc-dir', box).addEventListener('change', e => {
      const files = Array.from(e.target.files || []).filter(f => IMG.test(f.name) || PDF.test(f.name)); e.target.value = '';
      const g = {};
      files.forEach(f => {
        const parti = (f.webkitRelativePath || f.name).split('/');
        const chiave = parti.length >= 3 ? parti[parti.length - 2] : chiaveFile(f.name);
        (g[chiave] = g[chiave] || { chiave, pdf: [], img: [] })[PDF.test(f.name) ? 'pdf' : 'img'].push(f);
      });
      S0.gruppi = Object.values(g).sort((a, b) => a.chiave.localeCompare(b.chiave, 'it', { numeric: true }));
      S0.gruppi.forEach(x => x.img.sort((a, b) => a.name.localeCompare(b.name, 'it', { numeric: true })));
      S0.scelte = {}; S0.gruppi.forEach(x => { const v = trova(x.chiave); S0.scelte[x.chiave] = v ? v.id : ''; });
      S0.msg = files.length ? '' : '<div class="warn err">Nella cartella non ci sono PDF o foto.</div>';
      draw();
    });
    if (S0.gruppi) setTimeout(draw);

    function draw() {
      const G = S0.gruppi || [];
      const nAbb = G.filter(x => S0.scelte[x.chiave]).length;
      out.innerHTML = !G.length ? S0.msg : `<div class="is-opts">
          <label class="flag"><input type="checkbox" id="cc-solo" ${S0.soloSenzaFoto ? 'checked' : ''}><span><b>Foto solo nelle ville che non ne hanno</b><small>Fino a <select id="cc-nf">${[10, 15, 20, 30, 50].map(n => `<option ${n === S0.nFoto ? 'selected' : ''}>${n}</option>`).join('')}</select> foto per villa. Spento: si aggiungono anche dove ce ne sono già.</small></span></label>
          <label class="flag"><input type="checkbox" checked disabled><span><b>Brochure: una per lingua</b><small>Se la villa ha già una brochure nella stessa lingua non viene caricata di nuovo. Massimo 10 MB per file.</small></span></label></div>
        <div class="tbl-wrap"><table class="prices is-tbl"><thead><tr><th>Nella cartella</th><th>Villa nell'app</th><th>Brochure</th><th>Foto</th></tr></thead><tbody>
        ${G.map((x, i) => `<tr><td><b>${esc(x.chiave)}</b></td>
          <td><select data-cc="${i}"><option value="">— non caricare —</option>${ville().map(v => `<option value="${esc(v.id)}" ${v.id === S0.scelte[x.chiave] ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select></td>
          <td>${x.pdf.length ? x.pdf.map(f => `${esc(({ en: 'EN', it: 'IT' })[linguaDi(f.name)] || 'PDF')} ${(f.size / 1e6).toFixed(1).replace('.', ',')} MB${f.size > 10e6 ? ' <span class="cc-ko">troppo grande</span>' : ''}`).join('<br>') : '<span class="note">—</span>'}</td>
          <td>${x.img.length || '<span class="note">—</span>'}</td></tr>`).join('')}
        </tbody></table></div>
        <div class="is-foot"><span class="note">${nAbb} su ${G.length} abbinate.</span><button type="button" class="btn primary" id="cc-go">Carica</button></div>
        <div id="cc-msg">${S0.msg}</div>`;
      if (S0.lavoro) $('#cc-go', out).disabled = true;
      $('#cc-solo', out).onchange = e => { S0.soloSenzaFoto = e.target.checked; };
      $('#cc-nf', out).onchange = e => { S0.nFoto = Number(e.target.value); };
      $$('[data-cc]', out).forEach(s => s.onchange = () => { S0.scelte[G[Number(s.dataset.cc)].chiave] = s.value; draw(); });
      $('#cc-go', out).onclick = carica;
    }

    async function carica() {
      const go = $('#cc-go', out); go.disabled = true; S0.lavoro = true;
      const step = t => { S0.msg = `<p class="note">${esc(t)}</p>`; const m = document.getElementById('cc-msg'); if (m) m.innerHTML = S0.msg; };
      const lista = (S0.gruppi || []).filter(x => S0.scelte[x.chiave]);
      let nBro = 0, nFoto = 0, saltB = 0, saltF = 0, err = [];
      for (let i = 0; i < lista.length; i++) {
        const x = lista[i]; const v = data().villas.find(y => y.id === S0.scelte[x.chiave]); if (!v) continue;
        try {
          if (x.pdf.length && store.addBrochure) {
            let gia = []; try { gia = await store.listBrochure(v.id); } catch (_) {}
            for (const f of x.pdf) {
              const l = linguaDi(f.name);
              if (f.size > 10e6 || gia.some(b => (b.lingua || '') === l)) { saltB++; continue; }
              await store.addBrochure(v.id, f, l, (k, n) => step(`${v.name}: brochure, parte ${k} di ${n}…`));
              gia.push({ lingua: l }); nBro++;
            }
          }
          if (x.img.length && store.addFoto) {
            let gia = []; try { gia = await store.listFoto(v.id); } catch (_) {}
            if (S0.soloSenzaFoto && gia.length) saltF++;
            else {
              const imgs = x.img.slice(0, S0.nFoto); const base = Date.now();
              for (let k = 0; k < imgs.length; k++) {
                step(`${v.name}: foto ${k + 1} di ${imgs.length}… (villa ${i + 1} di ${lista.length})`);
                const img = await compressImage(imgs[k], 1600, 700000); const th = await compressImage(imgs[k], 640, 70000);
                await store.addFoto(v.id, img, th, base + k, k === 0 && !gia.length && !(coverOf && coverOf(v.id)));
                nFoto++;
              }
            }
          }
        } catch (e) { err.push(`${v.name}: ${e && e.code === 'permission-denied' ? 'permesso negato (regole di Firestore da pubblicare?)' : (e && e.message) || e}`); }
      }
      S0.lavoro = false; const g2 = document.getElementById('cc-go'); if (g2) g2.disabled = false;
      S0.msg = `<div class="warn ok">Fatto: ${nBro} brochure e ${nFoto} foto caricate in ${lista.length} ville.${saltB ? ` ${saltB} brochure saltate (già presenti nella stessa lingua o oltre 10 MB).` : ''}${saltF ? ` ${saltF} ville saltate per le foto perché ne avevano già.` : ''}</div>`
        + (err.length ? `<div class="warn err">${err.map(esc).join('<br>')}</div>` : '');
      const m = document.getElementById('cc-msg'); if (m) m.innerHTML = S0.msg;
      toast('Caricamento finito');
    }
  }
  window.SDBCaricaCartella = { mount, norm, chiaveFile, linguaDi };
})();
