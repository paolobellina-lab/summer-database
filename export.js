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
  const para = (inner, o = {}) => `<w:p><w:pPr>${o.after != null ? `<w:spacing w:before="${o.before || 0}" w:after="${o.after}"/>` : ''}${o.right ? '<w:jc w:val="right"/>' : ''}</w:pPr>${inner}</w:p>`;
  const NAVY = '142861', GOLD = 'B29362';
  const cell = (inner, w, o = {}) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${o.fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.fill}"/>` : ''}</w:tcPr>${para(inner, { after: 0, right: o.right })}</w:tc>`;
  function table(t) {
    const w = t.widths; const right = new Set(t.right || []);
    const border = `<w:tblBorders>${['top', 'bottom', 'insideH'].map(k => `<w:${k} w:val="single" w:sz="4" w:space="0" w:color="D9CDB8"/>`).join('')}</w:tblBorders>`;
    const row = (cells, o = {}) => `<w:tr>${o.head ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${cells.map((c, i) => cell(run(c, { b: o.head || o.total, sz: o.head ? 18 : 20, color: o.head ? NAVY : null }), w[i], { right: right.has(i), fill: o.head ? 'F3EDE2' : o.total ? 'FBF8F2' : null })).join('')}</w:tr>`;
    return `<w:tbl><w:tblPr><w:tblW w:w="${w.reduce((a, b) => a + b, 0)}" w:type="dxa"/>${border}<w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:left w:w="90" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${w.map(v => `<w:gridCol w:w="${v}"/>`).join('')}</w:tblGrid>`
      + (t.head ? row(t.head, { head: true }) : '') + t.rows.map(r => row(r)).join('') + (t.total ? row(t.total, { total: true }) : '') + '</w:tbl>' + para('', { after: 120 });
  }
  function docx(blocks) {
    const body = blocks.map(b => {
      if (b.h1) return para(run(b.h1, { b: true, sz: 36, color: NAVY }), { after: 60 });
      if (b.h2) return para(run(b.h2.toUpperCase(), { b: true, sz: 20, color: GOLD }), { before: 240, after: 80 });
      if (b.p != null) return para(run(b.p, { b: b.bold, sz: b.small ? 18 : 22, color: b.small ? '6B6B6B' : null }), { after: 80 });
      if (b.kv) return table({ widths: [3000, 6600], rows: b.kv.map(([k, v]) => [k, v]) });
      if (b.table) return table(b.table);
      return '';
    }).join('');
    const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`;
    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="it-IT"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults></w:styles>`;
    return zip([
      { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>' },
      { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
      { name: 'word/_rels/document.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
      { name: 'word/document.xml', data: doc },
      { name: 'word/styles.xml', data: styles }
    ]);
  }

  function scarica(nome, blob) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 20000);
  }
  // nome di file sicuro su Windows, Mac e telefono
  const nomeFile = s => String(s || '').normalize('NFC').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'file';

  window.SDBExport = { zip, docx, dataUrlBytes, scarica, nomeFile };
})();
