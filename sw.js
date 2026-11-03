/* Permette di aprire l'app anche senza connessione. Cambia VERSION a ogni aggiornamento. */
const VERSION = 'sdb-v20';
const FILES = ['./', 'index.html', 'app.css', 'core.js', 'firebase-config.js', 'store.js', 'spese.js', 'app.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const u = new URL(e.request.url);
  // i dati Firebase non passano dalla cache: li gestisce Firestore
  if (/googleapis\.com|firebaseio\.com|firebaseapp\.com|accounts\.google\.com/.test(u.host)) return;
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)).catch(() => {}); return r; }).catch(() => caches.match(e.request)));
});
