# Summer Database — istruzioni per le modifiche

App web (GitHub Pages) per disponibilità e listini ville. Dati su Firebase, progetto `summer-database`, Firestore `(default)`.

## Vincoli: il database è condiviso con altre app
Nello stesso progetto e database ci sono anche le app **Scontrini** e **Spese Ville**, che leggono i dati di questa app e ne scrivono di propri.

1. **Collezioni degli scontrini**: `scontrini` e `scontrini_foto` appartengono all'app Scontrini. Questa app può leggerle, **inserire, modificare e cancellare** gli scontrini e aggiungere allegati (pagina Spese, `scontrini_allegati`), come chiesto dal proprietario. Le modifiche usano `update` sui soli campi cambiati e aggiungono la versione precedente all'array `storico` dello stesso scontrino; la cancellazione elimina lo scontrino e la sua foto (stesso ID). Mai includerle in reset, import o ripristino. Unica eccezione, chiesta dal proprietario: il tasto "Cancella tutte le note spese" in Impostazioni (pulizia di fine stagione, protetto da password, con archivio scaricato prima). `scontrini_foto` si legge solo quando l'utente apre una foto. Le funzioni di import/ripristino agiscono solo su `villas`, `bookings` (con le loro parti protette `villas_acquisto`, `bookings_acquisto`, `occupazione`), `meta` (vedi `mergeAll` in `store.js`: aggiunge/aggiorna, non cancella).
2. **Regole Firestore**: ogni modifica a `firestore.rules` deve mantenere le righe `match /scontrini/{id}` e `match /scontrini_foto/{id}`. Le email autorizzate reali non stanno in questo repository pubblico: le regole pubblicate sono quelle della console Firebase.
3. **Campi letti dalle altre app, da non rinominare** senza avvisare prima il proprietario:
   - `villas`: ID documento (es. `v11`) e campo `name`;
   - `bookings`: `villaId`, `cliente`, `from`, `to` (formato `AAAA-MM-GG`), `status`.
4. **ID stabili**: non cambiare l'ID di ville o prenotazioni esistenti; salvare solo i documenti modificati (`set` sul singolo documento), mai cancellare e ricreare intere collezioni.
5. **Configurazione**: non cambiare `firebase-config.js` né rigenerare la web app Firebase; l'accesso è solo con Google.

Se una modifica richiesta va contro questi vincoli, avvisare prima di procedere.

## Pagina Spese
`spese.js`: riepilogo scontrini (villa → prenotazione → scontrini) con:
- **Nuova spesa** (`store.addScontrino`): stessa struttura dell'app Scontrini (`scontrini` + `scontrini_foto` con lo stesso ID, `creatoDa`, `creatoIl`).
- **Modifica** (storico barrato in rosso) e **cancellazione** (anche foto e allegati).
- **Allegati** su qualsiasi scontrino: se manca la foto, la prima immagine diventa la foto (`scontrini_foto/{id}`, `hasFoto: true`, la vede anche l'app Scontrini); le altre foto e i PDF (max 700 KB) vanno in `scontrini_allegati/{auto}` = `{ scontrinoId, villaId, nome, tipo, dati (data URL), creatoDa, creatoIl }` con il conteggio in `scontrini.allegati` (`increment`).
- **Esporta**: Excel (CSV degli scontrini filtrati) oppure Word per prenotazione (una villa alla volta; `ctx.schedaPren` da `app.js` + note spese + totale spese e totale vendita) con uno zip di foto e allegati. `export.js` crea .docx e .zip senza librerie esterne.
Lettura tramite `store.listenScontrini` (solo `scontrini`); `scontrini_foto` e `scontrini_allegati` solo quando servono. Collegamento alle prenotazioni con `trovaPren`, nell'ordine: ID → stesse date → copia "non più in calendario" → spese generali.

## Pagina Offerte
`offerte.js` (`#offerte`, anche tra le pagine dei profili): tariffa + periodo scelto su un calendario dei mesi della stagione (clic su un giorno o frecce ‹ ›; indice di `S.periodsFor`, date esatte per villa), scelta delle ville (libera/occupata/ND, prezzo di listino modificabile), cliente, lingua IT/EN, numero di foto. Produce un Word (`SDBExport.docx` con immagini, logo, riquadro prezzo, una villa per pagina) oppure una mail HTML copiata negli appunti per Gmail (+ "Apri Gmail" con oggetto e destinatario) sul modello delle offerte Esmeralda: niente foto (le brochure PDF si allegano a mano), per ogni villa nome con link al sito + `codice` (campo della scheda, es. MRN-PRT), video Vimeo/YouTube con psw, "<Mese> BiWeekly Rate: 40.000 €" + nota per villa (`ui.off.note`), ordinate dalla più cara; poi elenco "The rates do include" (`ui.off.inclusi`), testo finale, frase "Offer subject to availability…" e firma (`ui.off.firma`). Usa solo i campi visibili all'account (`hiddenField`). Bozza salvata in `ui.off`.

## Completa le schede dal sito
`importa-sito.js` (Impostazioni → Dati e backup, solo accesso completo): legge un JSON `{ ville: [{ nome, sito: {...} }] }` con i dati presi da esmeraldaluxuryvillas.com, abbina per nome (modificabile), compila di norma solo i campi vuoti (`campiDa`: seafront, guests, totalBedrooms, guestBedrooms, bathrooms, indoorSqm, outdoorSqm, pool, spa, gym, servizi, descrizione, linkSito) con `store.upsertVilla`, e prova a scaricare le foto (solo ville senza foto) con `fetch` CORS: se il sito non lo permette, lo segnala. CSP: `connect-src` e `img-src` includono esmeraldaluxuryvillas.com. Il campo `descrizione` (pubblico) è nella scheda villa e nelle Offerte.

## Schede incomplete
`report.js` (Impostazioni → Schede incomplete, solo accesso completo): per ogni villa i campi vuoti tra quelli scelti (scelta salvata in `localStorage` `sdb-report-campi`), più Foto (copertina in `villas_thumb`), Brochure (`listAllBrochure`) e Prezzi di acquisto; filtro per campo, ricerca, "Scarica Excel" (CSV).

## Periodi tariffari
`S.periodsFor(settings, villa, tariffa)` in `core.js`. Settimanale: segue il giorno di cambio (`settings.cambio` o `villa.cambio`, sabato/domenica). Bisettimanale/mensile/bimensile: `villa.periodi[tariffa]` → `settings.periodiPredefiniti[tariffa]` → date automatiche dell'Excel spostate in base al giorno di cambio. Il numero dei periodi è fisso (i prezzi sono collegati per posizione).

## Stati e servizi (Impostazioni → Aspetto predefiniti)
- `meta/settings.stati`: `[{ key, label, color, blocks }]`. I 5 stati di base (`occupato`, `confermato`, `opzione`, `richiesta`, `owner`) hanno chiavi fisse: si cambiano nome, colore e "blocca", non la chiave. Gli stati aggiunti hanno una chiave ricavata dal nome, che non cambia più (va in `bookings.status`, letto dalle altre app).
- Colore della prenotazione: `bookings.color` è salvato solo se scelto a mano (altrimenti `null`). Se è nullo o uguale al colore originale del suo stato (`S.STATUS_COLOR`), la prenotazione segue il colore predefinito dello stato.
- `meta/settings.servizi`: `[{ key, label }]` in aggiunta ai 3 di base (campi `pulizia`, `cuoco`, `transfer`). Nella prenotazione i servizi aggiunti stanno in `servizi: [key]`.
- Dettaglio dei servizi nella prenotazione: `serviziDett: { [key]: { incluso, acquisto, vendita, note } }`. `incluso: true` = compreso nel prezzo di vendita dell'affitto; altrimenti acquisto e vendita del servizio si sommano al totale (barra del calendario, guadagno).

## Località
Elenco condiviso in `meta/settings` → `localita` (maiuscolo). Nella scheda villa la località si sceglie da un menu (con "+ Nuova località"); in Impostazioni si aggiungono, rinominano e uniscono (aggiorna il campo `location` delle ville interessate, un documento per villa).

## Foto e preferiti
- Foto delle ville in `villas_foto/{id}` (`villaId`, `img`, `thumb`, `ordine`) e copertina in `villas_thumb/{villaId}` (`thumb`, `fotoId`). Mai dentro `villas`, che le altre app leggono per intero.
- Brochure PDF (max 10 MB) caricate nella scheda villa: `villas_brochure/{id}` = `{ villaId, nome, lingua ('it'|'en'|''), size, parti, creatoDa, creatoIl }` e il file a pezzi da 900 KB in `villas_brochure_parti/{id}_{k}` = `{ villaId, brochureId, k, dati (bytes) }` (un documento Firestore tiene al massimo 1 MB; la scheda si scrive per ultima). Regole: lettura a chi vede la villa, scrittura con accesso completo. Nelle Offerte "Allega brochure" scarica i PDF delle ville scelte nella lingua dell'offerta (altrimenti un'altra), da trascinare nella mail: Gmail non accetta allegati da un link.
- Elenchi preferiti condivisi in `meta/preferiti` (`liste: [{ id, nome, ville: [villaId] }]`).

## Account autorizzati
`meta/accessi`: `{ utenti: [{ email, nome, app: ['summer','scontrini'], profilo }], emails: [..], scontrini: [email con app scontrini], profiloDi: { email: profiloId } }`. Le regole leggono `emails` (chi entra), `scontrini` (chi legge tutte le ville e prenotazioni per le app Scontrini/Spese Ville) e `profiloDi`. Solo gli amministratori scritti nelle regole scrivono `meta/accessi` e `meta/profili`. Un account presente senza `summer` non entra in Summer Database. Un account non presente in `utenti` è un amministratore (vede tutto); uno presente senza profilo non vede nessuna villa (a meno che sia un amministratore: lo si riconosce perché può scrivere `meta/accessi`). Un amministratore che apre l'app aggiunge da solo `scontrini` e `profiloDi` se mancano.

## Profili utente e protezione dei dati
- `meta/profili`: `{ profili: { [id]: { nome, completo, nascosti: [campo], acquisto, dettaglio, modifica, pagine: [..], ville: [villaId] } }, protezione: bool, campiSeparati: bool }`. Gestiti in Impostazioni → Account e accessi (righe mostrate in base alle pagine: Disponibilità → prezzi e prenotazioni, Ville → dati della scheda nascosti); le `ville` si scelgono dalla scheda villa ("Condivisa con"). Villa nuova e profilo nuovo: non condivisi. `completo` = vede e modifica tutto. `modifica` vale solo con `dettaglio`.
- Con `protezione: true` (attivata una volta dal pulsante "Attiva la protezione", dopo aver pubblicato le regole) i dati sensibili sono separati:
  - `villas/{id}`: dati villa + `listino` (prezzi di vendita calcolati, `{ tariffa: [valore|'ND'|null] }`), senza `pricing`;
  - `villas_acquisto/{id}`: `{ villaId, pricing }`;
  - `villas_campi/{villaId}/campi/{campo}`: `{ villaId, valore }`, un documento per ogni campo di `S.CAMPI_SCHEDA` (listino prezzi di vendita, nome reale, proprietario, indirizzo, password…), che non stanno più in `villas` (con `meta/profili.campiSeparati: true`, attivato dal pulsante "Aggiorna la protezione"). Ogni profilo ha `nascosti: [campo]` (in Account e accessi) e riceve solo gli altri campi; chi ha accesso completo li legge tutti con `collectionGroup('campi')`. `villas_riservati` / `campiRiservati` / `scheda` sono la versione precedente, convertita dal pulsante.
  - `bookings/{id}`: senza `prezzoAcquisto` né `serviziDett.*.acquisto` (campi letti dalle altre app invariati);
  - `bookings_acquisto/{id}`: `{ villaId, prezzoAcquisto, servizi: { chiave: acquisto } }`;
  - `occupazione/{villaId}`: `{ villaId, periodi: [{ from, to, earlyIn, lateOut }] }` per i profili "solo ND" (aggiornata da chi salva le prenotazioni, riallineata da chi ha accesso completo).
- `store.js` ricompone i dati (`rebuild`) e carica per i profili limitati solo le ville condivise, documento per documento e con query `where('villaId','==',id)`: le regole non permettono di leggere le collezioni intere. Anche `meta` si legge documento per documento (`meta/notes` solo con la pagina Appunti).
- Limite noto: gli account abilitati all'app Scontrini leggono tutte le ville e prenotazioni (senza prezzi di acquisto), perché quell'app legge le collezioni intere.

## Assegnazioni account (per l'app Scontrini)
`meta/assegnazioni`: `{ account: [{ email (minuscolo), nome, ville: [villaId], prenotazioni: [bookingId] }], aggiornatoDa, aggiornatoIl }`. Si gestisce dalla pagina Spese ("Account e assegnazioni") e dalla finestra prenotazione. L'app Scontrini deve leggerlo e filtrare; è un filtro di comodità, non una protezione. Gli account si scelgono tra quelli di `meta/accessi` con l'app `scontrini`.

## Pulizia di fine stagione
In Impostazioni, protetta da password (impronta SHA-256 con sale in `meta/sicurezza`, mai in chiaro; la impostano solo gli amministratori, anche con "Password dimenticata?" che chiede di rifare l'accesso Google con `store.reauthGoogle`): "Cancella tutte le prenotazioni" (`bookings` + prenotazioni assegnate agli account) e "Cancella tutte le note spese" (`scontrini` + `scontrini_foto`). Prima scarica un archivio JSON. Non tocca mai `villas` (schede e listini), `villas_foto`, `villas_thumb`, `meta/preferiti`, `meta/settings`.

## Backup
`buildBackup` in `app.js`: JSON con `data()` completo (ville con listini, prenotazioni con acquisto, impostazioni, profili, account) e, con accesso completo, `scontrini` senza foto solo come archivio (l'importazione non li tocca). "Backup automatico su questo dispositivo" (Impostazioni → Dati e backup, `localStorage`): all'apertura dell'app, una volta al giorno, scarica il file nei Download. Niente scrittura in cartelle scelte (File System Access): un sito con quel permesso potrebbe anche sovrascrivere i backup.

## Dati
Nessun dato reale nel repository: `seed.js`, file Excel e backup sono in `.gitignore`.
