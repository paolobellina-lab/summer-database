/* Permette di aprire l'app anche senza connessione. Cambia VERSION a ogni aggiornamento. */
const VERSION = 'sdb-v72';
const FILES = ['./', 'index.html', 'app.css', 'core.js', 'firebase-config.js', 'store.js', 'export.js', 'spese.js', 'offerte.js', 'importa-sito.js', 'report.js', 'carica-cartella.js', 'app.js', 'manifest.webmanifest', 'icons/esmeralda-icon-192.png', 'icons/esmeralda-icon-512.png', 'icons/esmeralda-maskable-192.png', 'icons/esmeralda-maskable-512.png', 'icons/esmeralda-apple-touch-icon.png', 'icons/esmeralda-favicon-48.png', 'icons/logo-240.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // manifest e icone sempre dalla rete, senza cache
  if (/manifest\.webmanifest|\/icons\//.test(e.request.url)) { e.respondWith(fetch(e.request, { cache: 'no-store' }).catch(() => caches.match(e.request))); return; }
  const u = new URL(e.request.url);
  // i dati Firebase non passano dalla cache: li gestisce Firestore
  if (/googleapis\.com|firebaseio\.com|firebaseapp\.com|accounts\.google\.com/.test(u.host)) return;
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)).catch(() => {}); return r; }).catch(() => caches.match(e.request)));
});
