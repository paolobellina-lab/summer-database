# Summer Database — istruzioni per le modifiche

App web (GitHub Pages) per disponibilità e listini ville. Dati su Firebase, progetto `summer-database`, Firestore `(default)`.

## Vincoli: il database è condiviso con altre app
Nello stesso progetto e database ci sono anche le app **Scontrini** e **Spese Ville**, che leggono i dati di questa app e ne scrivono di propri.

1. **Collezioni degli scontrini**: `scontrini` e `scontrini_foto` appartengono all'app Scontrini. Questa app può leggerle, **modificare e cancellare** gli scontrini (pagina Spese), come l'app Scontrini. Le modifiche usano `update` sui soli campi cambiati e aggiungono la versione precedente all'array `storico` dello stesso scontrino; la cancellazione elimina lo scontrino e la sua foto (stesso ID). Mai includerle in reset, import, ripristino o pulizia. `scontrini_foto` si legge solo quando l'utente apre una foto. Le funzioni di import/ripristino agiscono solo su `villas`, `bookings`, `meta` (vedi `mergeAll` in `store.js`: aggiunge/aggiorna, non cancella).
2. **Regole Firestore**: ogni modifica a `firestore.rules` deve mantenere le righe `match /scontrini/{id}` e `match /scontrini_foto/{id}`. Le email autorizzate reali non stanno in questo repository pubblico: le regole pubblicate sono quelle della console Firebase.
3. **Campi letti dalle altre app, da non rinominare** senza avvisare prima il proprietario:
   - `villas`: ID documento (es. `v11`) e campo `name`;
   - `bookings`: `villaId`, `cliente`, `from`, `to` (formato `AAAA-MM-GG`), `status`.
4. **ID stabili**: non cambiare l'ID di ville o prenotazioni esistenti; salvare solo i documenti modificati (`set` sul singolo documento), mai cancellare e ricreare intere collezioni.
5. **Configurazione**: non cambiare `firebase-config.js` né rigenerare la web app Firebase; l'accesso è solo con Google.

Se una modifica richiesta va contro questi vincoli, avvisare prima di procedere.

## Pagina Spese
`spese.js`: riepilogo scontrini con modifica (storico barrato in rosso) e cancellazione (villa → prenotazione → scontrini). Lettura tramite `store.listenScontrini` (solo `scontrini`) e `store.getFoto` (un documento `scontrini_foto` quando si apre la foto). Collegamento alle prenotazioni con `trovaPren`, nell'ordine: ID → stesse date → copia "non più in calendario" → spese generali.

## Foto e preferiti
- Foto delle ville in `villas_foto/{id}` (`villaId`, `img`, `thumb`, `ordine`) e copertina in `villas_thumb/{villaId}` (`thumb`, `fotoId`). Mai dentro `villas`, che le altre app leggono per intero.
- Elenchi preferiti condivisi in `meta/preferiti` (`liste: [{ id, nome, ville: [villaId] }]`).

## Assegnazioni account (per l'app Scontrini)
`meta/assegnazioni`: `{ account: [{ email (minuscolo), nome, ville: [villaId], prenotazioni: [bookingId] }], aggiornatoDa, aggiornatoIl }`. Si gestisce dalla pagina Spese ("Account e assegnazioni") e dalla finestra prenotazione. L'app Scontrini deve leggerlo e filtrare; è un filtro di comodità, non una protezione.

## Dati
Nessun dato reale nel repository: `seed.js`, file Excel e backup sono in `.gitignore`.
