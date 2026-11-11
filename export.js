/*
 * File da scaricare creati nel browser, senza librerie esterne:
 *  - zip(entries)  → archivio .zip (metodo "store": i JPEG e i PDF sono già compressi)
 *  - docx(blocks)  → documento Word .docx (un .docx è uno zip di file XML)
 *  - dataUrlBytes  → byte di un'immagine o PDF salvato come data URL
 *  - scarica(nome, blob)
 */
(function () {
  const enc = new TextEncoder();

  /* ---------- ZIP ---------- */
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function dosTime(d) { return { t: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), d: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() }; }
  // entries: [{ name: 'cartella/file.jpg', data: Uint8Array | string }]
  function zip(entries) {
    const parts = [], central = []; let off = 0; const now = dosTime(new Date());
    entries.forEach(e => {
      const name = enc.encode(e.name); const data = typeof e.data === 'string' ? enc.encode(e.data) : e.data; const crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint16(10, now.t, true); lh.setUint16(12, now.d, true); lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true);
      lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), name, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
      ch.setUint16(12, now.t, true); ch.setUint16(14, now.d, true); ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true);
      ch.setUint16(28, name.length, true); ch.setUint32(42, off, true);
      central.push(new Uint8Array(ch.buffer), name);
      off += 30 + name.length + data.length;
    });
    const cSize = central.reduce((t, p) => t + p.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true); end.setUint32(12, cSize, true); end.setUint32(16, off, true);
    return new Blob(parts.concat(central, [new Uint8Array(end.buffer)]), { type: 'application/zip' });
  }

  function dataUrlBytes(u) {
    const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(String(u || '')); if (!m) return null;
    if (!m[2]) return { tipo: m[1] || 'application/octet-stream', bytes: enc.encode(decodeURIComponent(m[3])) };
    const bin = atob(m[3]); const b = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
    return { tipo: m[1] || 'application/octet-stream', bytes: b };
  }

  /* ---------- DOCX ----------
     blocks: { h1: 'testo' } | { h2: 'testo' } | { p: 'testo', bold?, small? } | { kv: [[etichetta, valore]] }
             | { table: { head: [..], rows: [[..]], widths: [twips..], right: [indici colonne a destra], total: [..] } } */
  const x = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const run = (t, o = {}) => `<w:r><w:rPr>${o.b ? '<w:b/>' : ''}${o.color ? `<w:color w:val="${o.color}"/>` : ''}${o.sz ? `<w:sz w:val="${o.sz}"/><w:szCs w:val="${o.sz}"/>` : ''}</w:rPr>${String(t == null ? '' : t).split('\n').map((l, i) => (i ? '<w:br/>' : '') + `<w:t xml:space="preserve">${x(l)}</w:t>`).join('')}</w:r>`;
  const para = (inner, o = {}) => `<w:p><w:pPr>${o.after != null ? `<w:spacing w:before="${o.before || 0}" w:after="${o.after}"/>` : ''}${o.right ? '<w:jc w:val="right"/>' : o.center ? '<w:jc w:val="center"/>' : ''}</w:pPr>${inner}</w:p>`;
  const NAVY = '142861', GOLD = 'B29362';
  const cell = (inner, w, o = {}) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${o.fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.fill}"/>` : ''}</w:tcPr>${para(inner, { after: 0, right: o.right })}</w:tc>`;
  function table(t) {
    const w = t.widths; const right = new Set(t.right || []);
    const border = `<w:tblBorders>${['top', 'bottom', 'insideH'].map(k => `<w:${k} w:val="single" w:sz="4" w:space="0" w:color="D9CDB8"/>`).join('')}</w:tblBorders>`;
    const row = (cells, o = {}) => `<w:tr>${o.head ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${cells.map((c, i) => cell(run(c, { b: o.head || o.total, sz: o.head ? 18 : 20, color: o.head ? NAVY : null }), w[i], { right: right.has(i), fill: o.head ? 'F3EDE2' : o.total ? 'FBF8F2' : null })).join('')}</w:tr>`;
    return `<w:tbl><w:tblPr><w:tblW w:w="${w.reduce((a, b) => a + b, 0)}" w:type="dxa"/>${border}<w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:left w:w="90" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${w.map(v => `<w:gridCol w:w="${v}"/>`).join('')}</w:tblGrid>`
      + (t.head ? row(t.head, { head: true }) : '') + t.rows.map(r => row(r)).join('') + (t.total ? row(t.total, { total: true }) : '') + '</w:tbl>' + para('', { after: 120 });
  }
  /* immagini: { img: { bytes, w, h, width? (twip, larghezza massima) } } oppure { imgs: [img, img], width? } (affiancate) */
  const W_PAGE = 9638; // larghezza utile della pagina A4 con margini da 2 cm, in twip
  function docx(blocks) {
    const media = []; let pid = 0;
    const pic = (im, maxTw) => {
      const id = 'rIdImg' + (media.length + 1); const n = media.length + 1;
      media.push({ id, name: `image${n}.${im.ext || 'jpeg'}`, bytes: im.bytes, ext: im.ext || 'jpeg' });
      const wEmu = Math.round(maxTw * 635); const hEmu = Math.round(wEmu * (im.h || 1) / (im.w || 1)); pid++;
      return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${wEmu}" cy="${hEmu}"/><wp:docPr id="${pid}" name="Foto ${pid}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${pid}" name="foto${pid}.${im.ext || 'jpeg'}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${wEmu}" cy="${hEmu}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
    };
    const body = blocks.map(b => {
      if (b.pageBreak) return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
      if (b.img) return para(pic(b.img, Math.min(b.img.width || W_PAGE, W_PAGE)), { after: 80 });
      if (b.imgs) { const n = b.imgs.length; if (!n) return ''; const gap = 120; const cw = Math.floor((W_PAGE - gap * (n - 1)) / n);
        return `<w:tbl><w:tblPr><w:tblW w:w="${W_PAGE}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="0" w:type="dxa"/><w:right w:w="${gap}" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${b.imgs.map(() => `<w:gridCol w:w="${cw + gap}"/>`).join('')}</w:tblGrid><w:tr>${b.imgs.map(im => `<w:tc><w:tcPr><w:tcW w:w="${cw + gap}" w:type="dxa"/></w:tcPr>${para(im ? pic(im, cw) : '', { after: 0 })}</w:tc>`).join('')}</w:tr></w:tbl>` + para('', { after: 80 }); }
      if (b.price) return `<w:tbl><w:tblPr><w:tblW w:w="${W_PAGE}" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="8" w:space="0" w:color="${GOLD}"/><w:bottom w:val="single" w:sz="8" w:space="0" w:color="${GOLD}"/></w:tblBorders><w:tblCellMar><w:top w:w="120" w:type="dxa"/><w:left w:w="160" w:type="dxa"/><w:bottom w:w="120" w:type="dxa"/><w:right w:w="160" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid><w:gridCol w:w="6000"/><w:gridCol w:w="3638"/></w:tblGrid><w:tr>${cell(run(b.price[0], { b: true, sz: 22, color: NAVY }), 6000, { fill: 'FBF8F2' })}${cell(run(b.price[1], { b: true, sz: 30, color: NAVY }), 3638, { right: true, fill: 'FBF8F2' })}</w:tr></w:tbl>` + para('', { after: 120 });
      if (b.h1) return para(run(b.h1, { b: true, sz: 36, color: NAVY }), { after: 60 });
      if (b.h2) return para(run(b.h2.toUpperCase(), { b: true, sz: 20, color: GOLD }), { before: 240, after: 80 });
      if (b.p != null) return para(run(b.p, { b: b.bold, sz: b.small ? 18 : b.big ? 26 : 22, color: b.small ? '6B6B6B' : b.color || null }), { after: b.after != null ? b.after : 80, center: b.center });
      if (b.logo) return para(pic(b.logo, b.logo.width || 2400), { after: 120, center: true });
      if (b.kv) return table({ widths: [3000, 6600], rows: b.kv.map(([k, v]) => [k, v]) });
      if (b.table) return table(b.table);
      return '';
    }).join('');
    const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`;
    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="it-IT"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults></w:styles>`;
    return zip([
      { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>' },
      { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
      { name: 'word/_rels/document.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' + media.map(m => `<Relationship Id="${m.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${m.name}"/>`).join('') + '</Relationships>' },
      { name: 'word/document.xml', data: doc },
      { name: 'word/styles.xml', data: styles }
    ].concat(media.map(m => ({ name: 'word/media/' + m.name, data: m.bytes }))));
  }

  function scarica(nome, blob) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 20000);
  }
  // nome di file sicuro su Windows, Mac e telefono
  const nomeFile = s => String(s || '').normalize('NFC').replace(/[–—]/g, '-').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'file';

  window.SDBExport = { zip, docx, dataUrlBytes, scarica, nomeFile };
})();
