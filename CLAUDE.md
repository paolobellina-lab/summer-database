# Summer Database — istruzioni per le modifiche

App web (GitHub Pages) per disponibilità e listini ville. Dati su Firebase, progetto `summer-database`, Firestore `(default)`.

## Vincoli: il database è condiviso con altre app
Nello stesso progetto e database ci sono anche le app **Scontrini** e **Spese Ville**, che leggono i dati di questa app e ne scrivono di propri.

1. **Collezioni degli scontrini**: `scontrini` e `scontrini_foto` appartengono all'app Scontrini. Questa app può leggerle, **modificare e cancellare** gli scontrini (pagina Spese), come l'app Scontrini. Le modifiche usano `update` sui soli campi cambiati e aggiungono la versione precedente all'array `storico` dello stesso scontrino; la cancellazione elimina lo scontrino e la sua foto (stesso ID). Mai includerle in reset, import o ripristino. Unica eccezione, chiesta dal proprietario: il tasto "Cancella tutte le note spese" in Impostazioni (pulizia di fine stagione, protetto da password, con archivio scaricato prima). `scontrini_foto` si legge solo quando l'utente apre una foto. Le funzioni di import/ripristino agiscono solo su `villas`, `bookings` (con le loro parti protette `villas_acquisto`, `bookings_acquisto`, `occupazione`), `meta` (vedi `mergeAll` in `store.js`: aggiunge/aggiorna, non cancella).
2. **Regole Firestore**: ogni modifica a `firestore.rules` deve mantenere le righe `match /scontrini/{id}` e `match /scontrini_foto/{id}`. Le email autorizzate reali non stanno in questo repository pubblico: le regole pubblicate sono quelle della console Firebase.
3. **Campi letti dalle altre app, da non rinominare** senza avvisare prima il proprietario:
   - `villas`: ID documento (es. `v11`) e campo `name`;
   - `bookings`: `villaId`, `cliente`, `from`, `to` (formato `AAAA-MM-GG`), `status`.
4. **ID stabili**: non cambiare l'ID di ville o prenotazioni esistenti; salvare solo i documenti modificati (`set` sul singolo documento), mai cancellare e ricreare intere collezioni.
5. **Configurazione**: non cambiare `firebase-config.js` né rigenerare la web app Firebase; l'accesso è solo con Google.

Se una modifica richiesta va contro questi vincoli, avvisare prima di procedere.

## Pagina Spese
`spese.js`: riepilogo scontrini con modifica (storico barrato in rosso) e cancellazione (villa → prenotazione → scontrini). Lettura tramite `store.listenScontrini` (solo `scontrini`) e `store.getFoto` (un documento `scontrini_foto` quando si apre la foto). Collegamento alle prenotazioni con `trovaPren`, nell'ordine: ID → stesse date → copia "non più in calendario" → spese generali.

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
In Impostazioni, protetta da password (impronta SHA-256 con sale in `meta/sicurezza`, mai in chiaro): "Cancella tutte le prenotazioni" (`bookings` + prenotazioni assegnate agli account) e "Cancella tutte le note spese" (`scontrini` + `scontrini_foto`). Prima scarica un archivio JSON. Non tocca mai `villas` (schede e listini), `villas_foto`, `villas_thumb`, `meta/preferiti`, `meta/settings`.

## Dati
Nessun dato reale nel repository: `seed.js`, file Excel e backup sono in `.gitignore`.
